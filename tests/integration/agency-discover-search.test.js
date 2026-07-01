// tests/integration/agency-discover-search.test.js
"use strict";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "sqlite://./test-discover-search.sqlite3";
process.env.DB_CLIENT = process.env.DB_CLIENT || "sqlite3";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";
process.env.DISCOVER_HYBRID = "true";
process.env.DISCOVER_RERANK_PROVIDER = "none";

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const mockUnitVector = Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0));
const mockVisualVector = Array.from({ length: 512 }, (_, i) =>
  i === 0 ? 1 : 0,
);
const mockCastingVector = Array.from({ length: 512 }, (_, i) =>
  i === 1 ? 1 : 0,
);
const mockMarketVector = Array.from({ length: 512 }, (_, i) =>
  i === 2 ? 1 : 0,
);
const mockFarVector = Array.from({ length: 512 }, (_, i) => (i === 3 ? 1 : 0));

jest.mock("../../src/domains/ai/embeddings", () => {
  const actual = jest.requireActual("../../src/domains/ai/embeddings");
  const unit = Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0));
  return {
    ...actual,
    embed: jest.fn(async (text) => {
      const t = (text || "").toLowerCase();
      if (
        t.includes("expensive") ||
        t.includes("quiet") ||
        t.includes("refined")
      ) {
        return Array.from({ length: 512 }, (_, i) => (i === 4 ? 1 : 0));
      }
      if (t.includes("market fit") || t.includes("luxury refined")) {
        return Array.from({ length: 512 }, (_, i) => (i === 2 ? 1 : 0));
      }
      if (t.includes("casting presence") || t.includes("editorial casting")) {
        return Array.from({ length: 512 }, (_, i) => (i === 1 ? 1 : 0));
      }
      return [...unit];
    }),
  };
});

jest.mock("../../src/domains/agency/services/query-understanding", () => {
  const actual = jest.requireActual(
    "../../src/domains/agency/services/query-understanding",
  );
  return {
    ...actual,
    understandQuery: jest.fn(async (q) => {
      const trimmed = (q || "").trim().toLowerCase();
      if (trimmed.includes("sharp jawline")) {
        return {
          residual_query: "sharp jawline severe profile",
          attributes: [
            { type: "visual", term: "sharp jawline", confidence: 0.9 },
            { type: "visual", term: "severe profile", confidence: 0.85 },
          ],
          constraints: trimmed.includes("editorial")
            ? [
                {
                  field: "archetype",
                  value: "Editorial",
                  confidence: 0.7,
                  mode: "soft",
                },
              ]
            : [],
          channel_queries: {
            visual: "sharp jawline severe profile angular bone structure",
            casting: "editorial casting presence",
            market: "editorial market fit luxury",
            lexical: trimmed,
          },
          source: "groq_mock",
        };
      }
      if (trimmed.includes("looks expensive")) {
        return {
          residual_query: "looks expensive quiet editorial face",
          attributes: [
            { type: "vibe", term: "refined", confidence: 0.9 },
            { type: "visual", term: "quiet face", confidence: 0.8 },
          ],
          constraints: [],
          channel_queries: {
            visual: "quiet editorial face refined bone structure",
            casting: "luxury editorial presence",
            market: "luxury refined market fit expensive",
            lexical: trimmed,
          },
          source: "groq_mock",
        };
      }
      if (trimmed.includes("redhead")) {
        return {
          residual_query: "severe profile",
          attributes: [
            { type: "visual", term: "severe profile", confidence: 0.85 },
          ],
          constraints: [
            {
              field: "hair_color",
              value: "red",
              confidence: 0.8,
              mode: "soft",
            },
            { field: "min_height", value: 175, confidence: 0.75, mode: "soft" },
          ],
          channel_queries: {
            visual: "severe profile sharp features",
            casting: "tall redhead casting",
            market: "editorial market fit",
            lexical: trimmed,
          },
          source: "groq_mock",
        };
      }
      if (trimmed.includes("black man")) {
        return {
          residual_query: "",
          attributes: [],
          constraints: [
            { field: "gender", value: "Male", confidence: 0.95, mode: "soft" },
            {
              field: "heritage",
              value: "Black",
              confidence: 0.9,
              mode: "soft",
            },
          ],
          channel_queries: {
            visual: "black man",
            casting: "male casting",
            market: "commercial market fit",
            lexical: trimmed,
          },
          source: "groq_mock",
        };
      }
      return actual.understandQuery(q);
    }),
  };
});

const knex = require("../../src/shared/db/knex");
const { embed, isPostgresKnex } = require("../../src/domains/ai/embeddings");
const {
  parseIntentToFilters,
  decomposeQueryFallback,
} = require("../../src/domains/agency/lib/intent-parser");
const {
  searchDiscoverableTalent,
  canUseSemanticSearch,
  mergeFilters,
  isDiscoverHybridEnabled,
} = require("../../src/domains/agency/services/discover-search");
const {
  reciprocalRankFusion,
} = require("../../src/domains/agency/services/discover-retrieval");
const { FORBIDDEN_KEYS } = require("../contract/audience-dto.test");

// Recursively collect every object key that appears anywhere in a payload.
function collectKeys(node, acc = new Set()) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectKeys(item, acc));
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      acc.add(key);
      collectKeys(value, acc);
    }
  }
  return acc;
}

// UTC date string (YYYY-MM-DD) for a DOB `yearsAgo` years and `dayOffset` days
// from today — used to seed exact age-boundary birthdays.
function dobForBoundary(yearsAgo, dayOffset = 0) {
  const now = new Date();
  const d = new Date(
    Date.UTC(
      now.getUTCFullYear() - yearsAgo,
      now.getUTCMonth(),
      now.getUTCDate() + dayOffset,
    ),
  );
  return d.toISOString().slice(0, 10);
}

const TEST_DB_PATH = path.resolve(
  __dirname,
  "../../test-discover-search.sqlite3",
);
const isPostgres = isPostgresKnex(knex);

const AGENCY_ID = uuidv4();
let PROFILE_IDS = {};

async function createSchema() {
  if (!(await knex.schema.hasTable("users"))) {
    await knex.schema.createTable("users", (t) => {
      t.string("id", 36).primary();
      t.string("email").notNullable().unique();
      t.string("role").notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("profiles"))) {
    await knex.schema.createTable("profiles", (t) => {
      t.string("id", 36).primary();
      t.string("user_id", 36).nullable();
      t.string("first_name", 100).nullable();
      t.string("last_name", 100).nullable();
      t.string("slug", 200).nullable();
      t.string("city", 100).nullable();
      t.string("city_secondary", 100).nullable();
      t.string("nationality", 100).nullable();
      t.integer("height_cm").nullable();
      t.integer("bust_cm").nullable();
      t.integer("waist_cm").nullable();
      t.integer("hips_cm").nullable();
      t.integer("inseam_cm").nullable();
      t.string("shoe_size", 20).nullable();
      t.string("dress_size", 20).nullable();
      t.timestamp("measurements_updated_at").nullable();
      t.integer("age").nullable();
      // Age is DERIVED from DOB (audit P0-7) — the stored `age` column above is
      // legacy and no longer read by discover-search.
      t.string("date_of_birth", 40).nullable();
      t.timestamp("guardian_consent_at").nullable();
      t.string("gender", 50).nullable();
      t.string("archetype", 50).nullable();
      t.string("experience_level", 50).nullable();
      t.text("bio_curated").nullable();
      t.text("bio_raw").nullable();
      t.text("look_descriptor").nullable();
      t.text("image_analysis").nullable();
      t.text("search_document").nullable();
      t.string("hair_color", 50).nullable();
      t.string("hair_length", 50).nullable();
      t.string("hair_type", 50).nullable();
      t.string("eye_color", 50).nullable();
      t.text("ethnicity").nullable();
      t.text("specialties").nullable();
      t.text("specializations").nullable();
      t.text("languages").nullable();
      t.text("training").nullable();
      t.boolean("availability_travel").nullable();
      t.boolean("seeking_representation").nullable();
      t.string("union_membership", 100).nullable();
      t.integer("playing_age_min").nullable();
      t.integer("playing_age_max").nullable();
      t.boolean("is_discoverable").defaultTo(false);
      t.string("profile_status", 50).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  } else {
    if (!(await knex.schema.hasColumn("profiles", "search_document"))) {
      await knex.schema.alterTable("profiles", (t) => {
        t.text("search_document").nullable();
      });
    }
    if (!(await knex.schema.hasColumn("profiles", "image_analysis"))) {
      await knex.schema.alterTable("profiles", (t) => {
        t.text("image_analysis").nullable();
      });
    }
    if (!(await knex.schema.hasColumn("profiles", "hair_color"))) {
      await knex.schema.alterTable("profiles", (t) => {
        t.string("hair_color", 50).nullable();
      });
    }
    if (!(await knex.schema.hasColumn("profiles", "ethnicity"))) {
      await knex.schema.alterTable("profiles", (t) => {
        t.text("ethnicity").nullable();
      });
    }
  }

  if (!(await knex.schema.hasTable("applications"))) {
    await knex.schema.createTable("applications", (t) => {
      t.string("id", 36).primary();
      t.string("profile_id", 36).nullable();
      t.string("agency_id", 36).nullable();
      t.string("invited_by_agency_id", 36).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("images"))) {
    await knex.schema.createTable("images", (t) => {
      t.string("id", 36).primary();
      t.string("profile_id", 36).nullable();
      t.string("path").nullable();
      t.string("public_url").nullable();
      t.boolean("is_primary").defaultTo(false);
      t.string("shot_type", 50).nullable();
      t.string("image_type", 50).nullable();
      t.integer("sort").defaultTo(0);
      // Visibility columns consumed by applyImageVisibility (AGENCY_DISCOVERY).
      t.string("status", 20).nullable();
      t.string("moderation_status", 20).nullable();
      t.boolean("exclude_from_public").defaultTo(false);
      t.boolean("exclude_from_agency").defaultTo(false);
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("talent_embedding_cache"))) {
    await knex.schema.createTable("talent_embedding_cache", (t) => {
      t.string("profile_id", 36).notNullable();
      t.string("source", 50).notNullable();
      t.text("embedding_json").notNullable();
      t.text("source_text").nullable();
      t.timestamp("embedded_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.primary(["profile_id", "source"]);
    });
  }

  const ftsCheck = await knex.raw(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='profiles_fts'`,
  );
  if (!isPostgres && !(ftsCheck || []).length) {
    await knex.raw(
      `CREATE VIRTUAL TABLE profiles_fts USING fts5(profile_id UNINDEXED, document)`,
    );
  }
}

async function seedDiscoverProfiles() {
  await knex("applications").del();
  await knex("images").del();
  if (await knex.schema.hasTable("profiles_fts")) {
    await knex("profiles_fts").del();
  }
  if (await knex.schema.hasTable("talent_embedding_cache")) {
    await knex("talent_embedding_cache").del();
  }
  await knex("profiles").del();
  await knex("users").del();

  await knex("users").insert({
    id: AGENCY_ID,
    email: "discover-agency@test.pholio",
    role: "AGENCY",
  });

  const profiles = [
    {
      id: uuidv4(),
      first_name: "Elena",
      last_name: "Editorial",
      gender: "Female",
      archetype: "Editorial",
      height_cm: 178,
      hair_color: "Brown",
      bio_curated: "Sharp editorial jawline and refined energy",
      look_descriptor: "Angular bone structure, sharp jawline, editorial icon",
      image_analysis: JSON.stringify({
        boneStructure: "sharp angular jawline",
        castingNotes: "severe editorial profile",
        marketSignals: ["editorial", "luxury"],
      }),
      search_document:
        "angular bone structure sharp jawline severe editorial profile gender:female hair:brown",
    },
    {
      id: uuidv4(),
      first_name: "Marcus",
      last_name: "Runway",
      gender: "Male",
      archetype: "Runway",
      height_cm: 188,
      bio_curated: "Tall runway proportions for Milan shows",
      look_descriptor: "Commanding runway presence",
      search_document: "runway tall commanding gender:male",
    },
    {
      id: uuidv4(),
      first_name: "Sofia",
      last_name: "Commercial",
      gender: "Female",
      archetype: "Commercial",
      height_cm: 170,
      bio_curated: "Warm commercial lifestyle energy",
      look_descriptor: "Approachable girl-next-door smile",
      search_document: "warm commercial approachable gender:female",
    },
    {
      id: uuidv4(),
      first_name: "Isla",
      last_name: "Refined",
      gender: "Female",
      archetype: "Editorial",
      height_cm: 180,
      hair_color: "red",
      bio_curated: "Quiet refined face with luxury editorial energy",
      look_descriptor: "Severe profile, looks expensive, quiet editorial face",
      image_analysis: JSON.stringify({
        boneStructure: "severe refined bone structure",
        marketSignals: ["luxury", "refined", "expensive"],
      }),
      search_document:
        "severe profile quiet editorial face looks expensive refined luxury gender:female hair:red height:180cm",
    },
    {
      id: uuidv4(),
      first_name: "James",
      last_name: "Heritage",
      gender: "Male",
      archetype: "Commercial",
      height_cm: 185,
      ethnicity: JSON.stringify(["Black"]),
      bio_curated: "Strong commercial presence with editorial versatility",
      look_descriptor: "Confident presence, strong bone structure",
      search_document:
        "confident strong bone structure commercial gender:male heritage:black",
    },
  ];

  for (const p of profiles) {
    await knex("profiles").insert({
      ...p,
      user_id: uuidv4(),
      slug: `${p.first_name}-${p.last_name}`.toLowerCase(),
      is_discoverable: true,
      profile_status: "active",
      created_at: new Date(),
    });
    if ((await knex.schema.hasTable("profiles_fts")) && p.search_document) {
      await knex("profiles_fts").insert({
        profile_id: p.id,
        document: p.search_document,
      });
    }
  }

  PROFILE_IDS = Object.fromEntries(profiles.map((p) => [p.last_name, p.id]));

  return profiles;
}

async function seedHybridEmbeddings() {
  const cacheRows = [
    {
      profile_id: PROFILE_IDS.Editorial,
      source: "visual",
      embedding_json: JSON.stringify(mockVisualVector),
      source_text: "sharp jawline angular",
    },
    {
      profile_id: PROFILE_IDS.Editorial,
      source: "casting",
      embedding_json: JSON.stringify(mockCastingVector),
      source_text: "editorial sharp",
    },
    {
      profile_id: PROFILE_IDS.Editorial,
      source: "market",
      embedding_json: JSON.stringify(mockMarketVector),
      source_text: "editorial luxury",
    },
    {
      profile_id: PROFILE_IDS.Refined,
      source: "visual",
      embedding_json: JSON.stringify(
        Array.from({ length: 512 }, (_, i) => (i === 4 ? 1 : 0)),
      ),
      source_text: "quiet expensive face",
    },
    {
      profile_id: PROFILE_IDS.Refined,
      source: "casting",
      embedding_json: JSON.stringify(mockCastingVector),
      source_text: "refined editorial",
    },
    {
      profile_id: PROFILE_IDS.Refined,
      source: "market",
      embedding_json: JSON.stringify(mockMarketVector),
      source_text: "luxury refined expensive",
    },
    {
      profile_id: PROFILE_IDS.Refined,
      source: "discover_index",
      embedding_json: JSON.stringify(mockCastingVector),
      source_text: "refined luxury",
    },
    {
      profile_id: PROFILE_IDS.Heritage,
      source: "visual",
      embedding_json: JSON.stringify(mockVisualVector),
      source_text: "black man confident",
    },
    {
      profile_id: PROFILE_IDS.Heritage,
      source: "casting",
      embedding_json: JSON.stringify(mockFarVector),
      source_text: "commercial male",
    },
    {
      profile_id: PROFILE_IDS.Runway,
      source: "discover_index",
      embedding_json: JSON.stringify(mockFarVector),
      source_text: "runway tall",
    },
  ];

  await knex("talent_embedding_cache").del();
  await knex("talent_embedding_cache").insert(cacheRows);
}

beforeAll(async () => {
  if (!isPostgres && fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  await createSchema();
}, 30000);

afterAll(async () => {
  await knex.destroy();
});

describe("parseIntentToFilters", () => {
  test("parses gender and look facets into SQL filters", () => {
    const result = parseIntentToFilters("tall editorial female");
    expect(result.filters.gender).toBe("Female");
    expect(result.filters.archetype).toBe("Editorial");
    expect(result.filters.min_height).toBe(175);
  });

  test("parses heritage and gender from black man", () => {
    const result = parseIntentToFilters("black man");
    expect(result.filters.gender).toBe("Male");
    expect(result.filters.heritage).toBe("Black");
  });
});

describe("decomposeQueryFallback", () => {
  test("produces channel_queries for compositional query", () => {
    const result = decomposeQueryFallback("tall redhead severe profile");
    expect(result.channel_queries.visual).toBeTruthy();
    expect(result.channel_queries.lexical).toMatch(/red|redhead/i);
    expect(
      result.constraints.some((c) => c.field === "hair_color") ||
        result.attributes.length > 0,
    ).toBe(true);
  });
});

describe("reciprocalRankFusion", () => {
  test("fuses ranks from multiple legs", () => {
    const fused = reciprocalRankFusion([
      [
        { profileId: "a", score: 0.9, leg: "dense_visual" },
        { profileId: "b", score: 0.8, leg: "dense_visual" },
      ],
      [{ profileId: "b", score: 0.7, leg: "lexical" }],
    ]);
    expect(fused[0].profileId).toBe("b");
    expect(fused[0].rrfScore).toBeGreaterThan(0);
  });
});

describe("hybrid discover search (SQLite)", () => {
  beforeEach(async () => {
    await seedDiscoverProfiles();
    await seedHybridEmbeddings();
  });

  test("DISCOVER_HYBRID flag is enabled in tests", () => {
    expect(isDiscoverHybridEnabled()).toBe(true);
  });

  test("returns discoverable profiles alphabetically when q is empty", async () => {
    const prev = process.env.DISCOVER_HYBRID;
    process.env.DISCOVER_HYBRID = "false";

    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "",
      limit: "20",
    });

    process.env.DISCOVER_HYBRID = prev;

    expect(result.profiles.length).toBe(5);
    expect(result.meta.semantic_search).toBe(false);
  });

  test("sharp jawline editorial retrieves angular-profile talent via hybrid path", async () => {
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "sharp jawline editorial",
      limit: "10",
    });

    expect(result.meta.semantic_search).toBe(true);
    expect(result.meta.hybrid).toBe(true);
    expect(result.meta.query_understanding).toBeDefined();
    expect(result.meta.fusion).toBe("rrf");
    expect(result.profiles.length).toBeGreaterThan(0);
    expect(result.profiles[0].last_name).toBe("Editorial");
    expect(result.profiles[0].match_score).toBeGreaterThan(0);
    expect(result.profiles[0].match_breakdown).toBeDefined();
  });

  test("looks expensive quiet editorial face ranks refined luxury profiles", async () => {
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "looks expensive quiet editorial face",
      limit: "10",
    });

    expect(result.meta.hybrid).toBe(true);
    expect(result.profiles.length).toBeGreaterThan(0);
    const names = result.profiles.map((p) => p.last_name);
    expect(names).toContain("Refined");
    expect(names.indexOf("Refined")).toBeLessThan(2);
  });

  test("tall redhead severe profile applies soft constraints without SQL gender gate", async () => {
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "tall redhead severe profile",
      limit: "10",
    });

    expect(result.meta.hybrid).toBe(true);
    expect(result.profiles.length).toBeGreaterThan(0);
    const refined = result.profiles.find((p) => p.last_name === "Refined");
    expect(refined).toBeDefined();
    expect(refined.hair_color).toBe("red");
  });

  test("black man uses soft constraints — does not zero out semantic matches", async () => {
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "black man",
      limit: "10",
    });

    expect(result.meta.hybrid).toBe(true);
    expect(result.meta.query_understanding.constraints.length).toBeGreaterThan(
      0,
    );
    expect(result.profiles.length).toBeGreaterThan(0);
    const heritage = result.profiles.find((p) => p.last_name === "Heritage");
    expect(heritage).toBeDefined();
    expect(heritage.gender).toBe("Male");
  });
});

describe("agency-discovery DTO contract (SQLite)", () => {
  beforeEach(async () => {
    await seedDiscoverProfiles();
    await seedHybridEmbeddings();
  });

  test("browse results never expose a forbidden key or owner email", async () => {
    const prev = process.env.DISCOVER_HYBRID;
    process.env.DISCOVER_HYBRID = "false";

    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "",
      limit: "50",
    });

    process.env.DISCOVER_HYBRID = prev;

    expect(result.profiles.length).toBeGreaterThan(0);
    const keys = collectKeys(result.profiles);
    const leaked = [...keys].filter((k) => FORBIDDEN_KEYS.has(k));
    expect(leaked).toEqual([]);
    // Explicit spot-checks for the P0-3 leak surface.
    expect(keys.has("owner_email")).toBe(false);
    expect(keys.has("user_email")).toBe(false);
    expect(keys.has("search_document")).toBe(false);
    expect(keys.has("date_of_birth")).toBe(false);
  });

  test("hybrid results are shaped DTOs with only coarse age bands", async () => {
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "sharp jawline editorial",
      limit: "10",
    });

    expect(result.profiles.length).toBeGreaterThan(0);
    const keys = collectKeys(result.profiles);
    expect([...keys].filter((k) => FORBIDDEN_KEYS.has(k))).toEqual([]);
    for (const profile of result.profiles) {
      expect(profile.age).toBeUndefined();
      expect("age_band" in profile).toBe(true);
    }
  });
});

describe("DOB-derived age filter (SQLite, audit P0-7)", () => {
  async function seedAgeBoundaryProfiles() {
    await knex("applications").del();
    await knex("images").del();
    if (await knex.schema.hasTable("profiles_fts")) {
      await knex("profiles_fts").del();
    }
    await knex("profiles").del();
    await knex("users").del();

    await knex("users").insert({
      id: AGENCY_ID,
      email: "age-agency@test.pholio",
      role: "AGENCY",
    });

    // Named by exact birthday relative to today.
    const rows = [
      { last_name: "Turns18Today", dob: dobForBoundary(18, 0) }, // age 18
      { last_name: "Turns18Tomorrow", dob: dobForBoundary(18, 1) }, // age 17
      { last_name: "Turned31Today", dob: dobForBoundary(31, 0) }, // age 31
      { last_name: "Turns31Tomorrow", dob: dobForBoundary(31, 1) }, // age 30
    ];

    for (const r of rows) {
      await knex("profiles").insert({
        id: uuidv4(),
        user_id: uuidv4(),
        first_name: "Age",
        last_name: r.last_name,
        slug: r.last_name.toLowerCase(),
        date_of_birth: r.dob,
        bio_curated: "Boundary birthday fixture",
        is_discoverable: true,
        profile_status: "active",
        created_at: new Date(),
      });
    }
  }

  beforeEach(async () => {
    await seedAgeBoundaryProfiles();
  });

  test("min_age is inclusive on the birthday (>= min_age)", async () => {
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "",
      min_age: "18",
      limit: "50",
    });
    const names = result.profiles.map((p) => p.last_name);
    // Turns 18 today (exactly 18) is included; turns 18 tomorrow (17) is not.
    expect(names).toContain("Turns18Today");
    expect(names).not.toContain("Turns18Tomorrow");
  });

  test("max_age excludes the day the talent ages out", async () => {
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "",
      max_age: "30",
      limit: "50",
    });
    const names = result.profiles.map((p) => p.last_name);
    // Turns 31 tomorrow (still 30) is included; turned 31 today (31) is not.
    expect(names).toContain("Turns31Tomorrow");
    expect(names).not.toContain("Turned31Today");
  });

  test("null date_of_birth is excluded by any age filter (fail closed)", async () => {
    await knex("profiles").insert({
      id: uuidv4(),
      user_id: uuidv4(),
      first_name: "Age",
      last_name: "NoDob",
      slug: "nodob",
      date_of_birth: null,
      bio_curated: "No DOB on file",
      is_discoverable: true,
      profile_status: "active",
      created_at: new Date(),
    });

    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "",
      min_age: "18",
      limit: "50",
    });
    const names = result.profiles.map((p) => p.last_name);
    expect(names).not.toContain("NoDob");
  });
});

describe("legacy semantic search (SQLite)", () => {
  beforeEach(async () => {
    process.env.DISCOVER_HYBRID = "false";
    await seedDiscoverProfiles();

    await knex("talent_embedding_cache").del();
    await knex("talent_embedding_cache").insert({
      profile_id: PROFILE_IDS.Editorial,
      source: "discover_index",
      embedding_json: JSON.stringify(mockUnitVector),
      source_text: "sharp jawline angular",
    });
  });

  afterEach(() => {
    process.env.DISCOVER_HYBRID = "true";
  });

  test("runs legacy semantic search on SQLite via embedding cache", async () => {
    if (isPostgres) return;

    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "sharp jawline features",
      limit: "10",
    });

    expect(result.meta.semantic_search).toBe(true);
    expect(result.meta.hybrid).toBeFalsy();
    expect(canUseSemanticSearch(knex, "sharp")).toBe(true);
    expect(result.pagination.total).toBeGreaterThan(0);
    expect(result.profiles.length).toBeGreaterThan(0);
    expect(result.profiles[0].last_name).toBe("Editorial");
  });
});

describe("mergeFilters", () => {
  test("explicit query params override intent-derived filters", () => {
    const merged = mergeFilters(
      { gender: "Male", city: "Paris" },
      { gender: "Female", archetype: "Editorial" },
    );
    expect(merged.gender).toBe("Male");
    expect(merged.city).toBe("Paris");
    expect(merged.archetype).toBe("Editorial");
  });
});

const describePostgres = isPostgres ? describe : describe.skip;

describePostgres("searchDiscoverableTalent semantic mode (Postgres)", () => {
  const { toVectorLiteral } = require("../../src/domains/ai/embeddings");

  beforeAll(async () => {
    if (!(await knex.schema.hasTable("talent_text_embeddings"))) {
      await knex.raw("CREATE EXTENSION IF NOT EXISTS vector");
      await knex.schema.createTable("talent_text_embeddings", (t) => {
        t.string("id", 36).primary();
        t.string("profile_id", 36).notNullable();
        t.string("source", 50).notNullable();
        t.text("source_text").nullable();
        t.specificType("embedding", "vector(512)").nullable();
        t.timestamp("embedded_at").nullable();
        t.unique(["profile_id", "source"]);
      });
    }
  });

  beforeEach(async () => {
    await seedDiscoverProfiles();
    await knex("talent_text_embeddings").del();

    const near = toVectorLiteral(mockUnitVector);
    await knex.raw(
      `INSERT INTO talent_text_embeddings (id, profile_id, source, source_text, embedding, embedded_at)
       VALUES (?, ?, 'discover_index', 'editorial sharp', ?::vector, NOW())`,
      [uuidv4(), PROFILE_IDS.Editorial, near],
    );
  });

  test("returns profiles ordered by vibe_distance ascending (legacy)", async () => {
    process.env.DISCOVER_HYBRID = "false";
    const result = await searchDiscoverableTalent(knex, {
      agencyId: AGENCY_ID,
      q: "editorial sharp",
      limit: "10",
    });
    process.env.DISCOVER_HYBRID = "true";

    expect(result.meta.semantic_search).toBe(true);
    expect(embed).toHaveBeenCalled();
    expect(result.profiles.length).toBeGreaterThan(0);
  });
});
