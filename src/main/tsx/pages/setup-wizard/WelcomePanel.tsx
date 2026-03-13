import { useRef, useEffect } from "react";

/**
 * Props for the WelcomePanel component.
 *
 * All visible text content is provided via the `translations` record
 * to support Jenkins' multi-locale i18n system. The two callback props
 * correspond to the two CTA actions on the welcome screen.
 */
export interface WelcomePanelProps {
  /** Localized translation strings keyed by translation identifier */
  translations: Record<string, string>;
  /** Callback invoked when the user clicks "Install suggested plugins" */
  onInstallRecommended: () => void;
  /** Callback invoked when the user clicks "Select plugins to install" */
  onInstallCustom: () => void;
}

/**
 * WelcomePanel — First panel of the Jenkins setup wizard.
 *
 * Renders a localized hero banner with two call-to-action buttons:
 * - "Install suggested plugins" (primary, auto-focused on mount)
 * - "Select plugins to install" (secondary, custom selection)
 *
 * This component replaces the Handlebars template `welcomePanel.hbs` (28 lines).
 * All CSS class names are preserved exactly to maintain visual symmetry with the
 * existing SCSS selectors in `pluginSetupWizard.scss`.
 *
 * The `.closeable` class on `.modal-header` signals to the parent `SetupWizard`
 * component that a close button should be injected, preserving the original
 * behavior from `pluginSetupWizardGui.js` lines 301–306.
 *
 * Translation keys consumed:
 * - `installWizard_welcomePanel_title`
 * - `installWizard_welcomePanel_banner`
 * - `installWizard_welcomePanel_message`
 * - `installWizard_welcomePanel_recommendedActionTitle`
 * - `installWizard_welcomePanel_recommendedActionDetails`
 * - `installWizard_welcomePanel_customizeActionTitle`
 * - `installWizard_welcomePanel_customizeActionDetails`
 */
export default function WelcomePanel({
  translations,
  onInstallRecommended,
  onInstallCustom,
}: WelcomePanelProps) {
  const recommendedRef = useRef<HTMLAnchorElement>(null);

  // Auto-focus the recommended install button when the panel mounts.
  // This replicates the jQuery behavior from pluginSetupWizardGui.js line 507:
  //   $(".install-recommended").focus();
  useEffect(() => {
    recommendedRef.current?.focus();
  }, []);

  return (
    <>
      <div className="modal-header closeable">
        <h4 className="modal-title">
          {translations.installWizard_welcomePanel_title}
        </h4>
      </div>
      <div className="modal-body setup-wizard-heading">
        <div className="jumbotron welcome-panel">
          <h1>{translations.installWizard_welcomePanel_banner}</h1>
          <p>{translations.installWizard_welcomePanel_message}</p>
          <p className="button-set">
            <a
              ref={recommendedRef}
              className="btn btn-primary btn-lg btn-huge install-recommended"
              href="#"
              role="button"
              onClick={(e) => {
                e.preventDefault();
                onInstallRecommended();
              }}
            >
              <b>
                {translations.installWizard_welcomePanel_recommendedActionTitle}
              </b>
              <sub>
                {
                  translations.installWizard_welcomePanel_recommendedActionDetails
                }
              </sub>
            </a>
            <a
              className="btn btn-default btn-lg btn-huge install-custom"
              href="#"
              role="button"
              onClick={(e) => {
                e.preventDefault();
                onInstallCustom();
              }}
            >
              <b>
                {translations.installWizard_welcomePanel_customizeActionTitle}
              </b>
              <sub>
                {translations.installWizard_welcomePanel_customizeActionDetails}
              </sub>
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
