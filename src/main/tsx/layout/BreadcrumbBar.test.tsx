/**
 * Unit tests for layout/BreadcrumbBar.tsx — Breadcrumb navigation component.
 *
 * Verifies that the BreadcrumbBar renders the correct DOM structure
 * matching the Jelly `<l:breadcrumbBar>` + `<l:breadcrumb>` output,
 * including:
 *  - Container with `id="breadcrumbBar"` and `aria-label="breadcrumb"`
 *  - Ordered list with `id="breadcrumbs"`
 *  - Correct link vs span rendering based on current path
 *  - Tooltip display for long titles (> 26 chars)
 *  - Dropdown indicators for items with menu/children flags
 *  - Children slot for in-page breadcrumbs
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BreadcrumbBar, { type BreadcrumbItem } from "./BreadcrumbBar";

describe("BreadcrumbBar", () => {
  it("renders the container with correct id and aria-label", () => {
    const { container } = render(<BreadcrumbBar />);
    const bar = container.querySelector("#breadcrumbBar");
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute("aria-label")).toBe("breadcrumb");
    expect(bar?.classList.contains("jenkins-breadcrumbs")).toBe(true);
  });

  it("renders an ordered list with id='breadcrumbs'", () => {
    const { container } = render(<BreadcrumbBar />);
    const ol = container.querySelector("ol#breadcrumbs");
    expect(ol).not.toBeNull();
    expect(ol?.classList.contains("jenkins-breadcrumbs__list")).toBe(true);
  });

  it("renders nothing when items is empty", () => {
    const { container } = render(<BreadcrumbBar items={[]} />);
    const items = container.querySelectorAll(".jenkins-breadcrumbs__list-item");
    expect(items.length).toBe(0);
  });

  it("renders breadcrumb items with links", () => {
    // Use hrefs that do NOT match the jsdom default pathname ("/")
    // so that items render as links rather than plain-text spans.
    const items: BreadcrumbItem[] = [
      { title: "Dashboard", href: "/dashboard/" },
      { title: "My Job", href: "/job/my-job/" },
    ];
    const { container } = render(<BreadcrumbBar items={items} />);
    const listItems = container.querySelectorAll(
      ".jenkins-breadcrumbs__list-item",
    );
    expect(listItems.length).toBe(2);

    // Both items should be links (not matching current path)
    const firstLink = listItems[0].querySelector("a");
    expect(firstLink).not.toBeNull();
    expect(firstLink?.getAttribute("href")).toBe("/dashboard/");
    expect(firstLink?.textContent).toBe("Dashboard");
  });

  it("renders as span when item has no href", () => {
    const items: BreadcrumbItem[] = [{ title: "Loading...", href: "" }];
    const { container } = render(<BreadcrumbBar items={items} />);
    const li = container.querySelector(".jenkins-breadcrumbs__list-item");
    // No link item → should render as span
    const span = li?.querySelector("span");
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe("Loading...");
    const link = li?.querySelector("a");
    expect(link).toBeNull();
  });

  it("adds title tooltip for long titles (>26 chars)", () => {
    const longTitle = "A Very Long Breadcrumb Title That Exceeds Threshold";
    const items: BreadcrumbItem[] = [{ title: longTitle, href: "/long/" }];
    const { container } = render(<BreadcrumbBar items={items} />);
    const link = container.querySelector("a");
    expect(link?.getAttribute("title")).toBe(longTitle);
  });

  it("does not add title tooltip for short titles (<=26 chars)", () => {
    const shortTitle = "Short";
    const items: BreadcrumbItem[] = [{ title: shortTitle, href: "/short/" }];
    const { container } = render(<BreadcrumbBar items={items} />);
    const link = container.querySelector("a");
    expect(link?.getAttribute("title")).toBeNull();
  });

  it("renders dropdown indicator when hasMenu is true", () => {
    const items: BreadcrumbItem[] = [
      { title: "Project", href: "/job/project/", hasMenu: true },
    ];
    const { container } = render(<BreadcrumbBar items={items} />);
    const dropdown = container.querySelector(".dropdown-indicator");
    expect(dropdown).not.toBeNull();
    expect(dropdown?.getAttribute("aria-label")).toBe(
      "dropdown menu for Project",
    );
  });

  it("renders dropdown indicator when hasChildrenMenu is true", () => {
    const items: BreadcrumbItem[] = [
      { title: "Views", href: "/view/all/", hasChildrenMenu: true },
    ];
    const { container } = render(<BreadcrumbBar items={items} />);
    const dropdown = container.querySelector(".dropdown-indicator");
    expect(dropdown).not.toBeNull();
  });

  it("does not render dropdown when no menu flags set", () => {
    const items: BreadcrumbItem[] = [{ title: "Simple", href: "/simple/" }];
    const { container } = render(<BreadcrumbBar items={items} />);
    const dropdown = container.querySelector(".dropdown-indicator");
    expect(dropdown).toBeNull();
  });

  it("renders SVG chevron-down icon inside dropdown indicator", () => {
    const items: BreadcrumbItem[] = [
      { title: "Menu Item", href: "/menu/", hasMenu: true },
    ];
    const { container } = render(<BreadcrumbBar items={items} />);
    const svg = container.querySelector(".dropdown-indicator svg");
    expect(svg).not.toBeNull();
    const use = svg?.querySelector("use");
    expect(use?.getAttribute("href")).toBe("#symbol-chevron-down");
  });

  it("renders children after the items", () => {
    const items: BreadcrumbItem[] = [{ title: "Home", href: "/" }];
    render(
      <BreadcrumbBar items={items}>
        <li data-testid="custom-crumb">Extra</li>
      </BreadcrumbBar>,
    );
    expect(screen.getByTestId("custom-crumb")).toBeDefined();
    expect(screen.getByTestId("custom-crumb").textContent).toBe("Extra");
  });

  it("sets data-type='breadcrumb-item' on each list item", () => {
    const items: BreadcrumbItem[] = [
      { title: "A", href: "/a/" },
      { title: "B", href: "/b/" },
    ];
    const { container } = render(<BreadcrumbBar items={items} />);
    const listItems = container.querySelectorAll(
      '[data-type="breadcrumb-item"]',
    );
    expect(listItems.length).toBe(2);
  });

  it("sets data-has-menu attribute on items with hasMenu", () => {
    const items: BreadcrumbItem[] = [
      { title: "With Menu", href: "/m/", hasMenu: true },
      { title: "Without", href: "/n/" },
    ];
    const { container } = render(<BreadcrumbBar items={items} />);
    const withMenu = container.querySelectorAll('[data-has-menu="true"]');
    expect(withMenu.length).toBe(1);
  });
});
