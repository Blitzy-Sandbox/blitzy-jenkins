/**
 * Unit tests for layout/Skeleton.tsx component.
 *
 * Validates DOM structure for all three skeleton variants:
 * - side-panel: 5 div children in .jenkins-side-panel-skeleton
 * - form: 10 span/div pairs in .jenkins-form-skeleton-2
 * - default: 10 span/div pairs in .jenkins-form-skeleton
 *
 * Element counts are critical — CSS nth-child selectors depend on them.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  describe('type="side-panel"', () => {
    it("renders with the jenkins-side-panel-skeleton CSS class", () => {
      const { container } = render(<Skeleton type="side-panel" />);
      const root = container.querySelector(".jenkins-side-panel-skeleton");
      expect(root).not.toBeNull();
    });

    it("renders exactly 5 div children", () => {
      const { container } = render(<Skeleton type="side-panel" />);
      const root = container.querySelector(".jenkins-side-panel-skeleton")!;
      expect(root.children.length).toBe(5);
      for (const child of Array.from(root.children)) {
        expect(child.tagName).toBe("DIV");
      }
    });
  });

  describe('type="form"', () => {
    it("renders with the jenkins-form-skeleton-2 CSS class", () => {
      const { container } = render(<Skeleton type="form" />);
      const root = container.querySelector(".jenkins-form-skeleton-2");
      expect(root).not.toBeNull();
    });

    it("renders 20 elements (10 span/div pairs)", () => {
      const { container } = render(<Skeleton type="form" />);
      const root = container.querySelector(".jenkins-form-skeleton-2")!;
      expect(root.children.length).toBe(20);
    });

    it("alternates between span and div elements", () => {
      const { container } = render(<Skeleton type="form" />);
      const root = container.querySelector(".jenkins-form-skeleton-2")!;
      for (let i = 0; i < root.children.length; i++) {
        const expected = i % 2 === 0 ? "SPAN" : "DIV";
        expect(root.children[i].tagName).toBe(expected);
      }
    });
  });

  describe("default (no type)", () => {
    it("renders with the jenkins-form-skeleton CSS class", () => {
      const { container } = render(<Skeleton />);
      const root = container.querySelector(".jenkins-form-skeleton");
      expect(root).not.toBeNull();
    });

    it("renders 20 elements (10 span/div pairs)", () => {
      const { container } = render(<Skeleton />);
      const root = container.querySelector(".jenkins-form-skeleton")!;
      expect(root.children.length).toBe(20);
    });

    it("alternates between span and div elements", () => {
      const { container } = render(<Skeleton />);
      const root = container.querySelector(".jenkins-form-skeleton")!;
      for (let i = 0; i < root.children.length; i++) {
        const expected = i % 2 === 0 ? "SPAN" : "DIV";
        expect(root.children[i].tagName).toBe(expected);
      }
    });
  });
});
