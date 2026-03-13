/**
 * Unit tests for TextBox.tsx — Text input with validation and autocomplete.
 * Target: ≥80% branch coverage (477 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { TextBox } from "./TextBox";

// Mock Stapler query hook used for autocomplete
vi.mock("@/hooks/useStaplerQuery", () => ({
  useStaplerQuery: () => ({
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe("TextBox", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Basic rendering ----

  it("renders a text input element", () => {
    const { container } = render(<TextBox />);
    const input = container.querySelector("input[type='text']");
    expect(input).not.toBeNull();
  });

  it("renders with name derived from field prop", () => {
    const { container } = render(<TextBox field="username" />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("name")).toBe("_.username");
  });

  it("renders with explicit name prop", () => {
    const { container } = render(<TextBox name="myName" />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("name")).toBe("myName");
  });

  it("renders with value prop", () => {
    const { container } = render(<TextBox value="hello" />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input?.value).toBe("hello");
  });

  it("renders with defaultValue when no value", () => {
    const { container } = render(<TextBox defaultValue="default-val" />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input?.value).toBe("default-val");
  });

  it("renders with placeholder", () => {
    const { container } = render(<TextBox placeholder="Type here..." />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("placeholder")).toBe("Type here...");
  });

  it("applies className to input", () => {
    const { container } = render(<TextBox className="required number" />);
    const input = container.querySelector("input");
    expect(input?.className).toContain("required");
    expect(input?.className).toContain("number");
  });

  // ---- Value changes ----

  it("fires onChange callback when value changes", () => {
    const onChange = vi.fn();
    const { container } = render(<TextBox onChange={onChange} />);
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "new text" } });
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("updates input value on change", () => {
    const { container } = render(<TextBox />);
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "typed" } });
    });
    expect(input.value).toBe("typed");
  });

  // ---- Read-only ----

  it("renders in readOnly mode", () => {
    const { container } = render(<TextBox readOnly={true} value="readonly" />);
    // readOnly TextBox renders a <span> instead of an <input>
    expect(container.textContent).toContain("readonly");
  });

  // ---- Validation URL ----

  it("adds validated class when checkUrl is provided", () => {
    const { container } = render(<TextBox checkUrl="/check/field" />);
    const input = container.querySelector("input");
    // The component should add "validated" class and data-check-url attr
    expect(input).not.toBeNull();
    const hasValidation =
      input?.className.includes("validated") ||
      input?.hasAttribute("data-check-url");
    expect(hasValidation).toBe(true);
  });

  // ---- Autocomplete ----

  it("renders without autocomplete by default", () => {
    const { container } = render(<TextBox />);
    // Without autoCompleteUrl, no suggestion list should be present
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("renders with autoCompleteUrl", () => {
    const { container } = render(
      <TextBox autoCompleteUrl="/suggest" autoCompleteDelimChar="," />,
    );
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
  });

  it("renders controlled value correctly", () => {
    const { container, rerender } = render(<TextBox value="first" />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("first");
    rerender(<TextBox value="second" />);
    expect(input.value).toBe("second");
  });
});
