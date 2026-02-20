/**
 * SetupWizard — Master Orchestrator Component
 *
 * Replaces `src/main/js/pluginSetupWizardGui.js` (1454 lines) — the main
 * wizard controller that used jQuery + Handlebars + Bootstrap to orchestrate
 * the Jenkins first-run setup wizard.
 *
 * This component manages wizard step transitions via a 12-state finite state
 * machine (`WizardStep`) and renders the appropriate child panel for each
 * step. The initialization flow, state handlers, error handling, and action
 * callbacks are all ported from the source with functional symmetry.
 *
 * ## Architecture
 *
 * ```
 * SetupWizard (orchestrator — this file)
 *   ├── WelcomePanel            (welcome step)
 *   ├── PluginSelectionPanel    (custom plugin selection)
 *   ├── ProgressPanel           (installation progress — manages own polling)
 *   ├── FirstUserPanel          (first admin user creation)
 *   ├── ConfigureInstancePanel  (instance URL configuration)
 *   ├── ProxyConfigPanel        (proxy settings)
 *   ├── SetupCompletePanel      (completion)
 *   ├── Spinner                 (loading / restart-wait states)
 *   └── Inline panels           (error, offline, incomplete-install, success)
 * ```
 *
 * ## CSRF Crumb Contract (NON-NEGOTIABLE)
 *
 * After `saveFirstUser` and `saveConfigureInstance` mutations succeed, the
 * CSRF crumb MUST be refreshed via `window.crumb.init()`. The child panels
 * and security hooks handle this internally, but the orchestrator also
 * maintains awareness via `useCrumb().updateCrumb()` for safety.
 *
 * ## Bootstrap 3 CSS Scoping
 *
 * The outermost wrapper MUST carry the `.bootstrap-3` class so that the
 * scoped Bootstrap 3.4.1 styles from `src/main/scss/_bootstrap.scss` apply
 * correctly to the modal structure.
 *
 * Source reference: src/main/js/pluginSetupWizardGui.js (1454 lines)
 * Template shell: src/main/js/templates/pluginSetupWizard.hbs
 *
 * @module pages/setup-wizard/SetupWizard
 */

import { useState, useEffect, useCallback, useMemo } from "react";

// Child panel components
import WelcomePanel from "@/pages/setup-wizard/WelcomePanel";
import PluginSelectionPanel from "@/pages/setup-wizard/PluginSelectionPanel";
import ProgressPanel from "@/pages/setup-wizard/ProgressPanel";
import FirstUserPanel from "@/pages/setup-wizard/FirstUserPanel";
import ConfigureInstancePanel from "@/pages/setup-wizard/ConfigureInstancePanel";
import ProxyConfigPanel from "@/pages/setup-wizard/ProxyConfigPanel";
import SetupCompletePanel from "@/pages/setup-wizard/SetupCompletePanel";

// API hooks
import {
  usePluginList,
  usePluginInstall,
  useInstallStatus,
  useRestartStatus,
  useCompleteInstall,
  useRestartJenkins,
  useIncompleteInstallStatus,
  useInstallPluginsDone,
  initPluginData,
} from "@/api/pluginManager";
// Security mutation hooks are used internally by child panels (FirstUserPanel,
// ConfigureInstancePanel, ProxyConfigPanel). The orchestrator receives success/error
// callbacks rather than managing mutations directly.

// Hooks
import { useCrumb } from "@/hooks/useCrumb";
import { useI18n } from "@/hooks/useI18n";
import { useJenkinsNavigation } from "@/hooks/useJenkinsNavigation";

// Layout components
import Spinner from "@/layout/Spinner";

// Providers
import { useJenkinsConfig } from "@/providers/JenkinsConfigProvider";

// Types
import type {
  PluginInstallStatusEntry,
  PluginCategory,
  PluginInfo,
  ConnectionStatusData,
  PluginData,
} from "@/api/types";

// =============================================================================
// Exported Types
// =============================================================================

/**
 * Represents the 12 possible states of the setup wizard finite state machine.
 *
 * Maps to the source `stateHandlers` (lines 503-524) plus additional panel
 * states for error, offline, incomplete-install, loading, and install-success.
 *
 * State transitions:
 * ```
 * loading → (connectivity check)
 *   ├── offline (if no connectivity)
 *   └── (check install status)
 *       ├── incomplete-install (if previous run left pending plugins)
 *       ├── installing (if INITIAL_PLUGINS_INSTALLING)
 *       ├── first-user (if CREATE_ADMIN_USER)
 *       ├── configure-instance (if CONFIGURE_INSTANCE)
 *       ├── setup-complete (if RUNNING or INITIAL_SETUP_COMPLETED)
 *       └── welcome (if DEFAULT or no state)
 *           ├── installing → install-success → first-user → configure-instance → setup-complete
 *           └── plugin-selection → installing → ...
 * ```
 */
export type WizardStep =
  | "loading"
  | "welcome"
  | "plugin-selection"
  | "installing"
  | "install-success"
  | "first-user"
  | "configure-instance"
  | "proxy-config"
  | "setup-complete"
  | "error"
  | "offline"
  | "incomplete-install";

// =============================================================================
// Internal Constants
// =============================================================================

/**
 * Polling interval for checking Jenkins restart status.
 * Source: pluginSetupWizardGui.js lines 1190-1216 — implicit ~1s polling.
 */
const RESTART_POLL_INTERVAL_MS = 1000;

// =============================================================================
// Component
// =============================================================================

/**
 * Setup Wizard orchestrator component.
 *
 * Manages the full Jenkins first-run setup wizard lifecycle:
 * 1. Loads translations and tests connectivity
 * 2. Initialises plugin data from `/setupWizard/platformPluginList`
 * 3. Routes to the appropriate wizard step based on install status
 * 4. Orchestrates transitions between 12 wizard states
 * 5. Delegates rendering to child panel components
 *
 * Replaces `pluginSetupWizardGui.js` lines 1-1454.
 */
export default function SetupWizard(): React.JSX.Element {
  // ---------------------------------------------------------------------------
  // Hooks — Context & Navigation
  // ---------------------------------------------------------------------------

  const { baseUrl } = useJenkinsConfig();
  const { navigate } = useJenkinsNavigation();
  const { updateCrumb } = useCrumb();
  const { loadBundle } = useI18n();

  // ---------------------------------------------------------------------------
  // Wizard State Machine
  // ---------------------------------------------------------------------------

  /** Current wizard step — drives conditional panel rendering. */
  const [currentStep, setCurrentStep] = useState<WizardStep>("loading");

  /** Error message displayed in the error panel. */
  const [errorMessage, setErrorMessage] = useState<string>("");

  /** Plugin names the user has selected for installation. */
  const [selectedPluginNames, setSelectedPluginNames] = useState<string[]>([]);

  /**
   * List of plugins currently being installed with their live status.
   * Populated when installation begins and updated by ProgressPanel polling.
   */
  const [installingPlugins, setInstallingPlugins] = useState<
    PluginInstallStatusEntry[]
  >([]);

  /** Names of plugins that failed during the most recent installation attempt. */
  const [failedPluginNames, setFailedPluginNames] = useState<string[]>([]);

  /** Loaded translations dictionary keyed by `installWizard_*` keys. */
  const [translations, setTranslations] = useState<Record<string, string>>({});

  /** Correlation ID from the plugin install mutation for install status tracking. */
  const [correlationId, setCorrelationId] = useState<string | undefined>(
    undefined,
  );

  /** Processed plugin data from `initPluginData()`. */
  const [pluginData, setPluginData] = useState<PluginData | null>(null);

  /** Plugin categories from the platform plugin list. */
  const [categories, setCategories] = useState<PluginCategory[]>([]);

  /** Plugins from an incomplete previous installation. */
  const [incompletePlugins, setIncompletePlugins] = useState<
    PluginInstallStatusEntry[]
  >([]);

  /** Message to pass to ConfigureInstancePanel (e.g., URL suggestion). */
  const [configureMessage, setConfigureMessage] = useState<string>("");

  /** Whether the initialization sequence has been triggered. */
  const [initStarted, setInitStarted] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // React Query Hooks — Queries
  // ---------------------------------------------------------------------------

  /**
   * Fetch the platform plugin list. Auto-fetches on mount.
   * Source: pluginManager.init() → pluginManager.loadPluginData()
   */
  const pluginListQuery = usePluginList();

  /**
   * Poll install status. Only enabled when we have a correlationId and the
   * wizard is not in an error/offline state. ProgressPanel manages its own
   * internal polling — this is used only for the initialization routing.
   */
  const installStatusQuery = useInstallStatus(correlationId, {
    enabled: false,
  });

  /**
   * Check for incomplete installation from a previous wizard run.
   * Enabled on demand during initialization.
   */
  const incompleteInstallQuery = useIncompleteInstallStatus(undefined, {
    enabled: false,
  });

  /**
   * Fetch restart status for the completion panel.
   * Source: pluginSetupWizardGui.js — used in setupCompletePanel rendering.
   */
  const restartStatusQuery = useRestartStatus();

  // ---------------------------------------------------------------------------
  // React Query Hooks — Mutations
  // ---------------------------------------------------------------------------

  const pluginInstallMutation = usePluginInstall();
  const completeInstallMutation = useCompleteInstall();
  const restartJenkinsMutation = useRestartJenkins();
  const installPluginsDoneMutation = useInstallPluginsDone();

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  /**
   * Categorized plugins map: flattens categories into a Record<pluginName, PluginInfo>
   * for quick lookup during selection.
   */
  const availablePluginsMap = useMemo<Record<string, PluginInfo>>(() => {
    if (!categories.length) return {};
    const map: Record<string, PluginInfo> = {};
    for (const cat of categories) {
      for (const plugin of cat.plugins) {
        map[plugin.name] = plugin;
      }
    }
    return map;
  }, [categories]);

  /**
   * Ordered list of category name strings for PluginSelectionPanel.
   * Extracted from PluginCategory[] for the `categories: string[]` prop.
   */
  const categoryNames = useMemo<string[]>(() => {
    return categories.map((cat) => cat.category);
  }, [categories]);

  /**
   * Categorised plugins map: transforms PluginCategory[] into
   * Record<string, CategorizedPlugin[]> for PluginSelectionPanel.
   * Each value entry pairs a category name with its plugin info object.
   */
  const categorizedPluginsMap = useMemo<
    Record<string, Array<{ category: string; plugin: PluginInfo }>>
  >(() => {
    const map: Record<
      string,
      Array<{ category: string; plugin: PluginInfo }>
    > = {};
    for (const cat of categories) {
      map[cat.category] = cat.plugins.map((plugin) => ({
        category: cat.category,
        plugin,
      }));
    }
    return map;
  }, [categories]);

  /**
   * All plugin names from the current data set.
   */
  const allPluginNames = useMemo<string[]>(() => {
    return pluginData?.names ?? [];
  }, [pluginData]);

  /**
   * Jenkins version string from the document body dataset.
   * Source: pluginSetupWizardGui.js lines 206-216.
   */
  const jenkinsVersion = useMemo<string>(() => {
    return document.body?.dataset?.version ?? "";
  }, []);

  /**
   * Restart status derived from the query response.
   */
  const restartRequired = useMemo<boolean>(() => {
    return restartStatusQuery.data?.restartRequired ?? false;
  }, [restartStatusQuery.data]);

  const restartSupported = useMemo<boolean>(() => {
    return restartStatusQuery.data?.restartSupported ?? false;
  }, [restartStatusQuery.data]);

  // ---------------------------------------------------------------------------
  // Helper: Generic Error Handler
  // ---------------------------------------------------------------------------

  /**
   * Handles API errors by setting the error message and transitioning to the
   * error step. Replicates `handleGenericError()` from source lines 128-147.
   *
   * @param err - The error string or Error object
   */
  const handleError = useCallback(
    (err: string | Error): void => {
      const message =
        typeof err === "string" ? err : err.message || String(err);
      if (!message || message === "timeout") {
        setErrorMessage(
          translations["installWizard_error_connection"] ??
            "An error occurred while communicating with the server.",
        );
      } else {
        const prefix =
          translations["installWizard_error_message"] ?? "Error: ";
        setErrorMessage(prefix + message);
      }
      setCurrentStep("error");
    },
    [translations],
  );

  // ---------------------------------------------------------------------------
  // Helper: State Router
  // ---------------------------------------------------------------------------

  /**
   * Routes to the appropriate wizard step based on the Stapler install state.
   * Replicates `showStatePanel()` and `stateHandlers` from source lines 488-539.
   *
   * @param state - The install state string from the Stapler response.
   */
  const showStatePanel = useCallback(
    (state?: string): void => {
      switch (state) {
        case "DEFAULT":
          setCurrentStep("welcome");
          break;
        case "CREATE_ADMIN_USER":
          setCurrentStep("first-user");
          break;
        case "CONFIGURE_INSTANCE":
          setCurrentStep("configure-instance");
          break;
        case "RUNNING":
        case "INITIAL_SETUP_COMPLETED":
          setCurrentStep("setup-complete");
          break;
        case "INITIAL_PLUGINS_INSTALLING":
          setCurrentStep("installing");
          break;
        default:
          setCurrentStep("welcome");
          break;
      }
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Helper: Connectivity Test
  // ---------------------------------------------------------------------------

  /**
   * Tests connectivity to the default update site.
   * Replicates source lines 1322-1335.
   *
   * @returns `true` if update site or internet is reachable, `false` otherwise.
   */
  const testConnectivity = useCallback(async (): Promise<boolean> => {
    try {
      const crumbField =
        document.head?.dataset?.crumbname ?? "Jenkins-Crumb";
      const crumbValue = document.head?.dataset?.crumbvalue ?? "";

      const response = await fetch(
        (baseUrl ?? "") +
          "/updateCenter/connectionStatus?siteId=default",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [crumbField]: crumbValue,
          },
          body: "{}",
        },
      );

      if (!response.ok) return false;

      const data: { data?: ConnectionStatusData } = await response.json();
      const connStatus = data.data;
      if (!connStatus) return false;

      // Source lines 1326-1333: check if either updatesite or internet is OK
      const updatesiteOk = connStatus.updatesite === "OK";
      const internetOk =
        connStatus.internet === "OK" || connStatus.internet === "SKIPPED";

      return updatesiteOk || internetOk;
    } catch {
      return false;
    }
  }, [baseUrl]);

  // ---------------------------------------------------------------------------
  // Helper: Install Plugins
  // ---------------------------------------------------------------------------

  /**
   * Triggers plugin installation and transitions to the installing step.
   * Replicates source `installPlugins()` at lines 413-431.
   *
   * @param pluginNames - Array of plugin short names to install.
   */
  const installPlugins = useCallback(
    async (pluginNames: string[]): Promise<void> => {
      try {
        // Build the installing plugins list with initial "pending" status
        const pluginsToInstall: PluginInstallStatusEntry[] = pluginNames.map(
          (name) => ({
            name,
            title: availablePluginsMap[name]?.title ?? name,
            installStatus: "pending",
          }),
        );
        setInstallingPlugins(pluginsToInstall);
        setFailedPluginNames([]);
        setSelectedPluginNames(pluginNames);

        // Trigger the install mutation — returns correlationId
        const newCorrelationId =
          await pluginInstallMutation.mutateAsync({
            plugins: pluginNames,
          });
        setCorrelationId(newCorrelationId);

        // Transition to installing step
        setCurrentStep("installing");
      } catch (err) {
        handleError(
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    },
    [availablePluginsMap, pluginInstallMutation, handleError],
  );

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------

  /**
   * Install recommended (suggested) plugins.
   * Source: lines 451-455 — `installDefaultPlugins`.
   */
  const handleInstallRecommended = useCallback(async (): Promise<void> => {
    if (!pluginData) {
      handleError("Plugin data not loaded.");
      return;
    }
    await installPlugins(pluginData.recommendedPlugins);
  }, [pluginData, installPlugins, handleError]);

  /**
   * Show custom plugin selection panel.
   * Source: lines 754-762 — `loadCustomPluginPanel`.
   */
  const handleInstallCustom = useCallback((): void => {
    if (!pluginData) {
      handleError("Plugin data not loaded.");
      return;
    }
    // Pre-select recommended plugins for the selection panel
    setSelectedPluginNames([...pluginData.recommendedPlugins]);
    setCurrentStep("plugin-selection");
  }, [pluginData, handleError]);

  /**
   * Install user-selected plugins from the selection panel.
   * Source: lines 1247-1249.
   */
  const handleInstallSelected = useCallback(async (): Promise<void> => {
    await installPlugins(selectedPluginNames);
  }, [selectedPluginNames, installPlugins]);

  /**
   * Handle plugin selection changes from PluginSelectionPanel.
   */
  const handleSelectionChange = useCallback(
    (newSelection: string[]): void => {
      setSelectedPluginNames(newSelection);
    },
    [],
  );

  /**
   * Handle installation completion from ProgressPanel.
   * Routes to the appropriate next step based on the install state.
   * Source: lines 542-697 — completion logic within showInstallProgress.
   *
   * @param state - The final installation state from the Stapler response.
   */
  const handleInstallComplete = useCallback(
    (state: string): void => {
      showStatePanel(state);
    },
    [showStatePanel],
  );

  /**
   * Handle installation error from ProgressPanel.
   */
  const handleInstallError = useCallback(
    (errMsg: string): void => {
      handleError(errMsg);
    },
    [handleError],
  );

  /**
   * Retry only the failed plugins.
   * Source: lines 1157-1161.
   */
  const handleRetryFailedPlugins = useCallback(async (): Promise<void> => {
    if (failedPluginNames.length === 0) return;
    await installPlugins(failedPluginNames);
  }, [failedPluginNames, installPlugins]);

  /**
   * Continue past plugin installation failures.
   * Source: lines 1164-1173 — calls installPluginsDone then showStatePanel.
   */
  const handleContinueWithFailed = useCallback(async (): Promise<void> => {
    try {
      await installPluginsDoneMutation.mutateAsync();
      // Fetch current state and route to it
      const statusResponse = await installStatusQuery.refetch();
      const state = statusResponse.data?.state;
      showStatePanel(state);
    } catch (err) {
      handleError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [installPluginsDoneMutation, installStatusQuery, showStatePanel, handleError]);

  /**
   * Handle first user save success. Transitions to configure-instance step.
   * Source: lines 1007-1035.
   *
   * CRITICAL: CSRF crumb is refreshed by the security hook internally.
   * The orchestrator also calls updateCrumb() for belt-and-suspenders safety.
   */
  const handleSaveFirstUser = useCallback((): void => {
    // Crumb refresh is handled internally by useSaveFirstUser hook.
    // Sync our local crumb awareness.
    try {
      const crumbField =
        document.head?.dataset?.crumbname ?? "Jenkins-Crumb";
      const crumbValue = document.head?.dataset?.crumbvalue ?? "";
      if (crumbField && crumbValue) {
        updateCrumb(crumbField, crumbValue);
      }
    } catch {
      // Non-critical — crumb was already refreshed by the mutation hook
    }
    setCurrentStep("configure-instance");
  }, [updateCrumb]);

  /**
   * Handle first user skip. Checks for instance URL and transitions.
   * Source: lines 1050-1073.
   */
  const handleSkipFirstUser = useCallback(async (): Promise<void> => {
    try {
      // Fetch the Jenkins root URL to auto-populate the configure-instance panel
      // Source lines 1055-1073: GET /api/json?tree=url
      const response = await fetch(
        (baseUrl ?? "") + "/api/json?tree=url",
        {
          headers: {
            Accept: "application/json",
          },
        },
      );
      if (response.ok) {
        const data: { url?: string } = await response.json();
        if (data.url) {
          setConfigureMessage(data.url);
        }
      }
    } catch {
      // Non-critical — just proceed without pre-populated URL
    }
    setCurrentStep("configure-instance");
  }, [baseUrl]);

  /**
   * Handle first user error. FirstUserPanel calls this on save failure.
   */
  const handleFirstUserError = useCallback(
    (errMsg: string): void => {
      handleError(errMsg);
    },
    [handleError],
  );

  /**
   * Handle configure instance save success.
   * Source: lines 1112-1122.
   *
   * CRITICAL: CSRF crumb is refreshed by the security hook internally.
   */
  const handleSaveConfigureInstance = useCallback((): void => {
    // Crumb refresh is handled internally by useSaveConfigureInstance hook
    try {
      const crumbField =
        document.head?.dataset?.crumbname ?? "Jenkins-Crumb";
      const crumbValue = document.head?.dataset?.crumbvalue ?? "";
      if (crumbField && crumbValue) {
        updateCrumb(crumbField, crumbValue);
      }
    } catch {
      // Non-critical
    }
    setCurrentStep("setup-complete");
  }, [updateCrumb]);

  /**
   * Handle configure instance skip.
   * Source: lines 1129-1139.
   */
  const handleSkipConfigureInstance = useCallback((): void => {
    setCurrentStep("setup-complete");
  }, []);

  /**
   * Handle configure instance error.
   */
  const handleConfigureInstanceError = useCallback(
    (errMsg: string): void => {
      handleError(errMsg);
    },
    [handleError],
  );

  /**
   * Handle proxy save — navigates to root page.
   * Source: lines 1147-1154.
   */
  const handleSaveProxy = useCallback((): void => {
    navigate("/");
  }, [navigate]);

  /**
   * Handle "go back" from proxy panel — returns to offline panel.
   * Source: lines 1244-1246 — shows previous state panel.
   */
  const handleGoBackFromProxy = useCallback((): void => {
    setCurrentStep("offline");
  }, []);

  /**
   * Finish installation — complete install and navigate to dashboard.
   * Source: lines 700-702, 1219-1225.
   */
  const handleFinishInstallation = useCallback(async (): Promise<void> => {
    try {
      await completeInstallMutation.mutateAsync();
      navigate("/");
    } catch (err) {
      handleError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [completeInstallMutation, navigate, handleError]);

  /**
   * Restart Jenkins — triggers safe restart and polls until server comes back.
   * Source: lines 1190-1216.
   */
  const handleRestartJenkins = useCallback(async (): Promise<void> => {
    try {
      await restartJenkinsMutation.mutateAsync();
      setCurrentStep("loading");

      // Ping loop until Jenkins comes back online
      // Source lines 1197-1216: recursive timeout-based polling
      const pingUntilRestarted = async (): Promise<void> => {
        const pingUrl = (baseUrl ?? "") + "/login";
        let restarted = false;

        while (!restarted) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, RESTART_POLL_INTERVAL_MS),
          );
          try {
            const response = await fetch(pingUrl, {
              method: "HEAD",
              cache: "no-store",
            });
            if (response.ok) {
              restarted = true;
            }
          } catch {
            // Server still restarting — continue polling
          }
        }

        // Server is back — navigate to root
        navigate("/");
      };

      await pingUntilRestarted();
    } catch (err) {
      handleError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [restartJenkinsMutation, baseUrl, navigate, handleError]);

  /**
   * Resume installation of incomplete plugins from a previous wizard run.
   * Source: lines 1176-1187.
   */
  const handleResumeInstallation = useCallback(async (): Promise<void> => {
    if (incompletePlugins.length === 0) return;
    const pluginNames = incompletePlugins.map((p) => p.name);
    await installPlugins(pluginNames);
  }, [incompletePlugins, installPlugins]);

  /**
   * Navigate back from incomplete-install panel to the welcome/state panel.
   * Source: lines 1244-1246.
   */
  const handleGoBack = useCallback((): void => {
    showStatePanel();
  }, [showStatePanel]);

  /**
   * Go back from plugin-selection to welcome panel.
   */
  const handleGoBackFromSelection = useCallback((): void => {
    setCurrentStep("welcome");
  }, []);

  /**
   * Navigate to root — used by start-over and close wizard.
   * Source: line 1228 — navigate to '/'.
   */
  const handleStartOver = useCallback((): void => {
    navigate("/");
  }, [navigate]);

  /**
   * Retry from error state — re-run the initialization sequence.
   * Source: implicit in errorPanel.hbs retry button.
   */
  const handleRetry = useCallback((): void => {
    setErrorMessage("");
    setInitStarted(false);
    setCurrentStep("loading");
  }, []);

  /**
   * Navigate to proxy configuration from offline panel.
   * Source: offlinePanel.hbs — "Configure Proxy" button.
   */
  const handleSetupProxy = useCallback((): void => {
    setCurrentStep("proxy-config");
  }, []);

  /**
   * Skip plugin installs from offline panel.
   * Source: offlinePanel.hbs — "Skip Plugin Installations" button.
   */
  const handleSkipPluginInstalls = useCallback(async (): Promise<void> => {
    try {
      await completeInstallMutation.mutateAsync();
      showStatePanel();
    } catch (err) {
      handleError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [completeInstallMutation, showStatePanel, handleError]);

  /**
   * Close wizard button handler — navigates to root.
   * Source: lines 1266 — skipFirstUserAndConfigureInstance.
   */
  const handleCloseWizard = useCallback((): void => {
    navigate("/");
  }, [navigate]);

  // ---------------------------------------------------------------------------
  // Initialization Effect
  // ---------------------------------------------------------------------------

  /**
   * Main initialization sequence. Runs once on mount.
   *
   * Flow (replicates `showInitialSetupWizard()` from source lines 1320-1435):
   * 1. Load translations
   * 2. Test connectivity to update site
   * 3. If offline → show offline panel
   * 4. If online → initialize plugin data
   * 5. Check install status for in-progress installations
   * 6. Check for incomplete installations from previous runs
   * 7. Route to appropriate initial step
   */
  useEffect(() => {
    if (initStarted) return;

    let cancelled = false;

    const initialize = async (): Promise<void> => {
      setInitStarted(true);

      try {
        // Step 1: Load translations
        // Source: lines 1437-1450
        const bundle = await loadBundle(
          "jenkins.install.pluginSetupWizard",
        );
        if (cancelled) return;
        setTranslations(bundle);

        // Step 2: Test connectivity
        // Source: lines 1322-1335
        const isOnline = await testConnectivity();
        if (cancelled) return;

        if (!isOnline) {
          setCurrentStep("offline");
          return;
        }

        // Step 3: Wait for plugin list to be available
        // The usePluginList hook auto-fetches on mount. We need to wait for it.
        // If it's already loaded, great. If not, we'll process in a separate effect.
        // For now, check if pluginListQuery data is available.
        let pluginCategories = pluginListQuery.data;

        // If not yet loaded, manually refetch and wait
        if (!pluginCategories) {
          const refetchResult = await pluginListQuery.refetch();
          if (cancelled) return;
          pluginCategories = refetchResult.data;
        }

        if (!pluginCategories || pluginCategories.length === 0) {
          handleError(
            translations["installWizard_error_connection"] ??
              "Unable to load plugin data. Please check your connection.",
          );
          return;
        }

        // Step 4: Initialize plugin data
        // Source: lines 1338-1341
        const data = initPluginData(pluginCategories);
        if (cancelled) return;
        setPluginData(data);
        setCategories(pluginCategories);

        // Step 5: Check current install status
        // Source: lines 1345-1373
        const statusResult = await installStatusQuery.refetch();
        if (cancelled) return;
        const installStatus = statusResult.data;

        if (installStatus && installStatus.jobs && installStatus.jobs.length > 0) {
          // There are active/completed installation jobs
          if (installingPlugins.length === 0) {
            // Rebuild installing plugins from the jobs
            // Source: lines 1350-1367
            const jobPlugins: PluginInstallStatusEntry[] =
              installStatus.jobs.map((job) => ({
                name: job.name,
                title: job.title || job.name,
                installStatus: job.installStatus || "pending",
                errorMessage: job.errorMessage,
              }));
            setInstallingPlugins(jobPlugins);

            // Rebuild selected plugin names from jobs
            const jobNames = installStatus.jobs.map((j) => j.name);
            setSelectedPluginNames(jobNames);
          }

          // Show the appropriate panel based on install state
          if (installStatus.state) {
            showStatePanel(installStatus.state);
          } else {
            setCurrentStep("installing");
          }
          return;
        }

        // Step 6: Check for incomplete installations
        // Source: lines 1376-1428
        const incompleteResult = await incompleteInstallQuery.refetch();
        if (cancelled) return;
        const incompleteStatus = incompleteResult.data;

        if (
          incompleteStatus &&
          incompleteStatus.jobs &&
          incompleteStatus.jobs.length > 0
        ) {
          setIncompletePlugins(incompleteStatus.jobs);
          setCurrentStep("incomplete-install");
          return;
        }

        // Step 7: No active or incomplete installations — show welcome
        // Source: line 1426
        showStatePanel();
      } catch (err) {
        if (!cancelled) {
          handleError(
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initStarted]);

  // ---------------------------------------------------------------------------
  // Panel Rendering
  // ---------------------------------------------------------------------------

  /**
   * Renders the appropriate panel based on the current wizard step.
   */
  const renderPanel = (): React.JSX.Element => {
    switch (currentStep) {
      // -----------------------------------------------------------------------
      // Loading — replaces loadingPanel.hbs
      // -----------------------------------------------------------------------
      case "loading":
        return <Spinner text={translations["installWizard_installing"] ?? ""} />;

      // -----------------------------------------------------------------------
      // Welcome — delegates to WelcomePanel
      // -----------------------------------------------------------------------
      case "welcome":
        return (
          <WelcomePanel
            translations={translations}
            onInstallRecommended={handleInstallRecommended}
            onInstallCustom={handleInstallCustom}
          />
        );

      // -----------------------------------------------------------------------
      // Plugin Selection — delegates to PluginSelectionPanel
      // -----------------------------------------------------------------------
      case "plugin-selection":
        return (
          <PluginSelectionPanel
            translations={translations}
            categories={categoryNames}
            categorizedPlugins={categorizedPluginsMap}
            selectedPluginNames={selectedPluginNames}
            allPluginNames={allPluginNames}
            availablePlugins={availablePluginsMap}
            onSelectionChange={handleSelectionChange}
            onInstall={handleInstallSelected}
            onGoBack={handleGoBackFromSelection}
          />
        );

      // -----------------------------------------------------------------------
      // Installing — delegates to ProgressPanel
      // -----------------------------------------------------------------------
      case "installing":
        return (
          <ProgressPanel
            translations={translations}
            installingPlugins={installingPlugins}
            selectedPluginNames={selectedPluginNames}
            onComplete={handleInstallComplete}
            onError={handleInstallError}
            onRetryFailed={handleRetryFailedPlugins}
            onContinueWithFailed={handleContinueWithFailed}
          />
        );

      // -----------------------------------------------------------------------
      // Install Success/Failure — inline (replaces successPanel.hbs)
      // -----------------------------------------------------------------------
      case "install-success":
        return renderInstallSuccessPanel();

      // -----------------------------------------------------------------------
      // First User — delegates to FirstUserPanel
      // -----------------------------------------------------------------------
      case "first-user":
        return (
          <FirstUserPanel
            translations={translations}
            baseUrl={baseUrl ?? ""}
            onSaveSuccess={handleSaveFirstUser}
            onSkip={handleSkipFirstUser}
            onError={handleFirstUserError}
          />
        );

      // -----------------------------------------------------------------------
      // Configure Instance — delegates to ConfigureInstancePanel
      // -----------------------------------------------------------------------
      case "configure-instance":
        return (
          <ConfigureInstancePanel
            translations={translations}
            baseUrl={baseUrl ?? ""}
            message={configureMessage || undefined}
            onSaveSuccess={handleSaveConfigureInstance}
            onSkip={handleSkipConfigureInstance}
            onError={handleConfigureInstanceError}
          />
        );

      // -----------------------------------------------------------------------
      // Proxy Config — delegates to ProxyConfigPanel
      // -----------------------------------------------------------------------
      case "proxy-config":
        return (
          <ProxyConfigPanel
            translations={translations}
            baseUrl={baseUrl ?? ""}
            onGoBack={handleGoBackFromProxy}
            onSave={handleSaveProxy}
          />
        );

      // -----------------------------------------------------------------------
      // Setup Complete — delegates to SetupCompletePanel
      // -----------------------------------------------------------------------
      case "setup-complete":
        return (
          <SetupCompletePanel
            translations={translations}
            restartRequired={restartRequired}
            restartSupported={restartSupported}
            message=""
            onFinish={handleFinishInstallation}
            onRestart={handleRestartJenkins}
          />
        );

      // -----------------------------------------------------------------------
      // Error — inline (replaces errorPanel.hbs)
      // -----------------------------------------------------------------------
      case "error":
        return renderErrorPanel();

      // -----------------------------------------------------------------------
      // Offline — inline (replaces offlinePanel.hbs)
      // -----------------------------------------------------------------------
      case "offline":
        return renderOfflinePanel();

      // -----------------------------------------------------------------------
      // Incomplete Install — inline (replaces incompleteInstallationPanel.hbs)
      // -----------------------------------------------------------------------
      case "incomplete-install":
        return renderIncompleteInstallPanel();

      default:
        return <Spinner />;
    }
  };

  // ---------------------------------------------------------------------------
  // Inline Panel Renderers
  // ---------------------------------------------------------------------------

  /**
   * Renders the error panel inline.
   * Source: errorPanel.hbs — title, alert-danger with errorMessage, retry button.
   */
  const renderErrorPanel = (): React.JSX.Element => {
    return (
      <>
        <div className="modal-header">
          <h1>
            {translations["installWizard_error_title"] ?? "Error"}
          </h1>
        </div>
        <div className="modal-body">
          <h3>
            {translations["installWizard_error_header"] ??
              "An error occurred during installation:"}
          </h3>
          <div className="alert alert-danger" role="alert">
            {errorMessage}
          </div>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-default"
            onClick={handleStartOver}
          >
            {translations["installWizard_error_startOver"] ?? "Start Over"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRetry}
          >
            {translations["installWizard_error_retry"] ?? "Retry"}
          </button>
        </div>
      </>
    );
  };

  /**
   * Renders the offline panel inline.
   * Source: offlinePanel.hbs — message with HTML support, proxy config and skip buttons.
   */
  const renderOfflinePanel = (): React.JSX.Element => {
    const offlineMessage =
      translations["installWizard_offline_message"] ??
      "This Jenkins instance appears to be offline. Please configure proxy settings or skip plugin installation.";

    return (
      <>
        <div className="modal-header">
          <h1>
            {translations["installWizard_offline_title"] ?? "Offline"}
          </h1>
        </div>
        <div className="modal-body">
          {/* Source: offlinePanel.hbs uses triple-mustache {{{message}}} for HTML content */}
          <div
            dangerouslySetInnerHTML={{ __html: offlineMessage }}
          />
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-default"
            onClick={handleSetupProxy}
          >
            {translations["installWizard_offline_configureProxy"] ??
              "Configure Proxy"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSkipPluginInstalls}
          >
            {translations["installWizard_offline_skipPluginInstalls"] ??
              "Skip Plugin Installations"}
          </button>
        </div>
      </>
    );
  };

  /**
   * Renders the incomplete installation panel inline.
   * Source: incompleteInstallationPanel.hbs — title, message, plugin status list,
   * go-back and resume buttons.
   */
  const renderIncompleteInstallPanel = (): React.JSX.Element => {
    return (
      <>
        <div className="modal-header">
          <h1>
            {translations["installWizard_incompleteInstall_title"] ??
              "Resume Installation"}
          </h1>
        </div>
        <div className="modal-body">
          <p>
            {translations["installWizard_incompleteInstall_message"] ??
              "It appears that a previous installation did not complete. Would you like to resume?"}
          </p>
          {incompletePlugins.length > 0 && (
            <ul className="plugin-list">
              {incompletePlugins.map((plugin) => (
                <li
                  key={plugin.name}
                  className={`plugin-status-${plugin.installStatus}`}
                >
                  <span className="plugin-name">
                    {plugin.title || plugin.name}
                  </span>
                  {plugin.errorMessage && (
                    <span className="plugin-error">
                      {" "}
                      — {plugin.errorMessage}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-default"
            onClick={handleGoBack}
          >
            {translations["installWizard_goBack"] ?? "Go back"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleResumeInstallation}
          >
            {translations["installWizard_incompleteInstall_resume"] ??
              "Resume"}
          </button>
        </div>
      </>
    );
  };

  /**
   * Renders the install success/failure panel inline.
   * Source: successPanel.hbs — conditional rendering based on failed plugins.
   */
  const renderInstallSuccessPanel = (): React.JSX.Element => {
    const hasFailures = failedPluginNames.length > 0;

    return (
      <>
        <div className="modal-header">
          <h1>
            {hasFailures
              ? translations["installWizard_installComplete_title_failures"] ??
                "Installation Complete (with errors)"
              : translations["installWizard_installComplete_title"] ??
                "Installation Complete"}
          </h1>
        </div>
        <div className="modal-body">
          {hasFailures ? (
            <>
              <p>
                {translations["installWizard_installComplete_failedPlugins"] ??
                  "The following plugins failed to install:"}
              </p>
              <ul className="failed-plugins">
                {failedPluginNames.map((name) => (
                  <li key={name}>
                    {availablePluginsMap[name]?.title ?? name}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              {translations["installWizard_installComplete_message"] ??
                "All plugins have been installed successfully."}
            </p>
          )}
        </div>
        <div className="modal-footer">
          {hasFailures ? (
            <>
              <button
                type="button"
                className="btn btn-default"
                onClick={handleRetryFailedPlugins}
              >
                {translations["installWizard_installComplete_retry"] ??
                  "Retry"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleContinueWithFailed}
              >
                {translations["installWizard_installComplete_continue"] ??
                  "Continue"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleContinueWithFailed}
            >
              {translations["installWizard_installComplete_continue"] ??
                "Continue"}
            </button>
          )}
        </div>
      </>
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  /**
   * Main render output.
   *
   * Preserves the Bootstrap 3 modal shell structure from pluginSetupWizard.hbs:
   * `.plugin-setup-wizard.bootstrap-3` > `.modal.fade.in` > `.modal-dialog` > `.modal-content`
   *
   * The `.bootstrap-3` class is CRITICAL — it scopes the Bootstrap 3.4.1 styles
   * from `src/main/scss/_bootstrap.scss` to this modal's DOM subtree.
   */
  return (
    <div className="plugin-setup-wizard bootstrap-3">
      <div className="modal fade in" style={{ display: "block" }}>
        <div className="modal-dialog">
          <div className="modal-content">
            {/* Close button — visible only on welcome panel (source lines 301-306:
                close button prepended to .modal-header.closeable). The welcomePanel.hbs
                line 1 marks its header as .closeable. Click triggers navigate to "/". */}
            {currentStep === "welcome" && (
              <button
                type="button"
                className="close"
                aria-label="Close"
                onClick={handleCloseWizard}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            )}
            {renderPanel()}
          </div>
          {/* Jenkins Version Footer — source lines 309-324 */}
          {jenkinsVersion && (
            <div className="jenkins-version">
              {translations["installWizard_jenkinsVersionTitle"] ??
                "Jenkins"}{" "}
              {jenkinsVersion}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
