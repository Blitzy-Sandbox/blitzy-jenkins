/**
 * FirstUserPanel — First Admin User Creation Form
 *
 * Replaces `src/main/js/templates/firstUserPanel.hbs` (17 lines) and the
 * first-user logic from `pluginSetupWizardGui.js` (lines 457–461, 467–486,
 * 1007–1048).
 *
 * Renders a server-managed iframe (`/setupWizard/setupWizardFirstUser`) with
 * localized footer buttons (skip/save). Uses `useSaveFirstUser()` mutation for
 * form submission and implements the **CRITICAL** CSRF crumb refresh pattern
 * from `securityConfig.js` lines 16–19 via `useCrumb().updateCrumb()`.
 *
 * ## Key Migration Notes
 *
 * - jQuery `$("iframe[src]").on("load", ...)` → React `onLoad` handler
 * - jQuery `$("button").prop({ disabled: true/false })` → React `useState` boolean
 * - jQuery `$.contents().find("form:not(.no-json)")` → `iframeRef.contentDocument.querySelector()`
 * - `securityConfig.saveFirstUser($form, success, error)` → `useSaveFirstUser().mutate()`
 * - `getWindow().crumb.init(field, value)` → `useCrumb().updateCrumb(field, value)`
 * - Handlebars `{{translations.key}}` → React `translations['key']`
 *
 * @module pages/setup-wizard/FirstUserPanel
 */

import React, { useState, useRef, useCallback } from "react";
import { useSaveFirstUser } from "@/api/security";
import { useCrumb } from "@/hooks/useCrumb";
import type { StaplerResponse, CrumbRefreshResponse } from "@/api/types";

// =============================================================================
// Props Interface
// =============================================================================

/**
 * Props for the {@link FirstUserPanel} component.
 *
 * Mirrors the Handlebars template context from `firstUserPanel.hbs` plus
 * callback props replacing the imperative wizard orchestration in
 * `pluginSetupWizardGui.js`.
 */
export interface FirstUserPanelProps {
  /**
   * Localized translation strings keyed by translation ID.
   *
   * Required keys:
   * - `installWizard_addFirstUser_title` — modal header title
   * - `installWizard_skipFirstUser` — skip button label
   * - `installWizard_saveFirstUser` — save button label
   */
  translations: Record<string, string>;

  /**
   * Jenkins base URL (e.g., `""` for root or `"/jenkins"` for a context path).
   * Used to construct the iframe `src` attribute for the first user form.
   */
  baseUrl: string;

  /**
   * Callback invoked when the first admin user is successfully created
   * (Stapler response `status === "ok"`).
   *
   * Replaces `pluginSetupWizardGui.js` line 1009: `showStatePanel()`.
   */
  onSaveSuccess: () => void;

  /**
   * Callback invoked when the user clicks the "Skip" button.
   *
   * Replaces `pluginSetupWizardGui.js` lines 1050–1073: `skipFirstUser()`.
   * The parent wizard orchestrator handles the skip flow (checking `/api/json?tree=url`
   * and routing to configure-instance or completion).
   */
  onSkip: () => void;

  /**
   * Callback invoked when an error occurs during save or when the server
   * returns a non-ok status.
   *
   * Replaces `pluginSetupWizardGui.js` lines 1010–1013: `setPanel(errorPanel, { errorMessage })`.
   *
   * @param errorMessage - Human-readable error description
   */
  onError: (errorMessage: string) => void;
}

// =============================================================================
// Helper: Display Validation Errors in Iframe
// =============================================================================

/**
 * Displays server-side validation errors inside the iframe form.
 *
 * Replicates `pluginSetupWizardGui.js` lines 467–486 (`displayErrors()`):
 * - Finds input fields by `name` attribute in the iframe document
 * - Adds `.has-error` class to the parent `<tr>` element
 * - Sets error message text in the `.error-panel` element within the row
 *
 * @param iframeDoc - The iframe's `contentDocument`
 * @param errors - Map of field names to error messages
 */
function displayErrors(
  iframeDoc: Document,
  errors: Record<string, string>,
): void {
  const errorKeys = Object.keys(errors);
  if (errorKeys.length === 0) {
    return;
  }

  for (const name of errorKeys) {
    const message = errors[name];
    const inputField = iframeDoc.querySelector(`[name="${name}"]`);
    if (!inputField) {
      continue;
    }

    // Walk up to the enclosing <tr> element (mirrors jQuery `.parentsUntil("tr").parent()`)
    let tr: Element | null = inputField.parentElement;
    while (tr && tr.tagName !== "TR") {
      tr = tr.parentElement;
    }

    if (tr) {
      tr.classList.add("has-error");
      const errorPanel = tr.querySelector(".error-panel");
      if (errorPanel) {
        errorPanel.textContent = message;
      }
    }
  }
}

// =============================================================================
// Helper: Extract Main Panel from Error Response HTML
// =============================================================================

/**
 * Extracts the `#main-panel` content from an error response HTML string and
 * injects it into the body, mirroring `pluginSetupWizardGui.js` lines 1017–1033.
 *
 * When the server returns an HTML error page (e.g., validation failures rendered
 * as a full page), this function extracts just the `#main-panel` div and replaces
 * the body content with it. This prevents the full Jenkins page chrome from
 * rendering inside the iframe.
 *
 * @param responseText - The raw HTML response string
 * @returns The processed HTML string with body replaced by `#main-panel` content
 */
function extractMainPanelHtml(responseText: string): string {
  // Parse the response HTML to find #main-panel
  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(responseText, "text/html");
  const mainPanel = parsedDoc.getElementById("main-panel");

  if (mainPanel) {
    // Replace body content with #main-panel innerHTML
    // Mirrors source regex: /body([^>]*)[>](.|[\r\n])+[<][/]body/
    return responseText.replace(
      /body([^>]*)[>]([\s\S]+)[<][/]body/,
      `body$1>${mainPanel.innerHTML}</body`,
    );
  }

  return responseText;
}

// =============================================================================
// Component Implementation
// =============================================================================

/**
 * First Admin User Creation Panel for the Jenkins Setup Wizard.
 *
 * Renders:
 * 1. A modal header with localized title
 * 2. A server-rendered iframe containing the user creation form
 * 3. Footer buttons: "Skip" and "Save" (disabled until iframe loads)
 *
 * On save:
 * - Extracts form data from iframe's `contentDocument`
 * - Posts to `/setupWizard/createAdminUser` via `useSaveFirstUser()` mutation
 * - **CRITICAL**: Refreshes CSRF crumb from response via `useCrumb().updateCrumb()`
 * - Routes to success or error state based on response `status`
 *
 * On skip:
 * - Disables buttons and delegates to parent via `onSkip()` callback
 *
 * @param props - {@link FirstUserPanelProps}
 * @returns JSX element matching the DOM structure from `firstUserPanel.hbs`
 */
export default function FirstUserPanel({
  translations,
  baseUrl,
  onSaveSuccess,
  onSkip,
  onError,
}: FirstUserPanelProps): React.JSX.Element {
  // ---------------------------------------------------------------------------
  // State: button enabled/disabled tracking
  //
  // Buttons start disabled (matching source firstUserPanel.hbs: `disabled`
  // attribute on both buttons) and are enabled after the iframe finishes
  // loading (matching source pluginSetupWizardGui.js lines 457–461:
  // `enableButtonsAfterFrameLoad()`).
  // ---------------------------------------------------------------------------
  const [buttonsEnabled, setButtonsEnabled] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // Ref: iframe element reference
  //
  // Used to access `contentDocument` for:
  // - Form data extraction (source lines 1040–1042)
  // - Error display via displayErrors (source lines 467–486)
  // - Error response HTML injection (source lines 1030–1033)
  // ---------------------------------------------------------------------------
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ---------------------------------------------------------------------------
  // Hooks: mutation and crumb management
  // ---------------------------------------------------------------------------

  // useSaveFirstUser: React Query mutation for POST /setupWizard/createAdminUser
  // members_accessed: mutate() for triggering the mutation, isPending for button state
  const { mutate, isPending } = useSaveFirstUser();

  // useCrumb: CSRF crumb management hook
  // members_accessed: updateCrumb() for CRITICAL crumb refresh after save
  const { updateCrumb } = useCrumb();

  // ---------------------------------------------------------------------------
  // Handler: iframe load — enable buttons
  //
  // Replaces source `pluginSetupWizardGui.js` lines 457–461:
  //   $("iframe[src]").on("load", function () {
  //     $("button").prop({ disabled: false });
  //   });
  // ---------------------------------------------------------------------------
  const handleIframeLoad = useCallback((): void => {
    setButtonsEnabled(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Handler: save first user
  //
  // Replaces source `pluginSetupWizardGui.js` lines 1038–1048 (`saveFirstUser()`):
  // 1. Disable buttons (source line 1039)
  // 2. Get form from iframe (source lines 1040–1042)
  // 3. Call securityConfig.saveFirstUser (source lines 1043–1047)
  //
  // And the success/error handlers:
  // - handleFirstUserResponseSuccess (source lines 1007–1015)
  // - handleFirstUserResponseError (source lines 1017–1035)
  //
  // CRITICAL: CSRF crumb refresh from securityConfig.js lines 16–19:
  //   var crumbRequestField = response.data.crumbRequestField;
  //   if (crumbRequestField) {
  //     getWindow().crumb.init(crumbRequestField, response.data.crumb);
  //   }
  // ---------------------------------------------------------------------------
  const handleSave = useCallback((): void => {
    // Step 1: Disable buttons (source line 1039: $("button").prop({ disabled: true }))
    setButtonsEnabled(false);

    // Step 2: Access iframe content document
    const iframe = iframeRef.current;
    if (!iframe) {
      onError("Unable to access first user form: iframe reference unavailable");
      setButtonsEnabled(true);
      return;
    }

    let iframeDoc: Document | null = null;
    try {
      iframeDoc = iframe.contentDocument;
    } catch {
      // Same-origin policy violation — iframe content not accessible
      onError("Unable to access first user form: cross-origin restriction");
      setButtonsEnabled(true);
      return;
    }

    if (!iframeDoc) {
      onError("Unable to access first user form: no content document");
      setButtonsEnabled(true);
      return;
    }

    // Step 3: Find the form element (source lines 1040–1042:
    //   $("iframe#setup-first-user").contents().find("form:not(.no-json)"))
    const form = iframeDoc.querySelector(
      "form:not(.no-json)",
    ) as HTMLFormElement | null;

    if (!form) {
      onError("Unable to access first user form: form element not found");
      setButtonsEnabled(true);
      return;
    }

    // Step 4: Serialize form data into SaveFirstUserPayload
    // The iframe form contains fields: username, password1, password2, fullname, email
    const formData = new FormData(form);
    const payload = {
      username: (formData.get("username") as string) ?? "",
      password1: (formData.get("password1") as string) ?? "",
      password2: (formData.get("password2") as string) ?? "",
      fullname: (formData.get("fullname") as string) ?? "",
      email: (formData.get("email") as string) ?? "",
    };

    // Step 5: Execute mutation
    mutate(payload, {
      onSuccess: (response: StaplerResponse<CrumbRefreshResponse>): void => {
        // CRITICAL CRUMB REFRESH — mirrors securityConfig.js lines 16–19:
        //   var crumbRequestField = response.data.crumbRequestField;
        //   if (crumbRequestField) {
        //     getWindow().crumb.init(crumbRequestField, response.data.crumb);
        //   }
        //
        // The mutation's onSuccess in security.ts already calls window.crumb.init()
        // via refreshCrumb(). Here we ALSO update the React-side crumb state via
        // useCrumb's updateCrumb() to keep React state in sync.
        if (response.data?.crumbRequestField) {
          updateCrumb(
            response.data.crumbRequestField,
            response.data.crumb ?? "",
          );
        }

        // Handle response status — mirrors pluginSetupWizardGui.js lines 1007–1015:
        //   if (data.status === "ok") { showStatePanel(); }
        //   else { setPanel(errorPanel, { errorMessage: ... }); }
        if (response.status === "ok") {
          onSaveSuccess();
        } else {
          // Display validation errors in iframe if present
          if (
            response.data &&
            typeof response.data === "object" &&
            iframeRef.current?.contentDocument
          ) {
            const errorData = response.data as Record<string, unknown>;
            const errors: Record<string, string> = {};
            for (const [key, value] of Object.entries(errorData)) {
              if (
                key !== "crumbRequestField" &&
                key !== "crumb" &&
                typeof value === "string"
              ) {
                errors[key] = value;
              }
            }
            if (Object.keys(errors).length > 0) {
              displayErrors(iframeRef.current.contentDocument, errors);
            }
          }

          onError(
            "Error trying to create first user: " +
              (response.message ?? response.status ?? "unknown error"),
          );
          setButtonsEnabled(true);
        }
      },

      onError: (error: Error): void => {
        // Mirrors pluginSetupWizardGui.js lines 1017–1035 (handleFirstUserResponseError):
        // On HTTP error, attempt to write the error response HTML back into the iframe.
        //
        // Source pattern:
        //   var responseText = res.responseText;
        //   var $page = $(responseText); var $main = $page.find("#main-panel").detach();
        //   ...
        //   doc.open(); doc.write(responseText); doc.close();
        //   $("button").prop({ disabled: false });
        const doc = iframeRef.current?.contentDocument;
        if (doc && error.message) {
          try {
            // If the error message contains HTML (server error page), extract
            // #main-panel and write it into the iframe
            const processedHtml = extractMainPanelHtml(error.message);
            doc.open();
            doc.write(processedHtml);
            doc.close();
          } catch {
            // If iframe document write fails, fall back to onError callback
            onError(error.message);
          }
        } else {
          onError(error.message ?? "An unexpected error occurred");
        }

        // Re-enable buttons after error (source line 1034)
        setButtonsEnabled(true);
      },
    });
  }, [mutate, updateCrumb, onSaveSuccess, onError]);

  // ---------------------------------------------------------------------------
  // Handler: skip first user
  //
  // Replaces source `pluginSetupWizardGui.js` lines 1050–1073 (`skipFirstUser()`):
  //   $("button").prop({ disabled: true });
  //   firstUserSkipped = true;
  //   ...
  //
  // The parent wizard orchestrator handles the skip flow (checking
  // `/api/json?tree=url` and routing to configure-instance or completion).
  // ---------------------------------------------------------------------------
  const handleSkip = useCallback((): void => {
    // Disable buttons (source line 1052: $("button").prop({ disabled: true }))
    setButtonsEnabled(false);
    // Delegate skip flow to parent wizard (source lines 1053–1072)
    onSkip();
  }, [onSkip]);

  // ---------------------------------------------------------------------------
  // Render: exact DOM structure from firstUserPanel.hbs
  //
  // Preserves all CSS classes and element structure for visual parity:
  // - .modal-header > h4.modal-title
  // - .modal-body.setup-wizard-heading > .jumbotron.welcome-panel.security-panel > iframe
  // - .modal-footer > button.btn.btn-link.skip-first-user + button.btn.btn-primary.save-first-user
  // ---------------------------------------------------------------------------
  return (
    <>
      <div className="modal-header">
        <h4 className="modal-title">
          {translations.installWizard_addFirstUser_title}
        </h4>
      </div>
      <div className="modal-body setup-wizard-heading">
        <div className="jumbotron welcome-panel security-panel">
          <iframe
            ref={iframeRef}
            src={`${baseUrl}/setupWizard/setupWizardFirstUser`}
            id="setup-first-user"
            title={
              translations.installWizard_addFirstUser_title ||
              "Create First Admin User"
            }
            onLoad={handleIframeLoad}
          />
        </div>
      </div>
      <div className="modal-footer">
        <button
          type="button"
          className="btn btn-link skip-first-user"
          disabled={!buttonsEnabled || isPending}
          onClick={handleSkip}
        >
          {translations.installWizard_skipFirstUser}
        </button>
        <button
          type="button"
          className="btn btn-primary save-first-user"
          disabled={!buttonsEnabled || isPending}
          onClick={handleSave}
        >
          {translations.installWizard_saveFirstUser}
        </button>
      </div>
    </>
  );
}
