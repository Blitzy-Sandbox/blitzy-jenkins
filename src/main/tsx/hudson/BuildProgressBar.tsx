/**
 * BuildProgressBar — Animated build progress bar component.
 *
 * Replaces:
 * - core/src/main/resources/lib/hudson/buildProgressBar.jelly
 *   (Jelly template rendering <t:progressBar> with executor timing info)
 * - core/src/main/resources/lib/hudson/build-caption.js
 *   (Companion script polling every 5s via setTimeout for live progress updates)
 *
 * This React component renders a clickable progress bar link that indicates
 * build progress, with optional live polling via React Query (replacing the
 * imperative setTimeout + DOM mutation pattern from build-caption.js).
 *
 * DOM output mirrors the Jelly <t:progressBar> tag:
 *   <a href="{consoleUrl}" class="app-progress-bar [app-progress-bar--error]"
 *      title="{tooltip}" data-tooltip-template="{template}">
 *     <span style="width: {progress}%" />
 *   </a>
 *
 * @module hudson/BuildProgressBar
 */

import { useState, useEffect } from 'react';
import { useStaplerQuery } from '@/hooks/useStaplerQuery';
import { useI18n } from '@/hooks/useI18n';
import type { Build, ExecutorInfo } from '@/types/models';
import { getBaseUrl } from '@/utils/baseUrl';

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

/**
 * Shape of the JSON response when polling the build status endpoint.
 * Fetched from: {build.url}api/json?tree=building,executor[progress,likelyStuck]
 *
 * This replaces reading X-Building, X-Progress, X-Executor-Stuck response
 * headers from build-caption.js and instead uses the standard Stapler REST
 * JSON API.
 */
interface BuildProgressPollResponse {
  /** Whether the build is still in progress */
  building: boolean;
  /** Executor data — null when the build has finished or executor is detached */
  executor: {
    progress: number;
    likelyStuck: boolean;
  } | null;
}

// ---------------------------------------------------------------------------
// Props Interface
// ---------------------------------------------------------------------------

/**
 * Props for the BuildProgressBar component.
 *
 * Mirrors the Jelly <t:buildProgressBar> tag attributes from
 * buildProgressBar.jelly with additional React-specific options.
 */
export interface BuildProgressBarProps {
  /** The build in progress — must have a `url` property for API polling and console link construction */
  build: Build;

  /**
   * The executor running the build.
   * Falls back to `build.executor` when not provided (matching Jelly:
   * `<j:set var="executor" value="${attrs.executor ?: build.executor}"/>`).
   * When null, the progress bar renders in indeterminate mode.
   */
  executor?: ExecutorInfo | null;

  /**
   * Whether to enable live polling for progress updates.
   * When true, uses React Query with refetchInterval of 5000ms,
   * replacing build-caption.js's `setTimeout(updateBuildCaptionIcon, 5000)`.
   */
  animate?: boolean;

  /**
   * Current progress percentage (0–100).
   * Overrides `executor.progress` when explicitly provided.
   * A value of -1 or undefined indicates indeterminate progress.
   */
  progress?: number;

  /**
   * Static tooltip text for the progress bar.
   * When provided, takes precedence over the dynamically computed tooltip.
   * Example: "Started 2 min 30 sec ago\nEstimated remaining time: 1 min 15 sec"
   */
  tooltip?: string;

  /**
   * Whether the executor is stuck (likely stuck).
   * Overrides `executor.likelyStuck` when explicitly provided.
   * When true, renders the `app-progress-bar--error` CSS class (red bar).
   */
  isStuck?: boolean;

  /**
   * Link target for the progress bar.
   * Defaults to `{rootURL}/{build.url}console` when not provided,
   * matching the Jelly pattern on line 44 of buildProgressBar.jelly.
   */
  href?: string;

  /**
   * Template string for dynamic tooltip updates with `%0` (runtime)
   * and `%1` (remaining time) placeholders.
   * Mirrors the Jelly `tooltipTemplate="${%text('%0','%1')}"` pattern
   * and the build-caption.js `data-tooltip-template` replacement logic.
   */
  tooltipTemplate?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders an animated build progress bar as a clickable link to the console.
 *
 * Behavior mirrors buildProgressBar.jelly + build-caption.js:
 * - When executor data is available: shows a determinate progress bar at
 *   `executor.progress`% width with tooltip and stuck detection
 * - When executor is null: shows an indeterminate progress bar (no width)
 * - When `animate` is true: polls the build's REST API every 5s for live
 *   progress updates, replacing the setTimeout polling in build-caption.js
 * - Stuck detection adds `app-progress-bar--error` class for red styling
 *
 * State is derived directly from props and polled data during rendering
 * rather than synced via useEffect, following React 19 best practices
 * ("You Might Not Need an Effect").
 *
 * @example
 * ```tsx
 * <BuildProgressBar
 *   build={currentBuild}
 *   animate={true}
 * />
 * ```
 */
export default function BuildProgressBar({
  build,
  executor: executorProp,
  animate = false,
  progress: progressProp,
  tooltip: tooltipProp,
  isStuck: isStuckProp,
  href: hrefProp,
  tooltipTemplate: tooltipTemplateProp,
}: BuildProgressBarProps): React.JSX.Element {
  const { t } = useI18n();

  // -----------------------------------------------------------------------
  // Cache base URL via lazy state initializer — reads
  // document.head.dataset.rooturl once on mount, avoiding repeated DOM
  // reads on every render cycle.
  // -----------------------------------------------------------------------
  const [baseUrl] = useState<string>(() => getBaseUrl());

  // -----------------------------------------------------------------------
  // Resolve executor — prop overrides build.executor (mirrors Jelly line 30:
  // <j:set var="executor" value="${attrs.executor ?: build.executor}"/>)
  // -----------------------------------------------------------------------
  const resolvedExecutor: ExecutorInfo | null | undefined =
    executorProp !== undefined ? executorProp : build.executor;

  // -----------------------------------------------------------------------
  // Determine if live polling should be active
  // Only poll when animate is requested AND the build is reported as running.
  // The `build.building` field may be undefined for builds passed without
  // full data — treat undefined as potentially running.
  // -----------------------------------------------------------------------
  const shouldPoll: boolean = animate && build.building !== false;

  // -----------------------------------------------------------------------
  // Poll build status via Stapler REST JSON API
  // Replaces: build-caption.js `setTimeout(updateBuildCaptionIcon, 5000)`
  // which fetched a statusUrl and read X-Building / X-Progress /
  // X-Executor-Stuck response headers. Instead, we fetch JSON from the
  // build's API endpoint.
  // -----------------------------------------------------------------------
  const { data: polledData, isLoading } = useStaplerQuery<BuildProgressPollResponse>({
    url: `${build.url}api/json?tree=building,executor[progress,likelyStuck]`,
    queryKey: ['buildProgress', build.url],
    refetchInterval: shouldPoll ? 5000 : false,
    enabled: shouldPoll,
    staleTime: 0,
  });

  // -----------------------------------------------------------------------
  // Derive progress directly from available data sources.
  // Priority: explicit prop > polled executor data > build completion >
  //           resolved executor > indeterminate (-1).
  //
  // This replaces the useEffect+useState sync pattern with direct
  // derivation during render, following React 19 "You Might Not Need an
  // Effect" best practice. The value recalculates on each render when
  // polledData or props change.
  //
  // Replaces: build-caption.js `progressBarDone.style.width = progress + "%"`
  // -----------------------------------------------------------------------
  const currentProgress: number = (() => {
    if (progressProp !== undefined) {
      return progressProp;
    }
    if (polledData?.executor) {
      return polledData.executor.progress;
    }
    if (polledData && !polledData.building) {
      return 100;
    }
    return resolvedExecutor?.progress ?? -1;
  })();

  // -----------------------------------------------------------------------
  // Derive stuck state directly from available data sources.
  // Priority: explicit prop > polled executor data > build completion >
  //           resolved executor > not stuck.
  //
  // Replaces: build-caption.js
  //   `progressBar.classList.add/remove("app-progress-bar--error")`
  // -----------------------------------------------------------------------
  const currentStuck: boolean = (() => {
    if (isStuckProp !== undefined) {
      return isStuckProp;
    }
    if (polledData?.executor) {
      return polledData.executor.likelyStuck;
    }
    if (polledData && !polledData.building) {
      return false;
    }
    return resolvedExecutor?.likelyStuck ?? false;
  })();

  // -----------------------------------------------------------------------
  // Effect: Announce build completion to assistive technologies.
  //
  // When polling detects that a build has finished (building === false),
  // update the Jenkins global screen reader announcements region.
  // This IS external DOM manipulation — the aria-live announcer element
  // lives outside this component's tree and constitutes a legitimate
  // synchronization with an external system (the accessibility layer).
  //
  // The effect is conditioned on `polledData` transitions so it fires
  // only when the build actually completes, not on every render.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (polledData && !polledData.building) {
      const announcer = document.getElementById('jenkins-sr-announcements');
      if (announcer) {
        announcer.textContent = t('buildComplete') || 'Build completed';
      }
    }
  }, [polledData, t]);

  // -----------------------------------------------------------------------
  // Compute tooltip text
  // Mirrors the Jelly i18n pattern:
  //   tooltip="${%text(executor.timestampString,executor.estimatedRemainingTime)}"
  //
  // Uses the `t()` function from useI18n to fetch the localized template
  // "Started {0} ago\nEstimated remaining time: {1}".
  //
  // For dynamic tooltip updates, the tooltipTemplate with %0/%1 placeholders
  // is passed as a data attribute for external enhancement by plugins or
  // other integration layers.
  // -----------------------------------------------------------------------
  const computeTooltip = (): string | undefined => {
    // Explicit tooltip prop takes highest precedence
    if (tooltipProp !== undefined && tooltipProp !== null) {
      return tooltipProp;
    }

    // If no executor data is available, no tooltip is shown
    // (mirrors Jelly <j:otherwise> branch which renders <t:progressBar>
    // without tooltip when executor is null)
    if (!resolvedExecutor && !polledData?.executor) {
      return undefined;
    }

    // Attempt to use the i18n template
    const template = t('text');
    if (template) {
      return template;
    }

    // Fallback: no localized template available
    return undefined;
  };

  // -----------------------------------------------------------------------
  // Compute href — defaults to the build's console URL
  // Mirrors Jelly:
  //   href="${h.getConsoleUrl(build) ?: (rootURL + '/' + build.url + 'console')}"
  // -----------------------------------------------------------------------
  const computedHref: string = hrefProp || `${baseUrl}/${build.url}console`;

  // -----------------------------------------------------------------------
  // Determine if progress is indeterminate (no executor data, pos = -1)
  // In the Jelly, when executor is null, <t:progressBar> renders without
  // a pos attribute, resulting in no width on the inner span.
  // -----------------------------------------------------------------------
  const isIndeterminate: boolean = currentProgress < 0;

  // -----------------------------------------------------------------------
  // Build CSS class name
  // Base class: "app-progress-bar" (always present)
  // Error class: "app-progress-bar--error" (when stuck)
  // Mirrors build-caption.js:
  //   progressBar.classList.add/remove("app-progress-bar--error")
  // -----------------------------------------------------------------------
  const className: string = currentStuck
    ? 'app-progress-bar app-progress-bar--error'
    : 'app-progress-bar';

  // -----------------------------------------------------------------------
  // Progress width style — only applied when progress is determinate
  // Replaces: build-caption.js `progressBarDone.style.width = progress + "%"`
  // CSS transitions on the width property handle smooth animation.
  // -----------------------------------------------------------------------
  const progressStyle: React.CSSProperties = isIndeterminate
    ? {}
    : { width: `${currentProgress}%` };

  // -----------------------------------------------------------------------
  // Compute the resolved tooltip and tooltipTemplate data attribute
  // -----------------------------------------------------------------------
  const resolvedTooltip = computeTooltip();
  const dataTooltipTemplate =
    tooltipTemplateProp !== undefined && tooltipTemplateProp !== null
      ? tooltipTemplateProp
      : undefined;

  // -----------------------------------------------------------------------
  // Render — mirrors the Jelly <t:progressBar> DOM output:
  //   <a href="..." class="app-progress-bar [app-progress-bar--error]"
  //      tooltip="..." data-tooltip-template="...">
  //     <span style="width: N%;" />
  //   </a>
  //
  // The `isLoading` flag from useStaplerQuery indicates whether the initial
  // poll fetch is in-flight. While loading, the component renders with
  // prop/executor-derived values. The `aria-busy` attribute communicates
  // loading state to assistive technologies.
  //
  // ARIA role="progressbar" with aria-valuenow/min/max provides
  // accessible progress semantics for screen readers.
  // -----------------------------------------------------------------------
  return (
    <a
      href={computedHref}
      className={className}
      title={resolvedTooltip}
      data-tooltip-template={dataTooltipTemplate}
      aria-busy={isLoading || undefined}
      role="progressbar"
      aria-valuenow={isIndeterminate ? undefined : currentProgress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={progressStyle} />
    </a>
  );
}
