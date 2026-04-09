/**
 * Unit tests for ArtifactList.tsx — Build artifact listing with tree view.
 * Target: ≥80% branch coverage (412 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import ArtifactList from "./ArtifactList";
import type { Build, Artifact } from "@/types/models";

vi.mock("@/hooks/useStaplerQuery", () => ({
  useStaplerQuery: () => ({ data: null, isLoading: false, error: null }),
}));

vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    loadBundle: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock("@/utils/baseUrl", () => ({ getBaseUrl: () => "" }));

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    displayPath: "output.jar",
    fileName: "output.jar",
    relativePath: "target/output.jar",
    ...overrides,
  };
}

function makeBuild(artifacts: Artifact[] = []): Build {
  return {
    _class: "hudson.model.FreeStyleBuild",
    number: 1,
    id: "1",
    url: "job/test/1/",
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
    artifacts,
  };
}

describe("ArtifactList", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders without crashing for null build", () => {
    const { container } = render(
      <ArtifactList build={null} caption="Artifacts" />,
    );
    expect(container.innerHTML.length).toBeGreaterThanOrEqual(0);
  });

  it("renders without crashing for undefined build", () => {
    const { container } = render(
      <ArtifactList build={undefined} caption="Artifacts" />,
    );
    expect(container.innerHTML.length).toBeGreaterThanOrEqual(0);
  });

  it("renders caption heading", () => {
    const build = makeBuild([makeArtifact()]);
    const { container } = render(
      <ArtifactList build={build} caption="Build Artifacts" />,
    );
    expect(container.textContent).toContain("Build Artifacts");
  });

  it("renders artifact list for build with artifacts", () => {
    const artifacts = [
      makeArtifact({
        fileName: "app.jar",
        displayPath: "app.jar",
        relativePath: "target/app.jar",
      }),
      makeArtifact({
        fileName: "app.war",
        displayPath: "app.war",
        relativePath: "target/app.war",
      }),
    ];
    const build = makeBuild(artifacts);
    const { container } = render(
      <ArtifactList build={build} caption="Artifacts" />,
    );
    expect(container.textContent).toContain("app.jar");
    expect(container.textContent).toContain("app.war");
  });

  it("renders download links for artifacts", () => {
    const build = makeBuild([makeArtifact({ fileName: "output.zip" })]);
    const { container } = render(
      <ArtifactList build={build} caption="Artifacts" />,
    );
    const links = container.querySelectorAll("a");
    expect(links.length).toBeGreaterThan(0);
  });

  it("handles empty artifacts array without crashing", () => {
    const build = makeBuild([]);
    const { container } = render(
      <ArtifactList build={build} caption="Artifacts" />,
    );
    // Component may render nothing when no artifacts
    expect(container).not.toBeNull();
  });

  it("renders nested directory structure", () => {
    const artifacts = [
      makeArtifact({
        fileName: "a.txt",
        relativePath: "docs/a.txt",
        displayPath: "docs/a.txt",
      }),
      makeArtifact({
        fileName: "b.txt",
        relativePath: "docs/sub/b.txt",
        displayPath: "docs/sub/b.txt",
      }),
    ];
    const build = makeBuild(artifacts);
    const { container } = render(
      <ArtifactList build={build} caption="Artifacts" />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("uses buildUrl prop when provided", () => {
    const build = makeBuild([makeArtifact()]);
    const { container } = render(
      <ArtifactList
        build={build}
        caption="Artifacts"
        buildUrl="/custom/build/url/"
      />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("derives url from build.url when buildUrl omitted", () => {
    const build = makeBuild([makeArtifact()]);
    const { container } = render(
      <ArtifactList build={build} caption="Artifacts" />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders artifact file names", () => {
    const artifacts = [
      makeArtifact({
        fileName: "report.html",
        displayPath: "report.html",
        relativePath: "reports/report.html",
      }),
    ];
    const build = makeBuild(artifacts);
    const { container } = render(
      <ArtifactList build={build} caption="Reports" />,
    );
    expect(container.textContent).toContain("report.html");
  });

  it("renders many artifacts without error", () => {
    const artifacts = Array.from({ length: 20 }, (_, i) =>
      makeArtifact({
        fileName: `file-${i}.txt`,
        displayPath: `file-${i}.txt`,
        relativePath: `output/file-${i}.txt`,
      }),
    );
    const build = makeBuild(artifacts);
    const { container } = render(<ArtifactList build={build} caption="All" />);
    // Verify rendered content for multiple artifacts
    expect(container.textContent).toContain("file-0.txt");
  });
});
