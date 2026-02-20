/**
 * Dialog.tsx — React Modal Dialog Component
 *
 * Replaces src/main/js/components/dialogs/index.js (355 lines).
 * Provides the centralized Jenkins modal dialog system as a React 19 component
 * using the native HTML <dialog> element with .showModal() for accessibility.
 *
 * Supports dialog types: modal, alert, confirm, prompt, form.
 * Exposes window.dialog compatibility interface for the plugin ecosystem.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { CLOSE } from "@/utils/symbols";
import { useI18n } from "@/hooks/useI18n";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/** Dialog type discriminator — determines rendering mode and behavior */
export type DialogType = "modal" | "alert" | "confirm" | "prompt" | "form";

/** Style type — maps to CSS class modifiers on the OK button */
export type DialogStyleType = "default" | "destructive";

/**
 * Configuration options for dialog instances.
 * Mirrors source _defaults (lines 6-16) with additional caller-facing options.
 */
export interface DialogOptions {
  /** Dialog title displayed in the title bar */
  title?: string | null;
  /** Text message displayed in alert/confirm/prompt dialogs */
  message?: string | null;
  /** HTML element or React node for modal/alert content */
  content?: HTMLElement | React.ReactNode | null;
  /** Form element for form dialogs */
  form?: HTMLFormElement | null;
  /** Whether to show the Cancel button (default: true) */
  cancel?: boolean;
  /** Maximum width CSS value (default: '475px') */
  maxWidth?: string;
  /** Minimum width CSS value (default: '450px') */
  minWidth?: string;
  /** Visual style type affecting the OK button color (default: 'default') */
  type?: DialogStyleType;
  /** Whether to hide the close button in modal dialogs (default: false) */
  hideCloseButton?: boolean;
  /** Allow empty prompt input to submit (default: false) */
  allowEmpty?: boolean;
  /** Make the OK button type="submit" for native form submission (default: false) */
  submitButton?: boolean;
  /** Custom OK button label text */
  okText?: string;
  /** Custom Cancel button label text */
  cancelText?: string;
  /** Initial prompt input value */
  promptValue?: string;
}

/** Props for the Dialog React component */
export interface DialogProps {
  /** Type of dialog to render */
  dialogType: DialogType;
  /** Configuration options */
  options: DialogOptions;
  /** Callback when dialog resolves (OK/submit) */
  onResolve: (value: boolean | string | FormData) => void;
  /** Callback when dialog is cancelled */
  onCancel: () => void;
  /** Whether the dialog is open */
  open: boolean;
}

// ---------------------------------------------------------------------------
// Constants — matching source lines 6-21 exactly
// ---------------------------------------------------------------------------

/** Default dialog options — mirrors source _defaults (lines 6-16) */
const DEFAULT_OPTIONS = {
  cancel: true,
  maxWidth: "475px",
  minWidth: "450px",
  type: "default" as DialogStyleType,
  hideCloseButton: false,
  allowEmpty: false,
  submitButton: false,
};

/** Dialog style type to CSS class mapping — mirrors source _typeClassMap (lines 18-21) */
const TYPE_CLASS_MAP: Record<DialogStyleType, string> = {
  default: "",
  destructive: "jenkins-!-destructive-color",
};

/** Translation state shape for dialog button labels */
interface TranslationState {
  ok: string;
  cancel: string;
  yes: string;
  submit: string;
}

/** Default translations used before async bundle loads */
const DEFAULT_TRANSLATIONS: TranslationState = {
  ok: "OK",
  cancel: "Cancel",
  yes: "Yes",
  submit: "Submit",
};

// ---------------------------------------------------------------------------
// Dialog Component
// ---------------------------------------------------------------------------

/**
 * React modal dialog component using native HTML <dialog> element.
 *
 * Renders different dialog layouts based on dialogType:
 * - modal: Content with optional close button and backdrop dismiss
 * - alert: Message with OK button only (no cancel)
 * - confirm: Message with OK and Cancel buttons
 * - prompt: Input field with OK and Cancel buttons
 * - form: Form element with OK (submit) and Cancel buttons
 */
const Dialog: React.FC<DialogProps> = ({
  dialogType,
  options,
  onResolve,
  onCancel,
  open,
}) => {
  // Refs for DOM elements
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formIdRef = useRef<string>(
    `dialog-form-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  // Merge caller options with defaults
  const cancel = options.cancel ?? DEFAULT_OPTIONS.cancel;
  const maxWidth = options.maxWidth ?? DEFAULT_OPTIONS.maxWidth;
  const minWidth = options.minWidth ?? DEFAULT_OPTIONS.minWidth;
  const styleType = options.type ?? DEFAULT_OPTIONS.type;
  const hideCloseButton =
    options.hideCloseButton ?? DEFAULT_OPTIONS.hideCloseButton;
  const allowEmpty = options.allowEmpty ?? DEFAULT_OPTIONS.allowEmpty;
  const submitButton = options.submitButton ?? DEFAULT_OPTIONS.submitButton;

  // State: prompt input value (source lines 102-118)
  const [inputValue, setInputValue] = useState<string>(
    options.promptValue ?? "",
  );

  // State: OK button disabled for prompt mode (source lines 137-143)
  const [okDisabled, setOkDisabled] = useState<boolean>(
    dialogType === "prompt" &&
      !allowEmpty &&
      !(options.promptValue ?? "").trim().length,
  );

  // State: localized button labels (source lines 23-27)
  const [translations, setTranslations] =
    useState<TranslationState>(DEFAULT_TRANSLATIONS);

  // i18n hook — loads translation bundles
  const { loadBundle } = useI18n();

  // -----------------------------------------------------------------------
  // Load translations on mount
  // Replaces jenkins.loadTranslations("jenkins.dialogs", ...) — source lines 23-27
  // -----------------------------------------------------------------------
  useEffect(() => {
    loadBundle("jenkins.dialogs")
      .then((bundle: Record<string, string>) => {
        setTranslations({
          ok: bundle.ok || "OK",
          cancel: bundle.cancel || "Cancel",
          yes: bundle.yes || "Yes",
          submit: bundle.submit || "Submit",
        });
      })
      .catch(() => {
        // Translations remain at defaults on failure
      });
  }, [loadBundle]);

  // Compute button text based on dialog type
  // confirm → translations.yes (source line 301)
  // form → translations.submit (source line 325)
  // others → options.okText ?? translations.ok
  const okButtonText =
    dialogType === "confirm"
      ? (options.okText ?? translations.yes)
      : dialogType === "form"
        ? (options.okText ?? translations.submit)
        : (options.okText ?? translations.ok);

  const cancelButtonText = options.cancelText ?? translations.cancel;

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  /** Cancel handler — mirrors source lines 187-213 */
  const handleCancel = useCallback(() => {
    // Clear URL hash (source lines 192-196)
    history.pushState(
      "",
      document.title,
      window.location.pathname + window.location.search,
    );

    // Apply closing animation via attribute (source line 199)
    const dialogEl = dialogRef.current;
    if (dialogEl) {
      dialogEl.setAttribute("closing", "");
      dialogEl.addEventListener(
        "animationend",
        () => {
          dialogEl.removeAttribute("closing");
          if (dialogEl.open) {
            dialogEl.close();
          }
        },
        { once: true },
      );
    }

    onCancel();
  }, [onCancel]);

  /** OK handler — mirrors source lines 218-239 */
  const handleOk = useCallback(() => {
    let value: boolean | string | FormData = true;

    if (dialogType === "prompt" && inputRef.current) {
      value = inputRef.current.value;
    }

    if (dialogType === "form" && options.form) {
      value = new FormData(options.form);
    }

    onResolve(value);
    // Trigger cancel flow for cleanup animation (source line 235)
    handleCancel();
  }, [dialogType, options.form, onResolve, handleCancel]);

  /** Prompt input change handler — mirrors source lines 137-143, 115-117 */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInputValue(val);
      if (!allowEmpty) {
        setOkDisabled(!val.trim());
      }
    },
    [allowEmpty],
  );

  /**
   * Keyboard handler — mirrors source lines 122-133.
   * Enter → trigger OK (for non-modal types with an OK button).
   * Escape → trigger cancel.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (dialogType !== "modal" && !okDisabled) {
          handleOk();
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    },
    [dialogType, okDisabled, handleOk, handleCancel],
  );

  /** Native dialog cancel event handler — prevents default and delegates */
  const handleNativeCancel = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      handleCancel();
    },
    [handleCancel],
  );

  // -----------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------

  // Open the native dialog when the open prop is true (source lines 185-217)
  useEffect(() => {
    const dialogEl = dialogRef.current;
    if (!dialogEl) {
      return;
    }
    if (open && !dialogEl.open) {
      dialogEl.showModal();
      // Focus management (source lines 214-217)
      if (inputRef.current) {
        inputRef.current.focus();
      } else {
        dialogEl.focus();
      }
    }
  }, [open]);

  // For form type: assign an ID to the form element so the external submit
  // button can reference it via the HTML form attribute
  useEffect(() => {
    if (dialogType === "form" && options.form) {
      if (!options.form.id) {
        options.form.id = formIdRef.current;
      } else {
        formIdRef.current = options.form.id;
      }
    }
  }, [dialogType, options.form]);

  // -----------------------------------------------------------------------
  // Ref callbacks for imperative DOM content
  // -----------------------------------------------------------------------

  /** Appends the form element to the container div */
  const formContainerRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && options.form && !el.contains(options.form)) {
        el.appendChild(options.form);
      }
    },
    [options.form],
  );

  /** Appends HTMLElement content to the container div (alert/confirm) */
  const htmlContentRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (
        el &&
        options.content instanceof HTMLElement &&
        !el.contains(options.content)
      ) {
        el.appendChild(options.content);
      }
    },
    [options.content],
  );

  /** Appends HTMLElement content inside modal contents div */
  const modalHtmlContentRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (
        el &&
        options.content instanceof HTMLElement &&
        !el.contains(options.content)
      ) {
        el.appendChild(options.content);
      }
    },
    [options.content],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  // Determine OK button form association for native submit
  const okFormAttr =
    dialogType === "form" && submitButton ? formIdRef.current : undefined;

  // Source line 220: skip click handler when form + submitButton
  const okClickHandler =
    dialogType === "form" && submitButton ? undefined : handleOk;

  return (
    <dialog
      ref={dialogRef}
      className="jenkins-dialog"
      style={{ maxWidth: maxWidth, minWidth: minWidth }}
      onClick={
        dialogType === "modal" ? () => handleCancel() : undefined
      }
      onKeyDown={handleKeyDown}
      onCancel={handleNativeCancel}
    >
      {/* Title — source lines 42-46 */}
      {options.title != null && (
        <div className="jenkins-dialog__title">{options.title}</div>
      )}

      {/* Modal content — source lines 48-74 */}
      {dialogType === "modal" && (
        <div
          className="jenkins-dialog__contents jenkins-dialog__contents--modal"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {/* Content rendering */}
          {options.content != null &&
            (options.content instanceof HTMLElement ? (
              <div ref={modalHtmlContentRef} />
            ) : (
              options.content
            ))}

          {/* Close button inside contents — source lines 56-67 */}
          {!hideCloseButton && (
            <button
              className="jenkins-dialog__close-button jenkins-button"
              onClick={() => handleCancel()}
              type="button"
            >
              <span className="jenkins-visually-hidden">Close</span>
              <span dangerouslySetInnerHTML={{ __html: CLOSE }} />
            </button>
          )}
        </div>
      )}

      {/* Form content — source lines 77-85 */}
      {dialogType === "form" && options.form != null && (
        <div className="jenkins-dialog__contents" ref={formContainerRef} />
      )}

      {/* Alert/Confirm content — source lines 86-100 */}
      {dialogType !== "modal" &&
        dialogType !== "form" &&
        dialogType !== "prompt" && (
          <>
            {options.content != null && (
              <div
                className="jenkins-dialog__contents"
                ref={
                  options.content instanceof HTMLElement
                    ? htmlContentRef
                    : undefined
                }
              >
                {!(options.content instanceof HTMLElement)
                  ? options.content
                  : null}
              </div>
            )}
            {options.message != null && (
              <div className="jenkins-dialog__contents">
                {options.message}
              </div>
            )}
          </>
        )}

      {/* Prompt input — source lines 102-118 */}
      {dialogType === "prompt" && (
        <div className="jenkins-dialog__input">
          {options.message != null && <div>{options.message}</div>}
          <input
            ref={inputRef}
            data-id="input"
            type="text"
            className="jenkins-input"
            value={inputValue}
            onChange={handleInputChange}
          />
        </div>
      )}

      {/* Button row — source lines 145-182 (for non-modal types) */}
      {dialogType !== "modal" && (
        <div className="jenkins-buttons-row jenkins-buttons-row--equal-width jenkins-dialog__buttons">
          <button
            data-id="ok"
            type={submitButton ? "submit" : "button"}
            form={okFormAttr}
            className={`jenkins-button jenkins-button--primary ${TYPE_CLASS_MAP[styleType]}`}
            disabled={okDisabled}
            onClick={okClickHandler}
          >
            {okButtonText}
          </button>
          <button
            data-id="cancel"
            type="button"
            className="jenkins-button"
            style={cancel ? undefined : { display: "none" }}
            onClick={handleNativeCancel}
          >
            {cancelButtonText}
          </button>
        </div>
      )}
    </dialog>
  );
};

// ---------------------------------------------------------------------------
// Imperative Dialog API
// ---------------------------------------------------------------------------

/**
 * Creates and shows a dialog imperatively outside any existing React tree.
 * Used by the window.dialog compatibility layer and for standalone usage.
 *
 * Returns a Promise that resolves with:
 * - true (confirm/alert)
 * - input string value (prompt)
 * - FormData (form without submitButton)
 *
 * Rejects when the user cancels.
 */
export function showDialog(
  dialogType: DialogType,
  options: DialogOptions,
): Promise<boolean | string | FormData> {
  return new Promise<boolean | string | FormData>((resolve, reject) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let settled = false;

    const cleanup = () => {
      // Delay unmount to allow closing animation to complete
      setTimeout(() => {
        root.unmount();
        if (container.parentNode) {
          container.remove();
        }
      }, 300);
    };

    root.render(
      <Dialog
        dialogType={dialogType}
        options={options}
        open={true}
        onResolve={(value: boolean | string | FormData) => {
          if (!settled) {
            settled = true;
            resolve(value);
          }
          cleanup();
        }}
        onCancel={() => {
          if (!settled) {
            settled = true;
            reject();
          }
          cleanup();
        }}
      />,
    );
  });
}

// ---------------------------------------------------------------------------
// Global Dialog Interface — window.dialog compatibility
// ---------------------------------------------------------------------------

/**
 * Sets up the window.dialog global interface for plugin backward compatibility.
 * Mirrors source init() function (lines 271-353).
 *
 * CRITICAL: The window.dialog.* interface is NON-NEGOTIABLE — plugins depend on it.
 *
 * Methods:
 * - modal(content, options) — shows modal, suppresses rejections
 * - alert(title, options) — shows alert with no cancel, suppresses rejections
 * - confirm(title, options) — shows confirm, returns Promise
 * - prompt(title, options) — shows prompt, returns Promise
 * - form(form, options) — shows form dialog, returns Promise
 */
export function initDialogGlobals(): void {
  const dialogInterface: Record<string, unknown> = {
    translations: {} as Record<string, string>,

    /**
     * Show a modal dialog with custom content.
     * Suppresses rejections (source lines 280-287).
     */
    modal(
      content: HTMLElement | React.ReactNode,
      modalOptions?: DialogOptions,
    ) {
      const merged: DialogOptions = { content, ...modalOptions };
      showDialog("modal", merged).catch(() => {
        // Suppress rejection — modal dismissals are not errors (source line 287)
      });
    },

    /**
     * Show an alert dialog with no cancel button.
     * Suppresses rejections (source lines 289-296).
     */
    alert(title: string, alertOptions?: DialogOptions) {
      const merged: DialogOptions = {
        title,
        cancel: false,
        ...alertOptions,
      };
      showDialog("alert", merged).catch(() => {
        // Suppress rejection — alert dismissals are not errors (source line 296)
      });
    },

    /**
     * Show a confirmation dialog. Returns Promise resolving to true on OK.
     * Uses translations.yes as default OK text (source line 301).
     */
    confirm(
      title: string,
      confirmOptions?: DialogOptions,
    ): Promise<boolean | string | FormData> {
      const merged: DialogOptions = { title, ...confirmOptions };
      return showDialog("confirm", merged);
    },

    /**
     * Show a prompt dialog. Returns Promise resolving to the input string value.
     * Source lines 307-314.
     */
    prompt(
      title: string,
      promptOptions?: DialogOptions,
    ): Promise<boolean | string | FormData> {
      const merged: DialogOptions = { title, ...promptOptions };
      return showDialog("prompt", merged);
    },

    /**
     * Show a form dialog. Returns Promise resolving to FormData.
     * Defaults: minWidth 600px, maxWidth 900px, submitButton true (source lines 317-328).
     */
    form(
      form: HTMLFormElement,
      formOptions?: DialogOptions,
    ): Promise<boolean | string | FormData> {
      const merged: DialogOptions = {
        form,
        minWidth: "600px",
        maxWidth: "900px",
        submitButton: true,
        ...formOptions,
      };
      return showDialog("form", merged);
    },
  };

  (window as unknown as Record<string, unknown>).dialog = dialogInterface;

  // Load translations for backward compatibility (mirrors source lines 23-27)
  const rootUrl = document.head?.dataset?.rooturl || "";
  fetch(`${rootUrl}/i18n/resourceBundle?baseName=jenkins.dialogs`)
    .then((res) => res.json())
    .then((data: { data?: Record<string, string> }) => {
      dialogInterface.translations = data.data || {};
    })
    .catch(() => {
      // Translations remain empty on failure — dialogs use inline defaults
    });
}

// ---------------------------------------------------------------------------
// On-Demand Dialog Rendering
// ---------------------------------------------------------------------------

/**
 * Renders a deferred template-based dialog by ID.
 * Mirrors source renderOnDemandDialog function (lines 243-269).
 *
 * Looks for a <template> element with id="dialog-{dialogId}-template",
 * clones its content, and shows it as a modal dialog.
 */
export function renderOnDemandDialog(dialogId: string): void {
  const templateId = "dialog-" + dialogId + "-template";

  function render(): void {
    const template = document.querySelector<HTMLTemplateElement>(
      "#" + templateId,
    );
    if (!template) {
      return;
    }

    const title = template.dataset.title;
    const hash = template.dataset.dialogHash;
    const content = template.content.firstElementChild?.cloneNode(
      true,
    ) as HTMLElement | null;

    // Set hash for deep-linking (source line 253)
    if (hash) {
      window.location.hash = hash;
    }

    // Use the global dialog.modal method (source line 262)
    const dialogGlobal = (window as unknown as Record<string, unknown>)
      .dialog as
      | Record<string, (...args: unknown[]) => void>
      | undefined;
    if (dialogGlobal && typeof dialogGlobal.modal === "function") {
      dialogGlobal.modal(content, { maxWidth: "550px", title });
    }
  }

  // If template exists, render immediately
  if (document.querySelector("#" + templateId)) {
    render();
    return;
  }

  // Fallback: defer to renderOnDemand if template not yet loaded (source lines 265-268)
  const placeholder = document.querySelector("." + templateId);
  if (placeholder) {
    const onDemandFn = (window as unknown as Record<string, unknown>)
      .renderOnDemand as
      | ((el: Element, callback: () => void) => void)
      | undefined;
    if (typeof onDemandFn === "function") {
      onDemandFn(placeholder, render);
    }
  }
}

// ---------------------------------------------------------------------------
// Dialog Opener Registration
// ---------------------------------------------------------------------------

/**
 * Registers click handlers for [data-type="dialog-opener"] elements and
 * auto-opens hash-referenced dialogs on page load.
 *
 * Replaces behaviorShim.specify('[data-type="dialog-opener"]', '-dialog-', 1000, ...)
 * from source lines 331-353.
 */
export function initDialogOpeners(): void {
  // Register click handlers on dialog opener elements (source lines 331-340)
  document
    .querySelectorAll<HTMLElement>("[data-type='dialog-opener']")
    .forEach((element) => {
      element.addEventListener("click", () => {
        const dialogId = element.dataset.dialogId;
        if (dialogId) {
          renderOnDemandDialog(dialogId);
        }
      });
    });

  // Auto-open hash-referenced dialog on page load (source lines 342-352)
  if (window.location.hash) {
    const hash = window.location.hash.substring(1);
    const element = document.querySelector(".dialog-" + hash + "-hash");
    if (element) {
      const match = element.className.match(/dialog-(id\d+)-template/);
      if (match) {
        renderOnDemandDialog(match[1]);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Default Export
// ---------------------------------------------------------------------------

export default Dialog;
