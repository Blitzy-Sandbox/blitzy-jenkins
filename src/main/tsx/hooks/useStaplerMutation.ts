/**
 * @module useStaplerMutation
 *
 * Generic React Query mutation wrapper for Jenkins Stapler REST POST endpoints.
 *
 * This hook replaces the `jenkins.post()` and `jenkins.staplerPost()` patterns
 * from the legacy `src/main/js/util/jenkins.js` module. It provides a typed,
 * reusable mutation hook that encapsulates:
 *
 * - **Content-type routing**: Automatically delegates to `jenkinsPost` (JSON) or
 *   `jenkinsStaplerPost` (form-urlencoded) based on the `contentType` option
 * - **CSRF crumb injection**: Fully delegated to the `@/api/client` module which
 *   performs dual header + body injection per the original jenkins.js lines 53-72
 * - **Base URL resolution**: Fully delegated to the `@/api/client` module which
 *   reads from `document.head.dataset.rooturl`
 * - **Typed responses**: Full generic type safety for request payloads (`TVariables`)
 *   and response data (`TData`)
 *
 * The hook is intentionally a THIN WRAPPER around React Query 5's `useMutation`.
 * It does NOT re-implement mutation state management, caching, or retry logic.
 * No jQuery, no Handlebars, no window-handle — React Query replaces `$.ajax`.
 *
 * @example JSON POST (replacing pluginManager.installPlugins pattern):
 * ```tsx
 * const installMutation = useStaplerMutation<
 *   InstallPluginsResponse,
 *   InstallPluginsRequest
 * >({
 *   url: '/pluginManager/installPlugins',
 *   timeout: 10000,
 *   onSuccess: (data) => console.log('Installed:', data.correlationId),
 * });
 *
 * installMutation.mutate({ dynamicLoad: true, plugins: selectedPlugins });
 * ```
 *
 * @example Form-urlencoded POST (replacing securityConfig.saveFirstUser pattern):
 * ```tsx
 * const saveUserMutation = useStaplerMutation<CrumbRefreshResponse, FormData>({
 *   url: '/setupWizard/createAdminUser',
 *   contentType: 'form-urlencoded',
 *   onSuccess: (data) => {
 *     if (data.crumbRequestField) {
 *       window.crumb.init(data.crumbRequestField, data.crumb);
 *     }
 *   },
 * });
 * ```
 *
 * @example HTML response type (replacing securityConfig.saveProxy pattern):
 * ```tsx
 * const proxyMutation = useStaplerMutation<string, FormData>({
 *   url: '/pluginManager/proxyConfigure',
 *   contentType: 'form-urlencoded',
 *   responseType: 'text',
 * });
 * ```
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { jenkinsPost, jenkinsStaplerPost } from '@/api/client';

/**
 * Configuration options for the {@link useStaplerMutation} hook.
 *
 * Controls how the Stapler POST request is constructed and how React Query
 * manages the mutation lifecycle. The `contentType` option determines which
 * underlying client function is called:
 * - `'json'` → `jenkinsPost()` with `Content-Type: application/json`
 * - `'form-urlencoded'` → `jenkinsStaplerPost()` with FormData or URL-encoded string
 *
 * @typeParam TData - The type of data returned by the Stapler endpoint (response body).
 *   Defaults to `unknown` when not specified by the consumer.
 */
export interface UseStaplerMutationOptions<TData = unknown> {
  /**
   * Relative URL path for the Stapler POST endpoint.
   * The Jenkins base URL (from `document.head.dataset.rooturl`) is automatically
   * prepended by the API client layer.
   *
   * @example '/pluginManager/installPlugins'
   * @example '/setupWizard/createAdminUser'
   * @example '/pluginManager/proxyConfigure'
   */
  url: string;

  /**
   * Optional request timeout in milliseconds.
   * When specified, the underlying `fetch` call is aborted via `AbortController`
   * if it exceeds this duration. Matches the timeout option pattern from
   * pluginManager.js which uses `pluginManagerErrorTimeoutMillis = 10 * 1000`.
   *
   * @default undefined — no timeout applied
   * @example 10000 — 10 second timeout for plugin operations
   */
  timeout?: number;

  /**
   * Content type for the POST request body.
   *
   * - `'json'` (default): Sends `Content-Type: application/json` with a
   *   JSON-serialized body. Delegates to `jenkinsPost()` which performs CSRF
   *   crumb dual injection — both as an HTTP header (`headers[crumb.fieldName]`)
   *   and embedded in the JSON body (`body[crumb.fieldName]`), replicating
   *   the exact pattern from jenkins.js lines 53-72.
   *
   * - `'form-urlencoded'`: Sends form data as `FormData` or a URL-encoded string.
   *   Delegates to `jenkinsStaplerPost()` which injects the CSRF crumb into
   *   headers and form fields. This replaces the `jenkins.staplerPost()` pattern
   *   from jenkins.js lines 237-254.
   *
   * @default 'json'
   */
  contentType?: 'json' | 'form-urlencoded';

  /**
   * Expected response type from the server.
   *
   * - `'json'` (default): Response is parsed as JSON via `response.json()`
   * - `'text'`: Response is returned as raw text via `response.text()`.
   *   Used for HTML-returning endpoints like `/pluginManager/proxyConfigure`
   *   (see securityConfig.js line 49: `dataType: "html"`).
   *
   * Only applies when `contentType` is `'form-urlencoded'`. JSON POST
   * requests always parse the response as JSON.
   *
   * @default 'json'
   */
  responseType?: 'json' | 'text';

  /**
   * React Query `onSuccess` callback fired when the mutation succeeds.
   * Receives the fully parsed and typed response data from the Stapler endpoint.
   *
   * Replaces the jQuery `success` callback pattern:
   * ```js
   * // Old: jenkins.post(url, data, function(response) { ... }, options);
   * // New: onSuccess: (data) => { ... }
   * ```
   *
   * @param data - The typed response data (`TData`) from the Stapler endpoint
   */
  onSuccess?: (data: TData) => void;

  /**
   * React Query `onError` callback fired when the mutation encounters an error.
   * The error may be an `ApiError` from the client module (carrying HTTP `status`
   * and `statusText`) or a network/timeout `Error`.
   *
   * Replaces the jQuery error callback pattern:
   * ```js
   * // Old: options.error = function(xhr, textStatus, errorThrown) { ... }
   * // New: onError: (error) => { ... }
   * ```
   *
   * @param error - The error that occurred during the mutation
   */
  onError?: (error: Error) => void;

  /**
   * React Query `onSettled` callback fired when the mutation completes,
   * regardless of success or failure. Always called after `onSuccess` or `onError`.
   *
   * Useful for cleanup operations like re-enabling form controls or
   * dismissing loading indicators.
   *
   * @param data - The response data (`TData`), or `undefined` if an error occurred
   * @param error - The error, or `null` if the mutation succeeded
   */
  onSettled?: (data: TData | undefined, error: Error | null) => void;
}

/**
 * Generic React Query mutation hook for Jenkins Stapler REST POST endpoints.
 *
 * This is a thin wrapper around React Query 5's `useMutation` that routes
 * the mutation function call to either `jenkinsPost` (for JSON payloads) or
 * `jenkinsStaplerPost` (for form-urlencoded payloads) based on the
 * `contentType` option.
 *
 * **CSRF crumb handling**, **base URL resolution**, and **response parsing**
 * are fully delegated to the `@/api/client` module — this hook does NOT
 * directly manage any of those concerns.
 *
 * The returned `UseMutationResult` provides the standard React Query 5 mutation
 * state machine with the following members:
 * - `mutate(variables)` — Fire-and-forget mutation trigger
 * - `mutateAsync(variables)` — Promise-returning mutation trigger
 * - `isPending` — Whether the mutation is currently in progress
 * - `isError` — Whether the last mutation attempt errored
 * - `error` — The error object (if `isError` is true)
 * - `data` — The response data (if `isSuccess` is true)
 * - `isSuccess` — Whether the last mutation succeeded
 * - `isIdle` — Whether no mutation has been triggered yet
 * - `reset()` — Reset the mutation state back to idle
 *
 * @typeParam TData - The type of data returned by the mutation (default: `unknown`)
 * @typeParam TVariables - The type of variables passed to `mutate()` (default: `unknown`)
 *
 * @param options - Configuration for the Stapler POST mutation. See
 *   {@link UseStaplerMutationOptions} for all available options.
 * @returns Standard React Query `UseMutationResult<TData, Error, TVariables>`
 *   providing the full mutation state machine.
 */
export function useStaplerMutation<TData = unknown, TVariables = unknown>(
  options: UseStaplerMutationOptions<TData>,
): UseMutationResult<TData, Error, TVariables> {
  const {
    url,
    timeout,
    contentType = 'json',
    responseType = 'json',
    onSuccess,
    onError,
    onSettled,
  } = options;

  return useMutation<TData, Error, TVariables>({
    /**
     * The mutation function that executes the Stapler POST request.
     *
     * Routes to the appropriate client function based on `contentType`:
     * - `'json'` → `jenkinsPost<TData>()` — JSON body with CSRF crumb dual
     *   injection (header + body), matching jenkins.js lines 53-90
     * - `'form-urlencoded'` → `jenkinsStaplerPost<TData>()` — FormData or
     *   URL-encoded string with CSRF crumb injection, matching jenkins.js
     *   lines 237-254
     *
     * @param variables - The request payload typed as `TVariables`
     * @returns Typed response promise resolving to `TData`
     */
    mutationFn: async (variables: TVariables): Promise<TData> => {
      if (contentType === 'form-urlencoded') {
        // Form-urlencoded POST: delegates to jenkinsStaplerPost which handles
        // CSRF crumb injection in headers and form fields, and supports both
        // FormData objects and URL-encoded string payloads.
        // The responseType is forwarded to support HTML-returning endpoints
        // like /pluginManager/proxyConfigure (securityConfig.js line 49).
        return jenkinsStaplerPost<TData>(
          url,
          variables as unknown as FormData | string,
          { timeout, responseType },
        );
      }

      // JSON POST (default): delegates to jenkinsPost which handles CSRF crumb
      // dual injection (HTTP header + JSON body field per jenkins.js lines 53-72),
      // Content-Type: application/json, and JSON response parsing.
      return jenkinsPost<TData>(url, variables, { timeout });
    },
    onSuccess,
    onError,
    onSettled,
  });
}
