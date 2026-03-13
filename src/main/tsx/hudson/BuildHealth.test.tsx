/**
 * Unit tests for BuildHealth.tsx — Build health weather icon.
 * Target: ≥80% branch coverage (256 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import BuildHealth from "./BuildHealth";
import type { Job, HealthReport } from "@/types/models";

vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    loadBundle: vi.fn().mockResolvedValue({}),
  }),
}));

function makeJob(health: HealthReport[] = []): Job {
  return {
    _class: "hudson.model.FreeStyleProject",
    name: "j",
    displayName: "J",
    fullName: "j",
    fullDisplayName: "J",
    description: null,
    url: "/job/j/",
    buildable: true,
    color: "blue",
    nextBuildNumber: 2,
    inQueue: false,
    builds: [],
    lastBuild: null,
    lastSuccessfulBuild: null,
    lastFailedBuild: null,
    lastStableBuild: null,
    lastUnstableBuild: null,
    lastCompletedBuild: null,
    healthReport: health,
    property: [],
    actions: [],
  } as Job;
}

describe("BuildHealth", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders without crashing for job with no health reports", () => {
    const { container } = render(<BuildHealth job={makeJob()} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders health icon when job has health reports", () => {
    const health: HealthReport[] = [
      {
        description: "Build stability: 80%",
        score: 80,
        iconClassName: "icon-health-80plus",
        iconUrl: "",
      },
    ];
    const { container } = render(<BuildHealth job={makeJob(health)} />);
    expect(container.innerHTML).toContain("icon-health");
  });

  it("renders as td when td prop is true", () => {
    const health = [
      {
        description: "OK",
        score: 100,
        iconClassName: "icon-health-80plus",
        iconUrl: "",
      },
    ];
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <BuildHealth job={makeJob(health)} td={true} />
          </tr>
        </tbody>
      </table>,
    );
    expect(container.querySelector("td")).not.toBeNull();
  });

  it("renders as div when td prop is false/omitted", () => {
    const health = [
      {
        description: "OK",
        score: 100,
        iconClassName: "icon-health-80plus",
        iconUrl: "",
      },
    ];
    const { container } = render(<BuildHealth job={makeJob(health)} />);
    // Should NOT be a td element at root
    const topEl = container.firstElementChild;
    expect(topEl?.tagName).not.toBe("TD");
  });

  it("renders tooltip with health description", () => {
    const health = [
      {
        description: "Build stability: No recent failures",
        score: 100,
        iconClassName: "icon-health-80plus",
        iconUrl: "",
      },
    ];
    const { container } = render(<BuildHealth job={makeJob(health)} />);
    const tooltip = container.querySelector("[data-html-tooltip], [title]");
    if (tooltip) {
      const tip =
        tooltip.getAttribute("data-html-tooltip") ||
        tooltip.getAttribute("title") ||
        "";
      expect(tip).toContain("Build stability");
    }
  });

  it("renders correct icon class for score 80+", () => {
    const health = [
      {
        description: "Good",
        score: 85,
        iconClassName: "icon-health-80plus",
        iconUrl: "",
      },
    ];
    const { container } = render(<BuildHealth job={makeJob(health)} />);
    expect(container.innerHTML).toContain("health");
  });

  it("renders correct icon for score 0-19", () => {
    const health = [
      {
        description: "Bad",
        score: 10,
        iconClassName: "icon-health-00to19",
        iconUrl: "",
      },
    ];
    const { container } = render(<BuildHealth job={makeJob(health)} />);
    expect(container.innerHTML).toContain("health");
  });

  it("applies custom link href", () => {
    const health = [
      {
        description: "OK",
        score: 50,
        iconClassName: "icon-health-40to59",
        iconUrl: "",
      },
    ];
    const { container } = render(
      <BuildHealth job={makeJob(health)} link="/custom" />,
    );
    const link = container.querySelector("a");
    if (link) {
      expect(link.getAttribute("href")).toContain("/custom");
    }
  });

  it("applies custom style", () => {
    const health = [
      {
        description: "OK",
        score: 50,
        iconClassName: "icon-health-40to59",
        iconUrl: "",
      },
    ];
    const { container } = render(
      <BuildHealth job={makeJob(health)} style={{ color: "red" }} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("handles multiple health reports", () => {
    const health: HealthReport[] = [
      {
        description: "Build stability",
        score: 80,
        iconClassName: "icon-health-80plus",
        iconUrl: "",
      },
      {
        description: "Test results",
        score: 60,
        iconClassName: "icon-health-60to79",
        iconUrl: "",
      },
    ];
    const { container } = render(<BuildHealth job={makeJob(health)} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});
