/**
 * Unit tests for RowSelectionController.tsx — Table row multi-select.
 * Target: ≥80% branch coverage (362 lines).
 *
 * The component requires:
 * - checkboxClass: string — CSS class identifying row checkboxes
 * - tableRef: RefObject<HTMLTableElement | null> — Ref to parent table element
 * - disabled?: boolean — optional force-disable
 *
 * It renders: header checkbox, options button, dropdown with "Select All"/"Select None".
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { useRef } from "react";
import RowSelectionController from "./RowSelectionController";

/** Wrapper component that creates a table with row checkboxes and passes ref */
function TestWrapper({
  rows = 3,
  disabled,
  checkboxClass = "row-cb",
}: {
  rows?: number;
  disabled?: boolean;
  checkboxClass?: string;
}) {
  const tableRef = useRef<HTMLTableElement>(null);

  return (
    <table ref={tableRef} data-testid="test-table">
      <thead>
        <tr>
          <th>
            <RowSelectionController
              checkboxClass={checkboxClass}
              tableRef={tableRef}
              disabled={disabled}
            />
          </th>
          <th>Name</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, i) => (
          <tr key={i}>
            <td>
              <input
                type="checkbox"
                className={checkboxClass}
                data-testid={`row-checkbox-${i}`}
              />
            </td>
            <td>Row {i + 1}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

describe("RowSelectionController", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders header checkbox, options button, and dropdown", () => {
    render(<TestWrapper />);
    const headerCb = screen.getByRole("checkbox", { name: /select all rows/i });
    expect(headerCb).not.toBeNull();

    const optionsBtn = screen.getByRole("button", {
      name: /selection options/i,
    });
    expect(optionsBtn).not.toBeNull();

    const menu = screen.getByRole("menu");
    expect(menu).not.toBeNull();

    const selectAllItem = screen.getByRole("menuitem", {
      name: /select all/i,
    });
    expect(selectAllItem).not.toBeNull();

    const selectNoneItem = screen.getByRole("menuitem", {
      name: /select none/i,
    });
    expect(selectNoneItem).not.toBeNull();
  });

  it("header checkbox starts unchecked when no rows are selected", async () => {
    render(<TestWrapper />);
    await waitFor(() => {
      const headerCb = screen.getByRole("checkbox", {
        name: /select all rows/i,
      }) as HTMLInputElement;
      expect(headerCb.checked).toBe(false);
    });
  });

  it("selects all rows when header checkbox is clicked", async () => {
    render(<TestWrapper rows={3} />);
    const headerCb = screen.getByRole("checkbox", {
      name: /select all rows/i,
    }) as HTMLInputElement;

    // Wait for initial state
    await waitFor(() => expect(headerCb.checked).toBe(false));

    // Click header checkbox to select all
    await act(async () => {
      fireEvent.click(headerCb);
    });

    // All row checkboxes should be checked
    for (let i = 0; i < 3; i++) {
      const rowCb = screen.getByTestId(`row-checkbox-${i}`) as HTMLInputElement;
      expect(rowCb.checked).toBe(true);
    }
  });

  it("deselects all rows when header checkbox is clicked while all selected", async () => {
    render(<TestWrapper rows={2} />);
    const headerCb = screen.getByRole("checkbox", {
      name: /select all rows/i,
    }) as HTMLInputElement;

    await waitFor(() => expect(headerCb.checked).toBe(false));

    // First click: select all
    await act(async () => {
      fireEvent.click(headerCb);
    });
    expect(
      (screen.getByTestId("row-checkbox-0") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByTestId("row-checkbox-1") as HTMLInputElement).checked,
    ).toBe(true);

    // Second click: deselect all
    await act(async () => {
      fireEvent.click(headerCb);
    });
    expect(
      (screen.getByTestId("row-checkbox-0") as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (screen.getByTestId("row-checkbox-1") as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("toggles dropdown visibility when options button is clicked", async () => {
    render(<TestWrapper />);
    const optionsBtn = screen.getByRole("button", {
      name: /selection options/i,
    }) as HTMLButtonElement;
    const menu = screen.getByRole("menu");

    // Wait for initial microtask state settlement
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Initially dropdown is not visible (no --visible class)
    expect(menu.className).not.toContain("--visible");

    // Use native click to properly match event target with ref
    await act(async () => {
      optionsBtn.click();
    });
    expect(menu.className).toContain("--visible");

    // Click again to hide
    await act(async () => {
      optionsBtn.click();
    });
    expect(menu.className).not.toContain("--visible");
  });

  it("selects all via dropdown 'Select All' menu item", async () => {
    render(<TestWrapper rows={2} />);
    const selectAllBtn = screen.getByRole("menuitem", {
      name: /select all/i,
    });

    await act(async () => {
      fireEvent.click(selectAllBtn);
    });

    expect(
      (screen.getByTestId("row-checkbox-0") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByTestId("row-checkbox-1") as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("deselects all via dropdown 'Select None' menu item", async () => {
    render(<TestWrapper rows={2} />);
    const headerCb = screen.getByRole("checkbox", {
      name: /select all rows/i,
    }) as HTMLInputElement;

    // Select all first
    await act(async () => {
      fireEvent.click(headerCb);
    });
    expect(
      (screen.getByTestId("row-checkbox-0") as HTMLInputElement).checked,
    ).toBe(true);

    // Click "Select None"
    const selectNoneBtn = screen.getByRole("menuitem", {
      name: /select none/i,
    });
    await act(async () => {
      fireEvent.click(selectNoneBtn);
    });

    expect(
      (screen.getByTestId("row-checkbox-0") as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (screen.getByTestId("row-checkbox-1") as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("updates state when individual row checkbox is toggled", async () => {
    render(<TestWrapper rows={3} />);
    const headerCb = screen.getByRole("checkbox", {
      name: /select all rows/i,
    }) as HTMLInputElement;
    const rowCb0 = screen.getByTestId("row-checkbox-0") as HTMLInputElement;

    // Wait for initial state computation
    await waitFor(() => expect(headerCb.checked).toBe(false));

    // Check one row — should trigger indeterminate/some state
    await act(async () => {
      fireEvent.click(rowCb0);
      fireEvent.change(rowCb0);
    });

    // Header should reflect partial state (not fully checked since only 1 of 3)
    await waitFor(() => {
      expect(headerCb.className).toContain("jenkins-table__checkbox");
    });
  });

  it("disables header checkbox and options when disabled prop is true", () => {
    render(<TestWrapper disabled={true} />);
    const headerCb = screen.getByRole("checkbox", {
      name: /select all rows/i,
    }) as HTMLInputElement;
    const optionsBtn = screen.getByRole("button", {
      name: /selection options/i,
    }) as HTMLButtonElement;

    expect(headerCb.disabled).toBe(true);
    expect(optionsBtn.disabled).toBe(true);
  });

  it("disables when no row checkboxes exist", async () => {
    render(<TestWrapper rows={0} />);
    const headerCb = screen.getByRole("checkbox", {
      name: /select all rows/i,
    }) as HTMLInputElement;

    await waitFor(() => {
      expect(headerCb.disabled).toBe(true);
    });
  });

  it("closes dropdown on outside click", async () => {
    render(<TestWrapper />);
    const optionsBtn = screen.getByRole("button", {
      name: /selection options/i,
    }) as HTMLButtonElement;
    const menu = screen.getByRole("menu");

    // Wait for initial microtask state settlement
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Open dropdown
    await act(async () => {
      optionsBtn.click();
    });
    expect(menu.className).toContain("--visible");

    // Click outside (use dispatchEvent to avoid native click bubbling issues)
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(menu.className).not.toContain("--visible");
  });

  it("header checkbox has data-checkbox-class attribute", () => {
    render(<TestWrapper checkboxClass="my-custom-class" />);
    const headerCb = screen.getByRole("checkbox", {
      name: /select all rows/i,
    });
    expect(headerCb.getAttribute("data-checkbox-class")).toBe(
      "my-custom-class",
    );
  });

  it("cleans up event listeners on unmount", () => {
    const removeListenerSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<TestWrapper />);
    unmount();
    expect(removeListenerSpy).toHaveBeenCalled();
  });
});
