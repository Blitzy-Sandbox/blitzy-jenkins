/* eslint-disable react-refresh/only-export-components */
/**
 * Jenkins Configuration Context Provider
 *
 * Centralizes access to Jenkins server configuration data — base URL, static
 * resource paths, CSRF crumb tokens, and authentication state — via React
 * Context. This replaces the scattered DOM dataset lookups found in the legacy
 * JavaScript codebase:
 *
 * - `document.head.dataset.rooturl` in `src/main/js/util/jenkins.js` (line 13)
 * - `window.crumb.fieldName` / `window.crumb.value` in `jenkins.js` (lines 53-65)
 * - `window.crumb.init()` re-initialization in `securityConfig.js` (lines 17-19, 33-35)
 *
 * The provider reads initial values from `document.head.dataset` attributes set
 * by the Jelly `<l:layout>` tag on every page render, then makes them available
 * to all descendant React components through the `useJenkinsConfig()` hook.
 *
 * CSRF crumb tokens are held in React state to support dynamic refresh after
 * security-sensitive operations (e.g., first admin user creation during the
 * setup wizard). The `refreshCrumb()` function updates both React state AND the
 * global `window.crumb` object to maintain backward compatibility with the
 * 2,000+ Jenkins plugin ecosystem.
 *
 * Provider hierarchy position:
 *   QueryProvider (outer) → JenkinsConfigProvider → I18nProvider (inner) → App
 *
 * @module JenkinsConfigProvider
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

// ---------------------------------------------------------------------------
// JenkinsConfig Interface
// ---------------------------------------------------------------------------

/**
 * Configuration interface providing centralized access to Jenkins server
 * settings, CSRF crumb management, and authentication state.
 *
 * All URL properties are read once from `document.head.dataset` attributes
 * set by the Jelly `<l:layout>` tag. Crumb properties are mutable via the
 * `refreshCrumb()` method to support token rotation during multi-step flows.
 */
export interface JenkinsConfig {
  /**
   * Jenkins base URL including context path (e.g., "/jenkins" or "").
   * Sourced from `document.head.dataset.rooturl`.
   * Used by all API calls to construct full endpoint URLs.
   */
  baseUrl: string;

  /**
   * Base URL for static resources served by Jenkins (CSS, JS bundles).
   * Sourced from `document.head.dataset.resurl`.
   */
  resUrl: string;

  /**
   * Base URL for image assets served by Jenkins.
   * Sourced from `document.head.dataset.imagesurl`.
   */
  imagesUrl: string;

  /**
   * Name of the HTTP header or form field used to transmit the CSRF crumb
   * (e.g., "Jenkins-Crumb"). Sourced initially from
   * `document.head.dataset.crumbrequestfield`.
   */
  crumbFieldName: string;

  /**
   * Current CSRF crumb token value for request authentication. Sourced
   * initially from `document.head.dataset.crumb` and updated dynamically
   * via `refreshCrumb()` after security-sensitive operations.
   */
  crumbValue: string;

  /**
   * Whether the current user session is authenticated. Derived from the
   * presence of a CSRF crumb token — crumbs are only issued to authenticated
   * users when the crumb issuer is configured.
   */
  isAuthenticated: boolean;

  /**
   * Updates the CSRF crumb token with new values. This replaces the legacy
   * `window.crumb.init(fieldName, value)` pattern from `securityConfig.js`.
   *
   * CRITICAL: This function updates both React state (for React consumers)
   * AND `window.crumb` (for plugin backward compatibility).
   *
   * @param fieldName - The crumb field/header name (e.g., "Jenkins-Crumb")
   * @param value - The new crumb token value
   */
  refreshCrumb: (fieldName: string, value: string) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * React context holding the Jenkins configuration. Initialized as `undefined`
 * to enforce that consumers are wrapped in the provider tree — the
 * `useJenkinsConfig()` hook throws if the context is missing.
 */
const JenkinsConfigContext = createContext<JenkinsConfig | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider Component
// ---------------------------------------------------------------------------

/**
 * Props for the JenkinsConfigProvider component.
 */
interface JenkinsConfigProviderProps {
  /** Child components that will have access to the Jenkins configuration context */
  children: ReactNode;
}

/**
 * Context provider that centralizes Jenkins configuration data for the React
 * component tree. Reads server-provided configuration from `document.head.dataset`
 * attributes (set by Jelly `<l:layout>` tag) and provides them via React Context.
 *
 * CSRF crumb values are held in mutable React state to support dynamic refresh
 * after operations that rotate the crumb token (e.g., first admin user creation,
 * instance URL configuration during the setup wizard).
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
 * @param props - Component props containing the children to wrap
 * @returns Provider-wrapped children with access to Jenkins configuration
 */
export function JenkinsConfigProvider({ children }: JenkinsConfigProviderProps) {
  // -------------------------------------------------------------------------
  // Static configuration — read once from document.head.dataset
  // -------------------------------------------------------------------------
  // These values are set by the Jelly <l:layout> tag and do not change during
  // the lifetime of a page. They are read from the DOM on every render but
  // the underlying dataset values remain constant.

  /** Jenkins base URL / context path — mirrors jenkins.js line 13 exactly */
  const baseUrl = document.head.dataset.rooturl ?? '';

  /** Static resource URL base */
  const resUrl = document.head.dataset.resurl ?? '';

  /** Images URL base */
  const imagesUrl = document.head.dataset.imagesurl ?? '';

  // -------------------------------------------------------------------------
  // Mutable crumb state — supports dynamic refresh
  // -------------------------------------------------------------------------
  // Initial values come from document.head.dataset, but can be updated via
  // refreshCrumb() after security-sensitive operations that rotate the token.
  // This replaces the mutable window.crumb object pattern with React state.

  const initialCrumbField = document.head.dataset.crumbrequestfield ?? '';
  const initialCrumbValue = document.head.dataset.crumb ?? '';

  const [crumbFieldName, setCrumbFieldName] = useState(initialCrumbField);
  const [crumbValue, setCrumbValue] = useState(initialCrumbValue);

  // -------------------------------------------------------------------------
  // refreshCrumb — replaces window.crumb.init() pattern
  // -------------------------------------------------------------------------
  // After certain POST operations (first user creation, instance configuration),
  // the server returns a new crumb. This function updates both:
  // 1. React state — so React consumers get the new crumb via context
  // 2. window.crumb — so legacy plugins using window.crumb.fieldName/value
  //    continue to work
  //
  // Mirrors securityConfig.js lines 17-19 and 33-35:
  //   var crumbRequestField = response.data.crumbRequestField;
  //   if (crumbRequestField) {
  //     getWindow().crumb.init(crumbRequestField, response.data.crumb);
  //   }

  const refreshCrumb = useCallback((fieldName: string, value: string) => {
    setCrumbFieldName(fieldName);
    setCrumbValue(value);

    // CRITICAL: Also update window.crumb for backward compatibility with the
    // 2,000+ Jenkins plugins that read crumb.fieldName and crumb.value directly
    // from the global object. This ensures the global crumb stays in sync with
    // the React state after token rotation.
    if (window.crumb) {
      window.crumb.init(fieldName, value);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------
  // Authentication is inferred from the presence of a CSRF crumb in the initial
  // page dataset. Crumbs are only issued to authenticated users when the crumb
  // issuer is configured, making this a reliable authentication indicator.

  const isAuthenticated = Boolean(document.head.dataset.crumb);

  // -------------------------------------------------------------------------
  // Memoized context value
  // -------------------------------------------------------------------------
  // Memoize the context object to prevent unnecessary re-renders of consumers
  // when the provider re-renders but its values haven't changed. The dependency
  // array includes all values that could trigger a context update — primarily
  // crumbFieldName and crumbValue which change on refreshCrumb() calls.

  const value = useMemo<JenkinsConfig>(
    () => ({
      baseUrl,
      resUrl,
      imagesUrl,
      crumbFieldName,
      crumbValue,
      isAuthenticated,
      refreshCrumb,
    }),
    [
      baseUrl,
      resUrl,
      imagesUrl,
      crumbFieldName,
      crumbValue,
      isAuthenticated,
      refreshCrumb,
    ],
  );

  return (
    <JenkinsConfigContext.Provider value={value}>
      {children}
    </JenkinsConfigContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer Hook
// ---------------------------------------------------------------------------

/**
 * Hook to consume the Jenkins configuration context. Must be called from a
 * component that is a descendant of `JenkinsConfigProvider` in the React tree.
 *
 * @throws {Error} If called outside of a `JenkinsConfigProvider` — this ensures
 *   that configuration is always available and prevents silent undefined access.
 *
 * @returns The full `JenkinsConfig` object with base URL, crumb data, and
 *   authentication state
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { baseUrl, crumbFieldName, crumbValue } = useJenkinsConfig();
 *
 *   const handleSubmit = async () => {
 *     const headers: Record<string, string> = {};
 *     if (crumbFieldName && crumbValue) {
 *       headers[crumbFieldName] = crumbValue;
 *     }
 *     await fetch(`${baseUrl}/api/json`, { headers });
 *   };
 *
 *   return <button onClick={handleSubmit}>Fetch</button>;
 * }
 * ```
 */
export function useJenkinsConfig(): JenkinsConfig {
  const context = useContext(JenkinsConfigContext);
  if (context === undefined) {
    throw new Error(
      'useJenkinsConfig must be used within a JenkinsConfigProvider',
    );
  }
  return context;
}
