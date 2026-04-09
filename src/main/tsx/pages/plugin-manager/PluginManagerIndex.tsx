/**
 * PluginManagerIndex — Top-level plugin manager page component.
 *
 * Orchestrates tab-based navigation between four plugin manager sub-views:
 *   1. Updates (default) — Available plugin updates with batch update
 *   2. Available — Searchable catalog of installable plugins
 *   3. Installed — Currently installed plugins with enable/disable controls
 *   4. Advanced — Proxy config, plugin upload, and update site settings
 *
 * Replaces:
 *   - core/src/main/resources/hudson/PluginManager/index.jelly (34 lines)
 *   - core/src/main/resources/hudson/PluginManager/sidepanel.jelly (42 lines)
 *
 * The Jelly sidepanel.jelly renders sidebar task links for navigation between
 * views. In React, those links are preserved in the Layout sidePanel prop for
 * bookmark-compatible URL navigation, while a TabBar provides in-content tab
 * switching. Both interaction surfaces use client-side state (pushState) for
 * SPA-like tab switching without full page reloads.
 *
 * The Jelly index.jelly conditionally renders an UpdatePageLegend message
 * linking to /updateCenter/ when there are active update center jobs. This is
 * replicated here via a DOM data-attribute check on the React mount point.
 *
 * @module pages/plugin-manager/PluginManagerIndex
 */

import React, { useState, useEffect } from "react";

import Layout from "@/layout/Layout";
import TabBar from "@/layout/TabBar";
import Tab from "@/layout/Tab";
import { useI18n } from "@/hooks/useI18n";
import { useJenkinsNavigation } from "@/hooks/useJenkinsNavigation";
import { PluginUpdates } from "./PluginUpdates";
import PluginAvailable from "./PluginAvailable";
import PluginInstalled from "./PluginInstalled";
import { PluginAdvanced } from "./PluginAdvanced";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

/** Union of valid tab identifiers for the plugin manager sub-views. */
type PluginManagerTab = "updates" | "available" | "installed" | "advanced";

/**
 * Props for the PluginManagerIndex page component.
 */
export interface PluginManagerIndexProps {
  /**
   * The initially active tab, typically derived from the current URL path
   * segment by the parent mount component. Defaults to `'updates'` which
   * mirrors the Jelly behaviour where `/pluginManager/` renders the updates
   * view (index.jelly is embedded within `<local:updates>`).
   */
  activeTab?: PluginManagerTab;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Maps each tab identifier to its canonical Jenkins URL path.
 * These paths match the `<l:task>` href values from sidepanel.jelly:
 *   - "Updates"           → rootURL + /manage/pluginManager/
 *   - "Available plugins" → rootURL + /manage/pluginManager/available
 *   - "Installed plugins" → rootURL + /manage/pluginManager/installed
 *   - "Advanced settings" → rootURL + /manage/pluginManager/advanced
 */
const TAB_URL_PATHS: Record<PluginManagerTab, string> = {
  updates: "/manage/pluginManager/",
  available: "/manage/pluginManager/available",
  installed: "/manage/pluginManager/installed",
  advanced: "/manage/pluginManager/advanced",
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Resolves the active tab from a URL pathname by matching against known
 * plugin manager URL segments. Falls back to `'updates'` (the default view).
 */
function resolveTabFromPath(pathname: string): PluginManagerTab {
  if (pathname.includes("/pluginManager/available")) {
    return "available";
  }
  if (pathname.includes("/pluginManager/installed")) {
    return "installed";
  }
  if (pathname.includes("/pluginManager/advanced")) {
    return "advanced";
  }
  // Default: /pluginManager/ maps to updates view (index.jelly within <local:updates>)
  return "updates";
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Plugin Manager main page component — the ORCHESTRATOR that delegates all
 * plugin data rendering to the four sub-view components. It does NOT fetch or
 * display plugin data itself.
 *
 * Responsibilities:
 *   - Render the Layout shell with page title "Plugins" and two-column layout
 *   - Render sidebar task links matching sidepanel.jelly navigation structure
 *   - Render a TabBar with four tabs for in-content visual tab indication
 *   - Conditionally render the UpdatePageLegend when update center has jobs
 *   - Switch between the four sub-views based on active tab state
 *   - Maintain bookmarkable URLs via History pushState + popstate listener
 */
export default function PluginManagerIndex({
  activeTab = "updates",
}: PluginManagerIndexProps): React.JSX.Element {
  /* ---- State ---- */

  /** Active tab managed via local state, initialised from prop or URL fallback */
  const [currentTab, setCurrentTab] = useState<PluginManagerTab>(() => {
    if (activeTab !== "updates") {
      return activeTab;
    }
    // When prop is the default, also check the URL in case the component is
    // mounted without an explicit prop (e.g. direct browser navigation).
    if (typeof window !== "undefined") {
      return resolveTabFromPath(window.location.pathname);
    }
    return "updates";
  });

  /**
   * Whether the Jenkins UpdateCenter has active jobs (plugin installations in
   * progress). Read from the React mount point's `data-has-update-center-jobs`
   * attribute, which the Jelly shell view sets at render time. Controls:
   *   - Visibility of the UpdatePageLegend info banner (index.jelly lines 28-32)
   *   - Visibility of the "Download progress" sidebar link (sidepanel.jelly)
   */
  const [hasUpdateCenterJobs] = useState<boolean>(() => {
    if (typeof document === "undefined") {
      return false;
    }
    const root = document.getElementById("react-root");
    return root?.dataset.hasUpdateCenterJobs === "true";
  });

  /**
   * Whether the current user has Jenkins ADMINISTER permission. Read from the
   * React mount point's `data-is-admin` attribute set by the Jelly shell.
   * Passed to sub-view components that conditionally render admin-only controls.
   */
  const [isAdmin] = useState<boolean>(() => {
    if (typeof document === "undefined") {
      return false;
    }
    const root = document.getElementById("react-root");
    return root?.dataset.isAdmin === "true";
  });

  /**
   * Whether health scores are available from the update center. Read from
   * `data-health-scores-available` on the mount point. Controls visibility of
   * health score columns in plugin listings.
   */
  const [healthScoresAvailable] = useState<boolean>(() => {
    if (typeof document === "undefined") {
      return false;
    }
    const root = document.getElementById("react-root");
    return root?.dataset.healthScoresAvailable === "true";
  });

  /**
   * Whether any available update has compatibility issues. Read from
   * `data-has-incompatible-updates` on the mount point. Controls visibility
   * of the "Compatible" filter button in the updates view.
   */
  const [hasIncompatibleUpdates] = useState<boolean>(() => {
    if (typeof document === "undefined") {
      return false;
    }
    const root = document.getElementById("react-root");
    return root?.dataset.hasIncompatibleUpdates === "true";
  });

  /* ---- Hooks ---- */

  const { t } = useI18n();
  const { buildUrl } = useJenkinsNavigation();

  /* ---- Effects ---- */

  /**
   * Listen for browser back/forward navigation (popstate) to keep the active
   * tab in sync with the URL when the user uses browser history controls.
   */
  useEffect(() => {
    const handlePopState = (): void => {
      const tab = resolveTabFromPath(window.location.pathname);
      setCurrentTab(tab);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  /* ---- Event Handlers ---- */

  /**
   * Navigates to a plugin manager tab via client-side state update + history
   * pushState. Prevents default anchor navigation to enable SPA-like switching.
   */
  const navigateToTab = (
    tab: PluginManagerTab,
    event: React.MouseEvent,
  ): void => {
    event.preventDefault();
    if (tab === currentTab) {
      return;
    }
    setCurrentTab(tab);
    window.history.pushState({ tab }, "", buildUrl(TAB_URL_PATHS[tab]));
  };

  /**
   * Handles delegated click events from the TabBar container. Finds the
   * closest anchor element, extracts its href, maps it to a tab identifier,
   * and performs client-side navigation. This delegates because the Tab
   * component does not expose an onClick prop directly.
   */
  const handleTabBarClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    const anchor = target.closest("a");
    if (!anchor) {
      return;
    }
    event.preventDefault();
    const href = anchor.getAttribute("href") ?? "";
    const tab = resolveTabFromPath(href);
    if (tab !== currentTab) {
      setCurrentTab(tab);
      window.history.pushState({ tab }, "", buildUrl(TAB_URL_PATHS[tab]));
    }
  };

  /* ---- Sub-view rendering ---- */

  /**
   * Renders the currently active sub-view component. Each sub-view is a
   * self-contained component that manages its own data fetching and state.
   */
  const renderActiveView = (): React.ReactNode => {
    switch (currentTab) {
      case "updates":
        return (
          <PluginUpdates
            isAdmin={isAdmin}
            healthScoresAvailable={healthScoresAvailable}
            hasIncompatibleUpdates={hasIncompatibleUpdates}
          />
        );
      case "available":
        return (
          <PluginAvailable
            isAdmin={isAdmin}
            healthScoresAvailable={healthScoresAvailable}
          />
        );
      case "installed":
        return <PluginInstalled />;
      case "advanced":
        return <PluginAdvanced isAdmin={isAdmin} />;
      default:
        return (
          <PluginUpdates
            isAdmin={isAdmin}
            healthScoresAvailable={healthScoresAvailable}
            hasIncompatibleUpdates={hasIncompatibleUpdates}
          />
        );
    }
  };

  /* ---- Side Panel ---- */

  /**
   * Side panel content replicating the sidepanel.jelly task link navigation.
   *
   * Structure matches the Jelly `<l:task>` output:
   *   <div class="task">
   *     <span class="task-link-wrapper">
   *       <a class="task-link [task-link--active]" href="...">
   *         <span class="task-icon-link">
   *           <span class="task-icon" />
   *         </span>
   *         <span class="task-link-text">Label</span>
   *       </a>
   *     </span>
   *   </div>
   *
   * Icons use aria-hidden for decorative SVG symbol references. Active state
   * applies the `task-link--active` CSS class matching the current tab.
   */
  const sidePanel: React.ReactNode = (
    <nav
      aria-label={t("Plugin Manager Navigation") ?? "Plugin Manager Navigation"}
    >
      {/* App bar header with page title — from sidepanel.jelly app-bar */}
      <div className="jenkins-app-bar">
        <div className="jenkins-app-bar__content">
          <h2 className="jenkins-app-bar__content__title">
            {t("Plugins") ?? "Plugins"}
          </h2>
        </div>
      </div>

      {/* Updates task link — default view, sidepanel.jelly first <l:task> */}
      <div className="task">
        <span className="task-link-wrapper">
          <a
            href={buildUrl(TAB_URL_PATHS.updates)}
            className={`task-link${currentTab === "updates" ? " task-link--active" : ""}`}
            onClick={(e) => navigateToTab("updates", e)}
          >
            <span className="task-icon-link">
              <span className="task-icon" aria-hidden="true" />
            </span>
            <span className="task-link-text">{t("Updates") ?? "Updates"}</span>
          </a>
        </span>
      </div>

      {/* Available plugins task link */}
      <div className="task">
        <span className="task-link-wrapper">
          <a
            href={buildUrl(TAB_URL_PATHS.available)}
            className={`task-link${currentTab === "available" ? " task-link--active" : ""}`}
            onClick={(e) => navigateToTab("available", e)}
          >
            <span className="task-icon-link">
              <span className="task-icon" aria-hidden="true" />
            </span>
            <span className="task-link-text">
              {t("Available plugins") ?? "Available plugins"}
            </span>
          </a>
        </span>
      </div>

      {/* Installed plugins task link */}
      <div className="task">
        <span className="task-link-wrapper">
          <a
            href={buildUrl(TAB_URL_PATHS.installed)}
            className={`task-link${currentTab === "installed" ? " task-link--active" : ""}`}
            onClick={(e) => navigateToTab("installed", e)}
          >
            <span className="task-icon-link">
              <span className="task-icon" aria-hidden="true" />
            </span>
            <span className="task-link-text">
              {t("Installed plugins") ?? "Installed plugins"}
            </span>
          </a>
        </span>
      </div>

      {/* Advanced settings task link */}
      <div className="task">
        <span className="task-link-wrapper">
          <a
            href={buildUrl(TAB_URL_PATHS.advanced)}
            className={`task-link${currentTab === "advanced" ? " task-link--active" : ""}`}
            onClick={(e) => navigateToTab("advanced", e)}
          >
            <span className="task-icon-link">
              <span className="task-icon" aria-hidden="true" />
            </span>
            <span className="task-link-text">
              {t("Advanced settings") ?? "Advanced settings"}
            </span>
          </a>
        </span>
      </div>

      {/*
        Download progress task link — conditionally shown when the Jenkins
        UpdateCenter has active jobs (sidepanel.jelly lines 38-40).
        Links to /manage/pluginManager/updates/ for the download progress view.
      */}
      {hasUpdateCenterJobs && (
        <div className="task">
          <span className="task-link-wrapper">
            <a
              href={buildUrl("/manage/pluginManager/updates/")}
              className="task-link"
            >
              <span className="task-icon-link">
                <span className="task-icon" aria-hidden="true" />
              </span>
              <span className="task-link-text">
                {t("Download progress") ?? "Download progress"}
              </span>
            </a>
          </span>
        </div>
      )}
    </nav>
  );

  /* ---- Main Render ---- */

  return (
    <Layout
      title={t("Plugins") ?? "Plugins"}
      type="two-column"
      sidePanel={sidePanel}
    >
      {/*
        TabBar for in-content tab navigation. The wrapping div delegates click
        events to intercept Tab anchor navigation for client-side switching.
        The Tab component renders <a href="..."> links which serve as fallback
        navigation when JavaScript is unavailable.
      */}
      <div role="presentation" onClick={handleTabBarClick}>
        <TabBar>
          <Tab
            name={t("Updates") ?? "Updates"}
            href={buildUrl(TAB_URL_PATHS.updates)}
            active={currentTab === "updates"}
            index={0}
          />
          <Tab
            name={t("Available plugins") ?? "Available plugins"}
            href={buildUrl(TAB_URL_PATHS.available)}
            active={currentTab === "available"}
            index={1}
          />
          <Tab
            name={t("Installed plugins") ?? "Installed plugins"}
            href={buildUrl(TAB_URL_PATHS.installed)}
            active={currentTab === "installed"}
            index={2}
          />
          <Tab
            name={t("Advanced settings") ?? "Advanced settings"}
            href={buildUrl(TAB_URL_PATHS.advanced)}
            active={currentTab === "advanced"}
            index={3}
          />
        </TabBar>
      </div>

      {/*
        UpdatePageLegend from index.jelly (lines 28-32).
        Conditionally rendered when the updates tab is active AND the Jenkins
        UpdateCenter has active jobs. Links to /updateCenter/ matching the
        original ${%UpdatePageLegend(rootURL+'/updateCenter/')} i18n pattern.
      */}
      {currentTab === "updates" && hasUpdateCenterJobs && (
        <div className="jenkins-alert jenkins-alert--visible jenkins-alert-info">
          <a href={buildUrl("/updateCenter/")}>
            {t("UpdatePageLegend") ?? "View update center activity"}
          </a>
        </div>
      )}

      {/* Active sub-view — rendered conditionally based on current tab */}
      {renderActiveView()}
    </Layout>
  );
}
