"use strict";

const {
  solveConstraints,
  datesOverlap,
} = require("../../src/domains/matching/constraint-solver");
const {
  adaptBriefToCriteria,
  evaluate,
} = require("../../src/domains/matching");

const availability = (params = { start: "2026-08-01", end: "2026-08-05" }) => [
  { key: "availability", type: "availability", severity: "veto", params },
];

describe("constraint-solver :: availability (option/hold/booked/bookout)", () => {
  it("vetoes a booked overlap on the shoot dates", () => {
    const r = solveConstraints({ id: "p" }, availability(), {
      commitments: [{ kind: "booked", start_date: "2026-08-03", end_date: "2026-08-04" }],
    });
    expect(r.feasible).toBe(false);
    expect(r.vetoes[0].reason).toMatch(/booked/);
  });

  it("vetoes a bookout overlap", () => {
    const r = solveConstraints({ id: "p" }, availability(), {
      commitments: [{ kind: "bookout", start_date: "2026-08-01", end_date: "2026-08-10" }],
    });
    expect(r.feasible).toBe(false);
  });

  it("treats a 1st-option overlap as confirm-first (indeterminate), NOT a veto", () => {
    const r = solveConstraints({ id: "p" }, availability(), {
      commitments: [{ kind: "option", option_tier: 1, start_date: "2026-08-03", end_date: "2026-08-04" }],
    });
    expect(r.feasible).toBe(true);
    expect(r.indeterminate.map((g) => g.key)).toContain("availability");
    expect(r.indeterminate[0].reason).toMatch(/option.*confirm/i);
  });

  it("passes when the talent is free on the dates", () => {
    const r = solveConstraints({ id: "p" }, availability(), { commitments: [] });
    expect(r.feasible).toBe(true);
    expect(r.gates[0].status).toBe("pass");
  });

  it("is indeterminate (not a silent pass) when the calendar is untracked", () => {
    const r = solveConstraints({ id: "p" }, availability(), {});
    expect(r.indeterminate.map((g) => g.key)).toContain("availability");
  });
});

describe("constraint-solver :: usage_exclusivity conflict", () => {
  const c = [
    {
      key: "usage_exclusivity",
      type: "usage_exclusivity",
      severity: "veto",
      params: { exclusivity: true, category: "cosmetics", start: "2026-08-01" },
    },
  ];

  it("vetoes a live same-category exclusivity commitment", () => {
    const r = solveConstraints({ id: "p" }, c, {
      commitments: [{ exclusivity: true, category: "cosmetics", exclusivity_until: "2026-12-01" }],
    });
    expect(r.feasible).toBe(false);
    expect(r.vetoes[0].reason).toMatch(/cosmetics/);
  });

  it("allows a different category", () => {
    const r = solveConstraints({ id: "p" }, c, {
      commitments: [{ exclusivity: true, category: "denim", exclusivity_until: "2026-12-01" }],
    });
    expect(r.feasible).toBe(true);
  });

  it("ignores an expired exclusivity", () => {
    const r = solveConstraints({ id: "p" }, c, {
      commitments: [{ exclusivity: true, category: "cosmetics", exclusivity_until: "2025-01-01" }],
    });
    expect(r.feasible).toBe(true);
  });
});

describe("datesOverlap", () => {
  it("detects overlap and non-overlap correctly", () => {
    expect(datesOverlap("2026-08-01", "2026-08-05", "2026-08-04", "2026-08-09")).toBe(true);
    expect(datesOverlap("2026-08-01", "2026-08-05", "2026-08-06", "2026-08-09")).toBe(false);
    expect(datesOverlap("2026-08-01", null, "2030-01-01", "2030-01-02")).toBe(true); // open-ended
  });
});

describe("adaptBriefToCriteria", () => {
  it("compiles brief facts into constraints + look target", () => {
    const criteria = adaptBriefToCriteria({
      shoot_start: "2026-08-01",
      shoot_end: "2026-08-05",
      usage: { exclusivity: true, category: "cosmetics" },
      media_requirements: ["digitals", "polaroids"],
      market: "Paris",
      look_target: { editorial: 1 },
    });
    const types = criteria.constraints.map((c) => c.type);
    expect(types).toEqual(
      expect.arrayContaining([
        "availability",
        "usage_exclusivity",
        "media_required",
        "market_in",
      ]),
    );
    expect(criteria.look_target).toEqual({ editorial: 1 });
  });

  it("parses JSON-string usage/media fields (DB round-trip shape)", () => {
    const criteria = adaptBriefToCriteria({
      shoot_start: "2026-08-01",
      usage: JSON.stringify({ exclusivity: true, category: "denim" }),
      media_requirements: JSON.stringify(["reel"]),
    });
    const excl = criteria.constraints.find((c) => c.type === "usage_exclusivity");
    expect(excl.params.category).toBe("denim");
  });
});

describe("engine :: brief conflict vetoes an otherwise strong candidate", () => {
  it("a great look but booked on the dates is ineligible, with the reason", async () => {
    const criteria = adaptBriefToCriteria({
      shoot_start: "2026-08-01",
      shoot_end: "2026-08-05",
      look_target: { editorial: 1 },
    });
    const profile = { id: "p", height_cm: 179, age: 24, gender: "female", fit_score_editorial: 90, fit_scores_calculated_at: new Date().toISOString() };
    const brief = await evaluate({
      profile,
      scope: { type: "brief", id: "b1" },
      criteria,
      context: { commitments: [{ kind: "booked", start_date: "2026-08-02", end_date: "2026-08-03" }] },
    });
    expect(brief.feasible).toBe(false);
    expect(brief.posture).toBe("ineligible");
    expect(brief.case_against.some((c) => c.blocking && /booked/.test(c.note))).toBe(true);
  });
});
