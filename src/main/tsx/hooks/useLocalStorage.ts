import { useCallback, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Internal: In-memory mock storage for environments where localStorage is
// unavailable (e.g. private browsing mode, SSR, or restrictive CSP).
// Mirrors the fallback pattern in src/main/js/util/localStorage.js lines 5-17.
// ---------------------------------------------------------------------------

/**
 * Creates an in-memory `Storage`-compatible mock used when the browser's
 * `window.localStorage` is inaccessible. The mock stores values in a plain
 * object so callers experience identical behaviour to the real storage API.
 */
function createMockStorage(): Storage {
  const store: Record<string, string> = {};

  return {
    get length(): number {
      return Object.keys(store).length;
    },
    clear(): void {
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    },
    getItem(name: string): string | null {
      return name in store ? store[name] : null;
    },
    key(index: number): string | null {
      const keys = Object.keys(store);
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
    removeItem(name: string): void {
      delete store[name];
    },
    setItem(name: string, value: string): void {
      store[name] = value;
    },
  };
}

/**
 * Safely obtains a reference to the browser's `localStorage`, falling back to
 * an in-memory mock when `localStorage` is unavailable or throws (e.g. Safari
 * private mode, disabled cookies, restrictive CSP).
 *
 * Mirrors `src/main/js/util/localStorage.js` lines 3, 36-40 where the source
 * checks `typeof storage === "undefined"` and falls back to a mock object.
 * Additionally performs a write/remove probe to detect environments where the
 * API is technically present but throws on access (Safari private browsing in
 * older versions, Chrome incognito with disabled storage quota, etc.).
 */
function getStorage(): Storage {
  try {
    const storage = window.localStorage;
    // Probe: some environments expose localStorage but throw on setItem.
    storage.setItem('__jenkins_storage_test__', '__test__');
    storage.removeItem('__jenkins_storage_test__');
    return storage;
  } catch {
    // eslint-disable-next-line no-console
    console.warn('HTML5 localStorage not supported by this browser.');
    return createMockStorage();
  }
}

// ---------------------------------------------------------------------------
// Module-level storage instance — cached once at module load time, matching
// the source pattern in src/main/js/util/localStorage.js line 3:
//   `let storage = getWindow().localStorage;`
// ---------------------------------------------------------------------------
const storage: Storage = getStorage();

// ---------------------------------------------------------------------------
// Scoping constants — the "jenkins:" prefix is the namespace used by all
// localStorage keys in Jenkins core. Changing this prefix would break
// compatibility with values written by the legacy JS modules.
// ---------------------------------------------------------------------------
const GLOBAL_PREFIX = 'jenkins:';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return type for the {@link useLocalStorage} hook.
 *
 * Provides scoped localStorage access that mirrors the API surface of the
 * legacy `jenkinsLocalStorage` module, plus `removeGlobalItem` and
 * `removePageItem` for cleanup operations.
 */
export interface UseLocalStorageReturn {
  /** Store a Jenkins globally-scoped value. Key format: `"jenkins:{name}"` */
  setGlobalItem: (name: string, value: string) => void;

  /**
   * Retrieve a Jenkins globally-scoped value with an optional default.
   *
   * The default value is returned when the stored value is **falsy** (i.e.
   * `null`, `undefined`, or empty string `""`). This matches the behaviour of
   * `src/main/js/util/localStorage.js` line 26: `if (!value) { value = defaultVal; }`.
   */
  getGlobalItem: (name: string, defaultVal?: string) => string | undefined;

  /** Store a Jenkins page-scoped value. Key format: `"jenkins:{name}:{window.location.href}"` */
  setPageItem: (name: string, value: string) => void;

  /**
   * Retrieve a Jenkins page-scoped value with an optional default.
   * Same falsy-check default semantics as {@link getGlobalItem}.
   */
  getPageItem: (name: string, defaultVal?: string) => string | undefined;

  /** Remove a globally-scoped item from localStorage. */
  removeGlobalItem: (name: string) => void;

  /** Remove a page-scoped item from localStorage. */
  removePageItem: (name: string) => void;
}

/**
 * Scoped localStorage hook — a React 19 replacement for the legacy
 * `src/main/js/util/jenkinsLocalStorage.js` and `src/main/js/util/localStorage.js`.
 *
 * All keys are namespaced under the `"jenkins:"` prefix to avoid collisions
 * with other applications sharing the same origin. Page-scoped keys
 * additionally include the current `window.location.href` to isolate values
 * per page URL.
 *
 * ### Key format examples
 * - **Global**: `"jenkins:sidebar-collapsed"` for `setGlobalItem("sidebar-collapsed", "true")`
 * - **Page**: `"jenkins:scroll-pos:https://ci.example.com/job/build/"` for
 *   `setPageItem("scroll-pos", "120")`
 *
 * All returned functions are stable references (wrapped in `useCallback` with
 * empty dependency arrays) so they are safe to use inside `useEffect` deps
 * and other memoised computations without causing unnecessary re-renders.
 *
 * @returns A {@link UseLocalStorageReturn} object with six storage operations.
 */
export function useLocalStorage(): UseLocalStorageReturn {
  // -- Global-scoped operations ------------------------------------------------

  /**
   * Store a value under a globally-scoped key.
   * Mirrors `jenkinsLocalStorage.js` line 8:
   *   `storage.setItem("jenkins:" + name, value);`
   */
  const setGlobalItem = useCallback((name: string, value: string): void => {
    storage.setItem(GLOBAL_PREFIX + name, value);
  }, []);

  /**
   * Retrieve a globally-scoped value, returning `defaultVal` when the stored
   * value is falsy.
   * Mirrors `jenkinsLocalStorage.js` line 15 → `localStorage.js` line 24-29.
   */
  const getGlobalItem = useCallback(
    (name: string, defaultVal?: string): string | undefined => {
      const value = storage.getItem(GLOBAL_PREFIX + name);
      // CRITICAL: Source uses falsy check (`!value`), NOT a null check.
      // Empty string "" also falls through to the default — this is intentional
      // and matches localStorage.js line 26: `if (!value) { value = defaultVal; }`.
      if (!value) {
        return defaultVal;
      }
      return value;
    },
    [],
  );

  // -- Page-scoped operations --------------------------------------------------

  /**
   * Build a page-scoped key by appending the current `window.location.href`.
   * Mirrors `jenkinsLocalStorage.js` line 22:
   *   `name = "jenkins:" + name + ":" + getWindow().location.href;`
   */
  const buildPageKey = (name: string): string =>
    GLOBAL_PREFIX + name + ':' + window.location.href;

  /**
   * Store a value under a page-scoped key.
   * Mirrors `jenkinsLocalStorage.js` lines 22-23.
   */
  const setPageItem = useCallback((name: string, value: string): void => {
    storage.setItem(buildPageKey(name), value);
  }, []);

  /**
   * Retrieve a page-scoped value, returning `defaultVal` when the stored
   * value is falsy.
   * Mirrors `jenkinsLocalStorage.js` lines 30-31 → `localStorage.js` line 24-29.
   */
  const getPageItem = useCallback(
    (name: string, defaultVal?: string): string | undefined => {
      const value = storage.getItem(buildPageKey(name));
      // Same falsy-check semantics as getGlobalItem.
      if (!value) {
        return defaultVal;
      }
      return value;
    },
    [],
  );

  // -- Remove operations (new in the React hook API) ---------------------------

  /**
   * Remove a globally-scoped item from localStorage.
   * Mirrors `localStorage.js` line 32-34 with the "jenkins:" prefix.
   */
  const removeGlobalItem = useCallback((name: string): void => {
    storage.removeItem(GLOBAL_PREFIX + name);
  }, []);

  /**
   * Remove a page-scoped item from localStorage.
   * Mirrors `localStorage.js` line 32-34 with the page-scoped key format.
   */
  const removePageItem = useCallback((name: string): void => {
    storage.removeItem(buildPageKey(name));
  }, []);

  // -- Stable return object via useMemo ----------------------------------------

  return useMemo(
    () => ({
      setGlobalItem,
      getGlobalItem,
      setPageItem,
      getPageItem,
      removeGlobalItem,
      removePageItem,
    }),
    [
      setGlobalItem,
      getGlobalItem,
      setPageItem,
      getPageItem,
      removeGlobalItem,
      removePageItem,
    ],
  );
}
