/**
 * ConfigureInstancePanel — Instance URL Configuration Form
 *
 * Replaces: src/main/js/templates/configureInstance.hbs (19 lines)
 *
 * Renders a server-managed iframe loaded from /setupWizard/setupWizardConfigureInstance
 * with localized footer buttons (skip/save). On save, extracts the rootUrl from the
 * iframe form and posts via useSaveConfigureInstance() mutation. After a successful
 * save, performs the CRITICAL CSRF crumb refresh to maintain CSRF protection continuity
 * across subsequent setup wizard steps.
 *
 * Key behaviors preserved from the original Handlebars + jQuery implementation:
 * - Buttons start disabled, enabled after iframe loads (enableButtonsAfterFrameLoad)
 * - Save extracts form from iframe via contentDocument (saveConfigureInstance)
 * - CSRF crumb refresh after save success (securityConfig.js lines 33-35)
 * - Validation errors displayed in iframe form fields (displayErrors)
 * - HTTP errors written as HTML into iframe body (handleConfigureInstanceResponseError)
 * - Optional HTML message rendered via dangerouslySetInnerHTML (triple-mustache pattern)
 */
import { useState, useRef, useCallback } from "react";
import { useSaveConfigureInstance } from "@/api/security";
import { useCrumb } from "@/hooks/useCrumb";
import type { StaplerResponse, CrumbRefreshResponse } from "@/api/types";

/**
 * Props interface for the ConfigureInstancePanel component.
 * Exported as a named export for use by the parent SetupWizard orchestrator.
 */
export interface ConfigureInstancePanelProps {
  /** Localized translation strings keyed by translation key identifier */
  translations: Record<string, string>;
  /** Jenkins base URL used to construct the iframe src attribute */
  baseUrl: string;
  /** Optional HTML message content rendered via dangerouslySetInnerHTML (triple-mustache) */
  message?: string;
  /** Callback invoked after successful instance URL configuration save */
  onSaveSuccess: () => void;
  /** Callback invoked when the user elects to skip instance configuration */
  onSkip: () => void;
  /** Callback invoked when a save error occurs, receiving the error description */
  onError: (errorMessage: string) => void;
}

/**
 * ConfigureInstancePanel renders the instance URL configuration step of the
 * Jenkins setup wizard. It loads the server-rendered form in an iframe and
 * provides skip and save buttons in the modal footer.
 *
 * This component is the React equivalent of configureInstance.hbs and the
 * related logic in pluginSetupWizardGui.js (showConfigureInstance,
 * saveConfigureInstance, handleConfigureInstanceResponseSuccess,
 * handleConfigureInstanceResponseError, skipConfigureInstance).
 */
const ConfigureInstancePanel: React.FC<ConfigureInstancePanelProps> = ({
  translations,
  baseUrl,
  message,
  onSaveSuccess,
  onSkip,
  onError,
}) => {
  /**
   * Tracks whether the skip and save buttons are enabled.
   * Buttons start disabled and are enabled after the iframe finishes loading.
   * Source: configureInstance.hbs lines 12, 15 — both buttons have `disabled` attribute
   * Source: pluginSetupWizardGui.js enableButtonsAfterFrameLoad (lines 457-461)
   */
  const [buttonsEnabled, setButtonsEnabled] = useState<boolean>(false);

  /** Ref to the iframe element for accessing contentDocument form data */
  const iframeRef = useRef<HTMLIFrameElement>(null);

  /**
   * React Query mutation hook for POST /setupWizard/configureInstance.
   * Internally handles CSRF crumb refresh via window.crumb.init() on success.
   * Returns StaplerResponse<CrumbRefreshResponse> on HTTP success.
   */
  const { mutate: saveInstance, isPending } = useSaveConfigureInstance();

  /**
   * CSRF crumb management hook — provides updateCrumb() to synchronize
   * React-side crumb state after the mutation's internal window.crumb.init()
   * call. This dual-update ensures both the global window.crumb and the
   * React context stay in sync across wizard steps.
   */
  const { updateCrumb } = useCrumb();

  /**
   * Enables the skip and save buttons after the iframe finishes loading
   * its content. This mirrors the jQuery-based enableButtonsAfterFrameLoad()
   * pattern from pluginSetupWizardGui.js lines 457-461:
   *   $("iframe[src]").on("load", function() {
   *     $("button").prop({ disabled: false });
   *   });
   */
  const handleIframeLoad = useCallback((): void => {
    setButtonsEnabled(true);
  }, []);

  /**
   * Displays validation errors within the iframe form fields.
   * Iterates the errors map, finds each input by name in the iframe document,
   * adds the .has-error CSS class to its parent <tr>, and sets the error
   * message text in the corresponding .error-panel element.
   *
   * Source: pluginSetupWizardGui.js displayErrors (lines 468-486):
   *   Object.keys(errors).forEach(function(name) {
   *     var $input = $(iframe).find('[name="' + name + '"]');
   *     $input.closest('tr').addClass('has-error');
   *     $input.closest('tr').find('.error-panel').text(errors[name]);
   *   });
   */
  const displayErrors = useCallback((errors: Record<string, string>): void => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) {
      return;
    }

    // Clear any previously displayed error states
    const existingErrors = iframeDoc.querySelectorAll(".has-error");
    existingErrors.forEach((el: Element) => {
      el.classList.remove("has-error");
    });

    // Apply error styling and messages for each validation error
    Object.entries(errors).forEach(([fieldName, errorMessage]) => {
      const input = iframeDoc.querySelector<HTMLElement>(
        `[name="${fieldName}"]`,
      );
      if (input) {
        // Add error styling to the parent <tr> row container
        const parentRow = input.closest("tr");
        if (parentRow) {
          parentRow.classList.add("has-error");

          // Populate the error message in the .error-panel element
          const errorPanel = parentRow.querySelector(".error-panel");
          if (errorPanel) {
            errorPanel.textContent = errorMessage;
          }
        }
      }
    });
  }, []);

  /**
   * Handles HTTP error responses by writing error content into the iframe.
   * Attempts to extract the #main-panel content from the error response
   * and replaces the iframe body content. If that fails, writes a clean
   * error message into the iframe.
   *
   * Source: pluginSetupWizardGui.js handleConfigureInstanceResponseError (lines 1092-1110):
   *   var $crumb = $(res.responseText).find('#main-panel');
   *   if ($crumb.length) {
   *     iframeDoc.write($crumb.html());
   *   } else {
   *     iframeDoc.write(res.responseText);
   *   }
   *   enableButtonsImmediately();
   */
  const handleResponseError = useCallback(
    (error: Error): void => {
      const iframe = iframeRef.current;
      if (!iframe) {
        onError(error.message || "An error occurred");
        return;
      }

      const iframeDoc = iframe.contentDocument;
      if (iframeDoc) {
        try {
          // Write the error content into the iframe for inline display
          const errorContent = error.message || "An unexpected error occurred.";

          // Attempt to parse and extract #main-panel from HTML error response
          const parser = new DOMParser();
          const parsedDoc = parser.parseFromString(errorContent, "text/html");
          const mainPanel = parsedDoc.querySelector("#main-panel");

          iframeDoc.open();
          if (mainPanel) {
            iframeDoc.write(mainPanel.innerHTML);
          } else {
            iframeDoc.write(errorContent);
          }
          iframeDoc.close();
        } catch {
          // If writing to iframe fails, propagate error to parent component
          onError(error.message || "An error occurred");
        }
      } else {
        onError(error.message || "An error occurred");
      }

      // Re-enable buttons so the user can retry or navigate away
      setButtonsEnabled(true);
    },
    [onError],
  );

  /**
   * Save handler for the instance URL configuration form.
   * Extracts the rootUrl from the iframe form, triggers the save mutation,
   * and handles success/error responses including the CRITICAL CSRF crumb refresh.
   *
   * Flow mirrors pluginSetupWizardGui.js saveConfigureInstance (lines 1112-1122):
   *   1. Disable buttons
   *   2. Get form from iframe: iframe.contents().find("form:not(.no-json)")
   *   3. Post via securityConfig.saveConfigureInstance($form, success, error)
   *
   * And securityConfig.js saveConfigureInstance (lines 28-43):
   *   1. Post to /setupWizard/configureInstance
   *   2. On success: refresh CSRF crumb if response.data.crumbRequestField is truthy
   *   3. Call success callback with response
   *
   * And pluginSetupWizardGui.js handleConfigureInstanceResponseSuccess (lines 1075-1090):
   *   1. If data.status === 'ok': advance to next step
   *   2. Otherwise: extract validation errors from data.data and display in iframe
   */
  const handleSave = useCallback((): void => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    // Disable buttons while the save operation is in progress
    // Source: pluginSetupWizardGui.js line 1113 — $('button').prop({disabled: true})
    setButtonsEnabled(false);

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) {
      setButtonsEnabled(true);
      onError("Unable to access iframe content");
      return;
    }

    // Locate the configuration form in the iframe, excluding .no-json forms
    // Source: pluginSetupWizardGui.js line 1115 —
    //   iframe.contents().find("form:not(.no-json)")
    const form = iframeDoc.querySelector<HTMLFormElement>("form:not(.no-json)");
    if (!form) {
      setButtonsEnabled(true);
      onError("Unable to find configuration form");
      return;
    }

    // Extract the rootUrl value from the form input
    const rootUrlInput =
      form.querySelector<HTMLInputElement>('[name="rootUrl"]');
    const rootUrl = rootUrlInput?.value ?? "";

    // Execute the save mutation with extracted form data
    saveInstance(
      { rootUrl },
      {
        onSuccess: (response: StaplerResponse<CrumbRefreshResponse>) => {
          // CRITICAL: CSRF crumb refresh after successful save.
          // The mutation's internal onSuccess already calls window.crumb.init()
          // via security.ts refreshCrumb(). We additionally call useCrumb().updateCrumb()
          // to synchronize React-side crumb state for subsequent wizard steps.
          //
          // Mirrors securityConfig.js lines 33-35:
          //   var crumbRequestField = response.data.crumbRequestField;
          //   if (crumbRequestField) {
          //     getWindow().crumb.init(crumbRequestField, response.data.crumb);
          //   }
          if (response.data?.crumbRequestField) {
            updateCrumb(
              response.data.crumbRequestField,
              response.data.crumb ?? "",
            );
          }

          // Route based on response status
          // Source: pluginSetupWizardGui.js handleConfigureInstanceResponseSuccess (lines 1076-1089)
          if (response.status === "ok") {
            // Success — advance to the next wizard step
            onSaveSuccess();
          } else {
            // Validation errors — the response data contains error map when status !== 'ok'
            // Source: pluginSetupWizardGui.js lines 1084-1088:
            //   var errors = data.data;
            //   setPanel(configureInstancePanel, ...);
            //   displayErrors(iframe, errors);
            const errors = response.data as unknown as Record<string, string>;
            displayErrors(errors);
            setButtonsEnabled(true);
          }
        },
        onError: (error: Error) => {
          // HTTP error — write error content into iframe body
          // Source: pluginSetupWizardGui.js handleConfigureInstanceResponseError (lines 1092-1110)
          handleResponseError(error);
        },
      },
    );
  }, [
    saveInstance,
    updateCrumb,
    onSaveSuccess,
    onError,
    displayErrors,
    handleResponseError,
  ]);

  /**
   * Skip handler for the instance configuration step.
   * Disables buttons and delegates skip logic to the parent component.
   *
   * Source: pluginSetupWizardGui.js skipConfigureInstance (lines 1129-1139):
   *   $('button').prop({disabled: true});
   *   ... builds skip message, shows setupCompletePanel
   */
  const handleSkip = useCallback((): void => {
    setButtonsEnabled(false);
    onSkip();
  }, [onSkip]);

  // Combined disabled state: not yet loaded, or mutation in progress
  const buttonsDisabled = !buttonsEnabled || isPending;

  return (
    <>
      {/* Modal header — reuses installWizard_addFirstUser_title as per source template */}
      <div className="modal-header">
        <h4 className="modal-title">
          {translations.installWizard_addFirstUser_title}
        </h4>
      </div>

      {/* Modal body — jumbotron with optional message and server-managed iframe */}
      <div className="modal-body">
        <div className="jumbotron welcome-panel security-panel">
          {/* Optional HTML message content — triple-mustache {{{message}}} replacement */}
          {/* Source: configureInstance.hbs line 6 — {{{message}}} (unescaped HTML) */}
          {message && <div dangerouslySetInnerHTML={{ __html: message }} />}

          {/* Server-managed iframe for instance URL configuration form */}
          {/* Source: configureInstance.hbs line 8 */}
          <iframe
            ref={iframeRef}
            src={`${baseUrl}/setupWizard/setupWizardConfigureInstance`}
            id="setup-configure-instance"
            title={
              translations.installWizard_addFirstUser_title ||
              "Configure Instance"
            }
            onLoad={handleIframeLoad}
          />
        </div>
      </div>

      {/* Modal footer — skip and save buttons */}
      <div className="modal-footer">
        {/* Skip button — btn-link style, disabled until iframe loads */}
        {/* Source: configureInstance.hbs lines 11-13 */}
        <button
          type="button"
          className="btn btn-link skip-configure-instance"
          disabled={buttonsDisabled}
          onClick={handleSkip}
        >
          {translations.installWizard_skipConfigureInstance}
        </button>

        {/* Save button — btn-primary style, disabled until iframe loads */}
        {/* Source: configureInstance.hbs lines 14-16 */}
        <button
          type="button"
          className="btn btn-primary save-configure-instance"
          disabled={buttonsDisabled}
          onClick={handleSave}
        >
          {translations.installWizard_saveConfigureInstance}
        </button>
      </div>
    </>
  );
};

export default ConfigureInstancePanel;
