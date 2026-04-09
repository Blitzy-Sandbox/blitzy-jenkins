/**
 * Unit tests for utils/baseUrl.ts — getBaseUrl function.
 *
 * Tests validate behaviour under various document.head.dataset.rooturl states.
 * Runs in Vitest jsdom environment.
 */

import { describe, it, expect, afterEach } from "vitest";
import { getBaseUrl } from "./baseUrl";

describe("getBaseUrl", () => {
  afterEach(() => {
    // Clean up data-rooturl after each test to avoid leaking state
    delete document.head.dataset.rooturl;
  });

  it('returns the value of data-rooturl when set to "/jenkins"', () => {
    document.head.dataset.rooturl = "/jenkins";
    expect(getBaseUrl()).toBe("/jenkins");
  });

  it("returns empty string when data-rooturl is not set", () => {
    // Ensure attribute is absent
    delete document.head.dataset.rooturl;
    expect(getBaseUrl()).toBe("");
  });

  it("returns empty string when data-rooturl is explicitly empty", () => {
    document.head.dataset.rooturl = "";
    expect(getBaseUrl()).toBe("");
  });

  it("returns nested context path", () => {
    document.head.dataset.rooturl = "/ci/jenkins";
    expect(getBaseUrl()).toBe("/ci/jenkins");
  });

  it("returns root context path", () => {
    document.head.dataset.rooturl = "/";
    expect(getBaseUrl()).toBe("/");
  });

  it("handles trailing slash in context path", () => {
    document.head.dataset.rooturl = "/jenkins/";
    expect(getBaseUrl()).toBe("/jenkins/");
  });
});
