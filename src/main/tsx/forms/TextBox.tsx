/**
 * TextBox — React Text Input Component
 *
 * Replaces `core/src/main/resources/lib/form/textbox.jelly`.
 * Renders a styled text input with optional AJAX validation, autocomplete
 * suggestion fetching via Stapler REST endpoints, and read-only display mode.
 *
 * Key behaviors replicated from the Jelly template:
 * - CSS classes: `jenkins-input` always applied; `validated` when `checkUrl`
 *   is provided; `auto-complete` when `autoCompleteUrl` is provided; plus any
 *   custom validation classes (e.g. `required`, `number`, `positive-number`)
 * - Name computation: `name ?? ('_.' + field)` mirroring Jelly's
 *   `attrs.name ?: '_.'+attrs.field`
 * - Value fallback chain: `value ?? defaultValue ?? ''` mirroring Jelly's
 *   `attrs.value ?: instance[attrs.field] ?: default`
 * - Read-only mode: replaces `<f:possibleReadOnlyField>` with a plain
 *   `<span>` display instead of `<input>`
 * - Autocomplete: replaces the legacy jQuery AJAX behavior triggered by the
 *   `auto-complete` CSS class in `hudson-behavior.js` with a React Query
 *   driven suggestion dropdown, supporting multi-value delimiter via
 *   `autoCompleteDelimChar`
 * - AJAX validation: data attributes (`data-check-url`, `data-check-depends-on`,
 *   `data-check-method`) are emitted so that any remaining legacy validation
 *   listeners or future React validation hooks can consume them
 *
 * @module forms/TextBox
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useStaplerQuery } from "@/hooks/useStaplerQuery";

// =============================================================================
// Props Interface
// =============================================================================

/**
 * Props for the {@link TextBox} component.
 *
 * Maps every Jelly `<f:textbox>` attribute to a typed React prop, plus
 * React-specific additions (`readOnly`, `onChange`, `type`).
 */
export interface TextBoxProps {
  /** Databinding field name. Used to infer `name` (`'_.' + field`) when `name` is not set. */
  field?: string;

  /** Override field name used for computing the autocomplete URL. Defaults to `field`. */
  autoCompleteField?: string;

  /** HTML `name` attribute on the `<input>`. Defaults to `'_.' + field`. */
  name?: string;

  /** Controlled value of the text input. */
  value?: string;

  /** Default value used when both `value` and the databinding instance field are empty. */
  defaultValue?: string;

  /**
   * Additional CSS class(es) applied to the `<input>`.
   * Common validation markers: `'required'`, `'number'`, `'positive-number'`.
   * Multiple classes can be space-separated: `'required number'`.
   */
  className?: string;

  /** Placeholder text rendered inside the input when empty. */
  placeholder?: string;

  /** Override message for client-side validation failure (e.g. `clazz="required"`). */
  checkMessage?: string;

  /**
   * URL for AJAX field validation. When present, the `validated` CSS class is
   * added and `data-check-url` is emitted on the `<input>`.
   */
  checkUrl?: string;

  /** Space-separated field names whose values are sent during AJAX validation. */
  checkDependsOn?: string;

  /**
   * HTTP method for AJAX validation requests.
   * Defaults to POST since Jenkins 2.285. Specify `'get'` (lowercase) for GET.
   */
  checkMethod?: "get" | "post";

  /**
   * URL for fetching autocomplete suggestions. When present, the `auto-complete`
   * CSS class is added and a suggestion dropdown is rendered below the input.
   */
  autoCompleteUrl?: string;

  /**
   * Single character delimiter for multi-value autocomplete. When set, selected
   * suggestions are appended (with the delimiter) to the existing input value
   * rather than replacing the entire value.
   */
  autoCompleteDelimChar?: string;

  /** When `true`, renders a read-only text display instead of an editable input. */
  readOnly?: boolean;

  /** Callback invoked when the input value changes. Receives the new string value. */
  onChange?: (value: string) => void;

  /** HTML input `type` attribute. Defaults to `'text'`. */
  type?: string;
}

// =============================================================================
// Autocomplete Response Type
// =============================================================================

/** Shape returned by Stapler autocomplete endpoints. */
interface AutocompleteSuggestion {
  /** Display label for the suggestion. */
  name: string;
}

// =============================================================================
// Helper — extract the "active token" for multi-value autocomplete
// =============================================================================

/**
 * When a delimiter character is configured, the autocomplete operates on the
 * last token after the delimiter. This helper extracts that token.
 */
function getActiveToken(fullValue: string, delimChar?: string): string {
  if (!delimChar || delimChar.length === 0) {
    return fullValue;
  }
  const parts = fullValue.split(delimChar);
  return (parts[parts.length - 1] ?? "").trimStart();
}

/**
 * Replaces the last token (after the delimiter) with the selected suggestion,
 * preserving all preceding tokens.
 */
function replaceActiveToken(
  fullValue: string,
  suggestion: string,
  delimChar?: string,
): string {
  if (!delimChar || delimChar.length === 0) {
    return suggestion;
  }
  const parts = fullValue.split(delimChar);
  parts[parts.length - 1] = " " + suggestion;
  return parts.join(delimChar) + delimChar + " ";
}

// =============================================================================
// TextBox Component
// =============================================================================

/**
 * React text input component replacing `<f:textbox>` from Jelly.
 *
 * Renders a `<input type="text">` (or specified type) with Jenkins form
 * styling, conditional validation and autocomplete CSS classes, and an
 * optional autocomplete suggestions dropdown powered by `useStaplerQuery`.
 *
 * In read-only mode, renders a `<span>` with the value text instead.
 */
export function TextBox({
  field,
  autoCompleteField,
  name: nameProp,
  value: valueProp,
  defaultValue,
  className,
  placeholder,
  checkMessage,
  checkUrl,
  checkDependsOn,
  checkMethod,
  autoCompleteUrl,
  autoCompleteDelimChar,
  readOnly = false,
  onChange,
  type = "text",
}: TextBoxProps): React.JSX.Element {
  // ---------------------------------------------------------------------------
  // Computed attributes (mirrors Jelly's <j:set var="name" …/> logic)
  // ---------------------------------------------------------------------------
  const computedName = nameProp ?? (field ? "_." + field : undefined);
  const initialValue = valueProp ?? defaultValue ?? "";

  // autoCompleteField overrides field for autocomplete URL construction.
  // In the Jelly template: autoCompleteField = attrs.autoCompleteField ?: attrs.field
  // This value is used as context for the autocomplete query key.
  const resolvedAutoCompleteField = autoCompleteField ?? field;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [internalValue, setInternalValue] = useState<string>(initialValue);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  // ---------------------------------------------------------------------------
  // Refs
  // ---------------------------------------------------------------------------
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Determine the current effective value (controlled vs uncontrolled)
  const currentValue =
    valueProp !== undefined ? valueProp : internalValue;

  // ---------------------------------------------------------------------------
  // Autocomplete query token
  // ---------------------------------------------------------------------------
  const activeToken = getActiveToken(currentValue, autoCompleteDelimChar);
  const shouldFetchSuggestions =
    !!autoCompleteUrl &&
    showSuggestions &&
    activeToken.length > 0;

  const { data: suggestionsData, isLoading: suggestionsLoading } =
    useStaplerQuery<AutocompleteSuggestion[]>({
      url: `${autoCompleteUrl}?value=${encodeURIComponent(activeToken)}`,
      queryKey: ["textbox-autocomplete", autoCompleteUrl, resolvedAutoCompleteField, activeToken],
      enabled: shouldFetchSuggestions,
      staleTime: 30_000, // cache suggestions briefly
    });

  const suggestions: AutocompleteSuggestion[] = useMemo(
    () => suggestionsData ?? [],
    [suggestionsData],
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /** Handle input value change — update internal state and notify parent. */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInternalValue(newValue);
      onChange?.(newValue);

      // Show suggestions dropdown when autocomplete is active and there is input
      if (autoCompleteUrl) {
        const token = getActiveToken(newValue, autoCompleteDelimChar);
        setShowSuggestions(token.length > 0);
        setHighlightedIndex(-1);
      }
    },
    [onChange, autoCompleteUrl, autoCompleteDelimChar],
  );

  /** Handle selecting a suggestion from the autocomplete dropdown. */
  const handleSuggestionSelect = useCallback(
    (suggestion: string) => {
      const newValue = replaceActiveToken(
        currentValue,
        suggestion,
        autoCompleteDelimChar,
      );
      setInternalValue(newValue);
      onChange?.(newValue);
      setShowSuggestions(false);
      setHighlightedIndex(-1);
      inputRef.current?.focus();
    },
    [currentValue, autoCompleteDelimChar, onChange],
  );

  /** Handle keyboard navigation in the autocomplete dropdown. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showSuggestions || suggestions.length === 0) {
        return;
      }

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0,
          );
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1,
          );
          break;
        }
        case "Enter": {
          if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
            e.preventDefault();
            handleSuggestionSelect(suggestions[highlightedIndex].name);
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          setShowSuggestions(false);
          setHighlightedIndex(-1);
          break;
        }
        default:
          break;
      }
    },
    [showSuggestions, suggestions, highlightedIndex, handleSuggestionSelect],
  );

  // ---------------------------------------------------------------------------
  // Click-outside detection for autocomplete dropdown
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!showSuggestions) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        inputRef.current &&
        !inputRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setShowSuggestions(false);
        setHighlightedIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSuggestions]);

  // ---------------------------------------------------------------------------
  // CSS class computation
  // ---------------------------------------------------------------------------
  const inputClasses = [
    "jenkins-input",
    checkUrl ? "validated" : "",
    autoCompleteUrl ? "auto-complete" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // ---------------------------------------------------------------------------
  // Read-only rendering
  // ---------------------------------------------------------------------------
  if (readOnly) {
    return (
      <span className="jenkins-readonly" aria-readonly="true">
        {currentValue}
      </span>
    );
  }

  // ---------------------------------------------------------------------------
  // Editable rendering
  // ---------------------------------------------------------------------------
  return (
    <div className="jenkins-textbox-wrapper" style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type={type}
        className={inputClasses}
        name={computedName}
        value={currentValue}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={autoCompleteUrl ? handleKeyDown : undefined}
        onFocus={
          autoCompleteUrl
            ? () => {
                const token = getActiveToken(
                  currentValue,
                  autoCompleteDelimChar,
                );
                if (token.length > 0) {
                  setShowSuggestions(true);
                }
              }
            : undefined
        }
        autoComplete={autoCompleteUrl ? "off" : undefined}
        aria-autocomplete={autoCompleteUrl ? "list" : undefined}
        aria-expanded={
          autoCompleteUrl ? showSuggestions && suggestions.length > 0 : undefined
        }
        aria-haspopup={autoCompleteUrl ? "listbox" : undefined}
        /* AJAX validation data attributes */
        data-check-url={checkUrl || undefined}
        data-check-depends-on={checkDependsOn || undefined}
        data-check-method={checkMethod || undefined}
        data-check-message={checkMessage || undefined}
      />

      {/* Autocomplete suggestions dropdown */}
      {autoCompleteUrl && showSuggestions && (
        <div
          ref={dropdownRef}
          className="jenkins-textbox-autocomplete"
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 1000,
            background: "var(--input-color, #fff)",
            border: "1px solid var(--input-border, #ccc)",
            borderRadius: "var(--form-input-border-radius, 0.375rem)",
            maxHeight: "12rem",
            overflowY: "auto",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          }}
        >
          {suggestionsLoading && (
            <div
              className="jenkins-textbox-autocomplete__loading"
              style={{ padding: "0.5rem 0.75rem", color: "var(--text-color-secondary)" }}
            >
              Loading…
            </div>
          )}

          {!suggestionsLoading && suggestions.length === 0 && (
            <div
              className="jenkins-textbox-autocomplete__empty"
              style={{ padding: "0.5rem 0.75rem", color: "var(--text-color-secondary)" }}
            >
              No suggestions
            </div>
          )}

          {!suggestionsLoading &&
            suggestions.map((suggestion, index) => (
              <div
                key={suggestion.name}
                role="option"
                aria-selected={index === highlightedIndex}
                className={[
                  "jenkins-textbox-autocomplete__item",
                  index === highlightedIndex
                    ? "jenkins-textbox-autocomplete__item--highlighted"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  padding: "0.5rem 0.75rem",
                  cursor: "pointer",
                  background:
                    index === highlightedIndex
                      ? "var(--item-background--hover, #f0f0f0)"
                      : "transparent",
                }}
                onMouseDown={(e) => {
                  // Prevent input blur before selection completes
                  e.preventDefault();
                  handleSuggestionSelect(suggestion.name);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {suggestion.name}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
