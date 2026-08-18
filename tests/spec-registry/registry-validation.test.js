const path = require("path");

const {
  collectSemanticErrors,
  validateRegistry,
} = require("../../scripts/validate-spec-registry");

const registryRoot = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "spec-registry",
  "v1",
);
const specSchema = require("../../data/spec-registry/v1/schemas/spec-revision.schema.json");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expressionLeaves(expression) {
  if (!expression) return [];
  if (expression.field) return [expression];
  if (expression.not) return expressionLeaves(expression.not);
  return (expression.all || expression.any || []).flatMap(expressionLeaves);
}

describe("Spec Registry v1 data package", () => {
  let registry;
  let bySeries;

  beforeAll(() => {
    registry = validateRegistry({ registryRoot });
    bySeries = new Map(registry.specs.map((spec) => [spec.seriesId, spec]));
  });

  test("validates every schema and cross-record invariant", () => {
    expect(registry.summary).toEqual({
      currentSeries: 10,
      revisions: 10,
      taxonomyFields: 88,
      unknownFacts: 28,
    });
    expect(registry.manifest.records).toHaveLength(10);
  });

  test("keeps public-source revisions reviewed but advisory", () => {
    for (const spec of registry.specs) {
      expect(spec.evaluationMode).toBe("advisory");
      expect(["first_party_published", "agency_branded_provider"]).toContain(
        spec.review.authority,
      );
      expect(spec.review.method).toBe("dual_reviewer");
      expect(spec.review.reviewers).toHaveLength(2);
      expect(spec.lifecycle.observedOn).toBe("2026-08-09");
      expect(spec.lifecycle.reviewedOn).toBe("2026-08-09");
      if (spec.status === "verified") {
        expect(spec.lifecycle.nextReviewOn).not.toBeNull();
      }
    }
  });

  test("represents Elite North America's six distinct requested targets", () => {
    const spec = bySeries.get("elite-models-na:online-general");
    expect(spec.rules.shots.count).toMatchObject({ minimum: 6, maximum: 6 });
    expect(spec.rules.shots.slots).toHaveLength(6);
    expect(spec.rules.shots.slots.every((slot) => slot.modality === "requested")).toBe(true);

    expect(spec.rules.setWide.find((rule) => rule.id === "no-makeup")).toMatchObject({
      modality: "prohibited",
      constraint: { field: "appearance.makeup_level", operator: "not_equals", value: "none" },
    });
    expect(spec.rules.setWide.find((rule) => rule.id === "no-smiles")).toMatchObject({
      modality: "prohibited",
      constraint: { field: "expression.smile", operator: "equals", value: true },
    });

    const profileHairBack = spec.rules.shots.slots.find(
      (slot) => slot.id === "close-up-profile-hair-pulled-back",
    );
    expect(expressionLeaves(profileHairBack.match)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "shot.frame", value: "close_up" }),
        expect.objectContaining({ field: "shot.view", value: "profile" }),
        expect.objectContaining({ field: "appearance.hair_state", value: "pulled_back" }),
      ]),
    );
    expect(
      spec.rules.shots.slots.find((slot) => slot.id === "personality-pic"),
    ).toMatchObject({
      matchability: "manual_confirmation",
      match: { field: "shot.purpose", value: "personality" },
    });
  });

  test("does not turn Elite global's three named views into an invented minimum", () => {
    const spec = bySeries.get("elite-model-management-global:online");
    expect(spec.rules.shots.count).toMatchObject({ minimum: null, maximum: 3 });
    expect(spec.rules.shots.slots).toHaveLength(3);
    expect(spec.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fact: "shots.count.minimum" }),
        expect.objectContaining({ fact: "presentation.background" }),
      ]),
    );

    const fileLimit = spec.rules.files.find((rule) => rule.id === "maximum-image-size");
    expect(fileLimit).toMatchObject({
      constraint: { field: "file.size_bytes", operator: "lte", value: 5000000 },
      sourceValue: { value: 5, unit: "MB", normalization: "decimal_conservative" },
    });
  });

  test("preserves Elite Japan's open-ended count and scoped height floors", () => {
    const spec = bySeries.get("elite-japan-tokyo:online");
    expect(spec.rules.shots.count).toMatchObject({ minimum: 5, maximum: null });
    expect(spec.rules.shots.slots).toHaveLength(0);

    const heights = Object.fromEntries(
      spec.rules.eligibility.map((rule) => [
        rule.appliesWhen.value,
        rule.constraint.value,
      ]),
    );
    expect(heights).toEqual({ male: 183, female: 173 });
    expect(spec.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fact: "eligibility.height",
          appliesWhen: expect.objectContaining({
            field: "applicant.gender",
            value: "non_binary",
          }),
        }),
      ]),
    );
  });

  test("captures Models1's presentation prohibitions and conditional guardian flow", () => {
    const spec = bySeries.get("models1-uk:online");
    expect(spec.rules.shots.count).toMatchObject({ minimum: 3, maximum: 3 });
    expect(spec.rules.shots.slots.map((slot) => slot.id)).toEqual([
      "headshot",
      "profile",
      "full-length",
    ]);

    const prohibited = spec.rules.setWide
      .filter((rule) => rule.modality === "prohibited")
      .map((rule) => [
        rule.constraint.field,
        rule.constraint.operator,
        rule.constraint.value,
      ]);
    expect(prohibited).toEqual(
      expect.arrayContaining([
        ["appearance.makeup_level", "not_equals", "none"],
        ["alteration.filter_used", "equals", true],
        ["alteration.effects_used", "equals", true],
        ["alteration.retouch_used", "equals", true],
        ["clothing.category", "equals", "swimwear"],
        ["clothing.category", "equals", "underwear"],
      ]),
    );
    expect(
      spec.rules.setWide.find((rule) => rule.id === "slim-fitting-jeans-allowed"),
    ).toMatchObject({
      modality: "allowed",
      constraint: { field: "clothing.category", value: "slim_fitting_jeans" },
      appliesTo: { mode: "selected_shots", shotIds: ["full-length"] },
    });

    const guardianFields = spec.rules.applicationFields.filter((field) =>
      field.id.startsWith("guardian-"),
    );
    expect(guardianFields).toHaveLength(3);
    expect(
      guardianFields.every(
        (field) =>
          field.presence === "conditional_required" &&
          field.appliesWhen.field === "applicant.age_years" &&
          field.appliesWhen.operator === "lt" &&
          field.appliesWhen.value === 16,
      ),
    ).toBe(true);
  });

  test("preserves Ford's four requested selected-market upload targets and strict size cap", () => {
    const spec = bySeries.get("ford-models:selected-city-online");
    expect(spec.scope.market).toMatchObject({
      kind: "selected_market",
      code: "selected-city",
    });
    expect(spec.rules.shots.count).toMatchObject({ minimum: 4, maximum: 4 });
    expect(spec.rules.shots.slots.map((slot) => slot.id)).toEqual([
      "close-up",
      "profile",
      "waist-up",
      "full-length",
    ]);
    expect(spec.rules.shots.slots.every((slot) => slot.modality === "requested")).toBe(true);
    expect(spec.rules.files.find((rule) => rule.id === "image-file-size-maximum")).toMatchObject({
      constraint: { field: "file.size_bytes", operator: "lt", value: 3000000 },
      sourceValue: { value: 3, unit: "MB", normalization: "decimal_conservative" },
    });
  });

  test("keeps Storm's required slots separate from its conflicting guardian boundary", () => {
    const spec = bySeries.get("storm-management-uk:online");
    expect(spec.rules.shots.count).toMatchObject({ minimum: 3, maximum: 3 });
    expect(spec.rules.shots.slots.map((slot) => [slot.id, slot.modality])).toEqual([
      ["headshot", "required"],
      ["mid-length", "required"],
      ["full-length", "required"],
    ]);
    expect(spec.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fact: "application.guardian_fields",
          reason: "conflicting",
          appliesWhen: {
            field: "applicant.age_years",
            operator: "lte",
            value: 18,
            unit: "year",
          },
        }),
      ]),
    );
  });

  test("captures The Society's three requested daylight submissions and personal style", () => {
    const spec = bySeries.get("the-society-management-nyc:online");
    expect(spec.rules.shots.count).toMatchObject({ minimum: 3, maximum: 3 });
    expect(spec.rules.shots.slots.map((slot) => slot.id)).toEqual([
      "close-up",
      "profile",
      "full-length",
    ]);
    expect(spec.rules.shots.slots.every((slot) => slot.modality === "requested")).toBe(true);
    expect(spec.rules.files.find((rule) => rule.id === "image-file-size-maximum")).toMatchObject({
      constraint: { field: "file.size_bytes", operator: "lte", value: 5000000 },
    });
    expect(spec.rules.setWide.find((rule) => rule.id === "front-facing-natural-daylight")).toMatchObject({
      modality: "required",
      constraint: { field: "capture.lighting", operator: "equals", value: "front_facing_natural_daylight" },
    });
    expect(spec.rules.setWide.find((rule) => rule.id === "personal-style-encouraged")).toMatchObject({
      modality: "encouraged",
      constraint: { field: "clothing.style", operator: "equals", value: "personal_style" },
    });
  });

  test("retains Muse's hair-state close-ups, preferred heights, and ambiguous approximate size", () => {
    const spec = bySeries.get("muse-model-management-nyc:email");
    for (const [id, hairState] of [["close-up-hair-up", "up"], ["close-up-hair-down", "down"]]) {
      expect(expressionLeaves(spec.rules.shots.slots.find((slot) => slot.id === id).match)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "shot.frame", value: "close_up" }),
          expect.objectContaining({ field: "appearance.hair_state", value: hairState }),
        ]),
      );
    }
    expect(spec.rules.eligibility.map((rule) => [rule.id, rule.constraint.value])).toEqual(
      expect.arrayContaining([
        ["preferred-minimum-height", 175.26],
        ["men-preferred-minimum-height", 180.34],
      ]),
    );
    expect(spec.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fact: "files.per_file_size", reason: "ambiguous" }),
      ]),
    );
  });

  test("marks Wilhelmina's selected-market gated source requirements unknown", () => {
    const spec = bySeries.get("wilhelmina:selected-market-online");
    expect(spec.scope.market).toMatchObject({
      kind: "selected_market",
      code: "new-york-miami-los-angeles-london",
    });
    expect(spec.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fact: "application.gated_fields",
          reason: "source_access_limited",
        }),
      ]),
    );
    const usOnlyInterests = spec.rules.applicationFields.filter((field) =>
      ["sports-fitness-interest", "willymoves-interest"].includes(field.id),
    );
    expect(usOnlyInterests).toHaveLength(2);
    expect(
      usOnlyInterests.every(
        (field) => field.appliesWhen.field === "application.destination_market",
      ),
    ).toBe(true);
    for (const field of usOnlyInterests) {
      expect(field.appliesWhen).toEqual({
        field: "application.destination_market",
        operator: "in",
        value: ["New York", "Miami", "Los Angeles"],
        unit: null,
      });
    }
  });

  test("scopes IMG's adult route while preserving the minor boundary and gated unknowns", () => {
    const spec = bySeries.get("img-models-global:online");
    const adult = { field: "applicant.age_years", operator: "gte", value: 18, unit: "year" };
    expect(spec.rules.shots.count).toMatchObject({ minimum: 3, maximum: 3, appliesWhen: adult });
    expect(spec.rules.shots.slots).toHaveLength(3);
    for (const slot of spec.rules.shots.slots) {
      expect(slot.appliesWhen).toEqual(adult);
    }
    expect(spec.rules.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "accepted-image-formats",
          constraint: expect.objectContaining({ field: "file.mime_type", operator: "in" }),
        }),
        expect.objectContaining({
          id: "maximum-image-size",
          constraint: { field: "file.size_bytes", operator: "lte", value: 30000000, unit: "byte" },
        }),
      ]),
    );
    for (const rule of spec.rules.files) {
      expect(rule.appliesWhen).toEqual(adult);
    }
    expect(spec.rules.eligibility.find((rule) => rule.id === "under-14-not-accepted")).toMatchObject({
      modality: "prohibited",
      constraint: { field: "applicant.age_years", operator: "lt", value: 14, unit: "year" },
    });
    expect(spec.rules.applicationFields.find((field) => field.id === "nationality")).toMatchObject({
      field: "applicant.nationality",
      presence: "required",
      appliesWhen: adult,
    });
    expect(spec.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fact: "application.gated_fields", reason: "source_access_limited" }),
        expect.objectContaining({ fact: "shots.count.minimum", reason: "source_access_limited" }),
      ]),
    );
  });

  test("rejects known IMG media rules that leak into a source-limited minor scope", () => {
    const mutated = clone(registry);
    const img = mutated.specs.find((spec) => spec.seriesId === "img-models-global:online");
    img.rules.shots.count.appliesWhen = null;
    img.rules.shots.slots.forEach((slot) => {
      slot.appliesWhen = null;
    });
    img.rules.files.forEach((rule) => {
      rule.appliesWhen = null;
    });

    const errors = collectSemanticErrors({
      manifest: mutated.manifest,
      taxonomy: mutated.taxonomy,
      specs: mutated.specs,
      specPaths: mutated.specPaths,
      specSchema,
    });
    const overlapLocations = errors
      .filter((error) => error.code === "source-access-overlap")
      .map((error) => error.location);
    expect(overlapLocations).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/rules/shots/count"),
        expect.stringContaining("/rules/shots/slots/"),
        expect.stringContaining("/rules/files/"),
      ]),
    );
  });

  test("semantic validation rejects an unknown taxonomy field in a scoped shot count", () => {
    const mutated = clone(registry);
    const img = mutated.specs.find((spec) => spec.seriesId === "img-models-global:online");
    img.rules.shots.count.appliesWhen.field = "applicant.unpublished_age_gate";

    const errors = collectSemanticErrors({
      manifest: mutated.manifest,
      taxonomy: mutated.taxonomy,
      specs: mutated.specs,
      specPaths: mutated.specPaths,
      specSchema,
    });
    expect(errors.map((error) => error.code)).toContain("unknown-taxonomy-field");
  });

  test("semantic validation rejects dangling evidence and unsupported blocking", () => {
    const mutated = clone(registry);
    const target = mutated.specs.find(
      (spec) => spec.seriesId === "elite-models-na:online-general",
    );
    target.rules.shots.slots[0].evidenceIds = ["missing-evidence"];
    target.evaluationMode = "blocking";

    const errors = collectSemanticErrors({
      manifest: mutated.manifest,
      taxonomy: mutated.taxonomy,
      specs: mutated.specs,
      specPaths: mutated.specPaths,
      specSchema,
    });
    expect(errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["dangling-evidence", "unsupported-blocking-mode"]),
    );
  });

  test("semantic validation rejects bad bounds, missing unknowns, and inverted prohibitions", () => {
    const mutated = clone(registry);
    const global = mutated.specs.find(
      (spec) => spec.seriesId === "elite-model-management-global:online",
    );
    global.rules.shots.count.minimum = 4;
    global.unknowns = global.unknowns.filter(
      (unknown) => unknown.fact !== "shots.image_reuse",
    );
    const models1 = mutated.specs.find((spec) => spec.seriesId === "models1-uk:online");
    models1.rules.setWide.find((rule) => rule.id === "no-filters").constraint.value = false;

    const errors = collectSemanticErrors({
      manifest: mutated.manifest,
      taxonomy: mutated.taxonomy,
      specs: mutated.specs,
      specPaths: mutated.specPaths,
      specSchema,
    });
    expect(errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "count-bounds",
        "missing-unknown",
        "inverted-prohibition",
      ]),
    );
  });

  test("requires the manifest to select the newest revision", () => {
    const mutated = clone(registry);
    const first = mutated.specs.find(
      (spec) => spec.seriesId === "elite-models-na:online-general",
    );
    const second = clone(first);
    second.revision = 2;
    second.revisionId = `${second.seriesId}@2`;
    second.supersedesRevisionId = first.revisionId;
    mutated.specs.push(second);
    mutated.specPaths.push("elite-models-na-online-general--r2.json");

    const errors = collectSemanticErrors({
      manifest: mutated.manifest,
      taxonomy: mutated.taxonomy,
      specs: mutated.specs,
      specPaths: mutated.specPaths,
      specSchema,
    });
    expect(errors.map((error) => error.code)).toContain("manifest-not-latest");
  });

  test("requires agency confirmation on every blocking assertion", () => {
    const mutated = clone(registry);
    const models1 = mutated.specs.find((spec) => spec.seriesId === "models1-uk:online");
    models1.evaluationMode = "blocking";
    models1.review.authority = "agency_confirmed";
    models1.review.method = "agency_confirmation";
    models1.evidence[0].authority = "agency_confirmed";

    const errors = collectSemanticErrors({
      manifest: mutated.manifest,
      taxonomy: mutated.taxonomy,
      specs: mutated.specs,
      specPaths: mutated.specPaths,
      specSchema,
    });
    expect(errors.map((error) => error.code)).toContain(
      "unsupported-blocking-assertion",
    );
    expect(errors.map((error) => error.code)).not.toContain(
      "unsupported-blocking-mode",
    );
  });

  test("rejects uncontrolled unknowns, stale verified records, and single-pass verification", () => {
    const mutated = clone(registry);
    const japan = mutated.specs.find((spec) => spec.seriesId === "elite-japan-tokyo:online");
    japan.unknowns[0].fact = "files.uncontrolled_fact";
    japan.review.method = "single_reviewer";
    japan.review.reviewers = [japan.review.reviewers[0]];
    japan.lifecycle.nextReviewOn = null;

    const errors = collectSemanticErrors({
      manifest: mutated.manifest,
      taxonomy: mutated.taxonomy,
      specs: mutated.specs,
      specPaths: mutated.specPaths,
      specSchema,
      asOf: new Date("2026-11-08T12:00:00Z"),
    });
    expect(errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "unknown-fact",
        "stale-status",
        "unreviewed-verified",
        "missing-review-deadline",
      ]),
    );
  });

  test("does not accept an unsubstantiated agency-confirmation review", () => {
    const mutated = clone(registry);
    const japan = mutated.specs.find((spec) => spec.seriesId === "elite-japan-tokyo:online");
    japan.review.method = "agency_confirmation";
    japan.review.reviewers = [];

    const errors = collectSemanticErrors({
      manifest: mutated.manifest,
      taxonomy: mutated.taxonomy,
      specs: mutated.specs,
      specPaths: mutated.specPaths,
      specSchema,
    });
    expect(errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["unreviewed-verified", "agency-confirmation-review"]),
    );
  });

  test("cross-checks evidence/publication dates and scalar equality values", () => {
    const mutated = clone(registry);
    mutated.manifest.publishedOn = "2026-08-08";
    const elite = mutated.specs.find(
      (spec) => spec.seriesId === "elite-models-na:online-general",
    );
    elite.evidence[0].retrievedOn = "2026-08-10";
    elite.rules.setWide.find((rule) => rule.id === "no-smiles").constraint.value = [true];

    const errors = collectSemanticErrors({
      manifest: mutated.manifest,
      taxonomy: mutated.taxonomy,
      specs: mutated.specs,
      specPaths: mutated.specPaths,
      specSchema,
    });
    expect(errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "manifest-publication-order",
        "evidence-date-order",
        "operator-value",
      ]),
    );
  });

  test("normalizes both MB and KB source units deterministically", () => {
    const mutated = clone(registry);
    const models1 = mutated.specs.find((spec) => spec.seriesId === "models1-uk:online");
    const fileLimit = models1.rules.files[0];
    fileLimit.sourceValue = {
      value: 500,
      unit: "KB",
      normalization: "decimal_conservative",
    };
    fileLimit.constraint.value = 500000;

    const validErrors = collectSemanticErrors({
      manifest: mutated.manifest,
      taxonomy: mutated.taxonomy,
      specs: mutated.specs,
      specPaths: mutated.specPaths,
      specSchema,
    });
    expect(validErrors.map((error) => error.code)).not.toContain("file-normalization");

    fileLimit.constraint.value = 500001;
    const invalidErrors = collectSemanticErrors({
      manifest: mutated.manifest,
      taxonomy: mutated.taxonomy,
      specs: mutated.specs,
      specPaths: mutated.specPaths,
      specSchema,
    });
    expect(invalidErrors.map((error) => error.code)).toContain("file-normalization");
  });
});
