"use strict";

const {
  computeImportanceFromDecisions,
  impactRatio,
  labelOf,
} = require("../../src/domains/matching/preference-learner");

const positives = (n, ev) => Array.from({ length: n }, () => ({ evidence: ev, label: "positive" }));
const negatives = (n, ev) => Array.from({ length: n }, () => ({ evidence: ev, label: "negative" }));

describe("preference-learner :: computeImportanceFromDecisions", () => {
  const prior = { look: 1, height: 1 };

  it("shifts importance toward the dimension that discriminates advanced from passed", () => {
    // Advanced talent score high on look, passed score low; height identical.
    const cases = [...positives(3, { look: 0.9, height: 0.7 }), ...negatives(3, { look: 0.3, height: 0.7 })];
    const r = computeImportanceFromDecisions(cases, prior);
    expect(r.discrimination.look).toBeGreaterThan(0.5);
    expect(Math.abs(r.discrimination.height)).toBeLessThan(0.01);
    expect(r.importance.look).toBeGreaterThan(r.importance.height);
  });

  it("stays near the prior with little data (shrinkage / fair fallback)", () => {
    const cases = [...positives(1, { look: 1, height: 0 }), ...negatives(1, { look: 0, height: 1 })];
    const r = computeImportanceFromDecisions(cases, prior);
    expect(r.alpha).toBeLessThan(0.15); // small n ⇒ small blend
    expect(r.importance.look).toBeGreaterThan(0.4);
    expect(r.importance.look).toBeLessThan(0.6); // hasn't run away from prior 0.5
  });

  it("lets the learned signal dominate with lots of data", () => {
    const cases = [...positives(60, { look: 0.9, height: 0.7 }), ...negatives(60, { look: 0.3, height: 0.7 })];
    const r = computeImportanceFromDecisions(cases, prior);
    expect(r.alpha).toBeCloseTo(0.8, 5); // clamped
    expect(r.importance.look).toBeGreaterThan(0.75);
  });

  it("returns normalized importance (sums to 1)", () => {
    const cases = [...positives(2, { look: 0.8, height: 0.5 }), ...negatives(2, { look: 0.2, height: 0.5 })];
    const r = computeImportanceFromDecisions(cases, prior);
    const sum = Object.values(r.importance).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("labelOf maps decisions to preference labels", () => {
    expect(labelOf("advance")).toBe("positive");
    expect(labelOf("book")).toBe("positive");
    expect(labelOf("pass")).toBe("negative");
    expect(labelOf("release")).toBe("negative");
    expect(labelOf("interview")).toBeNull();
  });
});

describe("preference-learner :: impactRatio (4/5ths rule)", () => {
  it("flags a disparate selection rate", () => {
    const r = impactRatio({ male: { selected: 8, total: 10 }, female: { selected: 4, total: 10 } });
    expect(r.impactRatio).toBeCloseTo(0.5, 4);
    expect(r.flagged).toBe(true);
  });

  it("does not flag balanced selection", () => {
    const r = impactRatio({ male: { selected: 7, total: 10 }, female: { selected: 6, total: 10 } });
    expect(r.impactRatio).toBeGreaterThanOrEqual(0.8);
    expect(r.flagged).toBe(false);
  });

  it("handles a single group and empty input", () => {
    expect(impactRatio({ a: { selected: 3, total: 5 } }).impactRatio).toBe(1);
    expect(impactRatio({}).impactRatio).toBeNull();
  });
});
