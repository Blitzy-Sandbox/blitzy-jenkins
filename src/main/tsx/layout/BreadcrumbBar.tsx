import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Represents a single breadcrumb item in the navigation trail.
 *
 * Maps directly to the attributes of the Jelly `<l:breadcrumb>` tag defined in
 * `core/src/main/resources/lib/layout/breadcrumb.jelly`:
 *   - `title`  → display name (st:attribute, required)
 *   - `href`   → URL the breadcrumb links to
 *   - `hasMenu` → enables context-menu dropdown (loaded from `{href}/contextMenu`)
 *   - `hasChildrenMenu` → enables children-menu dropdown (`{href}/childrenContextMenu`)
 */
export interface BreadcrumbItem {
  /** Display name for the breadcrumb (mirrors `anc.object.displayName`). */
  title: string;

  /**
   * URL for the breadcrumb link.
   * Jelly appends a trailing slash (`${anc.url}/`) — callers should follow
   * the same convention when building the items array.
   */
  href: string;

  /**
   * When `true`, a dropdown indicator is rendered that loads a context menu
   * from `{href}/contextMenu` on hover/focus. Since Jenkins 2.361.
   */
  hasMenu?: boolean;

  /**
   * When `true`, a dropdown indicator is rendered that loads a children menu
   * from `{href}/childrenContextMenu` on hover/focus.
   */
  hasChildrenMenu?: boolean;
}

/**
 * Props for the {@link BreadcrumbBar} component.
 */
export interface BreadcrumbBarProps {
  /**
   * Ordered list of breadcrumb items derived from the Stapler ancestor chain.
   * In the React architecture the parent page component is responsible for
   * fetching the ancestor hierarchy from the Stapler REST API and mapping it
   * to this array.
   *
   * @default []
   */
  items?: BreadcrumbItem[];

  /**
   * Additional breadcrumb elements rendered **after** the auto-generated items.
   * This mirrors the `<d:invokeBody />` slot in `breadcrumbBar.jelly` (line 54)
   * which allows pages to inject extra in-page navigation breadcrumbs.
   */
  children?: ReactNode;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Title length threshold above which a native `title` tooltip is applied.
 * Mirrors `breadcrumb.jelly` line 54:
 *   `<j:set var="shouldShowTitle" value="${attrs.title.length() > 26}" />`
 */
const TITLE_TOOLTIP_THRESHOLD = 26;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Breadcrumb navigation bar — React replacement for
 * `core/src/main/resources/lib/layout/breadcrumbBar.jelly` (57 lines) and
 * `core/src/main/resources/lib/layout/breadcrumb.jelly` (93 lines).
 *
 * Renders the hierarchical URL path as an ordered trail of clickable links at
 * the top of every Jenkins page. Each item optionally supports context-menu
 * and children-menu dropdown indicators.
 *
 * ### DOM contract (must match Jelly output for SCSS compatibility)
 *
 * ```
 * div#breadcrumbBar.jenkins-breadcrumbs[aria-label="breadcrumb"]
 *   ol#breadcrumbs.jenkins-breadcrumbs__list
 *     li.jenkins-breadcrumbs__list-item[data-type="breadcrumb-item"]
 *       (a[href] | span)          ← link or plain text
 *       div.dropdown-indicator?   ← context/children menu trigger
 *         svg > use               ← chevron-down icon
 * ```
 *
 * ### SCSS classes consumed (from `_breadcrumbs.scss`)
 * - `.jenkins-breadcrumbs`            — outer flex container
 * - `.jenkins-breadcrumbs__list`      — ordered list with flex display
 * - `.jenkins-breadcrumbs__list-item` — individual item (separator via `::before`)
 * - `.dropdown-indicator`             — interactive menu trigger
 */
export default function BreadcrumbBar({
  items = [],
  children,
}: BreadcrumbBarProps) {
  // Resolve the current page pathname so we can mark the "current" breadcrumb.
  // Mirrors breadcrumb.jelly line 50:
  //   <j:set var="baseUrl" value="${request2.originalRequestURI}" />
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <div
      id="breadcrumbBar"
      className="jenkins-breadcrumbs"
      aria-label="breadcrumb"
    >
      <ol className="jenkins-breadcrumbs__list" id="breadcrumbs">
        {items.map((item) => {
          const hasLink = Boolean(item.href);
          const isCurrent = hasLink && currentPath === item.href;
          const showTooltip = item.title.length > TITLE_TOOLTIP_THRESHOLD;
          const showDropdown = Boolean(item.hasMenu || item.hasChildrenMenu);

          // Mirrors breadcrumb.jelly line 61:
          //   (!hasLink && !attrs.hasMenu) || (isCurrent && !inPageNav)
          // In the React version there is no `inPageNav` concept for auto
          // items — in-page breadcrumbs are injected via `children`.
          const renderAsSpan =
            (!hasLink && !item.hasMenu) || isCurrent;

          return (
            <li
              key={item.href || item.title}
              className="jenkins-breadcrumbs__list-item"
              aria-current={isCurrent || !hasLink ? "page" : undefined}
              data-type="breadcrumb-item"
              data-has-menu={item.hasMenu ? "true" : undefined}
            >
              {renderAsSpan ? (
                /* ── Current page / no-link breadcrumb (plain text) ── */
                <span title={showTooltip ? item.title : undefined}>
                  {item.title}
                </span>
              ) : (
                /* ── Navigable breadcrumb link with optional dropdown ── */
                <>
                  <a
                    href={item.href}
                    title={showTooltip ? item.title : undefined}
                  >
                    {item.title}
                  </a>
                  {showDropdown && (
                    <div
                      className="dropdown-indicator"
                      aria-label={`dropdown menu for ${item.title}`}
                      tabIndex={0}
                      data-href={item.href}
                      data-iscurrent={isCurrent ? "true" : "false"}
                      data-base={currentPath}
                      data-model={item.hasMenu ? "true" : undefined}
                      data-children={
                        item.hasChildrenMenu ? "true" : undefined
                      }
                    >
                      {/* Mirrors <l:icon class="icon-sm ..." src="symbol-chevron-down" /> */}
                      <svg
                        className="icon-sm jenkins-!-text-color-secondary"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <use href="#symbol-chevron-down" />
                      </svg>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
        {children}
      </ol>
    </div>
  );
}
