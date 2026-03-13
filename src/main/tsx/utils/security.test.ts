/**
 * Unit tests for utils/security.ts — xmlEscape function.
 *
 * Validates that all XML/HTML special characters are correctly escaped
 * to their named entity equivalents, matching the behavior of the
 * original src/main/js/util/security.js implementation.
 */

import { describe, it, expect } from "vitest";
import { xmlEscape } from "./security";

describe("xmlEscape", () => {
  it("escapes less-than characters", () => {
    expect(xmlEscape("<div>")).toBe("&lt;div&gt;");
  });

  it("escapes greater-than characters", () => {
    expect(xmlEscape("a > b")).toBe("a &gt; b");
  });

  it("escapes ampersand characters", () => {
    expect(xmlEscape("a & b")).toBe("a &amp; b");
  });

  it("escapes single quote characters", () => {
    expect(xmlEscape("it's")).toBe("it&apos;s");
  });

  it("escapes double quote characters", () => {
    expect(xmlEscape('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes all special characters in a single string", () => {
    expect(xmlEscape('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("escapes mixed special characters", () => {
    expect(xmlEscape('it\'s a <test> & "demo"')).toBe(
      "it&apos;s a &lt;test&gt; &amp; &quot;demo&quot;",
    );
  });

  it("returns the same string when no special characters present", () => {
    expect(xmlEscape("no special chars")).toBe("no special chars");
  });

  it("handles empty string", () => {
    expect(xmlEscape("")).toBe("");
  });

  it("handles string with only special characters", () => {
    expect(xmlEscape("<>&'\"")).toBe("&lt;&gt;&amp;&apos;&quot;");
  });

  it("handles multiple consecutive special characters", () => {
    expect(xmlEscape("<<>>")).toBe("&lt;&lt;&gt;&gt;");
  });

  it("preserves whitespace and non-special characters", () => {
    expect(xmlEscape("  hello  world  ")).toBe("  hello  world  ");
  });

  it("handles unicode characters alongside special chars", () => {
    expect(xmlEscape("日本語 & <test>")).toBe("日本語 &amp; &lt;test&gt;");
  });
});
