/**
 * Header — Jenkins Page Header Behavioral React Component.
 *
 * Consolidates three legacy JavaScript source files into a single React 19
 * component using hooks for lifecycle management:
 *
 * 1. `src/main/js/components/header/index.js`
 *    — scroll/resize event handlers, overflow computation orchestration,
 *      load-time class additions (71 lines)
 *
 * 2. `src/main/js/components/header/actions-touch.js`
 *    — touch device UserAction href management (16 lines)
 *
 * 3. `src/main/js/components/header/breadcrumbs-overflow.js`
 *    — breadcrumb overflow button generation with dropdown (102 lines)
 *
 * This is a **BEHAVIORAL** component — it enhances server-rendered Jelly HTML
 * rather than rendering its own DOM structure. It returns `null` when no
 * breadcrumb overflow exists, or a React portal containing a `Dropdown`
 * component when breadcrumb items overflow the available width.
 *
 * @module components/header/Header
 */

import React, { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { createElementFromHtml } from "@/utils/dom";
import Dropdown from "@/components/dropdowns/Dropdown";
import type { DropdownItem } from "@/components/dropdowns/Dropdown";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Complete HTML for the breadcrumb overflow button, including the `<li>`
 * wrapper and the ellipsis SVG icon with three circles.
 *
 * Used with `createElementFromHtml` to generate the overflow button element
 * for insertion into the breadcrumb bar. The button must exist in the DOM
 * during the overflow measurement loop so its width is accounted for.
 *
 * SVG is byte-for-byte identical to the source (breadcrumbs-overflow.js
 * lines 83-89): three circles at cx=71, 256, 441; cy=256; r=45.
 */
const OVERFLOW_BUTTON_HTML =
  '<li class="jenkins-breadcrumbs__list-item">' +
  '<button class="jenkins-button jenkins-button--tertiary">' +
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
  '<circle cx="256" cy="256" r="45" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32"/>' +
  '<circle cx="441" cy="256" r="45" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32"/>' +
  '<circle cx="71" cy="256" r="45" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32"/>' +
  "</svg>" +
  "</button>" +
  "</li>";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Jenkins Page Header behavioral component.
 *
 * Responsibilities:
 * - **Scroll effects**: Sets CSS custom properties `--background-opacity`,
 *   `--background-blur`, and `--border-opacity` on `#page-header` as the
 *   user scrolls, producing the translucent header effect.
 * - **Resize handling**: Recomputes breadcrumb overflow when the viewport
 *   width changes, and listens for the custom `computeHeaderOverflow` event
 *   so other subsystems can trigger recomputation.
 * - **Touch adaptation**: On touch-only devices, removes the `href` from the
 *   `#root-action-UserAction` link so taps open the overflow menu instead of
 *   navigating directly.
 * - **Breadcrumb overflow**: When the breadcrumb bar overflows, hides leading
 *   breadcrumb items and renders an ellipsis button with a `Dropdown` menu
 *   containing the hidden items.
 * - **Load-time classes**: Adds `jenkins-header--has-sticky-app-bar` and
 *   `jenkins-header--no-breadcrumbs` modifier classes when appropriate.
 *
 * @returns A React portal with the overflow Dropdown, or `null`.
 */
function Header(): React.ReactElement | null {
  // ----- Refs for caching DOM elements and tracking state -----

  /** Cached reference to `#page-header` (set once on mount). */
  const pageHeaderRef = useRef<HTMLElement | null>(null);

  /** Tracks viewport width to detect actual width changes during resize. */
  const lastWidthRef = useRef<number>(
    typeof window !== "undefined" ? window.innerWidth : 0,
  );

  /**
   * Reference to the `<li>` mount point for the overflow button.
   * Created imperatively via `createElementFromHtml` and inserted into
   * the breadcrumb bar after the logo item.
   */
  const overflowMountRef = useRef<HTMLElement | null>(null);

  // ----- State for overflow dropdown portal rendering -----

  /** Items to display in the overflow dropdown menu. */
  const [overflowItems, setOverflowItems] = useState<DropdownItem[]>([]);

  /** DOM element where the React portal renders the Dropdown. */
  const [mountPoint, setMountPoint] = useState<HTMLElement | null>(null);

  // -----------------------------------------------------------------------
  // Breadcrumb Overflow Removal
  // Source: breadcrumbs-overflow.js lines 94-102
  // -----------------------------------------------------------------------

  /**
   * Removes the overflow button from the DOM and clears React state.
   * Called when the breadcrumb bar no longer overflows.
   */
  const removeOverflowButton = useCallback(() => {
    const mount = overflowMountRef.current;
    overflowMountRef.current = null;
    setOverflowItems([]);
    setMountPoint(null);
    if (mount) {
      mount.remove();
    }
  }, []);

  // -----------------------------------------------------------------------
  // Breadcrumb Overflow Computation
  // Source: breadcrumbs-overflow.js (full file, 102 lines)
  // -----------------------------------------------------------------------

  /**
   * Computes which breadcrumb items overflow the breadcrumb bar and manages
   * the overflow button + dropdown menu.
   *
   * Algorithm:
   * 1. Unhide all previously hidden breadcrumb items
   * 2. Check if the breadcrumb bar overflows (scrollWidth > offsetWidth)
   * 3. If not overflowing, remove the overflow button and return
   * 4. Create (or reuse) the overflow button element in the DOM
   * 5. Hide leading breadcrumbs one by one until the bar fits
   * 6. Map hidden items to DropdownItem format for the overflow dropdown
   * 7. If newly created, replace the temporary measurement element with a
   *    clean portal mount; otherwise update state for re-render
   */
  const computeBreadcrumbs = useCallback(() => {
    // Step 1 — Unhide all previously hidden breadcrumb items (source lines 5-9)
    document
      .querySelectorAll(".jenkins-breadcrumbs__list-item.jenkins-hidden")
      .forEach((e) => e.classList.remove("jenkins-hidden"));

    // Step 2 — Check if breadcrumb bar overflows (source lines 67-70)
    const breadcrumbsBar = document.querySelector(
      "#breadcrumbBar",
    ) as HTMLElement | null;
    if (
      !breadcrumbsBar ||
      breadcrumbsBar.scrollWidth <= breadcrumbsBar.offsetWidth
    ) {
      removeOverflowButton();
      return;
    }

    // Step 3 — Generate or reuse overflow button element (source lines 72-92)
    //
    // Two branches:
    // A) Reuse: an existing React portal mount with the Dropdown button is
    //    already in the DOM — its width is correct for measurement.
    // B) Create: insert a temporary `<li>` with a full button + SVG icon so
    //    the overflow while-loop in step 4 accounts for the button width.
    //    After measurement, this temporary element is replaced with a clean
    //    portal mount (step 7) to avoid mutating ref-derived DOM nodes.
    let existingMount = overflowMountRef.current;
    let measureElement: HTMLElement | null = null;

    if (!existingMount || !existingMount.parentNode) {
      // Create a temporary measurement element with the full button HTML.
      // Its width must be present during the overflow loop so the correct
      // number of breadcrumbs are hidden.
      measureElement = createElementFromHtml(OVERFLOW_BUTTON_HTML);

      // Insert after the first breadcrumb list item (the Jenkins logo)
      const logo = document.querySelector(
        ".jenkins-breadcrumbs__list-item",
      );
      if (logo) {
        logo.after(measureElement);
      }
      existingMount = null;
    }

    // Step 4 — Hide leading breadcrumbs until bar no longer overflows
    // (source lines 23-32)
    const hiddenItems: HTMLElement[] = [];
    const breadcrumbs = Array.from(
      document.querySelectorAll<HTMLElement>('[data-type="breadcrumb-item"]'),
    );

    while (
      breadcrumbsBar.scrollWidth > breadcrumbsBar.offsetWidth &&
      breadcrumbs.length > 0
    ) {
      const item = breadcrumbs.shift()!;
      hiddenItems.push(item);
      item.classList.add("jenkins-hidden");
    }

    // Step 5 — Map hidden items to DropdownItem format (source lines 34-64)
    // Each hidden breadcrumb becomes a "link" item in the overflow dropdown.
    const mappedItems: DropdownItem[] = hiddenItems.map((e) => {
      const anchor = e.querySelector("a");
      const label = e.textContent || "";
      return {
        type: "link" as const,
        clazz: "jenkins-breadcrumbs__overflow-item",
        label,
        url: anchor?.getAttribute("href") || undefined,
        // Tooltip only for long labels — threshold of 26 characters
        // matches source (breadcrumbs-overflow.js line 56)
        tooltip: label.length > 26 ? label : undefined,
      };
    });

    // Step 6 — If no items were hidden, clean up and return
    if (mappedItems.length === 0) {
      // Remove temporary measurement element if we created one
      if (measureElement?.parentNode) {
        measureElement.remove();
      }
      removeOverflowButton();
      return;
    }

    // Step 7 — Establish portal mount point and update state
    if (measureElement) {
      // Replace the temporary measurement element with a clean empty
      // container that serves as the React portal mount point.
      // This avoids mutating ref-derived DOM nodes.
      const portalMount = createElementFromHtml(
        '<li class="jenkins-breadcrumbs__list-item"></li>',
      );
      measureElement.replaceWith(portalMount);
      overflowMountRef.current = portalMount;
      setMountPoint(portalMount);
    } else if (existingMount) {
      // Reuse the existing portal mount — React will re-render the
      // Dropdown with the updated items.
      setMountPoint(existingMount);
    }

    setOverflowItems(mappedItems);
  }, [removeOverflowButton]);

  // -----------------------------------------------------------------------
  // Overflow Orchestration
  // Source: index.js lines 66-68
  // -----------------------------------------------------------------------

  /**
   * Central orchestration function for breadcrumb overflow computation.
   * Called by:
   * - Initial mount (equivalent to `init()` in source, line 6)
   * - Resize handler when viewport width changes (source line 12)
   * - Custom `computeHeaderOverflow` event (source line 17)
   */
  const computeOverflow = useCallback(() => {
    computeBreadcrumbs();
  }, [computeBreadcrumbs]);

  // -----------------------------------------------------------------------
  // Touch Device Handling
  // Source: actions-touch.js (full file, 16 lines)
  // -----------------------------------------------------------------------

  /**
   * Adapts the UserAction link for touch devices.
   *
   * On touch-only devices (where `(hover: none)` matches), the `href`
   * attribute is removed from the `#root-action-UserAction` anchor so that
   * tapping opens the overflow menu instead of navigating to the user page.
   *
   * The `window.isRunAsTest` check preserves the original href when running
   * under Jenkins' HtmlUnit test infrastructure, which sets this property.
   */
  const updateActionsForTouch = useCallback(() => {
    const link = document.querySelector(
      "#root-action-UserAction",
    ) as HTMLAnchorElement | null;
    if (!link) {
      return;
    }
    const originalHref = link.getAttribute("href");
    const isTouchDevice = window.matchMedia("(hover: none)").matches;
    // window.isRunAsTest is set by Jenkins' HtmlUnit test infrastructure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isRunAsTest = !!(window as any).isRunAsTest;

    if (isTouchDevice && !isRunAsTest) {
      link.removeAttribute("href");
    } else if (originalHref) {
      link.setAttribute("href", originalHref);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Effect: Scroll Event Handler
  // Source: index.js lines 20-47
  //
  // Sets CSS custom properties on #page-header as the user scrolls:
  //   --background-opacity: 0% → 70% (over first 70px of scroll)
  //   --background-blur:    0px → 40px (over first 40px of scroll)
  //   --border-opacity:     0% → 15% (normal) or 0% → 100% (high contrast)
  //
  // The border-opacity property is only set when there is no search app bar
  // and no sticky sidebar present in the document.
  // -----------------------------------------------------------------------

  useEffect(() => {
    // Cache the page header element once on mount
    pageHeaderRef.current = document.querySelector("#page-header");

    const handleScroll = () => {
      const navigation = pageHeaderRef.current;
      if (!navigation) {
        return;
      }

      const scrollY = Math.max(0, window.scrollY);

      // Background opacity: linearly increases from 0% to 70%
      navigation.style.setProperty(
        "--background-opacity",
        Math.min(70, scrollY) + "%",
      );

      // Background blur: linearly increases from 0px to 40px
      navigation.style.setProperty(
        "--background-blur",
        Math.min(40, scrollY) + "px",
      );

      // Border opacity: only computed when no search app bar and no sticky
      // sidebar are present (source lines 30-42)
      if (
        !document.querySelector(".jenkins-search--app-bar") &&
        !document.querySelector(".app-page-body__sidebar--sticky")
      ) {
        const prefersContrast = window.matchMedia(
          "(prefers-contrast: more)",
        ).matches;
        // High contrast: 3× multiplier, cap at 100%
        // Normal: 1× multiplier, cap at 15%
        navigation.style.setProperty(
          "--border-opacity",
          Math.min(
            prefersContrast ? 100 : 15,
            prefersContrast ? scrollY * 3 : scrollY,
          ) + "%",
        );
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Effect: Resize + Custom Event Handlers
  // Source: index.js lines 8-18
  //
  // Recomputes breadcrumb overflow when viewport width changes, and listens
  // for the custom `computeHeaderOverflow` event that allows other
  // subsystems to trigger recomputation on demand.
  // -----------------------------------------------------------------------

  useEffect(() => {
    /**
     * Only triggers overflow recomputation when the viewport WIDTH actually
     * changes. Height-only changes (e.g., mobile address bar showing/hiding)
     * do not trigger recomputation. (source lines 10-13)
     */
    const handleResize = () => {
      if (window.innerWidth !== lastWidthRef.current) {
        lastWidthRef.current = window.innerWidth;
        computeOverflow();
      }
    };

    /**
     * Custom event handler allowing other Jenkins subsystems to trigger
     * breadcrumb overflow recomputation. (source lines 16-18)
     */
    const handleComputeHeaderOverflow = () => {
      computeOverflow();
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener(
      "computeHeaderOverflow",
      handleComputeHeaderOverflow,
    );

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener(
        "computeHeaderOverflow",
        handleComputeHeaderOverflow,
      );
    };
  }, [computeOverflow]);

  // -----------------------------------------------------------------------
  // Effect: Initialization + Load Event
  // Source: index.js lines 49-63 (load event) and line 70 (init call)
  //
  // Runs the initial overflow computation and touch adaptation on mount,
  // then registers a load event handler for class additions.
  // -----------------------------------------------------------------------

  useEffect(() => {
    // Defer initial computation to the next animation frame so that
    // setState calls inside computeOverflow (breadcrumb overflow
    // detection) are not invoked synchronously within the effect body.
    // This also ensures the DOM is fully laid out before measuring
    // breadcrumb widths — equivalent to init() in source (line 70).
    const rafId = requestAnimationFrame(() => {
      computeOverflow();
      updateActionsForTouch();
    });

    /**
     * Load event handler for conditional class additions.
     * We can't use :has due to HtmlUnit CSS Parser not supporting it
     * (preserving original developer intent from source comments).
     */
    const handleLoad = () => {
      const header = document.querySelector(".jenkins-header");

      // Sticky app bar detection (source lines 52-56):
      // When a sticky app bar is present, the header receives a modifier
      // class so SCSS can adjust its positioning/spacing.
      if (header && document.querySelector(".jenkins-app-bar--sticky")) {
        header.classList.add("jenkins-header--has-sticky-app-bar");
      }

      // No breadcrumbs detection (source lines 58-62):
      // When no breadcrumb items exist, the header receives a modifier
      // class so SCSS can collapse the breadcrumb bar area.
      if (
        header &&
        !document.querySelector(".jenkins-breadcrumbs__list-item")
      ) {
        header.classList.add("jenkins-header--no-breadcrumbs");
      }
    };

    // If the document is already fully loaded (component mounted after
    // load event), run the handler immediately. Otherwise, register for
    // the load event.
    if (document.readyState === "complete") {
      handleLoad();
    } else {
      window.addEventListener("load", handleLoad);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("load", handleLoad);
    };
  }, [computeOverflow, updateActionsForTouch]);

  // -----------------------------------------------------------------------
  // Render
  //
  // Returns a React portal rendering the Dropdown component into the
  // overflow mount point when breadcrumb items overflow. The Dropdown
  // replaces the tippy.js-based Utils.generateDropdown() from the source.
  //
  // Source dropdown config: trigger: "click focus", offset: [0, 10],
  // animation: "tooltip". The React Dropdown component uses trigger="click"
  // (the focus behavior is handled natively by the button element) and
  // offset={[0, 10]}. The animation property is handled internally by the
  // Dropdown component (no explicit prop needed).
  //
  // When no overflow exists, returns null — the component is purely
  // behavioral, attaching event handlers to Jelly-rendered HTML.
  // -----------------------------------------------------------------------

  if (mountPoint && overflowItems.length > 0) {
    return createPortal(
      <Dropdown items={overflowItems} trigger="click" offset={[0, 10]}>
        <button className="jenkins-button jenkins-button--tertiary">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
          >
            <circle
              cx="256"
              cy="256"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeMiterlimit={10}
              strokeWidth={32}
            />
            <circle
              cx="441"
              cy="256"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeMiterlimit={10}
              strokeWidth={32}
            />
            <circle
              cx="71"
              cy="256"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeMiterlimit={10}
              strokeWidth={32}
            />
          </svg>
        </button>
      </Dropdown>,
      mountPoint,
    );
  }

  return null;
}

export default Header;
