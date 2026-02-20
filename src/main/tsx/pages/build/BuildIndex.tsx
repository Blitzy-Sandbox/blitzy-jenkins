/**
 * Build Detail / Index Page Component
 *
 * Replaces `core/src/main/resources/hudson/model/Run/index.jelly` (85 lines)
 * and the companion `new-build-page.jelly` (33 lines).  Renders the primary
 * build detail page shown at `/{job}/{buildNumber}/`.
 *
 * ## Structural mapping from Jelly → React
 *
 * | Jelly source (index.jelly)            | React equivalent                        |
 * |---------------------------------------|-----------------------------------------|
 * | `<l:layout title>`                    | `<Layout title={fullDisplayName}>`      |
 * | `<st:include page="sidepanel.jelly">` | `<SidePanel>` with task links           |
 * | `<t:buildCaption>` (line 47)          | `<h1>` with `Intl.DateTimeFormat`       |
 * | `<t:editableDescription>` (line 49)   | `<EditableDescription hideButton>`      |
 * | Timing float div (lines 53-66)        | Inline-styled float div                 |
 * | `<t:artifactList>` (line 70)          | `<ArtifactList>`                        |
 * | Action summaries (lines 73-77)        | Action summary iteration                |
 * | `logKeep.jelly` (line 42-44)          | `useStaplerMutation` toggle             |
 * | builds-card 5 s poll                  | `refetchInterval: 5000` while building  |
 *
 * ## Data source
 *
 * `GET {buildUrl}api/json?tree=…` with an extensive tree parameter fetching
 * all fields required to render the build page.  While `build.building` is
 * `true` the query polls every 5 000 ms, replicating the polling pattern
 * from `src/main/js/pages/project/builds-card.js`.
 *
 * @module pages/build/BuildIndex
 */

import React, { useState, useMemo } from 'react';

import { useStaplerQuery } from '@/hooks/useStaplerQuery';
import { useStaplerMutation } from '@/hooks/useStaplerMutation';
import { useI18n } from '@/hooks/useI18n';
import { useJenkinsConfig } from '@/providers/JenkinsConfigProvider';

import Layout from '@/layout/Layout';
import SidePanel from '@/layout/SidePanel';
import MainPanel from '@/layout/MainPanel';

import ArtifactList from '@/hudson/ArtifactList';
import BuildProgressBar from '@/hudson/BuildProgressBar';
import EditableDescription from '@/hudson/EditableDescription';

import type {
  Build,
  Artifact,
  ResultStatus,
  Action,
  ChangeSetList,
  ExecutorInfo,
} from '@/types/models';

// =============================================================================
// Exported Interfaces
// =============================================================================

/**
 * Props accepted by the {@link BuildIndex} component.
 *
 * At least one of `buildUrl` **or** the `jobName` + `buildNumber` pair must
 * be provided so that the component can resolve the Stapler REST endpoint.
 */
export interface BuildIndexProps {
  /** Job name or URL path segment (e.g. `"my-pipeline"`) */
  jobName?: string;
  /** Sequential build number */
  buildNumber?: number;
  /**
   * Pre-resolved build URL.  When supplied the component uses it directly
   * instead of constructing a URL from `jobName` / `buildNumber`.
   */
  buildUrl?: string;
}

/**
 * Extended build data returned by the Stapler REST API.
 *
 * Augments the base {@link Build} interface with server-computed fields that
 * are available from the Run Java object but not part of the core
 * `@ExportedBean` annotations.
 */
export interface BuildData extends Build {
  /** Short display name for the build (e.g. "#42") — inherited from Build */
  displayName: string;
  /** Full display name including project (e.g. "MyProject #42") */
  fullDisplayName?: string;
  /** Optional build description */
  description: string | null;
  /** Whether the build is currently in progress */
  building: boolean;
  /** Build result status, or null while in progress */
  result: ResultStatus | null;
  /** Build start timestamp (epoch ms) */
  timestamp: number;
  /** Actual build duration in milliseconds */
  duration: number;
  /** Estimated build duration in milliseconds */
  estimatedDuration: number;
  /** Build page URL */
  url: string;
  /** Artifacts produced by this build */
  artifacts: Artifact[];
  /** Actions attached to this build */
  actions: Action[];
  /** Changeset lists for this build */
  changeSets?: ChangeSetList[];
  /** Executor running this build, or null if completed */
  executor: ExecutorInfo | null;
  /** Whether the build log is marked for permanent retention */
  keepLog: boolean;
  /** Sequential build number */
  number: number;
  /**
   * Server-computed relative timestamp string (e.g. "5 min ago").
   * Falls back to client-side computation when absent.
   */
  timestampString?: string;
  /**
   * Server-computed human-readable duration string (e.g. "1 min 23 sec").
   * Falls back to client-side computation when absent.
   */
  durationString?: string;
  /** Name of the node (agent) the build ran on, empty string for built-in */
  builtOn?: string;
}

// =============================================================================
// Tree Parameter — fields requested from Stapler REST API
// =============================================================================

/**
 * Stapler REST API `tree` parameter requesting exactly the fields needed
 * to render the build detail page.  Mirrors the data consumed by
 * `index.jelly` lines 35–80.
 */
const BUILD_API_TREE = [
  'displayName',
  'fullDisplayName',
  'description',
  'building',
  'result',
  'timestamp',
  'duration',
  'estimatedDuration',
  'url',
  'artifacts[displayPath,fileName,relativePath]',
  'actions[_class]',
  'changeSets[kind,items[commitId,msg,author[fullName]]]',
  'executor[progress,likelyStuck,number,idle,currentExecutable[number,url]]',
  'keepLog',
  'number',
  'builtOn',
  'timestampString',
  'durationString',
].join(',');

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a millisecond duration into a human-readable string.
 *
 * Replicates the output of `hudson.Util.getTimeSpanString()` which Jelly
 * templates use for `${it.durationString}`.
 *
 * @example formatDuration(83000) // "1 min 23 sec"
 */
function formatDuration(ms: number): string {
  if (ms < 0) { return '0 ms'; }
  if (ms < 1000) { return `${ms} ms`; }

  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds} sec`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0
      ? `${minutes} min ${seconds} sec`
      : `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0
      ? `${hours} hr ${remainingMinutes} min`
      : `${hours} hr`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0
    ? `${days} day${days !== 1 ? 's' : ''} ${remainingHours} hr`
    : `${days} day${days !== 1 ? 's' : ''}`;
}

/**
 * Compute a relative time string from a timestamp.
 *
 * Replicates the output of `hudson.Functions.getTimeSpanString()` which
 * Jelly templates use for `${it.timestampString}`.
 *
 * @example getRelativeTimeString(Date.now() - 300_000) // "5 min"
 */
function getRelativeTimeString(timestamp: number): string {
  const elapsed = Date.now() - timestamp;
  return formatDuration(Math.max(0, elapsed));
}

/**
 * Render a human-readable summary for a known build action type.
 *
 * In the Jelly version each action's `summary.jelly` template is included
 * via `<st:include page="summary.jelly" from="${a}" optional="true" />`.
 * Since those templates are server-side Java-backed views, the React
 * equivalent handles known action `_class` values and silently skips
 * unknown types (matching the Jelly `optional="true"` semantics).
 */
function getActionLabel(actionClass: string): string | null {
  const classMap: Record<string, string> = {
    'hudson.model.CauseAction': 'Build Cause',
    'hudson.tasks.junit.TestResultAction': 'Test Result',
    'hudson.tasks.test.AggregatedTestResultAction': 'Aggregated Test Result',
    'hudson.plugins.git.GitTagAction': 'Git Build Data',
    'hudson.scm.SCMRevisionState$None': '',
  };
  return classMap[actionClass] ?? null;
}

/**
 * Extract the parent job URL from a build URL.
 *
 * @example extractParentUrl("/job/my-project/42/") // "job/my-project/"
 * @example extractParentUrl("http://jenkins/job/my-project/42/") // "job/my-project/"
 */
function extractParentUrl(buildUrl: string): string {
  // Normalise: strip protocol+host if present, then remove trailing slash
  const path = buildUrl
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/\/+$/, '');

  // Remove the last path segment (build number)
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash <= 0) { return ''; }

  // Return without leading slash to match Jenkins relative URL convention
  const parent = path.substring(0, lastSlash + 1);
  return parent.startsWith('/') ? parent.substring(1) : parent;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Build detail / index page.
 *
 * This is the **primary** page rendered at `/{job}/{buildNumber}/`.
 * It fetches build data from the Stapler REST API and renders:
 *
 * - Build caption with formatted date
 * - Editable description (if user has UPDATE permission)
 * - Timing information (started ago / being executed / took)
 * - Artifact list
 * - Action summaries
 * - Build progress bar (for in-progress builds)
 *
 * Side panel navigation provides links to Console Output, Changes,
 * Build Artifacts, Delete Build, and Previous / Next Build.
 */
export default function BuildIndex({
  jobName,
  buildNumber,
  buildUrl: buildUrlProp,
}: BuildIndexProps): React.JSX.Element {
  // ---------------------------------------------------------------------------
  //  Context hooks
  // ---------------------------------------------------------------------------
  const { baseUrl } = useJenkinsConfig();
  const { t } = useI18n();

  // ---------------------------------------------------------------------------
  //  URL resolution
  // ---------------------------------------------------------------------------

  /** Fully resolved build URL used for all API calls and link generation. */
  const buildUrl = useMemo<string>(() => {
    if (buildUrlProp) {
      // Ensure trailing slash for consistent URL concatenation
      return buildUrlProp.endsWith('/') ? buildUrlProp : `${buildUrlProp}/`;
    }
    if (jobName != null && buildNumber != null) {
      const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      return `${base}job/${encodeURIComponent(jobName)}/${buildNumber}/`;
    }
    return '';
  }, [buildUrlProp, jobName, buildNumber, baseUrl]);

  /** Parent job URL for build-time-trend link and navigation. */
  const parentUrl = useMemo<string>(() => {
    if (jobName != null) {
      return `job/${encodeURIComponent(jobName)}/`;
    }
    return extractParentUrl(buildUrl);
  }, [jobName, buildUrl]);

  // ---------------------------------------------------------------------------
  //  Build data query with conditional polling
  // ---------------------------------------------------------------------------

  /**
   * Tracks whether the build is currently in progress so that the query
   * polls every 5 000 ms.  Updated during render (not in useEffect) to
   * avoid the cascading-render lint violation while still correctly
   * adjusting the polling interval when `build.building` changes.
   */
  const [isPolling, setIsPolling] = useState<boolean>(false);

  const {
    data: build,
    isLoading,
    isError,
    error,
  } = useStaplerQuery<BuildData>({
    queryKey: ['build', buildUrl],
    url: `${buildUrl}api/json?tree=${BUILD_API_TREE}`,
    enabled: buildUrl.length > 0,
    refetchInterval: isPolling ? 5000 : false,
    staleTime: 0,
  });

  // Adjust polling during render — recommended React 19 pattern for
  // derived state (replaces the useEffect + setState anti-pattern).
  const buildIsBuilding = build?.building ?? false;
  if (buildIsBuilding !== isPolling) {
    setIsPolling(buildIsBuilding);
  }

  // ---------------------------------------------------------------------------
  //  Log-keep toggle mutation
  //  Mirrors logKeep.jelly inclusion at index.jelly lines 42-44
  // ---------------------------------------------------------------------------

  const { mutate: toggleLogKeep, isPending: isToggleLogKeepPending } =
    useStaplerMutation<void, void>({
      url: `${buildUrl}toggleLogKeep`,
    });

  /** Optimistic override for the keep-log flag. `null` means "use server value". */
  const [keepLogOverride, setKeepLogOverride] = useState<boolean | null>(null);
  const keepLog = keepLogOverride ?? build?.keepLog ?? false;

  const handleToggleLogKeep = (): void => {
    const newValue = !keepLog;
    setKeepLogOverride(newValue);
    toggleLogKeep(undefined as void, {
      onError: () => setKeepLogOverride(null),
      onSettled: () => setKeepLogOverride(null),
    });
  };

  // ---------------------------------------------------------------------------
  //  Derived display values (memoised)
  // ---------------------------------------------------------------------------

  /** Stable timestamp value extracted for useMemo dependency alignment. */
  const buildTimestamp = build?.timestamp ?? 0;

  /**
   * Locale-aware formatted date matching `<i:formatDate type="both"
   * dateStyle="medium" timeStyle="medium"/>` from index.jelly line 47.
   */
  const formattedDate = useMemo<string>(() => {
    if (!buildTimestamp) { return ''; }
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date(buildTimestamp));
    } catch {
      return new Date(buildTimestamp).toLocaleString();
    }
  }, [buildTimestamp]);

  /** ISO-8601 timestamp for the `<time>` element's `dateTime` attribute. */
  const isoTimestamp = useMemo<string>(() => {
    if (!buildTimestamp) { return ''; }
    return new Date(buildTimestamp).toISOString();
  }, [buildTimestamp]);

  /**
   * "Started X ago" display string.  Prefers the server-supplied
   * `timestampString` and falls back to client-side computation.
   */
  const startedAgoText = useMemo<string>(() => {
    if (!build) { return ''; }
    const relative = build.timestampString ?? getRelativeTimeString(build.timestamp);
    const pattern = t('startedAgo');
    if (pattern) {
      return pattern.replace('{0}', relative);
    }
    return `Started ${relative} ago`;
  }, [build, t]);

  /**
   * "Took X" or "Being executed for X" timing string.
   */
  const timingText = useMemo<{ label: string; link: boolean }>(() => {
    if (!build) { return { label: '', link: false }; }

    if (build.building) {
      const elapsed = getRelativeTimeString(build.timestamp);
      const pattern = t('beingExecuted');
      const label = pattern
        ? pattern.replace('{0}', elapsed)
        : `Being executed for ${elapsed}`;
      return { label, link: false };
    }

    const dur = build.durationString ?? formatDuration(build.duration);
    return { label: dur, link: true };
  }, [build, t]);

  // ---------------------------------------------------------------------------
  //  Render helpers
  // ---------------------------------------------------------------------------

  /** Page title following the `{fullDisplayName} - Jenkins` pattern. */
  const pageTitle = build?.fullDisplayName ?? build?.displayName ?? '';

  // ---------------------------------------------------------------------------
  //  Loading state
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <Layout title="Loading…">
        <MainPanel>
          <div
            className="jenkins-spinner"
            role="status"
            aria-label={t('Loading') ?? 'Loading build data…'}
          />
        </MainPanel>
      </Layout>
    );
  }

  // ---------------------------------------------------------------------------
  //  Error state
  // ---------------------------------------------------------------------------

  if (isError) {
    return (
      <Layout title="Error">
        <MainPanel>
          <div className="jenkins-!-alert" role="alert">
            <p>
              {t('Failed to load build data') ?? 'Failed to load build data'}
              {error?.message ? `: ${error.message}` : ''}
            </p>
          </div>
        </MainPanel>
      </Layout>
    );
  }

  // ---------------------------------------------------------------------------
  //  No-data state (e.g. build deleted or invalid URL)
  // ---------------------------------------------------------------------------

  if (!build) {
    return (
      <Layout title="Build Not Found">
        <MainPanel>
          <div className="jenkins-!-alert" role="alert">
            <p>{t('Build not found') ?? 'Build not found'}</p>
          </div>
        </MainPanel>
      </Layout>
    );
  }

  // ---------------------------------------------------------------------------
  //  Side panel — build navigation task links
  //  Mirrors <st:include page="sidepanel.jelly"/> at index.jelly line 36
  // ---------------------------------------------------------------------------

  const sidePanelContent = (
    <SidePanel>
      <div id="tasks">
        {/* Back to Project */}
        <div className="task">
          <a href={`${baseUrl}/${parentUrl}`} className="task-link">
            <span className="task-link-text">
              {t('Back to Project') ?? 'Back to Project'}
            </span>
          </a>
        </div>

        {/* Console Output */}
        <div className="task">
          <a href={`${buildUrl}console`} className="task-link">
            <span className="task-link-text">
              {t('Console Output') ?? 'Console Output'}
            </span>
          </a>
        </div>

        {/* Changes — shown if changeSets exist */}
        {build.changeSets && build.changeSets.length > 0 && (
          <div className="task">
            <a href={`${buildUrl}changes`} className="task-link">
              <span className="task-link-text">
                {t('Changes') ?? 'Changes'}
              </span>
            </a>
          </div>
        )}

        {/* Build Artifacts — shown if artifacts exist */}
        {build.artifacts.length > 0 && (
          <div className="task">
            <a href={`${buildUrl}artifact/`} className="task-link">
              <span className="task-link-text">
                {t('Build Artifacts') ?? 'Build Artifacts'}
              </span>
            </a>
          </div>
        )}

        {/* Delete Build */}
        <div className="task">
          <a href={`${buildUrl}confirmDelete`} className="task-link">
            <span className="task-link-text">
              {t('Delete Build') ?? 'Delete Build'}
            </span>
          </a>
        </div>

        {/* Previous Build */}
        {build.number > 1 && (
          <div className="task">
            <a
              href={`${baseUrl}/${parentUrl}${build.number - 1}/`}
              className="task-link"
            >
              <span className="task-link-text">
                {t('Previous Build') ?? 'Previous Build'}
              </span>
            </a>
          </div>
        )}

        {/* Next Build */}
        <div className="task">
          <a
            href={`${baseUrl}/${parentUrl}${build.number + 1}/`}
            className="task-link"
          >
            <span className="task-link-text">
              {t('Next Build') ?? 'Next Build'}
            </span>
          </a>
        </div>
      </div>
    </SidePanel>
  );

  // ---------------------------------------------------------------------------
  //  Main render — mirrors index.jelly lines 35-83
  // ---------------------------------------------------------------------------

  return (
    <Layout title={pageTitle} sidePanel={sidePanelContent}>
      <MainPanel>
        {/* ---------------------------------------------------------------- */}
        {/*  Controls: Keep-log toggle                                       */}
        {/*  Mirrors index.jelly lines 39-45 (logKeep.jelly)                 */}
        {/* ---------------------------------------------------------------- */}
        <div className="build-controls">
          <button
            type="button"
            className="jenkins-button jenkins-button--tertiary"
            onClick={handleToggleLogKeep}
            disabled={isToggleLogKeepPending}
            aria-busy={isToggleLogKeepPending || undefined}
          >
            {keepLog
              ? (t("Don't keep this build forever") ??
                "Don't keep this build forever")
              : (t('Keep this build forever') ?? 'Keep this build forever')}
          </button>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/*  Build caption with formatted date                               */}
        {/*  Mirrors index.jelly line 47:                                    */}
        {/*    <t:buildCaption> ${it.displayName} (<i:formatDate …/>) …      */}
        {/* ---------------------------------------------------------------- */}
        <div className="build-caption page-header">
          <h1>
            {build.displayName}
            {' ('}
            <time dateTime={isoTimestamp}>{formattedDate}</time>
            {')'}
          </h1>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/*  Editable description                                            */}
        {/*  Mirrors index.jelly lines 49-51:                                */}
        {/*    <t:editableDescription permission="${it.UPDATE}"               */}
        {/*      hideButton="true"/>                                         */}
        {/* ---------------------------------------------------------------- */}
        <div>
          <EditableDescription
            description={build.description ?? undefined}
            hasPermission
            submissionUrl={`${buildUrl}submitDescription`}
            hideButton
          />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/*  Timing information (right-aligned floating div)                 */}
        {/*  Mirrors index.jelly lines 53-66 — inline styles preserved       */}
        {/*  exactly for visual parity with Jelly rendering.                 */}
        {/* ---------------------------------------------------------------- */}
        <div
          style={{
            float: 'right',
            zIndex: 1,
            position: 'relative',
            marginLeft: '1em',
          }}
        >
          <div style={{ marginTop: '1em' }}>{startedAgoText}</div>
          <div>
            {build.building ? (
              <span>{timingText.label}</span>
            ) : (
              <span>
                {t('Took') ?? 'Took'}{' '}
                <a href={`${baseUrl}/${parentUrl}buildTimeTrend`}>
                  {timingText.label}
                </a>
              </span>
            )}
            {/* Built-on node information */}
            {build.builtOn && (
              <span>
                {' '}
                {t('on') ?? 'on'}{' '}
                <a href={`${baseUrl}/computer/${encodeURIComponent(build.builtOn)}`}>
                  {build.builtOn}
                </a>
              </span>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/*  Artifacts table                                                 */}
        {/*  Mirrors index.jelly line 70:                                    */}
        {/*    <t:artifactList build="${it}" caption="${%Build Artifacts}"/>   */}
        {/* ---------------------------------------------------------------- */}
        <ArtifactList
          build={build}
          caption={t('Build Artifacts') ?? 'Build Artifacts'}
          buildUrl={buildUrl}
        />

        {/* ---------------------------------------------------------------- */}
        {/*  Action summaries                                                */}
        {/*  Mirrors index.jelly lines 73-77:                                */}
        {/*    <j:forEach var="a" items="${it.allActions}">                   */}
        {/*      <st:include page="summary.jelly" optional="true"/>          */}
        {/*    </j:forEach>                                                  */}
        {/* ---------------------------------------------------------------- */}
        {build.actions && build.actions.length > 0 && (
          <div className="build-action-summaries">
            {build.actions
              .filter((action) => {
                if (!action._class) { return false; }
                return getActionLabel(action._class) !== null;
              })
              .map((action, index) => {
                const label = getActionLabel(action._class ?? '');
                if (!label) { return null; }
                return (
                  <div
                    key={`action-${action._class}-${index}`}
                    className="build-action-summary"
                  >
                    {label}
                  </div>
                );
              })}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/*  Build progress bar (in-progress builds only)                    */}
        {/*  Uses BuildProgressBar component with executor data for          */}
        {/*  animated progress indication.                                   */}
        {/* ---------------------------------------------------------------- */}
        {build.building && (
          <BuildProgressBar build={build} executor={build.executor} />
        )}
      </MainPanel>
    </Layout>
  );
}
