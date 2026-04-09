/**
 * @file BuildIndex.test.tsx — Unit tests for BuildIndex page component
 * Target: ≥80% branch coverage of BuildIndex.tsx (721 lines)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BuildIndex from "./BuildIndex";
import type { BuildData } from "./BuildIndex";

/* ---------- mocks ---------- */

const mockT = (k: string) => k;
vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    t: mockT,
    locale: "en",
    loadBundle: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock("@/providers/JenkinsConfigProvider", () => ({
  useJenkinsConfig: () => ({
    baseUrl: "/jenkins",
    crumbFieldName: "Jenkins-Crumb",
    crumbValue: "test-crumb",
  }),
}));

let staplerQueryReturn: Record<string, unknown> = {};
vi.mock("@/hooks/useStaplerQuery", () => ({
  useStaplerQuery: () => {
    return staplerQueryReturn;
  },
}));

const mockMutate = vi.fn();
vi.mock("@/hooks/useStaplerMutation", () => ({
  useStaplerMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

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
      {sidePanel && <div data-testid="layout-side">{sidePanel}</div>}
      <div data-testid="layout-main">{children}</div>
    </div>
  ),
}));

vi.mock("@/layout/SidePanel", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="side-panel">{children}</div>
  ),
}));

vi.mock("@/layout/MainPanel", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-panel">{children}</div>
  ),
}));

vi.mock("@/hudson/ArtifactList", () => ({
  default: ({ caption }: { caption: string }) => (
    <div data-testid="artifact-list">{caption}</div>
  ),
}));

vi.mock("@/hudson/BuildProgressBar", () => ({
  default: () => <div data-testid="build-progress-bar" />,
}));

vi.mock("@/hudson/EditableDescription", () => ({
  default: ({ description }: { description?: string }) => (
    <div data-testid="editable-description">{description}</div>
  ),
}));

/* ---------- helpers ---------- */

function makeBuildData(overrides: Partial<BuildData> = {}): BuildData {
  return {
    _class: "hudson.model.FreeStyleBuild",
    displayName: "#42",
    fullDisplayName: "My Project #42",
    description: "Test build",
    building: false,
    result: "SUCCESS",
    timestamp: Date.now() - 300_000,
    duration: 83000,
    estimatedDuration: 90000,
    url: "job/my-project/42/",
    artifacts: [
      {
        displayPath: "app.jar",
        fileName: "app.jar",
        relativePath: "target/app.jar",
      },
    ],
    actions: [{ _class: "hudson.model.CauseAction" }],
    changeSets: [
      {
        kind: "git",
        items: [
          { commitId: "abc123", msg: "Fix bug", author: { fullName: "dev" } },
        ],
      },
    ],
    executor: null,
    keepLog: false,
    number: 42,
    builtOn: "agent-1",
    timestampString: "5 min",
    durationString: "1 min 23 sec",
    ...overrides,
  } as BuildData;
}

/* ---------- tests ---------- */

describe("BuildIndex", () => {
  beforeEach(() => {
    staplerQueryReturn = {
      data: makeBuildData(),
      isLoading: false,
      isError: false,
      error: null,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = render(<BuildIndex buildUrl="job/my-project/42/" />);
    expect(container).toBeTruthy();
  });

  it("renders loading state", () => {
    staplerQueryReturn = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    };
    const { container } = render(<BuildIndex buildUrl="job/my-project/42/" />);
    expect(container.querySelector(".jenkins-spinner")).toBeTruthy();
  });

  it("renders error state", () => {
    staplerQueryReturn = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "Server error" },
    };
    const { container } = render(<BuildIndex buildUrl="job/my-project/42/" />);
    expect(container.textContent).toContain("Failed to load build data");
  });

  it("renders build not found when no data", () => {
    staplerQueryReturn = {
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    };
    const { container } = render(<BuildIndex buildUrl="job/my-project/42/" />);
    expect(container.textContent).toContain("Build not found");
  });

  it("renders page title from full display name", () => {
    render(<BuildIndex buildUrl="job/my-project/42/" />);
    const layout = screen.getByTestId("layout");
    expect(layout.dataset.title).toBe("My Project #42");
  });

  it("renders build caption with display name and formatted date", () => {
    const { container } = render(<BuildIndex buildUrl="job/my-project/42/" />);
    const caption = container.querySelector(".build-caption h1");
    expect(caption).toBeTruthy();
    expect(caption!.textContent).toContain("#42");
  });

  it("renders editable description", () => {
    render(<BuildIndex buildUrl="job/my-project/42/" />);
    expect(screen.getByTestId("editable-description")).toBeTruthy();
  });

  it("renders artifact list", () => {
    render(<BuildIndex buildUrl="job/my-project/42/" />);
    expect(screen.getByTestId("artifact-list")).toBeTruthy();
  });

  it("renders keep-log toggle button", () => {
    const { container } = render(<BuildIndex buildUrl="job/my-project/42/" />);
    const btn = container.querySelector(".build-controls button");
    expect(btn).toBeTruthy();
    expect(btn!.textContent).toContain("Keep this build forever");
  });

  it("shows 'Don't keep' text when keepLog is true", () => {
    staplerQueryReturn = {
      data: makeBuildData({ keepLog: true }),
      isLoading: false,
      isError: false,
      error: null,
    };
    const { container } = render(<BuildIndex buildUrl="job/my-project/42/" />);
    const btn = container.querySelector(".build-controls button");
    expect(btn!.textContent).toContain("Don't keep this build forever");
  });

  it("calls toggle mutation on keep-log button click", () => {
    const { container } = render(<BuildIndex buildUrl="job/my-project/42/" />);
    const btn = container.querySelector(
      ".build-controls button",
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(mockMutate).toHaveBeenCalled();
  });

  it("renders timing information with duration link", () => {
    const { container } = render(<BuildIndex buildUrl="job/my-project/42/" />);
    expect(container.textContent).toContain("Took");
    expect(container.textContent).toContain("1 min 23 sec");
  });

  it("renders in-progress timing text for building builds", () => {
    staplerQueryReturn = {
      data: makeBuildData({ building: true }),
      isLoading: false,
      isError: false,
      error: null,
    };
    const { container } = render(<BuildIndex buildUrl="job/my-project/42/" />);
    expect(container.textContent).toContain("beingExecuted");
  });

  it("renders builtOn agent link", () => {
    const { container } = render(<BuildIndex buildUrl="job/my-project/42/" />);
    expect(container.textContent).toContain("agent-1");
    const agentLink = container.querySelector("a[href*='computer/agent-1']");
    expect(agentLink).toBeTruthy();
  });

  it("does not render builtOn when empty", () => {
    staplerQueryReturn = {
      data: makeBuildData({ builtOn: undefined }),
      isLoading: false,
      isError: false,
      error: null,
    };
    const { container } = render(<BuildIndex buildUrl="job/my-project/42/" />);
    expect(container.querySelector("a[href*='computer/']")).toBeFalsy();
  });

  it("renders action summaries for known action types", () => {
    const { container } = render(<BuildIndex buildUrl="job/my-project/42/" />);
    expect(container.textContent).toContain("Build Cause");
  });

  it("skips unknown action types", () => {
    staplerQueryReturn = {
      data: makeBuildData({ actions: [{ _class: "unknown.Action" }] }),
      isLoading: false,
      isError: false,
      error: null,
    };
    const { container } = render(<BuildIndex buildUrl="job/my-project/42/" />);
    expect(container.querySelector(".build-action-summary")).toBeFalsy();
  });

  it("renders build progress bar for in-progress builds", () => {
    staplerQueryReturn = {
      data: makeBuildData({ building: true }),
      isLoading: false,
      isError: false,
      error: null,
    };
    render(<BuildIndex buildUrl="job/my-project/42/" />);
    expect(screen.getByTestId("build-progress-bar")).toBeTruthy();
  });

  it("does not render progress bar for completed builds", () => {
    render(<BuildIndex buildUrl="job/my-project/42/" />);
    expect(screen.queryByTestId("build-progress-bar")).toBeFalsy();
  });

  it("renders side panel with task links", () => {
    render(<BuildIndex buildUrl="job/my-project/42/" />);
    const side = screen.getByTestId("layout-side");
    expect(side.textContent).toContain("Console Output");
    expect(side.textContent).toContain("Delete Build");
    expect(side.textContent).toContain("Back to Project");
  });

  it("renders Changes link when changeSets exist", () => {
    render(<BuildIndex buildUrl="job/my-project/42/" />);
    const side = screen.getByTestId("layout-side");
    expect(side.textContent).toContain("Changes");
  });

  it("hides Changes link when no changeSets", () => {
    staplerQueryReturn = {
      data: makeBuildData({ changeSets: [] }),
      isLoading: false,
      isError: false,
      error: null,
    };
    render(<BuildIndex buildUrl="job/my-project/42/" />);
    const side = screen.getByTestId("layout-side");
    expect(side.textContent).not.toContain("Changes");
  });

  it("renders Build Artifacts link when artifacts exist", () => {
    render(<BuildIndex buildUrl="job/my-project/42/" />);
    const side = screen.getByTestId("layout-side");
    expect(side.textContent).toContain("Build Artifacts");
  });

  it("hides Build Artifacts link when no artifacts", () => {
    staplerQueryReturn = {
      data: makeBuildData({ artifacts: [] }),
      isLoading: false,
      isError: false,
      error: null,
    };
    render(<BuildIndex buildUrl="job/my-project/42/" />);
    const side = screen.getByTestId("layout-side");
    expect(side.textContent).not.toContain("Build Artifacts");
  });

  it("constructs URL from jobName and buildNumber when no buildUrl", () => {
    render(<BuildIndex jobName="test-job" buildNumber={10} />);
    // Should still render (URL is constructed internally)
    expect(screen.getByTestId("layout")).toBeTruthy();
  });

  it("renders Previous Build link for build > 1", () => {
    render(<BuildIndex buildUrl="job/my-project/42/" />);
    const side = screen.getByTestId("layout-side");
    expect(side.textContent).toContain("Previous Build");
  });
});
