/**
 * Consolidated API Type Exports
 *
 * Provides TypeScript interfaces for all API request/response shapes used by the
 * `src/main/tsx/api/` modules (`client.ts`, `pluginManager.ts`, `search.ts`, `security.ts`).
 *
 * Types defined here represent the exact shapes consumed and produced by Stapler REST
 * endpoints as observed in the original JavaScript source files:
 * - `src/main/js/api/pluginManager.js`
 * - `src/main/js/api/search.js`
 * - `src/main/js/api/securityConfig.js`
 * - `src/main/js/util/jenkins.js`
 *
 * This file is the SINGLE source of API-specific types — API modules import from here.
 * Broader Stapler types reside in `types/stapler.d.ts`; domain model types in `types/models.ts`.
 */

// =============================================================================
// Generic Stapler Response Envelope
// =============================================================================

/**
 * Generic envelope for all Stapler JSON responses.
 *
 * Derived from the consistent `response.status !== "ok"` guard pattern observed in
 * `pluginManager.js` (lines 15, 103, 132, 159, 179, 208) and `jenkins.js` (line 105).
 *
 * All Stapler REST endpoints that return JSON wrap their payload in this structure.
 *
 * @typeParam T - The type of the `data` payload. Defaults to `unknown` for untyped usage.
 */
export interface StaplerResponse<T = unknown> {
  /** Response status — `"ok"` indicates success; any other string indicates an error condition. */
  status: "ok" | string;
  /** The response payload whose shape varies per endpoint. */
  data: T;
  /** Optional error or informational message provided when `status !== "ok"`. */
  message?: string;
}

// =============================================================================
// Plugin Manager Types
// =============================================================================

/**
 * Represents a dependency of a plugin.
 *
 * Part of the `PluginInfo.dependencies` array.
 */
export interface PluginDependency {
  /** The short name identifier of the dependency plugin. */
  name: string;
  /** The minimum required version of the dependency. */
  version: string;
  /** Whether this dependency is optional. */
  optional: boolean;
}

/**
 * Represents the installation status of a plugin already present on the Jenkins instance.
 *
 * Used as the value of `PluginInfo.installed` when a plugin is installed.
 */
export interface PluginInstallInfo {
  /** Whether the installed plugin is currently active (enabled). */
  active: boolean;
  /** The currently installed version string. */
  version: string;
}

/**
 * Represents an individual plugin object from the update center or platform plugin list.
 *
 * Source: `pluginManager.js` lines 42-46 (`plugin.name`, `plugin.suggested`),
 * lines 149-153 comment (`name, title, excerpt, dependencies[], ...`).
 */
export interface PluginInfo {
  /** The short name identifier of the plugin (e.g., `"git"`, `"pipeline-stage-view"`). */
  name: string;
  /** The human-readable display title. */
  title: string;
  /** A brief description or excerpt of the plugin's functionality. */
  excerpt: string;
  /** The latest available version string. */
  version: string;
  /** Whether the plugin is suggested/recommended for the initial setup. */
  suggested: boolean;
  /** List of plugin dependencies required by this plugin. */
  dependencies: PluginDependency[];
  /** Optional URL to the plugin's page or download. */
  url?: string;
  /** Optional URL to the plugin's wiki documentation. */
  wiki?: string;
  /** Installation info if the plugin is currently installed, or `null` if not installed. */
  installed?: PluginInstallInfo | null;
  /** The category this plugin belongs to (e.g., `"Languages"`, `"Build Tools"`). */
  category?: string;
  /** Whether this plugin was detached from Jenkins core. */
  detached?: boolean;
}

/**
 * Represents a categorized group of plugins as returned by the platform plugin list endpoint.
 *
 * Source: `pluginManager.js` lines 38-40 where `pluginCategory.plugins` and
 * `pluginCategory.category` are accessed during `initPluginData()`.
 */
export interface PluginCategory {
  /** The category name (e.g., `"Languages"`, `"Build Tools"`, `"Pipelines and Continuous Delivery"`). */
  category: string;
  /** The list of plugins belonging to this category. */
  plugins: PluginInfo[];
  /** Optional human-readable description of the category. */
  description?: string;
}

/**
 * POST body for the `/pluginManager/installPlugins` endpoint.
 *
 * Source: `pluginManager.js` line 101: `{ dynamicLoad: true, plugins: plugins }`.
 */
export interface InstallPluginsRequest {
  /** Whether plugins should be dynamically loaded without requiring a restart. */
  dynamicLoad: boolean;
  /** Array of plugin short names to install. */
  plugins: string[];
}

/**
 * Response data from a successful plugin installation request.
 *
 * Source: `pluginManager.js` line 108: `response.data.correlationId`.
 */
export interface InstallPluginsResponse {
  /** Correlation ID used to track the installation progress via `installStatus`. */
  correlationId: string;
}

/**
 * Represents the install status of an individual plugin during an installation operation.
 *
 * Returned as entries within `InstallStatusData.jobs`.
 */
export interface PluginInstallStatusEntry {
  /** The short name identifier of the plugin. */
  name: string;
  /** The human-readable display title. */
  title: string;
  /**
   * Current installation status of this plugin.
   * Known values include `"pending"`, `"installing"`, `"success"`, and `"fail"`.
   */
  installStatus: "pending" | "installing" | "success" | "fail" | string;
  /** Whether this plugin requires a Jenkins restart to complete activation. */
  requiresRestart?: boolean;
  /** The version being installed. */
  version?: string;
  /** Error message if `installStatus` is `"fail"`. */
  errorMessage?: string;
}

/**
 * Response data for the `/updateCenter/installStatus` and
 * `/updateCenter/incompleteInstallStatus` endpoints.
 *
 * Source: `pluginManager.js` lines 131-137 and 207-213 where `response.data` is
 * passed to the handler containing the list of plugin installation jobs.
 */
export interface InstallStatusData {
  /** Array of individual plugin installation status entries. */
  jobs: PluginInstallStatusEntry[];
  /** Overall installation state, if reported by the update center. */
  state?: string;
}

/**
 * Response data for the `/setupWizard/restartStatus` endpoint.
 *
 * Source: `pluginManager.js` lines 246-258 where `response.data` is passed
 * to the handler for restart status checking.
 */
export interface RestartStatusData {
  /** Whether a restart is required to complete pending plugin installations. */
  restartRequired: boolean;
  /** Whether the Jenkins instance supports programmatic restarts. */
  restartSupported: boolean;
}

/**
 * Response data from the `/pluginManager/pluginsSearch` endpoint.
 *
 * Source: `pluginManager.js` lines 175-192 where `response.data` is returned
 * from `availablePluginsSearch()`.
 */
export interface PluginSearchResult {
  /** Array of plugins matching the search query. */
  plugins: PluginInfo[];
  /** Total number of matching plugins (may differ from `plugins.length` when paginated). */
  total?: number;
}

/**
 * The initialized plugin data structure returned by `initPluginData()`.
 *
 * Source: `pluginManager.js` lines 34-37 where `plugins.names`,
 * `plugins.recommendedPlugins`, and `plugins.availablePlugins` are populated.
 */
export interface PluginData {
  /** Flat array of all unique plugin short names across all categories. */
  names: string[];
  /** Subset of `names` that are recommended by default (user can modify selection). */
  recommendedPlugins: string[];
  /** The full categorized plugin list from the platform plugin list endpoint. */
  availablePlugins: PluginCategory[];
}

// =============================================================================
// Search Types
// =============================================================================

/**
 * Represents a single search suggestion returned by the Jenkins search endpoint.
 *
 * Source: `search.js` lines 4-6 where the search endpoint returns suggestions.
 */
export interface SearchSuggestion {
  /** The display name of the search suggestion. */
  name: string;
  /** Optional URL to navigate to when this suggestion is selected. */
  url?: string;
}

/**
 * Response structure from the Jenkins search endpoint.
 *
 * The search URL is resolved from `document.body.dataset.searchUrl`.
 */
export interface SearchResult {
  /** Array of matching search suggestions. */
  suggestions: SearchSuggestion[];
}

// =============================================================================
// Security Configuration Types
// =============================================================================

/**
 * Crumb data returned in security configuration responses after mutations.
 *
 * Source: `securityConfig.js` lines 16-18 where `response.data.crumbRequestField`
 * and `response.data.crumb` are extracted to reinitialize the CSRF crumb.
 */
export interface CrumbRefreshResponse {
  /** The HTTP header or form field name used to submit the crumb token. */
  crumbRequestField?: string;
  /** The crumb token value. */
  crumb?: string;
}

/**
 * Payload for the `/setupWizard/createAdminUser` endpoint — first admin user creation.
 *
 * Source: `securityConfig.js` line 11 where `saveFirstUser($form, ...)` submits
 * user registration data as a Stapler form post.
 */
export interface SaveFirstUserPayload {
  /** The admin username to create. */
  username: string;
  /** The primary password field. */
  password1: string;
  /** The password confirmation field. */
  password2?: string;
  /** The full display name of the admin user. */
  fullname: string;
  /** The email address of the admin user. */
  email: string;
}

/**
 * Payload for the `/setupWizard/configureInstance` endpoint — Jenkins instance URL configuration.
 *
 * Source: `securityConfig.js` line 28 where `saveConfigureInstance($form, ...)` submits
 * the Jenkins root URL.
 */
export interface SaveConfigureInstancePayload {
  /** The root URL of the Jenkins instance (e.g., `"http://localhost:8080/"`). */
  rootUrl: string;
}

/**
 * Payload for the `/pluginManager/proxyConfigure` endpoint — proxy settings.
 *
 * Source: `securityConfig.js` line 49 where `saveProxy($form, ...)` submits
 * proxy configuration with `dataType: "html"` response.
 */
export interface SaveProxyPayload {
  /** The proxy server hostname or IP. */
  server?: string;
  /** The proxy server port. */
  port?: string;
  /** The proxy authentication username. */
  userName?: string;
  /** The proxy authentication password. */
  password?: string;
  /** Comma-separated list of hosts that should bypass the proxy. */
  noProxyFor?: string;
}

// =============================================================================
// Connectivity Types
// =============================================================================

/**
 * Response data for the `/updateCenter/connectionStatus` endpoint.
 *
 * Source: `jenkins.js` lines 147-161 where `response.data.updatesite` and
 * `response.data.internet` are checked against known status values.
 */
export interface ConnectionStatusData {
  /**
   * Update site connectivity status.
   * - `"OK"` — update site is reachable
   * - `"PRECHECK"` / `"CHECKING"` / `"UNCHECKED"` — check is in progress or pending
   */
  updatesite: "OK" | "PRECHECK" | "CHECKING" | "UNCHECKED" | string;
  /**
   * Internet connectivity status.
   * - `"OK"` — internet is reachable
   * - `"SKIPPED"` — internet check was explicitly skipped by the update center
   * - `"PRECHECK"` / `"CHECKING"` / `"UNCHECKED"` — check is in progress or pending
   */
  internet: "OK" | "SKIPPED" | "PRECHECK" | "CHECKING" | "UNCHECKED" | string;
}

// =============================================================================
// Crumb Issuer Types
// =============================================================================

/**
 * Represents the CSRF crumb object as stored on `window.crumb`.
 *
 * Source: `jenkins.js` lines 57-64 where `crumb.fieldName` is used as the header name
 * and `crumb.value` is used as the header value for POST requests.
 */
export interface CrumbData {
  /** The HTTP header or form field name for the crumb (e.g., `"Jenkins-Crumb"`). */
  fieldName: string;
  /** The crumb token value. */
  value: string;
}

/**
 * Response from the `/crumbIssuer/api/json` endpoint.
 *
 * Used to fetch or refresh the CSRF crumb token.
 */
export interface CrumbIssuerResponse {
  /** The crumb token value. */
  crumb: string;
  /** The HTTP header or form field name for the crumb. */
  crumbRequestField: string;
}

// =============================================================================
// Request Options Type
// =============================================================================

/**
 * Options for the base HTTP client used by API modules.
 *
 * Provides configuration for individual API requests beyond the default settings.
 */
export interface RequestOptions {
  /** Request timeout in milliseconds. Defaults to the client's global timeout. */
  timeout?: number;
  /** Additional HTTP headers to include in the request. */
  headers?: Record<string, string>;
  /** Expected response content type. Defaults to `"json"`. */
  responseType?: "json" | "text";
}
