/**
 * Spinner — Loading spinner indicator component.
 *
 * Replaces `core/src/main/resources/lib/layout/spinner.jelly`.
 * Renders a single `<p>` element with the `.jenkins-spinner` CSS class.
 * All animation is CSS-driven via `::before` and `::after` pseudo-elements
 * defined in `src/main/scss/components/_spinner.scss`.
 *
 * When no text is provided the element is empty, triggering the `:empty`
 * pseudo-class rule that removes the right margin on the `::before` circle,
 * keeping the spinner centered without trailing whitespace.
 */

/** Props accepted by the {@link Spinner} component. */
interface SpinnerProps {
  /** Optional descriptive text displayed alongside the spinner. */
  text?: string;
}

/**
 * Pure presentational loading spinner.
 *
 * @example
 * ```tsx
 * // Spinner with label
 * <Spinner text="Loading…" />
 *
 * // Spinner without label (icon only)
 * <Spinner />
 * ```
 */
export function Spinner({ text }: SpinnerProps) {
  return <p className="jenkins-spinner">{text}</p>;
}

export default Spinner;
