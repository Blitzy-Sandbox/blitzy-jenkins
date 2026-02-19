import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentType,
} from "react";

/**
 * Props for the Defer component.
 *
 * Replaces the legacy `behaviorShim.specify('.defer-element', ...)` pattern
 * from `src/main/js/components/defer/index.js` with declarative React
 * Suspense-based lazy-loading.
 */
export interface DeferProps {
  /** The content to render inside the Suspense boundary. */
  children?: ReactNode;

  /**
   * Optional fallback UI shown while suspended content is loading.
   * Replaces the placeholder element that the legacy code removed after render.
   * Defaults to `null` (no visible fallback).
   */
  fallback?: ReactNode;

  /**
   * Optional lazy component factory for code-split loading.
   * When provided, `React.lazy()` wraps this factory and the resulting
   * component renders inside the Suspense boundary, replacing the legacy
   * `renderOnDemand(element, callback)` pattern.
   */
  lazy?: () => Promise<{ default: ComponentType<Record<string, unknown>> }>;

  /**
   * Optional callback fired after content has rendered.
   * Replaces the legacy completion callback that dispatched a
   * `DOMContentLoaded` event from the parent element.
   */
  onContentReady?: () => void;

  /** Optional CSS class name applied to the wrapper `<div>`. */
  className?: string;
}

/**
 * Defer — React 19 Suspense lazy-loading wrapper component.
 *
 * This component replaces the legacy `src/main/js/components/defer/index.js`
 * module (18 lines) that used `behaviorShim.specify('.defer-element', '-defer-',
 * 1000, callback)` to register a high-priority DOM mutation observer for
 * deferred content rendering.
 *
 * Two rendering modes are supported:
 *
 * **Mode 1 — Suspense wrapper for children:**
 * When the `lazy` prop is NOT provided, `children` are wrapped in
 * `<Suspense>` with the `fallback` prop. This handles cases where children
 * themselves may suspend (e.g., components using the React 19 `use()` hook).
 *
 * **Mode 2 — Lazy component loading:**
 * When the `lazy` prop IS provided, `React.lazy()` creates a code-split
 * component that is rendered inside `<Suspense>`. This directly replaces the
 * legacy `renderOnDemand()` pattern.
 *
 * After initial mount the component dispatches a synthetic `DOMContentLoaded`
 * event from its parent element for legacy script compatibility — mirroring
 * the exact behavior from the original source (lines 12-13).
 *
 * @example
 * ```tsx
 * // Mode 1 — wrap children that may suspend
 * <Defer fallback={<Spinner />}>
 *   <SuspendingChild />
 * </Defer>
 *
 * // Mode 2 — lazy-load a code-split component
 * <Defer
 *   lazy={() => import('./HeavyComponent')}
 *   fallback={<Skeleton />}
 *   onContentReady={() => console.log('loaded')}
 * />
 * ```
 */
function Defer({
  children,
  fallback = null,
  lazy: lazyFactory,
  onContentReady,
  className,
}: DeferProps) {
  /**
   * Ref for the wrapper `<div>` — used exclusively to obtain the parent
   * element for the legacy `DOMContentLoaded` event dispatch.
   */
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Memoize the lazy component via a `useState` initializer so that
   * `React.lazy()` is called exactly once, even if the parent re-renders.
   * When no `lazyFactory` is provided the value is `null` and the component
   * falls back to rendering `children` directly.
   */
  const [LazyComponent] = useState<ComponentType<Record<string, unknown>> | null>(
    () => (lazyFactory ? lazy(lazyFactory) : null),
  );

  /**
   * Post-render effect mirroring the original source's completion callback:
   *
   * Source lines 11-13:
   * ```js
   * const evt = new Event("DOMContentLoaded", { bubbles: true });
   * parent.dispatchEvent(evt);
   * ```
   *
   * The event is dispatched from the **parent** of the wrapper element so
   * that legacy scripts listening for `DOMContentLoaded` on ancestor nodes
   * continue to function after the migration to React.
   */
  useEffect(() => {
    const parent = containerRef.current?.parentElement;
    if (parent) {
      const evt = new Event("DOMContentLoaded", { bubbles: true });
      parent.dispatchEvent(evt);
    }
    onContentReady?.();
  }, [onContentReady]);

  return (
    <div ref={containerRef} className={className}>
      <Suspense fallback={fallback}>
        {LazyComponent ? <LazyComponent /> : children}
      </Suspense>
    </div>
  );
}

export default Defer;
export { Defer };
