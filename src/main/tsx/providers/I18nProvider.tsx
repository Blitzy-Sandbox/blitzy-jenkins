/* eslint-disable react-refresh/only-export-components */
/**
 * I18nProvider — Localization Context Provider for Jenkins Core UI
 *
 * Wraps the localization patterns from the legacy JavaScript codebase into a
 * React context that provides translation functions to all child components
 * via the `useI18nContext()` hook.
 *
 * Two localization mechanisms are preserved:
 *
 * 1. **Inline data-attribute translations (`getI18n`)** — Mirrors the exact
 *    DOM query pattern from `src/main/js/util/i18n.js`. The Jelly layout
 *    renders a hidden `<div id="i18n">` element with `data-*` attributes
 *    containing localized strings. The `getI18n(key)` function reads these
 *    attributes synchronously — no network request needed.
 *
 * 2. **Resource bundle translations (`loadTranslations`)** — Mirrors the
 *    `jenkins.loadTranslations(bundleName, handler, onError)` pattern from
 *    `src/main/js/util/jenkins.js` (lines 103-130). Fetches localization
 *    resource bundles from the Stapler endpoint
 *    `{baseUrl}/i18n/resourceBundle?baseName={bundleName}` and wraps the
 *    response data in a `Proxy` that returns the key itself when a translation
 *    is missing — providing graceful fallback across 50+ locales.
 *
 * Provider hierarchy position:
 *   QueryProvider (outer) → JenkinsConfigProvider → I18nProvider (inner) → App
 *
 * Source references:
 * - src/main/js/util/i18n.js — getI18n() DOM query pattern (4 lines)
 * - src/main/js/util/jenkins.js lines 12-14 — baseUrl from document.head.dataset.rooturl
 * - src/main/js/util/jenkins.js lines 103-130 — loadTranslations with Proxy fallback
 *
 * @module I18nProvider
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Resource Bundle Response Type
// ---------------------------------------------------------------------------

/**
 * Shape of the JSON response returned by the Stapler
 * `/i18n/resourceBundle` endpoint. The `status` field indicates whether the
 * bundle was loaded successfully, `data` contains the key-value translation
 * pairs, and `message` carries the error description when `status !== 'ok'`.
 *
 * Derived from jenkins.js lines 104-109:
 * ```js
 * jenkins.get("/i18n/resourceBundle?baseName=" + bundleName, function (res) {
 *   if (res.status !== "ok") { ... throw "Unable to load localization data: " + res.message; }
 *   var translations = res.data;
 * });
 * ```
 */
interface ResourceBundleResponse {
  /** 'ok' on success, any other value indicates an error */
  status: string;
  /** Key-value map of localized strings — present when status is 'ok' */
  data: Record<string, string>;
  /** Human-readable error description — present when status is not 'ok' */
  message?: string;
}

// ---------------------------------------------------------------------------
// I18nContextValue Interface
// ---------------------------------------------------------------------------

/**
 * Public interface for the localization context, consumed via `useI18nContext()`.
 *
 * Exposes three members:
 * - `getI18n` — synchronous DOM lookup for inline data-attribute translations
 * - `loadTranslations` — async fetch for resource bundle translations
 * - `translations` — the most recently loaded resource bundle (Proxy-wrapped)
 */
export interface I18nContextValue {
  /**
   * Get a localized string from the server-rendered `#i18n` element's
   * `data-*` attributes. This is a DIRECT port of `src/main/js/util/i18n.js`
   * `getI18n(text)` — same DOM query, same return type.
   *
   * @param key - The suffix of the `data-*` attribute to read
   *   (e.g., `"cancel"` reads `data-cancel` from the `#i18n` element)
   * @returns The localized string value, or `null` if the `#i18n` element
   *   does not exist or the attribute is not set
   */
  getI18n: (key: string) => string | null;

  /**
   * Load a translations resource bundle by name from the Stapler endpoint.
   * Replaces the callback-based `jenkins.loadTranslations()` with a
   * Promise-based API. The returned record is wrapped in a `Proxy` that
   * returns the key itself when a translation is missing — preserving the
   * graceful fallback behavior from jenkins.js lines 114-126.
   *
   * On success, the returned translations are also stored in the provider's
   * `translations` state so that descendant components re-render with the
   * new bundle.
   *
   * @param bundleName - Fully qualified resource bundle base name
   *   (e.g., `"hudson.model.View"`)
   * @returns A Promise resolving to the Proxy-wrapped translation record
   * @throws When the endpoint returns a non-'ok' status
   */
  loadTranslations: (bundleName: string) => Promise<Record<string, string>>;

  /**
   * The most recently loaded translations resource bundle. Initially an
   * empty object. Updated each time `loadTranslations()` completes
   * successfully. Wrapped in a Proxy for graceful missing-key fallback.
   */
  translations: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Context Creation
// ---------------------------------------------------------------------------

/**
 * React context holding the localization value. Initialized as `undefined`
 * to enforce that consumers are wrapped in the provider tree — the
 * `useI18nContext()` hook throws if the context is missing.
 */
const I18nContext = createContext<I18nContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider Component
// ---------------------------------------------------------------------------

/**
 * Props for the I18nProvider component.
 */
interface I18nProviderProps {
  /** Child components that will have access to the i18n context */
  children: ReactNode;
}

/**
 * Context provider that centralizes localization functions for the React
 * component tree. Provides both synchronous DOM-based translation lookup
 * (`getI18n`) and asynchronous resource bundle loading (`loadTranslations`).
 *
 * @example
 * ```tsx
 * // In the application root (main.tsx):
 * <QueryProvider>
 *   <JenkinsConfigProvider>
 *     <I18nProvider>
 *       <App />
 *     </I18nProvider>
 *   </JenkinsConfigProvider>
 * </QueryProvider>
 * ```
 *
 * @example
 * ```tsx
 * // In a child component:
 * function MyComponent() {
 *   const { getI18n, loadTranslations, translations } = useI18nContext();
 *
 *   useEffect(() => {
 *     loadTranslations('hudson.model.View');
 *   }, [loadTranslations]);
 *
 *   return <span>{translations['viewName'] ?? getI18n('default-view')}</span>;
 * }
 * ```
 *
 * @param props - Component props containing the children to wrap
 * @returns Provider-wrapped children with access to localization context
 */
export function I18nProvider({ children }: I18nProviderProps) {
  // -------------------------------------------------------------------------
  // Translations state — holds the most recently loaded resource bundle
  // -------------------------------------------------------------------------
  // Initially empty. Updated by loadTranslations() on successful fetch.
  // Consumers can read this to access the current bundle without re-fetching.

  const [translations, setTranslations] = useState<Record<string, string>>({});

  // -------------------------------------------------------------------------
  // getI18n — synchronous inline translation lookup
  // -------------------------------------------------------------------------
  // DIRECT port of src/main/js/util/i18n.js:
  //
  //   export function getI18n(text) {
  //     const i18n = document.querySelector("#i18n");
  //     return i18n.getAttribute("data-" + text);
  //   }
  //
  // The #i18n element is a hidden DOM element rendered by the Jelly layout
  // tag with data-* attributes for localized strings used across the page.
  // Returns null when the element is absent (e.g., in unit test environments)
  // or when the requested attribute is not defined.

  const getI18n = useCallback((key: string): string | null => {
    const i18nElement = document.querySelector("#i18n");
    if (!i18nElement) {
      return null;
    }
    return i18nElement.getAttribute("data-" + key);
  }, []);

  // -------------------------------------------------------------------------
  // loadTranslations — async resource bundle loader
  // -------------------------------------------------------------------------
  // Mirrors jenkins.js lines 103-130 exactly:
  //
  // 1. Constructs the endpoint URL: {baseUrl}/i18n/resourceBundle?baseName={bundleName}
  // 2. Fetches JSON response: { status: string; data: Record<string, string> }
  // 3. Validates status === 'ok', throws on error
  // 4. Wraps translation data in a Proxy for graceful missing-key fallback
  // 5. Updates the translations state for downstream consumers
  //
  // Base URL is read from document.head.dataset.rooturl — the same DOM
  // dataset attribute used by jenkins.baseUrl() at jenkins.js line 13.

  const loadTranslations = useCallback(
    async (bundleName: string): Promise<Record<string, string>> => {
      // Resolve base URL from document.head.dataset.rooturl
      // Mirrors: jenkins.baseUrl = function() { return document.head.dataset.rooturl; }
      const baseUrl = document.head.dataset.rooturl ?? "";

      // Construct endpoint URL — mirrors jenkins.js line 104:
      //   jenkins.get("/i18n/resourceBundle?baseName=" + bundleName, ...)
      const url = `${baseUrl}/i18n/resourceBundle?baseName=${encodeURIComponent(bundleName)}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        // Mirrors jenkins.js line 34: cache: false
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch translations for bundle "${bundleName}": HTTP ${response.status}`,
        );
      }

      const result: ResourceBundleResponse = await response.json();

      // Validate response status — mirrors jenkins.js lines 105-109:
      //   if (res.status !== "ok") {
      //     if (onError) { onError(res.message); }
      //     throw "Unable to load localization data: " + res.message;
      //   }
      if (result.status !== "ok") {
        throw new Error(
          `Unable to load localization data: ${result.message ?? "Unknown error"}`,
        );
      }

      // Wrap translation data in a Proxy for graceful missing-key fallback.
      // Mirrors jenkins.js lines 114-126 EXACTLY:
      //
      //   if ("undefined" !== typeof Proxy) {
      //     translations = new Proxy(translations, {
      //       get: function (target, property) {
      //         if (property in target) { return target[property]; }
      //         if (debug) { console.log('"' + property + '" not found ...'); }
      //         return property;
      //       },
      //     });
      //   }
      //
      // The Proxy ensures that accessing a missing translation key returns
      // the key itself as a string — critical for i18n continuity across 50+
      // locales where not every key may be translated.
      const proxiedTranslations = new Proxy(result.data, {
        get(target: Record<string, string>, property: string | symbol): string {
          // Only intercept string property access — symbol access (like
          // Symbol.toPrimitive or Symbol.iterator) falls through to the
          // underlying object to avoid breaking built-in JavaScript behavior.
          if (typeof property === "symbol") {
            return Reflect.get(target, property) as string;
          }
          if (property in target) {
            return target[property];
          }
          // Graceful fallback: return the key itself when no translation exists
          return property;
        },
      });

      // Update the translations state so descendant components re-render
      // with the new bundle data
      setTranslations(proxiedTranslations);

      return proxiedTranslations;
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Memoized context value
  // -------------------------------------------------------------------------
  // Memoize the context object to prevent unnecessary re-renders of consumers
  // when the provider re-renders but its values haven't changed. The
  // dependency array includes all values that could trigger a context update.

  const value = useMemo<I18nContextValue>(
    () => ({
      getI18n,
      loadTranslations,
      translations,
    }),
    [getI18n, loadTranslations, translations],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// ---------------------------------------------------------------------------
// Consumer Hook
// ---------------------------------------------------------------------------

/**
 * Hook to consume the localization context. Must be called from a component
 * that is a descendant of `I18nProvider` in the React tree.
 *
 * @throws {Error} If called outside of an `I18nProvider` — this ensures that
 *   localization functions are always available and prevents silent `undefined`
 *   access errors.
 *
 * @returns The full `I18nContextValue` object with `getI18n`,
 *   `loadTranslations`, and `translations`
 *
 * @example
 * ```tsx
 * function StatusLabel() {
 *   const { getI18n } = useI18nContext();
 *   // Reads from the #i18n DOM element's data-status attribute
 *   const label = getI18n('status') ?? 'Status';
 *   return <span>{label}</span>;
 * }
 * ```
 *
 * @example
 * ```tsx
 * function ViewHeader({ bundleName }: { bundleName: string }) {
 *   const { loadTranslations, translations } = useI18nContext();
 *
 *   useEffect(() => {
 *     loadTranslations(bundleName);
 *   }, [bundleName, loadTranslations]);
 *
 *   return <h1>{translations['title']}</h1>;
 * }
 * ```
 */
export function useI18nContext(): I18nContextValue {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error("useI18nContext must be used within an I18nProvider");
  }
  return context;
}
