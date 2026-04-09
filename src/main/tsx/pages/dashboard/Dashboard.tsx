/**
 * @file Dashboard — Main Dashboard Page Component
 *
 * Replaces:
 * - `core/src/main/resources/hudson/model/View/index.jelly` (60 lines)
 *   Page shell, title logic, `newDashboardPage` experimental flag, and
 *   composition of sidepanel + main-panel.
 * - `core/src/main/resources/hudson/model/View/sidepanel.jelly` (84 lines)
 *   Side navigation with task links (New Item, Build History, Edit View,
 *   Delete View, Project Relationship, Check File Fingerprint) plus
 *   Executors and Queue widget embedding.
 * - `core/src/main/resources/hudson/model/View/main.jelly` (78 lines)
 *   Project listing via `<t:projectView>`, view tab bar, empty-state handling,
 *   and the `jenkins-inline-page` grid layout in new-dashboard mode.
 * - `src/main/js/pages/dashboard/index.js` (17 lines)
 *   Icon legend modal behavior using `behaviorShim.specify("#button-icon-legend")`
 *   replaced by a React `useCallback` click handler.
 *
 * Data is fetched from the Stapler REST API via `useStaplerQuery<ViewData>`.
 * All existing Stapler endpoints are consumed as-is — no backend changes.
 *
 * Two layout modes are supported:
 * - **Traditional**: `<Layout>` with a side-panel containing task links, Executors,
 *   and Queue widgets.
 * - **New Dashboard (experimental)**: `jenkins-inline-page` CSS Grid (300px sidebar +
 *   1fr main) with widgets rendered inline beside the project view.
 *
 * No jQuery, no Handlebars, no behaviorShim — React 19 component lifecycle.
 *
 * @module pages/dashboard/Dashboard
 */

import React, { useState, useCallback } from "react";
import { useStaplerQuery } from "@/hooks/useStaplerQuery";
import { useI18n } from "@/hooks/useI18n";
import { useJenkinsNavigation } from "@/hooks/useJenkinsNavigation";
import Layout from "@/layout/Layout";
import TabBar from "@/layout/TabBar";
import Card from "@/layout/Card";
import ProjectView from "@/hudson/ProjectView";
import Executors from "@/hudson/Executors";
import Queue from "@/hudson/Queue";
import EditableDescription from "@/hudson/EditableDescription";
import type { Job, View, ViewData } from "@/types/models";

// ============================================================================
// Props Interface
// ============================================================================

/**
 * Props for the {@link Dashboard} component.
 *
 * These are provided by the Jelly shell mount point via data attributes on the
 * `<div id="react-root">` element, corresponding to the server-side values
 * that `index.jelly` had direct access to:
 *
 * - `viewName`         → `${it.displayName}`
 * - `viewUrl`          → `${it.viewUrl}`
 * - `isRootAllView`    → `${it.class.name=='hudson.model.AllView' and it.ownerItemGroup == app}`
 * - `ownerDisplayName` → `${it.ownerItemGroup.fullDisplayName}`
 * - `isEditable`       → `${it.isEditable()}`
 * - `canDelete`        → `${it.owner.canDelete(it)}`
 */
export interface DashboardProps {
  /** Current view display name (e.g., "all", "My View") */
  viewName?: string;
  /** View URL path segment (e.g., "" for root, "view/MyView/") */
  viewUrl?: string;
  /** Whether this is the root-level AllView — shows "Dashboard" as title */
  isRootAllView?: boolean;
  /** Owner item group display name for the title suffix */
  ownerDisplayName?: string;
  /** Whether the current user can edit this view (shows Edit View task) */
  isEditable?: boolean;
  /** Whether the current user can delete this view (shows Delete View task) */
  canDelete?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Stapler REST API tree parameter for fetching view data.
 * Requests exactly the fields consumed by the dashboard components,
 * matching the data shapes that the original Jelly templates had access to
 * through the `it` (View) and `app` (Jenkins) model objects.
 */
const VIEW_API_TREE =
  "name,description,url," +
  "jobs[name,displayName,fullName,url,color,healthReport[*],lastBuild[number,url,result,timestamp,displayName],lastSuccessfulBuild[number,url],lastFailedBuild[number,url]]," +
  "views[name,url]," +
  "primaryView[name]," +
  "property[*]," +
  "columns[*]";

/**
 * Stale time for the main dashboard query (30 seconds).
 * Prevents redundant refetches on tab switches while keeping data reasonably fresh.
 */
const DASHBOARD_STALE_TIME = 30_000;

// ============================================================================
// Dashboard Component
// ============================================================================

/**
 * Main dashboard page component.
 *
 * Renders the Jenkins dashboard with project listings, executor status,
 * build queue, and navigation. Supports both the traditional two-column
 * layout and the experimental inline-page grid layout.
 */
export default function Dashboard({
  viewName,
  viewUrl = "",
  isRootAllView = false,
  ownerDisplayName,
  isEditable = false,
  canDelete = false,
}: DashboardProps): React.JSX.Element {
  const { t } = useI18n();
  const { buildUrl } = useJenkinsNavigation();

  // --------------------------------------------------------------------------
  // Experimental layout flag detection
  // --------------------------------------------------------------------------

  /**
   * Detect the `newDashboardPage` experimental flag.
   *
   * In Jelly (index.jelly line 27), this was:
   *   `<j:set var="newDashboardPage"
   *     value="${h.getView(it, '/jenkins/experimental/new-view-page.jelly')}"/>`
   *
   * The Jelly shell mount point sets `data-new-dashboard-page="true"` on the
   * `<div id="react-root">` element when the experimental view is available.
   * We read it once on mount for the lifetime of the component.
   */
  const [newDashboardLayout] = useState<boolean>(() => {
    const root = document.getElementById("react-root");
    return root?.dataset.newDashboardPage === "true";
  });

  // --------------------------------------------------------------------------
  // Data fetching — Stapler REST API
  // --------------------------------------------------------------------------

  /**
   * Fetch the current view's JSON data from the Stapler REST endpoint.
   * Endpoint: `GET {viewUrl}/api/json?tree=...`
   *
   * The response includes jobs, nested views, system message, description,
   * configure permission, and column definitions — all the data that the
   * Jelly templates consumed via server-side model objects.
   */
  const {
    data: viewData,
    isLoading,
    error,
  } = useStaplerQuery<ViewData>({
    queryKey: ["dashboard", viewUrl],
    url: `${viewUrl}api/json?tree=${VIEW_API_TREE}`,
    staleTime: DASHBOARD_STALE_TIME,
  });

  // --------------------------------------------------------------------------
  // Derived state from API response
  // --------------------------------------------------------------------------

  const jobs: Job[] = viewData?.jobs ?? [];
  const views: View[] | undefined = viewData?.views;
  const systemMessage: string | undefined = viewData?.systemMessage;
  const description: string | null = viewData?.description ?? null;
  const hasConfigurePermission: boolean =
    viewData?.configurePermission ?? false;

  /**
   * Column extensions for the ProjectView table.
   * The Stapler API returns columns as objects with `_class` discriminators.
   * We ensure the `_class` field is always a string for type compatibility
   * with the ProjectView component's internal ColumnExtension type.
   */
  const columnExtensions = viewData?.columns
    ?.filter((col) => col._class != null)
    .map((col) => ({ ...col, _class: col._class as string }));

  const hasViews = views != null && views.length > 0;
  const hasJobs = jobs.length > 0;

  // --------------------------------------------------------------------------
  // Page title — matches index.jelly line 34
  // --------------------------------------------------------------------------

  /**
   * Title logic from index.jelly:
   *   ${(it.class.name=='hudson.model.AllView' and it.ownerItemGroup == app)
   *     ? '%Dashboard'
   *     : it.displayName}
   *   ${not empty it.ownerItemGroup.fullDisplayName
   *     ? ' ['+it.ownerItemGroup.fullDisplayName+']'
   *     : ''}
   */
  const pageTitle: string = isRootAllView
    ? t("Dashboard") || "Dashboard"
    : `${viewName || ""}${ownerDisplayName ? ` [${ownerDisplayName}]` : ""}`;

  // --------------------------------------------------------------------------
  // Icon legend modal handler — replaces dashboard/index.js lines 4-16
  // --------------------------------------------------------------------------

  /**
   * Reads the `#template-icon-legend` element rendered by the Jelly shell,
   * extracts its title and content, then displays it using the global
   * `dialog.modal()` function for backward compatibility with the plugin
   * ecosystem.
   *
   * Original behaviorShim code:
   *   behaviorShim.specify("#button-icon-legend", "icon-legend", 999, (button) => {
   *     button.addEventListener("click", () => {
   *       const template = document.querySelector("#template-icon-legend");
   *       const title = template.getAttribute("data-title");
   *       const content = createElementFromHtml("<div>" + template.innerHTML + "</div>");
   *       dialog.modal(content, { maxWidth: "550px", title: title });
   *     });
   *   });
   */
  const handleIconLegendClick = useCallback((): void => {
    const template = document.querySelector("#template-icon-legend");
    if (template) {
      const title = template.getAttribute("data-title") || "Icon Legend";
      const content = document.createElement("div");
      content.innerHTML = template.innerHTML;
      // Use the global dialog.modal() for backward compatibility.
      // The `dialog` object is injected by Jenkins' layout template and is
      // consumed by plugins — we must use it rather than a React modal.
      const win = window as unknown as Record<string, unknown>;
      const dialogObj = win.dialog as
        | { modal: (el: HTMLElement, opts: Record<string, string>) => void }
        | undefined;
      if (dialogObj?.modal) {
        dialogObj.modal(content, { maxWidth: "550px", title });
      }
    }
  }, []);

  // --------------------------------------------------------------------------
  // Side panel task links — matches sidepanel.jelly lines 33-72
  // --------------------------------------------------------------------------

  /**
   * Renders the side panel navigation tasks matching the Jelly `<l:task>` tags
   * from sidepanel.jelly. DOM structure mirrors `<l:task>` output:
   *   <div class="task">
   *     <span class="task-link-wrapper">
   *       <a href="..." class="task-link">
   *         <span class="task-icon-link"><svg.../></span>
   *         <span class="task-link-text">Title</span>
   *       </a>
   *     </span>
   *   </div>
   */
  const renderTaskLink = (
    href: string,
    symbolId: string,
    label: string,
    key: string,
  ): React.JSX.Element => (
    <div className="task" key={key}>
      <span className="task-link-wrapper">
        <a href={href} className="task-link">
          <span className="task-icon-link">
            <svg
              className="svg-icon icon-sm"
              aria-hidden="true"
              focusable="false"
            >
              <use href={`#symbol-${symbolId}`} />
            </svg>
          </span>
          <span className="task-link-text">{label}</span>
        </a>
      </span>
    </div>
  );

  /**
   * The full side panel content, rendered inside the Layout component's
   * `sidePanel` slot. Contains:
   * 1. RSS links for all/failed builds (sidepanel.jelly lines 33-36)
   * 2. Task links (sidepanel.jelly lines 40-65)
   * 3. Executors + Queue widgets in traditional mode (sidepanel.jelly lines 75-81)
   */
  const sidePanelContent: React.ReactNode = (
    <div id="tasks">
      {/* RSS links — sidepanel.jelly lines 33-36 */}
      <div className="task-rss-bar">
        <a
          href={buildUrl(`/${viewUrl}rssAll`)}
          className="rss-bar-link"
          title={t("All builds") || "All builds"}
        >
          <svg
            className="svg-icon icon-sm"
            aria-hidden="true"
            focusable="false"
          >
            <use href="#symbol-rss" />
          </svg>
        </a>
        <a
          href={buildUrl(`/${viewUrl}rssFailed`)}
          className="rss-bar-link"
          title={t("All failed builds") || "All failed builds"}
        >
          <svg
            className="svg-icon icon-sm"
            aria-hidden="true"
            focusable="false"
          >
            <use href="#symbol-rss" />
          </svg>
        </a>
      </div>

      {/* New Item — sidepanel.jelly line 51 (hidden in new dashboard mode) */}
      {!newDashboardLayout &&
        renderTaskLink(
          buildUrl(`/${viewUrl}newJob`),
          "add",
          t("New Item") || "New Item",
          "new-item",
        )}

      {/* Build History — sidepanel.jelly line 55 */}
      {renderTaskLink(
        buildUrl(`/${viewUrl}builds`),
        "build-history",
        t("Build History") || "Build History",
        "build-history",
      )}

      {/* Edit View — sidepanel.jelly line 56-58 (conditional on isEditable) */}
      {isEditable &&
        renderTaskLink(
          buildUrl(`/${viewUrl}configure`),
          "settings",
          t("Edit View") || "Edit View",
          "edit-view",
        )}

      {/* Delete View — sidepanel.jelly line 60-61 (conditional on canDelete) */}
      {canDelete &&
        renderTaskLink(
          buildUrl(`/${viewUrl}delete`),
          "trash",
          t("Delete View") || "Delete View",
          "delete-view",
        )}

      {/* Project Relationship — sidepanel.jelly line 64 */}
      {renderTaskLink(
        buildUrl(`/${viewUrl}depgraph`),
        "arrow-right-to-arc",
        t("Project Relationship") || "Project Relationship",
        "project-relationship",
      )}

      {/* Check File Fingerprint — sidepanel.jelly line 65 */}
      {renderTaskLink(
        buildUrl("/fingerprint"),
        "fingerprint",
        t("Check File Fingerprint") || "Check File Fingerprint",
        "check-fingerprint",
      )}

      {/* Executors + Queue widgets — sidepanel.jelly lines 75-81 */}
      {/* Rendered only in traditional mode; new mode puts them inline */}
      {!newDashboardLayout && (
        <>
          <Executors viewUrl={viewUrl} />
          <Queue items={[]} viewUrl={viewUrl} />
        </>
      )}
    </div>
  );

  // --------------------------------------------------------------------------
  // View tabs — main.jelly line 47
  // --------------------------------------------------------------------------

  /**
   * Tab bar showing sibling views when multiple views exist.
   * Mirrors the Jelly `<j:if test="${views.size() > 0}">` conditional
   * from main.jelly line 39.
   */
  const viewTabBar: React.ReactNode = hasViews ? (
    <TabBar>
      {views.map((view: View) => (
        <a
          key={view.name}
          href={buildUrl(view.url || "")}
          className={
            view.name === (viewData?.name || viewName) ? "tab active" : "tab"
          }
        >
          {view.name}
        </a>
      ))}
    </TabBar>
  ) : null;

  // --------------------------------------------------------------------------
  // Empty state — noJob.groovy equivalent
  // --------------------------------------------------------------------------

  /**
   * Empty state displayed when there are no jobs and no nested views.
   * Mirrors the welcome panel from AllView/noJob.groovy which shows
   * "Welcome to Jenkins!" with create-job and setup links.
   * Wrapped in a {@link Card} to match the `jenkins-card` CSS pattern
   * used by dashboard content sections.
   */
  const emptyState: React.ReactNode = (
    <Card
      title={t("Welcome to Jenkins!") || "Welcome to Jenkins!"}
      id="main-panel-content"
    >
      <section className="empty-state-block">
        <p>
          <a
            href={buildUrl(`/${viewUrl}newJob`)}
            className="content-block__link"
          >
            {t("Create a job") || "Create a job"}
          </a>
        </p>
      </section>
    </Card>
  );

  // --------------------------------------------------------------------------
  // Loading state
  // --------------------------------------------------------------------------

  if (isLoading) {
    return (
      <Layout title={pageTitle} sidePanel={sidePanelContent}>
        <div className="jenkins-spinner" aria-label="Loading dashboard" />
      </Layout>
    );
  }

  // --------------------------------------------------------------------------
  // Error state
  // --------------------------------------------------------------------------

  if (error) {
    return (
      <Layout title={pageTitle} sidePanel={sidePanelContent}>
        <div className="alert alert-danger" role="alert">
          <p>
            {t("Failed to load dashboard data.") ||
              "Failed to load dashboard data."}
          </p>
          <p>{error.message}</p>
        </div>
      </Layout>
    );
  }

  // --------------------------------------------------------------------------
  // Main content area — index.jelly lines 41-57 + main.jelly
  // --------------------------------------------------------------------------

  /**
   * Core dashboard content shared between both layout modes.
   * Includes:
   * - System message (view-index-top.jelly)
   * - Editable description (editableDescription.jelly)
   * - View tab bar (when multiple views exist)
   * - Project listing or empty state
   * - Icon legend button
   */
  const mainContent: React.ReactNode = (
    <>
      {/* System message + editable description — view-index-top.jelly */}
      <div id="view-message">
        {systemMessage && (
          <div
            id="systemmessage"
            dangerouslySetInnerHTML={{ __html: systemMessage }}
          />
        )}
        <EditableDescription
          description={description ?? undefined}
          hasPermission={hasConfigurePermission}
        />
      </div>

      {/* View tabs + Project listing or empty state */}
      {hasJobs || hasViews ? (
        <>
          {viewTabBar}
          {hasJobs ? (
            <ProjectView
              jobs={jobs}
              showViewTabs={hasViews}
              columnExtensions={columnExtensions}
              views={views}
            />
          ) : (
            /* Views exist but no jobs — render empty within tabs */
            emptyState
          )}
        </>
      ) : (
        /* No views and no jobs — full empty state */
        emptyState
      )}

      {/* Icon legend button — replaces #button-icon-legend from index.jelly */}
      {hasJobs && (
        <div className="jenkins-icon-legend-container">
          <button
            id="button-icon-legend"
            className="jenkins-button jenkins-button--tertiary"
            onClick={handleIconLegendClick}
            type="button"
          >
            {t("Icon Legend") || "Icon Legend"}
          </button>
        </div>
      )}
    </>
  );

  // --------------------------------------------------------------------------
  // Render — New dashboard (experimental) vs. traditional layout
  // --------------------------------------------------------------------------

  /**
   * New dashboard layout — index.jelly line 27, main.jelly lines 59-72.
   *
   * Uses `jenkins-inline-page` CSS Grid (300px sidebar + 1fr main)
   * defined in `src/main/scss/pages/_dashboard.scss`.
   * Executors and Queue widgets are rendered inline in the sidebar
   * instead of in the Layout side panel.
   */
  if (newDashboardLayout) {
    return (
      <Layout title={pageTitle} sidePanel={sidePanelContent}>
        <div className="jenkins-inline-page">
          <div className="jenkins-inline-page__side-panel">
            <Executors viewUrl={viewUrl} />
            <Queue items={[]} viewUrl={viewUrl} />
          </div>
          <div>{mainContent}</div>
        </div>
      </Layout>
    );
  }

  // --------------------------------------------------------------------------
  // Traditional layout — index.jelly default path (when newDashboardPage=false)
  // --------------------------------------------------------------------------

  return (
    <Layout title={pageTitle} sidePanel={sidePanelContent}>
      {mainContent}
    </Layout>
  );
}
