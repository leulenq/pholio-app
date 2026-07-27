"use strict";

const fs = require("fs");
const path = require("path");

// This suite must never inherit a developer's configured database or SMTP
// settings. Set the isolated SQLite environment before loading application
// modules, then use a second direct knex handle only for migration coverage.
const TEST_DB_PATH = path.join(
  "/tmp",
  `pholio-ai-launch-${process.pid}-${Date.now()}.sqlite3`,
);
process.env.NODE_ENV = "test";
process.env.DB_CLIENT = "sqlite3";
process.env.DATABASE_URL = `sqlite://${TEST_DB_PATH}`;
process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";

const knexFactory = require("knex");
const migration = require("../../migrations/20260727090000_add_explicit_ai_processing_consents");
const {
  isProfileEmbeddingAllowed,
  upsertTextEmbedding,
  upsertImageEmbedding,
  buildProfileText,
  buildDiscoverIndexText,
  buildVisualIndexText,
  buildCastingIndexText,
  buildMarketIndexText,
  buildLexicalDocument,
} = require("../../src/domains/ai/embeddings");
const {
  imageAiProcessingAllowed,
} = require("../../src/domains/talent/routes/media").__testables;
const {
  isExplicitAdultAiEligible,
  removeImageMetadataDerivatives,
} = require("../../src/domains/talent/routes/settings").__testables;

const ADULT = {
  id: "adult-profile",
  date_of_birth: "1990-06-01",
  ai_processing_consent: true,
  embedding_processing_consent: true,
};
const IMAGE_ENV = { PHOLIO_ENABLE_IMAGE_ANALYSIS: "true" };
const EMBEDDING_ENV = { PHOLIO_ENABLE_PROFILE_EMBEDDINGS: "true" };

function noStorageKnex() {
  const db = () => {
    throw new Error("A denied embedding must not query or write storage.");
  };
  db.client = { config: { client: "sqlite3" } };
  db.schema = { hasTable: jest.fn().mockResolvedValue(false) };
  return db;
}

describe("talent AI launch containment", () => {
  test.each([
    ["missing profile", null, false, false],
    ["missing DOB", { ...ADULT, date_of_birth: null }, false, false],
    ["minor", { ...ADULT, date_of_birth: "2012-06-01" }, false, false],
    ["refused image consent", { ...ADULT, ai_processing_consent: false }, false, true],
    ["refused embedding consent", { ...ADULT, embedding_processing_consent: false }, true, false],
    ["null consents", { ...ADULT, ai_processing_consent: null, embedding_processing_consent: null }, false, false],
  ])("%s fails closed for the corresponding purpose", (_label, profile, imageExpected, embeddingExpected) => {
    expect(imageAiProcessingAllowed(profile, IMAGE_ENV)).toBe(imageExpected);
    expect(isProfileEmbeddingAllowed(profile, EMBEDDING_ENV)).toBe(embeddingExpected);
  });

  test("only an adult with explicit purpose-specific consent and a flag passes", () => {
    expect(imageAiProcessingAllowed(ADULT, IMAGE_ENV)).toBe(true);
    expect(isProfileEmbeddingAllowed(ADULT, EMBEDDING_ENV)).toBe(true);
    expect(imageAiProcessingAllowed(ADULT, {})).toBe(false);
    expect(isProfileEmbeddingAllowed(ADULT, {})).toBe(false);
    expect(isExplicitAdultAiEligible(ADULT)).toBe(true);
    expect(isExplicitAdultAiEligible({ ...ADULT, date_of_birth: "2012-06-01" })).toBe(false);
  });

  test("denied account makes zero embedding-provider calls", async () => {
    const embedFn = jest.fn().mockResolvedValue([0.1, 0.2]);
    const denied = { ...ADULT, embedding_processing_consent: false };
    const originalFlag = process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS;
    process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "true";

    try {
      const result = await upsertTextEmbedding(
        noStorageKnex(),
        denied.id,
        "full_profile",
        "Experience: established",
        { profile: denied, embedFn },
      );
      expect(result).toBe(false);
      expect(embedFn).not.toHaveBeenCalled();
    } finally {
      if (originalFlag === undefined) delete process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS;
      else process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = originalFlag;
    }
  });

  test("an embedding provider can run only after explicit adult consent and the flag", async () => {
    const embedFn = jest.fn().mockResolvedValue([0.1, 0.2]);
    const originalFlag = process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS;
    process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "true";

    try {
      const result = await upsertTextEmbedding(
        noStorageKnex(),
        ADULT.id,
        "full_profile",
        "Experience: established. Booking lanes: Editorial",
        { profile: ADULT, embedFn },
      );
      expect(result).toBe(true);
      expect(embedFn).toHaveBeenCalledTimes(1);
    } finally {
      if (originalFlag === undefined) delete process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS;
      else process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = originalFlag;
    }
  });

  test("legacy image-embedding callers are a no-op even with a consenting adult", async () => {
    const embedFn = jest.fn().mockResolvedValue([0.1, 0.2]);
    const result = await upsertImageEmbedding(
      noStorageKnex(),
      ADULT.id,
      "face structure and body impression",
      { profile: ADULT, embedFn },
    );
    expect(result).toBe(false);
    expect(embedFn).not.toHaveBeenCalled();
  });

  test("selection builders exclude demographics, appearance, image outputs, and proxies", () => {
    const profile = {
      ...ADULT,
      first_name: "Ada",
      last_name: "Lovelace",
      city: "Brooklyn",
      gender: "non-binary",
      ethnicity: ["heritage"],
      languages: ["French"],
      bio_raw: "A bio with personal identity and appearance details.",
      training: "Private training history",
      specialties: ["curve"],
      height_cm: 178,
      body_type: "athletic",
      hair_color: "black",
      eye_color: "brown",
      archetype: "Editorial Icon",
      fit_score_editorial: 99,
      look_descriptor: "striking face",
      image_analysis: { castingNotes: "image-derived market assessment" },
      experience_level: "experienced",
      modeling_categories: ["editorial", "curve", "fitness"],
    };

    const outputs = [
      buildProfileText(profile),
      buildDiscoverIndexText(profile, { scout: { face_structure: "angular" } }),
      buildVisualIndexText(profile),
      buildCastingIndexText(profile),
      buildMarketIndexText(profile),
      buildLexicalDocument(profile),
    ].join(" ").toLowerCase();

    expect(outputs).toContain("editorial");
    expect(outputs).not.toMatch(
      /ada|lovelace|brooklyn|gender|heritage|french|height|athletic|hair|eyes|archetype|fit score|striking|image-derived|curve|fitness/,
    );
    expect(buildVisualIndexText(profile)).toBe("");
  });

  test("image opt-out metadata cleanup removes only local derivatives", () => {
    const result = removeImageMetadataDerivatives(
      JSON.stringify({ width: 1200, ai: { classification: {} }, matte: { mask: "x" } }),
    );
    expect(result.changed).toBe(true);
    expect(JSON.parse(result.metadata)).toEqual({ width: 1200 });
  });
});

describe("explicit AI consent migration", () => {
  let db;

  beforeAll(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: TEST_DB_PATH },
      useNullAsDefault: true,
    });
    await db.schema.createTable("profiles", (table) => {
      table.string("id").primary();
    });
    await db("profiles").insert({ id: "legacy-profile" });
  });

  afterAll(async () => {
    await db?.destroy();
    for (const suffix of ["", "-journal", "-shm", "-wal"]) {
      fs.rmSync(`${TEST_DB_PATH}${suffix}`, { force: true });
    }
  });

  test("adds separate non-null false-default columns idempotently", async () => {
    await migration.up(db);
    await migration.up(db);
    expect(await db.schema.hasColumn("profiles", "ai_processing_consent")).toBe(true);
    expect(await db.schema.hasColumn("profiles", "embedding_processing_consent")).toBe(true);

    await db("profiles").insert({ id: "new-profile" });
    const legacy = await db("profiles").where({ id: "legacy-profile" }).first();
    const row = await db("profiles").where({ id: "new-profile" }).first();
    expect(Boolean(legacy.ai_processing_consent)).toBe(false);
    expect(Boolean(legacy.embedding_processing_consent)).toBe(false);
    expect(Boolean(row.ai_processing_consent)).toBe(false);
    expect(Boolean(row.embedding_processing_consent)).toBe(false);
  });
});
