/**
 * MainPanel — Main Content Area Container
 *
 * Replaces `core/src/main/resources/lib/layout/main-panel.jelly` (65 lines).
 * Renders the primary content area of a Jenkins page, including conditional
 * shutdown / safe-restart banners and an accessibility skip-to-content anchor.
 *
 * This component renders INSIDE the `#main-panel` wrapper div, which is
 * created by the parent {@link Layout} component (layout.jelly line 177).
 *
 * DOM IDs preserved for SCSS compatibility:
 * - `#safe-restart-msg` — safe restart banner (styled in `_layout-commons.scss`)
 * - `#shutdown-msg` — shutdown banner (styled in `_layout-commons.scss`)
 * - `#skip2content` — skip-to-content anchor target (invisible, keyboard navigation)
 *
 * No jQuery — React JSX replaces Jelly server-rendered HTML.
 * No Handlebars — JSX replaces template rendering.
 * No behaviorShim — React component lifecycle replaces `Behaviour.specify()`.
 *
 * @module MainPanel
 */

import type React from 'react';

import { useI18n } from '@/hooks/useI18n';

/**
 * Props for the {@link MainPanel} component.
 *
 * These props mirror the server-side state checks in main-panel.jelly:
 * - `quietingDown` → `app.isQuietingDown()` (line 32)
 * - `preparingSafeRestart` → `app.isPreparingSafeRestart()` (line 34)
 * - `quietDownReason` → `app.getQuietDownReason()` (lines 37, 49)
 * - `children` → `<d:invokeBody />` (line 62)
 */
export interface MainPanelProps {
  /**
   * Whether the Jenkins instance is in "quieting down" state (preparing
   * to shut down or restart). When `true`, a shutdown or safe-restart
   * banner is displayed above the main content.
   *
   * Maps to `app.isQuietingDown()` in main-panel.jelly line 32.
   */
  quietingDown?: boolean;

  /**
   * Whether Jenkins is preparing a safe restart (as opposed to a full
   * shutdown). Only meaningful when `quietingDown` is `true`.
   *
   * - `true` → renders `#safe-restart-msg` banner
   * - `false` / `undefined` → renders `#shutdown-msg` banner
   *
   * Maps to `app.isPreparingSafeRestart()` in main-panel.jelly line 34.
   */
  preparingSafeRestart?: boolean;

  /**
   * Custom reason message for the shutdown or safe restart. When provided,
   * overrides the default i18n message in the banner.
   *
   * Behavior mirrors the Jelly conditional logic:
   * - Safe restart: displayed only if `quietDownReason.trim()` is non-empty
   *   (main-panel.jelly line 37: `!app.getQuietDownReason().trim().isEmpty()`)
   * - Shutdown: displayed if defined (even as empty string)
   *   (main-panel.jelly line 49: `app.getQuietDownReason() != null`)
   */
  quietDownReason?: string;

  /**
   * Main content area children. Replaces `<d:invokeBody />` from
   * main-panel.jelly line 62.
   */
  children: React.ReactNode;
}

/**
 * Renders the main content area of a Jenkins page.
 *
 * Conditionally shows a shutdown or safe-restart banner above the content,
 * always renders the `#skip2content` accessibility anchor, and then renders
 * the page children.
 *
 * The component does NOT render the `#main-panel` wrapper div — that is the
 * responsibility of the parent {@link Layout} component.
 *
 * @example
 * ```tsx
 * <MainPanel
 *   quietingDown={jenkinsState.quietingDown}
 *   preparingSafeRestart={jenkinsState.preparingSafeRestart}
 *   quietDownReason={jenkinsState.quietDownReason}
 * >
 *   <h1>My Page Content</h1>
 * </MainPanel>
 * ```
 */
export function MainPanel({
  quietingDown,
  preparingSafeRestart,
  quietDownReason,
  children,
}: MainPanelProps): React.JSX.Element {
  const { t } = useI18n();

  return (
    <>
      {quietingDown &&
        (preparingSafeRestart ? (
          <div id="safe-restart-msg">
            {/*
             * Safe-restart banner — mirrors main-panel.jelly lines 34-44.
             *
             * Jelly logic (line 37):
             *   <j:when test="${!app.getQuietDownReason().trim().isEmpty()}">
             *     ${app.getQuietDownReason()}
             *   </j:when>
             *   <j:otherwise>${%saferestart}</j:otherwise>
             *
             * If the trimmed reason is non-empty, display the raw reason.
             * Otherwise, fall back to the i18n 'saferestart' string,
             * then to a hardcoded English default.
             */}
            {quietDownReason?.trim()
              ? quietDownReason
              : (t('saferestart') ?? 'Jenkins is restarting')}
          </div>
        ) : (
          <div id="shutdown-msg">
            {/*
             * Shutdown banner — mirrors main-panel.jelly lines 46-56.
             *
             * Jelly logic (line 49):
             *   <j:when test="${app.getQuietDownReason() != null}">
             *     ${app.getQuietDownReason()}
             *   </j:when>
             *   <j:otherwise>${%shutdown}</j:otherwise>
             *
             * If the reason is defined (even as an empty string), display it.
             * Otherwise, fall back to the i18n 'shutdown' string,
             * then to a hardcoded English default.
             */}
            {quietDownReason != null
              ? quietDownReason
              : (t('shutdown') ?? 'Jenkins is shutting down')}
          </div>
        ))}
      {/* Skip-to-content anchor — mirrors main-panel.jelly line 60.
          This is the target for the <a href="#skip2content"> skip link
          rendered in the Layout component's accessibility skip link. */}
      <a id="skip2content" />
      {/* start of main content */}
      {children}
      {/* end of main content */}
    </>
  );
}

export default MainPanel;
