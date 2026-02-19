/**
 * Base HTTP Client with CSRF Crumb Handling
 *
 * This module provides the foundational HTTP communication layer for all Stapler
 * REST API interactions in the Jenkins React frontend. It is a fetch-based,
 * TypeScript-generic replacement for the jQuery AJAX functions previously found
 * in `src/main/js/util/jenkins.js` (lines 27–254).
 *
 * Key responsibilities:
 * - Base URL resolution from `document.head.dataset.rooturl` (set by Jelly `<l:layout>`)
 * - CSRF crumb retrieval from `window.crumb` (the global crumb object)
 * - GET requests with cache-busting (replacing `jenkins.get()`)
 * - POST requests with CSRF crumb dual injection — header AND JSON body (replacing `jenkins.post()`)
 * - Stapler form POST with `application/x-www-form-urlencoded` (replacing `jenkins.staplerPost()`)
 * - Typed error handling via `ApiError` class (replacing jQuery error callbacks)
 *
 * All functions use native `fetch()` — no jQuery, no axios, no external HTTP libraries.
 * Timeout support is implemented via `AbortController` (replacing jQuery `timeout` option).
 *
 * Source reference: src/main/js/util/jenkins.js (256 lines)
 * Ambient types from: src/main/tsx/types/jenkins.d.ts (window.crumb, document.head.dataset)
 *
 * @module api/client
 */

import type { RequestOptions, CrumbData } from "./types";

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Custom error class for HTTP API failures.
 *
 * Replaces the jQuery `(xhr, textStatus, errorThrown)` error callback pattern
 * with a structured, throwable error that integrates with React Query's error
 * handling and TypeScript's type narrowing.
 *
 * @example
 * ```typescript
 * try {
 *   await jenkinsGet<MyData>("/api/json");
 * } catch (error) {
 *   if (error instanceof ApiError) {
 *     console.error(`HTTP ${error.status}: ${error.statusText}`);
 *   }
 * }
 * ```
 */
export class ApiError extends Error {
  /** HTTP status code of the failed response (e.g., 403, 404, 500). */
  public readonly status: number;

  /** HTTP status text of the failed response (e.g., "Forbidden", "Not Found"). */
  public readonly statusText: string;

  constructor(message: string, status: number, statusText: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
  }
}

// =============================================================================
// Base URL Resolution
// =============================================================================

/**
 * Reads the Jenkins base URL from `document.head.dataset.rooturl`.
 *
 * This attribute is set by the Jelly `<l:layout>` tag on every Jenkins page and
 * represents the context path under which Jenkins is deployed (e.g., `"/jenkins"`
 * for a context-path deployment, or `""` for root deployment).
 *
 * All API request URLs are prefixed with this base URL to construct absolute paths.
 *
 * Source: `jenkins.js` lines 12–14 — `jenkins.baseUrl = function() { return document.head.dataset.rooturl; }`
 *
 * @returns The Jenkins base URL string, or an empty string if the attribute is not set.
 */
export function getBaseUrl(): string {
  return document.head.dataset.rooturl ?? "";
}

// =============================================================================
// CSRF Crumb Resolution
// =============================================================================

/**
 * Reads the current CSRF crumb from the global `window.crumb` object.
 *
 * The crumb object is initialized by the Jenkins layout template on page load
 * and contains the field name (typically `"Jenkins-Crumb"`) and the token value
 * used to authenticate POST requests against Stapler endpoints.
 *
 * Source: `jenkins.js` lines 56–64 — crumb resolution from `window.crumb`
 *
 * @returns The crumb data with `fieldName` and `value`, or `null` if no crumb
 *          is available (e.g., CSRF protection is disabled or page is not fully loaded).
 */
export function getCrumb(): CrumbData | null {
  const crumb = window.crumb;
  if (
    crumb &&
    typeof crumb.fieldName === "string" &&
    crumb.fieldName.length > 0 &&
    typeof crumb.value === "string" &&
    crumb.value.length > 0
  ) {
    return { fieldName: crumb.fieldName, value: crumb.value };
  }
  return null;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Creates an `AbortController` with a timeout that automatically aborts the
 * signal after the specified number of milliseconds. Returns the signal for
 * use in `fetch()` options and a cleanup function to clear the timer.
 *
 * @param timeoutMs - Timeout duration in milliseconds
 * @returns An object containing the abort `signal` and a `clear` cleanup function.
 */
function createTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(id),
  };
}

/**
 * Parses the response body based on the specified response type.
 *
 * @param response - The fetch Response object
 * @param responseType - Whether to parse as JSON or text
 * @returns The parsed response body cast to the generic type T
 */
async function parseResponse<T>(
  response: Response,
  responseType: "json" | "text",
): Promise<T> {
  if (responseType === "text") {
    return (await response.text()) as T;
  }
  return (await response.json()) as T;
}

// =============================================================================
// GET Request
// =============================================================================

/**
 * Performs an authenticated GET request against a Jenkins Stapler REST endpoint.
 *
 * Replaces `jenkins.get()` (source lines 27–42) with a native `fetch()` call
 * using TypeScript generics for type-safe responses.
 *
 * Behavior:
 * - Constructs the full URL by prepending `getBaseUrl()` to the provided path
 * - Applies `cache: "no-cache"` to mirror jQuery's `cache: false` behavior
 *   (which adds a `_={timestamp}` cache-busting parameter)
 * - Parses the response as JSON by default (matching jQuery's `dataType: "json"`)
 * - Supports optional timeout via `AbortController` (replacing jQuery `timeout`)
 * - Throws `ApiError` on non-OK HTTP responses
 *
 * @typeParam T - Expected shape of the parsed response body
 * @param url - Request path relative to Jenkins base URL (e.g., "/api/json")
 * @param options - Optional request configuration (timeout, headers, responseType)
 * @returns A promise resolving to the typed response body
 * @throws {ApiError} When the server responds with a non-OK status code
 * @throws {DOMException} When the request is aborted due to timeout (name: "AbortError")
 * @throws {TypeError} When a network error prevents the request from completing
 *
 * @example
 * ```typescript
 * const data = await jenkinsGet<StaplerResponse<JobModel>>("/job/my-job/api/json");
 * ```
 */
export async function jenkinsGet<T>(
  url: string,
  options?: RequestOptions,
): Promise<T> {
  const fullUrl = getBaseUrl() + url;
  const responseType = options?.responseType ?? "json";

  const headers: Record<string, string> = {
    ...(options?.headers),
  };

  const fetchOptions: RequestInit = {
    method: "GET",
    headers,
    cache: "no-cache",
  };

  // Apply timeout via AbortController if specified
  const timeout = options?.timeout
    ? createTimeoutSignal(options.timeout)
    : null;

  if (timeout) {
    fetchOptions.signal = timeout.signal;
  }

  try {
    const response = await fetch(fullUrl, fetchOptions);

    if (!response.ok) {
      throw new ApiError(
        `GET ${url} failed: ${response.status} ${response.statusText}`,
        response.status,
        response.statusText,
      );
    }

    return await parseResponse<T>(response, responseType);
  } finally {
    timeout?.clear();
  }
}

// =============================================================================
// POST Request (JSON)
// =============================================================================

/**
 * Performs an authenticated JSON POST request against a Jenkins Stapler REST endpoint.
 *
 * Replaces `jenkins.post()` (source lines 48–90) with a native `fetch()` call.
 *
 * **CRITICAL — CSRF Crumb Dual Injection** (source lines 53–72):
 * The CSRF crumb is injected in TWO locations for POST requests:
 * 1. **HTTP Header**: `headers[crumb.fieldName] = crumb.value` (source lines 63–65)
 * 2. **JSON Body**: When data is a non-null object, the crumb field is embedded
 *    directly in the serialized JSON body (source lines 69–72):
 *    `formBody[crumb.fieldName] = crumb.value`
 *
 * This dual injection pattern is NON-NEGOTIABLE — it replicates the exact behavior
 * of the original jQuery implementation that Jenkins Stapler expects for CSRF validation.
 *
 * @typeParam T - Expected shape of the parsed response body
 * @param url - Request path relative to Jenkins base URL
 * @param data - Request body data (object → JSON with crumb injection; string → raw body)
 * @param options - Optional request configuration (timeout, headers, responseType)
 * @returns A promise resolving to the typed response body
 * @throws {ApiError} When the server responds with a non-OK status code
 * @throws {DOMException} When the request is aborted due to timeout
 * @throws {TypeError} When a network error prevents the request from completing
 *
 * @example
 * ```typescript
 * const result = await jenkinsPost<StaplerResponse<InstallPluginsResponse>>(
 *   "/pluginManager/installPlugins",
 *   { dynamicLoad: true, plugins: ["git", "pipeline-stage-view"] },
 *   { timeout: 10_000 },
 * );
 * ```
 */
export async function jenkinsPost<T>(
  url: string,
  data: unknown,
  options?: RequestOptions,
): Promise<T> {
  const fullUrl = getBaseUrl() + url;
  const responseType = options?.responseType ?? "json";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers),
  };

  // ---- CSRF Crumb Injection ----
  // Step 1: Retrieve the current CSRF crumb
  const crumb = getCrumb();

  // Step 2: Inject crumb into HTTP headers (source lines 63–65)
  if (crumb) {
    headers[crumb.fieldName] = crumb.value;
  }

  // Step 3: Build the request body with crumb injection into JSON body (source lines 67–74)
  // When data is a non-null, non-array object, the crumb field is embedded in the body.
  // When data is a string, it is sent as-is (crumb only in header, not body).
  // When data is an array or null, it is JSON-serialized without crumb body injection.
  let body: string;
  if (data !== null && data !== undefined && typeof data === "object" && !Array.isArray(data)) {
    // Object data: inject crumb into body (source lines 69–72)
    const bodyData = crumb
      ? { ...(data as Record<string, unknown>), [crumb.fieldName]: crumb.value }
      : { ...(data as Record<string, unknown>) };
    body = JSON.stringify(bodyData);
  } else if (typeof data === "string") {
    // String data: send raw (crumb only in header)
    body = data;
  } else {
    // Array, null, undefined, or primitive: JSON-serialize directly
    body = JSON.stringify(data);
  }

  const fetchOptions: RequestInit = {
    method: "POST",
    headers,
    body,
    cache: "no-cache",
  };

  // Apply timeout via AbortController if specified
  const timeout = options?.timeout
    ? createTimeoutSignal(options.timeout)
    : null;

  if (timeout) {
    fetchOptions.signal = timeout.signal;
  }

  try {
    const response = await fetch(fullUrl, fetchOptions);

    if (!response.ok) {
      throw new ApiError(
        `POST ${url} failed: ${response.status} ${response.statusText}`,
        response.status,
        response.statusText,
      );
    }

    return await parseResponse<T>(response, responseType);
  } finally {
    timeout?.clear();
  }
}

// =============================================================================
// Stapler Form POST (URL-Encoded)
// =============================================================================

/**
 * Performs a Stapler form POST request with `application/x-www-form-urlencoded` content type.
 *
 * Replaces `jenkins.staplerPost()` (source lines 237–254) which serializes a jQuery
 * form via `buildFormPost()` and posts with URL-encoded content type.
 *
 * In the React architecture, callers pass pre-serialized form data (either as a
 * URL-encoded string or a `FormData` object) instead of a jQuery form reference.
 *
 * The CSRF crumb is injected into:
 * - HTTP headers (always, when crumb is available)
 * - The form body (appended to URL-encoded string or set in FormData)
 *
 * @typeParam T - Expected shape of the parsed response body (often `string` for HTML responses)
 * @param url - Request path relative to Jenkins base URL
 * @param formData - Pre-serialized form data as a URL-encoded string or FormData object
 * @param options - Optional request configuration (timeout, headers, responseType)
 * @returns A promise resolving to the typed response body
 * @throws {ApiError} When the server responds with a non-OK status code
 * @throws {DOMException} When the request is aborted due to timeout
 * @throws {TypeError} When a network error prevents the request from completing
 *
 * @example
 * ```typescript
 * // URL-encoded string form data
 * const html = await jenkinsStaplerPost<string>(
 *   "/pluginManager/proxyConfigure",
 *   "server=proxy.example.com&port=8080",
 *   { responseType: "text" },
 * );
 *
 * // FormData object
 * const formData = new FormData(formElement);
 * const result = await jenkinsStaplerPost<StaplerResponse<unknown>>(
 *   "/job/my-job/configSubmit",
 *   formData,
 * );
 * ```
 */
export async function jenkinsStaplerPost<T>(
  url: string,
  formData: FormData | string,
  options?: RequestOptions,
): Promise<T> {
  const fullUrl = getBaseUrl() + url;
  const responseType = options?.responseType ?? "json";

  const headers: Record<string, string> = {
    ...(options?.headers),
  };

  // ---- CSRF Crumb Injection ----
  const crumb = getCrumb();

  // Inject crumb into HTTP headers (source line 249: crumb passed via options)
  if (crumb) {
    headers[crumb.fieldName] = crumb.value;
  }

  // Build the request body with crumb injection
  let body: FormData | string;

  if (formData instanceof FormData) {
    // FormData: inject crumb as a form field
    if (crumb) {
      formData.set(crumb.fieldName, crumb.value);
    }
    body = formData;
    // Do NOT set Content-Type header for FormData — the browser automatically
    // sets it to multipart/form-data with the correct boundary string
  } else {
    // URL-encoded string: set Content-Type and append crumb to the string
    headers["Content-Type"] = "application/x-www-form-urlencoded";

    if (crumb) {
      const crumbParam =
        encodeURIComponent(crumb.fieldName) + "=" + encodeURIComponent(crumb.value);
      body = formData.length > 0 ? formData + "&" + crumbParam : crumbParam;
    } else {
      body = formData;
    }
  }

  const fetchOptions: RequestInit = {
    method: "POST",
    headers,
    body,
    cache: "no-cache",
  };

  // Apply timeout via AbortController if specified
  const timeout = options?.timeout
    ? createTimeoutSignal(options.timeout)
    : null;

  if (timeout) {
    fetchOptions.signal = timeout.signal;
  }

  try {
    const response = await fetch(fullUrl, fetchOptions);

    if (!response.ok) {
      throw new ApiError(
        `POST ${url} failed: ${response.status} ${response.statusText}`,
        response.status,
        response.statusText,
      );
    }

    return await parseResponse<T>(response, responseType);
  } finally {
    timeout?.clear();
  }
}
