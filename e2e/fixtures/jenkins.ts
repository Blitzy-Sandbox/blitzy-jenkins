/**
 * Jenkins Playwright Page Object Model & Custom Test Fixture
 *
 * Provides the foundational Playwright test infrastructure for all Jenkins E2E
 * and visual regression tests. Exports:
 * - JenkinsPage: Page Object Model class wrapping common Jenkins UI interactions
 * - test: Custom Playwright test fixture with pre-configured `jenkinsPage`
 * - expect: Re-exported Playwright expect for assertion convenience
 * - JENKINS_BASE_URL: Configurable Jenkins instance URL for dual-instance testing
 *
 * All E2E tests in e2e/flows/ and e2e/visual/ import from this file.
 *
 * @see AAP Section 0.7.6 for visual regression architecture
 * @see AAP Section 0.7.1 for Jelly-to-React mount strategy (react-root hydration)
 */

import { test as base, expect, type Page, type Locator } from "@playwright/test";

// ---------------------------------------------------------------------------
// Configuration Constants
// ---------------------------------------------------------------------------

/**
 * Base URL for the Jenkins instance under test.
 *
 * Uses the JENKINS_URL environment variable to support the dual-instance testing
 * architecture described in AAP Section 0.7.6, where baseline (Jelly-rendered)
 * and refactored (React-rendered) Jenkins instances run in parallel on Kubernetes.
 *
 * Defaults to a local development instance at http://localhost:8080/jenkins.
 */
export const JENKINS_BASE_URL: string =
  process.env.JENKINS_URL || "http://localhost:8080/jenkins";

/**
 * Default administrator username for Jenkins login.
 * Configurable via JENKINS_USER environment variable.
 */
const DEFAULT_USERNAME: string = process.env.JENKINS_USER || "admin";

/**
 * Default administrator password for Jenkins login.
 * Configurable via JENKINS_PASSWORD environment variable.
 */
const DEFAULT_PASSWORD: string = process.env.JENKINS_PASSWORD || "admin";

/**
 * Default timeout (in milliseconds) for waiting on Jenkins page elements.
 * Jenkins pages can be slow to render especially during first load or when
 * fetching data from Stapler REST endpoints.
 */
const DEFAULT_WAIT_TIMEOUT = 15000;

// ---------------------------------------------------------------------------
// JenkinsPage — Page Object Model
// ---------------------------------------------------------------------------

/**
 * Page Object Model for Jenkins UI interactions in Playwright tests.
 *
 * Encapsulates all common navigation, element location, and wait patterns
 * required by E2E flow tests and visual regression screenshot comparisons.
 *
 * Navigation methods replicate the URL construction pattern from
 * `jenkins.goTo(url)` in src/main/js/util/jenkins.js (line 19-21), which
 * concatenates baseUrl + path to form absolute Jenkins URLs.
 *
 * Locator methods return Playwright Locator objects targeting well-known
 * Jenkins DOM elements (side-panel, main-panel, breadcrumbs, etc.) that
 * are consistent across both Jelly-rendered and React-rendered views.
 *
 * @example
 * ```ts
 * import { test, expect } from '../fixtures/jenkins';
 *
 * test('dashboard loads', async ({ jenkinsPage }) => {
 *   await jenkinsPage.login();
 *   await jenkinsPage.navigateToDashboard();
 *   await expect(jenkinsPage.getMainPanel()).toBeVisible();
 * });
 * ```
 */
export class JenkinsPage {
  /**
   * The underlying Playwright Page object for direct browser interaction
   * when the POM methods are insufficient.
   */
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // -----------------------------------------------------------------------
  // Core Navigation
  // -----------------------------------------------------------------------

  /**
   * Navigate to a Jenkins path relative to the base URL.
   *
   * Replicates the `jenkins.goTo(url)` pattern from src/main/js/util/jenkins.js
   * which constructs URLs as `baseUrl + path`. Ensures the path always starts
   * with a forward slash for consistent URL construction.
   *
   * @param path - Relative path within Jenkins (e.g., '/job/my-project/')
   */
  async goto(path: string): Promise<void> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${JENKINS_BASE_URL}${normalizedPath}`;
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  /**
   * Authenticate as a Jenkins user via the login form.
   *
   * Navigates to the Jenkins login page and submits credentials. The login
   * form uses standard Jenkins form field names: `j_username` and `j_password`.
   * After submission, waits for the page to finish loading, which indicates
   * a successful login with session cookies set (including CSRF crumb session
   * handling as described in src/main/js/api/securityConfig.js lines 16-19).
   *
   * @param username - Jenkins username (defaults to JENKINS_USER env or 'admin')
   * @param password - Jenkins password (defaults to JENKINS_PASSWORD env or 'admin')
   */
  async login(username?: string, password?: string): Promise<void> {
    const user = username ?? DEFAULT_USERNAME;
    const pass = password ?? DEFAULT_PASSWORD;

    await this.page.goto(`${JENKINS_BASE_URL}/login`, {
      waitUntil: "domcontentloaded",
    });

    // Fill the standard Jenkins login form fields
    await this.page.fill('input[name="j_username"]', user);
    await this.page.fill('input[name="j_password"]', pass);

    // Jenkins login page may use either <button type="submit"> or <input name="Submit">
    // depending on the version/configuration. Use a combined selector for resilience.
    const submitButton = this.page.locator(
      'button[type="submit"], input[name="Submit"]',
    );
    await submitButton.first().click();

    // Wait for navigation to complete — successful login redirects to the
    // dashboard or the originally requested page. The session cookie and
    // CSRF crumb are automatically set by Jenkins during the login flow
    // (see crumb.init() pattern in src/main/js/api/pluginManager.js).
    await this.page.waitForLoadState("domcontentloaded");
  }

  // -----------------------------------------------------------------------
  // Page Navigation Methods
  // -----------------------------------------------------------------------

  /**
   * Navigate to the main Jenkins dashboard.
   *
   * The root URL '/' serves as the main dashboard showing the default view
   * (typically AllView) with project list, executors panel, and build queue.
   */
  async navigateToDashboard(): Promise<void> {
    await this.goto("/");
    await this.page
      .locator("#main-panel")
      .waitFor({ state: "visible", timeout: DEFAULT_WAIT_TIMEOUT });
  }

  /**
   * Navigate to a job's detail page.
   *
   * URL pattern: /job/{name}/ — matches the Stapler REST endpoint
   * GET /job/{name}/api/json for the job model data.
   *
   * Uses encodeURIComponent for the job name to handle special characters,
   * consistent with the pattern in src/main/js/api/search.js line 6.
   *
   * @param jobName - The name of the Jenkins job to navigate to
   */
  async navigateToJob(jobName: string): Promise<void> {
    await this.goto(`/job/${encodeURIComponent(jobName)}/`);
    await this.page
      .locator("#main-panel")
      .waitFor({ state: "visible", timeout: DEFAULT_WAIT_TIMEOUT });
  }

  /**
   * Navigate to a specific build's detail page.
   *
   * URL pattern: /job/{name}/{buildNumber}/ — matches the Stapler REST
   * endpoint GET /job/{name}/{buildNumber}/api/json for build model data.
   *
   * @param jobName - The name of the Jenkins job
   * @param buildNumber - The build number to inspect
   */
  async navigateToBuild(
    jobName: string,
    buildNumber: number,
  ): Promise<void> {
    await this.goto(
      `/job/${encodeURIComponent(jobName)}/${buildNumber}/`,
    );
    await this.page
      .locator("#main-panel")
      .waitFor({ state: "visible", timeout: DEFAULT_WAIT_TIMEOUT });
  }

  /**
   * Navigate to the Plugin Manager page.
   *
   * URL pattern: /pluginManager/ — the entry point for plugin management.
   * Matches endpoint paths from src/main/js/api/pluginManager.js such as
   * /pluginManager/plugins, /pluginManager/installPlugins, etc.
   */
  async navigateToPluginManager(): Promise<void> {
    await this.goto("/pluginManager/");
    await this.page
      .locator("#main-panel")
      .waitFor({ state: "visible", timeout: DEFAULT_WAIT_TIMEOUT });
  }

  /**
   * Navigate to the Manage Jenkins administration page.
   *
   * URL pattern: /manage/ — provides access to all Jenkins administration
   * categories including system configuration, security, and diagnostics.
   */
  async navigateToManageJenkins(): Promise<void> {
    await this.goto("/manage/");
    await this.page
      .locator("#main-panel")
      .waitFor({ state: "visible", timeout: DEFAULT_WAIT_TIMEOUT });
  }

  /**
   * Navigate to the Computer Set (Nodes) management page.
   *
   * URL pattern: /computer/ — matches the Stapler REST endpoint
   * GET /computer/api/json for the node management data.
   */
  async navigateToComputerSet(): Promise<void> {
    await this.goto("/computer/");
    await this.page
      .locator("#main-panel")
      .waitFor({ state: "visible", timeout: DEFAULT_WAIT_TIMEOUT });
  }

  /**
   * Navigate to the New Job (New Item) creation page.
   *
   * URL pattern: /view/all/newJob — matches the hudson/model/View/newJob.jelly
   * Jelly view which renders the item type selection form.
   */
  async navigateToNewJob(): Promise<void> {
    await this.goto("/view/all/newJob");
    await this.page
      .locator("#main-panel")
      .waitFor({ state: "visible", timeout: DEFAULT_WAIT_TIMEOUT });
  }

  /**
   * Navigate to the Setup Wizard page.
   *
   * URL pattern: /setupWizard/ — matches the security configuration endpoints
   * in src/main/js/api/securityConfig.js (/setupWizard/createAdminUser,
   * /setupWizard/configureInstance) and plugin manager endpoints
   * (/setupWizard/platformPluginList, /setupWizard/completeInstall).
   */
  async navigateToSetupWizard(): Promise<void> {
    await this.goto("/setupWizard/");
    // The setup wizard container may take a moment to initialize
    await this.page
      .locator(".plugin-setup-wizard-container")
      .waitFor({ state: "visible", timeout: DEFAULT_WAIT_TIMEOUT })
      .catch(() => {
        // Fallback: wizard may not be available if Jenkins is already set up.
        // In that case, just wait for the page to be in a stable state.
      });
  }

  // -----------------------------------------------------------------------
  // Element Locator Methods
  // -----------------------------------------------------------------------

  /**
   * Get the side navigation panel locator.
   *
   * The #side-panel element contains task links, navigation items, and
   * contextual actions for the current Jenkins view.
   *
   * @returns Playwright Locator for the side panel element
   */
  getSidePanel(): Locator {
    return this.page.locator("#side-panel");
  }

  /**
   * Get the main content panel locator.
   *
   * The #main-panel element is the primary content area where Jenkins
   * renders view content — job lists, build details, configuration forms, etc.
   *
   * @returns Playwright Locator for the main panel element
   */
  getMainPanel(): Locator {
    return this.page.locator("#main-panel");
  }

  /**
   * Get the breadcrumb navigation bar locator.
   *
   * Targets both the legacy #breadcrumbBar ID and the newer .jenkins-breadcrumbs
   * class for compatibility across Jelly-rendered and React-rendered views.
   *
   * @returns Playwright Locator for the breadcrumb bar element
   */
  getBreadcrumbs(): Locator {
    return this.page.locator("#breadcrumbBar, .jenkins-breadcrumbs").first();
  }

  /**
   * Get the global search input locator.
   *
   * The #search-box element is the global search input present in the Jenkins
   * page header. Search functionality is backed by the endpoint referenced in
   * src/main/js/api/search.js via document.body.dataset.searchUrl.
   *
   * @returns Playwright Locator for the search box input
   */
  getSearchBar(): Locator {
    return this.page.locator("#search-box");
  }

  /**
   * Get the notification bar locator.
   *
   * Targets both the #notification-bar ID and the .notif-alert-default class
   * used by the Jenkins notification/toast system.
   *
   * @returns Playwright Locator for the notification bar element
   */
  getNotificationBar(): Locator {
    return this.page
      .locator("#notification-bar, .notif-alert-default")
      .first();
  }

  /**
   * Get the active dialog/modal locator.
   *
   * Targets native HTML <dialog> elements in the open state as well as
   * the .jenkins-dialog class used by the Jenkins dialog component system.
   *
   * @returns Playwright Locator for the active dialog modal
   */
  getDialogModal(): Locator {
    return this.page.locator("dialog[open], .jenkins-dialog").first();
  }

  /**
   * Get the side panel task links locator.
   *
   * The #tasks container holds .task elements representing contextual action
   * links in the side navigation panel (e.g., "New Item", "Configure",
   * "Build Now", etc.).
   *
   * @returns Playwright Locator for the collection of side panel task items
   */
  getSidePanelTasks(): Locator {
    return this.page.locator("#tasks .task");
  }

  // -----------------------------------------------------------------------
  // Wait Utilities
  // -----------------------------------------------------------------------

  /**
   * Wait for the Jenkins page to fully load.
   *
   * Waits for the DOM content to be loaded and then checks for key Jenkins
   * UI elements (#page-header or #main-panel) to be present, indicating
   * the page structure has been rendered.
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState("domcontentloaded");

    // Wait for at least one of the key structural elements to appear,
    // confirming the Jenkins page chrome has rendered
    await this.page
      .locator("#page-header, #main-panel, #page-body")
      .first()
      .waitFor({ state: "visible", timeout: DEFAULT_WAIT_TIMEOUT })
      .catch(() => {
        // Some pages (login, setup wizard) may not have standard chrome
      });
  }

  /**
   * Wait for React hydration to complete on refactored pages.
   *
   * The React root mount point is <div id="react-root"> as specified in
   * AAP Section 0.7.1 (Jelly-to-React Mount Strategy). This method waits
   * until the React root element exists AND has child content, indicating
   * that the React component tree has been mounted and hydrated.
   *
   * This is critical for the refactored React-rendered pages to ensure
   * content is ready before assertions or screenshot captures.
   */
  async waitForReactHydration(): Promise<void> {
    await this.page.waitForFunction(
      () => {
        const root = document.getElementById("react-root");
        return root !== null && root.children.length > 0;
      },
      { timeout: DEFAULT_WAIT_TIMEOUT },
    );
  }

  /**
   * Wait for API data to finish loading.
   *
   * After React hydration, components may still be fetching data from
   * Stapler REST endpoints via React Query. This method waits for loading
   * indicators (spinners, skeletons) to disappear, signaling that API
   * responses have been received and rendered.
   *
   * Uses a catch clause because loading indicators may not be present on
   * pages that load data synchronously or have already finished loading.
   */
  async waitForApiData(): Promise<void> {
    // Wait for any Jenkins spinner or skeleton loading indicator to disappear
    await this.page
      .locator(".jenkins-spinner, .skeleton")
      .waitFor({ state: "hidden", timeout: DEFAULT_WAIT_TIMEOUT })
      .catch(() => {
        // Loading indicators may not exist on this page — that is fine
      });

    // Additionally wait for React Query loading states to resolve
    await this.page
      .locator('[data-loading="true"]')
      .waitFor({ state: "hidden", timeout: DEFAULT_WAIT_TIMEOUT })
      .catch(() => {
        // Data-loading attribute may not be present
      });
  }

  // -----------------------------------------------------------------------
  // Dynamic Content Masks for Visual Regression
  // -----------------------------------------------------------------------

  /**
   * Get locators for timestamp and frequently-changing content to mask
   * during visual regression screenshot comparisons.
   *
   * These masks are consumed by Playwright's toHaveScreenshot() `mask` option
   * to prevent false-positive diff failures from dynamic content as described
   * in AAP Section 0.7.6:
   *
   * ```ts
   * await expect(page).toHaveScreenshot({
   *   mask: jenkinsPage.getTimestampMasks(),
   * });
   * ```
   *
   * Covers:
   * - Timestamps (<time> elements, .timestamp class, [data-timestamp] attributes)
   * - Build display names that may differ between baseline and refactored instances
   * - Queue position identifiers
   * - Executor progress bars (animated, non-deterministic)
   *
   * @returns Array of Locators to mask in screenshot comparisons
   */
  getTimestampMasks(): Locator[] {
    const timestampLocator = this.page.locator(
      "time, .timestamp, [data-timestamp]",
    );
    const buildNumberLocator = this.page.locator(
      ".build-link .display-name",
    );
    const queueLocator = this.page.locator(".queue-id");
    const progressLocator = this.page.locator(".progress-bar");

    return [
      timestampLocator,
      buildNumberLocator,
      queueLocator,
      progressLocator,
    ];
  }

  /**
   * Get an extended set of dynamic content masks for comprehensive visual
   * regression testing.
   *
   * Includes all timestamp masks plus additional dynamic elements:
   * - Plugin update availability badges
   * - Node monitoring status indicators
   * - Security warning banners (which may appear intermittently)
   * - Crumb tokens rendered in hidden form fields
   * - Build status animations
   *
   * @returns Array of Locators to mask in screenshot comparisons
   */
  getDynamicContentMasks(): Locator[] {
    const baseMasks = this.getTimestampMasks();

    const updateBadgeLocator = this.page.locator(
      ".jenkins-update-available, .update-center-warning",
    );
    const nodeMonitoringLocator = this.page.locator(".node-monitoring");
    const securityWarningLocator = this.page.locator(
      ".alert-danger, .jenkins-alert",
    );
    const crumbFieldLocator = this.page.locator(
      'input[name="Jenkins-Crumb"], input[name=".crumb"]',
    );
    const buildAnimationLocator = this.page.locator(
      ".build-status-icon__animation, .jenkins-build-status-icon--animate",
    );

    return [
      ...baseMasks,
      updateBadgeLocator,
      nodeMonitoringLocator,
      securityWarningLocator,
      crumbFieldLocator,
      buildAnimationLocator,
    ];
  }
}

// ---------------------------------------------------------------------------
// Custom Playwright Test Fixture
// ---------------------------------------------------------------------------

/**
 * Type definition for the custom Jenkins test fixtures.
 *
 * Extends Playwright's base test with a pre-configured JenkinsPage instance,
 * eliminating boilerplate POM setup in every test file.
 */
type JenkinsFixtures = {
  /** Pre-configured JenkinsPage Page Object Model instance */
  jenkinsPage: JenkinsPage;
};

/**
 * Custom Playwright test function with Jenkins-specific fixtures.
 *
 * Extends the base Playwright `test` with a `jenkinsPage` fixture that
 * provides a fresh JenkinsPage instance for each test. All E2E test files
 * should import this `test` instead of `@playwright/test`'s base test.
 *
 * @example
 * ```ts
 * import { test, expect } from '../fixtures/jenkins';
 *
 * test('navigate to job', async ({ jenkinsPage }) => {
 *   await jenkinsPage.login();
 *   await jenkinsPage.navigateToJob('my-pipeline');
 *   await expect(jenkinsPage.getMainPanel()).toBeVisible();
 * });
 * ```
 */
export const test = base.extend<JenkinsFixtures>({
  jenkinsPage: async ({ page }, use) => {
    const jenkinsPage = new JenkinsPage(page);
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright's `use()` fixture callback is not a React hook
    await use(jenkinsPage);
  },
});

/**
 * Re-exported Playwright expect assertion function.
 *
 * Provided for convenience so that test files only need a single import:
 * `import { test, expect } from '../fixtures/jenkins';`
 */
export { expect };
