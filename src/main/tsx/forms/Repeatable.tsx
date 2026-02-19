import { useState, useCallback, useMemo, type ReactNode, type DragEvent } from 'react';
import { useI18n } from '@/hooks/useI18n';

/**
 * Props for the Repeatable component.
 * Maps from Jelly `lib/form/repeatable.jelly` attributes to React props.
 *
 * @typeParam T - The type of each repeatable item in the collection.
 *
 * @see core/src/main/resources/lib/form/repeatable.jelly
 */
export interface RepeatableProps<T> {
  /**
   * Variable name for the current iteration item.
   * Maps to Jelly's `var` attribute.
   * Used as a data attribute on each chunk for form binding context.
   */
  itemVar?: string;

  /**
   * Structured form submission name.
   * Defaults to `field` if provided, otherwise falls back to `itemVar`.
   * Maps to Jelly's `name` attribute.
   */
  name?: string;

  /**
   * Data binding field name for Stapler descriptor integration.
   * When provided, takes precedence over `name`/`itemVar` for the
   * resolved form name — mirroring Jelly's bi-directional binding
   * where `field` sets `name=field`, `var="instance"`.
   * Maps to Jelly's `field` attribute.
   */
  field?: string;

  /**
   * Collection of items to display as repeatable blocks.
   * Each item receives its own `repeated-chunk` div.
   * Maps to Jelly's `items` attribute.
   */
  items?: T[];

  /**
   * Fallback collection used when `items` is null or undefined.
   * Mirrors the Jelly pattern: `items="${attrs.items ?: attrs.default}"`.
   * Maps to Jelly's `default` attribute.
   */
  defaultItems?: T[];

  /**
   * When true the default "Add" button at the bottom is hidden.
   * Callers use this when providing a custom add mechanism.
   * Maps to Jelly's `noAddButton` attribute.
   */
  noAddButton?: boolean;

  /**
   * When true and items exist, an additional "Add" button appears
   * above the repeatable list. The top button prepends new items
   * to the beginning of the list. Only displayed when at least one
   * item is present — when the list is empty only the bottom button
   * appears to avoid duplicate buttons.
   * Maps to Jelly's `enableTopButton` attribute.
   */
  enableTopButton?: boolean;

  /**
   * Custom text for the "Add" button, replacing the default
   * localized "Add" string. Mirrors Jelly `${attrs.add?:'%Add'}`.
   * Maps to Jelly's `add` attribute.
   */
  addText?: string;

  /**
   * Minimum number of repeated chunks to maintain.
   * When the item count is below this threshold, empty slots
   * (null items) are appended to reach the minimum on initial
   * render. Deletion is prevented when at or below this count.
   * Defaults to 0. Maps to Jelly's `minimum` attribute.
   */
  minimum?: number;

  /**
   * Per-item header text displayed above each chunk's content.
   * When present, enables drag-and-drop reordering via the
   * `.dd-handle` div rendered in each chunk header as a drag grip.
   * Maps to Jelly's `header` attribute.
   */
  header?: string;

  /**
   * Render callback that produces the content for each repeated block.
   * Receives the item data (or null for empty/template slots) and
   * the zero-based index within the list.
   *
   * @param item - Current item data, or null for empty/template chunks
   * @param index - Zero-based position in the repeatable list
   * @returns React node to render inside the chunk's content area
   */
  renderItem: (item: T | null, index: number) => ReactNode;

  /**
   * Factory function called when the user clicks "Add".
   * Should return a new item of type T to be appended to the list.
   * When not provided, null is used as the new item value.
   */
  onAdd?: () => T;

  /**
   * Callback invoked whenever the items array changes (add, delete,
   * or reorder). Receives the new complete items array.
   */
  onChange?: (items: T[]) => void;
}

/* ═══════════════════════════════════════════════════════════════════
   Internal types
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Internal wrapper associating each item with a stable numeric key.
 * Ensures correct React reconciliation during drag-and-drop reordering
 * and deletion (index-as-key would cause stale state in child components).
 */
interface TrackedEntry<T> {
  /** Stable unique identifier for React key reconciliation */
  key: number;
  /** The actual item value, or null for empty/minimum-padded slots */
  data: T | null;
}

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Computes the positional CSS classes for a repeated-chunk div
 * based on its index within the list and the total item count.
 *
 * Positional classes control visibility of child elements via the
 * existing SCSS rules in `_reorderable-list.scss`:
 * - `first` — first chunk among siblings
 * - `last` — last chunk among siblings
 * - `middle` — neither first nor last
 * - `only` — sole chunk (receives both `first` and `last`)
 *
 * @param index - Zero-based position of the chunk
 * @param total - Total number of chunks in the list
 * @returns Space-separated CSS class string
 */
function getPositionalClasses(index: number, total: number): string {
  if (total === 1) {
    return 'first last only';
  }
  if (index === 0) {
    return 'first';
  }
  if (index === total - 1) {
    return 'last';
  }
  return 'middle';
}

/**
 * Computes the next unique key from an existing entries array.
 * Uses the maximum existing key + 1 to guarantee uniqueness.
 *
 * @param entries - Current tracked entries array
 * @returns Next safe unique key value
 */
function getNextKey<T>(entries: TrackedEntry<T>[]): number {
  if (entries.length === 0) {
    return 0;
  }
  return entries.reduce((max, entry) => Math.max(max, entry.key), -1) + 1;
}

/**
 * Extracts the raw data values from tracked entries and returns
 * them as a plain array for external callbacks.
 *
 * @param entries - Internal tracked entries
 * @returns Array of item data values (including nulls for empty slots)
 */
function extractData<T>(entries: TrackedEntry<T>[]): T[] {
  return entries.map((entry) => entry.data) as T[];
}

/**
 * Inline add (+) icon component matching the Jenkins `symbol-add` SVG.
 * Renders a simple plus-sign path using `currentColor` for inherited
 * colour theming from the parent `.jenkins-button`.
 */
function AddIcon(): ReactNode {
  return (
    <svg
      className="svg-icon"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════ */

/**
 * React dynamic repeatable field group replacing `lib/form/repeatable.jelly`.
 *
 * Implements repeatable blocks where users can dynamically add and remove
 * copies of a field group (e.g., Java installations in system config).
 *
 * ## HTML Structure Parity
 *
 * The rendered HTML mirrors the Jelly-produced structure exactly:
 *
 * ```html
 * <div class="repeated-container [with-drag-drop]">
 *   <div class="repeated-chunk to-be-removed"><!-- master copy --></div>
 *   [<button class="jenkins-button repeatable-add repeatable-add-top">]
 *   <div class="repeated-chunk [first|last|middle|only]"><!-- item 1 --></div>
 *   <div class="repeated-chunk [first|last|middle|only]"><!-- item 2 --></div>
 *   <template class="repeatable-insertion-point"></template>
 *   [<button class="jenkins-button repeatable-add"><!-- bottom add -->]
 * </div>
 * ```
 *
 * ## Positional CSS Classes
 *
 * Each `repeated-chunk` receives positional classes that control
 * visibility of nested UI controls (delete buttons, add buttons) via
 * SCSS rules in `_reorderable-list.scss`:
 * - `first` — first chunk among siblings
 * - `last` — last chunk among siblings
 * - `middle` — neither first nor last
 * - `only` — sole chunk (gets both `first` and `last`)
 *
 * ## Drag-and-Drop
 *
 * When the `header` prop is provided, each chunk displays a drag
 * handle (`.dd-handle`) enabling reorder via the HTML5 Drag and
 * Drop API — replacing the legacy SortableJS integration.
 *
 * ## Minimum Enforcement
 *
 * When `minimum` is specified and the initial item count is below
 * the threshold, empty slots (null items) are appended until the
 * minimum is reached. Deletion is blocked when item count equals
 * the minimum — matching the Jelly loop:
 * `<j:forEach begin="${h.size2(items)}" end="${minimum-1}">`
 *
 * @typeParam T - The type of each repeatable item
 */
export function Repeatable<T>({
  itemVar,
  name,
  field,
  items,
  defaultItems,
  noAddButton = false,
  enableTopButton = false,
  addText,
  minimum = 0,
  header,
  renderItem,
  onAdd,
  onChange,
}: RepeatableProps<T>) {
  /* ── Localization ──────────────────────────────────────────────── */

  const { t } = useI18n();

  /* ── Resolved form name ────────────────────────────────────────── */

  /*
   * Mirrors the Jelly bi-directional binding:
   * - When field is set: name = field
   * - Otherwise: name = attrs.name ?: attrs.var
   */
  const resolvedName: string = field ?? name ?? itemVar ?? '';

  /* ── State: tracked entries with stable keys ───────────────────── */

  const [entries, setEntries] = useState<TrackedEntry<T>[]>(() => {
    const source: (T | null)[] = items ?? defaultItems ?? [];
    const tracked: TrackedEntry<T>[] = source.map((value, index) => ({
      key: index,
      data: value,
    }));

    /*
     * Minimum enforcement: pad with null slots to reach the minimum
     * count, matching the Jelly loop that creates additional chunks
     * with var=null when h.size2(items) < minimum.
     */
    for (let i = tracked.length; i < minimum; i++) {
      tracked.push({ key: i, data: null });
    }

    return tracked;
  });

  /* ── Drag-and-drop state ───────────────────────────────────────── */

  /**
   * Index of the item currently being dragged, or null when idle.
   * Used to apply the `repeated-chunk--sortable-chosen` CSS class
   * and to determine the source index on drop.
   */
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  /* ── Memoised computed values ──────────────────────────────────── */

  /**
   * Positional CSS class string for each entry, recomputed whenever
   * the entries array changes (add, delete, or reorder).
   */
  const positionalClasses: string[] = useMemo(
    () => entries.map((_entry, index) => getPositionalClasses(index, entries.length)),
    [entries],
  );

  /**
   * Resolved "Add" button label with i18n fallback chain:
   * custom addText → localised 'Add' → hardcoded 'Add'.
   * Matches the Jelly pattern: `${attrs.add?:'%Add'}`
   */
  const addButtonLabel: string = useMemo(
    () => addText ?? t('Add') ?? 'Add',
    [addText, t],
  );

  /**
   * Container CSS class string — includes `with-drag-drop` when
   * header is present, enabling the drag-and-drop SCSS rules.
   */
  const containerClassName: string = useMemo(
    () => (header != null ? 'repeated-container with-drag-drop' : 'repeated-container'),
    [header],
  );

  /* ── Event handlers ────────────────────────────────────────────── */

  /**
   * Appends a new item to the bottom of the list.
   * Creates the item via `onAdd()` if provided, otherwise null.
   * Notifies the parent via `onChange` with the updated array.
   */
  const handleAddBottom = useCallback(() => {
    const newData: T | null = onAdd ? onAdd() : null;
    setEntries((prev) => {
      const nextKey = getNextKey(prev);
      const next = [...prev, { key: nextKey, data: newData }];
      onChange?.(extractData(next));
      return next;
    });
  }, [onAdd, onChange]);

  /**
   * Prepends a new item to the top of the list.
   * Used by the top "Add" button (`enableTopButton`).
   * Mirrors the Jelly top-button behaviour of inserting above existing items.
   */
  const handleAddTop = useCallback(() => {
    const newData: T | null = onAdd ? onAdd() : null;
    setEntries((prev) => {
      const nextKey = getNextKey(prev);
      const next = [{ key: nextKey, data: newData }, ...prev];
      onChange?.(extractData(next));
      return next;
    });
  }, [onAdd, onChange]);

  /**
   * Removes the item at the given index.
   * Respects the `minimum` constraint — deletion is silently
   * blocked when removing would drop below the minimum count.
   */
  const handleDelete = useCallback(
    (index: number) => {
      setEntries((prev) => {
        if (prev.length <= minimum) {
          return prev;
        }
        const next = prev.filter((_entry, i) => i !== index);
        onChange?.(extractData(next));
        return next;
      });
    },
    [minimum, onChange],
  );

  /* ── Drag-and-drop handlers ────────────────────────────────────── */

  /**
   * Initiates a drag operation on the chunk at the given index.
   * Sets the `dragIndex` state to apply visual feedback CSS classes
   * and stores the source index for the subsequent drop handler.
   */
  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, index: number) => {
      setDragIndex(index);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    },
    [],
  );

  /**
   * Allows the chunk to be a valid drop target by preventing the
   * default browser behaviour and signalling a 'move' operation.
   */
  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  /**
   * Completes the drag-and-drop reorder by moving the dragged item
   * from `dragIndex` to `targetIndex`. Resets drag state and
   * notifies the parent via `onChange`.
   */
  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, targetIndex: number) => {
      event.preventDefault();
      const sourceIndex = dragIndex;

      if (sourceIndex === null || sourceIndex === targetIndex) {
        setDragIndex(null);
        return;
      }

      setEntries((prev) => {
        const next = [...prev];
        const [movedEntry] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, movedEntry);
        onChange?.(extractData(next));
        return next;
      });

      setDragIndex(null);
    },
    [dragIndex, onChange],
  );

  /**
   * Cleans up drag state when a drag operation is cancelled or
   * the dragged element is released outside a valid drop target.
   */
  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
  }, []);

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div
      className={containerClassName}
      data-enable-top-button={enableTopButton || undefined}
    >
      {/* ── Master copy (hidden template for legacy compatibility) ──
          The first div with class "to-be-removed" is hidden via CSS
          (`div.to-be-removed { display: none }`) and serves as the
          template chunk that legacy JS clones when adding new items.
          In the React version this is preserved for structural parity
          and potential plugin interop. ──────────────────────────────── */}
      <div className="repeated-chunk to-be-removed" data-name={resolvedName}>
        <div className="repeated-chunk__header">
          {header != null && (
            <>
              <div className="dd-handle" aria-hidden="true" />
              <span>{header}</span>
            </>
          )}
        </div>
        <div className="jenkins-repeated-chunk__content">
          {renderItem(null, -1)}
        </div>
      </div>

      {/* ── Top add button ─────────────────────────────────────────
          Displayed only when enableTopButton is true, at least one
          item exists, and noAddButton is false. Prepends new items
          to the top of the list. Mirrors the Jelly condition:
          `!empty(items) and !attrs.noAddButton and attrs.enableTopButton`
          ─────────────────────────────────────────────────────────── */}
      {enableTopButton && entries.length > 0 && !noAddButton && (
        <button
          type="button"
          className="jenkins-button repeatable-add repeatable-add-top"
          onClick={handleAddTop}
        >
          <AddIcon />
          {' '}
          {addButtonLabel}
        </button>
      )}

      {/* ── Item chunks ────────────────────────────────────────────
          Each entry is rendered as a repeated-chunk div with:
          - Positional CSS classes (first/last/middle/only)
          - Optional header with drag handle (when `header` is set)
          - Delete button (disabled at minimum count)
          - Content area via the renderItem callback
          ─────────────────────────────────────────────────────────── */}
      {entries.map((entry, index) => {
        const isDragging = dragIndex === index;
        const chunkClasses = [
          'repeated-chunk',
          positionalClasses[index],
          isDragging ? 'repeated-chunk--sortable-chosen' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <div
            key={entry.key}
            className={chunkClasses}
            data-name={resolvedName}
            onDragOver={header != null ? handleDragOver : undefined}
            onDrop={header != null ? (e: DragEvent<HTMLDivElement>) => handleDrop(e, index) : undefined}
          >
            <div className="repeated-chunk__header">
              {header != null && (
                <>
                  <div
                    className="dd-handle"
                    draggable
                    role="button"
                    tabIndex={0}
                    aria-label={`Reorder ${header}`}
                    onDragStart={(e: DragEvent<HTMLDivElement>) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    onKeyDown={(e) => {
                      /*
                       * Keyboard accessibility: allow Enter/Space to
                       * initiate a conceptual reorder action on the
                       * drag handle. Full keyboard reorder requires
                       * additional ARIA live-region announcements which
                       * would be handled by a dedicated reorder hook.
                       */
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                      }
                    }}
                  />
                  <span>{header}</span>
                </>
              )}

              {/* Delete button — absolutely positioned via SCSS.
                  Disabled when the item count is at or below the
                  minimum to prevent violating the minimum constraint.
                  The icon is rendered via CSS mask-image on the
                  .repeatable-delete class in _reorderable-list.scss. */}
              <button
                type="button"
                className="repeatable-delete"
                onClick={() => handleDelete(index)}
                disabled={entries.length <= minimum}
                aria-label="Delete"
                title="Delete"
              />
            </div>

            <div className="jenkins-repeated-chunk__content">
              {renderItem(entry.data, index)}
            </div>
          </div>
        );
      })}

      {/* ── Insertion point marker ─────────────────────────────────
          Preserved for structural parity with the Jelly output.
          Legacy Jenkins JS uses this as a reference point when
          cloning the master copy and inserting it into the DOM.
          In the React version, additions are managed via state. ──── */}
      <template className="repeatable-insertion-point" />

      {/* ── Bottom add button ──────────────────────────────────────
          The default "Add" button displayed below the item list
          unless `noAddButton` is true. Appends new items to the
          bottom of the list. ──────────────────────────────────────── */}
      {!noAddButton && (
        <button
          type="button"
          className="jenkins-button repeatable-add"
          onClick={handleAddBottom}
        >
          <AddIcon />
          {' '}
          {addButtonLabel}
        </button>
      )}
    </div>
  );
}
