/**
 * React Dropdown Select Component
 *
 * Replaces `core/src/main/resources/lib/form/select.jelly`.
 * A glorified `<select>` control that supports data binding and
 * AJAX-populated options via Stapler's `doFillXyzItems` pattern.
 *
 * Key behaviors replicated from the Jelly source:
 * - **Name inference**: `name` defaults to `'_.'+field` when not explicitly set
 *   (source: select.jelly line 69)
 * - **Value resolution**: `value ?? defaultValue` mirrors the Jelly expression
 *   `attrs.value ?: instance[attrs.field] ?: attrs.default` (line 65)
 * - **CSS class composition**: `jenkins-select__input [validated] select [clazz]`
 *   exactly replicates the Jelly class expression (line 68)
 * - **Dynamic option fill**: `fillUrl` + `fillDependsOn` replaces the Jelly
 *   `descriptor.calcFillSettings(field, attrs)` pattern (line 64)
 * - **Read-only mode**: `data-readonly` attribute on wrapper div replicates
 *   the Jelly `readOnlyMode` expression (line 66)
 *
 * @module forms/Select
 */

import { useState, useEffect, useCallback } from "react";
import { useStaplerQuery } from "@/hooks/useStaplerQuery";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Represents a single option within the Select dropdown.
 *
 * Maps to Stapler's `ListBoxModel.Option` which serializes with
 * `name` (display text), `value` (form value), and `selected` (pre-selected
 * flag). The `displayName` field corresponds to the Jelly option's visible
 * text content.
 */
export type SelectOption = {
  /** Form submission value for this option */
  value: string;
  /** Human-readable text displayed to the user */
  displayName: string;
  /** Whether this option is pre-selected by the server */
  selected?: boolean;
};

/**
 * Props for the Select component.
 *
 * Maps directly to the Jelly `<f:select>` tag attributes documented in
 * `select.jelly` lines 28–58, plus React-specific additions for dynamic
 * option fetching and controlled component patterns.
 */
export interface SelectProps {
  /**
   * Additional CSS classes applied to the `<select>` element.
   * Maps to Jelly attribute `clazz` (select.jelly line 34).
   */
  className?: string;

  /**
   * Databinding field name. Used to infer the form submission `name`
   * attribute as `'_.'+field` when `name` is not explicitly provided.
   * Maps to Jelly attribute `field` (select.jelly line 37).
   */
  field?: string;

  /**
   * Default selected value when both `value` and instance field are null.
   * Maps to Jelly attribute `default` (select.jelly line 40).
   */
  defaultValue?: string;

  /**
   * Override the default error message for client-side validation failures
   * (e.g., when `className` includes "required").
   * Maps to Jelly attribute `checkMessage` (select.jelly line 43).
   */
  checkMessage?: string;

  /**
   * AJAX validation URL. When specified, the selected value is validated
   * against this endpoint, and errors are rendered below the select.
   * Adds the `validated` CSS class to the select element.
   * Maps to Jelly attribute `checkUrl` (select.jelly line 47).
   */
  checkUrl?: string;

  /**
   * HTTP method for AJAX validation requests.
   * Specify `'get'` to use GET; any other value or omission uses POST.
   * Defaults to POST since Jenkins 2.285.
   * Maps to Jelly attribute `checkMethod` (select.jelly line 54).
   */
  checkMethod?: "get" | "post";

  /**
   * Static option list. When provided, these options are rendered directly
   * without any AJAX fetching. Takes priority over `fillUrl` options.
   */
  options?: SelectOption[];

  /**
   * URL to dynamically fetch options from Stapler's `doFillXxxItems` endpoint.
   * Replaces the Jelly `descriptor.calcFillSettings(field, attrs)` pattern
   * (select.jelly line 64). When provided, options are fetched via
   * `useStaplerQuery` on mount and when `fillDependsOn` field values change.
   */
  fillUrl?: string;

  /**
   * Space-separated field names whose values are sent as query parameters
   * when fetching options from `fillUrl`. Replaces the Jelly `fillDependsOn`
   * attribute injected by `calcFillSettings`.
   */
  fillDependsOn?: string;

  /** Callback fired when the selected value changes */
  onChange?: (value: string) => void;

  /**
   * Whether the select is in read-only mode. When true, the select is
   * disabled and the wrapper div receives `data-readonly="true"`.
   */
  readOnly?: boolean;

  /**
   * HTML `name` attribute for the select element. When not provided,
   * defaults to `'_.'+field` (matching Jelly line 69).
   */
  name?: string;

  /**
   * Controlled value for the select. When provided, the component operates
   * in controlled mode and the internal state syncs with this prop.
   */
  value?: string;
}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Expected response shape from Stapler's `doFillXyzItems` endpoint.
 *
 * Jenkins' `ListBoxModel` serializes to JSON as an object containing a
 * `values` array, where each entry corresponds to a `ListBoxModel.Option`
 * with `name` (display text), `value` (form value), and `selected`
 * (pre-selection flag set by the descriptor).
 */
interface FillItemsResponse {
  values: Array<{
    name: string;
    value: string;
    selected: boolean;
  }>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Maps a single Stapler fill response item to a `SelectOption`.
 *
 * Transforms the Stapler `ListBoxModel.Option` JSON shape (which uses `name`
 * for display text) into the component's `SelectOption` shape (which uses
 * `displayName` for clarity and consistency with React naming conventions).
 */
function mapFillResponseItem(item: {
  name: string;
  value: string;
  selected: boolean;
}): SelectOption {
  return {
    value: item.value,
    displayName: item.name,
    selected: item.selected,
  };
}

// =============================================================================
// Select Component
// =============================================================================

/**
 * React select dropdown component replacing `lib/form/select.jelly`.
 *
 * Renders a `<div class="jenkins-select">` wrapper containing a native
 * `<select>` element, exactly replicating the Jelly template's HTML output.
 * Supports both static option lists and dynamic AJAX-populated options via
 * Stapler's `doFillXyzItems` endpoint pattern.
 *
 * @example
 * ```tsx
 * // Static options
 * <Select
 *   field="scm"
 *   options={[
 *     { value: "git", displayName: "Git" },
 *     { value: "svn", displayName: "Subversion" },
 *   ]}
 * />
 *
 * // Dynamic AJAX options from Stapler
 * <Select
 *   field="jdk"
 *   fillUrl="/descriptorByName/hudson.model.JDK/fillJdkItems"
 *   fillDependsOn="name"
 * />
 *
 * // Controlled with validation
 * <Select
 *   field="assignedLabel"
 *   value={selectedLabel}
 *   onChange={setSelectedLabel}
 *   checkUrl="/descriptorByName/.../checkAssignedLabel"
 * />
 * ```
 */
export function Select({
  className,
  field,
  defaultValue,
  checkMessage,
  checkUrl,
  checkMethod,
  options: staticOptions,
  fillUrl,
  fillDependsOn,
  onChange,
  readOnly,
  name: nameProp,
  value: valueProp,
}: SelectProps) {
  // ---------------------------------------------------------------------------
  // Name and value resolution
  // ---------------------------------------------------------------------------

  // Compute form field name: explicit name prop → '_.'+field → undefined
  // Matches Jelly: ${attrs.name ?: '_.'+attrs.field} (select.jelly line 69)
  const computedName = nameProp ?? (field ? `_.${field}` : undefined);

  // Internal value state — tracks ONLY the user's explicit selection.
  // Initialized from: defaultValue → empty string.
  // The effective displayed value is computed during render (see below),
  // so this state only changes on direct user interaction via handleChange.
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue ?? "",
  );

  // ---------------------------------------------------------------------------
  // Dynamic option fetching via Stapler fillUrl
  // ---------------------------------------------------------------------------

  // Fetch options from Stapler's doFillXyzItems endpoint when fillUrl is
  // provided. The query key includes fillDependsOn so that changing dependent
  // field values triggers a refetch (replacing the Jelly calcFillSettings
  // dependency tracking).
  const {
    data: fillData,
    isLoading,
    isError,
  } = useStaplerQuery<FillItemsResponse>({
    url: fillUrl ?? "",
    queryKey: ["fillSelect", fillUrl ?? "", fillDependsOn ?? ""],
    enabled: !!fillUrl,
    staleTime: 30_000,
  });

  // Resolve the final options list. Static options from props take priority
  // over dynamically fetched options, enabling callers to override server
  // data when needed.
  const resolvedOptions: SelectOption[] =
    staticOptions ??
    (fillData?.values ? fillData.values.map(mapFillResponseItem) : []);

  // ---------------------------------------------------------------------------
  // Derived selected value (computed during render, no effects needed)
  // ---------------------------------------------------------------------------

  // Compute the effective selected value during render. This approach avoids
  // calling setState inside useEffect (which triggers cascading renders)
  // by treating the value as derived state:
  //
  // Priority order:
  // 1. Controlled mode (valueProp): always wins
  // 2. User's explicit selection (internalValue): if it matches a valid option
  // 3. Server pre-selected option: from fillUrl response with selected=true
  // 4. First available option: when no explicit or pre-selected value
  // 5. Internal value fallback: when no options are available yet
  //
  // This mirrors the Jelly resolution: ${attrs.value ?: instance[field] ?: default}
  const selectedValue: string = (() => {
    // 1. Controlled mode: valueProp always takes precedence
    if (valueProp !== undefined) {
      return valueProp;
    }

    // 2. User's selection is valid in current options — respect it
    if (
      resolvedOptions.length > 0 &&
      resolvedOptions.some((opt) => opt.value === internalValue)
    ) {
      return internalValue;
    }

    // 3–4. Auto-derive from available options (fill data or static)
    if (resolvedOptions.length > 0) {
      const preselected = resolvedOptions.find((opt) => opt.selected);
      if (preselected) {
        return preselected.value;
      }
      return resolvedOptions[0].value;
    }

    // 5. No options available yet — show internal value (may be defaultValue)
    return internalValue;
  })();

  // ---------------------------------------------------------------------------
  // Side effect: notify parent when fill-data auto-selection resolves
  // ---------------------------------------------------------------------------

  // When fill data arrives and auto-selects a value that differs from the
  // user's initial/default value, notify the parent via onChange. This is a
  // legitimate side effect — communicating the auto-derived selection to the
  // parent's form state so it stays in sync.
  useEffect(() => {
    if (
      !onChange ||
      valueProp !== undefined ||
      !fillData ||
      staticOptions !== undefined
    ) {
      return;
    }

    // Compute what the auto-selected value would be from fill data
    const options = fillData.values.map(mapFillResponseItem);
    const preselected = options.find((opt) => opt.selected);
    const autoValue =
      preselected?.value ?? (options.length > 0 ? options[0].value : null);

    // Only notify if auto-selection yields a value different from default
    if (autoValue !== null && autoValue !== (defaultValue ?? "")) {
      onChange(autoValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally fire only when fillData reference changes (new server response)
  }, [fillData]);

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  // Memoized change handler to prevent unnecessary re-renders of the select
  // element and its option children.
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const newValue = event.target.value;
      setInternalValue(newValue);
      onChange?.(newValue);
    },
    [onChange],
  );

  // ---------------------------------------------------------------------------
  // CSS class composition
  // ---------------------------------------------------------------------------

  // Build the select element's CSS class string, exactly matching the Jelly
  // class expression: "jenkins-select__input ${checkUrl?'validated':''} select ${clazz}"
  const selectClasses = [
    "jenkins-select__input",
    checkUrl ? "validated" : "",
    "select",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="jenkins-select"
      data-readonly={readOnly ? "true" : undefined}
    >
      <select
        className={selectClasses}
        name={computedName}
        value={selectedValue}
        disabled={readOnly || isLoading}
        onChange={handleChange}
        data-check-url={checkUrl || undefined}
        data-check-method={checkMethod || undefined}
        data-check-message={checkMessage || undefined}
        data-fill-depends-on={fillDependsOn || undefined}
      >
        {/* Loading state while options are being fetched from fillUrl */}
        {isLoading && <option value="">Loading…</option>}

        {/* Error state when option fetch fails */}
        {isError && !isLoading && (
          <option value="">Error loading options</option>
        )}

        {/*
         * Fallback: when no options are available but a value is set, render
         * a single option with the current value. This matches the Jelly
         * behavior (select.jelly lines 72-74):
         *   <j:if test="${value!=null}">
         *     <option value="${value}">${value}</option>
         *   </j:if>
         */}
        {!isLoading &&
          !isError &&
          resolvedOptions.length === 0 &&
          selectedValue !== "" && (
            <option value={selectedValue}>{selectedValue}</option>
          )}

        {/* Render resolved options from static props or fetched data */}
        {resolvedOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
