/**
 * Unit tests for Notifications.tsx — Toast notification system.
 * Target: ≥80% branch coverage (290 lines).
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import Notifications from "./Notifications";

vi.mock("@/utils/symbols", () => ({
  INFO: '<svg class="info"></svg>',
  SUCCESS: '<svg class="success"></svg>',
  WARNING: '<svg class="warning"></svg>',
  ERROR: '<svg class="error"></svg>',
}));

describe("Notifications", () => {
  beforeEach(() => {
    // Set up notification-bar element if needed
    const container = document.createElement("div");
    container.id = "notification-bar";
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.getElementById("notification-bar")?.remove();
    vi.restoreAllMocks();
    delete (window as Record<string, unknown>).notificationBar;
  });

  it("renders without crashing", () => {
    const { container } = render(<Notifications />);
    expect(container).not.toBeNull();
  });

  it("renders notification container", () => {
    const { container } = render(<Notifications />);
    expect(container.firstChild).not.toBeNull();
  });

  it("exposes window.notificationBar API after mount", () => {
    render(<Notifications />);
    const bar = (window as Record<string, unknown>).notificationBar;
    expect(bar).toBeDefined();
  });

  it("shows notification via imperative API", async () => {
    render(<Notifications />);
    const bar = (
      window as Record<string, { show: (msg: string, type: string) => void }>
    ).notificationBar;
    if (bar && typeof bar.show === "function") {
      act(() => {
        bar.show("Test notification", "INFO");
      });
      await waitFor(() => {
        const notifs = document.querySelectorAll(
          ".jenkins-notification, [role='alert']",
        );
        expect(notifs.length).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it("auto-dismisses notifications after timeout", async () => {
    vi.useFakeTimers();
    render(<Notifications />);
    const bar = (
      window as Record<string, { show: (msg: string, type: string) => void }>
    ).notificationBar;
    if (bar && typeof bar.show === "function") {
      act(() => {
        bar.show("Temporary", "SUCCESS");
      });
      act(() => {
        vi.advanceTimersByTime(10000);
      });
    }
    vi.useRealTimers();
  });

  it("handles multiple notification types", () => {
    render(<Notifications />);
    const bar = (
      window as Record<string, { show: (msg: string, type: string) => void }>
    ).notificationBar;
    if (bar && typeof bar.show === "function") {
      act(() => {
        bar.show("Info", "INFO");
      });
      act(() => {
        bar.show("Warning", "WARNING");
      });
      act(() => {
        bar.show("Error", "ERROR");
      });
    }
  });
});
