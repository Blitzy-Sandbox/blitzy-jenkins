/**
 * Unit tests for FormSection.tsx — Form section grouping with title and icon.
 * Target: ≥80% branch coverage (149 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { FormSection } from "./FormSection";

describe("FormSection", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- Basic rendering ----

  it("renders a section element", () => {
    const { container } = render(
      <FormSection>
        <span>content</span>
      </FormSection>,
    );
    const section = container.querySelector("section");
    expect(section).not.toBeNull();
  });

  // ---- Title present ----

  it("renders with jenkins-section class when title provided", () => {
    const { container } = render(
      <FormSection title="Source Code Management">
        <span>SCM fields</span>
      </FormSection>,
    );
    const section = container.querySelector("section.jenkins-section");
    expect(section).not.toBeNull();
  });

  it("renders title text in jenkins-section__title", () => {
    const { container } = render(
      <FormSection title="Build Triggers">
        <span>triggers</span>
      </FormSection>,
    );
    const titleDiv = container.querySelector(".jenkins-section__title");
    expect(titleDiv).not.toBeNull();
    expect(titleDiv?.textContent).toContain("Build Triggers");
  });

  it("renders hidden icon container for sidebar extraction", () => {
    const { container } = render(
      <FormSection title="Settings">
        <span>body</span>
      </FormSection>,
    );
    const hidden = container.querySelector(".jenkins-hidden");
    expect(hidden).not.toBeNull();
  });

  it("uses default icon symbol-settings", () => {
    const { container } = render(
      <FormSection title="Settings">
        <span>body</span>
      </FormSection>,
    );
    const icon = container.querySelector("[data-icon]");
    expect(icon?.getAttribute("data-icon")).toBe("symbol-settings");
  });

  it("uses custom icon when provided", () => {
    const { container } = render(
      <FormSection title="SCM" icon="symbol-branch">
        <span>body</span>
      </FormSection>,
    );
    const icon = container.querySelector("[data-icon]");
    expect(icon?.getAttribute("data-icon")).toBe("symbol-branch");
  });

  // ---- Title absent ----

  it("renders without jenkins-section class when title is null", () => {
    const { container } = render(
      <FormSection title={null}>
        <span>transparent</span>
      </FormSection>,
    );
    const section = container.querySelector("section");
    expect(section).not.toBeNull();
    expect(section?.className).toBe("");
  });

  it("renders without jenkins-section class when title is undefined", () => {
    const { container } = render(
      <FormSection>
        <span>transparent</span>
      </FormSection>,
    );
    const section = container.querySelector("section");
    expect(section).not.toBeNull();
    // No class applied (className is undefined)
    expect(section?.classList.length).toBe(0);
  });

  it("does not render title div when title is null", () => {
    const { container } = render(
      <FormSection title={null}>
        <span>body</span>
      </FormSection>,
    );
    const titleDiv = container.querySelector(".jenkins-section__title");
    expect(titleDiv).toBeNull();
  });

  // ---- Description ----

  it("renders description when provided", () => {
    const { container } = render(
      <FormSection title="Settings" description="Configure the build">
        <span>body</span>
      </FormSection>,
    );
    const desc = container.querySelector(".jenkins-section__description");
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toBe("Configure the build");
  });

  it("does not render description when not provided", () => {
    const { container } = render(
      <FormSection title="Settings">
        <span>body</span>
      </FormSection>,
    );
    const desc = container.querySelector(".jenkins-section__description");
    expect(desc).toBeNull();
  });

  // ---- Children ----

  it("renders children content", () => {
    const { container } = render(
      <FormSection title="Section">
        <div className="child-content">Hello</div>
      </FormSection>,
    );
    const child = container.querySelector(".child-content");
    expect(child).not.toBeNull();
    expect(child?.textContent).toBe("Hello");
  });

  // ---- Name / rowSet ----

  it("wraps in div with data-name when name is provided", () => {
    const { container } = render(
      <FormSection title="Section" name="mySection">
        <span>body</span>
      </FormSection>,
    );
    const wrapper = container.querySelector("[data-name='mySection']");
    expect(wrapper).not.toBeNull();
    // Section should be inside the wrapper
    const section = wrapper?.querySelector("section");
    expect(section).not.toBeNull();
  });

  it("does not wrap in div when name is not provided", () => {
    const { container } = render(
      <FormSection title="Section">
        <span>body</span>
      </FormSection>,
    );
    const wrapper = container.querySelector("[data-name]");
    expect(wrapper).toBeNull();
  });
});
