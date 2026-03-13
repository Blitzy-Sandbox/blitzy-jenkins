/**
 * Unit tests for Defer.tsx
 *
 * Validates lazy loading trigger, fallback rendering, loaded state,
 * onContentReady callback, and DOMContentLoaded event dispatch.
 *
 * Target: ≥80% branch coverage.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Defer from "./Defer";

describe("Defer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children directly when no lazy prop is provided", () => {
    render(
      <Defer>
        <span>Direct Content</span>
      </Defer>,
    );
    expect(screen.getByText("Direct Content")).toBeDefined();
  });

  it("renders fallback while lazy component is loading", () => {
    const LazyComponent = () =>
      new Promise<{ default: React.ComponentType }>(() => {
        // Never resolves — keeps loading state
      });

    render(
      <Defer
        lazy={
          LazyComponent as () => Promise<{
            default: React.ComponentType<Record<string, unknown>>;
          }>
        }
        fallback={<div>Loading...</div>}
      />,
    );
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders lazy-loaded component after resolution", async () => {
    const MockComponent = () => <div>Lazy Loaded!</div>;

    render(
      <Defer
        lazy={() =>
          Promise.resolve({
            default: MockComponent as React.ComponentType<
              Record<string, unknown>
            >,
          })
        }
        fallback={<div>Loading...</div>}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Lazy Loaded!")).toBeDefined();
    });
  });

  it("fires onContentReady callback after mount", () => {
    const onReady = vi.fn();
    render(
      <Defer onContentReady={onReady}>
        <span>Content</span>
      </Defer>,
    );
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("dispatches DOMContentLoaded event from parent element", () => {
    const parentHandler = vi.fn();
    const parent = document.createElement("div");
    parent.addEventListener("DOMContentLoaded", parentHandler);
    document.body.appendChild(parent);

    render(
      <Defer>
        <span>Content</span>
      </Defer>,
      { container: parent },
    );

    expect(parentHandler).toHaveBeenCalled();
    parent.remove();
  });

  it("applies className to wrapper div", () => {
    const { container } = render(
      <Defer className="custom-defer">
        <span>Content</span>
      </Defer>,
    );
    expect(container.querySelector(".custom-defer")).not.toBeNull();
  });

  it("renders without children when only fallback is provided", () => {
    render(<Defer fallback={<span>Fallback Only</span>} />);
    // Should render wrapper div without error
    expect(document.querySelector("div")).not.toBeNull();
  });

  it("renders with null fallback by default", () => {
    const { container } = render(
      <Defer>
        <span>Content</span>
      </Defer>,
    );
    expect(container.querySelector("div")).not.toBeNull();
    expect(screen.getByText("Content")).toBeDefined();
  });

  it("renders empty wrapper when no children and no lazy provided", () => {
    const { container } = render(<Defer />);
    expect(container.querySelector("div")).not.toBeNull();
  });
});
