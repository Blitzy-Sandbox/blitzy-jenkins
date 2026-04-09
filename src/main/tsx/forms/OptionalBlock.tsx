import { useState, useCallback, type ReactNode, type ChangeEvent } from "react";
import { Checkbox } from "./Checkbox";

/**
 * Props for the OptionalBlock component.
 * Maps from the Jelly optionalBlock.jelly attributes to React props.
 *
 * @see core/src/main/resources/lib/form/optionalBlock.jelly
 */
export interface OptionalBlockProps {
  /**
   * Checkbox name for server submission.
   * Determines the form field name sent when the block is expanded.
   */
  name?: string;

  /**
   * Human readable text that follows the checkbox.
   * When null or undefined the component degrades to rowSet mode:
   * no checkbox is rendered and the body is always visible, providing
   * JSON-level grouping only.
   */
  title?: string;

  /**
   * Databinding field name — alternative to the name/title combo.
   * Used by the Stapler descriptor system to resolve the field binding.
   */
  field?: string;

  /**
   * Initial checkbox state. When true the section starts expanded
   * (or collapsed when `negative` is also true).
   */
  checked?: boolean;

  /**
   * URL for inline help (?) icon.
   * When present a help toggle button is rendered adjacent to the checkbox
   * and a help area container is included below the checkbox row.
   */
  help?: string;

  /**
   * When true the foldable section expands when the checkbox is UNchecked
   * and collapses when checked, inverting the default behaviour.
   */
  negative?: boolean;

  /**
   * When true the foldable section is NOT grouped into a separate JSON
   * object upon form submission. Controls whether `row-set-start` and
   * `row-set-end` CSS classes are applied.
   */
  inline?: boolean;

  /** Content rendered inside the foldable section. */
  children?: ReactNode;

  /**
   * Callback invoked whenever the checkbox state changes.
   * Receives the new checked boolean value.
   */
  onChange?: (checked: boolean) => void;
}

/**
 * React collapsible optional section replacing lib/form/optionalBlock.jelly.
 *
 * Implements a foldable block that expands or collapses when its controlling
 * checkbox is toggled. When collapsed child controls are hidden via
 * `display: none` and marked inert so they are excluded from form
 * submission and assistive-technology traversal — matching the original
 * Jelly behaviour where collapsed fields do not send values to the server.
 *
 * ## Rendering Modes
 *
 * **Normal mode** — `title` is provided:
 *   Renders a checkbox inside `optionalBlock-container jenkins-form-item`
 *   with a foldable `form-container` section whose visibility is driven
 *   by the checkbox state and the `negative` prop.
 *
 * **RowSet mode** — `title` is null / undefined:
 *   Renders children unconditionally inside a simple row-set wrapper
 *   with no checkbox control, mirroring the Jelly `<f:rowSet>` fallback.
 *
 * ## CSS Class Parity
 *
 * All class names applied by this component replicate the Jelly-rendered
 * HTML so that the existing SCSS architecture (components, form, base)
 * continues to style the block identically.
 */
export function OptionalBlock({
  name,
  title,
  field,
  checked: initialChecked = false,
  help,
  negative = false,
  inline = false,
  children,
  onChange,
}: OptionalBlockProps) {
  /* ── State ───────────────────────────────────────────────────────── */

  /** Boolean expanded state initialised from the `checked` prop. */
  const [isChecked, setIsChecked] = useState<boolean>(initialChecked);

  /** Inline help area visibility toggle. */
  const [helpVisible, setHelpVisible] = useState<boolean>(false);

  /* ── Handlers ────────────────────────────────────────────────────── */

  /**
   * Memoised checkbox change handler.
   * Updates internal state and propagates the new value to the parent
   * via the `onChange` callback.
   */
  const handleCheckboxChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const newChecked = event.target.checked;
      setIsChecked(newChecked);
      onChange?.(newChecked);
    },
    [onChange],
  );

  /**
   * Memoised help toggle handler.
   * Toggles the inline help area below the checkbox row.
   */
  const toggleHelp = useCallback(() => {
    setHelpVisible((prev) => !prev);
  }, []);

  /* ── Derived values ──────────────────────────────────────────────── */

  /**
   * Content visibility derived from checkbox state and `negative` prop.
   *
   * - Normal (`negative === false`):  visible when checked.
   * - Inverted (`negative === true`): visible when UNchecked.
   */
  const isContentVisible: boolean = negative ? !isChecked : isChecked;

  /* ── RowSet mode ─────────────────────────────────────────────────── */

  /*
   * When title is null / undefined the component degrades to a plain
   * rowSet — a grouping wrapper with no checkbox and always-visible
   * children — mirroring the Jelly `<f:rowSet name="...">` fallback.
   */
  if (title == null) {
    return (
      <div className="row-set-start row-set-end" data-name={name}>
        {children}
      </div>
    );
  }

  /* ── Normal mode (checkbox + foldable section) ───────────────────── */

  /*
   * Construct CSS class lists matching the Jelly-rendered HTML.
   *
   * Checkbox row classes — the `row-set-start` class is included only
   * when `inline` is false (the default), signalling that the block
   * represents a distinct JSON grouping boundary during form submission.
   */
  const checkboxRowClasses: string = [
    "help-sibling",
    "tr",
    "optional-block-start",
    "row-group-start",
    !inline && "row-set-start",
  ]
    .filter(Boolean)
    .join(" ");

  /*
   * End-marker classes — mirrors the Jelly closing `<div>` that marks
   * the end of the foldable block for the legacy behaviour system.
   */
  const endMarkerClasses: string = [
    "tr",
    !inline && "row-set-end",
    "rowvg-end",
    "optional-block-end",
    "row-group-end",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="optionalBlock-container jenkins-form-item">
      {/* ── Checkbox row with optional help link ──────────────────── */}
      <div
        className={checkboxRowClasses}
        data-has-help={help != null ? "true" : undefined}
      >
        <div className="jenkins-checkbox-help-wrapper">
          <Checkbox
            name={name}
            className="optional-block-control block-control optional-block-event-item"
            negative={negative}
            checked={isChecked}
            field={field}
            label={title}
            tooltip={title}
            onChange={handleCheckboxChange}
          />
          {help != null && (
            <button
              type="button"
              className="jenkins-help-button"
              onClick={toggleHelp}
              aria-expanded={helpVisible}
              aria-label={`Help for ${title}`}
            >
              <span aria-hidden="true">?</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Inline help area ──────────────────────────────────────── */}
      {help != null && (
        <div
          className="help-area tr"
          style={helpVisible ? undefined : { display: "none" }}
        >
          <div className="help" data-help-url={help} />
        </div>
      )}

      {/* ── Visibility start marker ───────────────────────────────── */}
      <div className="rowvg-start tr" />

      {/* ── Foldable content container ────────────────────────────── */}
      {/*
       * When collapsed the container is hidden and marked `inert` so
       * that child inputs are excluded from form submission and are
       * unreachable by keyboard / assistive technology — matching the
       * original Jelly behaviour of skipping collapsed fields.
       */}
      <div
        className="form-container tr"
        style={isContentVisible ? undefined : { display: "none" }}
        aria-hidden={!isContentVisible ? true : undefined}
        {...(!isContentVisible ? { inert: true } : {})}
      >
        {children}
      </div>

      {/* ── End marker ────────────────────────────────────────────── */}
      <div className={endMarkerClasses} />
    </div>
  );
}
