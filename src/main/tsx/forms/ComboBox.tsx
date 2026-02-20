/**
 * ComboBox.tsx — React Autocomplete ComboBox Component
 *
 * Replaces both:
 * - core/src/main/resources/lib/form/combobox.jelly (Jelly template)
 * - war/src/main/webapp/scripts/combobox.js (410-line legacy script)
 *
 * Provides an autocomplete text input with dynamic suggestion fetching from
 * Stapler's doFillXyzItems endpoints via React Query. Supports full keyboard
 * navigation, click selection, blur-delay dropdown dismissal, and preserves
 * the `combobox2` CSS class for plugin ecosystem compatibility.
 *
 * CSS classes consumed from src/main/scss/base/_style.scss:
 * - .comboBoxList  — dropdown container (z-index, shadow, background, scroll)
 * - .comboBoxItem  — individual suggestion item (padding, hover effects)
 *
 * CSS classes consumed from the Jenkins form input system:
 * - .jenkins-input — standard input styling
 * - .validated     — applied when checkUrl is present
 * - .combobox2     — legacy marker preserved for plugin compatibility
 *
 * @module forms/ComboBox
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { useStaplerQuery } from '@/hooks/useStaplerQuery';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Response shape from Stapler doFillXyzItems endpoints for combobox fields.
 * The endpoint returns a JSON object containing a `values` array of strings
 * that populate the suggestion dropdown.
 */
interface FillResponse {
  values: string[];
}

/**
 * Props for the ComboBox component.
 *
 * Maps directly from Jelly combobox.jelly attributes with additional
 * React-specific props for controlled input and event handling.
 *
 * Jelly attribute mapping:
 *   name    → name
 *   value   → value
 *   default → defaultValue
 *   clazz   → className
 *   field   → field
 *   checkUrl→ checkUrl
 *   checkMethod → checkMethod
 */
export interface ComboBoxProps {
  /** Input name attribute. Defaults to `'_.'+field` when field is provided. */
  name?: string;

  /** Controlled input value. When provided, the component is fully controlled. */
  value?: string;

  /** Default value used when value prop is not provided (maps Jelly 'default'). */
  defaultValue?: string;

  /** Additional CSS classes appended to the input element (maps Jelly 'clazz'). */
  className?: string;

  /** Databinding field name. Used to derive input name as `'_.'+field`. */
  field?: string;

  /** AJAX validation URL for server-side field validation (hudson-behavior.js). */
  checkUrl?: string;

  /** HTTP method for checkUrl validation requests. */
  checkMethod?: 'get' | 'post';

  /**
   * URL to fetch autocomplete suggestions from a Stapler doFillXyzItems endpoint.
   * Computed server-side by `descriptor.calcFillSettings(field, attrs)` in Jelly.
   */
  fillUrl?: string;

  /**
   * Space-separated names of form fields the fillUrl depends on.
   * When these fields change, suggestions should be refetched.
   */
  fillDependsOn?: string;

  /** Static list of suggestion strings used when fillUrl is not provided. */
  options?: string[];

  /** When true, the input is rendered in read-only mode with no dropdown. */
  readOnly?: boolean;

  /** Callback fired when the input value changes, receiving the new string value. */
  onChange?: (value: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Delay in milliseconds before hiding the dropdown on blur.
 * Matches the legacy combobox.js pattern where a short timeout allows
 * mousedown events on dropdown items to register before the dropdown hides.
 */
const BLUR_HIDE_DELAY_MS = 100;

/** Cache time for suggestions fetched from Stapler endpoints (30 seconds). */
const SUGGESTIONS_STALE_TIME_MS = 30_000;

/**
 * Module-level counter for generating unique, deterministic IDs for
 * ARIA associations. Avoids calling impure functions (Math.random)
 * during the React render phase.
 */
let comboBoxIdCounter = 0;

/**
 * Regex for stripping HTML tags from suggestion text.
 * Matches the legacy combobox.js chooseSelection() behavior where
 * innerHTML is cleaned via `text.replace(/<\/?[^>]+(>|$)/g, "")`.
 */
const HTML_TAG_REGEX = /<\/?[^>]+(>|$)/g;

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Strips HTML tags from a string, producing plain text.
 * Replicates the legacy combobox.js tag-stripping in chooseSelection().
 *
 * @param html - String potentially containing HTML markup
 * @returns Plain text with all HTML tags removed
 */
function stripHtmlTags(html: string): string {
  return html.replace(HTML_TAG_REGEX, '');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ComboBox — Autocomplete text input with dynamic suggestion dropdown.
 *
 * Replicates the full behavior of the legacy combobox.js (410 lines) that was
 * attached to inputs bearing the `combobox2` CSS class via the behaviorShim
 * pattern. The React replacement owns its DOM subtree entirely through JSX
 * rendering and manages state via hooks.
 *
 * Features:
 * - Dynamic suggestion fetching from Stapler doFillXyzItems via React Query
 * - Case-insensitive substring filtering as the user types
 * - Full keyboard navigation: ArrowUp, ArrowDown, Enter, Tab, Escape
 * - Click-outside detection for dropdown dismissal
 * - 100ms blur delay matching legacy behavior for click registration
 * - Preserves `combobox2` CSS class for plugin ecosystem compatibility
 * - Accessible ARIA combobox pattern with listbox and options
 * - HTML tag stripping on selection (matching legacy chooseSelection)
 *
 * @example
 * ```tsx
 * <ComboBox
 *   field="jdkName"
 *   fillUrl="/descriptorByName/hudson.model.JDK/fillNameItems"
 *   onChange={(value) => console.log('Selected:', value)}
 * />
 * ```
 *
 * @example Static options
 * ```tsx
 * <ComboBox
 *   name="priority"
 *   options={['High', 'Medium', 'Low']}
 *   defaultValue="Medium"
 * />
 * ```
 */
export function ComboBox({
  name,
  value,
  defaultValue = '',
  className,
  field,
  checkUrl,
  checkMethod,
  fillUrl,
  fillDependsOn,
  options: staticOptions,
  readOnly = false,
  onChange,
}: ComboBoxProps): React.JSX.Element {
  // -------------------------------------------------------------------------
  // Computed properties
  // -------------------------------------------------------------------------

  /**
   * Effective input name: explicit name prop takes precedence, then
   * field-derived name ('_.'+field), matching Jelly combobox.jelly logic:
   *   name = attrs.name ?: '_.'+attrs.field
   */
  const computedName = name ?? (field ? `_.${field}` : undefined);

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** Current text value of the input field. */
  const [inputValue, setInputValue] = useState<string>(value ?? defaultValue);

  /** Whether the suggestion dropdown is currently visible. */
  const [isOpen, setIsOpen] = useState<boolean>(false);

  /**
   * Index of the currently highlighted suggestion in filteredSuggestions.
   * -1 means no item is highlighted (matching legacy selectedItemIndex = -1).
   */
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  // -------------------------------------------------------------------------
  // Refs
  // -------------------------------------------------------------------------

  /** Reference to the text input DOM element for focus management. */
  const inputRef = useRef<HTMLInputElement>(null);

  /** Reference to the dropdown container for click-outside detection and scrolling. */
  const dropdownRef = useRef<HTMLDivElement>(null);

  /** Reference to the blur timeout for cleanup and cancellation. */
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Stable unique identifier for ARIA associations between the input,
   * listbox, and option elements. Uses useState lazy initializer to
   * generate a deterministic ID once per component instance, avoiding
   * impure function calls during render.
   */
  const [instanceId] = useState<string>(
    () => `combobox-${++comboBoxIdCounter}`,
  );

  // -------------------------------------------------------------------------
  // Data fetching via React Query
  // -------------------------------------------------------------------------

  /**
   * Fetch suggestions from the Stapler doFillXyzItems endpoint when fillUrl
   * is provided. The query is disabled when no fillUrl is set. Results are
   * cached for SUGGESTIONS_STALE_TIME_MS to reduce redundant network calls.
   *
   * Replaces the legacy combobox.js AJAX callback pattern:
   *   callback.call(combobox, currentValue)  →  useStaplerQuery(fillUrl)
   */
  const { data: fetchedData, isLoading } = useStaplerQuery<FillResponse>({
    url: fillUrl ?? '',
    queryKey: ['combobox-fill', fillUrl ?? '', fillDependsOn ?? ''],
    enabled: Boolean(fillUrl),
    staleTime: SUGGESTIONS_STALE_TIME_MS,
  });

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  /**
   * Merged list of all available suggestions. Fetched data from fillUrl
   * takes precedence over static options, matching the legacy behavior
   * where setItems() overwrites the availableItems array.
   */
  const allOptions = useMemo<string[]>(() => {
    if (fetchedData?.values && fetchedData.values.length > 0) {
      return fetchedData.values;
    }
    return staticOptions ?? [];
  }, [fetchedData, staticOptions]);

  /**
   * Suggestions filtered by the current input value. Uses case-insensitive
   * substring matching on the plain text content (after HTML stripping).
   * When the input is empty, all options are returned (matching legacy
   * behavior where focus shows the full list).
   */
  const filteredSuggestions = useMemo<string[]>(() => {
    if (allOptions.length === 0) {
      return [];
    }
    const trimmed = inputValue.trim().toLowerCase();
    if (trimmed === '') {
      return allOptions;
    }
    return allOptions.filter((item) => {
      /* Strip HTML tags before comparing — items may contain markup
         (e.g., <b>highlighted</b> text) from Stapler responses. */
      const plainItem = stripHtmlTags(item);
      return plainItem.toLowerCase().includes(trimmed);
    });
  }, [allOptions, inputValue]);

  /** Whether the dropdown should be rendered and visible. */
  const showDropdown = isOpen && filteredSuggestions.length > 0 && !readOnly;

  // -------------------------------------------------------------------------
  // CSS class computation
  // -------------------------------------------------------------------------

  /**
   * Build the complete CSS class string for the input element.
   * Preserves `combobox2` class for plugin ecosystem compatibility —
   * this is the marker class that the legacy behaviorShim pattern used
   * to identify combobox inputs for behavior attachment.
   *
   * Matches Jelly output:
   *   class="combobox2 jenkins-input {clazz} {checkUrl ? 'validated' : ''}"
   */
  const inputClassName = useMemo<string>(() => {
    const classes: string[] = ['combobox2', 'jenkins-input'];
    if (className) {
      classes.push(className);
    }
    if (checkUrl) {
      classes.push('validated');
    }
    return classes.join(' ');
  }, [className, checkUrl]);

  // -------------------------------------------------------------------------
  // Effect: sync external value prop for controlled usage
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (value !== undefined) {
      setInputValue(value);
    }
  }, [value]);

  // -------------------------------------------------------------------------
  // Effect: click-outside handler for dropdown dismissal
  // -------------------------------------------------------------------------

  useEffect(() => {
    /**
     * Close the dropdown when the user clicks outside both the input
     * and the dropdown container. Uses mousedown (not click) to capture
     * the event before blur fires.
     */
    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target as Node;
      const inputEl = inputRef.current;
      const dropdownEl = dropdownRef.current;

      if (inputEl && !inputEl.contains(target)) {
        /* If dropdown exists and click is inside it, keep open */
        if (dropdownEl && dropdownEl.contains(target)) {
          return;
        }
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Effect: cleanup blur timeout on unmount
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // Effect: scroll highlighted suggestion into view within dropdown
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[role="option"]');
      const highlightedEl = items[highlightedIndex] as HTMLElement | undefined;
      if (highlightedEl && typeof highlightedEl.scrollIntoView === 'function') {
        highlightedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isOpen, highlightedIndex]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  /**
   * Select a suggestion from the dropdown. Strips HTML tags from the
   * suggestion text (matching legacy combobox.js chooseSelection() behavior),
   * updates the input value, closes the dropdown, and notifies via onChange.
   *
   * Legacy equivalent: combobox.chooseSelection()
   */
  const selectSuggestion = useCallback(
    (suggestion: string): void => {
      const plainText = stripHtmlTags(suggestion);
      setInputValue(plainText);
      setIsOpen(false);
      setHighlightedIndex(-1);
      onChange?.(plainText);
      inputRef.current?.focus();
    },
    [onChange],
  );

  /**
   * Handle input value changes. Opens the dropdown to show filtered
   * suggestions, resets highlight index, and notifies parent via onChange.
   *
   * Legacy equivalent: combobox.valueChanged() + combobox.populateDropdown()
   */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const newValue = e.target.value;
      setInputValue(newValue);
      setIsOpen(true);
      setHighlightedIndex(-1);
      onChange?.(newValue);
    },
    [onChange],
  );

  /**
   * Keyboard navigation handler implementing the same key bindings as
   * the legacy combobox.js onKeyDown handler:
   *
   * - ArrowDown (keyCode 40): highlight next suggestion, wrap to first
   * - ArrowUp (keyCode 38):   highlight previous suggestion, wrap to last
   * - Enter (keyCode 13):     select highlighted suggestion
   * - Tab (keyCode 9):        select highlighted suggestion, let focus move
   * - Escape (keyCode 27):    close dropdown without selection
   *
   * The legacy code used keyCode numeric values; this implementation uses
   * the modern KeyboardEvent.key string identifiers.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      /* Open dropdown on arrow keys when currently closed */
      if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        setIsOpen(true);
        if (filteredSuggestions.length > 0) {
          setHighlightedIndex(0);
        }
        e.preventDefault();
        return;
      }

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setHighlightedIndex((prev) => {
            const next = prev + 1;
            return next >= filteredSuggestions.length ? 0 : next;
          });
          break;
        }

        case 'ArrowUp': {
          e.preventDefault();
          setHighlightedIndex((prev) => {
            const next = prev - 1;
            return next < 0 ? filteredSuggestions.length - 1 : next;
          });
          break;
        }

        case 'Enter': {
          if (
            isOpen &&
            highlightedIndex >= 0 &&
            highlightedIndex < filteredSuggestions.length
          ) {
            e.preventDefault();
            selectSuggestion(filteredSuggestions[highlightedIndex]);
          }
          break;
        }

        case 'Tab': {
          /* Select the highlighted item on Tab but allow focus to move */
          if (
            isOpen &&
            highlightedIndex >= 0 &&
            highlightedIndex < filteredSuggestions.length
          ) {
            selectSuggestion(filteredSuggestions[highlightedIndex]);
          }
          setIsOpen(false);
          break;
        }

        case 'Escape': {
          e.preventDefault();
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
        }

        default:
          break;
      }
    },
    [isOpen, highlightedIndex, filteredSuggestions, selectSuggestion],
  );

  /**
   * Focus handler: opens the dropdown and highlights the first suggestion.
   * Cancels any pending blur timeout (matching legacy pattern where
   * onfocus triggers valueChanged and repopulate).
   */
  const handleFocus = useCallback((): void => {
    /* Cancel any pending blur-hide timeout */
    if (blurTimeoutRef.current !== null) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    if (!readOnly && allOptions.length > 0) {
      setIsOpen(true);
      if (filteredSuggestions.length > 0) {
        setHighlightedIndex(0);
      }
    }
  }, [readOnly, allOptions.length, filteredSuggestions.length]);

  /**
   * Blur handler with BLUR_HIDE_DELAY_MS delay before hiding the dropdown.
   * This matches the legacy combobox.js behavior that uses a 100ms timeout
   * to allow mousedown events on dropdown items to register before the
   * dropdown is removed from the DOM.
   *
   * Legacy equivalent: field.onfocusout with setTimeout
   */
  const handleBlur = useCallback((): void => {
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setHighlightedIndex(-1);
      blurTimeoutRef.current = null;
    }, BLUR_HIDE_DELAY_MS);
  }, []);

  // -------------------------------------------------------------------------
  // ARIA IDs for accessible associations
  // -------------------------------------------------------------------------

  const listboxId = `${instanceId}-listbox`;

  /**
   * Generate a unique ID for each option element, used by
   * aria-activedescendant to announce the highlighted option.
   */
  const getOptionId = useCallback(
    (index: number): string => `${instanceId}-option-${index}`,
    [instanceId],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className="jenkins-combobox-container"
      /* Structural positioning for the dropdown to anchor against.
         The legacy combobox.js used document.body + absolute coords;
         the React version uses a relative parent pattern instead. */
      style={{ position: 'relative' }}
    >
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        className={inputClassName}
        name={computedName}
        value={inputValue}
        readOnly={readOnly}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        /* ARIA combobox pattern — associates input with the listbox */
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
        aria-controls={showDropdown ? listboxId : undefined}
        aria-activedescendant={
          showDropdown && highlightedIndex >= 0
            ? getOptionId(highlightedIndex)
            : undefined
        }
        /* Data attributes for plugin/validation compatibility.
           The legacy Jelly rendered checkUrl/checkMethod as HTML attributes;
           React uses data-* attributes for HTML5 compliance. */
        data-check-url={checkUrl || undefined}
        data-check-method={checkMethod || undefined}
        data-fill-url={fillUrl || undefined}
        data-fill-depends-on={fillDependsOn || undefined}
      />

      {showDropdown && (
        <div
          ref={dropdownRef}
          id={listboxId}
          className="comboBoxList"
          role="listbox"
          /* Dropdown positioning: anchored absolutely below the input.
             The legacy combobox.js applied position:absolute + moveDropdown()
             inline; these structural layout properties have no design token
             equivalent. The .comboBoxList SCSS class provides z-index,
             background, shadow, scrolling, and border-radius. */
          style={{
            position: 'absolute',
            insetInlineStart: 0,
            insetBlockStart: '100%',
            inlineSize: '100%',
          }}
        >
          {filteredSuggestions.map((suggestion, index) => {
            const isHighlighted = index === highlightedIndex;
            return (
              <div
                key={`${suggestion}-${index}`}
                id={getOptionId(index)}
                className={
                  isHighlighted
                    ? 'comboBoxItem comboBoxSelectedItem'
                    : 'comboBoxItem'
                }
                role="option"
                aria-selected={isHighlighted}
                onMouseDown={(e: React.MouseEvent): void => {
                  /* Prevent input blur so the click selection registers
                     before the dropdown hides — same reason the legacy code
                     used a 100ms blur timeout. */
                  e.preventDefault();
                  selectSuggestion(suggestion);
                }}
                onMouseEnter={(): void => {
                  setHighlightedIndex(index);
                }}
                /* Render suggestion HTML preserving any markup from Stapler
                   endpoints (e.g., <b>bold</b> highlighting). Matches legacy
                   combobox.js populateDropdown() using div.innerHTML = item. */
                dangerouslySetInnerHTML={{ __html: suggestion }}
              />
            );
          })}

          {/* Loading indicator shown while Stapler endpoint is being fetched */}
          {isLoading && filteredSuggestions.length === 0 && (
            <div className="comboBoxItem" aria-disabled="true">
              Loading\u2026
            </div>
          )}
        </div>
      )}

      {/* Loading indicator when dropdown is closed but query is in progress */}
      {isLoading && !showDropdown && fillUrl && (
        <span className="jenkins-spinner" aria-label="Loading suggestions" />
      )}
    </div>
  );
}
