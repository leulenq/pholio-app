"use strict";

/**
 * Work that must survive the response.
 *
 * Lambda freezes the container the moment the handler resolves, so an unawaited
 * promise still mid-await when `res.json` returns never finishes. On a
 * long-lived server the same code completes, which is why this was invisible
 * locally and in every test.
 *
 * The audit found ~35 of these. The ones pinned here are the ones where the
 * dropped work was the point of the request: the email telling a talent an
 * agency wants to sign them, the submission hand-off to the agency's own
 * system, and a compliance record about deleting a government ID.
 *
 * A source-level assertion rather than a runtime one, because reproducing a
 * Lambda freeze in Jest would test the mock rather than the code.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("agency decision emails are awaited", () => {
  test.each([
    ["src/domains/agency/routes/inbox.js", 2],
    ["src/domains/agency/routes/messages.js", 1],
  ])("%s has no fire-and-forget async IIFE", (file, expectedAwaited) => {
    const source = read(file);
    // Every `(async () => {` must be preceded by `await`.
    const bare = source.split("(async () => {").length - 1;
    const awaited = source.split("await (async () => {").length - 1;

    expect(awaited).toBe(expectedAwaited);
    expect(bare).toBe(awaited);
  });
});

describe("the submission export hand-off is awaited", () => {
  test("dispatchSubmission does not outlive the response", () => {
    const source = read("src/domains/talent/routes/applications.js");
    expect(source).toContain("await dispatchSubmission(");
    // A submission that never reaches the agency's system is the precise
    // failure the export feature exists to prevent.
    expect(source).not.toMatch(/\n\s{4}dispatchSubmission\(/);
  });
});

describe("a government ID is not recorded as redacted before it is", () => {
  const source = read("src/domains/talent/services/age-verification.js");

  test("the redaction call is awaited", () => {
    expect(source).toContain(
      "await stripe.identity.verificationSessions.redact(",
    );
  });

  test("no unawaited .then() rollback remains", () => {
    // The rollback used to live inside the dropped promise too, so a failure
    // left the row claiming a redaction that never happened.
    expect(source).not.toMatch(/verificationSessions\.redact\([^)]*\)\.then\(/);
  });

  test("the mark is written after the call, not before", () => {
    const callAt = source.indexOf("await stripe.identity.verificationSessions.redact(");
    const markAt = source.indexOf("redaction_requested_at: knex.fn.now()", callAt);
    expect(callAt).toBeGreaterThan(-1);
    expect(markAt).toBeGreaterThan(callAt);
  });
});
