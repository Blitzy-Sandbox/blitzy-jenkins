/**
 * useCrumb — CSRF Crumb Management Hook
 *
 * Manages the Jenkins CSRF crumb lifecycle. Replaces the `crumb.init()` pattern
 * from `pluginManager.js`, the `window.crumb` access pattern from `jenkins.js`
 * (lines 53–65), and the post-mutation crumb refresh from `securityConfig.js`
 * (lines 17–19 and 33–35).
 *
 * The crumb is an anti-CSRF token required for all POST requests to Jenkins.
 * This hook:
 *   1. Reads the initial crumb synchronously from DOM data attributes
 *      (set by the Jelly `<l:layout>` tag on `<head>`)
 *   2. Optionally fetches a fresh crumb from `/crumbIssuer/api/json` when
 *      DOM data attributes are not available
 *   3. Provides a `refreshCrumb()` function for React Query cache invalidation
 *   4. Provides an `updateCrumb()` function for post-mutation crumb refresh
 *      (mirrors `securityConfig.js` `getWindow().crumb.init()` pattern)
 *   5. Maintains backward compatibility with the global `window.crumb` object
 *      that 2,000+ plugins depend on
 *
 * @module useCrumb
 */
import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of the JSON response from the `/crumbIssuer/api/json` REST endpoint.
 *
 * Contains both the crumb token value and its corresponding HTTP header/field
 * name used for CSRF protection.
 */
interface CrumbIssuerResponse {
  /** The CSRF crumb token value */
  crumb: string;
  /** The HTTP header/field name for the crumb (e.g., "Jenkins-Crumb") */
  crumbRequestField: string;
}

/**
 * Return type for the {@link useCrumb} hook.
 *
 * Exposes the crumb field name and value for injection into POST requests,
 * loading/error state, and functions for refreshing or manually updating
 * the crumb.
 */
export interface UseCrumbReturn {
  /**
   * The CSRF crumb field name (e.g., "Jenkins-Crumb").
   * Used as the HTTP header key when injecting the crumb into POST requests.
   * Mirrors `crumb.fieldName` from `jenkins.js` line 63.
   */
  crumbFieldName: string;

  /**
   * The current CSRF crumb token value.
   * Used as the HTTP header value and embedded in the POST body.
   * Mirrors `crumb.value` from `jenkins.js` line 64.
   */
  crumbValue: string;

  /**
   * Whether the crumb has been successfully loaded, either synchronously
   * from DOM data attributes or asynchronously from the REST endpoint.
   */
  isLoaded: boolean;

  /**
   * Whether the crumb fetch from `/crumbIssuer/api/json` is currently in
   * progress. `false` when the query is disabled (DOM provides the crumb)
   * or when the fetch has completed.
   */
  isLoading: boolean;

  /**
   * Error from the crumb fetch, or `null` if no error occurred.
   */
  error: Error | null;

  /**
   * Refresh the crumb by invalidating the React Query cache and refetching
   * from `/crumbIssuer/api/json`. Useful when the crumb may have expired or
   * been rotated server-side.
   */
  refreshCrumb: () => void;

  /**
   * Manually update the crumb with new values. Also updates the global
   * `window.crumb` object via `window.crumb.init()` for plugin backward
   * compatibility.
   *
   * Mirrors the pattern from `securityConfig.js` lines 17–19 and 33–35:
   * ```js
   * var crumbRequestField = response.data.crumbRequestField;
   * if (crumbRequestField) {
   *   getWindow().crumb.init(crumbRequestField, response.data.crumb);
   * }
   * ```
   *
   * @param fieldName - The crumb field name (e.g., "Jenkins-Crumb")
   * @param value - The new crumb token value
   */
  updateCrumb: (fieldName: string, value: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * React Query cache key for the crumb issuer endpoint.
 * Used for both fetching and cache invalidation via `refreshCrumb()`.
 */
const CRUMB_QUERY_KEY = ["crumbIssuer"] as const;

/**
 * Stale time for the crumb query: 5 minutes (300 000 ms).
 *
 * CSRF crumbs have a finite lifetime but don't change on every request.
 * This value avoids excessive refetches while keeping the crumb reasonably
 * fresh. When a crumb does expire mid-session, consumers can call
 * `refreshCrumb()` to force an immediate refetch.
 */
const CRUMB_STALE_TIME_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * React hook for CSRF crumb lifecycle management.
 *
 * Reads the initial crumb synchronously from DOM `data-*` attributes set by
 * the Jelly `<l:layout>` tag, and optionally fetches from the
 * `/crumbIssuer/api/json` REST endpoint when DOM data is not available.
 *
 * The hook maintains dual state:
 * - **React state** for crumb values — triggers component re-renders.
 * - **Global `window.crumb`** — maintains backward compatibility with the
 *   2,000+ Jenkins plugins that read the global crumb object.
 *
 * @returns {UseCrumbReturn} Crumb state and management functions.
 *
 * @example
 * ```tsx
 * function MyForm() {
 *   const { crumbFieldName, crumbValue, isLoaded } = useCrumb();
 *
 *   const handleSubmit = async () => {
 *     if (!isLoaded) return;
 *     await fetch('/my/endpoint', {
 *       method: 'POST',
 *       headers: {
 *         [crumbFieldName]: crumbValue,
 *         'Content-Type': 'application/json',
 *       },
 *       body: JSON.stringify({
 *         ...formData,
 *         [crumbFieldName]: crumbValue,
 *       }),
 *     });
 *   };
 * }
 * ```
 */
export function useCrumb(): UseCrumbReturn {
  // -------------------------------------------------------------------------
  // Initial crumb from DOM data attributes (synchronous, no fetch needed).
  //
  // The Jelly <l:layout> tag renders these data attributes on <head>:
  //   data-crumbrequestfield="Jenkins-Crumb"
  //   data-crumb="abc123..."
  //   data-rooturl="/jenkins"
  //
  // HTML data attributes without hyphens (e.g., data-crumbrequestfield) are
  // accessed via dataset as all-lowercase property names, hence
  // `document.head.dataset.crumbrequestfield` (not `crumbRequestField`).
  // -------------------------------------------------------------------------
  const initialFieldName: string =
    document.head.dataset.crumbrequestfield ?? "";
  const initialValue: string = document.head.dataset.crumb ?? "";

  // -------------------------------------------------------------------------
  // Manual override state — set exclusively by updateCrumb().
  //
  // When a POST mutation returns refreshed crumb data (e.g., after
  // saveFirstUser in securityConfig.js), updateCrumb() stores the new values
  // here. This state takes priority over both DOM initial values and React
  // Query fetched values, ensuring the most recent server-provided crumb is
  // used immediately without waiting for a refetch cycle.
  //
  // Cleared by refreshCrumb() to allow fresh API data to take precedence.
  // -------------------------------------------------------------------------
  const [manualCrumb, setManualCrumb] = useState<{
    fieldName: string;
    value: string;
  } | null>(null);

  // React Query client for cache invalidation in refreshCrumb()
  const queryClient = useQueryClient();

  // -------------------------------------------------------------------------
  // React Query fetch from /crumbIssuer/api/json
  //
  // Only enabled when DOM data attributes do NOT provide an initial crumb
  // value (e.g., on pages not rendered via the standard Jelly <l:layout> tag,
  // or when crumb data attributes are omitted).
  //
  // Uses native fetch() — no jQuery dependency.
  //
  // Endpoint returns: { crumb: string, crumbRequestField: string }
  // This is the canonical REST API for obtaining a fresh CSRF token.
  // -------------------------------------------------------------------------
  const crumbQuery = useQuery<CrumbIssuerResponse, Error>({
    queryKey: CRUMB_QUERY_KEY,

    queryFn: async (): Promise<CrumbIssuerResponse> => {
      const baseUrl: string = document.head.dataset.rooturl ?? "";
      const response = await fetch(`${baseUrl}/crumbIssuer/api/json`, {
        method: "GET",
        cache: "no-cache",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(
          `Crumb fetch failed: ${response.status} ${response.statusText}`,
        );
      }

      return response.json() as Promise<CrumbIssuerResponse>;
    },

    // Crumbs are valid for a reasonable duration — 5 minute stale time
    staleTime: CRUMB_STALE_TIME_MS,

    // Only fetch if the DOM doesn't already provide the crumb value
    enabled: !initialValue,
  });

  // -------------------------------------------------------------------------
  // Derived crumb values: manual override > query data > DOM initial.
  //
  // This derivation avoids calling setState inside useEffect (which the
  // react-hooks/set-state-in-effect rule flags as a cascading render risk).
  // Instead, crumb values are computed directly from the available sources
  // on each render, with a clear priority chain:
  //
  //   1. Manual override (set by updateCrumb) — highest priority, from
  //      server responses after POST mutations
  //   2. React Query data (fetched from /crumbIssuer/api/json)
  //   3. DOM initial values (from Jelly <l:layout> data attributes)
  // -------------------------------------------------------------------------
  const crumbFieldName: string =
    manualCrumb?.fieldName ??
    crumbQuery.data?.crumbRequestField ??
    initialFieldName;

  const crumbValue: string =
    manualCrumb?.value ?? crumbQuery.data?.crumb ?? initialValue;

  // -------------------------------------------------------------------------
  // Sync fetched crumb data to global window.crumb (external system sync).
  //
  // This useEffect updates the global window.crumb object ONLY — it does
  // NOT call setState. The window.crumb object is an external system that
  // 2,000+ plugins depend on. See jenkins.js lines 53–65 where crumb is
  // read from window.crumb:
  //   if ("crumb" in wnd) { crumb = wnd.crumb; }
  //   headers[crumb.fieldName] = crumb.value;
  //
  // The window.crumb.init() call is NON-NEGOTIABLE for plugin backward
  // compatibility.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (crumbQuery.data && window.crumb) {
      window.crumb.init(
        crumbQuery.data.crumbRequestField,
        crumbQuery.data.crumb,
      );
    }
  }, [crumbQuery.data]);

  // -------------------------------------------------------------------------
  // refreshCrumb — invalidate the React Query cache to force a refetch from
  // /crumbIssuer/api/json. Useful when the crumb may have expired or been
  // rotated server-side.
  // -------------------------------------------------------------------------
  const refreshCrumb = useCallback((): void => {
    // Clear any manual override so that fresh API data takes precedence
    // after the refetch completes.
    setManualCrumb(null);
    queryClient.invalidateQueries({ queryKey: CRUMB_QUERY_KEY });
  }, [queryClient]);

  // -------------------------------------------------------------------------
  // updateCrumb — manually update the crumb with new values returned from a
  // server response. This is invoked after POST mutations that return
  // refreshed crumb data in their response body.
  //
  // Mirrors the EXACT pattern from securityConfig.js lines 17–19:
  //   var crumbRequestField = response.data.crumbRequestField;
  //   if (crumbRequestField) {
  //     getWindow().crumb.init(crumbRequestField, response.data.crumb);
  //   }
  //
  // And securityConfig.js lines 33–35 (same pattern for configureInstance).
  //
  // CRITICAL: Updates BOTH React state AND window.crumb.init() — dual update
  // is mandatory for plugin ecosystem backward compatibility.
  // -------------------------------------------------------------------------
  const updateCrumb = useCallback((fieldName: string, value: string): void => {
    // Store as manual override — takes priority over query data and DOM
    setManualCrumb({ fieldName, value });

    // CRITICAL: Maintain window.crumb for plugin backward compatibility.
    // Mirrors securityConfig.js lines 18–19 and 34–35:
    //   getWindow().crumb.init(crumbRequestField, response.data.crumb);
    if (window.crumb) {
      window.crumb.init(fieldName, value);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Return crumb state and management functions
  // -------------------------------------------------------------------------
  return {
    crumbFieldName,
    crumbValue,

    // isLoaded: true when crumbValue is non-empty (from DOM or manual update)
    // OR when the React Query fetch completed successfully
    isLoaded: Boolean(crumbValue) || crumbQuery.isSuccess,

    // isLoading: true when the crumb fetch is in progress.
    // In React Query 5, isLoading === (isPending && isFetching).
    // When the query is disabled (DOM provides crumb), isLoading is false.
    isLoading: crumbQuery.isLoading,

    // Error from the crumb fetch, or null if no error occurred.
    // The nullish coalescing ensures a clean null when error is undefined.
    error: (crumbQuery.error as Error) ?? null,

    refreshCrumb,
    updateCrumb,
  };
}
