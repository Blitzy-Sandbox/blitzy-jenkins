import { useState } from "react";
import { useStaplerQuery } from "@/hooks/useStaplerQuery";
import { useI18n } from "@/hooks/useI18n";
import type { Build, Artifact } from "@/types/models";
import { getBaseUrl } from "@/utils/baseUrl";

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

/**
 * Props for the ArtifactList component.
 *
 * Mirrors the Jelly tag attributes from
 * `core/src/main/resources/lib/hudson/artifactList.jelly`:
 *  - `it` → `build`  (the build model whose artifacts are displayed)
 *  - `caption` attribute → `caption`
 *  - derived from `it.url` → `buildUrl` (optional override)
 */
export interface ArtifactListProps {
  /** The build whose artifacts to display. When null/undefined nothing renders. */
  build: Build | null | undefined;
  /** Human-readable heading shown above the artifact listing. */
  caption: string;
  /**
   * Explicit build URL override.  When omitted the URL is derived from
   * `build.url`.  Useful when the parent already resolved the build URL
   * and wants to avoid re-computation.
   */
  buildUrl?: string;
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

/**
 * Shape returned by the Stapler REST endpoint
 * `{buildUrl}api/json?tree=artifacts[relativePath,displayPath,fileName]`.
 */
interface ArtifactsApiResponse {
  artifacts: Artifact[];
}

/**
 * Node in the hierarchical artifact directory tree.
 *
 * Directory nodes contain children; leaf (file) nodes carry the original
 * `Artifact` reference for link generation.
 */
interface ArtifactTreeNode {
  /** Display name — directory segment name or artifact file name. */
  name: string;
  /** Full relative path from the build root. */
  path: string;
  /** `true` for directories, `false` for individual files. */
  isDirectory: boolean;
  /** Original artifact data (only present on file/leaf nodes). */
  artifact?: Artifact;
  /** Child nodes (only meaningful on directory nodes). */
  children: ArtifactTreeNode[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * When the number of artifacts exceeds this value the component renders a
 * collapsible directory tree instead of a flat list.
 */
const TREE_VIEW_THRESHOLD = 20;

/**
 * Maximum number of individual artifacts rendered before the component
 * truncates the listing and shows a "view all" link to the full artifact
 * directory on the Jenkins server.
 */
const MAX_DISPLAY_COUNT = 200;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Ensures a URL ends with exactly one trailing slash.
 *
 * Stapler model URLs such as `job/myproject/1` sometimes omit the trailing
 * slash which is required for correct path concatenation (e.g. appending
 * `api/json` or `artifact/`).
 */
function normalizeUrl(url: string): string {
  if (!url) {
    return "";
  }
  return url.endsWith("/") ? url : `${url}/`;
}

/**
 * Builds a hierarchical tree from a flat artifact array.
 *
 * Each artifact's `relativePath` is split on `/` to create nested directory
 * nodes.  The resulting tree is sorted directories-first, then
 * alphabetically within each level.
 *
 * @param artifacts - Flat list from the Stapler API response
 * @returns Top-level tree nodes ready for rendering
 */
function buildArtifactTree(artifacts: Artifact[]): ArtifactTreeNode[] {
  const root: ArtifactTreeNode = {
    name: "",
    path: "",
    isDirectory: true,
    children: [],
  };

  for (const artifact of artifacts) {
    const segments = artifact.relativePath.split("/");
    let current = root;

    for (let depth = 0; depth < segments.length; depth++) {
      const segment = segments[depth];
      const isLeaf = depth === segments.length - 1;

      if (isLeaf) {
        // File node — always a new leaf
        current.children.push({
          name: artifact.fileName || segment,
          path: artifact.relativePath,
          isDirectory: false,
          artifact,
          children: [],
        });
      } else {
        // Directory node — reuse existing or create
        let dirNode = current.children.find(
          (child) => child.isDirectory && child.name === segment,
        );
        if (!dirNode) {
          const dirPath = current.path ? `${current.path}/${segment}` : segment;
          dirNode = {
            name: segment,
            path: dirPath,
            isDirectory: true,
            children: [],
          };
          current.children.push(dirNode);
        }
        current = dirNode;
      }
    }
  }

  sortTreeNodes(root.children);
  return root.children;
}

/**
 * Recursively sorts tree nodes in-place: directories first, then files,
 * each group sorted alphabetically by name.
 */
function sortTreeNodes(nodes: ArtifactTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.isDirectory && node.children.length > 0) {
      sortTreeNodes(node.children);
    }
  }
}

// ---------------------------------------------------------------------------
// Sub-component: ArtifactTreeBranch
// ---------------------------------------------------------------------------

/**
 * Renders a single node within the artifact directory tree.
 *
 * - **Directory nodes** are collapsible via a toggle button.
 *   The expanded/collapsed state is local to the node and managed with
 *   `useState`.
 * - **File (leaf) nodes** render as download links following the Jelly URL
 *   pattern `{rootURL}/{build.url}artifact/{relativePath}`.
 */
function ArtifactTreeBranch({
  node,
  artifactBaseUrl,
}: {
  node: ArtifactTreeNode;
  artifactBaseUrl: string;
}) {
  const [expanded, setExpanded] = useState<boolean>(true);

  // --- Leaf node (file) ---------------------------------------------------
  if (!node.isDirectory && node.artifact) {
    return (
      <li className="artifact-tree-leaf" role="treeitem">
        <a href={`${artifactBaseUrl}${node.artifact.relativePath}`}>
          {node.artifact.displayPath || node.artifact.fileName}
        </a>
      </li>
    );
  }

  // --- Directory node ------------------------------------------------------
  const handleToggle = (): void => {
    setExpanded((prev) => !prev);
  };

  return (
    <li
      className="artifact-tree-directory"
      role="treeitem"
      aria-expanded={expanded}
    >
      <button
        type="button"
        className="artifact-tree-toggle jenkins-button jenkins-button--tertiary"
        onClick={handleToggle}
        aria-label={`${expanded ? "Collapse" : "Expand"} directory ${node.name}`}
      >
        {/* Triangle indicator: ▶ collapsed / ▼ expanded */}
        <span className="artifact-tree-icon" aria-hidden="true">
          {expanded ? "\u25BC" : "\u25B6"}
        </span>{" "}
        {node.name}/
      </button>

      {expanded && (
        <ul className="artifact-tree-children" role="group">
          {node.children.map((child) => (
            <ArtifactTreeBranch
              key={child.path}
              node={child}
              artifactBaseUrl={artifactBaseUrl}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * **ArtifactList** — Build artifact listing component.
 *
 * Replaces `core/src/main/resources/lib/hudson/artifactList.jelly` and its
 * companion `core/src/main/resources/lib/hudson/artifactList.js`.
 *
 * ### Migration from Jelly/JS
 *
 * The original Jelly template had three rendering branches:
 *
 * 1. `build == null` → render nothing.
 * 2. `build.hasCustomArtifactManager()` → output a `<tbody class="artifact-list">`
 *    stub with `data-url` / `data-caption` attributes.  A companion JS adjunct
 *    (`artifactList.js`) would then `fetch()` the HTML from the `data-url`
 *    and inject it via `innerHTML` + `Behaviour.applySubtree()`.
 * 3. Standard path → `<st:include it="${build}" page="artifactList"/>`,
 *    delegating to the build model's own Jelly fragment.
 *
 * The React version unifies cases 2 and 3 by always fetching structured
 * artifact data via the Stapler REST API and rendering JSX.  This eliminates
 * the `fetch()` + `innerHTML` + `Behaviour.applySubtree()` imperative pattern
 * with declarative React Query data fetching and component rendering.
 *
 * ### Rendering Modes
 *
 * - **Flat list** — for ≤ {@link TREE_VIEW_THRESHOLD} artifacts.
 * - **Collapsible tree view** — for > {@link TREE_VIEW_THRESHOLD} artifacts,
 *   grouping by directory path with expand/collapse toggles.
 * - **Truncation** — when artifacts exceed {@link MAX_DISPLAY_COUNT} the
 *   listing is capped and a "view all" link to the full artifact directory
 *   is displayed.
 *
 * @param props {@link ArtifactListProps}
 * @returns Rendered artifact listing, or `null` when no build or no artifacts.
 */
export default function ArtifactList({
  build,
  caption,
  buildUrl,
}: ArtifactListProps) {
  const { t } = useI18n();
  const baseUrl = getBaseUrl();

  // Resolve the effective build URL — prefer explicit prop, fall back to model
  const effectiveBuildUrl: string = buildUrl
    ? normalizeUrl(buildUrl)
    : build
      ? normalizeUrl(build.url)
      : "";

  // Fetch artifacts from the Stapler REST API.
  // Replaces the legacy artifactList.js  fetch() → innerHTML pattern with
  // React Query declarative caching and background refetch.
  const { data, isLoading, isError } = useStaplerQuery<ArtifactsApiResponse>({
    queryKey: ["artifacts", effectiveBuildUrl],
    url: `${effectiveBuildUrl}api/json?tree=artifacts[relativePath,displayPath,fileName]`,
    enabled: !!build && effectiveBuildUrl.length > 0,
  });

  // ── Case 1: No build → render nothing (Jelly "it == null" branch) ──────
  if (!build) {
    return null;
  }

  // ── Construct download and directory base URLs ──────────────────────────
  // Artifact download link pattern from Jelly line 43:
  //   {rootURL}/{build.url}artifact/{relativePath}
  const artifactBaseUrl = `${baseUrl}/${effectiveBuildUrl}artifact/`;

  // Link to the full artifact directory on the Jenkins server
  const artifactDirectoryUrl = `${baseUrl}/${effectiveBuildUrl}artifact/`;

  // ── Loading state ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="artifact-list">
        <h2>{caption}</h2>
        <div
          className="jenkins-spinner"
          role="status"
          aria-label={t("Loading") || "Loading artifacts\u2026"}
        />
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="artifact-list">
        <h2>{caption}</h2>
        <p className="error" role="alert">
          {t("ErrorLoadingArtifacts") || "Unable to load artifacts."}
        </p>
      </div>
    );
  }

  // ── Resolve artifact list ───────────────────────────────────────────────
  // Prefer fresh API response; fall back to build.artifacts if the API
  // returned successfully but with an unexpected shape.
  const artifacts: Artifact[] = data?.artifacts ?? build.artifacts ?? [];

  // No artifacts — render nothing (consistent with Jelly behaviour that
  // omits the section entirely when no artifacts exist).
  if (artifacts.length === 0) {
    return null;
  }

  // ── Truncation ──────────────────────────────────────────────────────────
  const isTruncated = artifacts.length > MAX_DISPLAY_COUNT;
  const displayArtifacts = isTruncated
    ? artifacts.slice(0, MAX_DISPLAY_COUNT)
    : artifacts;

  // ── Choose rendering mode ───────────────────────────────────────────────
  const useTreeView = displayArtifacts.length > TREE_VIEW_THRESHOLD;

  return (
    <div className="artifact-list">
      <h2>{caption}</h2>

      {useTreeView ? (
        /* ── Tree view for large artifact sets ──────────────────────────── */
        <ul className="artifact-tree" role="tree" aria-label={caption}>
          {buildArtifactTree(displayArtifacts).map((node) => (
            <ArtifactTreeBranch
              key={node.path}
              node={node}
              artifactBaseUrl={artifactBaseUrl}
            />
          ))}
        </ul>
      ) : (
        /* ── Flat list for small artifact sets ──────────────────────────── */
        <ul className="artifact-flat-list">
          {displayArtifacts.map((artifact) => (
            <li key={artifact.relativePath}>
              <a href={`${artifactBaseUrl}${artifact.relativePath}`}>
                {artifact.displayPath || artifact.fileName}
              </a>
            </li>
          ))}
        </ul>
      )}

      {/* ── "View all" link when artifact list is truncated ─────────────── */}
      {isTruncated && (
        <p className="artifact-view-all">
          <a href={artifactDirectoryUrl}>
            {t("ViewAllArtifacts") || `View all ${artifacts.length} artifacts`}
          </a>
        </p>
      )}
    </div>
  );
}
