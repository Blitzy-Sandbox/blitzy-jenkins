/**
 * DOM utility functions for creating elements from HTML strings
 * and converting strings to hex-encoded DOM identifiers.
 *
 * This is a direct TypeScript port of src/main/js/util/dom.js.
 * Logic is identical to the source — only TypeScript type annotations are added.
 */

/**
 * Creates a DOM element from an HTML string using a <template> element.
 * The template approach safely parses HTML without executing scripts.
 *
 * @param html - The HTML string to parse into a DOM element
 * @returns The first child element of the parsed HTML
 */
export function createElementFromHtml(html: string): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild as HTMLElement;
}

/**
 * Converts a string to a hex-encoded ID suitable for DOM identifiers.
 * Each character is converted to its Unicode code point hex representation,
 * with characters separated by hyphens.
 *
 * @param str - The input string to convert
 * @returns A hyphen-delimited hex string (e.g., "Hello" → "48-65-6c-6c-6f")
 */
export function toId(str: string): string {
  const trimmed = str.trim();
  return Array.from(trimmed)
    .map((c) => (c.codePointAt(0) as number).toString(16))
    .join("-");
}
