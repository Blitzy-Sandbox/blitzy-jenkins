/**
 * React Query Search API Layer
 *
 * Replaces `src/main/js/api/search.js` with a React Query 5 query factory and
 * hook for the Jenkins global search endpoint. The search endpoint URL is read
 * from the DOM (`document.body.dataset.searchUrl`) — a data attribute set by
 * the server-side Jelly template on the `<body>` element.
 *
 * Exports:
 * - `fetchSearch` — Raw async function for non-hook contexts (prefetch, loaders)
 * - `searchQueryOptions` — React Query 5 `queryOptions` factory for cache-keyed search
 * - `useSearch` — Declarative React hook wrapping `useQuery` for component consumption
 *
 * Original source: `src/main/js/api/search.js` (9 lines)
 * ```js
 * function search(searchTerm) {
 *   const address = document.querySelector("body").dataset.searchUrl;
 *   return fetch(`${address}?query=${encodeURIComponent(searchTerm)}`);
 * }
 * export default { search: search };
 * ```
 *
 * Key patterns preserved from source:
 * - Search URL resolved from `document.body.dataset.searchUrl` (NOT hardcoded)
 * - Search term encoded via `encodeURIComponent` as `?query=` parameter
 * - Uses native `fetch()` — jQuery was never used in this file
 *
 * @module search
 */

import { useQuery, queryOptions } from "@tanstack/react-query";
import type { SearchResult } from "@/api/types";

// ---------------------------------------------------------------------------
// Internal helper — Search URL resolution
// ---------------------------------------------------------------------------

/**
 * Reads the Jenkins search endpoint URL from the `data-search-url` attribute
 * on the `<body>` element. This attribute is set by the Jelly template during
 * server-side rendering, making the search URL configurable per Jenkins instance
 * and context path.
 *
 * Mirrors the original source pattern:
 * ```js
 * const address = document.querySelector("body").dataset.searchUrl;
 * ```
 *
 * @returns The search endpoint URL string
 * @throws {Error} If the `data-search-url` attribute is missing from `<body>`
 */
function getSearchUrl(): string {
  const searchUrl: string | undefined = document.body.dataset.searchUrl;

  if (!searchUrl) {
    throw new Error(
      "Jenkins search URL not found on document.body.dataset.searchUrl. " +
        "Ensure the Jelly template sets the data-search-url attribute on the <body> element.",
    );
  }

  return searchUrl;
}

// ---------------------------------------------------------------------------
// Raw fetch function — non-hook async search
// ---------------------------------------------------------------------------

/**
 * Executes a search request against the Jenkins search endpoint.
 *
 * This is the raw async function equivalent of the original `search.search(searchTerm)`
 * export. It can be used outside of React component lifecycle — for example in
 * React Query prefetch calls, route loaders, or imperative search invocations.
 *
 * The function:
 * 1. Resolves the search URL from `document.body.dataset.searchUrl`
 * 2. Constructs the query URL with `?query=${encodeURIComponent(searchTerm)}`
 * 3. Fetches the response and parses JSON into a typed `SearchResult`
 *
 * @param searchTerm - The user's search query string
 * @returns A promise resolving to the typed `SearchResult` containing suggestions
 * @throws {Error} If the search URL is missing from the DOM
 * @throws {Error} If the fetch request fails (non-2xx response)
 * @throws {Error} If the response body cannot be parsed as JSON
 *
 * @example
 * ```typescript
 * const result = await fetchSearch("pipeline");
 * console.log(result.suggestions);
 * ```
 */
export async function fetchSearch(searchTerm: string): Promise<SearchResult> {
  const address = getSearchUrl();
  const url = `${address}?query=${encodeURIComponent(searchTerm)}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Search request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data: SearchResult = await response.json();
  return data;
}

// ---------------------------------------------------------------------------
// Query options factory — cache-keyed search configuration
// ---------------------------------------------------------------------------

/**
 * Creates a React Query 5 `queryOptions` configuration object for the Jenkins
 * search endpoint. The returned options include:
 *
 * - `queryKey` — `['search', searchTerm]` for per-term cache isolation
 * - `queryFn` — Async function invoking `fetchSearch(searchTerm)`
 * - `enabled` — `false` when `searchTerm` is empty (prevents unnecessary requests)
 * - `staleTime` — 30 seconds, allowing cached search results to be reused for
 *   repeated queries within a short window without refetching
 *
 * This factory is designed for use with React Query's `useQuery`, `prefetchQuery`,
 * and `ensureQueryData` APIs.
 *
 * @param searchTerm - The user's search query string
 * @returns A type-safe `queryOptions` configuration object
 *
 * @example
 * ```typescript
 * // Direct usage with useQuery
 * const result = useQuery(searchQueryOptions("pipeline"));
 *
 * // Prefetching in a route loader
 * await queryClient.prefetchQuery(searchQueryOptions("freestyle"));
 * ```
 */
export function searchQueryOptions(searchTerm: string) {
  return queryOptions<SearchResult>({
    queryKey: ["search", searchTerm] as const,
    queryFn: () => fetchSearch(searchTerm),
    enabled: searchTerm.length > 0,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// React hook — declarative search for components
// ---------------------------------------------------------------------------

/**
 * React hook for executing Jenkins global search queries with automatic caching,
 * background refetching, and loading/error state management via React Query 5.
 *
 * This hook wraps `useQuery(searchQueryOptions(searchTerm))` and returns the
 * standard React Query result object with typed `SearchResult` data.
 *
 * The hook is **debounce-ready**: it fires a new query whenever `searchTerm`
 * changes. The consuming component (e.g., `SearchBar`) is responsible for
 * debouncing the input value before passing it to this hook.
 *
 * The query is automatically disabled when `searchTerm` is empty, preventing
 * unnecessary network requests for blank input states.
 *
 * @param searchTerm - The user's search query string (should be debounced by caller)
 * @returns React Query result with typed `data`, `isLoading`, `isError`, `error`,
 *          `isFetching`, and `refetch` properties
 *
 * @example
 * ```tsx
 * function SearchBar() {
 *   const [term, setTerm] = useState("");
 *   const debouncedTerm = useDebouncedValue(term, 300);
 *   const { data, isLoading, isError, error, isFetching, refetch } = useSearch(debouncedTerm);
 *
 *   return (
 *     <div>
 *       <input value={term} onChange={(e) => setTerm(e.target.value)} />
 *       {isLoading && <span>Loading...</span>}
 *       {isError && <span>Error: {error.message}</span>}
 *       {data?.suggestions.map((s) => (
 *         <a key={s.name} href={s.url}>{s.name}</a>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSearch(searchTerm: string) {
  return useQuery(searchQueryOptions(searchTerm));
}
