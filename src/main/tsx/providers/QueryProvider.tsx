/**
 * QueryProvider — React Query Client Provider for Jenkins Core UI
 *
 * Configures and supplies the React Query `QueryClient` instance to the entire
 * application. This is the OUTERMOST provider in the hierarchy:
 *
 *   QueryProvider → JenkinsConfigProvider → I18nProvider → App
 *
 * All React Query hooks (`useQuery`, `useMutation`) throughout the application
 * depend on this provider being present in the component tree.
 *
 * Configuration rationale — defaults are derived from observed patterns in the
 * legacy jQuery-based API layer:
 *
 * - `staleTime: 0` — Matches the `cache: false` pattern from `jenkins.js`
 *   (line 34), where every AJAX request bypassed the browser cache. React
 *   Query's equivalent marks data as stale immediately so that component
 *   remounts trigger fresh fetches.
 *
 * - `retry: 1` (queries) — The legacy callback pattern in `pluginManager.js`
 *   reports failures immediately to error callbacks without retrying. A single
 *   retry provides minimal network resilience without altering perceived
 *   behavior.
 *
 * - `retry: 0` (mutations) — POST requests must never auto-retry because they
 *   may have side effects (e.g., plugin installation, user creation, CSRF
 *   token consumption).
 *
 * - `refetchOnWindowFocus: false` — Jenkins sessions are long-lived and the
 *   existing UI never refetches on focus. Enabling this could cause unexpected
 *   POST side-effects or stale data flashes in dashboard views.
 *
 * @see src/main/js/util/jenkins.js — Original jQuery AJAX patterns
 * @see src/main/js/api/pluginManager.js — 10s timeout, immediate error callbacks
 */

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

/**
 * Module-level QueryClient singleton.
 *
 * Created ONCE outside the component render function so that:
 * - The query cache persists across re-renders
 * - No new QueryClient is created on every render cycle
 * - Follows React Query best practices for client instantiation
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Data is always considered stale immediately after fetch.
       * Matches the jQuery `cache: false` pattern from jenkins.js line 34,
       * ensuring components always get fresh data when they remount.
       */
      staleTime: 0,

      /**
       * Retry failed GET requests once before reporting failure.
       * The legacy callback pattern doesn't retry (pluginManager.js error
       * handlers immediately invoke the error callback), but a single retry
       * adds minimal network resilience without changing perceived behavior.
       */
      retry: 1,

      /**
       * Disable automatic refetching when the browser window regains focus.
       * Jenkins has long-lived sessions and the existing UI never refetches
       * on window focus. Enabling this could cause unexpected background
       * requests or brief data flashes in views with heavy query usage.
       */
      refetchOnWindowFocus: false,
    },
    mutations: {
      /**
       * Never retry failed mutations (POST/PUT/DELETE requests).
       * Mutations may have side effects such as plugin installation, user
       * creation, or CSRF token consumption — auto-retrying could cause
       * duplicate operations or inconsistent state.
       */
      retry: 0,
    },
  },
});

/**
 * QueryProvider — wraps the application in React Query's context provider.
 *
 * In development mode, the React Query Devtools panel is rendered (collapsed
 * by default) for cache inspection and query state visualization. The devtools
 * are excluded from production builds by Vite's tree-shaking when the
 * `import.meta.env.DEV` constant evaluates to `false` at build time.
 *
 * @param children - The child component tree to wrap with query context
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
