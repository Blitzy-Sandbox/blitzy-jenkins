/**
 * main.tsx — React 19 Application Bootstrap Entry Point
 *
 * Primary entry point for the Jenkins React 19 + TypeScript frontend,
 * replacing the imperative bootstrap pattern in `src/main/js/app.js`.
 *
 * The original `app.js` imported 9 component modules and called `.init()`
 * on each to register `behaviorShim.specify()` DOM observation handlers.
 * This entry point replaces that imperative pattern with a declarative
 * React component tree mounted via `createRoot`.
 *
 * **Provider hierarchy** (outermost → innermost):
 *
 *   QueryProvider → JenkinsConfigProvider → I18nProvider → App
 *
 * This order reflects the dependency chain:
 * - `QueryProvider` wraps React Query's `QueryClientProvider` — outermost
 *   so that all children (including other providers) can use `useQuery` /
 *   `useMutation` hooks for Stapler REST endpoint consumption.
 * - `JenkinsConfigProvider` reads `document.head.dataset` attributes set
 *   by the Jelly `<l:layout>` tag and provides `baseUrl`, CSRF crumb, and
 *   authentication state to all descendants.
 * - `I18nProvider` provides localization context — wraps `getI18n()` DOM
 *   queries and `loadTranslations()` resource bundle fetches for 50+ locales.
 * - `App` is the root UI component rendering the Layout shell and all global
 *   behavioral components (Header, CommandPalette, Notifications, etc.).
 *
 * **Mount point**: The React tree mounts into `<div id="react-root">`,
 * which is rendered by the Jelly shell layout on migrated pages. Pages
 * that have not been migrated to the React shell will not have this
 * element — the bootstrap silently exits in that case.
 *
 * **Plugin ecosystem compatibility**: This module does NOT import jQuery,
 * Handlebars, or behaviorShim. jQuery 3.7.1, Bootstrap 3.4.1, and legacy
 * scripts remain available in the global scope via their own `<script>`
 * tags for the 2,000+ Jenkins plugin ecosystem.
 *
 * This module is a **side-effect entry point** — it exports nothing.
 *
 * @see src/main/js/app.js — Original imperative bootstrap replaced by this module
 * @see src/main/js/pluginSetupWizard.js — Setup wizard bootstrap (separate entry)
 * @see src/main/js/util/jenkins.js — Legacy utility module whose patterns are
 *   replicated in JenkinsConfigProvider and I18nProvider
 *
 * @module main
 */

// ---------------------------------------------------------------------------
// Global Styles — Side-Effect Import
// ---------------------------------------------------------------------------
// Imports the complete Jenkins SCSS design system (69 files across 5
// directories: abstracts, base, components, form, pages). This ensures all
// CSS class names consumed by React components via `className` props are
// available in the document. The SCSS files are preserved unchanged from
// the existing architecture — React components apply the same class names
// that Jelly templates used, ensuring zero visual regression.
import "../scss/styles.scss";

// ---------------------------------------------------------------------------
// React 19 DOM Renderer
// ---------------------------------------------------------------------------
// createRoot is the React 19 mounting API, replacing the legacy
// ReactDOM.render() that was never used in the original codebase (which
// used jQuery DOM manipulation instead). createRoot enables concurrent
// features including automatic batching across promises, setTimeout, and
// native event handlers.
import { createRoot } from "react-dom/client";

// ---------------------------------------------------------------------------
// Root Application Component
// ---------------------------------------------------------------------------
// App replaces the imperative app.js bootstrap. It renders the Layout page
// shell and mounts all global behavioral components (Header, CommandPalette,
// Notifications, TooltipManager) declaratively. It also exposes a component
// registry on window.__jenkinsComponents for Jelly interop during the
// progressive migration period.
import App from "./App";

// ---------------------------------------------------------------------------
// Provider Hierarchy Components (outermost → innermost)
// ---------------------------------------------------------------------------

// QueryProvider — outermost. Wraps React Query's QueryClientProvider with
// defaults matching the legacy jQuery AJAX patterns: staleTime 0 (mirrors
// cache: false), retry 1 for queries, retry 0 for mutations, no refetch
// on window focus. Includes React Query Devtools in development mode.
import { QueryProvider } from "./providers/QueryProvider";

// JenkinsConfigProvider — second layer. Reads baseUrl, resUrl, imagesUrl,
// and CSRF crumb from document.head.dataset (set by Jelly <l:layout> tag).
// Provides refreshCrumb() to update both React state and window.crumb for
// backward compatibility with the plugin ecosystem.
import { JenkinsConfigProvider } from "./providers/JenkinsConfigProvider";

// I18nProvider — innermost provider. Provides getI18n() for synchronous
// DOM-based translation lookup and loadTranslations() for async resource
// bundle fetching with Proxy-wrapped missing-key fallback.
import { I18nProvider } from "./providers/I18nProvider";

// ---------------------------------------------------------------------------
// Application Bootstrap
// ---------------------------------------------------------------------------

/**
 * Locate the mount point element rendered by the Jelly shell layout.
 *
 * The Jelly `<l:layout>` tag on migrated pages renders:
 *   `<div id="react-root" data-view-type="..." data-model-url="...">`
 *
 * Non-migrated pages (plugin-contributed Jelly views, legacy pages still
 * rendering through the full Jelly pipeline) will NOT have this element.
 * In that case the React bundle loads but does not mount, allowing it to
 * be included globally via a single `<script>` tag without causing errors
 * on non-migrated pages.
 */
const container = document.getElementById("react-root");

if (container) {
  /**
   * Create the React 19 root and render the provider-wrapped application.
   *
   * createRoot is called exactly ONCE per page load. The resulting root
   * manages the entire React component tree for the page's lifetime.
   *
   * StrictMode is intentionally OMITTED because:
   * - Jenkins has legacy global mutation patterns (window.crumb,
   *   window.__jenkinsComponents, window.dialog) that would trigger
   *   double-invocation warnings in StrictMode
   * - The TooltipManager and dialog system use imperative DOM manipulation
   *   via MutationObserver and window globals that are not idempotent
   *   under StrictMode's double-render behavior
   * - Plugin compatibility requires single-pass initialization of global
   *   objects that plugins may read synchronously after page load
   */
  const root = createRoot(container);

  root.render(
    <QueryProvider>
      <JenkinsConfigProvider>
        <I18nProvider>
          <App />
        </I18nProvider>
      </JenkinsConfigProvider>
    </QueryProvider>,
  );
}
