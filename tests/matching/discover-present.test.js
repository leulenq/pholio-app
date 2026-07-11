"use strict";

/**
 * WS5.6 — present.js: span offsets, board-derived key_stat, why_facts,
 * understanding.applied assembly. Pure functions; no DB.
 */

const {
  spanOffsets,
  dualHeight,
  keyStat,
  whyFacts,
  buildUnderstanding,
  buildResultItem,
  tierBand,
  nearHeading,
} = require("../../src/domains/agency/services/discover/present");

describe("spanOffsets", () => {
  const brief = `5'9" editorial, New York`;
  test("finds a present span", () => {
    expect(spanOffsets(brief, `5'9"`)).toEqual([0, 4]);
    expect(spanOffsets(brief, "New York")).toEqual([16, 24]);
  });
  test("returns null for an absent span (literal gap — LB-4)", () => {
    expect(spanOffsets(brief, "5'11\"")).toBeNull();
    expect(spanOffsets(brief, null)).toBeNull();
  });
});

describe("key_stat (board-derived)", () => {
  test("default → dual-unit height", () => {
    expect(keyStat({ height_cm: 178 })).toEqual({
      label: "Height",
      value: `5'10" (178cm)`,
    });
  });
  test("curve → dress size", () => {
    expect(
      keyStat({ modeling_categories: '["curve"]', dress_size: "14", height_cm: 175 }),
    ).toEqual({ label: "Dress", value: "US 14" });
  });
  test("fit → waist/hips", () => {
    expect(
      keyStat({ modeling_categories: '["fit"]', waist_cm: 61, hips_cm: 89 }),
    ).toEqual({ label: "Fit", value: "W 61 · H 89" });
  });
  test("runway/editorial → height", () => {
    expect(keyStat({ modeling_categories: '["editorial"]', height_cm: 180 })).toEqual({
      label: "Height",
      value: `5'11" (180cm)`,
    });
  });
  test("dualHeight formatting", () => {
    expect(dualHeight(178)).toBe(`5'10" (178cm)`);
    expect(dualHeight(null)).toBeNull();
  });
});

describe("why_facts (Tier-1, zero LLM)", () => {
  test("composes from matched fields + key facts", () => {
    const profile = {
      height_cm: 178,
      market: "new-york",
      modeling_categories: '["editorial"]',
      measurements_updated_at: "2026-06-15",
    };
    expect(whyFacts(profile, {})).toBe(
      `5'10" · New York · editorial · stats updated Jun`,
    );
  });
  test("falls back to city when no market slug", () => {
    expect(whyFacts({ height_cm: 175, city: "Reykjavik" }, {})).toBe(`5'9" · Reykjavik`);
  });
});

describe("tier bands + headings", () => {
  test("group kind → band", () => {
    expect(tierBand("exact")).toBe("high");
    expect(tierBand("near")).toBe("mid");
    expect(tierBand("outside_spec")).toBe("low");
  });
  test("near heading is per-constraint", () => {
    expect(nearHeading("availability")).toMatch(/availability unconfirmed/i);
    expect(nearHeading("location")).toMatch(/market/i);
  });
});

describe("buildUnderstanding.applied", () => {
  const brief = `5'9" and up, editorial`;
  const contract = {
    roles: [
      {
        label: "role 1",
        count: 1,
        soft_query: "editorial",
        hard: {
          height_cm: { op: "min", value: 175, span: `5'9"`, confidence: 0.9 },
          boards: ["editorial"],
        },
      },
    ],
    set_aside: [{ text: "korean", reason: "not_used_for_filtering" }],
  };

  test("maps height with span offsets, op, tier, value", () => {
    const u = buildUnderstanding(contract, brief, null);
    const h = u.applied.find((a) => a.field === "height_cm");
    expect(h.op).toBe("min");
    expect(h.value).toBe(175);
    expect(h.tier).toBe("client_gate");
    expect(h.span).toEqual([0, 4]);
    expect(h.needs_confirmation).toBe(false);
  });

  test("carries set_aside and multi_role_notice", () => {
    const notice = { role_count: 2, searched: "role 1" };
    const u = buildUnderstanding(contract, brief, notice);
    expect(u.set_aside).toHaveLength(1);
    expect(u.multi_role_notice).toBe(notice);
    expect(u.applied.find((a) => a.field === "boards").value).toEqual(["editorial"]);
  });
});

describe("buildResultItem", () => {
  test("attaches launch annotations, no raw scores", () => {
    const dto = { id: "p1", first_name: "Ada", age_band: "late twenties" };
    const profile = { id: "p1", height_cm: 178, market: "new-york" };
    const evals = [
      { field: "height_cm", status: "pass", actual: 178 },
      { field: "availability", status: "unknown", actual: null },
    ];
    const item = buildResultItem(dto, profile, evals, { groupKind: "near" });
    expect(item.tier_band).toBe("mid");
    expect(item.key_stat).toEqual({ label: "Height", value: `5'10" (178cm)` });
    expect(item.age_band).toBe("late twenties");
    // constraint_truth only non-pass statuses
    expect(item.constraint_truth).toEqual([
      { field: "availability", status: "unknown", actual: null },
    ]);
    // no raw score fields
    expect(item.softScore).toBeUndefined();
    expect(item.passes).toBeUndefined();
  });
});
