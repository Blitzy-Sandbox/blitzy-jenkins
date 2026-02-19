/**
 * Global Search Bar Component.
 *
 * React 19 replacement for `src/main/js/components/search-bar/index.js`.
 * The source file used an imperative `init()` export that queried the DOM
 * for `.jenkins-search__input` elements, attached event listeners, and
 * created dropdown markup via `createElementFromHtml`. This React version
 * replaces that pattern entirely with declarative JSX, React state, and
 * lifecycle hooks.
 *
 * Key behavioral requirements preserved from the source:
 * - Case-insensitive filtering of suggestions limited to 5 results
 * - XSS protection via `xmlEscape` on all user-visible label text
 * - ArrowUp/ArrowDown keyboard cycling with wrap-around
 * - Enter key navigation to the selected result URL
 * - Click-outside detection to dismiss the dropdown
 * - ResizeObserver-based height sync (disabled in HtmlUnit test env)
 * - Container height set to "1px" when hidden (not "0px")
 * - First item always selected after each query change
 *
 * CSS class names are kept identical to the source to ensure existing
 * SCSS styles (`_search-bar.scss`, `_dropdowns.scss`) apply without
 * modification, maintaining visual symmetry with the Jelly-rendered UI.
 *
 * @module components/search-bar/SearchBar
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { xmlEscape } from "@/utils/security";

/**
 * Describes a single search suggestion item.
 *
 * Derived from source line 38-40 usage where each result has:
 * - `item.url` — the navigation target for the anchor
 * - `item.icon` — optional raw HTML string for an icon
 * - `item.label` — display text (must be xmlEscaped before rendering)
 */
export interface SearchSuggestion {
  /** Display text for the suggestion. Will be xmlEscaped before rendering. */
  label: string;
  /** Navigation URL for the result link. */
  url: string;
  /** Optional HTML string for an icon rendered inside .jenkins-dropdown__item__icon. */
  icon?: string;
}

/**
 * Props for the SearchBar component.
 *
 * The `suggestions` prop mirrors the source's `searchBar.suggestions()`
 * pattern (source line 11) — a function that returns the full list of
 * searchable items. The component filters and slices this list internally.
 */
export interface SearchBarProps {
  /** Function returning the full list of search suggestions. */
  suggestions: () => SearchSuggestion[];
  /** Optional placeholder text for the search input. */
  placeholder?: string;
  /** Optional CSS class name for the wrapper element. */
  className?: string;
}

/** CSS class applied to the currently highlighted dropdown item (source line 5). */
const SELECTED_CLASS = "jenkins-dropdown__item--selected";

/** Maximum number of filtered results to display (source line 58). */
const MAX_RESULTS = 5;

/**
 * Global search bar component with keyboard-navigable dropdown suggestions.
 *
 * Renders an `<input type="search">` with a dropdown results container that
 * shows filtered suggestions as the user types. Fully replaces the imperative
 * DOM logic from the legacy `search-bar/index.js` with React state management.
 *
 * @param props - {@link SearchBarProps}
 * @returns The search bar JSX element
 */
function SearchBar({ suggestions, placeholder, className }: SearchBarProps) {
  // ─── State ──────────────────────────────────────────────────────
  // Source line 24: searchBar.value.toLowerCase()
  const [query, setQuery] = useState("");
  // Source lines 65-76: show/hideResultsContainer toggle
  const [isVisible, setIsVisible] = useState(false);
  // Source line 38: index === 0 ? SELECTED_CLASS : ""
  const [selectedIndex, setSelectedIndex] = useState(0);

  // ─── Refs ───────────────────────────────────────────────────────
  // Source line 13: searchBar.parentElement.parentElement (wrapper)
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Input element for focus management
  const inputRef = useRef<HTMLInputElement>(null);
  // Source line 14-17: results container for height management & ResizeObserver
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  // Source line 18-21: inner dropdown for height measurement
  const resultsRef = useRef<HTMLDivElement>(null);

  // ─── Filtered results computation ──────────────────────────────
  // Mirrors source lines 55-58:
  //   searchBar.suggestions()
  //     .filter(item => item.label.toLowerCase().includes(query))
  //     .slice(0, 5)
  const filteredResults = useMemo(() => {
    if (query.length === 0) {
      return [];
    }
    const lowerQuery = query.toLowerCase();
    return suggestions()
      .filter((item) => item.label.toLowerCase().includes(lowerQuery))
      .slice(0, MAX_RESULTS);
  }, [query, suggestions]);

  // ─── Input change handler ──────────────────────────────────────
  // Mirrors source lines 23-63: input event listener
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const lowerValue = value.toLowerCase();

      setQuery(lowerValue);

      // Source lines 27-30: hide if query empty
      if (value.length === 0) {
        setIsVisible(false);
        return;
      }

      // Source line 32: showResultsContainer()
      setIsVisible(true);
      // Source line 38: first item always selected after query change
      setSelectedIndex(0);
    },
    [],
  );

  // ─── Keyboard handler ──────────────────────────────────────────
  // Replaces source lines 78-82 (arrow key prevention) AND
  // makeKeyboardNavigable from keyboard.js (ArrowUp/Down cycling, Enter click)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isVisible || filteredResults.length === 0) {
        return;
      }

      switch (e.key) {
        // keyboard.js lines 37-51: ArrowDown — next item, wrap to 0 at end
        case "ArrowDown": {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev >= filteredResults.length - 1 ? 0 : prev + 1,
          );
          break;
        }
        // keyboard.js lines 54-68: ArrowUp — prev item, wrap to last at start
        case "ArrowUp": {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev <= 0 ? filteredResults.length - 1 : prev - 1,
          );
          break;
        }
        // keyboard.js lines 71-75: Enter — navigate to selected item URL
        case "Enter": {
          e.preventDefault();
          const selectedItem = filteredResults[selectedIndex];
          if (selectedItem) {
            window.location.href = selectedItem.url;
          }
          break;
        }
        // Escape: hide the results container
        case "Escape": {
          setIsVisible(false);
          break;
        }
        default:
          break;
      }
    },
    [isVisible, filteredResults, selectedIndex],
  );

  // ─── FocusIn handler ───────────────────────────────────────────
  // Source lines 100-106: show results on focus if input non-empty
  const handleFocusIn = useCallback(() => {
    if (query.length !== 0) {
      setIsVisible(true);
    }
  }, [query]);

  // ─── Click-outside detection ───────────────────────────────────
  // Source lines 108-114: document click listener that hides results
  // when the click target is outside the wrapper element
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsVisible(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  // ─── ResizeObserver (Firefox workaround) ───────────────────────
  // Source lines 90-98: syncs container height with dropdown child height.
  // Disabled in HtmlUnit test environment (window.isRunAsTest).
  // Also guarded against environments where ResizeObserver is unavailable
  // (e.g. jsdom in unit tests).
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      typeof ResizeObserver !== "undefined" &&
      !(window as unknown as Record<string, unknown>).isRunAsTest &&
      resultsRef.current &&
      resultsContainerRef.current
    ) {
      const containerEl = resultsContainerRef.current;
      const dropdownEl = resultsRef.current;
      const observer = new ResizeObserver(() => {
        if (containerEl && dropdownEl) {
          containerEl.style.height = dropdownEl.offsetHeight + "px";
        }
      });
      observer.observe(dropdownEl);
      return () => {
        observer.disconnect();
      };
    }
    return undefined;
  }, []);

  // ─── Container height synchronization ──────────────────────────
  // Source line 62: height = offsetHeight when showing
  // Source line 75: height = "1px" when hiding
  useEffect(() => {
    if (isVisible && resultsContainerRef.current && resultsRef.current) {
      resultsContainerRef.current.style.height =
        resultsRef.current.offsetHeight + "px";
    } else if (!isVisible && resultsContainerRef.current) {
      resultsContainerRef.current.style.height = "1px";
    }
  }, [isVisible, filteredResults]);

  // ─── Scroll into view for selected items ───────────────────────
  // Mirrors scrollAndSelect from keyboard.js lines 83-92:
  // Checks isInViewport (lines 95-103) and scrolls if needed.
  useEffect(() => {
    if (resultsRef.current && isVisible) {
      const items = resultsRef.current.querySelectorAll("a");
      const selectedItem = items[selectedIndex];
      if (selectedItem) {
        const rect = selectedItem.getBoundingClientRect();
        const inViewport =
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.right <= window.innerWidth;
        if (!inViewport) {
          selectedItem.scrollIntoView(false);
        }
      }
    }
  }, [selectedIndex, isVisible]);

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} className={className}>
      <input
        ref={inputRef}
        className="jenkins-search__input"
        type="search"
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocusIn}
      />
      <div
        ref={resultsContainerRef}
        className={`jenkins-search__results-container${
          isVisible
            ? " jenkins-search__results-container--visible"
            : ""
        }`}
      >
        <div ref={resultsRef} className="jenkins-dropdown">
          {filteredResults.length > 0
            ? filteredResults.map((item, index) => (
                <a
                  key={item.url}
                  className={`jenkins-dropdown__item${
                    index === selectedIndex ? ` ${SELECTED_CLASS}` : ""
                  }`}
                  href={item.url}
                >
                  {item.icon != null && item.icon !== "" && (
                    <div
                      className="jenkins-dropdown__item__icon"
                      dangerouslySetInnerHTML={{ __html: item.icon }}
                    />
                  )}
                  {xmlEscape(item.label)}
                </a>
              ))
            : query.length > 0
              ? (
                  <p className="jenkins-search__results__no-results-label">
                    No results
                  </p>
                )
              : null}
        </div>
      </div>
    </div>
  );
}

export default SearchBar;
