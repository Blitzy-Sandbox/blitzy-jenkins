import { useState, useId, useCallback, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";

/**
 * Props for the {@link AdvancedBlock} component.
 *
 * Maps directly to the Jelly `<f:advanced>` tag attributes defined in
 * `core/src/main/resources/lib/form/advanced.jelly`.
 *
 * @see https://github.com/jenkinsci/jenkins/blob/master/core/src/main/resources/lib/form/advanced.jelly
 */
export interface AdvancedBlockProps {
  /**
   * Caption of the expand button.
   *
   * When omitted or undefined, defaults to the localized "Advanced" text
   * via the i18n system, matching the Jelly expression
   * `${attrs.title?:'%Advanced'}`.
   */
  title?: string;

  /** Content rendered inside the expandable advanced section. */
  children: ReactNode;

  /**
   * List of field names that have been customized from their default values.
   *
   * When provided and non-empty, an "Edited" badge is displayed next to the
   * expand button, indicating that advanced options have been modified. This
   * replaces the Jelly pattern where a `java.util.TreeSet` collects
   * customized field names during server-side rendering.
   *
   * A metadata `<div class="advanced-customized-fields-info">` element is
   * also rendered with a `data-customized-fields` attribute containing the
   * comma-separated field names, preserving compatibility with legacy
   * JavaScript behaviours that inspect this data attribute.
   */
  customizedFields?: string[];
}

/**
 * AdvancedBlock — React expandable advanced options section.
 *
 * Replaces `core/src/main/resources/lib/form/advanced.jelly`.
 *
 * Renders an "Advanced…" button that, when clicked, reveals hidden form
 * fields. Includes an "Edited" badge that displays when child fields have
 * been customized from their default values.
 *
 * ## Rendering behaviour
 *
 * - **Collapsed (default)**: The toggle row is visible, containing the
 *   "Advanced…" button with a chevron-down icon and an optional "Edited"
 *   badge. The body section is hidden via `display: none` and marked
 *   `inert` to prevent assistive technology traversal.
 *
 * - **Expanded**: The toggle row is hidden (via `display: none` and
 *   `inert`) and the body section becomes visible. This matches the
 *   legacy `advanced.js` adjunct one-way expansion behaviour where the
 *   button disappears permanently after expansion.
 *
 * ## CSS class parity
 *
 * All CSS classes replicate the Jelly-rendered HTML exactly so that the
 * existing SCSS architecture continues to style the block identically:
 *
 * | Class                                            | Element         |
 * |--------------------------------------------------|-----------------|
 * | `jenkins-form-item tr`                           | Outer container |
 * | `advancedLink jenkins-buttons-row`               | Toggle row      |
 * | `jenkins-button advanced-button advancedButton`  | Button          |
 * | `jenkins-edited-section-label`                   | Edited badge    |
 * | `jenkins-hidden`                                 | Hidden utility  |
 * | `advancedBody`                                   | Content section |
 * | `tbody dropdownList-container`                   | Inner wrapper   |
 * | `advanced-customized-fields-info`                | Metadata div    |
 *
 * ## SVG icons
 *
 * Icons reference the Jenkins symbol sprite sheet via `<use href>`,
 * matching the Jelly `<l:icon src="symbol-*"/>` server-side resolution
 * pattern used across the existing component library.
 *
 * @example
 * ```tsx
 * <AdvancedBlock>
 *   <TextBox field="timeout" />
 *   <Checkbox field="verbose" />
 * </AdvancedBlock>
 * ```
 *
 * @example
 * ```tsx
 * <AdvancedBlock title="More Options" customizedFields={['timeout']}>
 *   <TextBox field="timeout" />
 * </AdvancedBlock>
 * ```
 */
export function AdvancedBlock({
  title,
  children,
  customizedFields,
}: AdvancedBlockProps) {
  /* ── State ───────────────────────────────────────────────────────── */

  /**
   * Whether the advanced section is expanded (visible).
   * Starts collapsed (`false`), matching the Jelly default where the
   * `advancedBody` is hidden until the user clicks the expand button.
   */
  const [expanded, setExpanded] = useState<boolean>(false);

  /* ── Identity ────────────────────────────────────────────────────── */

  /**
   * Unique DOM ID for the "Edited" badge `<span>` element.
   * Replaces the Jelly `h.generateId()` pattern (`<j:set var="id"
   * value="${h.generateId()}"/>`). Referenced by the metadata div's
   * `data-id` attribute to associate the badge with customized field
   * data for legacy JavaScript consumers.
   */
  const badgeId = useId();

  /* ── Localisation ────────────────────────────────────────────────── */

  /**
   * Translation function from the i18n hook.
   * Used to resolve the three localisation keys that the Jelly template
   * references via `%Advanced`, `%Edited`, and `%customizedFields`.
   */
  const { t } = useI18n();

  /* ── Handlers ────────────────────────────────────────────────────── */

  /**
   * Memoised click handler that expands the advanced section.
   *
   * Sets the expanded state to `true`, revealing the hidden form fields
   * and hiding the toggle button row. Matches the legacy `advanced.js`
   * adjunct one-way expansion behaviour where clicking "Advanced…"
   * permanently reveals the section content.
   *
   * Wrapped in `useCallback` with an empty dependency array to prevent
   * unnecessary re-renders of child form fields within the collapsible
   * section when the parent re-renders for unrelated reasons.
   */
  const handleToggle = useCallback(() => {
    setExpanded(true);
  }, []);

  /* ── Derived values ──────────────────────────────────────────────── */

  /**
   * Resolved button caption text.
   *
   * Priority chain (matching Jelly's `${attrs.title?:'%Advanced'}`):
   * 1. Explicit `title` prop passed by the parent
   * 2. Localised "Advanced" string from the i18n system
   * 3. Hard-coded "Advanced" fallback if i18n is unavailable
   */
  const buttonText: string = title ?? t("Advanced") ?? "Advanced";

  /**
   * Whether any fields within this advanced block have been customized
   * from their default values. Drives "Edited" badge visibility and
   * the `advanced-customized-fields-info` metadata div rendering.
   */
  const hasCustomizedFields: boolean =
    customizedFields != null && customizedFields.length > 0;

  /**
   * Localised tooltip text for the "Edited" badge.
   * Uses the `customizedFields` i18n key, matching the Jelly pattern
   * `tooltip="${%customizedFields}"`. Falls back to a sensible English
   * default when i18n data is not yet loaded.
   */
  const badgeTooltip: string | undefined = hasCustomizedFields
    ? (t("customizedFields") ?? "Customized fields")
    : undefined;

  /**
   * Localised "Edited" label text.
   * Uses the `Edited` i18n key, matching the Jelly `${%Edited}` pattern.
   */
  const editedText: string = t("Edited") ?? "Edited";

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <div className="jenkins-form-item tr">
      {/* ── Toggle row: expand button + edited badge ──────────────── */}
      <div
        className="advancedLink jenkins-buttons-row"
        style={expanded ? { display: "none" } : undefined}
        inert={expanded ? true : undefined}
      >
        {/*
         * Expand button — type="button" prevents form submission.
         * The `advancedButton` class is a legacy alias preserved for
         * backward-compatible CSS selectors.
         */}
        <button
          type="button"
          className="jenkins-button advanced-button advancedButton"
          onClick={handleToggle}
        >
          {buttonText}
          {/*
           * Chevron-down icon — references the Jenkins SVG symbol sprite
           * sheet, matching Jelly's <l:icon src="symbol-chevron-down"/>.
           * The svg-icon class allows SCSS to size the icon relative to
           * the surrounding text. No explicit width/height so that CSS
           * controls sizing via the parent button's font metrics.
           */}
          <svg className="svg-icon" aria-hidden="true" focusable="false">
            <use href="#symbol-chevron-down" />
          </svg>
        </button>

        {/*
         * "Edited" badge — visible only when customizedFields is
         * non-empty. The `jenkins-hidden` utility class applies
         * `display: none`, hiding the badge when no fields have been
         * customized. This replaces the Jelly pattern where the span
         * starts hidden and legacy JavaScript reveals it based on the
         * `advanced-customized-fields-info` metadata div presence.
         */}
        <span
          className={
            hasCustomizedFields
              ? "jenkins-edited-section-label"
              : "jenkins-edited-section-label jenkins-hidden"
          }
          id={badgeId}
          title={badgeTooltip}
        >
          {/*
           * Edit icon — references the Jenkins SVG symbol sprite sheet,
           * matching Jelly's <l:icon src="symbol-edit"/>.
           */}
          <svg className="svg-icon" aria-hidden="true" focusable="false">
            <use href="#symbol-edit" />
          </svg>
          {editedText}
        </span>
      </div>

      {/* ── Expandable body ───────────────────────────────────────── */}
      <div
        className="advancedBody"
        style={expanded ? undefined : { display: "none" }}
        inert={expanded ? undefined : true}
      >
        <div className="tbody dropdownList-container">
          {/*
           * Advanced content — rendered via React children, replacing
           * the Jelly `<d:invokeBody/>` invocation that renders the
           * tag body content.
           */}
          {children}
        </div>
      </div>

      {/*
       * ── Customized fields metadata div ─────────────────────────
       *
       * Conditional rendering matching the Jelly expression:
       *   <j:if test="${!customizedFields.isEmpty()}">
       *
       * Provides `data-id` (linking to the badge span) and
       * `data-customized-fields` (comma-separated field name list)
       * attributes for legacy JavaScript integration. The inline
       * narrowing check (`!= null && .length > 0`) allows TypeScript
       * to narrow the type to `string[]` within the truthy branch.
       */}
      {customizedFields != null && customizedFields.length > 0 && (
        <div
          className="advanced-customized-fields-info"
          data-id={badgeId}
          data-customized-fields={customizedFields.join(", ")}
        />
      )}
    </div>
  );
}
