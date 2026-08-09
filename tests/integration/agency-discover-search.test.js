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
    union: null,
    representation_status: null,
    credentials: null,
    experience_level: null,
    ...overrides,
  };
}

function parsedBrief(hard, softQuery = "") {
  return {
    contract: {
      roles: [{ label: "role 1", count: 1, hard, soft_query: softQuery }],
      set_aside: [],
      unparsed_remainder: "",
    },
    dropped: [],
    needs_confirmation_fields: [],
    multi_role: false,
    credential_gate: false,
    source: "groq",
  };
}

async function createSchema() {
  await knex.schema.createTable("profiles", (table) => {
    table.string("id", 36).primary();
    table.string("slug");
    table.string("first_name");
    table.string("last_name");
    table.string("city");
    table.string("gender");
    table.string("date_of_birth");
    table.string("profile_status");
    table.boolean("is_discoverable");
    table.text("bio_curated");
    table.integer("height_cm");
    table.text("modeling_categories");
    table.string("hair_color");
    table.string("eye_color");
    table.string("experience_level");
    table.string("availability_status");
    table.timestamp("created_at");
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
}

async function seedProfiles() {
  const rows = [
    {
      id: uuidv4(),
      slug: "ada-editorial",
      first_name: "Ada",
      last_name: "Editorial",
      city: "New York",
      gender: "Female",
      height_cm: 178,
      modeling_categories: JSON.stringify(["editorial"]),
      hair_color: "brown",
      experience_level: "experienced",
    },
    {
      id: uuidv4(),
      slug: "bella-commercial",
      first_name: "Bella",
      last_name: "Commercial",
      city: "New York",
      gender: "Female",
      height_cm: 170,
      modeling_categories: JSON.stringify(["commercial"]),
      hair_color: "red",
      experience_level: "new_face",
    },
    {
      id: uuidv4(),
      slug: "marcus-runway",
      first_name: "Marcus",
      last_name: "Runway",
      city: "Milan",
      gender: "Male",
      height_cm: 188,
      modeling_categories: JSON.stringify(["runway"]),
      hair_color: "black",
      experience_level: "established",
    },
  ].map((row, index) => ({
    ...row,
    date_of_birth: "1995-01-01",
    profile_status: "active",
    is_discoverable: true,
    bio_curated: "Professional profile",
    created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  }));
  await knex("profiles").insert(rows);
  return rows;
}

beforeAll(async () => {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  await createSchema();
});

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
});

beforeEach(async () => {
  await knex("applications").del();
  await knex("images").del();
  await knex("social_accounts").del();
  await knex("profiles").del();
  await seedProfiles();
  mockParsedBrief = parsedBrief(emptyHard());
});

describe("agency Discover directory", () => {
  test("browse mode is alphabetical with a stable id tie-breaker", async () => {
    const result = await searchDiscoverableTalent(knex, { agencyId: AGENCY_ID });
    expect(result.profiles.map((profile) => profile.last_name)).toEqual([
      "Commercial",
      "Editorial",
      "Runway",
    ]);
    expect(result.meta.ordering).toBe("name");
  });

  test("natural language narrows on factual constraints without scoring", async () => {
    mockParsedBrief = parsedBrief(
      emptyHard({
        gender_presentation: ["female"],
        height_cm: {
          op: "min",
          a: 175,
          b: null,
          value: 175,
          span: "175cm and up",
          confidence: 0.99,
          needs_confirmation: false,
        },
        boards: ["editorial"],
      }),
      "editorial",
    );

    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "Editorial women, 175cm and up",
    });

    expect(result.profiles.map((profile) => profile.last_name)).toEqual([
      "Editorial",
    ]);
    expect(result.profiles[0]).not.toHaveProperty("match_score");
    expect(result.profiles[0]).not.toHaveProperty("vibe_distance");
    expect(result.meta.natural_language_search).toBe(true);
    expect(result.meta.ordering).toBe("name");
    expect(result.discover_v2.understanding.applied.map((item) => item.field)).toEqual([
      "gender_presentation",
      "boards",
      "height_cm",
    ]);
  });

  test("an aesthetic phrase never changes stable ordering", async () => {
    mockParsedBrief = parsedBrief(emptyHard(), "quiet, striking presence");
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "Quiet, striking presence",
    });
    expect(result.profiles.map((profile) => profile.last_name)).toEqual([
      "Commercial",
      "Editorial",
      "Runway",
    ]);
  });

  test("semantic ranking is permanently disabled", () => {
    expect(canUseSemanticSearch()).toBe(false);
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
