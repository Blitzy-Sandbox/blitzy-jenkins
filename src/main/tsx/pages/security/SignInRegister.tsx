/**
 * SignInRegister — React Sign-In/Register Page Component
 *
 * Replaces the imperative vanilla JavaScript module at
 * `src/main/js/pages/register/index.js` (94 lines). The original module
 * directly manipulates DOM elements (`#password1`, `#password2`,
 * `#showPassword`, `#passwordStrengthWrapper`, `#passwordStrength`) with
 * event listeners for password strength scoring, visibility toggling, and
 * confirmation mirroring.
 *
 * This React component reproduces EXACTLY the same behaviors declaratively
 * using React state, hooks, and JSX:
 *
 * - Password strength scoring algorithm (identical to source lines 37-67)
 * - Strength label thresholds: >80 strong, >60 moderate, >=30 weak, else poor
 * - Strength color thresholds: >80 green, >60 yellow, >=30 orange, else error
 * - Password confirmation mirroring (source line 25)
 * - Show/hide password toggle (source lines 29-35)
 * - Strength wrapper visibility toggle (source lines 17, 21)
 *
 * No jQuery, no Handlebars, no behaviorShim, no window-handle.
 * SCSS classes consumed from `src/main/scss/pages/_sign-in-register.scss`.
 * DOM element IDs preserved for SCSS targeting.
 *
 * @module SignInRegister
 */

import { useState, useCallback } from 'react';

import { useI18n } from '@/hooks/useI18n';

// ---------------------------------------------------------------------------
// Pure Utility Functions (non-React, exported for independent testing)
// ---------------------------------------------------------------------------

/**
 * Calculate a password strength score using character frequency analysis
 * and character class variation bonuses.
 *
 * EXACT port of `src/main/js/pages/register/index.js` lines 37-67.
 *
 * Algorithm:
 * 1. Each character in the password earns `5.0 / frequency` points, where
 *    frequency is the number of times that specific character has appeared
 *    so far. First occurrence = 5 pts, second = 2.5 pts, third ≈ 1.67 pts.
 * 2. Bonus for character class variety: digits, lowercase, uppercase,
 *    and non-word characters. Each class present adds 10 points, minus
 *    a base of 10: `(variationCount - 1) * 10`.
 *
 * @param password - The password string to score
 * @returns A numeric score; higher values indicate stronger passwords.
 *          Returns 0 for empty or falsy passwords.
 */
export function passwordScore(password: string): number {
  let score = 0;

  if (!password) {
    return score;
  }

  // Award diminishing credit per unique character — first occurrence gets
  // 5 pts, second gets 2.5, third ≈ 1.67, etc.
  const letters: Record<string, number> = {};

  for (let i = 0; i < password.length; i++) {
    letters[password[i]] = (letters[password[i]] || 0) + 1;
    score += 5.0 / letters[password[i]];
  }

  // Bonus points for mixing character classes
  const variations: Record<string, boolean> = {
    digits: /\d/.test(password),
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    nonWords: /\W/.test(password),
  };

  let variationCount = 0;
  for (const check in variations) {
    variationCount += variations[check] === true ? 1 : 0;
  }
  score += (variationCount - 1) * 10;

  return score;
}

/**
 * Map a password strength score to a localized human-readable label.
 *
 * EXACT port of `src/main/js/pages/register/index.js` lines 69-80.
 *
 * Threshold logic (CRITICAL — must match source exactly):
 * - `score > 80`  → "strength-strong"
 * - `score > 60`  → "strength-moderate"
 * - `score >= 30` → "strength-weak"   (note: `>=`, not `>`)
 * - else          → "strength-poor"
 *
 * @param score - Numeric score from {@link passwordScore}
 * @param t     - Localization function from `useI18n().t`; may return null
 * @returns Localized strength label string (empty string if t() returns null)
 */
export function getPasswordStrengthLabel(
  score: number,
  t: (key: string) => string | null,
): string {
  if (score > 80) {
    return t('strength-strong') ?? '';
  }
  if (score > 60) {
    return t('strength-moderate') ?? '';
  }
  if (score >= 30) {
    return t('strength-weak') ?? '';
  }
  return t('strength-poor') ?? '';
}

/**
 * Map a password strength score to a CSS color variable string.
 *
 * EXACT port of `src/main/js/pages/register/index.js` lines 82-93.
 *
 * Threshold logic (same thresholds as label):
 * - `score > 80`  → `"var(--green)"`
 * - `score > 60`  → `"var(--yellow)"`
 * - `score >= 30` → `"var(--orange)"`
 * - else          → `"var(--error-color)"`
 *
 * @param score - Numeric score from {@link passwordScore}
 * @returns CSS custom property `var()` expression string
 */
export function getPasswordStrengthColor(score: number): string {
  if (score > 80) {
    return 'var(--green)';
  }
  if (score > 60) {
    return 'var(--yellow)';
  }
  if (score >= 30) {
    return 'var(--orange)';
  }
  return 'var(--error-color)';
}

// ---------------------------------------------------------------------------
// React Component
// ---------------------------------------------------------------------------

/**
 * Sign-in/register page component with password strength indicator.
 *
 * Declarative React replacement for the imperative DOM manipulation in
 * `src/main/js/pages/register/index.js`. Manages password state, visibility
 * toggle, and strength scoring via React hooks.
 *
 * DOM element IDs are preserved for SCSS targeting:
 * - `#password1`               — primary password input
 * - `#password2`               — confirmation password (mirrors primary)
 * - `#showPassword`            — show password checkbox
 * - `#passwordStrengthWrapper` — strength indicator wrapper
 * - `#passwordStrength`        — strength indicator text
 *
 * CSS class names match selectors in
 * `src/main/scss/pages/_sign-in-register.scss`.
 */
export function SignInRegister(): React.JSX.Element {
  // State: password value and show/hide toggle
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Localization hook — replaces `import { getI18n } from "@/util/i18n"`
  const { t } = useI18n();

  // Derived values computed from password state on each render
  const score = passwordScore(password);
  const strengthLabel =
    password.length > 0 ? getPasswordStrengthLabel(score, t) : '';
  const strengthColor =
    password.length > 0 ? getPasswordStrengthColor(score) : '';
  const isStrengthVisible = password.length > 0;

  // Memoized handler: replaces passwordField.addEventListener("input", ...)
  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value);
    },
    [],
  );

  // Memoized handler: replaces showPasswordField.addEventListener("change", ...)
  const handleShowPasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setShowPassword(e.target.checked);
    },
    [],
  );

  return (
    <div className="app-sign-in-register">
      {/* Branding column — visible at >= 992px via SCSS media query */}
      <div className="app-sign-in-register__branding">
        <div className="app-sign-in-register__branding__starburst" />
      </div>

      {/* Content column */}
      <div className="app-sign-in-register__content">
        <div className="app-sign-in-register__content-inner">
          <form>
            {/* Primary password input */}
            <input
              id="password1"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={handlePasswordChange}
              autoComplete="new-password"
            />

            {/*
              Confirmation password input — mirrors primary password value.
              Source line 25: password2Field.value = passwordField.value;
              Both inputs read from the same `password` state. The confirmation
              field is NOT independently editable — it is automatically filled.
            */}
            <input
              id="password2"
              type="password"
              value={password}
              readOnly
            />

            {/* Show password checkbox */}
            <input
              id="showPassword"
              type="checkbox"
              checked={showPassword}
              onChange={handleShowPasswordChange}
            />

            {/*
              Password strength indicator.
              - Hidden when password is empty (source line 17)
              - Visible with label and color when password is non-empty (source lines 21-24)
              - #passwordStrengthWrapper has ID-based SCSS styling (margin-top: 0.75rem)
              - #passwordStrength has transition via SCSS
            */}
            <div id="passwordStrengthWrapper" hidden={!isStrengthVisible}>
              <span
                id="passwordStrength"
                style={{ color: strengthColor }}
              >
                {strengthLabel}
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
