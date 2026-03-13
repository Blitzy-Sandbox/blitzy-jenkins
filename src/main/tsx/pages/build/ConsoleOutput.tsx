/**
 * ConsoleOutput — Real-Time Console Output Streaming Page
 *
 * Replaces `core/src/main/resources/hudson/model/Run/console.jelly` (51 lines)
 * and the console rendering logic from `console-log.jelly` (38 lines).
 *
 * Displays the console output for a Jenkins build with:
 * - **Progressive text loading** for in-progress builds — polls
 *   `logText/progressiveHtml?start={offset}`, reading `X-Text-Size` and
 *   `X-More-Data` response headers to manage offset tracking and poll lifecycle.
 * - **Truncated output** for completed builds — shows the last 150 KB
 *   (matching the `hudson.consoleTailKB` system property default) with a
 *   "skip some" banner linking to the full console view.
 * - **App bar** with Download, Copy, and "View as plain text" action buttons
 *   matching the console.jelly lines 37-46 structure.
 *
 * The `progressiveHtml` endpoint returns server-sanitized HTML with ANSI
 * escape codes already converted to `<span class="ansi-...">` elements.
 * The component renders this via `dangerouslySetInnerHTML` on the `<pre>`
 * element.
 *
 * When progressive loading completes, the component dispatches a custom
 * `jenkins:consoleFinished` DOM event for plugin compatibility (mirrors
 * the `onFinishEvent` attribute of the Jelly `<t:progressiveText>` tag).
 *
 * No jQuery, no Handlebars, no behaviorShim — pure React 19 with hooks.
 *
 * @module pages/build/ConsoleOutput
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "@/layout/Layout";
import { Spinner } from "@/layout/Spinner";
import { useStaplerQuery } from "@/hooks/useStaplerQuery";
import { useI18n } from "@/hooks/useI18n";
import { useJenkinsConfig } from "@/providers/JenkinsConfigProvider";
import type { Build } from "@/types/models";

// =============================================================================
// Constants
// =============================================================================

/**
 * Default truncation threshold in kilobytes for the console output.
 * Mirrors `console-log.jelly` line 3:
 *   `h.getSystemProperty('hudson.consoleTailKB') ?: '150'`
 *
 * The client cannot read the server-side system property, so 150 KB is used
 * as the immutable default. Only the last `CONSOLE_TAIL_KB * 1024` bytes of
 * output are displayed in the default console view; earlier output is
 * accessible via the "consoleFull" link.
 */
const CONSOLE_TAIL_KB = 150;

/**
 * Polling interval (ms) between successive `progressiveHtml` fetch calls
 * while a build is in progress. Matches the original `<t:progressiveText>`
 * Jelly tag's default polling cadence.
 */
const POLL_INTERVAL_MS = 1000;

/**
 * Retry interval (ms) after a transient fetch failure. Uses a longer delay
 * to avoid hammering the server during temporary outages.
 */
const RETRY_INTERVAL_MS = 2000;

/**
 * Sentinel offset value used to "probe" the server for the current log size
 * without downloading any content. The server responds with an empty body
 * and the actual log size in the `X-Text-Size` header.
 */
const PROBE_OFFSET = 999_999_999_999;

// =============================================================================
// Props Interface
// =============================================================================

/**
 * Props for the {@link ConsoleOutput} component.
 *
 * At minimum, `buildUrl` must be provided for the component to fetch and
 * render console output. `jobName` and `buildNumber` are used as fallbacks
 * for display text when build metadata has not yet loaded.
 */
export interface ConsoleOutputProps {
  /** Job name or URL path segment (used as display fallback) */
  jobName?: string;
  /** Build number (used as display fallback) */
  buildNumber?: number;
  /** Relative URL path to the build (e.g., "/job/myproject/42/") */
  buildUrl?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Real-time console output streaming page component.
 *
 * Replaces both `console.jelly` (page shell with app-bar) and
 * `console-log.jelly` (progressive text loading and truncation logic).
 *
 * @param props - Component props
 * @returns The rendered console output page
 */
export default function ConsoleOutput({
  jobName,
  buildNumber,
  buildUrl,
}: ConsoleOutputProps): React.JSX.Element {
  // ---------------------------------------------------------------------------
  // Hooks
  // ---------------------------------------------------------------------------

  const { t } = useI18n();
  const { baseUrl, crumbFieldName, crumbValue } = useJenkinsConfig();

  // ---------------------------------------------------------------------------
  // Derived URLs (computed early for state reset logic)
  // ---------------------------------------------------------------------------

  /**
   * Fully resolved build URL with leading slash normalization.
   * Used for constructing fetch URLs in the progressive polling effect.
   * Computed before state declarations because the state reset logic
   * depends on detecting URL changes.
   */
  const resolvedBuildUrl = (() => {
    if (!buildUrl) {
      return "";
    }
    const normalized = buildUrl.endsWith("/") ? buildUrl : `${buildUrl}/`;
    return normalized.startsWith("/")
      ? `${baseUrl}${normalized}`
      : `${baseUrl}/${normalized}`;
  })();

  // ---------------------------------------------------------------------------
  // Build metadata query
  // ---------------------------------------------------------------------------
  // Fetches building status, result, and display names from the Stapler REST
  // API. Used to determine UI state (loading, error, display names) but NOT
  // to gate progressive text loading — the X-More-Data header handles that.

  const {
    data: buildData,
    isLoading,
    isError,
  } = useStaplerQuery<Build>({
    queryKey: ["build-info", buildUrl],
    url: `${buildUrl ?? "/"}api/json?tree=building,result,displayName,fullDisplayName`,
    enabled: !!buildUrl,
    staleTime: 5_000,
    refetchInterval: false,
  });

  // ---------------------------------------------------------------------------
  // Progressive text state
  // ---------------------------------------------------------------------------

  /** Accumulated HTML content from progressiveHtml responses */
  const [outputHtml, setOutputHtml] = useState<string>("");

  /** Whether more data is expected (from X-More-Data header) */
  const [hasMoreData, setHasMoreData] = useState<boolean>(true);

  /**
   * Number of kilobytes skipped due to truncation. When > 0, the "skipSome"
   * banner is rendered linking to the full console view.
   */
  const [truncatedKB, setTruncatedKB] = useState<number>(0);

  /**
   * Track previous build URL to reset progressive state when the URL changes.
   * Uses the React 19 "adjusting state from previous render" pattern instead
   * of resetting inside an effect (avoids react-hooks/set-state-in-effect).
   * @see https://react.dev/reference/react/useState#storing-information-from-previous-renders
   */
  const [prevBuildUrl, setPrevBuildUrl] = useState<string>(resolvedBuildUrl);
  if (prevBuildUrl !== resolvedBuildUrl) {
    setPrevBuildUrl(resolvedBuildUrl);
    setOutputHtml("");
    setTruncatedKB(0);
    setHasMoreData(true);
  }

  // ---------------------------------------------------------------------------
  // Refs
  // ---------------------------------------------------------------------------

  /** Reference to the `<pre id="out">` element for clipboard copy and scroll */
  const outRef = useRef<HTMLPreElement>(null);

  /**
   * Refs for crumb values to avoid re-triggering the polling effect when the
   * crumb token is refreshed (rare edge case during multi-step flows).
   */
  const crumbFieldRef = useRef<string>(crumbFieldName);
  const crumbValueRef = useRef<string>(crumbValue);

  // Keep crumb refs in sync with the latest context values
  useEffect(() => {
    crumbFieldRef.current = crumbFieldName;
    crumbValueRef.current = crumbValue;
  }, [crumbFieldName, crumbValue]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const isBuilding = buildData?.building ?? false;
  const buildResult = buildData?.result ?? null;
  const displayName =
    buildData?.displayName ??
    (jobName
      ? `${jobName} #${buildNumber ?? ""}`.trim()
      : `#${buildNumber ?? "unknown"}`);
  const fullDisplayName = buildData?.fullDisplayName ?? displayName;

  // ---------------------------------------------------------------------------
  // Progressive text polling effect
  // ---------------------------------------------------------------------------
  // Implements the `<t:progressiveText>` Jelly tag behavior:
  // 1. Probe for log size via high-offset request → calculate truncation
  // 2. Fetch progressive HTML from truncation offset
  // 3. Append HTML, update offset from X-Text-Size, check X-More-Data
  // 4. Repeat via setTimeout until X-More-Data is absent/false
  // 5. Dispatch jenkins:consoleFinished custom event on completion

  useEffect(() => {
    if (!resolvedBuildUrl) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let currentOffset = 0;
    let isProbePhase = true;

    /**
     * Constructs the HTTP headers for a Stapler request, injecting the
     * CSRF crumb header when available.
     */
    const buildHeaders = (): Record<string, string> => {
      const headers: Record<string, string> = {};
      if (crumbFieldRef.current && crumbValueRef.current) {
        headers[crumbFieldRef.current] = crumbValueRef.current;
      }
      return headers;
    };

    /**
     * Single polling iteration: fetches progressive HTML from the current
     * offset, processes response headers, and schedules the next poll if
     * more data is expected.
     */
    const poll = async (): Promise<void> => {
      if (cancelled) {
        return;
      }

      try {
        const headers = buildHeaders();

        // Phase 1 — Probe for log size to calculate truncation offset
        // Mirrors console-log.jelly line 5:
        //   offset = it.logText.length() - threshold * 1024
        if (isProbePhase) {
          const probeResponse = await fetch(
            `${resolvedBuildUrl}logText/progressiveHtml?start=${PROBE_OFFSET}`,
            { headers, method: "GET" },
          );
          if (cancelled) {
            return;
          }

          const logSize = parseInt(
            probeResponse.headers.get("X-Text-Size") ?? "0",
            10,
          );
          const skipBytes = Math.max(0, logSize - CONSOLE_TAIL_KB * 1024);

          if (skipBytes > 0) {
            setTruncatedKB(Math.floor(skipBytes / 1024));
          }

          currentOffset = Math.max(0, skipBytes);
          isProbePhase = false;
        }

        // Phase 2 — Fetch progressive HTML content from current offset
        const response = await fetch(
          `${resolvedBuildUrl}logText/progressiveHtml?start=${currentOffset}`,
          { headers, method: "GET" },
        );
        if (cancelled) {
          return;
        }

        const html = await response.text();
        const newOffset = parseInt(
          response.headers.get("X-Text-Size") ?? String(currentOffset),
          10,
        );
        const moreData = response.headers.get("X-More-Data") === "true";

        // Append new content to accumulated output
        if (html.length > 0) {
          setOutputHtml((prev) => prev + html);
        }

        currentOffset = newOffset;
        setHasMoreData(moreData);

        // Schedule next poll or fire completion event
        if (moreData && !cancelled) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        } else if (!moreData) {
          // Mirrors console-log.jelly line 28:
          //   onFinishEvent="jenkins:consoleFinished"
          document.dispatchEvent(new CustomEvent("jenkins:consoleFinished"));
        }
      } catch (error: unknown) {
        // Log transient failures and retry with backoff
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`Console progressive fetch failed: ${message}`);
          timer = setTimeout(poll, RETRY_INTERVAL_MS);
        }
      }
    };

    // Begin polling. State reset is handled by the "adjusting state from
    // previous render" pattern above (prevBuildUrl comparison) to avoid
    // synchronous setState calls in the effect body.
    poll();

    // Cleanup: cancel pending polls on unmount or URL change
    return () => {
      cancelled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [resolvedBuildUrl]);

  // ---------------------------------------------------------------------------
  // Auto-scroll effect
  // ---------------------------------------------------------------------------
  // When progressive output is arriving, auto-scroll the page to the bottom
  // so the user sees the latest lines. Only scrolls when the user is already
  // near the bottom of the page (within 150px) to avoid hijacking manual
  // scroll position. Mirrors standard Jenkins progressive text behavior.

  useEffect(() => {
    if (!hasMoreData || !outputHtml) {
      return;
    }

    const scrollThreshold = 150;
    const isNearBottom =
      window.innerHeight + window.scrollY >=
      document.body.scrollHeight - scrollThreshold;

    if (isNearBottom) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  }, [outputHtml, hasMoreData]);

  // ---------------------------------------------------------------------------
  // Copy button handler
  // ---------------------------------------------------------------------------
  // Mirrors `<l:copyButton ref="out">` Jelly tag — copies the text content
  // of the `<pre id="out">` element to the clipboard using the Clipboard API
  // with a fallback to `document.execCommand('copy')` for older browsers.

  const handleCopy = useCallback(async (): Promise<void> => {
    if (!outRef.current) {
      return;
    }

    const textContent = outRef.current.textContent ?? "";

    try {
      await navigator.clipboard.writeText(textContent);
    } catch {
      // Fallback: select text and use execCommand
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(outRef.current);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand("copy");
      selection?.removeAllRanges();
    }
  }, []);

  // ---------------------------------------------------------------------------
  // i18n labels with fallback defaults
  // ---------------------------------------------------------------------------

  const pageTitle = t("console") ?? "Console";
  const downloadLabel = t("download") ?? "Download";
  const copyLabel = t("copy") ?? "Copy";
  const viewPlainTextLabel = t("view-as-plain-text") ?? "View as plain text";

  /**
   * Constructs the "skipSome" truncation message with the KB parameter.
   * Mirrors console-log.jelly line 10: `${%skipSome(offset / 1024)}`
   * The i18n template is expected to contain a `{0}` placeholder for the KB value.
   */
  const skipSomeMessage = (() => {
    const template = t("skipsome");
    if (template) {
      return template.replace("{0}", String(truncatedKB));
    }
    return `Skipped ${truncatedKB} KB of output. Show complete output.`;
  })();

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Layout title={pageTitle}>
      {/* ------------------------------------------------------------------ */}
      {/* App bar — mirrors console.jelly lines 37-46                        */}
      {/* <l:app-bar title="${%Console}">                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="app-bar">
        <h1>{pageTitle}</h1>
        <div className="app-bar__controls">
          {/* Download button — console.jelly line 38-41 */}
          <a
            className="jenkins-button"
            href="consoleText"
            download={`${displayName}.txt`}
          >
            <svg
              className="svg-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>{" "}
            {downloadLabel}
          </a>

          {/* Copy button — console.jelly line 42 */}
          <button
            className="jenkins-button jenkins-copy-button"
            type="button"
            onClick={handleCopy}
            data-clipboard-target="#out"
          >
            {copyLabel}
          </button>

          {/* View as plain text link — console.jelly lines 43-45 */}
          <a className="jenkins-button" href="consoleText">
            {viewPlainTextLabel}
          </a>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Loading / Error states                                              */}
      {/* ------------------------------------------------------------------ */}
      {isLoading && !outputHtml && <Spinner text="Loading…" />}

      {isError && !outputHtml && (
        <div role="alert" className="jenkins-alert jenkins-alert--error">
          <p>Failed to load build information for {fullDisplayName}.</p>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* "skipSome" truncation banner — console-log.jelly lines 7-11        */}
      {/*                                                                     */}
      {/* <a class="jenkins-button jenkins-!-accent-color                     */}
      {/*     jenkins-!-padding-2 jenkins-!-margin-bottom-2"                  */}
      {/*    style="width: 100%; justify-content: start"                      */}
      {/*    href="consoleFull">                                              */}
      {/*   <l:icon src="symbol-help-circle" />                               */}
      {/*   ${%skipSome(offset / 1024)}                                       */}
      {/* </a>                                                                */}
      {/* ------------------------------------------------------------------ */}
      {truncatedKB > 0 && (
        <a
          className="jenkins-button jenkins-!-accent-color jenkins-!-padding-2 jenkins-!-margin-bottom-2"
          style={{ width: "100%", justifyContent: "start" }}
          href="consoleFull"
        >
          <svg
            className="svg-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>{" "}
          {skipSomeMessage}
        </a>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Console output — console-log.jelly lines 23, 32-34                 */}
      {/*                                                                     */}
      {/* <pre id="out" class="console-output">...</pre>                      */}
      {/*                                                                     */}
      {/* Uses dangerouslySetInnerHTML because the progressiveHtml endpoint   */}
      {/* returns server-sanitized HTML with ANSI colors already converted    */}
      {/* to <span class="ansi-..."> elements by Jenkins server-side.         */}
      {/* ------------------------------------------------------------------ */}
      <pre
        id="out"
        ref={outRef}
        className="console-output"
        data-build-result={buildResult ?? undefined}
        dangerouslySetInnerHTML={{ __html: outputHtml }}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Spinner — console-log.jelly lines 24-26                            */}
      {/*                                                                     */}
      {/* <div id="spinner"><l:progressAnimation/></div>                      */}
      {/*                                                                     */}
      {/* Shown only when the build is in progress and more data is expected. */}
      {/* ------------------------------------------------------------------ */}
      {isBuilding && hasMoreData && (
        <div id="spinner">
          <Spinner />
        </div>
      )}
    </Layout>
  );
}
