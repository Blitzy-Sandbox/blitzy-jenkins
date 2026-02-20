/**
 * @file ProjectView — React project listing dashboard component.
 *
 * Replaces `core/src/main/resources/lib/hudson/projectView.jelly`.
 *
 * Renders a list of jobs and their key information in two responsive layouts:
 * - **Desktop**: A sortable `<table>` driven by column extensions (Stapler
 *   `ListViewColumn` descriptors), delegating each row to {@link ProjectViewRow}.
 * - **Mobile**: A compact card list (`.jenkins-jobs-list`) with status icon,
 *   display name, last build description, and an optional build-now button.
 *
 * The component receives jobs as props — it does NOT fetch them directly.
 * Parent page components (Dashboard, ListView, etc.) fetch via
 * `useStaplerQuery` and pass the result down.
 *
 * When `columnExtensions` is not provided, the component falls back to a
 * well-known default set mirroring `ListView.getDefaultColumns()`, and
 * additionally attempts to fetch column configuration from the primary view's
 * REST endpoint via `useStaplerQuery`.
 *
 * No jQuery — React Query replaces AJAX.
 * No Handlebars — JSX replaces templates.
 * No behaviorShim — React lifecycle replaces `Behaviour.specify()`.
 *
 * @module hudson/ProjectView
 */

import React, { useState, useMemo } from "react";
import ProjectViewRow from "./ProjectViewRow";
import { useStaplerQuery } from "@/hooks/useStaplerQuery";
import { useI18n } from "@/hooks/useI18n";
import type { Job, View, BallColor } from "@/types/models";

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Descriptor for a list view column extension.
 *
 * Each entry mirrors the Stapler JSON representation of a `ListViewColumn`
 * subclass, identified by its fully-qualified Java class name in `_class`.
 */
interface ColumnExtension {
  /** Stapler `_class` discriminator (e.g. `"hudson.views.StatusColumn"`) */
  _class: string;
  /** Allow additional Stapler-serialized properties */
  [key: string]: unknown;
}

/**
 * Response shape when fetching view configuration from the Stapler REST API.
 * Used as the generic type parameter for `useStaplerQuery` when loading
 * default column extensions.
 */
interface ViewColumnsResponse {
  columns?: ColumnExtension[];
}

/**
 * Icon size variants that control table density.
 *
 * Mirrors the Jelly `<t:setIconSize/>` tag behaviour:
 * - `"16x16"` → compact table with `jenkins-table--small`
 * - `"24x24"` → medium table with `jenkins-table--medium`
 * - `""`      → standard (default) table size
 */
type IconSize = "16x16" | "24x24" | "";

// ============================================================================
// Exported Props Interface
// ============================================================================

/**
 * Props for the {@link ProjectView} component.
 *
 * Mirrors the Jelly `<st:documentation>` attribute declarations from
 * `projectView.jelly` lines 28-55.
 */
export interface ProjectViewProps {
  /**
   * Items (jobs) to display. Required.
   * Mirrors Jelly attribute: `<st:attribute name="jobs" use="required">`.
   */
  jobs: Job[];

  /**
   * Whether columns should display the fully-qualified job name.
   * Mirrors Jelly attribute: `<st:attribute name="useFullName" type="boolean">`.
   */
  useFullName?: boolean;

  /**
   * Set to `true` when the caller renders view tabs, so CSS is adjusted.
   * Mirrors Jelly attribute: `<st:attribute name="showViewTabs" type="boolean">`.
   */
  showViewTabs?: boolean;

  /**
   * Optional nested views for tab rendering.
   * When non-empty, the content area is shown even if `jobs` is empty.
   * Mirrors Jelly attribute: `<st:attribute name="views" type="Collection<View>">`.
   */
  views?: View[];

  /**
   * Column descriptors defining which table columns to render.
   * When omitted, defaults to `ListView.getDefaultColumns()` equivalent.
   * Mirrors Jelly attribute: `<st:attribute name="columnExtensions">`.
   */
  columnExtensions?: ColumnExtension[];

  /**
   * The containing item group for name/URL calculation.
   * Mirrors Jelly attribute: `<st:attribute name="itemGroup" type="ItemGroup">`.
   */
  itemGroup?: Record<string, unknown>;

  /**
   * Injection slot for the tab bar (replaces Jelly `<d:invokeBody/>`).
   * Rendered inside `<div id="projectstatus-tabBar">`.
   */
  children?: React.ReactNode;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default column extension set mirroring `ListView.getDefaultColumns()`.
 *
 * This is the well-known set of columns rendered when no `columnExtensions`
 * prop is provided and the REST API fallback has not yet resolved.
 * Order matches the default Jenkins dashboard column layout.
 */
const DEFAULT_COLUMN_EXTENSIONS: ColumnExtension[] = [
  { _class: "hudson.views.StatusColumn" },
  { _class: "hudson.views.WeatherColumn" },
  { _class: "hudson.views.JobColumn" },
  { _class: "hudson.views.LastSuccessColumn" },
  { _class: "hudson.views.LastFailureColumn" },
  { _class: "hudson.views.LastDurationColumn" },
  { _class: "hudson.views.BuildButtonColumn" },
];

/**
 * Human-readable descriptions for each {@link BallColor} value.
 *
 * Mirrors the `BallColor.getDescription()` Java method used in
 * `projectView.jelly` line 106: `tooltip="${job.iconColor.description}"`.
 */
const BALL_COLOR_DESCRIPTIONS: Record<BallColor, string> = {
  blue: "Success",
  blue_anime: "In progress",
  yellow: "Unstable",
  yellow_anime: "In progress",
  red: "Failed",
  red_anime: "In progress",
  grey: "Pending",
  grey_anime: "In progress",
  disabled: "Disabled",
  disabled_anime: "Disabled",
  aborted: "Aborted",
  aborted_anime: "In progress",
  nobuilt: "Not built",
  nobuilt_anime: "In progress",
};

// ============================================================================
// Pure Helper Functions
// ============================================================================

/**
 * Extracts the simple class name from a fully-qualified Stapler `_class` string.
 *
 * @example getSimpleName("hudson.views.StatusColumn") // "StatusColumn"
 */
function getSimpleName(fqcn: string): string {
  const idx = fqcn.lastIndexOf(".");
  return idx >= 0 ? fqcn.substring(idx + 1) : fqcn;
}

/**
 * Resolves a {@link BallColor} to an icon-name string for SVG symbol lookup.
 * Falls back to `"grey"` when the colour is `undefined`.
 */
function resolveIconName(color: BallColor | undefined): string {
  return color ?? "grey";
}

/**
 * Returns a human-readable description for a {@link BallColor} value.
 * Used as tooltip text for status icons in the mobile view.
 */
function getBallColorDescription(color: BallColor | undefined): string {
  if (!color) {
    return "Pending";
  }
  return BALL_COLOR_DESCRIPTIONS[color] ?? color;
}

/**
 * Computes the base URL prefix for a job, such that
 * `jobBaseUrl + job.name + "/"` produces the full path to the job page.
 *
 * Extracts the pathname from the job's absolute URL and strips the trailing
 * `{name}/` segment. This replaces the Jelly pattern:
 * ```java
 * relativeLinkToJob.substring(0, relativeLinkToJob.length() - job.shortUrl.length())
 * ```
 *
 * @example
 * // job.url = "http://localhost:8080/job/myproject/"
 * // job.name = "myproject"
 * // Returns: "/job/"
 *
 * @example
 * // job.url = "http://localhost:8080/job/folder/job/myproject/"
 * // job.name = "myproject"
 * // Returns: "/job/folder/job/"
 */
function computeJobBaseUrl(job: Job): string {
  const url = job.url;
  const nameSuffix = `${job.name}/`;

  /* Try parsing as absolute URL to extract pathname */
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    if (pathname.endsWith(nameSuffix)) {
      return pathname.substring(0, pathname.length - nameSuffix.length);
    }
    return pathname;
  } catch {
    /* Handle relative URLs or malformed absolute URLs */
    if (url.endsWith(nameSuffix)) {
      return url.substring(0, url.length - nameSuffix.length);
    }
    return "";
  }
}

/**
 * Formats a Unix-epoch timestamp (ms) to a relative "time since" string.
 *
 * Mirrors `Build.getTimestampString()` from the Java model, which produces
 * values like `"5 hr ago"`, `"2 days ago"`.
 */
function formatTimeSince(timestampMs: number): string {
  if (timestampMs <= 0) {
    return "N/A";
  }

  const diff = Date.now() - timestampMs;
  if (diff < 0) {
    return "N/A";
  }

  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const mo = Math.floor(day / 30);
  const yr = Math.floor(day / 365);

  if (yr > 0) {
    return `${yr} yr ago`;
  }
  if (mo > 0) {
    return `${mo} mo ago`;
  }
  if (day > 0) {
    return `${day} day ago`;
  }
  if (hr > 0) {
    return `${hr} hr ago`;
  }
  if (min > 0) {
    return `${min} min ago`;
  }
  return `${sec} sec ago`;
}

/**
 * Formats a duration in milliseconds to a human-readable time-span string.
 *
 * Mirrors `Build.getDurationString()` / `Util.getTimeSpanString()` from the
 * Java model, producing values like `"2 min 30 sec"`.
 */
function formatDuration(ms: number): string {
  if (ms <= 0) {
    return "0 sec";
  }

  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day > 0) {
    const remHr = hr % 24;
    return remHr > 0 ? `${day} day ${remHr} hr` : `${day} day`;
  }
  if (hr > 0) {
    const remMin = min % 60;
    return remMin > 0 ? `${hr} hr ${remMin} min` : `${hr} hr`;
  }
  if (min > 0) {
    const remSec = totalSec % 60;
    return remSec > 0 ? `${min} min ${remSec} sec` : `${min} min`;
  }
  return `${totalSec} sec`;
}

/**
 * Substitutes positional parameters `{0}`, `{1}`, … in a message template.
 *
 * Mirrors the Jenkins Jelly `${%Key(arg0, arg1)}` i18n interpolation pattern
 * used in `projectView.jelly` line 120.
 */
function formatMessage(template: string, ...args: string[]): string {
  return args.reduce(
    (result, arg, index) => result.replace(`{${index}}`, arg),
    template,
  );
}

// ============================================================================
// Column Header Rendering
// ============================================================================

/**
 * Column header metadata keyed by simple class name.
 *
 * Each entry corresponds to a column extension's `columnHeader.jelly`:
 * - `label`: visible header text
 * - `tooltip`: accessible tooltip (for icon-only headers)
 * - `tight`: whether the column is narrow (icon/button columns)
 * - `iconColumn`: whether the column renders only an icon
 * - `initialSortDir`: default sort direction for sortable.js
 */
interface ColumnHeaderMeta {
  label: string;
  tooltip?: string;
  tight?: boolean;
  iconColumn?: boolean;
  initialSortDir?: "asc" | "desc";
}

/**
 * Maps column simple class names to their header rendering metadata.
 * Derived from each column's `columnHeader.jelly` in the Jenkins source.
 */
const COLUMN_HEADER_META: Record<string, ColumnHeaderMeta> = {
  StatusColumn: {
    label: "S",
    tooltip: "Status",
    tight: true,
    iconColumn: true,
  },
  WeatherColumn: {
    label: "W",
    tooltip: "Weather",
    tight: true,
    iconColumn: true,
  },
  JobColumn: {
    label: "Name",
    initialSortDir: "asc",
  },
  LastSuccessColumn: {
    label: "Last Success",
    initialSortDir: "desc",
  },
  LastFailureColumn: {
    label: "Last Failure",
    initialSortDir: "desc",
  },
  LastDurationColumn: {
    label: "Last Duration",
    initialSortDir: "desc",
  },
  LastBuildColumn: {
    label: "Last Build",
    initialSortDir: "desc",
  },
  BuildButtonColumn: {
    label: "",
    tight: true,
  },
};

/**
 * Renders a single `<th>` column header element for the desktop table.
 *
 * Replaces the Jelly `<st:include page="columnHeader.jelly" it="${col}" />`
 * delegation pattern from `projectView.jelly` line 78.
 */
function renderColumnHeader(
  col: ColumnExtension,
  index: number,
): React.JSX.Element {
  const simpleName = getSimpleName(col._class);
  const meta = COLUMN_HEADER_META[simpleName];

  if (!meta) {
    /* Unknown column type — render an empty header to preserve table structure */
    return <th key={`header-${col._class}-${index}`} />;
  }

  const classNames: string[] = [];
  if (meta.tight) {
    classNames.push("jenkins-table__cell--tight");
  }
  if (meta.iconColumn) {
    classNames.push("jenkins-table__icon");
  }

  return (
    <th
      key={`header-${col._class}-${index}`}
      className={classNames.length > 0 ? classNames.join(" ") : undefined}
      title={meta.tooltip}
      data-initialsortdir={meta.initialSortDir}
    >
      {meta.label}
    </th>
  );
}

// ============================================================================
// Mobile Job Item Rendering
// ============================================================================

/**
 * Renders a single mobile job card inside the `.jenkins-jobs-list` container.
 *
 * Replaces the inner `<j:forEach>` loop body in the mobile view section
 * of `projectView.jelly` lines 98-134.
 *
 * Structure mirrors the Jelly output:
 * ```html
 * <div class="jenkins-jobs-list__item">
 *   <a class="jenkins-jobs-list__item__details" href="...">
 *     <div class="jenkins-jobs-list__item__icons">…</div>
 *     <div class="jenkins-jobs-list__item__details__text">
 *       <p class="jenkins-jobs-list__item__label">…</p>
 *       <div class="jenkins-jobs-list__item__description">…</div>
 *     </div>
 *   </a>
 *   <div class="jenkins-jobs-list__item__actions">…</div>
 * </div>
 * ```
 */
function MobileJobItem({
  job,
  jobBaseUrl,
  useFullName,
  hasBuildButton,
  descriptionText,
  healthReport,
}: {
  job: Job;
  jobBaseUrl: string;
  useFullName?: boolean;
  hasBuildButton: boolean;
  descriptionText: string;
  healthReport: Array<{ score: number; iconUrl?: string; iconClassName?: string; description: string }>;
}): React.JSX.Element {
  const iconName = resolveIconName(job.color);
  const iconTooltip = getBallColorDescription(job.color);
  const displayName = useFullName
    ? job.fullDisplayName || job.fullName
    : job.displayName || job.name;
  const jobHref = `${jobBaseUrl}${job.name}/`;

  return (
    <div className="jenkins-jobs-list__item">
      <a className="jenkins-jobs-list__item__details" href={jobHref}>
        <div className="jenkins-jobs-list__item__icons">
          {/* Mirrors Jelly line 106: <l:icon src="symbol-status-${iconName}" tooltip="..."> */}
          <svg
            className="svg-icon"
            focusable="false"
            aria-hidden="true"
            role="img"
          >
            <title>{iconTooltip}</title>
            <use href={`#symbol-status-${iconName}`} />
          </svg>
        </div>
        <div className="jenkins-jobs-list__item__details__text">
          <p className="jenkins-jobs-list__item__label">{displayName}</p>
          <div className="jenkins-jobs-list__item__description">
            {/* Mirrors Jelly lines 117-122: last build description */}
            {job.lastBuild !== null && descriptionText && (
              <span>{descriptionText}</span>
            )}
            {/* Health report indicator for mobile compact view */}
            {healthReport.length > 0 && (
              <span
                className="jenkins-jobs-list__item__health"
                title={healthReport[0].description}
              >
                {healthReport[0].description}
              </span>
            )}
          </div>
        </div>
      </a>
      <div className="jenkins-jobs-list__item__actions">
        {/* Mirrors Jelly line 131: build button column in mobile actions */}
        {hasBuildButton && job.buildable && (
          <a
            href={`${jobBaseUrl}${job.name}/build?delay=0sec`}
            className="jenkins-table__link"
            role="button"
            aria-label={`Build ${job.displayName || job.name}`}
          >
            <svg className="svg-icon" focusable="false" aria-hidden="true">
              <use href="#symbol-play" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * **ProjectView** — Renders a list of jobs and their key information.
 *
 * Replaces `core/src/main/resources/lib/hudson/projectView.jelly`.
 *
 * The original Jelly template produces the following DOM structure:
 * ```html
 * <div class="dashboard">
 *   <div id="projectstatus-tabBar">{children}</div>
 *   <div class="jenkins-mobile-hide">
 *     <div class="app-project-status-table">
 *       <table id="projectstatus" class="jenkins-table {sizeClass} sortable">
 *         <thead><tr>…column headers…</tr></thead>
 *         …job rows via ProjectViewRow…
 *       </table>
 *     </div>
 *   </div>
 *   <div class="jenkins-jobs-list jenkins-mobile-show">
 *     …mobile job cards…
 *   </div>
 * </div>
 * ```
 *
 * @example
 * ```tsx
 * <ProjectView
 *   jobs={viewData.jobs}
 *   columnExtensions={viewData.columns}
 *   views={viewData.views}
 * >
 *   <TabBar tabs={viewData.views} />
 * </ProjectView>
 * ```
 */
function ProjectView({
  jobs,
  useFullName,
  showViewTabs,
  views,
  columnExtensions,
  itemGroup,
  children,
}: ProjectViewProps): React.JSX.Element {
  const { t } = useI18n();

  // ---------------------------------------------------------------------------
  // Icon size state — mirrors Jelly <t:setIconSize/>
  // ---------------------------------------------------------------------------

  const [iconSize] = useState<IconSize>(() => {
    /* Read icon size preference from cookie, mirroring the Jelly
       `<t:setIconSize/>` tag which reads the "iconSize" cookie. */
    try {
      const match = document.cookie
        .split("; ")
        .find((row) => row.startsWith("iconSize="));
      if (match) {
        const value = match.split("=")[1];
        if (value === "16x16" || value === "24x24") {
          return value;
        }
      }
    } catch {
      /* SSR or cookie access failure — fall back to default */
    }
    return "";
  });

  // ---------------------------------------------------------------------------
  // Column extensions — fallback to defaults when not provided
  // ---------------------------------------------------------------------------

  /*
   * When columnExtensions prop is not provided, attempt to fetch the primary
   * view's column configuration from the Stapler REST API. This replaces
   * the Jelly invokeStatic pattern (projectView.jelly line 60):
   *   <j:invokeStatic className="hudson.model.ListView" method="getDefaultColumns"/>
   *
   * The query targets the "All" view's API endpoint which includes column
   * descriptors. If the fetch fails or returns no columns, the hardcoded
   * DEFAULT_COLUMN_EXTENSIONS constant is used as a final fallback.
   */
  const { data: fetchedViewData, isLoading: columnsLoading } =
    useStaplerQuery<ViewColumnsResponse>({
      url: "/view/all/api/json?tree=columns[*]",
      queryKey: ["projectView", "defaultColumns"],
      enabled: columnExtensions === undefined,
      staleTime: 300_000, /* Column config rarely changes — cache for 5 minutes */
    });

  /**
   * Effective column extensions resolved from: props > API > defaults.
   *
   * Priority:
   * 1. `columnExtensions` prop (if provided by parent)
   * 2. Columns fetched from the primary view REST API
   * 3. Hardcoded default column set
   */
  const effectiveColumns: ColumnExtension[] = useMemo(() => {
    if (columnExtensions) {
      return columnExtensions;
    }
    if (fetchedViewData?.columns && fetchedViewData.columns.length > 0) {
      return fetchedViewData.columns;
    }
    return DEFAULT_COLUMN_EXTENSIONS;
  }, [columnExtensions, fetchedViewData]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  /**
   * Tracks whether a BuildButtonColumn exists in the current column set.
   * Used to render the build button in mobile view actions area, mirroring
   * the Jelly pattern of capturing `buildButtonColumn` during header iteration
   * (projectView.jelly lines 75-77).
   */
  const hasBuildButtonColumn: boolean = useMemo(
    () =>
      effectiveColumns.some(
        (col) => getSimpleName(col._class) === "BuildButtonColumn",
      ),
    [effectiveColumns],
  );

  /**
   * Table CSS class calculation mirroring the Jelly ternary expression:
   * ```
   * jenkins-table ${iconSize == '16x16' ? 'jenkins-table--small'
   *   : iconSize == '24x24' ? 'jenkins-table--medium' : ''} sortable
   * ```
   */
  const tableClassName: string = useMemo(() => {
    const classes = ["jenkins-table"];
    if (iconSize === "16x16") {
      classes.push("jenkins-table--small");
    } else if (iconSize === "24x24") {
      classes.push("jenkins-table--medium");
    }
    classes.push("sortable");
    return classes.join(" ");
  }, [iconSize]);

  /**
   * Mirrors the Jelly guard:
   * `<j:if test="${!empty(jobs) or !empty(attrs.views)}">`
   * Content is only rendered when there are jobs or views to display.
   */
  const hasContent: boolean =
    jobs.length > 0 || (views !== undefined && views.length > 0);

  /**
   * Dashboard container CSS class — includes modifier when view tabs are shown.
   * The `showViewTabs` prop signals that the tab bar is rendered, allowing
   * CSS to adjust the dashboard layout (e.g., remove top margin when tabs
   * provide visual separation). The `itemGroup` is available for URL computation
   * in nested item group contexts, forwarded to child components as needed.
   */
  const dashboardClassName: string = useMemo(() => {
    const classes = ["dashboard"];
    if (showViewTabs) {
      classes.push("dashboard--with-view-tabs");
    }
    return classes.join(" ");
  }, [showViewTabs]);

  /**
   * Build description text for each job's mobile view.
   * Mirrors the Jelly pattern:
   *   ${%Description(lastBuild.timestampString, lastBuild.durationString)}
   *
   * The i18n key "Description" is looked up via `t()` from the `#i18n`
   * element. If the key is not found, a default template is used.
   */
  const getDescriptionText = useMemo(() => {
    const template = t("Description") ?? "{0} \u2013 {1}";
    return (job: Job): string => {
      const lastBuild = job.lastBuild;
      if (!lastBuild) {
        return "";
      }
      const timestampString = formatTimeSince(lastBuild.timestamp);
      const durationString =
        lastBuild.duration > 0 ? formatDuration(lastBuild.duration) : "";
      return formatMessage(template, timestampString, durationString);
    };
  }, [t]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  /*
   * Loading state: when columns are being fetched and no prop was provided,
   * show a minimal loading indicator inside the dashboard wrapper.
   */
  if (!columnExtensions && columnsLoading) {
    return (
      <div className={dashboardClassName}>
        <div className="jenkins-spinner" aria-label="Loading columns" />
      </div>
    );
  }

  return (
    <div className={dashboardClassName} data-item-group={itemGroup ? "true" : undefined}>
      {hasContent && (
        <>
          {/* ---------------------------------------------------------------
           * Tab bar injection point
           * Mirrors Jelly: <div id="projectstatus-tabBar"><d:invokeBody/></div>
           * --------------------------------------------------------------- */}
          <div id="projectstatus-tabBar">{children}</div>

          {/* ---------------------------------------------------------------
           * Desktop view — hidden on mobile via .jenkins-mobile-hide
           * Mirrors Jelly lines 69-94
           * --------------------------------------------------------------- */}
          <div className="jenkins-mobile-hide">
            <div className="app-project-status-table">
              <table id="projectstatus" className={tableClassName}>
                <thead>
                  <tr>
                    {effectiveColumns.map((col, idx) =>
                      renderColumnHeader(col, idx),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const jobBaseUrl = computeJobBaseUrl(job);
                    return (
                      <ProjectViewRow
                        key={job.name}
                        job={job}
                        columnExtensions={effectiveColumns}
                        jobBaseUrl={jobBaseUrl}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---------------------------------------------------------------
           * Mobile view — visible only on mobile via .jenkins-mobile-show
           * Mirrors Jelly lines 96-135
           * --------------------------------------------------------------- */}
          <div className="jenkins-jobs-list jenkins-mobile-show">
            {jobs.map((job) => {
              const jobBaseUrl = computeJobBaseUrl(job);
              return (
                <MobileJobItem
                  key={job.name}
                  job={job}
                  jobBaseUrl={jobBaseUrl}
                  useFullName={useFullName}
                  hasBuildButton={hasBuildButtonColumn}
                  descriptionText={getDescriptionText(job)}
                  healthReport={job.healthReport}
                />
              );
            })}
          </div>

          {/* ---------------------------------------------------------------
           * Nested view links — rendered when views exist (empty-state aid)
           * Mirrors Jelly: views are accessible via tab bar children, but we
           * also expose view links in the project-status area for navigation
           * --------------------------------------------------------------- */}
          {views && views.length > 0 && jobs.length === 0 && (
            <div className="jenkins-views-list">
              {views.map((view) => (
                <a key={view.name} href={view.url} className="model-link">
                  {view.name}
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ProjectView;
