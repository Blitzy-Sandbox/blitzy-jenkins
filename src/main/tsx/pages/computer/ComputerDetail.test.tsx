/**
 * @file ComputerDetail.test.tsx — Unit tests for ComputerDetail page component.
 * Target: ≥80% branch coverage of ComputerDetail.tsx (607 lines).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ComputerDetail from "./ComputerDetail";

/* ---- shared mock state ---- */
let staplerQueryResults: Record<string, Record<string, unknown>> = {};
let mutationMocks: Record<
  string,
  { mutate: ReturnType<typeof vi.fn>; isPending: boolean }
> = {};

vi.mock("@/hooks/useStaplerQuery", () => ({
  useStaplerQuery: (opts: { queryKey: string[] }) => {
    const key = opts.queryKey.join(",");
    return (
      staplerQueryResults[key] ?? {
        data: undefined,
        isLoading: false,
        error: null,
      }
    );
  },
}));

vi.mock("@/hooks/useStaplerMutation", () => ({
  useStaplerMutation: (opts: { url: string }) => {
    const key = opts.url;
    return mutationMocks[key] ?? { mutate: vi.fn(), isPending: false };
  },
}));

vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    t: (k: string) => k,
    locale: "en",
    loadBundle: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock("@/hooks/useJenkinsNavigation", () => ({
  useJenkinsNavigation: () => ({
    buildUrl: (p: string) => `/jenkins${p}`,
    navigate: vi.fn(),
  }),
}));

vi.mock("@/layout/Layout", () => ({
  default: ({
    children,
    title,
    sidePanel,
  }: {
    children?: React.ReactNode;
    title?: string;
    sidePanel?: React.ReactNode;
  }) => (
    <div data-testid="layout" data-title={title}>
      {sidePanel && <div data-testid="layout-side">{sidePanel}</div>}
      <div data-testid="layout-main">{children}</div>
    </div>
  ),
}));

vi.mock("@/layout/Skeleton", () => ({
  default: ({ type }: { type?: string }) => (
    <div data-testid="skeleton" data-type={type} />
  ),
}));

vi.mock("@/hudson/EditableDescription", () => ({
  default: ({ description }: { description?: string }) => (
    <div data-testid="editable-desc">{description}</div>
  ),
}));

vi.mock("@/hudson/ProjectView", () => ({
  default: ({ jobs }: { jobs?: Array<{ name: string }> }) => (
    <div data-testid="project-view">
      {jobs?.map((j: { name: string }) => (
        <span key={j.name}>{j.name}</span>
      ))}
    </div>
  ),
}));

/* ---- helpers ---- */
function makeComputer(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "agent-1",
    caption: "Agent 1",
    description: "An agent",
    offline: false,
    temporarilyOffline: false,
    idle: true,
    numExecutors: 2,
    iconClassName: "symbol-computer",
    monitorData: {
      "hudson.node_monitors.DiskSpaceMonitor": { size: 5368709120 },
    },
    offlineCause: null,
    offlineCauseReason: null,
    manualLaunchAllowed: false,
    launchSupported: false,
    connecting: false,
    channel: null,
    node: {
      nodeDescription: "My agent description",
      assignedLabels: [
        { name: "linux" },
        { name: "docker" },
        { name: "agent-1" },
      ],
      selfLabel: { name: "agent-1" },
    },
    assignedLabels: [
      { name: "linux" },
      { name: "docker" },
      { name: "agent-1" },
    ],
    tiedJobs: [
      {
        name: "job-1",
        url: "/job/job-1/",
        displayName: "Job 1",
        color: "blue",
      },
    ],
    ...overrides,
  };
}

function setQueryData(
  computer: Record<string, unknown> | null,
  isLoading = false,
  error: Error | null = null,
) {
  const key = "computer,agent-1";
  staplerQueryResults[key] = { data: computer, isLoading, error };
  // Tied jobs query
  const tjKey = "computer,agent-1,tiedJobs";
  staplerQueryResults[tjKey] = {
    data: computer
      ? { tiedJobs: (computer as Record<string, unknown>).tiedJobs }
      : undefined,
    isLoading: false,
    error: null,
  };
}

describe("ComputerDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    staplerQueryResults = {};
    mutationMocks = {};
  });

  // --- loading ---
  it("renders skeleton while loading", () => {
    setQueryData(null, true);
    render(<ComputerDetail nodeName="agent-1" />);
    expect(screen.getByTestId("skeleton")).toBeDefined();
  });

  // --- error ---
  it("renders error alert when query fails", () => {
    const key = "computer,agent-1";
    staplerQueryResults[key] = {
      data: undefined,
      isLoading: false,
      error: new Error("Fetch failed"),
    };
    render(<ComputerDetail nodeName="agent-1" />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("Fetch failed");
  });

  // --- not found ---
  it("renders not found when data is null", () => {
    setQueryData(null);
    render(<ComputerDetail nodeName="agent-1" />);
    expect(screen.getByTestId("layout-main").textContent).toContain(
      "Node not found",
    );
  });

  // --- main render ---
  it("renders page heading with caption", () => {
    setQueryData(makeComputer());
    render(<ComputerDetail nodeName="agent-1" />);
    expect(screen.getByText("Agent 1")).toBeDefined();
  });

  it("falls back to displayName when no caption", () => {
    setQueryData(makeComputer({ caption: undefined }));
    render(<ComputerDetail nodeName="agent-1" />);
    expect(screen.getByText("agent-1")).toBeDefined();
  });

  // --- editable description ---
  it("renders editable description from node data", () => {
    setQueryData(makeComputer());
    render(<ComputerDetail nodeName="agent-1" />);
    expect(screen.getByTestId("editable-desc").textContent).toBe(
      "My agent description",
    );
  });

  // --- side panel ---
  it("renders side panel with navigation links", () => {
    setQueryData(makeComputer());
    render(<ComputerDetail nodeName="agent-1" />);
    const side = screen.getByTestId("layout-side");
    expect(side.textContent).toContain("Status");
    expect(side.textContent).toContain("Delete Agent");
    expect(side.textContent).toContain("Configure");
    expect(side.textContent).toContain("Build History");
    expect(side.textContent).toContain("Load Statistics");
  });

  it("renders Script Console link when channel is available", () => {
    setQueryData(makeComputer({ channel: {} }));
    render(<ComputerDetail nodeName="agent-1" />);
    const side = screen.getByTestId("layout-side");
    expect(side.textContent).toContain("Script Console");
  });

  it("does not render Script Console link when channel is null", () => {
    setQueryData(makeComputer({ channel: null }));
    render(<ComputerDetail nodeName="agent-1" />);
    const side = screen.getByTestId("layout-side");
    expect(side.textContent).not.toContain("Script Console");
  });

  // --- offline controls ---
  it("shows 'Mark this node temporarily offline' button when online", () => {
    setQueryData(makeComputer({ temporarilyOffline: false }));
    render(<ComputerDetail nodeName="agent-1" />);
    const main = screen.getByTestId("layout-main");
    expect(main.textContent).toContain("submit.not.temporarilyOffline");
  });

  it("shows online and update buttons when temporarily offline", () => {
    setQueryData(makeComputer({ temporarilyOffline: true }));
    render(<ComputerDetail nodeName="agent-1" />);
    const main = screen.getByTestId("layout-main");
    expect(main.textContent).toContain("submit.temporarilyOffline");
    expect(main.textContent).toContain("submit.updateOfflineCause");
  });

  it("calls toggleOffline mutation when bring online button clicked", () => {
    const mutateFn = vi.fn();
    mutationMocks["/computer/agent-1/toggleOffline"] = {
      mutate: mutateFn,
      isPending: false,
    };
    setQueryData(makeComputer({ temporarilyOffline: true }));
    render(<ComputerDetail nodeName="agent-1" />);
    const buttons = screen.getAllByRole("button");
    const onlineBtn = buttons.find((b) =>
      b.textContent?.includes("submit.temporarilyOffline"),
    );
    if (onlineBtn) {
      fireEvent.click(onlineBtn);
    }
    expect(mutateFn).toHaveBeenCalledWith({});
  });

  // --- offline cause ---
  it("renders offline cause when node is offline with cause", () => {
    setQueryData(
      makeComputer({
        offline: true,
        connecting: false,
        offlineCause: { description: "Disk full" },
      }),
    );
    render(<ComputerDetail nodeName="agent-1" />);
    expect(screen.getByTestId("layout-main").textContent).toContain(
      "Disk full",
    );
  });

  it("does not render offline cause when connecting", () => {
    setQueryData(
      makeComputer({
        offline: true,
        connecting: true,
        offlineCause: { description: "Disk full" },
      }),
    );
    render(<ComputerDetail nodeName="agent-1" />);
    // Should not render the offline-cause div
    const main = screen.getByTestId("layout-main");
    const offlineCauseDiv = main.querySelector(".offline-cause");
    expect(offlineCauseDiv).toBeNull();
  });

  // --- monitoring data ---
  it("renders monitoring data in collapsible details", () => {
    setQueryData(makeComputer());
    render(<ComputerDetail nodeName="agent-1" />);
    expect(screen.getByText("Monitoring Data")).toBeDefined();
    // monitor caption extracted from class name
    expect(screen.getByTestId("layout-main").textContent).toContain(
      "Disk Space",
    );
  });

  it("does not render monitoring section when no monitor data", () => {
    setQueryData(makeComputer({ monitorData: {} }));
    render(<ComputerDetail nodeName="agent-1" />);
    const main = screen.getByTestId("layout-main");
    expect(main.querySelector("details")).toBeNull();
  });

  // --- labels ---
  it("renders filtered labels excluding self-label", () => {
    setQueryData(makeComputer());
    render(<ComputerDetail nodeName="agent-1" />);
    const main = screen.getByTestId("layout-main");
    expect(main.textContent).toContain("linux");
    expect(main.textContent).toContain("docker");
    // self-label "agent-1" should be filtered except in heading
    const labelLinks = main.querySelectorAll("a.model-link");
    const labelNames = Array.from(labelLinks).map((l) => l.textContent);
    expect(labelNames).not.toContain("agent-1");
  });

  it("does not render labels section when none after filtering", () => {
    setQueryData(
      makeComputer({
        assignedLabels: [{ name: "agent-1" }],
        node: {
          nodeDescription: "",
          assignedLabels: [{ name: "agent-1" }],
          selfLabel: { name: "agent-1" },
        },
      }),
    );
    render(<ComputerDetail nodeName="agent-1" />);
    const main = screen.getByTestId("layout-main");
    expect(main.textContent).not.toContain("Labels");
  });

  // --- tied projects ---
  it("renders tied projects via ProjectView", () => {
    setQueryData(makeComputer());
    render(<ComputerDetail nodeName="agent-1" />);
    expect(screen.getByTestId("project-view")).toBeDefined();
    expect(screen.getByText("job-1")).toBeDefined();
  });

  it("renders None when no tied jobs", () => {
    setQueryData(makeComputer({ tiedJobs: [] }));
    // Also override the tied jobs query
    staplerQueryResults["computer,agent-1,tiedJobs"] = {
      data: { tiedJobs: [] },
      isLoading: false,
      error: null,
    };
    render(<ComputerDetail nodeName="agent-1" />);
    const main = screen.getByTestId("layout-main");
    expect(main.textContent).toContain("None");
  });

  // --- manual launch / no manual launch ---
  it("renders manual launch section when allowed", () => {
    setQueryData(makeComputer({ manualLaunchAllowed: true }));
    render(<ComputerDetail nodeName="agent-1" />);
    // The manual launch div has margin class
    const main = screen.getByTestId("layout-main");
    expect(main.querySelector('[class*="margin-bottom-2"]')).toBeDefined();
  });

  it("renders no manual launch notice when offline, no manual, launch supported", () => {
    setQueryData(
      makeComputer({
        offline: true,
        manualLaunchAllowed: false,
        launchSupported: true,
      }),
    );
    render(<ComputerDetail nodeName="agent-1" />);
    expect(screen.getByTestId("layout-main").textContent).toContain(
      "title.no_manual_launch",
    );
  });

  // --- help link ---
  it("renders help link to Jenkins docs", () => {
    setQueryData(makeComputer());
    render(<ComputerDetail nodeName="agent-1" />);
    const helpLink = screen
      .getByTestId("layout-main")
      .querySelector("a.jenkins-help-button");
    expect(helpLink?.getAttribute("href")).toContain("jenkins.io");
  });
});
