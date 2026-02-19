/**
 * StopButtonLink — Build Abort Trigger Component
 *
 * Replaces `src/main/js/components/stop-button-link/index.js` (35 lines).
 * Renders an anchor element styled with the `.stop-button-link` CSS class
 * that sends a POST request to abort a Jenkins build. Optionally shows a
 * confirmation dialog before aborting if a `confirmMessage` prop is provided.
 *
 * **Key behavioral contract (mirrors source EXACTLY):**
 * 1. `event.preventDefault()` on click — stops default anchor navigation
 * 2. `fetch(href, { method: 'post', headers: { [crumbFieldName]: crumbValue } })`
 *    — fire-and-forget POST with CSRF crumb injection
 * 3. If `confirmMessage` is non-null, shows `window.dialog.confirm(question)`
 *    before aborting (preserves Jenkins core dialog integration)
 * 4. If `confirmMessage` is null/undefined, aborts immediately
 *
 * The source used `behaviorShim.specify('.stop-button-link', ...)` to attach
 * behavior to server-rendered `<a>` elements. This React component REPLACES
 * that pattern entirely by owning the render and behavior of the stop button.
 *
 * **CSRF crumb injection** is NON-NEGOTIABLE — every POST includes the crumb
 * header via the `useCrumb` hook, which replaces the source's
 * `window.crumb.wrap({})` pattern.
 *
 * @module StopButtonLink
 */

import { useCallback } from 'react';
import { useCrumb } from '@/hooks/useCrumb';

// ---------------------------------------------------------------------------
// Global type augmentation for window.dialog
//
// The Jenkins core provides a global `window.dialog` object with a `confirm`
// method that returns a Promise resolving on user acceptance. This is used by
// the source file at line 15: `dialog.confirm(question).then(() => execute())`
//
// NOTE: `window.crumb` is already declared in `src/main/tsx/types/jenkins.d.ts`
// via the `CrumbObject` interface. Only `window.dialog` needs local augmentation
// since it is not part of the global type declarations.
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    /**
     * Jenkins core dialog system providing promise-based confirmation dialogs.
     * Used by the stop-button-link source (line 15) and other components.
     * Optional because it may not be initialized on all page types.
     */
    dialog?: {
      /**
       * Shows a confirmation dialog with the given question text.
       * Resolves when the user accepts; rejects or never resolves on cancel.
       *
       * @param question - The confirmation message to display
       * @returns Promise that resolves when user confirms
       */
      confirm: (question: string) => Promise<void>;
    };
  }
}

// ---------------------------------------------------------------------------
// Component Props Interface
// ---------------------------------------------------------------------------

/**
 * Props for the {@link StopButtonLink} component.
 *
 * Maps directly to the source file's DOM attribute extraction:
 * - `href` ← `link.getAttribute("href")` (source line 5)
 * - `confirmMessage` ← `link.getAttribute("data-confirm")` (source line 4)
 * - `children` ← visible button content
 * - `className` ← additional CSS classes (`.stop-button-link` is always applied)
 */
export interface StopButtonLinkProps {
  /**
   * The URL to POST to for aborting the build.
   * Maps to source `href` attribute (line 5).
   * This is the Stapler endpoint URL (relative to Jenkins base URL).
   */
  href: string;

  /**
   * Optional confirmation question text displayed before aborting.
   * Maps to source `data-confirm` attribute (line 4).
   * When provided (non-null/non-undefined), a confirmation dialog is shown
   * via `window.dialog.confirm()` before the abort POST is sent.
   * When absent, the abort executes immediately on click.
   */
  confirmMessage?: string;

  /**
   * The visible content of the stop button (text, icons, or any React node).
   * Rendered inside the `<a>` element.
   */
  children?: React.ReactNode;

  /**
   * Additional CSS class names to apply to the anchor element.
   * The `.stop-button-link` class is ALWAYS prepended for SCSS compatibility
   * with the existing component styles in `src/main/scss/components/`.
   */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component Implementation
// ---------------------------------------------------------------------------

/**
 * Build abort trigger component that sends a POST request to cancel a
 * running Jenkins build.
 *
 * Renders as an `<a>` element with the `.stop-button-link` CSS class to
 * maintain DOM structure and style compatibility with existing SCSS and
 * potential plugin CSS selectors.
 *
 * @param props - Component props
 * @returns The rendered stop button anchor element
 *
 * @example
 * ```tsx
 * // Immediate abort (no confirmation)
 * <StopButtonLink href="/job/myproject/1/stop">
 *   Stop Build
 * </StopButtonLink>
 *
 * // Abort with confirmation dialog
 * <StopButtonLink
 *   href="/job/myproject/1/stop"
 *   confirmMessage="Are you sure you want to abort this build?"
 * >
 *   Stop Build
 * </StopButtonLink>
 * ```
 */
export function StopButtonLink({
  href,
  confirmMessage,
  children,
  className,
}: StopButtonLinkProps): React.JSX.Element {
  const { crumbFieldName, crumbValue } = useCrumb();

  /**
   * Click handler that prevents default anchor navigation and either
   * immediately POSTs to the abort endpoint or shows a confirmation dialog
   * first, depending on whether `confirmMessage` is set.
   *
   * Memoized via `useCallback` to prevent unnecessary re-renders of child
   * components that receive this handler as a prop.
   *
   * Dependencies:
   * - `href` — the abort endpoint URL (source line 5)
   * - `confirmMessage` — optional confirmation text (source line 4)
   * - `crumbFieldName` — CSRF header name from useCrumb hook
   * - `crumbValue` — CSRF token value from useCrumb hook
   */
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>): void => {
      // Source line 7: e.preventDefault() — stops default anchor navigation
      event.preventDefault();

      /**
       * Sends the abort POST request with CSRF crumb header injection.
       *
       * Mirrors source lines 8-12:
       * ```js
       * var execute = function () {
       *   fetch(url, {
       *     method: "post",
       *     headers: crumb.wrap({}),
       *   });
       * };
       * ```
       *
       * The source `crumb.wrap({})` adds `{ [crumb.fieldName]: crumb.value }`
       * to the headers object. Here we build the headers manually from the
       * `useCrumb` hook's return values.
       *
       * IMPORTANT: No response handling — fire-and-forget matches source
       * behavior exactly (source line 12 has no `.then()` or `await`).
       */
      const executeAbort = (): void => {
        const headers: Record<string, string> =
          crumbFieldName && crumbValue
            ? { [crumbFieldName]: crumbValue }
            : {};

        fetch(href, {
          method: 'post',
          headers,
        });
      };

      // Source lines 14-20: Conditional confirmation dialog
      if (confirmMessage != null) {
        // Source lines 14-17:
        //   if (question != null) {
        //     dialog.confirm(question).then(() => { execute(); });
        //   }
        //
        // Uses the global Jenkins dialog system (`window.dialog.confirm`)
        // for backward compatibility — plugins that override the dialog
        // behavior continue to work correctly.
        if (
          typeof window !== 'undefined' &&
          window.dialog &&
          typeof window.dialog.confirm === 'function'
        ) {
          window.dialog.confirm(confirmMessage).then(() => {
            executeAbort();
          });
        }
      } else {
        // Source line 19: execute() — abort immediately when no confirmation
        executeAbort();
      }
    },
    [href, confirmMessage, crumbFieldName, crumbValue],
  );

  // Build the combined CSS class name.
  // `.stop-button-link` is ALWAYS present as the base class to maintain
  // compatibility with the original behaviorShim selector (source line 25:
  // `behaviorShim.specify(".stop-button-link", ...)`) and SCSS styling in
  // `src/main/scss/components/`.
  const combinedClassName: string = className
    ? `stop-button-link ${className}`
    : 'stop-button-link';

  return (
    <a
      href={href}
      data-confirm={confirmMessage}
      className={combinedClassName}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}

export default StopButtonLink;
