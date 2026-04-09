/**
 * Core domain model TypeScript interfaces for Jenkins REST API responses.
 *
 * These types correspond to @ExportedBean / @Exported annotated Java model classes
 * as exposed by Stapler REST API JSON endpoints (/api/json). They are consumed by
 * the api/, hooks/, components/, hudson/, and pages/ directories for compile-time
 * type safety.
 *
 * Key conventions:
 * - `_class` is an optional Stapler type discriminator included in all JSON responses
 * - `| null` is used for Java nullable fields (Stapler serializes null as JSON null)
 * - `unknown` is used instead of `any` for truly dynamic data
 * - String literal unions are used for known Java enums
 */

// ============================================================================
// Enum-Like Types and Constants
// ============================================================================

/**
 * Build status ball color icons.
 * Derived from hudson.model.BallColor Java enum (14 values).
 * The '_anime' suffix indicates an in-progress (animated) state.
 */
export type BallColor =
  | "red"
  | "red_anime"
  | "yellow"
  | "yellow_anime"
  | "blue"
  | "blue_anime"
  | "grey"
  | "grey_anime"
  | "disabled"
  | "disabled_anime"
  | "aborted"
  | "aborted_anime"
  | "nobuilt"
  | "nobuilt_anime";

/**
 * Build result status values.
 * Derived from hudson.model.Result Java class static final constants.
 */
export type ResultStatus =
  | "SUCCESS"
  | "UNSTABLE"
  | "FAILURE"
  | "NOT_BUILT"
  | "ABORTED";

// ============================================================================
// Action and Cause Types
// ============================================================================

/**
 * Represents a model action attached to Jenkins objects (jobs, builds, views, etc.).
 * Actions are polymorphic — `_class` is the Stapler type discriminator used
 * to identify the concrete action type at runtime.
 */
export interface Action {
  /** Stapler class discriminator for polymorphic deserialization */
  _class?: string;
  /** URL fragment for the action's web page (e.g., "testReport") */
  urlName?: string;
  /** Icon file name or path for the action's visual representation */
  iconFileName?: string;
  /** Human-readable display name for the action */
  displayName?: string;
}

/**
 * Represents a build cause describing why a build was triggered.
 * Derived from hudson.model.Cause and its subclasses:
 * - UpstreamCause: adds upstreamProject, upstreamBuild, upstreamUrl
 * - UserIdCause: adds userId, userName
 *
 * All subclass-specific fields are flattened as optional members since
 * the Stapler JSON response includes them based on the concrete _class.
 */
export interface Cause {
  /** Stapler class discriminator (e.g., "hudson.model.Cause$UserIdCause") */
  _class?: string;
  /** Human-readable description of the cause */
  shortDescription: string;
  /** Name of the upstream project (UpstreamCause only) */
  upstreamProject?: string;
  /** Build number of the upstream trigger (UpstreamCause only) */
  upstreamBuild?: number;
  /** URL of the upstream project (UpstreamCause only) */
  upstreamUrl?: string;
  /** ID of the user who triggered the build (UserIdCause only) */
  userId?: string;
  /** Display name of the triggering user (UserIdCause only) */
  userName?: string;
}

/**
 * Action that wraps a list of build causes.
 * Typically the first action in a build's action list.
 */
export interface CauseAction extends Action {
  /** List of causes that triggered the build */
  causes: Cause[];
}

// ============================================================================
// Health Report Type
// ============================================================================

/**
 * Build health indicator using weather-icon metaphor.
 * Derived from hudson.model.HealthReport @Exported fields:
 * score (0-100), iconUrl, iconClassName, description.
 */
export interface HealthReport {
  /** Health score from 0 (worst) to 100 (best) */
  score: number;
  /** Relative URL to the weather icon image */
  iconUrl: string;
  /** CSS class name for the icon (Jenkins symbol system) */
  iconClassName: string;
  /** Human-readable health description */
  description: string;
}

// ============================================================================
// Supporting Types (used by core model interfaces)
// ============================================================================

/**
 * Extensible property attached to a Job.
 * Concrete implementations provide job-level configuration extensions.
 */
export interface JobProperty {
  /** Stapler class discriminator */
  _class?: string;
}

/**
 * Build artifact file reference.
 * Derived from hudson.model.Run.Artifact @Exported fields.
 */
export interface Artifact {
  /** Display path for the artifact in the UI */
  displayPath: string;
  /** File name of the artifact */
  fileName: string;
  /** Path relative to the build's artifact root directory */
  relativePath: string;
}

/**
 * Author/user information for changeset entries and other user references.
 */
export interface UserInfo {
  /** Absolute URL to the user's profile page */
  absoluteUrl?: string;
  /** Full display name of the user */
  fullName: string;
}

/**
 * Individual changeset entry (e.g., a single git commit).
 */
export interface ChangeSetItem {
  /** Stapler class discriminator */
  _class?: string;
  /** Version control commit identifier (e.g., git SHA) */
  commitId?: string;
  /** Commit message */
  msg: string;
  /** Author of the changeset entry */
  author: UserInfo;
  /** Timestamp of the changeset entry in milliseconds since epoch */
  timestamp?: number;
  /** List of file paths affected by this changeset */
  affectedPaths?: string[];
}

/**
 * Changeset list grouping representing a set of changes from a single SCM.
 * Each build may have multiple ChangeSetLists (e.g., multi-SCM configurations).
 */
export interface ChangeSetList {
  /** Stapler class discriminator */
  _class?: string;
  /** Individual changeset entries in this list */
  items: ChangeSetItem[];
  /** SCM kind identifier (e.g., "git", "svn") */
  kind: string;
}

/**
 * Information about an executable task running on an executor.
 * Typically a Build/Run reference with URL and display name.
 */
export interface ExecutableInfo {
  /** Stapler class discriminator */
  _class?: string;
  /** Build number of the executable */
  number?: number;
  /** URL of the executable's page */
  url?: string;
  /** Full display name (e.g., "MyProject #42") */
  fullDisplayName?: string;
}

/**
 * Executor status information.
 * Derived from hudson.model.Executor @Exported fields.
 */
export interface ExecutorInfo {
  /** Stapler class discriminator */
  _class?: string;
  /** Executor slot number (0-based) on its parent computer */
  number: number;
  /** Whether the executor is idle (not running any task) */
  idle: boolean;
  /** Whether the current execution is likely stuck */
  likelyStuck: boolean;
  /** Execution progress percentage (-1 if unknown, 0-100 otherwise) */
  progress: number;
  /** Currently running executable, or null if idle */
  currentExecutable: ExecutableInfo | null;
  /** Current work unit being executed */
  currentWorkUnit?: unknown;
}

// ============================================================================
// Queue Types
// ============================================================================

/**
 * Task reference within a queue item.
 * Represents the job/project that is waiting in the build queue.
 */
export interface QueueTask {
  /** Stapler class discriminator */
  _class?: string;
  /** Name of the task (typically the job name) */
  name: string;
  /** URL of the task's project page */
  url: string;
  /** Build status ball color of the task */
  color?: BallColor;
}

/**
 * Item in the Jenkins build queue.
 * Derived from hudson.model.Queue.Item @Exported fields.
 */
export interface QueueItem {
  /** Stapler class discriminator */
  _class?: string;
  /** Unique queue item identifier */
  id: number;
  /** The task (job) that is queued */
  task: QueueTask;
  /** Whether the item is stuck in the queue */
  stuck: boolean;
  /** Whether the item is blocked by another build or condition */
  blocked: boolean;
  /** Whether the item is ready to be built (all conditions met) */
  buildable: boolean;
  /** Human-readable reason why the item is in the queue, or null if buildable */
  why: string | null;
  /** Build parameters as a newline-delimited string */
  params?: string;
  /** Timestamp when the item became buildable, in milliseconds since epoch */
  buildableStartMilliseconds?: number;
  /** Timestamp when the item entered the queue, in milliseconds since epoch */
  inQueueSince: number;
  /** Actions associated with this queue item */
  actions: Action[];
  /** URL of the queue item's page */
  url?: string;
}

/**
 * Jenkins build queue containing all pending items.
 * Represents the response from the queue API endpoint.
 */
export interface Queue {
  /** Stapler class discriminator */
  _class?: string;
  /** List of items currently in the build queue */
  items: QueueItem[];
}

// ============================================================================
// Build (Run) Interface
// ============================================================================

/**
 * Represents a build (run) of a Jenkins job.
 * Derived from hudson.model.Run @ExportedBean with @Exported fields:
 * number, id, url, displayName, fullDisplayName, description, timestamp,
 * duration, estimatedDuration, result, building, keepLog, queueId,
 * executor, actions, artifacts, changeSets.
 */
export interface Build {
  /** Stapler class discriminator */
  _class?: string;
  /** Sequential build number */
  number: number;
  /** Build identifier string (typically same as number for modern builds) */
  id: string;
  /** URL of the build's page */
  url: string;
  /** Short display name for the build (e.g., "#42") */
  displayName: string;
  /** Full display name including project (e.g., "MyProject #42") */
  fullDisplayName?: string;
  /** Optional build description set by user or script */
  description: string | null;
  /** Build start time as milliseconds since epoch */
  timestamp: number;
  /** Actual build duration in milliseconds (0 while building) */
  duration: number;
  /** Estimated build duration in milliseconds based on historical data */
  estimatedDuration: number;
  /** Build result status, or null if the build is still in progress */
  result: ResultStatus | null;
  /** Whether the build is currently in progress */
  building: boolean;
  /** Whether the build log is marked for permanent retention */
  keepLog: boolean;
  /** ID of the queue item that triggered this build */
  queueId: number;
  /** Executor running this build, or null if completed */
  executor: ExecutorInfo | null;
  /** Actions attached to this build (cause actions, test results, etc.) */
  actions: Action[];
  /** Build artifacts produced by this build */
  artifacts: Artifact[];
  /** Changeset lists associated with this build */
  changeSets?: ChangeSetList[];
}

// ============================================================================
// Job Interface
// ============================================================================

/**
 * Represents a Jenkins job/project.
 * Derived from hudson.model.Job @ExportedBean with @Exported fields from
 * Job.java, AbstractItem.java (name, displayName, fullName, fullDisplayName,
 * description, url), and various getter methods.
 */
export interface Job {
  /** Stapler class discriminator */
  _class?: string;
  /** Short name of the job (URL-safe identifier) */
  name: string;
  /** Display name for the job (may differ from name) */
  displayName: string;
  /** Fully qualified name including parent folders (e.g., "folder/job") */
  fullName: string;
  /** Fully qualified display name including parent folders */
  fullDisplayName: string;
  /** Optional job description in HTML or plain text */
  description: string | null;
  /** Absolute URL of the job's page */
  url: string;
  /** Whether the job can be built (not disabled) */
  buildable: boolean;
  /** Current build status ball color */
  color: BallColor;
  /** Next build number that will be assigned */
  nextBuildNumber: number;
  /** Whether the job currently has an item in the build queue */
  inQueue: boolean;
  /** Queue item for this job if inQueue is true, otherwise null */
  queueItem?: QueueItem | null;
  /** List of builds (limited by API depth/tree parameters) */
  builds: Build[];
  /** Most recent build, or null if no builds exist */
  lastBuild: Build | null;
  /** Most recent successful build, or null */
  lastSuccessfulBuild: Build | null;
  /** Most recent failed build, or null */
  lastFailedBuild: Build | null;
  /** Most recent stable build (SUCCESS), or null */
  lastStableBuild: Build | null;
  /** Most recent unstable build (UNSTABLE), or null */
  lastUnstableBuild: Build | null;
  /** Most recent completed build (not in progress), or null */
  lastCompletedBuild: Build | null;
  /** Health reports aggregated from various health metrics */
  healthReport: HealthReport[];
  /** Job properties providing additional configuration */
  property: JobProperty[];
  /** Actions attached to this job */
  actions: Action[];
  /** Whether the job allows concurrent builds */
  concurrentBuild?: boolean;
}

// ============================================================================
// View Interfaces
// ============================================================================

/**
 * Extensible property attached to a View.
 * Concrete implementations provide view-level configuration extensions.
 */
export interface ViewProperty {
  /** Stapler class discriminator */
  _class?: string;
}

/**
 * Represents a Jenkins view (a filtered collection of jobs).
 * Derived from hudson.model.View @ExportedBean with @Exported fields:
 * name, url, description, jobs, property.
 */
export interface View {
  /** Stapler class discriminator */
  _class?: string;
  /** Name of the view */
  name: string;
  /** URL of the view's page */
  url: string;
  /** Optional view description */
  description: string | null;
  /** Jobs included in this view */
  jobs: Job[];
  /** View properties providing additional configuration */
  property: ViewProperty[];
}

// ============================================================================
// Computer (Node) Interfaces
// ============================================================================

/**
 * Reason why a computer (node) is offline.
 */
export interface OfflineCause {
  /** Stapler class discriminator */
  _class?: string;
  /** Timestamp when the node went offline, in milliseconds since epoch */
  timestamp?: number;
  /** Human-readable description of why the node is offline */
  description?: string;
}

/**
 * Single data point in load statistics with time-windowed aggregation.
 */
export interface LoadStatisticsRecord {
  /** Most recent recorded value */
  latest: number;
  /** Hourly average value */
  hour: number;
}

/**
 * Load statistics for a computer (node), tracking executor utilization
 * and queue pressure.
 */
export interface LoadStatistics {
  /** Number of busy executors over time */
  busyExecutors: LoadStatisticsRecord;
  /** Queue length over time */
  queueLength: LoadStatisticsRecord;
  /** Total number of executors over time */
  totalExecutors: LoadStatisticsRecord;
}

/**
 * Represents a Jenkins computer (agent/node).
 * Derived from hudson.model.Computer @ExportedBean with @Exported fields.
 */
export interface Computer {
  /** Stapler class discriminator */
  _class?: string;
  /** Display name of the computer */
  displayName: string;
  /** Optional description of the computer */
  description?: string;
  /** Icon identifier for the computer */
  icon?: string;
  /** CSS class name for the computer's icon */
  iconClassName?: string;
  /** Whether all executors are idle */
  idle: boolean;
  /** Whether this is a JNLP (inbound) agent */
  jnlpAgent: boolean;
  /** Whether launching the agent is supported */
  launchSupported: boolean;
  /** Whether manual agent launch is allowed */
  manualLaunchAllowed: boolean;
  /** Number of executor slots configured */
  numExecutors: number;
  /** Whether the computer is offline */
  offline: boolean;
  /** Cause of the offline status, or null if online */
  offlineCause: OfflineCause | null;
  /** Human-readable string describing the offline cause */
  offlineCauseReason: string;
  /** Whether the computer has been manually taken offline temporarily */
  temporarilyOffline: boolean;
  /** Regular executor slots and their current status */
  executors: ExecutorInfo[];
  /** One-off executor slots (for flyweight tasks) */
  oneOffExecutors: ExecutorInfo[];
  /** Load statistics for this computer */
  loadStatistics: LoadStatistics;
  /** Monitoring data from installed monitors (key = monitor class name) */
  monitorData: Record<string, unknown>;
  /** Actions attached to this computer */
  actions: Action[];
}

/**
 * Represents the computer set (collection of all nodes).
 * Derived from the /computer/api/json root response.
 */
export interface ComputerSet {
  /** Stapler class discriminator */
  _class?: string;
  /** Total number of busy executors across all computers */
  busyExecutors: number;
  /** Total number of executors across all computers */
  totalExecutors: number;
  /** List of all computers (nodes) in the Jenkins instance */
  computer: Computer[];
  /** Display name for the computer set (typically "Nodes") */
  displayName: string;
}

// ============================================================================
// Plugin Model Types
// ============================================================================

/**
 * Plugin dependency information within a plugin's dependency list.
 */
export interface PluginDependencyInfo {
  /** Short name of the dependency plugin */
  shortName: string;
  /** Required version of the dependency */
  version: string;
  /** Whether the dependency is optional */
  optional: boolean;
}

/**
 * Represents an installed Jenkins plugin.
 * Derived from the plugin manager API response for installed plugins.
 */
export interface Plugin {
  /** Stapler class discriminator */
  _class?: string;
  /** Short name (artifact ID) of the plugin */
  shortName: string;
  /** Human-readable long name of the plugin */
  longName: string;
  /** Currently installed version string */
  version: string;
  /** URL to the plugin's documentation or homepage */
  url?: string;
  /** Whether the plugin is currently active (loaded and running) */
  active: boolean;
  /** Whether the plugin is enabled (will be loaded on restart) */
  enabled: boolean;
  /** Whether an update is available for this plugin */
  hasUpdate: boolean;
  /** Whether the plugin can be downgraded to a previous version */
  downgradable: boolean;
  /** Whether the plugin version is pinned (not auto-updated) */
  pinned: boolean;
  /** List of plugins this plugin depends on */
  dependencies: PluginDependencyInfo[];
  /** Whether the plugin supports dynamic loading without restart */
  supportsDynamicLoad?: string;
  /** Minimum Jenkins core version required by the plugin */
  requiredCoreVersion?: string;
  /** Previous version available for downgrade */
  backupVersion?: string;
  /** Whether the plugin has been marked for deletion on restart */
  deleted?: boolean;
  /** Whether the plugin is bundled with the Jenkins WAR */
  bundled?: boolean;
}

// ============================================================================
// Jenkins Root Model
// ============================================================================

/**
 * Label (tag) assigned to a Jenkins node for job affinity.
 */
export interface Label {
  /** Label name string */
  name: string;
}

/**
 * Represents the Jenkins root model object.
 * Derived from jenkins.model.Jenkins @ExportedBean with @Exported fields
 * for the top-level /api/json response.
 */
export interface JenkinsRootModel {
  /** Stapler class discriminator */
  _class?: string;
  /** Jenkins operational mode ("NORMAL" or "EXCLUSIVE") */
  mode: string;
  /** Description of the Jenkins controller node */
  nodeDescription: string;
  /** Name of the Jenkins controller node (typically empty string) */
  nodeName: string;
  /** Number of executors configured on the controller node */
  numExecutors: number;
  /** Optional instance description set by administrator */
  description?: string | null;
  /** Top-level jobs visible in the root view */
  jobs: Job[];
  /** All views configured in the Jenkins instance */
  views: View[];
  /** The primary (default) view */
  primaryView: View;
  /** Root URL of the Jenkins instance */
  url: string;
  /** Whether security is enabled */
  useSecurity: boolean;
  /** Whether CSRF crumb protection is enabled */
  useCrumbs: boolean;
  /** Information about quiet-down mode, if active */
  quietDownInfo?: unknown;
  /** Whether Jenkins is in quiet-down mode (no new builds) */
  quietingDown: boolean;
  /** Labels assigned to the Jenkins controller node */
  assignedLabels: Label[];
  /** Overall load statistics for the Jenkins instance */
  overallLoad: Record<string, unknown>;
}

// ============================================================================
// Extended View Data
// ============================================================================

/**
 * Extended view data response that includes additional navigation context.
 * This represents the full JSON response from a view endpoint that includes
 * nested views, primary view reference, system message, and configuration
 * permission — used by dashboard and view pages.
 */
export interface ViewData {
  /** Stapler class discriminator */
  _class?: string;
  /** Name of the view */
  name: string;
  /** URL of the view's page */
  url: string;
  /** Optional view description */
  description: string | null;
  /** Jobs included in this view */
  jobs: Job[];
  /** View properties providing additional configuration */
  property: ViewProperty[];
  /** Nested views within this view (for view containers like Dashboard) */
  views?: View[];
  /** Primary (default) nested view, if applicable */
  primaryView?: View;
  /** System message configured by the Jenkins administrator */
  systemMessage?: string;
  /** Whether the current user has permission to configure this view */
  configurePermission?: boolean;
  /** Column definitions for list-style views */
  columns?: Action[];
}
