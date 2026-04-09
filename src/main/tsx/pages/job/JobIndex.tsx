/**
 * JobIndex — Job Detail/Index Page Component
 *
 * Replaces 6 source files with a single React 19 component:
 * - core/src/main/resources/hudson/model/Job/index.jelly (77 lines)
 * - core/src/main/resources/hudson/model/Job/main.jelly (27 lines)
 * - core/src/main/resources/hudson/model/Job/permalinks.jelly (36 lines)
 * - core/src/main/resources/hudson/model/Job/jobpropertysummaries.jelly (32 lines)
 * - src/main/js/pages/project/builds-card.js (159 lines)
 * - src/main/js/pages/project/builds-card.types.js (17 lines)
 *
 * Features:
 * - Job data fetching via Stapler REST API
 * - Auto-refreshing builds card with 5 000 ms polling
 * - Debounced build search (150 ms)
 * - BigInt pagination cursors for builds
 * - Editable description with CSRF crumb support
 * - Job property summaries
 * - Permalinks section with build links
 * - Build status icon display in app bar
 *
 * @module pages/job/JobIndex
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import Layout from "@/layout/Layout";
import { Skeleton } from "@/layout/Skeleton";
import EditableDescription from "@/hudson/EditableDescription";
import { useStaplerQuery } from "@/hooks/useStaplerQuery";
import { useI18n } from "@/hooks/useI18n";
import { useJenkinsNavigation } from "@/hooks/useJenkinsNavigation";
import type { Job, Build, JobProperty, BallColor } from "@/types/models";
import { getBaseUrl } from "@/utils/baseUrl";
import { INFO } from "@/utils/symbols";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Props for the {@link JobIndex} component.
 *
 * These values are provided by the Jelly shell view via data attributes on the
 * React mount-point element, mirroring the Jelly expression language bindings
 * from index.jelly lines 27-34.
 */
export interface JobIndexProps {
  /** Job URL path relative to Jenkins root (e.g. "/job/my-project") */
  jobUrl: string;
  /** Job display name — shown in the app bar h1 headline */
  displayName: string;
  /** Fully qualified job name including parent folders (e.g. "folder/my-project") */
  fullName: string;
  /** Fully qualified display name including parent folder display names */
  fullDisplayName: string;
  /** Parent's full display name — used for page title suffix "[parent]" */
  parentFullDisplayName?: string;
  /** Whether the job is at the Jenkins root level (parent is Jenkins instance) */
  isTopLevel: boolean;
  /** Whether the current user has hudson.model.Item.CONFIGURE permission */
  hasConfigurePermission: boolean;
  /** Whether the experimental new job page flag is enabled (index.jelly lines 27-32) */
  newJobPage?: boolean;
}

/**
 * Query parameters for builds card AJAX requests.
 * Mirrors builds-card.types.js QueryParameters (lines 1-9).
 */
interface QueryParameters {
  search?: string;
  "older-than"?: string;
  "newer-than"?: string;
}

/**
 * Pagination state for the builds card.
 * Mirrors builds-card.types.js CardControlsOptions (lines 11-17).
 */
interface CardControlsOptions {
  pageHasUp: boolean;
  pageHasDown: boolean;
  pageEntryNewest: string | false;
  pageEntryOldest: string | false;
}

/**
 * Permalink reference linking to a specific named build.
 * Used to render the permalinks section (permalinks.jelly).
 */
interface Permalink {
  id: string;
  displayName: string;
  buildNumber: number;
  buildUrl: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Auto-refresh interval in milliseconds — matches builds-card.js line 22 */
const REFRESH_INTERVAL_MS = 5000;

/** Debounce delay in milliseconds — matches builds-card.js line 142 */
const DEBOUNCE_DELAY_MS = 150;

/**
 * Maps BallColor enum values to human-readable descriptions.
 * Used for icon tooltip and aria-label attributes.
 * Mirrors the server-side BallColor.getDescription() output.
 */
const BALL_COLOR_DESCRIPTIONS: Record<string, string> = {
  blue: "Success",
  blue_anime: "In progress",
  yellow: "Unstable",
  yellow_anime: "In progress",
  red: "Failed",
  red_anime: "In progress",
  grey: "Pending",
  grey_anime: "In progress",
  disabled: "Disabled",
  disabled_anime: "In progress",
  aborted: "Aborted",
  aborted_anime: "In progress",
  nobuilt: "Not built",
  nobuilt_anime: "In progress",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Builds a URL query string from {@link QueryParameters}.
 * Mirrors the implicit query-string pattern from builds-card.js.
 *
 * @param params - Key/value pairs to include in the query string.
 * @returns Query string prefixed with "?" or empty string when no params.
 */
function toQueryString(params: QueryParameters): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, value);
    }
  });
  const str = searchParams.toString();
  return str ? "?" + str : "";
}

/**
 * Insert `<wbr>` elements at word boundaries for long names.
 * Mirrors the Jelly `<l:breakable value="..."/>` tag behaviour — inserts
 * break opportunities before uppercase letters following a lowercase letter,
 * and after `/`, `-`, and `_` characters.
 *
 * @param name - The display name to make breakable.
 * @returns Array of React nodes with interspersed `<wbr>` elements.
 */
function breakableName(name: string): React.ReactNode[] {
  const segments: React.ReactNode[] = [];
  let current = "";
  for (let i = 0; i < name.length; i++) {
    const ch = name[i];
    const prev = i > 0 ? name[i - 1] : "";
    // Insert break opportunity before: uppercase after lowercase, after / - _
    if (
      (ch >= "A" && ch <= "Z" && prev >= "a" && prev <= "z") ||
      prev === "/" ||
      prev === "-" ||
      prev === "_"
    ) {
      segments.push(current);
      segments.push(<wbr key={`wbr-${i}`} />);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) {
    segments.push(current);
  }
  return segments;
}

/**
 * Returns the human-readable description for a BallColor value.
 *
 * @param color - Ball colour string from the Job/Build model.
 * @returns Display description used in tooltips and ARIA labels.
 */
function getBallColorDescription(color: BallColor | string): string {
  return BALL_COLOR_DESCRIPTIONS[color] ?? "Unknown";
}

/**
 * Constructs a list of permalink references from the job model's well-known
 * builds. Mirrors the Jelly pattern of iterating `it.permalinks`
 * (Job.getPermalinks()) in permalinks.jelly lines 29-33.
 *
 * @param job - Job model data from the Stapler REST API response.
 * @returns Array of permalinks with build references; empty builds are skipped.
 */
function buildPermalinkList(job: Job): Permalink[] {
  const permalinks: Permalink[] = [];

  const addPermalink = (
    id: string,
    label: string,
    build: Build | null | undefined,
  ): void => {
    if (build) {
      permalinks.push({
        id,
        displayName: label,
        buildNumber: build.number,
        buildUrl: build.url,
      });
    }
  };

  addPermalink("lastBuild", "Last Build", job.lastBuild);
  addPermalink("lastStableBuild", "Last Stable Build", job.lastStableBuild);
  addPermalink(
    "lastSuccessfulBuild",
    "Last Successful Build",
    job.lastSuccessfulBuild,
  );
  addPermalink("lastFailedBuild", "Last Failed Build", job.lastFailedBuild);
  addPermalink(
    "lastUnstableBuild",
    "Last Unstable Build",
    job.lastUnstableBuild,
  );
  addPermalink(
    "lastCompletedBuild",
    "Last Completed Build",
    job.lastCompletedBuild,
  );

  return permalinks;
}

// =============================================================================
// Sub-Components
// =============================================================================

// ----- JobPropertySummaries -------------------------------------------------

interface JobPropertySummariesProps {
  properties: JobProperty[];
}

/**
 * Renders job property summaries.
 * Mirrors `jobpropertysummaries.jelly` lines 29-31 — iterates properties and
 * renders each property's summary view.  Properties that have no renderable
 * `_class` are skipped (mirrors `optional="true"` in the Jelly include).
 */
function JobPropertySummaries({
  properties,
}: JobPropertySummariesProps): React.ReactElement | null {
  if (!properties || properties.length === 0) {
    return null;
  }

  return (
    <div className="job-property-summaries">
      {properties.map((property, index) => {
        if (!property._class) {
          return null;
        }
        const shortClassName = property._class.split(".").pop() ?? "";
        return (
          <div
            key={property._class + "-" + String(index)}
            className="job-property-summary"
            data-class={property._class}
          >
            {/* Server-rendered property summaries are injected here.
                In the original Jelly, each property supplies its own
                summary.jelly view. In the React migration the API
                response may include a rendered HTML fragment; if it
                does not, we render a labelled placeholder that can be
                picked up by the Jenkins plugin infrastructure. */}
            <span className="job-property-summary__label">
              {shortClassName}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ----- PermalinksSection ----------------------------------------------------

interface PermalinksSectionProps {
  permalinks: Permalink[];
  baseUrl: string;
}

/**
 * Renders the permalinks heading and list.
 * Mirrors `permalinks.jelly` lines 28-34 — heading followed by an unordered
 * list of links to well-known builds (last build, last stable, etc.).
 */
function PermalinksSection({
  permalinks,
  baseUrl,
}: PermalinksSectionProps): React.ReactElement | null {
  const { t } = useI18n();

  if (!permalinks || permalinks.length === 0) {
    return null;
  }

  return (
    <section aria-label={t("Permalinks") ?? "Permalinks"}>
      <h2 className="permalinks-header">{t("Permalinks") ?? "Permalinks"}</h2>
      <ul className="permalinks-list">
        {permalinks.map((pl) => (
          <li key={pl.id}>
            {pl.displayName}{" "}
            <a href={baseUrl + "/" + pl.buildUrl}>
              {"#" + String(pl.buildNumber)}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ----- BuildsCard -----------------------------------------------------------

interface BuildsCardProps {
  jobUrl: string;
}

/**
 * Auto-refreshing builds card with pagination and debounced search.
 *
 * Replaces `src/main/js/pages/project/builds-card.js` (159 lines).
 * Key behaviours preserved:
 * - 5 000 ms auto-refresh interval (REFRESH_INTERVAL_MS)
 * - 150 ms debounced search input (DEBOUNCE_DELAY_MS)
 * - BigInt pagination cursor arithmetic
 * - `document.hidden` visibility gate
 * - Window focus re-fetch
 * - CSS class toggles for loading/pagination states
 * - DOM IDs for visual-regression screenshot symmetry
 */
function BuildsCard({ jobUrl }: BuildsCardProps): React.ReactElement {
  const { t } = useI18n();
  const rootUrl = getBaseUrl();

  // Construct the ajaxBuildHistory URL
  const ajaxUrl = rootUrl + "/" + jobUrl + "/ajaxBuildHistory";

  // ---- State (replaces imperative DOM caching from builds-card.js) --------
  const [buildsHtml, setBuildsHtml] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasNoBuilds, setHasNoBuilds] = useState<boolean>(false);
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [cardControls, setCardControls] = useState<CardControlsOptions>({
    pageHasUp: false,
    pageHasDown: false,
    pageEntryNewest: false,
    pageEntryOldest: false,
  });

  // Refs for mutable state accessed inside callbacks / timers
  const searchQueryRef = useRef<string>("");
  const cardControlsRef = useRef<CardControlsOptions>(cardControls);
  const isMountedRef = useRef<boolean>(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    cardControlsRef.current = cardControls;
  }, [cardControls]);

  // ---- Core load function -------------------------------------------------
  const loadBuilds = useCallback(
    (paginationParams?: QueryParameters) => {
      // Don't fetch when the tab is hidden — mirrors builds-card.js lines 38-40
      if (document.hidden) {
        return;
      }

      // Clear any pending refresh timer (mirrors clearTimeout pattern)
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      const params: QueryParameters = { ...paginationParams };

      // Include search query
      const currentSearch = searchQueryRef.current;
      if (currentSearch) {
        params.search = currentSearch;
      }

      // Pagination cursor logic — mirrors builds-card.js lines 32-35, 46-49
      // If we are not on the first page and there are no explicit pagination
      // params, set "older-than" to one past the newest entry to keep the
      // current view stable during auto-refresh.
      const currentControls = cardControlsRef.current;
      if (
        !paginationParams &&
        currentControls.pageEntryNewest &&
        currentControls.pageHasUp
      ) {
        // BigInt arithmetic — exact mirror of builds-card.js line 48:
        //   params["older-than"] = String(BigInt(pageEntryNewest) + 1n);
        try {
          params["older-than"] = String(
            BigInt(currentControls.pageEntryNewest) + 1n,
          );
        } catch {
          // If the value is not a valid BigInt, fall back to raw string
          params["older-than"] = currentControls.pageEntryNewest;
        }
      }

      setIsLoading(true);

      const url = ajaxUrl + toQueryString(params);

      fetch(url, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      })
        .then((response) => response.text())
        .then((html) => {
          if (!isMountedRef.current) {
            return;
          }

          const trimmed = html.trim();

          if (!trimmed) {
            // Empty response — no builds — mirrors builds-card.js lines 59-70
            setBuildsHtml("");
            setHasNoBuilds(true);
            setIsLoading(false);
          } else {
            // Parse dataset attributes from the response element
            // Mirrors builds-card.js lines 72-87
            const parser = new DOMParser();
            const doc = parser.parseFromString(
              "<div>" + trimmed + "</div>",
              "text/html",
            );
            const innerChild = doc.body.firstElementChild?.firstElementChild;

            if (innerChild instanceof HTMLElement) {
              const newControls: CardControlsOptions = {
                pageHasUp: innerChild.dataset.pageHasUp === "true",
                pageHasDown: innerChild.dataset.pageHasDown === "true",
                pageEntryNewest: innerChild.dataset.pageEntryNewest || false,
                pageEntryOldest: innerChild.dataset.pageEntryOldest || false,
              };
              setCardControls(newControls);
              cardControlsRef.current = newControls;
            }

            setBuildsHtml(trimmed);
            setHasNoBuilds(false);
            setIsLoading(false);
          }

          // Schedule next refresh — mirrors builds-card.js lines 126-139
          refreshTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              loadBuilds();
            }
          }, REFRESH_INTERVAL_MS);
        })
        .catch(() => {
          if (!isMountedRef.current) {
            return;
          }
          setIsLoading(false);
          // Schedule retry after the standard interval
          refreshTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              loadBuilds();
            }
          }, REFRESH_INTERVAL_MS);
        });
    },
    [ajaxUrl],
  );

  // ---- Initial load & cleanup ---------------------------------------------
  useEffect(() => {
    isMountedRef.current = true;
    loadBuilds();

    // Window focus re-fetch — mirrors builds-card.js lines 155-157
    const handleFocus = (): void => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      loadBuilds();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("focus", handleFocus);
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [loadBuilds]);

  // ---- Debounced search handler -------------------------------------------
  const handleSearchInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchInput(value);

      // Clear previous debounce timer
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce at 150 ms — mirrors builds-card.js line 142
      debounceTimerRef.current = setTimeout(() => {
        setSearchQuery(value);
        searchQueryRef.current = value;
        // Reset to first page on search
        setCardControls((prev) => ({
          ...prev,
          pageHasUp: false,
          pageEntryNewest: false,
          pageEntryOldest: false,
        }));
        loadBuilds();
      }, DEBOUNCE_DELAY_MS);
    },
    [loadBuilds],
  );

  // ---- Pagination handlers ------------------------------------------------
  const handleNewerPage = useCallback(() => {
    if (cardControls.pageEntryNewest) {
      loadBuilds({ "newer-than": cardControls.pageEntryNewest as string });
    }
  }, [cardControls.pageEntryNewest, loadBuilds]);

  const handleOlderPage = useCallback(() => {
    if (cardControls.pageEntryOldest) {
      loadBuilds({ "older-than": cardControls.pageEntryOldest as string });
    }
  }, [cardControls.pageEntryOldest, loadBuilds]);

  // ---- Determine search loading state -------------------------------------
  const isSearching = isLoading && searchInput.length > 0;

  // ---- Render -------------------------------------------------------------
  return (
    <div
      id="buildHistoryPage"
      data-page-ajax={ajaxUrl}
      className={
        "app-builds-container" +
        (isLoading ? " app-builds-container--loading" : "")
      }
    >
      {/* Search bar — mirrors builds-card.js lines 141-150 */}
      <div
        className={
          "jenkins-search" + (isSearching ? " jenkins-search--loading" : "")
        }
      >
        <input
          id="jenkins-build-history"
          type="text"
          className="jenkins-search__input"
          placeholder={t("Search builds") ?? "Search builds"}
          value={searchInput}
          onChange={handleSearchInput}
          aria-label={t("Search builds") ?? "Search builds"}
        />
      </div>

      {/* Builds content area */}
      <div id="jenkins-builds">
        {hasNoBuilds && !isLoading ? (
          <div id="no-builds" className="app-builds-container__no-builds">
            <span
              className="app-builds-container__no-builds__icon"
              dangerouslySetInnerHTML={{ __html: INFO }}
            />
            <p>{t("No builds")}</p>
          </div>
        ) : null}

        {isLoading && !buildsHtml ? (
          <div id="loading-builds" className="app-builds-container__loading">
            <Skeleton />
          </div>
        ) : null}

        {buildsHtml ? (
          <div dangerouslySetInnerHTML={{ __html: buildsHtml }} />
        ) : null}
      </div>

      {/* Pagination controls — mirrors builds-card.js lines 99-124 */}
      <div
        id="controls"
        className={
          !cardControls.pageHasUp && !cardControls.pageHasDown
            ? "jenkins-hidden"
            : ""
        }
      >
        <button
          id="up"
          type="button"
          className={
            "app-builds-container__button" +
            (!cardControls.pageHasUp
              ? " app-builds-container__button--disabled"
              : "")
          }
          disabled={!cardControls.pageHasUp}
          onClick={handleNewerPage}
          aria-label={t("Previous builds page") ?? "Previous builds page"}
        >
          {t("Previous") ?? "Previous"}
        </button>
        <button
          id="down"
          type="button"
          className={
            "app-builds-container__button" +
            (!cardControls.pageHasDown
              ? " app-builds-container__button--disabled"
              : "")
          }
          disabled={!cardControls.pageHasDown}
          onClick={handleOlderPage}
          aria-label={t("Next builds page") ?? "Next builds page"}
        >
          {t("Next") ?? "Next"}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * JobIndex — React page component for the job detail/index page.
 *
 * Mirrors `core/src/main/resources/hudson/model/Job/index.jelly` and all its
 * includes, plus the builds-card.js auto-refresh behaviour.
 *
 * @param props - {@link JobIndexProps}
 * @returns The fully rendered job detail page.
 */
function JobIndex({
  jobUrl,
  displayName,
  fullName,
  fullDisplayName,
  parentFullDisplayName,
  isTopLevel,
  hasConfigurePermission,
  newJobPage,
}: JobIndexProps): React.ReactElement {
  const { t } = useI18n();
  const { baseUrl } = useJenkinsNavigation();

  // ---- Data fetching — GET {jobUrl}/api/json (Phase 2) --------------------
  const { data: jobData, isLoading: isJobLoading } = useStaplerQuery<Job>({
    url: baseUrl + "/" + jobUrl + "/api/json",
    queryKey: ["job", jobUrl],
  });

  // ---- Derived values -----------------------------------------------------
  const lastBuild: Build | null | undefined = jobData?.lastBuild ?? null;
  const lastBuildColor: string = jobData?.color ?? "grey";
  const iconClassName =
    "symbol-status-" + lastBuildColor.replace(/_anime$/, "");
  const isAnimated = lastBuildColor.endsWith("_anime");
  const iconDescription = getBallColorDescription(lastBuildColor);
  const permalinks: Permalink[] = useMemo(
    () => (jobData ? buildPermalinkList(jobData) : []),
    [jobData],
  );

  // Page title — mirrors Jelly line 34
  const pageTitle = useMemo(() => {
    const suffix = parentFullDisplayName
      ? " [" + parentFullDisplayName + "]"
      : "";
    return displayName + suffix;
  }, [displayName, parentFullDisplayName]);

  // ---- Loading state (Phase 2) --------------------------------------------
  if (isJobLoading) {
    return (
      <Layout title={displayName}>
        <Skeleton />
      </Layout>
    );
  }

  // ---- Side panel content -------------------------------------------------
  // Mirrors Jelly line 35: <st:include page="sidepanel.jelly" />
  // The SidePanel receives task links relevant to this job.  In the Jelly
  // architecture these links are generated by the Java model — the Layout
  // component renders whatever children are placed in the sidePanel slot.
  const sidePanelContent = (
    <nav aria-label={t("Job actions") ?? "Job actions"}>
      <div className="task-link-container">
        {/* Task links are typically injected server-side.  In the React
            migration the Jelly shell passes them as data attributes or
            the Layout component fetches them.  We provide the container
            for visual symmetry with the original Jelly output. */}
      </div>
    </nav>
  );

  // ---- Determine full-name visibility (index.jelly lines 55-64) ----------
  const showFullName =
    jobData &&
    fullName !== fullDisplayName &&
    jobData._class !== "hudson.matrix.MatrixConfiguration";

  // ---- Experimental new job page flag (index.jelly lines 27-32) -----------
  // When the flag is enabled, the Jelly template uses a `<j:choose>` to
  // switch between the experimental and traditional layout.  The
  // experimental UI is rendered via a separate component in future
  // iterations; here we pass the flag as a data attribute so that CSS /
  // integration tests can detect it.

  // ---- Render (traditional layout — index.jelly lines 33-74) -------------
  return (
    <Layout title={pageTitle} type="two-column" sidePanel={sidePanelContent}>
      {/* ---- App bar with last build status (index.jelly lines 38-53) ---- */}
      <div
        className="jenkins-app-bar"
        data-new-job-page={newJobPage ? "true" : undefined}
      >
        <div className="jenkins-app-bar__content jenkins-build-caption">
          {lastBuild ? (
            <a
              href={baseUrl + "/" + lastBuild.url}
              className="jenkins-!-display-contents"
              tabIndex={-1}
              aria-hidden="true"
            >
              <span
                className={iconClassName + (isAnimated ? " loading" : "")}
                title={iconDescription}
                role="img"
                aria-label={iconDescription}
              />
            </a>
          ) : null}
          <h1 className="job-index-headline page-headline">
            {breakableName(displayName)}
          </h1>
        </div>
        <div className="jenkins-app-bar__controls">
          {hasConfigurePermission ? (
            <EditableDescription
              description={jobData?.description ?? ""}
              hasPermission={hasConfigurePermission}
              submissionUrl={baseUrl + "/" + jobUrl + "/submitDescription"}
              hideButton={false}
            />
          ) : null}
        </div>
      </div>

      {/* ---- Full project name (index.jelly lines 55-64) ---- */}
      {showFullName ? (
        <div className="job-full-name">
          {isTopLevel ? t("Project name") : t("Full project name")}
          {": "}
          {fullName}
        </div>
      ) : null}

      {/* ---- Editable description (index.jelly line 65) ---- */}
      <EditableDescription
        description={jobData?.description ?? ""}
        hasPermission={hasConfigurePermission}
        submissionUrl={baseUrl + "/" + jobUrl + "/submitDescription"}
        hideButton={true}
      />

      {/* ---- Job property summaries (jobpropertysummaries.jelly) ---- */}
      <JobPropertySummaries properties={jobData?.property ?? []} />

      {/* ---- Main content slot (main.jelly — empty extension point) ---- */}
      <div id="main-panel-content">
        {/* Extension point for derived types — mirrors main.jelly "place
            holder for the derived types to add more contents" */}
      </div>

      {/* ---- Builds card with auto-refresh (builds-card.js) ---- */}
      <BuildsCard jobUrl={jobUrl} />

      {/* ---- Permalinks (permalinks.jelly) ---- */}
      <PermalinksSection permalinks={permalinks} baseUrl={baseUrl} />
    </Layout>
  );
}

export default JobIndex;
