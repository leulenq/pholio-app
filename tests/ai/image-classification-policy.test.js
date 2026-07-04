const {
  applyClassificationPolicy,
  bandForField,
  stableAuditSample,
} = require("../../src/domains/talent/services/image-classification-policy");

describe("applyClassificationPolicy", () => {
  test("high shot confidence auto-writes column when unset", () => {
    const r = applyClassificationPolicy({
      imageRow: { shot_type: null, style_type: null, image_type: null, metadata: {} },
      classification: {
        shot_type: "headshot",
        style_type: null,
        image_type: "digital",
        confidence: { shot_type: 0.92, style_type: 0.4, image_type: 0.85 },
        signals: {},
        reasoning: "test",
        uncertainty_factors: [],
      },
    });
    expect(r.band).toBe("auto");
    expect(r.columnUpdates.shot_type).toBe("headshot");
    expect(r.columnUpdates.image_type).toBe("digital");
    expect(r.columnUpdates.style_type).toBeUndefined();
  });

  test("never overwrites user-set source", () => {
    const r = applyClassificationPolicy({
      imageRow: {
        shot_type: "full_length",
        style_type: null,
        image_type: null,
        metadata: { ai: { classification: { source: "user" } } },
      },
      classification: {
        shot_type: "headshot",
        style_type: "editorial",
        image_type: "portfolio",
        confidence: { shot_type: 0.99, style_type: 0.99, image_type: 0.99 },
        signals: {},
        uncertainty_factors: [],
      },
    });
    expect(r.columnUpdates.shot_type).toBeUndefined();
    expect(r.metadataPatch.ai.classification.source).toBe("user");
  });

  test("style_type auto-writes at high confidence when unset", () => {
    const r = applyClassificationPolicy({
      imageRow: { id: "00000000-0000-4000-8000-000000000001", shot_type: "headshot", style_type: null, image_type: "portfolio", metadata: {} },
      classification: {
        shot_type: "headshot",
        style_type: "editorial",
        image_type: "portfolio",
        confidence: { shot_type: 0.92, style_type: 0.91, image_type: 0.88 },
        signals: {},
        uncertainty_factors: [],
      },
    });
    expect(r.columnUpdates.style_type).toBe("editorial");
  });

  test("uncertainty factors downgrade band", () => {
    const r = applyClassificationPolicy({
      imageRow: { shot_type: null, metadata: {} },
      classification: {
        shot_type: "headshot",
        style_type: "editorial",
        image_type: "portfolio",
        confidence: { shot_type: 0.95, style_type: 0.9, image_type: 0.9 },
        uncertainty_factors: ["partial_body", "heavy_styling", "unclear_angle"],
      },
    });
    expect(r.band).not.toBe("auto");
    expect(r.columnUpdates.shot_type).toBeUndefined();
  });

  test("close shot alternates within 0.15 downgrade band", () => {
    const r = applyClassificationPolicy({
      imageRow: { shot_type: null, metadata: {} },
      classification: {
        shot_type: "headshot",
        style_type: null,
        image_type: "digital",
        confidence: { shot_type: 0.91, style_type: 0.5, image_type: 0.85 },
        shot_type_alternates: [{ value: "three_quarter", confidence: 0.88 }],
        uncertainty_factors: [],
      },
    });
    expect(r.band).not.toBe("auto");
    expect(r.columnUpdates.shot_type).toBeUndefined();
  });
});

describe("stableAuditSample", () => {
  test("is deterministic per image id", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(stableAuditSample(id)).toBe(stableAuditSample(id));
  });

  test("audit sample blocks auto column write", () => {
    let sampledId = null;
    for (let i = 0; i < 200; i += 1) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      if (stableAuditSample(id)) {
        sampledId = id;
        break;
      }
    }
    expect(sampledId).not.toBeNull();

    const r = applyClassificationPolicy({
      imageRow: { id: sampledId, shot_type: null, metadata: {} },
      classification: {
        shot_type: "headshot",
        style_type: null,
        image_type: null,
        confidence: { shot_type: 0.95, style_type: 0.5, image_type: 0.5 },
        uncertainty_factors: [],
      },
    });
    expect(r.columnUpdates.shot_type).toBeUndefined();
    expect(r.band).toBe("suggest");
    expect(r.metadataPatch.ai.classification.audit_sample).toBe(true);
  });
});

describe("bandForField", () => {
  test("threshold bands", () => {
    expect(bandForField(0.9, "shot_type")).toBe("auto");
    expect(bandForField(0.7, "shot_type")).toBe("suggest");
    expect(bandForField(0.5, "shot_type")).toBe("ask");
  });
});
