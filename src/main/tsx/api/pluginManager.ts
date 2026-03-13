/**
 * React Query Plugin Manager API Layer
 *
 * Replaces `src/main/js/api/pluginManager.js` (299 lines) with typed React Query 5
 * query/mutation factories for all plugin management Stapler REST endpoints.
 *
 * The imperative callback-based API pattern (`pluginManager.method(handler)`) is
 * replaced by declarative React Query hooks (`usePluginList()`, `usePluginInstall()`).
 *
 * All 10 Stapler REST endpoints are preserved as-is — no new backend routes:
 *   GET  /setupWizard/platformPluginList       → platformPluginListQueryOptions / usePluginList
 *   GET  /pluginManager/plugins                → availablePluginsQueryOptions  / useAvailablePlugins
 *   GET  /updateCenter/installStatus           → installStatusQueryOptions     / useInstallStatus
 *   GET  /updateCenter/incompleteInstallStatus → incompleteInstallStatusQueryOptions / useIncompleteInstallStatus
 *   GET  /setupWizard/restartStatus            → restartStatusQueryOptions     / useRestartStatus
 *   GET  /pluginManager/pluginsSearch          → pluginsSearchQueryOptions     / usePluginSearch
 *   POST /pluginManager/installPlugins         → usePluginInstall
 *   POST /setupWizard/completeInstall          → useCompleteInstall
 *   POST /pluginManager/installPluginsDone     → useInstallPluginsDone
 *   POST /updateCenter/safeRestart             → useRestartJenkins
 *
 * CSRF crumb handling is fully delegated to `client.ts` — not duplicated here.
 *
 * @module api/pluginManager
 */

import { useQuery, useMutation, queryOptions } from "@tanstack/react-query";
import { jenkinsGet, jenkinsPost } from "@/api/client";
import type {
  StaplerResponse,
  PluginCategory,
  PluginInfo,
  InstallPluginsResponse,
  InstallStatusData,
  PluginSearchResult,
  RestartStatusData,
  PluginData,
} from "@/api/types";

// =============================================================================
// Constants
// =============================================================================

/**
 * Default timeout for plugin manager REST API requests (in milliseconds).
 *
 * Preserves the exact same 10-second timeout from the source:
 * `pluginManager.js` line 64 — `var pluginManagerErrorTimeoutMillis = 10 * 1000;`
 *
 * Applied to all query and mutation functions via the `timeout` option
 * passed to `jenkinsGet()` and `jenkinsPost()`.
 */
export const PLUGIN_MANAGER_TIMEOUT_MS = 10_000;

// =============================================================================
// Query Options Factories
// =============================================================================

/**
 * Query options factory for the platform plugin list endpoint.
 *
 * Source: `pluginManager.initialPluginList()` (lines 11–29)
 * Endpoint: `GET /setupWizard/platformPluginList`
 *
 * Returns the curated list of plugin categories offered during the setup wizard.
 * Each category contains plugins with `suggested` flags for default recommendations.
 *
 * The response is validated with the `response.status === "ok"` guard matching
 * source lines 15–17. Non-OK responses are thrown as errors, which React Query
 * surfaces via `isError` / `error` on the consuming hook.
 *
 * @returns React Query options object with `queryKey` and `queryFn`.
 */
export function platformPluginListQueryOptions() {
  return queryOptions({
    queryKey: ["plugins", "platformList"] as const,
    queryFn: async (): Promise<PluginCategory[]> => {
      const response = await jenkinsGet<StaplerResponse<PluginCategory[]>>(
        "/setupWizard/platformPluginList",
        { timeout: PLUGIN_MANAGER_TIMEOUT_MS },
      );

      // Guard: source lines 15–17 — `if (response.status !== "ok")`
      if (response.status !== "ok") {
        throw new Error(
          response.message ?? "Failed to fetch platform plugin list",
        );
      }

      return response.data;
    },
  });
}

/**
 * Query options factory for the available plugins endpoint.
 *
 * Source: `pluginManager.availablePlugins()` (lines 155–173)
 * Endpoint: `GET /pluginManager/plugins`
 *
 * Returns the full list of available plugins from the update center with
 * `name`, `title`, `excerpt`, `dependencies[]`, and other properties.
 *
 * @returns React Query options object with `queryKey` and `queryFn`.
 */
export function availablePluginsQueryOptions() {
  return queryOptions({
    queryKey: ["plugins", "available"] as const,
    queryFn: async (): Promise<PluginInfo[]> => {
      const response = await jenkinsGet<StaplerResponse<PluginInfo[]>>(
        "/pluginManager/plugins",
        { timeout: PLUGIN_MANAGER_TIMEOUT_MS },
      );

      // Guard: source lines 159–161
      if (response.status !== "ok") {
        throw new Error(
          response.message ?? "Failed to fetch available plugins",
        );
      }

      return response.data;
    },
  });
}

/**
 * Query options factory for the install status endpoint.
 *
 * Source: `pluginManager.installStatus()` (lines 124–146)
 * Endpoint: `GET /updateCenter/installStatus[?correlationId=<id>]`
 *
 * Returns the installation progress for plugins being installed. When a
 * `correlationId` (obtained from a prior `installPlugins` call) is provided,
 * only plugins from that specific install batch are returned.
 *
 * @param correlationId - Optional correlation ID from a prior `installPlugins` call.
 * @returns React Query options object with `queryKey` and `queryFn`.
 */
export function installStatusQueryOptions(correlationId?: string) {
  return queryOptions({
    queryKey: ["plugins", "installStatus", correlationId] as const,
    queryFn: async (): Promise<InstallStatusData> => {
      // URL construction: source lines 125–128
      let url = "/updateCenter/installStatus";
      if (correlationId !== undefined) {
        url += "?correlationId=" + encodeURIComponent(correlationId);
      }

      const response = await jenkinsGet<StaplerResponse<InstallStatusData>>(
        url,
        { timeout: PLUGIN_MANAGER_TIMEOUT_MS },
      );

      // Guard: source lines 132–134
      if (response.status !== "ok") {
        throw new Error(response.message ?? "Failed to fetch install status");
      }

      return response.data;
    },
  });
}

/**
 * Query options factory for the incomplete install status endpoint.
 *
 * Source: `pluginManager.incompleteInstallStatus()` (lines 200–222)
 * Endpoint: `GET /updateCenter/incompleteInstallStatus[?correlationId=<id>]`
 *
 * Returns status for plugins that failed or are still pending installation.
 * Same URL construction pattern as `installStatusQueryOptions`.
 *
 * @param correlationId - Optional correlation ID from a prior `installPlugins` call.
 * @returns React Query options object with `queryKey` and `queryFn`.
 */
export function incompleteInstallStatusQueryOptions(correlationId?: string) {
  return queryOptions({
    queryKey: ["plugins", "incompleteInstallStatus", correlationId] as const,
    queryFn: async (): Promise<InstallStatusData> => {
      // URL construction: source lines 201–204
      let url = "/updateCenter/incompleteInstallStatus";
      if (correlationId !== undefined) {
        url += "?correlationId=" + encodeURIComponent(correlationId);
      }

      const response = await jenkinsGet<StaplerResponse<InstallStatusData>>(
        url,
        { timeout: PLUGIN_MANAGER_TIMEOUT_MS },
      );

      // Guard: source lines 208–210
      if (response.status !== "ok") {
        throw new Error(
          response.message ?? "Failed to fetch incomplete install status",
        );
      }

      return response.data;
    },
  });
}

/**
 * Query options factory for the restart status endpoint.
 *
 * Source: `pluginManager.getRestartStatus()` (lines 246–259)
 * Endpoint: `GET /setupWizard/restartStatus`
 *
 * Checks whether a restart is required and supported to complete
 * pending plugin installations.
 *
 * Note: The original source does not explicitly check `response.status`,
 * passing `response.data` directly to the handler. A defensive guard
 * is included here for consistency with the rest of the API layer.
 *
 * @returns React Query options object with `queryKey` and `queryFn`.
 */
export function restartStatusQueryOptions() {
  return queryOptions({
    queryKey: ["setupWizard", "restartStatus"] as const,
    queryFn: async (): Promise<RestartStatusData> => {
      const response = await jenkinsGet<StaplerResponse<RestartStatusData>>(
        "/setupWizard/restartStatus",
        { timeout: PLUGIN_MANAGER_TIMEOUT_MS },
      );

      // Defensive guard — source passes response.data directly (line 250)
      // but we validate for safety
      if (response.status !== "ok") {
        throw new Error(response.message ?? "Failed to fetch restart status");
      }

      return response.data;
    },
  });
}

/**
 * Query options factory for the plugin search endpoint.
 *
 * Source: `pluginManager.availablePluginsSearch()` (lines 175–193)
 * Endpoint: `GET /pluginManager/pluginsSearch?query=<query>&limit=<limit>`
 *
 * Searches available plugins by keyword with a result limit. The `enabled`
 * flag is set to `false` when the query string is empty, preventing
 * unnecessary requests until the user starts typing.
 *
 * @param query - The search query string.
 * @param limit - Maximum number of results to return.
 * @returns React Query options object with `queryKey`, `queryFn`, and `enabled`.
 */
export function pluginsSearchQueryOptions(query: string, limit: number) {
  return queryOptions({
    queryKey: ["plugins", "search", query, limit] as const,
    queryFn: async (): Promise<PluginSearchResult> => {
      // URL construction: source line 177
      const url =
        "/pluginManager/pluginsSearch?query=" +
        encodeURIComponent(query) +
        "&limit=" +
        encodeURIComponent(String(limit));

      const response = await jenkinsGet<StaplerResponse<PluginSearchResult>>(
        url,
        { timeout: PLUGIN_MANAGER_TIMEOUT_MS },
      );

      // Guard: source lines 179–181
      if (response.status !== "ok") {
        throw new Error(response.message ?? "Failed to search plugins");
      }

      return response.data;
    },
    // Only execute when the query string is non-empty
    enabled: query.length > 0,
  });
}

// =============================================================================
// React Query Hooks — Query Wrappers
// =============================================================================

/**
 * Hook to fetch the platform plugin list from the setup wizard.
 *
 * Wraps `platformPluginListQueryOptions()` with `useQuery()` for reactive
 * data fetching with automatic caching and refetching.
 *
 * @returns React Query result with `data`, `isLoading`, `isError`, `error`, `isFetching`, `refetch`.
 */
export function usePluginList() {
  return useQuery(platformPluginListQueryOptions());
}

/**
 * Hook to fetch the full list of available plugins from the update center.
 *
 * Wraps `availablePluginsQueryOptions()` with `useQuery()`.
 *
 * @returns React Query result with `data`, `isLoading`, `isError`, `error`, `isFetching`, `refetch`.
 */
export function useAvailablePlugins() {
  return useQuery(availablePluginsQueryOptions());
}

/**
 * Hook to poll the installation status of plugins being installed.
 *
 * Wraps `installStatusQueryOptions()` with `useQuery()` and accepts
 * optional `enabled` and `refetchInterval` overrides to support the
 * polling behavior used during active plugin installation.
 *
 * The original source polled `installStatus` repeatedly using recursive
 * callback invocations. React Query's `refetchInterval` replaces this
 * pattern with declarative polling.
 *
 * @param correlationId - Optional correlation ID from `installPlugins`.
 * @param options - Additional query options for `enabled` and `refetchInterval`.
 * @returns React Query result with `data`, `isLoading`, `isError`, `error`, `isFetching`, `refetch`.
 */
export function useInstallStatus(
  correlationId?: string,
  options?: { enabled?: boolean; refetchInterval?: number | false },
) {
  return useQuery({
    ...installStatusQueryOptions(correlationId),
    enabled: options?.enabled,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Hook to fetch the incomplete installation status.
 *
 * Wraps `incompleteInstallStatusQueryOptions()` with `useQuery()`.
 *
 * @param correlationId - Optional correlation ID from `installPlugins`.
 * @param options - Additional query options for `enabled`.
 * @returns React Query result with `data`, `isLoading`, `isError`, `error`, `isFetching`, `refetch`.
 */
export function useIncompleteInstallStatus(
  correlationId?: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    ...incompleteInstallStatusQueryOptions(correlationId),
    enabled: options?.enabled,
  });
}

/**
 * Hook to check whether a Jenkins restart is required and supported.
 *
 * Wraps `restartStatusQueryOptions()` with `useQuery()`.
 *
 * @returns React Query result with `data`, `isLoading`, `isError`, `error`, `isFetching`, `refetch`.
 */
export function useRestartStatus() {
  return useQuery(restartStatusQueryOptions());
}

/**
 * Hook to search available plugins by keyword.
 *
 * Wraps `pluginsSearchQueryOptions()` with `useQuery()`. Automatically
 * disabled when `query` is empty via the `enabled: query.length > 0`
 * flag set in the query options factory.
 *
 * @param query - The search query string.
 * @param limit - Maximum number of results to return. Defaults to 50.
 * @returns React Query result with `data`, `isLoading`, `isError`, `error`, `isFetching`, `refetch`.
 */
export function usePluginSearch(query: string, limit: number = 50) {
  return useQuery(pluginsSearchQueryOptions(query, limit));
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Hook to install plugins via the plugin manager.
 *
 * Source: `pluginManager.installPlugins()` (lines 98–117)
 * Endpoint: `POST /pluginManager/installPlugins`
 *
 * The mutation function accepts `{ plugins: string[] }` and posts
 * `{ dynamicLoad: true, plugins }` to the endpoint (source line 101).
 * On success, the correlation ID from `response.data.correlationId`
 * (source line 108) is returned for tracking installation progress
 * via `useInstallStatus`.
 *
 * @returns React Query mutation result with `mutate`, `mutateAsync`, `isPending`,
 *   `isError`, `error`, `data`, `isSuccess`.
 */
export function usePluginInstall() {
  return useMutation({
    mutationFn: async ({ plugins }: { plugins: string[] }): Promise<string> => {
      const response = await jenkinsPost<
        StaplerResponse<InstallPluginsResponse>
      >(
        "/pluginManager/installPlugins",
        { dynamicLoad: true, plugins },
        { timeout: PLUGIN_MANAGER_TIMEOUT_MS },
      );

      // Guard: source lines 103–105
      if (response.status !== "ok") {
        throw new Error(response.message ?? "Failed to install plugins");
      }

      // Return correlation ID: source line 108
      return response.data.correlationId;
    },
  });
}

/**
 * Hook to complete the setup wizard installation without installing plugins.
 *
 * Source: `pluginManager.completeInstall()` (lines 227–241)
 * Endpoint: `POST /setupWizard/completeInstall`
 *
 * Posts an empty `{}` body (source line 230) to signal the setup wizard
 * that installation is complete.
 *
 * @returns React Query mutation result with `mutate`, `mutateAsync`, `isPending`,
 *   `isError`, `error`, `data`, `isSuccess`.
 */
export function useCompleteInstall() {
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await jenkinsPost<unknown>(
        "/setupWizard/completeInstall",
        {},
        { timeout: PLUGIN_MANAGER_TIMEOUT_MS },
      );
    },
  });
}

/**
 * Hook to mark plugin installation as done (skip failed plugins, continue).
 *
 * Source: `pluginManager.installPluginsDone()` (lines 264–278)
 * Endpoint: `POST /pluginManager/installPluginsDone`
 *
 * Posts an empty `{}` body to acknowledge that installation is done,
 * even if some plugins failed to install.
 *
 * @returns React Query mutation result with `mutate`, `mutateAsync`, `isPending`,
 *   `isError`, `error`, `data`, `isSuccess`.
 */
export function useInstallPluginsDone() {
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await jenkinsPost<unknown>(
        "/pluginManager/installPluginsDone",
        {},
        { timeout: PLUGIN_MANAGER_TIMEOUT_MS },
      );
    },
  });
}

/**
 * Hook to trigger a safe restart of the Jenkins instance.
 *
 * Source: `pluginManager.restartJenkins()` (lines 283–297)
 * Endpoint: `POST /updateCenter/safeRestart`
 *
 * Posts an empty `{}` body to request a safe restart, which waits for
 * running builds to complete before restarting.
 *
 * @returns React Query mutation result with `mutate`, `mutateAsync`, `isPending`,
 *   `isError`, `error`, `data`, `isSuccess`.
 */
export function useRestartJenkins() {
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await jenkinsPost<unknown>(
        "/updateCenter/safeRestart",
        {},
        { timeout: PLUGIN_MANAGER_TIMEOUT_MS },
      );
    },
  });
}

// =============================================================================
// Plugin Data Initialization Helper
// =============================================================================

/**
 * Pure function to initialize plugin data from the platform plugin list.
 *
 * Replicates the `pluginManager.init()` logic from source lines 32–61.
 *
 * Takes the categorized plugin list from the `/setupWizard/platformPluginList`
 * endpoint and produces:
 * - A flat array of unique plugin short names across all categories
 * - A subset of recommended plugin names (`plugin.suggested === true`)
 * - Language plugin auto-recommendation based on `window.navigator.language`
 *   (source lines 48–54): if the current browser locale matches a localization
 *   plugin name (e.g., `"localization-zh-cn"`), that plugin is automatically
 *   added to the recommended list
 *
 * This is a pure function — not a React hook. It can be called directly in
 * component render logic, used as React Query's `select` transform, or
 * invoked from any non-hook context.
 *
 * @param categories - Array of categorized plugins from the platform plugin list endpoint.
 * @returns Initialized plugin data with `names`, `recommendedPlugins`, and `availablePlugins`.
 *
 * @example
 * ```typescript
 * const { data: categories } = usePluginList();
 * const pluginData = categories ? initPluginData(categories) : null;
 * ```
 */
export function initPluginData(categories: PluginCategory[]): PluginData {
  const names: string[] = [];
  const recommendedPlugins: string[] = [];

  // Detect browser language for language plugin auto-recommendation.
  // Source lines 49–50: `window.navigator.userLanguage || window.navigator.language`
  // `userLanguage` is an IE-specific property not present in modern TypeScript
  // Navigator type definitions; we access it via bracket notation for backwards
  // compatibility with legacy browser environments.
  const navigatorAny = navigator as unknown as Record<string, unknown>;
  const rawLanguage =
    (typeof navigatorAny["userLanguage"] === "string"
      ? (navigatorAny["userLanguage"] as string)
      : undefined) ?? navigator.language;
  const languageCode = rawLanguage ? rawLanguage.toLocaleLowerCase() : "";

  // Iterate categories and their plugins, collecting unique names and
  // building the recommended plugins list.
  // Source lines 38–57
  for (let i = 0; i < categories.length; i++) {
    const pluginCategory = categories[i];
    const categoryPlugins = pluginCategory.plugins;

    for (let ii = 0; ii < categoryPlugins.length; ii++) {
      const plugin = categoryPlugins[ii];
      const pluginName = plugin.name;

      // Deduplicate: source line 44 — `if (plugins.names.indexOf(pluginName) === -1)`
      if (names.indexOf(pluginName) === -1) {
        names.push(pluginName);

        if (plugin.suggested) {
          // Recommended plugin: source line 46 — `if (plugin.suggested)`
          recommendedPlugins.push(pluginName);
        } else if (pluginCategory.category === "Languages") {
          // Language plugin auto-detect: source lines 48–54
          // If the plugin name matches "localization-{browserLanguageCode}",
          // auto-recommend it for the user's locale.
          if (
            languageCode.length > 0 &&
            pluginName === "localization-" + languageCode
          ) {
            recommendedPlugins.push(pluginName);
          }
        }
      }
    }
  }

  return {
    names,
    recommendedPlugins,
    availablePlugins: categories,
  };
}
