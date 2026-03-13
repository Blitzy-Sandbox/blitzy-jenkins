/**
 * Unit tests for AdvancedBlock.tsx — Expandable advanced options section.
 * Target: ≥80% branch coverage (293 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { AdvancedBlock } from "./AdvancedBlock";

// Mock i18n hook
vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    loadBundle: vi.fn().mockResolvedValue({}),
  }),
}));

describe("AdvancedBlock", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- Basic rendering ----

  it("renders the advanced block container", () => {
    const { container } = render(
      <AdvancedBlock>
        <span>Advanced content</span>
      </AdvancedBlock>,
    );
    expect(container.querySelector(".jenkins-form-item")).not.toBeNull();
  });

  it("renders the toggle button with default Advanced text", () => {
    const { container } = render(
      <AdvancedBlock>
        <span>content</span>
      </AdvancedBlock>,
    );
    const button = container.querySelector(".advanced-button");
    expect(button).not.toBeNull();
    // Text from i18n mock returns the key itself
    expect(button?.textContent).toContain("Advanced");
  });

  it("renders custom title on the toggle button", () => {
    const { container } = render(
      <AdvancedBlock title="More Options">
        <span>content</span>
      </AdvancedBlock>,
    );
    const button = container.querySelector(".advanced-button");
    expect(button?.textContent).toContain("More Options");
  });

  // ---- Collapsed state (default) ----

  it("starts in collapsed state by default", () => {
    const { container } = render(
      <AdvancedBlock>
        <span className="inner">content</span>
      </AdvancedBlock>,
    );
    // The toggle row (advancedLink) should be visible
    const toggleRow = container.querySelector(".advancedLink");
    expect(toggleRow).not.toBeNull();
    // The body section should be hidden
    const body = container.querySelector(".advancedBody");
    expect(body).not.toBeNull();
    const bodyStyle = (body as HTMLElement).style.display;
    expect(bodyStyle).toBe("none");
  });

  // ---- Expand on click ----

  it("expands when the advanced button is clicked", () => {
    const { container } = render(
      <AdvancedBlock>
        <span className="inner">hidden content</span>
      </AdvancedBlock>,
    );
    const button = container.querySelector(".advanced-button") as HTMLElement;
    act(() => {
      fireEvent.click(button);
    });
    // After click, the body should be visible
    const body = container.querySelector(".advancedBody") as HTMLElement;
    expect(body.style.display).not.toBe("none");
    // And the toggle row should be hidden
    const toggleRow = container.querySelector(".advancedLink") as HTMLElement;
    expect(toggleRow.style.display).toBe("none");
  });

  it("renders children content visible after expansion", () => {
    const { container } = render(
      <AdvancedBlock>
        <span className="inner-test">Advanced field</span>
      </AdvancedBlock>,
    );
    const button = container.querySelector(".advanced-button") as HTMLElement;
    act(() => {
      fireEvent.click(button);
    });
    const inner = container.querySelector(".inner-test");
    expect(inner).not.toBeNull();
    expect(inner?.textContent).toBe("Advanced field");
  });

  // ---- Edited badge ----

  it("shows Edited badge when customizedFields are provided", () => {
    const { container } = render(
      <AdvancedBlock customizedFields={["timeout", "retries"]}>
        <span>content</span>
      </AdvancedBlock>,
    );
    const badge = container.querySelector(".jenkins-edited-section-label");
    expect(badge).not.toBeNull();
  });

  it("does not show Edited badge when customizedFields is empty", () => {
    const { container } = render(
      <AdvancedBlock customizedFields={[]}>
        <span>content</span>
      </AdvancedBlock>,
    );
    const badge = container.querySelector(".jenkins-edited-section-label");
    // Badge is rendered but hidden via jenkins-hidden class
    expect(badge).not.toBeNull();
    expect(badge!.classList.contains("jenkins-hidden")).toBe(true);
  });

  it("does not show Edited badge when customizedFields is not provided", () => {
    const { container } = render(
      <AdvancedBlock>
        <span>content</span>
      </AdvancedBlock>,
    );
    const badge = container.querySelector(".jenkins-edited-section-label");
    // Badge is rendered but hidden via jenkins-hidden class
    expect(badge).not.toBeNull();
    expect(badge!.classList.contains("jenkins-hidden")).toBe(true);
  });

  // ---- Customized fields metadata ----

  it("renders customized-fields-info div with data attribute", () => {
    const { container } = render(
      <AdvancedBlock customizedFields={["field1", "field2"]}>
        <span>content</span>
      </AdvancedBlock>,
    );
    const infoDiv = container.querySelector(".advanced-customized-fields-info");
    expect(infoDiv).not.toBeNull();
    expect(infoDiv?.getAttribute("data-customized-fields")).toBe(
      "field1, field2",
    );
  });

  // ---- Inert attribute on collapsed body ----

  it("sets inert on collapsed body for accessibility", () => {
    const { container } = render(
      <AdvancedBlock>
        <span>content</span>
      </AdvancedBlock>,
    );
    const body = container.querySelector(".advancedBody") as HTMLElement;
    // inert attribute should be present when collapsed
    expect(body.hasAttribute("inert")).toBe(true);
  });
});
