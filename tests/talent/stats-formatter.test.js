"use strict";

const {
  buildCanonicalStats,
  resolveStatsTrack,
  resolveCoreCircumference,
  hasCoreMeasurements,
  measurementRecency,
} = require("../../src/shared/lib/stats-formatter");

const NOW = new Date("2026-07-01T12:00:00.000Z");

function fieldKeys(stats) {
  return stats.fields.map((f) => f.key);
}

describe("resolveStatsTrack", () => {
  test("explicit stats_track wins over gender", () => {
    expect(resolveStatsTrack({ stats_track: "menswear", gender: "Female" })).toBe(
      "menswear",
    );
    expect(resolveStatsTrack({ stats_track: "ungendered", gender: "Male" })).toBe(
      "ungendered",
    );
  });

  test("falls back to gender when stats_track absent", () => {
    expect(resolveStatsTrack({ gender: "Female" })).toBe("womenswear");
    expect(resolveStatsTrack({ gender: "Male" })).toBe("menswear");
  });

  test("unknown / missing → ungendered", () => {
    expect(resolveStatsTrack({ gender: "Non-binary" })).toBe("ungendered");
    expect(resolveStatsTrack({})).toBe("ungendered");
  });
});

describe("resolveCoreCircumference", () => {
  test("womenswear reads bust_cm, menswear reads chest_cm", () => {
    expect(
      resolveCoreCircumference({ stats_track: "womenswear", bust_cm: 86, chest_cm: 99 }).cm,
    ).toBe(86);
    expect(
      resolveCoreCircumference({ stats_track: "menswear", bust_cm: 86, chest_cm: 99 }).cm,
    ).toBe(99);
  });

  test("legacy cross-fallback for display (bust→chest, chest→bust)", () => {
    const men = resolveCoreCircumference({ stats_track: "menswear", bust_cm: 90 });
    expect(men.cm).toBe(90);
    expect(men.usedLegacyFallback).toBe(true);

    const women = resolveCoreCircumference({ stats_track: "womenswear", chest_cm: 84 });
    expect(women.cm).toBe(84);
    expect(women.usedLegacyFallback).toBe(true);
  });
});

describe("buildCanonicalStats — track field sets", () => {
  test("womenswear → bust/waist/hips + dress", () => {
    const stats = buildCanonicalStats({
      stats_track: "womenswear",
      height_cm: 178,
      bust_cm: 86,
      waist_cm: 61,
      hips_cm: 89,
      dress_size: "4",
      shoe_size: "9",
    });
    expect(stats.track).toBe("womenswear");
    expect(fieldKeys(stats)).toEqual(
      expect.arrayContaining(["height", "bust", "waist", "hips", "dress", "shoe"]),
    );
    // menswear-only lines never appear on the womenswear track.
    expect(fieldKeys(stats)).not.toContain("chest");
    expect(fieldKeys(stats)).not.toContain("inseam");
    expect(fieldKeys(stats)).not.toContain("suit");
    expect(stats.bust).not.toBeNull();
    expect(stats.chest).toBeNull();
  });

  test("menswear → chest/waist/inseam + suit", () => {
    const stats = buildCanonicalStats({
      stats_track: "menswear",
      height_cm: 185,
      chest_cm: 100,
      waist_cm: 82,
      inseam_cm: 84,
      suit_size: "40R",
      shoe_size: "11",
    });
    expect(stats.track).toBe("menswear");
    expect(fieldKeys(stats)).toEqual(
      expect.arrayContaining(["height", "chest", "waist", "inseam", "suit", "shoe"]),
    );
    expect(fieldKeys(stats)).not.toContain("bust");
    expect(fieldKeys(stats)).not.toContain("hips");
    expect(fieldKeys(stats)).not.toContain("dress");
    expect(stats.chest).not.toBeNull();
    expect(stats.bust).toBeNull();
  });

  test("ungendered → neutral set (chest-or-bust, height, shoe)", () => {
    const stats = buildCanonicalStats({
      stats_track: "ungendered",
      height_cm: 175,
      chest_cm: 92,
      waist_cm: 74,
      inseam_cm: 80,
      shoe_size: "10",
    });
    expect(stats.track).toBe("ungendered");
    const keys = fieldKeys(stats);
    expect(keys).toContain("height");
    expect(keys).toContain("chest"); // chest_cm present → chest label
    expect(keys).toContain("shoe");
  });
});

describe("buildCanonicalStats — both units", () => {
  test("length exposes cm + inches derived from cm canonical", () => {
    const stats = buildCanonicalStats({
      stats_track: "womenswear",
      height_cm: 178,
      bust_cm: 86,
    });
    expect(stats.height.cm).toBe(178);
    expect(stats.height.feet_inches).toBe("5'10\"");
    expect(stats.bust.cm).toBe(86);
    expect(stats.bust.inches).toBe(34);
    expect(stats.bust.dual).toBe('86 cm / 34"');
  });

  test("weight derives both units from the canonical stored value only", () => {
    // weight_unit=kg → lbs is derived from kg, NOT read from a stale weight_lbs.
    const stats = buildCanonicalStats({
      weight_kg: 60,
      weight_lbs: 999, // stale / wrong — must be ignored
      weight_unit: "kg",
    });
    expect(stats.weight.kg).toBe(60);
    expect(stats.weight.lbs).toBe(Math.round(60 * 2.20462)); // 132
  });
});

describe("buildCanonicalStats — recency / stale flag", () => {
  test("recent measurement is not stale", () => {
    const recent = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const stats = buildCanonicalStats(
      { measurements_updated_at: recent },
      { referenceDate: NOW },
    );
    expect(stats.is_stale).toBe(false);
    expect(stats.updated_days_ago).toBe(10);
  });

  test(">90d old is stale", () => {
    const old = new Date(NOW.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString();
    const stats = buildCanonicalStats(
      { measurements_updated_at: old },
      { referenceDate: NOW },
    );
    expect(stats.is_stale).toBe(true);
  });

  test("missing timestamp is stale", () => {
    expect(measurementRecency({}, NOW).is_stale).toBe(true);
  });
});

describe("hasCoreMeasurements — readiness gate (audit P1-3)", () => {
  const base = { height_cm: 175, waist_cm: 61, hips_cm: 90 };

  test("chest_cm satisfies menswear so a male Chest passes readiness", () => {
    expect(
      hasCoreMeasurements({ ...base, stats_track: "menswear", chest_cm: 96 }),
    ).toBe(true);
  });

  test("menswear is strict — bust_cm alone does NOT satisfy the chest requirement", () => {
    expect(
      hasCoreMeasurements({
        ...base,
        stats_track: "menswear",
        chest_cm: null,
        bust_cm: 90,
      }),
    ).toBe(false);
  });

  test("womenswear accepts bust_cm (or chest_cm) as the core", () => {
    expect(
      hasCoreMeasurements({ ...base, stats_track: "womenswear", bust_cm: 86 }),
    ).toBe(true);
    expect(
      hasCoreMeasurements({ ...base, stats_track: "womenswear", chest_cm: 86 }),
    ).toBe(true);
  });

  test("missing height/waist/hips fails regardless of core", () => {
    expect(
      hasCoreMeasurements({ stats_track: "womenswear", bust_cm: 86 }),
    ).toBe(false);
  });
});
