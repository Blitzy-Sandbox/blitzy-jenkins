/**
 * MyView — Personal View Dashboard Component
 *
 * Replaces the MyView rendering from:
 * - `core/src/main/resources/hudson/model/View/main.jelly` (78 lines)
 *   → Shared three-state rendering logic for all view types
 * - `core/src/main/resources/hudson/model/MyView/noJob.jelly` (28 lines)
 *   → MyView-specific empty state: simply `<div>${%blurb}</div>`
 *
 * MyView is the user's personalized dashboard that automatically shows only
 * jobs the user has access to. The server-side filtering is performed by the
 * Java MyView class — this component is a pure presenter of the filtered data.
 *
 * ## Three-State Rendering (mirroring main.jelly lines 7-54)
 *
 * 1. **items === null** — Broken state: renders `<p>{broken}</p>`
 *    (main.jelly line 9: `<p>${%broken}</p>`)
 *
 * 2. **items.length === 0** — Empty state: renders optional view tabs
 *    (when items exist globally) followed by a plain `<div>` with the
 *    localized blurb text. This is the SIMPLEST empty state of any view
 *    type — no icons, no sections, no CTAs. MyView/noJob.jelly is
 *    literally: `<div>${%blurb}</div>` (lines 26-28).
 *
 * 3. **items populated** — ProjectView table with view tabs injected
 *    as children (main.jelly lines 31-52).
 *
 * ## Tab Bar Selection (main.jelly lines 18-25, 42-49)
 *
 * In Jelly, `it.isMyViewsProperty()` determines which tab bar variant
 * to render (`viewsTabBar` vs `userViewsTabBar`). In React, this
 * distinction is handled by the parent Dashboard component, which
 * provides the correct `views` array based on the `isMyViewsProperty`
 * flag. The React component simply renders whatever views it receives.
 *
 * No jQuery — React Query replaces AJAX in the parent.
 * No Handlebars — JSX replaces templates.
 * No behaviorShim — React lifecycle replaces `Behaviour.specify()`.
 *
 * @module pages/dashboard/MyView
 */

import React from "react";
import ProjectView from "@/hudson/ProjectView";
import TabBar from "@/layout/TabBar";
import Tab from "@/layout/Tab";
import { useI18n } from "@/hooks/useI18n";
import { useJenkinsNavigation } from "@/hooks/useJenkinsNavigation";
import type { Job, View } from "@/types/models";

// ============================================================================
// Column Descriptor Type
// ============================================================================

/**
 * Descriptor for a list view column extension.
 *
 * Each entry mirrors the Stapler JSON representation of a `ListViewColumn`
 * subclass, identified by its fully-qualified Java class name in `_class`.
 * This type is structurally compatible with ProjectView's internal
 * `ColumnExtension` interface, enabling direct prop forwarding.
 */
interface ColumnDescriptor {
  /** Stapler `_class` discriminator (e.g. `"hudson.views.StatusColumn"`) */
  _class: string;
  /** Allow additional Stapler-serialized properties */
  [key: string]: unknown;
}

// ============================================================================
// Exported Props Interface
// ============================================================================

/**
 * Props for the {@link MyView} component.
 *
 * Combines attributes from the shared `View/main.jelly` template
 * (items, columnExtensions, views, currentView, itemGroup) with
 * MyView-specific properties (isMyViewsProperty, hasGlobalItems, viewUrl).
 *
 * All data is provided by the parent Dashboard component — MyView
 * performs no data fetching of its own.
 */
export interface MyViewProps {
  /**
   * Array of user-accessible jobs to display in the personal view.
   *
   * - `null` indicates a broken/error state (main.jelly line 8)
   * - Empty array triggers the MyView-specific empty state (noJob.jelly)
   * - Populated array renders the ProjectView table
   *
   * Server-side filtering ensures only jobs the user has access to
   * are included.
   */
  items: Job[] | null;

  /**
   * Column extensions for the project table.
   *
   * Forwarded directly to ProjectView's `columnExtensions` prop.
   * When omitted, ProjectView falls back to `ListView.getDefaultColumns()`.
   * Mirrors Jelly: `columnExtensions="${it.columns}"` (main.jelly line 35).
   */
  columnExtensions?: ColumnDescriptor[];

  /**
   * Available views for tab navigation.
   *
   * Populated from `it.owner.views` (main.jelly lines 14, 39).
   * The parent component determines the correct views list based on
   * the `isMyViewsProperty` flag.
   */
  views?: View[];

  /**
   * Currently active view for tab highlighting.
   *
   * Set to `it` (the current view object) in main.jelly lines 15, 40.
   * Used by ViewTabs to determine which tab receives the `.active` class.
   */
  currentView?: View;

  /**
   * Containing item group for URL construction.
   *
   * Forwarded to ProjectView's `itemGroup` prop.
   * Mirrors Jelly: `itemGroup="${it.owner.itemGroup}"` (main.jelly line 37).
   */
  itemGroup?: { url: string };

  /**
   * Whether this view is a MyViews property view.
   *
   * In Jelly, determines which tab bar variant to render
   * (`viewsTabBar` vs `userViewsTabBar`). In React, this distinction
   * is handled by the parent providing the correct `views` array.
   * Retained in the interface for informational purposes and potential
   * future use by consuming components.
   */
  isMyViewsProperty?: boolean;

  /**
   * Whether items exist globally in the Jenkins instance.
   *
   * Controls visibility of view tabs in the empty state.
   * Mirrors Jelly: `!app.items.isEmpty()` (main.jelly line 13).
   * When false, view tabs are not shown even if `views` is populated.
   */
  hasGlobalItems?: boolean;

  /**
   * View URL for API endpoint resolution.
   *
   * Provided by the parent Dashboard component for data fetching.
   * Not consumed directly by MyView's rendering logic but available
   * for integration with parent data flow.
   */
  viewUrl?: string;
}

// ============================================================================
// ViewTabs — Internal Helper Sub-Component
// ============================================================================

/**
 * Props for the internal ViewTabs helper component.
 */
interface ViewTabsProps {
  /** List of views to render as tabs */
  views: View[];
  /** Currently active view for highlighting */
  currentView?: View;
}

/**
 * ViewTabs — Renders a horizontal tab bar for view navigation.
 *
 * Replaces the Jelly tab rendering in main.jelly lines 18-26 and 39-49:
 * ```xml
 * <j:choose>
 *   <j:when test="${it.isMyViewsProperty()}">
 *     <st:include it="${it.owner.viewsTabBar}" page="viewTabs" />
 *   </j:when>
 *   <j:otherwise>
 *     <st:include it="${it.owner.userViewsTabBar}" page="viewTabs" />
 *   </j:otherwise>
 * </j:choose>
 * ```
 *
 * Both Jelly tab bar variants render the same structure: a TabBar
 * containing Tab elements for each view. The distinction between
 * `viewsTabBar` and `userViewsTabBar` is handled upstream by the
 * parent component providing the appropriate `views` array.
 *
 * @param props - {@link ViewTabsProps}
 */
function ViewTabs({ views, currentView }: ViewTabsProps): React.ReactNode {
  const { buildUrl } = useJenkinsNavigation();

  return (
    <TabBar>
      {views.map((view, index) => (
        <Tab
          key={view.name}
          name={view.name}
          href={buildUrl(`/${view.url}`)}
          active={view.name === currentView?.name}
          index={index}
        />
      ))}
    </TabBar>
  );
}

// ============================================================================
// MyView — Main Component (Default Export)
// ============================================================================

/**
 * MyView — Personal view dashboard component.
 *
 * Renders the user's personalized dashboard with three-state logic:
 * broken (null items), empty (blurb text), or populated (ProjectView table).
 *
 * This is the SIMPLEST view component — its unique behavior is limited
 * to the empty state blurb from MyView/noJob.jelly. The populated state
 * is identical to AllView/ListView, using the same ProjectView component
 * with column extensions and view tabs.
 *
 * @param props - {@link MyViewProps}
 *
 * @example
 * ```tsx
 * <MyView
 *   items={jobs}
 *   columnExtensions={columns}
 *   views={availableViews}
 *   currentView={activeView}
 *   itemGroup={{ url: "/jenkins/" }}
 *   hasGlobalItems={true}
 * />
 * ```
 */
export default function MyView({
  items,
  columnExtensions,
  views,
  currentView,
  itemGroup,
  hasGlobalItems,
}: MyViewProps): React.ReactNode {
  const { t } = useI18n();

  // ---------------------------------------------------------------------------
  // State 1: items === null → Broken / Error state
  // ---------------------------------------------------------------------------
  // Matches main.jelly line 8-9:
  //   <j:when test="${items == null}">
  //     <p>${%broken}</p>
  //   </j:when>
  //
  // The "broken" key comes from View/main.properties. When the view cannot
  // retrieve its items (e.g., due to a permissions error or backend failure),
  // items is null rather than an empty array.
  if (items === null) {
    return (
      <p>{t("broken") ?? "Unable to retrieve items for this view."}</p>
    );
  }

  // ---------------------------------------------------------------------------
  // State 2: items.length === 0 → Empty state (MyView-specific)
  // ---------------------------------------------------------------------------
  // Matches main.jelly lines 12-28:
  //   <j:when test="${items.isEmpty()}">
  //     <j:if test="${!app.items.isEmpty()}">
  //       <!-- view tabs -->
  //     </j:if>
  //     <st:include it="${it}" page="noJob.jelly" />
  //   </j:when>
  //
  // And MyView/noJob.jelly lines 26-28:
  //   <div>
  //     ${%blurb}
  //   </div>
  //
  // The "blurb" key comes from MyView/noJob.properties:
  //   blurb=This view has no jobs.
  //
  // IMPORTANT: MyView's empty state is the SIMPLEST of all view types.
  // It is just a plain <div> with text — no icons, no sections, no CTAs.
  // Do NOT confuse with AllView's empty state (which has sections and CTAs)
  // or the generic View's noJob.jelly (which has a weather icon notice).
  if (items.length === 0) {
    return (
      <>
        {hasGlobalItems && views && views.length > 0 && (
          <ViewTabs views={views} currentView={currentView} />
        )}
        {/* MyView/noJob.jelly: literally <div>${%blurb}</div> */}
        <div>
          {t("blurb") ?? "This view has no jobs."}
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // State 3: items populated → ProjectView table
  // ---------------------------------------------------------------------------
  // Matches main.jelly lines 31-52:
  //   <t:projectView
  //       jobs="${items}"
  //       showViewTabs="true"
  //       columnExtensions="${it.columns}"
  //       indenter="${it.indenter}"
  //       itemGroup="${it.owner.itemGroup}">
  //     <!-- view tabs rendered inside ProjectView body -->
  //   </t:projectView>
  //
  // View tabs are injected as children into ProjectView's slot
  // (replacing Jelly's <d:invokeBody/> pattern). This places the tab bar
  // inside the <div id="projectstatus-tabBar"> within ProjectView.
  return (
    <ProjectView
      jobs={items}
      showViewTabs={true}
      columnExtensions={columnExtensions}
      itemGroup={itemGroup}
    >
      {views && views.length > 0 && (
        <ViewTabs views={views} currentView={currentView} />
      )}
    </ProjectView>
  );
}
