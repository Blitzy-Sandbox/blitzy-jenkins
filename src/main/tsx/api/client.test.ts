/**
 * Unit tests for api/client.ts — Base HTTP Client.
 *
 * Tests the pure utility functions (getBaseUrl, getCrumb, ApiError)
 * that form the foundation of the Stapler REST API layer. These are
 * testable without mocking fetch since they read from DOM/window state.
 *
 * jenkinsGet/jenkinsPost/staplerPost are integration-level functions
 * that require fetch mocking — tested here with basic fetch mock scenarios.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { getBaseUrl, getCrumb, ApiError, jenkinsGet } from "./client";

describe("ApiError", () => {
  it("creates an error with name 'ApiError'", () => {
    const error = new ApiError("Not Found", 404, "Not Found");
    expect(error.name).toBe("ApiError");
  });

  it("stores status and statusText", () => {
    const error = new ApiError("Forbidden", 403, "Forbidden");
    expect(error.status).toBe(403);
    expect(error.statusText).toBe("Forbidden");
  });

  it("extends Error and has a message", () => {
    const error = new ApiError("Server Error", 500, "Internal Server Error");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Server Error");
  });

  it("has a proper stack trace", () => {
    const error = new ApiError("err", 400, "Bad Request");
    expect(error.stack).toBeDefined();
  });
});

describe("getBaseUrl", () => {
  afterEach(() => {
    delete document.head.dataset.rooturl;
  });

  it("returns data-rooturl value when set", () => {
    document.head.dataset.rooturl = "/jenkins";
    expect(getBaseUrl()).toBe("/jenkins");
  });

  it("returns empty string when data-rooturl is not set", () => {
    delete document.head.dataset.rooturl;
    expect(getBaseUrl()).toBe("");
  });
});

describe("getCrumb", () => {
  const originalCrumb = window.crumb;

  afterEach(() => {
    // Restore original window.crumb
    if (originalCrumb === undefined) {
      delete (window as Record<string, unknown>).crumb;
    } else {
      window.crumb = originalCrumb;
    }
  });

  it("returns crumb data when window.crumb is properly set", () => {
    window.crumb = {
      fieldName: "Jenkins-Crumb",
      value: "abc123token",
      init: vi.fn(),
    };
    const result = getCrumb();
    expect(result).toEqual({
      fieldName: "Jenkins-Crumb",
      value: "abc123token",
    });
  });

  it("returns null when window.crumb is undefined", () => {
    delete (window as Record<string, unknown>).crumb;
    expect(getCrumb()).toBeNull();
  });

  it("returns null when window.crumb has empty fieldName", () => {
    window.crumb = {
      fieldName: "",
      value: "token",
      init: vi.fn(),
    };
    expect(getCrumb()).toBeNull();
  });

  it("returns null when window.crumb has empty value", () => {
    window.crumb = {
      fieldName: "Jenkins-Crumb",
      value: "",
      init: vi.fn(),
    };
    expect(getCrumb()).toBeNull();
  });
});

describe("jenkinsGet", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    document.head.dataset.rooturl = "/jenkins";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete document.head.dataset.rooturl;
  });

  it("sends a GET request to baseUrl + path", async () => {
    const mockResponse = { name: "test-job" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);

    const result = await jenkinsGet<{ name: string }>("/api/json");
    expect(result).toEqual(mockResponse);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/jenkins/api/json",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws ApiError on non-OK response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as unknown as Response);

    await expect(jenkinsGet("/not-found")).rejects.toThrow(ApiError);
  });
});
