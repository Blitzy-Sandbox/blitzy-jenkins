/* eslint-disable react-refresh/only-export-components -- schema requires exporting Tooltip components alongside hoverNotification utility */
/**
 * Tooltip — Accessible tooltip wrapper component
 *
 * Replaces src/main/js/components/tooltips/index.js (tippy.js wrapper)
 * with a pure React 19 implementation. Produces identical DOM structure
 * (.tippy-box / .tippy-content with data-theme, data-animation, data-state,
 * data-placement attributes) so the existing _tooltips.scss styles apply
 * without any stylesheet modifications.
 *
 * Supports two usage modes:
 * 1. Declarative — wrap a React child element with <Tooltip content="...">
 * 2. Imperative — TooltipManager observes the DOM for [tooltip] and
 *    [data-html-tooltip] attributes on non-React elements (plugin/Jelly content)
 *
 * @module components/tooltips/Tooltip
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { createElementFromHtml } from "@/utils/dom";

/* ---------------------------------------------------------------------------
 * Global Window Interface Extension
 * ---------------------------------------------------------------------------
 * Declares hoverNotification on Window so TypeScript recognises the global
 * function registered for plugin ecosystem compatibility.
 * --------------------------------------------------------------------------- */
declare global {
  interface Window {
    hoverNotification?: (text: string, element: HTMLElement) => void;
  }
}

/* ---------------------------------------------------------------------------
 * Constants — mirrors TOOLTIP_BASE from the original tippy.js implementation
 * --------------------------------------------------------------------------- */

/** CSS transition / animation duration in ms (source: TOOLTIP_BASE.duration) */
const ANIMATION_DURATION = 250;

/** Default show-delay in ms (source: registerTooltip defaultDelay) */
const DEFAULT_DELAY = 250;

/** Auto-hide timeout for hoverNotification in ms (source: setTimeout 3000) */
const HOVER_NOTIFICATION_TIMEOUT = 3000;

/** Default gap between trigger element and tooltip in px */
const DEFAULT_GAP = 10;

/** Grace period before hiding interactive tooltips to let cursor travel */
const INTERACTIVE_GRACE = 100;

/** CSS selector matching elements carrying tooltip attributes */
const TOOLTIP_SELECTOR = "[tooltip], [data-html-tooltip]";

/* ---------------------------------------------------------------------------
 * Public Types
 * --------------------------------------------------------------------------- */

/**
 * Props for the declarative Tooltip component.
 *
 * Each prop mirrors a corresponding DOM attribute from the source:
 * | Prop            | Attribute                       |
 * |-----------------|---------------------------------|
 * | content         | tooltip                         |
 * | htmlContent     | data-html-tooltip               |
 * | delay           | data-tooltip-delay              |
 * | appendToParent  | data-tooltip-append-to-parent   |
 * | interactive     | data-tooltip-interactive        |
 */
export interface TooltipProps {
  /** Single child element to wrap with tooltip behaviour */
  children: React.ReactElement;
  /** Plain-text tooltip content. Supports {@code <br>} and {@code \\n} for newlines. */
  content?: string;
  /** HTML tooltip content rendered via dangerouslySetInnerHTML */
  htmlContent?: string;
  /** Show delay in milliseconds (default 250). Hide is always immediate. */
  delay?: number;
  /** When true the tooltip is portalled into the trigger's parent element */
  appendToParent?: boolean;
  /** When true the tooltip stays visible while the pointer is over it */
  interactive?: boolean;
}

/* ---------------------------------------------------------------------------
 * Private Types
 * --------------------------------------------------------------------------- */

interface PositionResult {
  x: number;
  y: number;
  placement: "top" | "bottom";
}

/* ---------------------------------------------------------------------------
 * Touch Detection
 * Implements TOOLTIP_BASE.touch = false — tooltips must not appear on touch.
 * --------------------------------------------------------------------------- */
let isTouchInteraction = false;

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener(
    "touchstart",
    () => {
      isTouchInteraction = true;
    },
    { passive: true },
  );
  window.addEventListener(
    "mousemove",
    () => {
      isTouchInteraction = false;
    },
    { passive: true },
  );
}

/* ---------------------------------------------------------------------------
 * Private Utility Functions
 * --------------------------------------------------------------------------- */

/**
 * Reads the --section-padding CSS custom property and converts to px.
 *
 * Mirrors the TOOLTIP_BASE.popperOptions.modifiers.preventOverflow.padding:
 * ```
 * parseFloat(
 *   getComputedStyle(document.documentElement)
 *     .getPropertyValue("--section-padding")
 * ) * 16
 * ```
 */
function getBoundaryPadding(): number {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(
      "--section-padding",
    );
    const parsed = parseFloat(raw);
    return Number.isNaN(parsed) ? 0 : parsed * 16;
  } catch {
    return 0;
  }
}

/**
 * Calculates tooltip position with viewport-boundary prevention.
 *
 * Replicates the Popper.js preventOverflow modifier from TOOLTIP_BASE:
 * - Default placement is **top** (above the trigger)
 * - Flips to **bottom** when top would overflow the viewport
 * - Clamps horizontally within the viewport minus boundary padding
 */
function calculateTooltipPosition(
  triggerRect: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number,
  gap: number = DEFAULT_GAP,
): PositionResult {
  const padding = getBoundaryPadding();
  const viewportWidth = window.innerWidth;

  // Default: above the trigger
  let placement: "top" | "bottom" = "top";
  let y = triggerRect.top - tooltipHeight - gap;

  // Flip to bottom when the tooltip overflows the top boundary
  if (y < padding) {
    placement = "bottom";
    y = triggerRect.bottom + gap;
  }

  // Centre horizontally relative to the trigger
  let x = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;

  // Clamp within viewport (minus boundary padding on each side)
  const maxX = viewportWidth - tooltipWidth - padding;
  x = Math.max(padding, Math.min(x, maxX));

  return { x, y, placement };
}

/**
 * Converts tooltip text by replacing HTML `<br>` tags and literal
 * `\\n` sequences with actual newline characters. The SCSS uses
 * `white-space: pre-line` on `.tippy-box` to display them.
 */
function convertTooltipText(text: string): string {
  return text.replace(/<br\s*\/?>/gi, "\n").replace(/\\n/g, "\n");
}

/**
 * Escapes plain text for safe HTML insertion inside tooltip DOM elements.
 * Uses the browser's built-in textContent → innerHTML escaping.
 */
function escapeTextForHtml(text: string): string {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

/* ---------------------------------------------------------------------------
 * Imperative Tooltip DOM Helpers
 * ---------------------------------------------------------------------------
 * Shared by hoverNotification() and TooltipManager for creating tooltip DOM
 * elements **outside** the React component tree.  All helpers produce the
 * same class / attribute structure that _tooltips.scss targets:
 *
 *   .tippy-box[data-theme~="tooltip"]
 *   .tippy-box[data-animation="tooltip"][data-state="hidden"]
 *   [data-placement^="top"] / [data-placement^="bottom"]
 *   .tippy-content
 * --------------------------------------------------------------------------- */

/**
 * Creates a fully-styled tooltip DOM element via {@link createElementFromHtml}.
 */
function createTooltipDom(content: string, isHtml: boolean): HTMLElement {
  const safeContent = isHtml
    ? content
    : escapeTextForHtml(convertTooltipText(content));

  const html = [
    '<div class="tippy-box"',
    ' data-theme="tooltip"',
    ' data-animation="tooltip"',
    ' data-state="hidden"',
    ' data-placement="top"',
    ' role="tooltip"',
    ' style="',
    "position:fixed;",
    "left:-9999px;top:-9999px;",
    "z-index:99999;",
    "transition-property:transform,opacity;",
    `transition-duration:${String(ANIMATION_DURATION)}ms;`,
    'pointer-events:none;"',
    ">",
    '<div class="tippy-content">',
    safeContent,
    "</div></div>",
  ].join("");

  return createElementFromHtml(html);
}

/**
 * Measures and positions a tooltip DOM element relative to its trigger.
 * The element **must** already be in the document for measurement.
 */
function positionTooltipDom(
  tooltipEl: HTMLElement,
  triggerEl: HTMLElement,
  gap: number = DEFAULT_GAP,
): void {
  const triggerRect = triggerEl.getBoundingClientRect();
  const tooltipRect = tooltipEl.getBoundingClientRect();
  const pos = calculateTooltipPosition(
    triggerRect,
    tooltipRect.width,
    tooltipRect.height,
    gap,
  );

  tooltipEl.style.left = `${String(pos.x)}px`;
  tooltipEl.style.top = `${String(pos.y)}px`;
  tooltipEl.setAttribute("data-placement", pos.placement);
}

/**
 * Triggers the CSS show-animation by flipping data-state to "visible".
 * Uses requestAnimationFrame so the browser can first paint the hidden frame.
 */
function showTooltipDom(tooltipEl: HTMLElement): void {
  requestAnimationFrame(() => {
    tooltipEl.setAttribute("data-state", "visible");
  });
}

/**
 * Hides a tooltip with animation, then removes it from the DOM.
 */
function hideAndRemoveTooltipDom(tooltipEl: HTMLElement): void {
  tooltipEl.setAttribute("data-state", "hidden");
  setTimeout(() => {
    tooltipEl.parentNode?.removeChild(tooltipEl);
  }, ANIMATION_DURATION);
}

/* ---------------------------------------------------------------------------
 * hoverNotification — Imperative transient tooltip
 * ---------------------------------------------------------------------------
 * Mirrors the original hoverNotification(text, element) that creates a
 * one-shot tooltip on `element`, shows it immediately, and auto-hides
 * after HOVER_NOTIFICATION_TIMEOUT (3 000 ms).
 *
 * This is a standalone function — NOT a React hook — so it works from any
 * imperative context.  It is also registered as window.hoverNotification
 * for plugin ecosystem compatibility (see module-level side-effect at EOF).
 * --------------------------------------------------------------------------- */

/**
 * Shows a transient hover-notification tooltip on the given element.
 *
 * The tooltip appears immediately (no delay), remains for 3 seconds, then
 * fades out and is removed from the DOM.  Mirrors the original tippy.js-based
 * hoverNotification with offset: [0, 0].
 *
 * @param text  - Plain text content for the notification tooltip
 * @param element - The DOM element to attach the notification to
 */
export function hoverNotification(text: string, element: HTMLElement): void {
  if (!text || !element) {
    return;
  }

  const tooltipEl = createTooltipDom(text, false);
  // offset [0, 0] — tooltip sits directly adjacent with zero extra gap
  tooltipEl.style.pointerEvents = "none";
  document.body.appendChild(tooltipEl);

  // Measure and position at offset [0, 0] (gap = 0)
  positionTooltipDom(tooltipEl, element, 0);

  // Show immediately
  showTooltipDom(tooltipEl);

  // Auto-hide after 3 seconds
  setTimeout(() => {
    hideAndRemoveTooltipDom(tooltipEl);
  }, HOVER_NOTIFICATION_TIMEOUT);
}

/* ---------------------------------------------------------------------------
 * Tooltip — Declarative React component
 * ---------------------------------------------------------------------------
 * Wraps a single child element and renders a portal-mounted tooltip on
 * hover/focus.  Produces the same CSS class / data-attribute structure as
 * tippy.js so the existing _tooltips.scss styles apply unchanged.
 * --------------------------------------------------------------------------- */

/**
 * Accessible tooltip wrapper that replaces tippy.js.
 *
 * @example
 * ```tsx
 * <Tooltip content="Save your changes">
 *   <button>Save</button>
 * </Tooltip>
 * ```
 */
function Tooltip({
  children,
  content,
  htmlContent,
  delay = DEFAULT_DELAY,
  appendToParent = false,
  interactive = false,
}: TooltipProps): React.ReactElement {
  /* ---- state ------------------------------------------------------------ */
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [position, setPosition] = useState<PositionResult>({
    x: -9999,
    y: -9999,
    placement: "top",
  });
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    typeof document !== "undefined" ? document.body : null,
  );

  /* ---- refs ------------------------------------------------------------- */
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  /* ---- derived values --------------------------------------------------- */
  const hasContent = Boolean(content) || Boolean(htmlContent);

  /* ---- helpers: clear pending timers ------------------------------------ */
  const clearTimers = useCallback(() => {
    if (showTimeoutRef.current !== null) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  /* ---- title attribute management --------------------------------------- */
  const savedTitleRef = useRef<string | null>(null);

  const removeTitleFromTrigger = useCallback(() => {
    const el = triggerRef.current;
    if (!el) {
      return;
    }
    const tooltipText = content ?? htmlContent ?? "";
    savedTitleRef.current = tooltipText;
    el.removeAttribute("title");
  }, [content, htmlContent]);

  const restoreTitleOnTrigger = useCallback(() => {
    const el = triggerRef.current;
    if (!el || savedTitleRef.current === null) {
      return;
    }
    el.setAttribute("title", savedTitleRef.current);
    savedTitleRef.current = null;
  }, []);

  /* ---- set title on mount / content change ------------------------------ */
  useEffect(() => {
    const el = triggerRef.current;
    if (el && hasContent) {
      el.setAttribute("title", content ?? htmlContent ?? "");
    }
  }, [content, htmlContent, hasContent]);

  /* ---- show / hide callbacks -------------------------------------------- */
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) {
      return;
    }
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    if (appendToParent && trigger.parentElement) {
      const parentRect = trigger.parentElement.getBoundingClientRect();
      const pos = calculateTooltipPosition(
        triggerRect,
        tooltipRect.width,
        tooltipRect.height,
      );
      setPosition({
        x: pos.x - parentRect.left + trigger.parentElement.scrollLeft,
        y: pos.y - parentRect.top + trigger.parentElement.scrollTop,
        placement: pos.placement,
      });
    } else {
      setPosition(
        calculateTooltipPosition(
          triggerRect,
          tooltipRect.width,
          tooltipRect.height,
        ),
      );
    }
  }, [appendToParent]);

  const showTooltip = useCallback(() => {
    if (isTouchInteraction || !hasContent) {
      return;
    }
    clearTimers();
    showTimeoutRef.current = setTimeout(() => {
      removeTitleFromTrigger();
      setIsVisible(true);
      // Animate-in on next frame after render
      animationFrameRef.current = requestAnimationFrame(() => {
        setIsAnimatingIn(true);
      });
    }, delay);
  }, [hasContent, delay, clearTimers, removeTitleFromTrigger]);

  const hideTooltip = useCallback(() => {
    clearTimers();
    setIsAnimatingIn(false);
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      restoreTitleOnTrigger();
    }, ANIMATION_DURATION);
  }, [clearTimers, restoreTitleOnTrigger]);

  const hideTooltipWithGrace = useCallback(() => {
    if (interactive) {
      clearTimers();
      hideTimeoutRef.current = setTimeout(() => {
        hideTooltip();
      }, INTERACTIVE_GRACE);
    } else {
      hideTooltip();
    }
  }, [interactive, hideTooltip, clearTimers]);

  /* ---- reposition when visible ------------------------------------------ */
  useEffect(() => {
    if (isVisible) {
      updatePosition();
    }
  }, [isVisible, updatePosition]);

  /* ---- cleanup on unmount ----------------------------------------------- */
  useEffect(() => {
    return () => {
      clearTimers();
      restoreTitleOnTrigger();
    };
  }, [clearTimers, restoreTitleOnTrigger]);

  /* ---- handle tooltip mouse events for interactive mode ----------------- */
  const onTooltipMouseEnter = useCallback(() => {
    if (interactive) {
      clearTimers();
    }
  }, [interactive, clearTimers]);

  const onTooltipMouseLeave = useCallback(() => {
    if (interactive) {
      hideTooltip();
    }
  }, [interactive, hideTooltip]);

  /* ---- ref callback to merge with child ref ----------------------------- */
  const childRefRaw = (children as unknown as Record<string, unknown>).ref;
  const childRefStable = useRef(childRefRaw);
  useEffect(() => {
    childRefStable.current = childRefRaw;
  });

  const setTriggerRef = useCallback(
    (node: HTMLElement | null) => {
      triggerRef.current = node;

      // Update portal container when trigger ref changes
      if (appendToParent && node?.parentElement) {
        setPortalContainer(node.parentElement);
      } else {
        setPortalContainer(
          typeof document !== "undefined" ? document.body : null,
        );
      }

      // Preserve any existing ref on the child element
      const externalRef = childRefStable.current;
      if (typeof externalRef === "function") {
        (externalRef as (instance: HTMLElement | null) => void)(node);
      } else if (
        externalRef !== null &&
        externalRef !== undefined &&
        typeof externalRef === "object"
      ) {
        const mutableRef =
          externalRef as React.MutableRefObject<HTMLElement | null>;
        mutableRef.current = node;
      }
    },
    [appendToParent],
  );

  /* ---- render tooltip content ------------------------------------------- */
  const renderTooltipContent = (): React.ReactNode => {
    const displayContent = content ? convertTooltipText(content) : undefined;

    return (
      <div
        ref={tooltipRef}
        className="tippy-box"
        data-theme="tooltip"
        data-animation="tooltip"
        data-state={isAnimatingIn ? "visible" : "hidden"}
        data-placement={position.placement}
        role="tooltip"
        style={{
          position: appendToParent ? "absolute" : "fixed",
          left: position.x,
          top: position.y,
          zIndex: 99999,
          transitionProperty: "transform, opacity",
          transitionDuration: `${String(ANIMATION_DURATION)}ms`,
          pointerEvents: interactive ? "auto" : "none",
        }}
        onMouseEnter={onTooltipMouseEnter}
        onMouseLeave={onTooltipMouseLeave}
      >
        {htmlContent ? (
          <div
            className="tippy-content"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        ) : (
          <div className="tippy-content">{displayContent}</div>
        )}
      </div>
    );
  };

  /* ---- render ----------------------------------------------------------- */
  /* eslint-disable react-hooks/refs -- ref callback via cloneElement is invoked during commit phase, not render */
  const clonedChild = React.cloneElement(
    children as React.ReactElement<Record<string, unknown>>,
    {
      ref: setTriggerRef,
      onMouseEnter: (e: React.MouseEvent) => {
        showTooltip();
        const childProps = children.props as Record<string, unknown>;
        if (typeof childProps.onMouseEnter === "function") {
          (childProps.onMouseEnter as (e: React.MouseEvent) => void)(e);
        }
      },
      onMouseLeave: (e: React.MouseEvent) => {
        hideTooltipWithGrace();
        const childProps = children.props as Record<string, unknown>;
        if (typeof childProps.onMouseLeave === "function") {
          (childProps.onMouseLeave as (e: React.MouseEvent) => void)(e);
        }
      },
      onFocus: (e: React.FocusEvent) => {
        showTooltip();
        const childProps = children.props as Record<string, unknown>;
        if (typeof childProps.onFocus === "function") {
          (childProps.onFocus as (e: React.FocusEvent) => void)(e);
        }
      },
      onBlur: (e: React.FocusEvent) => {
        hideTooltip();
        const childProps = children.props as Record<string, unknown>;
        if (typeof childProps.onBlur === "function") {
          (childProps.onBlur as (e: React.FocusEvent) => void)(e);
        }
      },
    },
  );
  /* eslint-enable react-hooks/refs */

  return (
    <>
      {clonedChild}
      {isVisible && hasContent && portalContainer
        ? createPortal(renderTooltipContent(), portalContainer)
        : null}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * TooltipManager — MutationObserver-based tooltip manager
 * ---------------------------------------------------------------------------
 * Replaces the `behaviorShim.specify("[tooltip], [data-html-tooltip]", ...)`
 * registration from the original source.
 *
 * Observes the entire document for elements carrying `tooltip` or
 * `data-html-tooltip` attributes (plugin-generated, Jelly-rendered, or
 * dynamically injected DOM) and imperatively attaches tooltip behaviour.
 *
 * Renders nothing visually — it is a side-effect-only component.
 * --------------------------------------------------------------------------- */

interface ManagedTooltip {
  triggerEl: HTMLElement;
  tooltipEl: HTMLElement | null;
  showTimeoutId: ReturnType<typeof setTimeout> | null;
  hideTimeoutId: ReturnType<typeof setTimeout> | null;
  cleanup: () => void;
}

/** Reads tooltip configuration from data-* attributes on an element. */
function readTooltipConfig(el: HTMLElement): {
  content: string;
  isHtml: boolean;
  delay: number;
  appendToParent: boolean;
  interactive: boolean;
} | null {
  const textContent = el.getAttribute("tooltip");
  const htmlContent = el.getAttribute("data-html-tooltip");

  if (!textContent && !htmlContent) {
    return null;
  }

  return {
    content: (htmlContent ?? textContent) as string,
    isHtml: Boolean(htmlContent),
    delay:
      parseInt(el.getAttribute("data-tooltip-delay") ?? "", 10) ||
      DEFAULT_DELAY,
    appendToParent: el.hasAttribute("data-tooltip-append-to-parent"),
    interactive:
      el.hasAttribute("data-tooltip-interactive") && Boolean(htmlContent),
  };
}

/**
 * Attaches imperative tooltip behaviour to a single DOM element.
 * Returns a cleanup function that removes all event listeners and
 * any active tooltip DOM node.
 */
function attachTooltipToElement(el: HTMLElement): ManagedTooltip {
  const managed: ManagedTooltip = {
    triggerEl: el,
    tooltipEl: null,
    showTimeoutId: null,
    hideTimeoutId: null,
    cleanup: () => {
      /* replaced below */
    },
  };

  function clearManagedTimers(): void {
    if (managed.showTimeoutId !== null) {
      clearTimeout(managed.showTimeoutId);
      managed.showTimeoutId = null;
    }
    if (managed.hideTimeoutId !== null) {
      clearTimeout(managed.hideTimeoutId);
      managed.hideTimeoutId = null;
    }
  }

  function showManaged(): void {
    if (isTouchInteraction) {
      return;
    }
    const cfg = readTooltipConfig(el);
    if (!cfg) {
      return;
    }

    clearManagedTimers();
    managed.showTimeoutId = setTimeout(() => {
      // Remove title to suppress native browser tooltip
      if (el.hasAttribute("title")) {
        el.removeAttribute("title");
      }

      // If a tooltip already exists for this element, remove it first
      if (managed.tooltipEl?.parentNode) {
        managed.tooltipEl.parentNode.removeChild(managed.tooltipEl);
      }

      const tooltipEl = createTooltipDom(cfg.content, cfg.isHtml);
      if (cfg.interactive) {
        tooltipEl.style.pointerEvents = "auto";
      }
      managed.tooltipEl = tooltipEl;

      const container =
        cfg.appendToParent && el.parentElement
          ? el.parentElement
          : document.body;
      container.appendChild(tooltipEl);

      // Position and measure
      if (cfg.appendToParent && el.parentElement) {
        const parentRect = el.parentElement.getBoundingClientRect();
        const triggerRect = el.getBoundingClientRect();
        const tooltipRect = tooltipEl.getBoundingClientRect();
        const pos = calculateTooltipPosition(
          triggerRect,
          tooltipRect.width,
          tooltipRect.height,
        );
        tooltipEl.style.position = "absolute";
        tooltipEl.style.left = `${String(
          pos.x - parentRect.left + el.parentElement.scrollLeft,
        )}px`;
        tooltipEl.style.top = `${String(
          pos.y - parentRect.top + el.parentElement.scrollTop,
        )}px`;
        tooltipEl.setAttribute("data-placement", pos.placement);
      } else {
        positionTooltipDom(tooltipEl, el);
      }

      showTooltipDom(tooltipEl);

      // Interactive: keep tooltip open while hovering tooltip itself
      if (cfg.interactive) {
        tooltipEl.addEventListener("mouseenter", () => {
          clearManagedTimers();
        });
        tooltipEl.addEventListener("mouseleave", () => {
          hideManaged();
        });
      }
    }, cfg.delay);
  }

  function hideManaged(): void {
    clearManagedTimers();
    const tooltipEl = managed.tooltipEl;
    if (tooltipEl) {
      hideAndRemoveTooltipDom(tooltipEl);
      managed.tooltipEl = null;
    }
    // Restore title attribute
    const cfg = readTooltipConfig(el);
    if (cfg) {
      el.setAttribute("title", cfg.content);
    }
  }

  function hideWithGrace(): void {
    const cfg = readTooltipConfig(el);
    if (cfg?.interactive) {
      clearManagedTimers();
      managed.hideTimeoutId = setTimeout(hideManaged, INTERACTIVE_GRACE);
    } else {
      hideManaged();
    }
  }

  // Attach listeners
  el.addEventListener("mouseenter", showManaged);
  el.addEventListener("mouseleave", hideWithGrace);
  el.addEventListener("focus", showManaged);
  el.addEventListener("blur", hideManaged);

  // Set initial title
  const cfg = readTooltipConfig(el);
  if (cfg && !el.hasAttribute("title")) {
    el.setAttribute("title", cfg.content);
  }

  managed.cleanup = () => {
    clearManagedTimers();
    el.removeEventListener("mouseenter", showManaged);
    el.removeEventListener("mouseleave", hideWithGrace);
    el.removeEventListener("focus", showManaged);
    el.removeEventListener("blur", hideManaged);
    if (managed.tooltipEl?.parentNode) {
      managed.tooltipEl.parentNode.removeChild(managed.tooltipEl);
    }
  };

  return managed;
}

/**
 * MutationObserver-based tooltip manager that watches the entire document
 * for elements with `[tooltip]` or `[data-html-tooltip]` attributes and
 * attaches tooltip behaviour imperatively.
 *
 * Renders nothing — it is a side-effect-only component meant to be mounted
 * once near the root of the application.
 *
 * Replaces `behaviorShim.specify("[tooltip], [data-html-tooltip]", "-tooltip-", 1000, registerTooltip)`.
 */
export function TooltipManager(): React.ReactElement | null {
  useEffect(() => {
    const managedMap = new Map<HTMLElement, ManagedTooltip>();

    /**
     * Process a single element: if it matches the tooltip selector and
     * hasn't been managed yet, attach tooltip behaviour.
     */
    function processElement(el: Element): void {
      if (!(el instanceof HTMLElement)) {
        return;
      }
      if (!el.matches(TOOLTIP_SELECTOR)) {
        return;
      }
      if (managedMap.has(el)) {
        return;
      }
      managedMap.set(el, attachTooltipToElement(el));
    }

    /**
     * Clean up a managed tooltip when its element is removed from the DOM.
     */
    function cleanupElement(el: Element): void {
      if (!(el instanceof HTMLElement)) {
        return;
      }
      const managed = managedMap.get(el);
      if (managed) {
        managed.cleanup();
        managedMap.delete(el);
      }
    }

    // Process all elements already in the DOM at mount time
    const existingElements = document.querySelectorAll(TOOLTIP_SELECTOR);
    existingElements.forEach(processElement);

    // Observe all future DOM mutations
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Handle added nodes
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLElement) {
            processElement(node);
            // Also check descendants
            const descendants = node.querySelectorAll(TOOLTIP_SELECTOR);
            descendants.forEach(processElement);
          }
        }

        // Handle removed nodes — cleanup
        for (const node of Array.from(mutation.removedNodes)) {
          if (node instanceof HTMLElement) {
            cleanupElement(node);
            const descendants = node.querySelectorAll(TOOLTIP_SELECTOR);
            descendants.forEach(cleanupElement);
          }
        }

        // Handle attribute changes (tooltip attribute added/changed)
        if (
          mutation.type === "attributes" &&
          mutation.target instanceof HTMLElement
        ) {
          const el = mutation.target;
          if (el.matches(TOOLTIP_SELECTOR)) {
            // Re-process: cleanup old, attach new
            cleanupElement(el);
            processElement(el);
          } else {
            // Attribute removed — cleanup
            cleanupElement(el);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["tooltip", "data-html-tooltip"],
    });

    // Cleanup on unmount
    return () => {
      observer.disconnect();
      managedMap.forEach((managed) => {
        managed.cleanup();
      });
      managedMap.clear();
    };
  }, []);

  // Renders nothing — purely side-effect
  return null;
}

/* ---------------------------------------------------------------------------
 * Module-Level Side Effect
 * ---------------------------------------------------------------------------
 * Register hoverNotification globally for plugin ecosystem compatibility.
 * The original source sets `window.hoverNotification = hoverNotification`
 * inside `init()` which runs at module load via behaviorShim.  We replicate
 * the same behaviour as a module-level side-effect so it is available as
 * soon as this module is imported.
 * --------------------------------------------------------------------------- */
if (typeof window !== "undefined") {
  window.hoverNotification = hoverNotification;
}

/* ---------------------------------------------------------------------------
 * Default Export
 * --------------------------------------------------------------------------- */
export default Tooltip;
