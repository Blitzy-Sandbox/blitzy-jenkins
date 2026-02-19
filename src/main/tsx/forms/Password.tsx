/**
 * Password — React Password Input Component
 *
 * Replaces `core/src/main/resources/lib/form/password.jelly`.
 * Implements a password input with three rendering modes:
 *
 * 1. **Read-only mode** (`readOnly` prop):
 *    Shows `****` for existing values or localized "N/A" for empty values.
 *
 * 2. **Hiding password mode** (`hidingPasswords` prop):
 *    a. With existing value — shows a concealed placeholder with a lock icon
 *       and a "Change Password" button. Clicking the button reveals the input.
 *    b. With empty/null value — shows a regular text input directly.
 *
 * 3. **Standard mode** (default):
 *    Renders a native `<input type="password">`.
 *
 * All inputs include `checkMethod="post"` as a data attribute when active,
 * matching the Jelly template behavior. The `validated` CSS class is applied
 * when `checkUrl` is provided.
 *
 * No jQuery — native React state replaces DOM manipulation.
 * No Handlebars — JSX replaces templates.
 * No behaviorShim — React lifecycle replaces `Behaviour.specify()`.
 *
 * @module Password
 */

import { useState, useCallback } from 'react';

import { useI18n } from '@/hooks/useI18n';

// ---------------------------------------------------------------------------
// PasswordProps Interface
// ---------------------------------------------------------------------------

/**
 * Props for the {@link Password} component.
 *
 * Maps directly from the Jelly `<f:password>` tag attributes:
 * - `field`        → Databinding field name
 * - `name`         → Input name (defaults to `'_.' + field`)
 * - `value`        → Initial value
 * - `className`    → Additional CSS classes (Jelly `clazz`)
 * - `checkMessage` → Validation error message override
 * - `checkUrl`     → AJAX validation endpoint URL
 * - `readOnly`     → Read-only display mode (Jelly `readOnlyMode`)
 * - `hidingPasswords` → Whether to use the concealed password pattern
 *                       (Jelly `h.useHidingPasswordFields()`)
 * - `onChange`     → Change handler for the password input value
 */
export interface PasswordProps {
  /** Databinding field name used for form submission. */
  field?: string;

  /**
   * HTML name attribute for the input element.
   * When omitted, defaults to `'_.' + field` matching Jelly behavior.
   */
  name?: string;

  /** Initial password value. */
  value?: string;

  /**
   * Additional CSS class(es) to apply to the input element.
   * Supports validation markers like `'required'`, `'number'`, etc.
   */
  className?: string;

  /**
   * Override the default error message when client-side validation
   * fails (e.g., when using `className="required"`).
   */
  checkMessage?: string;

  /**
   * URL for AJAX-based server-side validation.
   * When provided, adds the `validated` CSS class and sets
   * `data-check-url` and `data-check-method="post"` attributes.
   */
  checkUrl?: string;

  /**
   * When `true`, renders a read-only display: `****` for existing
   * values or localized "N/A" for empty values.
   */
  readOnly?: boolean;

  /**
   * When `true`, uses the concealed password pattern:
   * - Existing value: lock icon + "Concealed" text + "Change Password" button
   * - Empty value: standard text input for new password entry
   *
   * Maps to Jelly's `h.useHidingPasswordFields()`.
   */
  hidingPasswords?: boolean;

  /**
   * Callback invoked when the input value changes.
   * Receives the new value as a string argument.
   */
  onChange?: (value: string) => void;
}

// ---------------------------------------------------------------------------
// SVG Lock Icon
// ---------------------------------------------------------------------------

/**
 * Inline SVG lock icon for the concealed password placeholder.
 * Matches the `symbol-lock-closed` icon rendered by Jelly's
 * `<l:icon src="symbol-lock-closed" class="icon-md"/>`.
 *
 * Uses `fill="currentColor"` to inherit the text color and
 * `aria-hidden="true"` since it is decorative only.
 */
function LockIcon() {
  return (
    <svg
      className="icon-md"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2Zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2Zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Password Component
// ---------------------------------------------------------------------------

/**
 * React password input component replacing `lib/form/password.jelly`.
 *
 * Supports three rendering modes that exactly mirror the Jelly template's
 * conditional rendering logic:
 *
 * 1. Read-only mode
 * 2. Hiding password mode (concealed placeholder + change toggle)
 * 3. Standard password input mode
 *
 * @example
 * ```tsx
 * // Standard password field
 * <Password field="apiToken" />
 *
 * // Concealed password with existing value
 * <Password field="password" value="secret" hidingPasswords />
 *
 * // Read-only display
 * <Password field="password" value="secret" readOnly />
 * ```
 */
export function Password({
  field,
  name,
  value,
  className,
  checkMessage,
  checkUrl,
  readOnly = false,
  hidingPasswords = false,
  onChange,
}: PasswordProps) {
  const { t } = useI18n();

  // Resolve the input name: explicit name prop, or inferred from field
  // Matches Jelly: ${attrs.name ?: '_.'+attrs.field}
  const resolvedName = name ?? (field ? `_.${field}` : undefined);

  // Compute whether the `validated` class should be applied
  const hasValidation = checkUrl != null && checkUrl.length > 0;

  // Track whether the user has clicked "Change Password" to reveal the input
  // in hiding-password mode with an existing value.
  const [editing, setEditing] = useState(false);

  // Track the current input value for controlled component behavior
  const [inputValue, setInputValue] = useState(value ?? '');

  // Memoized handler for the "Change Password" button click.
  // Transitions from the concealed placeholder view to the editable input.
  const handleChangePassword = useCallback((): void => {
    setEditing(true);
    // Clear the existing concealed value so the user types a fresh password
    setInputValue('');
    onChange?.('');
  }, [onChange]);

  // Memoized handler for input value changes
  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const newValue = event.target.value;
      setInputValue(newValue);
      onChange?.(newValue);
    },
    [onChange],
  );

  // Build the CSS class string for input elements.
  // Shared logic used by multiple rendering paths.
  const buildInputClassName = (extra: string): string => {
    const classes: string[] = [];
    if (extra) {
      classes.push(extra);
    }
    classes.push('jenkins-input');
    if (hasValidation) {
      classes.push('validated');
    }
    if (className) {
      classes.push(className);
    }
    return classes.join(' ');
  };

  // Localized strings with fallbacks
  const concealedText = t('Concealed') ?? 'Concealed';
  const changePasswordText = t('Change Password') ?? 'Change Password';
  const naText = t('N/A') ?? 'N/A';

  // -------------------------------------------------------------------
  // Mode 1: Read-Only
  // Matches Jelly: <j:when test="${readOnlyMode}">
  // -------------------------------------------------------------------
  if (readOnly) {
    if (value != null && value.length > 0) {
      return <span className="jenkins-readonly">****</span>;
    }
    return <span className="jenkins-not-applicable">{naText}</span>;
  }

  // -------------------------------------------------------------------
  // Mode 2: Hiding Passwords
  // Matches Jelly: <j:when test="${h.useHidingPasswordFields()}">
  // -------------------------------------------------------------------
  if (hidingPasswords) {
    const hasExistingValue = value != null && value.length > 0;

    // Mode 2a: Existing value — show concealed placeholder or editable input
    if (hasExistingValue && !editing) {
      return (
        <div className="hidden-password">
          {/* Hidden input preserves the existing value for form submission */}
          <input
            className={buildInputClassName(
              'complex-password-field hidden-password-field',
            )}
            name={resolvedName}
            value={value}
            type="hidden"
            data-check-method="post"
            data-check-url={checkUrl}
            data-check-message={checkMessage}
            readOnly
          />

          {/* Concealed placeholder with lock icon and Change Password button */}
          <div className="hidden-password-placeholder">
            <div className="hidden-password-legend">
              <LockIcon />
              <span>{concealedText}</span>
            </div>
            <div className="hidden-password-update">
              <button
                type="button"
                className="hidden-password-update-btn jenkins-button jenkins-button--primary"
                onClick={handleChangePassword}
              >
                {changePasswordText}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Mode 2a (after clicking "Change Password"): Show editable text input
    // Mode 2b: Empty/null value — show text input directly for new password
    // Matches Jelly: <m:input ... type="text" ... />
    return (
      <input
        className={buildInputClassName('complex-password-field')}
        name={resolvedName}
        value={inputValue}
        type="text"
        data-check-method="post"
        data-check-url={checkUrl}
        data-check-message={checkMessage}
        onChange={handleInputChange}
        autoComplete="off"
      />
    );
  }

  // -------------------------------------------------------------------
  // Mode 3: Standard Password Input (non-hiding)
  // Matches Jelly: <m:input ... type="password" ... />
  // -------------------------------------------------------------------
  return (
    <input
      className={buildInputClassName('')}
      name={resolvedName}
      value={inputValue}
      type="password"
      data-check-method="post"
      data-check-url={checkUrl}
      data-check-message={checkMessage}
      onChange={handleInputChange}
      autoComplete="off"
    />
  );
}
