import React from "react";

/**
 * Props for the SetupCompletePanel component.
 *
 * All data is passed from the parent SetupWizard orchestrator —
 * this component is purely presentational with no data-fetching
 * or mutation logic.
 */
export interface SetupCompletePanelProps {
  /** Localized translation strings keyed by dot-path translation key */
  translations: Record<string, string>;
  /** Whether a Jenkins restart is required to complete plugin installation */
  restartRequired: boolean;
  /** Whether the Jenkins instance supports automatic restart via the UI */
  restartSupported: boolean;
  /**
   * Raw HTML message content from the server describing the install outcome.
   * Rendered via dangerouslySetInnerHTML to replicate the Handlebars
   * triple-mustache `{{{message}}}` unescaped rendering pattern.
   */
  message: string;
  /** Callback invoked when the user clicks the "Start using Jenkins" finish button */
  onFinish: () => void;
  /** Callback invoked when the user clicks the "Restart" button */
  onRestart: () => void;
}

/**
 * SetupCompletePanel — Completion step of the Jenkins first-run setup wizard.
 *
 * Replaces the Handlebars template `src/main/js/templates/setupCompletePanel.hbs`.
 * Renders a localized completion message with conditional restart messaging
 * controlled by `restartRequired` and `restartSupported` boolean props,
 * and displays finish or restart action buttons accordingly.
 *
 * DOM structure and CSS class names are preserved exactly from the original
 * Handlebars template to maintain visual parity with the existing SCSS
 * styling in `pluginSetupWizard.scss`.
 *
 * Conditional rendering logic (three states):
 * 1. `restartRequired && restartSupported` — Shows restart message + restart button
 * 2. `restartRequired && !restartSupported` — Shows not-supported message, no button
 * 3. `!restartRequired` — Shows completion message + finish button
 */
export default function SetupCompletePanel({
  translations,
  restartRequired,
  restartSupported,
  message,
  onFinish,
  onRestart,
}: SetupCompletePanelProps): React.JSX.Element {
  return (
    <>
      {/* Modal header — NOT closeable (no .closeable class on completion step) */}
      <div className="modal-header">
        <h4 className="modal-title">
          {translations.installWizard_installComplete_title}
        </h4>
      </div>

      {/* Modal body with jumbotron containing all content and action buttons */}
      <div className="modal-body">
        <div className="jumbotron welcome-panel success-panel">
          {/* Banner heading — conditional on restartRequired flag */}
          {restartRequired ? (
            <h1>
              {translations.installWizard_installComplete_bannerRestart}
            </h1>
          ) : (
            <h1>
              {translations.installWizard_installComplete_banner}
            </h1>
          )}

          {/*
           * Server-generated HTML message describing the installation outcome.
           * Uses dangerouslySetInnerHTML to replicate the Handlebars triple-mustache
           * {{{message}}} pattern which renders raw/unescaped HTML content.
           * The message is server-trusted and may contain <p>, <a>, and other HTML elements.
           */}
          <div dangerouslySetInnerHTML={{ __html: message }} />

          {/* Conditional content based on restart requirement and support flags */}
          {restartRequired ? (
            restartSupported ? (
              <>
                <p>
                  {
                    translations.installWizard_installComplete_installComplete_restartRequiredMessage
                  }
                </p>
                <button
                  type="button"
                  className="btn btn-primary install-done-restart"
                  onClick={onRestart}
                >
                  {translations.installWizard_installComplete_restartLabel}
                </button>
              </>
            ) : (
              <p>
                {
                  translations.installWizard_installComplete_installComplete_restartRequiredNotSupportedMessage
                }
              </p>
            )
          ) : (
            <>
              <p>
                {translations.installWizard_installComplete_message}
              </p>
              <button
                type="button"
                className="btn btn-primary install-done"
                onClick={onFinish}
              >
                {translations.installWizard_installComplete_finishButtonLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
