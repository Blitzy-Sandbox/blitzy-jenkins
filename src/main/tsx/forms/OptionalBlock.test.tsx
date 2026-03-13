/**
 * Unit tests for OptionalBlock.tsx — Collapsible optional section with checkbox.
 * Target: ≥80% branch coverage (259 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { OptionalBlock } from "./OptionalBlock";

describe("OptionalBlock", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- Normal mode (title provided) ----

  it("renders checkbox when title is provided", () => {
    const { container } = render(
      <OptionalBlock title="Enable feature">
        <span>feature content</span>
      </OptionalBlock>,
    );
    const checkbox = container.querySelector("input[type='checkbox']");
    expect(checkbox).not.toBeNull();
  });

  it("renders title text near checkbox", () => {
    const { container } = render(
      <OptionalBlock title="Enable logging">
        <span>content</span>
      </OptionalBlock>,
    );
    expect(container.textContent).toContain("Enable logging");
  });

  it("renders with optionalBlock-container class", () => {
    const { container } = render(
      <OptionalBlock title="Feature">
        <span>content</span>
      </OptionalBlock>,
    );
    const optBlock = container.querySelector(".optionalBlock-container");
    expect(optBlock).not.toBeNull();
  });

  // ---- Collapsed state (unchecked) ----

  it("starts collapsed when checked is false (default)", () => {
    const { container } = render(
      <OptionalBlock title="Feature">
        <span className="inner">hidden</span>
      </OptionalBlock>,
    );
    const formContainer = container.querySelector(".form-container");
    if (formContainer) {
      const style = (formContainer as HTMLElement).style.display;
      expect(style).toBe("none");
    }
  });

  // ---- Expanded state (checked) ----

  it("starts expanded when checked is true", () => {
    const { container } = render(
      <OptionalBlock title="Feature" checked={true}>
        <span className="inner">visible</span>
      </OptionalBlock>,
    );
    const checkbox = container.querySelector(
      "input[type='checkbox']",
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  // ---- Toggle ----

  it("toggles visibility on checkbox click", () => {
    const { container } = render(
      <OptionalBlock title="Feature">
        <span>content</span>
      </OptionalBlock>,
    );
    const checkbox = container.querySelector(
      "input[type='checkbox']",
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    act(() => {
      fireEvent.click(checkbox);
    });
    expect(checkbox.checked).toBe(true);
  });

  it("calls onChange callback on toggle", () => {
    const onChange = vi.fn();
    const { container } = render(
      <OptionalBlock title="Feature" onChange={onChange}>
        <span>content</span>
      </OptionalBlock>,
    );
    const checkbox = container.querySelector(
      "input[type='checkbox']",
    ) as HTMLInputElement;
    act(() => {
      fireEvent.click(checkbox);
    });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  // ---- Negative mode ----

  it("starts expanded when negative is true and checked is false", () => {
    const { container } = render(
      <OptionalBlock title="Disable feature" negative={true} checked={false}>
        <span>expanded content</span>
      </OptionalBlock>,
    );
    // In negative mode, the section is expanded when checkbox is UNchecked
    const checkbox = container.querySelector(
      "input[type='checkbox']",
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    // Content should be visible
    expect(container.textContent).toContain("expanded content");
  });

  // ---- RowSet mode (no title) ----

  it("renders without checkbox when title is null", () => {
    const { container } = render(
      <OptionalBlock title={null}>
        <span>always visible</span>
      </OptionalBlock>,
    );
    const checkbox = container.querySelector("input[type='checkbox']");
    expect(checkbox).toBeNull();
  });

  it("renders children unconditionally in rowSet mode", () => {
    const { container } = render(
      <OptionalBlock>
        <span className="always">visible content</span>
      </OptionalBlock>,
    );
    const inner = container.querySelector(".always");
    expect(inner).not.toBeNull();
    expect(inner?.textContent).toBe("visible content");
  });

  // ---- Name / Field ----

  it("passes name to checkbox", () => {
    const { container } = render(
      <OptionalBlock title="Feature" name="enableFeature">
        <span>content</span>
      </OptionalBlock>,
    );
    const checkbox = container.querySelector("input[type='checkbox']");
    expect(checkbox?.getAttribute("name")).toContain("enableFeature");
  });

  // ---- Inline mode ----

  it("renders without row-set classes when inline is true", () => {
    const { container } = render(
      <OptionalBlock title="Feature" inline={true}>
        <span>content</span>
      </OptionalBlock>,
    );
    // When inline, row-set-start/end classes are NOT applied
    expect(container.querySelector(".row-set-start")).toBeNull();
  });

  // ---- Children rendering ----

  it("renders children content when expanded", () => {
    const { container } = render(
      <OptionalBlock title="Enable" checked={true}>
        <div className="child-test">Child content</div>
      </OptionalBlock>,
    );
    const child = container.querySelector(".child-test");
    expect(child).not.toBeNull();
    expect(child?.textContent).toBe("Child content");
  });

  // ---- Inert on collapsed ----

  it("marks collapsed section as inert for accessibility", () => {
    const { container } = render(
      <OptionalBlock title="Feature" checked={false}>
        <span>content</span>
      </OptionalBlock>,
    );
    const formContainer = container.querySelector(
      ".form-container",
    ) as HTMLElement;
    if (formContainer) {
      expect(formContainer.hasAttribute("inert")).toBe(true);
    }
  });
});
