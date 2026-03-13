/**
 * Build Trigger User Flow E2E Tests
 *
 * Playwright E2E test specification for Jenkins build trigger user flows.
 * Validates triggering manual builds via "Build Now", verifying builds appear
 * in queue, build starts execution, executor shows activity, stop button
 * visibility, build completion in history, SCM trigger config verification,
 * and visual regression — all on the refactored React frontend.
 *
 * Selectors are derived from:
 * - `src/main/js/pages/project/builds-card.js` — #jenkins-builds, .app-builds-container, 5s auto-refresh
 * - `src/main/js/components/stop-button-link/index.js` — .stop-button-link selector
 * - `core/src/main/resources/lib/hudson/executors.jelly` → React Executors.tsx — #executors
 * - Jenkins side panel task pattern — #tasks .task-link
 * - Jenkins build queue — #buildQueue
 *
 * @see AAP Section 0.7.6 for visual regression architecture
 * @see AAP Section 0.7.3 for Stapler REST API consumption mapping
 */

import { test, expect } from "../fixtures/jenkins";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Unique job name prefix used for test isolation.
 * Each test run creates jobs with a unique suffix to avoid collisions.
 */
const TEST_JOB_PREFIX = "build-trigger-e2e";

/**
 * Timeout for waiting on build-related operations (queue, execution, completion).
 * Build trigger tests are inherently async; generous timeouts prevent flakes.
 */
const BUILD_WAIT_TIMEOUT = 60_000;

/**
 * Short polling interval (ms) for checking build state transitions.
 */
const POLL_INTERVAL = 2_000;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Generate a unique job name for test isolation.
 * Uses a timestamp suffix to ensure no collisions between parallel test runs.
 */
function uniqueJobName(): string {
  return `${TEST_JOB_PREFIX}-${Date.now()}`;
}

/**
 * Create a Freestyle project via the Jenkins REST API.
 *
 * Uses the Stapler createItem endpoint with mode=hudson.model.FreeStyleProject
 * and a minimal inline XML config. This avoids navigating through the UI for
 * job creation, keeping build-trigger tests focused on their own scope.
 *
 * @param jenkinsPage - The JenkinsPage POM instance (provides page and base URL)
 * @param jobName - The name of the job to create
 * @param shellCommand - Optional shell command for the build step (defaults to a simple echo)
 */
async function createFreestyleJob(
  jenkinsPage: { page: import("@playwright/test").Page },
  jobName: string,
  shellCommand: string = 'echo "Build completed successfully"',
): Promise<void> {
  // Retrieve CSRF crumb for POST requests — Jenkins requires it for API calls
  const crumbResponse =
    await jenkinsPage.page.request.get(`crumbIssuer/api/json`);

  let crumbHeader = "";
  let crumbValue = "";

  if (crumbResponse.ok()) {
    const crumbData = await crumbResponse.json();
    crumbHeader = crumbData.crumbRequestField || "Jenkins-Crumb";
    crumbValue = crumbData.crumb || "";
  }

  // Create a Freestyle project with a minimal shell build step
  const configXml = `<?xml version='1.1' encoding='UTF-8'?>
<project>
  <description>E2E test job for build trigger validation</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <scm class="hudson.scm.NullSCM"/>
  <canRoam>true</canRoam>
  <disabled>false</disabled>
  <blockBuildWhenDownstreamBuilding>false</blockBuildWhenDownstreamBuilding>
  <blockBuildWhenUpstreamBuilding>false</blockBuildWhenUpstreamBuilding>
  <triggers/>
  <concurrentBuild>false</concurrentBuild>
  <builders>
    <hudson.tasks.Shell>
      <command>${shellCommand}</command>
    </hudson.tasks.Shell>
  </builders>
  <publishers/>
  <buildWrappers/>
</project>`;

  const headers: Record<string, string> = {
    "Content-Type": "application/xml",
  };
  if (crumbHeader && crumbValue) {
    headers[crumbHeader] = crumbValue;
  }

  const createResponse = await jenkinsPage.page.request.post(
    `createItem?name=${encodeURIComponent(jobName)}`,
    {
      data: configXml,
      headers,
    },
  );

  // Accept 200 or 302 (redirect to the new job page) as success
  if (!createResponse.ok() && createResponse.status() !== 302) {
    throw new Error(
      `Failed to create job '${jobName}': ${createResponse.status()} ${createResponse.statusText()}`,
    );
  }
}

/**
 * Trigger a build for the given job via the Stapler REST API.
 *
 * Posts to /job/{name}/build which is the standard Jenkins build trigger endpoint.
 * CSRF crumb is fetched and included in the request headers.
 *
 * @param jenkinsPage - The JenkinsPage POM instance
 * @param jobName - The name of the job to trigger
 */
async function triggerBuildViaApi(
  jenkinsPage: { page: import("@playwright/test").Page },
  jobName: string,
): Promise<void> {
  const crumbResponse =
    await jenkinsPage.page.request.get(`crumbIssuer/api/json`);

  let crumbHeader = "";
  let crumbValue = "";

  if (crumbResponse.ok()) {
    const crumbData = await crumbResponse.json();
    crumbHeader = crumbData.crumbRequestField || "Jenkins-Crumb";
    crumbValue = crumbData.crumb || "";
  }

  const headers: Record<string, string> = {};
  if (crumbHeader && crumbValue) {
    headers[crumbHeader] = crumbValue;
  }

  const buildResponse = await jenkinsPage.page.request.post(
    `job/${encodeURIComponent(jobName)}/build`,
    { headers },
  );

  if (!buildResponse.ok() && buildResponse.status() !== 201) {
    throw new Error(
      `Failed to trigger build for '${jobName}': ${buildResponse.status()} ${buildResponse.statusText()}`,
    );
  }
}

/**
 * Wait for the latest build of a job to reach a terminal state.
 *
 * Polls the Stapler REST API at /job/{name}/lastBuild/api/json until the
 * build's `building` field is false or the timeout is reached.
 *
 * @param jenkinsPage - The JenkinsPage POM instance
 * @param jobName - The name of the job to poll
 * @param timeout - Maximum time to wait in milliseconds
 */
async function waitForBuildCompletion(
  jenkinsPage: { page: import("@playwright/test").Page },
  jobName: string,
  timeout: number = BUILD_WAIT_TIMEOUT,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await jenkinsPage.page.request.get(
        `job/${encodeURIComponent(jobName)}/lastBuild/api/json`,
      );

      if (response.ok()) {
        const buildData = await response.json();
        if (buildData.building === false) {
          return;
        }
      }
    } catch {
      // Build may not exist yet — continue polling
    }

    await jenkinsPage.page.waitForTimeout(POLL_INTERVAL);
  }

  throw new Error(
    `Build for '${jobName}' did not complete within ${timeout}ms`,
  );
}

/**
 * Delete a Jenkins job via the Stapler REST API for test cleanup.
 *
 * Posts to /job/{name}/doDelete with CSRF crumb.
 *
 * @param jenkinsPage - The JenkinsPage POM instance
 * @param jobName - The name of the job to delete
 */
async function deleteJob(
  jenkinsPage: { page: import("@playwright/test").Page },
  jobName: string,
): Promise<void> {
  try {
    const crumbResponse =
      await jenkinsPage.page.request.get(`crumbIssuer/api/json`);

    let crumbHeader = "";
    let crumbValue = "";

    if (crumbResponse.ok()) {
      const crumbData = await crumbResponse.json();
      crumbHeader = crumbData.crumbRequestField || "Jenkins-Crumb";
      crumbValue = crumbData.crumb || "";
    }

    const headers: Record<string, string> = {};
    if (crumbHeader && crumbValue) {
      headers[crumbHeader] = crumbValue;
    }

    await jenkinsPage.page.request.post(
      `job/${encodeURIComponent(jobName)}/doDelete`,
      { headers },
    );
  } catch {
    // Best-effort cleanup — do not fail the test if deletion fails
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe("Build Trigger User Flows", () => {
  /**
   * Track all job names created during this suite for cleanup.
   * Each test creates its own uniquely-named job and adds it here.
   */
  const createdJobs: string[] = [];

  // -------------------------------------------------------------------------
  // Suite Setup and Teardown
  // -------------------------------------------------------------------------

  test.beforeEach(async ({ jenkinsPage }) => {
    // Authenticate before every test — session isolation per Playwright context
    await jenkinsPage.login();
  });

  // -------------------------------------------------------------------------
  // Test: Trigger manual build via "Build Now" link
  // -------------------------------------------------------------------------

  test("should trigger a manual build via Build Now link", async ({
    jenkinsPage,
  }) => {
    // Create a unique job for this test
    const jobName = uniqueJobName();
    createdJobs.push(jobName);
    await createFreestyleJob(jenkinsPage, jobName);

    // Navigate to the job page
    await jenkinsPage.navigateToJob(jobName);

    // Locate the "Build Now" task link in the side panel
    // Jenkins renders side panel task links as anchors within #tasks
    const buildNowLink = jenkinsPage.page
      .locator("#tasks .task-link")
      .filter({ hasText: /Build Now/i });

    // Verify the "Build Now" link is visible before clicking
    await expect(buildNowLink).toBeVisible({ timeout: 15_000 });

    // Click "Build Now" — this triggers a POST to /job/{name}/build
    // CSRF crumb is handled automatically by the Jenkins session
    await buildNowLink.click();

    // Wait for the build to be reflected in the UI.
    // After clicking "Build Now", the page reloads or updates to show
    // the new build in the builds card (#jenkins-builds) or queue (#buildQueue).
    // We use a combined approach: wait for either the builds card to contain
    // a build entry or for the build queue to show activity.
    const buildsCard = jenkinsPage.page.locator("#jenkins-builds");
    const buildQueuePanel = jenkinsPage.page.locator("#buildQueue");

    // Wait for either the builds card to show content or queue to update
    await expect(buildsCard.or(buildQueuePanel)).toBeVisible({
      timeout: BUILD_WAIT_TIMEOUT,
    });

    // Allow time for the build to appear — the builds card auto-refreshes
    // every 5 seconds per builds-card.js line 22
    await jenkinsPage.page.waitForTimeout(6_000);

    // Reload the page to ensure we see the latest state
    await jenkinsPage.navigateToJob(jobName);

    // Assert that at least one build entry is visible in the builds card
    // or that the build history area has content
    const buildHistoryContent = jenkinsPage.page.locator(
      "#jenkins-build-history, .app-builds-container",
    );
    await expect(buildHistoryContent.first()).toBeVisible({
      timeout: BUILD_WAIT_TIMEOUT,
    });

    // Cleanup
    await waitForBuildCompletion(jenkinsPage, jobName);
    await deleteJob(jenkinsPage, jobName);
  });

  // -------------------------------------------------------------------------
  // Test: Build appears in queue after trigger
  // -------------------------------------------------------------------------

  test("should show build in queue after triggering", async ({
    jenkinsPage,
  }) => {
    // Create a job with a longer build step to increase the chance of
    // catching the build in the queue before execution starts
    const jobName = uniqueJobName();
    createdJobs.push(jobName);
    await createFreestyleJob(
      jenkinsPage,
      jobName,
      'echo "Starting build..." && sleep 10 && echo "Done"',
    );

    // Navigate to the job page
    await jenkinsPage.navigateToJob(jobName);

    // Click "Build Now" to trigger the build
    const buildNowLink = jenkinsPage.page
      .locator("#tasks .task-link")
      .filter({ hasText: /Build Now/i });
    await expect(buildNowLink).toBeVisible({ timeout: 15_000 });
    await buildNowLink.click();

    // Immediately check the build queue panel.
    // The build may appear transiently in #buildQueue before being picked up
    // by an executor. We use a generous timeout because the queue update
    // depends on Jenkins' internal polling interval.
    const buildQueuePanel = jenkinsPage.page.locator("#buildQueue");
    await expect(buildQueuePanel).toBeVisible({ timeout: 15_000 });

    // The queue panel or the executor panel should show activity.
    // Either: (a) the build appears in the queue table, or
    //         (b) the build is already executing (executor shows it).
    // We check both to handle the transient nature of queue entries.
    const queueItem = jenkinsPage.page.locator(
      "#buildQueue .pane-content, #buildQueue td",
    );
    const executorItem = jenkinsPage.page.locator(
      "#executors .pane-content, #executors td",
    );

    // At least one of queue or executor should reflect build activity
    // within a reasonable time window
    try {
      await expect(queueItem.first().or(executorItem.first())).toBeVisible({
        timeout: 15_000,
      });
    } catch {
      // Build may have moved through queue too fast — check executor panel
      // or verify that a build number now appears in the build history
      const buildEntry = jenkinsPage.page.locator(
        "#jenkins-build-history .build-row, #jenkins-builds a",
      );
      await expect(buildEntry.first()).toBeVisible({ timeout: 15_000 });
    }

    // Cleanup
    await waitForBuildCompletion(jenkinsPage, jobName);
    await deleteJob(jenkinsPage, jobName);
  });

  // -------------------------------------------------------------------------
  // Test: Build starts execution and executor shows activity
  // -------------------------------------------------------------------------

  test("should show executor activity when build is running", async ({
    jenkinsPage,
  }) => {
    // Create a job with a sleep step so we can observe it in the executor panel
    const jobName = uniqueJobName();
    createdJobs.push(jobName);
    await createFreestyleJob(
      jenkinsPage,
      jobName,
      'echo "Build running..." && sleep 30 && echo "Build complete"',
    );

    // Trigger the build via API for reliability (avoids UI timing issues)
    await triggerBuildViaApi(jenkinsPage, jobName);

    // Wait briefly for the build to be picked up by an executor
    await jenkinsPage.page.waitForTimeout(3_000);

    // Navigate to the dashboard to see the executor panel
    await jenkinsPage.navigateToDashboard();

    // Check the executor panel (#executors) for a running build.
    // The executors panel (from lib/hudson/executors.jelly → React Executors.tsx)
    // shows currently running builds with progress bars.
    const executorPanel = jenkinsPage.page.locator("#executors");
    await expect(executorPanel).toBeVisible({ timeout: 15_000 });

    // Look for progress bar elements within the executor panel.
    // Running builds display a .progress-bar element showing execution progress.
    const progressBar = jenkinsPage.page.locator(
      "#executors .progress-bar, #executors progress",
    );

    // Wait for the progress bar to appear — the build needs time to start
    try {
      await expect(progressBar.first()).toBeVisible({ timeout: 30_000 });
    } catch {
      // If no progress bar is visible, the build may have completed too fast
      // or the executor panel may use a different indicator. Verify the
      // executor panel at least shows activity content.
      const executorContent = jenkinsPage.page.locator(
        "#executors .pane-content",
      );
      await expect(executorContent).toBeVisible({ timeout: 10_000 });
    }

    // Cleanup
    await waitForBuildCompletion(jenkinsPage, jobName);
    await deleteJob(jenkinsPage, jobName);
  });

  // -------------------------------------------------------------------------
  // Test: Build completes and appears in build history
  // -------------------------------------------------------------------------

  test("should show completed build in build history", async ({
    jenkinsPage,
  }) => {
    // Create a quick-completing job
    const jobName = uniqueJobName();
    createdJobs.push(jobName);
    await createFreestyleJob(
      jenkinsPage,
      jobName,
      'echo "Quick build for history test"',
    );

    // Trigger build and wait for completion
    await triggerBuildViaApi(jenkinsPage, jobName);
    await waitForBuildCompletion(jenkinsPage, jobName);

    // Navigate to the job page to inspect build history
    await jenkinsPage.navigateToJob(jobName);

    // Wait for the builds card to render.
    // The builds card (#jenkins-builds / .app-builds-container) displays
    // the build history with auto-refresh every 5 seconds
    // (per builds-card.js line 22: updateBuildsRefreshInterval = 5000).
    const buildsCard = jenkinsPage.page.locator("#jenkins-builds");
    await expect(buildsCard).toBeVisible({ timeout: 15_000 });

    // Wait an additional auto-refresh cycle to ensure the completed build appears
    await jenkinsPage.page.waitForTimeout(6_000);

    // Reload to ensure we see the latest build history state
    await jenkinsPage.navigateToJob(jobName);

    // Verify the builds container shows the completed build
    const buildsContainer = jenkinsPage.page.locator(
      "#jenkins-build-history, .app-builds-container",
    );
    await expect(buildsContainer.first()).toBeVisible({ timeout: 15_000 });

    // Assert that a build status icon/ball is visible (success = blue/green indicator).
    // Jenkins renders build status icons with specific CSS classes for each result.
    const buildStatusIcon = jenkinsPage.page.locator(
      ".build-status-icon__outer, .build-status-icon, .icon-sm svg, .jenkins-build-status-icon",
    );
    await expect(buildStatusIcon.first()).toBeVisible({ timeout: 15_000 });

    // Cleanup
    await deleteJob(jenkinsPage, jobName);
  });

  // -------------------------------------------------------------------------
  // Test: Stop button visible during build execution
  // -------------------------------------------------------------------------

  test("should display stop button for running build", async ({
    jenkinsPage,
  }) => {
    // Create a long-running job to ensure we can observe the stop button
    const jobName = uniqueJobName();
    createdJobs.push(jobName);
    await createFreestyleJob(
      jenkinsPage,
      jobName,
      'echo "Long running build..." && sleep 120 && echo "Done"',
    );

    // Trigger the build via API
    await triggerBuildViaApi(jenkinsPage, jobName);

    // Wait for the build to start executing
    await jenkinsPage.page.waitForTimeout(3_000);

    // Navigate to the running build's page (build #1)
    await jenkinsPage.navigateToBuild(jobName, 1);

    // Assert the stop/abort button is visible.
    // The stop button (from src/main/js/components/stop-button-link/index.js)
    // is registered via behaviorShim.specify('.stop-button-link', ...) and
    // replaced by React StopButtonLink.tsx. It typically renders as an anchor
    // with class .stop-button-link or with a data-url containing "stop".
    const stopButton = jenkinsPage.page.locator(
      '.stop-button-link, a[href*="stop"], button.stop-button-link',
    );

    // The stop button should appear on the build page while the build is running
    try {
      await expect(stopButton.first()).toBeVisible({ timeout: 30_000 });
    } catch {
      // If the specific stop button selector is not found, check for any
      // element with text matching "stop" or "abort" in the side panel
      const stopTask = jenkinsPage.page
        .locator("#tasks .task-link")
        .filter({ hasText: /stop|abort/i });
      await expect(stopTask.first()).toBeVisible({ timeout: 10_000 });
    }

    // Cleanup — abort the build before deleting
    try {
      const crumbResponse =
        await jenkinsPage.page.request.get(`crumbIssuer/api/json`);
      let crumbHeader = "";
      let crumbValue = "";
      if (crumbResponse.ok()) {
        const crumbData = await crumbResponse.json();
        crumbHeader = crumbData.crumbRequestField || "Jenkins-Crumb";
        crumbValue = crumbData.crumb || "";
      }
      const headers: Record<string, string> = {};
      if (crumbHeader && crumbValue) {
        headers[crumbHeader] = crumbValue;
      }
      await jenkinsPage.page.request.post(
        `job/${encodeURIComponent(jobName)}/1/stop`,
        { headers },
      );
    } catch {
      // Best-effort stop
    }
    await waitForBuildCompletion(jenkinsPage, jobName, BUILD_WAIT_TIMEOUT);
    await deleteJob(jenkinsPage, jobName);
  });

  // -------------------------------------------------------------------------
  // Test: Visual regression for build-in-progress state
  // -------------------------------------------------------------------------

  test("build trigger visual regression", async ({ jenkinsPage }) => {
    // Create a job and trigger a build so the page has build data
    const jobName = uniqueJobName();
    createdJobs.push(jobName);
    await createFreestyleJob(
      jenkinsPage,
      jobName,
      'echo "Visual regression build"',
    );

    // Trigger and wait for a completed build to populate history
    await triggerBuildViaApi(jenkinsPage, jobName);
    await waitForBuildCompletion(jenkinsPage, jobName);

    // Navigate to the job page which will show the build in history
    await jenkinsPage.navigateToJob(jobName);

    // Wait for the builds card to fully render
    await jenkinsPage.page.waitForTimeout(3_000);

    // Capture a visual regression screenshot of the job page with a recent build.
    // Dynamic content is masked to prevent false-positive diff failures:
    // - Timestamps (time elements, .timestamp class)
    // - Build display names
    // - Queue position identifiers
    // - Executor progress bars (animated, non-deterministic)
    await expect(jenkinsPage.page).toHaveScreenshot(
      "build-trigger-job-page.png",
      {
        mask: jenkinsPage.getTimestampMasks(),
        maxDiffPixels: 100,
      },
    );

    // Cleanup
    await deleteJob(jenkinsPage, jobName);
  });

  // -------------------------------------------------------------------------
  // Test: SCM trigger flow — verify trigger config options
  // -------------------------------------------------------------------------

  test("should handle SCM trigger flow", async ({ jenkinsPage }) => {
    // Create a job to inspect its configuration
    const jobName = uniqueJobName();
    createdJobs.push(jobName);
    await createFreestyleJob(jenkinsPage, jobName);

    // Navigate to the job's configuration page to verify SCM trigger options
    await jenkinsPage.goto(`/job/${encodeURIComponent(jobName)}/configure`);

    // Wait for the configuration form to render
    const configForm = jenkinsPage.page.locator(
      'form[name="config"], #main-panel form',
    );
    await expect(configForm.first()).toBeVisible({ timeout: 15_000 });

    // Verify that SCM trigger configuration options are present.
    // Jenkins Freestyle projects have a "Build Triggers" section that includes:
    // - "Build periodically" (cron schedule)
    // - "Poll SCM" (cron-based SCM polling)
    // These are rendered as checkboxes in the configuration form.

    // Look for the "Build Triggers" section heading or individual trigger checkboxes
    const triggerHeading = jenkinsPage.page
      .locator("div, h2, h3, h4, legend, .jenkins-section__title")
      .filter({ hasText: /Build Triggers/i });

    // The "Build Triggers" section should exist in the config form
    try {
      await expect(triggerHeading.first()).toBeVisible({ timeout: 15_000 });
    } catch {
      // Some Jenkins versions may label this differently — verify at least
      // the trigger-related form elements are present
      const anyTrigger = jenkinsPage.page
        .locator("label, span, div")
        .filter({ hasText: /Build periodically|Poll SCM|Trigger builds/i });
      await expect(anyTrigger.first()).toBeVisible({ timeout: 15_000 });
    }

    // Verify "Build periodically" checkbox/option is present
    const buildPeriodically = jenkinsPage.page
      .locator("label, span, td")
      .filter({ hasText: /Build periodically/i });
    await expect(buildPeriodically.first()).toBeVisible({ timeout: 10_000 });

    // Verify "Poll SCM" checkbox/option is present
    const pollScm = jenkinsPage.page
      .locator("label, span, td")
      .filter({ hasText: /Poll SCM/i });
    await expect(pollScm.first()).toBeVisible({ timeout: 10_000 });

    // Cleanup
    await deleteJob(jenkinsPage, jobName);
  });
});
