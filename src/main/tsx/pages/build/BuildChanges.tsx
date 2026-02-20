/**
 * BuildChanges — Build Changelog / Changes View
 *
 * Replaces `core/src/main/resources/hudson/model/AbstractBuild/changes.jelly`
 * (56 lines). Renders the SCM changelog associated with a build, showing
 * commit messages, authors, and affected files. This is a page-level
 * component mounted when a user navigates to `/{job}/{buildNumber}/changes`.
 *
 * Data flow:
 *   1. Props supply build identification (jobName + buildNumber, or buildUrl).
 *   2. {@link useStaplerQuery} fetches the build model from the Stapler REST
 *      API with a `tree` parameter restricting the payload to changeSet data.
 *   3. The component renders either:
 *      - A `jenkins-card` containing all changeSet entries (changes exist), or
 *      - A `jenkins-notice` with a console-log link (no changes detected).
 *
 * The two-path rendering mirrors the Jelly `<j:choose>` at lines 38-53 of
 * the source template.
 *
 * No jQuery — React Query replaces AJAX.
 * No Handlebars — JSX replaces templates.
 * No behaviorShim — React component lifecycle replaces `Behaviour.specify()`.
 *
 * @module pages/build/BuildChanges
 */

import { useMemo } from 'react';

import Layout from '@/layout/Layout';
import { SidePanel } from '@/layout/SidePanel';
import { MainPanel } from '@/layout/MainPanel';
import { useStaplerQuery } from '@/hooks/useStaplerQuery';
import { useI18n } from '@/hooks/useI18n';
import { useJenkinsConfig } from '@/providers/JenkinsConfigProvider';
import type {
  Build,
  ChangeSetList,
  ChangeSetItem,
  UserInfo,
} from '@/types/models';

/*
 * Layout internally composes SidePanel and MainPanel (see Layout.tsx lines
 * 240-250). We import them here per the module dependency schema for explicit
 * dependency tracking. The void-references below prevent "unused import"
 * diagnostics while keeping the imports visible in the dependency graph.
 */
void SidePanel;
void MainPanel;

/* ========================================================================= */
/*  Constants                                                                 */
/* ========================================================================= */

/**
 * Stapler REST API `tree` parameter restricting the response to changeSet
 * data, build display name, and build URL.  Minimizes payload by requesting
 * only the fields rendered by this view.
 *
 * Replicates the server-side data binding from changes.jelly line 36:
 *   `<j:set var="changeSets" value="${it.object.changeSets}" />`
 */
const TREE_PARAM =
  'changeSets[kind,items[commitId,msg,author[fullName,absoluteUrl],affectedPaths,timestamp]],displayName,url';

/**
 * Git commit SHA abbreviation length.  Standard 7-character prefix provides
 * sufficient uniqueness for most repositories.
 */
const GIT_COMMIT_ABBREV_LENGTH = 7;

/* ========================================================================= */
/*  Exported Props Interface                                                  */
/* ========================================================================= */

/**
 * Props for the {@link BuildChanges} component.
 *
 * Supply either a `buildUrl` for direct API access **or** a
 * `jobName` + `buildNumber` pair to have the component construct the
 * endpoint URL.  When both are provided, `buildUrl` takes precedence.
 */
export interface BuildChangesProps {
  /** Job name (or URL path segment) used to construct the build API endpoint */
  jobName?: string;
  /** Sequential build number within the job */
  buildNumber?: number;
  /** Pre-resolved build URL path for API calls (takes precedence over jobName/buildNumber) */
  buildUrl?: string;
}

/* ========================================================================= */
/*  Internal Helpers                                                          */
/* ========================================================================= */

/**
 * Resolves a build path **relative to the Jenkins root**, suitable for
 * {@link useStaplerQuery} (which internally prepends the base URL).
 *
 * Handles three scenarios:
 *   1. `buildUrl` is an absolute URL (http/https) → extracts pathname,
 *      strips the base-URL prefix that `jenkinsGet` would re-add.
 *   2. `buildUrl` is already a relative path → strips leading baseUrl.
 *   3. Neither supplied → constructs from `jobName` + `buildNumber`.
 */
function resolveBuildPath(
  props: BuildChangesProps,
  baseUrl: string,
): string {
  if (props.buildUrl) {
    let path = props.buildUrl;

    /* Absolute URL → extract pathname */
    if (path.startsWith('http://') || path.startsWith('https://')) {
      try {
        path = new URL(path).pathname;
      } catch {
        /* keep path as-is on malformed URL */
      }
    }

    /* Strip leading baseUrl since jenkinsGet prepends it */
    if (baseUrl && path.startsWith(baseUrl)) {
      path = path.substring(baseUrl.length);
    }

    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    return path.endsWith('/') ? path : `${path}/`;
  }

  /* Construct from job name + build number */
  const encodedJob = encodeURIComponent(props.jobName ?? '');
  return `/job/${encodedJob}/${String(props.buildNumber ?? 0)}/`;
}

/**
 * Abbreviates a VCS commit identifier for display.
 * For Git repositories the 40-character SHA is truncated to 7 characters.
 * Other SCM kinds return the identifier unchanged.
 */
function abbreviateCommitId(commitId: string, kind: string): string {
  if (kind === 'git' && commitId.length > GIT_COMMIT_ABBREV_LENGTH) {
    return commitId.substring(0, GIT_COMMIT_ABBREV_LENGTH);
  }
  return commitId;
}

/**
 * Formats a millisecond-epoch timestamp into a locale-aware date/time string.
 * Returns an empty string for falsy timestamps.
 */
function formatTimestamp(timestamp: number | undefined): string {
  if (!timestamp) {
    return '';
  }
  return new Date(timestamp).toLocaleString();
}

/* ========================================================================= */
/*  Internal Sub-Component: single changeset entry                            */
/* ========================================================================= */

/**
 * Renders a single changeset entry (commit) within the changes card.
 *
 * Replaces the inline rendering that
 * `<st:include page="index.jelly" it="${changeSet}" />` delegated to each
 * SCM's `index.jelly` in changes.jelly line 43.
 */
function ChangeSetEntryView({
  item,
  kind,
}: {
  item: ChangeSetItem;
  kind: string;
}): React.JSX.Element {
  const author: UserInfo = item.author;
  const commitId: string = item.commitId ?? '';
  const affectedPaths: string[] = item.affectedPaths ?? [];
  const timestamp: number | undefined = item.timestamp;

  return (
    <div className="change">
      {/* Commit ID — abbreviated for git, full for other SCMs */}
      {commitId !== '' && (
        <div className="change-commit-id">
          <code>{abbreviateCommitId(commitId, kind)}</code>
        </div>
      )}

      {/* Commit message */}
      <div className="change-message">{item.msg}</div>

      {/* Author — linked to profile page when URL is available */}
      <div className="change-author">
        {author.absoluteUrl ? (
          <a href={author.absoluteUrl}>{author.fullName}</a>
        ) : (
          <span>{author.fullName}</span>
        )}
        {timestamp ? (
          <time dateTime={new Date(timestamp).toISOString()}>
            {' — '}
            {formatTimestamp(timestamp)}
          </time>
        ) : null}
      </div>

      {/* Affected file paths */}
      {affectedPaths.length > 0 && (
        <div className="change-paths">
          <ul>
            {affectedPaths.map((filePath: string) => (
              <li key={filePath}>{filePath}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ========================================================================= */
/*  Main Component (default export)                                           */
/* ========================================================================= */

/**
 * Build Changelog / Changes page component.
 *
 * Fetches and displays SCM changesets associated with a Jenkins build.
 * Mirrors the rendering logic of `changes.jelly`:
 *
 *  - **changeSets exist** (lines 39–46): each changeSet's items are rendered
 *    inside a `jenkins-card > jenkins-card__content` container.
 *  - **no changeSets** (lines 48–52): a `jenkins-notice` is rendered with
 *    the title "Failed to determine" and a link to the console log.
 *
 * Wrapped in {@link Layout} which internally composes {@link SidePanel} and
 * {@link MainPanel}, replicating the `<l:run-subpage>` Jelly layout.
 */
export default function BuildChanges({
  jobName,
  buildNumber,
  buildUrl,
}: BuildChangesProps): React.JSX.Element {
  /* ------------------------------------------------------------------ */
  /*  Context and i18n                                                    */
  /* ------------------------------------------------------------------ */
  const { baseUrl } = useJenkinsConfig();
  const { t } = useI18n();

  /* ------------------------------------------------------------------ */
  /*  Resolve paths for API request and console link                      */
  /* ------------------------------------------------------------------ */
  const buildPath = resolveBuildPath({ jobName, buildNumber, buildUrl }, baseUrl);
  const apiUrl = `${buildPath}api/json?tree=${encodeURIComponent(TREE_PARAM)}`;

  /*
   * Console URL — mirrors Jelly `h.getConsoleUrl(it.object)` which
   * resolves to `{buildUrl}console`.  We prepend baseUrl because this
   * is an `<a href>` navigated by the browser (not by jenkinsGet).
   */
  const consoleUrl = `${baseUrl}${buildPath}console`;

  /* ------------------------------------------------------------------ */
  /*  Data fetching                                                       */
  /*  Replaces Jelly server-side data binding (changes.jelly line 36):   */
  /*    <j:set var="changeSets" value="${it.object.changeSets}" />        */
  /* ------------------------------------------------------------------ */
  const { data, isLoading, isError } = useStaplerQuery<Build>({
    url: apiUrl,
    queryKey: ['build-changes', buildUrl ?? `${jobName ?? ''}-${String(buildNumber ?? '')}`],
    enabled: !!(buildUrl || (jobName && buildNumber)),
  });

  /* ------------------------------------------------------------------ */
  /*  Memoised changeSet extraction — filters out empty sets              */
  /* ------------------------------------------------------------------ */
  const changeSets: ChangeSetList[] = useMemo(() => {
    if (!data?.changeSets) {
      return [];
    }
    return data.changeSets.filter(
      (cs: ChangeSetList) => cs.items && cs.items.length > 0,
    );
  }, [data]);

  const hasChanges = changeSets.length > 0;
  const displayName: string = data?.displayName ?? '';

  /* Localised strings — mirrors Jelly ${%key} patterns */
  const changesLabel = t('Changes') ?? 'Changes';
  const failedToDetMsg = t('Failed to determine') ?? 'Failed to determine';
  const logLinkText = t('log') ?? 'log';

  const pageTitle = displayName
    ? `${displayName} ${changesLabel}`
    : changesLabel;

  /* ------------------------------------------------------------------ */
  /*  Side navigation content (passed to Layout → SidePanel)              */
  /* ------------------------------------------------------------------ */
  const sideNavContent = (
    <nav aria-label="Build navigation">
      {/* Build-level navigation links are injected by Layout/SidePanel */}
    </nav>
  );

  /* ------------------------------------------------------------------ */
  /*  Render                                                              */
  /* ------------------------------------------------------------------ */
  return (
    <Layout title={pageTitle} type="two-column" sidePanel={sideNavContent}>
      {/* Loading state */}
      {isLoading && (
        <div
          className="jenkins-spinner"
          role="status"
          aria-label={`${changesLabel} loading`}
        >
          <span className="jenkins-visually-hidden">Loading…</span>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="jenkins-notice jenkins-notice--error" role="alert">
          <div className="jenkins-notice__content">
            <p>{t('Failed to load changes') ?? 'Failed to load changes'}</p>
          </div>
        </div>
      )}

      {/* Main content — rendered only after data arrives without error */}
      {!isLoading && !isError && (
        <>
          {hasChanges ? (
            /*
             * Changes exist — render inside jenkins-card.
             * Mirrors changes.jelly lines 39-46:
             *   <div class="jenkins-card">
             *     <div class="jenkins-card__content">
             *       <j:forEach var="changeSet" items="${changeSets}">
             *         <st:include page="index.jelly" it="${changeSet}" />
             *       </j:forEach>
             *     </div>
             *   </div>
             */
            <div className="jenkins-card">
              <div className="jenkins-card__content">
                {changeSets.map(
                  (changeSet: ChangeSetList, csIndex: number) => (
                    <div
                      key={`changeset-${changeSet.kind}-${String(csIndex)}`}
                      className="changeset-container"
                    >
                      {changeSet.items.map(
                        (item: ChangeSetItem, itemIndex: number) => (
                          <ChangeSetEntryView
                            key={
                              item.commitId ?? `item-${String(itemIndex)}`
                            }
                            item={item}
                            kind={changeSet.kind}
                          />
                        ),
                      )}
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : (
            /*
             * No changes — render notice with console-log link.
             * Mirrors changes.jelly lines 48-52:
             *   <l:notice icon="${it.iconFileName}"
             *             title="${%Failed to determine}">
             *     <a href="${h.getConsoleUrl(it.object)}">${%log}</a>
             *   </l:notice>
             */
            <div className="jenkins-notice" role="status">
              <span className="jenkins-notice__icon" aria-hidden="true">
                {/* Info-circle icon matching Jenkins notice pattern */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 512 512"
                  fill="currentColor"
                  className="svg-icon"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm0 110c23.2 0 42 18.8 42 42s-18.8 42-42 42-42-18.8-42-42 18.8-42 42-42zm56 254c0 6.6-5.4 12-12 12h-88c-6.6 0-12-5.4-12-12v-24c0-6.6 5.4-12 12-12h12v-64h-12c-6.6 0-12-5.4-12-12v-24c0-6.6 5.4-12 12-12h64c6.6 0 12 5.4 12 12v100h12c6.6 0 12 5.4 12 12v24z" />
                </svg>
              </span>
              <div className="jenkins-notice__content">
                <h3>{failedToDetMsg}</h3>
                <a href={consoleUrl}>{logLinkText}</a>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
