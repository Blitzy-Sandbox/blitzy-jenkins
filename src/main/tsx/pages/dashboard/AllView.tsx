/**
 * @file AllView — All-Jobs View Component
 *
 * Replaces the rendering logic from:
 * - `core/src/main/resources/hudson/model/View/main.jelly` (78 lines)
 *   — Three-state rendering: broken / empty / populated
 * - `core/src/main/resources/hudson/model/AllView/noJob.groovy` (142 lines)
 *   — Empty state with sub-states: top-level, folder-scoped, anonymous
 * - `core/src/main/resources/hudson/model/AllView/noJob.properties`
 *   — Localization keys for the empty state
 *
 * Renders the full project listing table using the {@link ProjectView}
 * component when items are present, with tab-based view navigation via
 * {@link TabBar} and {@link Tab}. Handles three distinct states:
 *
 * 1. **Broken** (`items === null`): Error message paragraph
 * 2. **Empty** (`items.length === 0`): View tabs (when global items exist)
 *    plus contextual empty-state content for top-level, folder, or anonymous
 * 3. **Populated** (`items.length > 0`): Full project listing table via
 *    ProjectView with view tabs injected as children
 *
 * No jQuery — React Query replaces AJAX.
 * No Handlebars — JSX replaces templates.
 * No behaviorShim — React lifecycle replaces `Behaviour.specify()`.
 *
 * @module pages/dashboard/AllView
 */

import ProjectView from "@/hudson/ProjectView";
import TabBar from "@/layout/TabBar";
import Tab from "@/layout/Tab";
import { useI18n } from "@/hooks/useI18n";
import { useJenkinsNavigation } from "@/hooks/useJenkinsNavigation";
import type { Job, View } from "@/types/models";

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Column descriptor for the project listing table.
 *
 * Passed through to {@link ProjectView}'s `columnExtensions` prop without
 * modification. Mirrors the Stapler JSON representation of a
 * `ListViewColumn` subclass.
 */
interface ColumnDescriptor {
  /** Stapler `_class` discriminator (e.g., `"hudson.views.StatusColumn"`) */
  _class: string;
  /** Allow additional Stapler-serialized properties */
  [key: string]: unknown;
}

// ============================================================================
// Exported Props Interface
// ============================================================================

/**
 * Props for the {@link AllView} component.
 *
 * Mirrors the server-side model data that was previously resolved in
 * `View/main.jelly` and `AllView/noJob.groovy` via Jelly/Groovy expressions.
 * The parent page component (Dashboard) fetches this data from the Stapler
 * REST API and passes it down.
 */
export interface AllViewProps {
  /**
   * Array of jobs/items to display, or `null` if the view is broken
   * (unable to retrieve items). Maps to `main.jelly` line 8: `items == null`.
   */
  items: Job[] | null;

  /**
   * Column extensions for the project table. Passed through to ProjectView.
   * Maps to `main.jelly` line 35: `columnExtensions="${it.columns}"`.
   */
  columnExtensions?: ColumnDescriptor[];

  /**
   * Available views for tab navigation. Used to render the tab bar.
   * Maps to `main.jelly` line 14/39: `<j:set var="views" value="${it.owner.views}" />`.
   */
  views?: View[];

  /**
   * Currently active view for tab active-state determination.
   * Maps to `main.jelly` line 15/40: `<j:set var="currentView" value="${it}" />`.
   */
  currentView?: View;

  /**
   * Whether the user is at the top-level Jenkins root (not inside a folder).
   * Maps to `noJob.groovy` line 10: `my.owner == Jenkins.get()`.
   */
  isTopLevel?: boolean;

  /**
   * Item group for URL construction. Passed through to ProjectView.
   * Maps to `main.jelly` line 37: `itemGroup="${it.owner.itemGroup}"`.
   */
  itemGroup?: { url: string };

  /**
   * Whether items exist globally (even if this view is empty).
   * When true and the view is empty, the tab bar is displayed.
   * Maps to `main.jelly` line 13: `!app.items.isEmpty()`.
   */
  hasGlobalItems?: boolean;

  /**
   * Whether the current user has permission to create items.
   * Maps to `noJob.groovy` line 15: `my.owner.itemGroup.hasPermission(Item.CREATE)`.
   */
  hasItemCreatePermission?: boolean;

  /**
   * Whether distributed build setup is available (Computer.CREATE permission,
   * no existing clouds, no existing nodes).
   * Maps to `noJob.groovy` lines 11-13.
   */
  canSetUpDistributedBuilds?: boolean;

  /**
   * Whether the current user has Jenkins ADMINISTER permission.
   * Maps to `noJob.groovy` line 14: `Jenkins.get().hasPermission(Jenkins.ADMINISTER)`.
   */
  hasAdminPermission?: boolean;

  /**
   * Whether the current user is anonymous (not authenticated).
   * Maps to `noJob.groovy` line 100: `h.isAnonymous()`.
   */
  isAnonymous?: boolean;

  /**
   * Whether user self-registration (sign-up) is enabled.
   * Maps to `noJob.groovy` line 101: `app.securityRealm.allowsSignup()`.
   */
  canSignUp?: boolean;

  /**
   * Whether the current user can configure this view (View.CONFIGURE permission).
   * Maps to `View/noJob.jelly` line 28: `it.hasPermission(it.CONFIGURE)`.
   */
  hasConfigurePermission?: boolean;
}

// ============================================================================
// Private Helper Components
// ============================================================================

/**
 * Renders an inline SVG icon using Jenkins' symbol system.
 *
 * Icons are referenced via `<use href="#symbol-{name}" />` — the SVG symbol
 * definitions are injected into the page by the Jenkins layout Jelly tag and
 * are available globally in the DOM.
 *
 * Mirrors the Groovy `l.icon(src: "symbol-{name}")` tag used in
 * `noJob.groovy` lines 34, 49, 59, 71, 119, 131.
 */
function JenkinsIcon({
  name,
  className,
}: {
  /** Symbol name without the `symbol-` prefix (e.g., `"add"`, `"computer"`) */
  name: string;
  /** Optional CSS class (e.g., `"icon-md"` for medium-sized icons) */
  className?: string;
}) {
  return (
    <svg className={className} aria-hidden="true" focusable="false">
      <use href={`#symbol-${name}`} />
    </svg>
  );
}

/**
 * Renders the view tab bar navigation shared between empty and populated states.
 *
 * Replaces the Jelly `<st:include page="viewTabs" />` pattern in `main.jelly`
 * lines 17-26 and 39-51. Maps over the `views` array, rendering one {@link Tab}
 * per view inside a {@link TabBar} container.
 */
function ViewTabBar({
  views,
  currentView,
  buildUrl,
}: {
  views: View[];
  currentView?: View;
  buildUrl: (path: string) => string;
}) {
  return (
    <TabBar>
      {views.map((view, index) => (
        <Tab
          key={view.name}
          name={view.name}
          href={buildUrl(view.url)}
          active={view.name === currentView?.name}
          index={index}
        />
      ))}
    </TabBar>
  );
}

/**
 * Renders the empty-state content for AllView.
 *
 * Replaces `core/src/main/resources/hudson/model/AllView/noJob.groovy`
 * (142 lines). Handles three sub-states based on user context:
 *
 * 1. **Top-level with permissions** (lines 20-77):
 *    Welcome heading, description, "Start Building" section with "Create a Job"
 *    link, optional "Set Up Distributed Builds" section.
 *
 * 2. **Folder-scoped** (lines 80-97):
 *    "This folder is empty" heading with "Create a Job" link.
 *
 * 3. **Anonymous user** (lines 99-140):
 *    Welcome heading, description, "Log In" link, optional "Sign Up" link.
 *
 * CSS classes consumed: `.empty-state-block`, `.empty-state-section`,
 * `.empty-state-section-list`, `.content-block`, `.content-block__link`,
 * `.trailing-icon`, `.h4` — defined in `src/main/scss/pages/_dashboard.scss`.
 */
function EmptyState({
  isTopLevel = false,
  hasItemCreatePermission = false,
  canSetUpDistributedBuilds = false,
  hasAdminPermission = false,
  isAnonymous = false,
  canSignUp = false,
  t,
  buildUrl,
}: {
  isTopLevel: boolean;
  hasItemCreatePermission: boolean;
  canSetUpDistributedBuilds: boolean;
  hasAdminPermission: boolean;
  isAnonymous: boolean;
  canSignUp: boolean;
  t: (key: string) => string | null;
  buildUrl: (path: string) => string;
}) {
  return (
    <div>
      <div className="empty-state-block">
        {/* ================================================================
         * Top-level AllView with permissions
         * noJob.groovy lines 20-77: isTopLevelAllView &&
         *   (canSetUpDistributedBuilds || hasItemCreatePermission)
         * ================================================================ */}
        {isTopLevel &&
          (canSetUpDistributedBuilds || hasItemCreatePermission) && (
            <>
              <h1>
                {t("Welcome to Jenkins!") ?? "Welcome to Jenkins!"}
              </h1>
              <p>
                {t("noJobDescription") ??
                  "This page is where your Jenkins jobs will be displayed. To get started, you can set up distributed builds or start building a software project."}
              </p>

              {/* Start Building section — noJob.groovy lines 26-38 */}
              <section className="empty-state-section">
                <h2 className="h4">
                  {t("startBuilding") ??
                    "Start building your software project"}
                </h2>
                <ul className="empty-state-section-list">
                  <li className="content-block">
                    <a
                      href={buildUrl("/newJob")}
                      className="content-block__link"
                    >
                      <span>{t("createJob") ?? "Create a job"}</span>
                      <span className="trailing-icon">
                        <JenkinsIcon name="add" />
                      </span>
                    </a>
                  </li>
                </ul>
              </section>

              {/* Distributed Builds section — noJob.groovy lines 41-76 */}
              {canSetUpDistributedBuilds && (
                <section className="empty-state-section">
                  <h2 className="h4">
                    {t("setUpDistributedBuilds") ??
                      "Set up a distributed build"}
                  </h2>
                  <ul className="empty-state-section-list">
                    {/* Set Up Agent — noJob.groovy lines 45-51 */}
                    <li className="content-block">
                      <a
                        href={buildUrl("/computer/new")}
                        className="content-block__link"
                      >
                        <span>
                          {t("setUpAgent") ?? "Set up an agent"}
                        </span>
                        <span className="trailing-icon">
                          <JenkinsIcon name="computer" />
                        </span>
                      </a>
                    </li>

                    {/* Set Up Cloud — noJob.groovy lines 54-62 (admin only) */}
                    {hasAdminPermission && (
                      <li className="content-block">
                        <a
                          href={buildUrl("/cloud/")}
                          className="content-block__link"
                        >
                          <span>
                            {t("setUpCloud") ?? "Configure a cloud"}
                          </span>
                          <span className="trailing-icon">
                            <JenkinsIcon name="cloud" />
                          </span>
                        </a>
                      </li>
                    )}

                    {/* Learn More — noJob.groovy lines 65-73 */}
                    <li className="content-block">
                      <a
                        href="https://www.jenkins.io/redirect/distributed-builds"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="content-block__link"
                      >
                        <span>
                          {t("learnMoreDistributedBuilds") ??
                            "Learn more about distributed builds"}
                        </span>
                        <span className="trailing-icon">
                          <JenkinsIcon name="help-circle" />
                        </span>
                      </a>
                    </li>
                  </ul>
                </section>
              )}
            </>
          )}

        {/* ================================================================
         * Folder-scoped AllView (not top-level) with create permission
         * noJob.groovy lines 80-97: !isTopLevelAllView && hasItemCreatePermission
         * ================================================================ */}
        {!isTopLevel && hasItemCreatePermission && (
          <section className="empty-state-section">
            <h2 className="h4">
              {t("thisFolderIsEmpty") ?? "This folder is empty"}
            </h2>
            <ul className="empty-state-section-list">
              <li className="content-block">
                <a
                  href={buildUrl("/newJob")}
                  className="content-block__link"
                >
                  <span>{t("createJob") ?? "Create a job"}</span>
                  <span className="trailing-icon">
                    <JenkinsIcon name="add" />
                  </span>
                </a>
              </li>
            </ul>
          </section>
        )}

        {/* ================================================================
         * Anonymous user (logged out) — separate check, not else-if
         * noJob.groovy lines 99-140: h.isAnonymous() && !hasItemCreatePermission
         * ================================================================ */}
        {isAnonymous && !hasItemCreatePermission && (
          <>
            <h1>
              {t("Welcome to Jenkins!") ?? "Welcome to Jenkins!"}
            </h1>
            <p>
              {canSignUp
                ? t("anonymousDescriptionSignUpEnabled") ??
                  "Log in now to view or create jobs. If you don't already have an account, you can sign up."
                : t("anonymousDescription") ??
                  "Log in now to view or create jobs."}
            </p>

            <section className="empty-state-section">
              <ul className="empty-state-section-list">
                {/* Log In — noJob.groovy lines 113-122 */}
                <li className="content-block">
                  <a
                    href={buildUrl(
                      `/login?from=${encodeURIComponent(
                        typeof window !== "undefined"
                          ? window.location.pathname
                          : "/",
                      )}`,
                    )}
                    className="content-block__link"
                  >
                    <span>
                      {t("Log in to Jenkins") ?? "Log in to Jenkins"}
                    </span>
                    <span className="trailing-icon">
                      <JenkinsIcon name="arrow-right" className="icon-md" />
                    </span>
                  </a>
                </li>

                {/* Sign Up — noJob.groovy lines 125-136 (if enabled) */}
                {canSignUp && (
                  <li className="content-block">
                    <a
                      href={buildUrl("/signup")}
                      className="content-block__link"
                    >
                      <span>
                        {t("Sign up for Jenkins") ??
                          "Sign up for Jenkins"}
                      </span>
                      <span className="trailing-icon">
                        <JenkinsIcon
                          name="arrow-right"
                          className="icon-md"
                        />
                      </span>
                    </a>
                  </li>
                )}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * AllView — All-Jobs View Component.
 *
 * Replaces `core/src/main/resources/hudson/model/View/main.jelly` for the
 * AllView case. Implements the same three-state `<j:choose>` branching logic:
 *
 * - `items === null` → broken error message (line 9)
 * - `items.length === 0` → view tabs + empty state (lines 12-28)
 * - `items.length > 0` → ProjectView with view tabs (lines 31-52)
 *
 * The component consumes data passed from the parent page component
 * (Dashboard) and delegates rendering to ProjectView, TabBar, Tab, and the
 * EmptyState helper.
 *
 * @param props - {@link AllViewProps}
 */
export default function AllView({
  items,
  columnExtensions,
  views,
  currentView,
  isTopLevel = false,
  itemGroup,
  hasGlobalItems = false,
  hasItemCreatePermission = false,
  canSetUpDistributedBuilds = false,
  hasAdminPermission = false,
  isAnonymous = false,
  canSignUp = false,
  hasConfigurePermission = false,
}: AllViewProps) {
  const { t } = useI18n();
  const { buildUrl } = useJenkinsNavigation();

  // Suppress unused variable warning — hasConfigurePermission is included in
  // the AllViewProps interface for API completeness (mirrors View/noJob.jelly
  // line 28: `it.hasPermission(it.CONFIGURE)`) but is not consumed by the
  // AllView-specific empty state rendering from noJob.groovy. It may be
  // consumed by generic View subclass components in the future.
  void hasConfigurePermission;

  // ==========================================================================
  // State 1: Broken — items === null
  // Mirrors main.jelly line 8-9: <j:when test="${items == null}"><p>${%broken}</p>
  // ==========================================================================
  if (items === null) {
    return (
      <p>{t("broken") ?? "Broken view: failed to load items."}</p>
    );
  }

  // ==========================================================================
  // State 2: Empty — items.length === 0
  // Mirrors main.jelly lines 12-28: <j:when test="${items.isEmpty()}">
  // Shows view tabs (if global items exist) then delegates to noJob.groovy
  // ==========================================================================
  if (items.length === 0) {
    return (
      <>
        {/* View tab bar — shown when other items exist globally.
         * Mirrors main.jelly lines 13-26:
         *   <j:if test="${!app.items.isEmpty()}">
         *     <st:include page="viewTabs" />
         *   </j:if>
         */}
        {hasGlobalItems && views && views.length > 0 && (
          <ViewTabBar
            views={views}
            currentView={currentView}
            buildUrl={buildUrl}
          />
        )}

        {/* Empty state content — delegates to noJob.groovy logic.
         * Mirrors main.jelly line 28:
         *   <st:include it="${it}" page="noJob.jelly" />
         * For AllView, this resolves to AllView/noJob.groovy.
         */}
        <EmptyState
          isTopLevel={isTopLevel}
          hasItemCreatePermission={hasItemCreatePermission}
          canSetUpDistributedBuilds={canSetUpDistributedBuilds}
          hasAdminPermission={hasAdminPermission}
          isAnonymous={isAnonymous}
          canSignUp={canSignUp}
          t={t}
          buildUrl={buildUrl}
        />
      </>
    );
  }

  // ==========================================================================
  // State 3: Populated — items.length > 0
  // Mirrors main.jelly lines 31-52: <j:otherwise><t:projectView ...>
  // Renders ProjectView with jobs and view tabs injected as children.
  // ==========================================================================
  return (
    <ProjectView
      jobs={items}
      showViewTabs={true}
      columnExtensions={columnExtensions}
      itemGroup={itemGroup}
    >
      {/* View tab bar — injected into ProjectView's children slot.
       * Replaces Jelly <d:invokeBody/> delegation in projectView.jelly.
       * Mirrors main.jelly lines 39-51.
       */}
      {views && views.length > 0 && (
        <ViewTabBar
          views={views}
          currentView={currentView}
          buildUrl={buildUrl}
        />
      )}
    </ProjectView>
  );
}
