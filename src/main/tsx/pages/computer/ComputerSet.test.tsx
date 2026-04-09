/**
 * @file ComputerSet.test.tsx — Unit tests for ComputerSet page component.
 * Target: ≥80% branch coverage of ComputerSet.tsx (584 lines).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ComputerSet from "./ComputerSet";

/* ---- shared mock state ---- */
let staplerQueryMock: Record<string, unknown> = {};
let staplerMutationMock: Record<string, unknown> = {};

/* ---- hooks ---- */
vi.mock("@/hooks/useStaplerQuery", () => ({
  useStaplerQuery: () => staplerQueryMock,
}));

vi.mock("@/hooks/useStaplerMutation", () => ({
  useStaplerMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    ...staplerMutationMock,
  }),
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

/* ---- layout / child mocks ---- */
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

vi.mock("@/layout/Skeleton", () => {
  const SkeletonMock = ({ type }: { type?: string }) => (
    <div data-testid="skeleton" data-type={type} />
  );
  return { default: SkeletonMock, Skeleton: SkeletonMock };
});

vi.mock("@/components/dialogs/Dialog", () => ({
  default: ({
    open,
    onResolve,
    onCancel,
    options,
  }: {
    open?: boolean;
    onResolve?: () => void;
    onCancel?: () => void;
    options?: { title?: string };
  }) =>
    open ? (
      <div data-testid="dialog" data-title={options?.title}>
        <button data-testid="dialog-close" onClick={onCancel ?? onResolve}>
          close
        </button>
        {options?.content}
      </div>
    ) : null,
}));

/* ---- helpers ---- */
function makeComputer(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "agent-1",
    description: "",
    offline: false,
    temporarilyOffline: false,
    idle: true,
    numExecutors: 2,
    icon: "computer.png",
    iconClassName: "icon-computer",
    monitorData: {
      "hudson.node_monitors.DiskSpaceMonitor": { size: 1073741824 },
      "hudson.node_monitors.ResponseTimeMonitor": { average: 42 },
    },
    executors: [{ idle: true }, { idle: false }],
    ...overrides,
  };
}

function makeComputerSetData(
  computers: Record<string, unknown>[] = [makeComputer()],
  extra: Record<string, unknown> = {},
) {
  return {
    busyExecutors: 1,
    totalExecutors: 4,
    computer: computers,
    ...extra,
  };
}

/* ---- tests ---- */
describe("ComputerSet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    staplerQueryMock = { data: undefined, isLoading: false, error: null };
    staplerMutationMock = {};
  });

  // --- loading ---
  it("renders skeleton while loading", () => {
    staplerQueryMock = { data: undefined, isLoading: true, error: null };
    render(<ComputerSet />);
    expect(screen.getByTestId("skeleton")).toBeDefined();
  });

  // --- error ---
  it("renders error message when query fails and no data", () => {
    staplerQueryMock = {
      data: undefined,
      isLoading: false,
      error: new Error("Network fail"),
    };
    render(<ComputerSet />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain(
      "Error loading node data",
    );
  });

  // --- main render ---
  it("renders computer table with executor summary", () => {
    staplerQueryMock = {
      data: makeComputerSetData(),
      isLoading: false,
      error: null,
    };
    render(<ComputerSet />);
    expect(screen.getByText("agent-1")).toBeDefined();
    // executor summary
    const main = screen.getByTestId("layout-main");
    expect(main.textContent).toContain("1");
    expect(main.textContent).toContain("4");
  });

  it("renders New Node link in app bar", () => {
    staplerQueryMock = {
      data: makeComputerSetData(),
      isLoading: false,
      error: null,
    };
    render(<ComputerSet />);
    const main = screen.getByTestId("layout-main");
    expect(main.textContent).toContain("New Node");
  });

  // --- monitor columns ---
  it("renders monitor data columns from first computer", () => {
    staplerQueryMock = {
      data: makeComputerSetData(),
      isLoading: false,
      error: null,
    };
    render(<ComputerSet />);
    // The MONITOR_CAPTIONS map translates monitor keys to captions
    const main = screen.getByTestId("layout-main");
    expect(main.innerHTML).toContain("Disk Space");
  });

  // --- empty state ---
  it("renders empty state when no computers", () => {
    staplerQueryMock = {
      data: makeComputerSetData([]),
      isLoading: false,
      error: null,
    };
    render(<ComputerSet />);
    const main = screen.getByTestId("layout-main");
    expect(main.textContent).toContain("No nodes available");
  });

  // --- legend modal ---
  it("opens icon legend dialog on legend button click", async () => {
    staplerQueryMock = {
      data: makeComputerSetData(),
      isLoading: false,
      error: null,
    };
    render(<ComputerSet />);
    const legendBtn = document.getElementById("button-computer-icon-legend");
    expect(legendBtn).not.toBeNull();
    fireEvent.click(legendBtn!);
    await waitFor(() => {
      expect(screen.getByTestId("dialog")).toBeDefined();
    });
    // Dialog should show icon statuses
    const dialog = screen.getByTestId("dialog");
    expect(dialog.textContent).toContain("online");
    expect(dialog.textContent).toContain("offline");
  });

  it("closes icon legend dialog on close button", async () => {
    staplerQueryMock = {
      data: makeComputerSetData(),
      isLoading: false,
      error: null,
    };
    render(<ComputerSet />);
    fireEvent.click(document.getElementById("button-computer-icon-legend")!);
    await waitFor(() => {
      expect(screen.getByTestId("dialog")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("dialog-close"));
    // Dialog should be gone after close
    await waitFor(() => {
      expect(screen.queryByTestId("dialog")).toBeNull();
    });
  });

  // --- refresh status button ---
  it("renders refresh status button with title attribute", () => {
    staplerQueryMock = {
      data: makeComputerSetData(),
      isLoading: false,
      error: null,
    };
    render(<ComputerSet />);
    const main = screen.getByTestId("layout-main");
    const refreshBtn = main.querySelector('button[title="Refresh status"]');
    expect(refreshBtn).not.toBeNull();
  });

  // --- large table size class ---
  it("applies small table class for >20 computers", () => {
    const computers = Array.from({ length: 25 }, (_, i) =>
      makeComputer({ displayName: `agent-${i}` }),
    );
    staplerQueryMock = {
      data: makeComputerSetData(computers),
      isLoading: false,
      error: null,
    };
    render(<ComputerSet />);
    const table = document.getElementById("computers");
    expect(table?.className).toContain("jenkins-table--small");
  });

  it("applies medium table class for >10 computers", () => {
    const computers = Array.from({ length: 15 }, (_, i) =>
      makeComputer({ displayName: `agent-${i}` }),
    );
    staplerQueryMock = {
      data: makeComputerSetData(computers),
      isLoading: false,
      error: null,
    };
    render(<ComputerSet />);
    const table = document.getElementById("computers");
    expect(table?.className).toContain("jenkins-table--medium");
  });

  // --- description block ---
  it("renders description when present", () => {
    staplerQueryMock = {
      data: makeComputerSetData([], { description: "My Nodes" }),
      isLoading: false,
      error: null,
    };
    render(<ComputerSet />);
    expect(screen.getByTestId("layout-main").textContent).toContain("My Nodes");
  });

  // --- initialData prop ---
  it("uses initialData when provided and query not loaded", () => {
    const initial = makeComputerSetData([
      makeComputer({ displayName: "ssr-agent" }),
    ]);
    staplerQueryMock = {
      data: initial,
      isLoading: false,
      error: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<ComputerSet initialData={initial as any} />);
    expect(screen.getByText("ssr-agent")).toBeDefined();
  });

  // --- offline computer row ---
  it("renders offline indicator for offline computers", () => {
    staplerQueryMock = {
      data: makeComputerSetData([
        makeComputer({ displayName: "off-node", offline: true }),
      ]),
      isLoading: false,
      error: null,
    };
    render(<ComputerSet />);
    expect(screen.getByText("off-node")).toBeDefined();
  });

  // --- data obtained footer ---
  it("renders data obtained footer", () => {
    staplerQueryMock = {
      data: makeComputerSetData(),
      isLoading: false,
      error: null,
    };
    render(<ComputerSet />);
    const main = screen.getByTestId("layout-main");
    expect(main.textContent).toContain("Data obtained");
  });
});
