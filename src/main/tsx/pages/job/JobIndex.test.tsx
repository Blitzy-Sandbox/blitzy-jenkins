/**
 * @file JobIndex.test.tsx — Unit tests for JobIndex page component
 * Target: ≥80% branch coverage of JobIndex.tsx (856 lines)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import JobIndex from "./JobIndex";

/* ---------- mocks ---------- */

const mockT = (k: string) => k;
vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    t: mockT,
    locale: "en",
    loadBundle: vi.fn().mockResolvedValue({}),
  }),
}));

const mockNav = {
  baseUrl: "/jenkins",
  buildUrl: (p: string) => `/jenkins${p}`,
  goTo: vi.fn(),
};
vi.mock("@/hooks/useJenkinsNavigation", () => ({
  useJenkinsNavigation: () => mockNav,
}));

let staplerQueryReturn: Record<string, unknown> = {};
vi.mock("@/hooks/useStaplerQuery", () => ({
  useStaplerQuery: () => staplerQueryReturn,
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
      {sidePanel && <div data-testid="side-panel">{sidePanel}</div>}
      <div data-testid="main-content">{children}</div>
    </div>
  ),
}));

vi.mock("@/layout/Skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock("@/hudson/EditableDescription", () => ({
  default: ({ description }: { description?: string }) => (
    <div data-testid="editable-description">{description}</div>
  ),
}));

vi.mock("@/utils/baseUrl", () => ({
  getBaseUrl: () => "/jenkins",
}));

vi.mock("@/utils/symbols", () => ({
  INFO: "<svg>info</svg>",
}));

/* ---------- helpers ---------- */

function makeJobData(overrides: Record<string, unknown> = {}) {
  return {
    _class: "hudson.model.FreeStyleProject",
    name: "my-project",
    displayName: "My Project",
    fullName: "my-project",
    fullDisplayName: "My Project",
    url: "/job/my-project/",
    color: "blue",
    description: "Test job description",
    lastBuild: {
      number: 42,
      url: "job/my-project/42/",
      result: "SUCCESS",
      displayName: "#42",
    },
    lastSuccessfulBuild: { number: 42, url: "job/my-project/42/" },
    lastFailedBuild: null,
    lastStableBuild: { number: 42, url: "job/my-project/42/" },
    lastUnstableBuild: null,
    lastCompletedBuild: { number: 42, url: "job/my-project/42/" },
    property: [],
    healthReport: [{ score: 100, iconClassName: "icon-health-80plus" }],
    ...overrides,
  };
}

const defaultProps = {
  jobUrl: "job/my-project",
  displayName: "My Project",
  fullName: "my-project",
  fullDisplayName: "My Project",
  isTopLevel: true,
  hasConfigurePermission: true,
};

/* ---------- tests ---------- */

describe("JobIndex", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    staplerQueryReturn = { data: makeJobData(), isLoading: false, error: null };
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders without crashing", () => {
    const { container } = render(<JobIndex {...defaultProps} />);
    expect(container).toBeTruthy();
  });

  it("renders loading state when job data is loading", () => {
    staplerQueryReturn = { data: undefined, isLoading: true, error: null };
    render(<JobIndex {...defaultProps} />);
    expect(screen.getByTestId("skeleton")).toBeTruthy();
  });

  it("renders page title with display name", () => {
    render(<JobIndex {...defaultProps} />);
    const layout = screen.getByTestId("layout");
    expect(layout.dataset.title).toBe("My Project");
  });

  it("renders page title with parent display name suffix", () => {
    render(<JobIndex {...defaultProps} parentFullDisplayName="ParentFolder" />);
    const layout = screen.getByTestId("layout");
    expect(layout.dataset.title).toBe("My Project [ParentFolder]");
  });

  it("renders job headline with display name", () => {
    const { container } = render(<JobIndex {...defaultProps} />);
    const headline = container.querySelector(".job-index-headline");
    expect(headline).toBeTruthy();
    // breakableName splits at camelCase boundaries but "My Project" stays intact
    expect(headline!.textContent).toContain("My");
  });

  it("renders last build status icon link", () => {
    const { container } = render(<JobIndex {...defaultProps} />);
    // The class contains '!' which is invalid for querySelector — use attribute selector
    const link = container.querySelector("[class*='display-contents']");
    expect(link).toBeTruthy();
    expect(link!.getAttribute("href")).toContain("job/my-project/42/");
  });

  it("renders animated icon for in-progress build", () => {
    staplerQueryReturn = {
      data: makeJobData({ color: "blue_anime" }),
      isLoading: false,
      error: null,
    };
    const { container } = render(<JobIndex {...defaultProps} />);
    const icon = container.querySelector("[role='img']");
    expect(icon).toBeTruthy();
    expect(icon!.className).toContain("loading");
  });

  it("does not render status link when no lastBuild", () => {
    staplerQueryReturn = {
      data: makeJobData({ lastBuild: null }),
      isLoading: false,
      error: null,
    };
    const { container } = render(<JobIndex {...defaultProps} />);
    expect(container.querySelector("[class*='display-contents']")).toBeFalsy();
  });

  it("renders editable description with configure permission", () => {
    render(<JobIndex {...defaultProps} />);
    const descs = screen.getAllByTestId("editable-description");
    expect(descs.length).toBeGreaterThan(0);
  });

  it("renders permalinks section when builds exist", () => {
    const { container } = render(<JobIndex {...defaultProps} />);
    expect(container.textContent).toContain("Permalinks");
    expect(container.textContent).toContain("Last Build");
    expect(container.textContent).toContain("#42");
  });

  it("does not render permalinks when no builds", () => {
    staplerQueryReturn = {
      data: makeJobData({
        lastBuild: null,
        lastSuccessfulBuild: null,
        lastFailedBuild: null,
        lastStableBuild: null,
        lastUnstableBuild: null,
        lastCompletedBuild: null,
      }),
      isLoading: false,
      error: null,
    };
    const { container } = render(<JobIndex {...defaultProps} />);
    expect(container.textContent).not.toContain("Permalinks");
  });

  it("renders full project name when fullName differs from fullDisplayName", () => {
    staplerQueryReturn = {
      data: makeJobData({ fullDisplayName: "My Project Display" }),
      isLoading: false,
      error: null,
    };
    const { container } = render(
      <JobIndex
        {...defaultProps}
        fullName="my-project"
        fullDisplayName="My Project Display"
      />,
    );
    // For top-level jobs: "Project name"
    expect(container.textContent).toContain("Project name");
  });

  it("shows 'Project name' for top-level jobs when names differ", () => {
    staplerQueryReturn = {
      data: makeJobData({ fullDisplayName: "Different Name" }),
      isLoading: false,
      error: null,
    };
    const { container } = render(
      <JobIndex
        {...defaultProps}
        fullName="my-project"
        fullDisplayName="Different Name"
        isTopLevel
      />,
    );
    expect(container.textContent).toContain("Project name");
  });

  it("renders builds card with search input", () => {
    const { container } = render(<JobIndex {...defaultProps} />);
    const searchInput = container.querySelector("#jenkins-build-history");
    expect(searchInput).toBeTruthy();
  });

  it("renders job property summaries when present", () => {
    staplerQueryReturn = {
      data: makeJobData({ property: [{ _class: "org.example.TestProperty" }] }),
      isLoading: false,
      error: null,
    };
    const { container } = render(<JobIndex {...defaultProps} />);
    expect(container.querySelector(".job-property-summaries")).toBeTruthy();
  });

  it("skips job properties without _class", () => {
    staplerQueryReturn = {
      data: makeJobData({
        property: [{ _class: null }, { _class: "org.example.TestProperty" }],
      }),
      isLoading: false,
      error: null,
    };
    const { container } = render(<JobIndex {...defaultProps} />);
    const items = container.querySelectorAll(".job-property-summary");
    expect(items.length).toBe(1);
  });

  it("renders new job page data attribute when flag is set", () => {
    const { container } = render(<JobIndex {...defaultProps} newJobPage />);
    const appBar = container.querySelector("[data-new-job-page='true']");
    expect(appBar).toBeTruthy();
  });
});
