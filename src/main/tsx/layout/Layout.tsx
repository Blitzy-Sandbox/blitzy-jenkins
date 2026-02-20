/**
 * Layout — Main page shell component for Jenkins pages.
 *
 * Replaces `core/src/main/resources/lib/layout/layout.jelly` (224 lines).
 * Composes the accessibility skip-link, breadcrumb navigation, side panel,
 * main content panel, and page footer into the standard Jenkins page shell.
 *
 * The component manages three document-level side effects via `useEffect`:
 *
 * 1. **Document title** — sets `document.title` to `"{title} - Jenkins"`,
 *    mirroring the Jelly pattern on layout.jelly line 112:
 *    `h.appendIfNotNull(title, ' - Jenkins', 'Jenkins')`.
 *
 * 2. **Body classes** — adds the `layoutType` CSS class to `document.body`
 *    and sets `document.body.id = 'jenkins'`, mirroring layout.jelly line 156:
 *    `<body id="jenkins" class="${layoutType} jenkins-${h.version}">`.
 *
 * 3. **Responsive grid CSS** — dynamically adds/removes the
 *    `responsive-grid.css` stylesheet link element based on the `noGrid` prop,
 *    mirroring layout.jelly lines 115-117.
 *
 * The `<head>` data attributes (`data-rooturl`, `data-crumb-header`, etc.)
 * are managed by the Jelly shell view, not by this component. Jenkins
 * configuration (base URL, crumb tokens) is consumed via the
 * {@link useJenkinsConfig} context hook.
 *
 * @module layout/Layout
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useJenkinsConfig } from '@/providers/JenkinsConfigProvider';
import BreadcrumbBar from './BreadcrumbBar';
import { SidePanel } from './SidePanel';
import { MainPanel } from './MainPanel';

/**
 * Props for the {@link Layout} component.
 *
 * Maps directly to the Jelly `<l:layout>` tag attributes defined in
 * `layout.jelly` lines 30-58.
 */
export interface LayoutProps {
  /**
   * Page title rendered into `document.title` with a " - Jenkins" suffix.
   * When omitted, `document.title` is set to plain "Jenkins".
   */
  title?: string;

  /**
   * Layout type controlling structural composition.
   *
   * - `'two-column'` (default): side panel + main panel with breadcrumbs.
   * - `'one-column'`: full-width main panel, no side panel.
   * - `'full-screen'`: no header, no breadcrumbs, no footer.
   *
   * Maps to the Jelly `type` attribute (layout.jelly lines 86-91).
   */
  type?: 'two-column' | 'one-column' | 'full-screen';

  /**
   * When `true`, the Bootstrap 3 responsive grid CSS is excluded.
   * Mirrors the Jelly `nogrid` attribute (layout.jelly lines 115-117).
   * Defaults to `false` (grid CSS is loaded).
   */
  noGrid?: boolean;

  /**
   * Content rendered inside the {@link SidePanel} component.
   * Only displayed when `type` is `'two-column'` and this prop is provided.
   */
  sidePanel?: React.ReactNode;

  /**
   * Main content area children rendered inside the `#main-panel` wrapper
   * via the {@link MainPanel} component.
   */
  children: React.ReactNode;
}

/**
 * DOM id for the dynamically injected responsive-grid.css `<link>` element.
 * Used to safely add/remove the stylesheet without affecting other links.
 */
const RESPONSIVE_GRID_LINK_ID = 'jenkins-responsive-grid-css';

/**
 * Main page shell component replacing the Jelly `<l:layout>` tag.
 *
 * Renders the complete Jenkins page structure:
 * - Accessibility skip-link (`<a href="#skip2content">`)
 * - {@link BreadcrumbBar} navigation trail
 * - `#page-body` container with optional {@link SidePanel} and
 *   `#main-panel` wrapper containing {@link MainPanel}
 * - Page footer with REST API link and Jenkins version dropdown
 *
 * @example
 * ```tsx
 * <Layout title="Dashboard" type="two-column" sidePanel={<nav>...</nav>}>
 *   <ProjectView />
 * </Layout>
 * ```
 */
export default function Layout({
  title,
  type = 'two-column',
  noGrid = false,
  sidePanel,
  children,
}: LayoutProps): React.JSX.Element {
  const { baseUrl } = useJenkinsConfig();
  const layoutType = type;

  /* ------------------------------------------------------------------ */
  /*  Footer version dropdown state                                      */
  /* ------------------------------------------------------------------ */
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const versionButtonRef = useRef<HTMLButtonElement>(null);
  const versionDropdownRef = useRef<HTMLDivElement>(null);

  /* ------------------------------------------------------------------ */
  /*  Side-effect 1: Document title management                           */
  /*  Mirrors layout.jelly line 112:                                     */
  /*    <title>${h.appendIfNotNull(title,' - Jenkins','Jenkins')}</title> */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    document.title = title ? `${title} - Jenkins` : 'Jenkins';
  }, [title]);

  /* ------------------------------------------------------------------ */
  /*  Side-effect 2: Body ID and class management                        */
  /*  Mirrors layout.jelly line 156:                                     */
  /*    <body id="jenkins" class="${layoutType} jenkins-${h.version}">    */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    document.body.id = 'jenkins';
    document.body.classList.add(layoutType);
    return () => {
      document.body.classList.remove(layoutType);
    };
  }, [layoutType]);

  /* ------------------------------------------------------------------ */
  /*  Side-effect 3: Responsive grid CSS management                      */
  /*  Mirrors layout.jelly lines 115-117:                                */
  /*    <j:if test="${attrs.nogrid==null or attrs.nogrid.equals(false)}"> */
  /*      <link rel="stylesheet" href="${resURL}/css/responsive-grid.css" */
  /*            type="text/css" />                                       */
  /*    </j:if>                                                          */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const existing = document.getElementById(
      RESPONSIVE_GRID_LINK_ID,
    ) as HTMLLinkElement | null;

    if (!noGrid && !existing) {
      const resUrl = document.head.dataset.resurl ?? '';
      const link = document.createElement('link');
      link.id = RESPONSIVE_GRID_LINK_ID;
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = `${resUrl}/css/responsive-grid.css`;
      document.head.appendChild(link);
    } else if (noGrid && existing) {
      existing.remove();
    }
  }, [noGrid]);

  /* ------------------------------------------------------------------ */
  /*  Side-effect 4: Version dropdown close handlers                     */
  /*  Close on outside click or Escape key for accessibility.            */
  /* ------------------------------------------------------------------ */
  const closeVersionMenu = useCallback(() => {
    setVersionMenuOpen(false);
  }, []);

  const toggleVersionMenu = useCallback(() => {
    setVersionMenuOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!versionMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsideButton =
        versionButtonRef.current?.contains(target) ?? false;
      const isInsideDropdown =
        versionDropdownRef.current?.contains(target) ?? false;
      if (!isInsideButton && !isInsideDropdown) {
        closeVersionMenu();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeVersionMenu();
        versionButtonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [versionMenuOpen, closeVersionMenu]);

  /* ------------------------------------------------------------------ */
  /*  Jenkins version string from body dataset (set by Jelly shell)      */
  /* ------------------------------------------------------------------ */
  const version = document.body.dataset.version ?? '';

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */
  return (
    <>
      {/* Accessibility skip-link — mirrors layout.jelly line 163 */}
      {layoutType !== 'full-screen' && (
        <a href="#skip2content" className="jenkins-skip-link">
          Skip to content
        </a>
      )}

      {/* Breadcrumb navigation — mirrors layout.jelly lines 138-141 */}
      {layoutType !== 'full-screen' && <BreadcrumbBar />}

      {/*
       * Page body container — mirrors layout.jelly lines 172-181:
       *   <div id="page-body"
       *        class="app-page-body app-page-body--${layoutType} clear">
       */}
      <div
        id="page-body"
        className={`app-page-body app-page-body--${layoutType} clear`}
      >
        {/* Side panel — only for two-column layout (layout.jelly line 173) */}
        {layoutType === 'two-column' && sidePanel != null && (
          <SidePanel>{sidePanel}</SidePanel>
        )}

        {/*
         * Main panel wrapper — Layout owns this div per MainPanel contract.
         * MainPanel renders banners, skip anchor, and children inside it.
         */}
        <div id="main-panel">
          <MainPanel>{children}</MainPanel>
        </div>
      </div>

      {/* Footer — mirrors layout.jelly lines 183-218 */}
      {layoutType !== 'full-screen' && (
        <footer className="page-footer jenkins-mobile-hide">
          <div className="page-footer__flex-row">
            {/* Placeholder consumed by page decorators (layout.jelly line 186) */}
            <div
              className="page-footer__footer-id-placeholder"
              id="footer"
            />

            <div className="page-footer__links">
              {/* REST API link — mirrors layout.jelly line 196 */}
              <a
                className="jenkins-button jenkins-button--tertiary rest-api"
                href="api/"
              >
                REST API
              </a>

              {/*
               * Version overflow button — mirrors layout.jelly lines 199-215.
               * Renders a button that toggles a dropdown menu containing
               * "About Jenkins", "Get involved", and "Website" links.
               */}
              <button
                ref={versionButtonRef}
                className="jenkins-button jenkins-button--tertiary jenkins_ver"
                type="button"
                aria-expanded={versionMenuOpen}
                aria-haspopup="true"
                onClick={toggleVersionMenu}
              >
                Jenkins {version}
              </button>

              {versionMenuOpen && (
                <div
                  ref={versionDropdownRef}
                  className="jenkins-dropdown"
                  role="menu"
                >
                  {/* About Jenkins — layout.jelly line 204-206 */}
                  <a
                    className="jenkins-dropdown__item"
                    href={`${baseUrl}/manage/about`}
                    role="menuitem"
                  >
                    About Jenkins
                  </a>

                  {/* Separator — layout.jelly line 207 */}
                  <div
                    className="jenkins-dropdown__separator"
                    role="separator"
                  />

                  {/* Get involved — layout.jelly lines 209-211 */}
                  <a
                    className="jenkins-dropdown__item"
                    href="https://www.jenkins.io/participate/"
                    role="menuitem"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get involved
                  </a>

                  {/* Website — layout.jelly lines 212-214 */}
                  <a
                    className="jenkins-dropdown__item"
                    href="https://www.jenkins.io"
                    role="menuitem"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Website
                  </a>
                </div>
              )}
            </div>
          </div>
        </footer>
      )}
    </>
  );
}
