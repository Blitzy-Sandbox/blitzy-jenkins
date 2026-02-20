/**
 * Unit tests for utils/dom.ts — createElementFromHtml and toId functions.
 *
 * Tests run in a jsdom environment provided by Vitest. The jsdom DOM
 * implementation supports createElement("template") and innerHTML parsing.
 */

import { describe, it, expect } from "vitest";
import { createElementFromHtml, toId } from "./dom";

describe("createElementFromHtml", () => {
  it("creates a div from simple HTML", () => {
    const el = createElementFromHtml("<div>Hello</div>");
    expect(el.tagName).toBe("DIV");
    expect(el.textContent).toBe("Hello");
  });

  it("creates a span from inline HTML", () => {
    const el = createElementFromHtml("<span class='test'>Content</span>");
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toBe("test");
    expect(el.textContent).toBe("Content");
  });

  it("creates an element with attributes", () => {
    const el = createElementFromHtml(
      '<a href="/jenkins" data-id="123">Link</a>',
    );
    expect(el.tagName).toBe("A");
    expect(el.getAttribute("href")).toBe("/jenkins");
    expect(el.getAttribute("data-id")).toBe("123");
  });

  it("creates a nested element and returns the outer element", () => {
    const el = createElementFromHtml(
      "<div><span>Nested</span><p>Text</p></div>",
    );
    expect(el.tagName).toBe("DIV");
    expect(el.children.length).toBe(2);
    expect(el.children[0].tagName).toBe("SPAN");
    expect(el.children[1].tagName).toBe("P");
  });

  it("trims whitespace before parsing", () => {
    const el = createElementFromHtml("   <div>Trimmed</div>   ");
    expect(el.tagName).toBe("DIV");
    expect(el.textContent).toBe("Trimmed");
  });

  it("creates a button element", () => {
    const el = createElementFromHtml(
      '<button type="submit" disabled>Submit</button>',
    );
    expect(el.tagName).toBe("BUTTON");
    expect(el.getAttribute("type")).toBe("submit");
    expect((el as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("toId", () => {
  it('converts "Hello" to hyphen-delimited hex codes', () => {
    // H=48, e=65, l=6c, l=6c, o=6f
    expect(toId("Hello")).toBe("48-65-6c-6c-6f");
  });

  it("converts single character correctly", () => {
    // A=41
    expect(toId("A")).toBe("41");
  });

  it("handles numbers in strings", () => {
    // 1=31, 2=32, 3=33
    expect(toId("123")).toBe("31-32-33");
  });

  it("handles mixed alphanumeric strings", () => {
    // a=61, 1=31
    expect(toId("a1")).toBe("61-31");
  });

  it("trims leading and trailing whitespace before conversion", () => {
    // After trim: "AB" → A=41, B=42
    expect(toId("  AB  ")).toBe("41-42");
  });

  it("handles special characters", () => {
    // /=2f, .=2e
    expect(toId("/.")).toBe("2f-2e");
  });

  it("handles empty string after trim", () => {
    expect(toId("")).toBe("");
  });

  it("handles spaces within string (spaces are 20)", () => {
    // a=61, space=20, b=62
    expect(toId("a b")).toBe("61-20-62");
  });
});
