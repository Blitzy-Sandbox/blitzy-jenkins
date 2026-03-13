/**
 * useKeyboardShortcut — Keyboard Shortcut Registration Hook
 *
 * Replaces the `hotkeys-js` direct usage from `src/main/js/keyboard-shortcuts.js`
 * with a React hook that provides:
 *   - Platform-aware modifier key translation (CMD on Mac/iOS, CTRL on Windows/Linux)
 *   - Registration/cleanup of document-level keydown event listeners
 *   - Proper cleanup on unmount (improvement over source which never removed listeners)
 *   - Support for arbitrary key combinations using "CMD+K", "/", "Escape" notation
 *
 * @module useKeyboardShortcut
 */
import { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Internal representation of a parsed keyboard shortcut,
 * mapping a human-readable shortcut string to KeyboardEvent properties.
 */
interface ParsedShortcut {
  /** The primary key to match (upper-cased), e.g. "K", "/", "ESCAPE" */
  key: string;
  /** Whether the Ctrl modifier is required */
  ctrlKey: boolean;
  /** Whether the Meta (Cmd) modifier is required */
  metaKey: boolean;
  /** Whether the Shift modifier is required */
  shiftKey: boolean;
  /** Whether the Alt modifier is required */
  altKey: boolean;
}

/**
 * Options for the {@link useKeyboardShortcut} hook.
 */
interface UseKeyboardShortcutOptions {
  /**
   * Whether the shortcut listener is active.
   * @default true
   */
  enabled?: boolean;
  /**
   * Whether to call `event.preventDefault()` and `event.stopPropagation()`
   * when the shortcut matches. Mirrors the source `return false` pattern.
   * @default true
   */
  preventDefault?: boolean;
}

// ---------------------------------------------------------------------------
// Platform Detection
// ---------------------------------------------------------------------------

/**
 * Detect whether the current platform is macOS or iOS.
 *
 * Uses `navigator.platform` (deprecated but widely supported and used
 * by the original source) to check for "MAC", "IPHONE", or "IPAD".
 *
 * Exported so components can display the appropriate modifier key label
 * (e.g. "⌘" vs "Ctrl") in UI hints.
 *
 * @returns `true` on macOS / iOS, `false` otherwise
 */
export function isMacPlatform(): boolean {
  const platform = navigator.platform.toUpperCase();
  return (
    platform.indexOf("MAC") >= 0 || platform === "IPHONE" || platform === "IPAD"
  );
}

// ---------------------------------------------------------------------------
// Modifier Key Translation
// ---------------------------------------------------------------------------

/**
 * Given a keyboard shortcut string, replace any `CMD` / `CTRL` tokens
 * (case-insensitive) with the platform-appropriate modifier.
 *
 * - macOS / iOS → `CMD`
 * - Windows / Linux → `CTRL`
 *
 * This is an **exact** port of the source function at
 * `src/main/js/keyboard-shortcuts.js` lines 34–39.
 *
 * @param keyboardShortcut - The shortcut to translate, e.g. `"CMD+K"`
 * @returns The platform-translated shortcut, e.g. `"CTRL+K"` on Windows
 *
 * @example
 * ```ts
 * // On macOS:
 * translateModifierKeysForUsersPlatform("CMD+K");   // "CMD+K"
 * translateModifierKeysForUsersPlatform("CTRL+K");  // "CMD+K"
 *
 * // On Windows/Linux:
 * translateModifierKeysForUsersPlatform("CMD+K");   // "CTRL+K"
 * translateModifierKeysForUsersPlatform("CTRL+K");  // "CTRL+K"
 * ```
 */
export function translateModifierKeysForUsersPlatform(
  keyboardShortcut: string,
): string {
  const useCmdKey = isMacPlatform();
  return keyboardShortcut.replace(/CMD|CTRL/gi, useCmdKey ? "CMD" : "CTRL");
}

// ---------------------------------------------------------------------------
// Shortcut Parser (internal)
// ---------------------------------------------------------------------------

/**
 * Parse a human-readable shortcut string (e.g. `"CMD+K"`, `"/"`, `"Escape"`)
 * into a {@link ParsedShortcut} object suitable for matching against a
 * `KeyboardEvent`.
 *
 * The shortcut is first run through {@link translateModifierKeysForUsersPlatform}
 * so that `CMD` / `CTRL` are resolved to the correct platform modifier before
 * parsing.
 *
 * Recognized modifier tokens (case-insensitive after upper-casing):
 * - `CMD`   → `metaKey`
 * - `CTRL`  → `ctrlKey`
 * - `SHIFT` → `shiftKey`
 * - `ALT`   → `altKey`
 *
 * Everything else is treated as the primary key.
 */
function parseShortcut(shortcut: string): ParsedShortcut {
  const translated = translateModifierKeysForUsersPlatform(shortcut);
  const parts = translated.split("+").map((part) => part.trim().toUpperCase());

  const result: ParsedShortcut = {
    key: "",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
  };

  for (const part of parts) {
    switch (part) {
      case "CMD":
        result.metaKey = true;
        break;
      case "CTRL":
        result.ctrlKey = true;
        break;
      case "SHIFT":
        result.shiftKey = true;
        break;
      case "ALT":
        result.altKey = true;
        break;
      default:
        result.key = part;
        break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook for registering a document-level keyboard shortcut.
 *
 * Replaces `hotkeys-js` with native `addEventListener('keydown', …)` and
 * provides proper cleanup on unmount — an improvement over the original source
 * which never removed its listeners.
 *
 * @param shortcut  - Key combination string using the same notation as the
 *                    source: `"CMD+K"`, `"/"`, `"Escape"`, `"SHIFT+ALT+P"`, etc.
 * @param callback  - Handler invoked when the shortcut matches.
 * @param options   - Optional configuration.
 * @param options.enabled - Whether the shortcut is active (default `true`).
 * @param options.preventDefault - Whether to prevent the browser default and
 *                    stop propagation (default `true`, matching the source
 *                    `return false` pattern).
 *
 * @example
 * ```tsx
 * function CommandPalette() {
 *   const [open, setOpen] = useState(false);
 *   useKeyboardShortcut('CMD+K', () => setOpen(true));
 *   // …
 * }
 * ```
 */
export function useKeyboardShortcut(
  shortcut: string,
  callback: (event: KeyboardEvent) => void,
  options?: UseKeyboardShortcutOptions,
): void {
  const { enabled = true, preventDefault = true } = options ?? {};

  // Store the latest callback in a ref so that the event handler always calls
  // the most recent version without re-registering the listener on every render.
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const parsed = parseShortcut(shortcut);

    const handler = (event: KeyboardEvent): void => {
      // Primary match: compare event.key (case-insensitive).
      // Fallback for letter keys: compare event.code (e.g. "KeyK") to handle
      // edge cases where event.key may differ due to keyboard layout.
      const eventKeyUpper = event.key.toUpperCase();
      const keyMatch =
        eventKeyUpper === parsed.key ||
        (parsed.key.length === 1 &&
          /^[A-Z]$/.test(parsed.key) &&
          event.code.toUpperCase() === `KEY${parsed.key}`);

      if (
        keyMatch &&
        event.ctrlKey === parsed.ctrlKey &&
        event.metaKey === parsed.metaKey &&
        event.shiftKey === parsed.shiftKey &&
        event.altKey === parsed.altKey
      ) {
        if (preventDefault) {
          event.preventDefault();
          event.stopPropagation();
        }
        callbackRef.current(event);
      }
    };

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [shortcut, enabled, preventDefault]);
}
