/**
 * Unit tests for hooks/useKeyboardShortcut.ts — Keyboard shortcut hook.
 *
 * Tests the exported pure utility functions (`isMacPlatform`,
 * `translateModifierKeysForUsersPlatform`) and the hook itself
 * by dispatching keydown events to the document.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  isMacPlatform,
  translateModifierKeysForUsersPlatform,
  useKeyboardShortcut,
} from "./useKeyboardShortcut";

// ---------------------------------------------------------------------------
// Helper to mock navigator.platform
// ---------------------------------------------------------------------------
function mockPlatform(value: string) {
  Object.defineProperty(navigator, "platform", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("isMacPlatform", () => {
  const original = navigator.platform;

  afterEach(() => {
    mockPlatform(original);
  });

  it('returns true when platform contains "Mac"', () => {
    mockPlatform("MacIntel");
    expect(isMacPlatform()).toBe(true);
  });

  it("returns true for iPhone platform", () => {
    mockPlatform("iPhone");
    expect(isMacPlatform()).toBe(true);
  });

  it("returns true for iPad platform", () => {
    mockPlatform("iPad");
    expect(isMacPlatform()).toBe(true);
  });

  it("returns false for Win32", () => {
    mockPlatform("Win32");
    expect(isMacPlatform()).toBe(false);
  });

  it("returns false for Linux x86_64", () => {
    mockPlatform("Linux x86_64");
    expect(isMacPlatform()).toBe(false);
  });
});

describe("translateModifierKeysForUsersPlatform", () => {
  const original = navigator.platform;

  afterEach(() => {
    mockPlatform(original);
  });

  it("translates CMD to CTRL on Windows", () => {
    mockPlatform("Win32");
    expect(translateModifierKeysForUsersPlatform("CMD+K")).toBe("CTRL+K");
  });

  it("translates CTRL to CTRL on Windows (no change)", () => {
    mockPlatform("Win32");
    expect(translateModifierKeysForUsersPlatform("CTRL+K")).toBe("CTRL+K");
  });

  it("translates CMD to CMD on Mac (no change)", () => {
    mockPlatform("MacIntel");
    expect(translateModifierKeysForUsersPlatform("CMD+K")).toBe("CMD+K");
  });

  it("translates CTRL to CMD on Mac", () => {
    mockPlatform("MacIntel");
    expect(translateModifierKeysForUsersPlatform("CTRL+K")).toBe("CMD+K");
  });

  it("handles case-insensitive input", () => {
    mockPlatform("Win32");
    expect(translateModifierKeysForUsersPlatform("cmd+k")).toBe("CTRL+k");
    expect(translateModifierKeysForUsersPlatform("Ctrl+K")).toBe("CTRL+K");
  });

  it("leaves keys without modifiers unchanged", () => {
    mockPlatform("Win32");
    expect(translateModifierKeysForUsersPlatform("/")).toBe("/");
    expect(translateModifierKeysForUsersPlatform("Escape")).toBe("Escape");
  });
});

describe("useKeyboardShortcut", () => {
  const original = navigator.platform;

  beforeEach(() => {
    // Use non-Mac platform for consistent modifier key behavior
    mockPlatform("Win32");
  });

  afterEach(() => {
    mockPlatform(original);
  });

  it("calls callback when matching key is pressed", () => {
    const callback = vi.fn();
    renderHook(() => useKeyboardShortcut("/", callback));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "/",
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          altKey: false,
        }),
      );
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not call callback for non-matching key", () => {
    const callback = vi.fn();
    renderHook(() => useKeyboardShortcut("/", callback));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "a",
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          altKey: false,
        }),
      );
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("matches CTRL+K shortcut on non-Mac platform", () => {
    const callback = vi.fn();
    renderHook(() => useKeyboardShortcut("CMD+K", callback));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          ctrlKey: true,
          metaKey: false,
          shiftKey: false,
          altKey: false,
        }),
      );
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not call callback when enabled is false", () => {
    const callback = vi.fn();
    renderHook(() => useKeyboardShortcut("/", callback, { enabled: false }));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "/",
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          altKey: false,
        }),
      );
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("cleans up listener on unmount", () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcut("Escape", callback),
    );

    unmount();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          altKey: false,
        }),
      );
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("calls preventDefault when option is true (default)", () => {
    const callback = vi.fn();
    renderHook(() => useKeyboardShortcut("/", callback));

    const event = new KeyboardEvent("keydown", {
      key: "/",
      cancelable: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    });
    const preventSpy = vi.spyOn(event, "preventDefault");

    act(() => {
      document.dispatchEvent(event);
    });

    expect(preventSpy).toHaveBeenCalled();
  });

  it("does not call preventDefault when option is false", () => {
    const callback = vi.fn();
    renderHook(() =>
      useKeyboardShortcut("/", callback, { preventDefault: false }),
    );

    const event = new KeyboardEvent("keydown", {
      key: "/",
      cancelable: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    });
    const preventSpy = vi.spyOn(event, "preventDefault");

    act(() => {
      document.dispatchEvent(event);
    });

    expect(preventSpy).not.toHaveBeenCalled();
  });
});
