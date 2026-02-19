# Jenkins UI Migration — User Flow Definitions

## Overview

This document defines the user flows used to validate **functional symmetry** between the baseline (Jelly-rendered) and refactored (React-rendered) Jenkins UI instances. Each flow corresponds to a Playwright end-to-end test specification in the `e2e/flows/` directory and is validated via visual regression screenshots captured against both instances running in parallel with identical `JENKINS_HOME` state.

**Validation methodology:**

- Two Jenkins instances are deployed on Kubernetes with identical home directories.
- Playwright E2E tests execute identical user flows against both instances.
- `toHaveScreenshot()` captures baseline screenshots from the Jelly-rendered instance.
- The same tests capture refactored screenshots from the React-rendered instance.
- Pixel-by-pixel comparison using pixelmatch determines pass/fail per view.
- Dynamic content (timestamps, build numbers, queue positions) is masked to prevent false-positive diff failures.
- Per-view thresholds are configured during test authoring (e.g., `maxDiffPixels: 100`).
- All flagged views are documented in [`docs/functional-audit.md`](functional-audit.md).

**Hard gate rule (AAP §0.8.2):** Each user flow defined in this document MUST reach its terminal success state on the refactored UI without error. Any flow failure blocks merge of the corresponding UI surface.

---

## Flow Template

Every user flow section in this document follows the same structure with seven required fields:

| Field | Description |
|-------|-------------|
| **Flow Name** | Human-readable identifier for the user flow |
| **Entry Point** | Starting URL or page for the flow |
| **Preconditions** | Required Jenkins state before the flow begins (e.g., existing jobs, running builds) |
| **Step Sequence** | Numbered steps the user or Playwright test performs |
| **Terminal Success State** | What defines successful completion of the flow |
| **Screenshot References** | Paths to baseline and refactored screenshots in `docs/screenshots/` |
| **Corresponding E2E Test** | Path to the Playwright test specification file in `e2e/flows/` |

---

## Flow 1: Dashboard Navigation and Interaction

- **Flow Name:** Dashboard Navigation and Interaction
- **Entry Point:** `GET /` (Jenkins root URL — dashboard)
- **Preconditions:** Jenkins instance running with at least one job created and one view configured
- **Step Sequence:**
  1. Navigate to the Jenkins root URL (`/`).
  2. Verify the project list table is rendered with job names, status icons (build status balls), and health indicators (weather icons).
  3. Verify the executor status panel is visible in the side panel, showing "Build Executor Status" with executor rows.
  4. Verify the build queue panel is visible in the side panel, showing "Build Queue" with any queued items or an empty state.
  5. Verify the breadcrumb bar at the top of the page displays "Dashboard" as the current location.
  6. Verify side panel navigation task links are present: "New Item", "People", "Build History", "Manage Jenkins" (and any other default tasks).
  7. Verify the search bar in the page header is visible and accepts input.
  8. Verify the icon legend button is present and opens a dialog when clicked.
- **Terminal Success State:** All dashboard elements — project list, executor panel, build queue, breadcrumbs, side panel tasks, search bar, and icon legend — are rendered identically to the baseline Jelly-rendered instance.
- **Screenshot References:**
  - `docs/screenshots/dashboard/baseline.png`
  - `docs/screenshots/dashboard/refactored.png`
- **Corresponding E2E Test:** `e2e/flows/dashboard.spec.ts`

---

## Flow 2: Job Creation (Freestyle and Pipeline)

- **Flow Name:** Job Creation (Freestyle and Pipeline)
- **Entry Point:** `GET /view/all/newJob` (New Item page)
- **Preconditions:** Jenkins instance with no prior test jobs (clean state for job creation)
- **Step Sequence:**
  1. Navigate to the New Item page at `/view/all/newJob`.
  2. Verify the `#add-item-panel` renders with the name input field focused.
  3. Verify item categories are displayed as `.category` container divs with selectable `li[role="radio"]` items.
  4. Enter the job name `test-freestyle` in the name input field.
  5. Select the "Freestyle project" item type by clicking its `li[role="radio"]` element.
  6. Verify the selected item has `aria-checked="true"` and the `.active` class.
  7. Click the OK/Submit button (`.bottom-sticker-inner button[type=submit]`) to create the job.
  8. Verify the browser redirects to the job configuration page at `/job/test-freestyle/configure`.
  9. Verify the configuration form renders with form sections.
  10. Click "Save" to save the default configuration.
  11. Navigate back to the New Item page at `/view/all/newJob`.
  12. Enter the job name `test-pipeline` in the name input field.
  13. Select the "Pipeline" item type.
  14. Click OK to create the pipeline job.
  15. Verify the browser redirects to `/job/test-pipeline/configure`.
  16. Click "Save" to save the default configuration.
  17. Navigate to the dashboard (`/`) and verify both jobs appear in the project list.
- **Terminal Success State:** Both `test-freestyle` (Freestyle project) and `test-pipeline` (Pipeline) jobs appear on the dashboard project list with their correct type indicators. The New Item page renders with categories, name validation, type selection, and form submission functioning identically to the baseline.
- **Screenshot References:**
  - `docs/screenshots/job-index/baseline.png`
  - `docs/screenshots/job-index/refactored.png`
- **Corresponding E2E Test:** `e2e/flows/job-create.spec.ts`

---

## Flow 3: Build Trigger (Manual and SCM)

- **Flow Name:** Build Trigger (Manual and SCM)
- **Entry Point:** `GET /job/{jobName}/` (Job index page)
- **Preconditions:** At least one freestyle job exists (e.g., `test-freestyle` from Flow 2)
- **Step Sequence:**
  1. Navigate to the job index page at `/job/test-freestyle/`.
  2. Verify the side panel renders task links including "Build Now".
  3. Click the "Build Now" link in the side panel (`#tasks .task-link` containing "Build Now").
  4. Verify the build queue panel updates to show the queued build (may be transient if execution starts immediately).
  5. Verify the executor panel shows the build in progress with a progress bar.
  6. Wait for the build to complete (poll the page or wait for the builds card to update).
  7. Verify the build result status icon in the build history shows a success indicator (blue/green ball).
  8. Verify the completed build appears in the Build History section on the left side panel.
  9. (For SCM trigger verification) Navigate to job configuration at `/job/test-freestyle/configure`.
  10. Verify SCM trigger configuration fields are present: "Poll SCM" and "Build periodically" options render in the Build Triggers section.
- **Terminal Success State:** A manual build completes successfully and appears in the build history with the correct success status icon. The build queue and executor panels update correctly during the build lifecycle. SCM trigger configuration fields render correctly on the configuration page.
- **Screenshot References:**
  - `docs/screenshots/job-index/baseline.png`
  - `docs/screenshots/job-index/refactored.png`
- **Corresponding E2E Test:** `e2e/flows/build-trigger.spec.ts`

---

## Flow 4: Real-Time Console Output Viewing

- **Flow Name:** Real-Time Console Output Viewing
- **Entry Point:** `GET /job/{jobName}/{buildNumber}/console` (Console Output page)
- **Preconditions:** A build has been triggered and is either currently running or has completed (e.g., build #1 from Flow 3)
- **Step Sequence:**
  1. Navigate to the console output page for a completed build at `/job/test-freestyle/1/console`.
  2. Verify the main panel renders with console output content in a `pre` or output container element.
  3. Verify the console text is non-empty and contains expected build log output.
  4. Verify line breaks and text formatting are preserved in the console output.
  5. Verify the side panel shows build navigation links: "Back to Project", "Status", "Changes", "Console Output".
  6. Verify breadcrumbs display the correct hierarchy: Jenkins › test-freestyle › #1 › Console Output.
  7. Locate the "Full Log" or "View as plain text" link (an anchor with `href` containing `consoleFull`).
  8. Click the "Full Log" link.
  9. Verify the browser navigates to `/job/test-freestyle/1/consoleFull`.
  10. Verify the full console output page renders with the complete build log as plain/pre-formatted text.
  11. (For streaming verification with a running build) Trigger a new build with time-delayed output.
  12. Navigate to the console output of the running build.
  13. Verify text content increases progressively as the build produces output (progressive text endpoint `/logText/progressiveText` is polled).
- **Terminal Success State:** Console output renders completely with all build log text visible and correctly formatted. The "Full Log" link navigates to the full console page. For running builds, progressive text streaming updates the console output in real time.
- **Screenshot References:**
  - `docs/screenshots/build-console/baseline.png`
  - `docs/screenshots/build-console/refactored.png`
- **Corresponding E2E Test:** `e2e/flows/console-output.spec.ts`

---

## Flow 5: Build History Inspection

- **Flow Name:** Build History Inspection
- **Entry Point:** `GET /job/{jobName}/` (Job index page, Build History section)
- **Preconditions:** A job exists with at least 2 completed builds
- **Step Sequence:**
  1. Navigate to the job index page at `/job/test-freestyle/`.
  2. Verify the Build History section renders in the side panel within the `#jenkins-builds` container.
  3. Verify the `#jenkins-build-history` element contains build entry rows with build numbers, status icons, and timestamps.
  4. Verify pagination controls (`#controls`, `#up`, `#down`) are present (enabled if enough builds exist for pagination).
  5. Click on a specific build number link (e.g., build #1).
  6. Verify the browser navigates to `/job/test-freestyle/1/`.
  7. Verify the build detail page renders with: build status, build duration, timestamp, and build description area.
  8. Navigate to the build artifacts section (if artifacts exist) by clicking the "Build Artifacts" link.
  9. Navigate to the build changes section (if source changes exist) by clicking the "Changes" link.
  10. Navigate back to the job index page.
  11. Navigate to the build time trend page via `/job/test-freestyle/buildTimeTrend`.
  12. Verify the build time trend page renders with trend chart or table content.
- **Terminal Success State:** All build history entries are displayed with correct build numbers, status icons, and timestamps. Clicking a build number navigates to the build detail page with complete information. The build time trend page renders correctly. Pagination controls function if sufficient builds exist.
- **Screenshot References:**
  - `docs/screenshots/job-index/baseline.png`
  - `docs/screenshots/job-index/refactored.png`
- **Corresponding E2E Test:** `e2e/flows/build-history.spec.ts`

---

## Flow 6: Job Configuration Modification

- **Flow Name:** Job Configuration Modification
- **Entry Point:** `GET /job/{jobName}/configure` (Job configuration page)
- **Preconditions:** At least one freestyle job exists (e.g., `test-freestyle` from Flow 2)
- **Step Sequence:**
  1. Navigate to the job configuration page at `/job/test-freestyle/configure`.
  2. Verify the configuration form renders (`form[name="config"]` or equivalent) with all standard form sections: General, Source Code Management, Build Triggers, Build Environment, Build Steps, Post-build Actions.
  3. Verify form components render correctly:
     - Text input fields (`TextBox`) accept text input.
     - Select/dropdown fields (`Select`) display options.
     - Checkbox fields (`Checkbox`) toggle state on click.
     - Optional blocks (`OptionalBlock`) expand/collapse when their checkbox is toggled.
  4. Modify the job description field by typing "Updated description via E2E test" into the description textarea.
  5. Locate and click an "Advanced" button to expand hidden advanced options (if available in the current form sections).
  6. Verify the advanced section expands to reveal additional form fields.
  7. Verify that "Add build step" and "Add post-build action" buttons are present (HeteroList pattern) and display dropdown menus of available descriptor types when clicked.
  8. Verify inline help icons next to form fields open help content when clicked.
  9. Click the "Save" button to submit the configuration form (POSTs to `/job/test-freestyle/configSubmit`).
  10. Verify the browser redirects to the job index page at `/job/test-freestyle/`.
  11. Verify the updated description "Updated description via E2E test" is displayed on the job index page.
  12. Navigate back to the configuration page at `/job/test-freestyle/configure`.
  13. Verify the description field retains the updated value, confirming persistence.
- **Terminal Success State:** The configuration form renders all sections and form components correctly. Configuration changes (description modification) are saved successfully via form submission and persist across page loads. All form component types (TextBox, Select, Checkbox, OptionalBlock, AdvancedBlock, HeteroList) render and function identically to the baseline.
- **Screenshot References:**
  - `docs/screenshots/job-configure/baseline.png`
  - `docs/screenshots/job-configure/refactored.png`
- **Corresponding E2E Test:** `e2e/flows/job-configure.spec.ts`

---

## Flow 7: Plugin Manager Navigation

- **Flow Name:** Plugin Manager Navigation
- **Entry Point:** `GET /manage/pluginManager/` (Plugin Manager page)
- **Preconditions:** Jenkins instance running with default plugins installed and access to the update center (or pre-populated plugin data)
- **Step Sequence:**
  1. Navigate to the Manage Jenkins page at `/manage/`.
  2. Click the "Plugins" management link to navigate to the Plugin Manager.
  3. Verify the Plugin Manager page loads with tab navigation containing: "Updates", "Available plugins", "Installed plugins", "Advanced settings".
  4. Verify the currently active tab is visually highlighted.
  5. Click the "Installed plugins" tab.
  6. Verify the URL updates to include `/pluginManager/installed` (or equivalent path).
  7. Verify the installed plugins list renders with plugin rows showing name, version, and status.
  8. Verify a filter/search input is available to narrow the installed plugins list.
  9. Click the "Available plugins" tab.
  10. Verify the URL updates to include `/pluginManager/available` (or equivalent path).
  11. Verify the filter input (`#filter-box`) is visible.
  12. Verify the plugins table (`#plugins`) renders with available plugin rows.
  13. Type "git" into the filter/search input to search for a known plugin.
  14. Wait for the debounced search (150ms delay) to execute and filter results.
  15. Verify the plugins table is filtered to show results matching "git".
  16. Verify plugin checkboxes are present and toggling a checkbox enables the install buttons (`#button-install`, `#button-install-after-restart`).
  17. Click the "Advanced settings" tab.
  18. Verify the advanced settings page renders with proxy configuration fields and the plugin upload form.
- **Terminal Success State:** All Plugin Manager tabs render correctly with expected content. Tab navigation switches between views without errors. The available plugins search filters results correctly with debounced input. Plugin checkboxes toggle install button state. Advanced settings display proxy configuration and upload forms.
- **Screenshot References:**
  - `docs/screenshots/plugin-manager/baseline.png`
  - `docs/screenshots/plugin-manager/refactored.png`
- **Corresponding E2E Test:** `e2e/flows/plugin-manager.spec.ts`

---

## Flow 8: Custom Views Interaction

- **Flow Name:** Custom Views Interaction
- **Entry Point:** `GET /` (Jenkins dashboard with views)
- **Preconditions:** Jenkins instance with at least one custom ListView configured in addition to the default "All" view
- **Step Sequence:**
  1. Navigate to the Jenkins root dashboard at `/`.
  2. Verify the view tab bar is visible and displays the "All" view tab plus any configured custom view tabs.
  3. Verify the "All" tab is currently active/highlighted.
  4. Click on a custom ListView tab in the tab bar.
  5. Verify the URL updates to `/view/{viewName}/`.
  6. Verify the main panel content updates to show the filtered project list for the selected view (only jobs assigned to this view are displayed).
  7. Verify view-specific side panel actions are present.
  8. Navigate back to the "All" view tab by clicking it.
  9. Verify the URL returns to `/` or `/view/all/`.
  10. Verify the full project list is displayed again (all jobs visible).
  11. (View management verification) Locate the "New View" link or "+" tab in the view tab bar.
  12. Verify clicking it navigates to the view creation page.
  13. Verify the view description area supports inline editing (if a description is set).
- **Terminal Success State:** View switching via the tab bar works correctly, with the project list filtering to show only the jobs belonging to the selected view. Navigating back to "All" restores the complete project list. The tab bar, view content, and side panel update consistently during view switching.
- **Screenshot References:**
  - `docs/screenshots/dashboard/baseline.png`
  - `docs/screenshots/dashboard/refactored.png`
- **Corresponding E2E Test:** `e2e/flows/custom-views.spec.ts`

---

## Summary — Flow-to-Test Mapping

| # | Flow Name | Entry Point | E2E Test File | Screenshot Directory |
|---|-----------|-------------|---------------|---------------------|
| 1 | Dashboard Navigation and Interaction | `GET /` | `e2e/flows/dashboard.spec.ts` | `docs/screenshots/dashboard/` |
| 2 | Job Creation (Freestyle and Pipeline) | `GET /view/all/newJob` | `e2e/flows/job-create.spec.ts` | `docs/screenshots/job-index/` |
| 3 | Build Trigger (Manual and SCM) | `GET /job/{jobName}/` | `e2e/flows/build-trigger.spec.ts` | `docs/screenshots/job-index/` |
| 4 | Real-Time Console Output Viewing | `GET /job/{jobName}/{buildNumber}/console` | `e2e/flows/console-output.spec.ts` | `docs/screenshots/build-console/` |
| 5 | Build History Inspection | `GET /job/{jobName}/` | `e2e/flows/build-history.spec.ts` | `docs/screenshots/job-index/` |
| 6 | Job Configuration Modification | `GET /job/{jobName}/configure` | `e2e/flows/job-configure.spec.ts` | `docs/screenshots/job-configure/` |
| 7 | Plugin Manager Navigation | `GET /manage/pluginManager/` | `e2e/flows/plugin-manager.spec.ts` | `docs/screenshots/plugin-manager/` |
| 8 | Custom Views Interaction | `GET /` | `e2e/flows/custom-views.spec.ts` | `docs/screenshots/dashboard/` |

---

## Appendix: Validation Rules

### Flow Gate Enforcement (AAP §0.8.2)

Each user flow defined above acts as a **hard gate** for the corresponding UI surface migration:

- A flow is **passing** when the Playwright E2E test completes without error on the refactored React-rendered instance AND the visual regression screenshot comparison falls within the configured `maxDiffPixels` threshold.
- A flow is **failing** when any step in the sequence produces an error, a missing element, or a screenshot diff exceeding the threshold on the refactored instance.
- A **failing flow blocks merge** of the corresponding UI surface. The original Jelly rendering must be preserved for that surface until the flow passes.

### Dynamic Content Masking

The following dynamic content types are masked during screenshot comparison to prevent false-positive diff failures:

- **Timestamps** — Build timestamps, "last success/failure" times, queue wait times.
- **Build numbers** — Incrementing build numbers that differ between instances.
- **Queue positions** — Queue item positions that may vary by timing.
- **Executor progress bars** — Animated progress indicators for running builds.
- **Relative time labels** — "2 min ago", "just now", etc.

Masking is implemented via Playwright's `mask` option on `toHaveScreenshot()`:

```typescript
await expect(page).toHaveScreenshot('view-name.png', {
  mask: [
    page.locator('.timestamp'),
    page.locator('.build-row-cell .pane.build-name'),
  ],
  maxDiffPixels: 100,
});
```

### No New Features Policy (AAP §0.8.1)

All flows in this document describe **existing baseline Jenkins UI behavior only**. No new features, UI enhancements, or UX changes are included. The refactored React UI must reproduce the exact same functional behavior as the Jelly-rendered baseline.

### Cross-Reference

- **Functional audit tracking:** [`docs/functional-audit.md`](functional-audit.md) — Per-view migration status and screenshot diff results.
- **Playwright configuration:** `playwright.config.ts` — Visual regression thresholds, browser configuration, and test project settings.
- **E2E test fixtures:** `e2e/fixtures/jenkins.ts` — Page object model providing shared navigation, login, and assertion helpers.
- **Visual regression tests:** `e2e/visual/screenshot-comparison.spec.ts` — Per-view screenshot comparison test specification.
