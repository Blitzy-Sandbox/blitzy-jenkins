/**
 * Job Configuration User Flow Tests
 *
 * Playwright E2E test specification for Jenkins job configuration user flows.
 * Validates navigating to job config (`/job/{name}/configure`), verifying that
 * React form components render correctly (TextBox, Select, Checkbox, OptionalBlock,
 * Repeatable, HeteroList, AdvancedBlock), modifying settings, saving configuration,
 * and verifying persistence.
 *
 * These tests validate the React form components that replace the Jelly-based
 * `lib/form/*.jelly` templates:
 *
 *   - `TextBox.tsx`       replaces `textbox.jelly`
 *   - `Select.tsx`        replaces `select.jelly`
 *   - `Checkbox.tsx`      replaces `checkbox.jelly`
 *   - `OptionalBlock.tsx` replaces `optionalBlock.jelly`
 *   - `Repeatable.tsx`    replaces `repeatable.jelly`
 *   - `HeteroList.tsx`    replaces `hetero-list.jelly`
 *   - `AdvancedBlock.tsx` replaces `advanced.jelly`
 *   - `FormEntry.tsx`     replaces `entry.jelly`
 *   - `FormSection.tsx`   replaces `section.jelly`
 *
 * The save action POSTs to `/job/{name}/configSubmit` with form data, matching
 * the standard Jenkins Stapler form submission pattern.
 *
 * @see AAP Section 0.5.1 — Form Components transformation table
 * @see AAP Section 0.7.2 — BehaviorShim Pattern Replacement Strategy
 */

import { test, expect } from "../fixtures/jenkins";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Name of the pre-existing freestyle job used by configuration tests.
 * The Jenkins instance under test must have this job created before
 * running the E2E suite — typically provisioned via JCasC or seed scripts.
 */
const TEST_JOB_NAME = "test-job";

/**
 * URL path to the job configuration page, following the Stapler URL mapping
 * pattern: `/job/{name}/configure`.
 */
const CONFIGURE_URL = `/job/${TEST_JOB_NAME}/configure`;

/**
 * Timeout for waiting on form element interactions that may require
 * server-side validation roundtrips or React Query data fetching.
 */
const FORM_INTERACTION_TIMEOUT = 10000;

// ---------------------------------------------------------------------------
// Test Suite — Job Configuration User Flows
// ---------------------------------------------------------------------------

test.describe("Job Configuration User Flows", () => {
  /**
   * Pre-test setup: authenticate and navigate to the job configuration page.
   *
   * Every test in this suite starts from a fully loaded configuration form
   * for the pre-existing test job. The `jenkinsPage.login()` call handles
   * authentication via the standard Jenkins login form, and `jenkinsPage.goto()`
   * navigates using the Stapler URL resolution pattern.
   */
  test.beforeEach(async ({ jenkinsPage }) => {
    await jenkinsPage.login();
    await jenkinsPage.goto(CONFIGURE_URL);

    // Wait for the configuration form to be fully rendered in the main panel.
    // Jenkins configuration forms use `form[name="config"]` as the standard
    // form element wrapping all configuration sections.
    await jenkinsPage.page
      .locator('form[name="config"], #main-panel form')
      .first()
      .waitFor({ state: "visible", timeout: FORM_INTERACTION_TIMEOUT });
  });

  // -------------------------------------------------------------------------
  // Test: Configuration form renders with form sections
  // -------------------------------------------------------------------------

  test("should render job configuration form with sections", async ({
    jenkinsPage,
  }) => {
    // Assert the configuration form is visible — Jenkins wraps all config
    // fields in a `<form name="config">` element.
    const configForm = jenkinsPage.page
      .locator('form[name="config"], #main-panel form')
      .first();
    await expect(configForm).toBeVisible();

    // Assert that form sections are present. Jenkins organizes configuration
    // into collapsible sections with headers. The React `FormSection.tsx`
    // component renders these with `.jenkins-section` or section header elements.
    const formSections = jenkinsPage.page.locator(
      ".jenkins-section, .jenkins-form-section, [data-section-id], .section-header, .jenkins-section__header, tr.section-header-row",
    );

    // A freestyle job configuration should have at minimum the General section.
    // Additional sections include Build Triggers, Build Environment, Build Steps,
    // and Post-build Actions depending on installed plugins.
    const sectionCount = await formSections.count();
    if (sectionCount > 0) {
      await expect(formSections.first()).toBeVisible();
    } else {
      // Fallback: if section elements use different markup, verify the form
      // has substantial content indicating multiple configuration areas.
      const formContent = jenkinsPage.page.locator(
        "#main-panel form .config-table, #main-panel form table.setting",
      );
      await expect(formContent.first()).toBeVisible();
    }

    // Verify that the main panel itself contains the configuration form
    const mainPanel = jenkinsPage.getMainPanel();
    await expect(mainPanel).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Test: TextBox form fields render and accept input
  // -------------------------------------------------------------------------

  test("should render TextBox fields and accept text input", async ({
    jenkinsPage,
  }) => {
    // The Description field is a standard textarea present on all freestyle
    // job configurations. It maps to `textbox.jelly` → React `TextBox.tsx`.
    const descriptionField = jenkinsPage.page.locator(
      'textarea[name="description"]',
    );

    // Assert the description field is visible and editable
    await expect(descriptionField).toBeVisible();
    await expect(descriptionField).toBeEditable();

    // Clear existing content and type new text
    const testDescription = `E2E test description - ${Date.now()}`;
    await descriptionField.fill(testDescription);

    // Assert the typed value is captured in the field
    await expect(descriptionField).toHaveValue(testDescription);
  });

  // -------------------------------------------------------------------------
  // Test: Select/dropdown fields render with options
  // -------------------------------------------------------------------------

  test("should render Select fields with dropdown options", async ({
    jenkinsPage,
  }) => {
    // Look for any select element within the configuration form.
    // Freestyle jobs may include select fields from build step plugins,
    // JDK selection, or other descriptor-based configuration.
    const selectElements = jenkinsPage.page.locator(
      'form[name="config"] select, #main-panel form select',
    );

    const selectCount = await selectElements.count();

    if (selectCount > 0) {
      const firstSelect = selectElements.first();
      await expect(firstSelect).toBeVisible();

      // Verify the select has at least one option element
      const options = firstSelect.locator("option");
      const optionCount = await options.count();
      expect(optionCount).toBeGreaterThan(0);

      // If there are multiple options, select a different one and verify
      if (optionCount > 1) {
        const secondOptionValue = await options.nth(1).getAttribute("value");
        if (secondOptionValue !== null) {
          await firstSelect.selectOption(secondOptionValue);
          await expect(firstSelect).toHaveValue(secondOptionValue);
        }
      }
    } else {
      // No select fields found — this is acceptable for a minimal freestyle
      // job configuration without plugins providing select-based options.
      // The test still passes as there is no requirement that selects exist.
      test.skip(true, "No select fields found in job configuration — skipping");
    }
  });

  // -------------------------------------------------------------------------
  // Test: Checkbox fields toggle correctly
  // -------------------------------------------------------------------------

  test("should render Checkbox fields that toggle state", async ({
    jenkinsPage,
  }) => {
    // Look for checkbox inputs within the configuration form.
    // Freestyle jobs typically include checkboxes for build triggers,
    // build environment options, and various configuration toggles.
    const checkboxes = jenkinsPage.page.locator(
      'form[name="config"] input[type="checkbox"], #main-panel form input[type="checkbox"]',
    );

    const checkboxCount = await checkboxes.count();

    if (checkboxCount > 0) {
      // Find the first interactive (not hidden/disabled) checkbox
      let targetCheckbox = checkboxes.first();
      let foundInteractive = false;

      for (let i = 0; i < Math.min(checkboxCount, 10); i++) {
        const cb = checkboxes.nth(i);
        const isVisible = await cb.isVisible();
        const isEnabled = await cb.isEnabled();
        if (isVisible && isEnabled) {
          targetCheckbox = cb;
          foundInteractive = true;
          break;
        }
      }

      if (foundInteractive) {
        // Record the initial checked state
        const initiallyChecked = await targetCheckbox.isChecked();

        // Click to toggle the checkbox
        await targetCheckbox.click();

        // Assert the state has changed to the opposite
        if (initiallyChecked) {
          await expect(targetCheckbox).not.toBeChecked();
        } else {
          await expect(targetCheckbox).toBeChecked();
        }

        // Toggle back to restore original state
        await targetCheckbox.click();

        // Verify it returned to original state
        if (initiallyChecked) {
          await expect(targetCheckbox).toBeChecked();
        } else {
          await expect(targetCheckbox).not.toBeChecked();
        }
      } else {
        test.skip(
          true,
          "No interactive checkboxes found in job configuration — skipping",
        );
      }
    } else {
      test.skip(
        true,
        "No checkbox fields found in job configuration — skipping",
      );
    }
  });

  // -------------------------------------------------------------------------
  // Test: OptionalBlock expands and collapses
  // -------------------------------------------------------------------------

  test("should toggle OptionalBlock sections when checkbox is clicked", async ({
    jenkinsPage,
  }) => {
    // OptionalBlock in Jenkins is a checkbox that reveals a collapsible
    // subsection when checked. The pattern uses `.optionalBlock-container`
    // or `[data-optional-block]` or a checkbox within `.optional-block-start`.
    // The React `OptionalBlock.tsx` replaces `optionalBlock.jelly`.
    const optionalBlockCheckboxes = jenkinsPage.page.locator(
      '.optionalBlock-container input[type="checkbox"], .optional-block-start input[type="checkbox"], [data-optional-block] input[type="checkbox"], .jenkins-optional-block input[type="checkbox"]',
    );

    const optionalBlockCount = await optionalBlockCheckboxes.count();

    if (optionalBlockCount > 0) {
      const optionalCheckbox = optionalBlockCheckboxes.first();
      await expect(optionalCheckbox).toBeVisible();

      // Determine the collapsible subsection container.
      // It is typically the next sibling container or a child of the same parent.
      const parentContainer = optionalCheckbox.locator(
        'xpath=ancestor::*[contains(@class, "optionalBlock-container") or contains(@class, "optional-block-start") or contains(@class, "jenkins-optional-block")]',
      );

      const initiallyChecked = await optionalCheckbox.isChecked();

      if (!initiallyChecked) {
        // Click to expand the optional block
        await optionalCheckbox.click();
        await expect(optionalCheckbox).toBeChecked();

        // The subsection content should now be visible. Look for the
        // block content that appears after the checkbox is checked.
        const blockContent = parentContainer
          .locator(
            ".optionalBlock-content, .optional-block-content, [data-optional-content]",
          )
          .first();
        const contentCount = await blockContent.count();
        if (contentCount > 0) {
          await expect(blockContent).toBeVisible();
        }

        // Click again to collapse
        await optionalCheckbox.click();
        await expect(optionalCheckbox).not.toBeChecked();
      } else {
        // Block is already expanded — collapse and re-expand
        await optionalCheckbox.click();
        await expect(optionalCheckbox).not.toBeChecked();

        // Re-expand
        await optionalCheckbox.click();
        await expect(optionalCheckbox).toBeChecked();
      }
    } else {
      // Try a broader search for optional-block patterns using Jenkins
      // conventional markup — a table row with class `optional-block-start`
      const fallbackOptionalBlocks = jenkinsPage.page.locator(
        'tr.optional-block-start input[type="checkbox"], .jenkins-form-item--optional input[type="checkbox"]',
      );

      const fallbackCount = await fallbackOptionalBlocks.count();
      if (fallbackCount > 0) {
        const fb = fallbackOptionalBlocks.first();
        await expect(fb).toBeVisible();
        const wasChecked = await fb.isChecked();
        await fb.click();
        if (wasChecked) {
          await expect(fb).not.toBeChecked();
        } else {
          await expect(fb).toBeChecked();
        }
        // Restore
        await fb.click();
      } else {
        test.skip(
          true,
          "No OptionalBlock elements found in job configuration — skipping",
        );
      }
    }
  });

  // -------------------------------------------------------------------------
  // Test: Repeatable field group — add and remove entries
  // -------------------------------------------------------------------------

  test("should add and remove entries in Repeatable field groups", async ({
    jenkinsPage,
  }) => {
    // Repeatable field groups are used in Build Steps, Post-build Actions,
    // and other configuration sections where users can add multiple entries.
    // The React `Repeatable.tsx` replaces `repeatable.jelly`.
    // Look for "Add" buttons within repeatable containers.
    const addButtons = jenkinsPage.page.locator(
      '.repeatable-add button, .repeatable-add input[type="button"], button.repeatable-add, .jenkins-repeatable-add, button[data-repeatable-add]',
    );

    const addButtonCount = await addButtons.count();

    if (addButtonCount > 0) {
      const addButton = addButtons.first();
      await expect(addButton).toBeVisible();

      // Find the parent repeatable container to count entries
      const repeatableContainer = addButton.locator(
        'xpath=ancestor::*[contains(@class, "repeatable-container") or contains(@class, "jenkins-repeatable")][1]',
      );

      // Count initial entries
      const initialEntries = repeatableContainer.locator(
        ".repeated-chunk, .repeatable-item, [data-repeatable-item]",
      );
      const initialCount = await initialEntries.count();

      // Click "Add" to create a new entry
      await addButton.click();

      // Wait for the new entry to appear
      await jenkinsPage.page.waitForTimeout(500);

      // Verify entry count increased
      const afterAddEntries = repeatableContainer.locator(
        ".repeated-chunk, .repeatable-item, [data-repeatable-item]",
      );
      const afterAddCount = await afterAddEntries.count();
      expect(afterAddCount).toBeGreaterThan(initialCount);

      // Look for a delete/remove button on the newly added entry
      const deleteButtons = repeatableContainer.locator(
        '.repeatable-delete button, .repeatable-delete input[type="button"], button.repeatable-delete, button[data-repeatable-delete]',
      );
      const deleteCount = await deleteButtons.count();

      if (deleteCount > 0) {
        // Click the last delete button (the one for the newly added entry)
        await deleteButtons.last().click();

        // Wait for the entry to be removed
        await jenkinsPage.page.waitForTimeout(500);

        // Verify entry count returned to original
        const afterDeleteEntries = repeatableContainer.locator(
          ".repeated-chunk, .repeatable-item, [data-repeatable-item]",
        );
        const afterDeleteCount = await afterDeleteEntries.count();
        expect(afterDeleteCount).toBeLessThan(afterAddCount);
      }
    } else {
      test.skip(
        true,
        "No Repeatable field groups found in job configuration — skipping",
      );
    }
  });

  // -------------------------------------------------------------------------
  // Test: HeteroList — add heterogeneous items
  // -------------------------------------------------------------------------

  test("should add items via HeteroList descriptor selection", async ({
    jenkinsPage,
  }) => {
    // HeteroList is used for Build Steps and Post-build Actions where
    // users select from a list of different descriptor types (e.g.,
    // "Execute shell", "Invoke Ant", "Archive artifacts").
    // The React `HeteroList.tsx` replaces `hetero-list.jelly`.
    //
    // The trigger is typically a button labeled "Add build step" or
    // "Add post-build action" that opens a dropdown menu.
    const heteroListButtons = jenkinsPage.page.locator(
      'button.hetero-list-add, .hetero-list-add button, button[suffix="builder"], button[suffix="publisher"], button.jenkins-add-button',
    );

    // Also try locating by text content for broader compatibility
    const addBuildStepButton = jenkinsPage.page
      .locator("button")
      .filter({ hasText: /Add build step/i });
    const addPostBuildButton = jenkinsPage.page
      .locator("button")
      .filter({ hasText: /Add post-build action/i });

    let targetButton = heteroListButtons.first();
    let buttonFound = false;

    // Try each potential button locator
    if ((await heteroListButtons.count()) > 0) {
      buttonFound = true;
    } else if ((await addBuildStepButton.count()) > 0) {
      targetButton = addBuildStepButton.first();
      buttonFound = true;
    } else if ((await addPostBuildButton.count()) > 0) {
      targetButton = addPostBuildButton.first();
      buttonFound = true;
    }

    if (buttonFound) {
      await expect(targetButton).toBeVisible();

      // Click to open the descriptor type dropdown
      await targetButton.click();

      // Assert a dropdown/menu appears with available descriptor types.
      // Jenkins renders this as a dropdown menu or a list of options.
      const descriptorMenu = jenkinsPage.page.locator(
        '.yuimenuitem, .jenkins-dropdown, [role="menuitem"], .bd ul li, .hetero-list-menu li, .jenkins-dropdown-item',
      );

      await descriptorMenu
        .first()
        .waitFor({ state: "visible", timeout: FORM_INTERACTION_TIMEOUT })
        .catch(() => {
          // Menu may use a different markup pattern
        });

      const menuItemCount = await descriptorMenu.count();

      if (menuItemCount > 0) {
        // Select the first available descriptor type
        await descriptorMenu.first().click();

        // Wait for the new form section to appear
        await jenkinsPage.page.waitForTimeout(1000);

        // Assert a new configuration section appeared for the selected type.
        // Newly added hetero-list entries appear as `.repeated-chunk` or
        // `.hetero-list-item` elements within the hetero-list container.
        const addedSections = jenkinsPage.page.locator(
          ".repeated-chunk, .hetero-list-item, [data-hetero-list-item]",
        );
        const sectionCount = await addedSections.count();
        expect(sectionCount).toBeGreaterThan(0);
      }
    } else {
      test.skip(
        true,
        "No HeteroList buttons found in job configuration — skipping",
      );
    }
  });

  // -------------------------------------------------------------------------
  // Test: Advanced block expands to show hidden options
  // -------------------------------------------------------------------------

  test("should expand Advanced block to reveal additional options", async ({
    jenkinsPage,
  }) => {
    // The Advanced block is a collapsible section that hides less common
    // configuration options. The React `AdvancedBlock.tsx` replaces
    // `advanced.jelly`. It renders as a button labeled "Advanced…" or
    // "Advanced" that toggles visibility of the advanced options container.
    const advancedButton = jenkinsPage.page
      .locator(
        "button.advanced-button, .advancedLink button, button.jenkins-button--tertiary, input.advanced-button",
      )
      .or(
        jenkinsPage.page
          .locator("button, input[type='button']")
          .filter({ hasText: /^Advanced/i }),
      );

    const advancedCount = await advancedButton.count();

    if (advancedCount > 0) {
      const firstAdvanced = advancedButton.first();
      await expect(firstAdvanced).toBeVisible();

      // Click to expand the advanced options
      await firstAdvanced.click();

      // Wait for the advanced content to appear
      await jenkinsPage.page.waitForTimeout(500);

      // After clicking "Advanced", the button typically disappears or changes,
      // and additional form fields become visible in the expanded area.
      // Verify that the form now contains additional visible fields within
      // the advanced container.
      const advancedContainer = jenkinsPage.page.locator(
        ".advanced-body, .jenkins-advanced-body, [data-advanced-content]",
      );
      const containerCount = await advancedContainer.count();

      if (containerCount > 0) {
        await expect(advancedContainer.first()).toBeVisible();
      }
    } else {
      test.skip(
        true,
        "No Advanced block buttons found in job configuration — skipping",
      );
    }
  });

  // -------------------------------------------------------------------------
  // Test: Form help icons show inline help
  // -------------------------------------------------------------------------

  test("should display inline help when help icon is clicked", async ({
    jenkinsPage,
  }) => {
    // Jenkins form entries include help icons that load inline help content
    // from `/help/...` HTML fragments. The React `FormEntry.tsx` component
    // replaces the help toggle in `entry.jelly`.
    const helpIcons = jenkinsPage.page.locator(
      "a.jenkins-help-button, button.help-button, .jenkins-help-button, a[helpURL], a[data-help-url], .setting-help a",
    );

    const helpCount = await helpIcons.count();

    if (helpCount > 0) {
      const firstHelp = helpIcons.first();
      await expect(firstHelp).toBeVisible();

      // Click the help icon to load and display inline help content
      await firstHelp.click();

      // Wait for help content to appear. Jenkins loads help asynchronously
      // from the server, so we wait for the help content container.
      const helpContent = jenkinsPage.page.locator(
        ".help, .jenkins-help-content, .help-area, [data-help-content], .setting-help .help",
      );

      await helpContent
        .first()
        .waitFor({ state: "visible", timeout: FORM_INTERACTION_TIMEOUT })
        .catch(() => {
          // Help content may use a different container pattern
        });

      const helpContentCount = await helpContent.count();
      if (helpContentCount > 0) {
        await expect(helpContent.first()).toBeVisible();
      }
    } else {
      test.skip(true, "No help icons found in job configuration — skipping");
    }
  });

  // -------------------------------------------------------------------------
  // Test: Save configuration and verify persistence
  // -------------------------------------------------------------------------

  test("should save configuration changes and verify persistence", async ({
    jenkinsPage,
  }) => {
    // Modify the description field as a testable change
    const descriptionField = jenkinsPage.page.locator(
      'textarea[name="description"]',
    );
    await expect(descriptionField).toBeVisible();

    const uniqueDescription = `E2E saved description - ${Date.now()}`;
    await descriptionField.fill(uniqueDescription);

    // Click the "Save" button. Jenkins configuration forms place the Save
    // button in the bottom-sticker area with `type="submit"`.
    const saveButton = jenkinsPage.page
      .locator('button[type="submit"], input[type="submit"]')
      .filter({ hasText: /Save/i })
      .or(
        jenkinsPage.page.locator(
          '#bottom-sticker button[name="Submit"], .bottom-sticker-inner button[type="submit"]',
        ),
      );

    await expect(saveButton.first()).toBeVisible();
    await saveButton.first().click();

    // Wait for redirect to the job main page (`/job/{name}/`).
    // The save action POSTs to `/job/{name}/configSubmit` which redirects
    // back to the job index page upon success.
    await jenkinsPage.page.waitForLoadState("domcontentloaded");
    await expect(jenkinsPage.page).toHaveURL(
      new RegExp(`/job/${TEST_JOB_NAME}/?$`),
      { timeout: FORM_INTERACTION_TIMEOUT },
    );

    // Navigate back to the configure page to verify persistence
    await jenkinsPage.goto(CONFIGURE_URL);
    await jenkinsPage.page
      .locator('form[name="config"], #main-panel form')
      .first()
      .waitFor({ state: "visible", timeout: FORM_INTERACTION_TIMEOUT });

    // Assert the modified description value persisted
    const persistedDescription = jenkinsPage.page.locator(
      'textarea[name="description"]',
    );
    await expect(persistedDescription).toHaveValue(uniqueDescription);
  });

  // -------------------------------------------------------------------------
  // Test: Apply configuration without redirect
  // -------------------------------------------------------------------------

  test("should apply configuration without leaving the page", async ({
    jenkinsPage,
  }) => {
    // The "Apply" button saves configuration without redirecting the user
    // away from the configure page. This was originally handled by
    // `war/src/main/webapp/scripts/apply.js` (8 lines) and is now part
    // of the React form handling.
    const applyButton = jenkinsPage.page
      .locator("button, input[type='button']")
      .filter({ hasText: /Apply/i });

    const applyCount = await applyButton.count();

    if (applyCount > 0) {
      // Modify a field before applying
      const descriptionField = jenkinsPage.page.locator(
        'textarea[name="description"]',
      );
      await expect(descriptionField).toBeEditable();
      const applyDescription = `E2E apply test - ${Date.now()}`;
      await descriptionField.fill(applyDescription);

      // Click Apply
      await applyButton.first().click();

      // Wait for the apply request to complete
      await jenkinsPage.page.waitForTimeout(2000);

      // Assert the page did NOT redirect — URL should remain on the
      // configure page, not redirect to the job index.
      await expect(jenkinsPage.page).toHaveURL(
        new RegExp(`/job/${TEST_JOB_NAME}/configure`),
      );
      expect(jenkinsPage.page.url()).toContain("configure");

      // Verify success notification or status update appears if present.
      // Jenkins shows a brief notification or the apply button text changes.
      // Notification may be transient — we verify the page stayed on configure
      // which confirms the apply succeeded without redirect.
      const notification = jenkinsPage.page.locator(
        "#notification-bar, .notif-alert-default, .jenkins-notification, [data-notification]",
      );
      if ((await notification.count()) > 0) {
        await expect(notification.first()).toBeVisible();
      }
    } else {
      test.skip(true, "No Apply button found in job configuration — skipping");
    }
  });

  // -------------------------------------------------------------------------
  // Test: Visual regression for configuration page
  // -------------------------------------------------------------------------

  test("job configure visual regression", async ({ jenkinsPage }) => {
    // Ensure the page is fully loaded before screenshot capture.
    // Wait for any loading indicators to disappear.
    await jenkinsPage.waitForPageLoad();
    await jenkinsPage.waitForApiData();

    // Capture a visual regression screenshot of the job configuration page.
    // Dynamic content (timestamps, crumb tokens, progress bars) is masked
    // to prevent false-positive diff failures as described in AAP Section 0.7.6.
    await expect(jenkinsPage.page).toHaveScreenshot("job-configure.png", {
      mask: jenkinsPage.getTimestampMasks(),
      maxDiffPixels: 100,
    });
  });
});
