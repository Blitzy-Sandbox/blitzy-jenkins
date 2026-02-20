/**
 * FormEntry — React Form Field Wrapper
 *
 * Replaces `core/src/main/resources/lib/form/entry.jelly`.
 *
 * The most foundational form component in the Jenkins form system — a wrapper
 * for a single form field entry providing:
 * - Label row (title) with optional (?) help icon
 * - Description text
 * - Form control container (`children`)
 * - Validation error display area
 * - Expandable inline help area (loads HTML from Stapler help URL)
 *
 * Two rendering modes exactly replicate the Jelly output:
 *
 * **Mode 1 — title present:**
 *   label → description → control → validation → help
 *
 * **Mode 2 — title absent:**
 *   control(+help link inline) → validation → help → description
 *
 * CSS class output is identical to the Jelly template:
 * - `jenkins-form-item tr` on the outer container
 * - `jenkins-form-label help-sibling` on the label row
 * - `setting-main` on the control wrapper
 * - `validation-error-area` for validation messages
 * - `help-area` / `help` for the expandable help content
 * - `jenkins-form-description` for description text
 * - `jenkins-help-button` on the (?) icon trigger
 *
 * No jQuery. No behaviorShim. No Handlebars.
 *
 * @module forms/FormEntry
 */

import { useState, useCallback, type ReactNode, type JSX } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useStaplerQuery } from '@/hooks/useStaplerQuery';

// =============================================================================
// Public Interface
// =============================================================================

/**
 * Props for the {@link FormEntry} component.
 *
 * Maps 1-to-1 with the Jelly `<f:entry>` tag attributes:
 * - `title`       → `st:attribute name="title"` — label for the control
 * - `field`       → `st:attribute name="field"` — databinding field name
 * - `description` → `st:attribute name="description"` — small text below control
 * - `className`   → `st:attribute name="class"` — additional CSS classes
 * - `help`        → `st:attribute name="help"` — URL to help HTML page
 * - `children`    → `<d:invokeBody />` — the actual form control(s)
 * - `validationError` — validation message for the field (replaces Jelly
 *   server-side validation injection into `.validation-error-area`)
 */
export interface FormEntryProps {
  /**
   * Label text for the control. When provided, renders Mode 1 (label above
   * control). When `undefined` or `null`, renders Mode 2 (control inline).
   *
   * In the original Jelly, this content is HTML unless `escapeEntryTitleAndDescription`
   * is set. The React version treats it as plain text for security.
   */
  title?: string;

  /**
   * Databinding field name. Used by parent forms to connect this entry to
   * a model property. In the original Jelly, this also inferred the help URL
   * via `descriptor.getHelpFile(field)` — the React version expects the caller
   * to provide the `help` prop explicitly.
   */
  field?: string;

  /**
   * Description text rendered below the control (Mode 1) or below the help
   * area (Mode 2). Provides supplementary guidance about the field.
   */
  description?: string;

  /**
   * Additional CSS classes applied to the outer `.jenkins-form-item` container.
   * Corresponds to the Jelly `class` attribute.
   */
  className?: string;

  /**
   * URL to the HTML help page. When provided, a (?) icon is rendered next to
   * the label (Mode 1) or inline with the control (Mode 2). Clicking it
   * expands a help area that loads and displays HTML content from this URL.
   *
   * The URL is relative to the Jenkins root and returns an HTML document
   * wrapped in a `<div>` tag, e.g. `"/plugin/foobar/help/abc.html"`.
   */
  help?: string;

  /**
   * The form control(s) to render inside the `setting-main` wrapper.
   * Corresponds to Jelly's `<d:invokeBody />`.
   */
  children: ReactNode;

  /**
   * Validation error message to display in the `.validation-error-area`.
   * When provided, renders with the `.error` CSS class matching Jenkins'
   * form validation error presentation.
   */
  validationError?: string;
}

// =============================================================================
// Component Implementation
// =============================================================================

/**
 * React form field wrapper replacing `<f:entry>` from
 * `core/src/main/resources/lib/form/entry.jelly`.
 *
 * @example
 * ```tsx
 * // Mode 1 — with title (label above control)
 * <FormEntry title="Project Name" field="name" help="/help/name.html">
 *   <TextBox field="name" />
 * </FormEntry>
 *
 * // Mode 2 — without title (control inline with help)
 * <FormEntry help="/help/option.html">
 *   <Checkbox field="verbose" label="Verbose output" />
 * </FormEntry>
 *
 * // With validation error
 * <FormEntry title="URL" validationError="URL is not reachable">
 *   <TextBox field="url" className="required" />
 * </FormEntry>
 * ```
 */
export function FormEntry({
  title,
  field,
  description,
  className,
  help,
  children,
  validationError,
}: FormEntryProps): JSX.Element {
  // ---------------------------------------------------------------------------
  // State: help area expanded/collapsed
  // ---------------------------------------------------------------------------
  const [helpExpanded, setHelpExpanded] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // i18n: localized labels
  // ---------------------------------------------------------------------------
  const { t } = useI18n();

  // ---------------------------------------------------------------------------
  // Help content: fetched from Stapler endpoint when help area is expanded
  // ---------------------------------------------------------------------------
  // Always call the hook (Rules of Hooks), but only enable the fetch when:
  // 1. A help URL is provided
  // 2. The help area is currently expanded
  const {
    data: helpContent,
    isLoading: helpLoading,
    isError: helpError,
  } = useStaplerQuery<string>({
    url: help ?? '',
    queryKey: ['formEntryHelp', help ?? ''],
    enabled: helpExpanded && help != null && help.length > 0,
    staleTime: 5 * 60 * 1000, // Help pages are static — cache for 5 minutes
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Toggle the help area expanded/collapsed state.
   * Memoized via useCallback to prevent unnecessary re-renders of child
   * form controls when the parent re-renders.
   */
  const handleHelpToggle = useCallback((): void => {
    setHelpExpanded((prev) => !prev);
  }, []);

  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------

  // Build the outer container class string matching Jelly's:
  //   <div class="jenkins-form-item tr ${attrs.class}">
  const containerClassList = ['jenkins-form-item', 'tr'];
  if (className) {
    containerClassList.push(className);
  }
  const containerClass = containerClassList.join(' ');

  // Accessible label for the help button
  const helpAriaLabel =
    t('help') ?? `Help for ${title ?? field ?? 'this field'}`;

  // ---------------------------------------------------------------------------
  // Shared sub-elements
  // ---------------------------------------------------------------------------

  /**
   * Renders the (?) help link button.
   *
   * Replicates `<f:helpLink url="${attrs.help}" featureName="${attrs.title}"/>`
   * from entry.jelly lines 81, 103.
   *
   * Uses an anchor tag with class `jenkins-help-button` matching the output
   * of the Jelly `helpLink.jelly` tag. The SVG icon uses `fill="currentColor"`
   * for theme compatibility.
   */
  const renderHelpLink = (): JSX.Element => (
    <a
      href="#"
      className="jenkins-help-button"
      tabIndex={0}
      role="button"
      aria-label={helpAriaLabel}
      aria-expanded={helpExpanded}
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        handleHelpToggle();
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleHelpToggle();
        }
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        aria-hidden="true"
        focusable="false"
        fill="currentColor"
      >
        <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3h58.3c34.9 0 63.1 28.3 63.1 63.1 0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24V250.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1 0-8.4-6.8-15.1-15.1-15.1H222.6c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1-64 0z" />
      </svg>
    </a>
  );

  /**
   * Renders the expandable help area.
   *
   * Replicates `<f:helpArea />` from entry.jelly lines 95-96, 115.
   *
   * When collapsed: renders a hidden container matching Jelly's initial state.
   * When expanded: loads HTML content from the help URL via useStaplerQuery
   * and renders it inside a `.help` div using `dangerouslySetInnerHTML`,
   * replicating the legacy jQuery AJAX help content injection pattern.
   */
  const renderHelpArea = (): JSX.Element | null => {
    if (!help) {
      return null;
    }

    if (!helpExpanded) {
      return (
        <div className="help-area" style={{ display: 'none' }} />
      );
    }

    return (
      <div className="help-area">
        <div className="help">
          {helpLoading && (
            <div className="jenkins-spinner" aria-label={t('loading') ?? 'Loading...'} />
          )}
          {helpError && (
            <p>{t('helpLoadError') ?? 'Help content could not be loaded.'}</p>
          )}
          {helpContent != null && !helpLoading && !helpError && (
            <div
              // Help content is trusted HTML served from the Jenkins instance.
              // This replicates the legacy pattern where jQuery AJAX response
              // HTML was injected via $(el).html(response).
              dangerouslySetInnerHTML={{ __html: helpContent }}
            />
          )}
        </div>
      </div>
    );
  };

  /**
   * Renders the validation error area.
   *
   * Replicates the `<div class="validation-error-area">` from entry.jelly
   * lines 91-93, 112-114. In the original Jelly, this container is populated
   * by Jenkins' client-side form validation system (hudson-behavior.js).
   * In the React version, validation errors are passed via the
   * `validationError` prop.
   */
  const renderValidationArea = (): JSX.Element => (
    <div className="validation-error-area">
      {validationError != null && validationError.length > 0 && (
        <div className="error">{validationError}</div>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Mode 1: title is provided — label → description → control → validation → help
  // ---------------------------------------------------------------------------
  // Replicates entry.jelly lines 78-96
  if (title != null) {
    return (
      <div className={containerClass}>
        {/* Label row — entry.jelly line 79-82 */}
        <div className="jenkins-form-label help-sibling">
          {title}
          {help != null && renderHelpLink()}
        </div>

        {/* Description — entry.jelly lines 83-87 */}
        {description != null && description.length > 0 && (
          <div className="jenkins-form-description">{description}</div>
        )}

        {/* Control wrapper — entry.jelly lines 88-90 */}
        <div className="setting-main">
          {children}
        </div>

        {/* Validation area — entry.jelly lines 91-93 */}
        {renderValidationArea()}

        {/* Help area — entry.jelly lines 94-96 */}
        {renderHelpArea()}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Mode 2: title is null/undefined — control(+help) → validation → help → description
  // ---------------------------------------------------------------------------
  // Replicates entry.jelly lines 98-121
  return (
    <div className={containerClass}>
      {/* Control wrapper with optional inline help link — entry.jelly lines 99-110 */}
      {help != null ? (
        <div
          className="setting-main help-sibling"
          style={{ display: 'inline-flex', alignItems: 'center' }}
        >
          {children}
          {renderHelpLink()}
        </div>
      ) : (
        <div className="setting-main help-sibling">
          {children}
        </div>
      )}

      {/* Validation area — entry.jelly lines 112-114 */}
      {renderValidationArea()}

      {/* Help area — entry.jelly line 115 (unconditional in Mode 2) */}
      {renderHelpArea()}

      {/* Description — entry.jelly lines 116-119 (after help in Mode 2) */}
      {description != null && description.length > 0 && (
        <div className="jenkins-form-description">{description}</div>
      )}
    </div>
  );
}
