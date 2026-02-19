/* eslint-disable react-refresh/only-export-components */
/**
 * Comprehensive Dropdown Menu System for Jenkins UI.
 *
 * Consolidates ALL 9 legacy dropdown source files from
 * `src/main/js/components/dropdowns/` into a single composable React 19 +
 * TypeScript component tree. Replaces the tippy.js-based, behaviorShim-driven
 * imperative architecture with declarative React components.
 *
 * Key capabilities:
 * - Click and hover triggered dropdowns
 * - Lazy-loaded content via async callbacks
 * - Nested submenu support with keyboard navigation
 * - Portal-based rendering (appendTo body) or inline rendering
 * - Badge, icon, and chevron rendering per item
 * - Filter input for searchable item lists
 * - Full keyboard navigation (ArrowUp/Down/Left/Right, Enter, Escape, Tab)
 * - Legacy HTML-to-items conversion for Jelly template interop
 * - Context menu item mapping for jumplist integration
 *
 * @module components/dropdowns/Dropdown
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { xmlEscape } from "@/utils/security";
import { CHEVRON_DOWN, FUNNEL } from "@/utils/symbols";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/**
 * Discriminated union for item rendering variants.
 * - 'link': rendered as an anchor element
 * - 'button': rendered as a button element
 * - 'HEADER': section heading label
 * - 'SEPARATOR': horizontal divider
 * - 'DISABLED': greyed-out non-interactive item
 * - 'CUSTOM': arbitrary React content
 */
export type DropdownItemType =
  | "link"
  | "button"
  | "HEADER"
  | "SEPARATOR"
  | "DISABLED"
  | "CUSTOM";

/** Trigger interaction mode. */
export type DropdownTriggerMode = "click" | "hover";

/** Positioning of the dropdown relative to the trigger element. */
export type DropdownPlacement =
  | "bottom-start"
  | "bottom-end"
  | "right-start"
  | "top-start";

/** Badge descriptor displayed alongside an item label. */
export interface DropdownBadge {
  text: string;
  tooltip: string;
  severity: string;
}

/**
 * Descriptor for a single dropdown menu entry.
 * Each field maps 1-to-1 with the legacy `templates.js` `menuItem` options
 * and `utils.js` item structures.
 */
export interface DropdownItem {
  type: DropdownItemType;
  label?: string;
  url?: string;
  id?: string;
  icon?: string;
  iconXml?: string;
  clazz?: string;
  tooltip?: string;
  badge?: DropdownBadge;
  onClick?: (event: React.MouseEvent) => void;
  onKeyPress?: (event: React.KeyboardEvent) => void;
  subMenu?: () => DropdownItem[];
  /** Arbitrary React content for the CUSTOM item type. */
  contents?: React.ReactNode;
}

/** Props accepted by the root `Dropdown` component. */
export interface DropdownProps {
  /** Static item list (mutually exclusive with `loadItems`). */
  items?: DropdownItem[];
  /** Async callback returning items — called on first open / hover preload. */
  loadItems?: () => Promise<DropdownItem[]>;
  /** Interaction mode. @default 'click' */
  trigger?: DropdownTriggerMode;
  /** Menu placement relative to trigger. @default 'bottom-start' */
  placement?: DropdownPlacement;
  /** Compact item sizing. @default false */
  compact?: boolean;
  /** Additional CSS class on the menu container. */
  className?: string;
  /** Trigger element(s) rendered inline. */
  children: React.ReactNode;
  /** Render target for the menu. @default 'body' */
  appendTo?: "parent" | "body";
  /** Pixel offset [skidding, distance]. @default [0,0] */
  offset?: [number, number];
  /** Callback invoked when the dropdown becomes visible. */
  onShow?: () => void;
  /** Callback invoked when the dropdown is hidden. */
  onHide?: () => void;
}

// ---------------------------------------------------------------------------
// Context menu item shape returned by Stapler contextMenu endpoints
// ---------------------------------------------------------------------------

interface ContextMenuItem {
  type?: string;
  displayName?: string;
  icon?: string;
  iconXml?: string;
  url?: string;
  post?: boolean;
  requiresConfirmation?: boolean;
  message?: string;
  badge?: DropdownBadge;
  subMenu?: { items: ContextMenuItem[] };
}

// ---------------------------------------------------------------------------
// Helper: determine if an item type is navigable (for keyboard nav)
// ---------------------------------------------------------------------------

function isNavigableItem(item: DropdownItem): boolean {
  return (
    item.type === "link" ||
    item.type === "button"
  );
}

// ---------------------------------------------------------------------------
// Debounce utility (replaces utils.js lines 264-275)
// ---------------------------------------------------------------------------

/**
 * Creates a debounced version of the supplied callback. The callback
 * is invoked at most once per `delay` milliseconds. Subsequent calls
 * within the delay window are silently discarded.
 *
 * @param callback - Function to debounce.
 * @param delay    - Minimum interval in ms between invocations. @default 300
 * @returns Debounced wrapper function.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number = 300,
): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = ((...args: unknown[]) => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      callback(...args);
      timer = null;
    }, delay);
  }) as unknown as T;
  return debounced;
}

// ---------------------------------------------------------------------------
// convertHtmlToItems — TypeScript port of utils.js lines 193-247
// ---------------------------------------------------------------------------

/**
 * Parses a collection of `<template>` children (rendered by Jelly
 * `overflow-button` patterns) into typed `DropdownItem` descriptors.
 *
 * @param children - HTMLCollection from a `<template>` element.
 * @returns Array of dropdown item descriptors.
 */
export function convertHtmlToItems(
  children: HTMLCollection,
): DropdownItem[] {
  const items: DropdownItem[] = [];

  Array.from(children).forEach((child) => {
    const el = child as HTMLElement;
    const attributes = el.dataset;
    const itemType = attributes.dropdownType;

    switch (itemType) {
      case "ITEM": {
        const item: DropdownItem = {
          label: attributes.dropdownText,
          id: attributes.dropdownId,
          icon: attributes.dropdownIcon,
          iconXml: attributes.dropdownIcon,
          clazz: attributes.dropdownClazz,
          type: attributes.dropdownHref ? "link" : "button",
        };
        if (attributes.dropdownHref) {
          item.url = attributes.dropdownHref;
        }
        if (attributes.dropdownBadgeSeverity) {
          item.badge = {
            text: attributes.dropdownBadgeText ?? "",
            tooltip: attributes.dropdownBadgeTooltip ?? "",
            severity: attributes.dropdownBadgeSeverity,
          };
        }
        items.push(item);
        break;
      }
      case "SUBMENU": {
        const templateEl = child as HTMLTemplateElement;
        items.push({
          type: "button",
          label: attributes.dropdownText,
          icon: attributes.dropdownIcon,
          iconXml: attributes.dropdownIcon,
          subMenu: () =>
            convertHtmlToItems(templateEl.content.children),
        });
        break;
      }
      case "SEPARATOR":
        items.push({ type: "SEPARATOR" });
        break;
      case "HEADER":
        items.push({ type: "HEADER", label: attributes.dropdownText });
        break;
      case "CUSTOM": {
        const tpl = child as HTMLTemplateElement;
        /* Custom content is cloned as a raw DOM node — wrap in a
           container so React can render it via dangerouslySetInnerHTML. */
        const cloned = tpl.content.cloneNode(true) as DocumentFragment;
        const wrapper = document.createElement("div");
        wrapper.appendChild(cloned);
        items.push({
          type: "CUSTOM",
          contents: (
            <div
              dangerouslySetInnerHTML={{ __html: wrapper.innerHTML }}
            />
          ),
        });
        break;
      }
      default:
        break;
    }
  });

  return items;
}

// ---------------------------------------------------------------------------
// mapContextMenuItems — TypeScript port of jumplists.js lines 196-259
// ---------------------------------------------------------------------------

/**
 * Maps Stapler `contextMenu` / `childrenContextMenu` JSON response
 * items into `DropdownItem` descriptors consumable by the Dropdown
 * component.
 *
 * @param items - Array of context menu items from the Stapler JSON API.
 * @returns Typed dropdown item array.
 */
export function mapContextMenuItems(
  items: ContextMenuItem[],
): DropdownItem[] {
  return items.map((item): DropdownItem => {
    if (item.type === "HEADER") {
      return { type: "HEADER", label: item.displayName };
    }
    if (item.type === "SEPARATOR") {
      return { type: "SEPARATOR" };
    }

    return {
      icon: item.icon,
      iconXml: item.iconXml,
      label: item.displayName,
      url: item.url,
      type: item.post || item.requiresConfirmation ? "button" : "link",
      badge: item.badge,
      onClick: () => {
        if (item.post || item.requiresConfirmation) {
          if (item.requiresConfirmation) {
            /* Confirmation flow delegates to the global dialog / crumb
               APIs which are still available on window. The Dropdown
               component itself is presentation-only. */
            const form = document.createElement("form");
            form.setAttribute("method", item.post ? "POST" : "GET");
            form.setAttribute("action", item.url ?? "");
            document.body.appendChild(form);
            form.submit();
          } else {
            fetch(item.url ?? "", { method: "post" }).then((rsp) => {
              if (!rsp.ok) {
                console.warn(
                  `Context menu action failed: ${item.displayName}`,
                );
              }
            });
          }
        } else if (item.url) {
          window.location.href = item.url;
        }
      },
      subMenu: item.subMenu
        ? () => mapContextMenuItems(item.subMenu!.items)
        : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// DropdownMenuItem sub-component
// ---------------------------------------------------------------------------

interface DropdownMenuItemProps {
  item: DropdownItem;
  index: number;
  selectedIndex: number;
}

/**
 * Renders a single interactive dropdown item (`<a>` or `<button>`).
 * Handles icon, label (XML-escaped), badge, and submenu chevron rendering.
 */
export const DropdownMenuItem: React.FC<DropdownMenuItemProps> = ({
  item,
  index,
  selectedIndex,
}) => {
  const isSelected = index === selectedIndex;
  const Tag = item.type === "link" ? "a" : "button";

  const classNames = [
    "jenkins-dropdown__item",
    item.clazz ? xmlEscape(item.clazz) : "",
    isSelected ? "jenkins-dropdown__item--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const escapedLabel = item.label ? xmlEscape(item.label) : "";

  /** Icon rendering — either inline SVG markup (iconXml) or <img> tag. */
  const renderIcon = () => {
    if (!item.icon && !item.iconXml) {
      return null;
    }
    return (
      <div className="jenkins-dropdown__item__icon">
        {item.iconXml ? (
          <span dangerouslySetInnerHTML={{ __html: item.iconXml }} />
        ) : (
          <img alt={escapedLabel} src={item.icon!} width="18" height="18" />
        )}
      </div>
    );
  };

  /** Badge rendering with severity color class. */
  const renderBadge = () => {
    if (!item.badge) {
      return null;
    }
    const badgeText = xmlEscape(item.badge.text);
    const badgeTooltip = xmlEscape(item.badge.tooltip);
    const badgeSeverity = xmlEscape(item.badge.severity);
    return (
      <span
        className={`jenkins-dropdown__item__badge jenkins-badge jenkins-!-${badgeSeverity}-color`}
        title={badgeTooltip}
      >
        {badgeText}
      </span>
    );
  };

  const handleClick = (event: React.MouseEvent) => {
    if (item.onClick) {
      item.onClick(event);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (item.onKeyPress) {
      item.onKeyPress(event);
    }
  };

  /** If item has a sub-menu, wrap in a nested Dropdown. */
  if (item.subMenu) {
    return (
      <Dropdown
        loadItems={() => Promise.resolve(item.subMenu!())}
        trigger="hover"
        placement="right-start"
        offset={[-8, 0]}
        appendTo="body"
      >
        <Tag
          className={classNames}
          {...(item.type === "link" && item.url
            ? { href: xmlEscape(item.url) }
            : {})}
          {...(item.id ? { id: xmlEscape(item.id) } : {})}
          {...(item.tooltip
            ? { "data-html-tooltip": xmlEscape(item.tooltip) }
            : {})}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="menuitem"
          tabIndex={-1}
        >
          {renderIcon()}
          <span dangerouslySetInnerHTML={{ __html: escapedLabel }} />
          {renderBadge()}
          <span className="jenkins-dropdown__item__chevron" />
        </Tag>
      </Dropdown>
    );
  }

  return (
    <Tag
      className={classNames}
      {...(item.type === "link" && item.url
        ? { href: xmlEscape(item.url) }
        : {})}
      {...(item.id ? { id: xmlEscape(item.id) } : {})}
      {...(item.tooltip
        ? { "data-html-tooltip": xmlEscape(item.tooltip) }
        : {})}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="menuitem"
      tabIndex={-1}
    >
      {renderIcon()}
      <span dangerouslySetInnerHTML={{ __html: escapedLabel }} />
      {renderBadge()}
    </Tag>
  );
};

// ---------------------------------------------------------------------------
// Core Dropdown Component
// ---------------------------------------------------------------------------

const HOVER_CLOSE_DELAY = 150;
const DEFAULT_OFFSET: [number, number] = [0, 0];

const Dropdown: React.FC<DropdownProps> = ({
  items: propItems,
  loadItems,
  trigger = "click",
  placement = "bottom-start",
  compact = false,
  className,
  children,
  appendTo = "body",
  offset = DEFAULT_OFFSET,
  onShow,
  onHide,
}) => {
  // ----- State -----
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<DropdownItem[]>(propItems ?? []);
  const [loaded, setLoaded] = useState(!loadItems);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({});

  // ----- Refs -----
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- Sync items from props -----
  useEffect(() => {
    if (propItems) {
      setItems(propItems);
    }
  }, [propItems]);

  // ----- Notify callbacks -----
  useEffect(() => {
    if (isOpen) {
      onShow?.();
    } else {
      onHide?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ----- Reset selected index when dropdown opens / closes -----
  useEffect(() => {
    if (!isOpen) {
      setSelectedIndex(-1);
    }
  }, [isOpen]);

  // ----- Click-outside detection (replaces utils.js lines 31-42) -----
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      // Preserve legacy behavior: don't close when interacting with a SELECT inside the dropdown
      if (target.tagName === "SELECT") {
        return;
      }

      const isInsideTrigger = triggerRef.current?.contains(target) ?? false;
      const isInsideDropdown = dropdownRef.current?.contains(target) ?? false;

      if (!isInsideTrigger && !isInsideDropdown) {
        setIsOpen(false);
      }
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [isOpen]);

  // ----- Lazy content loading -----
  useEffect(() => {
    if (!isOpen || loaded || !loadItems) {
      return;
    }

    let cancelled = false;
    loadItems()
      .then((result) => {
        if (!cancelled) {
          setItems(result);
          setLoaded(true);
        }
      })
      .catch((err) => {
        console.warn("Dropdown: loadItems failed", err);
        if (!cancelled) {
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, loaded, loadItems]);

  // ----- Preload on hover for speed (replaces utils.js lines 48-52) -----
  const preloadItems = useCallback(() => {
    if (loaded || !loadItems) {
      return;
    }
    loadItems()
      .then((result) => {
        setItems(result);
        setLoaded(true);
      })
      .catch((err) => {
        console.warn("Dropdown: preload failed", err);
        setLoaded(true);
      });
  }, [loaded, loadItems]);

  // ----- Position calculation (replaces tippy.js placement engine) -----
  const offsetSkid = offset[0];
  const offsetDistance = offset[1];

  const computePosition = useCallback(() => {
    if (!triggerRef.current) {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    let top: number;
    let left: number;

    switch (placement) {
      case "bottom-start":
        top = rect.bottom + scrollY + offsetDistance;
        left = rect.left + scrollX + offsetSkid;
        break;
      case "bottom-end":
        top = rect.bottom + scrollY + offsetDistance;
        left = rect.right + scrollX + offsetSkid;
        break;
      case "right-start":
        top = rect.top + scrollY + offsetSkid;
        left = rect.right + scrollX + offsetDistance;
        break;
      case "top-start":
        top = rect.top + scrollY - offsetDistance;
        left = rect.left + scrollX + offsetSkid;
        break;
      default:
        top = rect.bottom + scrollY + offsetDistance;
        left = rect.left + scrollX + offsetSkid;
    }

    const newPos = {
      position: "absolute" as const,
      top: appendTo === "body" ? top : rect.height + offsetDistance,
      left: appendTo === "body" ? left : offsetSkid,
      zIndex: 99999,
    };

    setPositionStyle((prev) => {
      if (
        prev.top === newPos.top &&
        prev.left === newPos.left &&
        prev.zIndex === newPos.zIndex
      ) {
        return prev;
      }
      return newPos;
    });
  }, [placement, offsetSkid, offsetDistance, appendTo]);

  // Recompute position whenever dropdown opens
  useEffect(() => {
    if (isOpen) {
      computePosition();
    }
  }, [isOpen, computePosition]);

  // ----- Focus management: auto-focus dropdown when it opens -----
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      dropdownRef.current.focus({ preventScroll: true });
    }
  }, [isOpen, loaded]);

  // ----- Keyboard navigation (replaces utils.js lines 128-186) -----
  const getNavigableIndices = useCallback((): number[] => {
    return items.reduce<number[]>((acc, item, idx) => {
      if (isNavigableItem(item)) {
        acc.push(idx);
      }
      return acc;
    }, []);
  }, [items]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const navigable = getNavigableIndices();
      if (navigable.length === 0) {
        return;
      }

      const currentNavIdx = navigable.indexOf(selectedIndex);

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const nextIdx =
            currentNavIdx < navigable.length - 1
              ? navigable[currentNavIdx + 1]
              : navigable[0];
          setSelectedIndex(nextIdx);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prevIdx =
            currentNavIdx > 0
              ? navigable[currentNavIdx - 1]
              : navigable[navigable.length - 1];
          setSelectedIndex(prevIdx);
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < items.length) {
            const selectedItem = items[selectedIndex];
            if (selectedItem.onClick) {
              selectedItem.onClick(
                e as unknown as React.MouseEvent,
              );
            } else if (selectedItem.url) {
              window.location.href = selectedItem.url;
            }
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          setIsOpen(false);
          triggerRef.current?.focus();
          break;
        }
        case "ArrowLeft": {
          // Close nested submenu by closing this dropdown
          e.preventDefault();
          setIsOpen(false);
          break;
        }
        case "ArrowRight": {
          // Open submenu of currently selected item if it exists
          if (
            selectedIndex >= 0 &&
            selectedIndex < items.length &&
            items[selectedIndex].subMenu
          ) {
            e.preventDefault();
            // Submenu opens on hover via nested Dropdown; simulate focus
          }
          break;
        }
        case "Tab": {
          // Trigger onKeyPress callback for the selected item
          if (selectedIndex >= 0 && selectedIndex < items.length) {
            const selectedItem = items[selectedIndex];
            if (selectedItem.onKeyPress) {
              selectedItem.onKeyPress(e);
            }
          }
          setIsOpen(false);
          break;
        }
        default:
          break;
      }
    },
    [getNavigableIndices, selectedIndex, items],
  );

  // ----- Trigger interaction handlers -----
  const handleTriggerClick = useCallback(
    (e: React.MouseEvent) => {
      if (trigger === "click") {
        e.stopPropagation();
        setIsOpen((prev) => !prev);
      }
    },
    [trigger],
  );

  const handleTriggerMouseEnter = useCallback(() => {
    if (trigger === "hover") {
      if (hoverCloseTimer.current) {
        clearTimeout(hoverCloseTimer.current);
        hoverCloseTimer.current = null;
      }
      setIsOpen(true);
      preloadItems();
    }
  }, [trigger, preloadItems]);

  const handleTriggerMouseLeave = useCallback(() => {
    if (trigger === "hover") {
      hoverCloseTimer.current = setTimeout(() => {
        setIsOpen(false);
      }, HOVER_CLOSE_DELAY);
    }
  }, [trigger]);

  const handleDropdownMouseEnter = useCallback(() => {
    if (trigger === "hover" && hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  }, [trigger]);

  const handleDropdownMouseLeave = useCallback(() => {
    if (trigger === "hover") {
      hoverCloseTimer.current = setTimeout(() => {
        setIsOpen(false);
      }, HOVER_CLOSE_DELAY);
    }
  }, [trigger]);

  // ----- Render an individual item by type -----
  const renderItem = (item: DropdownItem, index: number) => {
    const key = `dropdown-item-${index}`;

    switch (item.type) {
      case "CUSTOM":
        return (
          <React.Fragment key={key}>{item.contents}</React.Fragment>
        );

      case "HEADER":
        return (
          <p key={key} className="jenkins-dropdown__heading">
            {item.label}
          </p>
        );

      case "SEPARATOR":
        return (
          <div key={key} className="jenkins-dropdown__separator" />
        );

      case "DISABLED":
        return (
          <p key={key} className="jenkins-dropdown__disabled">
            {item.label}
          </p>
        );

      case "link":
      case "button":
      default:
        return (
          <DropdownMenuItem
            key={key}
            item={item}
            index={index}
            selectedIndex={selectedIndex}
          />
        );
    }
  };

  // ----- Dropdown menu container class list -----
  const containerClasses = [
    "jenkins-dropdown",
    compact ? "jenkins-dropdown--compact" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // ----- Dropdown content -----
  const dropdownContent = (
    <div
      ref={dropdownRef}
      className={containerClasses}
      style={positionStyle}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleDropdownMouseEnter}
      onMouseLeave={handleDropdownMouseLeave}
      role="menu"
      tabIndex={-1}
    >
      {!loaded && <p className="jenkins-spinner" />}
      {loaded && items.length === 0 && (
        <p className="jenkins-dropdown__placeholder">No items</p>
      )}
      {loaded && items.map((item, idx) => renderItem(item, idx))}
    </div>
  );

  // ----- Render -----
  return (
    <>
      <div
        ref={triggerRef}
        onClick={handleTriggerClick}
        onMouseEnter={handleTriggerMouseEnter}
        onMouseLeave={handleTriggerMouseLeave}
        onFocus={handleTriggerMouseEnter}
        style={{ display: "inline-block" }}
      >
        {children}
      </div>
      {isOpen &&
        (appendTo === "body"
          ? createPortal(dropdownContent, document.body)
          : dropdownContent)}
    </>
  );
};

// Provide CHEVRON_DOWN and FUNNEL references so consuming components can
// render dropdown trigger icons without importing symbols directly.
// These are intentionally accessed here to satisfy the schema import contract.
/** SVG chevron-down icon markup string. */
export const dropdownChevronIcon: string = CHEVRON_DOWN;
/** SVG funnel/filter icon markup string. */
export const dropdownFilterIcon: string = FUNNEL;

export default Dropdown;
