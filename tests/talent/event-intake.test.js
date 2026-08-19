"use strict";

/**
 * Event intake: the consent fingerprint, and the gates that decide whether a
 * casting will accept a send at all.
 *
 * THE MOST IMPORTANT ASSERTION IN THIS FILE is the frozen hash. The submission
 * fingerprint binds an applicant's consent to the exact package they saw; the
 * server recomputes it at submit and refuses anything that does not match
 * (`consent_package_changed`). Event casting adds three keys to that hash, and
 * `canonicalJson` sorts keys and emits `null` for absent values — so if those
 * keys were added unconditionally, every representation package in existence
 * would hash to something new and every draft anyone had open would come back
 * demanding a fresh consent for a package that had not changed.
 *
 * The literals below were computed against the code as it stood BEFORE the
 * event keys existed. If a change to `canonicalSubmissionPackage` makes them
 * fail, that change breaks live drafts in production — it is not the test that
 * is wrong.
 *
 * The second assertion is parity: the browser mirror is compiled and run here,
 * not eyeballed. A divergence between the two would not be a cosmetic bug, it
 * would be a submit button that never works.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("esbuild");

const {
  buildSubmissionPackageFingerprint,
  canonicalSubmissionPackage,
} = require("../../src/domains/talent/services/submission-disclosure-consent");
const {
  EVENT_INTAKE_BLOCKER_CODES,
  evaluateEventIntake,
  validateSubmissionPackage,
} = require("../../src/domains/talent/services/validate-submission-package");

/** Compile the browser ESM mirror into something jest can require. */
function loadBrowserMirror() {
  const entry = path.resolve(
    __dirname,
    "../../client/src/domains/talent/pages/ApplyPage/submissionConsentBinding.js",
  );
  const outfile = path.join(
    os.tmpdir(),
    `submission-consent-binding.${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    outfile,
    logLevel: "silent",
  });
  const mirror = require(outfile);
  fs.unlinkSync(outfile);
  return mirror;
}

const REPRESENTATION_PACKAGE = Object.freeze({
  agencyId: "agency-1",
  boards: ["editorial", "commercial"],
  mediaSetId: "set-1",
  digitalSlotPicks: { headshot: "img-1", full_length: "img-2" },
  compCardPresetId: "preset-1",
  imageIds: ["img-2", "img-1"],
  note: "Original note.",
});

const EVENT_PACKAGE = Object.freeze({
  ...REPRESENTATION_PACKAGE,
  openCallLinkId: "link-77",
  availability: { from: "2026-09-14", to: "2026-09-18" },
  walkVideoUrl: "https://vimeo.com/1234567890",
});

/*
 * Frozen on 2026-08-15 from the pre-event-casting implementation. Regenerating
 * these to make a failing test pass would silently invalidate every in-flight
 * draft — read the header before touching them.
 */
const FROZEN_REPRESENTATION_HASHES = Object.freeze({
  full: "4ece7f4fd54cb79aa5a8ec354e4e157e645a86891b924e9e7aaf9992b80c027c",
  empty: "b2cf5564c91b63832b4fb75d008cd9bb4ecb6ef53e7d20a7309cb2043bf3ffeb",
});

describe("submission package fingerprint — event keys", () => {
  const mirror = loadBrowserMirror();

  test("representation packages are byte-identical to the pre-event shape", () => {
    // The canonical object is asserted directly (not just its hash) so a
    // failure names the offending key instead of showing two hex strings.
    expect(Object.keys(canonicalSubmissionPackage(REPRESENTATION_PACKAGE))).toEqual([
      "agencyId",
      "boards",
      "mediaSetId",
      "digitalSlotPicks",
      "compCardPresetId",
      "imageIds",
      "note",
    ]);
    expect(Object.keys(canonicalSubmissionPackage({}))).toEqual([
      "agencyId",
      "boards",
      "mediaSetId",
      "digitalSlotPicks",
      "compCardPresetId",
      "imageIds",
      "note",
    ]);
  });

  test("an explicitly-null openCallLinkId still produces the representation shape", () => {
    // The apply flow always sends these three keys — they are null on a
    // representation submission. If null did not collapse to "no keys", every
    // representation submission from the new client would fail consent.
    const withNulls = canonicalSubmissionPackage({
      ...REPRESENTATION_PACKAGE,
      openCallLinkId: null,
      availability: null,
      walkVideoUrl: null,
    });
    expect(withNulls).toEqual(canonicalSubmissionPackage(REPRESENTATION_PACKAGE));
    expect(
      buildSubmissionPackageFingerprint({
        ...REPRESENTATION_PACKAGE,
        openCallLinkId: null,
        availability: { from: "2026-09-14", to: "2026-09-18" },
        walkVideoUrl: "https://vimeo.com/1234567890",
      }),
    ).toBe(buildSubmissionPackageFingerprint(REPRESENTATION_PACKAGE));
  });

  test("REGRESSION: representation hashes are unchanged from before event casting", () => {
    expect(buildSubmissionPackageFingerprint(REPRESENTATION_PACKAGE)).toBe(
      FROZEN_REPRESENTATION_HASHES.full,
    );
    expect(buildSubmissionPackageFingerprint({})).toBe(
      FROZEN_REPRESENTATION_HASHES.empty,
    );
  });

  test("event packages carry the three extra keys, sorted and normalized", () => {
    const canonical = canonicalSubmissionPackage(EVENT_PACKAGE);
    expect(canonical.openCallLinkId).toBe("link-77");
    expect(canonical.availability).toEqual({ from: "2026-09-14", to: "2026-09-18" });
    expect(canonical.walkVideoUrl).toBe("https://vimeo.com/1234567890");
    expect(buildSubmissionPackageFingerprint(EVENT_PACKAGE)).not.toBe(
      buildSubmissionPackageFingerprint(REPRESENTATION_PACKAGE),
    );
  });

  test.each([
    ["availability", { availability: { from: "2026-09-15", to: "2026-09-18" } }],
    ["walk video", { walkVideoUrl: "https://vimeo.com/9999" }],
    ["call", { openCallLinkId: "link-78" }],
  ])("the event fingerprint changes when the %s changes", (_field, patch) => {
    expect(buildSubmissionPackageFingerprint({ ...EVENT_PACKAGE, ...patch })).not.toBe(
      buildSubmissionPackageFingerprint(EVENT_PACKAGE),
    );
  });

  test("a malformed availability normalizes identically rather than half-hashing", () => {
    const garbage = canonicalSubmissionPackage({
      ...EVENT_PACKAGE,
      availability: { from: "not-a-date", to: "" },
    });
    expect(garbage.availability).toBeNull();
    // A timestamp and a date describing the same day must be one package.
    expect(
      buildSubmissionPackageFingerprint({
        ...EVENT_PACKAGE,
        availability: {
          from: "2026-09-14T00:00:00.000Z",
          to: "2026-09-18T12:30:00.000Z",
        },
      }),
    ).toBe(buildSubmissionPackageFingerprint(EVENT_PACKAGE));
  });

  /*
   * PARITY. The browser computes the fingerprint the applicant consents with;
   * the server recomputes it and rejects a mismatch. These two implementations
   * are separate files in separate module systems, so nothing but this test
   * keeps them honest.
   */
  test.each([
    ["representation", REPRESENTATION_PACKAGE],
    ["event", EVENT_PACKAGE],
    ["empty", {}],
    [
      "event with no availability",
      { ...EVENT_PACKAGE, availability: null, walkVideoUrl: null },
    ],
    [
      "event with untrimmed values",
      {
        ...EVENT_PACKAGE,
        openCallLinkId: "  link-77  ",
        walkVideoUrl: "  https://vimeo.com/1234567890  ",
      },
    ],
    [
      "representation with null event keys",
      { ...REPRESENTATION_PACKAGE, openCallLinkId: null, availability: null },
    ],
  ])("server and browser agree on the %s package", async (_label, input) => {
    expect(mirror.canonicalSubmissionPackage(input)).toEqual(
      canonicalSubmissionPackage(input),
    );
    await expect(mirror.buildSubmissionConsentFingerprint(input)).resolves.toBe(
      buildSubmissionPackageFingerprint(input),
    );
  });
});

describe("event intake gating", () => {
  const READY_PROFILE = {
    height_cm: 178,
    bust_cm: 84,
    waist_cm: 61,
    hips_cm: 89,
    stats_track: "womenswear",
  };

  test("a call that asks for nothing blocks nothing", () => {
    expect(
      evaluateEventIntake(READY_PROFILE, {}, {}),
    ).toEqual([]);
  });

  test("a required walk video blocks the send with a stable code", () => {
    const blockers = evaluateEventIntake(
      READY_PROFILE,
      { requiresWalkVideo: true },
      { walkVideoUrl: null },
    );
    expect(blockers).toHaveLength(1);
    expect(blockers[0].code).toBe(EVENT_INTAKE_BLOCKER_CODES.WALK_VIDEO);
    // The funnel logs this string as `intake_blocked.reason` (design §g).
    expect(blockers[0].code).toBe("event_walk_video_required");
    expect(
      evaluateEventIntake(
        READY_PROFILE,
        { requiresWalkVideo: true },
        { walkVideoUrl: "https://vimeo.com/1" },
      ),
    ).toEqual([]);
  });

  test("a required availability needs both ends of the range", () => {
    const half = evaluateEventIntake(
      READY_PROFILE,
      { requiresAvailability: true },
      { availability: { from: "2026-09-14" } },
    );
    expect(half.map((blocker) => blocker.code)).toEqual([
      "event_availability_required",
    ]);
    expect(
      evaluateEventIntake(
        READY_PROFILE,
        { requiresAvailability: true },
        { availability: { from: "2026-09-14", to: "2026-09-18" } },
      ),
    ).toEqual([]);
  });

  test("required measurements need the numbers AND the applicant's confirmation", () => {
    expect(
      evaluateEventIntake(
        READY_PROFILE,
        { requiresMeasurements: true },
        { measurementsConfirmed: false },
      ).map((blocker) => blocker.code),
    ).toEqual(["event_measurements_required"]);
    expect(
      evaluateEventIntake(
        { height_cm: 178 },
        { requiresMeasurements: true },
        { measurementsConfirmed: true },
      ).map((blocker) => blocker.code),
    ).toEqual(["event_measurements_required"]);
    expect(
      evaluateEventIntake(
        READY_PROFILE,
        { requiresMeasurements: true },
        { measurementsConfirmed: true },
      ),
    ).toEqual([]);
  });

  test("validateSubmissionPackage reports intake blockers alongside send blockers", () => {
    const result = validateSubmissionPackage(READY_PROFILE, [], {
      eventIntake: { requiresWalkVideo: true, requiresAvailability: true },
      eventSubmission: {},
    });
    expect(result.ok).toBe(false);
    const codes = result.errors.map((error) => error.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "event_walk_video_required",
        "event_availability_required",
      ]),
    );
  });

  test("no eventIntake option leaves representation validation untouched", () => {
    const withOption = validateSubmissionPackage(READY_PROFILE, [], {
      eventIntake: null,
      eventSubmission: {},
    });
    const without = validateSubmissionPackage(READY_PROFILE, []);
    expect(withOption.errors).toEqual(without.errors);
  });
});
