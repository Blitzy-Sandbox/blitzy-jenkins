/**
 * ConfirmationLink.tsx — Confirmation Dialog Trigger Component
 *
 * Replaces `src/main/js/components/confirmation-link/index.js` (44 lines).
 * Converts the imperative `behaviorShim.specify('A.confirmation-link', ...)`
 * plus `dialog.confirm()` pattern into a declarative React 19 component.
 *
 * Renders an anchor link that, when clicked, opens a confirmation dialog.
 * On confirm the component creates a transient form element with the target
 * URL and method, injects a CSRF crumb hidden field for POST requests, and
 * submits. On cancel the dialog is simply dismissed with no side effects.
 *
 * @module ConfirmationLink
 */

import React, { useState, useCallback } from "react";
import Dialog from "@/components/dialogs/Dialog";
import { useCrumb } from "@/hooks/useCrumb";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/**
 * Props for the {@link ConfirmationLink} component.
 *
 * Each property maps directly to a `data-*` attribute read from the DOM
 * element in the original source (`index.js` lines 4-8):
 *
 * | Prop          | Source data attribute    | Source line |
 * |---------------|-------------------------|-------------|
 * | `url`         | `data-url`              | 5           |
 * | `post`        | `data-post`             | 4           |
 * | `message`     | `data-message`          | 6           |
 * | `title`       | `data-title`            | 7           |
 * | `destructive` | `data-destructive`      | 8           |
 */
export interface ConfirmationLinkProps {
  /** Target URL for navigation or form submission — source line 5: `data-url` */
  url: string;

  /**
   * Whether to use POST method (true) or GET (false/undefined).
   * Source line 4: `element.getAttribute("data-post") === "true"`
   * @default false
   */
  post?: boolean;

  /** Confirmation dialog message text — source line 6: `data-message` */
  message?: string;

  /** Confirmation dialog title — source line 7: `data-title` */
  title?: string;

  /**
   * Whether the action is destructive, enabling red styling on the dialog.
   * Source line 8: `data-destructive`; source lines 9–11 map to `'destructive'`
   * @default false
   */
  destructive?: boolean;

  /**
   * Child content rendered inside the anchor element.
   * Replaces `element.innerHTML` from Jelly-rendered `<a>` tags.
   */
  children: React.ReactNode;

  /**
   * Additional CSS class names appended after the mandatory `confirmation-link`
   * class. Preserves the class from Jelly templates and SCSS styling.
   */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Confirmation link component — replaces the `A.confirmation-link`
 * behaviorShim registration (source lines 33–42).
 *
 * Renders an anchor element that intercepts clicks, displays a confirmation
 * dialog via the {@link Dialog} component, and on confirmation creates and
 * submits a transient `<form>` element replicating the exact flow from
 * source lines 18–25.
 *
 * ### Migration mapping
 *
 * | Original pattern                  | React replacement                  |
 * |-----------------------------------|------------------------------------|
 * | `behaviorShim.specify(…)`         | Declarative JSX `<ConfirmationLink>` |
 * | `dialog.confirm(title, opts)`     | `<Dialog dialogType="confirm" …/>` |
 * | `crumb.appendToForm(form)`        | `useCrumb()` hook + hidden input   |
 * | `element.addEventListener("click")` | `onClick` prop handler           |
 */
const ConfirmationLink: React.FC<ConfirmationLinkProps> = ({
  url,
  post = false,
  message,
  title,
  destructive = false,
  children,
  className,
}) => {
  // -------------------------------------------------------------------------
  // State — replaces the imperative dialog.confirm() promise (source line 16)
  // -------------------------------------------------------------------------
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // -------------------------------------------------------------------------
  // CSRF crumb — replaces global `crumb.appendToForm(form)` (source line 22)
  // -------------------------------------------------------------------------
  const { crumbFieldName, crumbValue } = useCrumb();

  // -------------------------------------------------------------------------
  // Click handler — source lines 14–15
  // Prevents default anchor navigation and opens the confirmation dialog.
  // -------------------------------------------------------------------------
  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setIsDialogOpen(true);
  }, []);

  // -------------------------------------------------------------------------
  // Confirm handler — source lines 17–25
  //
  // Replicates the transient form creation and submission pattern exactly:
  //   1. Create <form> element                          (source line 18)
  //   2. Set method to POST or GET                      (source line 19)
  //   3. Set action to target URL                       (source line 20)
  //   4. If POST, inject CSRF crumb as hidden field     (source lines 21–23)
  //   5. Append form to document.body                   (source line 24)
  //   6. Submit form                                    (source line 25)
  // -------------------------------------------------------------------------
  const handleConfirm = useCallback(() => {
    setIsDialogOpen(false);

    // Step 1: Create transient form element (source line 18)
    const form = document.createElement("form");

    // Step 2: Set HTTP method — POST or GET (source line 19)
    form.setAttribute("method", post ? "POST" : "GET");

    // Step 3: Set action to target URL (source line 20)
    form.setAttribute("action", url);

    // Step 4: Inject CSRF crumb hidden field for POST requests (source lines 21–23)
    // Replicates `crumb.appendToForm(form)` which creates a hidden input with
    // name=crumbFieldName and value=crumbValue and appends it to the form.
    if (post && crumbFieldName && crumbValue) {
      const crumbInput = document.createElement("input");
      crumbInput.setAttribute("type", "hidden");
      crumbInput.setAttribute("name", crumbFieldName);
      crumbInput.setAttribute("value", crumbValue);
      form.appendChild(crumbInput);
    }

    // Step 5: Append form to document body (source line 24)
    document.body.appendChild(form);

    // Step 6: Submit form triggering full-page navigation (source line 25)
    form.submit();
  }, [post, url, crumbFieldName, crumbValue]);

  // -------------------------------------------------------------------------
  // Cancel handler — source line 27: `() => {}`
  // Cancel is a no-op beyond dismissing the dialog.
  // -------------------------------------------------------------------------
  const handleCancel = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <>
      {/*
       * Anchor element with `confirmation-link` class preserved for:
       *   - SCSS styling that targets `.confirmation-link`
       *   - Plugin JS that queries `A.confirmation-link` selectors
       *
       * Data attributes are preserved for backward compatibility — some
       * plugin JavaScript may read these from the DOM.
       */}
      <a
        href={url}
        className={
          className ? `confirmation-link ${className}` : "confirmation-link"
        }
        data-post={post ? "true" : undefined}
        data-url={url}
        data-message={message}
        data-title={title}
        data-destructive={destructive ? "true" : undefined}
        onClick={handleClick}
      >
        {children}
      </a>

      {/*
       * Confirmation dialog — replaces `dialog.confirm(title, { message, type })`
       * from source line 16. Only mounted when the dialog is open to avoid
       * unnecessary DOM nodes. The Dialog component handles:
       *   - Native <dialog> showModal() for accessibility
       *   - OK/Cancel button rendering
       *   - Enter/Escape keyboard handling
       *   - Closing animation lifecycle
       */}
      {isDialogOpen && (
        <Dialog
          dialogType="confirm"
          options={{
            title: title,
            message: message,
            type: destructive ? "destructive" : "default",
          }}
          open={isDialogOpen}
          onResolve={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default ConfirmationLink;
export { ConfirmationLink };
