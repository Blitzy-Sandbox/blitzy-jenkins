/**
 * Unit tests for FormEntry.tsx — Form field wrapper with label, help, validation.
 * Target: ≥80% branch coverage (372 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { FormEntry } from "./FormEntry";

// Mock i18n hook
vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    loadBundle: vi.fn().mockResolvedValue({}),
  }),
}));

// Mock stapler query hook for help content fetching
vi.mock("@/hooks/useStaplerQuery", () => ({
  useStaplerQuery: () => ({
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe("FormEntry", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- Mode 1: Title provided ----

  it("renders with title in Mode 1 (label above control)", () => {
    const { container } = render(
      <FormEntry title="Username">
        <input type="text" />
      </FormEntry>,
    );
    const label = container.querySelector(".jenkins-form-label");
    expect(label).not.toBeNull();
    expect(label?.textContent).toContain("Username");
  });

  it("renders children inside setting-main wrapper", () => {
    const { container } = render(
      <FormEntry title="Name">
        <input type="text" data-testid="child" />
      </FormEntry>,
    );
    const settingMain = container.querySelector(".setting-main");
    expect(settingMain).not.toBeNull();
    const input = settingMain?.querySelector("input");
    expect(input).not.toBeNull();
  });

  it("renders description in Mode 1", () => {
    const { container } = render(
      <FormEntry title="Name" description="Enter your name">
        <input type="text" />
      </FormEntry>,
    );
    const desc = container.querySelector(".jenkins-form-description");
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toBe("Enter your name");
  });

  it("does not render description when empty", () => {
    const { container } = render(
      <FormEntry title="Name">
        <input type="text" />
      </FormEntry>,
    );
    const desc = container.querySelector(".jenkins-form-description");
    expect(desc).toBeNull();
  });

  // ---- Mode 2: Title absent ----

  it("renders without title in Mode 2 (control inline)", () => {
    const { container } = render(
      <FormEntry>
        <input type="text" />
      </FormEntry>,
    );
    const label = container.querySelector(".jenkins-form-label");
    expect(label).toBeNull();
    const settingMain = container.querySelector(".setting-main");
    expect(settingMain).not.toBeNull();
  });

  it("renders description after help area in Mode 2", () => {
    const { container } = render(
      <FormEntry description="Some help text">
        <input type="text" />
      </FormEntry>,
    );
    const desc = container.querySelector(".jenkins-form-description");
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toBe("Some help text");
  });

  // ---- Container ----

  it("renders with jenkins-form-item class", () => {
    const { container } = render(
      <FormEntry>
        <input />
      </FormEntry>,
    );
    const wrapper = container.querySelector(".jenkins-form-item");
    expect(wrapper).not.toBeNull();
  });

  it("applies className to container", () => {
    const { container } = render(
      <FormEntry className="custom-entry">
        <input />
      </FormEntry>,
    );
    const wrapper = container.querySelector(".jenkins-form-item");
    expect(wrapper?.className).toContain("custom-entry");
  });

  // ---- Validation ----

  it("renders validation error message", () => {
    const { container } = render(
      <FormEntry title="Field" validationError="This field is required">
        <input />
      </FormEntry>,
    );
    const errorArea = container.querySelector(".validation-error-area");
    expect(errorArea).not.toBeNull();
    const error = errorArea?.querySelector(".error");
    expect(error).not.toBeNull();
    expect(error?.textContent).toBe("This field is required");
  });

  it("renders empty validation area when no error", () => {
    const { container } = render(
      <FormEntry title="Field">
        <input />
      </FormEntry>,
    );
    const errorArea = container.querySelector(".validation-error-area");
    expect(errorArea).not.toBeNull();
    const error = errorArea?.querySelector(".error");
    expect(error).toBeNull();
  });

  // ---- Help link ----

  it("renders help button when help URL provided in Mode 1", () => {
    const { container } = render(
      <FormEntry title="Field" help="/help/field.html">
        <input />
      </FormEntry>,
    );
    const helpBtn = container.querySelector(".jenkins-help-button");
    expect(helpBtn).not.toBeNull();
  });

  it("does not render help button when no help URL", () => {
    const { container } = render(
      <FormEntry title="Field">
        <input />
      </FormEntry>,
    );
    const helpBtn = container.querySelector(".jenkins-help-button");
    expect(helpBtn).toBeNull();
  });

  it("renders help button in Mode 2 with help URL", () => {
    const { container } = render(
      <FormEntry help="/help/field.html">
        <input />
      </FormEntry>,
    );
    const helpBtn = container.querySelector(".jenkins-help-button");
    expect(helpBtn).not.toBeNull();
  });

  it("toggles help area on help button click", () => {
    const { container } = render(
      <FormEntry title="Field" help="/help/field.html">
        <input />
      </FormEntry>,
    );
    const helpBtn = container.querySelector(
      ".jenkins-help-button",
    ) as HTMLElement;
    expect(helpBtn).not.toBeNull();

    // Initially help area should be hidden
    let helpArea = container.querySelector(".help-area");
    expect(helpArea).not.toBeNull();

    // Click to expand
    act(() => {
      fireEvent.click(helpBtn);
    });

    // Help area should now be visible
    helpArea = container.querySelector(".help-area");
    expect(helpArea).not.toBeNull();
    const helpDiv = container.querySelector(".help");
    expect(helpDiv).not.toBeNull();
  });

  // ---- Field prop ----

  it("renders with field prop without error", () => {
    const { container } = render(
      <FormEntry field="username">
        <input />
      </FormEntry>,
    );
    expect(container.querySelector(".jenkins-form-item")).not.toBeNull();
  });

  // ---- Empty description not rendered ----

  it("does not render description when empty string in Mode 1", () => {
    const { container } = render(
      <FormEntry title="Name" description="">
        <input />
      </FormEntry>,
    );
    const desc = container.querySelector(".jenkins-form-description");
    expect(desc).toBeNull();
  });
});
