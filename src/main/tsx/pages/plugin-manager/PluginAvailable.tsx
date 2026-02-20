/**
 * PluginAvailable — Available Plugins Search and Installation Page
 *
 * Replaces the entire available plugins page previously composed from:
 * - `core/src/main/resources/hudson/PluginManager/available.jelly` (page structure)
 * - `src/main/js/plugin-manager-ui.js` (search, debounced filtering, template rendering)
 * - `src/main/js/templates/plugin-manager/available.hbs` (plugin row Handlebars template)
 * - `core/src/main/resources/hudson/PluginManager/_table.js` (filter-box row toggling)
 *
 * The React component merges ALL four into a single typed component that manages
 * plugin search via React Query, displays results as table rows, and handles
 * batch installation via the split Install / Install-after-restart button.
 *
 * Key behaviors preserved:
 * - 150ms debounced search (matches plugin-manager-ui.js line 61)
 * - Checked plugin selection preservation across search updates (lines 22-38)
 * - Install button disabled when no plugins are checked (lines 86-110)
 * - Split button with "Install" (dynamic) and "Install after restart" actions
 * - Health score badges, security/deprecation/adoption alerts per row
 * - Category badge links, HTML excerpt rendering, release timestamps
 *
 * @module pages/plugin-manager/PluginAvailable
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { usePluginSearch, usePluginInstall } from '@/api/pluginManager';
import type { PluginInfo, PluginSearchResult } from '@/api/types';
import { useI18n } from '@/hooks/useI18n';
import { useCrumb } from '@/hooks/useCrumb';
import { useJenkinsNavigation } from '@/hooks/useJenkinsNavigation';
import Dropdown from '@/components/dropdowns/Dropdown';
import type { DropdownItem } from '@/components/dropdowns/Dropdown';

// ---------------------------------------------------------------------------
// Extended Plugin Type
// ---------------------------------------------------------------------------

/**
 * Extended plugin info returned by the `/pluginManager/pluginsSearch` endpoint.
 *
 * The base `PluginInfo` type covers the platform plugin list fields. The search
 * endpoint returns additional metadata for the available-plugins table including
 * display name, update-site source ID, category tags, security/deprecation
 * notices, release timestamps, and health score data.
 */
interface AvailablePluginInfo extends PluginInfo {
  /** Human-readable display name (falls back to `title` then `name`). */
  displayName?: string;
  /** Update-site source identifier — used in checkbox name: `plugin.{name}.{sourceId}`. */
  sourceId?: string;
  /** Array of category tags for badge rendering. */
  categories?: string[];
  /** Whether this plugin version requires a newer Jenkins core. */
  newerCoreRequired?: boolean;
  /** Unresolved security warnings with URL and descriptive message. */
  unresolvedSecurityWarnings?: Array<{ url: string; message: string }>;
  /** Whether this plugin is deprecated. */
  deprecated?: boolean;
  /** Whether this plugin is seeking adoption by a new maintainer. */
  adoptMe?: boolean;
  /** Release timestamp object containing ISO 8601 formatted date string. */
  releaseTimestamp?: { iso8601: string };
  /** Numeric health score (0–100). */
  healthScore?: number;
  /** CSS class suffix for health score badge styling (e.g., "A", "B", "C", "D", "E"). */
  healthScoreClass?: string;
}

// ---------------------------------------------------------------------------
// Props Interface
// ---------------------------------------------------------------------------

/**
 * Props for the `PluginAvailable` component.
 */
export interface PluginAvailableProps {
  /**
   * Whether the current user has admin permissions.
   * Controls visibility of the install checkbox column and install buttons.
   * Maps to `data-hasAdmin` from available.jelly line 75.
   */
  isAdmin?: boolean;
  /**
   * Whether health scores are available from the update center.
   * Controls visibility of the health score column.
   * Maps to `data-health` from available.jelly line 76.
   */
  healthScoresAvailable?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Debounce delay for search input in milliseconds (matches plugin-manager-ui.js line 61). */
const SEARCH_DEBOUNCE_MS = 150;

/** Maximum number of search results per query (matches plugin-manager-ui.js call to availablePluginsSearch). */
const SEARCH_RESULT_LIMIT = 50;

// ---------------------------------------------------------------------------
// SVG for aborted/missing health score icon (from available.hbs lines 80-87)
// ---------------------------------------------------------------------------
const ABORTED_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" class="svg-icon" viewBox="0 0 512 512"><circle cx="256" cy="256" r="256" fill="var(--crumb-background-color, currentColor)" opacity="0.6"/></svg>`;

// ---------------------------------------------------------------------------
// Helper: format relative time for release timestamps
// ---------------------------------------------------------------------------

/**
 * Formats a release timestamp for display. Uses the browser's `Intl` API
 * for locale-aware date formatting matching the original `<time>` element
 * rendering from available.hbs lines 63-71.
 */
function formatReleaseDate(iso8601: string): string {
  try {
    const date = new Date(iso8601);
    if (isNaN(date.getTime())) {
      return '';
    }
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Available Plugins page component — searches, displays, and installs plugins
 * from the Jenkins update center.
 *
 * Replaces the Jelly/JS/Handlebars rendering pipeline with React 19 hooks
 * for data fetching (`usePluginSearch`), mutation (`usePluginInstall`),
 * and declarative JSX rendering.
 */
export default function PluginAvailable({
  isAdmin = false,
  healthScoresAvailable = false,
}: PluginAvailableProps): React.JSX.Element {
  // -------------------------------------------------------------------------
  // Hooks
  // -------------------------------------------------------------------------
  const { t } = useI18n();
  const { crumbFieldName, crumbValue } = useCrumb();
  const { buildUrl } = useJenkinsNavigation();

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** Current search input value — updated on every keystroke for immediate UI feedback. */
  const [searchQuery, setSearchQuery] = useState<string>('');

  /** Debounced search query — updated 150ms after last keystroke for API calls. */
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');

  /**
   * Set of currently selected plugin identifiers (`plugin.{name}.{sourceId}`).
   * Preserves selections across search result updates, matching the original
   * behavior from plugin-manager-ui.js lines 22-38.
   */
  const [selectedPlugins, setSelectedPlugins] = useState<Set<string>>(new Set());

  /**
   * Tracks the most recent data snapshot so we can preserve previously loaded
   * plugins when preserving selections across searches.
   */
  const [previousPlugins, setPreviousPlugins] = useState<AvailablePluginInfo[]>([]);

  // -------------------------------------------------------------------------
  // API Hooks
  // -------------------------------------------------------------------------

  /**
   * React Query hook for plugin search.
   * GET /pluginManager/pluginsSearch?query={debouncedQuery}&limit=50
   * Disabled when query is empty (handled inside pluginsSearchQueryOptions).
   */
  const {
    data: searchData,
    isLoading,
    isFetching,
  } = usePluginSearch(debouncedQuery, SEARCH_RESULT_LIMIT);

  /**
   * React Query mutation for plugin installation.
   * POST /pluginManager/installPlugins with { dynamicLoad: true, plugins: [...] }
   */
  const {
    mutate: installPlugins,
    isPending: isInstalling,
  } = usePluginInstall();

  // -------------------------------------------------------------------------
  // 150ms Debounce Effect
  // Replaces lodash/debounce from plugin-manager-ui.js line 61
  // -------------------------------------------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.toLowerCase().trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // -------------------------------------------------------------------------
  // Track previously loaded plugins for selection preservation
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (searchData) {
      const plugins = (searchData as PluginSearchResult).plugins as AvailablePluginInfo[];
      setPreviousPlugins(plugins);
    }
  }, [searchData]);

  // -------------------------------------------------------------------------
  // Merged plugin list: preserves checked selections across search updates
  // Mirrors plugin-manager-ui.js lines 22-38 logic
  // -------------------------------------------------------------------------
  const displayPlugins = useMemo<AvailablePluginInfo[]>(() => {
    const currentResults = searchData
      ? ((searchData as PluginSearchResult).plugins as AvailablePluginInfo[])
      : [];

    if (selectedPlugins.size === 0) {
      return currentResults;
    }

    // Build a set of plugin names currently in search results
    const currentPluginIds = new Set(
      currentResults.map((p) => getPluginKey(p)),
    );

    // Find selected plugins NOT in current results — these need to be preserved
    // from the previous data snapshot (matches the original behavior where
    // checked rows are kept in the DOM when new results arrive)
    const preservedPlugins = previousPlugins.filter((p) => {
      const key = getPluginKey(p);
      return selectedPlugins.has(key) && !currentPluginIds.has(key);
    });

    return [...preservedPlugins, ...currentResults];
  }, [searchData, selectedPlugins, previousPlugins]);

  // -------------------------------------------------------------------------
  // Install button disabled state
  // Matches plugin-manager-ui.js lines 86-110: disabled when no checkboxes checked
  // -------------------------------------------------------------------------
  const hasSelectedPlugins = selectedPlugins.size > 0;

  // -------------------------------------------------------------------------
  // Dropdown items for the split button secondary action
  // -------------------------------------------------------------------------
  const installDropdownItems = useMemo<DropdownItem[]>(
    () => [
      {
        type: 'button' as const,
        label: t('Install after restart') ?? 'Install after restart',
        onClick: () => handleInstallAfterRestart(),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------

  /**
   * Handle search input changes.
   * Updates searchQuery immediately for UI; debouncedQuery updates after 150ms.
   */
  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [],
  );

  /**
   * Toggle a plugin's checkbox selection state.
   * Preserves selections across search updates by using a Set.
   */
  const handleCheckboxToggle = useCallback(
    (pluginKey: string) => {
      setSelectedPlugins((prev) => {
        const next = new Set(prev);
        if (next.has(pluginKey)) {
          next.delete(pluginKey);
        } else {
          next.add(pluginKey);
        }
        return next;
      });
    },
    [],
  );

  /**
   * Check or uncheck all visible plugins.
   * Matches the select-all checkbox behavior in available.jelly table header.
   */
  const handleCheckAll = useCallback(
    (checked: boolean) => {
      setSelectedPlugins((prev) => {
        const next = new Set(prev);
        for (const plugin of displayPlugins) {
          const key = getPluginKey(plugin);
          if (checked) {
            next.add(key);
          } else {
            next.delete(key);
          }
        }
        return next;
      });
    },
    [displayPlugins],
  );

  /**
   * Handle "Install" primary action — dynamic load via API.
   * Matches available.jelly line 45: `<button type="submit" name="dynamicLoad">`.
   * Sends selected plugin names to usePluginInstall mutation.
   */
  const handleInstall = useCallback(() => {
    if (selectedPlugins.size === 0) {
      return;
    }
    const pluginNames = extractPluginNames(selectedPlugins);
    installPlugins({ plugins: pluginNames });
  }, [selectedPlugins, installPlugins]);

  /**
   * Handle "Install after restart" — traditional form submission.
   * Matches available.jelly line 60: `<button type="submit" id="button-install-restart">`.
   * Submits the form with selected plugin checkbox names so Jenkins processes
   * the install on next restart.
   */
  const handleInstallAfterRestart = useCallback(() => {
    const formEl = document.getElementById('available-plugins-form') as HTMLFormElement | null;
    if (formEl) {
      formEl.submit();
    }
  }, []);

  /**
   * Handle "Check now" button — triggers update center refresh.
   * Matches `<st:include page="check.jelly"/>` from available.jelly line 67.
   */
  const handleCheckNow = useCallback(() => {
    const checkUrl = buildUrl('/pluginManager/checkUpdatesServer');
    window.location.assign(checkUrl);
  }, [buildUrl]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Determine if search is actively loading (for the loading indicator class)
  const isSearchActive = isFetching || isLoading;

  return (
    <div className="jenkins-plugin-manager__available">
      {/* ================================================================= */}
      {/* App Bar — Search + Install split button + Check now               */}
      {/* Matches available.jelly lines 29-70                               */}
      {/* ================================================================= */}
      <div className="jenkins-app-bar jenkins-app-bar--sticky">
        <div className="jenkins-app-bar__content">
          <div
            className={
              'jenkins-search jenkins-search--app-bar' +
              (isSearchActive ? ' jenkins-search--loading' : '')
            }
          >
            <input
              id="filter-box"
              type="search"
              className="jenkins-search__input"
              placeholder={t('Search available plugins') ?? 'Search available plugins'}
              value={searchQuery}
              onChange={handleSearch}
              autoComplete="off"
              role="searchbox"
              aria-label={t('Search available plugins') ?? 'Search available plugins'}
            />
          </div>
        </div>

        <div className="jenkins-app-bar__controls">
          {/* Install split button — available.jelly lines 44-67 */}
          {isAdmin && (
            <div className="jenkins-split-button">
              <button
                type="button"
                className="jenkins-button jenkins-button--primary"
                id="button-install"
                disabled={!hasSelectedPlugins || isInstalling}
                onClick={handleInstall}
              >
                {t('Install') ?? 'Install'}
              </button>
              <Dropdown
                items={installDropdownItems}
                placement="bottom-end"
                compact
              >
                <button
                  type="button"
                  className="jenkins-button jenkins-button--primary jenkins-split-button__dropdown-trigger"
                  disabled={!hasSelectedPlugins || isInstalling}
                  aria-label={t('More install options') ?? 'More install options'}
                >
                  <span className="jenkins-visually-hidden">
                    {t('More install options') ?? 'More install options'}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 512 512"
                    className="svg-icon"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M256 368L64 176h384z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </Dropdown>
            </div>
          )}

          {/* Check now button — available.jelly line 67 (<st:include page="check.jelly"/>) */}
          <button
            type="button"
            className="jenkins-button"
            onClick={handleCheckNow}
          >
            {t('Check now') ?? 'Check now'}
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Plugin Install Form                                               */}
      {/* Matches available.jelly line 73: <form id="form" method="post" action="install"> */}
      {/* ================================================================= */}
      <form
        id="available-plugins-form"
        method="post"
        action={buildUrl('/pluginManager/install')}
      >
        {/* CSRF crumb hidden field */}
        {crumbFieldName && crumbValue && (
          <input type="hidden" name={crumbFieldName} value={crumbValue} />
        )}

        {/* ============================================================= */}
        {/* Plugins Table                                                  */}
        {/* Matches available.jelly lines 74-101                           */}
        {/* ============================================================= */}
        <table
          id="plugins"
          className="jenkins-table sortable"
          data-hasadmin={isAdmin ? 'true' : undefined}
          data-health={healthScoresAvailable ? 'true' : undefined}
        >
          <thead>
            <tr>
              {/* Install checkbox header — available.jelly lines 78-82 */}
              {isAdmin && (
                <th className="jenkins-table__cell--checkbox" data-sort-disable="true">
                  <div className="jenkins-checkbox">
                    <input
                      type="checkbox"
                      id="select-all"
                      onChange={(e) => handleCheckAll(e.target.checked)}
                      checked={
                        displayPlugins.length > 0 &&
                        displayPlugins.every((p) =>
                          selectedPlugins.has(getPluginKey(p)),
                        )
                      }
                      aria-label={t('Select all plugins') ?? 'Select all plugins'}
                    />
                    <label htmlFor="select-all" className="jenkins-visually-hidden">
                      {t('Select all') ?? 'Select all'}
                    </label>
                  </div>
                </th>
              )}

              {/* Name column header — available.jelly line 84 */}
              <th data-sort-dir="down">
                {t('Name') ?? 'Name'}
              </th>

              {/* Released column header — available.jelly line 88 */}
              <th>
                {t('Released') ?? 'Released'}
              </th>

              {/* Health score column header — available.jelly lines 89-94 */}
              {healthScoresAvailable && (
                <th>
                  <span title={t('Popularity of the plugin') ?? 'Popularity of the plugin'}>
                    {t('Popularity') ?? 'Popularity'}
                  </span>
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {displayPlugins.map((plugin) => (
              <PluginRow
                key={plugin.name}
                plugin={plugin}
                isAdmin={isAdmin}
                healthScoresAvailable={healthScoresAvailable}
                isSelected={selectedPlugins.has(getPluginKey(plugin))}
                onToggle={handleCheckboxToggle}
                t={t}
              />
            ))}

            {/* Empty state when no results and not loading */}
            {!isSearchActive && displayPlugins.length === 0 && debouncedQuery.length > 0 && (
              <tr>
                <td
                  colSpan={
                    (isAdmin ? 1 : 0) + 2 + (healthScoresAvailable ? 1 : 0)
                  }
                  className="jenkins-table__cell--no-results"
                >
                  {t('No available plugins match your search.') ?? 'No available plugins match your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Generates a unique key for a plugin used as the checkbox identifier.
 * Matches the checkbox name pattern from available.hbs line 6:
 *   `name="plugin.{name}.{sourceId}"`
 *
 * @param plugin - The plugin info object.
 * @returns Unique plugin key string.
 */
function getPluginKey(plugin: AvailablePluginInfo): string {
  const sourceId = plugin.sourceId ?? 'default';
  return `plugin.${plugin.name}.${sourceId}`;
}

/**
 * Extracts plugin names from the selectedPlugins Set.
 * The Set contains keys in "plugin.{name}.{sourceId}" format;
 * this function extracts the {name} portion for the install API.
 *
 * @param selectedKeys - Set of plugin keys.
 * @returns Array of plugin short names.
 */
function extractPluginNames(selectedKeys: Set<string>): string[] {
  return Array.from(selectedKeys).map((key) => {
    // Key format: "plugin.{name}.{sourceId}"
    const parts = key.split('.');
    // Return the name portion (index 1) — everything between first and last dot
    return parts.length >= 3 ? parts.slice(1, -1).join('.') : parts[1] ?? key;
  });
}

// ---------------------------------------------------------------------------
// PluginRow Sub-Component
// ---------------------------------------------------------------------------

/**
 * Props for the individual plugin table row component.
 */
interface PluginRowProps {
  plugin: AvailablePluginInfo;
  isAdmin: boolean;
  healthScoresAvailable: boolean;
  isSelected: boolean;
  onToggle: (key: string) => void;
  t: (key: string) => string | null;
}

/**
 * Renders a single plugin row in the available plugins table.
 *
 * Replaces the available.hbs Handlebars template (lines 1-91) with
 * typed JSX, preserving all visual elements: checkbox, name/version/categories,
 * excerpt, security/deprecation/adoption alerts, release timestamp, and
 * health score badge.
 */
function PluginRow({
  plugin,
  isAdmin,
  healthScoresAvailable,
  isSelected,
  onToggle,
  t,
}: PluginRowProps): React.JSX.Element {
  const pluginKey = getPluginKey(plugin);
  const displayName = plugin.displayName ?? plugin.title ?? plugin.name;
  const categories = plugin.categories ?? (plugin.category ? [plugin.category] : []);

  return (
    <tr data-plugin-id={plugin.name} data-plugin-version={plugin.version}>
      {/* ================================================================= */}
      {/* Checkbox column — available.hbs lines 3-10                        */}
      {/* ================================================================= */}
      {isAdmin && (
        <td className="jenkins-table__cell--checkbox">
          <div className="jenkins-checkbox">
            <input
              type="checkbox"
              name={pluginKey}
              checked={isSelected}
              onChange={() => onToggle(pluginKey)}
              id={`checkbox-${plugin.name}`}
            />
            <label
              htmlFor={`checkbox-${plugin.name}`}
              className="jenkins-visually-hidden"
            >
              {displayName}
            </label>
          </div>
        </td>
      )}

      {/* ================================================================= */}
      {/* Plugin info column — available.hbs lines 12-61                    */}
      {/* ================================================================= */}
      <td>
        {/* Plugin name + version label — available.hbs lines 12-18 */}
        <div>
          {plugin.wiki ? (
            <a
              href={plugin.wiki}
              className="jenkins-table__link"
              target="_blank"
              rel="noopener noreferrer"
            >
              {displayName}
            </a>
          ) : (
            <span className="jenkins-table__link">{displayName}</span>
          )}
          {plugin.version && (
            <span className="jenkins-label jenkins-label--tertiary">
              <span className="jenkins-visually-hidden">
                {t('Version') ?? 'Version'}:{' '}
              </span>
              {plugin.version}
            </span>
          )}
        </div>

        {/* Category badges — available.hbs lines 19-27 */}
        {categories.length > 0 && (
          <div className="app-plugin-manager__categories">
            {categories.map((cat) => (
              <a
                key={cat}
                href={`?filter=${encodeURIComponent(cat)}`}
                className="jenkins-badge"
              >
                {cat}
              </a>
            ))}
          </div>
        )}

        {/* Excerpt — available.hbs lines 28-32 (triple-mustache for HTML) */}
        {plugin.excerpt && (
          <div
            className="app-plugin-manager__excerpt"
            // Excerpt HTML comes from the Jenkins update center (trusted source).
            // Replaces Handlebars triple-mustache {{{ excerpt }}} rendering.
            dangerouslySetInnerHTML={{ __html: plugin.excerpt }}
          />
        )}

        {/* ============================================================= */}
        {/* Alert sections — available.hbs lines 33-61                     */}
        {/* ============================================================= */}

        {/* Newer core required alert — available.hbs lines 33-37 */}
        {plugin.newerCoreRequired && (
          <div className="jenkins-alert jenkins-alert-danger" role="alert">
            <span>
              {t('This plugin version requires a newer version of Jenkins.') ??
                'This plugin version requires a newer version of Jenkins.'}
            </span>
          </div>
        )}

        {/* Unresolved security warnings — available.hbs lines 38-51 */}
        {plugin.unresolvedSecurityWarnings &&
          plugin.unresolvedSecurityWarnings.length > 0 && (
            <div className="jenkins-alert jenkins-alert-danger" role="alert">
              <span>
                {t('Warning: This plugin has unresolved security vulnerabilities.') ??
                  'Warning: This plugin has unresolved security vulnerabilities.'}
              </span>
              <ul>
                {plugin.unresolvedSecurityWarnings.map((warning, idx) => (
                  <li key={idx}>
                    <a
                      href={warning.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {warning.message}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

        {/* Deprecation notice — available.hbs lines 52-56 */}
        {plugin.deprecated && (
          <div className="jenkins-alert jenkins-alert-warning" role="alert">
            <span>
              {t('Deprecated: This plugin has been marked as deprecated.') ??
                'Deprecated: This plugin has been marked as deprecated.'}
            </span>
          </div>
        )}

        {/* Adopt-this-plugin notice — available.hbs lines 57-61 */}
        {plugin.adoptMe && (
          <div className="jenkins-alert jenkins-alert-warning" role="alert">
            <span>
              {t('This plugin is up for adoption! Volunteer to be a maintainer.') ??
                'This plugin is up for adoption! Volunteer to be a maintainer.'}
            </span>
          </div>
        )}
      </td>

      {/* ================================================================= */}
      {/* Release timestamp column — available.hbs lines 63-71             */}
      {/* ================================================================= */}
      <td className="jenkins-table__cell--tight">
        {plugin.releaseTimestamp?.iso8601 ? (
          <time dateTime={plugin.releaseTimestamp.iso8601}>
            {formatReleaseDate(plugin.releaseTimestamp.iso8601)}
          </time>
        ) : (
          <span>{t('N/A') ?? 'N/A'}</span>
        )}
      </td>

      {/* ================================================================= */}
      {/* Health score column — available.hbs lines 72-89                   */}
      {/* ================================================================= */}
      {healthScoresAvailable && (
        <td className="jenkins-table__cell--tight">
          {plugin.healthScore != null ? (
            <a
              href={plugin.wiki ? `${plugin.wiki}/healthScore` : '#'}
              className={`jenkins-healthScore--badge jenkins-healthScore--${plugin.healthScoreClass ?? 'unknown'}`}
              title={`${plugin.healthScore} out of 100 (${plugin.healthScoreClass ?? 'unknown'})`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {plugin.healthScore}
            </a>
          ) : (
            <span
              className="jenkins-healthScore--badge jenkins-healthScore--na"
              title={t('Health score not available') ?? 'Health score not available'}
              dangerouslySetInnerHTML={{ __html: ABORTED_ICON_SVG }}
            />
          )}
        </td>
      )}
    </tr>
  );
}
