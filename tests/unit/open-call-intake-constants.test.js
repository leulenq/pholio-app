"use strict";

const {
  CUSTOM_QUESTION_LIMITS,
  DEFAULT_EVENT_INTAKE_SPEC,
  DEFAULT_IDENTITY_POLICY,
  DEFAULT_REPRESENTATION_INTAKE_SPEC,
  IDENTITY_POLICIES,
  INTAKE_FIELDS,
  INTAKE_REQUIREMENTS,
  INTAKE_STAGES,
  MEDIA_FIELD_KEYS,
  applyStageFields,
  defaultIntakeSpecForCallKind,
  normalizeIntakeSpec,
  shortlistStageFields,
} = require("../../src/shared/constants/open-call-intake");
const { CALL_KINDS } = require("../../src/shared/constants/event-casting");

describe("open-call intake vocabulary", () => {
  test("INTAKE_FIELDS is frozen and MEDIA_FIELD_KEYS matches kind === media", () => {
    expect(Object.isFrozen(INTAKE_FIELDS)).toBe(true);
    expect(Object.isFrozen(INTAKE_FIELDS.legal_name)).toBe(true);

    const expectedMedia = Object.keys(INTAKE_FIELDS).filter(
      (key) => INTAKE_FIELDS[key].kind === "media",
    );
    expect([...MEDIA_FIELD_KEYS].sort()).toEqual(expectedMedia.sort());
    expect(MEDIA_FIELD_KEYS).toEqual(
      expect.arrayContaining(["digital_headshot", "digital_full_length", "digital_profile"]),
    );
  });

  test("default identity policy is account_required", () => {
    expect(DEFAULT_IDENTITY_POLICY).toBe(IDENTITY_POLICIES.ACCOUNT_REQUIRED);
  });

  test("defaultIntakeSpecForCallKind routes on isEventCastingCallKind", () => {
    expect(defaultIntakeSpecForCallKind(CALL_KINDS.EVENT_CASTING)).toBe(
      DEFAULT_EVENT_INTAKE_SPEC,
    );
    expect(defaultIntakeSpecForCallKind(CALL_KINDS.REPRESENTATION)).toBe(
      DEFAULT_REPRESENTATION_INTAKE_SPEC,
    );
    expect(defaultIntakeSpecForCallKind(undefined)).toBe(DEFAULT_REPRESENTATION_INTAKE_SPEC);
  });
});

describe("normalizeIntakeSpec", () => {
  test("null/undefined rawSpec returns the platform default for the call kind", () => {
    expect(normalizeIntakeSpec(null, CALL_KINDS.EVENT_CASTING)).toBe(DEFAULT_EVENT_INTAKE_SPEC);
    expect(normalizeIntakeSpec(undefined, CALL_KINDS.REPRESENTATION)).toBe(
      DEFAULT_REPRESENTATION_INTAKE_SPEC,
    );
  });

  test("accepts the platform defaults for both call kinds", () => {
    expect(() =>
      normalizeIntakeSpec(DEFAULT_EVENT_INTAKE_SPEC, CALL_KINDS.EVENT_CASTING),
    ).not.toThrow();
    expect(() =>
      normalizeIntakeSpec(DEFAULT_REPRESENTATION_INTAKE_SPEC, CALL_KINDS.REPRESENTATION),
    ).not.toThrow();

    const normalized = normalizeIntakeSpec(DEFAULT_EVENT_INTAKE_SPEC, CALL_KINDS.EVENT_CASTING);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(normalized).toEqual(DEFAULT_EVENT_INTAKE_SPEC);
  });

  test("rejects an unknown field key — the vocabulary is closed", () => {
    const spec = [
      { key: "email", requirement: "required", stage: "apply" },
      { key: "shoe_size", requirement: "optional", stage: "apply" },
    ];
    expect(() => normalizeIntakeSpec(spec, CALL_KINDS.REPRESENTATION)).toThrow(
      /unknown intake field key/,
    );
    try {
      normalizeIntakeSpec(spec, CALL_KINDS.REPRESENTATION);
    } catch (error) {
      expect(error.code).toBe("INVALID_INTAKE_SPEC");
    }
  });

  test("rejects duplicate keys", () => {
    const spec = [
      { key: "email", requirement: "required", stage: "apply" },
      { key: "city", requirement: "required", stage: "apply" },
      { key: "city", requirement: "optional", stage: "shortlist" },
    ];
    expect(() => normalizeIntakeSpec(spec, CALL_KINDS.REPRESENTATION)).toThrow(
      /duplicate intake field key/,
    );
  });

  test("rejects a spec missing required apply-stage email", () => {
    const missingEmail = [{ key: "legal_name", requirement: "required", stage: "apply" }];
    expect(() => normalizeIntakeSpec(missingEmail, CALL_KINDS.REPRESENTATION)).toThrow(
      /email must be required/,
    );

    const optionalEmail = [
      { key: "email", requirement: "optional", stage: "apply" },
      { key: "legal_name", requirement: "required", stage: "apply" },
    ];
    expect(() => normalizeIntakeSpec(optionalEmail, CALL_KINDS.REPRESENTATION)).toThrow(
      /email must be required/,
    );

    const shortlistEmail = [{ key: "email", requirement: "required", stage: "shortlist" }];
    expect(() => normalizeIntakeSpec(shortlistEmail, CALL_KINDS.REPRESENTATION)).toThrow(
      /email must be required/,
    );
  });

  test("rejects an event spec without apply-stage required adult_attestation", () => {
    const missingAttestation = [{ key: "email", requirement: "required", stage: "apply" }];
    expect(() => normalizeIntakeSpec(missingAttestation, CALL_KINDS.EVENT_CASTING)).toThrow(
      /adult_attestation must be required/,
    );

    const shortlistAttestation = [
      { key: "email", requirement: "required", stage: "apply" },
      { key: "adult_attestation", requirement: "required", stage: "shortlist" },
    ];
    expect(() => normalizeIntakeSpec(shortlistAttestation, CALL_KINDS.EVENT_CASTING)).toThrow(
      /adult_attestation must be required/,
    );

    // A representation call has no such requirement.
    expect(() =>
      normalizeIntakeSpec(missingAttestation, CALL_KINDS.REPRESENTATION),
    ).not.toThrow();
  });

  test("rejects malformed entries and invalid requirement/stage values", () => {
    expect(() => normalizeIntakeSpec("not-an-array", CALL_KINDS.REPRESENTATION)).toThrow(
      /must be an array/,
    );
    expect(() => normalizeIntakeSpec([null], CALL_KINDS.REPRESENTATION)).toThrow(
      /must be an object/,
    );
    expect(() =>
      normalizeIntakeSpec(
        [{ key: "email", requirement: "must-have", stage: "apply" }],
        CALL_KINDS.REPRESENTATION,
      ),
    ).toThrow(/invalid requirement/);
    expect(() =>
      normalizeIntakeSpec(
        [{ key: "email", requirement: "required", stage: "onboarding" }],
        CALL_KINDS.REPRESENTATION,
      ),
    ).toThrow(/invalid stage/);
  });
});

describe("applyStageFields / shortlistStageFields", () => {
  test("filter by stage and drop HIDDEN entries", () => {
    const spec = [
      { key: "email", requirement: "required", stage: "apply" },
      { key: "instagram", requirement: "hidden", stage: "apply" },
      { key: "walk_video_url", requirement: "required", stage: "shortlist" },
      { key: "core_measurements", requirement: "hidden", stage: "shortlist" },
    ];

    expect(applyStageFields(spec).map((entry) => entry.key)).toEqual(["email"]);
    expect(shortlistStageFields(spec).map((entry) => entry.key)).toEqual(["walk_video_url"]);
  });

  test("against the event default: apply/shortlist split matches design §2.2", () => {
    expect(applyStageFields(DEFAULT_EVENT_INTAKE_SPEC).map((entry) => entry.key)).toEqual([
      "legal_name",
      "email",
      "phone",
      "adult_attestation",
      "gender",
      "city",
      "height",
      "digital_headshot",
      "digital_full_length",
      "instagram",
    ]);
    expect(shortlistStageFields(DEFAULT_EVENT_INTAKE_SPEC).map((entry) => entry.key)).toEqual([
      "walk_video_url",
      "availability_window",
      "core_measurements",
    ]);
  });

  test("handle empty/undefined spec gracefully", () => {
    expect(applyStageFields(undefined)).toEqual([]);
    expect(shortlistStageFields([])).toEqual([]);
  });
});

describe("CUSTOM_QUESTION_LIMITS and INTAKE_REQUIREMENTS/INTAKE_STAGES sanity", () => {
  test("shapes are as documented", () => {
    expect(CUSTOM_QUESTION_LIMITS).toEqual({
      maxQuestions: 5,
      maxLabelLength: 160,
      maxAnswerLength: 500,
    });
    expect(INTAKE_STAGES).toEqual({ APPLY: "apply", SHORTLIST: "shortlist" });
    expect(INTAKE_REQUIREMENTS).toEqual({
      REQUIRED: "required",
      OPTIONAL: "optional",
      HIDDEN: "hidden",
    });
  });
});
