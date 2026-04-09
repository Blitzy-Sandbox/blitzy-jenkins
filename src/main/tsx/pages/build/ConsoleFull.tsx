/**
 * ConsoleFull — Full Console Output View (Non-Truncated)
 *
 * Replaces `core/src/main/resources/hudson/model/Run/consoleFull.jelly` (28 lines).
 * The Jelly file sets `consoleFull=true` and then delegates to `console.jelly`,
 * which in turn includes `console-log.jelly`. When `consoleFull=true`,
 * `console-log.jelly` behaves differently:
 *
 * - **Offset is always 0** — the complete log is loaded from the beginning
 *   (line 5: `offset = consoleFull ? 0 : it.logText.length()-threshold*1024`)
 * - **No "skipSome" banner** — because offset is always 0, the truncation
 *   banner is never shown
 * - **Progressive rendering for in-progress builds** — identical to the
 *   default console view, polls `logText/progressiveHtml?start={offset}`
 *   with `X-Text-Size` and `X-More-Data` response headers
 * - **Static rendering for completed builds** — fetches `consoleText` once
 *   and renders the full output in a `<pre>` element
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
 * @module pages/build/ConsoleFull
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

// =============================================================================
// Props Interface
// =============================================================================

/**
 * Props for the {@link ConsoleFull} component.
 *
 * At minimum, `buildUrl` must be provided for the component to fetch and
 * render the full console output. `jobName` and `buildNumber` are used as
 * fallbacks for display text when build metadata has not yet loaded.
 */
export interface ConsoleFullProps {
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
 * Full console output view component.
 *
 * Replaces `consoleFull.jelly` which sets `consoleFull=true` and delegates
 * to `console.jelly` → `console-log.jelly`. The key difference from
 * {@link ConsoleOutput} is that this component always starts from offset 0
 * (complete log) and never shows a "skipSome" truncation banner.
 *
 * @param props - Component props
 * @returns The rendered full console output page
 */
export default function ConsoleFull({
  jobName,
  buildNumber,
  buildUrl,
}: ConsoleFullProps): React.JSX.Element {
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
  // API. Used to determine whether to use progressive loading (in-progress)
  // or static fetch (completed build).

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
  // Complete console text query (for finished builds only)
  // ---------------------------------------------------------------------------
  // When the build is complete, fetch the full console text in a single
  // request. This avoids the progressive polling overhead for finished builds.

  const { data: consoleText } = useStaplerQuery<string>({
    queryKey: ["console-full-text", buildUrl],
    url: `${buildUrl ?? "/"}consoleText`,
    enabled: !!buildUrl && buildData !== undefined && !buildData.building,
    staleTime: Infinity,
    refetchInterval: false,
  });

  // ---------------------------------------------------------------------------
  // Progressive text state (for in-progress builds)
  // ---------------------------------------------------------------------------

  /** Accumulated HTML content from progressiveHtml responses */
  const [progressiveHtml, setProgressiveHtml] = useState<string>("");

  /** Whether more data is expected (from X-More-Data header) */
  const [hasMoreData, setHasMoreData] = useState<boolean>(true);

  /**
   * Track previous build URL to reset progressive state when the URL changes.
   * Uses the React 19 "adjusting state from previous render" pattern instead
   * of resetting inside an effect (avoids react-hooks/set-state-in-effect).
   * @see https://react.dev/reference/react/useState#storing-information-from-previous-renders
   */
  const [prevBuildUrl, setPrevBuildUrl] = useState<string>(resolvedBuildUrl);
  if (prevBuildUrl !== resolvedBuildUrl) {
    setPrevBuildUrl(resolvedBuildUrl);
    setProgressiveHtml("");
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

  /**
   * Determine the HTML to render in the `<pre>` element.
   *
   * - For in-progress builds: use accumulated progressiveHtml
   * - For completed builds: use consoleText fetched in a single request
   *   (consoleText is plain text, not HTML — we render it as-is)
   * - Progressive output takes priority when available (handles the
   *   transition from in-progress to completed seamlessly)
   */
  const outputHtml = progressiveHtml || consoleText || "";

  // ---------------------------------------------------------------------------
  // Progressive text polling effect (for in-progress builds only)
  // ---------------------------------------------------------------------------
  // Implements the `<t:progressiveText>` Jelly tag behavior with
  // consoleFull=true semantics (offset always starts at 0):
  //
  // 1. Fetch progressive HTML from offset 0 (FULL log, no truncation)
  // 2. Append HTML, update offset from X-Text-Size, check X-More-Data
  // 3. Repeat via setTimeout until X-More-Data is absent/false
  // 4. Dispatch jenkins:consoleFinished custom event on completion

  useEffect(() => {
    // Only run progressive polling for in-progress builds
    if (!resolvedBuildUrl || !isBuilding) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // consoleFull=true: always start from offset 0 (complete log)
    let currentOffset = 0;

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
     *
     * Unlike ConsoleOutput.tsx, there is NO probe phase and NO truncation
     * calculation — offset always starts at 0 for full console view.
     */
    const poll = async (): Promise<void> => {
      if (cancelled) {
        return;
      }

      try {
        const headers = buildHeaders();

        // Fetch progressive HTML content from current offset
        // consoleFull=true: starts at 0, loads everything from the beginning
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
          setProgressiveHtml((prev) => prev + html);
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
          console.error(`Console full progressive fetch failed: ${message}`);
          timer = setTimeout(poll, RETRY_INTERVAL_MS);
        }
      }
    };

    // Begin polling from offset 0 (full console view)
    poll();

    // Cleanup: cancel pending polls on unmount or dependency change
    return () => {
      cancelled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [resolvedBuildUrl, isBuilding]);

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
      {/* Console output — console-log.jelly lines 23, 32-34                 */}
      {/*                                                                     */}
      {/* <pre id="out" class="console-output">...</pre>                      */}
      {/*                                                                     */}
      {/* No "skipSome" banner here — consoleFull=true means offset=0, so     */}
      {/* the complete log is always loaded from the beginning.               */}
      {/*                                                                     */}
      {/* Uses dangerouslySetInnerHTML because the progressiveHtml endpoint   */}
      {/* returns server-sanitized HTML with ANSI colors already converted    */}
      {/* to <span class="ansi-..."> elements by Jenkins server-side.         */}
      {/* For completed builds, consoleText is plain text rendered as-is.     */}
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
