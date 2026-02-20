import React, { useState, useCallback, useMemo } from "react";
import { useStaplerQuery } from "@/hooks/useStaplerQuery";
import { useStaplerMutation } from "@/hooks/useStaplerMutation";
import { useI18n } from "@/hooks/useI18n";
import { useJenkinsNavigation } from "@/hooks/useJenkinsNavigation";
import Layout from "@/layout/Layout";
import Dialog from "@/components/dialogs/Dialog";
import { Skeleton } from "@/layout/Skeleton";
import type {
  Computer,
  ComputerSet as ComputerSetModel,
} from "@/types/models";

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Props for the ComputerSet page component.
 * Accepts optional pre-fetched data for SSR or initial hydration scenarios
 * where the server has already resolved the computer set model.
 */
export interface ComputerSetProps {
  /** Optional pre-fetched computer set data from server-side rendering */
  initialData?: ComputerSetModel;
}

/**
 * Extended API response type for GET /computer/api/json that includes the
 * description field available from the Java ComputerSet model but absent
 * from the base ComputerSet TypeScript interface.
 */
interface ComputerSetResponse extends ComputerSetModel {
  /** Optional description of the computer set from admin configuration */
  description?: string;
}

/**
 * Internal type representing a computed monitor column with its display
 * caption derived from the well-known node monitor class name.
 */
interface MonitorColumnInfo {
  /** Full monitor class name key (e.g. "hudson.node_monitors.DiskSpaceMonitor") */
  key: string;
  /** Human-readable column caption for the table header */
  caption: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Well-known Jenkins node monitor class names mapped to human-readable column
 * header captions. These monitors are defined in Jenkins core and provide
 * health/status data for each connected agent node. The keys match the
 * entries in Computer.monitorData from the Stapler REST API response.
 */
const MONITOR_CAPTIONS: Record<string, string> = {
  "hudson.node_monitors.ArchitectureMonitor": "Architecture",
  "hudson.node_monitors.ClockMonitor": "Clock Difference",
  "hudson.node_monitors.DiskSpaceMonitor": "Free Disk Space",
  "hudson.node_monitors.ResponseTimeMonitor": "Response Time",
  "hudson.node_monitors.SwapSpaceMonitor": "Free Swap Space",
  "hudson.node_monitors.TemporarySpaceMonitor": "Free Temp Space",
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats a byte value into a human-readable size string with the appropriate
 * unit suffix. Mirrors the rendering logic from Jenkins' DiskSpace.toString()
 * used by DiskSpaceMonitor and TemporarySpaceMonitor column.jelly templates.
 *
 * @param bytes - Size in bytes to format
 * @returns Formatted string such as "4.52 GB", or "N/A" for negative values
 */
function formatBytes(bytes: number): string {
  if (bytes < 0) {
    return "N/A";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex > 0 ? 2 : 0)} ${units[unitIndex]}`;
}

/**
 * Renders the display value for a single monitor data cell based on the
 * monitor class name key and the raw data value from the API response.
 *
 * Each monitor type stores data in a different format:
 * - ArchitectureMonitor: plain string (e.g. "Linux (amd64)")
 * - DiskSpaceMonitor/TemporarySpaceMonitor: { path: string, size: number }
 * - SwapSpaceMonitor: { availablePhysicalMemory, availableSwapSpace, ... }
 * - ResponseTimeMonitor: { average: number } (milliseconds)
 * - ClockMonitor: { diff: number } (milliseconds)
 *
 * @param key - Monitor class name identifying the monitor type
 * @param value - Raw monitor data value from Computer.monitorData
 * @returns Formatted string representation for display in the table cell
 */
function renderMonitorValue(_key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return "N/A";
  }

  // ArchitectureMonitor returns a plain string (OS + arch)
  if (typeof value === "string") {
    return value;
  }

  // Numeric fallback for simple numeric monitors
  if (typeof value === "number") {
    return String(value);
  }

  // Object-based monitor data with type-specific field extraction
  if (typeof value === "object") {
    const data = value as Record<string, unknown>;

    // DiskSpaceMonitor / TemporarySpaceMonitor → { path, size }
    if ("size" in data && typeof data.size === "number") {
      return formatBytes(data.size);
    }

    // SwapSpaceMonitor → { availablePhysicalMemory, totalPhysicalMemory,
    //                       availableSwapSpace, totalSwapSpace }
    if (
      "availablePhysicalMemory" in data &&
      typeof data.availablePhysicalMemory === "number"
    ) {
      const memStr = formatBytes(data.availablePhysicalMemory);
      if (
        "availableSwapSpace" in data &&
        typeof data.availableSwapSpace === "number"
      ) {
        return `${memStr} / ${formatBytes(data.availableSwapSpace)}`;
      }
      return memStr;
    }

    // ResponseTimeMonitor → { average }
    if ("average" in data && typeof data.average === "number") {
      return `${data.average}ms`;
    }

    // ClockMonitor → { diff }
    if ("diff" in data && typeof data.diff === "number") {
      return `${data.diff}ms`;
    }
  }

  // Fallback for unrecognized formats
  return String(value);
}

// ============================================================================
// Component
// ============================================================================

/**
 * ComputerSet page component — renders the Jenkins node (agent/computer)
 * management page with a sortable table of all nodes, their status icons,
 * monitor data columns, action buttons, and an icon legend modal dialog.
 *
 * Data is fetched from GET /computer/api/json?depth=1 via useStaplerQuery,
 * replacing the server-side data injection from the Jelly template's
 * it.computers and it._monitors expressions.
 *
 * Replaces three source files:
 * - core/src/main/resources/hudson/model/ComputerSet/index.jelly (146 lines)
 * - core/src/main/resources/hudson/model/ComputerSet/_legend.jelly (42 lines)
 * - src/main/js/pages/computer-set/index.js (16 lines)
 */
const ComputerSet: React.FC<ComputerSetProps> = ({ initialData }) => {
  // --- Hooks -----------------------------------------------------------------
  const { t } = useI18n();
  const { buildUrl } = useJenkinsNavigation();

  // --- State: icon legend modal visibility -----------------------------------
  const [legendOpen, setLegendOpen] = useState<boolean>(false);

  // --- Data fetching: GET /computer/api/json?depth=1 -------------------------
  // Replaces server-side data injection that Jelly gets from it.computers
  // and it._monitors. The depth=1 parameter retrieves full monitor data.
  const {
    data: computerSet,
    isLoading,
    error,
    refetch,
  } = useStaplerQuery<ComputerSetResponse>({
    queryKey: ["computerSet"],
    url: "/computer/api/json?depth=1",
  });

  // --- Mutation: POST /computer/updateNow (Refresh status) -------------------
  // Replaces the Jelly <form method="post" action="updateNow"> on line 49 of
  // index.jelly. CSRF crumb injection is handled automatically by the hook.
  const { mutate: refreshStatus, isPending: isRefreshing } = useStaplerMutation<
    void,
    Record<string, unknown>
  >({
    url: "/computer/updateNow",
    contentType: "form-urlencoded",
    onSettled: () => {
      void refetch();
    },
  });

  // --- Callbacks (memoized for referential stability) ------------------------

  /** Opens the icon legend modal dialog */
  const handleLegendOpen = useCallback(() => {
    setLegendOpen(true);
  }, []);

  /** Closes the icon legend modal dialog */
  const handleLegendClose = useCallback(() => {
    setLegendOpen(false);
  }, []);

  /** Triggers a POST to /computer/updateNow to refresh all node statuses */
  const handleRefreshStatus = useCallback(() => {
    refreshStatus({});
  }, [refreshStatus]);

  // --- Computed data ---------------------------------------------------------

  // Prefer fetched data; fall back to initialData for SSR hydration
  const data = computerSet ?? (initialData as ComputerSetResponse | undefined);

  // Compute monitor columns from the first computer's monitorData keys.
  // Mirrors the Jelly iteration: <j:forEach var="m" items="${it._monitors}">
  // where each monitor with a non-null columnCaption becomes a table column.
  const monitorColumns = useMemo<MonitorColumnInfo[]>(() => {
    if (!data?.computer?.length) {
      return [];
    }
    const firstComputer = data.computer[0];
    if (!firstComputer.monitorData) {
      return [];
    }
    return Object.keys(firstComputer.monitorData)
      .filter((key) => key in MONITOR_CAPTIONS)
      .map((key) => ({
        key,
        caption: MONITOR_CAPTIONS[key],
      }));
  }, [data]);

  // Derive table size class based on computer count for visual density.
  // Larger node lists use a more compact table variant to fit more rows.
  const sizeClass = useMemo(() => {
    const count = data?.computer?.length ?? 0;
    if (count > 20) {
      return "jenkins-table--small";
    }
    if (count > 10) {
      return "jenkins-table--medium";
    }
    return "";
  }, [data]);

  // --- Loading state ---------------------------------------------------------
  if (isLoading && !data) {
    return (
      <Layout title={t("Nodes") ?? "Nodes"}>
        <Skeleton type="form" />
      </Layout>
    );
  }

  // --- Error state -----------------------------------------------------------
  if (error && !data) {
    return (
      <Layout title={t("Nodes") ?? "Nodes"}>
        <div className="jenkins-!-error-color" role="alert">
          {t("Error loading node data") ?? "Error loading node data."}
        </div>
      </Layout>
    );
  }

  // --- Main render -----------------------------------------------------------
  return (
    <Layout title={data?.displayName ?? t("Nodes") ?? "Nodes"}>
      {/* ================================================================
          App Bar — mirrors index.jelly lines 30-61
          Renders the page header with title and action buttons.
          ================================================================ */}
      <div className="jenkins-app-bar">
        <div className="jenkins-app-bar__content">
          <h1>{data?.displayName ?? t("Nodes") ?? "Nodes"}</h1>
          <div className="jenkins-app-bar__controls">
            {/* New Node button — mirrors index.jelly lines 36-41
                In Jelly: shown only with Computer.CREATE permission.
                Backend enforces access control on the /computer/new endpoint. */}
            <a
              className="jenkins-button jenkins-button--primary"
              href={buildUrl("/computer/new")}
            >
              <svg className="svg-icon" aria-hidden="true">
                <use href="#symbol-add" />
              </svg>
              {t("New Node") ?? "New Node"}
            </a>

            {/* Configure Monitors button — mirrors index.jelly lines 42-47
                In Jelly: shown only with MANAGE_AND_SYSTEM_READ permission.
                Backend enforces access control on /computer/configure. */}
            <a
              className="jenkins-button"
              href={buildUrl("/computer/configure")}
              title={
                t("Configure Node Monitors") ?? "Configure Node Monitors"
              }
            >
              {t("Configure Monitors") ?? "Configure Monitors"}
            </a>

            {/* Refresh status button — mirrors index.jelly lines 48-54
                POSTs to /computer/updateNow via useStaplerMutation.
                In Jelly: shown only with ADMINISTER/MANAGE permission.
                Backend enforces access control on the POST endpoint. */}
            <button
              className="jenkins-button"
              type="button"
              title={t("Refresh status") ?? "Refresh status"}
              onClick={handleRefreshStatus}
              disabled={isRefreshing}
            >
              <svg className="svg-icon" aria-hidden="true">
                <use href="#symbol-refresh" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================
          Description block — mirrors index.jelly lines 57-59
          ================================================================ */}
      {data?.description && (
        <div className="jenkins-page-description">{data.description}</div>
      )}

      {/* ================================================================
          Executor summary — surfaces busyExecutors/totalExecutors from the
          ComputerSet API response for at-a-glance capacity information.
          ================================================================ */}
      {data && data.totalExecutors > 0 && (
        <div className="jenkins-!-margin-bottom-2">
          <span>
            {t("Executors") ?? "Executors"}: {data.busyExecutors} / {data.totalExecutors}
          </span>
        </div>
      )}

      {/* ================================================================
          Sortable Node Table — mirrors index.jelly lines 63-132
          Preserves id="computers" for legacy sortable plugin behavior.
          Preserves class="sortable" for client-side sorting from
          war/src/main/webapp/scripts/sortable.js.
          ================================================================ */}
      <table
        id="computers"
        className={`jenkins-table ${sizeClass} sortable`.trim()}
      >
        <thead>
          <tr>
            {/* Status column — "S" header (tight cell) */}
            <th className="jenkins-table__cell--tight">
              {t("S") ?? "S"}
            </th>
            {/* Name column — primary sort column per Jelly line 72 */}
            <th>{t("Name") ?? "Name"}</th>
            {/* Dynamic monitor columns derived from monitorData keys */}
            {monitorColumns.map((col) => (
              <th
                key={col.key}
                className="jenkins-table__cell--tight"
                data-sort-disable="true"
                style={{ textAlign: "right" }}
              >
                {col.caption}
              </th>
            ))}
            {/* Empty configuration column (sort disabled) */}
            <th
              className="jenkins-table__cell--tight"
              data-sort-disable="true"
            />
          </tr>
        </thead>
        <tbody>
          {data?.computer?.map((computer: Computer) => (
            <tr
              key={computer.displayName}
              id={`node_${computer.displayName}`}
            >
              {/* Status icon cell — mirrors index.jelly lines 85-89.
                  data-sort-value enables sortable.js to sort by icon state.
                  Tooltip shows offlineCauseReason when the node is offline. */}
              <td
                data-sort-value={computer.icon ?? ""}
                className="jenkins-table__cell--tight jenkins-table__icon"
              >
                <div
                  className="jenkins-table__cell__button-wrapper"
                  title={
                    computer.offline && computer.offlineCauseReason
                      ? computer.offlineCauseReason
                      : ""
                  }
                >
                  <svg
                    className="svg-icon"
                    aria-hidden="true"
                  >
                    <use href={`#${computer.iconClassName ?? ""}`} />
                  </svg>
                </div>
              </td>

              {/* Name cell — mirrors index.jelly lines 91-93.
                  Preserves class="jenkins-table__link model-link inside"
                  for consistent link styling across Jenkins views. */}
              <td>
                <a
                  href={buildUrl(
                    `/computer/${encodeURIComponent(computer.displayName)}/`,
                  )}
                  className="jenkins-table__link model-link inside"
                >
                  {computer.displayName}
                </a>
              </td>

              {/* Monitor data cells — mirrors index.jelly lines 95-100.
                  Each cell renders the formatted value from monitorData. */}
              {monitorColumns.map((col) => (
                <td key={col.key} style={{ textAlign: "right" }}>
                  {renderMonitorValue(
                    col.key,
                    computer.monitorData?.[col.key],
                  )}
                </td>
              ))}

              {/* Configuration gear cell — mirrors index.jelly lines 102-110.
                  In Jelly: shown only with Computer.EXTENDED_READ permission.
                  Backend enforces access control on the configure endpoint. */}
              <td className="jenkins-table__cell--tight">
                <div className="jenkins-table__cell__button-wrapper">
                  <a
                    href={buildUrl(
                      `/computer/${encodeURIComponent(computer.displayName)}/configure`,
                    )}
                    className="jenkins-button jenkins-button--tertiary"
                    title={t("Configure") ?? "Configure"}
                  >
                    <svg className="svg-icon" aria-hidden="true">
                      <use href="#symbol-settings" />
                    </svg>
                  </a>
                </div>
              </td>
            </tr>
          ))}

          {/* Footer row — mirrors index.jelly lines 119-131.
              Class "sortbottom" pins this row to the table bottom during
              client-side sorting performed by sortable.js. */}
          <tr className="sortbottom">
            <th />
            <th>{t("Data obtained") ?? "Data obtained"}</th>
            {monitorColumns.map((col) => (
              <th key={col.key} style={{ textAlign: "right" }} />
            ))}
            <th />
          </tr>
        </tbody>
      </table>

      {/* Empty state when no computers are present */}
      {(!data?.computer || data.computer.length === 0) && !isLoading && (
        <p className="jenkins-!-color-text-secondary">
          {t("No nodes available") ?? "No nodes available."}
        </p>
      )}

      {/* ================================================================
          Legend button — mirrors index.jelly lines 133-143
          Preserves id="button-computer-icon-legend" for legacy plugin
          compatibility and automated test selectors.
          ================================================================ */}
      <div className="jenkins-buttons-row jenkins-buttons-row--invert">
        <button
          className="jenkins-button jenkins-button--tertiary"
          id="button-computer-icon-legend"
          type="button"
          onClick={handleLegendOpen}
        >
          {t("Legend") ?? "Legend"}
        </button>
      </div>

      {/* ================================================================
          Icon Legend Modal — replaces three source artifacts:
          - <template id="template-computer-icon-legend"> from index.jelly
          - dialog.modal(content, {maxWidth:"550px", title}) from index.js
          - _legend.jelly icon status definition list

          Preserves maxWidth="550px" matching source index.js line 12.
          All 5 icon statuses match _legend.jelly exactly:
          online, paused, temp-offline, not-accepting, offline
          ================================================================ */}
      {legendOpen && (
        <Dialog
          dialogType="modal"
          options={{
            title: t("Computer icon legend") ?? "Computer icon legend",
            maxWidth: "550px",
            content: (
              <>
                <h2 className="jenkins-dialog__subtitle">
                  {t("Status") ?? "Status"}
                </h2>
                <dl className="app-icon-legend">
                  <dt>
                    <svg className="svg-icon" aria-hidden="true">
                      <use href="#symbol-computer" />
                    </svg>
                  </dt>
                  <dd>{t("online") ?? "online"}</dd>

                  <dt>
                    <svg className="svg-icon" aria-hidden="true">
                      <use href="#symbol-computer-paused" />
                    </svg>
                  </dt>
                  <dd>{t("paused") ?? "paused"}</dd>

                  <dt>
                    <svg className="svg-icon" aria-hidden="true">
                      <use href="#symbol-computer-disconnected" />
                    </svg>
                  </dt>
                  <dd>{t("temp-offline") ?? "temp-offline"}</dd>

                  <dt>
                    <svg className="svg-icon" aria-hidden="true">
                      <use href="#symbol-computer-not-accepting" />
                    </svg>
                  </dt>
                  <dd>{t("not-accepting") ?? "not-accepting"}</dd>

                  <dt>
                    <svg className="svg-icon" aria-hidden="true">
                      <use href="#symbol-computer-offline" />
                    </svg>
                  </dt>
                  <dd>{t("offline") ?? "offline"}</dd>
                </dl>
              </>
            ),
          }}
          open={true}
          onResolve={handleLegendClose}
          onCancel={handleLegendClose}
        />
      )}
    </Layout>
  );
};

export default ComputerSet;
