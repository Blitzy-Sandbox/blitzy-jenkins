/**
 * ManageJenkins — Admin Landing Page Component
 *
 * React 19 replacement for `src/main/js/pages/manage-jenkins/index.js` (22 lines)
 * and the React equivalent of the management page rendered by
 * `core/src/main/resources/hudson/model/ManageJenkinsAction/index.jelly`.
 *
 * The source file wires a `suggestions()` callback onto `#settings-search-bar`
 * that gathers management navigation items from `.jenkins-section__item` and
 * `#tasks .task-link-wrapper` DOM nodes, maps them to `{url, icon, label}`
 * objects, and filters out items whose URL ends with `#`.
 *
 * In the React version, management categories are fetched from
 * `GET /manage/api/json` and rendered as a categorized grid. The `SearchBar`
 * component receives suggestions derived from the fetched management data
 * rather than querying the DOM.
 *
 * Key behaviors replicated from source:
 * - Search suggestions returning `{url, icon, label}` objects (source lines 3-21)
 * - Icon as raw HTML string matching `.outerHTML` pattern (source lines 11-13)
 * - Label from displayName matching `<dt>` textContent (source lines 14-18)
 * - URL filtering: items ending with `#` are excluded (source line 20)
 *
 * CSS class names match the existing SCSS in `_section.scss` and
 * `_manage-jenkins.scss` to ensure visual symmetry with the Jelly-rendered UI.
 *
 * DOM structure mirrors the Jelly template:
 * ```html
 * <section class="jenkins-section jenkins-section--bottom-padding">
 *   <h2 class="jenkins-section__title">{category}</h2>
 *   <div class="jenkins-section__items">
 *     <div class="jenkins-section__item">
 *       <a href="...">
 *         <div class="jenkins-section__item__icon" aria-hidden="true">
 *           <svg>...</svg>
 *         </div>
 *         <dl>
 *           <dt>{displayName}</dt>
 *           <dd>{description}</dd>
 *         </dl>
 *       </a>
 *     </div>
 *   </div>
 * </section>
 * ```
 *
 * @module pages/manage-jenkins/ManageJenkins
 */

import { useCallback } from "react";
import SearchBar from "@/components/search-bar/SearchBar";
import { useStaplerQuery } from "@/hooks/useStaplerQuery";
import { useI18n } from "@/hooks/useI18n";
import { useJenkinsConfig } from "@/providers/JenkinsConfigProvider";
import Layout from "@/layout/Layout";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Search suggestion item shape matching the source's DOM-derived object.
 *
 * Directly corresponds to the object shape returned by the source
 * `suggestions()` callback (source lines 9-19):
 * - `url`  — from `item.querySelector("a").href`
 * - `icon` — from `.jenkins-section__item__icon svg|img .outerHTML`
 * - `label` — from `<dt>` or `.task-link-text` or `.task-link` `.textContent`
 *
 * Compatible with the `SearchSuggestion` interface expected by `SearchBar`.
 */
interface ManagementItem {
  /** Navigation URL for the management item (source line 10) */
  url: string;
  /** Raw HTML string of the icon SVG/IMG (source lines 11-13) */
  icon: string;
  /** Human-readable label text (source lines 14-18) */
  label: string;
}

/**
 * Single management link within a category, as returned by the
 * `GET /manage/api/json` Stapler REST endpoint.
 *
 * Field names correspond to the Java `ManagementLink` model properties
 * exposed via the `@Exported` annotation.
 */
interface ManagementCategoryItem {
  /** Display name of the management item (Jelly: `m.displayName`) */
  displayName: string;
  /** Description text shown below the display name (Jelly: `m.description`) */
  description?: string;
  /** Relative URL path for the management item (Jelly: `m.urlName`) */
  url: string;
  /** Icon class name or SVG symbol ID (Jelly: `m.iconFileName`) */
  iconClassName?: string;
  /** Whether the item requires admin permission */
  requiresAdmin?: boolean;
}

/**
 * Category grouping of management links, from the `GET /manage/api/json`
 * Stapler endpoint. Maps to `app.categorizedManagementLinks.entrySet()`
 * in the Jelly template.
 */
interface ManagementCategory {
  /** Category name/title (Jelly: `category.key.label`) */
  name: string;
  /** Category description text */
  description?: string;
  /** Items within this category */
  items: ManagementCategoryItem[];
}

/**
 * Top-level response shape from `GET /manage/api/json`.
 */
interface ManageApiResponse {
  /** Categorized management link groups */
  categories?: ManagementCategory[];
}

/**
 * Props for the ManageJenkins page component.
 */
interface ManageJenkinsProps {
  /** Optional CSS class name appended to the root element */
  className?: string;
}

// =============================================================================
// Helper: Resolve URL with base URL
// =============================================================================

/**
 * Resolves a management item URL by prepending the Jenkins base URL
 * when the URL is a relative path starting with '/'.
 *
 * Replaces the implicit base URL resolution that occurred in the original
 * Jelly-rendered page where anchor `href` values were resolved relative
 * to the page's base URL by the browser.
 *
 * @param url - The raw URL from the API response
 * @param baseUrl - Jenkins base URL from JenkinsConfigProvider
 * @returns The fully resolved URL
 */
function resolveUrl(url: string, baseUrl: string): string {
  if (url.startsWith("/")) {
    return baseUrl + url;
  }
  return url;
}

// =============================================================================
// ManageJenkins Component
// =============================================================================

/**
 * Admin landing page component rendering the "Manage Jenkins" page.
 *
 * Fetches management categories from `GET /manage/api/json` and renders
 * them as a categorized grid with search functionality. Replaces both
 * the Jelly template rendering and the source JavaScript's search-bar
 * wiring logic.
 *
 * @param props - Component props
 * @returns The Manage Jenkins page JSX element
 */
export function ManageJenkins({ className }: ManageJenkinsProps) {
  const { baseUrl } = useJenkinsConfig();
  const { t } = useI18n();

  // ---------------------------------------------------------------------------
  // Data fetching — replaces DOM-based data sourcing (source lines 4-8)
  // ---------------------------------------------------------------------------
  // Management categories are fetched from the Stapler REST API instead of
  // being queried from DOM elements that were previously server-rendered by
  // Jelly. The staleTime of 60s reflects that management categories change
  // infrequently during a session.
  const { data: manageData, isLoading } = useStaplerQuery<ManageApiResponse>({
    url: "/manage/api/json",
    queryKey: ["manage", "categories"],
    staleTime: 60 * 1000,
  });

  // ---------------------------------------------------------------------------
  // Search suggestions builder — replaces source lines 3-21
  // ---------------------------------------------------------------------------
  // In the source, suggestions were built by querying DOM elements:
  //   document.querySelectorAll(".jenkins-section__item, #tasks .task-link-wrapper")
  // and mapping each to {url, icon, label}.
  //
  // In React, we build suggestions from the fetched management category data.
  // The function signature matches SearchBar's `suggestions` prop type:
  //   () => SearchSuggestion[]
  //
  // CRITICAL: The URL filter at source line 20 must be preserved exactly:
  //   .filter((item) => !item.url.endsWith("#"))
  const suggestions = useCallback((): ManagementItem[] => {
    if (!manageData?.categories) {
      return [];
    }

    const items: ManagementItem[] = [];

    // Build from categories — replaces `.jenkins-section__item` DOM query
    // (source lines 5-7)
    for (const category of manageData.categories) {
      for (const item of category.items) {
        const resolvedUrl = resolveUrl(item.url, baseUrl);

        items.push({
          // Source line 10: item.querySelector("a").href
          url: resolvedUrl,
          // Source lines 11-13: .outerHTML of SVG/IMG inside icon container
          // Returns raw HTML string for SearchBar to render via dangerouslySetInnerHTML
          icon: item.iconClassName
            ? `<svg class="svg-icon"><use href="#${item.iconClassName}" /></svg>`
            : "",
          // Source lines 14-18: textContent from <dt> or .task-link-text
          label: item.displayName,
        });
      }
    }

    // CRITICAL: Filter out items whose URL ends with '#'
    // EXACT match to source line 20: .filter((item) => !item.url.endsWith("#"))
    return items.filter((item) => !item.url.endsWith("#"));
  }, [manageData, baseUrl]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Layout title={t("manage-jenkins") ?? "Manage Jenkins"}>
      <div className={className}>
        {/* Search bar — replaces source line 1: document.querySelector("#settings-search-bar")
            The SearchBar component receives the suggestions callback and handles
            filtering, keyboard navigation, and dropdown rendering internally. */}
        <SearchBar
          suggestions={suggestions}
          placeholder={t("search-manage-jenkins") ?? "Search settings"}
        />

        {/* Loading state indicator */}
        {isLoading && (
          <div
            className="jenkins-spinner"
            aria-label="Loading management categories"
          >
            <span>Loading…</span>
          </div>
        )}

        {/* Management category grid — mirrors Jelly template structure:
            <j:forEach var="category" items="${app.categorizedManagementLinks.entrySet()}">
              <section class="jenkins-section jenkins-section--bottom-padding">
                <h2 class="jenkins-section__title">{category.key.label}</h2>
                <div class="jenkins-section__items">
                  <div class="jenkins-section__item">
                    <a href="...">
                      <div class="jenkins-section__item__icon" aria-hidden="true">...</div>
                      <dl><dt>...</dt><dd>...</dd></dl>
                    </a>
                  </div>
                </div>
              </section>
            </j:forEach> */}
        {manageData?.categories?.map((category) => (
          <section
            key={category.name}
            className="jenkins-section jenkins-section--bottom-padding"
          >
            <h2 className="jenkins-section__title">{category.name}</h2>
            {category.description && (
              <p className="jenkins-section__description">
                {category.description}
              </p>
            )}
            <div className="jenkins-section__items">
              {category.items.map((item) => (
                <div key={item.url} className="jenkins-section__item">
                  <a href={resolveUrl(item.url, baseUrl)}>
                    <div
                      className="jenkins-section__item__icon"
                      aria-hidden="true"
                    >
                      {item.iconClassName && (
                        <svg
                          className="svg-icon"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <use href={`#${item.iconClassName}`} />
                        </svg>
                      )}
                    </div>
                    <dl>
                      <dt>{item.displayName}</dt>
                      {item.description && <dd>{item.description}</dd>}
                    </dl>
                  </a>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Layout>
  );
}

export default ManageJenkins;
