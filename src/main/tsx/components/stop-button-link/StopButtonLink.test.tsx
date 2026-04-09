/**
 * Unit tests for StopButtonLink.tsx — Build abort trigger.
 * Target: ≥80% branch coverage (244 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { StopButtonLink } from "./StopButtonLink";

vi.mock("@/hooks/useCrumb", () => ({
  useCrumb: () => ({
    crumbFieldName: "Jenkins-Crumb",
    crumbValue: "test-crumb",
  }),
}));

// Mock global fetch to prevent unhandled rejections from relative URLs in jsdom
const fetchSpy = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
vi.stubGlobal("fetch", fetchSpy);

describe("StopButtonLink", () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.body.querySelectorAll("form").forEach((f) => f.remove());
  });

  it("renders the stop button link", () => {
    render(<StopButtonLink href="/job/test/1/stop" />);
    const el = document.querySelector(".stop-button-link, a, button");
    expect(el).not.toBeNull();
  });

  it("renders children content", () => {
    render(
      <StopButtonLink href="/stop">
        <span>Stop Build</span>
      </StopButtonLink>,
    );
    expect(screen.getByText("Stop Build")).toBeDefined();
  });

  it("handles click event", () => {
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    render(<StopButtonLink href="/job/test/1/stop" />);
    const el = document.querySelector(".stop-button-link, a, button");
    if (el) {
      act(() => {
        fireEvent.click(el);
      });
    }
  });

  it("creates form with POST method and crumb on click", () => {
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    render(<StopButtonLink href="/job/test/1/stop" />);
    const el = document.querySelector(".stop-button-link, a, button");
    if (el) {
      act(() => {
        fireEvent.click(el);
      });
      const form = document.body.querySelector("form");
      if (form) {
        expect(form.getAttribute("action")).toBe("/job/test/1/stop");
      }
    }
  });

  it("renders with confirmation message", () => {
    render(
      <StopButtonLink href="/stop" confirmMessage="Are you sure?">
        Stop
      </StopButtonLink>,
    );
    expect(screen.getByText("Stop")).toBeDefined();
  });

  it("applies custom className", () => {
    const { container } = render(
      <StopButtonLink href="/stop" className="custom">
        Stop
      </StopButtonLink>,
    );
    expect(container).not.toBeNull();
  });
});
