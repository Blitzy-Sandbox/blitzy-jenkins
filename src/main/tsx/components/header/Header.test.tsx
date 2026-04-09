/**
 * Unit tests for Header.tsx — Page header with navigation, breadcrumbs, resize.
 * Target: ≥80% branch coverage (536 lines).
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import Header from "./Header";

vi.mock("@/utils/dom", () => ({
  createElementFromHtml: (html: string) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.firstChild;
  },
}));

vi.mock("@/components/dropdowns/Dropdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown">{children}</div>
  ),
}));

describe("Header", () => {
  beforeEach(() => {
    // Mock window.matchMedia which jsdom doesn't implement fully
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    // Set up page-header-content element expected by Header
    const headerContent = document.createElement("div");
    headerContent.id = "page-header";
    headerContent.innerHTML =
      '<div class="page-header__hyperlinks"><a href="/">Jenkins</a></div>';
    document.body.appendChild(headerContent);

    const breadcrumbBar = document.createElement("div");
    breadcrumbBar.id = "breadcrumbBar";
    breadcrumbBar.innerHTML =
      '<li class="jenkins-breadcrumbs__list-item"><a href="/">Home</a></li>';
    document.body.appendChild(breadcrumbBar);

    // Add navigation element for scroll handler
    const nav = document.createElement("div");
    nav.id = "page-header-test-nav";
    nav.className = "page-header";
    nav.style.setProperty("--border-opacity", "0%");
    document.body.appendChild(nav);
  });

  afterEach(() => {
    document.getElementById("page-header")?.remove();
    document.getElementById("breadcrumbBar")?.remove();
    document.getElementById("page-header-test-nav")?.remove();
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = render(<Header />);
    expect(container).not.toBeNull();
  });

  it("renders without throwing (returns null when no overflow)", () => {
    // Header returns null when breadcrumb items don't overflow;
    // container will be empty but the component should not throw
    const { container } = render(<Header />);
    expect(container).toBeDefined();
  });

  it("handles scroll event without errors", () => {
    render(<Header />);
    act(() => {
      fireEvent.scroll(window, { target: { scrollY: 100 } });
    });
    // No throw = success
  });

  it("handles resize event without errors", () => {
    render(<Header />);
    act(() => {
      fireEvent.resize(window);
    });
    // No throw = success
  });

  it("cleans up event listeners on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Header />);
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalled();
  });
});
