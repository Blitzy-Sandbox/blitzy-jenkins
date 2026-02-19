/**
 * Jenkins Global Type Definitions
 *
 * Ambient declaration file providing TypeScript type safety for global objects
 * and DOM augmentations used throughout the Jenkins frontend. This file types:
 *
 * 1. `document.head.dataset` attributes — Set by the Jelly `<l:layout>` tag to
 *    communicate server-side configuration (base URL, CSRF crumbs, resource paths)
 *    to client-side JavaScript.
 *
 * 2. `document.body.dataset` attributes — Set by Jelly views for page-specific
 *    configuration such as the search endpoint URL.
 *
 * 3. `window.crumb` — The global CSRF crumb object used for secure POST requests
 *    to Stapler endpoints. Initialized by the layout template and consumed by all
 *    API communication code.
 *
 * 4. `window.Behaviour` — The global Behaviour class that enables plugin-contributed
 *    JavaScript behaviors to be applied to DOM elements via CSS selector registration.
 *    Required for 2,000+ Jenkins plugin ecosystem compatibility.
 *
 * 5. `window.jQuery` / `window.$` — Global jQuery references preserved for plugin
 *    ecosystem compatibility. React components do not consume jQuery directly but
 *    it must remain in the global scope.
 *
 * 6. `window.buildFormTree` — A global function used by Stapler form processing
 *    to serialize form state before POST submission.
 *
 * Source references:
 * - src/main/js/util/jenkins.js (baseUrl, crumb handling, buildFormTree, staplerPost)
 * - src/main/js/util/behavior-shim.js (Behaviour.specify, Behaviour.applySubtree)
 * - src/main/js/api/securityConfig.js (crumb.init pattern)
 * - src/main/js/api/search.js (document.body.dataset.searchUrl)
 * - src/main/js/util/i18n.js (getI18n via #i18n element dataset)
 *
 * @module jenkins.d.ts
 */

// ---------------------------------------------------------------------------
// JenkinsHeadDataset — document.head.dataset augmentation
// ---------------------------------------------------------------------------

/**
 * Augments DOMStringMap to type the `data-*` attributes that Jenkins sets on
 * `<head>` via the Jelly `<l:layout>` tag. These attributes are the PRIMARY
 * mechanism by which the server communicates configuration to the client-side
 * JavaScript layer.
 *
 * @example
 * ```typescript
 * const baseUrl = (document.head.dataset as JenkinsHeadDataset).rooturl;
 * const crumb = (document.head.dataset as JenkinsHeadDataset).crumb;
 * ```
 *
 * Derived from:
 * - jenkins.js line 13: `document.head.dataset.rooturl`
 * - jenkins.js lines 57-65: crumb field/value pattern
 * - securityConfig.js lines 17-18: `response.data.crumbRequestField` / `response.data.crumb`
 */
export interface JenkinsHeadDataset extends DOMStringMap {
  /** Jenkins base URL including context path (e.g., "/jenkins" or "") */
  rooturl: string;

  /** Current CSRF crumb token value for request authentication */
  crumb: string;

  /**
   * Name of the HTTP header or form field used to transmit the CSRF crumb
   * (e.g., "Jenkins-Crumb")
   */
  crumbRequestField: string;

  /** Base URL for static resources served by Jenkins (CSS, JS, images) */
  resurl: string;

  /** Base URL for image assets served by Jenkins */
  imagesurl: string;

  /**
   * Alternative crumb value attribute — some Jelly views set the crumb
   * token under this attribute name for backwards compatibility
   */
  crumbValue?: string;
}

// ---------------------------------------------------------------------------
// JenkinsBodyDataset — document.body.dataset augmentation
// ---------------------------------------------------------------------------

/**
 * Augments DOMStringMap to type the `data-*` attributes that Jenkins sets on
 * `<body>` via Jelly views for page-specific client-side configuration.
 *
 * @example
 * ```typescript
 * const searchEndpoint = (document.body.dataset as JenkinsBodyDataset).searchUrl;
 * ```
 *
 * Derived from:
 * - search.js line 5: `document.querySelector("body").dataset.searchUrl`
 */
export interface JenkinsBodyDataset extends DOMStringMap {
  /** URL of the Jenkins search endpoint used by the global search bar */
  searchUrl: string;
}

// ---------------------------------------------------------------------------
// CrumbObject — CSRF crumb management
// ---------------------------------------------------------------------------

/**
 * Represents the global `window.crumb` object used for CSRF crumb management
 * across all Jenkins frontend API communication. The crumb is injected into
 * HTTP headers and form bodies to authenticate POST requests against Jenkins
 * Stapler endpoints.
 *
 * The crumb object is initialized by the Jenkins layout template and updated
 * after certain security-sensitive operations (e.g., creating the first admin
 * user during setup wizard) via the `init()` method.
 *
 * @example
 * ```typescript
 * // Reading crumb for a POST request header
 * const headers: Record<string, string> = {};
 * headers[window.crumb.fieldName] = window.crumb.value;
 *
 * // Re-initializing crumb after security operation
 * window.crumb.init("Jenkins-Crumb", newCrumbValue);
 * ```
 *
 * Derived from:
 * - jenkins.js lines 57-65: `crumb.fieldName`, `crumb.value` usage in POST requests
 * - securityConfig.js line 18: `getWindow().crumb.init(crumbRequestField, response.data.crumb)`
 * - securityConfig.js line 35: same crumb re-initialization pattern
 */
export interface CrumbObject {
  /**
   * Name of the HTTP header or form field for the CSRF crumb
   * (typically "Jenkins-Crumb")
   */
  fieldName: string;

  /** Current CSRF crumb token value */
  value: string;

  /**
   * Re-initializes the crumb with new values. Called after operations that
   * rotate the crumb token (e.g., creating the first admin user, configuring
   * the Jenkins instance URL during setup wizard).
   *
   * @param crumbRequestField - The field name for the crumb (e.g., "Jenkins-Crumb")
   * @param crumbValue - The new crumb token value
   */
  init(crumbRequestField: string, crumbValue: string): void;
}

// ---------------------------------------------------------------------------
// BehaviourClass — Plugin behavior registration
// ---------------------------------------------------------------------------

/**
 * Represents the global `window.Behaviour` class that enables JavaScript
 * behaviors to be attached to DOM elements by CSS selector. This is the core
 * extensibility mechanism used by 2,000+ Jenkins plugins to register client-side
 * behaviors that are applied after server-side Jelly template rendering produces
 * DOM content.
 *
 * In the React architecture, core components use React lifecycle hooks instead
 * of `Behaviour.specify()`. However, the `Behaviour` class MUST remain globally
 * available because plugin-contributed Jelly views continue to depend on it.
 *
 * @example
 * ```typescript
 * // Plugin registering a behavior for all elements matching a CSS selector
 * window.Behaviour.specify(".my-plugin-widget", "my-plugin", 0, (element) => {
 *   // Attach interactive behavior to the element
 *   element.addEventListener("click", handleClick);
 * });
 *
 * // Applying behaviors to a newly added DOM subtree
 * window.Behaviour.applySubtree(newContainer, false);
 * ```
 *
 * Derived from:
 * - behavior-shim.js lines 1-3: `Behaviour.specify(selector, id, priority, behavior)`
 * - behavior-shim.js lines 5-7: `Behaviour.applySubtree(startNode, includeSelf)`
 */
export interface BehaviourClass {
  /**
   * Registers a behavior handler for DOM elements matching the given CSS selector.
   * When Behaviour.applySubtree is called (or after initial page load), the handler
   * function is invoked for each matching element in priority order.
   *
   * @param selector - CSS selector to match target elements
   * @param id - Unique identifier for this behavior registration (used for deduplication)
   * @param priority - Numeric priority; lower values execute first (0 is highest priority)
   * @param handler - Callback invoked with each matching DOM element
   */
  specify(
    selector: string,
    id: string,
    priority: number,
    handler: (element: HTMLElement) => void,
  ): void;

  /**
   * Applies all registered behaviors to elements within the given DOM subtree.
   * Called after dynamic content is inserted into the page (e.g., after AJAX
   * content load or Jelly fragment rendering).
   *
   * @param startNode - Root element of the subtree to scan for behavior targets
   * @param includeSelf - Whether to include startNode itself in the scan (defaults to false)
   */
  applySubtree(startNode: HTMLElement, includeSelf?: boolean): void;
}

// ---------------------------------------------------------------------------
// I18nElement — Localization container helper type
// ---------------------------------------------------------------------------

/**
 * Helper type for the hidden `#i18n` DOM element that Jenkins uses as a
 * localization container. The Jelly layout template renders a hidden element
 * with `id="i18n"` whose `data-*` attributes contain localized string values.
 *
 * @example
 * ```typescript
 * const i18nEl = document.querySelector('#i18n') as I18nElement | null;
 * const label = i18nEl?.dataset['someKey'] ?? 'fallback';
 * ```
 *
 * Derived from:
 * - i18n.js lines 1-4: `document.querySelector('#i18n').getAttribute('data-' + text)`
 */
export interface I18nElement extends HTMLElement {
  /** DOMStringMap containing localized string key-value pairs as data-* attributes */
  dataset: DOMStringMap;
}

// ---------------------------------------------------------------------------
// Global namespace augmentations
// ---------------------------------------------------------------------------

/**
 * Augments the global Window interface to include Jenkins-specific properties
 * that are set by the server-side Jelly templates and legacy JavaScript modules.
 * These globals are essential for:
 *
 * - CSRF protection (window.crumb)
 * - Plugin behavior registration (window.Behaviour)
 * - Form processing (window.buildFormTree)
 * - Plugin ecosystem compatibility (window.jQuery, window.$)
 *
 * Note: Vite-specific ImportMeta augmentations are handled by vite-env.d.ts
 * and are NOT duplicated here.
 */
declare global {
  interface Window {
    /**
     * Global CSRF crumb object for secure POST request authentication.
     * Initialized by the Jenkins layout template on page load.
     *
     * @see CrumbObject
     */
    crumb: CrumbObject;

    /**
     * Global Behaviour class for plugin-contributed DOM behavior registration.
     * Must remain available for 2,000+ plugin ecosystem compatibility.
     *
     * @see BehaviourClass
     */
    Behaviour: BehaviourClass;

    /**
     * Global function used by Stapler form processing to serialize a form's
     * state into a JSON tree structure before POST submission. Called by
     * `jenkins.buildFormPost()` in jenkins.js.
     *
     * Derived from jenkins.js line 210: `if (wnd.buildFormTree(form))`
     *
     * @param form - The HTML form element to serialize
     * @returns true if the form tree was built successfully, false otherwise
     */
    buildFormTree: (form: HTMLFormElement) => boolean;

    /**
     * Global jQuery reference preserved for Jenkins plugin ecosystem
     * compatibility. Over 2,000 plugins depend on jQuery being available
     * in the global scope. React components do NOT consume jQuery — they
     * use React Query and native fetch instead.
     *
     * @see https://api.jquery.com/
     */
    jQuery: typeof import("jquery");

    /**
     * Alias for window.jQuery — the `$` shorthand is also globally available
     * for plugin compatibility.
     *
     * @see Window.jQuery
     */
    $: typeof import("jquery");
  }
}

// The `export {}` statement ensures this file is treated as a module,
// which is required for the `declare global` block to function correctly
// as a global augmentation rather than a global declaration.
export {};
