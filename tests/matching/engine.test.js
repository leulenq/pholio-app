"use strict";

const { mergeCriteria } = require("../../src/domains/matching/resolve-criteria");
const { solveConstraints } = require("../../src/domains/matching/constraint-solver");
const { evaluate, adaptBoardToCriteria } = require("../../src/domains/matching");

describe("resolve-criteria :: mergeCriteria inheritance", () => {
  it("takes the union of constraints and lets a child add keys", () => {
    const merged = mergeCriteria([
      { constraints: [{ key: "age", type: "age_range", severity: "veto", params: { min: 18 } }] },
      { constraints: [{ key: "height", type: "height_range", severity: "veto", params: { min: 175 } }] },
    ]);
    const keys = merged.constraints.map((c) => c.key).sort();
    expect(keys).toEqual(["age", "height"]);
  });

  it("protects an agency-locked constraint from child removal/loosening", () => {
    const merged = mergeCriteria([
      { constraints: [{ key: "minors", type: "minors_policy", severity: "veto", locked: true, params: { mode: "exclude" } }] },
      { constraints: [{ key: "minors", type: "minors_policy", severity: "veto", params: { mode: "consent_required" } }] },
    ]);
    const minors = merged.constraints.find((c) => c.key === "minors");
    expect(minors.locked).toBe(true);
    expect(minors.params.mode).toBe("exclude"); // child could not loosen it
  });

  it("resolves signal priors most-specific-wins per dimension", () => {
    const merged = mergeCriteria([
      { signal_relevance: { importance: { look: 1, height: 3 }, interactions: {} } },
      { signal_relevance: { importance: { look: 5 }, interactions: { "height|look": 0.5 } } },
    ]);
    expect(merged.signal_relevance.importance).toEqual({ look: 5, height: 3 });
    expect(merged.signal_relevance.interactions).toEqual({ "height|look": 0.5 });
  });
});

describe("constraint-solver :: feasibility, not scoring", () => {
  const base = [
    { key: "age", type: "age_range", severity: "veto", params: { min: 18, max: 30 } },
    { key: "height", type: "height_range", severity: "veto", params: { min: 175, max: 182 } },
  ];

  it("passes a feasible profile", () => {
    const r = solveConstraints({ age: 22, height_cm: 178 }, base);
    expect(r.feasible).toBe(true);
    expect(r.vetoes).toHaveLength(0);
  });

  it("vetoes on a hard failure with a reason", () => {
    const r = solveConstraints({ age: 22, height_cm: 160 }, base);
    expect(r.feasible).toBe(false);
    expect(r.vetoes[0].reason).toMatch(/height/);
  });

  it("treats missing data as indeterminate, NOT a false fail", () => {
    const r = solveConstraints({ age: 22 }, base); // no height
    expect(r.feasible).toBe(true); // not disqualified for missing data
    expect(r.indeterminate.map((g) => g.key)).toContain("height");
  });

  it("enforces the minors gate", () => {
    const c = [{ key: "minors", type: "minors_policy", severity: "veto", locked: true, params: { mode: "exclude" } }];
    expect(solveConstraints({ age: 16 }, c).feasible).toBe(false);
    expect(solveConstraints({ age: 25 }, c).feasible).toBe(true);
  });
});

describe("engine :: evaluate produces an argument, not just a number", () => {
  const criteria = {
    constraints: [
      { key: "age", type: "age_range", severity: "veto", params: { min: 18, max: 30 } },
      { key: "height", type: "height_range", severity: "veto", params: { min: 175, max: 182 } },
    ],
    signal_relevance: { importance: { height: 3, look: 3, age: 1 }, interactions: {} },
    look_target: { editorial: 1 },
  };

  it("advances a strong, feasible candidate with explanations", async () => {
    const profile = { id: "p1", age: 22, height_cm: 178, gender: "female", fit_score_editorial: 85, fit_scores_calculated_at: new Date().toISOString() };
    const brief = await evaluate({ profile, scope: { type: "board", id: "b1" }, criteria });
    expect(brief.feasible).toBe(true);
    expect(["advance", "consider"]).toContain(brief.posture);
    expect(brief.band).toBe("strong");
    expect(brief.fit_index).toBeGreaterThan(70);
    expect(brief.case_for.length).toBeGreaterThan(0);
    expect(brief.signal_importance).toHaveProperty("look");
  });

  it("marks a hard-failing candidate ineligible with no fit_index", async () => {
    const profile = { id: "p2", age: 22, height_cm: 158, gender: "female", fit_score_editorial: 85 };
    const brief = await evaluate({ profile, scope: { type: "board", id: "b1" }, criteria });
    expect(brief.feasible).toBe(false);
    expect(brief.posture).toBe("ineligible");
    expect(brief.fit_index).toBeNull();
    expect(brief.case_against.some((c) => c.blocking)).toBe(true);
  });

  it("surfaces missing data as low confidence + must-confirm, not a zero", async () => {
    const profile = { id: "p3", age: 22, gender: "female", fit_score_editorial: 80, fit_scores_calculated_at: new Date().toISOString() }; // no height
    const brief = await evaluate({ profile, scope: { type: "board", id: "b1" }, criteria });
    expect(brief.feasible).toBe(true);
    expect(brief.missing.join(" ")).toMatch(/height/);
  });

  it("reports interaction insights when signals are declared complementary", async () => {
    const complementary = {
      ...criteria,
      signal_relevance: { importance: { height: 1, look: 1 }, interactions: { "height|look": 1 } },
    };
    const profile = { id: "p4", age: 22, height_cm: 181, gender: "female", fit_score_editorial: 20, fit_scores_calculated_at: new Date().toISOString() };
    const brief = await evaluate({ profile, scope: { type: "board", id: "b1" }, criteria: complementary });
    expect(brief.interaction_notes.length).toBeGreaterThan(0);
    expect(brief.interaction_notes[0].note).toMatch(/complementary/);
  });
});

describe("engine :: legacy board adapter", () => {
  it("maps board_requirements + weights into criteria the engine can run", async () => {
    const criteria = adaptBoardToCriteria(
      { min_age: 18, max_age: 30, min_height_cm: 175, max_height_cm: 182, genders: ["female"] },
      { age_weight: 1, height_weight: 3, measurements_weight: 2 },
    );
    expect(criteria.constraints.map((c) => c.type)).toEqual(
      expect.arrayContaining(["age_range", "height_range", "gender_in"]),
    );
    expect(criteria.signal_relevance.importance).toHaveProperty("look"); // look always added
    const brief = await evaluate({ profile: { id: "p5", age: 24, height_cm: 179, gender: "female" }, scope: { type: "board", id: "b1" }, criteria });
    expect(brief.feasible).toBe(true);
  });
});
