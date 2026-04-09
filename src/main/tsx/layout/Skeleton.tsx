/**
 * Skeleton — Loading skeleton placeholder component.
 *
 * Replaces `core/src/main/resources/lib/layout/skeleton.jelly`.
 * Renders animated placeholder content during data loading with three variants:
 *   - "side-panel" — 5 empty div bars inside `.jenkins-side-panel-skeleton`
 *   - "form"       — 10 span/div pairs inside `.jenkins-form-skeleton-2`
 *   - default      — 10 span/div pairs inside `.jenkins-form-skeleton`
 *
 * The shimmer animation is driven entirely by CSS (`skeleton/skeleton.css`)
 * which targets nth-of-type selectors on the child elements. The element
 * counts and ordering here MUST match the Jelly source exactly for the
 * CSS animations to apply correctly.
 *
 * This is a pure presentational component — no state, effects, or data fetching.
 */

/**
 * Props for the Skeleton component.
 */
export interface SkeletonProps {
  /**
   * Skeleton type variant.
   *
   * - `"form"` — renders a form placeholder with alternating label/field bars
   *   using the `.jenkins-form-skeleton-2` CSS class.
   * - `"side-panel"` — renders a side panel placeholder with 5 navigation bars
   *   using the `.jenkins-side-panel-skeleton` CSS class.
   * - When omitted or any other value, renders the generic form skeleton
   *   using the `.jenkins-form-skeleton` CSS class.
   *
   * Defaults to the generic form skeleton.
   */
  type?: "form" | "side-panel";
}

/**
 * Renders an animated loading skeleton placeholder.
 *
 * The DOM structure mirrors `skeleton.jelly` exactly:
 * - Side-panel variant: 5 `<div>` children
 * - Form variants: 10 interleaved `<span>` + `<div>` pairs (20 elements total)
 *
 * CSS nth-child selectors in `skeleton.css` depend on these exact counts
 * and element types to apply progressive width and opacity variations.
 */
export function Skeleton({ type }: SkeletonProps) {
  if (type === "side-panel") {
    return (
      <div className="jenkins-side-panel-skeleton">
        <div />
        <div />
        <div />
        <div />
        <div />
      </div>
    );
  }

  if (type === "form") {
    return (
      <div className="jenkins-form-skeleton-2">
        <span />
        <div />
        <span />
        <div />
        <span />
        <div />
        <span />
        <div />
        <span />
        <div />
        <span />
        <div />
        <span />
        <div />
        <span />
        <div />
        <span />
        <div />
        <span />
        <div />
      </div>
    );
  }

  // Default: generic form skeleton (matches Jelly <j:default> branch)
  return (
    <div className="jenkins-form-skeleton">
      <span />
      <div />
      <span />
      <div />
      <span />
      <div />
      <span />
      <div />
      <span />
      <div />
      <span />
      <div />
      <span />
      <div />
      <span />
      <div />
      <span />
      <div />
      <span />
      <div />
    </div>
  );
}

export default Skeleton;
