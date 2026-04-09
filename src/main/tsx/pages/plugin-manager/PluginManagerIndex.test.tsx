/**
 * @file PluginManagerIndex.test.tsx — Unit tests for PluginManagerIndex page.
 * Target: ≥80% branch coverage of PluginManagerIndex.tsx (485 lines).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import PluginManagerIndex from "./PluginManagerIndex";

/* ---- hooks ---- */
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

/* ---- layout mocks ---- */
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

vi.mock("@/layout/TabBar", () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="tab-bar">{children}</div>
  ),
}));

vi.mock("@/layout/Tab", () => ({
  default: ({
    name,
    href,
    active,
    index,
  }: {
    name?: string;
    href?: string;
    active?: boolean;
    index?: number;
  }) => (
    <a
      data-testid={`tab-${index}`}
      href={href}
      data-active={active}
      className={active ? "active" : ""}
    >
      {name}
    </a>
  ),
}));

/* ---- sub-view mocks ---- */
vi.mock("./PluginUpdates", () => ({
  PluginUpdates: () => <div data-testid="plugin-updates">Updates View</div>,
}));

vi.mock("./PluginAvailable", () => ({
  default: () => <div data-testid="plugin-available">Available View</div>,
}));

vi.mock("./PluginInstalled", () => ({
  default: () => <div data-testid="plugin-installed">Installed View</div>,
}));

vi.mock("./PluginAdvanced", () => ({
  PluginAdvanced: () => <div data-testid="plugin-advanced">Advanced View</div>,
}));

/* ---- helpers ---- */
let originalPushState: typeof window.history.pushState;

function setupReactRoot(attrs: Record<string, string> = {}) {
  const root = document.createElement("div");
  root.id = "react-root";
  for (const [k, v] of Object.entries(attrs)) {
    root.dataset[k] = v;
  }
  document.body.appendChild(root);
  return root;
}

describe("PluginManagerIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    originalPushState = window.history.pushState;
    window.history.pushState = vi.fn();
    // Clean up any react-root
    document.getElementById("react-root")?.remove();
  });

  afterEach(() => {
    window.history.pushState = originalPushState;
    document.getElementById("react-root")?.remove();
  });

  // --- default tab ---
  it("renders updates tab by default", () => {
    render(<PluginManagerIndex />);
    expect(screen.getByTestId("plugin-updates")).toBeDefined();
    const tab0 = screen.getByTestId("tab-0");
    expect(tab0.getAttribute("data-active")).toBe("true");
  });

  // --- explicit activeTab prop ---
  it("renders available tab when activeTab=available", () => {
    render(<PluginManagerIndex activeTab="available" />);
    expect(screen.getByTestId("plugin-available")).toBeDefined();
  });

  it("renders installed tab when activeTab=installed", () => {
    render(<PluginManagerIndex activeTab="installed" />);
    expect(screen.getByTestId("plugin-installed")).toBeDefined();
  });

  it("renders advanced tab when activeTab=advanced", () => {
    render(<PluginManagerIndex activeTab="advanced" />);
    expect(screen.getByTestId("plugin-advanced")).toBeDefined();
  });

  // --- tab switching via click ---
  it("switches to available tab when tab link is clicked", () => {
    render(<PluginManagerIndex />);
    const tabBar = screen.getByTestId("tab-bar");
    const availableTab = screen.getByTestId("tab-1");
    // The tab bar has a delegated click handler on the wrapping div
    const wrapper = tabBar.closest('[role="presentation"]');
    if (wrapper) {
      fireEvent.click(availableTab);
    } else {
      // Click tab directly - it fires through delegation
      fireEvent.click(availableTab);
    }
    // After click, the available view should render
    expect(screen.getByTestId("plugin-available")).toBeDefined();
  });

  it("switches to installed tab", () => {
    render(<PluginManagerIndex />);
    fireEvent.click(screen.getByTestId("tab-2"));
    expect(screen.getByTestId("plugin-installed")).toBeDefined();
  });

  it("switches to advanced tab", () => {
    render(<PluginManagerIndex />);
    fireEvent.click(screen.getByTestId("tab-3"));
    expect(screen.getByTestId("plugin-advanced")).toBeDefined();
  });

  // --- side panel links ---
  it("renders side panel with all 4 navigation links", () => {
    render(<PluginManagerIndex />);
    const side = screen.getByTestId("layout-side");
    expect(side.textContent).toContain("Updates");
    expect(side.textContent).toContain("Available plugins");
    expect(side.textContent).toContain("Installed plugins");
    expect(side.textContent).toContain("Advanced settings");
  });

  it("marks active tab in side panel", () => {
    render(<PluginManagerIndex activeTab="installed" />);
    const side = screen.getByTestId("layout-side");
    const links = side.querySelectorAll("a.task-link");
    const installedLink = Array.from(links).find((a) =>
      a.textContent?.includes("Installed plugins"),
    );
    expect(installedLink?.className).toContain("task-link--active");
  });

  // --- side panel click navigation ---
  it("navigates to tab via side panel link click", () => {
    render(<PluginManagerIndex />);
    const side = screen.getByTestId("layout-side");
    const links = side.querySelectorAll("a.task-link");
    const advancedLink = Array.from(links).find((a) =>
      a.textContent?.includes("Advanced settings"),
    );
    if (advancedLink) {
      fireEvent.click(advancedLink);
    }
    expect(screen.getByTestId("plugin-advanced")).toBeDefined();
  });

  // --- update center jobs ---
  it("shows download progress link when hasUpdateCenterJobs is true", () => {
    setupReactRoot({ hasUpdateCenterJobs: "true" });
    render(<PluginManagerIndex />);
    const side = screen.getByTestId("layout-side");
    expect(side.textContent).toContain("Download progress");
  });

  it("hides download progress link when no update center jobs", () => {
    render(<PluginManagerIndex />);
    const side = screen.getByTestId("layout-side");
    expect(side.textContent).not.toContain("Download progress");
  });

  it("shows update page legend on updates tab with active jobs", () => {
    setupReactRoot({ hasUpdateCenterJobs: "true" });
    render(<PluginManagerIndex />);
    const main = screen.getByTestId("layout-main");
    expect(main.textContent).toContain("UpdatePageLegend");
  });

  it("hides update page legend on non-updates tab", () => {
    setupReactRoot({ hasUpdateCenterJobs: "true" });
    render(<PluginManagerIndex activeTab="installed" />);
    const main = screen.getByTestId("layout-main");
    expect(main.textContent).not.toContain("UpdatePageLegend");
  });

  // --- popstate handling ---
  it("updates tab when popstate event fires", () => {
    // Start with updates
    render(<PluginManagerIndex />);
    expect(screen.getByTestId("plugin-updates")).toBeDefined();

    // Simulate browser back to installed
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        pathname: "/manage/pluginManager/installed",
      },
      writable: true,
    });
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByTestId("plugin-installed")).toBeDefined();
  });

  // --- page title ---
  it("sets layout title to Plugins", () => {
    render(<PluginManagerIndex />);
    expect(screen.getByTestId("layout").getAttribute("data-title")).toBe(
      "Plugins",
    );
  });

  // --- URL resolution from pathname ---
  it("resolves tab from URL path on mount when no explicit prop", () => {
    Object.defineProperty(window, "location", {
      value: { ...window.location, pathname: "/manage/pluginManager/advanced" },
      writable: true,
    });
    render(<PluginManagerIndex />);
    expect(screen.getByTestId("plugin-advanced")).toBeDefined();
  });

  // --- clicking same tab is no-op ---
  it("does not pushState when clicking already active tab on updates", () => {
    // Ensure we're on the default URL
    Object.defineProperty(window, "location", {
      value: { ...window.location, pathname: "/manage/pluginManager/" },
      writable: true,
    });
    render(<PluginManagerIndex activeTab="updates" />);
    // Verify updates tab is active
    expect(screen.getByTestId("plugin-updates")).toBeDefined();
    // Clear any prior calls from initialization
    (window.history.pushState as ReturnType<typeof vi.fn>).mockClear();
    // Click the already-active updates side link
    const side = screen.getByTestId("layout-side");
    const updatesLink = Array.from(side.querySelectorAll("a.task-link")).find(
      (a) => a.textContent?.trim() === "Updates",
    );
    if (updatesLink) {
      fireEvent.click(updatesLink);
    }
    expect(window.history.pushState).not.toHaveBeenCalled();
  });
});
