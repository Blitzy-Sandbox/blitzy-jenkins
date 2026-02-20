/**
 * BuildListTable.tsx
 *
 * React component replacing core/src/main/resources/lib/hudson/buildListTable.jelly.
 * Renders a build history table with 5 columns: Status icon (S), Build number link,
 * Time Since (relative timestamp), Status (result description or progress bar),
 * and Console output link (terminal icon).
 *
 * Auto-refreshes via React Query polling when builds are in progress, replacing
 * the legacy build-caption.js setTimeout(updateBuildCaptionIcon, 5000) pattern.
 *
 * DOM structure mirrors the Jelly output:
 *   <table class="jenkins-table {sizeClass} sortable" id="projectStatus">
 *     <thead>5 column headers</thead>
 *     <tbody>build rows</tbody>
 *   </table>
 */

import React, { useState, useMemo, useCallback } from 'react';
import BuildLink from './BuildLink';
import BuildProgressBar from './BuildProgressBar';
import { useStaplerQuery } from '@/hooks/useStaplerQuery';
import { useI18n } from '@/hooks/useI18n';
import type { Build, BallColor, Job } from '@/types/models';
import { getBaseUrl } from '@/utils/baseUrl';

/* ------------------------------------------------------------------ */
/*  Props Interface (named export per schema)                         */
/* ------------------------------------------------------------------ */

/**
 * Props for the BuildListTable component.
 *
 * @property builds          - Array of Build objects to display in the table rows.
 * @property jobUrl          - Base URL for the job (e.g. "job/my-project"), used to
 *                             construct the Stapler REST polling endpoint and build links.
 * @property refetchInterval - Polling interval in ms for auto-refresh while builds are
 *                             in progress. Defaults to 5000 (matching build-caption.js).
 */
export interface BuildListTableProps {
  builds: Build[];
  jobUrl?: string;
  refetchInterval?: number;
}

/* ------------------------------------------------------------------ */
/*  Internal Types                                                    */
/* ------------------------------------------------------------------ */

/** Response shape from the Stapler builds REST API endpoint. */
interface BuildsApiResponse {
  builds: Build[];
}

/* ------------------------------------------------------------------ */
/*  Helper Functions                                                  */
/* ------------------------------------------------------------------ */

/**
 * Maps a Build's result and building state to its BallColor icon identifier.
 * Covers all 14 BallColor variants: 6 base colours, 6 anime variants,
 * grey, and grey_anime. Matches the status icon pattern from
 * buildListTable.jelly lines 34-46.
 */
function getBallColorForBuild(build: Build): BallColor {
  const { result, building } = build;
  const suffix = building ? '_anime' : '';

  switch (result) {
    case 'SUCCESS':
      return `blue${suffix}` as BallColor;
    case 'FAILURE':
      return `red${suffix}` as BallColor;
    case 'UNSTABLE':
      return `yellow${suffix}` as BallColor;
    case 'ABORTED':
      return `aborted${suffix}` as BallColor;
    case 'NOT_BUILT':
      return `nobuilt${suffix}` as BallColor;
    default:
      return (building ? 'grey_anime' : 'grey') as BallColor;
  }
}

/**
 * Returns a human-readable description for a completed build result.
 * Used in the "Status" column for completed (non-building) builds.
 */
function getResultDescription(result: string | null): string {
  switch (result) {
    case 'SUCCESS':
      return 'Success';
    case 'FAILURE':
      return 'Failed';
    case 'UNSTABLE':
      return 'Unstable';
    case 'ABORTED':
      return 'Aborted';
    case 'NOT_BUILT':
      return 'Not built';
    default:
      return '';
  }
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 * Used alongside Build.duration in the Status column.
 */
function formatDuration(ms: number): string {
  if (ms <= 0) {
    return '';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  }
  if (minutes > 0) {
    return `${minutes} min ${seconds} sec`;
  }
  return `${seconds} sec`;
}

/**
 * Formats a timestamp as a relative time string (e.g. "2 hr ago", "3 days ago").
 * Matches Jenkins' standard relative time display in the "Time Since" column.
 */
function formatTimeSince(timestamp: number): string {
  if (!timestamp) {
    return '';
  }
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) {
    return '';
  }

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return years === 1 ? '1 yr ago' : `${years} yr ago`;
  }
  if (months > 0) {
    return months === 1 ? '1 mo ago' : `${months} mo ago`;
  }
  if (days > 0) {
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }
  if (hours > 0) {
    return hours === 1 ? '1 hr ago' : `${hours} hr ago`;
  }
  if (minutes > 0) {
    return minutes === 1 ? '1 min ago' : `${minutes} min ago`;
  }
  return seconds <= 1 ? '1 sec ago' : `${seconds} sec ago`;
}

/**
 * Derives a CSS table-size modifier class from an icon-size identifier.
 *   '16x16' → 'jenkins-table--small'
 *   '24x24' → 'jenkins-table--medium'
 *   default → '' (standard size)
 */
function getTableSizeClass(iconSizeClass: string): string {
  switch (iconSizeClass) {
    case '16x16':
      return 'jenkins-table--small';
    case '24x24':
      return 'jenkins-table--medium';
    default:
      return '';
  }
}

/* ------------------------------------------------------------------ */
/*  REST API tree query constant                                      */
/* ------------------------------------------------------------------ */

/**
 * Build fields requested from the Stapler REST API.
 * Covers all data needed for the 5 table columns plus polling metadata.
 * Accesses Build.number, Build.url, Build.result, Build.building,
 * Build.timestamp, Build.duration, Build.estimatedDuration,
 * Build.executor, and Build.actions.
 */
const BUILD_TREE_FIELDS =
  'builds[number,url,displayName,result,building,timestamp,duration,' +
  'estimatedDuration,executor[progress,likelyStuck],actions[*]]';

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * BuildListTable — Build history table with auto-refresh.
 *
 * Renders a `<table id="projectStatus" class="jenkins-table sortable">`
 * containing a row for each build. Each row displays:
 *   1. Status ball icon (S column)
 *   2. Build number link via BuildLink component (Build column)
 *   3. Relative timestamp (Time Since column)
 *   4. Result description or BuildProgressBar (Status column)
 *   5. Console output terminal icon link (Console column)
 *
 * Polls the Stapler REST API via React Query `refetchInterval` when any
 * build is currently in progress, replacing the legacy build-caption.js
 * `setTimeout(updateBuildCaptionIcon, 5000)` pattern.
 *
 * @example
 * ```tsx
 * <BuildListTable
 *   builds={job.builds}
 *   jobUrl={job.url}
 *   refetchInterval={5000}
 * />
 * ```
 */
function BuildListTable({
  builds: initialBuilds,
  jobUrl,
  refetchInterval = 5000,
}: BuildListTableProps): React.JSX.Element {
  const { t } = useI18n();
  const baseUrl = getBaseUrl();

  /**
   * Icon-size state — supports programmatic size changes from parent
   * components. Currently defaults to standard (empty) size. The Jelly
   * template supports 16x16 / 24x24 variants via its `iconSize` attr.
   */
  const [iconSizeClass] = useState<string>('');

  /* ---- Polling --------------------------------------------------- */

  /** Whether any build is currently in progress — drives polling activation. */
  const hasBuildsInProgress = useMemo(
    () => initialBuilds.some((b) => b.building),
    [initialBuilds],
  );

  /** Construct the Stapler REST endpoint URL for builds polling. */
  const pollingUrl = useMemo(() => {
    if (!jobUrl) {
      return '';
    }
    const normalized = jobUrl.startsWith('/') ? jobUrl.slice(1) : jobUrl;
    return `${baseUrl}/${normalized}/api/json?tree=${BUILD_TREE_FIELDS}`;
  }, [jobUrl, baseUrl]);

  /**
   * React Query polling for build data.
   * Active while any build is in progress; disabled when all complete.
   */
  const { data, isLoading, isFetching } = useStaplerQuery<BuildsApiResponse>({
    queryKey: ['builds', jobUrl ?? ''],
    url: pollingUrl,
    enabled: !!jobUrl && pollingUrl.length > 0,
    refetchInterval: hasBuildsInProgress ? refetchInterval : false,
    staleTime: 0,
  });

  /** Resolved builds list — polled data takes precedence over initial props. */
  const builds = useMemo(() => {
    if (data?.builds && data.builds.length > 0) {
      return data.builds;
    }
    return initialBuilds;
  }, [data, initialBuilds]);

  /* ---- Computed values ------------------------------------------- */

  /** CSS class for the icon-size variant applied to the table. */
  const tableSizeClass = useMemo(
    () => getTableSizeClass(iconSizeClass),
    [iconSizeClass],
  );

  /**
   * Minimal Job placeholder for BuildLink — enables case 3 rendering
   * (status ball icon + number link with model-link class).
   * Only the `url` field is consumed by BuildLink in this code path.
   */
  const jobForLink = useMemo((): Job | undefined => {
    if (!jobUrl) {
      return undefined;
    }
    return { url: jobUrl } as unknown as Job;
  }, [jobUrl]);

  /** Stable console-URL builder. */
  const getConsoleUrl = useCallback(
    (build: Build): string => {
      const buildPath = build.url.startsWith('/')
        ? build.url
        : `/${build.url}`;
      return `${baseUrl}${buildPath}console`;
    },
    [baseUrl],
  );

  /* ---- I18n column headers --------------------------------------- */

  const headerS = t('S') ?? 'S';
  const headerBuild = t('Build') ?? 'Build';
  const headerTimeSince = t('Time Since') ?? 'Time Since';
  const headerStatus = t('Status') ?? 'Status';
  const consoleAlt = t('Console output') ?? 'Console output';

  /* ---- Derived table className ----------------------------------- */

  const tableClassName = ['jenkins-table', tableSizeClass, 'sortable']
    .filter(Boolean)
    .join(' ');

  /* ---- Render: loading skeleton ---------------------------------- */

  if (isLoading && initialBuilds.length === 0) {
    return (
      <table
        className={tableClassName}
        id="projectStatus"
        data-icon-size-class={iconSizeClass}
      >
        <thead>
          <tr>
            <th className="jenkins-table__cell--tight">{headerS}</th>
            <th>{headerBuild}</th>
            <th>{headerTimeSince}</th>
            <th>{headerStatus}</th>
            <th
              className="jenkins-table__cell--tight"
              data-sort-disable="true"
            />
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={5}>
              <span className="jenkins-spinner" />
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  /* ---- Render: data table ---------------------------------------- */

  return (
    <table
      className={tableClassName}
      id="projectStatus"
      data-icon-size-class={iconSizeClass}
    >
      <thead>
        <tr>
          <th className="jenkins-table__cell--tight">{headerS}</th>
          <th>{headerBuild}</th>
          <th data-initial-sort-dir="up">{headerTimeSince}</th>
          <th>{headerStatus}</th>
          <th
            className="jenkins-table__cell--tight"
            data-sort-disable="true"
          />
        </tr>
      </thead>
      <tbody>
        {builds.length === 0 ? (
          <tr>
            <td colSpan={5}>{t('No builds') ?? 'No builds'}</td>
          </tr>
        ) : (
          builds.map((build) => {
            const ballColor: BallColor = getBallColorForBuild(build);
            const statusText = build.building
              ? ''
              : getResultDescription(build.result);
            const durationText =
              !build.building && build.duration > 0
                ? formatDuration(build.duration)
                : '';
            const estimatedText =
              build.building && build.estimatedDuration > 0
                ? formatDuration(build.estimatedDuration)
                : '';

            return (
              <tr
                key={build.number}
                className={
                  build.building ? 'build-row--building' : undefined
                }
              >
                {/* S — Status ball icon */}
                <td className="jenkins-table__cell--tight jenkins-table__icon">
                  <div className="jenkins-table__cell__button-wrapper">
                    <span
                      className="build-status-icon__wrapper icon-sm"
                      data-symbol={`symbol-status-${ballColor}`}
                    />
                  </div>
                </td>

                {/* Build — build number link */}
                <td>
                  {jobForLink ? (
                    <BuildLink
                      job={jobForLink}
                      build={build}
                      number={build.number}
                    />
                  ) : (
                    <a
                      href={`${baseUrl}/${build.url}`}
                      className="model-link inside"
                    >
                      #{build.number}
                    </a>
                  )}
                </td>

                {/* Time Since — relative timestamp */}
                <td data-value={String(build.timestamp)}>
                  {formatTimeSince(build.timestamp)}
                </td>

                {/* Status — result description or progress bar */}
                <td>
                  {build.building ? (
                    <BuildProgressBar
                      build={build}
                      executor={build.executor ?? undefined}
                      animate
                      tooltip={
                        estimatedText
                          ? `Estimated duration: ${estimatedText}`
                          : undefined
                      }
                    />
                  ) : (
                    <span>
                      {statusText}
                      {durationText ? ` (${durationText})` : ''}
                    </span>
                  )}
                </td>

                {/* Console — terminal icon link */}
                <td className="jenkins-table__cell--tight">
                  <a
                    href={getConsoleUrl(build)}
                    className="jenkins-table__link"
                    title={consoleAlt}
                  >
                    <span
                      className="build-status-icon__wrapper icon-sm"
                      data-symbol="symbol-terminal"
                    />
                  </a>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
      {isFetching && builds.length > 0 && (
        <tfoot>
          <tr>
            <td colSpan={5} className="jenkins-table__cell--loading">
              <span className="jenkins-spinner jenkins-spinner--small" />
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

export default BuildListTable;
