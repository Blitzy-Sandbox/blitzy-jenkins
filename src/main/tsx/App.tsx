/**
 * App.tsx — Root Application Component for Jenkins React Frontend
 *
 * Replaces the imperative bootstrap pattern in `src/main/js/app.js`.
 * The original module imported 9 component modules and called `.init()`
 * on each to register `behaviorShim.specify()` DOM observation handlers.
 *
 * This React root component replaces that pattern by:
 *
 * 1. **Rendering the Layout page shell** as the outermost structural wrapper
 *    for all page content (header, side-panel, main-panel, footer).
 *
 * 2. **Mounting global persistent components** that replace the `.init()` calls:
 *    - {@link Header}: scroll effects, breadcrumb overflow, resize handling
 *    - {@link CommandPalette}: Ctrl+K / Cmd+K quick-navigation overlay
 *    - {@link Notifications}: toast notifications with `window.notificationBar`
 *    - `TooltipManager`: MutationObserver tooltip attachment for `[tooltip]` elements
 *
 * 3. **Initializing the global dialog system** (`window.dialog`) via imperative
 *    setup in a `useEffect`, preserving the plugin ecosystem's dependency on
 *    the global `dialog.modal()`, `dialog.confirm()`, `dialog.prompt()` API.
 *
 * 4. **Exposing a component registry** on `window.__jenkinsComponents` for
 *    Jelly-rendered pages that need to dynamically mount React per-instance
 *    components during the progressive migration period.
 *
 * Source pattern reference (`src/main/js/app.js`):
 * ```js
 * Dropdowns.init();      // → Dropdown in COMPONENT_REGISTRY
 * CommandPalette.init();  // → <CommandPalette /> rendered globally
 * Defer.init();           // → Defer in COMPONENT_REGISTRY
 * Notifications.init();   // → <Notifications /> rendered globally
 * SearchBar.init();       // → SearchBar in COMPONENT_REGISTRY
 * Tooltips.init();        // → <TooltipManager /> rendered globally
 * StopButtonLink.init();  // → StopButtonLink in COMPONENT_REGISTRY
 * ConfirmationLink.init();// → ConfirmationLink in COMPONENT_REGISTRY
 * Dialogs.init();         // → initDialogGlobals() + initDialogOpeners()
 * ```
 *
 * @module App
 */

import { useEffect } from 'react';

// Layout — outermost page shell
import Layout from '@/layout/Layout';

// Global/persistent components rendered in the App tree
import CommandPalette from '@/components/command-palette/CommandPalette';
import Notifications from '@/components/notifications/Notifications';
import Header from '@/components/header/Header';

// Tooltip — default export for registry, named TooltipManager for global DOM observation
import Tooltip, { TooltipManager } from '@/components/tooltips/Tooltip';

// Dialog — default export for registry, named functions for imperative global setup
import Dialog, {
  initDialogGlobals,
  initDialogOpeners,
} from '@/components/dialogs/Dialog';

// Per-instance components — used declaratively in child component trees,
// exposed via the component registry for Jelly interop
import Dropdown from '@/components/dropdowns/Dropdown';
import SearchBar from '@/components/search-bar/SearchBar';
import StopButtonLink from '@/components/stop-button-link/StopButtonLink';
import ConfirmationLink from '@/components/confirmation-link/ConfirmationLink';
import Defer from '@/components/defer/Defer';
import RowSelectionController from '@/components/row-selection-controller/RowSelectionController';

// ---------------------------------------------------------------------------
// Window Type Augmentation
// ---------------------------------------------------------------------------

/**
 * Augment the global `Window` interface with the Jenkins component registry.
 *
 * During the progressive Jelly-to-React migration, Jelly-rendered pages may
 * dynamically mount React components. This registry provides typed access to
 * all per-instance behavioral components that replace the legacy
 * `behaviorShim.specify()` registration pattern.
 */
declare global {
  interface Window {
    /** Registry of React component constructors for Jelly interop. */
    __jenkinsComponents?: Record<string, unknown>;
  }
}

// ---------------------------------------------------------------------------
// Component Registry
// ---------------------------------------------------------------------------

/**
 * Per-instance component registry mapping component names to their React
 * constructors. These components were previously registered via
 * `behaviorShim.specify()` calls in `app.js` (`Dropdowns.init()`,
 * `SearchBar.init()`, etc.) and are now available for:
 *
 * - **Declarative rendering** in React component trees (imported directly
 *   by page/view components from their own module paths).
 * - **Dynamic mounting** from Jelly-rendered pages via
 *   `window.__jenkinsComponents.Dropdown` (for the migration period).
 *
 * Global/persistent components (`CommandPalette`, `Notifications`, `Header`)
 * are NOT in this registry — they are rendered directly in the App component
 * tree and do not need dynamic mounting.
 */
const COMPONENT_REGISTRY = {
  Dropdown,
  SearchBar,
  StopButtonLink,
  ConfirmationLink,
  Defer,
  RowSelectionController,
  Tooltip,
  Dialog,
};

// ---------------------------------------------------------------------------
// Root Application Component
// ---------------------------------------------------------------------------

/**
 * Root application component for the Jenkins React frontend.
 *
 * Serves as the top-level composition point, replacing the imperative
 * bootstrap in `src/main/js/app.js`. Renders the page layout shell and
 * all global behavioral components that operate page-wide.
 *
 * The {@link Layout} component provides the structural page shell (header
 * area, side panel, main panel, footer) while the global components provide:
 *
 * - **Header**: scroll-aware sticky behavior and breadcrumb overflow detection
 * - **CommandPalette**: keyboard-activated command palette (Ctrl+K / Cmd+K)
 * - **Notifications**: toast notification rendering with auto-dismiss
 * - **TooltipManager**: automatic tooltip attachment via DOM observation
 *
 * The dialog system (`window.dialog.modal`, `.alert`, `.confirm`, `.prompt`,
 * `.form`) is initialized imperatively via `useEffect`, preserving the plugin
 * ecosystem's dependency on the global dialog API.
 */
function App() {
  // Initialize the global dialog system.
  // Replaces Dialogs.init() (app.js line 19) which called behaviorShim.specify
  // to register window.dialog and click handlers for dialog opener elements.
  // initDialogGlobals() sets up window.dialog with modal/alert/confirm/prompt/form.
  // initDialogOpeners() attaches click handlers to [data-type='dialog-opener'] elements.
  useEffect(() => {
    initDialogGlobals();
    initDialogOpeners();
  }, []);

  // Expose the component registry on the window object for Jelly-rendered
  // pages that need to dynamically mount React components during the
  // progressive migration from Jelly to React rendering.
  useEffect(() => {
    window.__jenkinsComponents = COMPONENT_REGISTRY;
    return () => {
      delete window.__jenkinsComponents;
    };
  }, []);

  return (
    <Layout>
      {/* Header behavioral component — manages scroll effects, breadcrumb
          overflow computation, resize handling, and touch device adaptations
          on the Jenkins page header. Returns null or a portal for the
          overflow dropdown. Replaces src/main/js/components/header/index.js. */}
      <Header />

      {/* CommandPalette — Ctrl+K/Cmd+K keyboard-activated search overlay.
          Self-contained: returns null when trigger button is absent from DOM.
          Replaces CommandPalette.init() (app.js line 12). */}
      <CommandPalette />

      {/* Notifications — global toast notification system. Registers
          window.notificationBar for backward plugin compatibility.
          Replaces Notifications.init() (app.js line 14). */}
      <Notifications />

      {/* TooltipManager — MutationObserver-based DOM observer that attaches
          tooltip behavior to [tooltip] and [data-html-tooltip] attributes
          on both React-rendered and Jelly-rendered elements.
          Replaces Tooltips.init() (app.js line 16). */}
      <TooltipManager />
    </Layout>
  );
}

export default App;
