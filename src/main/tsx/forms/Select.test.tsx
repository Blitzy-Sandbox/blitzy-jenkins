/**
 * Unit tests for Select.tsx — Dropdown select with dynamic option fetching.
 * Target: ≥80% branch coverage (435 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { Select } from "./Select";

// Mock stapler query hook for dynamic option fetching
vi.mock("@/hooks/useStaplerQuery", () => ({
  useStaplerQuery: () => ({
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe("Select", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- Basic rendering ----

  it("renders a select element", () => {
    const { container } = render(<Select />);
    const select = container.querySelector("select");
    expect(select).not.toBeNull();
  });

  it("renders with name derived from field prop", () => {
    const { container } = render(<Select field="jdkVersion" />);
    const select = container.querySelector("select");
    expect(select?.getAttribute("name")).toBe("_.jdkVersion");
  });

  it("renders with explicit name prop", () => {
    const { container } = render(<Select name="mySelect" />);
    const select = container.querySelector("select");
    expect(select?.getAttribute("name")).toBe("mySelect");
  });

  it("applies className", () => {
    const { container } = render(<Select className="custom-select" />);
    const select = container.querySelector("select");
    expect(select?.className).toContain("custom-select");
  });

  // ---- Options rendering ----

  it("renders options from options array", () => {
    const options = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
      { value: "c", label: "Gamma" },
    ];
    const { container } = render(<Select options={options} />);
    const opts = container.querySelectorAll("option");
    expect(opts.length).toBeGreaterThanOrEqual(3);
  });

  it("renders with default value selected", () => {
    const options = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ];
    const { container } = render(<Select options={options} defaultValue="b" />);
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("b");
  });

  // ---- Value changes ----

  it("fires onChange callback on selection", () => {
    const onChange = vi.fn();
    const options = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ];
    const { container } = render(
      <Select options={options} onChange={onChange} />,
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    act(() => {
      fireEvent.change(select, { target: { value: "b" } });
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("updates selected value on change", () => {
    const options = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ];
    const { container } = render(<Select options={options} />);
    const select = container.querySelector("select") as HTMLSelectElement;
    act(() => {
      fireEvent.change(select, { target: { value: "b" } });
    });
    expect(select.value).toBe("b");
  });

  // ---- ReadOnly (disabled) ----

  it("renders in disabled state when readOnly", () => {
    const { container } = render(<Select readOnly={true} />);
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });

  // ---- Validation ----

  it("renders with checkUrl for validation", () => {
    const { container } = render(<Select checkUrl="/validate/field" />);
    const select = container.querySelector("select");
    expect(select).not.toBeNull();
  });

  it("renders with checkMessage", () => {
    const { container } = render(<Select checkMessage="Selection required" />);
    const select = container.querySelector("select");
    expect(select).not.toBeNull();
  });

  // ---- Dynamic fill URL ----

  it("renders when fillUrl is provided", () => {
    const { container } = render(<Select fillUrl="/api/fill" />);
    const select = container.querySelector("select");
    expect(select).not.toBeNull();
  });

  it("renders when fillUrl with fillDependsOn is provided", () => {
    const { container } = render(
      <Select fillUrl="/api/fill" fillDependsOn="otherField" />,
    );
    const select = container.querySelector("select");
    expect(select).not.toBeNull();
  });

  // ---- Controlled value update ----

  it("updates when options prop changes", () => {
    const opts1 = [{ value: "a", label: "Alpha" }];
    const opts2 = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ];
    const { container, rerender } = render(<Select options={opts1} />);
    let optEls = container.querySelectorAll("option");
    expect(optEls.length).toBeGreaterThanOrEqual(1);
    rerender(<Select options={opts2} />);
    optEls = container.querySelectorAll("option");
    expect(optEls.length).toBeGreaterThanOrEqual(2);
  });
});
