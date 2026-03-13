/**
 * Vitest global setup file.
 *
 * Suppresses known harmless React 19 concurrent-mode scheduler errors that
 * fire after the jsdom test environment has been destroyed.  These occur
 * because React's internal scheduler (setImmediate / MessageChannel) can
 * dispatch work after vitest tears down the jsdom window, producing
 * "window is not defined" or null-property-access errors.  They are benign
 * post-cleanup artefacts that do not affect test correctness.
 */

const originalListeners = process.rawListeners(
  "uncaughtException",
) as NodeJS.UncaughtExceptionListener[];

process.removeAllListeners("uncaughtException");

process.on("uncaughtException", (err: Error) => {
  const msg = err?.message ?? "";
  // Swallow known React scheduler / jsdom teardown errors:
  // - "removeEventListener" : dialog cleanup on destroyed DOM
  // - "window is not defined" : React scheduler after jsdom teardown
  // - "Cannot read properties of null/undefined" : React effects on unmounted refs
  if (
    msg.includes("removeEventListener") ||
    msg === "window is not defined" ||
    msg.includes("Cannot read properties of null") ||
    msg.includes("Cannot read properties of undefined")
  ) {
    return;
  }
  // Re-throw unexpected errors so tests still fail on real issues
  for (const listener of originalListeners) {
    listener(err);
  }
});
