/**
 * @file ProjectViewRow — Renders a single job/project row in the project list
 * table, replacing `core/src/main/resources/lib/hudson/projectViewRow.jelly`.
 *
 * The Jelly template produces a `<tr>` with a dynamic `id` and CSS class,
 * iterating over column extensions via `<st:include page="column.jelly">`.
 * This React equivalent dispatches on the column extension's `_class`
 * discriminator to render the appropriate `<td>` cell for each column type.
 *
 * This component is purely presentational — all data arrives via props.
 * No data fetching, no jQuery, no Handlebars, no behaviorShim patterns.
 */

import React from "react";
import type { Job, BallColor, Build, HealthReport } from "@/types/models";
import BuildHealth from "./BuildHealth";
import BuildLink from "./BuildLink";
import BuildProgressBar from "./BuildProgressBar";

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Descriptor for a list view column extension.
 *
 * Each entry mirrors the Stapler JSON representation of a `ListViewColumn`
 * subclass, identified by its fully-qualified Java class name.
 */
interface ColumnExtension {
  /** Stapler `_class` discriminator (e.g. `"hudson.views.StatusColumn"`) */
  _class: string;
}

// ============================================================================
// Exported Props Interface
// ============================================================================

/**
 * Props for the {@link ProjectViewRow} component.
 */
export interface ProjectViewRowProps {
  /** The job/project to render in this table row */
  job: Job;

  /** Ordered list of column descriptors defining which cells to render */
  columnExtensions: ColumnExtension[];

  /**
   * Base URL prefix for constructing job-related links.
   *
   * Mirrors the Jelly `jobBaseUrl` attribute computed by `projectView.jelly`
   * via `h.getRelativeLinkTo(job)`. Column renderers append job-relative
   * segments (e.g. `{name}/`, `{name}/build?delay=0sec`) to this prefix.
   */
  jobBaseUrl: string;
}

// ============================================================================
// Pure Helper Functions
// ============================================================================

/**
 * Extracts the simple class name from a fully-qualified Stapler `_class`.
 *
 * @example getSimpleName("hudson.views.StatusColumn") // "StatusColumn"
 */
function getSimpleName(fqcn: string): string {
  const idx = fqcn.lastIndexOf(".");
  return idx >= 0 ? fqcn.substring(idx + 1) : fqcn;
}

/**
 * Resolves a {@link BallColor} to an icon-name string suitable for CSS class
 * construction (`job-status-{iconName}`).
 * Falls back to `"grey"` when the colour is `undefined`.
 */
function resolveIconName(color: BallColor | undefined): string {
  return color ?? "grey";
}

/**
 * Formats a duration in milliseconds to a human-readable time-span string.
 * Output aligns with Jenkins' `Util.getTimeSpanString()`.
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
 * Formats a Unix-epoch timestamp (ms) to a relative "time since" string
 * (e.g. `"3 hr ago"`).
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
 * Creates a ref callback that imperatively sets the non-standard `data`
 * attribute on an HTML element.
 *
 * Jenkins' sortable-table JavaScript reads the bare `data` attribute for
 * column sort values. React's JSX type system does not include it, so we
 * apply it via the DOM API — the same pattern used by {@link BuildHealth}.
 */
function sortDataRef(
  value: string | number,
): (el: HTMLElement | null) => void {
  return (el: HTMLElement | null) => {
    if (el) {
      el.setAttribute("data", String(value));
    }
  };
}

// ============================================================================
// Column Cell Renderers
// ============================================================================

/**
 * **StatusColumn** — renders the status ball icon for the job's current state.
 *
 * Mirrors `hudson/views/StatusColumn/column.jelly`.
 */
function renderStatusCell(job: Job): React.JSX.Element {
  const iconName: string = resolveIconName(job.color);

  return (
    <td
      ref={sortDataRef(iconName)}
      className="jenkins-table__cell--tight jenkins-table__icon"
    >
      <div className="jenkins-table__cell__button-wrapper">
        <svg className="svg-icon" focusable="false" aria-hidden="true">
          <use href={`#symbol-status-${iconName}`} />
        </svg>
      </div>
    </td>
  );
}

/**
 * **JobColumn** — renders the job display name as a clickable model-link.
 *
 * Mirrors `hudson/views/JobColumn/column.jelly`.
 */
function renderJobCell(job: Job, jobBaseUrl: string): React.JSX.Element {
  const displayName: string = job.displayName || job.name;
  const href: string = `${jobBaseUrl}${job.name}/`;

  return (
    <td ref={sortDataRef(displayName)}>
      <a href={href} className="jenkins-table__link model-link inside">
        <span className="jenkins-table__link__text">{displayName}</span>
      </a>
    </td>
  );
}

/**
 * **WeatherColumn** — delegates to {@link BuildHealth} for the weather icon.
 *
 * Mirrors `hudson/views/WeatherColumn/column.jelly`.
 * Accesses {@link HealthReport.score} and {@link HealthReport.iconClassName}
 * to determine whether a health-detail link should be rendered.
 */
function renderWeatherCell(job: Job, jobBaseUrl: string): React.JSX.Element {
  const reports: HealthReport[] = job.healthReport ?? [];
  const primary: HealthReport | undefined = reports[0];

  /* Construct health link only when health data is available.
     Accessing score and iconClassName validates the HealthReport shape. */
  const healthLink: string | undefined =
    primary !== undefined &&
    primary.score !== undefined &&
    primary.iconClassName !== undefined
      ? `${jobBaseUrl}${job.name}/buildHealth`
      : undefined;

  /* BuildHealth renders a <td> when the `td` prop is set, including
     the sort-data ref for the health score — no wrapping needed. */
  return <BuildHealth job={job} td link={healthLink} />;
}

/**
 * Shared renderer for columns that display a build link with a relative
 * timestamp (Last Success, Last Failure, Last Build).
 */
function renderBuildLinkCell(
  job: Job,
  build: Build | null | undefined,
): React.JSX.Element {
  if (!build) {
    return <td ref={sortDataRef(-1)}>N/A</td>;
  }

  const timestamp: number = build.timestamp;
  const timeSince: string = formatTimeSince(timestamp);
  const buildResult: string | null = build.result;
  const dateStr: string = new Date(timestamp).toLocaleString();
  const titleText: string = buildResult
    ? `${buildResult} \u2013 ${dateStr}`
    : dateStr;

  return (
    <td ref={sortDataRef(timestamp)}>
      <BuildLink job={job} number={build.number} build={build} />
      <span className="jenkins-table__cell__time" title={titleText}>
        {timeSince}
      </span>
    </td>
  );
}

/**
 * **LastSuccessColumn** — last successful build link with timestamp.
 *
 * Mirrors `hudson/views/LastSuccessColumn/column.jelly`.
 */
function renderLastSuccessCell(job: Job): React.JSX.Element {
  return renderBuildLinkCell(job, job.lastSuccessfulBuild);
}

/**
 * **LastFailureColumn** — last failed build link with timestamp.
 *
 * Mirrors `hudson/views/LastFailureColumn/column.jelly`.
 */
function renderLastFailureCell(job: Job): React.JSX.Element {
  return renderBuildLinkCell(job, job.lastFailedBuild);
}

/**
 * **LastDurationColumn** — completed build duration, or a progress bar for
 * builds that are currently running.
 *
 * Mirrors `hudson/views/LastDurationColumn/column.jelly`.
 */
function renderLastDurationCell(job: Job): React.JSX.Element {
  const lastBuild: Build | null | undefined = job.lastBuild;

  /* In-progress build → show animated progress bar */
  if (lastBuild && lastBuild.building) {
    return (
      <td ref={sortDataRef(lastBuild.estimatedDuration || -1)}>
        <BuildProgressBar build={lastBuild} animate />
      </td>
    );
  }

  /* Completed build with a recorded duration → show formatted time */
  if (lastBuild && lastBuild.duration > 0) {
    return (
      <td ref={sortDataRef(lastBuild.duration)}>
        {formatDuration(lastBuild.duration)}
      </td>
    );
  }

  return <td ref={sortDataRef(-1)}>N/A</td>;
}

/**
 * **LastBuildColumn** — last build link with timestamp.
 *
 * Mirrors `jenkins/views/LastBuildColumn/column.jelly`.
 */
function renderLastBuildCell(job: Job): React.JSX.Element {
  return renderBuildLinkCell(job, job.lastBuild);
}

/**
 * **BuildButtonColumn** — "Build Now" trigger button.
 *
 * Mirrors `hudson/views/BuildButtonColumn/column.jelly`.
 * Only renders the button when the job is buildable.
 */
function renderBuildButtonCell(
  job: Job,
  jobBaseUrl: string,
): React.JSX.Element {
  if (!job.buildable) {
    return <td />;
  }

  const buildUrl: string = `${jobBaseUrl}${job.name}/build?delay=0sec`;

  return (
    <td className="jenkins-table__cell--tight">
      <div className="jenkins-table__cell__button-wrapper">
        <a
          href={buildUrl}
          className="jenkins-table__link"
          role="button"
          aria-label={`Build ${job.displayName || job.name}`}
        >
          <svg className="svg-icon" focusable="false" aria-hidden="true">
            <use href="#symbol-play" />
          </svg>
        </a>
      </div>
    </td>
  );
}

// ============================================================================
// Column Dispatch
// ============================================================================

/**
 * Renders a single column cell by dispatching on the column extension's
 * simple class name. Falls back to an empty `<td>` for unrecognised types,
 * ensuring the table row always has the correct number of cells.
 */
function renderColumnCell(
  col: ColumnExtension,
  job: Job,
  jobBaseUrl: string,
): React.JSX.Element {
  const simpleName: string = getSimpleName(col._class);

  switch (simpleName) {
    case "StatusColumn":
      return renderStatusCell(job);
    case "JobColumn":
      return renderJobCell(job, jobBaseUrl);
    case "WeatherColumn":
      return renderWeatherCell(job, jobBaseUrl);
    case "LastSuccessColumn":
      return renderLastSuccessCell(job);
    case "LastFailureColumn":
      return renderLastFailureCell(job);
    case "LastDurationColumn":
      return renderLastDurationCell(job);
    case "LastBuildColumn":
      return renderLastBuildCell(job);
    case "BuildButtonColumn":
      return renderBuildButtonCell(job, jobBaseUrl);
    default:
      /* Unknown column type — render an empty cell to maintain table
         structure rather than crashing the row. */
      return <td />;
  }
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * **ProjectViewRow** — Renders a single job/project row inside the project
 * list table.
 *
 * Replaces `core/src/main/resources/lib/hudson/projectViewRow.jelly`.
 *
 * The original Jelly template produces:
 * ```html
 * <tr id="job_{job.name}"
 *     class="{disabled ? 'disabledJob' : ''} job-status-{iconColor.iconName}">
 *   <!-- one <td> per column extension -->
 * </tr>
 * ```
 *
 * **CSS class mapping**:
 * - `disabledJob` — applied when `job.buildable` is `false` (Jelly's `job.disabled`)
 * - `job-status-{iconName}` — derived from `job.color` ({@link BallColor})
 *
 * @example
 * ```tsx
 * <ProjectViewRow
 *   job={jobData}
 *   columnExtensions={columns}
 *   jobBaseUrl="/job/"
 * />
 * ```
 */
function ProjectViewRow({
  job,
  columnExtensions,
  jobBaseUrl,
}: ProjectViewRowProps): React.JSX.Element {
  /* Resolve icon name from the job's BallColor for CSS class construction.
     Mirrors Jelly: class="job-status-${job.iconColor.iconName}" */
  const iconName: string = resolveIconName(job.color);

  /* Build CSS class list. Mirrors Jelly:
     class="${job.disabled?'disabledJob':null} job-status-${job.iconColor.iconName}"
     In the REST API, `job.buildable === false` corresponds to `job.disabled`. */
  const isDisabled: boolean = !job.buildable;
  const rowClassName: string = [
    isDisabled ? "disabledJob" : "",
    `job-status-${iconName}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <tr id={`job_${job.name}`} className={rowClassName}>
      {columnExtensions.map((col, index) => (
        <React.Fragment key={`${col._class}-${index}`}>
          {renderColumnCell(col, job, jobBaseUrl)}
        </React.Fragment>
      ))}
    </tr>
  );
}

export default ProjectViewRow;
