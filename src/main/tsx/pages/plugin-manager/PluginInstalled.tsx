/**
 * PluginInstalled — Installed Plugins List Page Component
 *
 * Replaces the following Jelly/JS sources:
 * - `core/src/main/resources/hudson/PluginManager/installed.jelly` (315 lines)
 * - `core/src/main/resources/hudson/PluginManager/_installed.js` (53 lines)
 * - `core/src/main/resources/hudson/PluginManager/_table.js` (544 lines)
 *
 * This React component renders the installed plugins table with:
 * - Sortable columns (Name, Health, Enabled, Version)
 * - Enable/disable toggle switches with CSRF crumb-protected POST requests
 * - Dependency-aware enable/disable/uninstall safeguards
 * - Hover-delayed (1s) dependency information rows
 * - Uninstall confirmation dialog (destructive type)
 * - Downgrade buttons for downgradable plugins
 * - Filter/search with multi-word case-insensitive matching
 * - Restart-needed banner with original-vs-current state tracking
 * - Failed plugins display section
 * - Read-only mode for non-admin users
 * - Health score badges (conditional column)
 * - Security warnings, deprecation notices, and adopt-this-plugin indicators
 *
 * @module pages/plugin-manager/PluginInstalled
 */

import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";

import { useStaplerQuery } from "@/hooks/useStaplerQuery";
import { useStaplerMutation } from "@/hooks/useStaplerMutation";
import { useCrumb } from "@/hooks/useCrumb";
import { useI18n } from "@/hooks/useI18n";
import { useJenkinsNavigation } from "@/hooks/useJenkinsNavigation";
import { showDialog } from "@/components/dialogs/Dialog";
import type { StaplerResponse } from "@/api/types";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Represents a single installed plugin's metadata as returned by the
 * Stapler REST API at `/pluginManager/api/json?depth=2`.
 *
 * Maps to the plugin object iterated in installed.jelly line 96:
 * `<j:forEach var="p" items="${app.pluginManager.pluginsSortedByTitle}">`
 */
export interface InstalledPlugin {
  /** Unique plugin identifier (e.g., "git", "pipeline-stage-view") */
  shortName: string;
  /** Human-readable plugin name displayed in the table */
  displayName: string;
  /** Currently installed version string */
  version: string;
  /** URL to the plugin's wiki or homepage */
  url: string;
  /** Whether the plugin is currently enabled */
  enabled: boolean;
  /** Whether the plugin is currently active (loaded and running) */
  active: boolean;
  /** Whether the plugin has been marked for deletion (uninstall pending restart) */
  deleted: boolean;
  /** Whether the plugin can be downgraded to a previous version */
  downgradable: boolean;
  /** The version to downgrade to, if downgradable */
  backupVersion?: string;
  /** Whether the plugin has mandatory dependents that prevent disabling */
  hasMandatoryDependents: boolean;
  /** Whether the plugin has mandatory dependencies that must be satisfied */
  hasMandatoryDependencies: boolean;
  /** Whether the plugin has implied dependents from detached plugin relationships */
  hasImpliedDependents: boolean;
  /** List of plugins this plugin depends on (mandatory dependencies) */
  mandatoryDependencies: { shortName: string }[];
  /** List of plugin shortNames that depend on this plugin (mandatory dependents) */
  mandatoryDependents: string[];
  /** List of plugin shortNames that may implicitly depend on this plugin */
  impliedDependents: string[];
  /** Health score number (0-100), undefined if not available */
  healthScore?: number;
  /** CSS class for health score display (e.g., "icon-health-80plus") */
  healthScoreClass?: string;
  /** Active security warnings for this plugin */
  activeWarnings: { url: string; message: string }[];
  /** Whether this plugin is deprecated */
  deprecated: boolean;
  /** Deprecation details with URLs to replacement info */
  deprecations?: { url: string }[];
  /** URL for reporting issues with this plugin */
  issueTrackerReportUrl?: string;
  /** Brief description or excerpt of plugin functionality */
  excerpt?: string;
  /** Information about available updates */
  updateInfo?: { displayName?: string };
}

/**
 * Props for the PluginInstalled component.
 *
 * These are typically passed from the parent PluginManagerIndex component
 * or extracted from Jelly shell data attributes.
 */
export interface PluginInstalledProps {
  /** When true, user lacks ADMINISTER permission — disables toggle and uninstall controls.
   *  Mirrors installed.jelly line 31: `readOnlyMode` variable */
  readOnlyMode?: boolean;
  /** Whether a restart is already required from a prior operation.
   *  Mirrors installed.jelly line 54: `data-is-restart-required` attribute */
  isRestartRequired?: boolean;
  /** Whether the current user can trigger a safe restart.
   *  Controls visibility of the "Restart Once No Jobs Are Running" button */
  canRestart?: boolean;
  /** Whether health scores are available from the update center.
   *  Mirrors installed.jelly line 172: `app.updateCenter.healthScoresAvailable` */
  healthScoresAvailable?: boolean;
}

// =============================================================================
// Internal Types
// =============================================================================

/** API response structure for installed plugins endpoint */
interface PluginManagerApiResponse {
  plugins: InstalledPlugin[];
  failedPlugins?: FailedPlugin[];
}

/** A plugin that failed to load */
interface FailedPlugin {
  name: string;
  cause: string;
}

/** Sort column identifiers */
type SortColumn = "name" | "enabled" | "health";

/** Sort direction */
type SortDirection = "asc" | "desc";

/** Dependency info row display state */
interface DependencyInfoState {
  pluginId: string;
  type: "enable" | "uninstall";
}

// =============================================================================
// Constants
// =============================================================================

/** Delay in milliseconds before showing dependency info on hover.
 *  Mirrors _table.js lines 409-429: 1-second delay timeout */
const HOVER_INFO_DELAY_MS = 1000;

// =============================================================================
// Dependency Graph Utilities
// =============================================================================

/**
 * Builds a bi-directional dependency graph from installed plugin data.
 *
 * Replaces the imperative DOM-based dependency tracking from _table.js
 * lines 99-106 (`plugins` map) and lines 366-389 (`jenkinsPluginMetadata`).
 *
 * @param plugins - Array of installed plugin objects from API
 * @returns Maps for dependency and dependent lookups
 */
function buildDependencyGraph(plugins: InstalledPlugin[]): {
  dependencyMap: Map<string, string[]>;
  dependentMap: Map<string, string[]>;
} {
  const dependencyMap = new Map<string, string[]>();
  const dependentMap = new Map<string, string[]>();

  const pluginSet = new Set(plugins.map((p) => p.shortName));

  for (const plugin of plugins) {
    // Build dependency list (plugins this plugin depends on)
    const deps = (plugin.mandatoryDependencies || [])
      .map((d) => d.shortName)
      .filter((name) => pluginSet.has(name));
    dependencyMap.set(plugin.shortName, deps);

    // Build dependent list (plugins that depend on this plugin)
    const dependents = [
      ...(plugin.mandatoryDependents || []),
      ...(plugin.impliedDependents || []),
    ].filter((name) => pluginSet.has(name));
    dependentMap.set(plugin.shortName, dependents);
  }

  return { dependencyMap, dependentMap };
}

/**
 * Checks whether a plugin can be enabled.
 *
 * A plugin cannot be enabled if any of its mandatory dependencies are disabled.
 * Mirrors _table.js lines 173-192: `markHasDisabledDependencies()`.
 *
 * @param pluginId - shortName of the plugin to check
 * @param dependencyMap - Map of plugin → its dependencies
 * @param enabledState - Current enabled state of all plugins
 * @returns Object with canEnable flag and list of disabled dependencies
 */
function checkCanEnable(
  pluginId: string,
  dependencyMap: Map<string, string[]>,
  enabledState: Record<string, boolean>,
): { canEnable: boolean; disabledDependencies: string[] } {
  const deps = dependencyMap.get(pluginId) || [];
  const disabledDeps = deps.filter((depId) => !enabledState[depId]);
  return {
    canEnable: disabledDeps.length === 0,
    disabledDependencies: disabledDeps,
  };
}

/**
 * Checks whether a plugin can be disabled.
 *
 * A plugin cannot be disabled if it has enabled dependents (unless
 * all dependents are disabled or the only dependent is jenkins-core).
 * Mirrors _table.js lines 133-171: `markAllDependentsDisabled()`.
 *
 * @param pluginId - shortName of the plugin to check
 * @param dependentMap - Map of plugin → plugins that depend on it
 * @param enabledState - Current enabled state of all plugins
 * @returns Object with canDisable flag and list of enabled dependents
 */
function checkCanDisable(
  pluginId: string,
  dependentMap: Map<string, string[]>,
  enabledState: Record<string, boolean>,
): { canDisable: boolean; enabledDependents: string[] } {
  const dependents = dependentMap.get(pluginId) || [];
  // Filter out jenkins-core — it's a bundle plugin, not a real dependent
  // Mirrors _table.js lines 265-272
  const realDependents = dependents.filter((d) => d !== "jenkins-core");
  const enabledDependents = realDependents.filter(
    (depId) => enabledState[depId],
  );
  return {
    canDisable: enabledDependents.length === 0,
    enabledDependents,
  };
}

/**
 * Checks whether a plugin can be uninstalled.
 *
 * A plugin cannot be uninstalled if it has installed dependents.
 * Mirrors _table.js lines 299-327: `populateUninstallInfo()`.
 *
 * @param pluginId - shortName of the plugin to check
 * @param dependentMap - Map of plugin → plugins that depend on it
 * @returns Object with canUninstall flag and list of installed dependents
 */
function checkCanUninstall(
  pluginId: string,
  dependentMap: Map<string, string[]>,
): { canUninstall: boolean; installedDependents: string[] } {
  const dependents = dependentMap.get(pluginId) || [];
  return {
    canUninstall: dependents.length === 0,
    installedDependents: dependents,
  };
}

// =============================================================================
// Plugin Name Lookup Helper
// =============================================================================

/**
 * Resolves a plugin shortName to its display name.
 * Mirrors _table.js lines 120-131: `processSpanSet()` / `getPluginName()`.
 */
function getPluginDisplayName(
  shortName: string,
  pluginsByShortName: Map<string, InstalledPlugin>,
): string {
  const plugin = pluginsByShortName.get(shortName);
  return plugin ? plugin.displayName : shortName;
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * PluginInstalled — Installed plugins list page.
 *
 * Renders the full installed plugins management interface with search,
 * sortable table, enable/disable toggles, uninstall buttons, dependency
 * safeguards, and restart banner.
 */
function PluginInstalled({
  readOnlyMode = false,
  isRestartRequired = false,
  canRestart = true,
  healthScoresAvailable = false,
}: PluginInstalledProps): React.JSX.Element {
  // ---------------------------------------------------------------------------
  // Hooks
  // ---------------------------------------------------------------------------

  const { t } = useI18n();
  const { crumbFieldName, crumbValue } = useCrumb();
  const { buildUrl } = useJenkinsNavigation();

  // Fetch installed plugins from Stapler REST API
  // Replaces installed.jelly line 96: `${app.pluginManager.pluginsSortedByTitle}`
  const {
    data: apiResponse,
    isLoading,
    isError,
    error,
    refetch,
  } = useStaplerQuery<PluginManagerApiResponse>({
    url: "/pluginManager/api/json?depth=2",
    queryKey: ["pluginManager", "installed"],
    staleTime: 30_000,
  });

  // Mutation for safe-restart — replaces the restart banner form submission.
  // Uses useStaplerMutation with fixed URL `safeRestart` for CSRF crumb
  // injection via the api/client layer.  Toggle and uninstall use raw
  // fetch / form submission because their URLs are dynamic per plugin.
  const restartMutation = useStaplerMutation<unknown, void>({
    url: "safeRestart",
    onError: (err: Error) => {
      setToggleError(err.message);
    },
  });

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Search/filter input text — mirrors _table.js filter-box input handler */
  const [filterQuery, setFilterQuery] = useState<string>("");

  /** User-modified enabled-state overrides (delta from server data).
   *  Only tracks plugins the user has explicitly toggled. */
  const [enabledOverrides, setEnabledOverrides] = useState<
    Record<string, boolean>
  >({});

  /** Error message from toggle mutation */
  const [toggleError, setToggleError] = useState<string>("");

  /** Currently displayed dependency info row */
  const [depInfoState, setDepInfoState] = useState<DependencyInfoState | null>(
    null,
  );

  /** Sort column and direction */
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  /** Hover timeout ref — for 1-second delayed dependency info rows.
   *  Mirrors _table.js lines 412-418 */
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Derived Data
  // ---------------------------------------------------------------------------

  /** All installed plugins from API response */
  const plugins: InstalledPlugin[] = useMemo(
    () => apiResponse?.plugins ?? [],
    [apiResponse],
  );

  /** Failed plugins from API response */
  const failedPlugins: FailedPlugin[] = useMemo(
    () => apiResponse?.failedPlugins ?? [],
    [apiResponse],
  );

  /** Plugin lookup map by shortName */
  const pluginsByShortName: Map<string, InstalledPlugin> = useMemo(() => {
    const map = new Map<string, InstalledPlugin>();
    for (const plugin of plugins) {
      map.set(plugin.shortName, plugin);
    }
    return map;
  }, [plugins]);

  /** Dependency graph — bi-directional maps */
  const { dependencyMap, dependentMap } = useMemo(
    () => buildDependencyGraph(plugins),
    [plugins],
  );

  /** Original enabled state from server data — baseline for restart detection.
   *  Mirrors _installed.js `original` attribute on each checkbox. */
  const originalState: Record<string, boolean> = useMemo(() => {
    const state: Record<string, boolean> = {};
    for (const p of plugins) {
      state[p.shortName] = p.active;
    }
    return state;
  }, [plugins]);

  /** Current enabled/disabled state per plugin — merges server data with
   *  user overrides.  Equivalent to reading each checkbox's `.checked`
   *  property in _installed.js. */
  const enabledState: Record<string, boolean> = useMemo(
    () => ({ ...originalState, ...enabledOverrides }),
    [originalState, enabledOverrides],
  );

  // ---------------------------------------------------------------------------
  // Restart-needed computation
  // Mirrors _installed.js lines 37-49: compare current vs original state
  // ---------------------------------------------------------------------------

  const restartNeeded: boolean = useMemo(() => {
    if (isRestartRequired) {
      return true;
    }
    // Check if any user-toggled plugin's state differs from its original state
    for (const shortName of Object.keys(enabledOverrides)) {
      if (enabledOverrides[shortName] !== originalState[shortName]) {
        return true;
      }
    }
    return false;
  }, [enabledOverrides, originalState, isRestartRequired]);

  // ---------------------------------------------------------------------------
  // Filter logic
  // Mirrors _table.js lines 4-34: split query into words, match all against
  // plugin name + description + pluginId (case-insensitive)
  // ---------------------------------------------------------------------------

  const filteredPlugins: InstalledPlugin[] = useMemo(() => {
    if (!filterQuery.trim()) {
      return plugins;
    }
    const queryParts = filterQuery.toLowerCase().split(/\s+/);
    return plugins.filter((plugin) => {
      const searchText = [
        plugin.displayName || "",
        plugin.excerpt || "",
        plugin.shortName || "",
      ]
        .join(" ")
        .toLowerCase();
      return queryParts.every((part) => searchText.includes(part));
    });
  }, [plugins, filterQuery]);

  // ---------------------------------------------------------------------------
  // Sorting logic
  // ---------------------------------------------------------------------------

  const sortedPlugins: InstalledPlugin[] = useMemo(() => {
    const sorted = [...filteredPlugins];
    sorted.sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case "name":
          comparison = (a.displayName || a.shortName).localeCompare(
            b.displayName || b.shortName,
          );
          break;
        case "enabled":
          comparison =
            (enabledState[a.shortName] ? 1 : 0) -
            (enabledState[b.shortName] ? 1 : 0);
          break;
        case "health":
          comparison = (a.healthScore ?? -1) - (b.healthScore ?? -1);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [filteredPlugins, sortColumn, sortDirection, enabledState]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle sort column click — toggle direction if same column, else set new column.
   */
  const handleSort = useCallback(
    (column: SortColumn) => {
      if (column === sortColumn) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(column);
        setSortDirection(column === "name" ? "asc" : "desc");
      }
    },
    [sortColumn],
  );

  /**
   * Handle enable/disable toggle for a plugin.
   *
   * CRITICAL CSRF: POSTs to plugin/{shortName}/makeEnabled or makeDisabled
   * with crumb headers via useStaplerMutation. Mirrors _installed.js lines 18-26.
   */
  /**
   * Toggle enable / disable for a plugin.
   *
   * No manual useCallback — React Compiler handles memoization automatically.
   * The function reads enabledState (derived), buildUrl, crumbFieldName, and
   * crumbValue from the enclosing scope each render.
   */
  const handleToggle = (shortName: string) => {
    const currentEnabled = enabledState[shortName];
    const newEnabled = !currentEnabled;

    // Optimistically update local override state
    setEnabledOverrides((prev) => ({ ...prev, [shortName]: newEnabled }));
    setToggleError("");

    // POST to Stapler endpoint with CSRF crumb
    // URL format: plugin/{shortName}/makeEnabled or makeDisabled
    const action = newEnabled ? "makeEnabled" : "makeDisabled";
    const postUrl = `plugin/${shortName}/${action}`;

    // Use fetch directly to match the _installed.js pattern exactly.
    // Dynamic per-plugin URL prevents useStaplerMutation (which takes a
    // static URL at hook initialization time); crumb injection is manual.
    fetch(buildUrl(postUrl), {
      method: "POST",
      headers: {
        [crumbFieldName]: crumbValue,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          // Revert optimistic update on error
          setEnabledOverrides((prev) => ({
            ...prev,
            [shortName]: currentEnabled,
          }));

          // Attempt to parse a Stapler error envelope for a meaningful message.
          // Uses StaplerResponse.status / .message members for guard validation.
          try {
            const result: StaplerResponse = await response.json();
            if (result.status !== "ok") {
              setToggleError(
                result.message ||
                  `Failed to ${newEnabled ? "enable" : "disable"} plugin`,
              );
              return;
            }
          } catch {
            // Response is not JSON — fall through to generic message
          }

          setToggleError(
            `Failed to ${newEnabled ? "enable" : "disable"} plugin: ${response.statusText}`,
          );
        }
      })
      .catch((err: Error) => {
        // Revert optimistic update on network error
        setEnabledOverrides((prev) => ({
          ...prev,
          [shortName]: currentEnabled,
        }));
        setToggleError(err.message);
      });
  };

  /**
   * Handle uninstall button click.
   *
   * Shows destructive confirmation dialog then POSTs to plugin/{shortName}/doUninstall.
   * Mirrors _table.js lines 483-508.
   */
  const handleUninstall = useCallback(
    (shortName: string, displayName: string) => {
      const uninstallDescription =
        t("uninstall-description") ||
        "Are you sure you want to uninstall this plugin?";

      showDialog("confirm", {
        title: `Uninstall ${displayName}`,
        message: uninstallDescription,
        type: "destructive",
      })
        .then(() => {
          // User confirmed — POST to uninstall endpoint
          // Mirrors _table.js lines 498-504: create hidden form with crumb and submit
          const form = document.createElement("form");
          form.setAttribute("method", "POST");
          form.setAttribute(
            "action",
            buildUrl(`plugin/${shortName}/doUninstall`),
          );

          // Inject CSRF crumb as hidden field — mirrors crumb.appendToForm(form) from _table.js line 501
          const crumbInput = document.createElement("input");
          crumbInput.type = "hidden";
          crumbInput.name = crumbFieldName;
          crumbInput.value = crumbValue;
          form.appendChild(crumbInput);

          document.body.appendChild(form);
          form.submit();
        })
        .catch(() => {
          // User cancelled — do nothing (mirrors _table.js line 505)
        });
    },
    [t, buildUrl, crumbFieldName, crumbValue],
  );

  /**
   * Handle downgrade button click.
   *
   * Submits a hidden form POSTing to /updateCenter/plugin/{shortName}/downgrade.
   * Mirrors installed.jelly lines 204-218.
   */
  const handleDowngrade = useCallback(
    (shortName: string) => {
      const form = document.createElement("form");
      form.setAttribute("method", "POST");
      form.setAttribute(
        "action",
        buildUrl(`updateCenter/plugin/${shortName}/downgrade`),
      );

      const crumbInput = document.createElement("input");
      crumbInput.type = "hidden";
      crumbInput.name = crumbFieldName;
      crumbInput.value = crumbValue;
      form.appendChild(crumbInput);

      document.body.appendChild(form);
      form.submit();
    },
    [buildUrl, crumbFieldName, crumbValue],
  );

  /** Clear pending hover timeout */
  const clearHoverTimeout = useCallback(() => {
    if (hoverTimeoutRef.current !== null) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  /**
   * Show dependency info row on hover with 1-second delay.
   * Mirrors _table.js lines 409-452.
   */
  const handleCellMouseEnter = useCallback(
    (pluginId: string, type: "enable" | "uninstall") => {
      clearHoverTimeout();
      hoverTimeoutRef.current = setTimeout(() => {
        hoverTimeoutRef.current = null;
        setDepInfoState({ pluginId, type });
      }, HOVER_INFO_DELAY_MS);
    },
    [clearHoverTimeout],
  );

  /** Clear hover timeout and hide dependency info row.
   *  Mirrors _table.js lines 431-434, 448-451 */
  const handleCellMouseLeave = useCallback(() => {
    clearHoverTimeout();
    setDepInfoState(null);
  }, [clearHoverTimeout]);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current !== null) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Render Helpers
  // ---------------------------------------------------------------------------

  /**
   * Get CSS classes for a plugin row based on its state.
   * Mirrors installed.jelly lines 98-110 conditional class attributes.
   */
  const getPluginRowClasses = useCallback(
    (plugin: InstalledPlugin): string => {
      const classes: string[] = ["plugin"];
      if (plugin.hasMandatoryDependents || plugin.mandatoryDependents?.length) {
        classes.push("has-dependents");
      }
      if (plugin.hasImpliedDependents || plugin.impliedDependents?.length) {
        classes.push("possibly-has-implied-dependents");
      }
      if (plugin.deleted) {
        classes.push("deleted");
      }
      // Check if all dependents are disabled — mirrors _table.js lines 133-171
      const dependents = dependentMap.get(plugin.shortName) || [];
      const realDependents = dependents.filter((d) => d !== "jenkins-core");
      const allDependentsDisabled = realDependents.every(
        (d) => !enabledState[d],
      );
      if (
        realDependents.length > 0 &&
        allDependentsDisabled
      ) {
        classes.push("has-dependents-but-disabled");
      }
      return classes.join(" ");
    },
    [dependentMap, enabledState],
  );

  /**
   * Build dependency info content for display in the info row.
   * Mirrors _table.js populateEnableDisableInfo() and populateUninstallInfo().
   */
  const getDependencyInfoContent = useCallback(
    (
      pluginId: string,
      type: "enable" | "uninstall",
    ): { title: string; subtitle: string; items: string[] } | null => {
      const plugin = pluginsByShortName.get(pluginId);
      if (!plugin) {
        return null;
      }

      if (type === "enable") {
        // Check if plugin has disabled dependencies
        const { canEnable, disabledDependencies } = checkCanEnable(
          pluginId,
          dependencyMap,
          enabledState,
        );
        if (!canEnable && disabledDependencies.length > 0) {
          return {
            title:
              t("cannot-enable") || "This plugin cannot be enabled",
            subtitle:
              t("disabled-dependencies") ||
              "It has one or more unsatisfied dependencies",
            items: disabledDependencies.map((d) =>
              getPluginDisplayName(d, pluginsByShortName),
            ),
          };
        }

        // Check if plugin cannot be disabled (has enabled dependents)
        const { canDisable, enabledDependents } = checkCanDisable(
          pluginId,
          dependentMap,
          enabledState,
        );
        if (!canDisable && enabledDependents.length > 0) {
          return {
            title:
              t("cannot-disable") || "This plugin cannot be disabled",
            subtitle:
              t("enabled-dependents") ||
              "It has one or more enabled dependents",
            items: enabledDependents.map((d) =>
              getPluginDisplayName(d, pluginsByShortName),
            ),
          };
        }

        // Check for implied dependents (detached plugin case)
        if (
          plugin.hasImpliedDependents ||
          (plugin.impliedDependents && plugin.impliedDependents.length > 0)
        ) {
          // Only show if plugin has dependents AND is not already covered above
          const impliedDeps = plugin.impliedDependents || [];
          if (impliedDeps.length > 0) {
            return {
              title:
                t("detached-disable") ||
                "This is a plugin protocol-compatible plugin",
              subtitle:
                t("detached-possible-dependents") ||
                "These plugins may depend on it",
              items: impliedDeps.map((d) =>
                getPluginDisplayName(d, pluginsByShortName),
              ),
            };
          }
        }

        return null;
      }

      // Uninstall info — mirrors _table.js lines 299-327
      if (type === "uninstall") {
        const { canUninstall, installedDependents } = checkCanUninstall(
          pluginId,
          dependentMap,
        );
        if (!canUninstall && installedDependents.length > 0) {
          return {
            title:
              t("cannot-uninstall") || "This plugin cannot be uninstalled",
            subtitle:
              t("installed-dependents") ||
              "It has one or more installed dependents",
            items: installedDependents.map((d) =>
              getPluginDisplayName(d, pluginsByShortName),
            ),
          };
        }

        // Check for implied dependents (detached plugin case)
        if (
          plugin.hasImpliedDependents ||
          (plugin.impliedDependents && plugin.impliedDependents.length > 0)
        ) {
          const impliedDeps = plugin.impliedDependents || [];
          if (impliedDeps.length > 0) {
            return {
              title:
                t("detached-uninstall") ||
                "This is a plugin protocol-compatible plugin",
              subtitle:
                t("detached-possible-dependents") ||
                "These plugins may depend on it",
              items: impliedDeps.map((d) =>
                getPluginDisplayName(d, pluginsByShortName),
              ),
            };
          }
        }

        return null;
      }

      return null;
    },
    [
      t,
      pluginsByShortName,
      dependencyMap,
      dependentMap,
      enabledState,
    ],
  );

  /**
   * Get the description text for a plugin.
   * Mirrors installed.jelly lines 136-161: description source hierarchy
   * (indexPage → excerpt → manifest → "No description available.")
   */
  const getPluginDescription = useCallback(
    (plugin: InstalledPlugin): string => {
      if (plugin.excerpt) {
        return plugin.excerpt;
      }
      return t("no-description") || "No description available.";
    },
    [t],
  );

  /**
   * Compute number of columns for the info row colspan.
   * Base: Name + Enabled + Version = 3, conditionally + Health + Downgrade + Uninstall
   */
  const totalColumns: number = useMemo(() => {
    let cols = 3; // Name, Enabled, Version (always shown)
    if (healthScoresAvailable) {
      cols += 1;
    }
    if (!readOnlyMode) {
      cols += 2; // Downgrade + Uninstall columns
    }
    return cols;
  }, [healthScoresAvailable, readOnlyMode]);

  // ---------------------------------------------------------------------------
  // Render: Loading State
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="jenkins-spinner-wrapper">
        <div className="jenkins-spinner" aria-label="Loading installed plugins" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Error State
  // ---------------------------------------------------------------------------

  if (isError) {
    return (
      <div className="jenkins-alert jenkins-alert-danger" role="alert">
        <p>
          {t("error-loading") || "Failed to load installed plugins."}
        </p>
        {error && <p>{error.message}</p>}
        <button
          type="button"
          className="jenkins-button jenkins-button--primary"
          onClick={() => refetch()}
        >
          {t("retry") || "Retry"}
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Main
  // ---------------------------------------------------------------------------

  return (
    <div id="plugins">
      {/* i18n template element — provides data attributes for legacy DOM-based i18n reads.
          Mirrors installed.jelly lines 60-70 */}
      <template id="i18n"
        data-cannot-enable={t("cannot-enable") || "This plugin cannot be enabled"}
        data-cannot-disable={t("cannot-disable") || "This plugin cannot be disabled"}
        data-cannot-uninstall={t("cannot-uninstall") || "This plugin cannot be uninstalled"}
        data-disabled-dependencies={t("disabled-dependencies") || "It has one or more unsatisfied dependencies"}
        data-enabled-dependents={t("enabled-dependents") || "It has one or more enabled dependents"}
        data-installed-dependents={t("installed-dependents") || "It has one or more installed dependents"}
        data-detached-disable={t("detached-disable") || "This is a plugin protocol-compatible plugin"}
        data-detached-uninstall={t("detached-uninstall") || "This is a plugin protocol-compatible plugin"}
        data-detached-possible-dependents={t("detached-possible-dependents") || "These plugins may depend on it"}
        data-uninstall-description={t("uninstall-description") || "Are you sure you want to uninstall this plugin?"}
      />

      {/* Restart required indicator — hidden element for DOM-based detection.
          Mirrors installed.jelly lines 53-58 */}
      <span
        id="is-restart-required-for-completion"
        data-is-restart-required={String(isRestartRequired)}
        className="jenkins-hidden"
      />

      {/* App bar with search input.
          Mirrors installed.jelly lines 40-49 */}
      <div className="jenkins-app-bar jenkins-app-bar--sticky">
        <div className="jenkins-app-bar__content">
          <label htmlFor="filter-box" className="jenkins-visually-hidden">
            {t("search-installed") || "Search installed plugins"}
          </label>
          <input
            id="filter-box"
            type="search"
            className="jenkins-input"
            placeholder={
              t("search-installed") || "Search installed plugins"
            }
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {/* Toggle error alert */}
      {toggleError && (
        <div className="jenkins-alert jenkins-alert-danger" role="alert">
          <p>{toggleError}</p>
        </div>
      )}

      {/* Restart warning alert — shown when any checkbox differs from original state.
          Mirrors installed.jelly lines 55-58 */}
      {restartNeeded && (
        <div className="jenkins-alert jenkins-alert-warning" role="alert">
          <p>
            {t("requires-restart") ||
              "Changes will take effect when you restart Jenkins."}
          </p>
        </div>
      )}

      {/* Plugin table.
          Mirrors installed.jelly lines 77-263 */}
      {sortedPlugins.length === 0 && !isLoading ? (
        <div className="jenkins-alert">
          <p>{t("no-plugins") || "No plugins installed."}</p>
        </div>
      ) : (
        <table
          id="plugins"
          className="jenkins-table sortable"
          role="grid"
          aria-label={t("installed-plugins") || "Installed plugins"}
        >
          <thead>
            <tr>
              {/* Name column — initialSortDir="down" from installed.jelly line 79 */}
              <th
                className={`sortable-header ${sortColumn === "name" ? (sortDirection === "asc" ? "asc" : "desc") : ""}`}
                onClick={() => handleSort("name")}
                role="columnheader"
                aria-sort={
                  sortColumn === "name"
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                {t("name") || "Name"}
              </th>

              {/* Health score column — conditional from installed.jelly line 83 */}
              {healthScoresAvailable && (
                <th
                  className={`sortable-header ${sortColumn === "health" ? (sortDirection === "asc" ? "asc" : "desc") : ""}`}
                  onClick={() => handleSort("health")}
                  role="columnheader"
                  aria-sort={
                    sortColumn === "health"
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  {t("health") || "Health"}
                </th>
              )}

              {/* Enabled column */}
              <th
                className="jenkins-table__cell--tight"
                role="columnheader"
              >
                {t("enabled") || "Enabled"}
              </th>

              {/* Version column (always shown) */}
              <th role="columnheader">
                {t("version") || "Version"}
              </th>

              {/* Admin-only columns */}
              {!readOnlyMode && (
                <>
                  <th
                    className="jenkins-table__cell--tight"
                    role="columnheader"
                  >
                    {/* Downgrade column — no header text, mirrors installed.jelly */}
                  </th>
                  <th
                    className="jenkins-table__cell--tight"
                    role="columnheader"
                  >
                    {/* Uninstall column — no header text */}
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedPlugins.map((plugin) => {
              const isEnabled = enabledState[plugin.shortName] ?? plugin.active;
              const { canEnable, disabledDependencies } = checkCanEnable(
                plugin.shortName,
                dependencyMap,
                enabledState,
              );
              const { canDisable, enabledDependents } = checkCanDisable(
                plugin.shortName,
                dependentMap,
                enabledState,
              );
              const { canUninstall, installedDependents } = checkCanUninstall(
                plugin.shortName,
                dependentMap,
              );

              // Determine if toggle is blocked
              const isToggleDisabled =
                readOnlyMode ||
                plugin.deleted ||
                (isEnabled && !canDisable) ||
                (!isEnabled && !canEnable);

              // Build informative title text for the toggle when blocked.
              // Uses disabledDependencies / enabledDependents so the user
              // understands WHY the toggle is disabled.
              const toggleTitle = isToggleDisabled
                ? !isEnabled && !canEnable && disabledDependencies.length > 0
                  ? `${t("cannot-enable") || "Cannot enable"}: ${disabledDependencies.map((d) => getPluginDisplayName(d, pluginsByShortName)).join(", ")}`
                  : isEnabled && !canDisable && enabledDependents.length > 0
                    ? `${t("cannot-disable") || "Cannot disable"}: ${enabledDependents.map((d) => getPluginDisplayName(d, pluginsByShortName)).join(", ")}`
                    : undefined
                : undefined;

              // Determine if uninstall is blocked due to installed dependents.
              const isUninstallDisabled =
                !canUninstall || plugin.deleted;
              const uninstallTitle =
                !canUninstall && installedDependents.length > 0
                  ? `${t("cannot-uninstall") || "Cannot uninstall"}: ${installedDependents.map((d) => getPluginDisplayName(d, pluginsByShortName)).join(", ")}`
                  : undefined;

              return (
                <React.Fragment key={plugin.shortName}>
                  {/* Plugin data row — mirrors installed.jelly lines 97-263 */}
                  <tr
                    className={getPluginRowClasses(plugin)}
                    data-plugin-id={plugin.shortName}
                    data-plugin-name={plugin.displayName}
                  >
                    {/* Name cell with description, warnings, links */}
                    <td>
                      <div>
                        {/* Plugin name link */}
                        {plugin.url ? (
                          <a
                            href={plugin.url}
                            className="jenkins-table__link"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {plugin.displayName || plugin.shortName}
                          </a>
                        ) : (
                          <span className="jenkins-table__link">
                            {plugin.displayName || plugin.shortName}
                          </span>
                        )}

                        {/* Version label — mirrors installed.jelly line 131 */}
                        <span className="jenkins-label--tertiary">
                          {plugin.version}
                        </span>
                      </div>

                      {/* Description — mirrors installed.jelly lines 136-161 */}
                      <div className="jenkins-table__secondary-text">
                        {getPluginDescription(plugin)}
                      </div>

                      {/* Hidden dependency list div — preserves DOM structure for compatibility */}
                      <div
                        className="dependency-list"
                        style={{ display: "none" }}
                      >
                        {(plugin.mandatoryDependencies || []).map((dep) => (
                          <span
                            key={dep.shortName}
                            data-plugin-id={dep.shortName}
                          >
                            {getPluginDisplayName(dep.shortName, pluginsByShortName)}
                          </span>
                        ))}
                      </div>

                      {/* Issue tracker link — mirrors installed.jelly line 166 */}
                      {plugin.issueTrackerReportUrl && (
                        <a
                          href={plugin.issueTrackerReportUrl}
                          className="jenkins-table__link--secondary"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t("report-issue") || "Report an issue"}
                        </a>
                      )}

                      {/* Security warnings — mirrors installed.jelly lines 168-180 */}
                      {plugin.activeWarnings &&
                        plugin.activeWarnings.length > 0 && (
                          <div className="jenkins-alert jenkins-alert-danger">
                            {plugin.activeWarnings.map(
                              (warning, idx) => (
                                <div key={idx}>
                                  <a
                                    href={warning.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {t("security-warning") ||
                                      "Security Warning"}
                                    : {warning.message}
                                  </a>
                                </div>
                              ),
                            )}
                          </div>
                        )}

                      {/* Deprecation warning — mirrors installed.jelly line 185 */}
                      {plugin.deprecated && (
                        <div className="jenkins-alert jenkins-alert-warning">
                          {t("deprecation-warning") ||
                            "This plugin is deprecated."}
                          {plugin.deprecations &&
                            plugin.deprecations.length > 0 && (
                              <>
                                {" "}
                                <a
                                  href={plugin.deprecations[0].url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {t("learn-more") || "Learn more"}
                                </a>
                              </>
                            )}
                        </div>
                      )}
                    </td>

                    {/* Health score badge cell — conditional.
                        Mirrors installed.jelly lines 172-187 */}
                    {healthScoresAvailable && (
                      <td className="jenkins-table__cell--tight">
                        {plugin.healthScore != null ? (
                          <a
                            href={buildUrl(
                              `plugin/${plugin.shortName}/healthScore`,
                            )}
                            title={
                              t("health-tooltip") ||
                              `Health score: ${plugin.healthScore}`
                            }
                          >
                            <span
                              className={`jenkins-healthScore--badge ${plugin.healthScoreClass || ""}`}
                              aria-label={`Health score: ${plugin.healthScore}`}
                            >
                              {plugin.healthScore}
                            </span>
                          </a>
                        ) : (
                          <span
                            className="jenkins-healthScore--badge"
                            aria-label={
                              t("no-health-score") ||
                              "No health score available"
                            }
                          >
                            —
                          </span>
                        )}
                      </td>
                    )}

                    {/* Enable/disable toggle cell.
                        Mirrors installed.jelly lines 189-202 and _installed.js */}
                    <td
                      className="enable jenkins-table__cell--tight"
                      onMouseEnter={() =>
                        handleCellMouseEnter(plugin.shortName, "enable")
                      }
                      onMouseLeave={handleCellMouseLeave}
                    >
                      <label
                        className="jenkins-toggle-switch"
                        title={toggleTitle}
                      >
                        <input
                          type="checkbox"
                          className="plugin-manager-toggle-switch"
                          checked={isEnabled}
                          disabled={isToggleDisabled}
                          data-plugin-id={plugin.shortName}
                          data-original={String(
                            originalState[plugin.shortName] ?? plugin.active,
                          )}
                          onChange={() => handleToggle(plugin.shortName)}
                          aria-label={`${isEnabled ? "Disable" : "Enable"} ${plugin.displayName}`}
                        />
                        <span className="jenkins-toggle-switch__indicator" />
                      </label>
                    </td>

                    {/* Version column */}
                    <td>
                      {plugin.version}
                      {plugin.updateInfo && plugin.updateInfo.displayName && (
                        <span className="jenkins-label--tertiary">
                          {` → ${plugin.updateInfo.displayName}`}
                        </span>
                      )}
                    </td>

                    {/* Admin-only: Downgrade cell.
                        Mirrors installed.jelly lines 204-218 */}
                    {!readOnlyMode && (
                      <td className="jenkins-table__cell--tight">
                        {plugin.downgradable && plugin.backupVersion && (
                          <button
                            type="button"
                            className="jenkins-button jenkins-button--tertiary jenkins-!-color-orange"
                            onClick={() => handleDowngrade(plugin.shortName)}
                            title={`Downgrade to ${plugin.backupVersion}`}
                          >
                            {plugin.backupVersion}
                          </button>
                        )}
                      </td>
                    )}

                    {/* Admin-only: Uninstall cell.
                        Mirrors installed.jelly lines 220-260 */}
                    {!readOnlyMode && (
                      <td
                        className="uninstall jenkins-table__cell--tight"
                        onMouseEnter={() =>
                          handleCellMouseEnter(
                            plugin.shortName,
                            "uninstall",
                          )
                        }
                        onMouseLeave={handleCellMouseLeave}
                      >
                        {plugin.deleted ? (
                          <span className="jenkins-label--tertiary">
                            {t("uninstallation-pending") ||
                              "Uninstallation pending"}
                          </span>
                        ) : (
                          <>
                            {/* Hidden dependent list div — preserves DOM structure */}
                            <div
                              className="dependent-list"
                              style={{ display: "none" }}
                            >
                              {[
                                ...(plugin.mandatoryDependents || []),
                                ...(plugin.impliedDependents || []),
                              ].map((depName) => (
                                <span
                                  key={depName}
                                  data-plugin-id={depName}
                                >
                                  {getPluginDisplayName(
                                    depName,
                                    pluginsByShortName,
                                  )}
                                </span>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="jenkins-button jenkins-button--tertiary jenkins-!-destructive-color"
                              data-action="uninstall"
                              data-href={`plugin/${plugin.shortName}/doUninstall`}
                              data-message={`Uninstall ${plugin.displayName}`}
                              disabled={isUninstallDisabled}
                              title={uninstallTitle}
                              onClick={() =>
                                handleUninstall(
                                  plugin.shortName,
                                  plugin.displayName,
                                )
                              }
                              aria-label={`Uninstall ${plugin.displayName}`}
                            >
                              {t("uninstall") || "Uninstall"}
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>

                  {/* Dependency info row — shown on hover after 1-second delay.
                      Mirrors _table.js lines 400-452 */}
                  {depInfoState &&
                    depInfoState.pluginId === plugin.shortName && (() => {
                      const info = getDependencyInfoContent(
                        plugin.shortName,
                        depInfoState.type,
                      );
                      if (!info) {
                        return null;
                      }
                      return (
                        <tr className="dependency-info-row">
                          <td colSpan={totalColumns}>
                            <div
                              className={
                                depInfoState.type === "enable"
                                  ? "enable-state-info"
                                  : "uninstall-state-info"
                              }
                              style={{ display: "inherit" }}
                            >
                              <div className="title">{info.title}</div>
                              <div className="subtitle">
                                {info.subtitle}.
                              </div>
                              {info.items.length > 0 && (
                                <div className="dependency-item-list">
                                  {info.items.map((item) => (
                                    <span
                                      key={item}
                                      style={{
                                        display: "inline-block",
                                      }}
                                    >
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                </React.Fragment>
              );
            })}

            {/* Failed plugins section.
                Mirrors installed.jelly lines 266-297 */}
            {failedPlugins.length > 0 &&
              failedPlugins.map((fp) => (
                <tr key={`failed-${fp.name}`} className="failed-plugin">
                  <td colSpan={totalColumns}>
                    <div className="jenkins-alert jenkins-alert-danger">
                      <strong>{fp.name}</strong>
                      <pre>{fp.cause}</pre>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {/* Restart banner.
          Mirrors installed.jelly lines 303-310 and _installed.js lines 37-49.
          Uses restartMutation (useStaplerMutation) for safe-restart POST with
          CSRF crumb injection.  Falls back to a traditional form so the page
          performs a full navigation when Jenkins begins its restart cycle. */}
      <div
        id="needRestart"
        style={{ display: restartNeeded ? "block" : "none" }}
      >
        <form method="post" action={buildUrl("safeRestart")}>
          {/* CSRF crumb hidden field — mirrors crumb.appendToForm() */}
          <input type="hidden" name={crumbFieldName} value={crumbValue} />
          <p>
            {t("changes-restart") ||
              "Changes will take effect when you restart Jenkins."}
          </p>
          {restartMutation.isError && restartMutation.error && (
            <p className="jenkins-alert jenkins-alert-danger" role="alert">
              {restartMutation.error.message}
            </p>
          )}
          {canRestart && (
            <button
              type="button"
              className="jenkins-button jenkins-button--primary"
              disabled={restartMutation.isPending}
              onClick={() => {
                restartMutation.mutate(undefined as unknown as void);
              }}
            >
              {restartMutation.isPending
                ? t("restarting") || "Restarting…"
                : t("restart-once-no-jobs") ||
                  "Restart Once No Jobs Are Running"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default PluginInstalled;
