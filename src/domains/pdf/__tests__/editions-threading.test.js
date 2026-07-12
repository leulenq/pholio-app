/**
 * Editions threading through the orchestrator (composition/index.js) —
 * phase 2 wiring contracts:
 *
 * 1. LEGACY EXACTNESS (the critical regression): with `editionsEnabled`
 *    false/absent, designComposition and composeCompCard output is
 *    deep-equal to the frozen pre-editions baseline for fixed seeds. The
 *    baseline JSON was generated from the engine BEFORE the editions
 *    threading landed — no accidental default-on can pass this.
 * 2. Edition resolution happens ONCE per take in composeCompCard and the
 *    plan carries `plan.edition`, `plan.editionProgram`, and
 *    `plan.takeSignature` in the shared contract shapes.
 * 3. Capability inputs are derived from what the orchestrator already has
 *    (pool size, kids category, matteById presence, pairable support).
 */

const { designComposition } = require("../composition/composition-director");
const { composeCompCard } = require("../composition");
const { KIDS_POOL, EDITIONS } = require("../composition/editions");
const {
  directorInput,
  DIRECTOR_SEEDS,
  composeProfile,
  composeImages,
  COMPOSE_SEEDS,
  COMPOSE_ARCHETYPE,
} = require("./__fixtures__/editions-legacy-inputs");

const BASELINE = require("./__fixtures__/editions-legacy-baseline.json");

const compose = (options = {}, profileOverrides = {}) =>
  composeCompCard({
    profile: { ...composeProfile(), ...profileOverrides },
    images: composeImages(),
    archetype: COMPOSE_ARCHETYPE,
    options,
  });

// ── 1. legacy exactness ─────────────────────────────────────────────────────

describe("legacy exactness — editions disabled/absent is byte-identical to the pre-editions engine", () => {
  test("designComposition without edition inputs deep-equals the frozen baseline", () => {
    for (const seed of DIRECTOR_SEEDS) {
      const plan = JSON.parse(JSON.stringify(designComposition(directorInput(seed))));
      expect(plan).toEqual(BASELINE.director[seed]);
    }
  });

  test("composeCompCard with editionsEnabled ABSENT deep-equals the frozen baseline", async () => {
    for (const seed of COMPOSE_SEEDS) {
      const result = await compose({ seed });
      expect(JSON.parse(JSON.stringify(result.plan))).toEqual(BASELINE.compose[seed].plan);
      expect(result.guardrailReport.status).toBe(BASELINE.compose[seed].guardrailStatus);
    }
  });

  test("composeCompCard with editionsEnabled: false deep-equals the frozen baseline", async () => {
    for (const seed of COMPOSE_SEEDS) {
      const result = await compose({ seed, editionsEnabled: false });
      expect(JSON.parse(JSON.stringify(result.plan))).toEqual(BASELINE.compose[seed].plan);
    }
  });

  test("disabled plans carry no edition fields at all", async () => {
    const { plan } = await compose({ seed: "no-edition-keys" });
    expect(plan.edition).toBeUndefined();
    expect(plan.editionProgram).toBeUndefined();
    expect(plan.takeSignature).toBeUndefined();
    expect(plan.language.scale).toBeUndefined();
    expect(plan.language.field).toBeUndefined();
  });
});

// ── 2. contract shapes ──────────────────────────────────────────────────────

describe("editions enabled — plan contract shapes", () => {
  test("plan.edition = { id, label, tone, field, register }", async () => {
    const { plan } = await compose({ seed: "shape-1", editionsEnabled: true });
    expect(Object.keys(plan.edition).sort()).toEqual(
      ["field", "id", "label", "register", "tone"].sort(),
    );
    expect(EDITIONS.map((e) => e.id)).toContain(plan.edition.id);
    expect(["paper", "warm", "plane", "dark"]).toContain(plan.edition.field);
    expect(["quiet", "standard", "display"]).toContain(plan.edition.register);
    expect(typeof plan.edition.label).toBe("string");
    expect(typeof plan.edition.tone).toBe("string");
  });

  test("plan.editionProgram = { def, operators } and the resolution is logged", async () => {
    const { plan } = await compose({ seed: "shape-2", editionsEnabled: true });
    expect(plan.editionProgram.def.id).toBe(plan.edition.id);
    expect(plan.editionProgram.operators.field).toBe(plan.edition.field);
    expect(plan.editionProgram.operators.register).toBe(plan.edition.register);
    expect(typeof plan.editionProgram.operators.because).toBe("string");
    const decision = plan.decisions.find((d) => d.aspect === "edition");
    expect(decision.choice).toBe(plan.edition.id);
  });

  test("plan.takeSignature = { edition, structure, heroId, field, register, voice } (structure null on the legacy front)", async () => {
    const { plan } = await compose({ seed: "shape-3", editionsEnabled: true });
    expect(plan.takeSignature).toEqual({
      edition: plan.edition.id,
      structure: null, // no front program ran — the front program fills its meta
      heroId: plan.front.imageId,
      field: plan.edition.field,
      register: plan.edition.register,
      voice: plan.language.voiceId,
    });
  });

  test("deterministic: same seed + flag ⇒ same edition, operators, signature", async () => {
    const a = await compose({ seed: "det-1", editionsEnabled: true });
    const b = await compose({ seed: "det-1", editionsEnabled: true });
    expect(a.plan.edition).toEqual(b.plan.edition);
    expect(a.plan.takeSignature).toEqual(b.plan.takeSignature);
  });

  test("language threading: voice inside the edition pool, scale exposed", async () => {
    for (let i = 0; i < 8; i++) {
      const { plan } = await compose({ seed: `thread-${i}`, editionsEnabled: true });
      expect(plan.editionProgram.def.voices).toContain(plan.language.voiceId);
      expect(plan.language.scale.register).toBe(plan.edition.register);
      expect(plan.language.scale.minPt).toBeGreaterThan(0);
      expect(plan.language.scale.maxPt).toBeGreaterThanOrEqual(plan.language.scale.minPt);
    }
  });
});

// ── 3. resolution inputs + gestures ─────────────────────────────────────────

describe("editions enabled — resolution inputs and cycling gestures", () => {
  test("opts.edition pins a suitable edition", async () => {
    const { plan } = await compose({
      seed: "pin-1",
      editionsEnabled: true,
      edition: "gallery-monograph",
    });
    expect(plan.edition.id).toBe("gallery-monograph");
  });

  test("matte-gated editions unlock only with an alpha matte in opts.matteById", async () => {
    // pinned but unsuitable without a matte — falls to the draw
    const withoutMatte = await compose({
      seed: "matte-1",
      editionsEnabled: true,
      edition: "cover-story",
    });
    expect(withoutMatte.plan.edition.id).not.toBe("cover-story");

    const withMatte = await compose({
      seed: "matte-1",
      editionsEnabled: true,
      edition: "cover-story",
      matteById: new Map([["img-1", { maskGrid: [[1]], source: "alpha" }]]),
    });
    expect(withMatte.plan.edition.id).toBe("cover-story");

    // a sharp-only 'studio' estimate is NOT an alpha matte
    const studioOnly = await compose({
      seed: "matte-1",
      editionsEnabled: true,
      edition: "cover-story",
      matteById: new Map([["img-1", { maskGrid: [[1]], source: "studio" }]]),
    });
    expect(studioOnly.plan.edition.id).not.toBe("cover-story");
  });

  test("kids profiles resolve only inside the kids draw pool", async () => {
    for (let i = 0; i < 10; i++) {
      const { plan } = await compose(
        { seed: `kid-${i}`, editionsEnabled: true },
        { age: 12 },
      );
      expect(KIDS_POOL).toContain(plan.edition.id);
      expect(plan.edition.field).not.toBe("dark");
    }
  });

  test("avoidEditions cycles: the immediate predecessor is never re-served", async () => {
    let prev = null;
    for (let i = 0; i < 8; i++) {
      const { plan } = await compose({
        seed: `cycle-${i}`,
        editionsEnabled: true,
        avoidEditions: prev ? [prev] : [],
      });
      if (prev) expect(plan.edition.id).not.toBe(prev);
      prev = plan.edition.id;
    }
  });

  test("cross-seed spread: 12 seeds reach ≥ 4 editions and ≥ 6 distinct take signatures", async () => {
    const editions = new Set();
    const signatures = new Set();
    for (let i = 0; i < 12; i++) {
      const { plan } = await compose({ seed: `spread-${i}`, editionsEnabled: true });
      editions.add(plan.edition.id);
      signatures.add(JSON.stringify(plan.takeSignature));
    }
    expect(editions.size).toBeGreaterThanOrEqual(4);
    expect(signatures.size).toBeGreaterThanOrEqual(6);
  });

  test("avoidHeroId threads through to the director draw", async () => {
    // the fixture pool has a single clamp-eligible hero (img-1), so the
    // guarantee clause (≥2 eligible) does not bite — assert the option is
    // accepted and the plan still lands on a valid hero.
    const { plan } = await compose({
      seed: "avoid-hero",
      editionsEnabled: true,
      avoidHeroId: "img-1",
    });
    expect(plan.front.imageId).toBeTruthy();
    expect(plan.takeSignature.heroId).toBe(plan.front.imageId);
  });
});
