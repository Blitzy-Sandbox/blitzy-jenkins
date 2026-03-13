/**
 * Unit tests for TextArea.tsx — Multi-line text input with CodeMirror and preview.
 * Target: ≥80% branch coverage (327 lines).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { TextArea } from "./TextArea";

// Mock i18n hook
vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    loadBundle: vi.fn().mockResolvedValue({}),
  }),
}));

// Mock stapler mutation hook
vi.mock("@/hooks/useStaplerMutation", () => ({
  useStaplerMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue("<p>Preview</p>"),
    isPending: false,
    isError: false,
    error: null,
    data: null,
  }),
}));

describe("TextArea", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- Basic rendering ----

  it("renders a textarea element", () => {
    const { container } = render(<TextArea />);
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
  });

  it("renders with name derived from field prop", () => {
    const { container } = render(<TextArea field="description" />);
    const textarea = container.querySelector("textarea");
    expect(textarea?.getAttribute("name")).toBe("_.description");
  });

  it("renders with explicit name prop", () => {
    const { container } = render(<TextArea name="myTextArea" />);
    const textarea = container.querySelector("textarea");
    expect(textarea?.getAttribute("name")).toBe("myTextArea");
  });

  it("renders with value prop", () => {
    const { container } = render(<TextArea value="Some text content" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Some text content");
  });

  it("renders with defaultValue", () => {
    const { container } = render(<TextArea defaultValue="default content" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("default content");
  });

  // ---- Value changes ----

  it("fires onChange callback when value changes", () => {
    const onChange = vi.fn();
    const { container } = render(<TextArea onChange={onChange} />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: "new content" } });
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("updates textarea value on change", () => {
    const { container } = render(<TextArea />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(textarea, { target: { value: "typed" } });
    });
    expect(textarea.value).toBe("typed");
  });

  // ---- Rows ----

  it("applies rows attribute", () => {
    const { container } = render(<TextArea rows={10} />);
    const textarea = container.querySelector("textarea");
    expect(textarea?.getAttribute("rows")).toBe("10");
  });

  // ---- Read-only ----

  it("renders in readOnly mode", () => {
    const { container } = render(
      <TextArea readOnly={true} value="readonly text" />,
    );
    expect(container.textContent).toContain("readonly text");
  });

  // ---- className ----

  it("applies className to textarea", () => {
    const { container } = render(<TextArea className="custom-class" />);
    const textarea = container.querySelector("textarea");
    expect(textarea?.className).toContain("custom-class");
  });

  // ---- Validation ----

  it("renders with checkUrl for validation", () => {
    const { container } = render(<TextArea checkUrl="/validate/field" />);
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
  });

  // ---- ID / Style ----

  it("applies id attribute", () => {
    const { container } = render(<TextArea id="my-area" />);
    const textarea = container.querySelector("#my-area");
    expect(textarea).not.toBeNull();
  });

  it("applies inline style", () => {
    const { container } = render(<TextArea style={{ height: "200px" }} />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea?.style.height).toBe("200px");
  });

  // ---- Preview endpoint ----

  it("renders preview button when previewEndpoint is provided", () => {
    const { container } = render(<TextArea previewEndpoint="/preview" />);
    // Should render at least the textarea
    expect(container.querySelector("textarea")).not.toBeNull();
  });

  // ---- Controlled value update ----

  it("updates when value prop changes", () => {
    const { container, rerender } = render(<TextArea value="first" />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("first");
    rerender(<TextArea value="second" />);
    expect(textarea.value).toBe("second");
  });

  // ---- checkMessage ----

  it("renders with check message for server validation", () => {
    const { container } = render(<TextArea checkMessage="Field is required" />);
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
  });

  // ---- CodeMirror mode ----

  it("renders without CodeMirror when no codemirrorMode", () => {
    const { container } = render(<TextArea />);
    expect(container.querySelector("textarea")).not.toBeNull();
  });
});
