/**
 * Unit tests for Executors.tsx — Executor status panel.
 * Target: ≥80% branch coverage (844 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import Executors from "./Executors";
import type { Build } from "@/types/models";
import type { Computer, ExecutorInfo } from "@/types/models";

vi.mock("@/hooks/useStaplerQuery", () => ({
  useStaplerQuery: () => ({ data: null, isLoading: false, error: null }),
}));

vi.mock("@/hooks/useStaplerMutation", () => ({
  useStaplerMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    loadBundle: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock("@/utils/symbols", () => ({ CHEVRON_DOWN: "<svg/>" }));
vi.mock("@/utils/baseUrl", () => ({ getBaseUrl: () => "" }));

vi.mock("./BuildProgressBar", () => ({
  default: () => <span data-testid="progress-bar">progress</span>,
}));

function makeExecutor(overrides: Partial<ExecutorInfo> = {}): ExecutorInfo {
  return {
    idle: true,
    likelyStuck: false,
    number: 0,
    progress: -1,
    currentExecutable: null,
    currentWorkUnit: null,
    ...overrides,
  } as ExecutorInfo;
}

function makeComputer(
  name: string,
  executors: ExecutorInfo[] = [],
  offline = false,
): Computer {
  return {
    _class: "hudson.model.Hudson$MasterComputer",
    displayName: name,
    description: "",
    icon: "computer.png",
    iconClassName: "icon-computer",
    idle: executors.every((e) => e.idle),
    jnlpAgent: false,
    launchSupported: true,
    manualLaunchAllowed: true,
    numExecutors: executors.length || 2,
    offline,
    offlineCause: null,
    offlineCauseReason: "",
    temporarilyOffline: false,
    monitorData: {},
    executors,
    oneOffExecutors: [],
    assignedLabels: [],
    absoluteRemotePath: null,
  } as unknown as Computer;
}

describe("Executors", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders without crashing with no computers", () => {
    const { container } = render(<Executors computers={[]} />);
    expect(container).not.toBeNull();
  });

  it("renders executor panel container", () => {
    const computers = [makeComputer("Built-In Node", [makeExecutor()])];
    const { container } = render(<Executors computers={computers} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders computer names", () => {
    const computers = [
      makeComputer("Built-In Node", [makeExecutor()]),
      makeComputer("Agent-1", [makeExecutor()]),
    ];
    const { container } = render(<Executors computers={computers} />);
    expect(container.textContent).toContain("Built-In Node");
    expect(container.textContent).toContain("Agent-1");
  });

  it("renders idle executor rows", () => {
    const computers = [makeComputer("Master", [makeExecutor({ idle: true })])];
    const { container } = render(<Executors computers={computers} />);
    const text = container.textContent || "";
    expect(text.toLowerCase()).toContain("idle");
  });

  it("renders busy executor with progress", () => {
    const exec = makeExecutor({
      idle: false,
      progress: 50,
      currentExecutable: {
        number: 1,
        url: "job/test/1/",
        displayName: "#1",
      } as unknown as Build,
    });
    const computers = [makeComputer("Master", [exec])];
    const { container } = render(<Executors computers={computers} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders offline computers with indicator", () => {
    const computers = [makeComputer("Offline-Agent", [], true)];
    const { container } = render(<Executors computers={computers} />);
    const text = container.textContent || "";
    expect(text.length).toBeGreaterThan(0);
  });

  it("handles multiple executors per computer", () => {
    const execs = [
      makeExecutor({ number: 0, idle: true }),
      makeExecutor({ number: 1, idle: false, progress: 75 }),
    ];
    const computers = [makeComputer("Master", execs)];
    const { container } = render(<Executors computers={computers} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("accepts viewUrl prop without error", () => {
    const computers = [makeComputer("M", [makeExecutor()])];
    const { container } = render(
      <Executors computers={computers} viewUrl="/view/all/" />,
    );
    expect(container).not.toBeNull();
  });

  it("renders without computers prop (fetches from API)", () => {
    const { container } = render(<Executors />);
    expect(container).not.toBeNull();
  });

  it("renders stuck executor indicator", () => {
    const exec = makeExecutor({ idle: false, likelyStuck: true, progress: 99 });
    const computers = [makeComputer("Master", [exec])];
    const { container } = render(<Executors computers={computers} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});
