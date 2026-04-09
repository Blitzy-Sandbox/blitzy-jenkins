// =============================================================================
// PluginAdvanced.tsx — Advanced Plugin Settings Page
// =============================================================================
//
// Replaces:
//   - core/src/main/resources/hudson/PluginManager/advanced.jelly (110 lines)
//   - core/src/main/resources/hudson/PluginManager/_updateSite.js  (17 lines)
//
// Three primary sections:
//   1. Proxy configuration redirect notice (info alert)
//   2. Plugin file / URL upload form (admin-only, native multipart submission)
//   3. Update site URL management with reset-to-default capability
//
// Forms submit natively to Stapler endpoints (uploadPlugin, siteConfigure)
// with CSRF crumb injection via hidden <input> fields.
// =============================================================================

import React, { useState, useCallback } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useCrumb } from "@/hooks/useCrumb";
import { useJenkinsNavigation } from "@/hooks/useJenkinsNavigation";
import { useStaplerMutation } from "@/hooks/useStaplerMutation";
import { FormEntry } from "@/forms/FormEntry";
import { TextBox } from "@/forms/TextBox";
import { FileUpload } from "@/forms/FileUpload";
import { SubmitButton } from "@/forms/SubmitButton";

// =============================================================================
// Constants
// =============================================================================

/**
 * Default Jenkins update center URL.
 *
 * MUST exactly match the string in `_updateSite.js` line 4:
 * `"https://updates.jenkins.io/update-center.json"`
 *
 * Used for:
 * - Initializing the update-site URL input when no server value is provided
 * - Comparing against the current URL to determine reset-button visibility
 * - Resetting the URL when the "Reset to default" link is clicked
 */
const DEFAULT_UPDATE_SITE_URL = "https://updates.jenkins.io/update-center.json";

// =============================================================================
// Props Interface
// =============================================================================

/**
 * Props for the {@link PluginAdvanced} component.
 *
 * All props are optional with safe defaults so the component can render
 * in a degraded "read-only / non-admin" mode without any external data.
 */
export interface PluginAdvancedProps {
  /**
   * Whether the current user has administrator (ADMINISTER) permissions.
   * Controls visibility of the plugin-upload section and the submit / reset
   * controls inside the update-site section.
   * Corresponds to `readOnlyMode` being false in `advanced.jelly` line 32.
   */
  isAdmin?: boolean;

  /**
   * Current default update site URL as reported by the server
   * (`app.updateCenter.getSite(app.updateCenter.ID_DEFAULT).url`).
   * Pre-populates the controlled URL input in the Update Site section.
   */
  defaultSiteUrl?: string;

  /**
   * Whether the default site ID matches the predefined site ID.
   * When `true`, the "Reset to default" link is allowed to appear
   * (actual visibility also depends on the URL differing from the
   * default constant).  Mirrors the Jelly conditional:
   * `app.updateCenter.ID_DEFAULT.equals(app.updateCenter.PREDEFINED_UPDATE_SITE_ID)`
   */
  canResetToDefault?: boolean;

  /**
   * List of non-default update sites to display in the "Other Sites"
   * section.  Each entry has a unique `id` and a `url` string.
   * The section is hidden when the array is empty.
   */
  otherSites?: { id: string; url: string }[];
}

// =============================================================================
// Component
// =============================================================================

/**
 * **PluginAdvanced** — Advanced Plugin Settings Page
 *
 * Renders:
 * - An info alert about proxy settings having moved to the main configure page
 * - A plugin upload form (file or URL) for administrators
 * - An update-site URL form with a "Reset to default" action
 * - A list of other (non-default) update sites when present
 *
 * Form submissions use native `<form>` elements that POST directly to Stapler
 * endpoints, preserving the existing server-side handling.  CSRF protection is
 * maintained by injecting crumb hidden fields via the {@link useCrumb} hook.
 */
export function PluginAdvanced({
  isAdmin = false,
  defaultSiteUrl = DEFAULT_UPDATE_SITE_URL,
  canResetToDefault = false,
  otherSites = [],
}: PluginAdvancedProps): React.JSX.Element {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /**
   * Controlled value of the update-site URL text input.
   * Initialized from the server-provided `defaultSiteUrl` prop.
   */
  const [siteUrl, setSiteUrl] = useState<string>(defaultSiteUrl);

  /**
   * Whether to display the "Reset to default" link.
   * Hidden when the URL already equals the default constant.
   * Mirrors the visibility toggle logic from `_updateSite.js` lines 3-8.
   */
  const [showResetButton, setShowResetButton] = useState<boolean>(
    defaultSiteUrl !== DEFAULT_UPDATE_SITE_URL,
  );

  // ---------------------------------------------------------------------------
  // Hooks
  // ---------------------------------------------------------------------------

  /** Localization: `t(key)` reads i18n strings from the DOM `#i18n` element. */
  const { t } = useI18n();

  /** CSRF crumb values injected as hidden form fields on POST forms. */
  const { crumbFieldName, crumbValue } = useCrumb();

  /** URL builder for constructing full Jenkins paths. */
  const { buildUrl } = useJenkinsNavigation();

  /**
   * Mutation for URL-based plugin deploy pre-validation.
   * POSTs to the `checkPluginUrl` Stapler endpoint to verify the entered
   * plugin URL before the native form submit.
   * `isPending` disables the Deploy button during an active check.
   */
  const { mutate: checkPluginUrl, isPending: isCheckingPluginUrl } =
    useStaplerMutation<string, { pluginUrl: string }>({
      url: "checkPluginUrl",
      contentType: "form-urlencoded",
      responseType: "text",
    });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Reset the update-site URL to the default value and hide the reset link.
   * Replaces `_updateSite.js` lines 11-17 (onClick handler):
   *   - Sets URL input to DEFAULT_UPDATE_SITE_URL
   *   - Hides the reset button immediately
   */
  const handleReset = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      setSiteUrl(DEFAULT_UPDATE_SITE_URL);
      setShowResetButton(false);
    },
    [],
  );

  /**
   * Handle changes to the update-site URL input.
   * Updates the controlled state and toggles reset-button visibility
   * based on whether the new value matches the default URL.
   * Replaces the initial visibility check in `_updateSite.js` lines 3-8.
   */
  const handleSiteUrlChange = useCallback((value: string) => {
    setSiteUrl(value);
    setShowResetButton(value !== DEFAULT_UPDATE_SITE_URL);
  }, []);

  /**
   * Handle changes to the plugin-URL input in the upload section.
   * Triggers pre-validation against the `checkPluginUrl` Stapler endpoint
   * when a non-empty URL is entered, providing early feedback before deploy.
   */
  const handlePluginUrlChange = useCallback(
    (value: string) => {
      if (value.trim().length > 0) {
        checkPluginUrl({ pluginUrl: value });
      }
    },
    [checkPluginUrl],
  );

  // ---------------------------------------------------------------------------
  // i18n Helpers
  // ---------------------------------------------------------------------------

  /**
   * Format an i18n message with positional parameter substitution.
   *
   * Replaces `{0}`, `{1}`, … placeholders in the localized template string
   * with the supplied arguments.  Used primarily for `proxyMovedBlurb` which
   * contains a `{0}` placeholder for the configure-page URL.
   *
   * Falls back to the raw key if no localized string is found.
   */
  const formatMessage = useCallback(
    (key: string, ...args: string[]): string => {
      const template = t(key) ?? key;
      return args.reduce(
        (str, arg, index) => str.replace(`{${index}}`, arg),
        template,
      );
    },
    [t],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="jenkins-form">
      {/* ================================================================= */}
      {/* Proxy Moved Notice (advanced.jelly lines 40-42)                    */}
      {/* Info alert directing users to /manage/configure for proxy settings */}
      {/* ================================================================= */}
      <div className="jenkins-alert jenkins-alert-info">
        <strong>
          {formatMessage("proxyMovedBlurb", buildUrl("/manage/configure"))}
        </strong>
      </div>

      {/* ================================================================= */}
      {/* Plugin Upload Section (advanced.jelly lines 46-63) — Admin Only   */}
      {/* Native form submission to the uploadPlugin Stapler endpoint        */}
      {/* ================================================================= */}
      {isAdmin && (
        <section className="jenkins-section jenkins-!-margin-bottom-5">
          <h2 className="jenkins-section__title">
            {t("Deploy Plugin") ?? "Deploy Plugin"}
          </h2>

          <form
            method="post"
            action="uploadPlugin"
            name="uploadPlugin"
            encType="multipart/form-data"
          >
            {/* CSRF crumb hidden field for Stapler POST protection */}
            {crumbFieldName && crumbValue && (
              <input type="hidden" name={crumbFieldName} value={crumbValue} />
            )}

            {/* Deploy description text (advanced.jelly line 51) */}
            <div style={{ marginBlockEnd: "1em" }}>{t("deploytext") ?? ""}</div>

            {/* File input for .hpi/.jpi plugin files */}
            {/* (advanced.jelly lines 53-55) */}
            <FormEntry title={t("File") ?? "File"} field="name">
              <FileUpload accept=".hpi,.jpi" />
            </FormEntry>

            {/* Separator between file-upload and URL-deploy options */}
            <p>{t("Or") ?? "Or"}</p>

            {/* URL textbox for URL-based plugin deploy */}
            {/* (advanced.jelly lines 57-60) */}
            <FormEntry title={t("URL") ?? "URL"}>
              <TextBox
                name="pluginUrl"
                checkUrl="checkPluginUrl"
                checkDependsOn=""
                onChange={handlePluginUrlChange}
              />
            </FormEntry>

            {/* Deploy button — disabled during URL pre-validation */}
            <SubmitButton
              value={t("Deploy") ?? "Deploy"}
              disabled={isCheckingPluginUrl}
            />
          </form>
        </section>
      )}

      {/* ================================================================= */}
      {/* Update Site Section (advanced.jelly lines 66-93)                   */}
      {/* Manages the primary update-center URL with reset-to-default        */}
      {/* ================================================================= */}
      <section className="jenkins-section jenkins-!-margin-bottom-5">
        <h2 className="jenkins-section__title">
          {t("Update Site") ?? "Update Site"}
        </h2>

        <form method="post" action="siteConfigure" name="siteConfigure">
          {/* CSRF crumb hidden field for Stapler POST protection */}
          {crumbFieldName && crumbValue && (
            <input type="hidden" name={crumbFieldName} value={crumbValue} />
          )}

          <FormEntry title={t("URL") ?? "URL"}>
            <>
              {/* "Reset to default" link (admin-only, conditional) */}
              {/* Visible only when the current URL differs from the */}
              {/* default constant — replaces _updateSite.js toggle  */}
              {isAdmin && canResetToDefault && showResetButton && (
                <a id="reset-to-default" href="#" onClick={handleReset}>
                  {t("Reset to default") ?? "Reset to default"}
                </a>
              )}

              {/* Update-site URL input (controlled via React state) */}
              <TextBox
                name="site"
                value={siteUrl}
                checkUrl="checkUpdateSiteUrl"
                checkDependsOn=""
                onChange={handleSiteUrlChange}
              />
            </>
          </FormEntry>

          {/* Submit button (admin-only) — advanced.jelly lines 80-84 */}
          {isAdmin && (
            <div className="jenkins-form-item">
              <SubmitButton />
            </div>
          )}
        </form>
      </section>

      {/* ================================================================= */}
      {/* Other Sites Section (advanced.jelly lines 95-105)                  */}
      {/* Lists non-default update sites when present                        */}
      {/* ================================================================= */}
      {otherSites && otherSites.length > 0 && (
        <section className="jenkins-section jenkins-!-margin-bottom-5">
          <h2 className="jenkins-section__title">
            {t("Other Sites") ?? "Other Sites"}
          </h2>
          <ul>
            {otherSites.map((site) => (
              <li key={site.id}>{site.url}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
