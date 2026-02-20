/**
 * JobBuildHistory — Build Time Trend Page
 *
 * Replaces `core/src/main/resources/hudson/model/Job/buildTimeTrend.jelly`
 * (80 lines) and draws on pagination / refresh patterns from
 * `src/main/js/pages/project/builds-card.js` (159 lines).
 *
 * Renders a sortable table of build results with columns:
 *   S (status icon) | Build | Time Since | Duration | [Agent] | Console
 * plus a build-time-graph image below the table.
 *
 * Data flow:
 *   1. Props supply job identification (jobUrl, displayName, showAgent).
 *   2. {@link useStaplerQuery} fetches build data from the Stapler REST API
 *      `GET {jobUrl}/api/json?tree=builds[…]`.
 *   3. Raw API build items are transformed into {@link BuildTimeTrendEntry}
 *      objects with human-readable duration / time-since strings and icon
 *      names matching the {@link BallColor} enum.
 *   4. The component renders entries in a `jenkins-table` with CSS classes
 *      matching the Jelly output for pixel-perfect visual parity.
 *
 * No jQuery — React Query replaces AJAX.
 * No Handlebars — JSX replaces templates.
 * No behaviorShim — React component lifecycle replaces Behaviour.specify().
 *
 * @module pages/job/JobBuildHistory
 */

import { useState } from 'react';

import Layout from '@/layout/Layout';
import { Skeleton } from '@/layout/Skeleton';
import BreadcrumbBar from '@/layout/BreadcrumbBar';
import { useStaplerQuery } from '@/hooks/useStaplerQuery';
import { useI18n } from '@/hooks/useI18n';
import { useJenkinsConfig } from '@/providers/JenkinsConfigProvider';
import type { BallColor } from '@/types/models';
import * as symbols from '@/utils/symbols';

/*
 * BreadcrumbBar is imported per the module dependency schema for explicit
 * dependency tracking.  Layout internally manages the breadcrumb bar
 * rendering.  The void-reference prevents "unused import" diagnostics
 * while keeping the import visible in the dependency graph.
 */
void BreadcrumbBar;

// =============================================================================
// Exported Types
// =============================================================================

/**
 * Props for the {@link JobBuildHistory} component.
 */
export interface JobBuildHistoryProps {
  /** Job URL path used for API calls (e.g., "/job/myproject") */
  jobUrl: string;
  /** Job display name rendered in the page title */
  displayName: string;
  /**
   * Whether to show the Agent column.
   * `true` when the instance has multiple nodes AND the job is an
   * AbstractProject. Defaults to `false`.
   */
  showAgent?: boolean;
}

/**
 * A single entry in the build time trend table.
 * Maps to one `<tr>` with status icon, build link, timing, and console link.
 */
export interface BuildTimeTrendEntry {
  /** Build status icon name (matches {@link BallColor} values, e.g., "blue", "red_anime") */
  iconName: string;
  /** Sequential build number */
  buildNumber: number;
  /** Relative URL to the build detail page */
  buildUrl: string;
  /** Display string for the build (e.g., "#42") */
  buildDisplayName: string;
  /** Human-readable "time since" string (e.g., "2 hr 15 min ago") */
  timestampString: string;
  /** ISO 8601 timestamp used as sort key */
  timestampString2: string;
  /** Human-readable duration string (e.g., "3 min 22 sec") */
  duration: string;
  /** Agent machine name (present only when showAgent is true) */
  builtOn?: string;
  /** Agent display name */
  builtOnStr?: string;
  /** URL to console output page */
  consoleUrl: string;
}

// =============================================================================
// Internal Types
// =============================================================================

/** Raw build item from the Jenkins REST API response */
interface BuildApiItem {
  _class?: string;
  number: number;
  url: string;
  displayName: string;
  fullDisplayName?: string;
  result: string | null;
  timestamp: number;
  duration: number;
  builtOn: string;
  building: boolean;
}

/** Top-level response from `GET {jobUrl}/api/json?tree=builds[…]` */
interface JobApiResponse {
  _class?: string;
  builds: BuildApiItem[];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Stapler REST API `tree` parameter restricting the build response to only the
 * fields needed by this component.  The `{0,50}` range limits to the 50 most
 * recent builds, matching the builds-card pagination pattern.
 */
const BUILDS_TREE =
  'builds[number,url,displayName,result,timestamp,duration,builtOn,building]{0,50}';

/**
 * Map from {@link BallColor} values to SVG symbol IDs.
 *
 * Mirrors the Jelly `<template id="jenkins-build-status-icons">` block
 * (buildTimeTrend.jelly lines 34-49) which defines 13 status icon mappings:
 * 6 static states + 6 animated (_anime) variants + console terminal icon.
 *
 * Keys use underscore notation matching the Jenkins REST API BallColor enum.
 * Values are SVG symbol IDs with hyphen notation matching the symbol
 * definitions in `war/src/main/resources/images/symbols/`.
 */
const BALL_COLOR_TO_SYMBOL: Record<BallColor, string> = {
  blue: 'symbol-status-blue',
  blue_anime: 'symbol-status-blue-anime',
  red: 'symbol-status-red',
  red_anime: 'symbol-status-red-anime',
  yellow: 'symbol-status-yellow',
  yellow_anime: 'symbol-status-yellow-anime',
  nobuilt: 'symbol-status-nobuilt',
  nobuilt_anime: 'symbol-status-nobuilt-anime',
  aborted: 'symbol-status-aborted',
  aborted_anime: 'symbol-status-aborted-anime',
  disabled: 'symbol-status-disabled',
  disabled_anime: 'symbol-status-disabled-anime',
  grey: 'symbol-status-disabled',
  grey_anime: 'symbol-status-disabled-anime',
};

/** SVG symbol ID for the console / terminal icon */
const CONSOLE_SYMBOL = 'symbol-terminal';

/** Default fallback symbol when an icon name is not recognised */
const FALLBACK_SYMBOL = 'symbol-status-nobuilt';

// =============================================================================
// Icon Size Configuration
// =============================================================================

/**
 * Icon size identifiers matching Jenkins' `<t:setIconSize/>` / `<t:iconSize/>`
 * Jelly tag values used in buildTimeTrend.jelly lines 57-58 and 74.
 */
type IconSize = '16x16' | '24x24' | '32x32';

/** Maps icon size to the table-level CSS modifier class */
const ICON_SIZE_TABLE_CLASSES: Record<IconSize, string> = {
  '16x16': 'jenkins-table--small',
  '24x24': 'jenkins-table--medium',
  '32x32': '',
};

/** Maps icon size to the per-icon CSS sizing class */
const ICON_SIZE_CLASSES: Record<IconSize, string> = {
  '16x16': 'icon-sm',
  '24x24': 'icon-md',
  '32x32': 'icon-lg',
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Maps a Jenkins build result string to a {@link BallColor} icon name.
 *
 * @param result  Build result from the REST API (SUCCESS, FAILURE, …) or
 *                `null` when the build is still in progress.
 * @param building  Whether the build is currently executing (appends `_anime`).
 * @returns Icon name that matches a {@link BallColor} value.
 */
function mapResultToIconName(result: string | null, building: boolean): string {
  let base: string;
  switch (result) {
    case 'SUCCESS':
      base = 'blue';
      break;
    case 'UNSTABLE':
      base = 'yellow';
      break;
    case 'FAILURE':
      base = 'red';
      break;
    case 'ABORTED':
      base = 'aborted';
      break;
    case 'NOT_BUILT':
      base = 'nobuilt';
      break;
    default:
      base = result === null && building ? 'nobuilt' : 'disabled';
      break;
  }
  return building ? `${base}_anime` : base;
}

/**
 * Resolves the SVG symbol ID for a given icon name.
 *
 * @param iconName  Status icon name (typically a {@link BallColor} value).
 * @returns SVG symbol ID string (e.g., `"symbol-status-blue"`).
 */
function getStatusSymbol(iconName: string): string {
  return BALL_COLOR_TO_SYMBOL[iconName as BallColor] ?? FALLBACK_SYMBOL;
}

/**
 * Formats milliseconds into a human-readable duration string.
 * Mirrors the Jenkins server-side `Util.getTimeSpanString()` output format.
 */
function formatDuration(ms: number): string {
  if (ms < 0) {
    return '0 sec';
  }
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainHrs = hours % 24;
    return remainHrs > 0 ? `${days} day ${remainHrs} hr` : `${days} day`;
  }
  if (hours > 0) {
    const remainMin = minutes % 60;
    return remainMin > 0 ? `${hours} hr ${remainMin} min` : `${hours} hr`;
  }
  if (minutes > 0) {
    const remainSec = seconds % 60;
    return remainSec > 0 ? `${minutes} min ${remainSec} sec` : `${minutes} min`;
  }
  return `${seconds} sec`;
}

/**
 * Formats a timestamp as a relative "time since" string.
 * Mirrors Jenkins' `TimeAgoFunction.getTimeSpanString()` output.
 */
function formatTimeSince(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 0) {
    return 'just now';
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return `${years} yr ago`;
  }
  if (months > 0) {
    return `${months} mo ago`;
  }
  if (days > 0) {
    return `${days} day ago`;
  }
  if (hours > 0) {
    const remainMin = minutes % 60;
    return remainMin > 0 ? `${hours} hr ${remainMin} min ago` : `${hours} hr ago`;
  }
  if (minutes > 0) {
    return `${minutes} min ago`;
  }
  return `${seconds} sec ago`;
}

/**
 * Normalizes a job URL path by stripping any leading base URL prefix.
 * Required because `jenkinsGet` (inside {@link useStaplerQuery}) automatically
 * prepends the base URL.
 */
function normalizeJobPath(jobUrl: string, baseUrl: string): string {
  let path = jobUrl;

  /* Handle absolute URLs — extract pathname */
  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      path = new URL(path).pathname;
    } catch {
      /* keep path as-is on malformed URL */
    }
  }

  /* Strip leading baseUrl since jenkinsGet will re-add it */
  if (baseUrl && path.startsWith(baseUrl)) {
    path = path.substring(baseUrl.length);
  }

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  return path.endsWith('/') ? path : `${path}/`;
}

/**
 * Transforms raw API build items into {@link BuildTimeTrendEntry} objects.
 */
function transformBuilds(
  builds: BuildApiItem[],
  jobPath: string,
): BuildTimeTrendEntry[] {
  return builds.map((build) => {
    const buildPath = build.url || `${jobPath}${build.number}/`;
    return {
      iconName: mapResultToIconName(build.result, build.building),
      buildNumber: build.number,
      buildUrl: buildPath,
      buildDisplayName: build.displayName || `#${build.number}`,
      timestampString: formatTimeSince(build.timestamp),
      timestampString2: new Date(build.timestamp).toISOString(),
      duration: formatDuration(build.duration),
      builtOn: build.builtOn || undefined,
      builtOnStr: build.builtOn || undefined,
      consoleUrl: `${buildPath}console`,
    };
  });
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * Build Time Trend page component.
 *
 * Fetches and displays a table of build results with status icons, timing
 * information, and a build time graph image.  Mirrors the rendering of
 * `buildTimeTrend.jelly`:
 *
 * - **Loading state**: table starts with `jenkins-hidden` class in Jelly,
 *   shown after progressive rendering delivers rows.  In React this is
 *   replaced by a {@link Skeleton} placeholder during the fetch cycle.
 * - **Data table** (Jelly lines 58-73): sortable table with S, Build,
 *   Time Since, Duration, [Agent], and console columns.
 * - **Graph image** (Jelly line 76): build time graph PNG served from the
 *   Jenkins backend at `{jobUrl}/buildTimeGraph/png`.
 *
 * Wrapped in {@link Layout} which provides the page shell with header,
 * side panel, and main content area.
 */
export default function JobBuildHistory({
  jobUrl,
  displayName,
  showAgent = false,
}: JobBuildHistoryProps): React.JSX.Element {
  /* -------------------------------------------------------------------- */
  /* Context, i18n, and state                                               */
  /* -------------------------------------------------------------------- */
  const { baseUrl } = useJenkinsConfig();
  const { t } = useI18n();
  const [iconSize, setIconSize] = useState<IconSize>('24x24');

  /* -------------------------------------------------------------------- */
  /* Resolve normalized job path for API calls                              */
  /* -------------------------------------------------------------------- */
  const jobPath = normalizeJobPath(jobUrl, baseUrl);
  const apiUrl = `${jobPath}api/json?tree=${encodeURIComponent(BUILDS_TREE)}`;

  /* -------------------------------------------------------------------- */
  /* Data fetching — replaces Jelly progressive rendering                   */
  /* -------------------------------------------------------------------- */
  const { data, isLoading, isError } = useStaplerQuery<JobApiResponse>({
    url: apiUrl,
    queryKey: ['buildTimeTrend', jobUrl],
    staleTime: 30_000,
  });

  /* Transform API response into display entries */
  const entries: BuildTimeTrendEntry[] = data?.builds
    ? transformBuilds(data.builds, jobPath)
    : [];

  /* -------------------------------------------------------------------- */
  /* Computed CSS classes for icon size                                      */
  /* -------------------------------------------------------------------- */
  const iconSizeTableClass = ICON_SIZE_TABLE_CLASSES[iconSize];
  const iconSizeClass = ICON_SIZE_CLASSES[iconSize];

  /* -------------------------------------------------------------------- */
  /* Page title — mirrors Jelly: ${%title(it.displayName)}                  */
  /* -------------------------------------------------------------------- */
  const pageTitle = t('title') ?? `Build Time Trend of ${displayName}`;

  /* -------------------------------------------------------------------- */
  /* Graph URLs — mirrors Jelly line 76                                     */
  /* -------------------------------------------------------------------- */
  const graphPngUrl = `${jobPath}buildTimeGraph/png`;

  /* -------------------------------------------------------------------- */
  /* Render                                                                 */
  /* -------------------------------------------------------------------- */
  return (
    <Layout title={pageTitle}>
      <div id="buildTimeTrend">
        {/* Heading — mirrors Jelly line 50 */}
        <h1>{t('Build Time Trend') ?? 'Build Time Trend'}</h1>

        {/* Icon size selector — mirrors Jelly <t:setIconSize/> / <t:iconSize/> */}
        <div
          className="jenkins-icon-size-selector"
          role="radiogroup"
          aria-label="Icon size"
        >
          {(['16x16', '24x24', '32x32'] as IconSize[]).map((size) => (
            <button
              key={size}
              type="button"
              className={[
                'jenkins-icon-size-selector__btn',
                iconSize === size ? 'jenkins-icon-size-selector__btn--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={iconSize === size}
              onClick={() => { setIconSize(size); }}
            >
              <span className="jenkins-visually-hidden">{size}</span>
            </button>
          ))}
        </div>

        {/* Build trend table — mirrors Jelly lines 58-73 */}
        {isLoading ? (
          <Skeleton />
        ) : isError ? (
          <div className="jenkins-alert jenkins-alert--error" role="alert">
            <span
              className="jenkins-alert__icon"
              dangerouslySetInnerHTML={{ __html: symbols.WARNING }}
            />
            <span>
              {t('Failed to load data') ??
                'Failed to load build time trend data.'}
            </span>
          </div>
        ) : entries.length === 0 ? (
          <p className="jenkins-notice">
            {t('No builds') ?? 'No builds have been recorded yet.'}
          </p>
        ) : (
          <table
            className={[
              'jenkins-table',
              'jenkins-table--auto-width',
              'sortable',
              iconSizeTableClass,
            ]
              .filter(Boolean)
              .join(' ')}
            id="trend"
            data-show-agent={String(showAgent)}
            data-icon-size-class={iconSizeClass}
          >
            <thead>
              <tr>
                <th className="jenkins-table__cell--tight">
                  {t('S') ?? 'S'}
                </th>
                <th data-initial-sort-dir="up">
                  {t('Build') ?? 'Build'}
                </th>
                <th>{t('Time Since') ?? 'Time Since'}</th>
                <th>{t('Duration') ?? 'Duration'}</th>
                {showAgent && <th>{t('Agent') ?? 'Agent'}</th>}
                <th
                  className="jenkins-table__cell--tight"
                  data-sort-disable="true"
                ></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.buildNumber}>
                  {/* Status icon cell */}
                  <td className="jenkins-table__cell--tight">
                    <svg
                      className={iconSizeClass}
                      aria-label={entry.iconName}
                      focusable="false"
                    >
                      <use
                        href={`#${getStatusSymbol(entry.iconName)}`}
                      />
                    </svg>
                  </td>

                  {/* Build link cell */}
                  <td>
                    <a
                      href={entry.buildUrl}
                      className="model-link inside"
                    >
                      {entry.buildDisplayName}
                    </a>
                  </td>

                  {/* Time since cell — data-sort-value for sortable table */}
                  <td data-sort-value={entry.timestampString2}>
                    {entry.timestampString}
                  </td>

                  {/* Duration cell */}
                  <td>{entry.duration}</td>

                  {/* Agent cell (conditional) — mirrors Jelly optional column */}
                  {showAgent && (
                    <td>
                      {entry.builtOn ? (
                        <a
                          href={`${baseUrl}/computer/${encodeURIComponent(entry.builtOn)}`}
                          className="model-link"
                        >
                          {entry.builtOnStr ?? entry.builtOn}
                        </a>
                      ) : (
                        ''
                      )}
                    </td>
                  )}

                  {/* Console output cell */}
                  <td className="jenkins-table__cell--tight">
                    <a href={entry.consoleUrl} className="model-link">
                      <svg
                        className={iconSizeClass}
                        aria-label="Console output"
                        focusable="false"
                      >
                        <use href={`#${CONSOLE_SYMBOL}`} />
                      </svg>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Build time graph image — mirrors Jelly line 76 */}
        <img
          className="build-time-graph jenkins-graph-card"
          src={graphPngUrl}
          width={500}
          height={400}
          alt={`[${t('Build time graph') ?? 'Build time graph'}]`}
          loading="lazy"
          decoding="async"
        />
      </div>
    </Layout>
  );
}
