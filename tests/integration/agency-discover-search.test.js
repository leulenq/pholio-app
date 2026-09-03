"use strict";

process.env.DATABASE_URL = "sqlite://./test-discover-search.sqlite3";
process.env.DB_CLIENT = "sqlite3";

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

let mockParsedBrief;
jest.mock("../../src/domains/agency/services/discover/parse", () => ({
  parseBrief: jest.fn(async () => mockParsedBrief),
}));

const knex = require("../../src/shared/db/knex");
const {
  searchDiscoverableTalent,
  canUseSemanticSearch,
  mergeFilters,
} = require("../../src/domains/agency/services/discover-search");

const DB_PATH = path.resolve(__dirname, "../../test-discover-search.sqlite3");
const AGENCY_ID = uuidv4();

function emptyHard(overrides = {}) {
  return {
    gender_presentation: null,
    height_cm: null,
    playing_age: null,
    measurements: null,
    shoe: null,
    location: null,
    availability: null,
    visible_tattoos: null,
    boards: null,
    hair_color: null,
    eye_color: null,
    heritage: null,
    union: null,
    representation_status: null,
    credentials: null,
    experience_level: null,
    ...overrides,
  };
}

function parsedBrief(hard, softQuery = "", extra = {}) {
  return {
    contract: {
      roles: [{ label: "role 1", count: 1, hard, soft_query: softQuery }],
      set_aside: [],
      unparsed_remainder: "",
      credential_gate: false,
    },
    dropped: [],
    needs_confirmation_fields: [],
    multi_role: false,
    credential_gate: false,
    source: "groq",
    ...extra,
  };
}

const minHeight = (cm) => ({
  op: "min",
  a: cm,
  b: null,
  value: cm,
  span: `${cm}cm and up`,
  confidence: 0.99,
  needs_confirmation: false,
});

async function createSchema() {
  await knex.schema.createTable("profiles", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36);
    table.string("slug");
    table.string("first_name");
    table.string("last_name");
    table.string("city");
    table.string("market");
    table.string("gender");
    table.string("date_of_birth");
    table.string("profile_status");
    table.boolean("is_discoverable");
    table.text("bio_curated");
    table.text("specialties");
    table.integer("height_cm");
    table.integer("waist_cm");
    table.integer("playing_age_min");
    table.integer("playing_age_max");
    table.text("modeling_categories");
    table.string("hair_color");
    table.string("eye_color");
    table.string("experience_level");
    table.string("availability_status");
    table.boolean("tattoos");
    table.text("ethnicity");
    table.string("shoe_size");
    table.string("shoe_region");
    table.string("dress_size");
    table.string("union_membership");
    table.timestamp("created_at");
  });
  await knex.schema.createTable("profile_booking_lanes", (table) => {
    table.string("profile_id", 36);
    table.string("lane_slug", 80);
    table.integer("priority").defaultTo(2);
    table.string("source", 40).defaultTo("talent_selected");
  });
  await knex.schema.createTable("bookouts", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36);
    table.string("starts_on");
    table.string("ends_on");
  });
  await knex.schema.createTable("applications", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36);
    table.string("agency_id", 36);
    table.string("invited_by_agency_id", 36).nullable();
  });
  await knex.schema.createTable("images", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36);
    table.string("path");
    table.string("public_url").nullable();
    table.string("status").nullable();
    table.string("moderation_status").nullable();
    table.boolean("exclude_from_public").defaultTo(false);
    table.boolean("exclude_from_agency").defaultTo(false);
    table.integer("sort").defaultTo(0);
    table.timestamp("created_at");
  });
  await knex.schema.createTable("social_accounts", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36);
    table.string("platform");
    table.string("handle").nullable();
    table.string("url").nullable();
    table.integer("follower_count").nullable();
    table.decimal("engagement_rate").nullable();
    table.boolean("is_oauth_connected").defaultTo(false);
    table.timestamp("metrics_updated_at").nullable();
    table.timestamp("created_at").nullable();
    table.timestamp("updated_at").nullable();
  });
  await knex.schema.createTable("agencies", (table) => {
    table.string("id", 36).primary();
    table.string("name");
    table.string("slug");
  });
  await knex.schema.createTable("talent_user_settings", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36);
    table.text("privacy_preferences");
  });
}

/**
 * Four discoverable talent. Lanes live in the join table only (the canonical
 * store); `modeling_categories` is deliberately stale on Ada so a board match
 * proves the join is read, not the legacy column.
 */
async function seedProfiles() {
  const rows = [
    {
      slug: "ada-editorial",
      first_name: "Ada",
      last_name: "Editorial",
      city: "New York",
      market: "new-york",
      gender: "Female",
      height_cm: 178,
      waist_cm: 61,
      playing_age_min: 22,
      playing_age_max: 30,
      modeling_categories: JSON.stringify(["commercial"]),
      lanes: ["editorial"],
      hair_color: "Blonde",
      eye_color: "Green",
      experience_level: "New face",
      tattoos: false,
      ethnicity: JSON.stringify(["Hispanic/Latino"]),
      shoe_size: "9 US",
      dress_size: "4",
      bio_curated: "Editorial work in New York and Paris.",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      slug: "bella-commercial",
      first_name: "Bella",
      last_name: "Commercial",
      city: "New York",
      market: "new-york",
      gender: "Female",
      height_cm: 170,
      playing_age_min: 24,
      playing_age_max: 32,
      lanes: ["commercial"],
      hair_color: "Red",
      eye_color: "Blue",
      experience_level: "Experienced",
      tattoos: true,
      ethnicity: JSON.stringify(["East Asian"]),
      shoe_size: "8 US",
      bio_curated: "Commercial and lifestyle campaigns.",
      created_at: "2026-01-02T00:00:00.000Z",
    },
    {
      slug: "marcus-runway",
      first_name: "Marcus",
      last_name: "Runway",
      city: "Milan",
      market: "milan",
      gender: "Male",
      height_cm: 188,
      lanes: ["runway"],
      hair_color: "Black",
      experience_level: "Established",
      bio_curated: "Runway seasons in Milan.",
      created_at: "2026-01-03T00:00:00.000Z",
    },
    {
      slug: "cara-newest",
      first_name: "Cara",
      last_name: "Newest",
      city: "New York",
      market: "new-york",
      gender: "Female",
      height_cm: 176,
      playing_age_min: 20,
      playing_age_max: 26,
      lanes: ["editorial"],
      hair_color: "Blonde",
      eye_color: "Green",
      experience_level: "New face",
      tattoos: false,
      ethnicity: null,
      bio_curated: "Editorial test shoots, newly signed to nobody.",
      created_at: "2026-02-01T00:00:00.000Z",
    },
  ].map((row) => ({
    ...row,
    id: uuidv4(),
    user_id: uuidv4(),
    date_of_birth: "1995-01-01",
    profile_status: "active",
    is_discoverable: true,
  }));

  await knex("profiles").insert(rows.map(({ lanes, ...row }) => row));
  const laneRows = [];
  for (const row of rows) {
    (row.lanes || []).forEach((slug, index) => {
      laneRows.push({ profile_id: row.id, lane_slug: slug, priority: index + 1 });
    });
  }
  if (laneRows.length) await knex("profile_booking_lanes").insert(laneRows);
  return rows;
}

const names = (list) => list.map((profile) => profile.last_name);
const groupNames = (result, kind) =>
  names(result.discover_v2.groups.find((g) => g.kind === kind).results);

beforeAll(async () => {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  await createSchema();
});

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
});

beforeEach(async () => {
  await knex("talent_user_settings").del();
  await knex("agencies").del();
  await knex("applications").del();
  await knex("images").del();
  await knex("social_accounts").del();
  await knex("bookouts").del();
  await knex("profile_booking_lanes").del();
  await knex("profiles").del();
  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "North Star Models",
    slug: "north-star-models",
  });
  await seedProfiles();
  mockParsedBrief = parsedBrief(emptyHard());
});

describe("browse mode", () => {
  test("is alphabetical with a stable id tie-breaker", async () => {
    const result = await searchDiscoverableTalent(knex, { agencyId: AGENCY_ID });
    expect(names(result.profiles)).toEqual([
      "Commercial",
      "Editorial",
      "Newest",
      "Runway",
    ]);
    expect(result.meta.ordering).toBe("name");
    expect(result.discover_v2).toBeUndefined();
    // The card reads the talent's declared lanes, never a defaulted board.
    expect(
      result.profiles.find((p) => p.last_name === "Editorial").lanes,
    ).toEqual(["Editorial"]);
    expect(
      result.profiles.find((p) => p.last_name === "Runway").lanes,
    ).toEqual(["Runway"]);
  });

  test("explicit filters compare case-insensitively", async () => {
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      hair_color: "blonde",
    });
    expect(names(result.profiles)).toEqual(["Editorial", "Newest"]);

    const byExperience = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      experience_level: "new face",
    });
    expect(names(byExperience.profiles)).toEqual(["Editorial", "Newest"]);
  });

  test("blocked talent are excluded before pagination and totals", async () => {
    const blocked = await knex("profiles")
      .where({ slug: "bella-commercial" })
      .first();
    await knex("talent_user_settings").insert({
      id: uuidv4(),
      user_id: blocked.user_id,
      privacy_preferences: JSON.stringify({ blockedAgencies: [AGENCY_ID] }),
    });

    const result = await searchDiscoverableTalent(knex, { agencyId: AGENCY_ID });
    expect(names(result.profiles)).toEqual(["Editorial", "Newest", "Runway"]);
    expect(result.pagination.total).toBe(3);
  });

  test("semantic ranking is permanently disabled", () => {
    expect(canUseSemanticSearch()).toBe(false);
  });
});

describe("match-first query mode", () => {
  test("exact matches first, closest after, nobody hidden but the wrong gender", async () => {
    mockParsedBrief = parsedBrief(
      emptyHard({
        gender_presentation: ["female"],
        height_cm: minHeight(175),
        boards: ["editorial"],
      }),
      "editorial",
    );

    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "Editorial women, 175cm and up",
    });

    // Group 1 is ordered newest first once soft overlap ties.
    expect(groupNames(result, "match")).toEqual(["Newest", "Editorial"]);
    expect(groupNames(result, "partial")).toEqual(["Commercial"]);
    expect(names(result.profiles)).toEqual(["Newest", "Editorial", "Commercial"]);

    expect(result.discover_v2.engine).toBe("match");
    expect(result.discover_v2.pool).toEqual({
      eligible: 4,
      match: 2,
      partial: 1,
      shown: 3,
    });
    expect(result.discover_v2.filters.map((f) => f.text)).toEqual([
      "Women",
      `5'9" and up`,
      "Editorial",
    ]);
    expect(result.discover_v2.roles).toEqual([
      {
        index: 0,
        label: "role 1",
        count: 1,
        summary: `Women, 5'9" and up, Editorial`,
      },
    ]);
    expect(result.meta.natural_language_search).toBe(true);
    expect(result.meta.query_understanding).toBeUndefined();
    expect(result.discover_v2.honest_zero).toBeUndefined();
    expect(result.discover_v2.understanding).toBeUndefined();

    const ada = result.profiles.find((p) => p.last_name === "Editorial");
    expect(ada).not.toHaveProperty("match_score");
    expect(ada.facts).toEqual(["Woman", `5'10"`, "Editorial"]);
    expect(ada.lanes).toEqual(["Editorial"]);
    expect(ada.notes).toEqual([]);
    // "Editorial" is already an applied board filter and a card fact; it is
    // not repeated as a mention.
    expect(ada.mentions).toEqual([]);

    const bella = result.profiles.find((p) => p.last_name === "Commercial");
    expect(bella.notes).toEqual([`5'7", 2 in under`, "Commercial board"]);
  });

  test("boards are read from the join table, not the stale legacy column", async () => {
    // Ada's `modeling_categories` says commercial; her lane row says editorial.
    mockParsedBrief = parsedBrief(emptyHard({ boards: ["editorial"] }));
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "editorial board",
    });
    expect(groupNames(result, "match")).toEqual(["Newest", "Editorial"]);
  });

  test("a profile who answered no to tattoos passes 'no visible tattoos'", async () => {
    mockParsedBrief = parsedBrief(emptyHard({ visible_tattoos: false }));
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "no visible tattoos",
    });

    expect(groupNames(result, "match")).toEqual(["Newest", "Editorial"]);
    const partial = result.discover_v2.groups.find((g) => g.kind === "partial");
    expect(names(partial.results)).toEqual(["Runway", "Commercial"]);
    expect(partial.results[0].notes).toEqual(["Tattoos not listed"]);
    expect(partial.results[1].notes).toEqual(["Has visible tattoos"]);
  });

  test("partials are ordered by misses, then blanks", async () => {
    mockParsedBrief = parsedBrief(
      emptyHard({
        height_cm: minHeight(175),
        hair_color: ["blonde"],
        heritage: ["hispanic_latino"],
      }),
    );
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "tall blonde latina",
    });

    // Cara: 1 blank (heritage). Marcus: 1 miss (hair) + 1 blank (heritage).
    // Bella: 3 misses.
    expect(groupNames(result, "match")).toEqual(["Editorial"]);
    expect(groupNames(result, "partial")).toEqual([
      "Newest",
      "Runway",
      "Commercial",
    ]);
    const [cara, marcus, bella] = result.discover_v2.groups.find(
      (g) => g.kind === "partial",
    ).results;
    expect(cara.notes).toEqual(["Heritage not listed"]);
    expect(marcus.notes).toEqual(["Black hair", "Heritage not listed"]);
    expect(bella.notes).toEqual([
      `5'7", 2 in under`,
      "Red hair",
      "Heritage differs",
    ]);
  });

  test("heritage matches the talent's own selection and shows their own label", async () => {
    mockParsedBrief = parsedBrief(emptyHard({ heritage: ["hispanic_latino"] }));
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "latina talent",
    });

    const match = result.discover_v2.groups.find((g) => g.kind === "match");
    expect(names(match.results)).toEqual(["Editorial"]);
    expect(match.results[0].facts).toEqual(["Hispanic/Latino"]);
    expect(match.results[0].heritage).toEqual(["Hispanic/Latino"]);
    expect(result.discover_v2.filters[0].text).toBe("Hispanic/Latino");
  });

  test("shoe sizes stored as strings are parsed and compared", async () => {
    mockParsedBrief = parsedBrief(emptyHard({ shoe: { size: 9, region: "US" } }));
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "shoe 9",
    });
    expect(groupNames(result, "match")).toEqual(["Editorial"]);
    const partial = result.discover_v2.groups.find((g) => g.kind === "partial");
    expect(partial.results.find((p) => p.last_name === "Commercial").notes).toEqual([
      "Shoe US 8",
    ]);
  });

  test("an overlapping bookout is a miss with the days named", async () => {
    const ada = await knex("profiles").where({ slug: "ada-editorial" }).first();
    await knex("profiles")
      .where({ id: ada.id })
      .update({ availability_status: "available" });
    await knex("bookouts").insert({
      id: uuidv4(),
      profile_id: ada.id,
      starts_on: "2026-07-10",
      ends_on: "2026-07-12",
    });

    mockParsedBrief = parsedBrief(
      emptyHard({
        availability: [
          { kind: "shoot", from: "2026-07-09", to: "2026-07-14", span: "July 9-14" },
        ],
      }),
    );
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "available July 9 to 14",
    });

    const adaResult = result.profiles.find((p) => p.last_name === "Editorial");
    expect(adaResult.notes).toEqual(["Booked out Jul 10 to 12"]);
  });

  test("a field blank across the whole pool is said once", async () => {
    mockParsedBrief = parsedBrief(emptyHard({ union: "union" }));
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "union talent",
    });
    expect(result.discover_v2.notes).toEqual([
      "Union status isn't listed on any profile yet.",
    ]);
    expect(result.discover_v2.pool.match).toBe(0);
    expect(result.discover_v2.pool.partial).toBe(4);
  });

  test("a credential ask is a note, not an empty grid", async () => {
    mockParsedBrief = parsedBrief(
      emptyHard({ boards: ["editorial"] }),
      "editorial",
      { credential_gate: true },
    );
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "editorial women with tearsheets",
    });
    expect(result.discover_v2.notes).toEqual([
      "Tearsheets and show credits aren't listed on profiles yet, so that part of the brief wasn't used.",
    ]);
    expect(result.discover_v2.pool.match).toBe(2);
  });

  test("paging runs across both groups", async () => {
    mockParsedBrief = parsedBrief(
      emptyHard({ gender_presentation: ["female"], boards: ["editorial"] }),
    );
    const page2 = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "editorial women",
      limit: "2",
      page: "2",
    });

    expect(names(page2.profiles)).toEqual(["Commercial"]);
    expect(groupNames(page2, "match")).toEqual([]);
    expect(groupNames(page2, "partial")).toEqual(["Commercial"]);
    // Totals are the full group counts, not the page slice.
    expect(page2.discover_v2.groups.map((g) => g.total)).toEqual([2, 1]);
    expect(page2.pagination).toMatchObject({
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNext: false,
      hasPrev: true,
    });
  });

  test("the role parameter picks which role is searched", async () => {
    mockParsedBrief = {
      contract: {
        roles: [
          {
            label: "women 22 to 30",
            count: 2,
            hard: emptyHard({ gender_presentation: ["female"] }),
            soft_query: "",
          },
          {
            label: "man, 40s",
            count: 1,
            hard: emptyHard({ gender_presentation: ["male"] }),
            soft_query: "",
          },
        ],
        set_aside: [],
        unparsed_remainder: "",
      },
      dropped: [],
      needs_confirmation_fields: [],
      multi_role: true,
      credential_gate: false,
      source: "groq",
    };

    const first = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "2 women and 1 man",
    });
    expect(first.discover_v2.role).toBe(0);
    expect(first.discover_v2.roles.map((r) => r.label)).toEqual([
      "women 22 to 30",
      "man, 40s",
    ]);
    expect(names(first.profiles)).toEqual(["Newest", "Commercial", "Editorial"]);

    const second = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "2 women and 1 man",
      role: "1",
    });
    expect(second.discover_v2.role).toBe(1);
    expect(names(second.profiles)).toEqual(["Runway"]);

    // Out of range clamps rather than throwing.
    const clamped = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "2 women and 1 man",
      role: "9",
    });
    expect(clamped.discover_v2.role).toBe(1);
  });

  test("a constraint the re-parse could not read is not applied and is explained", async () => {
    mockParsedBrief = parsedBrief(
      emptyHard({
        height_cm: {
          op: "min",
          a: 175,
          b: null,
          value: null,
          span: "yea tall",
          needs_confirmation: true,
        },
      }),
      "",
      {
        needs_confirmation_fields: [
          { role: 0, field: "height_cm", span: "yea tall", reason: "reparse_disagreement" },
        ],
      },
    );
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "yea tall",
    });

    expect(result.discover_v2.filters).toEqual([]);
    expect(result.discover_v2.notes).toEqual([
      `The height in the brief couldn't be read, so it wasn't used. State it as 5'9" or 175 cm.`,
    ]);
    expect(result.discover_v2.pool.match).toBe(4);
  });

  test("soft words are matched against the talent's own words only", async () => {
    mockParsedBrief = parsedBrief(emptyHard(), "editorial, strong bone structure");
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "editorial, strong bone structure",
    });

    // Everyone matches (no requirements); overlap decides the order, then
    // recency breaks the tie.
    expect(names(result.profiles)).toEqual([
      "Newest",
      "Editorial",
      "Runway",
      "Commercial",
    ]);
    expect(result.profiles[0].mentions).toEqual(["editorial"]);
    expect(result.profiles[3].mentions).toEqual([]);
    for (const profile of result.profiles) {
      expect(profile).not.toHaveProperty("score");
    }
  });

  test("every search carries a log payload for the route to write", async () => {
    mockParsedBrief = parsedBrief(emptyHard({ boards: ["editorial"] }), "editorial");
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "editorial",
    });

    expect(result._launch.engine).toBe("match");
    expect(result._launch.group_counts).toEqual({ match: 2, partial: 2 });
    expect(result._launch.result_profile_ids).toHaveLength(4);
    expect(result._launch.contract.roles).toHaveLength(1);
    expect(typeof result._launch.timings.total_ms).toBe("number");
  });
});

describe("mergeFilters", () => {
  test("explicit query parameters override parsed defaults", () => {
    expect(
      mergeFilters(
        { city: "Milan", min_height: "180" },
        { city: "Paris", min_height: 175 },
      ),
    ).toMatchObject({ city: "Milan", min_height: 180 });
  });
});

/**
 * "Not for us" — the private half of the Scout bar
 * (tasks/discover-expanded-view-2026-09.md §4.3).
 *
 * The store arrives with a migration, so the first test here is the
 * deploy-before-migrate window: a search must run unfiltered rather than fail
 * when the table does not exist yet. The rest create the table for the block
 * and drop it again, so the suite's other describes keep exercising the
 * table-absent path they were written against.
 */
describe("dismissed leads", () => {
  const {
    resetDismissalsSchemaCache,
  } = require("../../src/domains/agency/services/agency-dismissals");

  test("a missing dismissal table does not throw, and hides nobody", async () => {
    resetDismissalsSchemaCache();
    expect(await knex.schema.hasTable("agency_dismissed_profiles")).toBe(false);

    const result = await searchDiscoverableTalent(knex, { agencyId: AGENCY_ID });
    expect(result.pagination.total).toBe(4);

    mockParsedBrief = parsedBrief(emptyHard());
    const matched = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "anyone",
    });
    expect(matched.profiles).toHaveLength(4);
  });

  describe("with the store present", () => {
    const OTHER_AGENCY_ID = uuidv4();

    beforeAll(async () => {
      await knex.schema.createTable("agency_dismissed_profiles", (table) => {
        table.string("id", 36).primary();
        table.string("agency_id", 36).notNullable();
        table.string("profile_id", 36).notNullable();
        table.timestamp("created_at");
        table.unique(["agency_id", "profile_id"]);
      });
      resetDismissalsSchemaCache();
    });

    afterAll(async () => {
      await knex.schema.dropTableIfExists("agency_dismissed_profiles");
      resetDismissalsSchemaCache();
    });

    beforeEach(async () => {
      await knex("agency_dismissed_profiles").del();
    });

    async function dismiss(profileSlug, agencyId = AGENCY_ID) {
      const profile = await knex("profiles").where({ slug: profileSlug }).first();
      await knex("agency_dismissed_profiles").insert({
        id: uuidv4(),
        agency_id: agencyId,
        profile_id: profile.id,
        created_at: new Date().toISOString(),
      });
      return profile;
    }

    test("browse mode drops them before pagination and totals", async () => {
      await dismiss("bella-commercial");

      const result = await searchDiscoverableTalent(knex, {
        agencyId: AGENCY_ID,
      });
      expect(names(result.profiles)).toEqual([
        "Editorial",
        "Newest",
        "Runway",
      ]);
      expect(result.pagination.total).toBe(3);
    });

    test("query mode drops them from the eligible pool, not just the page", async () => {
      await dismiss("ada-editorial");
      mockParsedBrief = parsedBrief(emptyHard({ boards: ["editorial"] }));

      const result = await searchDiscoverableTalent(knex, {
        agencyId: AGENCY_ID,
        q: "editorial board",
      });
      expect(groupNames(result, "match")).toEqual(["Newest"]);
      expect(result.discover_v2.pool.eligible).toBe(3);
    });

    test("it is one agency's view state, never another's", async () => {
      await dismiss("bella-commercial", OTHER_AGENCY_ID);

      const result = await searchDiscoverableTalent(knex, {
        agencyId: AGENCY_ID,
      });
      expect(names(result.profiles)).toContain("Commercial");
      expect(result.pagination.total).toBe(4);
    });
  });
});
