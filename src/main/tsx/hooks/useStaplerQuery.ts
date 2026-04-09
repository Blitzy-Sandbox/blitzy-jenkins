/**
 * Generic React Query Wrapper for Stapler REST GET Endpoints
 *
 * Provides `useStaplerQuery<T>()` — a typed, reusable React Query 5 hook that
 * replaces the `jenkins.get()` jQuery AJAX pattern from `src/main/js/util/jenkins.js`
 * (lines 27-42) with declarative, cached, server-state management.
 *
 * Key behaviors replicated from the original codebase:
 * - **Base URL resolution**: Delegated to `jenkinsGet()` which reads
 *   `document.head.dataset.rooturl` (source: jenkins.js line 13)
 * - **Cache busting**: `staleTime` defaults to `0`, matching jQuery's `cache: false`
 *   behavior which treats every response as immediately stale
 * - **JSON response parsing**: Handled by `jenkinsGet()` (`dataType: "json"` equivalent)
 * - **Configurable timeout**: Passed through to `jenkinsGet()` via `AbortController`,
 *   replicating the `pluginManager.js` pattern (line 64: `pluginManagerErrorTimeoutMillis = 10 * 1000`)
 * - **Error handling**: Errors from `jenkinsGet()` (including `ApiError` for non-OK
 *   responses) propagate through React Query's `error` state
 *
 * This hook is a THIN WRAPPER around React Query's `useQuery` — it does NOT
 * re-implement caching, deduplication, or state management. The actual HTTP
 * call is delegated entirely to `@/api/client.jenkinsGet()`.
 *
 * Usage patterns it replaces:
 * ```js
 * // OLD (pluginManager.js lines 11-28):
 * jenkins.get("/setupWizard/platformPluginList", function(response) {
 *   handler.call({ isError: false }, response.data);
 * }, { timeout: 10000, error: function(xhr, textStatus, errorThrown) { ... } });
 *
 * // NEW:
 * const { data, isLoading, error } = useStaplerQuery<StaplerResponse<PluginCategory[]>>({
 *   url: "/setupWizard/platformPluginList",
 *   queryKey: ["platformPluginList"],
 *   timeout: 10_000,
 * });
 * ```
 *
 * @module hooks/useStaplerQuery
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { jenkinsGet } from "@/api/client";

// =============================================================================
// Options Interface
// =============================================================================

/**
 * Configuration options for the `useStaplerQuery` hook.
 *
 * Combines Stapler-specific settings (URL, timeout) with React Query behavior
 * controls (staleTime, refetchInterval, enabled, select). This interface is the
 * single configuration surface for all GET queries against Jenkins Stapler REST
 * endpoints.
 *
 * @typeParam T - The expected shape of the parsed JSON response from the endpoint.
 */
export interface UseStaplerQueryOptions<T> {
  /**
   * Relative URL path appended to the Jenkins base URL.
   *
   * Must start with "/" and will be concatenated with the base URL from
   * `document.head.dataset.rooturl` by the underlying `jenkinsGet()` client.
   *
   * @example "/pluginManager/plugins"
   * @example "/api/json"
   * @example "/updateCenter/connectionStatus?siteId=default"
   */
  url: string;

  /**
   * React Query cache key array for this query.
   *
   * Used for cache identity, deduplication, and invalidation. Should be a
   * stable, unique identifier for the endpoint and its parameters.
   *
   * @example ["pluginManager", "plugins"]
   * @example ["job", jobName, "api", "json"]
   */
  queryKey: readonly unknown[];

  /**
   * Optional request timeout in milliseconds.
   *
   * When specified, the underlying `jenkinsGet()` creates an `AbortController`
   * that aborts the fetch after this duration. Matches the
   * `pluginManagerErrorTimeoutMillis` pattern (pluginManager.js line 64).
   *
   * @default undefined — no timeout (browser default applies)
   * @example 10_000 — 10 seconds, matching pluginManager default
   */
  timeout?: number;

  /**
   * Whether the query should execute.
   *
   * When `false`, the query will not automatically run. Useful for dependent
   * queries that should wait for prerequisite data.
   *
   * @default true
   */
  enabled?: boolean;

  /**
   * Time in milliseconds before cached data is considered stale.
   *
   * Defaults to `0` to match the jQuery `cache: false` pattern from the
   * original `jenkins.get()` implementation, which treats every response as
   * immediately stale and always re-fetches on component mount.
   *
   * Set to a positive value for endpoints where brief caching is acceptable
   * (e.g., plugin metadata that rarely changes within a session).
   *
   * @default 0
   */
  staleTime?: number;

  /**
   * Polling interval in milliseconds for automatic background refetching.
   *
   * Useful for endpoints that require periodic polling, such as:
   * - `/updateCenter/installStatus` (plugin installation progress)
   * - `/updateCenter/connectionStatus` (connectivity checks)
   *
   * Set to `false` to disable polling (default React Query behavior).
   *
   * @default false — no polling
   * @example 1000 — poll every second for install status updates
   */
  refetchInterval?: number | false;

  /**
   * Transform function applied to the raw response before returning to consumers.
   *
   * Useful for extracting nested data from the Stapler response envelope:
   * ```typescript
   * select: (response) => response.data
   * ```
   *
   * The transform runs client-side after the response is cached, so the cache
   * stores the original full response for consistency.
   *
   * @param data - The raw response of type T from the endpoint
   * @returns The transformed data (must remain assignable to T for type safety)
   */
  select?: (data: T) => T;
}

// =============================================================================
// Primary Hook — useStaplerQuery
// =============================================================================

/**
 * Generic React Query wrapper for Stapler REST GET endpoints.
 *
 * Encapsulates the full `jenkins.get()` replacement pattern: base URL resolution,
 * cache busting (via `staleTime: 0`), JSON parsing, timeout support, and typed
 * error handling — all delegated to `jenkinsGet()` from `@/api/client`.
 *
 * Returns a standard React Query `UseQueryResult<T, Error>` providing access to
 * `data`, `isLoading`, `isError`, `error`, `isFetching`, `isSuccess`, `isPending`,
 * `refetch`, and `status`.
 *
 * @typeParam T - Expected shape of the parsed JSON response body
 * @param options - Query configuration (see `UseStaplerQueryOptions`)
 * @returns React Query result object with typed data and query state
 *
 * @example
 * ```tsx
 * // Fetch available plugins with 10-second timeout (replicates pluginManager.js)
 * const { data, isLoading, error } = useStaplerQuery<StaplerResponse<PluginInfo[]>>({
 *   url: "/pluginManager/plugins",
 *   queryKey: ["pluginManager", "plugins"],
 *   timeout: 10_000,
 * });
 *
 * // Fetch with polling for install status
 * const { data: status } = useStaplerQuery<StaplerResponse<InstallStatusData>>({
 *   url: `/updateCenter/installStatus?correlationId=${id}`,
 *   queryKey: ["installStatus", id],
 *   refetchInterval: 1000,
 *   enabled: !!id,
 * });
 *
 * // Fetch with select transform to unwrap envelope
 * const { data: plugins } = useStaplerQuery<StaplerResponse<PluginCategory[]>>({
 *   url: "/setupWizard/platformPluginList",
 *   queryKey: ["platformPluginList"],
 *   select: (response) => response,
 * });
 * ```
 */
export function useStaplerQuery<T>(
  options: UseStaplerQueryOptions<T>,
): UseQueryResult<T, Error> {
  const {
    url,
    queryKey,
    timeout,
    enabled = true,
    staleTime = 0,
    refetchInterval,
    select,
  } = options;

  return useQuery<T, Error>({
    queryKey,
    queryFn: async (): Promise<T> => {
      return jenkinsGet<T>(url, { timeout });
    },
    enabled,
    staleTime,
    refetchInterval,
    select,
  });
}

// =============================================================================
// Convenience Overload — useStaplerGet
// =============================================================================

/**
 * Simplified convenience wrapper around `useStaplerQuery` for the common case
 * where only a URL and query key are required.
 *
 * Provides a positional-argument API for simple GET queries, avoiding the need
 * for an options object when most defaults are acceptable:
 *
 * ```tsx
 * // Instead of:
 * const result = useStaplerQuery<JobModel>({ url: "/api/json", queryKey: ["root"] });
 *
 * // Use:
 * const result = useStaplerGet<JobModel>("/api/json", ["root"]);
 * ```
 *
 * All optional properties from `UseStaplerQueryOptions` can be passed as the
 * third argument for timeout, polling, conditional execution, etc.
 *
 * Returns the same `UseQueryResult<T, Error>` as `useStaplerQuery`, with access
 * to `data`, `isLoading`, `isError`, `error`, `isFetching`, `isSuccess`,
 * `isPending`, `refetch`, and `status`.
 *
 * @typeParam T - Expected shape of the parsed JSON response body
 * @param url - Relative URL path appended to Jenkins base URL
 * @param queryKey - React Query cache key array
 * @param options - Optional additional configuration (timeout, enabled, staleTime, etc.)
 * @returns React Query result object with typed data and query state
 *
 * @example
 * ```tsx
 * // Simple fetch with defaults
 * const { data } = useStaplerGet<StaplerResponse<ViewData>>("/view/all/api/json", ["view", "all"]);
 *
 * // With timeout and conditional execution
 * const { data, isLoading } = useStaplerGet<StaplerResponse<ComputerSet>>(
 *   "/computer/api/json",
 *   ["computers"],
 *   { timeout: 10_000, enabled: isAuthenticated },
 * );
 *
 * // With polling for real-time status
 * const { data: queueData } = useStaplerGet<StaplerResponse<QueueData>>(
 *   "/queue/api/json",
 *   ["queue"],
 *   { refetchInterval: 3000 },
 * );
 * ```
 */
export function useStaplerGet<T>(
  url: string,
  queryKey: readonly unknown[],
  options?: Partial<Omit<UseStaplerQueryOptions<T>, "url" | "queryKey">>,
): UseQueryResult<T, Error> {
  return useStaplerQuery<T>({
    url,
    queryKey,
    ...options,
  });
}
