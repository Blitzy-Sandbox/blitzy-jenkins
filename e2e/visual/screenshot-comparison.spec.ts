/**
 * e2e/visual/screenshot-comparison.spec.ts
 *
 * Per-view visual regression screenshot comparison tests for the Jenkins
 * React migration. Uses Playwright's built-in `toHaveScreenshot()` assertion
 * with pixelmatch-based pixel-by-pixel comparison to validate that the
 * refactored React-rendered UI matches the Jelly-rendered baseline across
 * all 10 primary Jenkins views.
 *
 * Architecture:
 * - Two Jenkins instances (baseline Jelly + refactored React) run in parallel
 *   on Kubernetes with identical JENKINS_HOME state.
 * - This spec captures screenshots from whichever instance `JENKINS_URL` points
 *   to. Baseline screenshots are committed to `docs/screenshots/` via the
 *   `snapshotDir` setting in `playwright.config.ts`.
 * - Dynamic content (timestamps, build numbers, queue positions, progress bars)
 *   is masked to prevent false-positive diff failures.
 *
 * Thresholds are configured per view:
 * - Default: maxDiffPixels=100, threshold=0.2
 * - Complex forms (job-configure): maxDiffPixels=150
 * - Highly dynamic pages (build-console): maxDiffPixels=200
 *
 * @see AAP Section 0.7.6 — Screenshot Validation Architecture
 * @see AAP Section 0.8.2 — Visual Symmetry Validation (Hard Gate)
 */

import type { Page, Locator } from "@playwright/test";
import { test, expect } from "../fixtures/jenkins";

// ---------------------------------------------------------------------------
// Configuration constants — aligned with playwright.config.ts defaults
// ---------------------------------------------------------------------------

/** Maximum number of pixels that may differ before a screenshot comparison fails. */
const DEFAULT_MAX_DIFF_PIXELS = 100;

/**
 * Per-pixel colour-distance threshold (0–1).
 * A value of 0.2 tolerates minor anti-aliasing differences across renderers.
 */
const DEFAULT_THRESHOLD = 0.2;

// ---------------------------------------------------------------------------
// Dynamic content mask helper
// ---------------------------------------------------------------------------

/**
 * Returns an array of Playwright `Locator` objects that cover dynamic or
 * frequently-changing DOM elements. These are masked (painted over) in
 * screenshots to prevent false-positive diff failures.
 *
 * Masked elements include:
 * - Timestamps (`time`, `.timestamp`, `[data-timestamp]`)
 * - Build display names / numbers (`.build-link .display-name`)
 * - Queue position identifiers (`.queue-id`)
 * - Executor progress bars (`.progress-bar`)
 * - Update-available banners (`.jenkins-update-available`)
 * - Node monitoring widgets (`.node-monitoring`)
 *
 * @param page - The Playwright `Page` instance for the current test.
 * @returns Array of `Locator` objects to pass as `mask` to `toHaveScreenshot()`.
 *
 * @see AAP Section 0.7.6 — "Timestamps, build numbers, queue positions, and
 *   other dynamic content are masked using Playwright's `mask` option"
 */
function getDynamicMasks(page: Page): Locator[] {
  return [
    page.locator(".timestamp"),
    page.locator("time"),
    page.locator("[data-timestamp]"),
    page.locator(".build-link .display-name"),
    page.locator(".queue-id"),
    page.locator(".progress-bar"),
    page.locator(".jenkins-update-available"),
    page.locator(".node-monitoring"),
  ];
}

// ===========================================================================
// Authenticated view tests
// ===========================================================================

test.describe("Visual Regression - Screenshot Comparison", () => {
  /**
   * Authenticate before each screenshot test so that all captures reflect the
   * logged-in admin experience. The JenkinsPage POM handles credential entry
   * and post-login wait automatically.
   */
  test.beforeEach(async ({ jenkinsPage }) => {
    await jenkinsPage.login();
  });

  // -------------------------------------------------------------------------
  // 1. Dashboard — main view
  // -------------------------------------------------------------------------

  /**
   * Captures the root dashboard view which includes the project list
   * (ProjectView), executor status panel, and build queue panel.
   *
   * Corresponds to:
   * - Source Jelly: `core/src/main/resources/hudson/model/AllView/index.jelly`
   * - React target: `src/main/tsx/pages/dashboard/Dashboard.tsx`
   * - JS bootstrap: `src/main/js/app.js` (initialises Dropdowns, CommandPalette,
   *   SearchBar, Notifications, Header, Tooltips, StopButtonLink, etc.)
   */
  test("dashboard - main view", async ({ jenkinsPage, page }) => {
    await jenkinsPage.navigateToDashboard();
    await jenkinsPage.waitForPageLoad();

    await expect(page).toHaveScreenshot("dashboard.png", {
      maxDiffPixels: DEFAULT_MAX_DIFF_PIXELS,
      threshold: DEFAULT_THRESHOLD,
      mask: getDynamicMasks(page),
    });
  });

  // -------------------------------------------------------------------------
  // 2. Job Index — job detail page
  // -------------------------------------------------------------------------

  /**
   * Captures a job detail page showing the job description, build history
   * sidebar card, and side-panel action links.
   *
   * Both Jenkins instances share an identical JENKINS_HOME, so the job
   * `test-freestyle-job` exists on both the baseline and refactored instances.
   *
   * Corresponds to:
   * - Source Jelly: `core/src/main/resources/hudson/model/Job/index.jelly`
   * - React target: `src/main/tsx/pages/job/JobIndex.tsx`
   * - Stapler endpoint: `GET /job/{name}/api/json`
   */
  test("job-index - job detail page", async ({ jenkinsPage, page }) => {
    await jenkinsPage.goto("/job/test-freestyle-job/");
    await jenkinsPage.waitForPageLoad();

    await expect(page).toHaveScreenshot("job-index.png", {
      maxDiffPixels: DEFAULT_MAX_DIFF_PIXELS,
      threshold: DEFAULT_THRESHOLD,
      mask: getDynamicMasks(page),
    });
  });

  // -------------------------------------------------------------------------
  // 3. Job Configure — configuration form
  // -------------------------------------------------------------------------

  /**
   * Captures the job configuration form which includes complex form components:
   * TextBox, Checkbox, Select, OptionalBlock, Repeatable, HeteroList, and
   * AdvancedBlock. A higher `maxDiffPixels` threshold (150) is used because
   * form layouts may exhibit minor rendering variations between Jelly and React.
   *
   * Corresponds to:
   * - Source Jelly: `core/src/main/resources/hudson/model/Job/configure.jelly`
   * - React target: `src/main/tsx/pages/job/JobConfigure.tsx`
   * - Stapler URL: `/job/{name}/configure`
   */
  test("job-configure - configuration form", async ({ jenkinsPage, page }) => {
    await jenkinsPage.goto("/job/test-freestyle-job/configure");
    await jenkinsPage.waitForPageLoad();

    await expect(page).toHaveScreenshot("job-configure.png", {
      maxDiffPixels: 150,
      threshold: DEFAULT_THRESHOLD,
      mask: getDynamicMasks(page),
    });
  });

  // -------------------------------------------------------------------------
  // 4. Build Console — console output
  // -------------------------------------------------------------------------

  /**
   * Captures the build console output page. Console content is highly dynamic
   * (timestamps embedded in log lines, streaming via progressive text endpoint)
   * so a larger `maxDiffPixels` (200) and an additional mask for the console
   * output area are applied.
   *
   * Corresponds to:
   * - Source Jelly: `core/src/main/resources/hudson/model/Run/console.jelly`
   * - React target: `src/main/tsx/pages/build/ConsoleOutput.tsx`
   * - Stapler endpoint: `GET /job/{name}/{buildNumber}/logText/progressiveText`
   */
  test("build-console - console output", async ({ jenkinsPage, page }) => {
    await jenkinsPage.goto("/job/test-freestyle-job/1/console");
    await jenkinsPage.waitForPageLoad();

    await expect(page).toHaveScreenshot("build-console.png", {
      maxDiffPixels: 200,
      threshold: DEFAULT_THRESHOLD,
      mask: [...getDynamicMasks(page), page.locator(".console-output")],
    });
  });

  // -------------------------------------------------------------------------
  // 5. Plugin Manager — main view
  // -------------------------------------------------------------------------

  /**
   * Captures the plugin manager page which renders a tabbed interface for
   * Installed / Available / Updates / Advanced plugin management.
   *
   * Additional masks cover plugin version strings and update center status
   * messages, both of which vary between captures.
   *
   * Corresponds to:
   * - Source Jelly: `core/src/main/resources/hudson/PluginManager/index.jelly`
   * - React target: `src/main/tsx/pages/plugin-manager/PluginManagerIndex.tsx`
   * - API endpoints: `/pluginManager/available`, `/pluginManager/installPlugins`,
   *   `/pluginManager/installStatus` (from `src/main/js/api/pluginManager.js`)
   */
  test("plugin-manager - main view", async ({ jenkinsPage, page }) => {
    await jenkinsPage.navigateToPluginManager();
    await jenkinsPage.waitForPageLoad();

    await expect(page).toHaveScreenshot("plugin-manager.png", {
      maxDiffPixels: DEFAULT_MAX_DIFF_PIXELS,
      threshold: DEFAULT_THRESHOLD,
      mask: [
        ...getDynamicMasks(page),
        page.locator(".plugin-version"),
        page.locator(".update-center-message"),
      ],
    });
  });

  // -------------------------------------------------------------------------
  // 6. Manage Jenkins — admin page
  // -------------------------------------------------------------------------

  /**
   * Captures the Manage Jenkins admin landing page which displays management
   * category cards and active administrative monitors.
   *
   * Admin monitor messages (security warnings, pending restarts, etc.) are
   * dynamic and require masking.
   *
   * Corresponds to:
   * - Source JS: `src/main/js/pages/manage-jenkins/index.js`
   *   (wires `#settings-search-bar` suggestions and `.jenkins-section__item`)
   * - Source Jelly: `core/src/main/resources/jenkins/management/
   *   AdministrativeMonitorsDecorator/index.jelly`
   * - React target: `src/main/tsx/pages/manage-jenkins/ManageJenkins.tsx`
   * - Stapler URL: `/manage/`
   */
  test("manage-jenkins - admin page", async ({ jenkinsPage, page }) => {
    await jenkinsPage.navigateToManageJenkins();
    await jenkinsPage.waitForPageLoad();

    await expect(page).toHaveScreenshot("manage-jenkins.png", {
      maxDiffPixels: DEFAULT_MAX_DIFF_PIXELS,
      threshold: DEFAULT_THRESHOLD,
      mask: [...getDynamicMasks(page), page.locator(".jenkins-admin-monitor")],
    });
  });

  // -------------------------------------------------------------------------
  // 7. Setup Wizard — welcome panel
  // -------------------------------------------------------------------------

  /**
   * Captures the first-run setup wizard welcome panel. In dual-instance
   * testing the wizard is accessible via `/setupWizard/` when the instance
   * is configured to show the first-run experience.
   *
   * The POM's `navigateToSetupWizard()` waits for the
   * `.plugin-setup-wizard-container` to be visible before yielding.
   *
   * Corresponds to:
   * - Source JS: `src/main/js/pluginSetupWizardGui.js` — orchestration hub
   *   using Handlebars templates (welcomePanel, pluginSelectionPanel, etc.)
   * - Source API: `src/main/js/api/securityConfig.js` — `saveFirstUser`,
   *   `saveConfigureInstance` mutations via `jenkins.staplerPost()`
   * - React target: `src/main/tsx/pages/setup-wizard/SetupWizard.tsx`
   */
  test("setup-wizard - welcome panel", async ({ jenkinsPage, page }) => {
    await jenkinsPage.navigateToSetupWizard();
    await jenkinsPage.waitForPageLoad();

    await expect(page).toHaveScreenshot("setup-wizard.png", {
      maxDiffPixels: DEFAULT_MAX_DIFF_PIXELS,
      threshold: DEFAULT_THRESHOLD,
      mask: getDynamicMasks(page),
    });
  });

  // -------------------------------------------------------------------------
  // 8. Computer Set — nodes management
  // -------------------------------------------------------------------------

  /**
   * Captures the node management (Computer Set) page which lists all
   * connected agents and the built-in node with their monitoring data.
   *
   * Node monitoring statistics (disk space, clock difference, response time)
   * are inherently dynamic and are masked via `.computer-monitoring`.
   *
   * Corresponds to:
   * - Source Jelly: `core/src/main/resources/hudson/model/ComputerSet/index.jelly`
   * - React target: `src/main/tsx/pages/computer/ComputerSet.tsx`
   * - Stapler endpoint: `GET /computer/api/json`
   */
  test("computer-set - nodes management", async ({ jenkinsPage, page }) => {
    await jenkinsPage.navigateToComputerSet();
    await jenkinsPage.waitForPageLoad();

    await expect(page).toHaveScreenshot("computer-set.png", {
      maxDiffPixels: DEFAULT_MAX_DIFF_PIXELS,
      threshold: DEFAULT_THRESHOLD,
      mask: [...getDynamicMasks(page), page.locator(".computer-monitoring")],
    });
  });

  // -------------------------------------------------------------------------
  // 9. Cloud Set — cloud configuration
  // -------------------------------------------------------------------------

  /**
   * Captures the cloud configuration page which renders sortable tables for
   * cloud provider entries.
   *
   * Corresponds to:
   * - Source JS: `src/main/js/pages/cloud-set/index.js`
   *   (registers `registerSortableTableDragDrop` on DOMContentLoaded)
   * - React target: `src/main/tsx/pages/cloud/CloudSet.tsx`
   * - Stapler URL: `/cloud/`
   */
  test("cloud-set - cloud configuration", async ({ jenkinsPage, page }) => {
    await jenkinsPage.goto("/cloud/");
    await jenkinsPage.waitForPageLoad();

    await expect(page).toHaveScreenshot("cloud-set.png", {
      maxDiffPixels: DEFAULT_MAX_DIFF_PIXELS,
      threshold: DEFAULT_THRESHOLD,
      mask: getDynamicMasks(page),
    });
  });
});

// ===========================================================================
// Unauthenticated view tests
// ===========================================================================

test.describe("Visual Regression - Unauthenticated Views", () => {
  // -------------------------------------------------------------------------
  // 10. Sign-in / Register — login page
  // -------------------------------------------------------------------------

  /**
   * Captures the login/registration page WITHOUT prior authentication.
   * This test is deliberately placed in a separate `test.describe` block
   * that does NOT include a `beforeEach` login hook.
   *
   * The login page has minimal dynamic content so no additional masks are
   * required beyond the defaults.
   *
   * Corresponds to:
   * - Source JS: `src/main/js/pages/register/index.js` — password strength UX
   *   with `#password1`, `#password2`, `#showPassword`,
   *   `#passwordStrengthWrapper`
   * - React target: `src/main/tsx/pages/security/SignInRegister.tsx`
   * - Stapler URL: `/login`
   */
  test("sign-in-register - login page", async ({ jenkinsPage, page }) => {
    await jenkinsPage.goto("/login");
    await jenkinsPage.waitForPageLoad();

    await expect(page).toHaveScreenshot("sign-in-register.png", {
      maxDiffPixels: DEFAULT_MAX_DIFF_PIXELS,
      threshold: DEFAULT_THRESHOLD,
    });
  });
});
