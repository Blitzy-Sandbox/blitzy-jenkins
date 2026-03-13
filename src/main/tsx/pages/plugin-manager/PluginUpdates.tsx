/**
 * PluginUpdates.tsx — Plugin Updates List Page
 *
 * Replaces core/src/main/resources/hudson/PluginManager/updates.jelly (262 lines)
 * and the updates-related portions of _table.js.
 *
 * Displays available plugin updates with:
 * - Sortable table with version info, security warnings, compatibility notices
 * - Batch update capability via select-all / select-compatible / individual checkboxes
 * - Filter/search with case-insensitive split-word matching
 * - Health score column (conditional)
 * - Relative timestamp display
 * - 7+ alert conditions per plugin row (compat, core, security-fix, dep-compat,
 *   dep-core, security-warnings, deprecation, adopt-this-plugin)
 * - No-updates empty state
 */

import { useState, useCallback, useMemo } from "react";
import { useStaplerQuery } from "@/hooks/useStaplerQuery";
import { useStaplerMutation } from "@/hooks/useStaplerMutation";
import { useCrumb } from "@/hooks/useCrumb";
import { useI18n } from "@/hooks/useI18n";
import { useJenkinsNavigation } from "@/hooks/useJenkinsNavigation";
import type { StaplerResponse } from "@/api/types";

/* ------------------------------------------------------------------ */
/*  Type definitions                                                   */
/* ------------------------------------------------------------------ */

/**
 * Describes a single plugin update entry as returned by the Stapler REST
 * endpoint at /pluginManager/api/json (updateCenter.updates).
 */
interface PluginUpdate {
  /** Plugin short name (unique ID) */
  name: string;
  /** Human-readable plugin name */
  displayName: string;
  /** New version available */
  version: string;
  /** Wiki / documentation URL */
  wiki: string;
  /** Update site source identifier */
  sourceId: string;
  /** Plugin categories for badge display */
  categories: string[];
  /** Short description / excerpt (may contain HTML) */
  excerpt?: string;
  /** Minimum Jenkins core version required by this update */
  requiredCore?: string;
  /** Currently installed version info */
  installed: { version: string; active: boolean };
  /** Timestamp of the release */
  releaseTimestamp?: { time: number; displayValue: string; iso8601: string };
  /** Numeric health score (0–100) */
  healthScore?: number;
  /** CSS class suffix for the health score badge */
  healthScoreClass?: string;
  /** Whether the update is compatible with the current environment */
  compatible: boolean;
  /** Whether the update is compatible with currently installed plugin versions */
  compatibleWithInstalledVersion: boolean;
  /** Whether the update requires a newer Jenkins core */
  forNewerHudson: boolean;
  /** Whether this update fixes known security vulnerabilities */
  fixesSecurityVulnerabilities: boolean;
  /** Whether all needed dependencies are compatible with installed versions */
  neededDependenciesCompatibleWithInstalledVersion: boolean;
  /** Whether needed dependencies require a newer Jenkins core */
  neededDependenciesForNewerJenkins: boolean;
  /** Whether this plugin has active security warnings */
  hasWarnings: boolean;
  /** List of active security warnings */
  warnings?: { url: string; message: string }[];
  /** Whether this plugin is deprecated */
  deprecated: boolean;
  /** Deprecation details */
  deprecation?: { url: string };
  /** Whether this plugin is flagged for adoption */
  hasAdoptThisPluginLabel: boolean;
  /** Plugins that are incompatible with the installed version when this update is applied */
  incompatibleParentPlugins?: {
    wiki: string;
    displayName: string;
    installed: { version: string };
  }[];
  /** Dependencies that are incompatible with installed versions */
  dependenciesIncompatibleWithInstalledVersion?: {
    wiki: string;
    displayName: string;
    installed: { version: string };
  }[];
  /** Minimum Jenkins core version required by dependencies */
  neededDependenciesRequiredCore?: string;
  /** Existing install job (set when update is already in progress or complete) */
  installJob?: { status: { success: boolean }; plugin: { version: string } };
}

/**
 * Props accepted by the PluginUpdates component.
 * These are typically passed from the parent PluginManagerIndex.
 */
export interface PluginUpdatesProps {
  /** Whether the current user has Jenkins administrator permission */
  isAdmin: boolean;
  /** Whether health scores are available from the update center */
  healthScoresAvailable: boolean;
  /** Whether any update in the list has compatibility issues — controls the "Compatible" button */
  hasIncompatibleUpdates: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Determines whether a plugin update row should be considered "already upgraded",
 * meaning an install job exists for it.
 */
function isAlreadyUpgraded(plugin: PluginUpdate): boolean {
  return plugin.installJob != null;
}

/**
 * Returns `true` when the plugin has NO compatibility warnings —
 * i.e. it is safe for the "Select Compatible" action.
 */
function isCompatible(plugin: PluginUpdate): boolean {
  return (
    plugin.compatibleWithInstalledVersion &&
    !plugin.forNewerHudson &&
    plugin.neededDependenciesCompatibleWithInstalledVersion &&
    !plugin.neededDependenciesForNewerJenkins
  );
}

/**
 * Replicates the _table.js filter logic (lines 1-65):
 * splits query into words, case-insensitive match against
 * plugin name + description + pluginId.
 */
function matchesFilter(plugin: PluginUpdate, query: string): boolean {
  if (!query.trim()) {
    return true;
  }
  const words = query.toLowerCase().trim().split(/\s+/);
  const haystack = [plugin.displayName, plugin.name, plugin.excerpt ?? ""]
    .join(" ")
    .toLowerCase();

  return words.every((word) => haystack.includes(word));
}

/**
 * Produces a human-readable relative time string from a millisecond timestamp.
 * Mirrors the Jelly `${%ago(h.getTimeSpanString())}` pattern.
 */
function getRelativeTime(timestampMs: number, agoLabel: string): string {
  const diff = Date.now() - timestampMs;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let span: string;
  if (days > 365) {
    const years = Math.floor(days / 365);
    span = `${years} yr`;
  } else if (days > 30) {
    const months = Math.floor(days / 30);
    span = `${months} mo`;
  } else if (days > 0) {
    span = `${days} day${days !== 1 ? "s" : ""}`;
  } else if (hours > 0) {
    span = `${hours} hr`;
  } else if (minutes > 0) {
    span = `${minutes} min`;
  } else {
    span = `${seconds} sec`;
  }
  /* The Jelly pattern is `${%ago(timeSpanString)}` where %ago is
     an i18n template like "{0} ago". We replicate that here. */
  return agoLabel.replace("{0}", span);
}

/* ------------------------------------------------------------------ */
/*  API response shape                                                 */
/* ------------------------------------------------------------------ */

/** Shape of the /pluginManager/api/json response for the updates sub-object */
interface PluginManagerUpdatesResponse {
  updates: PluginUpdate[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * PluginUpdates — renders the "Updates" tab content for the Plugin Manager.
 *
 * Fetches the available plugin updates list from the Stapler REST endpoint,
 * renders a sortable table with checkboxes for batch update, and handles
 * the install form submission.
 */
export function PluginUpdates({
  isAdmin,
  healthScoresAvailable,
  hasIncompatibleUpdates,
}: PluginUpdatesProps): React.JSX.Element {
  /* ---- hooks ---- */
  const { t } = useI18n();
  const { buildUrl } = useJenkinsNavigation();
  const { crumbFieldName, crumbValue } = useCrumb();

  /* Fetch the list of available updates from the Stapler endpoint */
  const {
    data: updatesResponse,
    isLoading,
    isError,
    error,
    refetch,
  } = useStaplerQuery<StaplerResponse<PluginManagerUpdatesResponse>>({
    url: "/pluginManager/api/json?depth=2&tree=updates[*]",
    queryKey: ["pluginManager", "updates"],
  });

  /* Mutation for submitting the batch update form */
  const { mutate: submitInstall, isPending: isInstalling } = useStaplerMutation<
    void,
    Record<string, string>
  >({
    url: "/pluginManager/install",
    contentType: "form-urlencoded",
  });

  /* ---- local state ---- */
  const [filterQuery, setFilterQuery] = useState<string>("");
  const [selectedPlugins, setSelectedPlugins] = useState<Set<string>>(
    () => new Set<string>(),
  );

  /* ---- derived data ---- */
  const updatesList: PluginUpdate[] = useMemo(() => {
    const raw = updatesResponse?.data?.updates;
    return Array.isArray(raw) ? raw : [];
  }, [updatesResponse]);

  /** Filtered list based on the search query */
  const filteredUpdates: PluginUpdate[] = useMemo(
    () => updatesList.filter((p) => matchesFilter(p, filterQuery)),
    [updatesList, filterQuery],
  );

  /** Whether any checkbox is selected (controls the "Update" button enabled state) */
  const hasSelection: boolean = useMemo(() => {
    /* Must have at least one selected plugin that isn't already upgraded */
    for (const key of selectedPlugins) {
      const plugin = updatesList.find(
        (p) => `plugin.${p.name}.${p.sourceId}` === key,
      );
      if (plugin && !isAlreadyUpgraded(plugin)) {
        return true;
      }
    }
    return false;
  }, [selectedPlugins, updatesList]);

  /* ---- callbacks ---- */

  /** Handle search/filter input change */
  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilterQuery(e.target.value);
    },
    [],
  );

  /** Select All non-disabled checkboxes */
  const handleSelectAll = useCallback(() => {
    const next = new Set<string>();
    for (const p of updatesList) {
      if (!isAlreadyUpgraded(p)) {
        next.add(`plugin.${p.name}.${p.sourceId}`);
      }
    }
    setSelectedPlugins(next);
  }, [updatesList]);

  /** Select None — uncheck all */
  const handleSelectNone = useCallback(() => {
    setSelectedPlugins(new Set<string>());
  }, []);

  /**
   * Select Compatible — check only checkboxes whose plugin has
   * data-compat-warning === "false" (from _table.js lines 463-481).
   */
  const handleSelectCompatible = useCallback(() => {
    const next = new Set<string>();
    for (const p of updatesList) {
      if (!isAlreadyUpgraded(p) && isCompatible(p)) {
        next.add(`plugin.${p.name}.${p.sourceId}`);
      }
    }
    setSelectedPlugins(next);
  }, [updatesList]);

  /** Toggle a single checkbox */
  const handleCheckboxChange = useCallback((key: string, checked: boolean) => {
    setSelectedPlugins((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  /** Submit the install form via mutation */
  const handleSubmitUpdate = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      /* Build the form-urlencoded payload with selected plugin checkboxes */
      const payload: Record<string, string> = {};
      if (crumbFieldName && crumbValue) {
        payload[crumbFieldName] = crumbValue;
      }
      for (const key of selectedPlugins) {
        payload[key] = "on";
      }

      submitInstall(payload, {
        onSuccess: () => {
          /* After successful install submission, refetch updates */
          refetch();
          setSelectedPlugins(new Set<string>());
        },
      });
    },
    [selectedPlugins, crumbFieldName, crumbValue, submitInstall, refetch],
  );

  /* ---- render: loading state ---- */
  if (isLoading) {
    return (
      <div className="jenkins-spinner-wrapper">
        <div className="jenkins-spinner" aria-label="Loading" />
      </div>
    );
  }

  /* ---- render: error state ---- */
  if (isError) {
    return (
      <div className="jenkins-alert jenkins-alert--error" role="alert">
        <span>
          {t("ErrorLoadingUpdates") ?? "Failed to load plugin updates."}
          {error?.message ? ` ${error.message}` : ""}
        </span>
        <button
          type="button"
          className="jenkins-button jenkins-button--tertiary"
          onClick={() => refetch()}
        >
          {t("Retry") ?? "Retry"}
        </button>
      </div>
    );
  }

  /* ---- render: empty state (no updates available) ---- */
  if (updatesList.length === 0) {
    return (
      <div className="jenkins-notice" role="status">
        <span className="jenkins-notice__icon">
          {/* symbol-up-to-date icon — inline SVG matching updates.jelly line 255 */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </span>
        <span className="jenkins-notice__title">
          {t("No updates available") ?? "No updates available"}
        </span>
      </div>
    );
  }

  /* ---- render: updates table ---- */
  return (
    <>
      {/* App bar with search, update button, and check-now */}
      <div className="jenkins-app-bar jenkins-app-bar--sticky">
        <div className="jenkins-app-bar__content">
          <div className="jenkins-search jenkins-search--app-bar">
            <input
              id="filter-box"
              type="search"
              className="jenkins-search__input"
              placeholder={
                t("Search plugin updates") ?? "Search plugin updates"
              }
              value={filterQuery}
              onChange={handleFilterChange}
              autoFocus
            />
          </div>
        </div>
        <div className="jenkins-app-bar__controls">
          {isAdmin && (
            <button
              id="button-update"
              type="submit"
              form="form"
              className="jenkins-button jenkins-button--primary"
              disabled={!hasSelection || isInstalling}
            >
              {t("Update") ?? "Update"}
            </button>
          )}
          <button
            type="button"
            className="jenkins-button"
            onClick={() => refetch()}
          >
            {t("Check now") ?? "Check now"}
          </button>
        </div>
      </div>

      {/* Form wrapping the table — matches updates.jelly line 62 */}
      <form
        id="form"
        method="post"
        action="install"
        onSubmit={handleSubmitUpdate}
      >
        {/* Hidden CSRF crumb field */}
        {crumbFieldName && crumbValue && (
          <input type="hidden" name={crumbFieldName} value={crumbValue} />
        )}

        <table id="plugins" className="jenkins-table sortable">
          <thead>
            <tr>
              {/* Checkbox column — admin only */}
              {isAdmin && (
                <th className="jenkins-table__cell--checkbox" data-sort-disable>
                  <div className="jenkins-checkbox">
                    <RowSelectionHeader
                      hasIncompatibleUpdates={hasIncompatibleUpdates}
                      onSelectAll={handleSelectAll}
                      onSelectNone={handleSelectNone}
                      onSelectCompatible={handleSelectCompatible}
                      tSelectAll={t("All") ?? "All"}
                      tSelectNone={t("None") ?? "None"}
                      tCompatible={t("Compatible") ?? "Compatible"}
                    />
                  </div>
                </th>
              )}
              {/* Name column — default sort direction down */}
              <th data-sort-dir="down">{t("Name") ?? "Name"}</th>
              {/* Released column */}
              <th>{t("Released") ?? "Released"}</th>
              {/* Installed column */}
              <th>{t("Installed") ?? "Installed"}</th>
              {/* Health score column — conditional */}
              {healthScoresAvailable && <th>{t("Health") ?? "Health"}</th>}
            </tr>
          </thead>
          <tbody>
            {filteredUpdates.map((plugin) => (
              <PluginUpdateRow
                key={plugin.name}
                plugin={plugin}
                isAdmin={isAdmin}
                healthScoresAvailable={healthScoresAvailable}
                isSelected={selectedPlugins.has(
                  `plugin.${plugin.name}.${plugin.sourceId}`,
                )}
                onCheckboxChange={handleCheckboxChange}
                t={t}
                buildUrl={buildUrl}
              />
            ))}
          </tbody>
        </table>
      </form>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Row Selection Header                                               */
/* ------------------------------------------------------------------ */

interface RowSelectionHeaderProps {
  hasIncompatibleUpdates: boolean;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSelectCompatible: () => void;
  tSelectAll: string;
  tSelectNone: string;
  tCompatible: string;
}

/**
 * Renders the row-selection controls in the checkbox column header.
 * Mirrors the RowSelectionController from updates.jelly lines 70-82.
 */
function RowSelectionHeader({
  hasIncompatibleUpdates,
  onSelectAll,
  onSelectNone,
  onSelectCompatible,
  tSelectAll,
  tSelectNone,
  tCompatible,
}: RowSelectionHeaderProps): React.JSX.Element {
  return (
    <div className="jenkins-table__cell--checkbox__controls">
      <button
        type="button"
        className="jenkins-button jenkins-button--tertiary"
        data-select="all"
        onClick={onSelectAll}
      >
        {tSelectAll}
      </button>
      <button
        type="button"
        className="jenkins-button jenkins-button--tertiary"
        data-select="none"
        onClick={onSelectNone}
      >
        {tSelectNone}
      </button>
      {hasIncompatibleUpdates && (
        <button
          type="button"
          className="jenkins-button jenkins-button--tertiary"
          data-select="compatible"
          onClick={onSelectCompatible}
        >
          {tCompatible}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Plugin Update Row                                                  */
/* ------------------------------------------------------------------ */

interface PluginUpdateRowProps {
  plugin: PluginUpdate;
  isAdmin: boolean;
  healthScoresAvailable: boolean;
  isSelected: boolean;
  onCheckboxChange: (key: string, checked: boolean) => void;
  t: (key: string) => string | null;
  buildUrl: (path: string) => string;
}

/**
 * Renders a single plugin update table row.
 * Matches updates.jelly lines 97-251 with all 7+ alert conditions.
 */
function PluginUpdateRow({
  plugin,
  isAdmin,
  healthScoresAvailable,
  isSelected,
  onCheckboxChange,
  t,
  buildUrl,
}: PluginUpdateRowProps): React.JSX.Element {
  const alreadyUpgraded = isAlreadyUpgraded(plugin);
  const compatWarning = !isCompatible(plugin);
  const checkboxKey = `plugin.${plugin.name}.${plugin.sourceId}`;

  /* Relative release time */
  const agoLabel = t("ago") ?? "{0} ago";
  const releaseTimeStr = plugin.releaseTimestamp
    ? getRelativeTime(plugin.releaseTimestamp.time, agoLabel)
    : "";

  return (
    <tr
      className={`plugin${alreadyUpgraded ? " already-upgraded" : ""}`}
      data-plugin-id={plugin.name}
    >
      {/* ---- Checkbox column ---- */}
      {isAdmin && (
        <td className="jenkins-table__cell--checkbox">
          <div className="jenkins-checkbox">
            <input
              type="checkbox"
              name={checkboxKey}
              className="app-checkbox-install-plugin"
              checked={alreadyUpgraded || isSelected}
              disabled={alreadyUpgraded}
              data-compat-warning={String(compatWarning)}
              onChange={(e) => onCheckboxChange(checkboxKey, e.target.checked)}
            />
            <label className="jenkins-checkbox__label">
              <span className="jenkins-visually-hidden">
                {plugin.displayName}
              </span>
            </label>
          </div>
        </td>
      )}

      {/* ---- Name column ---- */}
      <td className="details">
        <div>
          {/* Plugin name + version link */}
          <a
            href={plugin.wiki || "#"}
            className="jenkins-table__link"
            target="_blank"
            rel="noopener noreferrer"
          >
            {plugin.displayName}
            <span className="jenkins-label jenkins-label--tertiary">
              <span className="jenkins-visually-hidden">
                {t("Version") ?? "Version"}{" "}
              </span>
              {plugin.version}
            </span>
          </a>

          {/* Categories */}
          {plugin.categories && plugin.categories.length > 0 && (
            <div className="app-plugin-manager__categories">
              {plugin.categories.map((cat) => (
                <a
                  key={cat}
                  href={buildUrl(
                    `/pluginManager/available?filter=${encodeURIComponent(cat)}`,
                  )}
                  className="jenkins-badge"
                >
                  {cat}
                </a>
              ))}
            </div>
          )}

          {/* Excerpt (HTML output) */}
          {plugin.excerpt && (
            <div
              className="jenkins-plugin-excerpt"
              dangerouslySetInnerHTML={{ __html: plugin.excerpt }}
            />
          )}

          {/* ---- Alert conditions ---- */}

          {/* 1. Compatibility warning (updates.jelly lines 146-161) */}
          {!plugin.compatibleWithInstalledVersion && (
            <div className="jenkins-alert jenkins-alert--danger">
              <span>
                {t("compatWarning") ??
                  "Warning: This plugin is incompatible with the installed version."}
              </span>
              {plugin.incompatibleParentPlugins &&
                plugin.incompatibleParentPlugins.length > 0 && (
                  <ul>
                    {plugin.incompatibleParentPlugins.map((parent) => (
                      <li key={parent.displayName}>
                        <a
                          href={parent.wiki || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {parent.displayName}
                        </a>{" "}
                        ({parent.installed?.version ?? ""})
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          )}

          {/* 2. Newer core required (updates.jelly lines 163-165) */}
          {plugin.forNewerHudson && plugin.requiredCore && (
            <div className="jenkins-alert jenkins-alert--danger">
              <span>
                {(
                  t("coreWarning") ?? "This plugin requires Jenkins {0}"
                ).replace("{0}", plugin.requiredCore)}
              </span>
            </div>
          )}

          {/* 3. Security fix notice (updates.jelly lines 166-169) */}
          {plugin.fixesSecurityVulnerabilities && (
            <div className="jenkins-alert jenkins-alert--warning">
              <span>
                {t("fixesSecurityVulnerabilities") ??
                  "This update fixes security vulnerabilities."}
              </span>
            </div>
          )}

          {/* 4. Dependency compatibility warning (updates.jelly lines 170-191) */}
          {!plugin.neededDependenciesCompatibleWithInstalledVersion &&
            plugin.dependenciesIncompatibleWithInstalledVersion &&
            plugin.dependenciesIncompatibleWithInstalledVersion.length > 0 && (
              <div className="jenkins-alert jenkins-alert--danger">
                <span>
                  {t("depCompatWarning") ??
                    "Some dependencies are incompatible with currently installed versions:"}
                </span>
                <ul>
                  {plugin.dependenciesIncompatibleWithInstalledVersion.map(
                    (dep) => (
                      <li key={dep.displayName}>
                        <a
                          href={dep.wiki || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {dep.displayName}
                        </a>{" "}
                        ({dep.installed?.version ?? ""})
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}

          {/* 5. Dependencies require newer Jenkins (updates.jelly lines 192-194) */}
          {plugin.neededDependenciesForNewerJenkins &&
            plugin.neededDependenciesRequiredCore && (
              <div className="jenkins-alert jenkins-alert--danger">
                <span>
                  {(
                    t("depCoreWarning") ??
                    "Some dependencies require a newer version of Jenkins ({0})."
                  ).replace("{0}", plugin.neededDependenciesRequiredCore)}
                </span>
              </div>
            )}

          {/* 6. Security warnings (updates.jelly lines 195-204) */}
          {plugin.hasWarnings &&
            plugin.warnings &&
            plugin.warnings.length > 0 && (
              <div className="jenkins-alert jenkins-alert--danger">
                <span>
                  {t("securityWarning") ??
                    "Warning: This plugin has security warnings:"}
                </span>
                <ul>
                  {plugin.warnings.map((w, idx) => (
                    <li key={`${plugin.name}-warn-${idx}`}>
                      <a href={w.url} target="_blank" rel="noopener noreferrer">
                        {w.message}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* 7. Deprecation notice (updates.jelly lines 205-209) */}
          {plugin.deprecated && (
            <div className="jenkins-alert jenkins-alert--warning">
              <span>
                {t("deprecationWarning") ??
                  "This plugin has been marked as deprecated."}
                {plugin.deprecation?.url && (
                  <>
                    {" "}
                    <a
                      href={plugin.deprecation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("More info") ?? "More info"}
                    </a>
                  </>
                )}
              </span>
            </div>
          )}

          {/* 8. Adopt this plugin notice (updates.jelly lines 210-214) */}
          {plugin.hasAdoptThisPluginLabel && (
            <div className="jenkins-alert jenkins-alert--warning">
              <span>
                {t("adoptThisPlugin") ??
                  "This plugin is up for adoption. Want to help by becoming a maintainer?"}
              </span>
            </div>
          )}
        </div>
      </td>

      {/* ---- Released column ---- */}
      <td className="jenkins-table__cell--no-wrap">
        {plugin.releaseTimestamp ? (
          <time
            dateTime={plugin.releaseTimestamp.iso8601}
            title={plugin.releaseTimestamp.displayValue}
          >
            {releaseTimeStr}
          </time>
        ) : (
          <span>—</span>
        )}
      </td>

      {/* ---- Installed column ---- */}
      <td>
        {plugin.installed ? (
          plugin.installed.active ? (
            <span>{plugin.installed.version}</span>
          ) : (
            <span title={t("Inactive") ?? "Inactive"}>
              ({plugin.installed.version})
            </span>
          )
        ) : (
          <span>—</span>
        )}
      </td>

      {/* ---- Health score column (conditional) ---- */}
      {healthScoresAvailable && (
        <td>
          {plugin.healthScore != null ? (
            <a
              href={plugin.wiki ? `${plugin.wiki}/healthScore` : "#"}
              className={`jenkins-healthScore--badge ${
                plugin.healthScoreClass
                  ? `jenkins-healthScore--${plugin.healthScoreClass}`
                  : ""
              }`}
              target="_blank"
              rel="noopener noreferrer"
              title={`${
                t("healthTooltip") ?? "Health score"
              }: ${plugin.healthScore}%`}
            >
              {plugin.healthScore}%
            </a>
          ) : (
            <span
              className="jenkins-healthScore--badge jenkins-healthScore--aborted"
              title={
                t("No health score available") ?? "No health score available"
              }
            >
              —
            </span>
          )}
        </td>
      )}
    </tr>
  );
}
