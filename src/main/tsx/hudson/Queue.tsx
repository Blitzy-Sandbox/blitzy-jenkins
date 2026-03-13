/**
 * Queue — Build Queue Panel Component
 *
 * Replaces `core/src/main/resources/lib/hudson/queue.jelly` — a Jelly template
 * that displays the build queue as a `<l:pane>`, showing queued items with
 * their names, wait reasons, stuck indicators, and cancel buttons.
 *
 * The Jelly version uses:
 * - `<l:pane>` wrapper producing `div.pane-frame > div.pane-header + div.pane-content > table.pane`
 * - `<t:setIconSize/>` for icon sizing context
 * - `${%...}` localization for 9 i18n keys
 * - `Behaviour.specify(".widget-refresh-reference", ...)` via `widget-refresh.js` for auto-refresh
 * - `<f:link post="true">` for cancel-quiet-down POST
 * - `<l:stopButton href="..." confirm="..." alt="...">` for cancel-item POST with confirmation
 * - `<l:icon src="symbol-hourglass">` for the stuck indicator
 * - `<l:breakable>` for word-break-friendly task names
 *
 * The React version replaces these with:
 * - `useStaplerQuery` with `refetchInterval` for auto-refresh polling (replaces widget-refresh.js)
 * - `useStaplerMutation` for cancel-item and cancel-quiet-down POST operations with CSRF crumbs
 * - `useI18n` hook `t()` for all 9 localized strings
 * - Inline hourglass SVG for the stuck indicator (replaces `<l:icon src="symbol-hourglass">`)
 * - `CLOSE` SVG constant for the stop-button icon (replaces `<l:icon src="symbol-close">`)
 * - React component lifecycle replacing Behaviour.specify registration
 *
 * DOM output preserves Jelly's `<l:pane>` structure: `div.pane-frame#buildQueue` wrapping
 * `div.pane-header > span.pane-header-title` and `div.pane-content > table.pane` with
 * CSS classes `pane`, `pane-grow`, `model-link inside tl-tr`, and `stop-button-link`
 * for complete visual parity with the original Jelly rendering.
 *
 * No jQuery, no Handlebars, no behaviorShim — React 19 component lifecycle.
 *
 * @module hudson/Queue
 */

import {
  useState,
  useCallback,
  type ReactElement,
  type MouseEvent,
} from "react";
import { useStaplerQuery } from "@/hooks/useStaplerQuery";
import { useStaplerMutation } from "@/hooks/useStaplerMutation";
import { useI18n } from "@/hooks/useI18n";
import type { QueueItem, QueueTask } from "@/types/models";
import { CLOSE } from "@/utils/symbols";
import { getBaseUrl } from "@/utils/baseUrl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Response shape from the queue REST API endpoint (`queue/api/json`).
 * Used by the auto-refresh `useStaplerQuery` to type the polled data.
 */
interface QueueApiResponse {
  /** Optional Stapler class discriminator */
  _class?: string;
  /** Array of queue items currently in the build queue */
  items: QueueItem[];
}

/**
 * Props for the {@link Queue} component.
 *
 * Maps to the Jelly template attributes defined in queue.jelly lines 30-37:
 * - `items` → `${app.queue.items}` (required attribute, line 31)
 * - `filtered` → `${filtered}` (optional attribute, line 36)
 * - `quietingDown` → `${app.quietingDown}` (line 50)
 * - `hasManagePermission` → `${h.hasPermission(app.MANAGE)}` (line 54)
 * - `viewUrl` → `${it.url}` (line 108) for widget-refresh data-url
 */
export interface QueueProps {
  /**
   * Queue items to display. Normally corresponds to `app.queue.items`.
   * A sublist can be passed after filtering to narrow the display.
   */
  items: QueueItem[];

  /**
   * Indicates the queue has been filtered and might not show all items.
   * Changes the pane title to "Filtered Build Queue (N)" instead of
   * "Build Queue (N)".
   */
  filtered?: boolean;

  /**
   * Whether Jenkins is in quiet-down (shutdown pending) mode.
   * When true, a shutdown notice row is displayed at the top of the pane
   * with an optional cancel link for users with MANAGE permission.
   */
  quietingDown?: boolean;

  /**
   * Whether the current user has the Jenkins MANAGE permission.
   * Controls visibility of the cancel-quiet-down link in the shutdown notice.
   */
  hasManagePermission?: boolean;

  /**
   * View URL for constructing the auto-refresh polling endpoint.
   * When provided, enables React Query polling to keep the queue updated.
   * Maps to the Jelly `data-url` attribute on the widget-refresh div (line 108).
   * Example: `"view/all/"`.
   */
  viewUrl?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Auto-refresh polling interval in milliseconds.
 * Matches the approximate cadence of the original widget-refresh.js
 * Behaviour.specify pattern that called refreshPart periodically.
 */
const QUEUE_REFRESH_INTERVAL_MS = 5000;

/**
 * Jenkins troubleshooting URL for executor starvation.
 * Linked from the hourglass icon on stuck queue items (queue.jelly line 85).
 */
const EXECUTOR_STARVATION_URL =
  "https://www.jenkins.io/redirect/troubleshooting/executor-starvation";

/**
 * Hourglass SVG icon markup for stuck queue items.
 * Sourced from `war/src/main/resources/images/symbols/hourglass.svg`.
 * Uses `currentColor` for fill and stroke to inherit the text color from the
 * parent element, matching the `<l:icon src="symbol-hourglass" class="icon-sm"/>`
 * rendering in queue.jelly line 86.
 */
const HOURGLASS_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
  '<path d="M145.61 464h220.78c19.8 0 35.55-16.29 33.42-35.06C386.06 308 304 310 ' +
  "304 256s83.11-51 95.8-172.94c2-18.78-13.61-35.06-33.41-35.06H145.61c-19.8 0-35.37 " +
  "16.28-33.41 35.06C124.89 205 208 201 208 256s-82.06 52-95.8 172.94c-2.14 18.77 " +
  '13.61 35.06 33.41 35.06z" fill="none" stroke="currentColor" stroke-linecap="round" ' +
  'stroke-linejoin="round" stroke-width="32"/>' +
  '<path fill="currentColor" d="M343.3 432H169.13c-15.6 0-20-18-9.06-29.16C186.55 376 ' +
  "240 356.78 240 326V224c0-19.85-38-35-61.51-67.2-3.88-5.31-3.49-12.8 6.37-12.8h142.73" +
  "c8.41 0 10.23 7.43 6.4 12.75C310.82 189 272 204.05 272 224v102c0 30.53 55.71 47 80.4 " +
  '76.87 9.95 12.04 6.47 29.13-9.1 29.13z"/></svg>';

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Extracts a human-readable causes description from a queue item's actions.
 *
 * Searches for CauseAction entries (those with a `causes` array) in the
 * item's `actions` list and joins all `shortDescription` values into a
 * comma-separated string.
 *
 * Mirrors the Jelly `${item.causesDescription}` expression (queue.jelly line 78).
 *
 * @param item - The queue item to extract causes from
 * @returns Comma-separated causes description, or empty string if none found
 */
function getCausesDescription(item: QueueItem): string {
  const descriptions: string[] = [];

  for (const action of item.actions) {
    // Structural check for CauseAction shape: { causes: Array<{ shortDescription }> }
    if (
      action != null &&
      "causes" in action &&
      Array.isArray((action as Record<string, unknown>).causes)
    ) {
      const causes = (
        action as { causes: Array<{ shortDescription?: string }> }
      ).causes;
      for (const cause of causes) {
        if (cause.shortDescription) {
          descriptions.push(cause.shortDescription);
        }
      }
    }
  }

  return descriptions.join(", ");
}

/**
 * Formats the elapsed time since a queue item entered the queue as a
 * human-readable duration string.
 *
 * Produces output like "0 sec", "45 sec", "3 min 12 sec", "1 hr 5 min"
 * to match the Jelly `${item.inQueueForString}` expression (queue.jelly line 78).
 *
 * @param inQueueSince - Epoch timestamp in milliseconds when the item entered the queue
 * @returns Human-readable duration string
 */
function formatInQueueDuration(inQueueSince: number): string {
  const elapsedMs = Math.max(0, Date.now() - inQueueSince);
  const totalSeconds = Math.floor(elapsedMs / 1000);

  if (totalSeconds < 1) {
    return "0 sec";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${String(hours)} hr`);
  }
  if (minutes > 0) {
    parts.push(`${String(minutes)} min`);
  }
  // Show seconds only when duration is less than 1 hour
  if (seconds > 0 && hours === 0) {
    parts.push(`${String(seconds)} sec`);
  }

  return parts.join(" ") || "0 sec";
}

/**
 * Builds the tooltip string for a queue item link.
 *
 * Replicates the Jelly tooltip pattern (queue.jelly line 78):
 * `tooltip="${item.causesDescription} ${item.why} ${item.params} \n ${%WaitingFor(item.inQueueForString)}"`
 *
 * @param item - The queue item to build the tooltip for
 * @param waitingForLabel - Localized "WaitingFor" label (may include `{0}` placeholder)
 * @returns Formatted tooltip string
 */
function buildItemTooltip(item: QueueItem, waitingForLabel: string): string {
  const causes = getCausesDescription(item);
  const why = item.why ?? "";
  const params = item.params ?? "";
  const inQueueFor = formatInQueueDuration(item.inQueueSince);

  // Join non-empty parts with space, matching Jelly space concatenation
  const descriptionParts: string[] = [];
  if (causes) {
    descriptionParts.push(causes);
  }
  if (why) {
    descriptionParts.push(why);
  }
  if (params) {
    descriptionParts.push(params);
  }
  const mainDescription = descriptionParts.join(" ");

  // Format the "Waiting for" line, replacing {0} placeholder if present
  const waitingLine = waitingForLabel.includes("{0}")
    ? waitingForLabel.replace("{0}", inQueueFor)
    : `${waitingForLabel}(${inQueueFor})`;

  return mainDescription ? `${mainDescription}\n${waitingLine}` : waitingLine;
}

// ---------------------------------------------------------------------------
// Component Implementation
// ---------------------------------------------------------------------------

/**
 * Build queue panel component displaying queued builds with auto-refresh.
 *
 * Renders the Jenkins build queue as a `<l:pane>` equivalent with:
 * - Title showing "Build Queue (N)" or "Filtered Build Queue (N)"
 * - Quieting-down shutdown notice with cancel link (MANAGE permission)
 * - Empty queue message when no builds are queued
 * - Queue item rows with task name links, wait reason tooltips,
 *   stuck indicators (hourglass icon), and cancel buttons
 * - Auto-refresh polling via React Query `refetchInterval`
 *
 * @param props - Component props mapping to Jelly template attributes
 * @returns The rendered build queue pane element
 */
export default function Queue(props: QueueProps): ReactElement {
  const {
    items: initialItems,
    filtered = false,
    quietingDown = false,
    hasManagePermission = false,
    viewUrl,
  } = props;

  const rootUrl = getBaseUrl();
  const { t } = useI18n();

  // -------------------------------------------------------------------------
  // Pane expand/collapse state
  //
  // Mirrors the pane.jelly collapse/expand toggle (pane.jelly lines 55-63):
  // The Jelly version POSTs to {rootURL}/toggleCollapse?paneId=buildQueue
  // and toggles the outer div class between "expanded" and "collapsed".
  // The React version manages this client-side via useState.
  // -------------------------------------------------------------------------

  const [expanded, setExpanded] = useState(true);

  // -------------------------------------------------------------------------
  // Auto-refresh polling via React Query
  //
  // Replaces the widget-refresh.js Behaviour.specify pattern (queue.jelly
  // lines 107-109) that periodically called refreshPart('buildQueue', url)
  // to fetch updated HTML. The React version polls the JSON API instead.
  // -------------------------------------------------------------------------

  const {
    data: polledData,
    isLoading,
    isFetching,
  } = useStaplerQuery<QueueApiResponse>({
    url: "queue/api/json",
    queryKey: ["buildQueue"],
    refetchInterval: QUEUE_REFRESH_INTERVAL_MS,
    enabled: !!viewUrl,
  });

  // Use polled data when available; fall back to initial items from props.
  // This ensures the component renders immediately with server-provided data
  // and then stays updated via polling.
  const displayItems: QueueItem[] = polledData?.items ?? initialItems;

  // -------------------------------------------------------------------------
  // Cancel queue item mutation
  //
  // Replaces the `<l:stopButton href="${rootURL}/queue/cancelItem?id=${item.id}">`
  // pattern (queue.jelly line 98). The Jelly stop button renders an `<a>` with
  // class `stop-button-link` that POSTs with a CSRF crumb. The React mutation
  // sends the item ID as form-urlencoded body data to the same endpoint.
  // -------------------------------------------------------------------------

  const cancelItemMutation = useStaplerMutation<void, string>({
    url: "queue/cancelItem",
    contentType: "form-urlencoded",
  });

  // -------------------------------------------------------------------------
  // Cancel quiet-down mutation
  //
  // Replaces the `<f:link href="${rootURL}/cancelQuietDown" post="true">`
  // pattern (queue.jelly line 55). POSTs to the cancelQuietDown endpoint
  // with CSRF crumb injection to exit quiet-down / shutdown-pending mode.
  // -------------------------------------------------------------------------

  const cancelQuietDownMutation = useStaplerMutation<void, string>({
    url: "cancelQuietDown",
    contentType: "form-urlencoded",
  });

  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------

  /**
   * Handles cancel queue item click.
   *
   * Shows a confirmation dialog (mirrors `<l:stopButton confirm="...">` behavior)
   * then POSTs `id={item.id}` to `queue/cancelItem` via the cancel mutation.
   *
   * Uses `window.dialog.confirm()` (Jenkins enhanced dialog) when available,
   * falling back to `window.confirm()` for standard browser confirmation.
   */
  const handleCancelItem = useCallback(
    (item: QueueItem): void => {
      // Guard against double-cancellation while a cancel POST is in-flight
      if (cancelItemMutation.isPending) {
        return;
      }

      const displayName =
        item.task?.name ?? t("Unknown Task") ?? "Unknown Task";

      // Build the confirmation message from the i18n "confirm" key.
      // The Jelly pattern: confirm="${%confirm(item.displayName)}"
      // The i18n value typically contains a {0} placeholder for the item name.
      const rawConfirm = t("confirm");
      const message =
        rawConfirm != null && rawConfirm.includes("{0}")
          ? rawConfirm.replace("{0}", displayName)
          : (rawConfirm ?? `Cancel ${displayName}?`);

      // Attempt Jenkins dialog system first; fall back to window.confirm
      const jenkinsDialog = (window as unknown as Record<string, unknown>)
        .dialog as { confirm?: (q: string) => Promise<void> } | undefined;

      if (
        jenkinsDialog != null &&
        typeof jenkinsDialog.confirm === "function"
      ) {
        jenkinsDialog.confirm(message).then(() => {
          cancelItemMutation.mutate(`id=${String(item.id)}`);
        });
      } else if (window.confirm(message)) {
        cancelItemMutation.mutate(`id=${String(item.id)}`);
      }
    },
    [cancelItemMutation, t],
  );

  /**
   * Handles cancel quiet-down link click.
   *
   * Prevents default anchor navigation and POSTs to the cancelQuietDown
   * endpoint, mirroring `<f:link href="${rootURL}/cancelQuietDown" post="true">`
   * (queue.jelly line 55).
   */
  const handleCancelQuietDown = useCallback(
    (event: MouseEvent<HTMLAnchorElement>): void => {
      event.preventDefault();
      // Guard against double-cancellation while the cancel-quiet-down POST is in-flight
      if (cancelQuietDownMutation.isPending) {
        return;
      }
      cancelQuietDownMutation.mutate("");
    },
    [cancelQuietDownMutation],
  );

  // -------------------------------------------------------------------------
  // Title computation
  //
  // Jelly lines 40-47:
  //   filtered → "Filtered Build Queue(items.size())"
  //   default  → "Build Queue(items.size())"
  // -------------------------------------------------------------------------

  const itemCount = displayItems.length;
  const title = filtered
    ? `${t("Filtered Build Queue") ?? "Filtered Build Queue"} (${String(itemCount)})`
    : `${t("Build Queue") ?? "Build Queue"} (${String(itemCount)})`;

  // -------------------------------------------------------------------------
  // Pre-resolve localized labels to avoid repeated t() calls in render
  // -------------------------------------------------------------------------

  const waitingForLabel = t("WaitingFor") ?? "Waiting for ";
  const unknownTaskLabel = t("Unknown Task") ?? "Unknown Task";
  const cancelBuildLabel = t("Cancel this build") ?? "Cancel this build";
  const emptyQueueLabel =
    t("No builds in the queue.") ?? "No builds in the queue.";
  const shutdownLabel =
    t("Jenkins is going to shut down. No further builds will be performed.") ??
    "Jenkins is going to shut down. No further builds will be performed.";
  const cancelLabel = t("cancel") ?? "cancel";

  // -------------------------------------------------------------------------
  // Render
  //
  // DOM structure mirrors the <l:pane> output from pane.jelly:
  //   div.pane-frame.expanded#buildQueue
  //     div.pane-header > span.pane-header-title
  //     div.pane-content > table.pane > tbody > tr*
  //
  // Queue item row structure mirrors queue.jelly lines 72-101:
  //   tr
  //     td.pane.pane-grow  (task name link with tooltip)
  //     [td.pane w=16]     (hourglass icon if stuck — only when task readable)
  //     td.pane w=16       (cancel stop-button-link)
  // -------------------------------------------------------------------------

  return (
    <div
      className={`pane-frame ${expanded ? "expanded" : "collapsed"}`}
      id="buildQueue"
    >
      <div className="pane-header">
        <span className="pane-header-title">{title}</span>
        {/* Collapse toggle — mirrors pane.jelly collapse <a> (pane.jelly lines 55-63) */}
        <a
          className="collapse"
          href="#"
          role="button"
          aria-expanded={expanded}
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }}
        >
          <span className="icon-sm" aria-hidden="true" />
        </a>
      </div>
      <div className="pane-content">
        <table className="pane">
          <tbody>
            {/* ----------------------------------------------------------
              Quieting-down shutdown message (queue.jelly lines 50-58)
              Shown when Jenkins is in quiet-down mode (shutdown pending).
              Cancel link visible only with MANAGE permission.
            ---------------------------------------------------------- */}
            {quietingDown && (
              <tr>
                <td
                  className="pane"
                  colSpan={2}
                  style={{ whiteSpace: "normal" }}
                >
                  {shutdownLabel}
                  {hasManagePermission && (
                    <>
                      {" "}
                      <a
                        href={`${rootUrl}/cancelQuietDown`}
                        className="post"
                        onClick={handleCancelQuietDown}
                      >
                        ({cancelLabel})
                      </a>
                    </>
                  )}
                </td>
              </tr>
            )}

            {/* ----------------------------------------------------------
              Empty queue message (queue.jelly lines 61-68)
              Shown only when queue is empty AND not in quiet-down mode.
            ---------------------------------------------------------- */}
            {displayItems.length === 0 && !quietingDown && (
              <tr>
                <td className="pane" colSpan={2}>
                  {emptyQueueLabel}
                </td>
              </tr>
            )}

            {/* ----------------------------------------------------------
              Loading indicator (React-only enhancement)
              Shown during initial data fetch when no items are available.
            ---------------------------------------------------------- */}
            {isLoading && displayItems.length === 0 && (
              <tr>
                <td className="pane" colSpan={2}>
                  {isFetching ? "..." : ""}
                </td>
              </tr>
            )}

            {/* ----------------------------------------------------------
              Queue item rows (queue.jelly lines 71-102)
              Each row contains:
              1. Task name cell (td.pane.pane-grow) with link + tooltip
              2. Optional stuck indicator cell (td.pane w=16) with hourglass
              3. Cancel button cell (td.pane w=16) with stop-button-link
            ---------------------------------------------------------- */}
            {displayItems.map((item: QueueItem) => {
              // Extract the task reference with explicit QueueTask type
              // to validate the shape matches the imported interface.
              const task: QueueTask | undefined = item.task ?? undefined;

              // Determine if the task is readable (has name and URL).
              // Mirrors Jelly: h.hasPermission(item.task, item.task.READ)
              // In the REST API, items without read permission typically
              // lack task details or are excluded entirely.
              const hasTaskInfo =
                task != null && task.name != null && task.url != null;

              const tooltipText = hasTaskInfo
                ? buildItemTooltip(item, waitingForLabel)
                : "";

              const taskDisplayName = hasTaskInfo
                ? task.name
                : unknownTaskLabel;

              return (
                <tr key={item.id}>
                  {/* Task name cell */}
                  <td
                    className="pane pane-grow"
                    style={{ whiteSpace: "normal" }}
                  >
                    {hasTaskInfo && task != null ? (
                      <a
                        href={`${rootUrl}/${task.url}`}
                        className="model-link inside tl-tr"
                        title={tooltipText}
                        data-tooltip-append-to-parent="true"
                      >
                        {task.name}
                      </a>
                    ) : (
                      <span>{unknownTaskLabel}</span>
                    )}
                  </td>

                  {/* Stuck indicator cell (queue.jelly lines 83-89) */}
                  {item.stuck && hasTaskInfo && (
                    <td
                      className="pane"
                      width={16}
                      style={{
                        textAlign: "center",
                        verticalAlign: "middle",
                      }}
                    >
                      <a href={EXECUTOR_STARVATION_URL}>
                        <span
                          className="icon-sm"
                          dangerouslySetInnerHTML={{
                            __html: HOURGLASS_SVG,
                          }}
                          aria-hidden="true"
                        />
                      </a>
                    </td>
                  )}

                  {/* Cancel button cell (queue.jelly lines 96-100) */}
                  <td
                    className="pane"
                    width={16}
                    style={{
                      textAlign: "center",
                      verticalAlign: "middle",
                    }}
                  >
                    <a
                      href={`${rootUrl}/queue/cancelItem?id=${String(item.id)}`}
                      className="stop-button-link"
                      title={cancelBuildLabel}
                      data-tooltip-append-to-parent="true"
                      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                        e.preventDefault();
                        handleCancelItem(item);
                      }}
                      aria-label={`${cancelBuildLabel}: ${taskDisplayName}`}
                    >
                      <span
                        className="icon-sm"
                        dangerouslySetInnerHTML={{ __html: CLOSE }}
                        aria-hidden="true"
                      />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
