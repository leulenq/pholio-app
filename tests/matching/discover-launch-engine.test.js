"use strict";

/**
 * WS5 — launch-mode engine: grouping (exact / near / outside-spec), the
 * credential honesty gate, include_outside_spec, and honest-zero removable-chip.
 *
 * Seeds an in-memory-style SQLite pool (same harness pattern as
 * agency-discover-search.test.js) and calls launchModeSearch directly. parse.js
 * is mocked so the contract is deterministic; soft scoring is disabled (no
 * OPENAI_API_KEY) so grouping is asserted independent of embeddings.
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "sqlite://./test-discover-launch.sqlite3";
process.env.DB_CLIENT = process.env.DB_CLIENT || "sqlite3";
process.env.DISCOVER_ENGINE = "launch";
process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "true";
delete process.env.OPENAI_API_KEY; // disable soft scoring (grouping-only test)

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// Deterministic contract per brief — the engine's parse dependency.
const CONTRACTS = {};
jest.mock("../../src/domains/agency/services/discover/parse", () => ({
  ...jest.requireActual("../../src/domains/agency/services/discover/parse"),
  parseBrief: jest.fn(async (text) => {
    const key = String(text || "").trim();
    const built = CONTRACTS[key] || {
      contract: { roles: [], set_aside: [], credential_gate: false },
      dropped: [],
      needs_confirmation_fields: [],
      multi_role: false,
      credential_gate: false,
      source: "mock",
    };
    return built;
  }),
}));

const knex = require("../../src/shared/db/knex");
const { isPostgresKnex } = require("../../src/domains/ai/embeddings");
const {
  launchModeSearch,
} = require("../../src/domains/agency/services/discover/engine");
const {
  parseBrief,
} = require("../../src/domains/agency/services/discover/parse");

const isPostgres = isPostgresKnex(knex);
const TEST_DB_PATH = path.resolve(__dirname, "../../test-discover-launch.sqlite3");
const AGENCY_ID = uuidv4();
let IDS = {};

function role(hard, soft_query = "") {
  return { label: "role 1", count: 1, hard, soft_query };
}
function contract(hard, extra = {}) {
  return {
    contract: {
      roles: [role(hard, extra.soft_query || "")],
      set_aside: extra.set_aside || [],
      credential_gate: !!extra.credential_gate,
    },
    dropped: [],
    needs_confirmation_fields: [],
    multi_role: false,
    credential_gate: !!extra.credential_gate,
    source: "mock",
  };
}

async function createSchema() {
  await knex.schema.dropTableIfExists("bookouts");
  await knex.schema.dropTableIfExists("images");
  await knex.schema.dropTableIfExists("social_accounts");
  await knex.schema.dropTableIfExists("applications");
  await knex.schema.dropTableIfExists("profiles");
  await knex.schema.dropTableIfExists("users");

  await knex.schema.createTable("users", (t) => {
    t.string("id", 36).primary();
    t.string("email").notNullable().unique();
    t.string("role").notNullable();
  });
  await knex.schema.createTable("profiles", (t) => {
    t.string("id", 36).primary();
    t.string("user_id", 36).nullable();
    t.string("first_name", 100).nullable();
    t.string("last_name", 100).nullable();
    t.string("slug", 200).nullable();
    t.string("city", 100).nullable();
    t.string("market", 100).nullable();
    t.string("gender", 50).nullable();
    t.integer("height_cm").nullable();
    t.integer("waist_cm").nullable();
    t.integer("hips_cm").nullable();
    t.string("dress_size", 20).nullable();
    t.string("hair_color", 50).nullable();
    t.string("eye_color", 50).nullable();
    t.string("archetype", 50).nullable();
    t.text("modeling_categories").nullable();
    t.string("experience_level", 50).nullable();
    t.string("union_membership", 100).nullable();
    t.text("tattoos").nullable();
    t.string("availability_status", 20).nullable();
    t.integer("playing_age_min").nullable();
    t.integer("playing_age_max").nullable();
    t.string("date_of_birth", 40).nullable();
    t.timestamp("guardian_consent_at").nullable();
    t.boolean("seeking_representation").nullable();
    t.string("current_agency", 200).nullable();
    t.text("bio_curated").nullable();
    t.boolean("is_discoverable").defaultTo(false);
    t.string("profile_status", 50).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("applications", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).nullable();
    t.string("agency_id", 36).nullable();
    t.string("invited_by_agency_id", 36).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("images", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).nullable();
    t.string("path").nullable();
    t.string("public_url").nullable();
    t.boolean("is_primary").defaultTo(false);
    t.integer("sort").defaultTo(0);
    t.string("status", 20).nullable();
    t.string("moderation_status", 20).nullable();
    t.boolean("exclude_from_public").defaultTo(false);
    t.boolean("exclude_from_agency").defaultTo(false);
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("social_accounts", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).nullable();
    t.string("agency_id", 36).nullable();
    t.string("platform", 50).notNullable();
    t.string("handle", 255).nullable();
    t.string("url", 500).nullable();
    t.integer("follower_count").nullable();
    t.decimal("engagement_rate", 5, 2).nullable();
    t.boolean("is_oauth_connected").defaultTo(false);
    t.timestamp("metrics_updated_at").nullable();
    t.timestamps(true, true);
    t.unique(["profile_id", "platform"]);
  });
  await knex.schema.createTable("bookouts", (t) => {
    t.string("id", 36).primary();
    t.string("profile_id", 36).nullable();
    t.string("starts_on", 20).notNullable();
    t.string("ends_on", 20).notNullable();
    t.text("note").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

async function seed() {
  await knex("bookouts").del();
  await knex("images").del();
  await knex("applications").del();
  await knex("profiles").del();
  await knex("users").del();

  await knex("users").insert({
    id: AGENCY_ID,
    email: `launch-${AGENCY_ID}@test.pholio`,
    role: "AGENCY",
  });

  const base = {
    is_discoverable: true,
    profile_status: "active",
    bio_curated: "Launch fixture",
    date_of_birth: "1996-01-01",
    gender: "Female",
    market: "new-york",
  };
  const rows = [
    { key: "Exact", first_name: "Ada", modeling_categories: '["editorial"]', height_cm: 178 },
    // Represented via the legacy current_agency fallback (PR6 derivation).
    { key: "NearFail", first_name: "Bea", modeling_categories: '["editorial"]', height_cm: 176, current_agency: "Elsewhere Mgmt" },
    { key: "NearUnknown", first_name: "Cyd", modeling_categories: '["editorial"]', height_cm: 175 },
    { key: "Outside", first_name: "Dot", modeling_categories: '["commercial"]', height_cm: 174 },
    { key: "Male", first_name: "Eli", gender: "Male", modeling_categories: '["editorial"]', height_cm: 188 },
  ];
  IDS = {};
  for (const r of rows) {
    const id = uuidv4();
    IDS[r.key] = id;
    const { key, ...cols } = r;
    await knex("profiles").insert({
      id,
      user_id: uuidv4(),
      last_name: key,
      slug: `${r.first_name}-${key}`.toLowerCase(),
      ...base,
      ...cols,
    });
  }

  // Bookouts: Exact has a non-overlapping bookout (positive availability data →
  // pass); NearFail overlaps the requested shoot window (→ fail).
  await knex("bookouts").insert([
    { id: uuidv4(), profile_id: IDS.Exact, starts_on: "2026-08-01", ends_on: "2026-08-05" },
    { id: uuidv4(), profile_id: IDS.NearFail, starts_on: "2026-07-10", ends_on: "2026-07-12" },
  ]);
}

beforeAll(async () => {
  if (!isPostgres && fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  await createSchema();
}, 30000);

afterAll(async () => {
  await knex.destroy();
});

beforeEach(async () => {
  await seed();
  for (const k of Object.keys(CONTRACTS)) delete CONTRACTS[k];
});

const SHOOT_BRIEF = "editorial nyc shoot";
const HARD_SHOOT = {
  gender_presentation: ["female"],
  boards: ["editorial"],
  location: { market: "new-york", span: "nyc" },
  availability: [
    { kind: "shoot", from: "2026-07-09", to: "2026-07-14", span: "July 9-14" },
  ],
};

describe("launch-mode grouping", () => {
  test("embedding feature-off keeps launch parsing local and preserves structured results", async () => {
    const previousFlag = process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS;
    process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "false";
    parseBrief.mockClear();

    try {
      const res = await launchModeSearch({
        knex,
        briefText: "female editorial talent",
        limit: 30,
        includeOutsideSpec: false,
        agencyUserId: AGENCY_ID,
        now: new Date("2026-07-01"),
      });

      expect(parseBrief).not.toHaveBeenCalled();
      expect(res.meta.semantic_search).toBe(false);
      expect(res.discover_v2.pool.eligible).toBeGreaterThan(0);
    } finally {
      process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = previousFlag;
    }
  });

  test("splits exact / near, excludes client-gate + gender-gate misses", async () => {
    CONTRACTS[SHOOT_BRIEF] = contract(HARD_SHOOT);

    const res = await launchModeSearch({
      knex,
      briefText: SHOOT_BRIEF,
      limit: 30,
      includeOutsideSpec: false,
      agencyUserId: AGENCY_ID,
      now: new Date("2026-07-01"),
    });

    expect(res.meta.engine).toBe("launch");
    // Gender SQL exclusion removes the male from the pool entirely.
    expect(res.discover_v2.pool.eligible).toBe(4);

    const groups = res.discover_v2.groups;
    const exact = groups.find((g) => g.kind === "exact");
    const near = groups.find((g) => g.kind === "near");

    expect(exact.results.map((r) => r.first_name)).toEqual(["Ada"]);
    expect(exact.results[0].tier_band).toBe("high");

    expect(near.missed).toBe("availability");
    expect(near.results.map((r) => r.first_name).sort()).toEqual(["Bea", "Cyd"]);

    // Dot (commercial → boards client-gate fail) is NOT shown without opt-in.
    const shownNames = res.profiles.map((p) => p.first_name);
    expect(shownNames).not.toContain("Dot");
    expect(shownNames).not.toContain("Eli");

    expect(res.discover_v2.pool.shown).toBe(3);
  });

  test("constraint_truth annotates the availability miss", async () => {
    CONTRACTS[SHOOT_BRIEF] = contract(HARD_SHOOT);
    const res = await launchModeSearch({
      knex,
      briefText: SHOOT_BRIEF,
      agencyUserId: AGENCY_ID,
      now: new Date("2026-07-01"),
    });
    const bea = res.profiles.find((p) => p.first_name === "Bea");
    const avail = bea.constraint_truth.find((c) => c.field === "availability");
    expect(avail.status).toBe("fail");
    const cyd = res.profiles.find((p) => p.first_name === "Cyd");
    expect(
      cyd.constraint_truth.find((c) => c.field === "availability").status,
    ).toBe("unknown");
  });

  test("include_outside_spec surfaces client-gate misses in a labeled group", async () => {
    CONTRACTS[SHOOT_BRIEF] = contract(HARD_SHOOT);
    const res = await launchModeSearch({
      knex,
      briefText: SHOOT_BRIEF,
      includeOutsideSpec: true,
      agencyUserId: AGENCY_ID,
      now: new Date("2026-07-01"),
    });
    const outside = res.discover_v2.groups.find((g) => g.kind === "outside_spec");
    expect(outside).toBeDefined();
    expect(outside.results.map((r) => r.first_name)).toContain("Dot");
    expect(outside.results[0].tier_band).toBe("low");
  });

  test("emits an internal _launch log block for the route", async () => {
    CONTRACTS[SHOOT_BRIEF] = contract(HARD_SHOOT);
    const res = await launchModeSearch({
      knex,
      briefText: SHOOT_BRIEF,
      agencyUserId: AGENCY_ID,
      now: new Date("2026-07-01"),
    });
    expect(res._launch.engine).toBe("launch");
    expect(res._launch.contract).toBeDefined();
    expect(res._launch.timings.parse_ms).toBeGreaterThanOrEqual(0);
    expect(res._launch.group_counts.exact).toBe(1);
    expect(res._launch.result_profile_ids.length).toBe(3);
  });
});

describe("credential honesty gate", () => {
  test("credential ask → honest zero, no results", async () => {
    const brief = "editorial with tearsheets";
    CONTRACTS[brief] = contract(
      {
        gender_presentation: ["female"],
        credentials: { tearsheets: true, span: "tearsheets" },
      },
      { credential_gate: true },
    );
    const res = await launchModeSearch({
      knex,
      briefText: brief,
      agencyUserId: AGENCY_ID,
    });
    expect(res.profiles).toHaveLength(0);
    expect(res.discover_v2.groups).toHaveLength(0);
    expect(res.discover_v2.honest_zero.removable_chip).toBe("credentials");
  });
});

describe("honest zero (most-narrowing chip)", () => {
  test("names the constraint whose removal grows the exact group most", async () => {
    const brief = "very tall editorial";
    CONTRACTS[brief] = contract({
      gender_presentation: ["female"],
      height_cm: { op: "min", value: 210, span: "very tall" },
    });
    const res = await launchModeSearch({
      knex,
      briefText: brief,
      agencyUserId: AGENCY_ID,
    });
    expect(res.profiles).toHaveLength(0);
    expect(res.discover_v2.honest_zero.removable_chip).toBe("height_cm");
  });
});

describe("representation_status (PR6 reconcile)", () => {
  test("unrepresented constraint excludes legacy-represented talent (client gate)", async () => {
    const brief = "unrepresented female new faces";
    CONTRACTS[brief] = contract({
      gender_presentation: ["female"],
      representation_status: ["unrepresented"],
    });
    const res = await launchModeSearch({
      knex,
      briefText: brief,
      agencyUserId: AGENCY_ID,
    });
    const names = res.profiles.map((p) => p.first_name);
    // Bea has legacy current_agency → derived "represented" → client-gate fail,
    // never auto-shown. Everyone else derives "unrepresented" → pass.
    expect(names).not.toContain("Bea");
    expect(names).toEqual(expect.arrayContaining(["Ada", "Cyd", "Dot"]));
    const exact = res.discover_v2.groups.find((g) => g.kind === "exact");
    expect(exact.results.map((r) => r.first_name)).not.toContain("Bea");
    // DTO representation_status agrees with the constraint truth shown.
    const ada = res.profiles.find((p) => p.first_name === "Ada");
    expect(ada.representation_status).toBe("unrepresented");
  });
});
