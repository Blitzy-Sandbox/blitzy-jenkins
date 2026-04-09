/**
 * Base URL Resolution Utility
 *
 * Extracts the Jenkins base URL (context path) from the document head dataset.
 * The `data-rooturl` attribute is rendered server-side by the Jelly `<l:layout>` tag
 * on every Jenkins page, providing the servlet context path (e.g. "/jenkins" or "").
 *
 * This is a standalone utility with no framework dependencies. It can be used in
 * any JavaScript/TypeScript context — React components, plain scripts, API clients,
 * or test utilities.
 *
 * For React components rendered inside the provider tree, prefer the
 * `useJenkinsConfig()` hook from `JenkinsConfigProvider` which provides the same
 * value via React Context with additional configuration.
 *
 * @module utils/baseUrl
 */

/**
 * Resolves the Jenkins base URL (context path) from the document head dataset.
 *
 * Reads the `data-rooturl` attribute set by the Jelly `<l:layout>` tag on every
 * Jenkins page. This is the same data source used by the legacy `jenkins.baseUrl()`
 * function in `src/main/js/util/jenkins.js`.
 *
 * The function is a pure DOM read with no side effects — it does not mutate state,
 * write to the DOM, or produce logging output.
 *
 * @returns The Jenkins base URL string (e.g. `"/jenkins"` or `""`), never `undefined`.
 *          Returns an empty string when `data-rooturl` is not present on the
 *          `<head>` element, which safely handles SSR, test environments, or pages
 *          rendered outside the Jenkins layout shell.
 *
 * @example
 * ```ts
 * import { getBaseUrl } from "@/utils/baseUrl";
 *
 * const apiUrl = `${getBaseUrl()}/api/json`;
 * // => "/jenkins/api/json" (when context path is "/jenkins")
 * // => "/api/json"         (when running at root context)
 * ```
 */
export function getBaseUrl(): string {
  return document.head.dataset.rooturl ?? "";
}
