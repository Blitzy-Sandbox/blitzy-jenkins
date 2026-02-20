/**
 * Security Configuration Mutations — React Query Hooks
 *
 * Replaces `src/main/js/api/securityConfig.js` (59 lines). Provides React Query 5
 * mutation hooks for the Jenkins setup wizard's security configuration endpoints:
 *
 * - `useSaveFirstUser()` — POST to `/setupWizard/createAdminUser`
 * - `useSaveConfigureInstance()` — POST to `/setupWizard/configureInstance`
 * - `useSaveProxy()` — POST to `/pluginManager/proxyConfigure`
 *
 * Key migration changes from source:
 * - jQuery form serialization (`$form`) → typed payloads with fetch-based POST
 * - `window-handle` (`getWindow().crumb`) → direct `window.crumb` access (typed by jenkins.d.ts)
 * - Callback pattern (`success`, `error`) → React Query mutation state (`isPending`, `isError`, `data`)
 * - `jenkins.staplerPost()` → `jenkinsPost()` (JSON) and `jenkinsStaplerPost()` (form-encoded)
 *
 * CRITICAL: CSRF crumb refresh is preserved for `saveFirstUser` and `saveConfigureInstance`
 * via `window.crumb.init()` — this is non-negotiable for CSRF protection continuity.
 *
 * Source reference: src/main/js/api/securityConfig.js (59 lines)
 * Ambient types from: src/main/tsx/types/jenkins.d.ts (window.crumb, CrumbObject)
 *
 * @module api/security
 */

import { useMutation } from "@tanstack/react-query";
import { jenkinsPost, jenkinsStaplerPost } from "@/api/client";
import type {
  StaplerResponse,
  CrumbRefreshResponse,
  SaveFirstUserPayload,
  SaveConfigureInstancePayload,
  SaveProxyPayload,
} from "@/api/types";

// =============================================================================
// Crumb Refresh Helper
// =============================================================================

/**
 * Updates the global CSRF crumb after security-sensitive mutations.
 *
 * Replicates the crumb refresh pattern from source `securityConfig.js`:
 * - Lines 16-18 (saveFirstUser success handler):
 *   `var crumbRequestField = response.data.crumbRequestField;`
 *   `if (crumbRequestField) { getWindow().crumb.init(crumbRequestField, response.data.crumb); }`
 * - Lines 32-34 (saveConfigureInstance success handler): identical pattern
 *
 * When the server responds with new crumb data (after operations that rotate
 * the crumb token, such as creating the first admin user or configuring the
 * instance URL), this function re-initializes `window.crumb` so that subsequent
 * POST requests use the updated CSRF token.
 *
 * CRITICAL: This function is essential for CSRF protection continuity across
 * setup wizard steps. Omitting this call would cause subsequent POST requests
 * to fail with 403 Forbidden due to stale crumb tokens.
 *
 * @param data - The response data that may contain crumb refresh fields.
 *               `crumbRequestField` is the header/field name (e.g., "Jenkins-Crumb"),
 *               `crumb` is the new token value.
 */
function refreshCrumb(data: CrumbRefreshResponse): void {
  const { crumbRequestField, crumb } = data;
  if (crumbRequestField) {
    // Directly access window.crumb (typed by jenkins.d.ts as CrumbObject)
    // replacing the source's getWindow().crumb.init() via window-handle
    window.crumb.init(crumbRequestField, crumb ?? "");
  }
}

// =============================================================================
// Helper: Payload to URL-Encoded Form Data
// =============================================================================

/**
 * Converts a typed payload object to a URL-encoded form data string suitable
 * for `jenkinsStaplerPost()`.
 *
 * Replaces the jQuery form serialization (`jenkins.buildFormPost($form)`) used by
 * the source's `jenkins.staplerPost()`. Only non-undefined values are included
 * in the output string to match the behavior of jQuery's `$form.serialize()`.
 *
 * @param payload - Object with string values to serialize into form data
 * @returns URL-encoded form data string (e.g., "server=proxy.example.com&port=8080")
 */
function toUrlEncodedFormData(
  payload: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params.toString();
}

// =============================================================================
// Mutation Hook: useSaveFirstUser
// =============================================================================

/**
 * React Query mutation hook for creating the first admin user during setup wizard.
 *
 * Replaces `saveFirstUser($form, success, error)` from source `securityConfig.js`
 * lines 11-26.
 *
 * Endpoint: `POST /setupWizard/createAdminUser`
 *
 * Behavior:
 * - Accepts a typed `SaveFirstUserPayload` with username, password1, password2,
 *   fullname, and email fields
 * - Posts the payload as JSON to the Stapler endpoint via `jenkinsPost()`, which
 *   handles CSRF crumb injection into both the HTTP header and JSON body
 * - On success, refreshes the global CSRF crumb if the response includes new crumb
 *   data (source lines 16-18: `getWindow().crumb.init(crumbRequestField, response.data.crumb)`)
 * - React Query automatically manages loading (`isPending`), error (`isError`, `error`),
 *   and success (`isSuccess`, `data`) states — replacing the source's callback pattern
 *
 * @returns React Query mutation result with `mutate()`, `mutateAsync()`, `isPending`,
 *          `isError`, `error`, `data`, `isSuccess`
 *
 * @example
 * ```tsx
 * const { mutate, isPending, isError, error } = useSaveFirstUser();
 *
 * function handleSubmit() {
 *   mutate({
 *     username: "admin",
 *     password1: "secretPassword",
 *     password2: "secretPassword",
 *     fullname: "Jenkins Admin",
 *     email: "admin@example.com",
 *   });
 * }
 * ```
 */
export function useSaveFirstUser() {
  return useMutation<
    StaplerResponse<CrumbRefreshResponse>,
    Error,
    SaveFirstUserPayload
  >({
    mutationFn: async (
      payload: SaveFirstUserPayload,
    ): Promise<StaplerResponse<CrumbRefreshResponse>> => {
      return jenkinsPost<StaplerResponse<CrumbRefreshResponse>>(
        "/setupWizard/createAdminUser",
        payload,
      );
    },
    onSuccess: (response: StaplerResponse<CrumbRefreshResponse>): void => {
      // Replicate source lines 16-18: refresh CSRF crumb after user creation
      refreshCrumb(response.data);
    },
  });
}

// =============================================================================
// Mutation Hook: useSaveConfigureInstance
// =============================================================================

/**
 * React Query mutation hook for configuring the Jenkins instance URL during setup wizard.
 *
 * Replaces `saveConfigureInstance($form, success, error)` from source `securityConfig.js`
 * lines 28-42.
 *
 * Endpoint: `POST /setupWizard/configureInstance`
 *
 * Behavior:
 * - Accepts a typed `SaveConfigureInstancePayload` with the Jenkins root URL
 * - Posts the payload as JSON to the Stapler endpoint via `jenkinsPost()`, which
 *   handles CSRF crumb injection into both the HTTP header and JSON body
 * - On success, refreshes the global CSRF crumb if the response includes new crumb
 *   data (source lines 32-34: `getWindow().crumb.init(crumbRequestField, response.data.crumb)`)
 * - Same crumb refresh pattern as `useSaveFirstUser` — extracted into shared
 *   `refreshCrumb()` helper function
 *
 * @returns React Query mutation result with `mutate()`, `mutateAsync()`, `isPending`,
 *          `isError`, `error`, `data`, `isSuccess`
 *
 * @example
 * ```tsx
 * const { mutate, isPending, isSuccess } = useSaveConfigureInstance();
 *
 * function handleSaveUrl() {
 *   mutate({ rootUrl: "http://localhost:8080/" });
 * }
 * ```
 */
export function useSaveConfigureInstance() {
  return useMutation<
    StaplerResponse<CrumbRefreshResponse>,
    Error,
    SaveConfigureInstancePayload
  >({
    mutationFn: async (
      payload: SaveConfigureInstancePayload,
    ): Promise<StaplerResponse<CrumbRefreshResponse>> => {
      return jenkinsPost<StaplerResponse<CrumbRefreshResponse>>(
        "/setupWizard/configureInstance",
        payload,
      );
    },
    onSuccess: (response: StaplerResponse<CrumbRefreshResponse>): void => {
      // Replicate source lines 32-34: refresh CSRF crumb after instance configuration
      refreshCrumb(response.data);
    },
  });
}

// =============================================================================
// Mutation Hook: useSaveProxy
// =============================================================================

/**
 * React Query mutation hook for configuring proxy settings.
 *
 * Replaces `saveProxy($form, success, error)` from source `securityConfig.js`
 * lines 48-53.
 *
 * Endpoint: `POST /pluginManager/proxyConfigure`
 *
 * Behavior:
 * - Accepts a typed `SaveProxyPayload` with proxy server, port, credentials,
 *   and exclusion list
 * - Converts the payload to URL-encoded form data and posts via `jenkinsStaplerPost()`,
 *   which handles CSRF crumb injection into both the HTTP header and form body
 * - IMPORTANT: The response is HTML (not JSON), per source line 50: `dataType: "html"`.
 *   The `responseType: "text"` option instructs the client to return the raw HTML
 *   string instead of attempting JSON parsing.
 * - Does NOT refresh the CSRF crumb — the source's `saveProxy` passes `success`
 *   directly without the crumb refresh wrapper (source line 49)
 *
 * @returns React Query mutation result where `data` is the HTML response string.
 *          Exposes `mutate()`, `mutateAsync()`, `isPending`, `isError`, `error`,
 *          `data`, `isSuccess`.
 *
 * @example
 * ```tsx
 * const { mutate, isPending, isError, data } = useSaveProxy();
 *
 * function handleSaveProxy() {
 *   mutate({
 *     server: "proxy.example.com",
 *     port: "8080",
 *     userName: "proxyUser",
 *     password: "proxyPass",
 *     noProxyFor: "localhost,127.0.0.1",
 *   });
 * }
 *
 * // `data` contains the HTML response string when `isSuccess` is true
 * ```
 */
export function useSaveProxy() {
  return useMutation<string, Error, SaveProxyPayload>({
    mutationFn: async (payload: SaveProxyPayload): Promise<string> => {
      // Convert typed payload to URL-encoded form data string,
      // replicating the jQuery form serialization from the source
      const formData = toUrlEncodedFormData(
        payload as Record<string, string | undefined>,
      );
      // Use jenkinsStaplerPost with responseType "text" to receive the HTML
      // response body (source line 50: dataType: "html")
      return jenkinsStaplerPost<string>(
        "/pluginManager/proxyConfigure",
        formData,
        { responseType: "text" },
      );
    },
    // NOTE: No onSuccess crumb refresh — saveProxy does not rotate crumbs
    // (source line 49 passes success callback directly without crumb handling)
  });
}
