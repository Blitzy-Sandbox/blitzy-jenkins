import type React from "react";

/**
 * Props for the {@link FormSection} component.
 *
 * Maps directly to the Jelly `<f:section>` tag attributes defined in
 * `core/src/main/resources/lib/form/section.jelly`.
 *
 * @see https://github.com/jenkinsci/jenkins/blob/master/core/src/main/resources/lib/form/section.jelly
 */
export interface FormSectionProps {
  /**
   * Section header text.
   *
   * When `null` or `undefined`, the entire section becomes a transparent
   * wrapper — no `jenkins-section` class is applied, and no title or icon
   * divs are rendered. This matches the Jelly behavior where a null title
   * makes `<f:section>` a no-op.
   */
  title?: string | null;

  /**
   * Optional description text displayed below the section title.
   * Only rendered when a non-null, non-undefined value is provided.
   */
  description?: string;

  /**
   * Icon symbol path for the section.
   *
   * This icon is rendered inside a `jenkins-hidden` container and is only
   * visible when consumed by `section-to-sidebar-items.js` for sidebar
   * navigation extraction. Defaults to `'symbol-settings'`.
   */
  icon?: string;

  /**
   * Optional name attribute for creating a JSON object from this section.
   *
   * When provided, the section is wrapped in a container `<div>` with
   * a `data-name` attribute for form data grouping, replacing the Jelly
   * `<f:rowSet>` pattern.
   */
  name?: string;

  /** Section content — form fields and other child elements. */
  children: React.ReactNode;
}

/**
 * FormSection — A React component rendering a section header within a form,
 * providing visual grouping of related form fields with an optional icon and
 * description.
 *
 * Replaces `core/src/main/resources/lib/form/section.jelly`.
 *
 * ## Rendering behavior
 *
 * - When `title` is **not null**: the `<section>` element receives the
 *   `jenkins-section` class and a title bar is rendered containing the title
 *   text and a hidden icon `<div>` (used by `section-to-sidebar-items.js`
 *   for sidebar navigation extraction).
 *
 * - When `title` is **null or undefined**: the `<section>` element has no
 *   class and no title bar, effectively acting as a transparent grouping
 *   wrapper for its children.
 *
 * - When `description` is provided: a `jenkins-section__description` `<div>`
 *   is rendered between the title and the children.
 *
 * - When `name` is provided: the entire section is wrapped in a `<div>` with
 *   a `data-name` attribute, replacing the Jelly `<f:rowSet>` form data
 *   grouping pattern.
 *
 * ## CSS classes
 *
 * | Class                            | Condition                |
 * |----------------------------------|--------------------------|
 * | `jenkins-section`                | `title` is not null      |
 * | `jenkins-section__title`         | `title` is not null      |
 * | `jenkins-hidden`                 | `title` is not null      |
 * | `jenkins-section__description`   | `description` is present |
 *
 * @example
 * ```tsx
 * <FormSection title="Source Code Management" icon="symbol-branch">
 *   <TextBox field="scmUrl" />
 * </FormSection>
 * ```
 *
 * @example
 * ```tsx
 * // No title — transparent wrapper
 * <FormSection>
 *   <TextBox field="hidden" />
 * </FormSection>
 * ```
 */
export function FormSection({
  title,
  description,
  icon,
  name,
  children,
}: FormSectionProps) {
  /** Resolve icon with default fallback matching Jelly's `attrs.icon ?: 'symbol-settings'` */
  const resolvedIcon = icon ?? "symbol-settings";

  /** Whether a visible section wrapper should be rendered */
  const hasTitle = title != null;

  const sectionContent = (
    <section className={hasTitle ? "jenkins-section" : undefined}>
      {hasTitle ? (
        <div className="jenkins-section__title">
          {/*
           * Hidden icon container — consumed by section-to-sidebar-items.js
           * to build the sidebar navigation. The `jenkins-hidden` class
           * applies `display: none`, so this div is never visually rendered.
           * The data-icon attribute preserves the icon symbol reference for
           * extraction by sidebar JavaScript.
           */}
          <div className="jenkins-hidden">
            <span data-icon={resolvedIcon} aria-hidden="true" />
          </div>
          {title}
        </div>
      ) : null}

      {description != null ? (
        <div className="jenkins-section__description">{description}</div>
      ) : null}

      {children}
    </section>
  );

  /*
   * When `name` is provided, wrap in a <div> with data-name attribute for
   * form data grouping. This replaces the Jelly `<f:rowSet name={name}>`
   * pattern. When `name` is absent, the rowSet wrapper is transparent
   * (no extra DOM element), matching Jelly's behavior.
   */
  if (name != null) {
    return <div data-name={name}>{sectionContent}</div>;
  }

  return sectionContent;
}
