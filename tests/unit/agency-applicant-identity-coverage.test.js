// tests/unit/agency-applicant-identity-coverage.test.js
"use strict";

/**
 * THE GUARD design §4 asks for, in the shape of `agency-route-coverage.test.js`.
 *
 *   > A unit test in the shape of `tests/unit/agency-route-coverage.test.js` that
 *   > fails on any new direct `profiles` join inside an agency application read
 *   > path. Without it, the eighth site gets missed six months from now and one
 *   > organizer's export quietly omits half their pool.
 *
 * WHY A STATIC SCAN AND NOT A RUNTIME ASSERTION
 *
 * The failure this prevents is invisible at runtime: an INNER JOIN to `profiles`
 * on an application read path returns fewer rows and no error. A functional test
 * only catches it on the surfaces someone thought to write a fixture for, which
 * is exactly the "eighth site" the design is worried about. So the rule is
 * enforced on the source text: inside `src/domains/agency/{routes,services}`,
 * `.join("profiles"...)` is forbidden unless the site is in the allowlist below
 * with a stated reason.
 *
 * `.leftJoin("profiles"...)` is always allowed — it cannot drop a row.
 *
 * TO SATISFY THIS TEST, DO NOT ADD YOUR SITE TO THE ALLOWLIST BY REFLEX. The
 * allowlist is for surfaces that are profile-only *by design decision*, with the
 * decision written down at the site. Everything else uses
 * `services/applicant-identity.js` and a LEFT JOIN.
 */

const fs = require("fs");
const path = require("path");

const AGENCY_ROOT = path.resolve(__dirname, "../../src/domains/agency");
const SCAN_DIRS = ["routes", "services"];

/**
 * Sites that are deliberately profile-only. One line each, saying why.
 *
 * Empty today: every application read path in the agency domain now LEFT JOINs
 * `profiles`, including the two message surfaces — those exclude unclaimed
 * applicants EXPLICITLY, with `whereNotNull("a.profile_id")` and a comment,
 * rather than by join semantics, which is the distinction design §4 cares about.
 * A site added here must carry its reason both in this list and at the code.
 */
const ALLOWLIST = Object.freeze([
  // Example of the required shape (keep this comment, not a real entry):
  //   { file: "routes/foo.js", line: 123, reason: "…why a profile is required…" },
]);

/**
 * Matches an INNER join onto the `profiles` table in either quote style, with or
 * without an alias — `.join("profiles"`, `.join('profiles as p'`,
 * `.innerJoin("profiles"`.
 */
const INNER_JOIN_PROFILES = /\.(?:inner)?[Jj]oin\(\s*(['"])profiles(?:\s+as\s+[A-Za-z_][\w]*)?\1/g;

function listJsFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function findOffences() {
  const offences = [];
  for (const relDir of SCAN_DIRS) {
    const dir = path.join(AGENCY_ROOT, relDir);
    if (!fs.existsSync(dir)) continue;
    for (const file of listJsFiles(dir)) {
      const source = fs.readFileSync(file, "utf8");
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        INNER_JOIN_PROFILES.lastIndex = 0;
        if (!INNER_JOIN_PROFILES.test(line)) return;
        offences.push({
          file: path.relative(AGENCY_ROOT, file).split(path.sep).join("/"),
          line: index + 1,
          text: line.trim(),
        });
      });
    }
  }
  return offences;
}

function isAllowlisted(offence) {
  return ALLOWLIST.some(
    (entry) => entry.file === offence.file && entry.line === offence.line,
  );
}

describe("agency application read paths include unclaimed applicants", () => {
  test("the scanner actually reads the agency domain", () => {
    // Guard against a silent walker failure making this suite vacuously pass —
    // the same guard `agency-route-coverage.test.js` puts on its stack walk.
    let scanned = 0;
    for (const relDir of SCAN_DIRS) {
      const dir = path.join(AGENCY_ROOT, relDir);
      if (fs.existsSync(dir)) scanned += listJsFiles(dir).length;
    }
    expect(scanned).toBeGreaterThan(20);
  });

  test("no agency route or service INNER JOINs `profiles`", () => {
    const offences = findOffences().filter((o) => !isAllowlisted(o));

    const message = offences
      .map((o) => `  ${o.file}:${o.line}\n      ${o.text}`)
      .join("\n");

    if (offences.length > 0) {
      throw new Error(
        [
          "An agency read path INNER JOINs `profiles`, which silently drops every",
          "unclaimed open-call applicant — an `applications` row with",
          "`applicant_identity_id` and no `profile_id` (design",
          "docs/open-call-applicant-flow-design-2026-08.md §4, §6 requirement 1).",
          "The row simply does not come back; nothing errors; an organizer's export",
          "quietly omits half their pool.",
          "",
          "FIX: change the join to `.leftJoin(\"profiles\", …)` and source the",
          "applicant's name, email, phone, city, height and images through",
          "`src/domains/agency/services/applicant-identity.js`",
          "(`resolveApplicantIdentities` for a page, `resolveApplicantIdentity` for",
          "one row).",
          "",
          "If the surface genuinely requires a live profile — it messages a `users`",
          "row, or links to a portfolio page — then say so EXPLICITLY: LEFT JOIN,",
          "add `whereNotNull(\"<alias>.profile_id\")`, write the reason in a comment",
          "at the site, and add the site to ALLOWLIST in this test file with the",
          "same reason. Never rely on join semantics to make that decision.",
          "",
          "Offending sites:",
          message,
        ].join("\n"),
      );
    }

    expect(offences).toEqual([]);
  });

  test("the allowlist stays honest", () => {
    // Every allowlist entry must still describe a real line, or it is stale
    // cover for a site that has since moved.
    const offences = findOffences();
    for (const entry of ALLOWLIST) {
      const match = offences.find(
        (o) => o.file === entry.file && o.line === entry.line,
      );
      expect(match).toBeDefined();
      expect(typeof entry.reason).toBe("string");
      expect(entry.reason.length).toBeGreaterThan(10);
    }
  });

  test("the resolver is what the design says it is", () => {
    const resolver = require("../../src/domains/agency/services/applicant-identity");
    expect(typeof resolver.resolveApplicantIdentities).toBe("function");
    expect(typeof resolver.resolveApplicantIdentity).toBe("function");
    // The plain-text materials vocabulary (design §6) — words, never badges.
    expect(Object.values(resolver.MATERIALS_STATUS).sort()).toEqual([
      "fulfilled",
      "none",
      "overdue",
      "requested",
    ]);
  });
});
