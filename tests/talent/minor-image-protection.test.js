/**
 * Minor-image protection + image-AI consent (audit P0-8 and the image-AI half
 * of P0-5).
 *
 * These are pure-function tests over the authoritative policy helpers used by
 * the media upload path and the async classification pass. They prove:
 *   (a) an unconsented-minor upload defaults to fully private regardless of the
 *       client-declared shot/style metadata;
 *   (b) the classification pass re-runs policy and forces exclusion (the write
 *       is atomic in run-image-classification.js — see that module);
 *   (c) sensitive image AI does NOT run for an unconsented minor / unverified
 *       age;
 *   (d) a normal adult upload is unaffected.
 */

const {
  minorForcesPrivate,
  forcedPrivateColumns,
  sensitiveImageAiAllowed,
} = require("../../src/domains/talent/routes/media").__testables;
const {
  applyClassificationPolicy,
  shouldForceExclusion,
  isSensitiveClassification,
} = require("../../src/domains/talent/services/image-classification-policy");

// Ages relative to a fixed "today" (jest default is real time; DOBs chosen far
// from any boundary so the tests are date-stable for years).
const MINOR = { id: "p-minor", date_of_birth: "2015-06-01" };
const MINOR_WITH_CONSENT = {
  id: "p-minor-c",
  date_of_birth: "2015-06-01",
  guardian_consent_at: "2026-01-01T00:00:00.000Z",
};
const ADULT = { id: "p-adult", date_of_birth: "1990-06-01" };
const ADULT_WITH_CONSENT = { ...ADULT, ai_processing_consent: true };
const NO_DOB = { id: "p-unknown" };
const IMAGE_AI_ENABLED = { PHOLIO_ENABLE_IMAGE_ANALYSIS: "true" };

// A classification result whose client-declared framing looks like a safe
// headshot — the exact "client lies about metadata" scenario from P0-8.
const SAFE_HEADSHOT = {
  shot_type: "headshot",
  style_type: "editorial",
  image_type: "portfolio",
  confidence: { shot_type: 0.95, style_type: 0.9, image_type: 0.9 },
  signals: { body_visibility: "face_only" },
  uncertainty_factors: [],
};

const SENSITIVE_BODY = {
  shot_type: "full_length",
  style_type: "swimwear",
  image_type: "portfolio",
  confidence: { shot_type: 0.95, style_type: 0.9, image_type: 0.9 },
  signals: { body_visibility: "full_length" },
  uncertainty_factors: [],
};

describe("(a) upload default-private for unconsented minors", () => {
  test("unconsented minor forces exclude_from_public + exclude_from_agency", () => {
    expect(minorForcesPrivate(MINOR)).toBe(true);
    expect(forcedPrivateColumns(MINOR)).toEqual({
      exclude_from_public: true,
      exclude_from_agency: true,
    });
  });

  test("consented minor is not force-excluded", () => {
    expect(minorForcesPrivate(MINOR_WITH_CONSENT)).toBe(false);
    expect(forcedPrivateColumns(MINOR_WITH_CONSENT)).toEqual({});
  });

  test("adult is never force-excluded (happy path)", () => {
    expect(minorForcesPrivate(ADULT)).toBe(false);
    expect(forcedPrivateColumns(ADULT)).toEqual({});
  });
});

describe("(b) classification re-runs policy and forces exclusion", () => {
  test("unconsented minor + client-claimed safe headshot → forced fully private", () => {
    const r = applyClassificationPolicy({
      imageRow: { id: "img-1", shot_type: "headshot", metadata: {} },
      classification: SAFE_HEADSHOT,
      profile: MINOR,
    });
    // Even though the client tagged a safe headshot, the safety lock wins.
    expect(r.columnUpdates.exclude_from_public).toBe(true);
    expect(r.columnUpdates.exclude_from_agency).toBe(true);
    expect(r.metadataPatch.ai.classification.safety_lock).toMatchObject({
      forced: true,
      reason: "minor_without_guardian_consent",
    });
  });

  test("unverified age + sensitive body frame → fail closed", () => {
    const r = applyClassificationPolicy({
      imageRow: { id: "img-2", metadata: {} },
      classification: SENSITIVE_BODY,
      profile: NO_DOB,
    });
    expect(r.columnUpdates.exclude_from_public).toBe(true);
    expect(r.columnUpdates.exclude_from_agency).toBe(true);
    expect(r.metadataPatch.ai.classification.safety_lock.reason).toBe(
      "unverified_age_sensitive_image",
    );
  });

  test("safety lock overrides a user-locked classification for a minor", () => {
    const r = applyClassificationPolicy({
      imageRow: {
        id: "img-3",
        shot_type: "full_length",
        metadata: { ai: { classification: { source: "user" } } },
      },
      classification: SENSITIVE_BODY,
      profile: MINOR,
    });
    expect(r.columnUpdates.exclude_from_public).toBe(true);
    expect(r.columnUpdates.exclude_from_agency).toBe(true);
  });

  test("isSensitiveClassification reads framing / style / body_visibility", () => {
    expect(isSensitiveClassification(SENSITIVE_BODY, {})).toBe(true);
    expect(isSensitiveClassification(SAFE_HEADSHOT, {})).toBe(false);
    expect(
      isSensitiveClassification({ signals: { body_visibility: "three_quarter" } }, {}),
    ).toBe(true);
  });

  test("shouldForceExclusion summary matrix", () => {
    expect(shouldForceExclusion({ profile: MINOR, classification: SAFE_HEADSHOT }).forced).toBe(true);
    expect(shouldForceExclusion({ profile: MINOR_WITH_CONSENT, classification: SENSITIVE_BODY }).forced).toBe(false);
    expect(shouldForceExclusion({ profile: ADULT, classification: SENSITIVE_BODY }).forced).toBe(false);
    expect(shouldForceExclusion({ profile: NO_DOB, classification: SENSITIVE_BODY }).forced).toBe(true);
    expect(shouldForceExclusion({ profile: NO_DOB, classification: SAFE_HEADSHOT }).forced).toBe(false);
  });
});

describe("(c) sensitive image AI consent gate", () => {
  test("does NOT run for an unconsented minor", () => {
    expect(sensitiveImageAiAllowed(MINOR)).toBe(false);
  });

  test("does NOT run when age is unverifiable (no DOB)", () => {
    expect(sensitiveImageAiAllowed(NO_DOB)).toBe(false);
  });

  test("does NOT run for a minor with guardian authorization", () => {
    expect(
      sensitiveImageAiAllowed(
        { ...MINOR_WITH_CONSENT, ai_processing_consent: true },
        IMAGE_AI_ENABLED,
      ),
    ).toBe(false);
  });

  test("runs only for an adult with explicit consent and the feature flag", () => {
    expect(sensitiveImageAiAllowed(ADULT, IMAGE_AI_ENABLED)).toBe(false);
    expect(sensitiveImageAiAllowed(ADULT_WITH_CONSENT, {})).toBe(false);
    expect(
      sensitiveImageAiAllowed(ADULT_WITH_CONSENT, IMAGE_AI_ENABLED),
    ).toBe(true);
  });
});

describe("(d) adult happy path unaffected by classification", () => {
  test("adult sensitive image is NOT force-excluded (adult controls visibility)", () => {
    const r = applyClassificationPolicy({
      imageRow: { id: "img-4", shot_type: "full_length", metadata: {} },
      classification: SENSITIVE_BODY,
      profile: ADULT,
    });
    expect(r.columnUpdates.exclude_from_public).toBeUndefined();
    expect(r.columnUpdates.exclude_from_agency).toBeUndefined();
    expect(r.metadataPatch.ai.classification.safety_lock).toBeUndefined();
  });

  test("adult classification still auto-tags columns normally", () => {
    const r = applyClassificationPolicy({
      imageRow: { id: "img-5", shot_type: null, style_type: null, image_type: null, metadata: {} },
      classification: {
        shot_type: "headshot",
        style_type: null,
        image_type: "digital",
        confidence: { shot_type: 0.92, style_type: 0.4, image_type: 0.85 },
        signals: {},
        uncertainty_factors: [],
      },
      profile: ADULT,
    });
    expect(r.columnUpdates.image_type).toBe("digital");
    expect(r.columnUpdates.exclude_from_public).toBeUndefined();
  });
});
