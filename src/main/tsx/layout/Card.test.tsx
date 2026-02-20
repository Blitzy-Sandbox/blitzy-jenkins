/**
 * Unit tests for layout/Card.tsx component.
 *
 * Validates the Card renders the correct DOM structure matching
 * core/src/main/resources/lib/layout/card.jelly output.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card", () => {
  it("renders with jenkins-card CSS class", () => {
    const { container } = render(
      <Card title="Test Card">Body content</Card>,
    );
    expect(container.querySelector(".jenkins-card")).not.toBeNull();
  });

  it("renders the title text", () => {
    render(<Card title="My Card Title">Content</Card>);
    expect(screen.getByText("My Card Title")).toBeDefined();
  });

  it("renders children in the content area", () => {
    render(
      <Card title="Title">
        <p>Child content</p>
      </Card>,
    );
    expect(screen.getByText("Child content")).toBeDefined();
  });

  it("applies the id attribute when provided", () => {
    const { container } = render(
      <Card title="Title" id="my-card">
        Content
      </Card>,
    );
    expect(container.querySelector("#my-card")).not.toBeNull();
  });

  it("renders title as plain text when expandable is not provided", () => {
    const { container } = render(<Card title="Plain">Content</Card>);
    const titleDiv = container.querySelector(".jenkins-card__title");
    // No anchor element when expandable is not set
    expect(titleDiv?.querySelector("a")).toBeNull();
    expect(titleDiv?.textContent).toContain("Plain");
  });

  it("renders title as a link when expandable URL is provided", () => {
    const { container } = render(
      <Card title="Expandable" expandable="/details">
        Content
      </Card>,
    );
    const link = container.querySelector("a.jenkins-card__title-link");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/details");
    expect(link?.textContent).toContain("Expandable");
  });

  it("renders a chevron SVG icon when expandable", () => {
    const { container } = render(
      <Card title="Expandable" expandable="/details">
        Content
      </Card>,
    );
    const svg = container.querySelector("a svg.svg-icon");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders controls in the controls area", () => {
    const { container } = render(
      <Card
        title="Title"
        controls={<button type="button">Action</button>}
      >
        Content
      </Card>,
    );
    const controlsDiv = container.querySelector(".jenkins-card__controls");
    expect(controlsDiv?.querySelector("button")).not.toBeNull();
    expect(screen.getByText("Action")).toBeDefined();
  });

  it("renders content in jenkins-card__content div", () => {
    const { container } = render(
      <Card title="Title">
        <span data-testid="content-marker">Test</span>
      </Card>,
    );
    const contentDiv = container.querySelector(".jenkins-card__content");
    expect(contentDiv?.querySelector("[data-testid='content-marker']")).not.toBeNull();
  });
});
