/**
 * Unit tests for layout/TabBar.tsx and layout/Tab.tsx — Tab navigation components.
 *
 * Tests the TabBar container and its child Tab components together, verifying:
 *  - TabBarFrame wrapper with correct CSS classes
 *  - Baseline separator presence/absence
 *  - TabBarContext passing tabBarId to child Tab components
 *  - Tab rendering: radio input, anchor link, active state, addTab class
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import TabBar from "./TabBar";
import Tab from "./Tab";

describe("TabBar", () => {
  it("renders the frame container with tabBarFrame class", () => {
    const { container } = render(
      <TabBar>
        <Tab name="All" href="/all/" />
      </TabBar>,
    );
    const frame = container.querySelector(".tabBarFrame");
    expect(frame).not.toBeNull();
  });

  it("renders the inner tabBar container", () => {
    const { container } = render(
      <TabBar>
        <Tab name="All" href="/all/" />
      </TabBar>,
    );
    const tabBar = container.querySelector(".tabBar");
    expect(tabBar).not.toBeNull();
  });

  it("renders the baseline separator", () => {
    const { container } = render(
      <TabBar>
        <Tab name="All" href="/all/" />
      </TabBar>,
    );
    const baseline = container.querySelector(".tabBarBaseline");
    expect(baseline).not.toBeNull();
  });

  it("adds showBaseline class when showBaseline is true", () => {
    const { container } = render(
      <TabBar showBaseline>
        <Tab name="All" href="/all/" />
      </TabBar>,
    );
    const frame = container.querySelector(".tabBarFrame");
    expect(frame?.classList.contains("showBaseline")).toBe(true);
  });

  it("does not add showBaseline class when prop is falsy", () => {
    const { container } = render(
      <TabBar>
        <Tab name="All" href="/all/" />
      </TabBar>,
    );
    const frame = container.querySelector(".tabBarFrame");
    expect(frame?.classList.contains("showBaseline")).toBe(false);
  });

  it("applies additional className to frame", () => {
    const { container } = render(
      <TabBar className="custom-tabs">
        <Tab name="All" href="/all/" />
      </TabBar>,
    );
    const frame = container.querySelector(".tabBarFrame");
    expect(frame?.classList.contains("custom-tabs")).toBe(true);
  });
});

describe("Tab (within TabBar)", () => {
  it("renders tab div with radio input and anchor link", () => {
    const { container } = render(
      <TabBar>
        <Tab name="All" href="/all/" />
      </TabBar>,
    );
    const tab = container.querySelector(".tab");
    expect(tab).not.toBeNull();
    const radio = tab?.querySelector('input[type="radio"]');
    expect(radio).not.toBeNull();
    const link = tab?.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/all/");
    expect(link?.textContent).toBe("All");
  });

  it("marks active tab with active class and checked radio", () => {
    const { container } = render(
      <TabBar>
        <Tab name="Active Tab" href="/active/" active />
      </TabBar>,
    );
    const tab = container.querySelector(".tab.active");
    expect(tab).not.toBeNull();
    const radio = tab?.querySelector(
      'input[type="radio"]',
    ) as HTMLInputElement | null;
    expect(radio?.defaultChecked).toBe(true);
  });

  it("inactive tab has no active class", () => {
    const { container } = render(
      <TabBar>
        <Tab name="Normal" href="/normal/" />
      </TabBar>,
    );
    const tab = container.querySelector(".tab");
    expect(tab?.classList.contains("active")).toBe(false);
  });

  it("applies addTab class when name is '+'", () => {
    const { container } = render(
      <TabBar>
        <Tab name="+" href="/new/" />
      </TabBar>,
    );
    const link = container.querySelector("a.addTab");
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe("+");
  });

  it("does not apply addTab class for normal names", () => {
    const { container } = render(
      <TabBar>
        <Tab name="Builds" href="/builds/" />
      </TabBar>,
    );
    const link = container.querySelector("a");
    expect(link?.classList.contains("addTab")).toBe(false);
  });

  it("applies title attribute when provided", () => {
    const { container } = render(
      <TabBar>
        <Tab name="My Tab" href="/tab/" title="Click to view" />
      </TabBar>,
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("title")).toBe("Click to view");
  });

  it("radio inputs share the same group name within a TabBar", () => {
    const { container } = render(
      <TabBar>
        <Tab name="Tab 1" href="/t1/" index={0} />
        <Tab name="Tab 2" href="/t2/" index={1} />
      </TabBar>,
    );
    const radios = container.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(2);
    const name0 = (radios[0] as HTMLInputElement).name;
    const name1 = (radios[1] as HTMLInputElement).name;
    expect(name0).toBe(name1);
    expect(name0.startsWith("tab-group-")).toBe(true);
  });

  it("each radio has a unique id based on tabBarId and index", () => {
    const { container } = render(
      <TabBar>
        <Tab name="A" href="/a/" index={0} />
        <Tab name="B" href="/b/" index={1} />
      </TabBar>,
    );
    const radios = container.querySelectorAll('input[type="radio"]');
    const id0 = (radios[0] as HTMLInputElement).id;
    const id1 = (radios[1] as HTMLInputElement).id;
    expect(id0).not.toBe(id1);
    expect(id0.startsWith("tab-")).toBe(true);
    expect(id1.startsWith("tab-")).toBe(true);
  });
});
