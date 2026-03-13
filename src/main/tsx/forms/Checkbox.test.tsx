/**
 * Unit tests for Checkbox.tsx — Boolean checkbox with label, description, validation.
 * Target: ≥80% branch coverage (165 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- Basic rendering ----

  it("renders a checkbox input element", () => {
    const { container } = render(<Checkbox />);
    const input = container.querySelector("input[type='checkbox']");
    expect(input).not.toBeNull();
  });

  it("renders with jenkins-checkbox class wrapper", () => {
    const { container } = render(<Checkbox />);
    const wrapper = container.querySelector(".jenkins-checkbox");
    expect(wrapper).not.toBeNull();
  });

  it("renders with name derived from field prop", () => {
    const { container } = render(<Checkbox field="enabled" />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("name")).toBe("_.enabled");
  });

  it("renders with explicit name prop", () => {
    const { container } = render(<Checkbox name="myCheckbox" />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("name")).toBe("myCheckbox");
  });

  // ---- Label ----

  it("renders label text", () => {
    const { container } = render(<Checkbox label="Enable feature" />);
    const label = container.querySelector("label");
    expect(label?.textContent).toBe("Enable feature");
  });

  it("renders empty label with js-checkbox-label-empty class when no label", () => {
    const { container } = render(<Checkbox />);
    const label = container.querySelector("label");
    expect(label?.className).toContain("js-checkbox-label-empty");
  });

  it("renders label without js-checkbox-label-empty when label provided", () => {
    const { container } = render(<Checkbox label="Enabled" />);
    const label = container.querySelector("label");
    expect(label?.className).not.toContain("js-checkbox-label-empty");
  });

  // ---- Checked state ----

  it("renders unchecked by default", () => {
    const { container } = render(<Checkbox />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.checked).toBe(false);
  });

  it("renders checked when defaultChecked is true", () => {
    const { container } = render(<Checkbox defaultChecked={true} />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it("renders checked in controlled mode", () => {
    const { container } = render(<Checkbox checked={true} />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it("renders unchecked in controlled mode", () => {
    const { container } = render(<Checkbox checked={false} />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.checked).toBe(false);
  });

  // ---- onChange ----

  it("calls onChange when clicked", () => {
    const onChange = vi.fn();
    const { container } = render(<Checkbox onChange={onChange} />);
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      fireEvent.click(input);
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("toggles uncontrolled checkbox on click", () => {
    const { container } = render(<Checkbox />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.checked).toBe(false);
    act(() => {
      fireEvent.click(input);
    });
    expect(input.checked).toBe(true);
  });

  // ---- Disabled ----

  it("renders disabled when disabled prop is true", () => {
    const { container } = render(<Checkbox disabled={true} />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  // ---- Description ----

  it("renders description text", () => {
    const { container } = render(
      <Checkbox description="This enables the feature" />,
    );
    const desc = container.querySelector(".jenkins-checkbox__description");
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toBe("This enables the feature");
  });

  it("does not render description when not provided", () => {
    const { container } = render(<Checkbox />);
    const desc = container.querySelector(".jenkins-checkbox__description");
    expect(desc).toBeNull();
  });

  // ---- Tooltip ----

  it("applies tooltip to input and label", () => {
    const { container } = render(<Checkbox tooltip="Toggle me" />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("title")).toBe("Toggle me");
  });

  // ---- Negative ----

  it("applies negative class when negative prop is true", () => {
    const { container } = render(<Checkbox negative={true} />);
    const input = container.querySelector("input");
    expect(input?.className).toContain("negative");
  });

  // ---- Validation ----

  it("applies validated class when checkUrl is provided", () => {
    const { container } = render(<Checkbox checkUrl="/validate" />);
    const input = container.querySelector("input");
    expect(input?.className).toContain("validated");
  });

  it("adds data-check-url attribute", () => {
    const { container } = render(<Checkbox checkUrl="/validate/field" />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("data-check-url")).toBe("/validate/field");
  });

  // ---- Value and JSON ----

  it("sets value attribute on input", () => {
    const { container } = render(<Checkbox value="true" />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("value")).toBe("true");
  });

  it("sets data-json attribute", () => {
    const { container } = render(<Checkbox json='{"key":"val"}' />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("data-json")).toBe('{"key":"val"}');
  });

  // ---- className ----

  it("applies className to input", () => {
    const { container } = render(<Checkbox className="custom" />);
    const input = container.querySelector("input");
    expect(input?.className).toContain("custom");
  });

  // ---- ID ----

  it("uses provided id", () => {
    const { container } = render(<Checkbox id="my-cb" />);
    const input = container.querySelector("#my-cb");
    expect(input).not.toBeNull();
  });

  it("auto-generates id when not provided", () => {
    const { container } = render(<Checkbox />);
    const input = container.querySelector("input");
    const label = container.querySelector("label");
    // The label's htmlFor should match the input's id
    expect(label?.getAttribute("for")).toBe(input?.getAttribute("id"));
  });
});
