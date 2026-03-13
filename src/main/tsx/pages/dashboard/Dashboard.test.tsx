/**
 * @file Dashboard.test.tsx — Unit tests for Dashboard page component
 * Target: ≥80% branch coverage of Dashboard.tsx (572 lines)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Dashboard from "./Dashboard";

/* ---------- mocks ---------- */

const mockT = (k: string) => k;
vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    t: mockT,
    locale: "en",
    loadBundle: vi.fn().mockResolvedValue({}),
  }),
}));

const mockBuildUrl = (p: string) => `/jenkins${p}`;
vi.mock("@/hooks/useJenkinsNavigation", () => ({
  useJenkinsNavigation: () => ({ buildUrl: mockBuildUrl, goTo: vi.fn() }),
}));

let staplerQueryReturn: Record<string, unknown> = {};
vi.mock("@/hooks/useStaplerQuery", () => ({
  useStaplerQuery: () => staplerQueryReturn,
}));

/* Layout renders children AND sidePanel prop */
vi.mock("@/layout/Layout", () => ({
  default: ({
    children,
    title,
    sidePanel,
  }: {
    children: React.ReactNode;
    title: string;
    sidePanel?: React.ReactNode;
  }) => (
    <div data-testid="layout" data-title={title}>
      {sidePanel && <div data-testid="side-panel">{sidePanel}</div>}
      <div data-testid="main-content">{children}</div>
    </div>
  ),
}));

vi.mock("@/layout/TabBar", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tab-bar">{children}</div>
  ),
}));

vi.mock("@/layout/Card", () => ({
  default: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title?: string;
  }) => (
    <div data-testid="card" data-card-title={title}>
      {children}
    </div>
  ),
}));

vi.mock("@/hudson/ProjectView", () => ({
  default: ({ jobs }: { jobs: unknown[] }) => (
    <div data-testid="project-view">Jobs: {jobs.length}</div>
  ),
}));

vi.mock("@/hudson/Executors", () => ({
  default: () => <div data-testid="executors" />,
}));

vi.mock("@/hudson/Queue", () => ({
  default: () => <div data-testid="queue" />,
}));

vi.mock("@/hudson/EditableDescription", () => ({
  default: ({ description }: { description?: string }) => (
    <div data-testid="editable-description">{description}</div>
  ),
}));

/* ---------- helpers ---------- */

function makeViewData(overrides: Record<string, unknown> = {}) {
  return {
    name: "all",
    description: null,
    url: "/",
    jobs: [
      {
        name: "job-1",
        displayName: "Job 1",
        url: "/job/job-1/",
        color: "blue",
        healthReport: [],
      },
    ],
    views: [
      { name: "all", url: "/" },
      { name: "My View", url: "/view/My%20View/" },
    ],
    primaryView: { name: "all" },
    columns: [{ _class: "hudson.views.StatusColumn" }],
    systemMessage: null,
    configurePermission: false,
    ...overrides,
  };
}

/* ---------- tests ---------- */

describe("Dashboard", () => {
  beforeEach(() => {
    staplerQueryReturn = {
      data: makeViewData(),
      isLoading: false,
      error: null,
    };
    // Ensure react-root element exists for experimental layout detection
    const el = document.createElement("div");
    el.id = "react-root";
    document.body.appendChild(el);
  });

  afterEach(() => {
    vi.clearAllMocks();
    const el = document.getElementById("react-root");
    if (el) {
      el.remove();
    }
  });

  it("renders without crashing with default props", () => {
    const { container } = render(<Dashboard />);
    expect(container).toBeTruthy();
  });

  it("renders loading state when data is loading", () => {
    staplerQueryReturn = { data: undefined, isLoading: true, error: null };
    const { container } = render(<Dashboard />);
    expect(container.querySelector(".jenkins-spinner")).toBeTruthy();
  });

  it("renders error state when query fails", () => {
    staplerQueryReturn = {
      data: undefined,
      isLoading: false,
      error: { message: "Network error" },
    };
    const { container } = render(<Dashboard />);
    expect(container.textContent).toContain("Failed to load dashboard data.");
    expect(container.textContent).toContain("Network error");
  });

  it("renders Dashboard title when isRootAllView is true", () => {
    render(<Dashboard isRootAllView />);
    const layout = screen.getByTestId("layout");
    expect(layout.dataset.title).toBe("Dashboard");
  });

  it("renders view name with owner display name", () => {
    render(<Dashboard viewName="My View" ownerDisplayName="FolderA" />);
    const layout = screen.getByTestId("layout");
    expect(layout.dataset.title).toBe("My View [FolderA]");
  });

  it("renders project view when jobs exist", () => {
    render(<Dashboard />);
    expect(screen.getByTestId("project-view")).toBeTruthy();
  });

  it("renders tab bar when views exist", () => {
    render(<Dashboard />);
    expect(screen.getByTestId("tab-bar")).toBeTruthy();
  });

  it("renders empty state when no jobs and no views", () => {
    staplerQueryReturn = {
      data: makeViewData({ jobs: [], views: [] }),
      isLoading: false,
      error: null,
    };
    render(<Dashboard />);
    expect(screen.getByTestId("card")).toBeTruthy();
    expect(screen.getByTestId("card").textContent).toContain("Create a job");
  });

  it("renders empty state within tabs when views exist but no jobs", () => {
    staplerQueryReturn = {
      data: makeViewData({ jobs: [] }),
      isLoading: false,
      error: null,
    };
    render(<Dashboard />);
    expect(screen.getByTestId("tab-bar")).toBeTruthy();
    expect(screen.getByTestId("card")).toBeTruthy();
  });

  it("renders icon legend button when jobs exist", () => {
    const { container } = render(<Dashboard />);
    const btn = container.querySelector("#button-icon-legend");
    expect(btn).toBeTruthy();
    expect(btn!.textContent).toContain("Icon Legend");
  });

  it("does not render icon legend button when no jobs", () => {
    staplerQueryReturn = {
      data: makeViewData({ jobs: [] }),
      isLoading: false,
      error: null,
    };
    const { container } = render(<Dashboard />);
    expect(container.querySelector("#button-icon-legend")).toBeFalsy();
  });

  it("renders system message when present", () => {
    staplerQueryReturn = {
      data: makeViewData({ systemMessage: "<p>Welcome!</p>" }),
      isLoading: false,
      error: null,
    };
    const { container } = render(<Dashboard />);
    expect(container.querySelector("#systemmessage")).toBeTruthy();
  });

  it("renders side panel task links", () => {
    render(<Dashboard viewUrl="view/Test/" isEditable canDelete />);
    const container = screen.getByTestId("layout");
    expect(container.textContent).toContain("Build History");
    expect(container.textContent).toContain("Edit View");
    expect(container.textContent).toContain("Delete View");
    expect(container.textContent).toContain("Project Relationship");
    expect(container.textContent).toContain("Check File Fingerprint");
  });

  it("hides Edit View when isEditable is false", () => {
    render(<Dashboard isEditable={false} />);
    const layout = screen.getByTestId("layout");
    expect(layout.textContent).not.toContain("Edit View");
  });

  it("hides Delete View when canDelete is false", () => {
    render(<Dashboard canDelete={false} />);
    const layout = screen.getByTestId("layout");
    expect(layout.textContent).not.toContain("Delete View");
  });

  it("renders new dashboard layout when data attribute is set", () => {
    const el = document.getElementById("react-root")!;
    el.dataset.newDashboardPage = "true";
    const { container } = render(<Dashboard />);
    expect(container.querySelector(".jenkins-inline-page")).toBeTruthy();
  });

  it("renders traditional layout when new dashboard not set", () => {
    const { container } = render(<Dashboard />);
    expect(container.querySelector(".jenkins-inline-page")).toBeFalsy();
  });

  it("renders Executors and Queue in side panel in traditional mode", () => {
    render(<Dashboard />);
    const sidePanel = screen.getByTestId("side-panel");
    // In traditional mode, executors/queue are inside the side panel
    const executors = sidePanel.querySelectorAll("[data-testid='executors']");
    expect(executors.length).toBeGreaterThan(0);
    const queue = sidePanel.querySelectorAll("[data-testid='queue']");
    expect(queue.length).toBeGreaterThan(0);
  });

  it("renders editable description from API data", () => {
    staplerQueryReturn = {
      data: makeViewData({ description: "Test desc" }),
      isLoading: false,
      error: null,
    };
    render(<Dashboard />);
    expect(screen.getByTestId("editable-description").textContent).toBe(
      "Test desc",
    );
  });
});
