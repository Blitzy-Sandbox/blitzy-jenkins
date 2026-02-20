/**
 * SystemInformation — System Information Diagnostics Page
 *
 * React 19 component replacing the vanilla JavaScript in
 * `src/main/js/pages/manage-jenkins/system-information/index.js` (18 lines).
 *
 * The source file manages the Jenkins diagnostics heap memory graph on the
 * Manage Jenkins → System Information page. It:
 *   1. Reads `document.getElementById("main-panel").offsetWidth - 30` for
 *      the graph image width (source line 1)
 *   2. Sets `imageHeight = 500` as a constant (source line 2)
 *   3. Sets `aspectRatio` on `#graph-host` to prevent layout shift (line 7)
 *   4. Listens to `#timespan-select` change events and inserts an `<img>`
 *      pointing to the Stapler endpoint
 *      `/jenkins.diagnosis.MemoryUsageMonitorAction/heap/graph` (lines 10-13)
 *   5. Dispatches a synthetic change event to render the initial graph (line 17)
 *
 * This React replacement:
 *   - Uses `useState` for `selectedTimespan` and `imageWidth` state
 *   - Uses `useEffect` for the one-time width calculation on mount
 *   - Constructs the graph URL declaratively from state — the initial render
 *     naturally produces the same result as the synthetic `dispatchEvent`
 *   - Preserves ALL DOM IDs (`graph-host`, `timespan-select`) for CSS compat
 *   - Preserves the EXACT Stapler REST endpoint path and query parameters
 *   - Uses `useJenkinsConfig()` instead of `document.head.dataset.rooturl`
 *   - Uses `useI18n()` for localized timespan option labels
 *
 * No jQuery. No Handlebars. No behaviorShim. No window-handle.
 *
 * @module SystemInformation
 */

import { useState, useEffect } from 'react';

import { useJenkinsConfig } from '@/providers/JenkinsConfigProvider';
import { useI18n } from '@/hooks/useI18n';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Fixed graph image height in pixels.
 * EXACT match to source line 2: `const imageHeight = 500;`
 */
const IMAGE_HEIGHT = 500;

/**
 * Pixel margin subtracted from the main panel width to derive graph width.
 * EXACT match to source line 1: `document.getElementById("main-panel").offsetWidth - 30`
 */
const WIDTH_MARGIN = 30;

/**
 * Stapler REST endpoint path for the heap memory usage graph.
 * EXACT match to source line 13 URL path segment.
 */
const GRAPH_ENDPOINT_PATH =
  '/jenkins.diagnosis.MemoryUsageMonitorAction/heap/graph';

// ---------------------------------------------------------------------------
// Timespan Options
// ---------------------------------------------------------------------------

/**
 * Available timespan options for the heap memory graph.
 * Each entry maps a Stapler `type` query parameter value to a localization
 * key and a fallback English label. The `value` is sent as `?type={value}`
 * in the graph endpoint URL.
 */
const TIMESPAN_OPTIONS: ReadonlyArray<{
  /** Value sent as the `type` query parameter to the Stapler endpoint */
  value: string;
  /** i18n key for lookup via `t()` — data attribute on the `#i18n` element */
  i18nKey: string;
  /** Fallback label when i18n key is not available */
  fallback: string;
}> = [
  { value: 'min', i18nKey: 'short', fallback: 'Short' },
  { value: 'hour', i18nKey: 'medium', fallback: 'Medium' },
  { value: 'day', i18nKey: 'long', fallback: 'Long' },
];

// ---------------------------------------------------------------------------
// Props Interface
// ---------------------------------------------------------------------------

/**
 * Props for the {@link SystemInformation} component.
 */
interface SystemInformationProps {
  /** Optional CSS class name applied to the root wrapper element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * System Information diagnostics page component.
 *
 * Renders a timespan dropdown and a heap memory usage graph image sourced
 * from the Jenkins Stapler REST endpoint. The graph dimensions are derived
 * from the `#main-panel` element width on mount, and the image URL is
 * constructed declaratively from component state.
 *
 * @param props - Component props
 * @returns The system information diagnostics UI
 */
export function SystemInformation({ className }: SystemInformationProps) {
  // -------------------------------------------------------------------------
  // Context hooks
  // -------------------------------------------------------------------------

  /** Jenkins base URL — replaces `document.head.dataset.rooturl` (source line 11) */
  const { baseUrl } = useJenkinsConfig();

  /** Localization hook — `t()` for localized timespan option labels */
  const { t } = useI18n();

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /**
   * Currently selected timespan value sent as the `type` query parameter.
   * Default "min" represents the initial dropdown option.
   * Replaces `timespanSelect.value` at source line 12.
   */
  const [selectedTimespan, setSelectedTimespan] = useState<string>('min');

  /**
   * Calculated graph image width in pixels.
   * Replaces source line 1: `document.getElementById("main-panel").offsetWidth - 30`
   *
   * Uses a lazy initializer to compute the width ONCE during initial render,
   * matching the source which calculates at module load time and caches the
   * value as a constant. The `- 30` margin is a deliberate calculation from
   * the source and is preserved exactly.
   *
   * The main-panel element is server-rendered by the Jelly shell and is
   * present in the DOM before the React component mounts.
   */
  const [imageWidth, setImageWidth] = useState<number>(() => {
    const mainPanel = document.getElementById('main-panel');
    return mainPanel ? mainPanel.offsetWidth - WIDTH_MARGIN : 0;
  });

  // -------------------------------------------------------------------------
  // Fallback width calculation effect
  // -------------------------------------------------------------------------

  /**
   * Handle the edge case where `#main-panel` is not in the DOM during
   * the initial synchronous render (e.g., late mounting or SSR hydration).
   * If the lazy initializer returned 0, this effect schedules a deferred
   * recalculation via `requestAnimationFrame` so that the graph still
   * renders correctly once the DOM element becomes available.
   *
   * The `requestAnimationFrame` wrapper ensures setState is called
   * asynchronously (outside the synchronous effect body), satisfying
   * the react-hooks/set-state-in-effect lint rule.
   */
  useEffect(() => {
    if (imageWidth > 0) {
      return;
    }
    const frameId = requestAnimationFrame(() => {
      const mainPanel = document.getElementById('main-panel');
      if (mainPanel) {
        setImageWidth(mainPanel.offsetWidth - WIDTH_MARGIN);
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [imageWidth]);

  // -------------------------------------------------------------------------
  // Graph URL construction
  // -------------------------------------------------------------------------

  /**
   * Standard resolution graph URL.
   * EXACT match to source line 13 URL structure:
   * `${rootURL}/jenkins.diagnosis.MemoryUsageMonitorAction/heap/graph?type=${type}&width=${imageWidth}&height=${imageHeight}`
   */
  const graphUrl = `${baseUrl}${GRAPH_ENDPOINT_PATH}?type=${selectedTimespan}&width=${imageWidth}&height=${IMAGE_HEIGHT}`;

  /**
   * 2x resolution graph URL for HiDPI/Retina displays.
   * EXACT match to source line 13 srcset URL: same URL with `&scale=2` appended.
   */
  const graphUrl2x = `${graphUrl}&scale=2`;

  // -------------------------------------------------------------------------
  // Event handler
  // -------------------------------------------------------------------------

  /**
   * Handle timespan dropdown selection change.
   * Replaces source lines 10-13 `addEventListener("change", ...)` handler.
   * React's declarative rendering automatically updates the graph image when
   * `selectedTimespan` state changes — no imperative innerHTML replacement needed.
   */
  const handleTimespanChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ): void => {
    setSelectedTimespan(event.target.value);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className={className}>
      {/* Timespan select dropdown — preserves id="timespan-select" for CSS compat */}
      {/* Replaces source line 4 DOM element and lines 10-14 event listener */}
      <select
        id="timespan-select"
        value={selectedTimespan}
        onChange={handleTimespanChange}
      >
        {TIMESPAN_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.i18nKey) ?? option.fallback}
          </option>
        ))}
      </select>

      {/* Graph host container — renders only when width is calculated */}
      {/* The initial render with imageWidth > 0 replaces source line 17: */}
      {/* `timespanSelect.dispatchEvent(new Event("change"))` — React's */}
      {/* declarative rendering achieves the same result without a synthetic event */}
      {imageWidth > 0 && (
        <div
          id="graph-host"
          style={{ aspectRatio: `${imageWidth} / ${IMAGE_HEIGHT}` }}
        >
          {/* Graph image — EXACT attribute match to source line 13 */}
          <img
            src={graphUrl}
            srcSet={`${graphUrl2x} 2x`}
            loading="lazy"
            style={{ width: '100%' }}
            alt="Memory usage graph"
            className="jenkins-graph-card"
          />
        </div>
      )}
    </div>
  );
}

export default SystemInformation;
