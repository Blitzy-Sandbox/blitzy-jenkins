/**
 * Stapler REST Response Type Definitions
 *
 * TypeScript interfaces for ALL Stapler API response shapes consumed by the
 * Jenkins React frontend. These types replace the untyped responses previously
 * consumed via jQuery AJAX in the legacy JavaScript API layer.
 *
 * Consumed by:
 *   - src/main/tsx/api/ (client, pluginManager, search, security)
 *   - src/main/tsx/hooks/ (useStaplerQuery, useStaplerMutation, useCrumb)
 *
 * Derivation sources:
 *   - src/main/js/api/pluginManager.js — Plugin install/status/search patterns
 *   - src/main/js/api/search.js — Search endpoint integration
 *   - src/main/js/api/securityConfig.js — Setup wizard user/instance config
 *   - src/main/js/util/jenkins.js — Core utility (loadTranslations, testConnectivity)
 */

// =============================================================================
// Phase 1: Base Stapler Response Types
// =============================================================================

/**
 * Generic envelope for all Stapler JSON API responses.
 *
 * Every Stapler REST endpoint returns a response with this shape. The `status`
 * field is checked against the string `"ok"` to determine success or failure.
 *
 * Derived from the consistent `response.status !== "ok"` guard pattern found
 * in pluginManager.js (lines 15–16, 103–104, 131–132, 159–160, 179–180,
 * 209–210) and jenkins.js `loadTranslations` (line 105).
 *
 * @typeParam T - The shape of the `data` payload for a successful response.
 */
export interface StaplerResponse<T> {
  /** Response status indicator — `"ok"` on success, other values on failure. */
  status: "ok" | string;

  /** The typed payload of the response. */
  data: T;

  /** Optional human-readable message, typically present on error responses. */
  message?: string;
}

/**
 * Error context object passed as `this` to callback handlers in the legacy
 * jQuery-based API layer.
 *
 * Derived from the `handler.call({ isError: true, errorMessage: errorThrown })`
 * pattern used throughout pluginManager.js (lines 16, 25, 104, 113, 133, 142,
 * 161, 170, 180, 189, 209, 218, 237, 255, 274, 293).
 *
 * In the React layer, this type is used by error boundary utilities and
 * migration shim code that preserves the callback contract.
 */
export interface StaplerErrorContext {
  /** Whether this context represents an error condition. */
  isError: boolean;

  /**
   * The error message string from the failed HTTP request.
   * Corresponds to jQuery's `errorThrown` parameter.
   */
  errorMessage?: string;

  /**
   * Alternative message field used in some endpoints.
   * Seen in completeInstall (line 237) and installPluginsDone (line 274).
   */
  message?: string;

  /**
   * Optional response data that may accompany an error.
   * Seen in initialPluginList (line 16): `{ isError: true, data: response.data }`.
   */
  data?: unknown;
}

// =============================================================================
// Phase 2: Crumb Issuer Types
// =============================================================================

/**
 * Response from `GET /crumbIssuer/api/json`.
 *
 * The CSRF crumb is fetched at application startup and injected into all
 * subsequent POST requests. The `crumbRequestField` identifies the HTTP
 * header name (typically `"Jenkins-Crumb"`) and `crumb` holds the token value.
 *
 * Derived from:
 *   - securityConfig.js lines 16–18: `response.data.crumbRequestField` and
 *     `response.data.crumb` accessed after `saveFirstUser`/`saveConfigureInstance`.
 *   - jenkins.js lines 57–65: `crumb.fieldName` and `crumb.value` usage in POST
 *     request crumb injection logic.
 */
export interface CrumbIssuerResponse {
  /** The CSRF token value to be sent with each mutating request. */
  crumb: string;

  /** The HTTP header field name for transmitting the crumb (e.g., `"Jenkins-Crumb"`). */
  crumbRequestField: string;
}

// =============================================================================
// Phase 3: Plugin Manager API Types
// =============================================================================

/**
 * Represents the installation status of a plugin during the setup wizard or
 * plugin manager install flow.
 *
 * The four states correspond to the lifecycle of a single plugin installation:
 *   - `"pending"` — Queued but not yet started
 *   - `"installing"` — Download/install in progress
 *   - `"success"` — Installation completed successfully
 *   - `"fail"` — Installation failed
 */
export type PluginInstallStatus = "pending" | "installing" | "success" | "fail";

/**
 * Represents a single plugin dependency with its name, required version,
 * and whether it is optional.
 *
 * Derived from the `dependencies[]` array within `PluginInfo` objects
 * returned by `/setupWizard/platformPluginList` and `/pluginManager/plugins`.
 */
export interface PluginDependency {
  /** The short name identifier of the dependency plugin. */
  name: string;

  /** The minimum required version of the dependency. */
  version: string;

  /** Whether this dependency is optional (`true`) or required (`false`). */
  optional: boolean;
}

/**
 * Represents an individual plugin object as returned by Stapler plugin endpoints.
 *
 * Derived from:
 *   - pluginManager.js lines 42–46: `plugin.name`, `plugin.suggested` access
 *   - pluginManager.js lines 149–153: documented shape
 *     `{ name, title, excerpt, dependencies[], ... }`
 *   - The `/setupWizard/platformPluginList` and `/pluginManager/plugins` endpoints
 */
export interface PluginInfo {
  /** The unique short name identifier of the plugin (e.g., `"git"`, `"pipeline-model-definition"`). */
  name: string;

  /** The human-readable display title of the plugin. */
  title: string;

  /** A brief description/excerpt of the plugin's functionality. */
  excerpt: string;

  /** The version string of the plugin (e.g., `"5.7.0"`). */
  version: string;

  /**
   * Whether this plugin is suggested/recommended for installation.
   * Used in the setup wizard to pre-select recommended plugins.
   * Derived from pluginManager.js line 46: `if (plugin.suggested)`.
   */
  suggested: boolean;

  /** Array of plugin dependencies required by this plugin. */
  dependencies: PluginDependency[];

  /** Optional URL for the plugin's homepage or update center page. */
  url?: string;

  /** Optional URL for the plugin's wiki/documentation page. */
  wiki?: string;

  /**
   * The current installation status of the plugin, if it is being installed.
   * Present when tracking installation progress; absent for plugins not
   * currently in an install flow.
   */
  installed?: PluginInstallStatus;
}

/**
 * Represents a category of plugins as returned by `/setupWizard/platformPluginList`.
 *
 * The platform plugin list is organized as an array of categories, each
 * containing a group of related plugins. This structure is used by the setup
 * wizard to present plugins by functional category.
 *
 * Derived from pluginManager.js lines 38–40:
 *   `pluginCategory.category` (string) and `pluginCategory.plugins` (array).
 */
export interface PluginCategory {
  /** The display name of the plugin category (e.g., `"Languages"`, `"Build Tools"`). */
  category: string;

  /** The list of plugins belonging to this category. */
  plugins: PluginInfo[];
}

/**
 * Tracks the installation status of a single plugin during an active
 * install operation.
 *
 * Used within the `InstallStatusResponse.jobs` array to report per-plugin
 * progress during the setup wizard or plugin manager installation flow.
 */
export interface PluginInstallStatusEntry {
  /** The short name identifier of the plugin being installed. */
  name: string;

  /** The human-readable title of the plugin. */
  title: string;

  /** Current installation status of this plugin. */
  installStatus: PluginInstallStatus;

  /** Whether the plugin requires a Jenkins restart to activate. */
  requiresRestart?: boolean;

  /** The version being installed. */
  version?: string;
}

/**
 * Response from `POST /pluginManager/installPlugins`.
 *
 * Returns a correlation ID that can be used to track the installation
 * progress of the batch of requested plugins.
 *
 * Derived from pluginManager.js line 108:
 *   `handler.call({ isError: false }, response.data.correlationId)`.
 */
export interface InstallPluginsResponse {
  /** Unique identifier for tracking this batch installation. */
  correlationId: string;
}

/**
 * Response from `GET /updateCenter/installStatus`.
 *
 * Returns an array of per-plugin installation status entries (`jobs`)
 * representing the current progress of all plugins being installed.
 *
 * Optionally filtered by `correlationId` query parameter from a prior
 * `installPlugins` call (see pluginManager.js lines 124–128).
 */
export interface InstallStatusResponse {
  /** Array of individual plugin installation status entries. */
  jobs: PluginInstallStatusEntry[];
}

/**
 * Response from `GET /pluginManager/pluginsSearch?query=...&limit=...`.
 *
 * Returns a paginated list of plugins matching the search query, used by the
 * plugin manager's search functionality.
 *
 * Derived from pluginManager.js `availablePluginsSearch` (lines 175–192).
 */
export interface PluginSearchResult {
  /** Array of plugin objects matching the search query. */
  plugins: PluginInfo[];

  /** Total number of matching plugins (for pagination). */
  total?: number;
}

// =============================================================================
// Phase 4: Connectivity / Update Center Types
// =============================================================================

/**
 * Response from `GET /updateCenter/connectionStatus?siteId=...`.
 *
 * Reports the connectivity status of the Jenkins instance to the update site
 * and the public internet. Used by the setup wizard to verify that plugin
 * installation can proceed.
 *
 * Derived from jenkins.js lines 147–161 where `response.data.updatesite` and
 * `response.data.internet` are compared against known status strings:
 *   - `"OK"` — Connection is healthy
 *   - `"SKIPPED"` — Connection check was skipped (e.g., air-gapped)
 *   - `"PRECHECK"` — Pre-check phase in progress
 *   - `"CHECKING"` — Connectivity check is actively running
 *   - `"UNCHECKED"` — Check has not yet been initiated
 */
export interface ConnectionStatusResponse {
  /**
   * Connectivity status to the configured Jenkins update site.
   * Must be `"OK"` for plugin installation to be considered operational.
   */
  updatesite: "OK" | "PRECHECK" | "CHECKING" | "UNCHECKED" | string;

  /**
   * Connectivity status to the public internet.
   * `"SKIPPED"` is an acceptable terminal state for air-gapped installations.
   */
  internet: "OK" | "SKIPPED" | "PRECHECK" | "CHECKING" | "UNCHECKED" | string;
}

/**
 * Response from `GET /setupWizard/restartStatus`.
 *
 * Reports whether a Jenkins restart is required (e.g., after plugin
 * installation) and whether the server supports safe restart.
 *
 * Derived from pluginManager.js `getRestartStatus` (lines 246–259)
 * where `response.data` is passed to the handler.
 */
export interface RestartStatusResponse {
  /** Whether a restart is needed to activate installed plugins. */
  restartRequired: boolean;

  /** Whether the Jenkins instance supports the safe restart operation. */
  restartSupported: boolean;
}

// =============================================================================
// Phase 5: Search API Types
// =============================================================================

/**
 * A single search suggestion item returned by the Jenkins search endpoint.
 *
 * Derived from the search endpoint accessed via
 * `document.body.dataset.searchUrl` in search.js (line 5).
 */
export interface SearchSuggestion {
  /** The display name of the search suggestion item. */
  name: string;

  /** Optional URL to navigate to for this suggestion. */
  url?: string;
}

/**
 * Response from the Jenkins search endpoint (`GET {searchUrl}?query=...`).
 *
 * Returns an array of search suggestion items for the global search bar
 * and command palette components.
 *
 * Derived from search.js which returns a raw fetch response — the underlying
 * JSON response contains a `suggestions` array.
 */
export interface SearchResult {
  /** Array of search suggestion items matching the query. */
  suggestions: SearchSuggestion[];
}

// =============================================================================
// Phase 6: Security / Setup Wizard API Types
// =============================================================================

/**
 * Response from `POST /setupWizard/createAdminUser`.
 *
 * After successfully creating the first admin user, the server may return
 * updated CSRF crumb data that the client must use for subsequent requests.
 *
 * Derived from securityConfig.js lines 16–18:
 *   `response.data.crumbRequestField` and `response.data.crumb`.
 */
export interface SaveFirstUserResponse {
  /** Updated CSRF crumb header field name, if crumb rotation occurred. */
  crumbRequestField?: string;

  /** Updated CSRF crumb token value, if crumb rotation occurred. */
  crumb?: string;
}

/**
 * Response from `POST /setupWizard/configureInstance`.
 *
 * After saving the Jenkins URL configuration, the server may return
 * updated CSRF crumb data that the client must use for subsequent requests.
 *
 * Derived from securityConfig.js lines 32–34:
 *   `response.data.crumbRequestField` and `response.data.crumb`.
 */
export interface SaveConfigureInstanceResponse {
  /** Updated CSRF crumb header field name, if crumb rotation occurred. */
  crumbRequestField?: string;

  /** Updated CSRF crumb token value, if crumb rotation occurred. */
  crumb?: string;
}

// =============================================================================
// Phase 7: Resource Bundle / i18n Types
// =============================================================================

/**
 * Response from `GET /i18n/resourceBundle?baseName=...`.
 *
 * Returns a localization resource bundle as key-value string pairs wrapped
 * in the standard Stapler response envelope. The `data` field is a flat
 * object mapping translation keys to their localized string values.
 *
 * Derived from jenkins.js lines 103–130 where `loadTranslations` fetches
 * the resource bundle endpoint and accesses `res.data` as key-value pairs
 * wrapped in a `Proxy` for fallback to the key name on missing translations.
 *
 * Note: This type does NOT use `StaplerResponse<T>` because the response
 * `data` field has a concrete type (`Record<string, string>`) and the full
 * response shape is self-documented here for clarity.
 */
export interface ResourceBundleResponse {
  /** Response status indicator — `"ok"` on success. */
  status: "ok" | string;

  /** Key-value map of localization strings (translation key → localized text). */
  data: Record<string, string>;

  /** Optional error message if the resource bundle could not be loaded. */
  message?: string;
}
