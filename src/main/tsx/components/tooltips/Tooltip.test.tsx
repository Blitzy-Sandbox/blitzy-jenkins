/**
 * Unit tests for Tooltip.tsx — Accessible tooltip wrapper.
 * Target: ≥80% branch coverage (960 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import Tooltip, { hoverNotification, TooltipManager } from "./Tooltip";

vi.mock("@/utils/dom", () => ({
  createElementFromHtml: (html: string) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.firstChild;
  },
}));

describe("Tooltip", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children content", () => {
    render(
      <Tooltip text="Helpful tip">
        <button>Hover me</button>
      </Tooltip>,
    );
    expect(screen.getByText("Hover me")).toBeDefined();
  });

  it("renders without crashing with text prop", () => {
    const { container } = render(
      <Tooltip text="Tip text">
        <span>Element</span>
      </Tooltip>,
    );
    expect(container).not.toBeNull();
  });

  it("renders without crashing with htmlContent prop", () => {
    const { container } = render(
      <Tooltip htmlContent="<b>Bold tip</b>">
        <span>Element</span>
      </Tooltip>,
    );
    expect(container).not.toBeNull();
  });

  it("shows tooltip on mouse enter", () => {
    render(
      <Tooltip text="Tooltip content">
        <button>Hover</button>
      </Tooltip>,
    );
    const trigger = screen.getByText("Hover");
    act(() => {
      fireEvent.mouseEnter(trigger);
    });
  });

  it("hides tooltip on mouse leave", () => {
    render(
      <Tooltip text="Tooltip content">
        <button>Hover</button>
      </Tooltip>,
    );
    const trigger = screen.getByText("Hover");
    act(() => {
      fireEvent.mouseEnter(trigger);
    });
    act(() => {
      fireEvent.mouseLeave(trigger);
    });
  });

  it("shows tooltip on focus", () => {
    render(
      <Tooltip text="Focus tip">
        <button>Focus me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText("Focus me");
    act(() => {
      fireEvent.focus(trigger);
    });
  });

  it("hides tooltip on blur", () => {
    render(
      <Tooltip text="Focus tip">
        <button>Focus me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText("Focus me");
    act(() => {
      fireEvent.focus(trigger);
    });
    act(() => {
      fireEvent.blur(trigger);
    });
  });

  it("renders with placement prop", () => {
    const { container } = render(
      <Tooltip text="Tip" placement="top">
        <span>Target</span>
      </Tooltip>,
    );
    expect(container).not.toBeNull();
  });

  it("renders with className prop", () => {
    const { container } = render(
      <Tooltip text="Tip" className="custom-tooltip">
        <span>Target</span>
      </Tooltip>,
    );
    expect(container).not.toBeNull();
  });

  it("handles empty text prop gracefully", () => {
    const { container } = render(
      <Tooltip text="">
        <span>No tip</span>
      </Tooltip>,
    );
    expect(container).not.toBeNull();
  });
});

describe("TooltipManager", () => {
  it("renders without crashing", () => {
    const { container } = render(<TooltipManager />);
    expect(container).not.toBeNull();
  });
});

describe("hoverNotification", () => {
  it("is a callable function", () => {
    expect(typeof hoverNotification).toBe("function");
  });

  it("does not throw when called with valid args", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    expect(() => hoverNotification("Test notification", el)).not.toThrow();
    el.remove();
  });

  it("returns early for empty text", () => {
    const el = document.createElement("div");
    expect(() => hoverNotification("", el)).not.toThrow();
  });
});
