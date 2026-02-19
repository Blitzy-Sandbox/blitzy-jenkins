import type React from 'react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { xmlEscape } from '@/utils/security';

// ---------------------------------------------------------------------------
// SVG Constants (byte-for-byte from src/main/js/components/command-palette/symbols.js)
// Rendered via dangerouslySetInnerHTML — safe because these are internal
// constants, never user input.
// ---------------------------------------------------------------------------

const EXTERNAL_LINK = `<svg class="jenkins-command-palette__results__item__chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M384 224v184a40 40 0 01-40 40H104a40 40 0 01-40-40V168a40 40 0 0140-40h167.48M336 64h112v112M224 288L440 72" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="40"/></svg>`;

const HELP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 40a216 216 0 10216 216A216 216 0 00256 40z" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="38"/><path d="M200 202.29s.84-17.5 19.57-32.57C230.68 160.77 244 158.18 256 158c10.93-.14 20.69 1.67 26.53 4.45 10 4.76 29.47 16.38 29.47 41.09 0 26-17 37.81-36.37 50.8S251 281.43 251 296" fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="38"/><circle cx="250" cy="360" r="25" fill="currentColor"/></svg>`;

// ---------------------------------------------------------------------------
// TypeScript Interfaces
// ---------------------------------------------------------------------------

/** Represents a single search result item displayed in the command palette. */
interface LinkResultData {
  /** SVG markup string (symbol type) or image URL (image type) */
  icon: string;
  /** Display text for the result */
  label: string;
  /** Determines how the icon is rendered: inline SVG vs &lt;img&gt; */
  type: 'symbol' | 'image';
  /** Navigation URL activated on selection */
  url: string;
  /** Category grouping key; null items appear ungrouped */
  group: string | null;
  /** When true, an external-link badge is appended */
  isExternal?: boolean;
}

/** Raw suggestion shape returned by the Stapler search REST endpoint. */
interface SearchSuggestion {
  name: string;
  url: string;
  icon: string;
  type: 'symbol' | 'image';
  group: string;
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Groups search results by their `group` property.
 *
 * Entries with `group === undefined` are skipped. Entries with `group === null`
 * are included under the stringified key `"null"` — the renderer skips the
 * heading for that key (source index.js line 89).
 *
 * Port of src/main/js/components/command-palette/utils.js
 */
function groupResultsByCategory(
  items: LinkResultData[],
): Record<string, LinkResultData[]> {
  return items.reduce<Record<string, LinkResultData[]>>((hash, obj) => {
    if (obj.group === undefined) {
      return hash;
    }
    const key = String(obj.group);
    return Object.assign(hash, {
      [key]: (hash[key] || []).concat(obj),
    });
  }, {});
}

/**
 * Normalises a Stapler-relative URL by stripping a leading `/` and prepending
 * the Jenkins root URL.
 *
 * Port of src/main/js/components/command-palette/datasources.js correctAddress
 */
function correctAddress(url: string, rootUrl: string): string {
  let normalised = url;
  if (normalised.startsWith('/')) {
    normalised = normalised.substring(1);
  }
  return rootUrl + '/' + normalised;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Ctrl+K / Cmd+K Command Palette — keyboard-activated quick-navigation dialog.
 *
 * Consolidates the legacy five-file imperative implementation
 * (`index.js`, `datasources.js`, `models.js`, `symbols.js`, `utils.js`) into
 * a single declarative React component.  It consumes the Stapler search
 * endpoint via `fetch`, renders grouped results with keyboard navigation, and
 * supports the closing CSS animation via the native `<dialog>` element.
 *
 * Returns `null` when the trigger button (`#root-action-SearchAction`) is
 * absent from the DOM.
 */
export default function CommandPalette(): React.JSX.Element | null {
  // ---- State ----------------------------------------------------------------
  // Lazy initialiser: check DOM once at mount time — the trigger button is
  // rendered by the server-side Jelly shell before React hydrates.
  const [isActive] = useState(
    () => document.getElementById('root-action-SearchAction') !== null,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LinkResultData[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [containerHeight, setContainerHeight] = useState<number | undefined>(
    undefined,
  );

  // ---- Refs -----------------------------------------------------------------
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- I18n strings (read once from hidden DOM node provided by Jelly shell) -
  const i18n = useMemo(() => {
    const el = document.getElementById('command-palette-i18n');
    return {
      getHelp: el?.dataset.getHelp ?? 'Get Help',
      noResultsFor: el?.dataset.noResultsFor ?? 'No results for',
    };
  }, []);

  // ---- Search execution against Stapler REST endpoint -----------------------
  const executeSearch = useCallback(
    (searchQuery: string) => {
      const searchUrl = document.body.dataset.searchUrl;
      const rootUrl = document.head?.dataset.rooturl ?? '';

      // Empty query → show "Get Help" shortcut (source index.js lines 64-74)
      if (searchQuery.length === 0) {
        setResults([
          {
            icon: HELP,
            type: 'symbol',
            label: i18n.getHelp,
            url: document.body.dataset.searchHelpUrl ?? '',
            isExternal: true,
            group: null,
          },
        ]);
        setSelectedIndex(0);
        if (spinnerTimerRef.current) {
          clearTimeout(spinnerTimerRef.current);
        }
        setIsLoading(false);
        return;
      }

      // No search endpoint configured → clear results
      if (!searchUrl) {
        setResults([]);
        if (spinnerTimerRef.current) {
          clearTimeout(spinnerTimerRef.current);
        }
        setIsLoading(false);
        return;
      }

      // Fetch from Stapler search endpoint (source datasources.js execute())
      fetch(`${searchUrl}?query=${encodeURIComponent(searchQuery)}`)
        .then((response) => response.json())
        .then((data: { suggestions?: SearchSuggestion[] }) => {
          const suggestions: LinkResultData[] = (
            data.suggestions ?? []
          ).map((s: SearchSuggestion) => ({
            icon: s.icon,
            type: s.type,
            label: s.name,
            url: correctAddress(s.url, rootUrl),
            group: s.group,
          }));
          setResults(suggestions);
          setSelectedIndex(0);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => {
          if (spinnerTimerRef.current) {
            clearTimeout(spinnerTimerRef.current);
          }
          setIsLoading(false);
        });
    },
    [i18n.getHelp],
  );

  // ---- Show palette (source index.js lines 137-143) -------------------------
  const showCommandPalette = useCallback(() => {
    setIsOpen(true);
    dialogRef.current?.showModal();
    // Focus input and select text after the dialog becomes visible
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (inputRef.current) {
        inputRef.current.setSelectionRange(0, inputRef.current.value.length);
      }
    });
    // Trigger initial results render with the current query value
    executeSearch(inputRef.current?.value ?? '');
  }, [executeSearch]);

  // ---- Hide palette with closing animation (source index.js lines 145-156) --
  const hideCommandPalette = useCallback(() => {
    setIsClosing(true);
    // Set closing attribute immediately for CSS animation trigger
    dialogRef.current?.setAttribute('closing', '');
  }, []);

  // ---- Toggle show/hide -----------------------------------------------------
  const togglePalette = useCallback(() => {
    if (isOpen) {
      hideCommandPalette();
    } else {
      showCommandPalette();
    }
  }, [isOpen, hideCommandPalette, showCommandPalette]);

  // ---- Animation end: finalise close (source index.js lines 147-155) --------
  const handleAnimationEnd = useCallback(() => {
    if (isClosing) {
      dialogRef.current?.removeAttribute('closing');
      dialogRef.current?.close();
      setIsClosing(false);
      setIsOpen(false);
    }
  }, [isClosing]);

  // ---- Backdrop click dismisses palette (source index.js lines 52-58) -------
  const handleWrapperClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        hideCommandPalette();
      }
    },
    [hideCommandPalette],
  );

  // ---- Input change with debounced search & spinner (source lines 123-134) --
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);

      // Debounced spinner — show after 150 ms of inactivity (source line 123)
      if (spinnerTimerRef.current) {
        clearTimeout(spinnerTimerRef.current);
      }
      spinnerTimerRef.current = setTimeout(() => setIsLoading(true), 150);

      // Debounced search — execute after 150 ms of inactivity (source line 128)
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(
        () => executeSearch(value),
        150,
      );
    },
    [executeSearch],
  );

  // ---- Flat item list for keyboard index mapping ----------------------------
  const flatItems = useMemo(() => {
    const grouped = groupResultsByCategory(results);
    const flat: LinkResultData[] = [];
    for (const groupItems of Object.values(grouped)) {
      flat.push(...groupItems);
    }
    return flat;
  }, [results]);

  // ---- Keyboard navigation (replaces makeKeyboardNavigable) -----------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const maxLength = flatItems.length;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (maxLength > 0) {
            setSelectedIndex((prev) => (prev + 1) % maxLength);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (maxLength > 0) {
            setSelectedIndex((prev) => (prev - 1 + maxLength) % maxLength);
          }
          break;
        case 'Enter': {
          e.preventDefault();
          const item = flatItems[selectedIndex];
          if (item) {
            window.location.href = item.url;
          }
          break;
        }
        case 'Escape':
          e.preventDefault();
          hideCommandPalette();
          break;
      }
    },
    [flatItems, selectedIndex, hideCommandPalette],
  );

  // ---- Register Ctrl+K / Cmd+K keyboard shortcut ----------------------------
  useKeyboardShortcut('CMD+K', togglePalette, { enabled: isActive });

  // ---- Attach click handler to trigger button in the page header ------------
  useEffect(() => {
    const button = document.getElementById('root-action-SearchAction');
    if (!button) {
      return;
    }
    button.addEventListener('click', togglePalette);
    return () => button.removeEventListener('click', togglePalette);
  }, [togglePalette]);

  // ---- Prevent native <dialog> Escape (we animate close ourselves) ----------
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const handleCancel = (e: Event) => {
      e.preventDefault();
      hideCommandPalette();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [hideCommandPalette]);

  // ---- Results container height for CSS transitions (source line 115) -------
  useEffect(() => {
    if (resultsRef.current) {
      setContainerHeight(resultsRef.current.offsetHeight);
    }
  }, [results]);

  // ---- Scroll selected item into view on keyboard navigation ----------------
  useEffect(() => {
    if (!resultsRef.current) {
      return;
    }
    const links = resultsRef.current.querySelectorAll('a');
    const selected = links[selectedIndex];
    if (selected && typeof selected.scrollIntoView === 'function') {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // ---- Cleanup debounce timers on unmount -----------------------------------
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (spinnerTimerRef.current) {
        clearTimeout(spinnerTimerRef.current);
      }
    };
  }, []);

  // ---- Bail out if the trigger button is not present in the page ------------
  if (!isActive) {
    return null;
  }

  // ---- Build grouped results for rendering ----------------------------------
  const groupedResults = groupResultsByCategory(results);
  let currentFlatIndex = 0;

  // ---- Render ---------------------------------------------------------------
  return (
    <dialog
      ref={dialogRef}
      className="jenkins-command-palette"
      onAnimationEnd={handleAnimationEnd}
    >
      <div
        className="jenkins-command-palette__wrapper"
        onClick={handleWrapperClick}
      >
        <div>
          {/* Search bar */}
          <div
            className={`jenkins-command-palette__search${
              isLoading ? ' jenkins-search--loading' : ''
            }`}
          >
            <input
              ref={inputRef}
              id="command-bar"
              type="text"
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              value={query}
              autoComplete="off"
            />
          </div>

          {/* Results container with animated height */}
          <div
            id="search-results-container"
            style={
              containerHeight !== undefined
                ? { height: `${containerHeight}px` }
                : undefined
            }
          >
            <div id="search-results" ref={resultsRef}>
              {/* Grouped result items */}
              {Object.entries(groupedResults).flatMap(
                ([group, items]) => {
                  const elements: React.JSX.Element[] = [];

                  // Group heading (skip for ungrouped / null group)
                  if (group !== 'null') {
                    elements.push(
                      <p
                        key={`heading-${group}`}
                        className="jenkins-command-palette__results__heading"
                      >
                        {group}
                      </p>,
                    );
                  }

                  // Result items within the group
                  items.forEach((item, idx) => {
                    const itemFlatIndex = currentFlatIndex;
                    currentFlatIndex += 1;

                    elements.push(
                      <a
                        key={`item-${group}-${idx}`}
                        className={`jenkins-command-palette__results__item${
                          itemFlatIndex === selectedIndex
                            ? ' jenkins-command-palette__results__item--hover'
                            : ''
                        }`}
                        href={xmlEscape(item.url)}
                        onMouseEnter={() =>
                          setSelectedIndex(itemFlatIndex)
                        }
                      >
                        {/* Icon — image vs inline SVG */}
                        {item.type === 'image' ? (
                          <img
                            alt={xmlEscape(item.label)}
                            className="jenkins-command-palette__results__item__icon jenkins-avatar"
                            src={item.icon}
                          />
                        ) : (
                          <div
                            className="jenkins-command-palette__results__item__icon"
                            dangerouslySetInnerHTML={{
                              __html: item.icon,
                            }}
                          />
                        )}

                        {/* Label — XSS escaped */}
                        {xmlEscape(item.label)}

                        {/* External link badge */}
                        {item.isExternal && (
                          <span
                            dangerouslySetInnerHTML={{
                              __html: EXTERNAL_LINK,
                            }}
                          />
                        )}
                      </a>,
                    );
                  });

                  return elements;
                },
              )}

              {/* No results message with XSS-escaped query (source lines 104-112) */}
              {query.length > 0 && results.length === 0 && !isLoading && (
                <p className="jenkins-command-palette__info">
                  <span>{i18n.noResultsFor}</span>{' '}
                  {xmlEscape(query)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
