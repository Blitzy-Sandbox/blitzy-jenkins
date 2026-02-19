/**
 * XML/HTML character escaping utility for XSS prevention.
 *
 * This module provides the authoritative sanitizer for markup insertion
 * in the Jenkins UI. All user-supplied content that will be inserted into
 * HTML or XML contexts MUST be passed through {@link xmlEscape} first.
 *
 * Direct TypeScript port of `src/main/js/util/security.js` — the escape
 * logic, regex pattern, and entity mappings are identical to the original.
 *
 * @module utils/security
 */

/**
 * Escapes XML/HTML special characters to prevent XSS injection.
 * Replaces `<`, `>`, `&`, `'`, `"` with their named XML entity equivalents
 * using a single regex pass over the input string.
 *
 * This is the authoritative sanitizer for markup insertion in the Jenkins UI.
 *
 * @param str - The input string to escape
 * @returns The escaped string with XML entities substituted
 *
 * @example
 * xmlEscape('<script>alert("xss")</script>')
 * // → '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 *
 * @example
 * xmlEscape("it's a <test> & \"demo\"")
 * // → 'it&apos;s a &lt;test&gt; &amp; &quot;demo&quot;'
 *
 * @example
 * xmlEscape('no special chars')
 * // → 'no special chars'
 *
 * @example
 * xmlEscape('')
 * // → ''
 */
export function xmlEscape(str: string): string {
  return str.replace(/[<>&'"]/g, (match: string): string => {
    switch (match) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return match;
    }
  });
}
