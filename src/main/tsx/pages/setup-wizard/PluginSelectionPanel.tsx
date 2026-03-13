import {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  Fragment,
} from "react";
import type { PluginInfo } from "../../api/types";

/**
 * Converts a string to a CSS-safe ID by replacing non-word characters
 * with underscores. Replaces the Handlebars {{id}} helper from
 * handlebars-helpers/id.js.
 */
function idify(str: string): string {
  return String(str).replace(/\W+/g, "_");
}

/**
 * Strips HTML tags from a string, returning plain text content.
 * Used for case-insensitive text search through plugin excerpts
 * that contain HTML markup (triple-mustache pattern).
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/**
 * Extended PluginInfo with runtime-computed fields.
 * - allDependencies: string[] of transitive dependency names (including self),
 *   populated by getAllDependencies() in pluginSetupWizardGui.js line 715.
 * - website: alias for the url field used in Handlebars templates.
 */
interface ExtendedPluginInfo extends PluginInfo {
  allDependencies?: string[];
  website?: string;
}

/**
 * A single entry in the categorizedPlugins map.
 * Each entry pairs a category name with its plugin info object.
 * Source: pluginSetupWizardGui.js loadPluginCategories() lines 722-750.
 */
interface CategorizedPlugin {
  category: string;
  plugin: ExtendedPluginInfo;
}

/**
 * Props for the PluginSelectionPanel component.
 * 9 members as specified in the schema's members_exposed.
 */
export interface PluginSelectionPanelProps {
  /** Localized translation strings keyed by translation key */
  translations: Record<string, string>;
  /** Ordered list of plugin category names */
  categories: string[];
  /** Map of category name to array of categorized plugin entries */
  categorizedPlugins: Record<string, CategorizedPlugin[]>;
  /** Currently selected plugin name strings */
  selectedPluginNames: string[];
  /** All available plugin name strings */
  allPluginNames: string[];
  /** Map of plugin name to PluginInfo (with runtime-extended fields) */
  availablePlugins: Record<string, PluginInfo>;
  /** Callback when the selection set changes */
  onSelectionChange: (selectedPlugins: string[]) => void;
  /** Callback when the user clicks the install button */
  onInstall: (selectedPlugins: string[]) => void;
  /** Callback when the user clicks the go-back button */
  onGoBack: () => void;
}

/**
 * PluginSelectionPanel — Plugin selection step of the Jenkins setup wizard.
 *
 * Replaces:
 *  - pluginSelectionPanel.hbs (41 lines)
 *  - pluginSelectList.hbs (35 lines)
 *  - Plugin selection logic from pluginSetupWizardGui.js (lines 38-116, 722-995)
 *
 * Renders the custom plugin install picker with category navigation,
 * search/filter, selection controls, and a scrollable plugin list with
 * checkboxes, dependency badges, and HTML excerpts.
 */
export default function PluginSelectionPanel({
  translations,
  categories,
  categorizedPlugins,
  selectedPluginNames,
  allPluginNames,
  availablePlugins,
  onSelectionChange,
  onInstall,
  onGoBack,
}: PluginSelectionPanelProps): React.JSX.Element {
  // ─── State ───────────────────────────────────────────────────
  const [searchText, setSearchText] = useState("");
  const [visibleDependencies, setVisibleDependencies] = useState<
    Record<string, boolean>
  >({});

  // ─── Refs ────────────────────────────────────────────────────
  const pluginListRef = useRef<HTMLDivElement>(null);

  // ─── Computed: Plugin count per category ─────────────────────
  // Replaces pluginCountForCategory Handlebars helper
  // Source: pluginSetupWizardGui.js lines 38-52
  const getPluginCountForCategory = useCallback(
    (cat: string): string => {
      const plugs = categorizedPlugins[cat] || [];
      let total = 0;
      let selected = 0;
      for (const entry of plugs) {
        if (entry.category === cat) {
          total++;
          if (selectedPluginNames.includes(entry.plugin.name)) {
            selected++;
          }
        }
      }
      return `(${selected}/${total})`;
    },
    [categorizedPlugins, selectedPluginNames],
  );

  // ─── Computed: Total plugin count ────────────────────────────
  // Replaces totalPluginCount Handlebars helper
  // Source: pluginSetupWizardGui.js lines 55-69
  const totalPluginCount = useMemo((): string => {
    let total = 0;
    let selected = 0;
    for (const cat of Object.keys(categorizedPlugins)) {
      const plugs = categorizedPlugins[cat];
      for (const entry of plugs) {
        total++;
        if (selectedPluginNames.includes(entry.plugin.name)) {
          selected++;
        }
      }
    }
    return `${selected}/${total}`;
  }, [categorizedPlugins, selectedPluginNames]);

  // ─── Computed: Recommended plugin names ──────────────────────
  const recommendedPluginNames = useMemo((): string[] => {
    return Object.values(availablePlugins)
      .filter((p) => p.suggested)
      .map((p) => p.name);
  }, [availablePlugins]);

  // ─── Search State ────────────────────────────────────────────
  const isSearching = searchText.length > 1;

  // Compute matching plugins and categories for search filtering
  // Replaces searchForPlugins() from pluginSetupWizardGui.js lines 880-917
  const { matchingPluginNames, matchingCategories } = useMemo(() => {
    if (!isSearching) {
      return {
        matchingPluginNames: new Set<string>(),
        matchingCategories: new Set<string>(),
      };
    }

    const pluginMatches = new Set<string>();
    const catMatches = new Set<string>();

    if (searchText === "show:selected") {
      // Special search: show only selected plugins
      // Source: pluginSetupWizardGui.js lines 889-890
      for (const cat of Object.keys(categorizedPlugins)) {
        for (const entry of categorizedPlugins[cat]) {
          if (selectedPluginNames.includes(entry.plugin.name)) {
            pluginMatches.add(entry.plugin.name);
            catMatches.add(cat);
          }
        }
      }
    } else {
      // Text search through plugin titles and descriptions
      // Source: pluginSetupWizardGui.js lines 892-916
      const lowerQuery = searchText.toLowerCase();
      for (const cat of Object.keys(categorizedPlugins)) {
        for (const entry of categorizedPlugins[cat]) {
          const titleMatch = (entry.plugin.title || "")
            .toLowerCase()
            .includes(lowerQuery);
          const excerptText = stripHtmlTags(entry.plugin.excerpt || "");
          const excerptMatch = excerptText.toLowerCase().includes(lowerQuery);
          if (titleMatch || excerptMatch) {
            pluginMatches.add(entry.plugin.name);
            catMatches.add(cat);
          }
        }
      }
    }

    return {
      matchingPluginNames: pluginMatches,
      matchingCategories: catMatches,
    };
  }, [isSearching, searchText, categorizedPlugins, selectedPluginNames]);

  // ─── Dependency Helpers ──────────────────────────────────────
  // Replaces hasDependencies, dependencyCount, eachDependency helpers
  // Source: pluginSetupWizardGui.js lines 79-116

  /** Look up extended plugin info by name */
  const getExtendedPlugin = useCallback(
    (pluginName: string): ExtendedPluginInfo | undefined => {
      return availablePlugins[pluginName] as ExtendedPluginInfo | undefined;
    },
    [availablePlugins],
  );

  /** Get all transitive dependency names (including self) for a plugin */
  const getAllDeps = useCallback(
    (pluginName: string): string[] => {
      const plug = getExtendedPlugin(pluginName);
      return plug?.allDependencies || [];
    },
    [getExtendedPlugin],
  );

  /**
   * Check if a plugin has dependencies beyond itself.
   * Source: pluginSetupWizardGui.js lines 79-85
   */
  const hasDeps = useCallback(
    (pluginName: string): boolean => {
      return getAllDeps(pluginName).length > 1;
    },
    [getAllDeps],
  );

  /**
   * Get dependency count excluding self.
   * Source: pluginSetupWizardGui.js lines 88-94
   */
  const getDependencyCount = useCallback(
    (pluginName: string): number => {
      return Math.max(0, getAllDeps(pluginName).length - 1);
    },
    [getAllDeps],
  );

  /**
   * Get dependency plugin objects excluding self.
   * Source: pluginSetupWizardGui.js lines 97-116
   */
  const getDependencies = useCallback(
    (pluginName: string): ExtendedPluginInfo[] => {
      return getAllDeps(pluginName)
        .filter((depName) => depName !== pluginName)
        .map((depName) => getExtendedPlugin(depName))
        .filter((dep): dep is ExtendedPluginInfo => dep != null);
    },
    [getAllDeps, getExtendedPlugin],
  );

  // ─── Event Handlers ──────────────────────────────────────────

  /**
   * Checkbox change handler — add or remove plugin from selection.
   * Source: pluginSetupWizardGui.js lines 796-805
   */
  const handleCheckboxChange = useCallback(
    (pluginName: string, checked: boolean) => {
      if (checked) {
        onSelectionChange([...selectedPluginNames, pluginName]);
      } else {
        onSelectionChange(selectedPluginNames.filter((n) => n !== pluginName));
      }
    },
    [selectedPluginNames, onSelectionChange],
  );

  /**
   * Select all plugins.
   * Source: pluginSetupWizardGui.js line 1252-1254
   */
  const handleSelectAll = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onSelectionChange([...allPluginNames]);
    },
    [allPluginNames, onSelectionChange],
  );

  /**
   * Select no plugins.
   * Source: pluginSetupWizardGui.js line 1255-1257
   */
  const handleSelectNone = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onSelectionChange([]);
    },
    [onSelectionChange],
  );

  /**
   * Select recommended plugins only.
   * Source: pluginSetupWizardGui.js line 1258-1261
   */
  const handleSelectRecommended = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onSelectionChange([...recommendedPluginNames]);
    },
    [recommendedPluginNames, onSelectionChange],
  );

  /**
   * Search input change handler.
   * Source: pluginSetupWizardGui.js lines 880-917
   */
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchText(e.target.value);
    },
    [],
  );

  /**
   * Clear search input.
   * Source: pluginSetupWizardGui.js lines 962-965
   */
  const handleClearSearch = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setSearchText("");
  }, []);

  /**
   * Toggle "show:selected" search mode.
   * Source: pluginSetupWizardGui.js lines 968-976
   */
  const handleToggleSelectedSearch = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (isSearching && searchText === "show:selected") {
        setSearchText("");
      } else {
        setSearchText("show:selected");
      }
    },
    [isSearching, searchText],
  );

  /**
   * Category click — clears search and scrolls to the category heading.
   * Source: pluginSetupWizardGui.js lines 979-995
   */
  const handleCategoryClick = useCallback(
    (e: React.MouseEvent, category: string) => {
      e.preventDefault();
      setSearchText("");
      const pluginList = pluginListRef.current;
      if (pluginList) {
        const headingId = idify(category);
        const heading = pluginList.querySelector(`#${CSS.escape(headingId)}`);
        if (heading && typeof heading.scrollIntoView === "function") {
          heading.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    },
    [],
  );

  /**
   * Toggle dependency list visibility for a plugin.
   * Source: pluginSetupWizardGui.js lines 434-448
   */
  const handleToggleDependencyList = useCallback(
    (e: React.MouseEvent, pluginName: string) => {
      e.preventDefault();
      e.stopPropagation();
      setVisibleDependencies((prev) => ({
        ...prev,
        [pluginName]: !prev[pluginName],
      }));
    },
    [],
  );

  /** Install button click — delegates to parent with current selection */
  const handleInstall = useCallback(() => {
    onInstall(selectedPluginNames);
  }, [selectedPluginNames, onInstall]);

  /** Go back button click — delegates to parent */
  const handleGoBack = useCallback(() => {
    onGoBack();
  }, [onGoBack]);

  // ─── Keyboard Navigation ────────────────────────────────────
  // Replaces pluginSetupWizardGui.js lines 931-959
  useEffect(() => {
    const pluginList = pluginListRef.current;
    if (!pluginList) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") {
        return;
      }
      e.preventDefault();

      // When searching, only .match plugins are navigable
      const selector = isSearching
        ? '.plugin.match input[type="checkbox"]'
        : '.plugin input[type="checkbox"]';

      const checkboxes = Array.from(
        pluginList.querySelectorAll<HTMLInputElement>(selector),
      );

      if (checkboxes.length === 0) {
        return;
      }

      const focusedIdx = checkboxes.findIndex(
        (cb) => cb === document.activeElement,
      );

      let newIdx: number;
      if (e.key === "ArrowUp") {
        newIdx = focusedIdx > 0 ? focusedIdx - 1 : 0;
      } else {
        newIdx =
          focusedIdx < checkboxes.length - 1
            ? focusedIdx + 1
            : checkboxes.length - 1;
      }

      checkboxes[newIdx]?.focus();
    };

    pluginList.addEventListener("keydown", handleKeyDown);
    return () => {
      pluginList.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSearching]);

  // ─── Scroll to first match when search changes ──────────────
  useEffect(() => {
    if (!isSearching) {
      return;
    }
    const pluginList = pluginListRef.current;
    if (!pluginList) {
      return;
    }

    requestAnimationFrame(() => {
      const firstMatch = pluginList.querySelector(".plugin.match");
      if (firstMatch && typeof firstMatch.scrollIntoView === "function") {
        firstMatch.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  }, [isSearching, searchText]);

  // ─── Computed: Data attribute for selected plugin names ──────
  const selectedPluginsDataAttr = selectedPluginNames.join(",");

  // ─── Render ──────────────────────────────────────────────────
  return (
    <>
      {/* Modal Header — pluginSelectionPanel.hbs lines 1-3 */}
      <div className="modal-header closeable">
        <h4 className="modal-title">
          {translations.installWizard_installCustom_title || ""}
        </h4>
      </div>

      {/* Modal Body — pluginSelectionPanel.hbs lines 4-31 */}
      <div className="modal-body plugin-selector">
        {/* Category Sidebar — pluginSelectionPanel.hbs lines 5-11 */}
        <div className="categories col-sm-3">
          <ul className="nav">
            {categories.map((cat) => (
              <li key={cat}>
                <a
                  href={`#${idify(cat)}`}
                  className="select-category"
                  onClick={(e) => handleCategoryClick(e, cat)}
                >
                  {cat}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Plugins Panel — pluginSelectionPanel.hbs lines 12-31 */}
        <div className="plugins col-sm-9">
          {/* Controls bar — pluginSelectionPanel.hbs lines 13-26 */}
          <div className="plugin-select-controls">
            {/* Selection actions — pluginSelectionPanel.hbs lines 14-18 */}
            <span className="plugin-select-actions">
              <a
                href="#"
                className="plugin-select-all"
                onClick={handleSelectAll}
              >
                {translations.installWizard_installCustom_selectAll || ""}
              </a>
              <a
                href="#"
                className="plugin-select-none"
                onClick={handleSelectNone}
              >
                {translations.installWizard_installCustom_selectNone || ""}
              </a>
              <a
                href="#"
                className="plugin-select-recommended"
                onClick={handleSelectRecommended}
              >
                {translations.installWizard_installCustom_selectRecommended ||
                  ""}
              </a>
            </span>

            {/* Search controls — pluginSelectionPanel.hbs lines 19-22 */}
            <span className="plugin-search-controls">
              <input
                type="text"
                name="searchbox"
                className="form-control"
                value={searchText}
                onChange={handleSearchChange}
              />
              <a href="#" className="clear-search" onClick={handleClearSearch}>
                &times;
              </a>
            </span>

            {/* Selected plugin count — pluginSelectionPanel.hbs lines 23-25 */}
            <span
              id="plugin-selected-info"
              className="plugin-selected-info"
              data-selected-plugins={selectedPluginsDataAttr}
            >
              <a
                href="#"
                className="plugin-show-selected"
                onClick={handleToggleSelectedSearch}
              >
                {translations.installWizard_installCustom_selected || ""}
              </a>{" "}
              {totalPluginCount}
            </span>
          </div>

          {/* Plugin List — pluginSelectionPanel.hbs lines 27-30 */}
          <div
            ref={pluginListRef}
            className={`plugin-list${isSearching ? " searching" : ""}`}
          >
            {/* Plugin list description — pluginSelectionPanel.hbs line 28 */}
            <div
              className="plugin-list-description"
              dangerouslySetInnerHTML={{
                __html:
                  translations.installWizard_installCustom_pluginListDesc || "",
              }}
            />

            {/* Categorized plugin rows — pluginSelectList.hbs */}
            {Object.keys(categorizedPlugins).map((cat) => {
              const isCatMatch = !isSearching || matchingCategories.has(cat);
              return (
                <Fragment key={cat}>
                  {/* Category heading — pluginSelectList.hbs line 2 */}
                  <h2
                    id={idify(cat)}
                    className={`expanded${isSearching && isCatMatch ? " match" : ""}`}
                  >
                    {cat} {getPluginCountForCategory(cat)}
                  </h2>

                  {/* Plugin rows for category — pluginSelectList.hbs lines 3-33 */}
                  <div className="plugins-for-category">
                    {categorizedPlugins[cat].map((entry) => {
                      const plugin = entry.plugin;
                      const pluginName = plugin.name;
                      const isSelected =
                        selectedPluginNames.includes(pluginName);
                      const isMatch =
                        !isSearching || matchingPluginNames.has(pluginName);
                      const showDeps = visibleDependencies[pluginName] || false;
                      const pluginHasDeps = hasDeps(pluginName);
                      const depCount = getDependencyCount(pluginName);
                      const deps = pluginHasDeps
                        ? getDependencies(pluginName)
                        : [];
                      // plugin.url or plugin.website for the website link
                      const websiteUrl = plugin.url || plugin.website || "";

                      return (
                        <div
                          key={pluginName}
                          className={[
                            "plugin",
                            idify(pluginName),
                            isSelected ? "selected" : "",
                            showDeps ? "show-dependencies" : "",
                            isSearching && isMatch ? "match" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          id={`row-${pluginName}`}
                        >
                          <label>
                            {/* Title row — pluginSelectList.hbs lines 7-11 */}
                            <span className="title">
                              <input
                                type="checkbox"
                                id={`chk-${pluginName}`}
                                name={pluginName}
                                checked={isSelected}
                                onChange={(e) =>
                                  handleCheckboxChange(
                                    pluginName,
                                    e.target.checked,
                                  )
                                }
                              />
                              {plugin.title || pluginName}
                              <a
                                href={websiteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="website-link"
                                title={`${plugin.title || pluginName} ${translations.installWizard_websiteLinkLabel || ""}`}
                              />
                            </span>

                            {/* Dependency badge — pluginSelectList.hbs lines 12-16 */}
                            {pluginHasDeps && (
                              <a
                                href="#"
                                className="btn btn-link toggle-dependency-list"
                                data-plugin-name={pluginName}
                                title={`${plugin.title || pluginName} ${translations.installWizard_installIncomplete_dependenciesLabel || ""}`}
                                onClick={(e) =>
                                  handleToggleDependencyList(e, pluginName)
                                }
                              >
                                <span className="badge">{depCount}</span>
                              </a>
                            )}

                            {/* Plugin excerpt — pluginSelectList.hbs lines 17-19 */}
                            <span
                              className="description"
                              dangerouslySetInnerHTML={{
                                __html: plugin.excerpt || "",
                              }}
                            />

                            {/* Dependency list — pluginSelectList.hbs lines 20-29 */}
                            {pluginHasDeps && (
                              <div className="dep-list">
                                <h3 className="dep-title">
                                  {translations.installWizard_installIncomplete_dependenciesLabel ||
                                    ""}
                                </h3>
                                {deps.map((dep) => (
                                  <a
                                    key={dep.name}
                                    className="dep badge"
                                    href={dep.url || dep.website || ""}
                                    rel="noopener noreferrer"
                                    target="_blank"
                                  >
                                    {dep.title || dep.name}
                                  </a>
                                ))}
                              </div>
                            )}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal Footer — pluginSelectionPanel.hbs lines 33-40 */}
      <div className="modal-footer">
        <button
          type="button"
          className="btn btn-link install-home"
          onClick={handleGoBack}
        >
          {translations.installWizard_goBack || ""}
        </button>
        <button
          type="button"
          className="btn btn-primary install-selected"
          onClick={handleInstall}
        >
          {translations.installWizard_goInstall || ""}
        </button>
      </div>
    </>
  );
}
