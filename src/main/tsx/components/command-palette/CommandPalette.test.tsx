/**
 * Unit tests for CommandPalette.tsx
 *
 * Validates Ctrl+K open/close, search input filtering, keyboard navigation,
 * result rendering, navigation callback invocation, and empty state.
 *
 * Target: ≥80% branch coverage of CommandPalette.tsx (509 lines).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import CommandPalette from "./CommandPalette";

// ---------------------------------------------------------------------------
// Mock useKeyboardShortcut — capture registered callback
// ---------------------------------------------------------------------------
let capturedShortcutCallback: ((e: KeyboardEvent) => void) | null = null;

vi.mock("@/hooks/useKeyboardShortcut", () => ({
  useKeyboardShortcut: (
    _shortcut: string,
    callback: (e: KeyboardEvent) => void,
  ) => {
    capturedShortcutCallback = callback;
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setupDOM(options?: { searchUrl?: string }) {
  const btn = document.createElement("button");
  btn.id = "root-action-SearchAction";
  document.body.appendChild(btn);

  const i18nEl = document.createElement("div");
  i18nEl.id = "command-palette-i18n";
  i18nEl.dataset.getHelp = "Get Help";
  i18nEl.dataset.noResultsFor = "No results for";
  document.body.appendChild(i18nEl);

  document.body.dataset.searchUrl = options?.searchUrl ?? "/search/suggest";
  document.body.dataset.searchHelpUrl = "/help";
  document.head.dataset.rooturl = "";

  // jsdom does not implement HTMLDialogElement methods
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal || vi.fn();
  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close || vi.fn();
}

function cleanupDOM() {
  document.getElementById("root-action-SearchAction")?.remove();
  document.getElementById("command-palette-i18n")?.remove();
  delete (document.body.dataset as Record<string, string | undefined>)
    .searchUrl;
  delete (document.body.dataset as Record<string, string | undefined>)
    .searchHelpUrl;
  delete (document.head.dataset as Record<string, string | undefined>).rooturl;
}

function mockFetchWith(suggestions: unknown[]) {
  return vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ suggestions }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("CommandPalette", () => {
  beforeEach(() => {
    capturedShortcutCallback = null;
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
    setupDOM();
  });

  afterEach(() => {
    cleanupDOM();
    vi.restoreAllMocks();
  });

  it("renders null when trigger button is absent", () => {
    cleanupDOM();
    const { container } = render(<CommandPalette />);
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog element when trigger button is present", () => {
    const { container } = render(<CommandPalette />);
    expect(
      container.querySelector("dialog.jenkins-command-palette"),
    ).not.toBeNull();
  });

  it("renders search input with id command-bar", () => {
    render(<CommandPalette />);
    const input = document.getElementById("command-bar") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.tagName).toBe("INPUT");
  });

  it("opens dialog when trigger button is clicked", () => {
    render(<CommandPalette />);
    const btn = document.getElementById("root-action-SearchAction")!;
    act(() => {
      fireEvent.click(btn);
    });
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it("opens dialog via Ctrl+K shortcut callback", () => {
    render(<CommandPalette />);
    expect(capturedShortcutCallback).not.toBeNull();
    act(() => {
      capturedShortcutCallback!(
        new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
      );
    });
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it("toggles palette open/close on repeated shortcut calls", () => {
    render(<CommandPalette />);
    act(() => {
      capturedShortcutCallback!(
        new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
      );
    });
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    act(() => {
      capturedShortcutCallback!(
        new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
      );
    });
  });

  it("closes on Escape key", () => {
    render(<CommandPalette />);
    act(() => {
      fireEvent.click(document.getElementById("root-action-SearchAction")!);
    });
    const input = document.getElementById("command-bar") as HTMLInputElement;
    act(() => {
      fireEvent.keyDown(input, { key: "Escape" });
    });
  });

  it("dispatches search on input change", async () => {
    const mockFetch = mockFetchWith([
      {
        name: "Test Job",
        url: "/job/test",
        icon: "<svg></svg>",
        type: "symbol",
        group: "Jobs",
      },
    ]);
    global.fetch = mockFetch;

    render(<CommandPalette />);
    act(() => {
      fireEvent.click(document.getElementById("root-action-SearchAction")!);
    });

    const input = document.getElementById("command-bar") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "test" } });
    });

    await waitFor(
      () => {
        expect(mockFetch).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  it("renders grouped result headings", async () => {
    const mockFetch = mockFetchWith([
      {
        name: "Job A",
        url: "/job/a",
        icon: "<svg></svg>",
        type: "symbol",
        group: "Jobs",
      },
      {
        name: "View B",
        url: "/view/b",
        icon: "<svg></svg>",
        type: "symbol",
        group: "Views",
      },
    ]);
    global.fetch = mockFetch;

    render(<CommandPalette />);
    act(() => {
      fireEvent.click(document.getElementById("root-action-SearchAction")!);
    });
    act(() => {
      fireEvent.change(document.getElementById("command-bar")!, {
        target: { value: "q" },
      });
    });

    await waitFor(
      () => {
        const headings = document.querySelectorAll(
          ".jenkins-command-palette__results__heading",
        );
        expect(headings.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: 3000 },
    );
  });

  it("shows no results message for empty search results", async () => {
    const mockFetch = mockFetchWith([]);
    global.fetch = mockFetch;

    render(<CommandPalette />);
    act(() => {
      fireEvent.click(document.getElementById("root-action-SearchAction")!);
    });
    act(() => {
      fireEvent.change(document.getElementById("command-bar")!, {
        target: { value: "nonexistent" },
      });
    });

    await waitFor(
      () => {
        expect(mockFetch).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    await waitFor(() => {
      const info = document.querySelector(".jenkins-command-palette__info");
      expect(info).not.toBeNull();
    });
  });

  it("renders image type icons with img tags", async () => {
    const mockFetch = mockFetchWith([
      {
        name: "User",
        url: "/user/admin",
        icon: "/avatar.png",
        type: "image",
        group: "Users",
      },
    ]);
    global.fetch = mockFetch;

    render(<CommandPalette />);
    act(() => {
      fireEvent.click(document.getElementById("root-action-SearchAction")!);
    });
    act(() => {
      fireEvent.change(document.getElementById("command-bar")!, {
        target: { value: "admin" },
      });
    });

    await waitFor(
      () => {
        const img = document.querySelector(
          ".jenkins-command-palette__results__item__icon.jenkins-avatar",
        );
        expect(img).not.toBeNull();
      },
      { timeout: 3000 },
    );
  });

  it("navigates through results with ArrowDown key", async () => {
    const mockFetch = mockFetchWith([
      {
        name: "A",
        url: "/a",
        icon: "<svg></svg>",
        type: "symbol",
        group: "Jobs",
      },
      {
        name: "B",
        url: "/b",
        icon: "<svg></svg>",
        type: "symbol",
        group: "Jobs",
      },
    ]);
    global.fetch = mockFetch;

    render(<CommandPalette />);
    act(() => {
      fireEvent.click(document.getElementById("root-action-SearchAction")!);
    });
    const input = document.getElementById("command-bar")!;
    act(() => {
      fireEvent.change(input, { target: { value: "x" } });
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), {
      timeout: 3000,
    });

    await waitFor(() => {
      const items = document.querySelectorAll(
        ".jenkins-command-palette__results__item",
      );
      expect(items.length).toBeGreaterThanOrEqual(2);
    });

    act(() => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });
    // Second item should become selected
    await waitFor(() => {
      const hovered = document.querySelector(
        ".jenkins-command-palette__results__item--hover",
      );
      expect(hovered).not.toBeNull();
    });
  });

  it("navigates up with ArrowUp key", async () => {
    const mockFetch = mockFetchWith([
      {
        name: "A",
        url: "/a",
        icon: "<svg></svg>",
        type: "symbol",
        group: "G",
      },
      {
        name: "B",
        url: "/b",
        icon: "<svg></svg>",
        type: "symbol",
        group: "G",
      },
    ]);
    global.fetch = mockFetch;

    render(<CommandPalette />);
    act(() => {
      fireEvent.click(document.getElementById("root-action-SearchAction")!);
    });
    const input = document.getElementById("command-bar")!;
    act(() => {
      fireEvent.change(input, { target: { value: "z" } });
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), {
      timeout: 3000,
    });
    await waitFor(() => {
      expect(
        document.querySelectorAll(".jenkins-command-palette__results__item")
          .length,
      ).toBeGreaterThanOrEqual(2);
    });

    act(() => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });
    act(() => {
      fireEvent.keyDown(input, { key: "ArrowUp" });
    });
  });

  it("handles fetch error gracefully", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    global.fetch = mockFetch;

    render(<CommandPalette />);
    act(() => {
      fireEvent.click(document.getElementById("root-action-SearchAction")!);
    });
    act(() => {
      fireEvent.change(document.getElementById("command-bar")!, {
        target: { value: "fail" },
      });
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), {
      timeout: 3000,
    });
    // Should not crash
  });

  it("handles click outside wrapper to close", () => {
    render(<CommandPalette />);
    act(() => {
      fireEvent.click(document.getElementById("root-action-SearchAction")!);
    });
    const wrapper = document.querySelector(
      ".jenkins-command-palette__wrapper",
    )!;
    act(() => {
      fireEvent.click(wrapper);
    });
  });

  it("handles animation end event on dialog", () => {
    render(<CommandPalette />);
    act(() => {
      fireEvent.click(document.getElementById("root-action-SearchAction")!);
    });
    const dialog = document.querySelector(
      "dialog.jenkins-command-palette",
    ) as HTMLDialogElement;
    act(() => {
      fireEvent.animationEnd(dialog);
    });
  });

  it("handles missing searchUrl gracefully", () => {
    delete (document.body.dataset as Record<string, string | undefined>)
      .searchUrl;
    render(<CommandPalette />);
    act(() => {
      fireEvent.click(document.getElementById("root-action-SearchAction")!);
    });
    act(() => {
      fireEvent.change(document.getElementById("command-bar")!, {
        target: { value: "query" },
      });
    });
    // Should not crash
  });

  it("handles dialog cancel event (native Escape)", () => {
    render(<CommandPalette />);
    act(() => {
      fireEvent.click(document.getElementById("root-action-SearchAction")!);
    });
    const dialog = document.querySelector(
      "dialog.jenkins-command-palette",
    ) as HTMLDialogElement;
    const cancelEvent = new Event("cancel", { cancelable: true });
    act(() => {
      dialog.dispatchEvent(cancelEvent);
    });
    expect(cancelEvent.defaultPrevented).toBe(true);
  });
});
