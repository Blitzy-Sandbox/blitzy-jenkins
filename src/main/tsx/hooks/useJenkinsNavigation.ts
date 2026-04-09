/**
 * Jenkins URL Navigation Hook
 *
 * Provides React components with URL navigation functionality for the Jenkins
 * application. This hook is a React 19 replacement for the imperative
 * `jenkins.goTo()` pattern in `src/main/js/util/jenkins.js` (lines 19-21)
 * and re-exports the `combinePath` utility from `src/main/js/util/path.js`
 * (lines 1-19) for path segment composition.
 *
 * ## Original patterns replaced
 *
 * **`jenkins.goTo(url)`** (jenkins.js:19-21):
 * ```js
 * jenkins.goTo = function (url) {
 *   wh.getWindow().location.replace(jenkins.baseUrl() + url);
 * };
 * ```
 * The original reads the base URL from `document.head.dataset.rooturl` via
 * `jenkins.baseUrl()` and performs `location.replace()` (replaces the current
 * history entry). This hook mirrors that exact behavior via the `navigate()`
 * method, obtaining the base URL from `useJenkinsConfig()` context instead of
 * a direct DOM read.
 *
 * **`combinePath(pathOne, pathTwo)`** (path.js:1-19):
 * Joins two URL segments while preserving query parameters from `pathOne` and
 * stripping hash fragments. Re-exported from this hook for consumer convenience.
 *
 * ## Key design decisions
 *
 * - `navigate()` uses `window.location.replace()` — NOT `assign()`. This
 *   preserves the original `jenkins.goTo()` semantics where the current history
 *   entry is replaced rather than pushed.
 * - `navigatePush()` is a new addition using `window.location.assign()` for
 *   cases where the caller explicitly wants to push a history entry.
 * - `buildUrl()` constructs a full URL without performing navigation, useful for
 *   `<a href>` attributes or passing URLs to child components.
 * - All returned functions are wrapped in `useCallback` with `[baseUrl]`
 *   dependency to maintain referential stability across renders.
 * - The return object is wrapped in `useMemo` for the same stability guarantee.
 * - No `window-handle` library — direct `window.location` access.
 * - No jQuery — native browser navigation APIs only.
 *
 * @module hooks/useJenkinsNavigation
 */

import { useCallback, useMemo } from "react";
import { useJenkinsConfig } from "@/providers/JenkinsConfigProvider";
import { combinePath as combinePathUtil } from "@/utils/path";

// ---------------------------------------------------------------------------
// Return Type Interface
// ---------------------------------------------------------------------------

/**
 * Shape of the object returned by `useJenkinsNavigation()`.
 *
 * All navigation functions prepend the Jenkins base URL (context path) to the
 * provided relative URL, ensuring correct routing regardless of whether Jenkins
 * is deployed at `/`, `/jenkins`, or any other context path.
 */
export interface UseJenkinsNavigationReturn {
  /**
   * Navigate to a Jenkins URL, **replacing** the current history entry.
   *
   * Mirrors `jenkins.goTo(url)` from `src/main/js/util/jenkins.js` line 20:
   * `wh.getWindow().location.replace(jenkins.baseUrl() + url)`
   *
   * @param url - Relative URL path (e.g., "/job/my-project/configure").
   *              The Jenkins base URL is prepended automatically.
   *
   * @example
   * ```tsx
   * const { navigate } = useJenkinsNavigation();
   * navigate("/job/my-project"); // → location.replace("/jenkins/job/my-project")
   * ```
   */
  navigate: (url: string) => void;

  /**
   * Navigate to a Jenkins URL, **pushing** a new history entry.
   *
   * Unlike `navigate()`, this preserves the current page in the browser's
   * back/forward history. Useful for user-initiated navigation where the
   * back button should return to the previous page.
   *
   * @param url - Relative URL path. The Jenkins base URL is prepended.
   *
   * @example
   * ```tsx
   * const { navigatePush } = useJenkinsNavigation();
   * navigatePush("/manage"); // → location.assign("/jenkins/manage")
   * ```
   */
  navigatePush: (url: string) => void;

  /**
   * Build a full Jenkins URL from a relative path without navigating.
   *
   * Useful for constructing `<a href>` values, passing URLs to child components,
   * or building API endpoint URLs.
   *
   * @param relativePath - Relative URL path. The Jenkins base URL is prepended.
   * @returns The fully-qualified URL string.
   *
   * @example
   * ```tsx
   * const { buildUrl } = useJenkinsNavigation();
   * return <a href={buildUrl("/job/my-project")}>My Project</a>;
   * ```
   */
  buildUrl: (relativePath: string) => string;

  /**
   * Combine two URL path segments, preserving query parameters from the first
   * path and stripping hash fragments.
   *
   * Re-exported from `@/utils/path` for consumer convenience so callers do not
   * need a separate import for path combination.
   *
   * Mirrors `combinePath()` from `src/main/js/util/path.js` (lines 1-19).
   *
   * @param pathOne - Base path (may contain query params and/or hash fragments)
   * @param pathTwo - Path segment to append
   * @returns Combined path with query parameters preserved
   *
   * @example
   * ```tsx
   * const { combinePath } = useJenkinsNavigation();
   * combinePath("/jenkins/job?page=1", "configure");
   * // => "/jenkins/job/configure?page=1"
   * ```
   */
  combinePath: (pathOne: string, pathTwo: string) => string;

  /**
   * The current Jenkins base URL (context path), as read from
   * `document.head.dataset.rooturl` via `JenkinsConfigProvider`.
   *
   * Typically an empty string `""` when Jenkins is deployed at the root,
   * or a context path like `"/jenkins"` for non-root deployments.
   */
  baseUrl: string;
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * React hook providing URL navigation functionality scoped to the Jenkins
 * application's base URL.
 *
 * Consumes the base URL from `JenkinsConfigProvider` context and exposes
 * navigation helpers that mirror the original `jenkins.goTo()` pattern while
 * adding `navigatePush()` and `buildUrl()` for additional use cases.
 *
 * Must be called within a component wrapped by `JenkinsConfigProvider`.
 *
 * @returns A memoized {@link UseJenkinsNavigationReturn} object with stable
 *   function references.
 *
 * @example
 * ```tsx
 * function JobActions({ jobName }: { jobName: string }) {
 *   const { navigate, buildUrl, combinePath } = useJenkinsNavigation();
 *
 *   const handleConfigure = () => {
 *     navigate(combinePath(`/job/${jobName}`, "configure"));
 *   };
 *
 *   return (
 *     <>
 *       <a href={buildUrl(`/job/${jobName}`)}>View Job</a>
 *       <button onClick={handleConfigure}>Configure</button>
 *     </>
 *   );
 * }
 * ```
 */
export function useJenkinsNavigation(): UseJenkinsNavigationReturn {
  const { baseUrl } = useJenkinsConfig();

  // -------------------------------------------------------------------------
  // navigate — mirrors jenkins.goTo() exactly
  // -------------------------------------------------------------------------
  // Uses window.location.replace() to match the original behavior:
  //   jenkins.goTo = function (url) {
  //     wh.getWindow().location.replace(jenkins.baseUrl() + url);
  //   };
  // The replace() call intentionally does NOT create a new history entry.

  const navigate = useCallback(
    (url: string): void => {
      window.location.replace(baseUrl + url);
    },
    [baseUrl],
  );

  // -------------------------------------------------------------------------
  // navigatePush — new addition for history-preserving navigation
  // -------------------------------------------------------------------------
  // Uses window.location.assign() to push a new history entry, allowing the
  // browser back button to return to the previous page. This method has no
  // equivalent in the original jenkins.js but is needed for React-based
  // navigation patterns where history preservation is expected.

  const navigatePush = useCallback(
    (url: string): void => {
      window.location.assign(baseUrl + url);
    },
    [baseUrl],
  );

  // -------------------------------------------------------------------------
  // buildUrl — URL construction without navigation
  // -------------------------------------------------------------------------
  // Returns the full URL string without triggering any navigation. Useful for
  // building <a href> values, constructing API endpoint URLs, or passing
  // URLs as props to child components.

  const buildUrl = useCallback(
    (relativePath: string): string => {
      return baseUrl + relativePath;
    },
    [baseUrl],
  );

  // -------------------------------------------------------------------------
  // Memoized return object
  // -------------------------------------------------------------------------
  // useMemo ensures the returned object maintains referential identity across
  // renders as long as none of its constituent values change. This prevents
  // unnecessary re-renders in consuming components that destructure the return
  // value or pass it as a prop.
  //
  // combinePath is a pure utility function with no dependencies on React state,
  // so it is included directly from the utils/path module without wrapping in
  // useCallback — its reference is inherently stable across renders.

  return useMemo(
    () => ({
      navigate,
      navigatePush,
      buildUrl,
      combinePath: combinePathUtil,
      baseUrl,
    }),
    [navigate, navigatePush, buildUrl, baseUrl],
  );
}
