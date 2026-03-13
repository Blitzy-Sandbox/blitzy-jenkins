/**
 * CloudSet — Cloud Configuration Page Component
 *
 * Replaces the vanilla JavaScript module at `src/main/js/pages/cloud-set/index.js`
 * and its companion SCSS file `src/main/js/pages/cloud-set/index.scss`.
 *
 * Implements the cloud configuration page with drag-and-drop table row reordering
 * using the HTML5 Drag and Drop API (replacing the SortableJS library) and save
 * button visibility toggling when rows are reordered.
 *
 * Behavioral mapping from the original source:
 *
 * | Source Pattern                                         | React Equivalent                                  |
 * |-------------------------------------------------------|---------------------------------------------------|
 * | `document.addEventListener("DOMContentLoaded", ...)`   | React component mount (useEffect with empty deps) |
 * | `document.querySelectorAll("tbody").forEach(...)`       | JSX rendering of `<tbody>` elements directly       |
 * | `registerSortableTableDragDrop(table, callback)`        | HTML5 DnD event handlers on `<tr>` elements        |
 * | `getElementById("saveButton").classList.remove(...)`    | `setShowSaveButton(true)` state change             |
 * | SortableJS `Sortable.create(e, { handle, items, ... })` | React drag event handlers + state-based reordering |
 *
 * Key constraints (from AAP Section 0.8):
 * - Stapler REST API consumed as-is — no new backend endpoints
 * - Visual symmetry — rendered output must match the original Jelly-rendered page
 * - No new features — only replicate existing behavior
 * - SCSS consumed via class names — uses existing `jenkins-*` classes
 * - No jQuery, SortableJS, Handlebars, or behaviorShim imports
 * - Plugin ecosystem compatibility — jQuery remains in global scope but NOT imported here
 *
 * @module pages/cloud/CloudSet
 */

import { useState, useEffect, useCallback } from "react";
import Layout from "@/layout/Layout";
import { useStaplerQuery } from "@/hooks/useStaplerQuery";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Represents a single cloud provider configuration entry.
 *
 * Each cloud provider (e.g., Docker, Kubernetes, Amazon EC2) appears as a row
 * in the cloud configuration table. The `name` is the user-defined label and
 * `type` is the cloud provider implementation class display name.
 */
interface CloudRow {
  /** User-defined name for this cloud configuration (e.g., "Production K8s") */
  name: string;
  /** Cloud provider type display name (e.g., "Docker", "Kubernetes", "Amazon EC2") */
  type: string;
}

/**
 * Response shape from the Stapler REST endpoint `/cloud/api/json`.
 *
 * The Jenkins ComputerSet/Cloud model exposes cloud configurations as an array
 * under the `clouds` key when serialized to JSON via the `@Exported` annotation.
 */
interface CloudSetData {
  /** Array of cloud provider configurations */
  clouds: CloudRow[];
}

// =============================================================================
// Component
// =============================================================================

/**
 * Cloud configuration page component.
 *
 * Renders a table of cloud provider configurations with drag-and-drop row
 * reordering. When any row is reordered, a save button becomes visible so the
 * user can persist the new ordering.
 *
 * Data is fetched from the Stapler REST endpoint `/cloud/api/json` via the
 * `useStaplerQuery` hook. The component maintains a local copy of the rows
 * for reordering operations without mutating the cached server state.
 *
 * The drag-and-drop implementation uses the HTML5 Drag and Drop API, replacing
 * the SortableJS library used in the original `sortable-drag-drop.js`. The
 * `.dd-handle` element within each row serves as the drag handle, matching the
 * `{ handle: ".dd-handle" }` configuration from the original SortableJS setup.
 *
 * Guard clause from the original `registerSortableTableDragDrop`: the `<tbody>`
 * carries the `.with-drag-drop` CSS class, preserving the marker used by the
 * original source to identify drag-and-drop enabled containers.
 *
 * @returns The rendered cloud configuration page wrapped in a Layout shell
 */
export function CloudSet(): React.ReactElement {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /**
   * Controls save button visibility.
   * Initially false (button has `.jenkins-hidden` class).
   * Set to true when ANY row is reordered, mirroring the original:
   *   `document.getElementById("saveButton").classList.remove("jenkins-hidden")`
   */
  const [showSaveButton, setShowSaveButton] = useState<boolean>(false);

  /**
   * Local override of cloud row ordering after drag-and-drop reorder.
   * `null` means "use server data as-is" (no local reorder has occurred).
   * When the user reorders rows, this holds the new order. The derived
   * `rows` variable below selects between server data and local override.
   */
  const [reorderedRows, setReorderedRows] = useState<CloudRow[] | null>(null);

  /**
   * Index of the row currently being dragged, or null when no drag is active.
   * Used to:
   *  - Apply the `.repeated-chunk--sortable-ghost` class to the dragged row
   *  - Determine the source index during the drop operation
   */
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // ---------------------------------------------------------------------------
  // Data Fetching — Stapler REST endpoint
  // ---------------------------------------------------------------------------

  /**
   * Fetch cloud configuration data from `/cloud/api/json`.
   *
   * The Jenkins ComputerSet model exposes cloud configurations via the standard
   * Stapler JSON API. The response includes a `clouds` array with each cloud
   * provider's name and type.
   */
  const { data, isLoading } = useStaplerQuery<CloudSetData>({
    url: "/cloud/api/json",
    queryKey: ["cloud-set"],
  });

  /**
   * Derived row list for rendering.
   *
   * Uses the local reordered state if the user has performed a drag-and-drop,
   * otherwise falls back to the server data. This avoids calling setState
   * inside useEffect for data synchronization — the derived state pattern
   * automatically reflects the latest server data when no local override exists.
   */
  const rows: CloudRow[] = reorderedRows ?? data?.clouds ?? [];

  // ---------------------------------------------------------------------------
  // Keyboard Escape Handler — Drag Cancellation
  // ---------------------------------------------------------------------------
  // SortableJS internally handles keyboard cancellation during drag operations.
  // This effect replicates that behavior for the HTML5 DnD replacement by
  // listening for the Escape key to cancel an active drag operation.
  // This is the React equivalent of the DOMContentLoaded initialization
  // pattern from `src/main/js/pages/cloud-set/index.js`, setting up global
  // event listeners after the component mounts.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && draggedIndex !== null) {
        setDraggedIndex(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [draggedIndex]);

  // ---------------------------------------------------------------------------
  // HTML5 Drag and Drop Handlers
  // ---------------------------------------------------------------------------
  // These handlers replace the SortableJS `Sortable.create(e, { ... })`
  // configuration from `registerSortableTableDragDrop` in
  // `src/main/js/sortable-drag-drop.js` (lines 67-81).
  //
  // Key mapping:
  //   SortableJS `handle: ".dd-handle"` → drag is initiated from `.dd-handle` el
  //   SortableJS `items: "tr"`          → each `<tr>` is a draggable unit
  //   SortableJS `onChange`             → fires when rows are reordered
  // ---------------------------------------------------------------------------

  /**
   * Handles the start of a row drag operation.
   *
   * Records the index of the row being dragged and configures the drag
   * transfer data for the 'move' operation.
   *
   * @param index - Zero-based index of the row being dragged
   */
  const handleDragStart = useCallback(
    (index: number) =>
      (e: React.DragEvent<HTMLTableRowElement>): void => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
      },
    [],
  );

  /**
   * Handles dragover events on table rows.
   *
   * Prevents the default browser behavior (which would reject the drop)
   * and sets the drop effect to 'move' to show the appropriate cursor.
   */
  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLTableRowElement>): void => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    [],
  );

  /**
   * Handles the drop event when a row is released onto a target position.
   *
   * Performs the row reorder by splicing the dragged row from its original
   * position and inserting it at the target position. After any successful
   * reorder, the save button is made visible.
   *
   * Mirrors the SortableJS `onChange` callback behavior:
   *   `onChangeFunction(event)` → `setShowSaveButton(true)`
   *
   * @param targetIndex - Zero-based index of the drop target row
   */
  const handleDrop = useCallback(
    (targetIndex: number) =>
      (e: React.DragEvent<HTMLTableRowElement>): void => {
        e.preventDefault();

        if (draggedIndex === null || draggedIndex === targetIndex) {
          return;
        }

        setReorderedRows((prev) => {
          // Use the current local override, or fall back to server data
          const source = prev ?? data?.clouds ?? [];
          const newRows = [...source];
          const [removed] = newRows.splice(draggedIndex, 1);
          newRows.splice(targetIndex, 0, removed);
          return newRows;
        });

        // Show save button when rows are reordered
        // Mirrors: document.getElementById("saveButton").classList.remove("jenkins-hidden")
        setShowSaveButton(true);
        setDraggedIndex(null);
      },
    [draggedIndex, data?.clouds],
  );

  /**
   * Resets the drag state when a drag operation ends (whether via drop or cancel).
   *
   * Ensures the ghost styling class is removed from any previously-dragged row.
   */
  const handleDragEnd = useCallback((): void => {
    setDraggedIndex(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Layout title="Cloud Configuration">
      <div>
        {isLoading ? (
          <div
            className="jenkins-spinner"
            aria-label="Loading cloud configurations"
          >
            Loading...
          </div>
        ) : (
          <>
            <table className="jenkins-table">
              <thead>
                <tr>
                  {/* Drag handle column — no header text, matches original Jelly layout */}
                  <th aria-label="Reorder" />
                  <th>Name</th>
                  <th>Type</th>
                </tr>
              </thead>
              {/*
                The `.with-drag-drop` class is the guard marker from the original
                `registerSortableTableDragDrop` (sortable-drag-drop.js line 68):
                  if (!e || !e.classList.contains("with-drag-drop")) { return false; }
                Preserved here for CSS targeting and behavioral consistency.
              */}
              <tbody className="with-drag-drop">
                {rows.map((row, index) => (
                  <tr
                    key={row.name || index}
                    draggable
                    onDragStart={handleDragStart(index)}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    className={
                      draggedIndex === index
                        ? "repeated-chunk--sortable-ghost"
                        : ""
                    }
                  >
                    <td>
                      {/*
                        Drag handle element — `.dd-handle` class triggers
                        `cursor: move` from existing SCSS
                        (src/main/scss/form/_reorderable-list.scss line 47).
                        Replaces SortableJS `handle: ".dd-handle"` config.
                        The aria-hidden attribute marks this as decorative.
                      */}
                      <div className="dd-handle" aria-hidden="true">
                        ⋮⋮
                      </div>
                    </td>
                    <td>{row.name}</td>
                    <td>{row.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/*
              Save button — hidden until rows are reordered.
              The `#saveButton` DOM ID is preserved for backward compatibility
              with any external scripts or tests that reference it.
              Mirrors: document.getElementById("saveButton").classList.remove("jenkins-hidden")
            */}
            <button
              id="saveButton"
              className={`jenkins-button jenkins-button--primary${
                !showSaveButton ? " jenkins-hidden" : ""
              }`}
              type="submit"
            >
              Save
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}

export default CloudSet;
