/**
 * Unit tests for Radio.tsx — Radio button with label and nested children.
 * Target: ≥80% branch coverage (154 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { Radio } from "./Radio";

describe("Radio", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- Basic rendering ----

  it("renders a radio input element", () => {
    const { container } = render(<Radio name="group1" />);
    const input = container.querySelector("input[type='radio']");
    expect(input).not.toBeNull();
  });

  it("renders with jenkins-radio class wrapper", () => {
    const { container } = render(<Radio name="group1" />);
    const wrapper = container.querySelector(".jenkins-radio");
    expect(wrapper).not.toBeNull();
  });

  it("renders with correct name attribute", () => {
    const { container } = render(<Radio name="color" />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("name")).toBe("color");
  });

  it("renders with value attribute", () => {
    const { container } = render(<Radio name="color" value="red" />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("value")).toBe("red");
  });

  // ---- Label ----

  it("renders label text", () => {
    const { container } = render(<Radio name="color" label="Red" />);
    const label = container.querySelector(".jenkins-radio__label");
    expect(label?.textContent).toBe("Red");
  });

  it("label has htmlFor matching input id", () => {
    const { container } = render(<Radio name="color" label="Red" />);
    const input = container.querySelector("input");
    const label = container.querySelector("label");
    expect(label?.getAttribute("for")).toBe(input?.getAttribute("id"));
  });

  // ---- Controlled vs Uncontrolled ----

  it("renders checked in controlled mode with onChange", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Radio name="color" checked={true} onChange={onChange} />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it("renders unchecked in controlled mode", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Radio name="color" checked={false} onChange={onChange} />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.checked).toBe(false);
  });

  it("calls onChange when clicked in controlled mode", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Radio name="color" checked={false} onChange={onChange} />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      fireEvent.click(input);
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("uses defaultChecked in uncontrolled mode (no onChange)", () => {
    const { container } = render(<Radio name="color" checked={true} />);
    const input = container.querySelector("input") as HTMLInputElement;
    // Without onChange, checked becomes defaultChecked
    expect(input.checked).toBe(true);
  });

  // ---- Disabled ----

  it("renders disabled when disabled prop is true", () => {
    const { container } = render(<Radio name="color" disabled={true} />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  // ---- ID ----

  it("uses provided id", () => {
    const { container } = render(<Radio name="color" id="my-radio" />);
    const input = container.querySelector("#my-radio");
    expect(input).not.toBeNull();
  });

  it("auto-generates id when not provided", () => {
    const { container } = render(<Radio name="color" />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("id")).not.toBeNull();
    expect(input?.getAttribute("id")!.length).toBeGreaterThan(0);
  });

  // ---- Children ----

  it("renders children in jenkins-radio__children container", () => {
    const { container } = render(
      <Radio name="option" label="Custom">
        <span>Nested content</span>
      </Radio>,
    );
    const childrenDiv = container.querySelector(".jenkins-radio__children");
    expect(childrenDiv).not.toBeNull();
    expect(childrenDiv?.textContent).toBe("Nested content");
  });

  it("does not render children container when no children", () => {
    const { container } = render(<Radio name="option" />);
    const childrenDiv = container.querySelector(".jenkins-radio__children");
    expect(childrenDiv).toBeNull();
  });
});
