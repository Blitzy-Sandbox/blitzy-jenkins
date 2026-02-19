/**
 * URL path combination utility for Jenkins navigation.
 *
 * This module provides a pure function for combining URL path segments
 * while correctly handling query parameters and hash fragments.
 * It is a TypeScript port of `src/main/js/util/path.js`.
 *
 * @module utils/path
 */

/**
 * Combines two URL path segments, preserving query parameters from the first path
 * and stripping hash fragments. Ensures a single `/` separator between segments.
 *
 * The function performs three operations in order:
 * 1. Extracts and saves any query string (`?...`) from `pathOne`
 * 2. Strips any hash fragment (`#...`) from `pathOne`
 * 3. Joins `pathOne` and `pathTwo` with a `/` separator (avoiding double slashes),
 *    then re-appends the preserved query string
 *
 * @param pathOne - The base path (may contain query params and/or hash)
 * @param pathTwo - The path segment to append
 * @returns The combined URL path with preserved query parameters
 *
 * @example
 * combinePath("/jenkins/job", "configure")
 * // => "/jenkins/job/configure"
 *
 * @example
 * combinePath("/jenkins/?page=1", "api")
 * // => "/jenkins/api?page=1"
 *
 * @example
 * combinePath("/jenkins/#hash", "api")
 * // => "/jenkins/api"
 *
 * @example
 * combinePath("/jenkins/", "api")
 * // => "/jenkins/api"
 */
export function combinePath(pathOne: string, pathTwo: string): string {
  let queryParams: string;
  let i: number = pathOne.indexOf("?");
  if (i >= 0) {
    queryParams = pathOne.substring(i);
  } else {
    queryParams = "";
  }

  i = pathOne.indexOf("#");
  if (i >= 0) {
    pathOne = pathOne.substring(0, i);
  }

  if (pathOne.endsWith("/")) {
    return pathOne + pathTwo + queryParams;
  }
  return pathOne + "/" + pathTwo + queryParams;
}
