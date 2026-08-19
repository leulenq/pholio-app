"use strict";

const {
  OUTCOMES,
  evaluateSpecRevision,
  matchIdentity,
} = require("../../src/domains/spec-registry/matcher");

const constraint = (field, operator, value, unit = null) => ({ field, operator, value, unit });
const confirmed = (id, shotType, extra = {}) => ({
  id,
  shotType,
  classification: { source: "user", confirmed: true },
  ...extra,
});

function spec(rules) {
  return { revisionId: "test:online@1", seriesId: "test:online", rules };
}

function evaluate(rules, input) {
  return evaluateSpecRevision({ spec: spec(rules), input, referenceDate: "2026-08-09" });
}

describe("Spec Registry matcher", () => {
  test("requires an injected valid UTC reference date", () => {
    expect(() => evaluateSpecRevision({ spec: spec({}), input: {}, referenceDate: null })).toThrow("referenceDate");
    expect(() => evaluateSpecRevision({ spec: spec({}), input: {}, referenceDate: "2026-02-30" })).toThrow("referenceDate");
  });

  test("matches exact user-confirmed frame and profile view one image per slot", () => {
    const result = evaluate({ shots: { allowImageReuseAcrossSlots: false, slots: [
      { id: "head", quantity: { minimum: 1 }, modality: "required", sourceLabel: "Head", evidenceIds: [], appliesWhen: null, match: constraint("shot.frame", "equals", "headshot") },
      { id: "profile", quantity: { minimum: 1 }, modality: "required", sourceLabel: "Profile", evidenceIds: [], appliesWhen: null, match: constraint("shot.view", "equals", "profile") },
    ] } }, { images: [confirmed("a", "headshot"), confirmed("b", "profile_left")] });
    expect(result.outcomes.shots.map((entry) => entry.outcome)).toEqual([OUTCOMES.SATISFIED, OUTCOMES.SATISFIED]);
    expect(result.outcomes.shots[1].assignments[0].imageId).toBe("b");
  });

  test("canonicalizes shared full_body legacy aliases before matching a full_length slot", () => {
    const result = evaluate({ shots: { allowImageReuseAcrossSlots: false, slots: [
      { id: "full", quantity: { minimum: 1 }, modality: "required", sourceLabel: "Full length", evidenceIds: [], appliesWhen: null, match: constraint("shot.frame", "equals", "full_length") },
    ] } }, { images: [confirmed("full", "full_body")] });

    expect(result.outcomes.shots[0]).toMatchObject({
      outcome: OUTCOMES.SATISFIED,
      assignments: [{ imageId: "full" }],
    });
  });

  test("does not infer close-up from headshot or front from a generic headshot", () => {
    const result = evaluate({ shots: { allowImageReuseAcrossSlots: false, slots: [
      { id: "close", quantity: { minimum: 1 }, modality: "required", sourceLabel: "Close", evidenceIds: [], appliesWhen: null, match: constraint("shot.frame", "equals", "close_up") },
      { id: "front", quantity: { minimum: 1 }, modality: "required", sourceLabel: "Front", evidenceIds: [], appliesWhen: null, match: constraint("shot.view", "equals", "front") },
    ] } }, { images: [confirmed("a", "headshot")] });
    expect(result.outcomes.shots.map((entry) => entry.outcome)).toEqual([OUTCOMES.MISSING, OUTCOMES.UNKNOWN]);
  });

  test("never treats AI-only tags as trusted image evidence", () => {
    const result = evaluate({ shots: { allowImageReuseAcrossSlots: false, slots: [
      { id: "head", quantity: { minimum: 1 }, modality: "required", sourceLabel: "Head", evidenceIds: [], appliesWhen: null, match: constraint("shot.frame", "equals", "headshot") },
    ] } }, { images: [{ id: "a", shotType: "headshot", classification: { source: "auto", confirmed: false } }] });
    expect(result.outcomes.shots[0].outcome).toBe(OUTCOMES.UNKNOWN);
  });

  test("uses deterministic matching and does not reuse an image unless source permits it", () => {
    const slots = [
      { id: "a", quantity: { minimum: 1 }, modality: "required", sourceLabel: "A", evidenceIds: [], appliesWhen: null, match: constraint("shot.frame", "equals", "headshot") },
      { id: "b", quantity: { minimum: 1 }, modality: "required", sourceLabel: "B", evidenceIds: [], appliesWhen: null, match: constraint("shot.frame", "equals", "headshot") },
    ];
    const noReuse = evaluate({ shots: { allowImageReuseAcrossSlots: null, slots } }, { images: [confirmed("only", "headshot")] });
    const reuse = evaluate({ shots: { allowImageReuseAcrossSlots: true, slots } }, { images: [confirmed("only", "headshot")] });
    expect(noReuse.outcomes.shots.map((entry) => entry.outcome)).toEqual([OUTCOMES.SATISFIED, OUTCOMES.MISSING]);
    expect(reuse.outcomes.shots.map((entry) => entry.outcome)).toEqual([OUTCOMES.SATISFIED, OUTCOMES.SATISFIED]);
  });

  test("evaluates published shot-count bounds against the selected package", () => {
    const tooFew = evaluate({ shots: { count: { minimum: 2, maximum: 3, evidenceIds: [], appliesWhen: null }, slots: [], allowImageReuseAcrossSlots: null } }, { images: [confirmed("a", "headshot")] });
    const tooMany = evaluate({ shots: { count: { minimum: 1, maximum: 1, evidenceIds: [], appliesWhen: null }, slots: [], allowImageReuseAcrossSlots: null } }, { images: [confirmed("a", "headshot"), confirmed("b", "full_length")] });
    expect(tooFew.outcomes.shotCount[0]).toMatchObject({ outcome: OUTCOMES.MISSING, actual: 1 });
    expect(tooMany.outcomes.shotCount[0]).toMatchObject({ outcome: OUTCOMES.VIOLATES, actual: 2 });
  });

  test("evaluates all, any, and not conditionals conservatively", () => {
    const rules = {
      eligibility: [
        { id: "adult", modality: "required", sourceLabel: "adult", evidenceIds: [], appliesWhen: { all: [constraint("applicant.age_years", "gte", 18), { not: constraint("contact.city", "equals", "") }] }, constraint: constraint("applicant.height_cm", "gte", 170) },
        { id: "minor", modality: "required", sourceLabel: "minor", evidenceIds: [], appliesWhen: { any: [constraint("applicant.age_years", "lt", 18), constraint("contact.city", "equals", "Paris")] }, constraint: constraint("contact.phone", "exists", null) },
      ],
    };
    const result = evaluate(rules, { talent: { dateOfBirth: "2000-08-09", heightCm: 172, city: "New York", phone: "1" } });
    expect(result.outcomes.eligibility.map((entry) => entry.outcome)).toEqual([OUTCOMES.SATISFIED, OUTCOMES.NOT_APPLICABLE]);
  });

  test("honors birthday boundaries from referenceDate", () => {
    const rules = { eligibility: [{ id: "adult", modality: "required", sourceLabel: "adult", evidenceIds: [], appliesWhen: null, constraint: constraint("applicant.age_years", "gte", 18, "year") }] };
    expect(evaluate(rules, { talent: { dateOfBirth: "2008-08-09" } }).outcomes.eligibility[0].outcome).toBe(OUTCOMES.SATISFIED);
    expect(evaluate(rules, { talent: { dateOfBirth: "2008-08-10" } }).outcomes.eligibility[0].outcome).toBe(OUTCOMES.VIOLATES);
  });

  test("evaluates profile fields, preserving unsupported fields as unknown", () => {
    const result = evaluate({ applicationFields: [
      { id: "name", field: "applicant.first_name", presence: "required", sourceLabel: "Name", evidenceIds: [], appliesWhen: null },
      { id: "address", field: "contact.address", presence: "required", sourceLabel: "Address", evidenceIds: [], appliesWhen: null },
      { id: "social", field: "social.instagram", presence: "optional", sourceLabel: "Instagram", evidenceIds: [], appliesWhen: null },
    ] }, { talent: { firstName: "Ada", social: { instagram: "ada" } } });
    expect(result.outcomes.applicationFields.map((entry) => entry.outcome)).toEqual([OUTCOMES.SATISFIED, OUTCOMES.UNKNOWN, OUTCOMES.NOT_APPLICABLE]);
  });

  test("treats schema-valid exists assertions as satisfied by any known fact", () => {
    const rules = {
      eligibility: [
        { id: "email", modality: "required", sourceLabel: "Email", evidenceIds: [], appliesWhen: null, constraint: constraint("contact.email", "exists", null) },
        { id: "phone", modality: "required", sourceLabel: "Phone", evidenceIds: [], appliesWhen: null, constraint: constraint("contact.phone", "exists", null) },
        { id: "address", modality: "required", sourceLabel: "Address", evidenceIds: [], appliesWhen: null, constraint: constraint("contact.address", "exists", null) },
      ],
    };
    const result = evaluate(rules, { talent: { email: "ada@example.test" } });
    expect(result.outcomes.eligibility.map((entry) => entry.outcome)).toEqual([
      OUTCOMES.SATISFIED,
      OUTCOMES.MISSING,
      OUTCOMES.UNKNOWN,
    ]);
  });

  test("treats declared retouch as positive proof and null as unknown", () => {
    const rule = { id: "no-retouch", modality: "prohibited", sourceLabel: "No retouch", evidenceIds: [], appliesWhen: null, appliesTo: { mode: "all_shots", shotIds: [] }, constraint: constraint("alteration.retouch_used", "equals", true) };
    expect(evaluate({ setWide: [rule] }, { images: [confirmed("a", "headshot", { retouchedAt: "2026-01-01" })] }).outcomes.setWide[0].outcome).toBe(OUTCOMES.VIOLATES);
    expect(evaluate({ setWide: [rule] }, { images: [confirmed("a", "headshot")] }).outcomes.setWide[0].outcome).toBe(OUTCOMES.UNKNOWN);
  });

  test("keeps selected-shot set-wide rules unknown when an input slot is unresolved", () => {
    const rules = {
      shots: {
        allowImageReuseAcrossSlots: false,
        slots: [
          {
            id: "head",
            quantity: { minimum: 1 },
            modality: "required",
            sourceLabel: "Headshot",
            evidenceIds: [],
            appliesWhen: null,
            match: {
              all: [
                constraint("shot.frame", "equals", "headshot"),
                constraint("appearance.makeup_level", "equals", "none"),
              ],
            },
          },
        ],
      },
      setWide: [
        {
          id: "selected-no-retouch",
          modality: "prohibited",
          sourceLabel: "No retouching",
          evidenceIds: [],
          appliesWhen: null,
          appliesTo: { mode: "selected_shots", shotIds: ["head"] },
          constraint: constraint("alteration.retouch_used", "equals", true),
        },
      ],
    };
    const result = evaluate(rules, { images: [confirmed("head", "headshot")] });

    expect(result.outcomes.shots[0].outcome).toBe(OUTCOMES.UNKNOWN);
    expect(result.outcomes.setWide[0]).toMatchObject({
      outcome: OUTCOMES.UNKNOWN,
      imageIds: [],
      unresolvedShotIds: ["head"],
    });
  });

  test("uses persisted file facts when supplied and otherwise reports unknown", () => {
    const files = [{ id: "size", modality: "required", sourceLabel: "size", evidenceIds: [], appliesWhen: null, scope: "per_file", constraint: constraint("file.size_bytes", "lte", 30000000, "byte") }];
    expect(evaluate({ files }, { images: [confirmed("a", "headshot", { file: { sizeBytes: 30000001 } })] }).outcomes.files[0].outcome).toBe(OUTCOMES.VIOLATES);
    expect(evaluate({ files }, { images: [confirmed("a", "headshot")] }).outcomes.files[0].outcome).toBe(OUTCOMES.UNKNOWN);
  });

  test("uses persisted delivery MIME and bytes as exact file facts", () => {
    const files = [
      { id: "type", modality: "required", sourceLabel: "type", evidenceIds: [], appliesWhen: null, scope: "per_file", constraint: constraint("file.mime_type", "in", ["image/jpeg", "image/png"]) },
      { id: "size", modality: "required", sourceLabel: "size", evidenceIds: [], appliesWhen: null, scope: "per_file", constraint: constraint("file.size_bytes", "lte", 30000000, "byte") },
    ];
    const result = evaluate({ files }, { images: [confirmed("delivery", "headshot", { file: { mimeType: "image/jpeg", sizeBytes: 30000000 } })] });
    expect(result.outcomes.files.map((entry) => entry.outcome)).toEqual([OUTCOMES.SATISFIED, OUTCOMES.SATISFIED]);
  });

  test("maps stored profile identity fields but does not infer female_identified", () => {
    const rules = {
      applicationFields: [
        { id: "nationality", field: "applicant.nationality", presence: "required", sourceLabel: "Nationality", evidenceIds: [], appliesWhen: null },
        { id: "pronouns", field: "applicant.pronouns", presence: "required", sourceLabel: "Pronouns", evidenceIds: [], appliesWhen: null },
        { id: "hair", field: "appearance.hair_color", presence: "required", sourceLabel: "Hair", evidenceIds: [], appliesWhen: null },
        { id: "eyes", field: "appearance.eye_color", presence: "required", sourceLabel: "Eyes", evidenceIds: [], appliesWhen: null },
      ],
      eligibility: [
        { id: "work", modality: "required", sourceLabel: "Work authorization", evidenceIds: [], appliesWhen: null, constraint: constraint("application.work_authorization", "equals", true) },
        { id: "stored-female", modality: "required", sourceLabel: "Female", evidenceIds: [], appliesWhen: null, constraint: constraint("applicant.gender", "equals", "female") },
        { id: "female-identified-floor", modality: "required", sourceLabel: "Female identified", evidenceIds: [], appliesWhen: constraint("applicant.gender", "equals", "female_identified"), constraint: constraint("applicant.height_cm", "gte", 175) },
      ],
    };
    const result = evaluate(rules, { talent: { nationality: "Canadian", pronouns: "she/her", hairColor: "Brown", eyeColor: "Hazel", workAuthorization: "Yes", gender: "Female", heightCm: 160 } });
    expect(result.outcomes.applicationFields.map((entry) => entry.outcome)).toEqual([OUTCOMES.SATISFIED, OUTCOMES.SATISFIED, OUTCOMES.SATISFIED, OUTCOMES.SATISFIED]);
    expect(result.outcomes.eligibility.map((entry) => entry.outcome)).toEqual([OUTCOMES.SATISFIED, OUTCOMES.SATISFIED, OUTCOMES.UNKNOWN]);
  });

  /**
   * A compound slot ("close-up AND profile AND hair pulled back") has no single
   * `match.value`, so `matchValue` was null for it and any consumer keying rows
   * by that field dropped the slot without saying so. The identity fields are
   * additive: `matchValue` keeps its old meaning exactly.
   */
  test("gives a compound shot slot the identity a single matchValue cannot carry", () => {
    const rules = {
      shots: {
        allowImageReuseAcrossSlots: false,
        slots: [
          {
            id: "full-length",
            quantity: { minimum: 1 },
            modality: "requested",
            sourceLabel: "Full length",
            evidenceIds: [],
            appliesWhen: null,
            match: constraint("shot.frame", "equals", "full_length"),
          },
          {
            id: "close-up-profile",
            quantity: { minimum: 1 },
            modality: "requested",
            sourceLabel: "Close up profile (hair pulled back)",
            evidenceIds: [],
            appliesWhen: null,
            match: {
              all: [
                constraint("shot.frame", "equals", "close_up"),
                constraint("shot.view", "equals", "profile"),
                constraint("appearance.hair_state", "equals", "pulled_back"),
              ],
            },
          },
        ],
      },
    };
    const [compound, simple] = evaluate(rules, { images: [] }).outcomes.shots;

    expect(simple).toMatchObject({
      id: "full-length",
      matchValue: "full_length",
      matchKey: "shot.frame:equals:full_length",
      matchValues: [{ field: "shot.frame", operator: "equals", value: "full_length" }],
    });
    expect(compound).toMatchObject({
      id: "close-up-profile",
      // Unchanged: a conjunction has no single value, and inventing one here
      // would make two different requirements look like the same one.
      matchValue: null,
      matchKey:
        "appearance.hair_state:equals:pulled_back&shot.frame:equals:close_up&shot.view:equals:profile",
    });
    // Published order, which is the order the words read in.
    expect(compound.matchValues.map((entry) => entry.value)).toEqual([
      "close_up",
      "profile",
      "pulled_back",
    ]);
  });

  test("makes the compound key order-independent and refuses one for any/not slots", () => {
    const published = matchIdentity({
      all: [
        constraint("shot.frame", "equals", "close_up"),
        constraint("shot.view", "equals", "profile"),
      ],
    });
    const reordered = matchIdentity({
      all: [
        constraint("shot.view", "equals", "profile"),
        constraint("shot.frame", "equals", "close_up"),
      ],
    });
    // Two agencies publishing the same requirement in a different order are
    // asking for the same photograph.
    expect(published.matchKey).toBe(reordered.matchKey);
    expect(published.matchValues).not.toEqual(reordered.matchValues);

    // A disjunction is not one requirement, so it gets no cross-agency key and
    // falls back to its own slot identity in the DTO.
    expect(matchIdentity({ any: [constraint("shot.frame", "equals", "close_up")] })).toEqual({
      matchValues: [],
      matchKey: null,
    });
    expect(matchIdentity({ not: constraint("shot.frame", "equals", "close_up") })).toEqual({
      matchValues: [],
      matchKey: null,
    });
    expect(matchIdentity(null)).toEqual({ matchValues: [], matchKey: null });
    expect(matchIdentity(constraint("file.mime_type", "in", ["image/png", "image/jpeg"])).matchKey)
      .toBe("file.mime_type:in:image/jpeg,image/png");
  });

  test("reflects a declared spec mode but never returns a blocking decision", () => {
    const result = evaluate({ eligibility: [{ id: "height", modality: "required", sourceLabel: "height", evidenceIds: [], appliesWhen: null, constraint: constraint("applicant.height_cm", "gte", 200) }] }, { talent: { heightCm: 170 } });
    expect(result.evaluationMode).toBe("advisory");
    expect(result).not.toHaveProperty("blockingEligible");
    expect(result.outcomes.eligibility[0].outcome).toBe(OUTCOMES.VIOLATES);
    const blockingLabel = evaluateSpecRevision({ spec: { ...spec({}), evaluationMode: "blocking" }, input: {}, referenceDate: "2026-08-09" });
    expect(blockingLabel.evaluationMode).toBe("blocking");
    expect(blockingLabel).not.toHaveProperty("blockingEligible");
  });
});
