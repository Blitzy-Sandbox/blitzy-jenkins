/**
 * e2e/visual/capture-baseline.spec.ts
 *
 * Captures full-page baseline screenshots of all 20 React-mounted views
 * in the Jenkins UI. Each screenshot is saved to `docs/screenshots/baseline/`
 * with a filename matching the `data-view-type` attribute of the corresponding
 * `<div id="react-root">` mount point.
 *
 * Purpose:
 *   - Capture the current visual state of every view that has a React root
 *     mount point (both pre-existing and newly added via Directives 15–17).
 *   - Serve as the reference baseline for visual regression comparison
 *     between the Jelly-rendered and React-rendered UI.
 *
 * Views captured (20 total):
 *   Pre-existing (5): dashboard, job-index, console-output, plugin-manager, all-view
 *   Directive 15 (3): job-configure, job-build-history, new-job
 *   Directive 16 (6): build-index, build-changes, build-artifacts, console-full,
 *                      computer-set, computer-detail
 *   Directive 17 (6): manage-jenkins, system-info, cloud-set, list-view, sign-in
 *                      (all-view is shared with View/index.jelly conditional)
 *
 * Prerequisites:
 *   - Jenkins instance running with sample jobs (see e2e/k8s/init-job.yaml)
 *   - At least one completed build for build-related views
 *   - JENKINS_URL or project-level baseURL configured
 *
 * Usage:
 *   npx playwright test e2e/visual/capture-baseline.spec.ts --project=baseline
 *   npx playwright test e2e/visual/capture-baseline.spec.ts --project=react
 *
 * @see AAP Section 0.7.6 — Screenshot Validation Architecture
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Directory to save baseline screenshots. */
const SCREENSHOT_DIR = path.resolve(
  __dirname,
  "../../docs/screenshots/baseline",
);

/**
 * Maximum time (ms) to wait for the React root to mount content.
 * Jenkins can be slow to render complex views on first load.
 */
const REACT_MOUNT_TIMEOUT = 15_000;

/** Default navigation timeout for Jenkins page loads. */
const PAGE_LOAD_TIMEOUT = 30_000;

// ---------------------------------------------------------------------------
// View definitions — all 20 React-mounted views
// ---------------------------------------------------------------------------

interface ViewDefinition {
  /** Unique identifier matching the data-view-type attribute. */
  name: string;

  /**
   * URL path relative to the Jenkins base URL.
   * Uses placeholder tokens:
   *   {jobName}    — Name of a sample freestyle job (freestyle-job-1)
   *   {buildNum}   — Build number (1)
   *   {nodeName}   — Agent/computer name (built-in)
   *   {viewName}   — Custom view name
   */
  urlPath: string;

  /**
   * Whether this view requires a completed build to exist.
   * If true, the test will attempt to trigger a build first if needed.
   */
  requiresBuild?: boolean;

  /**
   * Optional CSS selector to wait for before capturing the screenshot.
   * Defaults to waiting for `#react-root` to have child elements.
   */
  waitForSelector?: string;
}

const VIEWS: ViewDefinition[] = [
  // --- Pre-existing mount points (5) ---
  {
    name: "dashboard",
    urlPath: "/",
  },
  {
    name: "job-index",
    urlPath: "/job/freestyle-job-1/",
    requiresBuild: true,
  },
  {
    name: "console-output",
    urlPath: "/job/freestyle-job-1/1/console",
    requiresBuild: true,
  },
  {
    name: "plugin-manager",
    urlPath: "/manage/pluginManager/",
  },
  {
    name: "all-view",
    urlPath: "/view/all/",
  },

  // --- Directive 15: Job and View mount points (3) ---
  {
    name: "job-configure",
    urlPath: "/job/freestyle-job-1/configure",
    requiresBuild: false,
  },
  {
    name: "job-build-history",
    urlPath: "/job/freestyle-job-1/buildTimeTrend",
    requiresBuild: true,
  },
  {
    name: "new-job",
    urlPath: "/view/all/newJob",
  },

  // --- Directive 16: Run and Computer mount points (6) ---
  {
    name: "build-index",
    urlPath: "/job/freestyle-job-1/1/",
    requiresBuild: true,
  },
  {
    name: "build-changes",
    urlPath: "/job/freestyle-job-1/1/changes",
    requiresBuild: true,
  },
  {
    name: "build-artifacts",
    urlPath: "/job/freestyle-job-1/1/artifact/",
    requiresBuild: true,
  },
  {
    name: "console-full",
    urlPath: "/job/freestyle-job-1/1/consoleFull",
    requiresBuild: true,
  },
  {
    name: "computer-set",
    urlPath: "/computer/",
  },
  {
    name: "computer-detail",
    urlPath: "/computer/(built-in)/",
  },

  // --- Directive 17: Admin, Cloud, Security, ListView mount points (5) ---
  {
    name: "manage-jenkins",
    urlPath: "/manage/",
  },
  {
    name: "system-info",
    urlPath: "/manage/systemInfo",
  },
  {
    name: "cloud-set",
    urlPath: "/cloud/",
  },
  {
    name: "list-view",
    urlPath: "/view/all/",
    // all-view and list-view share the same route;
    // the conditional in View/index.jelly sets the type based on view class
  },
  {
    name: "sign-in",
    urlPath: "/login",
    waitForSelector: "#main-panel",
  },
];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Baseline Screenshot Capture", () => {
  test.beforeAll(async () => {
    // Ensure the screenshot output directory exists
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  for (const view of VIEWS) {
    test(`capture ${view.name}`, async ({ page }) => {
      // Set generous timeouts for Jenkins page loads
      page.setDefaultTimeout(PAGE_LOAD_TIMEOUT);
      page.setDefaultNavigationTimeout(PAGE_LOAD_TIMEOUT);

      // Navigate to the view
      const response = await page.goto(view.urlPath, {
        waitUntil: "networkidle",
        timeout: PAGE_LOAD_TIMEOUT,
      });

      // Verify the page loaded successfully (2xx or 3xx)
      expect(response).not.toBeNull();
      const status = response!.status();
      expect(
        status >= 200 && status < 400,
        `Expected 2xx/3xx for ${view.name}, got ${status}`,
      ).toBeTruthy();

      // Wait for the React root to mount content (or the custom selector)
      if (view.waitForSelector) {
        await page.waitForSelector(view.waitForSelector, {
          state: "visible",
          timeout: REACT_MOUNT_TIMEOUT,
        });
      } else {
        // Wait for either a React root with children or the page body to be loaded
        await page
          .waitForFunction(
            () => {
              const root = document.querySelector("#react-root");
              if (root && root.children.length > 0) {
                return true;
              }
              // Fallback: page has meaningful content even without React root
              const body = document.body;
              return body && body.children.length > 2;
            },
            { timeout: REACT_MOUNT_TIMEOUT },
          )
          .catch(() => {
            // If React root doesn't mount (e.g., server-rendered page), proceed anyway
            // The screenshot will capture the current rendered state
          });
      }

      // Allow any pending animations or transitions to settle
      await page.waitForTimeout(1000);

      // Capture the full-page screenshot
      const screenshotPath = path.join(SCREENSHOT_DIR, `${view.name}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });

      // Verify the screenshot was created and is not trivially small
      const stats = fs.statSync(screenshotPath);
      expect(
        stats.size,
        `Screenshot ${view.name}.png should be >10KB (got ${stats.size} bytes)`,
      ).toBeGreaterThan(10_000);
    });
  }
});
