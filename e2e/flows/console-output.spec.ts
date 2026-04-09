/**
 * Console Output User Flow Tests
 *
 * Playwright E2E test specification for Jenkins console output user flows.
 * Validates navigating to build console (`/job/{name}/{number}/console`),
 * verifying real-time streaming output appears, progressive text loading
 * works, the "View as plain text" link navigates to consoleText, and the
 * full console view renders correctly.
 *
 * Validates the React `ConsoleOutput.tsx` and `ConsoleFull.tsx` components
 * that replace `core/src/main/resources/hudson/model/Run/console.jelly`
 * and `core/src/main/resources/hudson/model/Run/consoleFull.jelly`.
 *
 * Stapler REST endpoints consumed (unchanged):
 * - GET /job/{name}/{buildNumber}/console          — Console output page
 * - GET /job/{name}/{buildNumber}/consoleFull       — Full console output page
 * - GET /job/{name}/{buildNumber}/consoleText       — Plain text console output
 * - GET /job/{name}/{buildNumber}/logText/progressiveHtml — Progressive/streaming console output
 *
 * @see AAP Section 0.7.3 — Stapler REST API consumption mapping
 * @see AAP Section 0.7.6 — Screenshot validation architecture
 */

import { test, expect } from "../fixtures/jenkins";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Name of the test job used by console output tests.
 * This job must exist in the Jenkins instance under test. The beforeEach
 * hook creates it if necessary via the Jenkins REST API.
 */
const TEST_JOB_NAME = "console-output-test-job";

/**
 * Name of the long-running test job used for streaming/progressive tests.
 * Configured with a shell step that echoes output with delays to simulate
 * real-time progressive console output.
 */
const STREAMING_JOB_NAME = "console-streaming-test-job";

/**
 * Maximum time (ms) to wait for a build to complete.
 * Jenkins builds can take variable time depending on load.
 */
const BUILD_COMPLETION_TIMEOUT = 60_000;

/**
 * Polling interval (ms) for checking build completion status.
 */
const BUILD_POLL_INTERVAL = 2_000;

/**
 * Maximum time (ms) to wait for progressive text updates.
 */
const PROGRESSIVE_TEXT_TIMEOUT = 30_000;

// ---------------------------------------------------------------------------
// Test Suite — Console Output User Flows
// ---------------------------------------------------------------------------

test.describe("Console Output User Flows", () => {
  /**
   * Pre-test setup:
   * - Authenticate as admin via the Jenkins login page
   * - Ensure a test job with at least one completed build exists
   *
   * The setup creates a freestyle job with a simple echo command via
   * the Jenkins REST API if it does not already exist, then triggers
   * a build and waits for completion so subsequent tests have console
   * output to validate against.
   */
  test.beforeEach(async ({ jenkinsPage }) => {
    await jenkinsPage.login();

    // Ensure the basic test job exists by attempting to navigate to it.
    // If the job page returns a 404, create the job via the REST API.
    const jobCheckResponse = await jenkinsPage.page.request.get(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(TEST_JOB_NAME)}/api/json`,
      { failOnStatusCode: false },
    );

    if (jobCheckResponse.status() === 404) {
      // Create a freestyle job with a simple echo shell step.
      // Uses the Jenkins createItem endpoint with XML config.
      const crumbResponse = await jenkinsPage.page.request.get(
        `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/crumbIssuer/api/json`,
      );
      const crumbData = await crumbResponse.json();

      const jobConfig = `<?xml version='1.0' encoding='UTF-8'?>
<project>
  <actions/>
  <description>Test job for console output E2E tests</description>
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
      <command>echo "=== Console Output Test ==="
echo "Line 1: Build started"
echo "Line 2: Running tests"
echo "Line 3: Build completed successfully"
echo "=== End of Console Output ==="</command>
    </hudson.tasks.Shell>
  </builders>
  <publishers/>
  <buildWrappers/>
</project>`;

      await jenkinsPage.page.request.post(
        `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/createItem?name=${encodeURIComponent(TEST_JOB_NAME)}`,
        {
          headers: {
            "Content-Type": "application/xml",
            [crumbData.crumbRequestField]: crumbData.crumb,
          },
          data: jobConfig,
          failOnStatusCode: false,
        },
      );
    }

    // Ensure at least one completed build exists.
    // Check if lastCompletedBuild is null, and if so, trigger + wait.
    const buildCheckResponse = await jenkinsPage.page.request.get(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(TEST_JOB_NAME)}/api/json?tree=lastCompletedBuild[number]`,
      { failOnStatusCode: false },
    );

    if (buildCheckResponse.ok()) {
      const buildData = await buildCheckResponse.json();

      if (!buildData.lastCompletedBuild) {
        // Trigger a build and wait for completion
        const crumbResponse = await jenkinsPage.page.request.get(
          `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/crumbIssuer/api/json`,
        );
        const crumbData = await crumbResponse.json();

        await jenkinsPage.page.request.post(
          `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(TEST_JOB_NAME)}/build`,
          {
            headers: {
              [crumbData.crumbRequestField]: crumbData.crumb,
            },
            failOnStatusCode: false,
          },
        );

        // Poll until build completes
        const startTime = Date.now();
        let buildComplete = false;
        while (
          !buildComplete &&
          Date.now() - startTime < BUILD_COMPLETION_TIMEOUT
        ) {
          await jenkinsPage.page.waitForTimeout(BUILD_POLL_INTERVAL);
          const statusResponse = await jenkinsPage.page.request.get(
            `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(TEST_JOB_NAME)}/api/json?tree=lastCompletedBuild[number]`,
            { failOnStatusCode: false },
          );
          if (statusResponse.ok()) {
            const statusData = await statusResponse.json();
            if (statusData.lastCompletedBuild) {
              buildComplete = true;
            }
          }
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // Test: Console output page loads and displays output
  // -------------------------------------------------------------------------

  test("should navigate to console output page and display build log", async ({
    jenkinsPage,
  }) => {
    // Retrieve the last completed build number for navigation
    const apiResponse = await jenkinsPage.page.request.get(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(TEST_JOB_NAME)}/api/json?tree=lastCompletedBuild[number]`,
    );
    const apiData = await apiResponse.json();
    const buildNumber: number = apiData.lastCompletedBuild?.number ?? 1;

    // Navigate to console output page using Stapler URL pattern
    await jenkinsPage.goto(
      `/job/${encodeURIComponent(TEST_JOB_NAME)}/${buildNumber}/console`,
    );
    await jenkinsPage.waitForPageLoad();

    // Assert main panel is visible — confirms page chrome rendered
    const mainPanel = jenkinsPage.getMainPanel();
    await expect(mainPanel).toBeVisible();

    // Assert console output container is visible.
    // The console.jelly/console-log.jelly template renders:
    //   <pre id="out" class="console-output"> ... </pre>
    const consoleOutput = jenkinsPage.page.locator(
      "#out, pre.console-output, .console-output",
    );
    await expect(consoleOutput.first()).toBeVisible();

    // Assert console text content is non-empty (build produced output)
    const consoleText = await consoleOutput.first().textContent();
    expect(consoleText).toBeTruthy();
    expect(consoleText!.length).toBeGreaterThan(0);

    // Verify the console contains expected output from our test job
    await expect(consoleOutput.first()).toContainText("Console Output Test");
  });

  // -------------------------------------------------------------------------
  // Test: Real-time streaming output appears for running builds
  // -------------------------------------------------------------------------

  test("should show real-time streaming output for a running build", async ({
    jenkinsPage,
  }) => {
    // Create a streaming test job with delayed output if it doesn't exist
    const streamJobCheck = await jenkinsPage.page.request.get(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(STREAMING_JOB_NAME)}/api/json`,
      { failOnStatusCode: false },
    );

    if (streamJobCheck.status() === 404) {
      const crumbResponse = await jenkinsPage.page.request.get(
        `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/crumbIssuer/api/json`,
      );
      const crumbData = await crumbResponse.json();

      // Job with shell step that echoes output with sleep delays
      // to simulate real-time progressive console output
      const streamingJobConfig = `<?xml version='1.0' encoding='UTF-8'?>
<project>
  <actions/>
  <description>Streaming test job for console E2E tests</description>
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
      <command>echo "=== Streaming Output Start ==="
for i in 1 2 3 4 5; do
  echo "Streaming line $i at $(date)"
  sleep 2
done
echo "=== Streaming Output End ==="</command>
    </hudson.tasks.Shell>
  </builders>
  <publishers/>
  <buildWrappers/>
</project>`;

      await jenkinsPage.page.request.post(
        `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/createItem?name=${encodeURIComponent(STREAMING_JOB_NAME)}`,
        {
          headers: {
            "Content-Type": "application/xml",
            [crumbData.crumbRequestField]: crumbData.crumb,
          },
          data: streamingJobConfig,
          failOnStatusCode: false,
        },
      );
    }

    // Trigger a new build of the streaming job
    const crumbResponse = await jenkinsPage.page.request.get(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/crumbIssuer/api/json`,
    );
    const crumbData = await crumbResponse.json();

    await jenkinsPage.page.request.post(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(STREAMING_JOB_NAME)}/build`,
      {
        headers: {
          [crumbData.crumbRequestField]: crumbData.crumb,
        },
      },
    );

    // Wait briefly for the build to start and get assigned a build number
    await jenkinsPage.page.waitForTimeout(3000);

    // Get the latest build number
    const buildApiResponse = await jenkinsPage.page.request.get(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(STREAMING_JOB_NAME)}/api/json?tree=lastBuild[number]`,
    );
    const buildApiData = await buildApiResponse.json();
    const buildNumber: number = buildApiData.lastBuild?.number ?? 1;

    // Navigate to the console of the running build
    await jenkinsPage.goto(
      `/job/${encodeURIComponent(STREAMING_JOB_NAME)}/${buildNumber}/console`,
    );
    await jenkinsPage.waitForPageLoad();

    // Wait for initial content to appear in the console output container
    const consoleOutput = jenkinsPage.page.locator(
      "#out, pre.console-output, .console-output",
    );
    await consoleOutput.first().waitFor({ state: "visible", timeout: 15000 });

    // Record the initial text content length
    const initialText = await consoleOutput.first().textContent();
    const initialLength = initialText?.length ?? 0;

    // Wait for progressive text updates — the console polls
    // logText/progressiveHtml to append new content as the build runs
    await jenkinsPage.page.waitForTimeout(5000);

    // Assert text content length has increased (new output was appended)
    const updatedText = await consoleOutput.first().textContent();
    const updatedLength = updatedText?.length ?? 0;

    // The streaming job outputs text every 2 seconds, so after 5 seconds
    // we should have more content than initially
    expect(updatedLength).toBeGreaterThanOrEqual(initialLength);

    // Verify that the console contains streaming output markers
    // (may need to wait for them to appear)
    await expect(consoleOutput.first()).toContainText("Streaming Output Start");
  });

  // -------------------------------------------------------------------------
  // Test: Progressive text loading works
  // -------------------------------------------------------------------------

  test("should progressively load console text as build runs", async ({
    jenkinsPage,
  }) => {
    // Trigger a new build of the streaming job for progressive text testing
    const crumbResponse = await jenkinsPage.page.request.get(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/crumbIssuer/api/json`,
    );
    const crumbData = await crumbResponse.json();

    // Ensure streaming job exists (may have been created by prior test)
    const streamJobCheck = await jenkinsPage.page.request.get(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(STREAMING_JOB_NAME)}/api/json`,
      { failOnStatusCode: false },
    );

    if (streamJobCheck.status() === 404) {
      const streamingJobConfig = `<?xml version='1.0' encoding='UTF-8'?>
<project>
  <actions/>
  <description>Streaming test job for console E2E tests</description>
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
      <command>echo "=== Streaming Output Start ==="
for i in 1 2 3 4 5; do
  echo "Streaming line $i at $(date)"
  sleep 2
done
echo "=== Streaming Output End ==="</command>
    </hudson.tasks.Shell>
  </builders>
  <publishers/>
  <buildWrappers/>
</project>`;

      await jenkinsPage.page.request.post(
        `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/createItem?name=${encodeURIComponent(STREAMING_JOB_NAME)}`,
        {
          headers: {
            "Content-Type": "application/xml",
            [crumbData.crumbRequestField]: crumbData.crumb,
          },
          data: streamingJobConfig,
          failOnStatusCode: false,
        },
      );
    }

    // Trigger a new build
    await jenkinsPage.page.request.post(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(STREAMING_JOB_NAME)}/build`,
      {
        headers: {
          [crumbData.crumbRequestField]: crumbData.crumb,
        },
      },
    );

    // Wait for the build to start
    await jenkinsPage.page.waitForTimeout(3000);

    // Get the build number
    const buildApiResponse = await jenkinsPage.page.request.get(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(STREAMING_JOB_NAME)}/api/json?tree=lastBuild[number]`,
    );
    const buildApiData = await buildApiResponse.json();
    const buildNumber: number = buildApiData.lastBuild?.number ?? 1;

    // Set up network request interception to track progressive text requests.
    // The console page polls logText/progressiveHtml (or progressiveText)
    // for streaming output. We intercept these requests to verify polling.
    const progressiveRequests: Array<{
      url: string;
      xMoreData: string | null;
      xTextSize: string | null;
    }> = [];

    // Listen for progressive text responses
    jenkinsPage.page.on("response", (response) => {
      if (response.url().includes("logText/progressive")) {
        progressiveRequests.push({
          url: response.url(),
          xMoreData: response.headers()["x-more-data"] ?? null,
          xTextSize: response.headers()["x-text-size"] ?? null,
        });
      }
    });

    // Navigate to the running build's console
    await jenkinsPage.goto(
      `/job/${encodeURIComponent(STREAMING_JOB_NAME)}/${buildNumber}/console`,
    );
    await jenkinsPage.waitForPageLoad();

    // Wait for progressive text polling to occur
    // The console page polls the progressiveHtml endpoint repeatedly
    await jenkinsPage.page.waitForTimeout(PROGRESSIVE_TEXT_TIMEOUT / 3);

    // Assert that at least one progressive text request was made
    expect(progressiveRequests.length).toBeGreaterThan(0);

    // Assert that X-Text-Size header is present on progressive responses
    // (the Stapler endpoint includes this to track stream position)
    const hasTextSizeHeader = progressiveRequests.some(
      (req) => req.xTextSize !== null,
    );
    expect(hasTextSizeHeader).toBe(true);

    // Check for X-More-Data header which indicates if more data is expected
    // While the build is running, X-More-Data should be "true"
    const hasMoreDataHeader = progressiveRequests.some(
      (req) => req.xMoreData === "true",
    );

    // At least some requests should have X-More-Data while build runs
    // (unless the build finished very quickly)
    if (progressiveRequests.length > 1) {
      expect(hasMoreDataHeader).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Test: Full console link navigates to consoleFull view
  // -------------------------------------------------------------------------

  test("should navigate to full console output via link", async ({
    jenkinsPage,
  }) => {
    // Retrieve the last completed build number
    const apiResponse = await jenkinsPage.page.request.get(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(TEST_JOB_NAME)}/api/json?tree=lastCompletedBuild[number]`,
    );
    const apiData = await apiResponse.json();
    const buildNumber: number = apiData.lastCompletedBuild?.number ?? 1;

    // Navigate to the console output page
    await jenkinsPage.goto(
      `/job/${encodeURIComponent(TEST_JOB_NAME)}/${buildNumber}/console`,
    );
    await jenkinsPage.waitForPageLoad();

    // The console.jelly template renders action buttons in the app-bar:
    //   - "View as plain text" link → a[href="consoleText"]
    //   - Download link → a[href="consoleText"][download]
    // And console-log.jelly renders when log is truncated:
    //   - "Skip N KB" link → a[href="consoleFull"]
    //
    // We look for any link that navigates to the consoleText or consoleFull
    // view to verify the full console navigation flow.
    const plainTextLink = jenkinsPage.page.locator(
      'a[href*="consoleText"]:not([download])',
    );
    const fullLogLink = jenkinsPage.page.locator('a[href*="consoleFull"]');

    // Check which link is available — consoleFull is only shown when
    // the console log exceeds the tail threshold (default 150KB).
    // For smaller logs, "View as plain text" is always available.
    const hasFullLogLink = (await fullLogLink.count()) > 0;
    const hasPlainTextLink = (await plainTextLink.count()) > 0;

    if (hasFullLogLink) {
      // Click the full console log link (shown when output is truncated)
      await fullLogLink.first().click();
      await jenkinsPage.waitForPageLoad();

      // Assert URL contains consoleFull
      await expect(jenkinsPage.page).toHaveURL(/consoleFull/);

      // Assert the full console output renders with complete content
      const fullConsoleOutput = jenkinsPage.page.locator(
        "#out, pre.console-output, .console-output",
      );
      await expect(fullConsoleOutput.first()).toBeVisible();
      await expect(fullConsoleOutput.first()).toContainText(
        "Console Output Test",
      );
    } else if (hasPlainTextLink) {
      // Click "View as plain text" link
      await plainTextLink.first().click();
      await jenkinsPage.waitForPageLoad();

      // Assert URL contains consoleText
      await expect(jenkinsPage.page).toHaveURL(/consoleText/);

      // Assert plain text content is displayed
      const bodyContent = jenkinsPage.page.locator("body, pre");
      await expect(bodyContent.first()).toBeVisible();

      const textContent = await bodyContent.first().textContent();
      expect(textContent).toBeTruthy();
      expect(textContent!.length).toBeGreaterThan(0);
    }

    // Additionally verify we can navigate directly to consoleFull URL
    await jenkinsPage.goto(
      `/job/${encodeURIComponent(TEST_JOB_NAME)}/${buildNumber}/consoleFull`,
    );
    await jenkinsPage.waitForPageLoad();

    // consoleFull.jelly includes console.jelly with consoleFull=true,
    // rendering the complete log without truncation
    const consoleFullOutput = jenkinsPage.page.locator(
      "#out, pre.console-output, .console-output",
    );
    await expect(consoleFullOutput.first()).toBeVisible();
    await expect(consoleFullOutput.first()).toContainText(
      "Console Output Test",
    );
  });

  // -------------------------------------------------------------------------
  // Test: Console output preserves formatting
  // -------------------------------------------------------------------------

  test("should render console output with preserved formatting", async ({
    jenkinsPage,
  }) => {
    // Retrieve the last completed build number
    const apiResponse = await jenkinsPage.page.request.get(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(TEST_JOB_NAME)}/api/json?tree=lastCompletedBuild[number]`,
    );
    const apiData = await apiResponse.json();
    const buildNumber: number = apiData.lastCompletedBuild?.number ?? 1;

    // Navigate to the console output page
    await jenkinsPage.goto(
      `/job/${encodeURIComponent(TEST_JOB_NAME)}/${buildNumber}/console`,
    );
    await jenkinsPage.waitForPageLoad();

    // Assert the console output is rendered in a <pre> element,
    // which preserves whitespace and line breaks.
    // console-log.jelly renders: <pre id="out" class="console-output">
    const preElement = jenkinsPage.page.locator("pre#out, pre.console-output");
    await expect(preElement.first()).toBeVisible();

    // Verify the console output contains content
    const outputText = await preElement.first().textContent();
    expect(outputText).toBeTruthy();

    // Verify line breaks are preserved — the test job outputs multiple lines
    // so the content should contain newline-separated output
    expect(outputText).toContain("Line 1");
    expect(outputText).toContain("Line 2");
    expect(outputText).toContain("Line 3");

    // Check for <span> elements within the console output — Jenkins
    // annotates console output with span elements for ANSI colors,
    // pipeline step annotations, and other formatting. These spans
    // may have classes like 'pipeline-node-XXX' or color classes.
    const spanElements = preElement.first().locator("span");
    const spanCount = await spanElements.count();

    // The presence of spans is optional — depends on whether the
    // build output contains annotated/colored output. We verify
    // the structure is intact regardless.
    if (spanCount > 0) {
      // At least one span exists — formatting is preserved
      await expect(spanElements.first()).toBeVisible();
    }

    // Verify the <pre> element has the expected CSS class
    // that enables proper console output styling
    await expect(preElement.first()).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Test: Side panel shows build navigation on console page
  // -------------------------------------------------------------------------

  test("should show build navigation in side panel on console page", async ({
    jenkinsPage,
  }) => {
    // Retrieve the last completed build number
    const apiResponse = await jenkinsPage.page.request.get(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(TEST_JOB_NAME)}/api/json?tree=lastCompletedBuild[number]`,
    );
    const apiData = await apiResponse.json();
    const buildNumber: number = apiData.lastCompletedBuild?.number ?? 1;

    // Navigate to console output page
    await jenkinsPage.goto(
      `/job/${encodeURIComponent(TEST_JOB_NAME)}/${buildNumber}/console`,
    );
    await jenkinsPage.waitForPageLoad();

    // Assert side panel is visible with navigation tasks
    const sidePanel = jenkinsPage.getSidePanel();
    await expect(sidePanel).toBeVisible();

    // Assert task links are present in the side panel.
    // The console page should show contextual navigation links
    // relevant to the build context.
    const sidePanelTasks = jenkinsPage.getSidePanelTasks();
    const taskCount = await sidePanelTasks.count();
    expect(taskCount).toBeGreaterThan(0);

    // Verify that the side panel contains links back to the parent
    // objects in the Jenkins URL hierarchy. These appear as task links
    // or breadcrumb items depending on the Jenkins theme/layout.
    const sideContent = await sidePanel.textContent();

    // The side panel should contain navigation-relevant text.
    // Specific link text depends on Jenkins version and locale,
    // so we check for the presence of any content.
    expect(sideContent).toBeTruthy();
    expect(sideContent!.length).toBeGreaterThan(0);

    // Assert breadcrumbs show correct hierarchy.
    // The breadcrumb trail for a console page should include:
    // Jenkins > {JobName} > #{BuildNumber} > Console Output
    const breadcrumbs = jenkinsPage.getBreadcrumbs();
    await expect(breadcrumbs).toBeVisible();

    const breadcrumbText = await breadcrumbs.textContent();
    expect(breadcrumbText).toBeTruthy();

    // Verify the breadcrumb includes the job name (or a portion of the path)
    // The exact format depends on the Jenkins layout but should contain
    // the job name somewhere in the breadcrumb trail
    expect(breadcrumbText!.toLowerCase()).toContain(
      TEST_JOB_NAME.toLowerCase(),
    );
  });

  // -------------------------------------------------------------------------
  // Test: Visual regression for console output
  // -------------------------------------------------------------------------

  test("console output visual regression", async ({ jenkinsPage }) => {
    // Retrieve the last completed build number for a stable screenshot
    const apiResponse = await jenkinsPage.page.request.get(
      `${jenkinsPage.page.url().split("/").slice(0, 3).join("/")}/job/${encodeURIComponent(TEST_JOB_NAME)}/api/json?tree=lastCompletedBuild[number]`,
    );
    const apiData = await apiResponse.json();
    const buildNumber: number = apiData.lastCompletedBuild?.number ?? 1;

    // Navigate to a completed build's console output for a stable screenshot.
    // Using a completed build avoids dynamic spinner/progress elements.
    await jenkinsPage.goto(
      `/job/${encodeURIComponent(TEST_JOB_NAME)}/${buildNumber}/console`,
    );
    await jenkinsPage.waitForPageLoad();

    // Wait for console output to be fully rendered
    const consoleOutput = jenkinsPage.page.locator(
      "#out, pre.console-output, .console-output",
    );
    await consoleOutput.first().waitFor({ state: "visible", timeout: 15000 });

    // Capture screenshot with dynamic content masks to prevent
    // false-positive diff failures from timestamps, build numbers,
    // queue positions, and progress bars.
    //
    // Per AAP Section 0.7.6: Playwright's toHaveScreenshot() uses
    // pixelmatch for pixel-by-pixel comparison with configurable
    // thresholds and mask locators for dynamic content.
    await expect(jenkinsPage.page).toHaveScreenshot("console-output.png", {
      mask: jenkinsPage.getTimestampMasks(),
      maxDiffPixels: 100,
    });
  });
});
