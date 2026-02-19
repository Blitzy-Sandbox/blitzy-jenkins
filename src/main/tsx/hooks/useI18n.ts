/**
 * useI18n — Localization Hook
 *
 * Provides internationalization capabilities to React components by wrapping
 * two patterns from the legacy Jenkins frontend:
 *
 * 1. `getI18n(text)` from `src/main/js/util/i18n.js` — synchronous DOM read
 *    of localized strings from the server-rendered `#i18n` element's `data-*`
 *    attributes. The Jelly layout tag renders this hidden element with
 *    locale-specific data attributes on every page.
 *
 * 2. `jenkins.loadTranslations(bundleName, handler)` from
 *    `src/main/js/util/jenkins.js` (lines 103-130) — asynchronous fetch of
 *    translation resource bundles from the `/i18n/resourceBundle` Stapler REST
 *    endpoint. The response is wrapped in a `Proxy` that returns the key name
 *    itself when a translation is missing, providing graceful degradation
 *    across 50+ supported locales.
 *
 * No jQuery — native `fetch()` replaces `jenkins.get()`.
 * No Handlebars — JSX components replace templates.
 * No behaviorShim — React lifecycle replaces `Behaviour.specify()`.
 *
 * @module useI18n
 */

import { useCallback } from 'react';

import type { JenkinsHeadDataset } from '@/types/jenkins';

/**
 * Return type for the {@link useI18n} hook.
 *
 * Provides two i18n capabilities:
 * - `t()` for synchronous lookup of server-rendered localized strings
 * - `loadBundle()` for asynchronous loading of translation resource bundles
 */
export interface UseI18nReturn {
  /**
   * Get a localized string from the server-rendered `#i18n` element's data
   * attributes. Mirrors `src/main/js/util/i18n.js` `getI18n()` exactly.
   *
   * The `#i18n` element is rendered by the Jelly `<l:layout>` tag with
   * `data-*` attributes containing locale-specific strings for the current
   * page. This function reads those attributes synchronously from the DOM.
   *
   * @param key - The localization key (maps to `data-{key}` attribute)
   * @returns The localized string value, or `null` if the `#i18n` element
   *          does not exist or the attribute is not found
   *
   * @example
   * ```tsx
   * const { t } = useI18n();
   * const label = t('save') ?? 'Save';
   * ```
   */
  t: (key: string) => string | null;

  /**
   * Load a translations resource bundle by name from the Stapler
   * `/i18n/resourceBundle` REST endpoint.
   *
   * Returns a `Proxy`-wrapped `Record<string, string>` that provides graceful
   * missing-key fallback: accessing a key that does not exist in the bundle
   * returns the key name itself instead of `undefined`. This mirrors
   * `jenkins.loadTranslations()` from `src/main/js/util/jenkins.js`
   * (lines 114-126) exactly.
   *
   * @param bundleName - Fully qualified Java resource bundle base name
   *                     (e.g., `"hudson.model.View"`)
   * @returns Promise resolving to a Proxy-wrapped translation record
   * @throws {Error} If the HTTP request fails or the response status is not `'ok'`
   *
   * @example
   * ```tsx
   * const { loadBundle } = useI18n();
   * const messages = await loadBundle('jenkins.install.SetupWizard');
   * console.log(messages['installWizard_welcomePanel_title']);
   * // If key is missing, returns the key string itself:
   * console.log(messages['nonExistentKey']); // "nonExistentKey"
   * ```
   */
  loadBundle: (bundleName: string) => Promise<Record<string, string>>;
}

/**
 * Response envelope from the `/i18n/resourceBundle` Stapler endpoint.
 *
 * Mirrors the JSON structure returned by `jenkins.get("/i18n/resourceBundle")`
 * as observed in `jenkins.js` lines 104-112.
 */
interface ResourceBundleResponse {
  /** `'ok'` on success; any other value indicates an error */
  status: string;
  /** Translation key-value pairs when status is `'ok'` */
  data?: Record<string, string>;
  /** Error message when status is not `'ok'` */
  message?: string;
}

/**
 * React hook providing internationalization capabilities for Jenkins
 * components.
 *
 * Replaces the legacy `getI18n()` utility and `jenkins.loadTranslations()`
 * callback pattern with a hook-based API that returns stable function
 * references via `useCallback` to prevent unnecessary re-renders.
 *
 * @returns An object with `t()` and `loadBundle()` functions
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { t, loadBundle } = useI18n();
 *   const [messages, setMessages] = useState<Record<string, string>>({});
 *
 *   useEffect(() => {
 *     loadBundle('hudson.model.View').then(setMessages);
 *   }, [loadBundle]);
 *
 *   return (
 *     <h1>{messages['viewName'] ?? t('defaultTitle')}</h1>
 *   );
 * }
 * ```
 */
export function useI18n(): UseI18nReturn {
  /**
   * Synchronous DOM lookup for localized strings from the `#i18n` element.
   *
   * Mirrors `src/main/js/util/i18n.js` lines 1-4:
   * ```js
   * export function getI18n(text) {
   *   const i18n = document.querySelector("#i18n");
   *   return i18n.getAttribute("data-" + text);
   * }
   * ```
   *
   * Improvement over the original: null-safe — returns `null` when the
   * `#i18n` element is not present in the DOM (the original would throw
   * a TypeError on `null.getAttribute()`).
   */
  const t = useCallback((key: string): string | null => {
    const i18nElement = document.querySelector('#i18n');
    if (!i18nElement) {
      return null;
    }
    return i18nElement.getAttribute('data-' + key);
  }, []);

  /**
   * Asynchronous resource bundle loader from the Stapler REST endpoint.
   *
   * Mirrors `src/main/js/util/jenkins.js` lines 103-130:
   * - Fetches from `{baseUrl}/i18n/resourceBundle?baseName={bundleName}`
   * - Validates `response.status === 'ok'` (throws on error)
   * - Wraps `response.data` in a `Proxy` with missing-key fallback
   *
   * Uses native `fetch()` instead of jQuery `$.ajax()` (via `jenkins.get()`).
   * The `cache: 'no-cache'` option mirrors jQuery's `cache: false` behavior,
   * ensuring the browser revalidates with the server before using cached data.
   */
  const loadBundle = useCallback(
    async (bundleName: string): Promise<Record<string, string>> => {
      // Read base URL from document.head.dataset.rooturl
      // Mirrors jenkins.js line 13: document.head.dataset.rooturl
      const baseUrl =
        (document.head.dataset as JenkinsHeadDataset).rooturl ?? '';

      // Fetch resource bundle from Stapler endpoint
      // Mirrors jenkins.js line 104: jenkins.get("/i18n/resourceBundle?baseName=" + bundleName, ...)
      const response = await fetch(
        `${baseUrl}/i18n/resourceBundle?baseName=${encodeURIComponent(bundleName)}`,
        {
          method: 'GET',
          cache: 'no-cache',
          headers: {
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch resource bundle "${bundleName}": ${response.status} ${response.statusText}`,
        );
      }

      const data: ResourceBundleResponse = await response.json();

      // Validate response status — mirrors jenkins.js lines 105-109
      if (data.status !== 'ok') {
        throw new Error(
          `Unable to load localization data: ${data.message ?? 'Unknown error'}`,
        );
      }

      const bundleData = data.data ?? {};

      // Wrap translations in a Proxy for graceful missing-key fallback.
      // Mirrors jenkins.js lines 114-126 EXACTLY:
      //   translations = new Proxy(translations, {
      //     get: function (target, property) {
      //       if (property in target) { return target[property]; }
      //       return property;
      //     },
      //   });
      //
      // When a translation key is missing, the Proxy returns the key name
      // itself instead of undefined. This is CRITICAL for i18n continuity
      // across 50+ locales — components always render meaningful text even
      // when a translation is not yet available for the current locale.
      return new Proxy(bundleData, {
        get(
          target: Record<string, string>,
          property: string | symbol,
        ): string {
          if (typeof property === 'string') {
            if (property in target) {
              return target[property];
            }
            // Graceful fallback: return the key name itself
            return property;
          }
          // Handle symbol properties (e.g., Symbol.toPrimitive) gracefully
          return String(property);
        },
      });
    },
    [],
  );

  return { t, loadBundle };
}
