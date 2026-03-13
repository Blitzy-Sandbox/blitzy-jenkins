/**
 * @file ComputerDetail — React individual node detail page component.
 *
 * Replaces four Jelly template files for the Jenkins computer/node detail page:
 * - `hudson/model/Computer/index.jelly`       — Main detail page (117 lines)
 * - `hudson/model/Computer/sidepanel.jelly`    — Side navigation panel (53 lines)
 * - `hudson/model/Computer/index-top.jelly`    — Editable description (6 lines)
 * - `hudson/model/Computer/load-statistics.jelly` — Load statistics reference
 *
 * Renders node status, offline controls, monitoring data, labels tag cloud,
 * and tied projects. Data is fetched from GET /computer/{name}/api/json.
 *
 * No jQuery — React Query replaces `$.ajax`.
 * No Handlebars — JSX replaces templates.
 * No behaviorShim — React lifecycle replaces `Behaviour.specify()`.
 *
 * @module pages/computer/ComputerDetail
 */

import React, { useState, useCallback, useMemo } from "react";
import { useStaplerQuery } from "@/hooks/useStaplerQuery";
import { useStaplerMutation } from "@/hooks/useStaplerMutation";
import { useI18n } from "@/hooks/useI18n";
import { useJenkinsNavigation } from "@/hooks/useJenkinsNavigation";
import Layout from "@/layout/Layout";
import Skeleton from "@/layout/Skeleton";
import EditableDescription from "@/hudson/EditableDescription";
import ProjectView from "@/hudson/ProjectView";
import type { Computer, Job, OfflineCause, Label } from "@/types/models";

// ============================================================================
// Local Types
// ============================================================================

/**
 * Extended Computer data from GET /computer/{name}/api/json?depth=2.
 *
 * The base {@link Computer} interface is designed for ComputerSet listings.
 * The detail endpoint at higher depth returns additional fields such as
 * `caption`, `node`, `assignedLabels`, `channel`, and `tiedJobs`.
 */
interface ComputerDetailData extends Computer {
  /** Caption text used as the page heading (may differ from displayName) */
  caption?: string;
  /** Node configuration with description and label data (depth >= 1) */
  node?: {
    nodeDescription?: string;
    assignedLabels?: Label[];
    selfLabel?: Label;
    [key: string]: unknown;
  };
  /** Labels assigned to this computer (available at depth >= 1) */
  assignedLabels?: Label[];
  /** Whether the computer is currently in the process of connecting */
  connecting?: boolean;
  /** Communication channel to the agent — null if not connected */
  channel?: unknown;
  /** Projects tied to this node via label affinity (depth >= 2) */
  tiedJobs?: Job[];
}

/**
 * Side panel navigation link descriptor.
 */
interface SidePanelLink {
  /** Display title for the task link */
  title: string;
  /** Full href for navigation */
  href: string;
  /** SVG symbol icon ID (e.g. "symbol-settings") */
  icon: string;
  /** Whether this is a destructive action (delete) */
  isDanger?: boolean;
  /** Confirmation message for destructive actions */
  confirmMessage?: string;
}

// ============================================================================
// Exported Props Interface
// ============================================================================

/**
 * Props for the {@link ComputerDetail} component.
 */
export interface ComputerDetailProps {
  /** Node name from URL path parameter (e.g. "agent-01") */
  nodeName: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extracts a human-readable caption from a monitoring data key.
 *
 * Monitoring data keys are fully-qualified Java class names such as
 * `"hudson.node_monitors.DiskSpaceMonitor"`. This function extracts the
 * simple class name and inserts spaces before capital letters.
 *
 * @example getMonitorCaption("hudson.node_monitors.DiskSpaceMonitor") // "Disk Space"
 */
function getMonitorCaption(key: string): string {
  const lastDot = key.lastIndexOf(".");
  const simpleName = lastDot >= 0 ? key.substring(lastDot + 1) : key;
  return simpleName
    .replace(/Monitor$/, "")
    .replace(/([A-Z])/g, " $1")
    .trim();
}

/**
 * Renders a monitoring data value as a displayable string.
 *
 * Handles the various data types Stapler serializes for node monitors:
 * - `null`/`undefined` → "N/A"
 * - Strings and numbers → direct string representation
 * - Objects with `displayName` or `description` → extracted text
 * - Objects with `size` (disk space) → converted to GB
 * - Fallback → JSON stringification
 */
function renderMonitorValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "N/A";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("displayName" in obj && typeof obj.displayName === "string") {
      return obj.displayName;
    }
    if ("description" in obj && typeof obj.description === "string") {
      return obj.description;
    }
    if ("size" in obj && typeof obj.size === "number") {
      const sizeGB = obj.size / (1024 * 1024 * 1024);
      return `${sizeGB.toFixed(2)} GB`;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// ============================================================================
// Component Implementation
// ============================================================================

/**
 * Individual node detail page component.
 *
 * Renders the full detail page for a single Jenkins computer/agent node:
 * - **Side panel**: Navigation links for Status, Delete Agent, Configure,
 *   Build History, Load Statistics, and Script Console (conditional).
 * - **App bar**: Page heading with offline toggle controls and help link.
 * - **Description**: Inline-editable node description via EditableDescription.
 * - **Offline cause**: Displayed when the node is offline with a cause.
 * - **Monitoring data**: Expandable table showing node monitor readings.
 * - **Labels**: Tag cloud of assigned labels (excluding self-label).
 * - **Tied projects**: ProjectView listing jobs tied to this node.
 *
 * All data is fetched from Stapler REST endpoints via React Query hooks.
 * Offline control actions use POST mutations with automatic CSRF crumb injection.
 */
function ComputerDetail({ nodeName }: ComputerDetailProps): React.JSX.Element {
  const { t } = useI18n();
  const { buildUrl } = useJenkinsNavigation();

  // ---- Local state ----
  const [monitoringExpanded, setMonitoringExpanded] = useState(false);

  // ---- URL encoding for API paths ----
  const encodedName = encodeURIComponent(nodeName);

  // ---- Primary data fetch: node detail ----
  const {
    data: computer,
    isLoading,
    error,
  } = useStaplerQuery<ComputerDetailData>({
    queryKey: ["computer", nodeName],
    url: `/computer/${encodedName}/api/json?depth=2`,
    enabled: !!nodeName,
  });

  // ---- Secondary fetch: tied jobs (tree-filtered for efficiency) ----
  const { data: tiedJobsResponse } = useStaplerQuery<{
    tiedJobs?: Job[];
  }>({
    queryKey: ["computer", nodeName, "tiedJobs"],
    url: `/computer/${encodedName}/api/json?tree=tiedJobs[name,url,displayName,fullDisplayName,color]`,
    enabled: !!nodeName && !!computer,
  });

  // Prefer depth-2 data, fall back to tree-filtered query
  const tiedJobs: Job[] | undefined =
    computer?.tiedJobs ?? tiedJobsResponse?.tiedJobs;

  // ---- Offline control mutations (mirrors index.jelly lines 37-55) ----

  /** POST to toggleOffline — brings node back online (line 40-42) */
  const toggleOfflineMutation = useStaplerMutation<
    unknown,
    Record<string, unknown>
  >({
    url: `/computer/${encodedName}/toggleOffline`,
    responseType: "text",
    onSuccess: () => {
      window.location.reload();
    },
  });

  /** POST to markOffline — marks node temporarily offline (line 50-52) */
  const markOfflineMutation = useStaplerMutation<
    unknown,
    Record<string, unknown>
  >({
    url: `/computer/${encodedName}/markOffline`,
    responseType: "text",
    onSuccess: () => {
      window.location.reload();
    },
  });

  /** POST to setOfflineCause — updates the offline cause (line 43-45) */
  const setOfflineCauseMutation = useStaplerMutation<
    unknown,
    Record<string, unknown>
  >({
    url: `/computer/${encodedName}/setOfflineCause`,
    responseType: "text",
    onSuccess: () => {
      window.location.reload();
    },
  });

  // ---- Stable event handlers ----
  const handleToggleOffline = useCallback(() => {
    toggleOfflineMutation.mutate({});
  }, [toggleOfflineMutation]);

  const handleMarkOffline = useCallback(() => {
    markOfflineMutation.mutate({});
  }, [markOfflineMutation]);

  const handleSetOfflineCause = useCallback(() => {
    setOfflineCauseMutation.mutate({});
  }, [setOfflineCauseMutation]);

  // ---- Side panel links (mirrors sidepanel.jelly lines 33-43) ----
  const sidePanelLinks: SidePanelLink[] = useMemo(() => {
    if (!computer) {
      return [];
    }
    const baseComputerUrl = `/computer/${encodedName}`;

    const links: SidePanelLink[] = [
      // Status — sidepanel.jelly line 33
      {
        title: t("Status") ?? "Status",
        href: buildUrl(`${baseComputerUrl}/`),
        icon: computer.iconClassName ?? "symbol-computer",
      },
      // Delete Agent — sidepanel.jelly line 34 (l:delete with confirm)
      {
        title: t("Delete Agent") ?? "Delete Agent",
        href: buildUrl(`${baseComputerUrl}/doDelete`),
        icon: "symbol-trash",
        isDanger: true,
        confirmMessage: `${t("delete.confirm") ?? "Are you sure you want to delete agent"} ${computer.displayName}?`,
      },
      // Configure — sidepanel.jelly lines 35-36
      {
        title: t("Configure") ?? "Configure",
        href: buildUrl(`${baseComputerUrl}/configure`),
        icon: "symbol-settings",
      },
      // Build History — sidepanel.jelly line 37
      {
        title: t("Build History") ?? "Build History",
        href: buildUrl(`${baseComputerUrl}/builds`),
        icon: "symbol-build-history",
      },
      // Load Statistics — sidepanel.jelly line 38
      {
        title: t("Load Statistics") ?? "Load Statistics",
        href: buildUrl(`${baseComputerUrl}/load-statistics`),
        icon: "symbol-analytics",
      },
    ];

    // Script Console — only when channel is available (sidepanel.jelly lines 39-41)
    if (computer.channel != null) {
      links.push({
        title: t("Script Console") ?? "Script Console",
        href: buildUrl(`${baseComputerUrl}/script`),
        icon: "symbol-terminal",
      });
    }

    return links;
  }, [computer, encodedName, buildUrl, t]);

  // ---- Filtered labels (exclude self-label, mirrors index.jelly lines 85-96) ----
  const filteredLabels: Label[] = useMemo(() => {
    const labels: Label[] =
      computer?.assignedLabels ?? computer?.node?.assignedLabels ?? [];
    // Filter out the self-label (node's own name) — mirrors Jelly line 90:
    // j:if test="${entry.item != it.node.selfLabel}"
    const selfLabelName =
      computer?.node?.selfLabel?.name ?? computer?.displayName;
    return labels.filter((label) => label.name !== selfLabelName);
  }, [computer]);

  // ===========================================================================
  // Loading State — renders Skeleton while data is being fetched
  // ===========================================================================
  if (isLoading) {
    return (
      <Layout title={nodeName}>
        <Skeleton type="form" />
      </Layout>
    );
  }

  // ===========================================================================
  // Error State — renders error message when API request fails
  // ===========================================================================
  if (error) {
    return (
      <Layout title={nodeName}>
        <div className="jenkins-app-bar">
          <div className="jenkins-app-bar__content">
            <h1>{nodeName}</h1>
          </div>
        </div>
        <div className="error" role="alert">
          <p>
            {t("Error loading node details") ?? "Error loading node details"}
            {": "}
            {error.message}
          </p>
        </div>
      </Layout>
    );
  }

  // ===========================================================================
  // Not Found State — when computer data is null/undefined after loading
  // ===========================================================================
  if (!computer) {
    return (
      <Layout title={nodeName}>
        <div className="jenkins-app-bar">
          <div className="jenkins-app-bar__content">
            <h1>{nodeName}</h1>
          </div>
        </div>
        <p>{t("Node not found") ?? "Node not found"}</p>
      </Layout>
    );
  }

  // ===========================================================================
  // Side Panel — mirrors sidepanel.jelly lines 29-52
  // ===========================================================================
  const sidePanel = (
    <nav aria-label={t("Node actions") ?? "Node actions"}>
      <ul className="task-link-container">
        {sidePanelLinks.map((link) => (
          <li key={link.href} className="task">
            <a
              href={link.href}
              className={`task-link${link.isDanger ? " task-link--danger" : ""}`}
              {...(link.confirmMessage
                ? { "data-message": link.confirmMessage }
                : {})}
            >
              <span className="task-icon-link">
                <svg className="svg-icon" aria-hidden="true" focusable="false">
                  <use href={`#${link.icon}`} />
                </svg>
              </span>
              <span className="task-link-text">{link.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );

  // ===========================================================================
  // Main Page Render
  // ===========================================================================
  return (
    <Layout
      title={computer.displayName}
      type="two-column"
      sidePanel={sidePanel}
    >
      {/* ================================================================= */}
      {/* App Bar — mirrors index.jelly lines 31-57                         */}
      {/* ================================================================= */}
      <div className="jenkins-app-bar">
        <div className="jenkins-app-bar__content">
          <h1>{computer.caption ?? computer.displayName}</h1>
          <div className="jenkins-app-bar__controls">
            {/* Temporarily offline controls — mirrors lines 37-55 */}
            {computer.temporarilyOffline ? (
              <>
                {/* "Bring this node back online" — POST to toggleOffline (lines 40-42) */}
                <button
                  type="button"
                  className="jenkins-button jenkins-!-destructive-color"
                  onClick={handleToggleOffline}
                  disabled={toggleOfflineMutation.isPending}
                >
                  {t("submit.temporarilyOffline") ??
                    "Bring this node back online"}
                </button>
                {/* "Update offline cause" — POST to setOfflineCause (lines 43-45) */}
                <button
                  type="button"
                  className="jenkins-button"
                  onClick={handleSetOfflineCause}
                  disabled={setOfflineCauseMutation.isPending}
                >
                  {t("submit.updateOfflineCause") ?? "Update offline cause"}
                </button>
              </>
            ) : (
              /* "Mark this node temporarily offline" — POST to markOffline (lines 50-52) */
              <button
                type="button"
                className="jenkins-button"
                onClick={handleMarkOffline}
                disabled={markOfflineMutation.isPending}
              >
                {t("submit.not.temporarilyOffline") ??
                  "Mark this node temporarily offline"}
              </button>
            )}

            {/* Help link — mirrors index.jelly line 56 */}
            <a
              href="https://www.jenkins.io/doc/book/using/using-agents/"
              className="jenkins-help-button"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("Help") ?? "Help"}
            >
              <svg className="svg-icon" aria-hidden="true" focusable="false">
                <use href="#symbol-help" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Editable Description — mirrors index-top.jelly                    */}
      {/* t:editableDescription permission=CONFIGURE hideButton=true        */}
      {/* ================================================================= */}
      <EditableDescription
        description={computer.node?.nodeDescription ?? computer.description}
        hasPermission={true}
        hideButton={true}
      />

      {/* ================================================================= */}
      {/* Offline Cause — mirrors index.jelly lines 61-63                   */}
      {/* Shown when node is offline with a cause and not connecting         */}
      {/* ================================================================= */}
      {computer.offlineCause && computer.offline && !computer.connecting && (
        <div className="offline-cause">
          <p>
            {(computer.offlineCause as OfflineCause).description ??
              computer.offlineCauseReason ??
              t("Offline") ??
              "Offline"}
          </p>
        </div>
      )}

      {/* ================================================================= */}
      {/* Manual Launch Section — mirrors index.jelly lines 65-67           */}
      {/* When manual launch is allowed, launcher controls are shown         */}
      {/* ================================================================= */}
      {computer.manualLaunchAllowed && (
        <div className="jenkins-!-margin-bottom-2">
          {/* Launcher controls are a plugin extension point — the launcher's
              main.jelly is rendered server-side by the Stapler pipeline. This
              div provides the DOM slot where plugin-contributed launcher UI
              is injected by the Jelly rendering layer. */}
        </div>
      )}

      {/* ================================================================= */}
      {/* No Manual Launch Notice — mirrors index.jelly lines 69-71         */}
      {/* Shown when offline, no manual launch, but launch is supported     */}
      {/* ================================================================= */}
      {computer.offline &&
        !computer.manualLaunchAllowed &&
        computer.launchSupported && (
          <p>
            {t("title.no_manual_launch") ??
              "This node is not accepting manual launches."}
          </p>
        )}

      {/* ================================================================= */}
      {/* Monitoring Data — mirrors index.jelly lines 73-83                 */}
      {/* <f:advanced> rendered as collapsible <details> element            */}
      {/* ================================================================= */}
      {computer.monitorData && Object.keys(computer.monitorData).length > 0 && (
        <details
          className="jenkins-details"
          open={monitoringExpanded}
          onToggle={(e) =>
            setMonitoringExpanded((e.target as HTMLDetailsElement).open)
          }
        >
          <summary>{t("Monitoring Data") ?? "Monitoring Data"}</summary>
          <table className="jenkins-table jenkins-table--small jenkins-table--auto-width">
            <tbody>
              {Object.entries(computer.monitorData).map(([key, value]) => (
                <tr key={key}>
                  <td>{getMonitorCaption(key)}</td>
                  <td>{renderMonitorValue(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {/* ================================================================= */}
      {/* Labels — mirrors index.jelly lines 85-96                          */}
      {/* Tag cloud of assigned labels, filtering out self-label            */}
      {/* ================================================================= */}
      {filteredLabels.length > 0 && (
        <div className="jenkins-!-margin-bottom-3">
          <h2>{t("Labels") ?? "Labels"}</h2>
          <div>
            {filteredLabels.map((label, index) => (
              <React.Fragment key={label.name}>
                <a
                  className="model-link inside"
                  href={buildUrl(`/label/${encodeURIComponent(label.name)}`)}
                >
                  {label.name}
                </a>
                {index < filteredLabels.length - 1 && <wbr />}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Tied Projects — mirrors index.jelly lines 100-111                 */}
      {/* ================================================================= */}
      <div className="jenkins-!-margin-bottom-3">
        <h2>
          {t("title.projects_tied_on") ??
            `Projects tied to ${computer.displayName}`}
        </h2>
        {tiedJobs && tiedJobs.length > 0 ? (
          <ProjectView jobs={tiedJobs} />
        ) : (
          <p>{t("None") ?? "None"}</p>
        )}
      </div>
    </Layout>
  );
}

export default ComputerDetail;
