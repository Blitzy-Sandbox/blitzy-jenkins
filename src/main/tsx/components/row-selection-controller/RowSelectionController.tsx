import { useState, useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * Possible selection states for the header checkbox.
 * - 'none': No row checkboxes are selected
 * - 'some': Some but not all row checkboxes are selected (indeterminate visual)
 * - 'all': All row checkboxes are selected
 */
type SelectionState = "none" | "some" | "all";

/**
 * Props for the RowSelectionController component.
 *
 * @property checkboxClass - CSS class identifying row checkboxes within
 *   the table (maps to data-checkbox-class attribute in the original Jelly markup)
 * @property tableRef - Ref to the parent table element for scoping checkbox queries
 * @property disabled - Optional override to force the disabled state regardless
 *   of whether row checkboxes exist
 */
export interface RowSelectionControllerProps {
  /** CSS class identifying row checkboxes within the table */
  checkboxClass: string;
  /** Ref to the parent table element for scoping checkbox queries */
  tableRef: RefObject<HTMLTableElement | null>;
  /** Optional override to force disabled state */
  disabled?: boolean;
}

/**
 * RowSelectionController — React 19 component providing table header checkbox
 * behavior for bulk row selection/deselection in Jenkins tables.
 *
 * This component replaces the imperative vanilla JS implementation in
 * `src/main/js/components/row-selection-controller/index.js` (111 lines).
 *
 * Features:
 * - Header checkbox toggles all row checkboxes on click
 * - Three visual states: none, some (indeterminate), all — via CSS class modifiers
 * - Dropdown with "Select All" and "Select None" options
 * - Click-outside closes the dropdown
 * - Disabled state when no row checkboxes exist in the table
 * - Custom `updateIcon` event listener on dropdown for external recalculation triggers
 *
 * CSS class names preserved from the original implementation:
 * - `.jenkins-table__checkbox` (base)
 * - `.jenkins-table__checkbox--all` (all selected modifier)
 * - `.jenkins-table__checkbox--indeterminate` (partial selection modifier)
 * - `.jenkins-table__checkbox-options` (more-options button)
 * - `.jenkins-table__checkbox-dropdown` (dropdown container)
 * - `.jenkins-table__checkbox-dropdown--visible` (dropdown visible modifier)
 */
function RowSelectionController({
  checkboxClass,
  tableRef,
  disabled,
}: RowSelectionControllerProps) {
  // ── State ──────────────────────────────────────────────────────────────
  /** Current selection state derived from row checkbox states */
  const [selectionState, setSelectionState] = useState<SelectionState>("none");
  /** Whether the dropdown panel is visible */
  const [dropdownVisible, setDropdownVisible] = useState<boolean>(false);
  /** Number of row checkboxes found in the table (for disabled derivation) */
  const [rowCheckboxCount, setRowCheckboxCount] = useState<number>(0);

  // ── Refs ───────────────────────────────────────────────────────────────
  /** Reference to the header checkbox input element */
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  /** Reference to the dropdown container element */
  const dropdownRef = useRef<HTMLDivElement>(null);
  /** Reference to the more-options button element */
  const optionsButtonRef = useRef<HTMLButtonElement>(null);

  // ── Derived values ─────────────────────────────────────────────────────
  /** Component is disabled when explicitly disabled or when no row checkboxes exist */
  const isDisabled = disabled === true || rowCheckboxCount === 0;

  // ── Callbacks ──────────────────────────────────────────────────────────

  /**
   * Queries the table for all row checkboxes matching the checkboxClass.
   * Returns an array of HTMLInputElement for convenient iteration.
   * Returns an empty array when the table ref is not yet populated.
   */
  const getRowCheckboxes = useCallback((): HTMLInputElement[] => {
    if (!tableRef.current) {
      return [];
    }
    const nodeList = tableRef.current.querySelectorAll<HTMLInputElement>(
      `input[type='checkbox'].${checkboxClass}`,
    );
    return Array.from(nodeList);
  }, [tableRef, checkboxClass]);

  /**
   * Recalculates the selection state based on current row checkbox states.
   * Also updates the row checkbox count used for disabled state derivation.
   *
   * Replaces the original `allCheckboxesSelected()`, `anyCheckboxesSelected()`,
   * and the class-toggling logic in `updateIcon()`.
   */
  const recalculateSelection = useCallback((): void => {
    const checkboxes = getRowCheckboxes();
    setRowCheckboxCount(checkboxes.length);

    if (checkboxes.length === 0) {
      setSelectionState("none");
      return;
    }

    const checkedCount = checkboxes.filter((cb) => cb.checked).length;

    if (checkedCount === checkboxes.length) {
      setSelectionState("all");
    } else if (checkedCount > 0) {
      setSelectionState("some");
    } else {
      setSelectionState("none");
    }
  }, [getRowCheckboxes]);

  /**
   * Sets all row checkboxes to the specified checked state.
   * Operates directly on DOM checkbox elements (row checkboxes are outside
   * React's render tree — they belong to server-rendered table rows).
   */
  const setAllCheckboxes = useCallback(
    (checked: boolean): void => {
      const checkboxes = getRowCheckboxes();
      checkboxes.forEach((cb) => {
        cb.checked = checked;
      });
    },
    [getRowCheckboxes],
  );

  /**
   * Header checkbox click handler.
   * Toggles all row checkboxes: if all are currently selected, deselects all;
   * otherwise, selects all. Closes the dropdown after toggling.
   *
   * Replaces the original `headerCheckbox.addEventListener("click", ...)` handler.
   */
  const handleHeaderCheckboxClick = useCallback((): void => {
    const checkboxes = getRowCheckboxes();
    const allSelected =
      checkboxes.length > 0 && checkboxes.every((cb) => cb.checked);
    setAllCheckboxes(!allSelected);
    recalculateSelection();
    setDropdownVisible(false);
  }, [getRowCheckboxes, setAllCheckboxes, recalculateSelection]);

  /**
   * "Select All" dropdown button handler.
   * Checks all row checkboxes, recalculates state, and closes the dropdown.
   *
   * Replaces the original `moreOptionsAllButton.addEventListener("click", ...)`.
   */
  const handleSelectAll = useCallback((): void => {
    setAllCheckboxes(true);
    recalculateSelection();
    setDropdownVisible(false);
  }, [setAllCheckboxes, recalculateSelection]);

  /**
   * "Select None" dropdown button handler.
   * Unchecks all row checkboxes, recalculates state, and closes the dropdown.
   *
   * Replaces the original `moreOptionsNoneButton.addEventListener("click", ...)`.
   */
  const handleSelectNone = useCallback((): void => {
    setAllCheckboxes(false);
    recalculateSelection();
    setDropdownVisible(false);
  }, [setAllCheckboxes, recalculateSelection]);

  /**
   * More-options button click handler.
   * Toggles the dropdown panel visibility.
   *
   * Replaces the original `moreOptionsButton.addEventListener("click", ...)`.
   */
  const handleDropdownToggle = useCallback((): void => {
    setDropdownVisible((prev) => !prev);
  }, []);

  // ── Effects ────────────────────────────────────────────────────────────

  /**
   * Effect: Attach change listeners to row checkboxes and compute initial state.
   *
   * Replaces the original per-checkbox `change` event listener registration
   * (lines 41-45) and the initial disabled-state check (lines 20-25).
   *
   * Re-runs when the table ref, checkbox class, or recalculation function change.
   * Cleans up event listeners on unmount or dependency change.
   */
  useEffect(() => {
    const tableElement = tableRef.current;
    if (!tableElement) {
      return;
    }

    const checkboxes = Array.from(
      tableElement.querySelectorAll<HTMLInputElement>(
        `input[type='checkbox'].${checkboxClass}`,
      ),
    );

    const handleChange = (): void => {
      recalculateSelection();
    };

    // Attach change listeners to each row checkbox
    checkboxes.forEach((cb) => {
      cb.addEventListener("change", handleChange);
    });

    // Compute initial selection state on mount — deferred via queueMicrotask
    // to avoid synchronous setState within the effect body (react-hooks/set-state-in-effect)
    queueMicrotask(recalculateSelection);

    // Cleanup: remove change listeners
    return () => {
      checkboxes.forEach((cb) => {
        cb.removeEventListener("change", handleChange);
      });
    };
  }, [tableRef, checkboxClass, recalculateSelection]);

  /**
   * Effect: Click-outside handler for dropdown dismissal.
   *
   * Closes the dropdown when clicking anywhere outside both the dropdown
   * panel and the options button. Uses `contains()` for robust child-element
   * detection.
   *
   * Replaces the original `document.addEventListener("click", ...)` handler
   * (lines 86-98).
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target as Node;

      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        optionsButtonRef.current &&
        !optionsButtonRef.current.contains(target)
      ) {
        setDropdownVisible(false);
      }
    };

    document.addEventListener("click", handleClickOutside);

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  /**
   * Effect: Custom `updateIcon` event listener on the dropdown element.
   *
   * Preserves the original pattern where external code (e.g., plugin scripts)
   * can dispatch a custom `updateIcon` event on the dropdown to trigger a
   * selection state recalculation. Stops propagation as the original does.
   *
   * Replaces the original `moreOptionsDropdown.addEventListener("updateIcon", ...)`
   * (lines 106-109).
   */
  useEffect(() => {
    const dropdownElement = dropdownRef.current;
    if (!dropdownElement) {
      return;
    }

    const handleUpdateIcon = (e: Event): void => {
      recalculateSelection();
      e.stopPropagation();
    };

    dropdownElement.addEventListener("updateIcon", handleUpdateIcon);

    return () => {
      dropdownElement.removeEventListener("updateIcon", handleUpdateIcon);
    };
  }, [recalculateSelection]);

  // ── CSS class derivation ───────────────────────────────────────────────

  /**
   * Derives the header checkbox CSS classes from the current selection state.
   * - Base: `jenkins-table__checkbox`
   * - All selected: adds `jenkins-table__checkbox--all`
   * - Some selected: adds `jenkins-table__checkbox--indeterminate`
   */
  const headerCheckboxClasses = [
    "jenkins-table__checkbox",
    selectionState === "all" ? "jenkins-table__checkbox--all" : "",
    selectionState === "some" ? "jenkins-table__checkbox--indeterminate" : "",
  ]
    .filter(Boolean)
    .join(" ");

  /**
   * Derives the dropdown container CSS classes from visibility state.
   * - Base: `jenkins-table__checkbox-dropdown`
   * - Visible: adds `jenkins-table__checkbox-dropdown--visible`
   */
  const dropdownClasses = [
    "jenkins-table__checkbox-dropdown",
    dropdownVisible ? "jenkins-table__checkbox-dropdown--visible" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <input
        type="checkbox"
        className={headerCheckboxClasses}
        ref={headerCheckboxRef}
        checked={selectionState === "all"}
        onChange={handleHeaderCheckboxClick}
        disabled={isDisabled}
        data-checkbox-class={checkboxClass}
        aria-label="Select all rows"
      />
      <button
        className="jenkins-table__checkbox-options"
        ref={optionsButtonRef}
        onClick={handleDropdownToggle}
        disabled={isDisabled}
        type="button"
        aria-label="Selection options"
        aria-expanded={dropdownVisible}
      />
      <div className={dropdownClasses} ref={dropdownRef} role="menu">
        <button
          data-select="all"
          onClick={handleSelectAll}
          type="button"
          role="menuitem"
        >
          Select All
        </button>
        <button
          data-select="none"
          onClick={handleSelectNone}
          type="button"
          role="menuitem"
        >
          Select None
        </button>
      </div>
    </>
  );
}

export default RowSelectionController;
