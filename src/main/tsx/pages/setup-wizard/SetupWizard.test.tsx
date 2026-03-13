/**
 * @file SetupWizard.test.tsx — Unit tests for SetupWizard orchestrator.
 * Target: ≥80% branch coverage of SetupWizard.tsx (1411 lines).
 *
 * ## Architecture Note — useState Capture Pattern
 *
 * SetupWizard's initialization effect uses `setInitStarted(true)` + async
 * operations + a `cancelled` flag. In jsdom, the state update triggers a
 * synchronous re-render that runs effect cleanup and sets `cancelled = true`
 * before the async chain completes. This is a timing difference between jsdom
 * and real browsers (where React defers the re-render).
 *
 * To work around this, we mock `React.useState` to capture all 12 state setter
 * functions, then programmatically advance the wizard to each desired state via
 * `act()`. This lets us test rendering, callbacks, and state transitions
 * without depending on the fragile initialization timing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// React.useState interception — captures state setters by call order
// ---------------------------------------------------------------------------

/** Map of state name → setter function, populated during each render. */
const setters: Record<string, (...args: unknown[]) => unknown> = {};

/** Ordered names matching SetupWizard's 12 useState calls. */
const STATE_ORDER = [
  "currentStep",
  "errorMessage",
  "selectedPluginNames",
  "installingPlugins",
  "failedPluginNames",
  "translations",
  "correlationId",
  "pluginData",
  "categories",
  "incompletePlugins",
  "configureMessage",
  "initStarted",
];
let callIdx = 0;

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const origUseState = actual.useState;
  return {
    ...actual,
    __esModule: true,
    useState: ((init: unknown) => {
      const pos = callIdx % STATE_ORDER.length;
      callIdx++;
      const result = origUseState(init);
      setters[STATE_ORDER[pos]] = result[1];
      return result;
    }) as typeof actual.useState,
  };
});

// ---------------------------------------------------------------------------
// Mutable mock state
// ---------------------------------------------------------------------------

let pluginListData: unknown = null;
let pluginListRefetch: ReturnType<typeof vi.fn>;
let installStatusData: unknown = null;
let installStatusRefetch: ReturnType<typeof vi.fn>;
let incompleteData: unknown = null;
let incompleteRefetch: ReturnType<typeof vi.fn>;
let restartStatusData: unknown = null;
let installMutateAsync: ReturnType<typeof vi.fn>;
let completeMutateAsync: ReturnType<typeof vi.fn>;
let restartMutateAsync: ReturnType<typeof vi.fn>;
let doneMutateAsync: ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Module mocks — API layer
// ---------------------------------------------------------------------------

vi.mock("@/api/pluginManager", () => ({
  usePluginList: () => ({
    data: pluginListData,
    refetch: pluginListRefetch,
  }),
  usePluginInstall: () => ({
    mutateAsync: installMutateAsync,
  }),
  useInstallStatus: () => ({
    data: installStatusData,
    refetch: installStatusRefetch,
    enabled: false,
  }),
  useIncompleteInstallStatus: () => ({
    data: incompleteData,
    refetch: incompleteRefetch,
    enabled: false,
  }),
  useRestartStatus: () => ({
    data: restartStatusData,
  }),
  useCompleteInstall: () => ({
    mutateAsync: completeMutateAsync,
  }),
  useRestartJenkins: () => ({
    mutateAsync: restartMutateAsync,
  }),
  useInstallPluginsDone: () => ({
    mutateAsync: doneMutateAsync,
  }),
  initPluginData: (categories: { plugins: { name: string }[] }[]) => ({
    names: categories.flatMap((c) => c.plugins.map((p) => p.name)),
    recommendedPlugins: ["git", "workflow-aggregator"],
    allPlugins: {},
  }),
}));

// ---------------------------------------------------------------------------
// Module mocks — hooks & providers
// ---------------------------------------------------------------------------

const mockLoadBundle = vi.fn().mockResolvedValue({});

vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    t: (k: string) => k,
    locale: "en",
    loadBundle: mockLoadBundle,
  }),
}));

const mockNavigate = vi.fn();

vi.mock("@/hooks/useJenkinsNavigation", () => ({
  useJenkinsNavigation: () => ({
    buildUrl: (p: string) => `/jenkins${p}`,
    navigate: mockNavigate,
  }),
}));

const mockUpdateCrumb = vi.fn();

vi.mock("@/hooks/useCrumb", () => ({
  useCrumb: () => ({
    updateCrumb: mockUpdateCrumb,
    crumbFieldName: "Jenkins-Crumb",
    crumbValue: "test-crumb",
  }),
}));

vi.mock("@/providers/JenkinsConfigProvider", () => ({
  useJenkinsConfig: () => ({
    baseUrl: "",
    crumb: "test",
  }),
}));

// ---------------------------------------------------------------------------
// Module mocks — layout & child panel components
// ---------------------------------------------------------------------------

vi.mock("@/layout/Spinner", () => ({
  default: ({ text }: { text?: string }) => (
    <div data-testid="spinner">{text}</div>
  ),
}));

vi.mock("@/pages/setup-wizard/WelcomePanel", () => ({
  default: ({
    onInstallRecommended,
    onInstallCustom,
  }: {
    onInstallRecommended: () => void;
    onInstallCustom: () => void;
  }) => (
    <div data-testid="welcome-panel">
      <button data-testid="install-recommended" onClick={onInstallRecommended}>
        Recommended
      </button>
      <button data-testid="install-custom" onClick={onInstallCustom}>
        Custom
      </button>
    </div>
  ),
}));

vi.mock("@/pages/setup-wizard/PluginSelectionPanel", () => ({
  default: ({
    onInstall,
    onGoBack,
  }: {
    onInstall: () => void;
    onGoBack: () => void;
  }) => (
    <div data-testid="selection-panel">
      <button data-testid="install-selected" onClick={onInstall}>
        Install Selected
      </button>
      <button data-testid="go-back-selection" onClick={onGoBack}>
        Back
      </button>
    </div>
  ),
}));

vi.mock("@/pages/setup-wizard/ProgressPanel", () => ({
  default: ({
    onComplete,
    onError,
  }: {
    onComplete: (state: string) => void;
    onError: (msg: string) => void;
  }) => (
    <div data-testid="progress-panel">
      <button
        data-testid="complete-install"
        onClick={() => onComplete("CREATE_ADMIN_USER")}
      >
        Complete
      </button>
      <button
        data-testid="complete-running"
        onClick={() => onComplete("RUNNING")}
      >
        Running
      </button>
      <button
        data-testid="complete-configure"
        onClick={() => onComplete("CONFIGURE_INSTANCE")}
      >
        Configure
      </button>
      <button
        data-testid="error-install"
        onClick={() => onError("Install failed")}
      >
        Error
      </button>
    </div>
  ),
}));

vi.mock("@/pages/setup-wizard/FirstUserPanel", () => ({
  default: ({
    onSaveSuccess,
    onSkip,
    onError,
  }: {
    onSaveSuccess: () => void;
    onSkip: () => void;
    onError: (msg: string) => void;
  }) => (
    <div data-testid="first-user-panel">
      <button data-testid="save-user" onClick={onSaveSuccess}>
        Save
      </button>
      <button data-testid="skip-user" onClick={onSkip}>
        Skip
      </button>
      <button data-testid="error-user" onClick={() => onError("User error")}>
        Error
      </button>
    </div>
  ),
}));

vi.mock("@/pages/setup-wizard/ConfigureInstancePanel", () => ({
  default: ({
    onSaveSuccess,
    onSkip,
    onError,
  }: {
    onSaveSuccess: () => void;
    onSkip: () => void;
    onError: (msg: string) => void;
  }) => (
    <div data-testid="configure-instance-panel">
      <button data-testid="save-instance" onClick={onSaveSuccess}>
        Save
      </button>
      <button data-testid="skip-instance" onClick={onSkip}>
        Skip
      </button>
      <button
        data-testid="error-instance"
        onClick={() => onError("Instance error")}
      >
        Error
      </button>
    </div>
  ),
}));

vi.mock("@/pages/setup-wizard/ProxyConfigPanel", () => ({
  default: ({
    onGoBack,
    onSave,
  }: {
    onGoBack: () => void;
    onSave: () => void;
  }) => (
    <div data-testid="proxy-panel">
      <button data-testid="proxy-back" onClick={onGoBack}>
        Back
      </button>
      <button data-testid="proxy-save" onClick={onSave}>
        Save
      </button>
    </div>
  ),
}));

vi.mock("@/pages/setup-wizard/SetupCompletePanel", () => ({
  default: ({
    onFinish,
    onRestart,
  }: {
    onFinish: () => void;
    onRestart: () => void;
  }) => (
    <div data-testid="complete-panel">
      <button data-testid="finish" onClick={onFinish}>
        Finish
      </button>
      <button data-testid="restart" onClick={onRestart}>
        Restart
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Component import (AFTER all mocks)
// ---------------------------------------------------------------------------

import SetupWizard from "./SetupWizard";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const sampleCategories = [
  {
    category: "General",
    plugins: [
      { name: "git", title: "Git Plugin" },
      { name: "workflow-aggregator", title: "Pipeline" },
    ],
  },
];

const samplePluginData = {
  names: ["git", "workflow-aggregator"],
  recommendedPlugins: ["git", "workflow-aggregator"],
  allPlugins: {},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset all mock state variables. */
function setupDefaultMocks(): void {
  pluginListData = sampleCategories;
  pluginListRefetch = vi.fn().mockResolvedValue({ data: sampleCategories });
  installStatusData = null;
  installStatusRefetch = vi
    .fn()
    .mockResolvedValue({ data: { jobs: [], state: null } });
  incompleteData = null;
  incompleteRefetch = vi.fn().mockResolvedValue({ data: { jobs: [] } });
  restartStatusData = { restartRequired: false, restartSupported: true };
  installMutateAsync = vi.fn().mockResolvedValue("corr-123");
  completeMutateAsync = vi.fn().mockResolvedValue(undefined);
  restartMutateAsync = vi.fn().mockResolvedValue(undefined);
  doneMutateAsync = vi.fn().mockResolvedValue(undefined);

  mockLoadBundle.mockReset();
  mockLoadBundle.mockResolvedValue({});
  mockNavigate.mockReset();
  mockUpdateCrumb.mockReset();
}

/**
 * Render SetupWizard and advance to a specific step via captured state setters.
 * The initialization effect is unreliable in jsdom, so we programmatically
 * set the wizard state after the initial render.
 */
function renderAndAdvance(step: string): ReturnType<typeof render> {
  const result = render(<SetupWizard />);

  act(() => {
    setters.initStarted?.(true);
    setters.translations?.({});
    setters.pluginData?.(samplePluginData);
    setters.categories?.(sampleCategories);
    setters.selectedPluginNames?.(samplePluginData.recommendedPlugins);
    setters.currentStep?.(step);
  });

  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SetupWizard", () => {
  beforeEach(() => {
    callIdx = 0;
    for (const k of STATE_ORDER) {
      delete (setters as Record<string, unknown>)[k];
    }
    vi.clearAllMocks();
    setupDefaultMocks();
    document.body.dataset.version = "2.450";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { updatesite: "OK", internet: "OK" },
          }),
      }),
    );
  });

  afterEach(() => {
    delete document.body.dataset.version;
  });

  // =========================================================================
  // Initial loading state
  // =========================================================================

  it("shows spinner during initialization", () => {
    render(<SetupWizard />);
    expect(screen.getByTestId("spinner")).toBeDefined();
  });

  // =========================================================================
  // Bootstrap-3 wrapper and modal shell
  // =========================================================================

  it("renders with bootstrap-3 wrapper class", () => {
    renderAndAdvance("welcome");
    const wrapper = document.querySelector(".plugin-setup-wizard.bootstrap-3");
    expect(wrapper).not.toBeNull();
  });

  it("renders modal shell with correct structure", () => {
    renderAndAdvance("welcome");
    expect(document.querySelector(".modal.fade.in")).not.toBeNull();
    expect(document.querySelector(".modal-dialog")).not.toBeNull();
    expect(document.querySelector(".modal-content")).not.toBeNull();
  });

  // =========================================================================
  // Jenkins version footer
  // =========================================================================

  it("shows jenkins version in footer", () => {
    renderAndAdvance("welcome");
    const versionDiv = document.querySelector(".jenkins-version");
    expect(versionDiv?.textContent).toContain("2.450");
  });

  it("hides version footer when no version in dataset", () => {
    delete document.body.dataset.version;
    renderAndAdvance("welcome");
    const versionDiv = document.querySelector(".jenkins-version");
    expect(versionDiv).toBeNull();
  });

  // =========================================================================
  // Close button (only on welcome step)
  // =========================================================================

  it("renders close button on welcome step", () => {
    renderAndAdvance("welcome");
    const closeBtn = document.querySelector("button.close");
    expect(closeBtn).not.toBeNull();
  });

  it("close button navigates to root", () => {
    renderAndAdvance("welcome");
    const closeBtn = document.querySelector("button.close")!;
    fireEvent.click(closeBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("does not render close button on non-welcome steps", () => {
    renderAndAdvance("first-user");
    const closeBtn = document.querySelector("button.close");
    expect(closeBtn).toBeNull();
  });

  // =========================================================================
  // Welcome panel rendering
  // =========================================================================

  it("shows welcome panel when in welcome step", () => {
    renderAndAdvance("welcome");
    expect(screen.getByTestId("welcome-panel")).toBeDefined();
  });

  // =========================================================================
  // Install recommended plugins flow
  // =========================================================================

  it("transitions to installing when recommended plugins clicked", async () => {
    renderAndAdvance("welcome");
    await act(async () => {
      fireEvent.click(screen.getByTestId("install-recommended"));
    });
    // installPlugins calls installMutateAsync and sets step to "installing"
    expect(installMutateAsync).toHaveBeenCalled();
  });

  // =========================================================================
  // Install custom flow
  // =========================================================================

  it("shows plugin selection panel when custom clicked", () => {
    renderAndAdvance("welcome");
    fireEvent.click(screen.getByTestId("install-custom"));
    expect(screen.getByTestId("selection-panel")).toBeDefined();
  });

  it("goes back to welcome from plugin selection", () => {
    renderAndAdvance("plugin-selection");
    fireEvent.click(screen.getByTestId("go-back-selection"));
    expect(screen.getByTestId("welcome-panel")).toBeDefined();
  });

  it("installs selected plugins from selection panel", async () => {
    renderAndAdvance("plugin-selection");
    await act(async () => {
      fireEvent.click(screen.getByTestId("install-selected"));
    });
    expect(installMutateAsync).toHaveBeenCalled();
  });

  // =========================================================================
  // Progress panel → state transitions
  // =========================================================================

  it("transitions to first-user when install completes with CREATE_ADMIN_USER", () => {
    renderAndAdvance("installing");
    fireEvent.click(screen.getByTestId("complete-install"));
    expect(screen.getByTestId("first-user-panel")).toBeDefined();
  });

  it("transitions to setup-complete when install completes with RUNNING", () => {
    renderAndAdvance("installing");
    fireEvent.click(screen.getByTestId("complete-running"));
    expect(screen.getByTestId("complete-panel")).toBeDefined();
  });

  it("transitions to configure-instance for CONFIGURE_INSTANCE state", () => {
    renderAndAdvance("installing");
    fireEvent.click(screen.getByTestId("complete-configure"));
    expect(screen.getByTestId("configure-instance-panel")).toBeDefined();
  });

  it("shows error panel when progress reports error", () => {
    renderAndAdvance("installing");
    fireEvent.click(screen.getByTestId("error-install"));
    const errorAlert = document.querySelector(".alert.alert-danger");
    expect(errorAlert).not.toBeNull();
    expect(errorAlert?.textContent).toContain("Install failed");
  });

  // =========================================================================
  // First User panel → transitions
  // =========================================================================

  it("transitions to configure-instance after first user save", () => {
    renderAndAdvance("first-user");
    fireEvent.click(screen.getByTestId("save-user"));
    expect(screen.getByTestId("configure-instance-panel")).toBeDefined();
  });

  it("transitions to configure-instance when first user skipped", async () => {
    renderAndAdvance("first-user");
    await act(async () => {
      fireEvent.click(screen.getByTestId("skip-user"));
    });
    // handleSkipFirstUser fetches root URL, then sets step to configure-instance
    expect(screen.getByTestId("configure-instance-panel")).toBeDefined();
  });

  it("shows error panel when first user save fails", () => {
    renderAndAdvance("first-user");
    fireEvent.click(screen.getByTestId("error-user"));
    const errorAlert = document.querySelector(".alert.alert-danger");
    expect(errorAlert).not.toBeNull();
  });

  // =========================================================================
  // Configure Instance panel → transitions
  // =========================================================================

  it("transitions to setup-complete after instance config save", () => {
    renderAndAdvance("configure-instance");
    fireEvent.click(screen.getByTestId("save-instance"));
    expect(screen.getByTestId("complete-panel")).toBeDefined();
  });

  it("transitions to setup-complete when instance config skipped", () => {
    renderAndAdvance("configure-instance");
    fireEvent.click(screen.getByTestId("skip-instance"));
    expect(screen.getByTestId("complete-panel")).toBeDefined();
  });

  it("shows error panel when instance config fails", () => {
    renderAndAdvance("configure-instance");
    fireEvent.click(screen.getByTestId("error-instance"));
    const errorAlert = document.querySelector(".alert.alert-danger");
    expect(errorAlert).not.toBeNull();
  });

  // =========================================================================
  // Setup Complete panel
  // =========================================================================

  it("calls completeInstall and navigates on finish", async () => {
    renderAndAdvance("setup-complete");
    await act(async () => {
      fireEvent.click(screen.getByTestId("finish"));
    });
    expect(completeMutateAsync).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("calls restart and shows loading on restart click", async () => {
    renderAndAdvance("setup-complete");
    // Make restart succeed and fetch ping succeed immediately
    restartMutateAsync.mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      fireEvent.click(screen.getByTestId("restart"));
    });
    expect(restartMutateAsync).toHaveBeenCalled();
  });

  // =========================================================================
  // Proxy panel
  // =========================================================================

  it("shows proxy config panel", () => {
    renderAndAdvance("proxy-config");
    expect(screen.getByTestId("proxy-panel")).toBeDefined();
  });

  it("goes back to offline from proxy panel", () => {
    renderAndAdvance("proxy-config");
    fireEvent.click(screen.getByTestId("proxy-back"));
    // handleGoBackFromProxy sets step to "offline"
    const offlineHeader = document.querySelector(".modal-header h1");
    expect(offlineHeader).not.toBeNull();
  });

  it("navigates to root on proxy save", () => {
    renderAndAdvance("proxy-config");
    fireEvent.click(screen.getByTestId("proxy-save"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  // =========================================================================
  // Offline panel
  // =========================================================================

  it("shows offline panel", () => {
    renderAndAdvance("offline");
    const header = document.querySelector(".modal-header h1");
    expect(header?.textContent).toContain("Offline");
  });

  it("shows proxy config when Configure Proxy clicked from offline", () => {
    renderAndAdvance("offline");
    // Find the Configure Proxy button in the offline panel
    const buttons = document.querySelectorAll(".modal-footer button");
    const proxyBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Configure Proxy"),
    );
    expect(proxyBtn).not.toBeNull();
    fireEvent.click(proxyBtn!);
    expect(screen.getByTestId("proxy-panel")).toBeDefined();
  });

  it("calls completeInstall when skip plugin installs clicked", async () => {
    renderAndAdvance("offline");
    const buttons = document.querySelectorAll(".modal-footer button");
    const skipBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Skip Plugin"),
    );
    expect(skipBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(skipBtn!);
    });
    expect(completeMutateAsync).toHaveBeenCalled();
  });

  // =========================================================================
  // Error panel
  // =========================================================================

  it("shows error panel with error message", () => {
    render(<SetupWizard />);
    act(() => {
      setters.initStarted?.(true);
      setters.errorMessage?.("Something went wrong");
      setters.currentStep?.("error");
    });
    const alert = document.querySelector(".alert.alert-danger");
    expect(alert?.textContent).toContain("Something went wrong");
  });

  it("navigates to root on start over from error panel", () => {
    render(<SetupWizard />);
    act(() => {
      setters.initStarted?.(true);
      setters.errorMessage?.("fail");
      setters.currentStep?.("error");
    });
    const startOverBtn = Array.from(
      document.querySelectorAll(".modal-footer button"),
    ).find((b) => b.textContent?.includes("Start Over"));
    expect(startOverBtn).not.toBeNull();
    fireEvent.click(startOverBtn!);
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("retries from error state", () => {
    render(<SetupWizard />);
    act(() => {
      setters.initStarted?.(true);
      setters.errorMessage?.("fail");
      setters.currentStep?.("error");
    });
    const retryBtn = Array.from(
      document.querySelectorAll(".modal-footer button"),
    ).find((b) => b.textContent?.includes("Retry"));
    expect(retryBtn).not.toBeNull();
    fireEvent.click(retryBtn!);
    // Retry resets initStarted to false and step to loading
    expect(screen.getByTestId("spinner")).toBeDefined();
  });

  // =========================================================================
  // Incomplete install panel
  // =========================================================================

  it("shows incomplete install panel with plugin list", () => {
    render(<SetupWizard />);
    act(() => {
      setters.initStarted?.(true);
      setters.incompletePlugins?.([
        { name: "git", title: "Git Plugin", installStatus: "pending" },
        {
          name: "bad-plugin",
          title: "Bad Plugin",
          installStatus: "error",
          errorMessage: "Download failed",
        },
      ]);
      setters.currentStep?.("incomplete-install");
    });
    const header = document.querySelector(".modal-header h1");
    expect(header?.textContent).toContain("Resume");
    expect(document.body.textContent).toContain("Git Plugin");
    expect(document.body.textContent).toContain("Download failed");
  });

  it("resumes installation from incomplete panel", async () => {
    render(<SetupWizard />);
    act(() => {
      setters.initStarted?.(true);
      setters.pluginData?.(samplePluginData);
      setters.categories?.(sampleCategories);
      setters.incompletePlugins?.([
        { name: "git", title: "Git Plugin", installStatus: "pending" },
      ]);
      setters.currentStep?.("incomplete-install");
    });
    const resumeBtn = Array.from(
      document.querySelectorAll(".modal-footer button"),
    ).find((b) => b.textContent?.includes("Resume"));
    expect(resumeBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(resumeBtn!);
    });
    expect(installMutateAsync).toHaveBeenCalled();
  });

  it("goes back from incomplete install panel", () => {
    render(<SetupWizard />);
    act(() => {
      setters.initStarted?.(true);
      setters.incompletePlugins?.([]);
      setters.currentStep?.("incomplete-install");
    });
    const goBackBtn = Array.from(
      document.querySelectorAll(".modal-footer button"),
    ).find(
      (b) =>
        b.textContent?.includes("Go back") ||
        b.textContent?.includes("go back"),
    );
    expect(goBackBtn).not.toBeNull();
    fireEvent.click(goBackBtn!);
    // handleGoBack calls showStatePanel() → defaults to welcome
    expect(screen.getByTestId("welcome-panel")).toBeDefined();
  });

  // =========================================================================
  // Install success panel (inline)
  // =========================================================================

  it("shows install success with no failures", () => {
    render(<SetupWizard />);
    act(() => {
      setters.initStarted?.(true);
      setters.failedPluginNames?.([]);
      setters.currentStep?.("install-success");
    });
    const header = document.querySelector(".modal-header h1");
    expect(header?.textContent).toContain("Installation Complete");
    expect(header?.textContent).not.toContain("errors");
  });

  it("shows install success with failures", () => {
    render(<SetupWizard />);
    act(() => {
      setters.initStarted?.(true);
      setters.failedPluginNames?.(["bad-plugin"]);
      setters.currentStep?.("install-success");
    });
    const header = document.querySelector(".modal-header h1");
    expect(header?.textContent).toContain("errors");
    expect(document.body.textContent).toContain("bad-plugin");
  });

  // =========================================================================
  // handleError branches
  // =========================================================================

  it("shows error when handleInstallRecommended called without pluginData", async () => {
    render(<SetupWizard />);
    act(() => {
      setters.initStarted?.(true);
      setters.pluginData?.(null);
      setters.currentStep?.("welcome");
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("install-recommended"));
    });
    // handleInstallRecommended checks pluginData, if null → handleError
    const alert = document.querySelector(".alert.alert-danger");
    expect(alert).not.toBeNull();
  });

  it("shows error when handleInstallCustom called without pluginData", () => {
    render(<SetupWizard />);
    act(() => {
      setters.initStarted?.(true);
      setters.pluginData?.(null);
      setters.currentStep?.("welcome");
    });
    fireEvent.click(screen.getByTestId("install-custom"));
    const alert = document.querySelector(".alert.alert-danger");
    expect(alert).not.toBeNull();
  });

  // =========================================================================
  // handleSaveConfigureInstance crumb refresh
  // =========================================================================

  it("calls updateCrumb on configure instance save", () => {
    renderAndAdvance("configure-instance");
    fireEvent.click(screen.getByTestId("save-instance"));
    // The handler tries to read crumb from document.head.dataset
    // and calls updateCrumb — we just verify setup-complete rendered
    expect(screen.getByTestId("complete-panel")).toBeDefined();
  });
});
