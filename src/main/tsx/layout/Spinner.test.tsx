/**
 * Unit tests for layout/Spinner.tsx component.
 *
 * Validates DOM output matches the Jelly equivalent spinner.jelly:
 * a <p> with class "jenkins-spinner" and optional text content.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("renders a paragraph element with jenkins-spinner class", () => {
    const { container } = render(<Spinner />);
    const p = container.querySelector("p.jenkins-spinner");
    expect(p).not.toBeNull();
  });

  it("renders with provided text", () => {
    render(<Spinner text="Loading…" />);
    expect(screen.getByText("Loading…")).toBeDefined();
  });

  it("renders empty paragraph when no text is provided", () => {
    const { container } = render(<Spinner />);
    const p = container.querySelector("p.jenkins-spinner");
    expect(p?.textContent).toBe("");
  });

  it("applies text correctly as child content", () => {
    const { container } = render(<Spinner text="Please wait" />);
    const p = container.querySelector("p.jenkins-spinner");
    expect(p?.textContent).toBe("Please wait");
  });
});
