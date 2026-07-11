// tests/talent/searchability.test.js
// Discover WS9.3 — talent-side search-demand nudges mined from
// discover_query_log.parsed_contract, cross-referenced with the talent's
// own blank fields. Seeds real query-log rows against a migrated DB.
"use strict";

const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const {
  buildSearchDemandNudges,
  countFieldDemand,
  fieldsTouchedByContract,
} = require("../../src/domains/talent/services/intel/searchability");

const FIXTURE_USERS = [];
const FIXTURE_PROFILES = [];

async function makeAgencyUser() {
  const id = uuidv4();
  await knex("users").insert({
    id,
    email: `sd-agency-${id}@example.com`,
    password_hash: "x",
    role: "AGENCY",
  });
  FIXTURE_USERS.push(id);
  return id;
}

async function makeProfile(overrides = {}) {
  const userId = uuidv4();
  const profileId = uuidv4();
  await knex("users").insert({
    id: userId,
    email: `sd-talent-${userId}@example.com`,
    password_hash: "x",
    role: "TALENT",
  });
  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug: `sd-${profileId}`,
    first_name: "Search",
    last_name: "Demand",
    city: "Test City",
    height_cm: 170,
    bio_raw: "",
    bio_curated: "",
    ...overrides,
  });
  FIXTURE_USERS.push(userId);
  FIXTURE_PROFILES.push(profileId);
  return knex("profiles").where({ id: profileId }).first();
}

function contractWith(hard) {
  return JSON.stringify({
    roles: [{ label: "role", count: 1, hard, soft_query: "" }],
    set_aside: [],
    unparsed_remainder: "",
  });
}

async function seedQueryLog(agencyUserId, parsedContract, createdAt = null) {
  const id = uuidv4();
  await knex("discover_query_log").insert({
    id,
    agency_user_id: agencyUserId,
    raw_brief: "test brief",
    parsed_contract: parsedContract,
    engine: "launch",
    created_at: createdAt || knex.fn.now(),
  });
  return id;
}

let AGENCY_USER_ID;

beforeAll(async () => {
  await knex.migrate.latest();
  AGENCY_USER_ID = await makeAgencyUser();
}, 45000);

beforeEach(async () => {
  await knex("discover_query_log")
    .where({ agency_user_id: AGENCY_USER_ID })
    .del();
});

afterAll(async () => {
  await knex("discover_query_log")
    .whereIn("agency_user_id", FIXTURE_USERS)
    .del();
  for (const profileId of FIXTURE_PROFILES) {
    await knex("bookouts").where({ profile_id: profileId }).del();
    await knex("profiles").where({ id: profileId }).del();
  }
  await knex("users").whereIn("id", FIXTURE_USERS).del();
  await knex.destroy();
});

describe("fieldsTouchedByContract", () => {
  test("collects non-null hard fields across roles, ignoring unknown keys", () => {
    const contract = {
      roles: [
        {
          hard: {
            eye_color: ["brown"],
            hair_color: null,
            shoe: { size: 9, region: "US" },
            not_a_real_field: "x",
          },
        },
        { hard: { availability: [{ kind: "shoot", from: "2026-08-01", to: "2026-08-04" }] } },
      ],
    };
    const touched = fieldsTouchedByContract(contract);
    expect([...touched].sort()).toEqual(["availability", "eye_color", "shoe"]);
  });

  test("tolerates a malformed contract", () => {
    expect([...fieldsTouchedByContract(null)]).toEqual([]);
    expect([...fieldsTouchedByContract({ roles: "nope" })]).toEqual([]);
  });
});

describe("countFieldDemand", () => {
  test("zero state: empty log returns an empty map", async () => {
    const counts = await countFieldDemand(14);
    expect(counts.size).toBe(0);
  });

  test("counts queries per field over the window, skipping unparseable rows", async () => {
    await seedQueryLog(AGENCY_USER_ID, contractWith({ eye_color: ["brown"] }));
    await seedQueryLog(
      AGENCY_USER_ID,
      contractWith({ eye_color: ["green"], hair_color: ["blonde"] }),
    );
    await seedQueryLog(AGENCY_USER_ID, "{not json");
    // Outside the 14-day window — must not count.
    await seedQueryLog(
      AGENCY_USER_ID,
      contractWith({ eye_color: ["hazel"] }),
      new Date(Date.now() - 30 * 86_400_000).toISOString(),
    );

    const counts = await countFieldDemand(14);
    expect(counts.get("eye_color")).toBe(2);
    expect(counts.get("hair_color")).toBe(1);
    expect(counts.has("shoe")).toBe(false);
  });
});

describe("buildSearchDemandNudges", () => {
  test("nudges only the talent's blank fields, ranked by demand", async () => {
    for (let i = 0; i < 3; i += 1) {
      await seedQueryLog(AGENCY_USER_ID, contractWith({ eye_color: ["brown"] }));
    }
    await seedQueryLog(
      AGENCY_USER_ID,
      contractWith({ hair_color: ["blonde"], eye_color: ["blue"] }),
    );

    // eye_color blank, hair_color filled.
    const profile = await makeProfile({ hair_color: "Brown" });
    const nudges = await buildSearchDemandNudges(profile, { days: 14 });

    const fields = nudges.map((n) => n.field);
    expect(fields).toContain("eye_color");
    expect(fields).not.toContain("hair_color");

    const eyeNudge = nudges.find((n) => n.field === "eye_color");
    expect(eyeNudge.count).toBe(4);
    expect(eyeNudge.text).toMatch(/Agencies ran 4 searches/);
    expect(eyeNudge.text).toMatch(/eye color — yours is blank\./);
    expect(eyeNudge.to).toContain("/dashboard/talent/profile");
  });

  test("availability counts as blank only when never managed (default + no bookouts)", async () => {
    await seedQueryLog(
      AGENCY_USER_ID,
      contractWith({ availability: [{ kind: "window", from: "2026-08-01", to: "2026-08-05" }] }),
    );

    const untouched = await makeProfile({});
    const untouchedNudges = await buildSearchDemandNudges(untouched, { days: 14 });
    expect(untouchedNudges.map((n) => n.field)).toContain("availability");

    // A talent with a bookout on file has managed availability — no nudge.
    const managed = await makeProfile({});
    await knex("bookouts").insert({
      id: uuidv4(),
      profile_id: managed.id,
      starts_on: "2026-08-01",
      ends_on: "2026-08-03",
    });
    const managedNudges = await buildSearchDemandNudges(managed, { days: 14 });
    expect(managedNudges.map((n) => n.field)).not.toContain("availability");

    // A talent with a non-default status has managed availability — no nudge.
    const limited = await makeProfile({ availability_status: "limited" });
    const limitedNudges = await buildSearchDemandNudges(limited, { days: 14 });
    expect(limitedNudges.map((n) => n.field)).not.toContain("availability");
  });

  test("zero state: no demand rows means no nudges (renders nothing)", async () => {
    const profile = await makeProfile({});
    const nudges = await buildSearchDemandNudges(profile, { days: 14 });
    expect(nudges).toEqual([]);
  });

  test("caps at three nudges", async () => {
    await seedQueryLog(
      AGENCY_USER_ID,
      contractWith({
        eye_color: ["brown"],
        hair_color: ["blonde"],
        shoe: { size: 9, region: "US" },
        visible_tattoos: false,
        availability: [{ kind: "window", from: "2026-08-01", to: "2026-08-02" }],
      }),
    );
    const profile = await makeProfile({});
    const nudges = await buildSearchDemandNudges(profile, { days: 14 });
    expect(nudges.length).toBeLessThanOrEqual(3);
  });
});
