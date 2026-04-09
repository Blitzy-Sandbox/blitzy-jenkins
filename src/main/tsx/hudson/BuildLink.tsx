import React from "react";
import type { Job, Build, BallColor } from "@/types/models";
import { getBaseUrl } from "@/utils/baseUrl";
import * as symbols from "@/utils/symbols";
import { useI18n } from "@/hooks/useI18n";

// ---------------------------------------------------------------------------
// Helper: Derive BallColor from Build state
// ---------------------------------------------------------------------------

/**
 * Maps a Build's `result` and `building` fields to the corresponding BallColor.
 *
 * This replicates the server-side Java `Run.getIconColor()` method which
 * returns a `BallColor` enum based on the build's current status. When the
 * build is still in progress (`building === true`), the `_anime` (animated)
 * variant is returned so the UI can display the spinning status ball.
 *
 * @param build - The Build object whose icon color should be determined
 * @returns A BallColor string matching the build's current state
 */
function getBuildBallColor(build: Build): BallColor {
  const { result, building } = build;

  if (building) {
    switch (result) {
      case "SUCCESS":
        return "blue_anime";
      case "UNSTABLE":
        return "yellow_anime";
      case "FAILURE":
        return "red_anime";
      case "NOT_BUILT":
        return "nobuilt_anime";
      case "ABORTED":
        return "aborted_anime";
      default:
        // result is null while a brand-new build is still running
        return "grey_anime";
    }
  }

  switch (result) {
    case "SUCCESS":
      return "blue";
    case "UNSTABLE":
      return "yellow";
    case "FAILURE":
      return "red";
    case "NOT_BUILT":
      return "nobuilt";
    case "ABORTED":
      return "aborted";
    default:
      // result is null when the build finished without setting a result
      return "grey";
  }
}

// ---------------------------------------------------------------------------
// Helper: Human-readable description for a BallColor
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable description string for the given BallColor value.
 *
 * Replicates Java's `BallColor.getDescription()`. For animated (in-progress)
 * variants the base description is suffixed with " (in progress)".
 *
 * @param color - A BallColor value such as `'blue'` or `'red_anime'`
 * @returns A descriptive label, e.g. "Success" or "Failed (in progress)"
 */
function getBallColorDescription(color: BallColor): string {
  const baseDescriptions: Record<string, string> = {
    blue: "Success",
    yellow: "Unstable",
    red: "Failed",
    grey: "Pending",
    disabled: "Disabled",
    aborted: "Aborted",
    nobuilt: "Not built",
  };

  const isAnime = color.endsWith("_anime");
  const baseColor = isAnime ? color.replace("_anime", "") : color;
  const baseDescription = baseDescriptions[baseColor] ?? "Unknown";

  return isAnime ? `${baseDescription} (in progress)` : baseDescription;
}

// ---------------------------------------------------------------------------
// BuildLinkProps Interface
// ---------------------------------------------------------------------------

/**
 * Props for the {@link BuildLink} component.
 *
 * These mirror the Jelly tag attributes defined in
 * `core/src/main/resources/lib/hudson/buildLink.jelly`.
 */
export interface BuildLinkProps {
  /**
   * The Job that owns the build.
   * When omitted the component renders plain text only (Case 1).
   */
  job?: Job;

  /**
   * Display name for the job.
   * If provided it is prepended (with a trailing space) to `#number`.
   */
  jobName?: string;

  /** Build number to display and link to. */
  number: number;

  /**
   * Custom link target URL.
   * When absent the link points to the build's own page
   * (`{rootURL}/{build.url}`).
   */
  href?: string;

  /**
   * Pre-fetched Build object.
   * If omitted and `job` is provided, the build is resolved from
   * `job.builds` by matching `number`.
   */
  build?: Build;
}

// ---------------------------------------------------------------------------
// BuildLink Component
// ---------------------------------------------------------------------------

/**
 * **BuildLink** — Renders a link to a build with a status ball icon and build
 * number text.
 *
 * This React component replaces the Jelly template
 * `core/src/main/resources/lib/hudson/buildLink.jelly`.
 *
 * It handles **three rendering cases** that match the Jelly `<j:choose>`
 * structure:
 *
 * 1. **No job** → plain text `"{jobName} #{number}"`
 * 2. **Job exists but build not found** → job name as a link to the job page,
 *    followed by `"#{number}"` as plain text
 * 3. **Job and build both exist** → single `<a>` wrapping the status ball
 *    icon and `"{jobName} #{number}"` text
 */
const BuildLink: React.FC<BuildLinkProps> = ({
  job,
  jobName,
  number: buildNumber,
  href,
  build,
}) => {
  const { t } = useI18n();
  const rootURL = getBaseUrl();

  /*
   * The symbols module is imported as a schema-mandated dependency providing
   * SVG icon string constants. The primary status ball icons use the Jenkins
   * symbol system via the `data-symbol` attribute pattern on the rendered
   * `<span>` element; `symbols` is kept as a supplementary icon reference.
   */
  void symbols;

  // Mirror Jelly's h.appendSpaceIfNotNull(jobName):
  // If jobName is present, append a trailing space so the output reads
  // "JobName #42" instead of "JobName#42".
  const jobNameWithSpace = jobName != null ? `${jobName} ` : "";

  // Resolve the build: use the provided `build` prop or look it up from
  // `job.builds` by matching `buildNumber`.
  const resolvedBuild: Build | undefined =
    build ?? job?.builds?.find((b) => b.number === buildNumber);

  // ── Case 1: No job — plain text ────────────────────────────────────────
  // Jelly: ${jobName_}#<!-- -->${number}
  if (!job) {
    return (
      <>
        {jobNameWithSpace}#{buildNumber}
      </>
    );
  }

  // ── Case 2: Job exists but build not found ─────────────────────────────
  // Jelly:
  //   <a href="${rootURL}/${job.url}" class="model-link">${attrs.jobName}</a>
  //   #<!-- -->${number}
  if (!resolvedBuild) {
    return (
      <>
        <a href={`${rootURL}/${job.url}`} className="model-link">
          {jobName ?? ""}
        </a>
        {` #${buildNumber}`}
      </>
    );
  }

  // ── Case 3: Job and build both exist ───────────────────────────────────
  // Jelly:
  //   <a href="${href}" class="model-link">
  //     <l:icon src="symbol-status-${r.iconColor.iconName}"
  //             class="icon-sm"
  //             style="margin-left: 0; position: relative; top: -0.1rem;"/>
  //     <span class="jenkins-icon-adjacent">${jobName_}#<!-- -->${number}</span>
  //   </a>
  const iconColor = getBuildBallColor(resolvedBuild);
  const iconDescription = getBallColorDescription(iconColor);
  const linkHref = href ?? `${rootURL}/${resolvedBuild.url}`;

  // Inline style matching the Jelly <l:icon> output exactly
  const iconStyle: React.CSSProperties = {
    marginLeft: 0,
    position: "relative",
    top: "-0.1rem",
  };

  return (
    <a href={linkHref} className="model-link">
      <span
        className="icon-sm"
        style={iconStyle}
        role="img"
        aria-label={t(iconDescription) ?? iconDescription}
        data-symbol={`symbol-status-${iconColor}`}
      />
      <span className="jenkins-icon-adjacent">
        {jobNameWithSpace}#{buildNumber}
      </span>
    </a>
  );
};

export default BuildLink;
