/*
 * The MIT License
 *
 * Copyright (c) 2004-2009, Sun Microsystems, Inc., Kohsuke Kawaguchi
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import React from "react";
import { useI18n } from "@/hooks/useI18n";
import type { Job, HealthReport } from "@/types/models";

/**
 * Props for the BuildHealth component.
 *
 * Mirrors the Jelly `<st:documentation>` attribute declarations from
 * `core/src/main/resources/lib/hudson/buildHealth.jelly` lines 28-31.
 */
export interface BuildHealthProps {
  /** Job object to display the health report for. Must have a `healthReport` array. */
  job: Job;
  /** If true, wraps the content in a `<td>` element instead of `<div>` for table cell context. */
  td?: boolean;
  /** href for the health icon link element. Defaults to '#' when health reports exist. */
  link?: string;
  /** Additional inline styles applied to the link element. */
  style?: React.CSSProperties;
}

/**
 * Default empty health report used when a job has no health data.
 * Mirrors: `<j:new var="emptyHealthReport" className="hudson.model.HealthReport"/>`
 * from buildHealth.jelly line 34.
 */
const EMPTY_HEALTH_REPORT: HealthReport = {
  score: 0,
  iconUrl: "",
  iconClassName: "icon-health-00to19",
  description: "",
};

/**
 * Escapes HTML special characters in a string for safe embedding
 * within the data-html-tooltip attribute's HTML content.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Builds the HTML string for the `data-html-tooltip` attribute.
 *
 * Generates a tooltip table listing all health reports with weather icons,
 * descriptions, and score percentages. Mirrors buildHealth.jelly lines 41-65.
 *
 * NOTE: Faithfully replicates the Jelly template behavior where ALL tooltip
 * icon cells use `buildHealth.iconClassName` (the primary/first report's icon)
 * instead of each individual report's `iconClassName`. This matches the
 * original Jelly template on line 56 which references `buildHealth.iconClassName`
 * inside the `<j:forEach var="rpt">` loop.
 *
 * @param healthReports - Array of all health reports for the job
 * @param buildHealth - The primary health report (first item) whose icon is used for all rows
 * @param descriptionLabel - Localized "Description" column header text
 * @returns HTML string suitable for the data-html-tooltip attribute
 */
function buildTooltipHtml(
  healthReports: HealthReport[],
  buildHealth: HealthReport,
  descriptionLabel: string,
): string {
  const rows = healthReports
    .map(
      (rpt) =>
        "<tr>" +
        '<td align="left" class="jenkins-table__cell--tight jenkins-table__icon">' +
        '<div class="jenkins-table__cell__button-wrapper">' +
        '<svg class="svg-icon" aria-hidden="true" focusable="false">' +
        `<use href="#symbol-weather-${escapeHtml(buildHealth.iconClassName)}"></use>` +
        "</svg>" +
        "</div>" +
        "</td>" +
        `<td align="left">${escapeHtml(rpt.description)}</td>` +
        `<td align="right">${rpt.score}</td>` +
        "</tr>",
    )
    .join("");

  return (
    '<div class="jenkins-tooltip--table-wrapper">' +
    '<table class="jenkins-table">' +
    "<thead>" +
    "<tr>" +
    '<th class="jenkins-!-padding-left-0" align="center">W</th>' +
    `<th align="left">${escapeHtml(descriptionLabel)}</th>` +
    '<th align="right">%</th>' +
    "</tr>" +
    "</thead>" +
    `<tbody>${rows}</tbody>` +
    "</table>" +
    "</div>"
  );
}

/**
 * BuildHealth — Renders a build health weather icon for a job.
 *
 * Replaces `core/src/main/resources/lib/hudson/buildHealth.jelly`.
 *
 * Displays the job's primary health score as a weather icon with an optional
 * HTML tooltip table showing all health reports, their individual weather
 * icons, descriptions, and score percentages.
 *
 * Rendering behavior:
 * - **Table context** (`td` prop): wraps in `<td>` element for use inside `<tr>`
 * - **Non-table context**: wraps in `<div>` element
 * - **With health reports**: renders a clickable `<a>` link wrapping the weather icon
 * - **Without health reports**: renders a plain weather icon with a score percentage tooltip
 *
 * The component is purely presentational — all data comes from the `job` prop.
 * No data fetching, no jQuery, no Handlebars, no behaviorShim patterns.
 *
 * @example
 * ```tsx
 * // In a table row
 * <BuildHealth job={job} td link={`${job.url}buildHealth`} />
 *
 * // Standalone
 * <BuildHealth job={job} />
 * ```
 */
function BuildHealth({
  job,
  td,
  link,
  style,
}: BuildHealthProps): React.JSX.Element {
  const { t } = useI18n();

  /* Resolve health reports from the job — mirrors Jelly line 33:
     <j:set var="healthReports" value="${job.buildHealthReports}"/> */
  const healthReports: HealthReport[] = job.healthReport ?? [];
  const hasReports = healthReports.length > 0;

  /* Primary health report or empty default — mirrors Jelly line 35:
     <j:set var="buildHealth" value="${empty(healthReports) ? emptyHealthReport : healthReports[0]}"/> */
  const buildHealth: HealthReport = hasReports
    ? healthReports[0]
    : EMPTY_HEALTH_REPORT;

  /* SVG symbol reference for the weather icon */
  const iconRef = `symbol-weather-${buildHealth.iconClassName}`;

  /* Localized "Description" column header with fallback */
  const descriptionLabel = t("Description") ?? "Description";

  /* Build tooltip HTML string when reports exist — mirrors Jelly lines 40-66 */
  const tooltipHtml = hasReports
    ? buildTooltipHtml(healthReports, buildHealth, descriptionLabel)
    : undefined;

  /**
   * Callback ref that imperatively sets the non-standard 'data' attribute on the
   * wrapper element. Jenkins's Sortable table JavaScript reads this attribute for
   * column sort values. React's JSX type system does not include bare 'data' as a
   * valid attribute on <td>/<div>, so we set it via the DOM API.
   * Mirrors Jelly line 38: <x:attribute name="data">${buildHealth.score}</x:attribute>
   */
  const setSortData = (el: HTMLElement | null): void => {
    if (el) {
      el.setAttribute("data", String(buildHealth.score));
    }
  };

  /* CSS class list for the wrapper — mirrors Jelly line 39 */
  const wrapperClassName =
    "jenkins-table__cell--tight jenkins-table__icon healthReport";

  /* Inner content: weather icon display with optional link — mirrors Jelly lines 68-81 */
  const iconContent = (
    <div className="jenkins-table__cell__button-wrapper">
      {hasReports ? (
        /* Link wrapping the weather icon when reports exist — Jelly lines 71-74:
           <a class="build-health-link jenkins-button jenkins-button--tertiary"
              href="${empty(link)?'#':link}" style="${attrs.style}"> */
        <a
          className="build-health-link jenkins-button jenkins-button--tertiary"
          href={link || "#"}
          style={style}
        >
          <svg className="svg-icon" aria-hidden="true" focusable="false">
            <use href={`#${iconRef}`} />
          </svg>
        </a>
      ) : (
        /* Plain icon with score tooltip when no reports — Jelly lines 76-78:
           <l:icon src="symbol-weather-${buildHealth.iconClassName}"
                   tooltip="${buildHealth.score}%" /> */
        <svg
          className="svg-icon"
          focusable="false"
          role="img"
          aria-label={`${buildHealth.score}%`}
        >
          <title>{`${buildHealth.score}%`}</title>
          <use href={`#${iconRef}`} />
        </svg>
      )}
    </div>
  );

  /* Dynamic wrapper element — mirrors Jelly line 37:
     <x:element name="${useTdElement!=null?'td':'div'}">
     Two branches are used instead of a dynamic tag variable so that
     TypeScript correctly types the ref callback for each element. */
  return td ? (
    <td
      ref={setSortData}
      className={wrapperClassName}
      data-html-tooltip={tooltipHtml}
    >
      {iconContent}
    </td>
  ) : (
    <div
      ref={setSortData}
      className={wrapperClassName}
      data-html-tooltip={tooltipHtml}
    >
      {iconContent}
    </div>
  );
}

export default BuildHealth;
