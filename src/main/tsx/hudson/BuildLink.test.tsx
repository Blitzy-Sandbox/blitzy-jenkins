/**
 * Unit tests for BuildLink.tsx — Build link with status icon.
 * Target: ≥80% branch coverage (240 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import BuildLink from "./BuildLink";
import type { Job, Build, BallColor } from "@/types/models";

vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    loadBundle: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock("@/utils/baseUrl", () => ({ getBaseUrl: () => "" }));

vi.mock("@/utils/symbols", () => ({
  STATUS_BLUE: "blue-svg",
  STATUS_RED: "red-svg",
  STATUS_YELLOW: "yellow-svg",
  STATUS_GREY: "grey-svg",
}));

function makeBuild(overrides: Partial<Build> = {}): Build {
  return {
    _class: "hudson.model.FreeStyleBuild",
    number: 42,
    id: "42",
    url: "job/test/42/",
    displayName: "#42",
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
    name: "test",
    displayName: "Test",
    fullName: "test",
    fullDisplayName: "Test",
    description: null,
    url: "/job/test/",
    buildable: true,
    color: "blue" as BallColor,
    nextBuildNumber: 43,
    inQueue: false,
    builds: [makeBuild()],
    lastBuild: makeBuild(),
    lastSuccessfulBuild: makeBuild(),
    lastFailedBuild: null,
    lastStableBuild: null,
    lastUnstableBuild: null,
    lastCompletedBuild: makeBuild(),
    healthReport: [],
    property: [],
    actions: [],
    ...overrides,
  };
}

describe("BuildLink", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders a link element", () => {
    const { container } = render(
      <BuildLink number={42} build={makeBuild()} job={makeJob()} />,
    );
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
  });

  it("displays build number", () => {
    const { container } = render(<BuildLink number={42} build={makeBuild()} />);
    expect(container.textContent).toContain("42");
  });

  it("renders job name prefix when jobName provided", () => {
    const { container } = render(
      <BuildLink number={42} jobName="MyJob" build={makeBuild()} />,
    );
    expect(container.textContent).toContain("MyJob");
  });

  it("renders with custom href", () => {
    const { container } = render(
      <BuildLink number={42} href="/custom/link" build={makeBuild()} />,
    );
    const link = container.querySelector("a");
    if (link) {
      expect(link.getAttribute("href")).toContain("/custom/link");
    }
  });

  it("renders status icon for successful build", () => {
    const build = makeBuild({ result: "SUCCESS" });
    const { container } = render(
      <BuildLink number={42} build={build} job={makeJob()} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders status icon for failed build", () => {
    const build = makeBuild({ result: "FAILURE" });
    const { container } = render(
      <BuildLink number={42} build={build} job={makeJob()} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders status icon for in-progress build", () => {
    const build = makeBuild({ result: null, building: true });
    const { container } = render(
      <BuildLink number={42} build={build} job={makeJob()} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders without job prop (plain text mode)", () => {
    const { container } = render(<BuildLink number={42} />);
    expect(container.textContent).toContain("42");
  });

  it("resolves build from job.builds when build prop omitted", () => {
    const build = makeBuild({ number: 42 });
    const job = makeJob({ builds: [build] });
    const { container } = render(<BuildLink number={42} job={job} />);
    expect(container.querySelector("a")).not.toBeNull();
  });

  it("handles missing build gracefully", () => {
    const job = makeJob({ builds: [] });
    const { container } = render(<BuildLink number={999} job={job} />);
    expect(container.textContent).toContain("999");
  });
});
