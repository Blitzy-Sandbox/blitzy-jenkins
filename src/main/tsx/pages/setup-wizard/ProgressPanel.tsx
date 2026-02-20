/**
 * ProgressPanel — Plugin Installation Progress Step
 *
 * Replaces `src/main/js/templates/progressPanel.hbs` (27 lines) plus the
 * progress tracking logic from `pluginSetupWizardGui.js` (lines 542–697).
 *
 * Renders a jumbotron-style progress bar, per-plugin status list with
 * installStatus-driven CSS classes (pending / installing / success / fail),
 * and a scrollable console log container. Uses the `useInstallStatus()` React
 * Query hook with 250 ms polling to replace the legacy `setTimeout(updateStatus, 250)`
 * loop.
 *
 * When installation completes with failures the component renders the inline
 * success/failure panel (matching `successPanel.hbs`) with retry / continue
 * buttons instead of navigating to a separate view.
 *
 * @module pages/setup-wizard/ProgressPanel
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useInstallStatus } from "@/api/pluginManager";
import type { PluginInstallStatusEntry, InstallStatusData } from "@/api/types";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Replaces non-word characters with underscores, replicating the Handlebars
 * `{{id name}}` helper from `src/main/js/handlebars-helpers/id.js`.
 *
 * @param str - The raw plugin name string.
 * @returns An id-safe string with non-word characters replaced by `_`.
 */
function idify(str: string): string {
  return String(str).replace(/\W+/g, "_");
}

/**
 * Tests whether a plugin's `installStatus` value indicates completion
 * (either success or failure), matching the RegExp tests at source lines 600–601.
 *
 * @param status - The `installStatus` string from the install status response.
 * @returns `true` when the status indicates the plugin is no longer installing.
 */
function isCompleteStatus(status: string): boolean {
  return /.*Success.*/.test(status) || /.*Fail.*/.test(status);
}

/**
 * Derives a normalised CSS class from the raw `installStatus` value coming
 * from the Stapler endpoint. The raw value may be a rich string like
 * "InstallSuccess" or "DownloadFailed" — this normalises it to one of the
 * four CSS classes used in the original Handlebars template.
 *
 * Source: pluginSetupWizardGui.js lines 624–633.
 */
function statusToClass(
  status: string,
): "success" | "installing" | "fail" | "pending" {
  if (/.*Success.*/.test(status)) {
    return "success";
  }
  if (/.*Install.*/.test(status)) {
    return "installing";
  }
  if (/.*Fail.*/.test(status)) {
    return "fail";
  }
  return "pending";
}

// =============================================================================
// Console Entry Type
// =============================================================================

/**
 * Represents a single entry in the install console log.
 */
interface ConsoleEntry {
  /** Plugin short name — used as a React key. */
  name: string;
  /** Human-readable plugin title. */
  title: string;
  /** Whether this plugin was explicitly selected by the user. */
  isSelected: boolean;
}

// =============================================================================
// Props Interface (Exported)
// =============================================================================

/**
 * Props accepted by the `ProgressPanel` component.
 *
 * Maps 1-to-1 with the data flow previously managed by
 * `pluginSetupWizardGui.js`'s `showInstallProgress()` function.
 */
export interface ProgressPanelProps {
  /** Localisation dictionary keyed by `installWizard_*` translation keys. */
  translations: Record<string, string>;
  /** Initial list of plugins being installed, each with a default `pending` status. */
  installingPlugins: PluginInstallStatusEntry[];
  /** Names of plugins the user explicitly selected (vs. auto-resolved dependencies). */
  selectedPluginNames: string[];
  /**
   * Callback invoked when installation completes successfully (zero failures).
   * Receives the installation `state` string from the Stapler response.
   */
  onComplete: (state: string) => void;
  /**
   * Callback invoked when an unrecoverable error occurs during polling
   * (e.g. network failure or timeout beyond React Query retry limits).
   */
  onError: (errorMessage: string) => void;
  /** Callback to retry installing only the plugins that failed. */
  onRetryFailed: () => void;
  /**
   * Callback to continue the setup wizard ignoring failed plugins,
   * matching the "Continue" button in `successPanel.hbs`.
   */
  onContinueWithFailed: () => void;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Plugin installation progress panel.
 *
 * Renders a Bootstrap-style progress bar, a per-plugin status list, and an
 * auto-scrolling install console. Polls `GET /updateCenter/installStatus`
 * every 250 ms via `useInstallStatus()` until all jobs complete.
 *
 * When the installation completes with failures the panel transitions to an
 * inline failure view with retry / continue actions.
 */
export default function ProgressPanel({
  translations,
  installingPlugins,
  selectedPluginNames,
  onComplete,
  onError,
  onRetryFailed,
  onContinueWithFailed,
}: ProgressPanelProps): React.JSX.Element {
  // ---------------------------------------------------------------------------
  // Captured Initial State (schema requires useState)
  // ---------------------------------------------------------------------------

  /**
   * Snapshot of the installing plugins list taken once when the component
   * mounts. This avoids re-deriving statuses when the parent re-renders
   * with a new array reference but identical content.
   */
  const [initialPlugins] = useState<PluginInstallStatusEntry[]>(() =>
    installingPlugins.map((p) => ({
      ...p,
      installStatus: p.installStatus || "pending",
    })),
  );

  // ---------------------------------------------------------------------------
  // Refs — Auto-Scroll Behaviour (source lines 552–575, 675–679)
  // ---------------------------------------------------------------------------

  /** Reference to the `.install-console-scroll` container for auto-scroll. */
  const consoleScrollRef = useRef<HTMLDivElement>(null);

  /**
   * Whether the user has manually scrolled upward. When `true`, programmatic
   * scroll-to-bottom is suppressed until the user scrolls back to the bottom.
   */
  const userScrolledRef = useRef<boolean>(false);

  /**
   * Flag to distinguish programmatic auto-scroll events from user-initiated
   * scroll events. Set to `true` before a programmatic `scrollTop` assignment
   * and cleared inside the scroll event handler.
   */
  const wasAutoScrolledRef = useRef<boolean>(false);

  // ---------------------------------------------------------------------------
  // Refs — Completion Latch
  // ---------------------------------------------------------------------------

  /**
   * Ensures the `onComplete` callback fires exactly once. Set to `true`
   * inside the completion side-effect after invoking the callback.
   */
  const completionFiredRef = useRef<boolean>(false);

  // ---------------------------------------------------------------------------
  // Install Status Polling via useInstallStatus (replaces setTimeout loop)
  //
  // Polls every 250 ms (matching source line 696: setTimeout(updateStatus, 250)).
  // Polling stops automatically when this component unmounts — i.e. when the
  // wizard advances after `onComplete` fires or when the user clicks
  // "Retry" / "Continue" on the failure panel. React Query removes the
  // observer on unmount, so no explicit `enabled: false` is needed.
  // ---------------------------------------------------------------------------

  const {
    data: statusData,
    isLoading: isStatusLoading,
    isError: isStatusError,
    error: statusError,
  } = useInstallStatus(undefined, {
    refetchInterval: 250,
  });

  // ---------------------------------------------------------------------------
  // Derived State via useMemo (replaces updateStatus at source lines 585–693)
  //
  // All rendering values are computed from the latest poll data. This avoids
  // synchronous setState inside useEffect, which the react-hooks plugin flags
  // as a pattern prone to cascading re-renders.
  // ---------------------------------------------------------------------------

  const {
    progressPercent,
    pluginStatuses,
    consoleEntries,
    failedPluginNames,
    allJobsDone,
  } = useMemo(() => {
    // Before any poll data arrives, show the initial plugin list at 0 %.
    if (!statusData) {
      return {
        progressPercent: 0,
        pluginStatuses: initialPlugins,
        consoleEntries: [] as ConsoleEntry[],
        failedPluginNames: [] as string[],
        allJobsDone: false,
      };
    }

    // Explicit InstallStatusData type annotation for schema compliance — the
    // hook already returns this type, but annotating here makes the dependency
    // on the InstallStatusData shape visible at the call-site.
    const data: InstallStatusData = statusData;
    const jobs: PluginInstallStatusEntry[] = data.jobs ?? [];

    // -------------------------------------------------------------------
    // 1. Count completed jobs (source lines 596–605)
    // -------------------------------------------------------------------
    let complete = 0;
    let total = jobs.length;

    for (const job of jobs) {
      if (isCompleteStatus(job.installStatus)) {
        complete++;
      }
    }

    // When the server hasn't started reporting jobs yet, fall back to the
    // size of the initial plugin list so we never show 100 % prematurely.
    // Source lines 607–610.
    if (total === 0) {
      total = initialPlugins.length;
    }

    // -------------------------------------------------------------------
    // 2. Compute progress percentage (source line 613)
    // -------------------------------------------------------------------
    const percent = total > 0 ? (100.0 * complete) / total : 0;

    // -------------------------------------------------------------------
    // 3. Compute per-plugin status list (source lines 619–654)
    // -------------------------------------------------------------------
    const nextFailedNames: string[] = [];

    const statuses = initialPlugins.map((plugin) => {
      const matchingJob = jobs.find((j) => j.name === plugin.name);

      if (matchingJob) {
        const normalised = statusToClass(matchingJob.installStatus);

        // Track failures (source setFailureStatus at lines 353–361).
        if (/.*Fail.*/.test(matchingJob.installStatus)) {
          if (!nextFailedNames.includes(matchingJob.name)) {
            nextFailedNames.push(matchingJob.name);
          }
        }

        return {
          ...plugin,
          installStatus: normalised,
          errorMessage: matchingJob.errorMessage ?? plugin.errorMessage,
        };
      }

      return { ...plugin };
    });

    // -------------------------------------------------------------------
    // 4. Build console entries (source lines 616–672)
    // -------------------------------------------------------------------
    const selectedSet = new Set(selectedPluginNames);
    const entries: ConsoleEntry[] = [];

    for (const job of jobs) {
      const cls = statusToClass(job.installStatus);
      if (cls === "success" || cls === "installing" || cls === "fail") {
        entries.push({
          name: job.name,
          title: job.title,
          isSelected: selectedSet.has(job.name),
        });
      }
    }

    // -------------------------------------------------------------------
    // 5. Detect whether all jobs are done (source lines 682–690)
    // -------------------------------------------------------------------
    const done =
      complete >= total &&
      total > 0 &&
      data.state !== "INITIAL_PLUGINS_INSTALLING";

    return {
      progressPercent: done ? 100 : percent,
      pluginStatuses: statuses,
      consoleEntries: entries,
      failedPluginNames: nextFailedNames,
      allJobsDone: done,
    };
  }, [statusData, initialPlugins, selectedPluginNames]);

  // ---------------------------------------------------------------------------
  // Side-Effect: Fire onComplete Callback (exactly once)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (
      allJobsDone &&
      failedPluginNames.length === 0 &&
      !completionFiredRef.current
    ) {
      completionFiredRef.current = true;
      onComplete(statusData?.state ?? "");
    }
  }, [allJobsDone, failedPluginNames.length, onComplete, statusData?.state]);

  // ---------------------------------------------------------------------------
  // Side-Effect: Error Forwarding
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (isStatusError && statusError) {
      onError(
        statusError instanceof Error
          ? statusError.message
          : String(statusError),
      );
    }
  }, [isStatusError, statusError, onError]);

  // ---------------------------------------------------------------------------
  // Side-Effect: Auto-Scroll Console (source lines 675–679)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const scrollEl = consoleScrollRef.current;
    if (scrollEl && !userScrolledRef.current && consoleEntries.length > 0) {
      wasAutoScrolledRef.current = true;
      scrollEl.scrollTop = scrollEl.scrollHeight;
    }
  }, [consoleEntries]);

  // ---------------------------------------------------------------------------
  // Scroll Event Handler (source lines 552–575)
  // ---------------------------------------------------------------------------

  /**
   * Handles scroll events on the console container. Detects whether the user
   * has scrolled away from the bottom so that auto-scroll can be paused.
   */
  const handleConsoleScroll = useCallback(() => {
    const el = consoleScrollRef.current;
    if (!el) {
      return;
    }

    if (!wasAutoScrolledRef.current) {
      // Determine if the user is at the bottom (with a small tolerance).
      const atBottom =
        Math.abs(el.scrollTop - (el.scrollHeight - el.clientHeight)) < 2;
      if (atBottom) {
        // User scrolled back to bottom — resume auto-scroll.
        userScrolledRef.current = false;
      } else {
        // User scrolled upward — pause auto-scroll.
        userScrolledRef.current = true;
      }
    } else {
      // This scroll event was triggered by our programmatic auto-scroll.
      wasAutoScrolledRef.current = false;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Render: Failure Panel (replaces successPanel.hbs)
  // ---------------------------------------------------------------------------

  if (allJobsDone && failedPluginNames.length > 0) {
    const hasFailedPlugins = failedPluginNames.length > 0;

    return (
      <>
        {/* Modal Header — successPanel.hbs lines 1–3 */}
        <div className="modal-header">
          <h4 className="modal-title">
            {translations.installWizard_welcomePanel_title ?? ""}
          </h4>
        </div>

        {/* Modal Body — successPanel.hbs lines 4–20 */}
        <div className="modal-body">
          <div className="jumbotron welcome-panel success-panel">
            <h1>
              {translations.installWizard_pluginInstallFailure_title ?? ""}
            </h1>

            {hasFailedPlugins && (
              <>
                <p>
                  {translations.installWizard_pluginInstallFailure_message ?? ""}
                </p>
                <button
                  type="button"
                  className="btn btn-primary retry-failed-plugins"
                  onClick={onRetryFailed}
                >
                  {translations.installWizard_retry ?? "Retry"}
                </button>
              </>
            )}
          </div>

          {/* Per-plugin status list — successPanel.hbs lines 16–19 */}
          <div className="selected-plugin-progress success-panel">
            {pluginStatuses.map((plugin) => (
              <div
                key={plugin.name}
                className={`selected-plugin ${plugin.installStatus}`}
                data-name={idify(plugin.name)}
              >
                {plugin.title}
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer — successPanel.hbs lines 22–35 */}
        <div className="modal-footer">
          {hasFailedPlugins ? (
            <>
              <button
                type="button"
                className="btn btn-link continue-with-failed-plugins"
                onClick={onContinueWithFailed}
              >
                {translations.installWizard_continue ?? "Continue"}
              </button>
              <button
                type="button"
                className="btn btn-primary retry-failed-plugins"
                onClick={onRetryFailed}
              >
                {translations.installWizard_retry ?? "Retry"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary continue-with-failed-plugins"
              onClick={onContinueWithFailed}
            >
              {translations.installWizard_continue ?? "Continue"}
            </button>
          )}
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Progress Panel (replaces progressPanel.hbs)
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Modal Header — progressPanel.hbs lines 1–3 */}
      <div className="modal-header">
        <h4 className="modal-title">
          {translations.installWizard_installing_title ?? ""}
        </h4>
      </div>

      {/* Modal Body — progressPanel.hbs lines 4–26 */}
      <div className="modal-body installing-body">
        {/* Jumbotron with progress bar — progressPanel.hbs lines 5–12 */}
        <div
          className="jumbotron welcome-panel installing-panel"
          aria-busy={isStatusLoading}
        >
          <h1>{translations.installWizard_installing_title ?? ""}</h1>
          <div className="progress">
            <div
              className="progress-bar progress-bar-striped active"
              role="progressbar"
              aria-valuenow={Math.round(progressPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ width: `${progressPercent}%` }}
            >
              <span className="sr-only">
                {translations.installWizard_installing_title ?? ""}
              </span>
            </div>
          </div>
        </div>

        {/* Per-plugin status list — progressPanel.hbs lines 14–18 */}
        <div className="selected-plugin-progress">
          {pluginStatuses.map((plugin) => (
            <div
              key={plugin.name}
              className={`selected-plugin ${plugin.installStatus}`}
              id={`installing-${idify(plugin.name)}`}
              data-tooltip={plugin.errorMessage ?? ""}
            >
              {plugin.title}
            </div>
          ))}
        </div>

        {/* Install console — progressPanel.hbs lines 20–25 */}
        <div className="install-console">
          <div
            className="install-console-scroll"
            ref={consoleScrollRef}
            onScroll={handleConsoleScroll}
          >
            <div className="install-text">
              {consoleEntries.map((entry) => (
                <div
                  key={entry.name}
                  className={entry.isSelected ? "selected" : "dependent"}
                >
                  {entry.title}
                </div>
              ))}
            </div>
          </div>
          <div className="dependency-legend">
            {translations.installWizard_installingConsole_dependencyIndicatorNote ?? ""}
          </div>
        </div>
      </div>
    </>
  );
}
