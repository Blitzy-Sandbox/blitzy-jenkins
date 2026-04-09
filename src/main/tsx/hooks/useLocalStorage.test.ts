/**
 * Unit tests for hooks/useLocalStorage.ts.
 *
 * Tests the scoped localStorage hook which replicates the legacy
 * jenkinsLocalStorage.js and localStorage.js patterns. Uses renderHook
 * from React Testing Library.
 *
 * Note: jsdom provides a functional window.localStorage mock.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "./useLocalStorage";

describe("useLocalStorage", () => {
  beforeEach(() => {
    // Clear all localStorage between tests to avoid leaking state
    window.localStorage.clear();
  });

  describe("global items", () => {
    it("sets and retrieves a globally-scoped item with jenkins: prefix", () => {
      const { result } = renderHook(() => useLocalStorage());
      act(() => {
        result.current.setGlobalItem("sidebar", "collapsed");
      });
      expect(result.current.getGlobalItem("sidebar")).toBe("collapsed");
      // Verify the underlying key has the "jenkins:" prefix
      expect(window.localStorage.getItem("jenkins:sidebar")).toBe("collapsed");
    });

    it("returns defaultVal when no value is stored", () => {
      const { result } = renderHook(() => useLocalStorage());
      expect(result.current.getGlobalItem("missing", "fallback")).toBe(
        "fallback",
      );
    });

    it("returns defaultVal when stored value is empty string (falsy check)", () => {
      const { result } = renderHook(() => useLocalStorage());
      act(() => {
        result.current.setGlobalItem("empty", "");
      });
      // Empty string is falsy, so defaultVal is returned
      expect(result.current.getGlobalItem("empty", "default")).toBe("default");
    });

    it("returns undefined when no value and no default", () => {
      const { result } = renderHook(() => useLocalStorage());
      expect(result.current.getGlobalItem("nope")).toBeUndefined();
    });

    it("removes a globally-scoped item", () => {
      const { result } = renderHook(() => useLocalStorage());
      act(() => {
        result.current.setGlobalItem("temp", "value");
      });
      expect(result.current.getGlobalItem("temp")).toBe("value");
      act(() => {
        result.current.removeGlobalItem("temp");
      });
      expect(result.current.getGlobalItem("temp")).toBeUndefined();
    });
  });

  describe("page-scoped items", () => {
    it("sets and retrieves a page-scoped item", () => {
      const { result } = renderHook(() => useLocalStorage());
      act(() => {
        result.current.setPageItem("scroll", "120");
      });
      expect(result.current.getPageItem("scroll")).toBe("120");
    });

    it("scopes items by current window.location.href", () => {
      const { result } = renderHook(() => useLocalStorage());
      act(() => {
        result.current.setPageItem("pos", "42");
      });
      // The key should include window.location.href
      const expectedKey = `jenkins:pos:${window.location.href}`;
      expect(window.localStorage.getItem(expectedKey)).toBe("42");
    });

    it("returns defaultVal for missing page-scoped items", () => {
      const { result } = renderHook(() => useLocalStorage());
      expect(result.current.getPageItem("none", "default")).toBe("default");
    });

    it("removes a page-scoped item", () => {
      const { result } = renderHook(() => useLocalStorage());
      act(() => {
        result.current.setPageItem("data", "value");
      });
      expect(result.current.getPageItem("data")).toBe("value");
      act(() => {
        result.current.removePageItem("data");
      });
      expect(result.current.getPageItem("data")).toBeUndefined();
    });
  });

  describe("return value stability", () => {
    it("returns the same function references across re-renders", () => {
      const { result, rerender } = renderHook(() => useLocalStorage());
      const first = result.current;
      rerender();
      const second = result.current;
      expect(first.setGlobalItem).toBe(second.setGlobalItem);
      expect(first.getGlobalItem).toBe(second.getGlobalItem);
      expect(first.setPageItem).toBe(second.setPageItem);
      expect(first.getPageItem).toBe(second.getPageItem);
      expect(first.removeGlobalItem).toBe(second.removeGlobalItem);
      expect(first.removePageItem).toBe(second.removePageItem);
    });
  });
});
