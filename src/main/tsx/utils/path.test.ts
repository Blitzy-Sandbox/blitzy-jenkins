/**
 * Unit tests for utils/path.ts — combinePath function.
 *
 * Validates URL path combination logic including query parameter preservation,
 * hash fragment stripping, and trailing slash handling. Matches behavior of
 * the original src/main/js/util/path.js implementation.
 */

import { describe, it, expect } from "vitest";
import { combinePath } from "./path";

describe("combinePath", () => {
  it("combines two simple path segments with a separator", () => {
    expect(combinePath("/jenkins/job", "configure")).toBe(
      "/jenkins/job/configure",
    );
  });

  it("handles base path with trailing slash", () => {
    expect(combinePath("/jenkins/", "api")).toBe("/jenkins/api");
  });

  it("appends query parameters from pathOne to the combined path", () => {
    // The function extracts ?... but does NOT strip it from pathOne before
    // joining, so the query appears in both the original path segment and
    // at the end. This matches the original src/main/js/util/path.js behavior.
    expect(combinePath("/jenkins/?page=1", "api")).toBe(
      "/jenkins/?page=1/api?page=1",
    );
  });

  it("strips hash fragment from pathOne", () => {
    expect(combinePath("/jenkins/#hash", "api")).toBe("/jenkins/api");
  });

  it("handles path with both query params and hash", () => {
    // Hash is stripped from pathOne (pathOne becomes "/jenkins/?q=test"),
    // queryParams extracted as "?q=test#hash" (includes the hash since
    // extraction happens before hash stripping). Combined result:
    expect(combinePath("/jenkins/?q=test#hash", "build")).toBe(
      "/jenkins/?q=test/build?q=test#hash",
    );
  });

  it("handles empty base path", () => {
    expect(combinePath("", "api")).toBe("/api");
  });

  it("handles root base path", () => {
    expect(combinePath("/", "api")).toBe("/api");
  });

  it("combines paths without double slashes", () => {
    expect(combinePath("/jenkins/", "api")).toBe("/jenkins/api");
  });

  it("handles complex query strings", () => {
    // Same as single-param case: query is extracted but not stripped from pathOne
    expect(combinePath("/jenkins/?a=1&b=2", "configure")).toBe(
      "/jenkins/?a=1&b=2/configure?a=1&b=2",
    );
  });

  it("handles pathTwo with no leading slash", () => {
    expect(combinePath("/jenkins", "api/json")).toBe("/jenkins/api/json");
  });
});
