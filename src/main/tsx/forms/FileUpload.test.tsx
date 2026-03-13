/**
 * Unit tests for FileUpload.tsx — File upload input with forwardRef.
 * Target: ≥80% branch coverage (87 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { createRef } from "react";
import { FileUpload } from "./FileUpload";

describe("FileUpload", () => {
  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  // ---- Basic rendering ----

  it("renders a file input element", () => {
    const { container } = render(<FileUpload />);
    const input = container.querySelector("input[type='file']");
    expect(input).not.toBeNull();
  });

  it("has jenkins-file-upload base class", () => {
    const { container } = render(<FileUpload />);
    const input = container.querySelector("input");
    expect(input?.className).toContain("jenkins-file-upload");
  });

  // ---- Name ----

  it("uses explicit name prop", () => {
    const { container } = render(<FileUpload name="myFile" />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("name")).toBe("myFile");
  });

  it("uses field prop as name when name not provided", () => {
    const { container } = render(<FileUpload field="configFile" />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("name")).toBe("configFile");
  });

  it("name prop takes priority over field", () => {
    const { container } = render(
      <FileUpload name="override" field="fallback" />,
    );
    const input = container.querySelector("input");
    expect(input?.getAttribute("name")).toBe("override");
  });

  // ---- className ----

  it("appends className to base class", () => {
    const { container } = render(<FileUpload className="extra" />);
    const input = container.querySelector("input");
    expect(input?.className).toBe("jenkins-file-upload extra");
  });

  it("has only base class when no className", () => {
    const { container } = render(<FileUpload />);
    const input = container.querySelector("input");
    expect(input?.className).toBe("jenkins-file-upload");
  });

  // ---- Accept ----

  it("applies accept attribute", () => {
    const { container } = render(<FileUpload accept=".pdf,.docx" />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("accept")).toBe(".pdf,.docx");
  });

  // ---- JSON aware ----

  it("sets data-json-aware attribute when jsonAware is true", () => {
    const { container } = render(<FileUpload jsonAware={true} />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("data-json-aware")).toBe("true");
  });

  it("does not set data-json-aware when jsonAware is not provided", () => {
    const { container } = render(<FileUpload />);
    const input = container.querySelector("input");
    expect(input?.hasAttribute("data-json-aware")).toBe(false);
  });

  // ---- onChange ----

  it("calls onChange when file is selected", () => {
    const onChange = vi.fn();
    const { container } = render(<FileUpload onChange={onChange} />);
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, {
        target: { files: [new File(["content"], "test.txt")] },
      });
    });
    expect(onChange).toHaveBeenCalled();
  });

  // ---- Ref forwarding ----

  it("forwards ref to input element", () => {
    const ref = createRef<HTMLInputElement>();
    render(<FileUpload ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.type).toBe("file");
  });
});
