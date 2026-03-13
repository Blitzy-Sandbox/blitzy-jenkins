/**
 * @file ConsoleOutput.test.tsx — Unit tests for ConsoleOutput page component
 * Target: ≥80% branch coverage of ConsoleOutput.tsx (561 lines)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ConsoleOutput from "./ConsoleOutput";

/* ---------- mocks ---------- */

const mockT = (k: string) => k;
vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    t: mockT,
    locale: "en",
    loadBundle: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock("@/providers/JenkinsConfigProvider", () => ({
  useJenkinsConfig: () => ({
    baseUrl: "/jenkins",
    crumbFieldName: "Jenkins-Crumb",
    crumbValue: "test-crumb",
  }),
}));

let staplerQueryReturn: Record<string, unknown> = {};
vi.mock("@/hooks/useStaplerQuery", () => ({
  useStaplerQuery: () => staplerQueryReturn,
}));

vi.mock("@/layout/Layout", () => ({
  default: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => (
    <div data-testid="layout" data-title={title}>
      {children}
    </div>
  ),
}));

vi.mock("@/layout/Spinner", () => ({
  Spinner: ({ text }: { text?: string }) => (
    <div data-testid="spinner">{text}</div>
  ),
}));

/* ---------- helpers ---------- */

function createFetchResponse(
  html: string,
  headers: Record<string, string> = {},
) {
  return {
    ok: true,
    text: () => Promise.resolve(html),
    headers: new Headers({
      "X-Text-Size": "1024",
      "X-More-Data": "false",
      ...headers,
    }),
  };
}

/* ---------- tests ---------- */

describe("ConsoleOutput", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    staplerQueryReturn = {
      data: {
        building: false,
        result: "SUCCESS",
        displayName: "#42",
        fullDisplayName: "My Project #42",
      },
      isLoading: false,
      isError: false,
    };
    fetchSpy = vi
      .fn()
      // First call: probe
      .mockResolvedValueOnce(
        createFetchResponse("", {
          "X-Text-Size": "500",
          "X-More-Data": "false",
        }),
      )
      // Second call: actual content
      .mockResolvedValueOnce(
        createFetchResponse("<span>Build output</span>", {
          "X-Text-Size": "500",
          "X-More-Data": "false",
        }),
      );
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders without crashing", () => {
    const { container } = render(<ConsoleOutput buildUrl="/job/test/42/" />);
    expect(container).toBeTruthy();
  });

  it("renders page title as Console", () => {
    render(<ConsoleOutput buildUrl="/job/test/42/" />);
    const layout = screen.getByTestId("layout");
    expect(layout.dataset.title).toBe("console");
  });

  it("renders app bar with action buttons", () => {
    const { container } = render(<ConsoleOutput buildUrl="/job/test/42/" />);
    expect(container.textContent).toContain("download");
    expect(container.textContent).toContain("copy");
    expect(container.textContent).toContain("view-as-plain-text");
  });

  it("renders download link pointing to consoleText", () => {
    const { container } = render(<ConsoleOutput buildUrl="/job/test/42/" />);
    const link = container.querySelector("a[href='consoleText'][download]");
    expect(link).toBeTruthy();
  });

  it("renders copy button", () => {
    const { container } = render(<ConsoleOutput buildUrl="/job/test/42/" />);
    const btn = container.querySelector(".jenkins-copy-button");
    expect(btn).toBeTruthy();
  });

  it("renders pre element for console output", () => {
    const { container } = render(<ConsoleOutput buildUrl="/job/test/42/" />);
    const pre = container.querySelector("#out");
    expect(pre).toBeTruthy();
    expect(pre!.className).toContain("console-output");
  });

  it("shows spinner when loading and no output", () => {
    staplerQueryReturn = { data: undefined, isLoading: true, isError: false };
    // Prevent fetch from resolving immediately
    fetchSpy.mockReset();
    fetchSpy.mockReturnValue(new Promise(() => {}));
    render(<ConsoleOutput buildUrl="/job/test/42/" />);
    expect(screen.getByTestId("spinner")).toBeTruthy();
  });

  it("shows error alert when query fails and no output", () => {
    staplerQueryReturn = { data: undefined, isLoading: false, isError: true };
    fetchSpy.mockReset();
    fetchSpy.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ConsoleOutput buildUrl="/job/test/42/" />);
    expect(container.textContent).toContain("Failed to load build information");
  });

  it("fetches progressive console output", async () => {
    render(<ConsoleOutput buildUrl="/job/test/42/" />);
    await waitFor(
      () => {
        expect(fetchSpy).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
    // The first fetch call should be a probe with high offset
    const firstCall = fetchSpy.mock.calls[0][0] as string;
    expect(firstCall).toContain("progressiveHtml");
  });

  it("renders console content from progressive fetch", async () => {
    const { container } = render(<ConsoleOutput buildUrl="/job/test/42/" />);
    await waitFor(
      () => {
        const pre = container.querySelector("#out");
        return pre && pre.innerHTML.length > 0;
      },
      { timeout: 3000 },
    );
    const pre = container.querySelector("#out");
    expect(pre!.innerHTML).toContain("Build output");
  });

  it("renders truncation banner when log is large", async () => {
    fetchSpy.mockReset();
    // Probe returns large log size (200KB)
    fetchSpy.mockResolvedValueOnce(
      createFetchResponse("", {
        "X-Text-Size": String(200 * 1024),
        "X-More-Data": "false",
      }),
    );
    // Content fetch
    fetchSpy.mockResolvedValueOnce(
      createFetchResponse("<span>output</span>", {
        "X-Text-Size": String(200 * 1024),
        "X-More-Data": "false",
      }),
    );
    const { container } = render(<ConsoleOutput buildUrl="/job/test/42/" />);
    await waitFor(
      () => {
        const link = container.querySelector("a[href='consoleFull']");
        return link !== null;
      },
      { timeout: 3000 },
    );
    const link = container.querySelector("a[href='consoleFull']");
    expect(link).toBeTruthy();
    // mockT returns key "skipsome" which the component uses as-is (no {0} replacement matches)
    // The component falls back to its template `Skipped ${truncatedKB} KB...` only when t() returns falsy
    // Since mockT returns truthy "skipsome", the template.replace("{0}", ...) produces "skipsome"
    expect(link!.textContent).toContain("skipsome");
  });

  it("shows spinner when build is in progress and more data expected", async () => {
    staplerQueryReturn = {
      data: {
        building: true,
        result: null,
        displayName: "#42",
        fullDisplayName: "My Project #42",
      },
      isLoading: false,
      isError: false,
    };
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValueOnce(
      createFetchResponse("", { "X-Text-Size": "100", "X-More-Data": "true" }),
    );
    fetchSpy.mockResolvedValueOnce(
      createFetchResponse("<span>line1</span>", {
        "X-Text-Size": "200",
        "X-More-Data": "true",
      }),
    );
    // Don't resolve further calls to keep hasMoreData = true
    fetchSpy.mockReturnValue(new Promise(() => {}));

    const { container } = render(<ConsoleOutput buildUrl="/job/test/42/" />);
    await waitFor(
      () => {
        return container.querySelector("#spinner") !== null;
      },
      { timeout: 3000 },
    );
    expect(container.querySelector("#spinner")).toBeTruthy();
  });

  it("renders build result as data attribute on pre", async () => {
    const { container } = render(<ConsoleOutput buildUrl="/job/test/42/" />);
    const pre = container.querySelector("#out");
    expect(pre).toBeTruthy();
    expect(pre!.getAttribute("data-build-result")).toBe("SUCCESS");
  });

  it("uses display name fallback from props", () => {
    staplerQueryReturn = { data: undefined, isLoading: false, isError: true };
    fetchSpy.mockReset();
    fetchSpy.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <ConsoleOutput
        jobName="test-job"
        buildNumber={10}
        buildUrl="/job/test-job/10/"
      />,
    );
    expect(container.textContent).toContain("test-job #10");
  });

  it("handles empty buildUrl gracefully", () => {
    const { container } = render(<ConsoleOutput />);
    expect(container).toBeTruthy();
  });
});
