/**
 * JobConfigure — Job configuration form page component.
 *
 * Replaces the Jelly templates:
 * - core/src/main/resources/hudson/model/Job/configure.jelly (72 lines)
 * - core/src/main/resources/hudson/model/Job/configure-entries.jelly (29 lines)
 *
 * Also replaces the sidebar generation behavior from:
 * - src/main/js/section-to-sidebar-items.js (96 lines)
 *
 * Renders the complete job configuration form with:
 * - Permission-gated access (EXTENDED_READ minimum, CONFIGURE for editing)
 * - ReadOnly mode when user has EXTENDED_READ but not CONFIGURE
 * - General section with disable-build toggle
 * - Description textarea with CodeMirror integration
 * - HeteroList for job properties (descriptor list)
 * - Extension point slot for derived class configuration entries
 * - Save (form POST via React 19 action) and Apply (AJAX POST) buttons
 * - Sidebar navigation generated from form sections
 * - Active section tracking on scroll
 *
 * @module pages/job/JobConfigure
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useActionState,
  useRef,
  useMemo,
} from "react";

/* Layout components ------------------------------------------------------- */
import Layout from "@/layout/Layout";
import { Skeleton } from "@/layout/Skeleton";

/* Form components --------------------------------------------------------- */
import { FormEntry } from "@/forms/FormEntry";
import { FormSection } from "@/forms/FormSection";
import { TextArea } from "@/forms/TextArea";
import { HeteroList } from "@/forms/HeteroList";
import type { Descriptor, HeteroItem } from "@/forms/HeteroList";
import { Checkbox } from "@/forms/Checkbox";

/* Hooks ------------------------------------------------------------------- */
import { useStaplerQuery } from "@/hooks/useStaplerQuery";
import { useStaplerMutation } from "@/hooks/useStaplerMutation";
import { useI18n } from "@/hooks/useI18n";

/* Types ------------------------------------------------------------------- */
import type { Job } from "@/types/models";

/* ========================================================================= */
/*  Exported type definitions                                                 */
/* ========================================================================= */

/**
 * Base description type extracted from the Job model.
 * Ensures configuration data alignment with the Job REST API contract.
 */
type JobDescription = NonNullable<Job["description"]>;

/**
 * Base job property type from the Job model.
 * Extended with descriptor metadata in {@link JobConfigData}.
 */
type JobPropertyBase = Job["property"][number];

/**
 * Props for the {@link JobConfigure} component.
 */
export interface JobConfigureProps {
  /** Job URL path for API calls and form submission target */
  jobUrl: string;
  /** Job display name shown in the page title */
  displayName: string;
  /** Whether the current user has CONFIGURE permission (enables form editing) */
  hasConfigurePermission: boolean;
  /** Whether the current user has EXTENDED_READ permission (required to view) */
  hasExtendedReadPermission: boolean;
}

/**
 * Shape of the job configuration data returned by the Stapler REST API.
 * Maps to the REST response from GET {jobUrl}/api/json with a tree filter.
 *
 * Note: The Java `Job.java` class exposes a `disabled` field via `@Exported`
 * (inverse of `Job.buildable`). The current TypeScript {@link Job} interface
 * in models.ts does not include `disabled` — it is defined here for the
 * configuration-specific REST response contract.
 */
export interface JobConfigData {
  /** Current job description text. Aligns with Job REST field. */
  description: JobDescription;
  /** Whether the job is currently disabled. Inverse of Job.buildable. */
  disabled: boolean;
  /**
   * Array of job property instances with descriptor metadata.
   * Extends the base {@link JobPropertyBase} with full descriptor info
   * and instance values for each configured job property.
   */
  properties: Array<
    JobPropertyBase & {
      descriptor?: Descriptor;
      instance?: Record<string, unknown>;
    }
  >;
  /** URL for the markup formatter help page */
  markupFormatterHelpUrl?: string;
  /** CodeMirror syntax highlighting mode for the description field */
  codeMirrorMode?: string;
  /** CodeMirror configuration string for the description field */
  codeMirrorConfig?: string;
}

/* ========================================================================= */
/*  Internal types                                                            */
/* ========================================================================= */

/** Sidebar navigation item generated from form sections. */
interface SidebarItem {
  /** Unique identifier matching the section element id */
  id: string;
  /** Display title for the sidebar link */
  title: string;
}

/** Form action state tracked by React 19 useActionState. */
interface FormActionState {
  /** Current status of the form submission */
  status: "idle" | "submitting" | "success" | "error";
  /** Error message if status is 'error', null otherwise */
  error: string | null;
}

/* ========================================================================= */
/*  Constants                                                                 */
/* ========================================================================= */

/** Initial state for the useActionState hook. */
const INITIAL_FORM_STATE: FormActionState = {
  status: "idle",
  error: null,
};

/**
 * Scroll offset in pixels for section navigation.
 * Accounts for the sticky header and breadcrumb bar height.
 * Matches the 70px offset used by section-to-sidebar-items.js.
 */
const SCROLL_OFFSET = 70;

/**
 * Default sidebar icon — settings gear SVG.
 * Matches the DEFAULT_ICON constant from section-to-sidebar-items.js.
 * Used when a form section does not provide its own icon.
 */
const DEFAULT_SIDEBAR_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d={
        "M262.29 192.31a64 64 0 1057.4 57.4 64.13 64.13 0 00-57.4-57.4z" +
        "M416.39 256a154.34 154.34 0 01-1.53 20.79l45.21 35.46a10.81 " +
        "10.81 0 012.45 13.75l-42.77 74a10.81 10.81 0 01-13.14 4.59l" +
        "-44.9-18.08a16.11 16.11 0 00-15.17 1.75A164.48 164.48 0 " +
        "01325 400.8a15.94 15.94 0 00-8.82 12.14l-6.73 47.89a11.08 " +
        "11.08 0 01-10.68 9.17h-85.54a11.11 11.11 0 01-10.69-8.87l" +
        "-6.72-47.82a16.07 16.07 0 00-9-12.22 155.3 155.3 0 01-21.46" +
        "-12.57 16 16 0 00-15.11-1.71l-44.89 18.07a10.81 10.81 0 " +
        "01-13.14-4.58l-42.77-74a10.8 10.8 0 012.45-13.75l38.21-30" +
        "a16.05 16.05 0 006-14.08c-.36-4.17-.58-8.33-.58-12.5s.21-" +
        "8.27.58-12.35a16 16 0 00-6.07-13.94l-38.19-30A10.81 10.81" +
        " 0 0149.48 186l42.77-74a10.81 10.81 0 0113.14-4.59l44.9 " +
        "18.08a16.11 16.11 0 0015.17-1.75A164.48 164.48 0 01187 " +
        "111.2a15.94 15.94 0 008.82-12.14l6.73-47.89A11.08 11.08 " +
        "0 01213.23 42h85.54a11.11 11.11 0 0110.69 8.87l6.72 47.82" +
        "a16.07 16.07 0 009 12.22 155.3 155.3 0 0121.46 12.57 16 " +
        "16 0 0015.11 1.71l44.89-18.07a10.81 10.81 0 0113.14 4.58" +
        "l42.77 74a10.8 10.8 0 01-2.45 13.75l-38.21 30a16.05 16.05" +
        " 0 00-6.05 14.08c.33 4.14.55 8.3.55 12.47z"
      }
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="32"
    />
  </svg>
);

/* ========================================================================= */
/*  Component                                                                 */
/* ========================================================================= */

/**
 * Job configuration form page.
 *
 * Fetches job configuration data via the Stapler REST API and renders
 * a complete configuration form with sidebar navigation, matching the
 * layout and behavior of configure.jelly.
 *
 * @param props - {@link JobConfigureProps}
 * @returns The rendered job configuration page
 */
export default function JobConfigure({
  jobUrl,
  displayName,
  hasConfigurePermission,
  hasExtendedReadPermission,
}: JobConfigureProps): React.JSX.Element {
  /* ---------------------------------------------------------------------- */
  /*  Permission model                                                       */
  /*  Mirrors configure.jelly line 31:                                       */
  /*    readOnlyMode = !it.hasPermission(it.CONFIGURE)                       */
  /* ---------------------------------------------------------------------- */
  const readOnlyMode = !hasConfigurePermission;

  /* ---------------------------------------------------------------------- */
  /*  Hooks                                                                  */
  /* ---------------------------------------------------------------------- */
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);

  /* ---------------------------------------------------------------------- */
  /*  Data fetching — job configuration data                                 */
  /*  Replaces Jelly server-side data binding with client-side REST fetch     */
  /* ---------------------------------------------------------------------- */
  const {
    data: configData,
    isLoading,
    isError,
  } = useStaplerQuery<JobConfigData>({
    url: `${jobUrl}/api/json?tree=description,disabled,property[*]`,
    queryKey: ["jobConfig", jobUrl],
  });

  /**
   * Fetch available job property descriptors for the HeteroList.
   * Mirrors Jelly expression: h.getJobPropertyDescriptors(it)
   */
  const { data: descriptorsData } = useStaplerQuery<{
    descriptors: Descriptor[];
  }>({
    url: `${jobUrl}/descriptorByName/hudson.model.Job/property/descriptorList`,
    queryKey: ["jobPropertyDescriptors", jobUrl],
    enabled: !isLoading,
  });

  /* ---------------------------------------------------------------------- */
  /*  Apply mutation — AJAX POST without page redirect                       */
  /*  Mirrors the Apply button behavior: POST to configSubmit via AJAX       */
  /*  CSRF crumb is injected automatically by useStaplerMutation             */
  /* ---------------------------------------------------------------------- */
  const applyMutation = useStaplerMutation<string, FormData>({
    url: `${jobUrl}/configSubmit`,
    contentType: "form-urlencoded",
    responseType: "text",
    onSuccess: () => {
      setApplyNotification(t("Saved") ?? "Saved");
      window.setTimeout(() => setApplyNotification(null), 3000);
    },
    onError: (err: Error) => {
      setApplyNotification(err.message || "Error saving configuration");
    },
  });

  /* ---------------------------------------------------------------------- */
  /*  Local state                                                            */
  /* ---------------------------------------------------------------------- */
  const [description, setDescription] = useState<string>("");
  const [disabled, setDisabled] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<string>("general");
  const [applyNotification, setApplyNotification] = useState<string | null>(
    null,
  );

  /* ---------------------------------------------------------------------- */
  /*  Sync fetched data into local state — React-recommended                 */
  /*  "adjust state during render" pattern: store the last-synced snapshot   */
  /*  in state so React can track the dependency and avoid stale closures.   */
  /*  See: react.dev/reference/react/useState#storing-information-from-      */
  /*       previous-renders                                                  */
  /* ---------------------------------------------------------------------- */
  const [lastSyncedConfig, setLastSyncedConfig] = useState<
    JobConfigData | undefined
  >(undefined);
  if (configData && configData !== lastSyncedConfig) {
    setLastSyncedConfig(configData);
    setDescription(configData.description ?? "");
    setDisabled(configData.disabled ?? false);
  }

  /* ---------------------------------------------------------------------- */
  /*  Section-to-sidebar-items generation                                    */
  /*  Replaces src/main/js/section-to-sidebar-items.js                       */
  /*  Generates sidebar navigation items from the form structure.            */
  /*  Uses useMemo (not useEffect + setState) per react-hooks lint rules.    */
  /* ---------------------------------------------------------------------- */
  const sidebarItems: SidebarItem[] = useMemo(() => {
    if (isLoading || !configData) {
      return [];
    }

    const items: SidebarItem[] = [
      { id: "general", title: t("General") ?? "General" },
    ];

    // Add per-property sidebar entries from job property descriptors.
    // Each property section gets its own sidebar link for scroll navigation,
    // mirroring how section-to-sidebar-items.js scans h2 headers.
    if (configData.properties && configData.properties.length > 0) {
      configData.properties.forEach((prop, index) => {
        if (prop.descriptor != null) {
          items.push({
            id: `property-${index}`,
            title: prop.descriptor.displayName,
          });
        }
      });
    }

    return items;
  }, [isLoading, configData, t]);

  /* ---------------------------------------------------------------------- */
  /*  Active section tracking on scroll                                      */
  /*  Mirrors section-to-sidebar-items.js onScroll() function                */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    if (sidebarItems.length === 0) {
      return;
    }

    const handleScroll = () => {
      const scrollY = Math.max(window.scrollY, 0);
      let selected = sidebarItems[0]?.id ?? "general";

      for (let i = sidebarItems.length - 1; i >= 0; i -= 1) {
        const el = document.getElementById(sidebarItems[i].id);
        if (!el) {
          continue;
        }

        const rect = el.getBoundingClientRect();
        const elTop = rect.top + window.scrollY;

        if (scrollY >= elTop - SCROLL_OFFSET - 1) {
          selected = sidebarItems[i].id;
          break;
        }
      }

      setActiveSection((prev) => (prev !== selected ? selected : prev));
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sidebarItems]);

  /* ---------------------------------------------------------------------- */
  /*  Scroll-to-section handler                                              */
  /*  Mirrors section-to-sidebar-items.js task button click behavior         */
  /* ---------------------------------------------------------------------- */
  const scrollToSection = useCallback(
    (sectionId: string, index: number) => {
      const element = document.getElementById(sectionId);
      if (!element) {
        return;
      }

      if (index === 0) {
        // First section scrolls to top of page (matches original behavior)
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const sectionTop =
          element.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
        window.scrollTo({ top: sectionTop, behavior: "smooth" });
      }
      setActiveSection(sectionId);
    },
    [setActiveSection],
  );

  /* ---------------------------------------------------------------------- */
  /*  Save form action — React 19 useActionState pattern                     */
  /*  Mirrors configure.jelly Save button: POST to configSubmit + redirect   */
  /* ---------------------------------------------------------------------- */
  const [saveState, saveFormAction, isSaving] = useActionState(
    async (
      _prevState: FormActionState,
      formData: FormData,
    ): Promise<FormActionState> => {
      try {
        // Inject CSRF crumb from DOM head dataset
        const crumbHeaderName =
          document.head.dataset.crumbHeader ?? "Jenkins-Crumb";
        const crumbValue = document.head.dataset.crumbValue ?? "";

        const response = await fetch(`${jobUrl}/configSubmit`, {
          method: "POST",
          body: formData,
          headers: {
            [crumbHeaderName]: crumbValue,
          },
          redirect: "follow",
        });

        if (response.ok || response.redirected) {
          // Redirect to job page on success (mirrors Jelly POST redirect)
          window.location.href = response.redirected ? response.url : jobUrl;
          return { status: "success", error: null };
        }

        const errorText = await response.text();
        return {
          status: "error",
          error: errorText || `Save failed (HTTP ${response.status})`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { status: "error", error: message };
      }
    },
    INITIAL_FORM_STATE,
  );

  /* ---------------------------------------------------------------------- */
  /*  Apply handler — AJAX POST via useStaplerMutation without redirect      */
  /* ---------------------------------------------------------------------- */
  const handleApply = useCallback(() => {
    if (!formRef.current) {
      return;
    }
    const formData = new FormData(formRef.current);
    applyMutation.mutate(formData);
  }, [applyMutation]);

  /* ---------------------------------------------------------------------- */
  /*  Description change handler                                             */
  /* ---------------------------------------------------------------------- */
  const handleDescriptionChange = useCallback(
    (value: string) => {
      setDescription(value);
    },
    [setDescription],
  );

  /* ---------------------------------------------------------------------- */
  /*  Disable-build toggle handler                                           */
  /* ---------------------------------------------------------------------- */
  const handleDisabledChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDisabled(e.target.checked);
    },
    [setDisabled],
  );

  /* ---------------------------------------------------------------------- */
  /*  Permission gate                                                        */
  /*  Mirrors configure.jelly line 30:                                       */
  /*    <l:layout permission="${it.EXTENDED_READ}">                           */
  /* ---------------------------------------------------------------------- */
  if (!hasExtendedReadPermission) {
    return (
      <Layout title={`${t("Config") ?? "Config"} ${displayName}`}>
        <div className="jenkins-not-accessible" role="alert">
          <p>
            {t("AccessDenied") ??
              "Access denied. You need the Extended Read permission to view this page."}
          </p>
        </div>
      </Layout>
    );
  }

  /* ---------------------------------------------------------------------- */
  /*  Derived values                                                         */
  /* ---------------------------------------------------------------------- */
  const pageTitle = `${t("Config") ?? "Config"} ${displayName}`;
  const breadcrumbTitle = readOnlyMode
    ? (t("Configuration") ?? "Configuration")
    : (t("Configure") ?? "Configure");

  // Map config data properties to HeteroList items
  const heteroItems: HeteroItem[] = (configData?.properties ?? [])
    .filter(
      (
        prop,
      ): prop is JobPropertyBase & {
        descriptor: Descriptor;
        instance?: Record<string, unknown>;
      } => prop.descriptor != null,
    )
    .map((prop) => ({
      descriptor: prop.descriptor,
      data: prop.instance ?? {},
    }));

  const availableDescriptors: Descriptor[] = descriptorsData?.descriptors ?? [];

  /* ---------------------------------------------------------------------- */
  /*  Sidebar content                                                        */
  /*  Mirrors configure.jelly lines 39-44:                                   */
  /*    <l:side-panel sticky="true">                                         */
  /*      <l:header title="Configure" />                                     */
  /*      <div id="tasks"/>                                                  */
  /*    </l:side-panel>                                                      */
  /* ---------------------------------------------------------------------- */
  const sidebarContent = (
    <>
      {/* App bar with Configure / Configuration title */}
      <div className="jenkins-app-bar">
        <div className="jenkins-app-bar__content">
          <h1 className="jenkins-app-bar__title">{breadcrumbTitle}</h1>
        </div>
      </div>

      {/* Sidebar task navigation — replaces section-to-sidebar-items.js */}
      <div id="tasks">
        {isLoading ? (
          <Skeleton type="side-panel" />
        ) : (
          sidebarItems.map((item, index) => (
            <div key={item.id} className="task">
              <span className="task-link-wrapper">
                <button
                  type="button"
                  data-section-id={item.id}
                  className={`task-link${
                    activeSection === item.id ? " task-link--active" : ""
                  }`}
                  onClick={() => scrollToSection(item.id, index)}
                >
                  <span className="task-icon-link">{DEFAULT_SIDEBAR_ICON}</span>
                  <span className="task-link-text">{item.title}</span>
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );

  /* ---------------------------------------------------------------------- */
  /*  Loading state                                                          */
  /* ---------------------------------------------------------------------- */
  if (isLoading) {
    return (
      <Layout title={pageTitle} sidePanel={sidebarContent}>
        <Skeleton type="form" />
      </Layout>
    );
  }

  /* ---------------------------------------------------------------------- */
  /*  Error state                                                            */
  /* ---------------------------------------------------------------------- */
  if (isError || !configData) {
    return (
      <Layout title={pageTitle} sidePanel={sidebarContent}>
        <div className="jenkins-alert jenkins-alert--error" role="alert">
          <p>
            {t("ErrorLoadingConfiguration") ??
              "Error loading job configuration. Please try again."}
          </p>
        </div>
      </Layout>
    );
  }

  /* ---------------------------------------------------------------------- */
  /*  Main render                                                            */
  /* ---------------------------------------------------------------------- */
  return (
    <Layout title={pageTitle} sidePanel={sidebarContent}>
      <form
        ref={formRef}
        action={saveFormAction}
        className="jenkins-form"
        name="config"
      >
        {/* ================================================================ */}
        {/* General section — mirrors configure.jelly lines 46-55             */}
        {/* ================================================================ */}
        <FormSection name="general" title={t("General") ?? "General"}>
          <div id="general" className="jenkins-app-bar">
            <div className="jenkins-app-bar__content">
              {/* config-disableBuild — mirrors configure.jelly line 49 */}
              <Checkbox
                name="disable"
                checked={disabled}
                label={t("DisableThisProject") ?? "Disable this project"}
                disabled={readOnlyMode}
                onChange={handleDisabledChange}
              />
            </div>
          </div>
        </FormSection>

        {/* ================================================================ */}
        {/* Description — mirrors configure.jelly lines 57-61                 */}
        {/* ================================================================ */}
        <div className="jenkins-section jenkins-section--no-border jenkins-!-margin-top-3">
          <FormEntry
            title={t("Description") ?? "Description"}
            help={configData.markupFormatterHelpUrl}
          >
            <TextArea
              name="description"
              value={description}
              codemirrorMode={configData.codeMirrorMode}
              codemirrorConfig={configData.codeMirrorConfig}
              previewEndpoint="/markupFormatter/previewDescription"
              readOnly={readOnlyMode}
              onChange={handleDescriptionChange}
            />
          </FormEntry>
        </div>

        {/* ================================================================ */}
        {/* Job properties descriptor list                                    */}
        {/* Mirrors configure.jelly line 63:                                  */}
        {/*   <f:descriptorList field="properties"                            */}
        {/*     descriptors="${h.getJobPropertyDescriptors(it)}"               */}
        {/*     forceRowSet="true"/>                                           */}
        {/* ================================================================ */}

        {/* Per-property scroll-target anchors for sidebar navigation */}
        {heteroItems.map((item, index) => (
          <div
            key={item.descriptor.id}
            id={`property-${index}`}
            aria-hidden="true"
            style={{ position: "relative" }}
          />
        ))}

        {/* Single HeteroList managing all job properties */}
        {heteroItems.length > 0 && (
          <HeteroList
            name="properties"
            items={heteroItems}
            descriptors={readOnlyMode ? [] : availableDescriptors}
            hasHeader
            disableDragAndDrop={readOnlyMode}
          />
        )}

        {/* ================================================================ */}
        {/* Extension point for derived class configuration entries            */}
        {/* Mirrors configure.jelly line 66:                                  */}
        {/*   <st:include page="configure-entries.jelly" />                   */}
        {/* configure-entries.jelly is empty by default; derived types         */}
        {/* (FreeStyleProject, etc.) override it to inject additional          */}
        {/* configuration sections. This div serves as a mount point          */}
        {/* for server-injected plugin/extension content.                      */}
        {/* ================================================================ */}
        <div id="configure-entries" />

        {/* ================================================================ */}
        {/* Save / Apply bar                                                  */}
        {/* Mirrors configure.jelly line 68: <f:bottomButtonBar>              */}
        {/* Only shown when user has CONFIGURE permission                      */}
        {/* ================================================================ */}
        {!readOnlyMode && (
          <div className="jenkins-buttons-row jenkins-buttons-row--equal-width">
            {/* Save — triggers React 19 form action (POST + redirect) */}
            <button
              type="submit"
              className="jenkins-button jenkins-button--primary"
              name="Submit"
              disabled={isSaving}
            >
              {isSaving
                ? (t("Saving") ?? "Saving\u2026")
                : (t("Save") ?? "Save")}
            </button>

            {/* Apply — AJAX POST via useStaplerMutation (no redirect) */}
            <button
              type="button"
              className="jenkins-button"
              id="apply-button"
              onClick={handleApply}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending
                ? (t("Applying") ?? "Applying\u2026")
                : (t("Apply") ?? "Apply")}
            </button>
          </div>
        )}

        {/* Apply success / error notification */}
        {(applyNotification != null || applyMutation.isError) && (
          <div
            className={`jenkins-notification ${
              applyMutation.isError
                ? "jenkins-notification--error"
                : "jenkins-notification--success"
            }`}
            role="status"
            aria-live="polite"
          >
            {applyMutation.isError && applyMutation.error != null
              ? (applyMutation.error as Error).message ||
                "Error saving configuration"
              : applyNotification}
          </div>
        )}

        {/* Save error display */}
        {saveState.status === "error" && saveState.error != null && (
          <div className="jenkins-alert jenkins-alert--error" role="alert">
            <p>{saveState.error}</p>
          </div>
        )}
      </form>
    </Layout>
  );
}
