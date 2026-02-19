/**
 * Playwright Configuration for Jenkins Core UI — Visual Regression & E2E Testing
 *
 * This configuration supports the Jenkins Jelly-to-React migration by providing:
 *
 * 1. **Visual Regression Testing**: Pixel-by-pixel screenshot comparison between
 *    the baseline Jelly-rendered Jenkins instance and the refactored React-rendered
 *    instance using Playwright's built-in `toHaveScreenshot()` with pixelmatch.
 *
 * 2. **End-to-End User Flow Testing**: Automated functional tests covering all
 *    critical Jenkins user flows (job creation, build triggering, console output,
 *    plugin management, etc.) as defined in `docs/user-flows.md`.
 *
 * Architecture:
 *   - Two Jenkins instances run in parallel on Kubernetes with identical JENKINS_HOME
 *   - Playwright E2E tests execute identical user flows against both instances
 *   - `toHaveScreenshot()` captures baseline screenshots from the Jelly instance
 *   - The same tests capture refactored screenshots from the React instance
 *   - Pixel-by-pixel comparison using pixelmatch determines pass/fail per view
 *   - Dynamic content (timestamps, build numbers, queue positions) is masked
 *     per-test via the `mask` option on `toHaveScreenshot()` calls
 *
 * Screenshot storage follows the documentation structure:
 *   `docs/screenshots/<testFileDir>/<screenshotName>.png`
 *
 * Environment variables:
 *   - `CI`           — Set to any truthy value in CI environments to enable
 *                       stricter settings (forbidOnly, sequential workers, retries)
 *   - `JENKINS_URL`  — Base URL of the Jenkins instance under test
 *                       (defaults to `http://localhost:8080/jenkins`)
 *
 * @see {@link https://playwright.dev/docs/test-configuration} Playwright Configuration
 * @see {@link https://playwright.dev/docs/test-snapshots} Visual Comparisons
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  /* ---------------------------------------------------------------------------
   * Test Discovery
   * --------------------------------------------------------------------------- */

  /**
   * Directory containing all E2E test specifications.
   * Organized as:
   *   e2e/flows/   — User flow tests (dashboard, job-create, build-trigger, etc.)
   *   e2e/visual/  — Visual regression screenshot comparison tests
   *   e2e/fixtures/ — Shared page object models and test utilities
   */
  testDir: "./e2e",

  /**
   * Directory for test artifacts: traces, screenshots on failure, and videos.
   * Kept separate from the snapshot baseline directory to avoid polluting
   * the versioned screenshot baselines with transient test run artifacts.
   */
  outputDir: "./e2e/test-results",

  /* ---------------------------------------------------------------------------
   * Execution Strategy
   * --------------------------------------------------------------------------- */

  /**
   * Run tests in parallel across files for faster CI feedback.
   * Individual test files can opt out via `test.describe.serial()` if needed
   * for tests that share mutable Jenkins state (e.g., sequential job operations).
   */
  fullyParallel: true,

  /**
   * Prevent accidental `.only()` usage from reaching CI.
   * In local development, `.only()` is permitted for focused debugging.
   */
  forbidOnly: !!process.env.CI,

  /**
   * Retry failed tests in CI to mitigate transient Jenkins startup delays
   * and network timing issues. No retries locally for faster feedback loops.
   */
  retries: process.env.CI ? 2 : 0,

  /**
   * Limit to a single worker in CI to prevent resource contention against the
   * Jenkins instance under test. Locally, use all available CPU cores.
   */
  workers: process.env.CI ? 1 : undefined,

  /* ---------------------------------------------------------------------------
   * Reporting
   * --------------------------------------------------------------------------- */

  /**
   * CI uses the HTML reporter for rich artifact storage in build systems;
   * `open: "never"` prevents attempting to launch a browser on headless CI.
   * Local development uses the concise `list` reporter for terminal output.
   */
  reporter: process.env.CI ? [["html", { open: "never" }]] : "list",

  /* ---------------------------------------------------------------------------
   * Visual Regression — Screenshot Comparison Thresholds
   * --------------------------------------------------------------------------- */

  expect: {
    toHaveScreenshot: {
      /**
       * Maximum number of pixels that may differ between the baseline and
       * actual screenshots before the comparison is considered a failure.
       * Set to 100 as a default tolerance to accommodate minor anti-aliasing
       * and sub-pixel rendering differences across environments.
       * Individual tests may override this per-view during test authoring.
       */
      maxDiffPixels: 100,

      /**
       * Per-pixel color difference threshold (0 to 1). A value of 0.2 means
       * a 20% color difference is tolerated before a pixel counts as "different".
       * This helps absorb minor color rendering variations between the Jelly
       * server-rendered baseline and the React client-rendered refactored output.
       */
      threshold: 0.2,
    },
  },

  /* ---------------------------------------------------------------------------
   * Snapshot Configuration
   * --------------------------------------------------------------------------- */

  /**
   * Root directory for storing baseline and golden screenshots.
   * Aligns with the documentation structure defined in the AAP:
   *   docs/screenshots/<view-name>/baseline.png
   *   docs/screenshots/<view-name>/refactored.png
   */
  snapshotDir: "./docs/screenshots",

  /**
   * Template for organizing snapshot files within the snapshot directory.
   * Produces paths like: `docs/screenshots/flows/dashboard/screenshot-name.png`
   *
   * Placeholders:
   *   {snapshotDir}  — Resolved to `./docs/screenshots`
   *   {testFileDir}  — Test file path relative to testDir (e.g., `flows` or `visual`)
   *   {arg}          — Screenshot name argument passed to `toHaveScreenshot()`
   *   {ext}          — File extension (`.png`)
   */
  snapshotPathTemplate: "{snapshotDir}/{testFileDir}/{arg}{ext}",

  /* ---------------------------------------------------------------------------
   * Shared Browser Context Configuration
   * --------------------------------------------------------------------------- */

  use: {
    /**
     * Base URL for all page.goto() calls and API requests.
     * Reads from the JENKINS_URL environment variable to support:
     *   - Local development: defaults to localhost:8080/jenkins
     *   - CI baseline instance: JENKINS_URL=http://jenkins-baseline:8080/jenkins
     *   - CI refactored instance: JENKINS_URL=http://jenkins-refactored:8080/jenkins
     */
    baseURL: process.env.JENKINS_URL || "http://localhost:8080/jenkins",

    /**
     * Capture screenshots only when a test fails. Successful tests rely on
     * explicit `toHaveScreenshot()` calls for visual regression rather than
     * automatic captures, keeping the test-results directory lean.
     */
    screenshot: "only-on-failure",

    /**
     * Record traces on the first retry of a failed test. Traces provide a
     * full timeline of network requests, DOM snapshots, and console output
     * for debugging intermittent failures without the overhead of tracing
     * every successful test run.
     */
    trace: "on-first-retry",
  },

  /* ---------------------------------------------------------------------------
   * Browser Projects
   * --------------------------------------------------------------------------- */

  /**
   * Test against Chromium Desktop Chrome as the primary browser target.
   * Jenkins core targets modern evergreen browsers; Chromium provides the
   * most consistent rendering baseline for visual regression comparison.
   *
   * Additional browser projects (Firefox, WebKit) can be added here when
   * cross-browser visual regression coverage is required.
   */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* ---------------------------------------------------------------------------
   * Web Server (Optional — for local development)
   * ---------------------------------------------------------------------------
   * Uncomment the section below to have Playwright automatically start the
   * Vite development server before running tests locally. In CI, Jenkins
   * instances are pre-provisioned on Kubernetes, so this is not needed.
   *
   * webServer: {
   *   command: "yarn dev",
   *   url: "http://localhost:8080/jenkins",
   *   reuseExistingServer: !process.env.CI,
   * },
   */
});
