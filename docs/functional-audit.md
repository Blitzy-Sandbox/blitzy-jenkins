# Jenkins UI Migration — Functional Audit

## Overview

This document is the authoritative source of truth for tracking the per-view migration status of the Jenkins core UI migration from Jelly server-side rendering to React 19 client-side rendering. Every Jelly view surface being migrated has an individual entry recording its current status, screenshot diff validation result, and any notes or issues encountered during migration.

This audit is a **mandatory deliverable** per the Agent Action Plan (AAP §0.8.3). It is continuously updated as Playwright visual regression tests are executed against baseline (Jelly-rendered) and refactored (React-rendered) Jenkins instances running in parallel.

**Key invariant**: No view migration is considered complete until its corresponding Playwright screenshot comparison passes within the configured pixel diff threshold. Any view that cannot be validated retains its original Jelly rendering until validation is achievable.

## Status Definitions

Each view surface in the migration tracking table is assigned one of the following statuses:

- **Migrated — Validated**: Jelly rendering fully removed and replaced by React component. The React-rendered output has been validated via Playwright screenshot comparison against the Jelly baseline, with the pixel diff falling within the configured `maxDiffPixels` threshold for that view.
- **Migrated — Pending Validation**: React component has been implemented and is functional, but visual regression testing has not yet been completed or the test results have not yet been reviewed and approved.
- **Preserved — Jelly Active**: The original Jelly rendering is preserved and active because the React equivalent cannot yet be validated via screenshot symmetry. The entry includes the reason for preservation and the exact Jelly file path that remains in use.
- **Flagged**: The React component has been implemented and visual regression testing has been executed, but the screenshot diff exceeds the configured threshold. Investigation is required before the migration of this view can be considered complete. The original Jelly rendering is preserved as a fallback.

## Screenshot Diff Thresholds

Visual regression validation uses Playwright's built-in `toHaveScreenshot()` assertion, which performs pixel-by-pixel comparison using the [pixelmatch](https://github.com/mapbox/pixelmatch) library. The validation mechanism works as follows:

### Comparison Methodology

1. **Baseline capture**: Screenshots are captured from the Jelly-rendered Jenkins instance (original, unmodified UI) for each view surface at defined viewport sizes.
2. **Refactored capture**: Identical screenshots are captured from the React-rendered Jenkins instance under the same conditions (same `JENKINS_HOME` state, same viewport, same user session).
3. **Pixel diff**: The two images are compared pixel-by-pixel. The number of differing pixels is counted and compared against the per-view threshold.
4. **Pass/fail determination**: If the diff pixel count is at or below the configured `maxDiffPixels` for that view, the comparison passes. If it exceeds the threshold, the view is flagged.

### Per-View Threshold Configuration

Each view has its own `maxDiffPixels` threshold, configured during test authoring in the Playwright test specifications (`e2e/visual/screenshot-comparison.spec.ts`). Thresholds are tuned per view to account for:

- Minor anti-aliasing differences between server-rendered and client-rendered text
- Sub-pixel rendering variations across browser engines
- Acceptable layout micro-shifts (< 1px) from CSS box model differences

### Dynamic Content Masking

To prevent false-positive diff failures from content that changes between captures, the following dynamic elements are masked using Playwright's `mask` locator option:

- **Timestamps**: Build timestamps, last-run times, "X minutes ago" relative times
- **Build numbers**: Incrementing build IDs that differ between test runs
- **Queue positions**: Dynamic queue ordering and executor assignments
- **Session tokens**: CSRF crumb values and session identifiers in hidden form fields
- **Animated elements**: Loading spinners, progress bars, and transition states

Example masking pattern used in tests:

```typescript
await expect(page).toHaveScreenshot('dashboard-baseline.png', {
  maxDiffPixels: 100,
  mask: [
    page.locator('.timestamp'),
    page.locator('.build-number'),
    page.locator('.queue-position'),
  ],
});
```

---

## Migration Status Tracking

The following tables track the migration status of every view surface being migrated from Jelly to React. Views are organized by functional category matching the target architecture defined in AAP §0.4.1.

**Total view surfaces tracked**: 78

### Layout Components

Source: `core/src/main/resources/lib/layout/` → Target: `src/main/tsx/layout/`

| View Surface | Jelly Source | React Component | Status | Screenshot Diff | Threshold | Notes |
|---|---|---|---|---|---|---|
| Layout | `lib/layout/layout.jelly` | `src/main/tsx/layout/Layout.tsx` | Migrated — Pending Validation | Pending | TBD | Page shell: header + side-panel + main-panel composition |
| SidePanel | `lib/layout/side-panel.jelly` | `src/main/tsx/layout/SidePanel.tsx` | Migrated — Pending Validation | Pending | TBD | Side navigation panel with task links |
| MainPanel | `lib/layout/main-panel.jelly` | `src/main/tsx/layout/MainPanel.tsx` | Migrated — Pending Validation | Pending | TBD | Main content area container |
| BreadcrumbBar | `lib/layout/breadcrumbBar.jelly` | `src/main/tsx/layout/BreadcrumbBar.tsx` | Migrated — Pending Validation | Pending | TBD | Breadcrumb trail from URL hierarchy |
| TabBar | `lib/layout/tabBar.jelly` | `src/main/tsx/layout/TabBar.tsx` | Migrated — Pending Validation | Pending | TBD | Tab navigation container |
| Tab | `lib/layout/tab.jelly` | `src/main/tsx/layout/Tab.tsx` | Migrated — Pending Validation | Pending | TBD | Individual tab element |
| Card | `lib/layout/card.jelly` | `src/main/tsx/layout/Card.tsx` | Migrated — Pending Validation | Pending | TBD | Card container component |
| Skeleton | `lib/layout/skeleton.jelly` | `src/main/tsx/layout/Skeleton.tsx` | Migrated — Pending Validation | Pending | TBD | Loading skeleton placeholder |
| Spinner | `lib/layout/spinner.jelly` | `src/main/tsx/layout/Spinner.tsx` | Migrated — Pending Validation | Pending | TBD | Loading spinner indicator |

### Form Components

Source: `core/src/main/resources/lib/form/` → Target: `src/main/tsx/forms/`

| View Surface | Jelly Source | React Component | Status | Screenshot Diff | Threshold | Notes |
|---|---|---|---|---|---|---|
| FormEntry | `lib/form/entry.jelly` | `src/main/tsx/forms/FormEntry.tsx` | Migrated — Pending Validation | Pending | TBD | Form field wrapper with label, help toggle, validation display |
| FormSection | `lib/form/section.jelly` | `src/main/tsx/forms/FormSection.tsx` | Migrated — Pending Validation | Pending | TBD | Form section grouping |
| TextBox | `lib/form/textbox.jelly` | `src/main/tsx/forms/TextBox.tsx` | Migrated — Pending Validation | Pending | TBD | Text input with validation hook |
| TextArea | `lib/form/textarea.jelly` | `src/main/tsx/forms/TextArea.tsx` | Migrated — Pending Validation | Pending | TBD | Multi-line text input |
| Checkbox | `lib/form/checkbox.jelly` | `src/main/tsx/forms/Checkbox.tsx` | Migrated — Pending Validation | Pending | TBD | Boolean checkbox with useActionState |
| Select | `lib/form/select.jelly` | `src/main/tsx/forms/Select.tsx` | Migrated — Pending Validation | Pending | TBD | Dropdown select |
| Password | `lib/form/password.jelly` | `src/main/tsx/forms/Password.tsx` | Migrated — Pending Validation | Pending | TBD | Password input with visibility toggle |
| Radio | `lib/form/radio.jelly` | `src/main/tsx/forms/Radio.tsx` | Migrated — Pending Validation | Pending | TBD | Radio button group |
| ComboBox | `lib/form/combobox.jelly` | `src/main/tsx/forms/ComboBox.tsx` | Migrated — Pending Validation | Pending | TBD | Autocomplete combobox replacing legacy combobox.js |
| FileUpload | `lib/form/file.jelly` | `src/main/tsx/forms/FileUpload.tsx` | Migrated — Pending Validation | Pending | TBD | File upload input |
| OptionalBlock | `lib/form/optionalBlock.jelly` | `src/main/tsx/forms/OptionalBlock.tsx` | Migrated — Pending Validation | Pending | TBD | Collapsible optional section |
| Repeatable | `lib/form/repeatable.jelly` | `src/main/tsx/forms/Repeatable.tsx` | Migrated — Pending Validation | Pending | TBD | Dynamic repeatable field group |
| HeteroList | `lib/form/hetero-list.jelly` | `src/main/tsx/forms/HeteroList.tsx` | Migrated — Pending Validation | Pending | TBD | Heterogeneous describable list |
| AdvancedBlock | `lib/form/advanced.jelly` | `src/main/tsx/forms/AdvancedBlock.tsx` | Migrated — Pending Validation | Pending | TBD | Expandable advanced options |
| SubmitButton | `lib/form/submit.jelly` | `src/main/tsx/forms/SubmitButton.tsx` | Migrated — Pending Validation | Pending | TBD | Form submit with useActionState |

### Hudson UI Primitives

Source: `core/src/main/resources/lib/hudson/` → Target: `src/main/tsx/hudson/`

| View Surface | Jelly Source | React Component | Status | Screenshot Diff | Threshold | Notes |
|---|---|---|---|---|---|---|
| ProjectView | `lib/hudson/projectView.jelly` | `src/main/tsx/hudson/ProjectView.tsx` | Migrated — Pending Validation | Pending | TBD | Project listing with sortable columns |
| ProjectViewRow | `lib/hudson/projectViewRow.jelly` | `src/main/tsx/hudson/ProjectViewRow.tsx` | Migrated — Pending Validation | Pending | TBD | Single project row |
| BuildListTable | `lib/hudson/buildListTable.jelly` | `src/main/tsx/hudson/BuildListTable.tsx` | Migrated — Pending Validation | Pending | TBD | Build history table with auto-refresh |
| BuildHealth | `lib/hudson/buildHealth.jelly` | `src/main/tsx/hudson/BuildHealth.tsx` | Migrated — Pending Validation | Pending | TBD | Build health weather icon |
| BuildLink | `lib/hudson/buildLink.jelly` | `src/main/tsx/hudson/BuildLink.tsx` | Migrated — Pending Validation | Pending | TBD | Build link with status ball |
| BuildProgressBar | `lib/hudson/buildProgressBar.jelly` | `src/main/tsx/hudson/BuildProgressBar.tsx` | Migrated — Pending Validation | Pending | TBD | Animated build progress indicator |
| Executors | `lib/hudson/executors.jelly` | `src/main/tsx/hudson/Executors.tsx` | Migrated — Pending Validation | Pending | TBD | Executor status panel |
| Queue | `lib/hudson/queue.jelly` | `src/main/tsx/hudson/Queue.tsx` | Migrated — Pending Validation | Pending | TBD | Build queue panel |
| EditableDescription | `lib/hudson/editableDescription.jelly` | `src/main/tsx/hudson/EditableDescription.tsx` | Migrated — Pending Validation | Pending | TBD | Inline-editable description |
| ScriptConsole | `lib/hudson/scriptConsole.jelly` | `src/main/tsx/hudson/ScriptConsole.tsx` | Migrated — Pending Validation | Pending | TBD | Script console with output streaming |
| ArtifactList | `lib/hudson/artifactList.jelly` | `src/main/tsx/hudson/ArtifactList.tsx` | Migrated — Pending Validation | Pending | TBD | Build artifact listing with tree view |

### Dashboard Views

Source: `core/src/main/resources/hudson/model/` → Target: `src/main/tsx/pages/dashboard/`

| View Surface | Jelly Source | React Component | Status | Screenshot Diff | Threshold | Notes |
|---|---|---|---|---|---|---|
| Dashboard | `hudson/model/AllView/index.jelly` | `src/main/tsx/pages/dashboard/Dashboard.tsx` | Migrated — Pending Validation | Pending | TBD | Main dashboard with ProjectView, Executors, Queue |
| AllView | `hudson/model/AllView/main.jelly` | `src/main/tsx/pages/dashboard/AllView.tsx` | Migrated — Pending Validation | Pending | TBD | All jobs view |
| ListView | `hudson/model/ListView/index.jelly` | `src/main/tsx/pages/dashboard/ListView.tsx` | Migrated — Pending Validation | Pending | TBD | Filtered list view |
| MyView | `hudson/model/MyView/index.jelly` | `src/main/tsx/pages/dashboard/MyView.tsx` | Migrated — Pending Validation | Pending | TBD | Personal view |

### Job Views

Source: `core/src/main/resources/hudson/model/` → Target: `src/main/tsx/pages/job/`

| View Surface | Jelly Source | React Component | Status | Screenshot Diff | Threshold | Notes |
|---|---|---|---|---|---|---|
| JobIndex | `hudson/model/Job/index.jelly` | `src/main/tsx/pages/job/JobIndex.tsx` | Migrated — Pending Validation | Pending | TBD | Job detail page with builds, actions, description |
| JobConfigure | `hudson/model/Job/configure.jelly` | `src/main/tsx/pages/job/JobConfigure.tsx` | Migrated — Pending Validation | Pending | TBD | Job configuration form with HeteroList, Repeatable |
| JobBuildHistory | `hudson/model/Job/buildTimeTrend.jelly` | `src/main/tsx/pages/job/JobBuildHistory.tsx` | Migrated — Pending Validation | Pending | TBD | Build time trend chart |
| NewJob | `hudson/model/View/newJob.jelly` | `src/main/tsx/pages/job/NewJob.tsx` | Migrated — Pending Validation | Pending | TBD | Create new item page |

### Build Views

Source: `core/src/main/resources/hudson/model/` → Target: `src/main/tsx/pages/build/`

| View Surface | Jelly Source | React Component | Status | Screenshot Diff | Threshold | Notes |
|---|---|---|---|---|---|---|
| BuildIndex | `hudson/model/Run/index.jelly` | `src/main/tsx/pages/build/BuildIndex.tsx` | Migrated — Pending Validation | Pending | TBD | Build detail page |
| ConsoleOutput | `hudson/model/Run/console.jelly` | `src/main/tsx/pages/build/ConsoleOutput.tsx` | Migrated — Pending Validation | Pending | TBD | Real-time console with streaming |
| ConsoleFull | `hudson/model/Run/consoleFull.jelly` | `src/main/tsx/pages/build/ConsoleFull.tsx` | Migrated — Pending Validation | Pending | TBD | Full console output view |
| BuildArtifacts | `hudson/model/Run/artifacts.jelly` | `src/main/tsx/pages/build/BuildArtifacts.tsx` | Migrated — Pending Validation | Pending | TBD | Artifact listing page |
| BuildChanges | `hudson/model/AbstractBuild/changes.jelly` | `src/main/tsx/pages/build/BuildChanges.tsx` | Migrated — Pending Validation | Pending | TBD | Changelog view |

### Computer/Node Views

Source: `core/src/main/resources/hudson/model/` → Target: `src/main/tsx/pages/computer/`

| View Surface | Jelly Source | React Component | Status | Screenshot Diff | Threshold | Notes |
|---|---|---|---|---|---|---|
| ComputerSet | `hudson/model/ComputerSet/index.jelly` | `src/main/tsx/pages/computer/ComputerSet.tsx` | Migrated — Pending Validation | Pending | TBD | Node management table |
| ComputerDetail | `hudson/model/Computer/index.jelly` | `src/main/tsx/pages/computer/ComputerDetail.tsx` | Migrated — Pending Validation | Pending | TBD | Individual node detail |

### Plugin Manager Views

Source: `core/src/main/resources/hudson/PluginManager/` → Target: `src/main/tsx/pages/plugin-manager/`

| View Surface | Jelly Source | React Component | Status | Screenshot Diff | Threshold | Notes |
|---|---|---|---|---|---|---|
| PluginManagerIndex | `hudson/PluginManager/index.jelly` | `src/main/tsx/pages/plugin-manager/PluginManagerIndex.tsx` | Migrated — Pending Validation | Pending | TBD | Plugin manager with tab navigation |
| PluginInstalled | `hudson/PluginManager/installed.jelly` | `src/main/tsx/pages/plugin-manager/PluginInstalled.tsx` | Migrated — Pending Validation | Pending | TBD | Installed plugins list with filter |
| PluginAvailable | `hudson/PluginManager/available.jelly` | `src/main/tsx/pages/plugin-manager/PluginAvailable.tsx` | Migrated — Pending Validation | Pending | TBD | Available plugins search and install |
| PluginUpdates | `hudson/PluginManager/updates.jelly` | `src/main/tsx/pages/plugin-manager/PluginUpdates.tsx` | Migrated — Pending Validation | Pending | TBD | Plugin updates list |
| PluginAdvanced | `hudson/PluginManager/advanced.jelly` | `src/main/tsx/pages/plugin-manager/PluginAdvanced.tsx` | Migrated — Pending Validation | Pending | TBD | Advanced plugin settings |

### Management Views

Source: `core/src/main/resources/jenkins/management/` and `src/main/js/pages/` → Target: `src/main/tsx/pages/manage-jenkins/`

| View Surface | Jelly Source | React Component | Status | Screenshot Diff | Threshold | Notes |
|---|---|---|---|---|---|---|
| ManageJenkins | `jenkins/management/AdministrativeMonitorsDecorator/index.jelly` | `src/main/tsx/pages/manage-jenkins/ManageJenkins.tsx` | Migrated — Pending Validation | Pending | TBD | Admin landing page with category grid |
| SystemInformation | `src/main/js/pages/manage-jenkins/index.js` | `src/main/tsx/pages/manage-jenkins/SystemInformation.tsx` | Migrated — Pending Validation | Pending | TBD | System info with diagnostics graph |

### Setup Wizard Views

Source: `src/main/js/pluginSetupWizardGui.js` and `src/main/js/templates/*.hbs` → Target: `src/main/tsx/pages/setup-wizard/`

| View Surface | Jelly/HBS/JS Source | React Component | Status | Screenshot Diff | Threshold | Notes |
|---|---|---|---|---|---|---|
| SetupWizard | `src/main/js/pluginSetupWizardGui.js` | `src/main/tsx/pages/setup-wizard/SetupWizard.tsx` | Migrated — Pending Validation | Pending | TBD | Wizard orchestrator with step state machine |
| WelcomePanel | `src/main/js/templates/welcomePanel.hbs` | `src/main/tsx/pages/setup-wizard/WelcomePanel.tsx` | Migrated — Pending Validation | Pending | TBD | Welcome step |
| PluginSelectionPanel | `src/main/js/templates/pluginSelectionPanel.hbs` | `src/main/tsx/pages/setup-wizard/PluginSelectionPanel.tsx` | Migrated — Pending Validation | Pending | TBD | Plugin selection with search/filter |
| ProgressPanel | `src/main/js/templates/progressPanel.hbs` | `src/main/tsx/pages/setup-wizard/ProgressPanel.tsx` | Migrated — Pending Validation | Pending | TBD | Installation progress with real-time status |
| FirstUserPanel | `src/main/js/templates/firstUserPanel.hbs` | `src/main/tsx/pages/setup-wizard/FirstUserPanel.tsx` | Migrated — Pending Validation | Pending | TBD | First admin user creation form |
| ConfigureInstancePanel | `src/main/js/templates/configureInstance.hbs` | `src/main/tsx/pages/setup-wizard/ConfigureInstancePanel.tsx` | Migrated — Pending Validation | Pending | TBD | Instance URL configuration form |
| ProxyConfigPanel | `src/main/js/templates/proxyConfigPanel.hbs` | `src/main/tsx/pages/setup-wizard/ProxyConfigPanel.tsx` | Migrated — Pending Validation | Pending | TBD | Proxy settings form |
| SetupCompletePanel | `src/main/js/templates/setupCompletePanel.hbs` | `src/main/tsx/pages/setup-wizard/SetupCompletePanel.tsx` | Migrated — Pending Validation | Pending | TBD | Completion page |

### Security Views

Source: `src/main/js/pages/register/` → Target: `src/main/tsx/pages/security/`

| View Surface | Jelly/JS Source | React Component | Status | Screenshot Diff | Threshold | Notes |
|---|---|---|---|---|---|---|
| SignInRegister | `src/main/js/pages/register/index.js` | `src/main/tsx/pages/security/SignInRegister.tsx` | Migrated — Pending Validation | Pending | TBD | Login/registration page with password strength |

### Cloud Views

Source: `src/main/js/pages/cloud-set/` → Target: `src/main/tsx/pages/cloud/`

| View Surface | Jelly/JS Source | React Component | Status | Screenshot Diff | Threshold | Notes |
|---|---|---|---|---|---|---|
| CloudSet | `src/main/js/pages/cloud-set/index.js` | `src/main/tsx/pages/cloud/CloudSet.tsx` | Migrated — Pending Validation | Pending | TBD | Cloud configuration with sortable tables |

### Shared UI Components

Source: `src/main/js/components/` → Target: `src/main/tsx/components/`

| View Surface | JS Source | React Component | Status | Screenshot Diff | Threshold | Notes |
|---|---|---|---|---|---|---|
| CommandPalette | `src/main/js/components/command-palette/index.js` | `src/main/tsx/components/command-palette/CommandPalette.tsx` | Migrated — Pending Validation | Pending | TBD | Ctrl+K command palette with search integration |
| ConfirmationLink | `src/main/js/components/confirmation-link/index.js` | `src/main/tsx/components/confirmation-link/ConfirmationLink.tsx` | Migrated — Pending Validation | Pending | TBD | Confirmation dialog trigger |
| Defer | `src/main/js/components/defer/index.js` | `src/main/tsx/components/defer/Defer.tsx` | Migrated — Pending Validation | Pending | TBD | Lazy-loading wrapper with React Suspense |
| Dialog | `src/main/js/components/dialogs/index.js` | `src/main/tsx/components/dialogs/Dialog.tsx` | Migrated — Pending Validation | Pending | TBD | Modal dialog component |
| Dropdown | `src/main/js/components/dropdowns/index.js` | `src/main/tsx/components/dropdowns/Dropdown.tsx` | Migrated — Pending Validation | Pending | TBD | Dropdown menu with click-outside handling |
| Header | `src/main/js/components/header/index.js` | `src/main/tsx/components/header/Header.tsx` | Migrated — Pending Validation | Pending | TBD | Page header with search, user menu, breadcrumbs |
| Notifications | `src/main/js/components/notifications/index.js` | `src/main/tsx/components/notifications/Notifications.tsx` | Migrated — Pending Validation | Pending | TBD | Toast notification system with auto-dismiss |
| RowSelectionController | `src/main/js/components/row-selection-controller/index.js` | `src/main/tsx/components/row-selection-controller/RowSelectionController.tsx` | Migrated — Pending Validation | Pending | TBD | Table row multi-select with checkbox state |
| SearchBar | `src/main/js/components/search-bar/index.js` | `src/main/tsx/components/search-bar/SearchBar.tsx` | Migrated — Pending Validation | Pending | TBD | Global search with debounced query |
| StopButtonLink | `src/main/js/components/stop-button-link/index.js` | `src/main/tsx/components/stop-button-link/StopButtonLink.tsx` | Migrated — Pending Validation | Pending | TBD | Build abort button with mutation |
| Tooltip | `src/main/js/components/tooltips/index.js` | `src/main/tsx/components/tooltips/Tooltip.tsx` | Migrated — Pending Validation | Pending | TBD | Accessible tooltip replacing tippy.js |

---

## Flagged and Deferred Views

### Resolution Requirements

Per AAP §0.8.2, any view that is flagged or deferred from migration **MUST** include:

1. **Reason for flag/deferral**: A clear explanation of why the view could not be validated or migrated
2. **Preserved Jelly surface reference**: The exact file path of the original Jelly template that remains active
3. **Resolution plan and estimated timeline**: A concrete plan for resolving the issue and completing the migration
4. **Jelly preservation guarantee**: The original Jelly rendering **MUST** be preserved and remain functional until the React equivalent is fully validated

**Hard gate** (AAP §0.8.1): ALL flagged views documented in this section MUST be resolved before that surface's migration is considered complete. A Jelly view that cannot be fully validated via screenshot symmetry must retain its original Jelly rendering.

### Currently Flagged Views

No views are currently flagged. This section is populated during Playwright visual regression test execution when a view's screenshot diff exceeds its configured `maxDiffPixels` threshold.

| View Surface | React Component | Diff Pixels | Threshold | Reason | Preserved Jelly Path | Resolution Plan |
|---|---|---|---|---|---|---|
| *(none at this time)* | | | | | | |

### Currently Deferred Views

No views are currently deferred from migration. This section is populated when a view cannot be migrated due to technical constraints, dependency issues, or plugin compatibility requirements.

| View Surface | Reason for Deferral | Preserved Jelly Path | Dependencies Blocking Migration | Resolution Plan | Target Date |
|---|---|---|---|---|---|
| *(none at this time)* | | | | | |

---

## User Flow Validation Status

Each user flow defined in [`docs/user-flows.md`](./user-flows.md) must reach its terminal success state on the refactored React UI without error. Per AAP §0.8.2, any flow failure blocks the merge of the corresponding UI surface migration.

The following table cross-references each user flow with its validation status, the views exercised during the flow, and the corresponding Playwright E2E test specification.

| User Flow | Status | Related Views | E2E Test | Notes |
|---|---|---|---|---|
| Dashboard Navigation | Pending | Dashboard, AllView, Executors, Queue | `e2e/flows/dashboard.spec.ts` | Verify project list rendering, executor panel, queue panel |
| Job Creation | Pending | NewJob, JobConfigure | `e2e/flows/job-create.spec.ts` | Freestyle and pipeline job creation flows |
| Build Trigger | Pending | JobIndex, BuildProgressBar | `e2e/flows/build-trigger.spec.ts` | Manual and SCM-triggered build initiation |
| Console Output | Pending | ConsoleOutput, ConsoleFull | `e2e/flows/console-output.spec.ts` | Real-time streaming and full console view |
| Build History | Pending | BuildIndex, BuildListTable, BuildArtifacts, BuildChanges | `e2e/flows/build-history.spec.ts` | Build detail inspection and navigation |
| Job Configuration | Pending | JobConfigure, FormEntry, HeteroList, Repeatable | `e2e/flows/job-configure.spec.ts` | Modify and save job configuration |
| Plugin Manager | Pending | PluginManagerIndex, PluginInstalled, PluginAvailable, PluginUpdates, PluginAdvanced | `e2e/flows/plugin-manager.spec.ts` | Browse, search, and install plugins |
| Custom Views | Pending | ListView, MyView, TabBar | `e2e/flows/custom-views.spec.ts` | Dashboard view interaction and navigation |

---

## View Count Summary

| Category | Count | Status |
|---|---|---|
| Layout Components | 9 | All Pending Validation |
| Form Components | 15 | All Pending Validation |
| Hudson UI Primitives | 11 | All Pending Validation |
| Dashboard Views | 4 | All Pending Validation |
| Job Views | 4 | All Pending Validation |
| Build Views | 5 | All Pending Validation |
| Computer/Node Views | 2 | All Pending Validation |
| Plugin Manager Views | 5 | All Pending Validation |
| Management Views | 2 | All Pending Validation |
| Setup Wizard Views | 8 | All Pending Validation |
| Security Views | 1 | All Pending Validation |
| Cloud Views | 1 | All Pending Validation |
| Shared UI Components | 11 | All Pending Validation |
| **Total** | **78** | **All Pending Validation** |

---

## Appendix: Validation Infrastructure

### Playwright Configuration

Visual regression tests are configured in `playwright.config.ts` at the repository root. Key configuration parameters:

- **Project**: Chromium (primary validation browser)
- **Screenshot directory**: `docs/screenshots/` — organized by view name with `baseline.png` and `refactored.png` per view
- **Diff output directory**: `e2e/visual/diff/` — contains visual diff images when comparisons fail
- **Default threshold**: Configured per-view in individual test specifications
- **Viewport**: 1280×720 default (additional viewport sizes tested for responsive views)

### Jenkins Test Instance Requirements

Visual regression validation requires two Jenkins instances running in parallel:

1. **Baseline instance**: Original Jenkins with Jelly rendering active (unmodified core)
2. **Refactored instance**: Jenkins with React rendering active (migrated core)

Both instances must share identical `JENKINS_HOME` state including:

- Same set of installed plugins
- Same job and build configurations
- Same user accounts and security realm
- Same system configuration settings

### Screenshot Directory Structure

```
docs/screenshots/
├── dashboard/
│   ├── baseline.png
│   └── refactored.png
├── job-index/
│   ├── baseline.png
│   └── refactored.png
├── job-configure/
│   ├── baseline.png
│   └── refactored.png
├── build-console/
│   ├── baseline.png
│   └── refactored.png
├── plugin-manager/
│   ├── baseline.png
│   └── refactored.png
├── manage-jenkins/
│   ├── baseline.png
│   └── refactored.png
└── setup-wizard/
    ├── baseline.png
    └── refactored.png
```

---

*This document is maintained as part of the Jenkins core UI migration from Jelly to React 19. Last updated at initial creation — all views pending first Playwright validation pass.*
