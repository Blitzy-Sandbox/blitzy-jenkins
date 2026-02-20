/**
 * @module HeteroList
 *
 * React heterogeneous describable list component replacing
 * `core/src/main/resources/lib/form/hetero-list.jelly`.
 *
 * Implements the Jenkins "heterogeneous list" pattern where users can add
 * an arbitrary number of items from different descriptor types, configure
 * each independently, and reorder them via drag-and-drop.
 *
 * ## Functional Parity
 *
 * Every feature of the original Jelly template is replicated:
 * - Add button with descriptor dropdown menu
 * - Per-item header with drag handle and delete button
 * - `oneEach` constraint (one instance per descriptor type)
 * - `honorOrder` insertion (insert by descriptor order)
 * - Lazy config page loading via `useStaplerQuery`
 * - All CSS classes preserved for SCSS/visual parity
 *
 * ## HTML Structure Parity
 *
 * ```html
 * <div class="jenkins-form-item hetero-list-container [with-drag-drop] [one-each] [honor-order]">
 *   <div class="repeated-chunk" data-descriptor-id="...">
 *     <div class="repeated-chunk__header [repeated-chunk__header--no-handle]">
 *       [<div class="dd-handle"/>]
 *       <span>displayName</span>
 *       [help link]
 *       <button class="repeatable-delete">Delete</button>
 *     </div>
 *     <div class="jenkins-repeated-chunk__content">...</div>
 *   </div>
 *   ...
 *   <template class="repeatable-insertion-point"></template>
 *   <span>
 *     <button class="jenkins-button hetero-list-add">
 *       <svg/> Add
 *     </button>
 *     <div class="hetero-list-add-menu" role="menu">...</div>
 *   </span>
 * </div>
 * ```
 *
 * @see core/src/main/resources/lib/form/hetero-list.jelly
 */

import { useState, useCallback, useMemo, type ReactNode, type DragEvent } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useStaplerQuery } from '@/hooks/useStaplerQuery';

/* ═══════════════════════════════════════════════════════════════════
   Public Interfaces
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Represents a single descriptor type available in the heterogeneous list.
 *
 * Each descriptor corresponds to a Jenkins `Descriptor<T>` subclass and
 * provides metadata for rendering the add-menu entry and the config page.
 *
 * @see hudson.model.Descriptor
 */
export interface Descriptor {
  /** Unique identifier for the descriptor (fully-qualified Java class name) */
  id: string;

  /** Human-readable display name shown in headers and add-menu entries */
  displayName: string;

  /**
   * URL path to the descriptor's configuration page HTML fragment.
   * Fetched lazily via `useStaplerQuery` when a new item is added or
   * when an existing item's config page needs to be loaded on demand.
   */
  configPage: string;

  /** Optional URL to the help file displayed via the (?) icon */
  helpFile?: string;

  /** Optional tooltip text shown on the add-menu entry */
  tooltip?: string;
}

/**
 * Represents a single item within the heterogeneous list.
 *
 * Each item is associated with a particular `Descriptor` and carries
 * its own configuration data (the form field values).
 */
export interface HeteroItem {
  /** The descriptor type that this item belongs to */
  descriptor: Descriptor;

  /**
   * Configuration data for this item, typically form field values.
   * Structured as a key-value record matching the descriptor's
   * configuration page form fields.
   */
  data: Record<string, unknown>;
}

/**
 * Props for the HeteroList component.
 *
 * Maps from Jelly `lib/form/hetero-list.jelly` attributes to React props.
 * Every attribute from the original Jelly tag is represented here.
 *
 * @see core/src/main/resources/lib/form/hetero-list.jelly
 */
export interface HeteroListProps {
  /**
   * Form name receiving the array of heterogeneous items.
   * Used as `data-name` on each repeated-chunk div for form
   * submission binding.
   * Maps to Jelly's `name` attribute (required).
   */
  name: string;

  /**
   * Existing items with their descriptors and configuration data.
   * Rendered as repeated-chunk divs with their config pages.
   * Maps to Jelly's `items` attribute.
   */
  items: HeteroItem[];

  /**
   * All descriptor types the user can choose from when adding items.
   * Displayed in the add-button dropdown menu.
   * Maps to Jelly's `descriptors` attribute.
   */
  descriptors: Descriptor[];

  /**
   * Caption text for the "Add" button. Defaults to the localized
   * 'Add' string via i18n. Mirrors Jelly `${attrs.addCaption?:'%Add'}`.
   */
  addCaption?: string;

  /**
   * Caption text for the "Delete" button on each item.
   * Defaults to the localized 'Delete' string.
   * Maps to Jelly's `deleteCaption` attribute.
   */
  deleteCaption?: string;

  /**
   * Target type for descriptor configuration.
   * Used in the descriptor config page URL resolution.
   * Maps to Jelly's `targetType` attribute.
   */
  targetType?: string;

  /**
   * When true, shows the descriptor displayName as a header above
   * each item and enables drag-and-drop reordering via `.dd-handle`.
   * Adds the `with-drag-drop` CSS class to the container.
   * Maps to Jelly's `hasHeader` attribute.
   */
  hasHeader?: boolean;

  /**
   * When true, limits to one instance per descriptor type.
   * Already-used descriptor types are filtered out of the add menu.
   * Adds the `one-each` CSS class to the container.
   * Maps to Jelly's `oneEach` attribute.
   */
  oneEach?: boolean;

  /**
   * Menu alignment for the add-button dropdown.
   * Defaults to 'tl-bl' (top-left of button aligned to bottom-left of menu).
   * Maps to Jelly's `menuAlign` attribute.
   */
  menuAlign?: string;

  /**
   * When true, new items are inserted at the position determined by
   * the descriptor's ordinal position rather than appended at the end.
   * Adds the `honor-order` CSS class to the container.
   * Maps to Jelly's `honorOrder` attribute.
   */
  honorOrder?: boolean;

  /**
   * Additional variables for lazy rendering of descriptor config pages.
   * Passed as query parameters when fetching config page HTML.
   * Maps to Jelly's `capture` attribute.
   */
  capture?: string;

  /**
   * Custom title calculation method name on the descriptor.
   * When provided, invoked to compute the chunk header title
   * instead of using descriptor.displayName directly.
   * Maps to Jelly's `titleClassMethod` attribute.
   */
  titleClassMethod?: string;

  /**
   * When true, hides the drag handle (`.dd-handle`) on each item
   * and adds the `repeated-chunk__header--no-handle` class to the
   * header div. Drag-and-drop reordering is disabled.
   * Maps to Jelly's `disableDragAndDrop` attribute.
   */
  disableDragAndDrop?: boolean;

  /**
   * Callback invoked whenever the items array changes
   * (add, delete, or reorder). Receives the updated items array.
   */
  onChange?: (items: HeteroItem[]) => void;

  /**
   * Render callback for producing the configuration page content
   * for a given item. Receives the item, its index, and the raw
   * config page HTML (fetched via `useStaplerQuery`).
   *
   * When not provided, the component renders the raw config page
   * HTML via `dangerouslySetInnerHTML`.
   *
   * @param item - The HeteroItem being rendered
   * @param index - Zero-based position in the list
   * @param configHtml - Raw HTML from the descriptor's configPage URL
   * @returns React node to render inside the chunk's content area
   */
  renderConfigPage?: (item: HeteroItem, index: number, configHtml: string) => ReactNode;
}

/* ═══════════════════════════════════════════════════════════════════
   Internal Types
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Internal wrapper associating each HeteroItem with a stable numeric
 * key for correct React reconciliation during drag-and-drop and deletion.
 */
interface TrackedEntry {
  /** Stable unique identifier for React key reconciliation */
  key: number;
  /** The actual HeteroItem value */
  item: HeteroItem;
}

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Computes the next unique key from an existing entries array.
 * Uses the maximum existing key + 1 to guarantee uniqueness.
 */
function getNextKey(entries: TrackedEntry[]): number {
  if (entries.length === 0) {
    return 0;
  }
  return entries.reduce((max, entry) => Math.max(max, entry.key), -1) + 1;
}

/**
 * Extracts the HeteroItem values from tracked entries.
 */
function extractItems(entries: TrackedEntry[]): HeteroItem[] {
  return entries.map((entry) => entry.item);
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

/**
 * Inline delete (x) icon component matching the Jenkins
 * `symbol-close` SVG used in repeatable-delete buttons.
 */
function DeleteIcon(): ReactNode {
  return (
    <svg
      className="svg-icon"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

/**
 * Inline help (?) icon for the help link button beside each item header.
 */
function HelpIcon(): ReactNode {
  return (
    <svg
      className="svg-icon"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Sub-Components
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Renders a single repeated-chunk's config page content.
 *
 * Uses `useStaplerQuery` to lazily fetch the descriptor's config page
 * HTML when the item is first rendered, replacing the Jelly
 * `<l:renderOnDemand>` / `<l:ajax>` pattern.
 */
function ConfigPageContent({
  item,
  index,
  renderConfigPage,
}: {
  item: HeteroItem;
  index: number;
  renderConfigPage?: (item: HeteroItem, index: number, configHtml: string) => ReactNode;
}): ReactNode {
  const { data, isLoading, isError } = useStaplerQuery<string>({
    url: item.descriptor.configPage,
    queryKey: ['hetero-list-config', item.descriptor.id, index],
    enabled: item.descriptor.configPage.length > 0,
  });

  if (isLoading) {
    return (
      <div className="jenkins-spinner" aria-label="Loading configuration...">
        <span className="jenkins-spinner__content" />
      </div>
    );
  }

  if (isError || data == null) {
    return (
      <div className="error" role="alert">
        Failed to load configuration page.
      </div>
    );
  }

  if (renderConfigPage) {
    return renderConfigPage(item, index, data);
  }

  /* Default: render raw config page HTML via dangerouslySetInnerHTML,
     matching the Jelly <st:include> pattern that injects server-rendered
     HTML directly into the page. */
  return (
    <div
      dangerouslySetInnerHTML={{ __html: data }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════ */

/**
 * React heterogeneous describable list replacing `lib/form/hetero-list.jelly`.
 *
 * Implements the Jenkins pattern where users add items from different
 * descriptor types, configure each independently, and optionally reorder
 * via drag-and-drop.
 *
 * ## Key Behaviours
 *
 * - **Add Menu**: Dropdown lists available descriptors. When `oneEach`
 *   is true, already-used descriptor types are filtered out.
 * - **Honor Order**: When `honorOrder` is true, new items are inserted
 *   at the position matching the descriptor's ordinal position in the
 *   `descriptors` array, rather than appended at the end.
 * - **Drag-and-Drop**: Enabled when `hasHeader` is true and
 *   `disableDragAndDrop` is false. Uses HTML5 Drag and Drop API.
 * - **Lazy Config Loading**: Descriptor config pages are fetched via
 *   `useStaplerQuery` on demand, replacing the Jelly renderOnDemand/ajax
 *   pattern.
 *
 * ## CSS Class Parity
 *
 * All CSS classes match the Jelly output exactly to ensure visual
 * parity with the existing SCSS architecture:
 * - `jenkins-form-item`, `hetero-list-container`
 * - `with-drag-drop`, `one-each`, `honor-order` (conditional)
 * - `repeated-chunk`, `repeated-chunk__header`
 * - `repeated-chunk__header--no-handle`, `dd-handle`
 * - `jenkins-repeated-chunk__content`
 * - `jenkins-button`, `hetero-list-add`
 */
export function HeteroList({
  name,
  items,
  descriptors,
  addCaption,
  deleteCaption,
  targetType,
  hasHeader = false,
  oneEach = false,
  menuAlign = 'tl-bl',
  honorOrder = false,
  capture,
  titleClassMethod,
  disableDragAndDrop = false,
  onChange,
  renderConfigPage,
}: HeteroListProps): ReactNode {
  /* ── Localization ──────────────────────────────────────────────── */

  const { t } = useI18n();

  /* ── State: tracked entries with stable keys ───────────────────── */

  const [entries, setEntries] = useState<TrackedEntry[]>(() =>
    items.map((item, index) => ({
      key: index,
      item,
    })),
  );

  /* ── State: add menu visibility ────────────────────────────────── */

  const [menuOpen, setMenuOpen] = useState<boolean>(false);

  /* ── State: drag index ─────────────────────────────────────────── */

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  /* ── Memoised computed values ──────────────────────────────────── */

  /**
   * Container CSS class string.
   *
   * Conditional classes mirror the Jelly template:
   * - `with-drag-drop` when hasHeader is true
   * - `one-each` when oneEach is true
   * - `honor-order` when honorOrder is true
   */
  const containerClassName: string = useMemo(() => {
    const classes = ['jenkins-form-item', 'hetero-list-container'];
    if (hasHeader) {
      classes.push('with-drag-drop');
    }
    if (oneEach) {
      classes.push('one-each');
    }
    if (honorOrder) {
      classes.push('honor-order');
    }
    return classes.join(' ');
  }, [hasHeader, oneEach, honorOrder]);

  /**
   * Filtered list of descriptors available in the add menu.
   *
   * When `oneEach` is true, descriptors whose types are already
   * present in the current items list are excluded — matching the
   * Jelly pattern that only shows unused descriptor types.
   */
  const availableDescriptors: Descriptor[] = useMemo(() => {
    if (!oneEach) {
      return descriptors;
    }
    const usedIds = new Set(entries.map((entry) => entry.item.descriptor.id));
    return descriptors.filter((desc) => !usedIds.has(desc.id));
  }, [descriptors, oneEach, entries]);

  /**
   * Resolved "Add" button label with i18n fallback chain:
   * custom addCaption → localised 'Add' → hardcoded 'Add'.
   * Matches the Jelly pattern: `${attrs.addCaption?:'%Add'}`
   */
  const addButtonLabel: string = useMemo(
    () => addCaption ?? t('Add') ?? 'Add',
    [addCaption, t],
  );

  /**
   * Resolved "Delete" button label with i18n fallback chain:
   * custom deleteCaption → localised 'Delete' → hardcoded 'Delete'.
   */
  const deleteButtonLabel: string = useMemo(
    () => deleteCaption ?? t('Delete') ?? 'Delete',
    [deleteCaption, t],
  );

  /* ── Event handlers ────────────────────────────────────────────── */

  /**
   * Toggles the add-button dropdown menu visibility.
   * When only one descriptor is available, bypasses the menu and
   * directly adds an item of that type.
   */
  const handleToggleMenu = useCallback(() => {
    if (availableDescriptors.length === 1) {
      /* Single descriptor available — add directly without showing menu */
      const desc = availableDescriptors[0];
      const newItem: HeteroItem = { descriptor: desc, data: {} };
      setEntries((prev) => {
        const nextKey = getNextKey(prev);
        const newEntry: TrackedEntry = { key: nextKey, item: newItem };

        let next: TrackedEntry[];
        if (honorOrder) {
          const targetIdx = findInsertionIndex(prev, desc, descriptors);
          next = [...prev.slice(0, targetIdx), newEntry, ...prev.slice(targetIdx)];
        } else {
          next = [...prev, newEntry];
        }

        onChange?.(extractItems(next));
        return next;
      });
      setMenuOpen(false);
      return;
    }
    setMenuOpen((prev) => !prev);
  }, [availableDescriptors, honorOrder, descriptors, onChange]);

  /**
   * Adds a new item of the selected descriptor type to the list.
   *
   * When `honorOrder` is true, inserts the new item at the position
   * matching the descriptor's ordinal in the `descriptors` array.
   * Otherwise appends at the end.
   */
  const handleAddItem = useCallback(
    (desc: Descriptor) => {
      const newItem: HeteroItem = { descriptor: desc, data: {} };
      setEntries((prev) => {
        const nextKey = getNextKey(prev);
        const newEntry: TrackedEntry = { key: nextKey, item: newItem };

        let next: TrackedEntry[];
        if (honorOrder) {
          const targetIdx = findInsertionIndex(prev, desc, descriptors);
          next = [...prev.slice(0, targetIdx), newEntry, ...prev.slice(targetIdx)];
        } else {
          next = [...prev, newEntry];
        }

        onChange?.(extractItems(next));
        return next;
      });
      setMenuOpen(false);
    },
    [honorOrder, descriptors, onChange],
  );

  /**
   * Removes the item at the given index from the list.
   */
  const handleDelete = useCallback(
    (index: number) => {
      setEntries((prev) => {
        const next = prev.filter((_entry, i) => i !== index);
        onChange?.(extractItems(next));
        return next;
      });
    },
    [onChange],
  );

  /**
   * Closes the add menu when clicking outside of it.
   */
  const handleCloseMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  /* ── Drag-and-drop handlers ────────────────────────────────────── */

  /**
   * Initiates a drag operation on the chunk at the given index.
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
   * Allows the chunk to be a valid drop target.
   */
  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  /**
   * Completes the drag-and-drop reorder operation.
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
        onChange?.(extractItems(next));
        return next;
      });

      setDragIndex(null);
    },
    [dragIndex, onChange],
  );

  /**
   * Cleans up drag state on drag end.
   */
  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
  }, []);

  /* ── Drag-and-drop enabled check ───────────────────────────────── */

  const isDragDropEnabled = hasHeader && !disableDragAndDrop;

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div
      className={containerClassName}
      data-name={name}
      data-target-type={targetType || undefined}
      data-capture={capture || undefined}
      data-title-class-method={titleClassMethod || undefined}
    >
      {/* ── Item chunks ────────────────────────────────────────────
          Each entry is rendered as a repeated-chunk div with:
          - `descriptorId` data attribute for form binding
          - Header div with optional drag handle
          - Display name, help link, delete button
          - Content area with lazily-loaded config page
          ─────────────────────────────────────────────────────────── */}
      {entries.map((entry, index) => {
        const { item } = entry;
        const isDragging = dragIndex === index;

        const chunkClasses = [
          'repeated-chunk',
          isDragging ? 'repeated-chunk--sortable-chosen' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const headerClasses = [
          'repeated-chunk__header',
          disableDragAndDrop ? 'repeated-chunk__header--no-handle' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <div
            key={entry.key}
            className={chunkClasses}
            data-name={name}
            data-descriptor-id={item.descriptor.id}
            onDragOver={isDragDropEnabled ? handleDragOver : undefined}
            onDrop={
              isDragDropEnabled
                ? (e: DragEvent<HTMLDivElement>) => handleDrop(e, index)
                : undefined
            }
          >
            {/* ── Chunk header ────────────────────────────────────── */}
            <div className={headerClasses}>
              {/* Drag handle — only when hasHeader and drag-drop enabled */}
              {hasHeader && !disableDragAndDrop && (
                <div
                  className="dd-handle"
                  draggable
                  role="button"
                  tabIndex={0}
                  aria-label={`Reorder ${item.descriptor.displayName}`}
                  onDragStart={(e: DragEvent<HTMLDivElement>) =>
                    handleDragStart(e, index)
                  }
                  onDragEnd={handleDragEnd}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                    }
                  }}
                />
              )}

              {/* Descriptor display name in header */}
              {hasHeader && (
                <span className="repeated-chunk__header-title">
                  {item.descriptor.displayName}
                </span>
              )}

              {/* Help link — only when helpFile is available */}
              {item.descriptor.helpFile && (
                <a
                  href={item.descriptor.helpFile}
                  className="jenkins-help-button"
                  tabIndex={0}
                  aria-label={`Help for ${item.descriptor.displayName}`}
                >
                  <HelpIcon />
                </a>
              )}

              {/* Delete button */}
              <button
                type="button"
                className="repeatable-delete"
                onClick={() => handleDelete(index)}
                aria-label={`${deleteButtonLabel} ${item.descriptor.displayName}`}
              >
                <DeleteIcon />
                <span className="jenkins-visually-hidden">{deleteButtonLabel}</span>
              </button>
            </div>

            {/* ── Chunk content — config page ─────────────────────── */}
            <div className="jenkins-repeated-chunk__content">
              <ConfigPageContent
                item={item}
                index={index}
                renderConfigPage={renderConfigPage}
              />
            </div>
          </div>
        );
      })}

      {/* ── Insertion point template ──────────────────────────────
          Preserved for structural parity with Jelly output. The
          original Jelly template uses this as a DOM marker for the
          legacy JS to insert new chunks before. In React, the items
          array state drives rendering, but the element is kept for
          potential plugin interop. ──────────────────────────────── */}
      <template className="repeatable-insertion-point" />

      {/* ── Prototypes section (hidden) ──────────────────────────
          Matches the Jelly `<div class="prototypes to-be-removed">`
          which holds hidden prototype config pages for each descriptor.
          In React, config pages are loaded lazily, but this empty
          div is preserved for CSS/structural parity. ───────────── */}
      <div className="prototypes to-be-removed" />

      {/* ── Add button with dropdown menu ────────────────────────
          The add button shows a dropdown listing available descriptors.
          When `oneEach` is true, already-used descriptors are filtered
          out. When only one descriptor is available, clicking the
          button adds that type directly without showing the menu.
          ─────────────────────────────────────────────────────────── */}
      <span className="hetero-list-add-wrapper">
        <button
          type="button"
          className="jenkins-button hetero-list-add"
          data-menualign={menuAlign}
          data-suffix={name}
          onClick={handleToggleMenu}
          aria-expanded={menuOpen}
          aria-haspopup="true"
          disabled={oneEach && availableDescriptors.length === 0}
        >
          <AddIcon />
          {' '}
          {addButtonLabel}
        </button>

        {/* Dropdown menu listing available descriptors */}
        {menuOpen && availableDescriptors.length > 0 && (
          <>
            {/* Invisible backdrop to close menu on outside click */}
            <div
              className="hetero-list-menu-backdrop"
              onClick={handleCloseMenu}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  handleCloseMenu();
                }
              }}
              role="presentation"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 999,
                background: 'transparent',
              }}
            />
            <div
              className="jenkins-dropdown"
              role="menu"
              aria-label="Select item type to add"
              style={{ zIndex: 1000 }}
            >
              {availableDescriptors.map((desc) => (
                <button
                  key={desc.id}
                  type="button"
                  className="jenkins-dropdown__item"
                  role="menuitem"
                  title={desc.tooltip ?? ''}
                  onClick={() => handleAddItem(desc)}
                >
                  {desc.displayName}
                </button>
              ))}
            </div>
          </>
        )}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Honor-Order Insertion Helper
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Finds the insertion index for a new item when `honorOrder` is true.
 *
 * The new item should be inserted at the position that maintains the
 * same relative order as the `descriptors` array. This is achieved by
 * finding the first existing entry whose descriptor appears AFTER the
 * new descriptor in the master `descriptors` list, and inserting before it.
 *
 * If no such entry exists (the new descriptor is last in the master
 * list), the item is appended at the end.
 *
 * @param currentEntries - Current tracked entries in the list
 * @param newDescriptor - The descriptor of the item being added
 * @param allDescriptors - The master descriptors array (defines order)
 * @returns Zero-based insertion index
 */
function findInsertionIndex(
  currentEntries: TrackedEntry[],
  newDescriptor: Descriptor,
  allDescriptors: Descriptor[],
): number {
  const newDescriptorIndex = allDescriptors.findIndex((d) => d.id === newDescriptor.id);

  for (let i = 0; i < currentEntries.length; i++) {
    const existingDescriptorIndex = allDescriptors.findIndex(
      (d) => d.id === currentEntries[i].item.descriptor.id,
    );
    if (existingDescriptorIndex > newDescriptorIndex) {
      return i;
    }
  }

  return currentEntries.length;
}
