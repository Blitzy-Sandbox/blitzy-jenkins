/**
 * ProxyConfigPanel — Proxy Settings Step of the Jenkins Setup Wizard
 *
 * Replaces the Handlebars template `src/main/js/templates/proxyConfigPanel.hbs` (17 lines).
 * Renders a jumbotron security panel containing an iframe that loads the Jenkins proxy
 * configuration form from `/setupWizard/proxy-configuration`, plus go-back and save buttons.
 *
 * Behavior (derived from `pluginSetupWizardGui.js` lines 1142-1154):
 * - The iframe loads the proxy configuration form served by the Stapler endpoint.
 * - All buttons start disabled. After the iframe fires its `load` event, buttons are enabled
 *   (replicating `enableButtonsAfterFrameLoad` at source line 457-461).
 * - On save: extracts the form from the iframe's `contentDocument` via
 *   `form:not(.no-json)` selector (source line 1149), builds a `SaveProxyPayload`,
 *   and posts it via `useSaveProxy()` mutation to `POST /pluginManager/proxyConfigure`.
 * - The response is HTML (not JSON) — `dataType: "html"` (source `securityConfig.js` line 50).
 * - On successful save, the `onSave` callback is invoked, which the parent wizard uses
 *   to navigate to "/" (source line 1151: `jenkins.goTo("/")`).
 * - IMPORTANT: No CSRF crumb refresh occurs after proxy save (unlike `saveFirstUser` and
 *   `saveConfigureInstance`). This matches the source's `saveProxy` which passes `success`
 *   directly without crumb refresh logic (source `securityConfig.js` lines 48-53).
 *
 * DOM structure and CSS classes are preserved exactly from the original Handlebars template
 * to maintain visual parity with the existing SCSS styling in `pluginSetupWizard.scss`.
 *
 * @module pages/setup-wizard/ProxyConfigPanel
 */

import React, { useState, useRef, useCallback } from "react";
import { useSaveProxy } from "@/api/security";

// =============================================================================
// Props Interface
// =============================================================================

/**
 * Props for the ProxyConfigPanel component.
 *
 * All data is passed from the parent SetupWizard orchestrator — this component
 * manages only the iframe load state and save mutation internally.
 */
export interface ProxyConfigPanelProps {
  /** Localized translation strings keyed by dot-path translation key. */
  translations: Record<string, string>;
  /** Jenkins base URL used to construct the iframe src for the proxy config form. */
  baseUrl: string;
  /** Callback invoked when the user clicks the "Go Back" button. */
  onGoBack: () => void;
  /**
   * Callback invoked on successful proxy configuration save.
   * The parent wizard typically uses this to navigate to "/" via `jenkins.goTo("/")`.
   */
  onSave: () => void;
}

// =============================================================================
// Helper: Extract form field value from FormData
// =============================================================================

/**
 * Safely extracts a string value from a FormData entry.
 *
 * Returns `undefined` if the key is not present or the value is a File object
 * (which cannot occur for text inputs but is required by the FormData type contract).
 *
 * @param formData - The FormData instance to read from.
 * @param key - The form field name to extract.
 * @returns The string value, or `undefined` if not present or not a string.
 */
function getFormField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

// =============================================================================
// Component
// =============================================================================

/**
 * ProxyConfigPanel renders the proxy settings step of the Jenkins first-run
 * setup wizard. It embeds an iframe pointing to the Jenkins proxy configuration
 * form and provides go-back and save action buttons.
 *
 * The save button is initially disabled and becomes enabled once the iframe has
 * finished loading its content (replicating the `enableButtonsAfterFrameLoad`
 * pattern from `pluginSetupWizardGui.js` lines 457-461). During a save
 * operation the button is also disabled to prevent double submissions.
 */
export default function ProxyConfigPanel({
  translations,
  baseUrl,
  onGoBack,
  onSave,
}: ProxyConfigPanelProps): React.JSX.Element {
  // Track whether the iframe has finished loading — controls button enabled state.
  // Starts false to match the source's `disabled` attribute on the save button
  // in the Handlebars template (proxyConfigPanel.hbs line 13).
  const [buttonsEnabled, setButtonsEnabled] = useState<boolean>(false);

  // Ref to the iframe element for accessing its contentDocument to extract form data.
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // React Query mutation hook for POST /pluginManager/proxyConfigure.
  // `mutate()` triggers the save; `isPending` indicates an in-flight request.
  const { mutate, isPending } = useSaveProxy();

  /**
   * Handler for the iframe's `load` event.
   *
   * Enables the save button after the proxy configuration form has been rendered
   * inside the iframe. Replicates the jQuery equivalent from
   * `pluginSetupWizardGui.js` lines 457-461:
   * ```js
   * var enableButtonsAfterFrameLoad = function () {
   *   $("iframe[src]").on("load", function () {
   *     $("button").prop({ disabled: false });
   *   });
   * };
   * ```
   */
  const handleIframeLoad = useCallback((): void => {
    setButtonsEnabled(true);
  }, []);

  /**
   * Handler for the save button click.
   *
   * Extracts the proxy configuration form from the iframe's contentDocument,
   * builds a typed payload from its form fields, and submits it via the
   * `useSaveProxy()` mutation. On success, invokes `onSave()` which the parent
   * wizard uses to navigate to "/".
   *
   * Replicates the logic from `pluginSetupWizardGui.js` lines 1147-1154:
   * ```js
   * var saveProxyConfig = function () {
   *   securityConfig.saveProxy(
   *     $("iframe[src]").contents().find("form:not(.no-json)"),
   *     function () { jenkins.goTo("/"); },
   *   );
   * };
   * ```
   *
   * The form selector `form:not(.no-json)` is preserved from source line 1149
   * to correctly target the proxy configuration form and exclude any non-data forms.
   */
  const handleSave = useCallback((): void => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) {
      return;
    }

    // Find the proxy configuration form inside the iframe, using the same
    // selector as the original jQuery code (source line 1149).
    const form = doc.querySelector<HTMLFormElement>("form:not(.no-json)");
    if (!form) {
      return;
    }

    // Extract form field values into a typed payload.
    // The proxy configuration form contains: server, port, userName, password, noProxyFor
    // matching the SaveProxyPayload interface in api/types.ts.
    const formData = new FormData(form);

    mutate(
      {
        server: getFormField(formData, "server"),
        port: getFormField(formData, "port"),
        userName: getFormField(formData, "userName"),
        password: getFormField(formData, "password"),
        noProxyFor: getFormField(formData, "noProxyFor"),
      },
      {
        onSuccess: (): void => {
          // Navigate to "/" — replicates source line 1151: jenkins.goTo("/")
          onSave();
        },
      },
    );
  }, [mutate, onSave]);

  return (
    <>
      {/* Modal header — proxyConfigPanel.hbs lines 1-3 */}
      <div className="modal-header">
        <h4 className="modal-title">
          {translations.installWizard_configureProxy_label}
        </h4>
      </div>

      {/* Modal body with jumbotron security panel containing the iframe —
          proxyConfigPanel.hbs lines 4-8 */}
      <div className="modal-body">
        <div className="jumbotron welcome-panel security-panel">
          <iframe
            ref={iframeRef}
            src={`${baseUrl}/setupWizard/proxy-configuration`}
            onLoad={handleIframeLoad}
          />
        </div>
      </div>

      {/* Modal footer with go-back and save buttons —
          proxyConfigPanel.hbs lines 9-16 */}
      <div className="modal-footer">
        {/* Go-back button — always enabled once iframe loads.
            Class "install-home" matches source template line 10. */}
        <button
          type="button"
          className="btn btn-link install-home"
          onClick={onGoBack}
        >
          {translations.installWizard_goBack}
        </button>

        {/* Save button — disabled until iframe loads and during save.
            Class "save-proxy-config" matches source template line 13.
            The disabled attribute starts as true (buttonsEnabled is initially false)
            matching the `disabled` attribute in the Handlebars template. */}
        <button
          type="button"
          className="btn btn-primary save-proxy-config"
          disabled={!buttonsEnabled || isPending}
          onClick={handleSave}
        >
          {translations.installWizard_configureProxy_save}
        </button>
      </div>
    </>
  );
}
