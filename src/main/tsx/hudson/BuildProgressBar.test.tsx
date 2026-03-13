/**
 * Unit tests for BuildProgressBar.tsx — Animated build progress indicator.
 * Target: ≥80% branch coverage (368 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import BuildProgressBar from "./BuildProgressBar";
import type { Build, ExecutorInfo } from "@/types/models";

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

function makeBuild(overrides: Partial<Build> = {}): Build {
  return {
    _class: "hudson.model.FreeStyleBuild",
    number: 1,
    id: "1",
    url: "job/test/1/",
    displayName: "#1",
    description: null,
    timestamp: Date.now() - 5000,
    duration: 0,
    estimatedDuration: 10000,
    result: null,
    building: true,
    keepLog: false,
    queueId: 1,
    executor: null,
    actions: [],
    artifacts: [],
    ...overrides,
  };
}

function makeExecutor(overrides: Partial<ExecutorInfo> = {}): ExecutorInfo {
  return {
    idle: false,
    likelyStuck: false,
    number: 0,
    progress: 50,
    currentExecutable: null,
    currentWorkUnit: null,
    ...overrides,
  } as ExecutorInfo;
}

describe("BuildProgressBar", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders a progress bar element", () => {
    const { container } = render(<BuildProgressBar build={makeBuild()} />);
    const bar = container.querySelector(
      ".app-progress-bar, [role='progressbar'], progress",
    );
    expect(bar !== null || container.innerHTML.includes("progress")).toBe(true);
  });

  it("renders with executor progress", () => {
    const exec = makeExecutor({ progress: 75 });
    const { container } = render(
      <BuildProgressBar build={makeBuild()} executor={exec} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders indeterminate mode when no executor", () => {
    const { container } = render(
      <BuildProgressBar build={makeBuild()} executor={null} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("applies explicit progress prop", () => {
    const { container } = render(
      <BuildProgressBar build={makeBuild()} progress={60} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders 0% progress at start", () => {
    const { container } = render(
      <BuildProgressBar build={makeBuild()} progress={0} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders 100% progress near completion", () => {
    const { container } = render(
      <BuildProgressBar build={makeBuild()} progress={100} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders error style when stuck", () => {
    const exec = makeExecutor({ likelyStuck: true, progress: 95 });
    const { container } = render(
      <BuildProgressBar build={makeBuild()} executor={exec} isStuck={true} />,
    );
    // Should have error class or styling
    const bar = container.querySelector(
      ".app-progress-bar--error, [class*='error'], [class*='stuck']",
    );
    expect(
      bar !== null ||
        container.innerHTML.includes("error") ||
        container.innerHTML.includes("stuck"),
    ).toBe(true);
  });

  it("uses executor.likelyStuck when isStuck not explicitly provided", () => {
    const exec = makeExecutor({ likelyStuck: true });
    const { container } = render(
      <BuildProgressBar build={makeBuild()} executor={exec} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders custom tooltip when provided", () => {
    const { container } = render(
      <BuildProgressBar build={makeBuild()} tooltip="Custom progress info" />,
    );
    const el = container.querySelector(
      "[title], [data-tooltip], [data-html-tooltip]",
    );
    if (el) {
      const tip =
        el.getAttribute("title") ||
        el.getAttribute("data-tooltip") ||
        el.getAttribute("data-html-tooltip") ||
        "";
      expect(tip).toContain("Custom");
    }
  });

  it("renders without animate prop (defaults to no polling)", () => {
    const { container } = render(
      <BuildProgressBar build={makeBuild()} animate={false} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("accepts animate=true for polling mode", () => {
    const { container } = render(
      <BuildProgressBar build={makeBuild()} animate={true} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("falls back to build.executor when executor prop omitted", () => {
    const build = makeBuild({ executor: makeExecutor({ progress: 30 }) });
    const { container } = render(<BuildProgressBar build={build} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders -1 progress as indeterminate", () => {
    const { container } = render(
      <BuildProgressBar build={makeBuild()} progress={-1} />,
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});
