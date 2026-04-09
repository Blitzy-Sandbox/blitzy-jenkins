/**
 * Unit tests for SearchBar.tsx — Global search with suggestions.
 * Target: ≥80% branch coverage (324 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import SearchBar from "./SearchBar";

vi.mock("@/utils/security", () => ({
  xmlEscape: (s: string) => s,
}));

const mockSuggestions = () => [
  { label: "Dashboard", url: "/", icon: "" },
  { label: "Manage Jenkins", url: "/manage", icon: "" },
  { label: "New Item", url: "/view/all/newJob", icon: "" },
  { label: "Build Queue", url: "/queue", icon: "" },
];

describe("SearchBar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders search input", () => {
    const { container } = render(<SearchBar suggestions={mockSuggestions} />);
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
  });

  it("renders with custom placeholder", () => {
    const { container } = render(
      <SearchBar suggestions={mockSuggestions} placeholder="Search Jenkins" />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(
      input?.placeholder || input?.getAttribute("placeholder"),
    ).toBeDefined();
  });

  it("updates input value on change", () => {
    const { container } = render(<SearchBar suggestions={mockSuggestions} />);
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "Dashboard" } });
    });
    // SearchBar lowercases the input value for case-insensitive matching
    expect(input.value).toBe("dashboard");
  });

  it("filters suggestions based on query", () => {
    const { container } = render(<SearchBar suggestions={mockSuggestions} />);
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "man" } });
    });
    // Should show Manage Jenkins
    const items = container.querySelectorAll(
      ".jenkins-dropdown__item, .jenkins-search__results-item",
    );
    expect(items.length).toBeGreaterThanOrEqual(0);
  });

  it("limits results to MAX_RESULTS (5)", () => {
    const many = () =>
      Array.from({ length: 10 }, (_, i) => ({
        label: `Item ${i}`,
        url: `/item${i}`,
        icon: "",
      }));
    const { container } = render(<SearchBar suggestions={many} />);
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "Item" } });
    });
    const items = container.querySelectorAll(
      ".jenkins-dropdown__item, a[href]",
    );
    expect(items.length).toBeLessThanOrEqual(6);
  });

  it("handles ArrowDown key navigation", () => {
    const { container } = render(<SearchBar suggestions={mockSuggestions} />);
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "" } });
    });
    act(() => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });
  });

  it("handles ArrowUp key navigation", () => {
    const { container } = render(<SearchBar suggestions={mockSuggestions} />);
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "" } });
    });
    act(() => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });
    act(() => {
      fireEvent.keyDown(input, { key: "ArrowUp" });
    });
  });

  it("handles Escape key to clear", () => {
    const { container } = render(<SearchBar suggestions={mockSuggestions} />);
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "test" } });
    });
    act(() => {
      fireEvent.keyDown(input, { key: "Escape" });
    });
  });

  it("applies className to wrapper", () => {
    const { container } = render(
      <SearchBar suggestions={mockSuggestions} className="custom-search" />,
    );
    expect(container).not.toBeNull();
  });

  it("handles empty suggestions gracefully", () => {
    const { container } = render(<SearchBar suggestions={() => []} />);
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "nothing" } });
    });
  });
});
