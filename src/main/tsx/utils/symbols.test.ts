/**
 * Unit tests for utils/symbols.ts — SVG icon string constants.
 *
 * Validates that all exported SVG constants are well-formed SVG strings
 * containing the expected structural elements.
 */

import { describe, it, expect } from "vitest";
import {
  INFO,
  SUCCESS,
  WARNING,
  ERROR,
  CLOSE,
  CHEVRON_DOWN,
  FUNNEL,
} from "./symbols";

describe("symbols", () => {
  const allSymbols: Record<string, string> = {
    INFO,
    SUCCESS,
    WARNING,
    ERROR,
    CLOSE,
    CHEVRON_DOWN,
    FUNNEL,
  };

  Object.entries(allSymbols).forEach(([name, svg]) => {
    describe(name, () => {
      it("is a non-empty string", () => {
        expect(typeof svg).toBe("string");
        expect(svg.length).toBeGreaterThan(0);
      });

      it("starts with an <svg opening tag", () => {
        expect(svg.startsWith("<svg")).toBe(true);
      });

      it("ends with a </svg> closing tag", () => {
        expect(svg.endsWith("</svg>")).toBe(true);
      });

      it("includes the xmlns attribute", () => {
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      });

      it("includes a viewBox attribute", () => {
        expect(svg).toContain("viewBox=");
      });

      it("uses currentColor for dynamic color theming", () => {
        expect(svg).toContain("currentColor");
      });
    });
  });
});
