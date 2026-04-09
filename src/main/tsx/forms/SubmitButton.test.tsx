/**
 * Unit tests for SubmitButton.tsx — Form submit button with React 19 action integration.
 * Target: ≥80% branch coverage (352 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { SubmitButton } from "./SubmitButton";

// Mock i18n hook
vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    loadBundle: vi.fn().mockResolvedValue({}),
  }),
}));

describe("SubmitButton", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- Basic rendering ----

  it("renders a button element", () => {
    const { container } = render(<SubmitButton />);
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
  });

  it("renders with type submit", () => {
    const { container } = render(<SubmitButton />);
    const button = container.querySelector("button");
    expect(button?.getAttribute("type")).toBe("submit");
  });

  it("renders with jenkins-button class", () => {
    const { container } = render(<SubmitButton />);
    const button = container.querySelector("button");
    expect(button?.className).toContain("jenkins-button");
    expect(button?.className).toContain("jenkins-submit-button");
  });

  // ---- Primary variant ----

  it("renders with primary class by default", () => {
    const { container } = render(<SubmitButton />);
    const button = container.querySelector("button");
    expect(button?.className).toContain("jenkins-button--primary");
  });

  it("renders without primary class when primary is false", () => {
    const { container } = render(<SubmitButton primary={false} />);
    const button = container.querySelector("button");
    expect(button?.className).not.toContain("jenkins-button--primary");
  });

  // ---- Button text ----

  it("renders default Submit text from i18n", () => {
    const { container } = render(<SubmitButton />);
    const button = container.querySelector("button");
    // t('Submit') returns 'Submit' from our mock
    expect(button?.textContent).toContain("Submit");
  });

  it("renders custom value text", () => {
    const { container } = render(<SubmitButton value="Save" />);
    const button = container.querySelector("button");
    expect(button?.textContent).toContain("Save");
  });

  // ---- Name ----

  it("renders with default name Submit", () => {
    const { container } = render(<SubmitButton />);
    const button = container.querySelector("button");
    expect(button?.getAttribute("name")).toBe("Submit");
  });

  it("renders with custom name", () => {
    const { container } = render(<SubmitButton name="apply" />);
    const button = container.querySelector("button");
    expect(button?.getAttribute("name")).toBe("apply");
  });

  // ---- ID ----

  it("applies id attribute", () => {
    const { container } = render(<SubmitButton id="save-btn" />);
    const button = container.querySelector("#save-btn");
    expect(button).not.toBeNull();
  });

  // ---- className ----

  it("appends className", () => {
    const { container } = render(<SubmitButton className="extra" />);
    const button = container.querySelector("button");
    expect(button?.className).toContain("extra");
  });

  // ---- Disabled ----

  it("renders disabled when disabled prop is true", () => {
    const { container } = render(<SubmitButton disabled={true} />);
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("renders enabled by default", () => {
    const { container } = render(<SubmitButton />);
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  // ---- formNoValidate ----

  it("has formNoValidate attribute", () => {
    const { container } = render(<SubmitButton />);
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.formNoValidate).toBe(true);
  });

  // ---- Icon ----

  it("renders symbol icon when icon prop starts with symbol-", () => {
    const { container } = render(<SubmitButton icon="symbol-save" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const use = container.querySelector("use");
    expect(use?.getAttribute("href")).toBe("#symbol-save");
  });

  it("renders image icon when icon is a path", () => {
    const { container } = render(
      <SubmitButton icon="/images/24x24/save.png" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/images/24x24/save.png");
  });

  it("renders no icon when icon prop is not provided", () => {
    const { container } = render(<SubmitButton />);
    const iconSpan = container.querySelector(".jenkins-button__icon");
    expect(iconSpan).toBeNull();
  });

  // ---- Value attribute ----

  it("sets value attribute on button", () => {
    const { container } = render(<SubmitButton value="Apply" />);
    const button = container.querySelector("button");
    expect(button?.getAttribute("value")).toBe("Apply");
  });

  // ---- Action prop (React 19 form action) ----

  it("does not set name when action is provided", () => {
    const action = vi.fn();
    const { container } = render(
      <SubmitButton action={action} name="Submit" />,
    );
    const button = container.querySelector("button");
    // When action is provided, name is omitted to avoid React warnings
    expect(button?.getAttribute("name")).toBeNull();
  });
});
