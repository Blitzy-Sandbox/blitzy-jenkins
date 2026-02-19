/**
 * SubmitButton — React Form Submit Button Component
 *
 * Replaces `core/src/main/resources/lib/form/submit.jelly`.
 *
 * Renders a `<button type="submit">` element that replicates the exact HTML
 * output of the Jelly template, including:
 * - CSS classes: `jenkins-button jenkins-submit-button` with conditional
 *   `jenkins-button--primary` variant (default: primary)
 * - `formNoValidate` attribute (matches Jelly line 56)
 * - Default `name` of `'Submit'` (matches Jelly `attrs.name ?: 'Submit'`)
 * - Localized button text via `useI18n().t('Submit')`, replicating the
 *   Jelly `%Submit` i18n marker (submit.jelly line 61)
 * - Optional icon rendered inline before text via SVG symbol pattern,
 *   replicating `<l:icon src="${attrs.icon}" />` (submit.jelly lines 58-59)
 *
 * Integrates React 19's `useActionState` hook for form action pending/error
 * state management. When an `action` prop is provided, the button's
 * `formAction` is bound to the dispatch function returned by
 * `useActionState`, enabling automatic `isPending` tracking during
 * asynchronous form submissions.
 *
 * No jQuery — native React state management replaces AJAX patterns.
 * No Handlebars — JSX replaces template rendering.
 * No behaviorShim — React component lifecycle replaces `Behaviour.specify()`.
 *
 * @module SubmitButton
 */

import { useActionState } from 'react';

import { useI18n } from '@/hooks/useI18n';

// ---------------------------------------------------------------------------
// Props Interface
// ---------------------------------------------------------------------------

/**
 * Props for the {@link SubmitButton} component.
 *
 * Maps directly from the Jelly `<f:submit>` tag attributes defined in
 * `core/src/main/resources/lib/form/submit.jelly` (lines 30-53):
 *
 * | Jelly attribute | React prop   | Default     |
 * |-----------------|-------------|-------------|
 * | `id`            | `id`        | `undefined` |
 * | `name`          | `name`      | `'Submit'`  |
 * | `value`         | `value`     | i18n lookup |
 * | `primary`       | `primary`   | `true`      |
 * | `icon`          | `icon`      | `undefined` |
 * | `clazz`         | `className` | `undefined` |
 * | —               | `action`    | `undefined` |
 * | —               | `disabled`  | `false`     |
 */
export interface SubmitButtonProps {
  /**
   * HTML `id` attribute for the button element.
   * Maps from Jelly `attrs.id` (submit.jelly line 30).
   *
   * @since Jenkins 2.376
   */
  id?: string;

  /**
   * HTML `name` attribute for the button.
   * When multiple submit buttons exist on a form, this determines which
   * button was pressed — the server receives a parameter with this name.
   * Maps from Jelly `attrs.name` — defaults to `'Submit'`
   * (submit.jelly line 56: `name="${attrs.name ?: 'Submit'}"`).
   */
  name?: string;

  /**
   * Visible button text **and** the HTML `value` attribute.
   * When omitted, the localized string for key `'Submit'` is used via
   * `useI18n().t('Submit')`, replicating the Jelly `%Submit` i18n pattern
   * (submit.jelly lines 40-42, 56, 61).
   *
   * It is recommended to use a more descriptive label when possible,
   * e.g. `'Create'`, `'Next'`, `'Save'`.
   */
  value?: string;

  /**
   * Controls whether the button renders with the primary visual style.
   * When `true` (default), the `jenkins-button--primary` CSS class is
   * applied. Maps from Jelly `attrs.primary` — defaults to `true`
   * (submit.jelly line 57: `attrs.primary != 'false'`).
   *
   * @since Jenkins 2.376
   * @default true
   */
  primary?: boolean;

  /**
   * Optional icon rendered inline before the button text.
   * Supports Jenkins SVG symbol references (e.g. `'symbol-save'`) and
   * direct image paths (e.g. `'/images/24x24/save.png'`).
   * Maps from Jelly `attrs.icon` rendered via `<l:icon src="..."/>`
   * (submit.jelly lines 58-59).
   *
   * @since Jenkins 2.411
   */
  icon?: string;

  /**
   * Additional CSS class(es) appended to the button element.
   * Maps from Jelly `attrs.clazz` (submit.jelly line 53, 57).
   */
  className?: string;

  /**
   * Optional React 19 form action function for `useActionState` integration.
   *
   * When provided, the button's `formAction` prop is bound to the dispatch
   * function returned by `useActionState`, enabling automatic `isPending`
   * tracking. The button is disabled and shows a loading state while the
   * action is in-flight.
   *
   * The action receives the previous state (always `null` for this
   * component) and the form's `FormData`, and should return `null` on
   * completion.
   *
   * @example
   * ```tsx
   * async function saveJob(_prev: null, formData: FormData) {
   *   await fetch('/job/save', { method: 'POST', body: formData });
   *   return null;
   * }
   * <SubmitButton action={saveJob} value="Save" />
   * ```
   */
  action?: (prevState: null, formData: FormData) => null | Promise<null>;

  /**
   * When `true`, the button is rendered in a disabled state regardless
   * of the `useActionState` pending status.
   *
   * @default false
   */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Internal Constants
// ---------------------------------------------------------------------------

/**
 * No-op form action used as the `useActionState` fallback when no `action`
 * prop is provided. React hooks must be called unconditionally, so this
 * ensures `useActionState` is always invoked with a valid action function.
 *
 * The type annotation ensures signature compatibility with `SubmitButtonProps.action`
 * while the implementation body omits parameter names to satisfy no-unused-vars.
 */
const noopAction: (prevState: null, formData: FormData) => null = () => null;

/**
 * Prefix identifying Jenkins SVG symbol icon references.
 * Icons with this prefix are rendered as inline SVG `<use>` elements;
 * all others are rendered as `<img>` elements.
 */
const SYMBOL_PREFIX = 'symbol-';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * React form submit button replacing `core/src/main/resources/lib/form/submit.jelly`.
 *
 * Renders a `<button type="submit">` element with the exact same CSS class
 * structure and HTML attributes as the Jelly template output.
 *
 * ### Jelly HTML output replicated (submit.jelly lines 56-62):
 * ```html
 * <button id="{id}" name="{name}" value="{text}" formNoValidate="formNoValidate"
 *         class="jenkins-button jenkins-submit-button jenkins-button--primary {clazz}">
 *   <l:icon src="{icon}" />   <!-- conditional -->
 *   {text}
 * </button>
 * ```
 *
 * ### React 19 form action integration:
 * When an `action` prop is provided, the component uses `useActionState` to
 * track pending state during asynchronous form submissions. The button is
 * automatically disabled while the action executes, and the `formAction`
 * attribute is set to the bound dispatch function so that clicking this
 * specific button triggers the associated action (even in forms with
 * multiple submit buttons).
 *
 * @param props - Component props matching the Jelly `<f:submit>` tag attributes
 * @returns A `<button>` element with Jenkins-standard CSS classes and behavior
 *
 * @example
 * ```tsx
 * // Basic usage — defaults to primary style with localized "Submit" text
 * <SubmitButton />
 *
 * // Custom label and icon
 * <SubmitButton value="Save" icon="symbol-save" />
 *
 * // Non-primary (secondary) button
 * <SubmitButton value="Cancel" primary={false} />
 *
 * // With React 19 form action
 * <SubmitButton value="Deploy" action={deployAction} />
 * ```
 */
export function SubmitButton({
  id,
  name = 'Submit',
  value,
  primary = true,
  icon,
  className,
  action,
  disabled = false,
}: SubmitButtonProps): React.JSX.Element {
  const { t } = useI18n();

  // ------------------------------------------------------------------
  // React 19 form action state management
  // ------------------------------------------------------------------
  // `useActionState` must be called unconditionally per React hooks rules.
  // When no `action` prop is provided, the no-op fallback ensures the hook
  // call is still valid. The `isPending` flag is only meaningful when a
  // real action is supplied.
  const [, dispatchAction, isPending] = useActionState<null, FormData>(
    action ?? noopAction,
    null,
  );

  // ------------------------------------------------------------------
  // Localized button text
  // ------------------------------------------------------------------
  // Resolution order matches Jelly `${attrs.value ?: '%Submit'}`:
  // 1. Explicit `value` prop (user-provided text)
  // 2. i18n lookup for the 'Submit' key via `t()` (replaces `%Submit`)
  // 3. Hardcoded 'Submit' fallback if i18n element is absent from the DOM
  const buttonText: string = value ?? t('Submit') ?? 'Submit';

  // ------------------------------------------------------------------
  // CSS class computation
  // ------------------------------------------------------------------
  // Replicates the Jelly class expression (submit.jelly line 57):
  // "jenkins-button jenkins-submit-button
  //  ${attrs.primary != 'false' ? 'jenkins-button--primary' : ''} ${attrs.clazz}"
  const cssClasses: string = [
    'jenkins-button',
    'jenkins-submit-button',
    primary ? 'jenkins-button--primary' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  // ------------------------------------------------------------------
  // Disabled state
  // ------------------------------------------------------------------
  // The button is disabled when:
  // - The `disabled` prop is explicitly `true`, OR
  // - A form action is in-flight (`isPending` from `useActionState`)
  const isDisabled: boolean = disabled || isPending;

  // ------------------------------------------------------------------
  // Conditional name attribute
  // ------------------------------------------------------------------
  // React 19 internally manages the `name` attribute on buttons that have
  // a function `formAction` to encode which action should be dispatched.
  // Setting `name` alongside a function `formAction` triggers a React
  // warning and the `name` gets overridden. Therefore, `name` is only
  // set when no action prop is provided (standard form submit behavior).
  const effectiveName: string | undefined = action ? undefined : name;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <button
      id={id}
      type="submit"
      name={effectiveName}
      value={buttonText}
      formNoValidate
      className={cssClasses}
      disabled={isDisabled}
      /*
       * Only bind `formAction` when an actual action prop was provided.
       * This prevents overriding the parent `<form>`'s default action
       * when the button is used as a simple submit trigger without
       * React 19 action integration.
       */
      formAction={action ? dispatchAction : undefined}
    >
      {icon ? renderIcon(icon) : null}
      {buttonText}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Icon Rendering Helper
// ---------------------------------------------------------------------------

/**
 * Renders a Jenkins icon inline within the button, replicating the
 * `<l:icon src="${attrs.icon}" />` Jelly tag output (submit.jelly line 59).
 *
 * Jenkins icons use two formats:
 * 1. **Symbol icons** (prefix `symbol-`): Rendered as inline SVG with a
 *    `<use>` element referencing the symbol by fragment identifier. This
 *    matches the Jenkins SVG symbol system in `war/src/main/resources/images/symbols/`.
 * 2. **Classic image icons** (URL paths): Rendered as `<img>` elements
 *    with explicit dimensions to prevent layout shift.
 *
 * The icon container is marked `aria-hidden="true"` since the button text
 * provides the accessible label.
 *
 * @param iconSrc - The icon source string (symbol reference or image path)
 * @returns JSX element rendering the icon
 */
function renderIcon(iconSrc: string): React.JSX.Element {
  const isSymbol = iconSrc.startsWith(SYMBOL_PREFIX);

  if (isSymbol) {
    return (
      <span className="jenkins-button__icon" aria-hidden="true">
        <svg
          className="svg-icon jenkins-svg-icon"
          viewBox="0 0 24 24"
          focusable="false"
        >
          <use href={`#${iconSrc}`} />
        </svg>
      </span>
    );
  }

  return (
    <span className="jenkins-button__icon" aria-hidden="true">
      <img
        src={iconSrc}
        alt=""
        width="24"
        height="24"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
