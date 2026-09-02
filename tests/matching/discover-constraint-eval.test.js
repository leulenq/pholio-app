"use strict";

/**
 * WS5.2 — constraint-eval matrix. Pure functions; no DB.
 * Each field type × pass/fail/unknown, playing-age range overlap, ±3cm approx,
 * needs_confirmation skip, bookout overlap.
 */

const {
  evaluateProfile,
  numericStatus,
  playingAgeStatus,
  availabilityStatus,
  unionStatus,
  tattooStatus,
  boardsStatus,
  parseStoredShoe,
  shoeStatus,
  experienceStatus,
  heritageStatus,
  rangesOverlap,
} = require("../../src/domains/agency/services/discover/constraint-eval");

function statusOf(profile, hard, field, opts) {
  const evals = evaluateProfile(profile, hard, opts);
  const e = evals.find((x) => x.field === field);
  return e ? e.status : undefined;
}

describe("numericStatus op semantics", () => {
  test("min: pass/fail/unknown", () => {
    expect(numericStatus(178, { op: "min", value: 175 })).toBe("pass");
    expect(numericStatus(170, { op: "min", value: 175 })).toBe("fail");
    expect(numericStatus(null, { op: "min", value: 175 })).toBe("unknown");
  });
  test("max", () => {
    expect(numericStatus(170, { op: "max", value: 175 })).toBe("pass");
    expect(numericStatus(180, { op: "max", value: 175 })).toBe("fail");
  });
  test("between (reconciled value object)", () => {
    const c = { op: "between", value: { a: 170, b: 180 } };
    expect(numericStatus(175, c)).toBe("pass");
    expect(numericStatus(185, c)).toBe("fail");
  });
  test("approx is ±3cm", () => {
    const c = { op: "approx", value: 175 };
    expect(numericStatus(178, c)).toBe("pass"); // +3
    expect(numericStatus(172, c)).toBe("pass"); // -3
    expect(numericStatus(179, c)).toBe("fail"); // +4
    expect(numericStatus(171, c)).toBe("fail"); // -4
  });
  test("exact", () => {
    expect(numericStatus(175, { op: "exact", value: 175 })).toBe("pass");
    expect(numericStatus(176, { op: "exact", value: 175 })).toBe("fail");
  });
});

describe("playing_age range overlap", () => {
  test("overlapping ranges pass", () => {
    const c = { value: { a: 22, b: 30 } };
    expect(playingAgeStatus(c, 25, 35)).toBe("pass");
    expect(playingAgeStatus(c, 18, 24)).toBe("pass"); // touches at 22-24
  });
  test("disjoint ranges fail", () => {
    const c = { value: { a: 22, b: 30 } };
    expect(playingAgeStatus(c, 31, 40)).toBe("fail");
  });
  test("both null → unknown", () => {
    expect(playingAgeStatus({ value: { a: 22, b: 30 } }, null, null)).toBe(
      "unknown",
    );
  });
  test("open-ended profile bounds", () => {
    const c = { value: { a: 40, b: 45 } };
    expect(playingAgeStatus(c, null, 42)).toBe("pass"); // pmin -inf
    expect(playingAgeStatus(c, 46, null)).toBe("fail");
  });
});

describe("availability (status + bookouts)", () => {
  const window = [{ kind: "shoot", from: "2026-07-09", to: "2026-07-14" }];
  test("overlapping bookout → fail", () => {
    const status = availabilityStatus(
      window,
      "available",
      [{ starts_on: "2026-07-10", ends_on: "2026-07-12" }],
    );
    expect(status).toBe("fail");
  });
  test("bookout data with no overlap → pass", () => {
    const status = availabilityStatus(
      window,
      "available",
      [{ starts_on: "2026-08-01", ends_on: "2026-08-05" }],
    );
    expect(status).toBe("pass");
  });
  test("declared available with no bookouts → pass (audit §2.3)", () => {
    expect(availabilityStatus(window, "available", [])).toBe("pass");
    expect(availabilityStatus(window, "limited", [])).toBe("pass");
  });
  test("no status and no bookouts → unknown", () => {
    expect(availabilityStatus(window, null, undefined)).toBe("unknown");
    expect(availabilityStatus(window, "", [])).toBe("unknown");
  });
  test("status unavailable → fail", () => {
    expect(availabilityStatus(window, "unavailable", [])).toBe("fail");
  });
  test("rangesOverlap on ISO strings", () => {
    expect(rangesOverlap("2026-07-09", "2026-07-14", "2026-07-12", "2026-07-20")).toBe(true);
    expect(rangesOverlap("2026-07-09", "2026-07-14", "2026-07-15", "2026-07-20")).toBe(false);
  });
  test("the failing bookout travels with the evaluation for the card note", () => {
    const evals = evaluateProfile(
      { availability_status: "available" },
      { availability: window },
      { bookouts: [{ starts_on: "2026-07-10", ends_on: "2026-07-12" }] },
    );
    const availability = evals.find((e) => e.field === "availability");
    expect(availability.status).toBe("fail");
    expect(availability.actual.overlap).toEqual({
      starts_on: "2026-07-10",
      ends_on: "2026-07-12",
    });
  });
});

describe("enum / boolean fields", () => {
  test("gender pass/fail/unknown", () => {
    const hard = { gender_presentation: ["female"] };
    expect(statusOf({ gender: "Female" }, hard, "gender_presentation")).toBe("pass");
    expect(statusOf({ gender: "Male" }, hard, "gender_presentation")).toBe("fail");
    expect(statusOf({ gender: null }, hard, "gender_presentation")).toBe("unknown");
    // A withheld answer is not a different answer.
    expect(
      statusOf({ gender: "Prefer not to say" }, hard, "gender_presentation"),
    ).toBe("unknown");
  });

  test("hair OR-set is case-insensitive", () => {
    const hard = { hair_color: ["blonde", "red"] };
    expect(statusOf({ hair_color: "Red" }, hard, "hair_color")).toBe("pass");
    expect(statusOf({ hair_color: "brown" }, hard, "hair_color")).toBe("fail");
    expect(statusOf({ hair_color: null }, hard, "hair_color")).toBe("unknown");
  });

  test("boards read the profile_booking_lanes join table first", () => {
    // The join table is the canonical store since 20260624195800; the legacy
    // column is only a fallback for rows written before it.
    const evals = evaluateProfile({}, { boards: ["editorial"] }, {
      lanes: ["editorial", "runway"],
    });
    const boards = evals.find((e) => e.field === "boards");
    expect(boards.status).toBe("pass");
    expect(boards.actual).toEqual(["editorial", "runway"]);

    expect(
      evaluateProfile({ modeling_categories: '["commercial"]' }, { boards: ["editorial"] }, {
        lanes: ["editorial"],
      }).find((e) => e.field === "boards").status,
    ).toBe("pass");
  });

  test("boards fall back to modeling_categories when no lanes are joined", () => {
    expect(boardsStatus(["editorial"], { modeling_categories: '["editorial"]' })).toBe("pass");
    expect(boardsStatus(["editorial"], { modeling_categories: '["commercial"]' })).toBe("fail");
    expect(boardsStatus(["editorial"], { modeling_categories: null })).toBe("unknown");
    expect(boardsStatus(["editorial"], { modeling_categories: null }, [])).toBe("unknown");
    // The `profiles.archetype` fallback was removed (dead column, always
    // null in production — see migrations/20260820110000_drop_profiles_archetype.js).
    expect(boardsStatus(["editorial"], { archetype: "Editorial" })).toBe("unknown");
  });

  test("shoe size is parsed out of the stored string, with its region", () => {
    expect(parseStoredShoe({ shoe_size: "8 US" })).toEqual({ size: 8, region: "US" });
    expect(parseStoredShoe({ shoe_size: "38 EU" })).toEqual({ size: 38, region: "EU" });
    expect(parseStoredShoe({ shoe_size: "8" })).toEqual({ size: 8, region: null });
    expect(parseStoredShoe({ shoe_size: "8", shoe_region: "eu" })).toEqual({
      size: 8,
      region: "EU",
    });
    expect(parseStoredShoe({ shoe_size: null })).toBeNull();

    const want = { size: 8, region: "US" };
    expect(shoeStatus(want, { shoe_size: "8 US" })).toBe("pass");
    expect(shoeStatus(want, { shoe_size: "8" })).toBe("pass"); // region unstated
    expect(shoeStatus(want, { shoe_size: "9 US" })).toBe("fail");
    expect(shoeStatus(want, { shoe_size: "38 EU" })).toBe("fail");
    expect(shoeStatus(want, { shoe_size: "" })).toBe("unknown");
  });

  test("experience level normalises across all three vocabularies", () => {
    expect(experienceStatus("new_face", "New face")).toBe("pass");
    expect(experienceStatus("new_face", "new_face")).toBe("pass");
    expect(experienceStatus("experienced", "Professional")).toBe("pass");
    expect(experienceStatus("established", "Established")).toBe("pass");
    expect(experienceStatus("developing", "emerging")).toBe("pass");
    expect(experienceStatus("new_face", "Experienced")).toBe("fail");
    expect(experienceStatus("new_face", null)).toBe("unknown");
    expect(experienceStatus("new_face", "something else")).toBe("unknown");
  });

  test("heritage matches the talent's own selection, blank is never a fail", () => {
    const ask = ["black_african_descent"];
    expect(heritageStatus(ask, { ethnicity: '["Black/African Descent"]' })).toBe("pass");
    // legacy free values normalise through the same synonym map
    expect(heritageStatus(ask, { ethnicity: '["Black","Caribbean"]' })).toBe("pass");
    expect(heritageStatus(ask, { ethnicity: '["East Asian"]' })).toBe("fail");
    expect(heritageStatus(ask, { ethnicity: null })).toBe("unknown");
    expect(heritageStatus(ask, { ethnicity: "[]" })).toBe("unknown");

    // "Mixed Heritage" alone answers only a mixed ask
    expect(heritageStatus(ask, { ethnicity: '["Mixed Heritage"]' })).toBe("fail");
    expect(
      heritageStatus(["mixed_heritage"], { ethnicity: '["Mixed Heritage"]' }),
    ).toBe("pass");
    expect(
      heritageStatus(ask, { ethnicity: '["Black/African Descent","Mixed Heritage"]' }),
    ).toBe("pass");

    const evals = evaluateProfile(
      { ethnicity: '["Hispanic/Latino"]' },
      { heritage: ["hispanic_latino"] },
    );
    expect(evals[0].status).toBe("pass");
    expect(evals[0].actual.labels).toEqual(["Hispanic/Latino"]);
  });

  test("union derivation", () => {
    expect(unionStatus("union", "SAG-AFTRA")).toBe("pass");
    expect(unionStatus("non_union", "SAG-AFTRA")).toBe("fail");
    expect(unionStatus("either", null)).toBe("pass");
    expect(unionStatus("union", null)).toBe("unknown");
  });

  test("visible_tattoos reads the boolean column (audit §2.3)", () => {
    // "No visible tattoos" must PASS a talent who answered no.
    expect(tattooStatus(false, false)).toBe("pass");
    expect(tattooStatus(false, 0)).toBe("pass");
    expect(tattooStatus(false, "false")).toBe("pass");
    expect(tattooStatus(false, true)).toBe("fail");
    expect(tattooStatus(true, true)).toBe("pass");
    expect(tattooStatus(true, false)).toBe("fail");
    expect(tattooStatus(false, null)).toBe("unknown");
    expect(tattooStatus(false, "")).toBe("unknown");
    // legacy free text still describes tattoos the talent has
    expect(tattooStatus(false, "full sleeve")).toBe("fail");
  });

  test("location.market", () => {
    const hard = { location: { market: "new-york" } };
    expect(statusOf({ market: "new-york" }, hard, "location")).toBe("pass");
    expect(statusOf({ market: "paris" }, hard, "location")).toBe("fail");
    expect(statusOf({ market: null }, hard, "location")).toBe("unknown");
  });

  test("representation_status from opts map (else unknown)", () => {
    const hard = { representation_status: ["unrepresented"] };
    expect(
      statusOf({}, hard, "representation_status", { representationStatus: "unrepresented" }),
    ).toBe("pass");
    expect(
      statusOf({}, hard, "representation_status", { representationStatus: "represented" }),
    ).toBe("fail");
    expect(statusOf({}, hard, "representation_status")).toBe("unknown");
  });

  test("credentials are not applied at all (they become a note)", () => {
    const hard = { credentials: { tearsheets: true } };
    expect(evaluateProfile({}, hard, {})).toEqual([]);
  });
});

describe("needs_confirmation constraints are skipped", () => {
  test("height flagged needs_confirmation is not evaluated", () => {
    const hard = {
      height_cm: { op: "min", value: 175, needs_confirmation: true },
    };
    const evals = evaluateProfile({ height_cm: 180 }, hard, {});
    expect(evals.find((e) => e.field === "height_cm")).toBeUndefined();
    expect(evals.length).toBe(0);
  });
  test("applied height IS evaluated", () => {
    const hard = { height_cm: { op: "min", value: 175 } };
    const evals = evaluateProfile({ height_cm: 180 }, hard, {});
    expect(evals.find((e) => e.field === "height_cm").status).toBe("pass");
  });
});

describe("evaluations carry tier + actual", () => {
  test("client_gate vs operational tiers", () => {
    const hard = {
      height_cm: { op: "min", value: 175 }, // client_gate
      union: "union", // operational
    };
    const evals = evaluateProfile(
      { height_cm: 180, union_membership: "SAG" },
      hard,
      {},
    );
    const byField = Object.fromEntries(evals.map((e) => [e.field, e]));
    expect(byField.height_cm.tier).toBe("client_gate");
    expect(byField.union.tier).toBe("operational");
    expect(byField.height_cm.actual).toBe(180);
  });
});

describe('gender_presentation — identities outside the filterable three', () => {
  test('"Other" is unknown, never a fail, on a gendered brief', () => {
    const out = evaluateProfile(
      { gender: "Other" },
      { gender_presentation: ["female"] },
    );
    expect(out.find((e) => e.field === "gender_presentation").status).toBe("unknown");
  });
  test('"Prefer not to say" stays unknown', () => {
    const out = evaluateProfile(
      { gender: "Prefer not to say" },
      { gender_presentation: ["male"] },
    );
    expect(out.find((e) => e.field === "gender_presentation").status).toBe("unknown");
  });
});
