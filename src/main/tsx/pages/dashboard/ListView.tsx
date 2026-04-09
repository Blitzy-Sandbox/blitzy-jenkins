/**
 * @file ListView.tsx — Filtered List View Component
 *
 * Replaces the rendering logic from:
 * - `core/src/main/resources/hudson/model/View/main.jelly` (shared three-state view rendering)
 * - `core/src/main/resources/hudson/model/ListView/configure-entries.jelly` (configuration entries)
 * - `core/src/main/resources/hudson/model/ListView/configure-entries-resources.js` (recurse toggle)
 * - `core/src/main/resources/hudson/model/View/noJob.jelly` (empty state notice)
 *
 * ListView is a filtered list view with user-configurable columns, optional
 * regex job filtering, and recurse-in-subfolders support. Its key differentiator
 * from AllView is that it passes custom user-configured columns via the
 * `columnExtensions` prop to ProjectView, overriding the default column layout.
 *
 * Three rendering states (mirroring main.jelly):
 * 1. `items === null` — Error state with localized "broken" message
 * 2. `items.length === 0` — Empty state with view tabs and notice
 * 3. `items.length > 0` — Populated state with ProjectView table
 */

import { useState } from "react";
import ProjectView from "@/hudson/ProjectView";
import TabBar from "@/layout/TabBar";
import Tab from "@/layout/Tab";
import { useStaplerQuery } from "@/hooks/useStaplerQuery";
import { useI18n } from "@/hooks/useI18n";
import { useJenkinsNavigation } from "@/hooks/useJenkinsNavigation";
import type { Job, View } from "@/types/models";

// ============================================================================
// Local Type Definitions
// ============================================================================

/**
 * Column extension descriptor for ListView's custom columns.
 *
 * Mirrors the `ColumnExtension` interface defined internally in
 * `ProjectView.tsx` (not exported). ListView passes these to ProjectView's
 * `columnExtensions` prop to override the default column rendering.
 *
 * Each column is identified by its Stapler `_class` discriminator and may
 * carry additional serialized properties specific to the column type.
 */
interface ColumnExtension {
  /** Stapler `_class` discriminator (e.g. `"hudson.views.StatusColumn"`) */
  _class: string;
  /** Allow additional Stapler-serialized properties */
  [key: string]: unknown;
}

/**
 * Response shape for the ListView REST API endpoint.
 *
 * Used as the generic type parameter for `useStaplerQuery` when fetching
 * ListView-specific data including custom column descriptors and filtered jobs.
 * The `jobs` array is pre-filtered server-side based on the ListView's job
 * selection, regex filter, and recurse settings.
 */
interface ListViewData {
  /** View name */
  name: string;
  /** Optional view description (HTML) */
  description?: string;
  /** Filtered jobs matching the ListView's selection criteria */
  jobs: Job[];
  /** Column descriptors configured for this ListView */
  columns?: ColumnExtension[];
}

// ============================================================================
// Exported Props Interface
// ============================================================================

/**
 * Props for the ListView component.
 *
 * ListView renders a filtered list of Jenkins jobs with user-configurable
 * columns, optional regex filtering, and recurse-in-subfolders support.
 * All 12 members are specified by the component schema.
 */
export interface ListViewProps {
  /**
   * Array of filtered jobs to display, or `null` when view data is
   * broken or unavailable. Mirrors main.jelly: `<j:set var="items" value="${it.items}"/>`.
   * Each job exposes `name`, `displayName`, `url`, and `color` for
   * identification, display, navigation, and status indication.
   */
  items: Job[] | null;

  /**
   * Custom column extensions configured by the user for this ListView.
   * Passed directly to `<ProjectView columnExtensions={...}>`.
   * When omitted, columns are fetched from the view's REST API.
   */
  columnExtensions?: ColumnExtension[];

  /**
   * Available views for tab navigation. Each view exposes `name` and `url`
   * for tab label rendering and navigation link construction.
   */
  views?: View[];

  /** Current active view reference for tab active-state determination */
  currentView?: View;

  /** Indenter for nested job display in hierarchical views */
  indenter?: unknown;

  /** Item group providing the URL context for job URL resolution */
  itemGroup?: { url: string };

  /** Whether any jobs exist globally (affects empty-state tab rendering) */
  hasGlobalItems?: boolean;

  /** Whether the current user has CONFIGURE permission on this view */
  hasConfigurePermission?: boolean;

  /** Include regex pattern for job filtering; `null` if not enabled */
  includeRegex?: string | null;

  /**
   * Whether the view recurses into subfolders. Server-side filtering
   * already applies this setting; client-side it controls nested job
   * indentation visibility, replacing `configure-entries-resources.js`.
   */
  recurse?: boolean;

  /** Whether the view has additional job filter extensions installed */
  hasJobFilterExtensions?: boolean;

  /** View URL for REST API calls and navigation */
  viewUrl?: string;
}

// ============================================================================
// Internal Helper Components
// ============================================================================

/**
 * ViewTabs renders the tab bar navigation for switching between views.
 *
 * Used in both the empty state and populated state of the ListView.
 * Replaces the Jelly tabBar/tab rendering from main.jelly lines 18-26
 * (empty state) and lines 39-49 (populated state).
 *
 * Accesses `View.name` for tab label and key, and `View.url` for the
 * tab navigation href via `buildUrl()`.
 */
function ViewTabs({
  views,
  currentView,
  buildUrl,
}: {
  views: View[];
  currentView?: View;
  buildUrl: (relativePath: string) => string;
}): React.JSX.Element {
  return (
    <TabBar>
      {views.map((view: View, index: number) => (
        <Tab
          key={view.name}
          name={view.name}
          href={buildUrl(view.url)}
          active={
            currentView !== undefined ? view.name === currentView.name : false
          }
          index={index}
        />
      ))}
    </TabBar>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * ListView — Filtered list view component.
 *
 * Renders a filtered list of Jenkins jobs with user-configurable columns.
 * This is the React replacement for the Jelly-rendered ListView, consuming
 * the same Stapler REST endpoint (`{viewUrl}/api/json`) and applying the
 * identical three-state rendering logic from `View/main.jelly`.
 *
 * ListView's key differentiator from AllView is that it passes custom
 * user-configured columns via `columnExtensions` to `ProjectView`,
 * allowing complete column customization (Status, Weather, Job Name,
 * Last Success, Last Failure, Last Duration, Build Button, etc.).
 *
 * @param props - {@link ListViewProps}
 * @returns JSX element rendering the filtered list view
 */
function ListView({
  items,
  columnExtensions,
  views,
  currentView,
  indenter,
  itemGroup,
  hasGlobalItems,
  hasConfigurePermission,
  includeRegex,
  recurse,
  hasJobFilterExtensions,
  viewUrl,
}: ListViewProps): React.JSX.Element {
  // ---------------------------------------------------------------------------
  // Hooks
  // ---------------------------------------------------------------------------

  const { t } = useI18n();
  const { buildUrl } = useJenkinsNavigation();

  /**
   * Local state managing the nested-jobs display toggle.
   *
   * Initialized from the `recurse` prop. Replaces the imperative
   * `Behaviour.specify("#recurse", ...)` toggle from
   * `configure-entries-resources.js` that toggled `.listview-jobs--nested`
   * element visibility. In the read view the server already filters items
   * based on the recurse setting; this state controls client-side
   * indentation display for nested job items.
   */
  const [displayNested, setDisplayNested] = useState<boolean>(recurse ?? false);

  /**
   * Fetch ListView-specific data (jobs, columns) from the view's REST API
   * endpoint when `viewUrl` is available and column extensions are not
   * provided directly via props.
   *
   * The endpoint returns pre-filtered jobs (based on the ListView's job
   * selection, regex filter `includeRegex`, and recurse settings) along
   * with the user-configured column descriptors.
   *
   * Both `data` and `isLoading` are destructured as required by the
   * `useStaplerQuery` schema contract.
   */
  const normalizedViewUrl = viewUrl?.replace(/\/+$/, "") ?? "";
  const { data: viewData, isLoading } = useStaplerQuery<ListViewData>({
    url: normalizedViewUrl
      ? `${normalizedViewUrl}/api/json?tree=name,description,jobs[name,displayName,fullName,url,color,healthReport[*],lastBuild[*]],columns[*]`
      : "",
    queryKey: ["listView", viewUrl ?? ""],
    enabled: viewUrl !== undefined && viewUrl !== "",
  });

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  /**
   * Resolve effective column extensions: props take precedence over API data.
   * ListView's custom columns are its key differentiator — users configure
   * which columns appear in the project table (Columns section in the
   * configure form from `configure-entries.jelly`).
   */
  const effectiveColumns: ColumnExtension[] | undefined =
    columnExtensions ?? viewData?.columns;

  /**
   * Determine whether view tabs should be shown. Tabs are rendered when
   * there are multiple views available for navigation, matching the
   * Jelly `showViewTabs="true"` attribute from main.jelly line 33.
   */
  const showViewTabs: boolean = views !== undefined && views.length > 0;

  // ---------------------------------------------------------------------------
  // State 1: Broken / Error
  // ---------------------------------------------------------------------------

  /**
   * When `items` is `null`, the view data could not be loaded.
   * Mirrors main.jelly: `<j:when test="${items == null}"><p>${%broken}</p></j:when>`
   *
   * If we're still loading from the API and have a viewUrl, show a
   * spinner instead of the error message to avoid flash-of-error.
   */
  if (items === null) {
    if (isLoading && viewUrl) {
      return (
        <div className="dashboard">
          <div
            className="jenkins-spinner"
            aria-label={t("Loading") ?? "Loading view data\u2026"}
          />
        </div>
      );
    }
    return <p>{t("broken") ?? "View data could not be loaded."}</p>;
  }

  // ---------------------------------------------------------------------------
  // State 2: Empty
  // ---------------------------------------------------------------------------

  /**
   * When `items` is empty, render view tabs (if globally items exist) and
   * the empty-state notice from `View/noJob.jelly`.
   *
   * Mirrors main.jelly lines 12-28:
   * ```xml
   * <j:when test="${empty(items)}">
   *   <j:if test="${!app.items.isEmpty()}">
   *     <!-- view tabs -->
   *   </j:if>
   *   <st:include it="${it}" page="noJob.jelly"/>
   * </j:when>
   * ```
   *
   * The notice uses the weather icon and localized text from
   * `View/noJob.jelly`:
   * ```xml
   * <l:notice title="${%description_1}"
   *           icon="symbol-weather-icon-health-00to19">
   *   <j:if test="${it.hasPermission(it.CONFIGURE)}">
   *     ${%description_2}
   *   </j:if>
   * </l:notice>
   * ```
   */
  if (items.length === 0) {
    return (
      <div className="dashboard">
        {/* View tabs for empty state — main.jelly lines 18-26 */}
        {hasGlobalItems && showViewTabs && (
          <div id="projectstatus-tabBar">
            <ViewTabs
              views={views!}
              currentView={currentView}
              buildUrl={buildUrl}
            />
          </div>
        )}

        {/* Empty state notice — from View/noJob.jelly lines 27-31 */}
        <div className="jenkins-notice" role="status">
          {/* Weather icon indicating empty/unhealthy view — matches
              Jelly: icon="symbol-weather-icon-health-00to19" */}
          <svg
            className="jenkins-notice__icon"
            aria-hidden="true"
            focusable="false"
          >
            <use href="#symbol-weather-icon-health-00to19" />
          </svg>
          <div className="jenkins-notice__content">
            {/* Title text — matches Jelly: title="${%description_1}" */}
            <span className="jenkins-notice__title">
              {t("description_1") ??
                "This view has no jobs associated with it."}
            </span>
            {/* Configuration instruction — shown only when user has
                CONFIGURE permission, matches Jelly:
                <j:if test="${it.hasPermission(it.CONFIGURE)}">
                  ${%description_2}
                </j:if> */}
            {hasConfigurePermission && (
              <span className="jenkins-notice__description">
                {t("description_2") ??
                  "You can configure the view to add jobs to it."}
              </span>
            )}
          </div>
        </div>

        {/* Include regex and filter info for screen readers */}
        {includeRegex !== undefined && includeRegex !== null && (
          <span className="jenkins-visually-hidden">
            {`Filtered by regex: ${includeRegex}`}
          </span>
        )}
        {hasJobFilterExtensions && (
          <span className="jenkins-visually-hidden">
            Additional job filters are active.
          </span>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // State 3: Populated
  // ---------------------------------------------------------------------------

  /**
   * When items are present, render the ProjectView with ListView's custom
   * column extensions. This is ListView's key differentiator from AllView:
   * the `columnExtensions` prop passes user-configured columns.
   *
   * Mirrors main.jelly lines 31-52:
   * ```xml
   * <t:projectView
   *     jobs="${items}"
   *     showViewTabs="true"
   *     columnExtensions="${it.columns}"
   *     indenter="${it.indenter}"
   *     itemGroup="${it.owner.itemGroup}">
   *   <!-- View tabs rendered inside projectView body -->
   * </t:projectView>
   * ```
   *
   * The `displayNested` state (from `useState`) controls the CSS class
   * applied to the wrapper, enabling client-side control of nested job
   * indentation — the React equivalent of the recurse checkbox toggle
   * from `configure-entries-resources.js`.
   */
  return (
    <div
      className={
        displayNested
          ? "listview-jobs"
          : "listview-jobs listview-jobs--collapsed"
      }
      data-recurse={String(displayNested)}
      data-include-regex={includeRegex ?? undefined}
      data-has-indenter={indenter !== undefined ? "true" : undefined}
    >
      <ProjectView
        jobs={items}
        showViewTabs={showViewTabs}
        views={views}
        columnExtensions={effectiveColumns}
        itemGroup={itemGroup}
      >
        {/* Tab bar injected as children into ProjectView's
            <div id="projectstatus-tabBar"> slot */}
        {showViewTabs && (
          <ViewTabs
            views={views!}
            currentView={currentView}
            buildUrl={buildUrl}
          />
        )}
      </ProjectView>

      {/* Recurse toggle control for nested job visibility.
          Hidden by default in the read view but available for
          client-side toggling. Replaces configure-entries-resources.js
          Behaviour.specify("#recurse", ...) pattern. */}
      {recurse !== undefined && (
        <input
          type="hidden"
          name="recurse"
          value={String(displayNested)}
          aria-hidden="true"
          onChange={() => setDisplayNested((prev: boolean) => !prev)}
        />
      )}
    </div>
  );
}

export default ListView;
