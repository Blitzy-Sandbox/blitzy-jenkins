/**
 * Unit tests for ConfirmationLink.tsx
 *
 * Validates confirmation dialog trigger, confirm/cancel callbacks,
 * destructive action styling, link rendering, and CSRF crumb injection.
 *
 * Target: ≥80% branch coverage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ConfirmationLink from "./ConfirmationLink";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------
vi.mock("@/hooks/useCrumb", () => ({
  useCrumb: () => ({
    crumbFieldName: "Jenkins-Crumb",
    crumbValue: "test-crumb-token",
  }),
}));

vi.mock("@/components/dialogs/Dialog", () => ({
  __esModule: true,
  default: ({
    onResolve,
    onCancel,
    options,
  }: {
    dialogType: string;
    options: { title?: string; message?: string; type?: string };
    open: boolean;
    onResolve: () => void;
    onCancel: () => void;
  }) => (
    <div data-testid="mock-dialog">
      <span data-testid="dialog-title">{options?.title}</span>
      <span data-testid="dialog-message">{options?.message}</span>
      <span data-testid="dialog-type">{options?.type}</span>
      <button data-testid="dialog-confirm" onClick={onResolve}>
        OK
      </button>
      <button data-testid="dialog-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  ),
}));

describe("ConfirmationLink", () => {
  beforeEach(() => {
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.querySelectorAll("form").forEach((f) => f.remove());
  });

  it("renders anchor with confirmation-link class", () => {
    render(<ConfirmationLink url="/delete">Delete</ConfirmationLink>);
    const link = screen.getByText("Delete");
    expect(link.tagName).toBe("A");
    expect(link.classList.contains("confirmation-link")).toBe(true);
  });

  it("renders children inside the anchor", () => {
    render(
      <ConfirmationLink url="/action">
        <span>Child Content</span>
      </ConfirmationLink>,
    );
    expect(screen.getByText("Child Content")).toBeDefined();
  });

  it("appends custom className alongside confirmation-link", () => {
    const { container } = render(
      <ConfirmationLink url="/x" className="extra-class">
        Link
      </ConfirmationLink>,
    );
    const link = container.querySelector("a");
    expect(link?.className).toContain("confirmation-link");
    expect(link?.className).toContain("extra-class");
  });

  it("prevents default navigation on click and opens dialog", () => {
    render(
      <ConfirmationLink url="/delete" title="Confirm" message="Are you sure?">
        Delete
      </ConfirmationLink>,
    );

    const link = screen.getByText("Delete");
    act(() => {
      fireEvent.click(link);
    });

    expect(screen.getByTestId("mock-dialog")).toBeDefined();
    expect(screen.getByTestId("dialog-title").textContent).toBe("Confirm");
    expect(screen.getByTestId("dialog-message").textContent).toBe(
      "Are you sure?",
    );
  });

  it("passes destructive type to dialog when destructive prop is true", () => {
    render(
      <ConfirmationLink url="/delete" destructive>
        Delete
      </ConfirmationLink>,
    );

    act(() => {
      fireEvent.click(screen.getByText("Delete"));
    });

    expect(screen.getByTestId("dialog-type").textContent).toBe("destructive");
  });

  it("passes default type when destructive is false", () => {
    render(<ConfirmationLink url="/action">Action</ConfirmationLink>);

    act(() => {
      fireEvent.click(screen.getByText("Action"));
    });

    expect(screen.getByTestId("dialog-type").textContent).toBe("default");
  });

  it("creates and submits POST form with crumb on confirm", () => {
    render(
      <ConfirmationLink url="/delete-item" post>
        Delete
      </ConfirmationLink>,
    );

    act(() => {
      fireEvent.click(screen.getByText("Delete"));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("dialog-confirm"));
    });

    const form = document.body.querySelector("form") as HTMLFormElement;
    expect(form).not.toBeNull();
    expect(form.getAttribute("method")).toBe("POST");
    expect(form.getAttribute("action")).toBe("/delete-item");
    const crumbInput = form.querySelector(
      'input[name="Jenkins-Crumb"]',
    ) as HTMLInputElement;
    expect(crumbInput).not.toBeNull();
    expect(crumbInput.value).toBe("test-crumb-token");
    expect(HTMLFormElement.prototype.submit).toHaveBeenCalled();
  });

  it("creates GET form without crumb on confirm when post is false", () => {
    render(<ConfirmationLink url="/navigate-away">Go</ConfirmationLink>);

    act(() => {
      fireEvent.click(screen.getByText("Go"));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("dialog-confirm"));
    });

    const form = document.body.querySelector("form") as HTMLFormElement;
    expect(form).not.toBeNull();
    expect(form.getAttribute("method")).toBe("GET");
    expect(form.querySelector('input[name="Jenkins-Crumb"]')).toBeNull();
  });

  it("dismisses dialog on cancel without form submission", () => {
    render(
      <ConfirmationLink url="/delete" post>
        Delete
      </ConfirmationLink>,
    );

    act(() => {
      fireEvent.click(screen.getByText("Delete"));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("dialog-cancel"));
    });

    // Dialog should be gone, no form submitted
    expect(screen.queryByTestId("mock-dialog")).toBeNull();
    expect(HTMLFormElement.prototype.submit).not.toHaveBeenCalled();
  });

  it("sets data attributes on the anchor for backward compatibility", () => {
    const { container } = render(
      <ConfirmationLink url="/test" post message="msg" title="ttl" destructive>
        Link
      </ConfirmationLink>,
    );

    const link = container.querySelector("a")!;
    expect(link.dataset.url).toBe("/test");
    expect(link.dataset.post).toBe("true");
    expect(link.dataset.message).toBe("msg");
    expect(link.dataset.title).toBe("ttl");
    expect(link.dataset.destructive).toBe("true");
  });

  it("omits data-post and data-destructive when props are false", () => {
    const { container } = render(
      <ConfirmationLink url="/test">Link</ConfirmationLink>,
    );
    const link = container.querySelector("a")!;
    expect(link.dataset.post).toBeUndefined();
    expect(link.dataset.destructive).toBeUndefined();
  });

  it("sets href to the provided url", () => {
    const { container } = render(
      <ConfirmationLink url="/target">Link</ConfirmationLink>,
    );
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/target");
  });
});
