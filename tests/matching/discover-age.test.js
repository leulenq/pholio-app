"use strict";

const knexLib = require("knex");
const { v4: uuidv4 } = require("uuid");

const {
  ageFilterDobCutoffs,
  utcDateString,
  loadEligibleProfileIds,
} = require("../../src/domains/agency/services/discover-age");

// UTC date string for a DOB `yearsAgo` years and `dayOffset` days from the
// reference date — mirrors the boundary seeding in agency-discover-search.
function dobFor(reference, yearsAgo, dayOffset = 0) {
  return utcDateString(
    new Date(
      Date.UTC(
        reference.getUTCFullYear() - yearsAgo,
        reference.getUTCMonth(),
        reference.getUTCDate() + dayOffset,
      ),
    ),
  );
}

describe("ageFilterDobCutoffs", () => {
  const ref = new Date(Date.UTC(2026, 6, 10)); // 2026-07-10

  test("min_age only produces an exclusive DOB upper bound", () => {
    const out = ageFilterDobCutoffs(18, null, ref);
    expect(out).toEqual({ maxDobExclusive: "2008-07-11" });
  });

  test("max_age only produces an inclusive DOB lower bound", () => {
    const out = ageFilterDobCutoffs(null, 30, ref);
    expect(out).toEqual({ minDobInclusive: "1995-07-11" });
  });

  test("both bounds together", () => {
    const out = ageFilterDobCutoffs(18, 30, ref);
    expect(out).toEqual({
      maxDobExclusive: "2008-07-11",
      minDobInclusive: "1995-07-11",
    });
  });

  test("no ages produces no cutoffs", () => {
    expect(ageFilterDobCutoffs(null, null, ref)).toEqual({});
  });
});

describe("loadEligibleProfileIds age filter (DOB-derived, audit P0-7)", () => {
  let db;
  const now = new Date();

  const seed = [
    // Deliberately wrong stored `age` values: DOB must win.
    { last_name: "Turns18Today", dob: dobFor(now, 18, 0), age: 5 }, // age 18
    { last_name: "Turns18Tomorrow", dob: dobFor(now, 18, 1), age: 99 }, // age 17
    { last_name: "Turns31Tomorrow", dob: dobFor(now, 31, 1), age: 99 }, // age 30
    { last_name: "Turned31Today", dob: dobFor(now, 31, 0), age: 5 }, // age 31
    { last_name: "NoDob", dob: null, age: 25 },
    // Full ISO timestamp storage (PostgreSQL quirk) must behave identically.
    {
      last_name: "IsoTimestamp25",
      dob: `${dobFor(now, 25, 0)}T05:00:00.000Z`,
      age: 99,
    },
  ];

  const idsByName = {};

  beforeAll(async () => {
    db = knexLib({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.schema.createTable("profiles", (t) => {
      t.string("id", 36).primary();
      t.string("last_name", 100);
      t.string("date_of_birth", 40).nullable();
      t.integer("age").nullable();
      t.boolean("is_discoverable").defaultTo(true);
      t.string("profile_status", 50);
      t.text("bio_curated");
    });
    for (const row of seed) {
      const id = uuidv4();
      idsByName[row.last_name] = id;
      await db("profiles").insert({
        id,
        last_name: row.last_name,
        date_of_birth: row.dob,
        age: row.age,
        is_discoverable: true,
        profile_status: "active",
        bio_curated: "fixture",
      });
    }
  });

  afterAll(async () => {
    await db.destroy();
  });

  async function names(filters) {
    const ids = await loadEligibleProfileIds(db, filters);
    return Object.keys(idsByName).filter((n) => ids.has(idsByName[n]));
  }

  test("min_age uses DOB, is inclusive on the birthday, ignores stored age", async () => {
    const got = await names({ min_age: 18 });
    expect(got).toContain("Turns18Today");
    expect(got).not.toContain("Turns18Tomorrow"); // still 17 despite age=99
    expect(got).toContain("IsoTimestamp25");
  });

  test("max_age uses DOB and excludes the day the talent ages out", async () => {
    const got = await names({ max_age: 30 });
    expect(got).toContain("Turns31Tomorrow"); // still 30
    expect(got).not.toContain("Turned31Today"); // 31 despite age=5
  });

  test("null date_of_birth fails closed under any age filter", async () => {
    expect(await names({ min_age: 18 })).not.toContain("NoDob");
    expect(await names({ max_age: 30 })).not.toContain("NoDob");
  });

  test("no age filter leaves the pool untouched", async () => {
    const got = await names({});
    expect(got).toHaveLength(seed.length);
  });
});
