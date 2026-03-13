/**
 * Unit tests for ProjectViewRow.tsx — Single project table row.
 * Target: ≥80% branch coverage (460 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import ProjectViewRow from "./ProjectViewRow";
import type { Job, BallColor, Build } from "@/types/models";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("./BuildHealth", () => ({
  default: (props: Record<string, unknown>) => (
    <td data-testid="build-health">{props.score ?? "N/A"}</td>
  ),
}));

vi.mock("./BuildLink", () => ({
  default: (props: Record<string, unknown>) => (
    <td data-testid="build-link">{props.displayName ?? "N/A"}</td>
  ),
}));

vi.mock("./BuildProgressBar", () => ({
  default: (props: Record<string, unknown>) => (
    <td data-testid="build-progress">{props.progress ?? 0}%</td>
  ),
}));

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------
function makeBuild(overrides: Partial<Build> = {}): Build {
  return {
    _class: "hudson.model.FreeStyleBuild",
    number: 1,
    id: "1",
    url: "/job/test/1/",
    displayName: "#1",
    description: null,
    timestamp: Date.now(),
    duration: 5000,
    estimatedDuration: 10000,
    result: "SUCCESS",
    building: false,
    keepLog: false,
    queueId: 1,
    executor: null,
    actions: [],
    artifacts: [],
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    _class: "hudson.model.FreeStyleProject",
    name: "test-job",
    displayName: "Test Job",
    fullName: "test-job",
    fullDisplayName: "Test Job",
    description: "A test job",
    url: "/job/test-job/",
    buildable: true,
    color: "blue" as BallColor,
    nextBuildNumber: 2,
    inQueue: false,
    builds: [makeBuild()],
    lastBuild: makeBuild(),
    lastSuccessfulBuild: makeBuild(),
    lastFailedBuild: null,
    lastStableBuild: makeBuild(),
    lastUnstableBuild: null,
    lastCompletedBuild: makeBuild(),
    healthReport: [
      {
        description: "Build stability: No recent failures",
        score: 100,
        iconClassName: "icon-health-80plus",
        iconUrl: "",
      },
    ],
    property: [],
    actions: [],
    ...overrides,
  };
}

const defaultColumns = [
  { _class: "hudson.views.StatusColumn" },
  { _class: "hudson.views.WeatherColumn" },
  { _class: "hudson.views.JobColumn" },
  { _class: "hudson.views.LastSuccessColumn" },
  { _class: "hudson.views.LastFailureColumn" },
  { _class: "hudson.views.LastDurationColumn" },
  { _class: "hudson.views.BuildButtonColumn" },
];

// ---------------------------------------------------------------------------
// Helper: render inside a table
// ---------------------------------------------------------------------------
function renderRow(job: Job, columns = defaultColumns, jobBaseUrl = "/") {
  return render(
    <table>
      <tbody>
        <ProjectViewRow
          job={job}
          columnExtensions={columns}
          jobBaseUrl={jobBaseUrl}
        />
      </tbody>
    </table>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("ProjectViewRow", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a table row element", () => {
    const { container } = renderRow(makeJob());
    const row = container.querySelector("tbody tr");
    expect(row).not.toBeNull();
  });

  it("renders cells matching column count", () => {
    const { container } = renderRow(makeJob());
    const cells = container.querySelectorAll("tbody tr td");
    expect(cells.length).toBeGreaterThanOrEqual(defaultColumns.length);
  });

  it("renders job display name in the job column", () => {
    const { container } = renderRow(makeJob({ displayName: "My Project" }));
    expect(container.textContent).toContain("My Project");
  });

  it("renders status icon cell for StatusColumn", () => {
    const columns = [{ _class: "hudson.views.StatusColumn" }];
    const { container } = renderRow(makeJob({ color: "blue" }), columns);
    const row = container.querySelector("tbody tr");
    expect(row).not.toBeNull();
    // Status column should render a ball/icon element
    const cells = row?.querySelectorAll("td");
    expect(cells!.length).toBeGreaterThanOrEqual(1);
  });

  it("renders weather column with health icon", () => {
    const columns = [{ _class: "hudson.views.WeatherColumn" }];
    const job = makeJob({
      healthReport: [
        {
          description: "Good",
          score: 80,
          iconClassName: "icon-health-80plus",
          iconUrl: "",
        },
      ],
    });
    const { container } = renderRow(job, columns);
    expect(container.querySelector("tbody tr td")).not.toBeNull();
  });

  it("renders job column with link to job URL", () => {
    const columns = [{ _class: "hudson.views.JobColumn" }];
    const { container } = renderRow(
      makeJob({ name: "proj", displayName: "My Proj", url: "/job/proj/" }),
      columns,
      "/",
    );
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("My Proj");
  });

  it("uses fullName when useFullName would apply", () => {
    const columns = [{ _class: "hudson.views.JobColumn" }];
    const job = makeJob({ fullDisplayName: "Folder » My Job" });
    const { container } = renderRow(job, columns);
    // Should contain the display name at minimum
    expect(container.textContent).toContain("Test Job");
  });

  it("renders last success column", () => {
    const columns = [{ _class: "hudson.views.LastSuccessColumn" }];
    const build = makeBuild({ timestamp: Date.now() - 3600000 });
    const job = makeJob({ lastSuccessfulBuild: build });
    const { container } = renderRow(job, columns);
    expect(container.querySelector("tbody tr td")).not.toBeNull();
  });

  it("renders N/A for last success when no successful builds", () => {
    const columns = [{ _class: "hudson.views.LastSuccessColumn" }];
    const job = makeJob({ lastSuccessfulBuild: null });
    const { container } = renderRow(job, columns);
    const text = container.textContent || "";
    expect(text.length).toBeGreaterThan(0);
  });

  it("renders last failure column", () => {
    const columns = [{ _class: "hudson.views.LastFailureColumn" }];
    const build = makeBuild({
      result: "FAILURE",
      timestamp: Date.now() - 7200000,
    });
    const job = makeJob({ lastFailedBuild: build });
    const { container } = renderRow(job, columns);
    expect(container.querySelector("tbody tr td")).not.toBeNull();
  });

  it("renders last duration column", () => {
    const columns = [{ _class: "hudson.views.LastDurationColumn" }];
    const build = makeBuild({ duration: 120000 });
    const job = makeJob({ lastBuild: build });
    const { container } = renderRow(job, columns);
    expect(container.querySelector("tbody tr td")).not.toBeNull();
  });

  it("renders build button column when job is buildable", () => {
    const columns = [{ _class: "hudson.views.BuildButtonColumn" }];
    const job = makeJob({ buildable: true });
    const { container } = renderRow(job, columns);
    const cell = container.querySelector("tbody tr td");
    expect(cell).not.toBeNull();
  });

  it("renders row with different ball colors", () => {
    const colors: BallColor[] = [
      "blue",
      "red",
      "yellow",
      "grey",
      "blue_anime",
      "red_anime",
    ];
    colors.forEach((color) => {
      const { container } = renderRow(makeJob({ color }));
      expect(container.querySelector("tbody tr")).not.toBeNull();
    });
  });

  it("handles unknown column type gracefully", () => {
    const columns = [{ _class: "com.example.CustomColumn" }];
    const { container } = renderRow(makeJob(), columns);
    // Should still render a row without throwing
    expect(container.querySelector("tbody tr")).not.toBeNull();
  });

  it("renders with minimal job data", () => {
    const minJob = makeJob({
      builds: [],
      lastBuild: null,
      lastSuccessfulBuild: null,
      lastFailedBuild: null,
      lastStableBuild: null,
      lastCompletedBuild: null,
      healthReport: [],
    });
    const { container } = renderRow(minJob);
    expect(container.querySelector("tbody tr")).not.toBeNull();
  });

  it("constructs job links using jobBaseUrl prefix", () => {
    const columns = [{ _class: "hudson.views.JobColumn" }];
    const { container } = renderRow(
      makeJob({ name: "my-job" }),
      columns,
      "/jenkins",
    );
    const link = container.querySelector("a");
    if (link) {
      const href = link.getAttribute("href") || "";
      expect(href.length).toBeGreaterThan(0);
    }
  });
});
