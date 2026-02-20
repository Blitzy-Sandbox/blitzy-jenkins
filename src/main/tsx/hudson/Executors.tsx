/**
 * Executors — Build Executor Status Panel Component
 *
 * Replaces:
 * - core/src/main/resources/lib/hudson/executors.jelly (230 lines)
 * - core/src/main/resources/lib/hudson/widget-refresh.js (17 lines)
 *
 * Renders the executor status pane showing:
 * - Computer captions with online/offline/connecting status icons
 * - Executor rows with task links, progress bars, and stop buttons
 * - Collapsible pane header with server-side toggle persistence
 * - Auto-refresh via React Query polling (5-second interval)
 *
 * DOM structure and CSS class names match the Jelly template output
 * exactly to preserve visual parity with the existing Jenkins UI.
 *
 * Auto-refresh replaces the widget-refresh.js Behaviour.specify()
 * pattern that periodically called refreshPart('executors', url).
 *
 * @module hudson/Executors
 */

import React, { useState, useCallback } from 'react';
import BuildProgressBar from './BuildProgressBar';
import { useStaplerQuery } from '@/hooks/useStaplerQuery';
import { useStaplerMutation } from '@/hooks/useStaplerMutation';
import { useI18n } from '@/hooks/useI18n';
import type {
  Computer,
  ExecutorInfo,
  ExecutableInfo,
  ComputerSet,
  Build,
} from '@/types/models';
import { CHEVRON_DOWN } from '@/utils/symbols';
import { getBaseUrl } from '@/utils/baseUrl';

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Display executor entry combining executor data with display metadata.
 * Mirrors Java Computer.DisplayExecutor inner class used in Jelly line 207:
 *   <j:forEach var="de" items="${cDisplayExecutors}">
 *     <j:set var="e" value="${de.executor}"/>
 *     <local:executor name="${de.displayName}" url="${de.url}" />
 *   </j:forEach>
 */
interface DisplayExecutor {
  /** Display name (e.g., "#1" for regular executors, "" for lightweight) */
  displayName: string;
  /** Relative URL path for the executor (e.g., "executors/0/") */
  url: string;
  /** The underlying executor status information */
  executor: ExecutorInfo;
}

/**
 * Extended executable info with additional fields available from Stapler
 * REST API that may not be present in the base ExecutableInfo interface.
 * The externalizableId is @Exported on hudson.model.Run and used for
 * the stop build URL construction (Jelly line 124).
 */
interface ExtendedExecutableInfo extends ExecutableInfo {
  /** Run's externalizable ID for stop URL query parameter */
  externalizableId?: string;
  /** Short display name (e.g., "#42") for inline build links */
  displayName?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Auto-refresh polling interval matching widget-refresh.js frequency */
const REFRESH_INTERVAL_MS = 5000;

/**
 * Chevron-up SVG for collapsed pane header toggle.
 * Mirrors symbol-chevron-up from the Jenkins SVG symbol system.
 * Used when pane is collapsed (Jelly line 181).
 */
const CHEVRON_UP =
  '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">' +
  '<path fill="none" stroke="currentColor" stroke-linecap="round" ' +
  'stroke-linejoin="round" stroke-width="48" d="M112 328l144-144 144 144"/></svg>';

/**
 * Paper-plane-outline SVG for lightweight executor type indicator.
 * Mirrors symbol-paper-plane-outline from the Jenkins symbol system.
 * Used in Jelly line 68 for one-off (lightweight) executors.
 */
const PAPER_PLANE_OUTLINE =
  '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">' +
  '<path d="M473 39.05a24 24 0 00-25.5-5.46L47.47 185h-.07a24 24 0 001 45.16l.18.07 ' +
  '137.3 58.59a16 16 0 0012.31-1.3L410 166 225.33 335.37a16.34 16.34 0 00-1.29 12.29' +
  'l58.56 136.89.07.17A24 24 0 00304.76 496a24.09 24.09 0 0023.45-18.09L478.5 64.57a' +
  '24 24 0 00-5.5-25.52z" fill="none" stroke="currentColor" stroke-linecap="round" ' +
  'stroke-linejoin="round" stroke-width="32"/></svg>';

// ============================================================================
// Props Interface
// ============================================================================

/**
 * Props for the Executors component.
 *
 * Mirrors the Jelly st:documentation attributes (lines 28-33):
 *   - computers: optional list of executor holders
 *   - viewUrl: URL for widget-refresh AJAX endpoint
 *
 * @example
 * ```tsx
 * // Full page — fetches all computers automatically
 * <Executors viewUrl="/view/all/" />
 *
 * // Filtered — display specific computers only
 * <Executors computers={[masterComputer]} />
 * ```
 */
export interface ExecutorsProps {
  /**
   * If specified, only these computers' executors are rendered.
   * Mirrors Jelly attribute (lines 29-31): "If specified, this is the
   * list of executor holders whose executors are rendered. If omitted,
   * all the computers in the system will be rendered."
   */
  computers?: Computer[];

  /**
   * URL for the current view, used to construct the auto-refresh endpoint.
   * Polling URL is constructed as `{viewUrl}ajax` to match widget-refresh.js
   * pattern from Jelly line 227:
   *   <div class="widget-refresh-reference" data-url="${rootURL}/${it.url}ajax"/>
   */
  viewUrl?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Constructs the relative URL path for a computer.
 * Mirrors Java Computer.getUrl() which returns paths like "computer/agent-1/".
 * The built-in node uses the special "(built-in)" path encoding.
 */
function getComputerUrl(computer: Computer): string {
  if (isBuiltInNode(computer)) {
    return 'computer/(built-in)/';
  }
  return `computer/${encodeURIComponent(computer.displayName)}/`;
}

/**
 * Determines if a computer is the built-in (master) node.
 * Checks the Stapler class discriminator and known display name variants.
 */
function isBuiltInNode(computer: Computer): boolean {
  return (
    computer._class === 'hudson.model.Hudson$MasterComputer' ||
    computer.displayName === 'Built-In Node' ||
    computer.displayName === 'master'
  );
}

/**
 * Builds the list of display executors for a computer, combining regular
 * numbered slots and one-off (lightweight) executors.
 *
 * Mirrors Java Computer.getDisplayExecutors() which the Jelly template
 * iterates at line 207: <j:forEach var="de" items="${cDisplayExecutors}">
 *
 * Regular executors get names like "#1", "#2", etc.
 * One-off (lightweight) executors get an empty name, triggering the
 * paper-plane icon in the executor row (Jelly line 68).
 */
function buildDisplayExecutors(computer: Computer): DisplayExecutor[] {
  const result: DisplayExecutor[] = [];

  for (const exec of computer.executors) {
    result.push({
      displayName: `#${exec.number + 1}`,
      url: `executors/${exec.number}/`,
      executor: exec,
    });
  }

  for (const exec of computer.oneOffExecutors) {
    result.push({
      displayName: '',
      url: `executors/${exec.number}/`,
      executor: exec,
    });
  }

  return result;
}

/**
 * Counts busy (non-idle) executors for a computer.
 * Mirrors Java Computer.countBusy() used in Jelly lines 57, 157-158.
 */
function countBusyExecutors(computer: Computer): number {
  let busy = 0;
  for (const exec of computer.executors) {
    if (!exec.idle) {
      busy++;
    }
  }
  for (const exec of computer.oneOffExecutors) {
    if (!exec.idle) {
      busy++;
    }
  }
  return busy;
}

/**
 * Counts total executor slots (regular + one-off) for a computer.
 * Mirrors Java Computer.countExecutors() used in Jelly lines 57, 158.
 */
function countTotalExecutors(computer: Computer): number {
  return computer.executors.length + computer.oneOffExecutors.length;
}

/**
 * Creates a minimal Build object from an ExecutableInfo and ExecutorInfo.
 * Required because BuildProgressBar expects a full Build prop type, but
 * the executor data only has ExecutableInfo for the current executable.
 *
 * Only the fields actually read by BuildProgressBar are set meaningfully:
 * - build.url (for polling endpoint construction)
 * - build.building (for animation determination)
 * - build.executor (for initial executor info)
 */
function createBuildProxy(
  exe: ExecutableInfo,
  executor: ExecutorInfo,
): Build {
  return {
    _class: exe._class,
    number: exe.number ?? 0,
    id: String(exe.number ?? 0),
    url: exe.url ?? '',
    displayName: (exe as ExtendedExecutableInfo).displayName ?? `#${exe.number ?? 0}`,
    fullDisplayName: exe.fullDisplayName,
    description: null,
    timestamp: 0,
    duration: 0,
    estimatedDuration: 0,
    result: null,
    building: true,
    keepLog: false,
    queueId: 0,
    executor: executor,
    actions: [],
    artifacts: [],
  };
}

/**
 * Posts to a Stapler endpoint with CSRF crumb injection.
 * Used for stop-build actions where the URL varies per executor.
 * Reads crumb data from document.head.dataset, matching the pattern
 * used by the API client layer.
 */
async function postWithCrumb(url: string): Promise<void> {
  const headDataset = document.head?.dataset ?? {};
  const crumbHeaderName = (headDataset as Record<string, string | undefined>).crumbheader ?? '';
  const crumbHeaderValue = (headDataset as Record<string, string | undefined>).crumbvalue ?? '';

  const headers: Record<string, string> = {};
  if (crumbHeaderName && crumbHeaderValue) {
    headers[crumbHeaderName] = crumbHeaderValue;
  }

  await fetch(url, {
    method: 'POST',
    headers,
    credentials: 'same-origin',
  });
}

// ============================================================================
// Component
// ============================================================================

/**
 * Build Executor Status Panel — displays all executor statuses for Jenkins.
 *
 * This component replaces the entire executors.jelly template (230 lines)
 * and the widget-refresh.js auto-refresh mechanism. It renders:
 *
 * - A pane header with "Build Executor Status" title link to /computer/
 * - Per-computer sections with caption, online/offline status, and busy count
 * - Executor rows with task links, build progress bars, and stop buttons
 * - Collapsed summary text showing aggregate executor counts
 * - Auto-refresh via React Query polling (5-second interval)
 *
 * The DOM output uses identical CSS classes and element structure as the
 * Jelly template to ensure zero visual regression.
 */
export default function Executors({
  computers: computersProp,
  viewUrl,
}: ExecutorsProps): React.JSX.Element {
  // --------------------------------------------------------------------------
  // Hooks
  // --------------------------------------------------------------------------
  const { t } = useI18n();
  const [baseUrl] = useState<string>(() => getBaseUrl());
  const [collapsed, setCollapsed] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // Data Fetching — replaces widget-refresh.js
  // Jelly lines 225-229: Behaviour.specify('.widget-refresh-reference', ...)
  // --------------------------------------------------------------------------
  const {
    data: fetchedData,
    isLoading,
    isFetching,
  } = useStaplerQuery<ComputerSet>({
    url: viewUrl ? `${viewUrl}ajax` : '/computer/api/json',
    queryKey: ['executors', 'computerSet', viewUrl ?? 'all'],
    refetchInterval: REFRESH_INTERVAL_MS,
    enabled: !computersProp,
    staleTime: 0,
  });

  // Resolve computer list: props take precedence over fetched data
  // Mirrors Jelly line 132: <j:set var="computers" value="${attrs.computers?:app.computers}"/>
  const allComputers: Computer[] =
    computersProp ?? fetchedData?.computer ?? [];

  // --------------------------------------------------------------------------
  // Collapse Toggle Mutation
  // Jelly line 179: POST to {rootURL}/toggleCollapse?paneId=executors
  // --------------------------------------------------------------------------
  const toggleMutation = useStaplerMutation<void, void>({
    url: `${baseUrl}/toggleCollapse?paneId=executors`,
    contentType: 'form-urlencoded',
    onSuccess: () => {
      setCollapsed((prev) => !prev);
    },
  });

  /**
   * Handles collapse/expand toggle click.
   * Posts to the server to persist the collapsed state, then toggles local
   * state on success. Mirrors Jelly line 179 anchor behavior.
   */
  const handleToggleCollapse = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (!toggleMutation.isPending) {
        toggleMutation.mutate(undefined as void);
      }
    },
    [toggleMutation],
  );

  /**
   * Handles stop-build button click for a specific executor.
   * Shows confirmation dialog, then POSTs to the stop URL with CSRF crumb.
   * Mirrors Jelly line 124: <l:stopButton href="..." confirm="..." />
   */
  const handleStopBuild = useCallback(
    (stopUrl: string, displayName: string) => {
      const confirmTemplate =
        t('confirm') ?? 'Are you sure you want to abort {0}?';
      const confirmMessage = confirmTemplate.replace('{0}', displayName);
      if (!window.confirm(confirmMessage)) {
        return;
      }

      postWithCrumb(`${baseUrl}/${stopUrl}`).catch(() => {
        /* Error silently handled — executor refreshes on next poll */
      });
    },
    [baseUrl, t],
  );

  // --------------------------------------------------------------------------
  // Computed Values — mirrors Jelly lines 131-165
  // --------------------------------------------------------------------------

  /** Original computer count before filtering (used for header logic) */
  const origComputersSize = allComputers.length;

  // Determine if the built-in node has displayable executors
  // Jelly line 137: !app.toComputer().displayExecutors.isEmpty()
  const builtInComputer =
    allComputers.length > 0 && isBuiltInNode(allComputers[0])
      ? allComputers[0]
      : null;
  const builtInHasExecutors = builtInComputer
    ? buildDisplayExecutors(builtInComputer).length > 0
    : false;

  // Filter computers: remove built-in if it has no executors and others exist
  // Jelly lines 142-146: remove built-in from list when no executors to show
  let computers = allComputers;
  if (
    !builtInHasExecutors &&
    allComputers.length > 1 &&
    builtInComputer !== null
  ) {
    computers = allComputers.filter((c) => !isBuiltInNode(c));
  }

  const computersSize = computers.length;

  // Single-computer determination
  // Jelly lines 138-140: size==1, or size==2 with built-in having no executors
  const singleComputer =
    allComputers.length === 1 ||
    (allComputers.length === 2 &&
      builtInComputer !== null &&
      !builtInHasExecutors);

  // --------------------------------------------------------------------------
  // Collapsed Text Computation — mirrors Jelly lines 149-165
  // --------------------------------------------------------------------------
  let collapsedText = '';
  let executorDetails = '';
  let singleTooltip = '';

  if (!builtInHasExecutors && computersSize === 0) {
    // No executors at all — Jelly line 151: ${%noExecutors}
    collapsedText = t('noExecutors') ?? 'No executors';
  } else if (singleComputer && computers.length > 0) {
    // Single computer — Jelly lines 154-158
    const sc = computers[0];
    const busy = countBusyExecutors(sc);
    const total = countTotalExecutors(sc);
    executorDetails = `${busy}/${total}`;
    collapsedText = (t('CollapsedSingle') ?? '{0} busy / {1} total')
      .replace('{0}', String(busy))
      .replace('{1}', String(total));
    singleTooltip = (t('busy') ?? '{0} of {1} executors busy')
      .replace('{0}', String(busy))
      .replace('{1}', String(total));
  } else if (computersSize > 0) {
    // Multiple computers — Jelly lines 160-164
    const totalBusy = computers.reduce(
      (sum, c) => sum + countBusyExecutors(c),
      0,
    );
    const totalExecs = computers.reduce(
      (sum, c) => sum + countTotalExecutors(c),
      0,
    );
    if (!builtInHasExecutors) {
      // Without built-in — Jelly line 161: ${%CollapsedMulti(...)}
      collapsedText = (
        t('CollapsedMulti') ?? '{0} computers, {1} busy / {2} total'
      )
        .replace('{0}', String(computersSize))
        .replace('{1}', String(totalBusy))
        .replace('{2}', String(totalExecs));
    } else {
      // With built-in — Jelly line 164: ${%Computers(...)}
      collapsedText = (t('Computers') ?? '{0} computers, {1} busy / {2} total')
        .replace('{0}', String(computersSize - 1))
        .replace('{1}', String(totalBusy))
        .replace('{2}', String(totalExecs));
    }
  }

  // --------------------------------------------------------------------------
  // Chevron icon for collapse toggle — Jelly lines 181-182
  // --------------------------------------------------------------------------
  const chevronIcon = collapsed ? CHEVRON_UP : CHEVRON_DOWN;
  const collapseTooltip = collapsed
    ? (t('Expand') ?? 'Expand')
    : (t('Collapse') ?? 'Collapse');

  // --------------------------------------------------------------------------
  // Loading state
  // --------------------------------------------------------------------------
  if (isLoading && !computersProp) {
    return (
      <div className="pane-frame expanded" id="executors">
        <div className="pane-header">
          <span className="pane-header-title">
            <a href={`${baseUrl}/computer/`}>
              {t('Build Executor Status') ?? 'Build Executor Status'}
            </a>
          </span>
        </div>
        <div className="pane-content" />
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div
      className={`pane-frame ${collapsed ? 'collapsed' : 'expanded'}`}
      id="executors"
      data-fetching={isFetching ? 'true' : undefined}
    >
      {/* Pane Header — Jelly lines 168-183 */}
      <div className="pane-header">
        {/* Title link — Jelly line 170 */}
        <span className="pane-header-title">
          <a href={`${baseUrl}/computer/`}>
            {t('Build Executor Status') ?? 'Build Executor Status'}
          </a>
        </span>

        {/* Single computer busy/total details in header — Jelly lines 172-175 */}
        {origComputersSize === 1 && !collapsed && executorDetails && (
          <span
            className="pane-header-details"
            title={singleTooltip}
            data-tooltip-append-to-parent="true"
          >
            {executorDetails}
          </span>
        )}

        {/* Collapse/expand toggle anchor — Jelly lines 179-183 */}
        <a
          className="collapse post"
          href={`${baseUrl}/toggleCollapse?paneId=executors`}
          data-post-href={`${baseUrl}/toggleCollapse?paneId=executors`}
          title={collapseTooltip}
          data-tooltip-append-to-parent="true"
          onClick={handleToggleCollapse}
          role="button"
          aria-expanded={!collapsed}
          aria-label={collapseTooltip}
        >
          <span
            className="icon-sm"
            dangerouslySetInnerHTML={{ __html: chevronIcon }}
          />
        </a>
      </div>

      {/* Pane Content — Jelly lines 185-216 */}
      <div className="pane-content">
        {collapsed ? (
          /* Collapsed summary text — Jelly lines 187-190 */
          <div className="executors-collapsed">{collapsedText}</div>
        ) : (
          /* Expanded: full computer and executor listing — Jelly lines 192-215 */
          <>
            {computers.map((c) => {
              const computerUrl = getComputerUrl(c);
              const displayExecs = buildDisplayExecutors(c);
              const busy = countBusyExecutors(c);
              const total = countTotalExecutors(c);

              /* Skip computers with no displayable executors */
              if (displayExecs.length === 0) {
                return null;
              }

              /* Show caption for multi-computer or offline nodes */
              const showCaption = !singleComputer || c.offline;

              return (
                <div
                  className="computer-row"
                  key={computerUrl}
                  data-num-executors={c.numExecutors}
                >
                  {/* Computer Caption — mirrors <local:computerCaption> tag */}
                  {showCaption && (
                    <div className="computer-caption">
                      {/* Computer link with icon — Jelly line 36 */}
                      <a
                        href={`${baseUrl}/${computerUrl}`}
                        className="jenkins-link--with-icon model-link inside"
                      >
                        {c.iconClassName && (
                          <span
                            className={`icon-sm ${c.iconClassName}`}
                            aria-hidden="true"
                          />
                        )}
                        <span>{c.displayName}</span>
                      </a>

                      {/* Status indicators — Jelly lines 39-60 */}
                      {c.offline ? (
                        c.offlineCause ? (
                          /* Offline with cause — Jelly lines 41-48 */
                          <span>
                            {' ('}
                            <span
                              className="icon-xs jenkins-!-error-color"
                              aria-hidden="true"
                            />
                            {` ${t('offline') ?? 'offline'})`}
                          </span>
                        ) : (
                          /* Offline without cause — Jelly line 52 */
                          <span>
                            {` (${t('offline') ?? 'offline'})`}
                          </span>
                        )
                      ) : (
                        /* Online — show busy/total — Jelly lines 55-59 */
                        <span
                          title={(t('busy') ?? '{0} of {1} executors busy')
                            .replace('{0}', String(busy))
                            .replace('{1}', String(total))}
                          data-tooltip-append-to-parent="true"
                        >
                          {` ${busy}/${total}`}
                        </span>
                      )}

                      {/* Suspended indicator — Jelly line 60 */}
                      {c.temporarilyOffline && !c.offline && (
                        <span>
                          {' '}
                          ({t('suspended') ?? 'suspended'})
                        </span>
                      )}
                    </div>
                  )}

                  {/* Executor Rows — Jelly lines 205-211 */}
                  <div className="executors-cell">
                    {displayExecs.map((de) => {
                      const e = de.executor;

                      /* Only render non-idle executors — Jelly line 63 */
                      if (e.idle) {
                        return null;
                      }

                      const exe = e.currentExecutable as ExtendedExecutableInfo | null;

                      return (
                        <div className="executor-row" key={de.url}>
                          {/* Executor type column — Jelly lines 66-70 */}
                          <div className="executor-type">
                            {de.displayName === '' ? (
                              /* Light weight executor icon — Jelly line 68 */
                              <span
                                className="icon-sm"
                                title={
                                  t('Light weight executor') ??
                                  'Light weight executor'
                                }
                                dangerouslySetInnerHTML={{
                                  __html: PAPER_PLANE_OUTLINE,
                                }}
                              />
                            ) : (
                              /* Regular executor number */
                              <span>{de.displayName}</span>
                            )}
                          </div>

                          {/* Executor cell content — Jelly lines 72-120 */}
                          <div className="executor-cell">
                            {exe === null ? (
                              /* Pending or Idle state */
                              !e.idle ? (
                                /* Pending: no executable yet — Jelly lines 85-89 */
                                <div>
                                  <div style={{ whiteSpace: 'normal' }}>
                                    {t('Pending') ?? 'Pending'}
                                  </div>
                                  <BuildProgressBar
                                    build={
                                      {
                                        url: '',
                                        building: true,
                                        number: 0,
                                        id: '0',
                                        displayName: '',
                                        description: null,
                                        timestamp: 0,
                                        duration: 0,
                                        estimatedDuration: 0,
                                        result: null,
                                        keepLog: false,
                                        queueId: 0,
                                        executor: e,
                                        actions: [],
                                        artifacts: [],
                                      } as Build
                                    }
                                    progress={-1}
                                    tooltip={t('Pending') ?? 'Pending'}
                                    animate={false}
                                  />
                                </div>
                              ) : (
                                /* Idle (race condition) — Jelly line 97 */
                                <span>{t('Idle') ?? 'Idle'}</span>
                              )
                            ) : !exe.url ? (
                              /* No read permission — Jelly lines 99-108 */
                              <div>
                                <span>{t('Unknown Task') ?? 'Unknown Task'}</span>
                                <BuildProgressBar
                                  build={createBuildProxy(exe, e)}
                                  executor={e}
                                />
                              </div>
                            ) : (
                              /* Normal execution — Jelly lines 110-118 */
                              <div>
                                <table className="executor-cell-table">
                                  <tbody>
                                    <tr>
                                      <td className="pane">
                                        <div style={{ whiteSpace: 'normal' }}>
                                          <a
                                            href={`${baseUrl}/${exe.url}`}
                                          >
                                            {exe.fullDisplayName ??
                                              t('Unknown Task') ??
                                              'Unknown Task'}
                                          </a>
                                        </div>
                                      </td>
                                      {exe.displayName && (
                                        <td className="pane">
                                          <a href={`${baseUrl}/${exe.url}`}>
                                            {exe.displayName}
                                          </a>
                                        </td>
                                      )}
                                    </tr>
                                  </tbody>
                                </table>
                                <BuildProgressBar
                                  build={createBuildProxy(exe, e)}
                                  executor={e}
                                  animate
                                  progress={e.progress}
                                  isStuck={e.likelyStuck}
                                />
                              </div>
                            )}
                          </div>

                          {/* Stop button column — Jelly lines 122-127 */}
                          <div className="executor-stop">
                            {exe?.url && (
                              <a
                                className="stop-button-link"
                                href={`${baseUrl}/${computerUrl}${de.url}stopBuild${
                                  exe.externalizableId
                                    ? `?runExtId=${encodeURIComponent(exe.externalizableId)}`
                                    : ''
                                }`}
                                title={
                                  t('terminate this build') ??
                                  'terminate this build'
                                }
                                onClick={(
                                  event: React.MouseEvent<HTMLAnchorElement>,
                                ) => {
                                  event.preventDefault();
                                  handleStopBuild(
                                    `${computerUrl}${de.url}stopBuild${
                                      exe.externalizableId
                                        ? `?runExtId=${encodeURIComponent(
                                            exe.externalizableId,
                                          )}`
                                        : ''
                                    }`,
                                    exe.fullDisplayName ??
                                      t('Unknown Task') ??
                                      'Unknown Task',
                                  );
                                }}
                                role="button"
                                aria-label={
                                  t('terminate this build') ??
                                  'terminate this build'
                                }
                              >
                                <span className="icon-sm">
                                  &#x25A0;
                                </span>
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Idle slots (show idle executors as empty rows) */}
                    {displayExecs
                      .filter((de) => de.executor.idle)
                      .map((de) => (
                        <div className="executor-row" key={`idle-${de.url}`}>
                          <div className="executor-type">
                            {de.displayName === '' ? (
                              <span
                                className="icon-sm"
                                title={
                                  t('Light weight executor') ??
                                  'Light weight executor'
                                }
                                dangerouslySetInnerHTML={{
                                  __html: PAPER_PLANE_OUTLINE,
                                }}
                              />
                            ) : (
                              <span>{de.displayName}</span>
                            )}
                          </div>
                          <div className="executor-cell">
                            <span>{t('Idle') ?? 'Idle'}</span>
                          </div>
                          <div className="executor-stop" />
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}

            {/* No executors state (when expanded but no computers) */}
            {computers.length === 0 && (
              <div className="executors-collapsed">
                {t('noExecutors') ?? 'No executors'}
              </div>
            )}
          </>
        )}
      </div>

      {/* Pane footer — Jelly line 218 */}
      <div className="pane-footer" />
    </div>
  );
}
