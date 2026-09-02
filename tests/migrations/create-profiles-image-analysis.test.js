"use strict";

/**
 * Contract test for
 * migrations/20260902090000_create_profiles_image_analysis.js.
 *
 * The bug this closes was invisible because it was swallowed. `masterVision
 * Analysis` writes `image_analysis`, `image_analyzed_at` and
 * `image_analysis_model`; no migration created them; the UPDATE threw; the
 * caller caught and logged; and the comp card composition read `undefined`
 * forever. `migrations/add_image_analysis.sql` looked like the missing piece
 * but Knex never runs a .sql file, so it was never applied anywhere.
 *
 * So the assertions are about the two ends of that path: the columns exist
 * after a full migrate, and a row written the way the vision pipeline writes
 * it reaches the comp card composition that reads it.
 */

const crypto = require("crypto");

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("create-profiles-image-analysis");
const knex = require("../../src/shared/db/knex");

const MIGRATION_NAME = "20260902090000_create_profiles_image_analysis.js";
const migration = require(`../../migrations/${MIGRATION_NAME}`);
const { composeCompCard } = require("../../src/domains/pdf/composition");

const COLUMNS = [
  "image_analysis",
  "image_analyzed_at",
  "image_analysis_model",
];

const userId = crypto.randomUUID();
const profileId = crypto.randomUUID();

async function profileColumns() {
  const info = await knex.raw(`PRAGMA table_info('profiles')`);
  return info.map((column) => column.name);
}

beforeAll(async () => {
  await migrate(knex);
  await knex("users").insert({
    id: userId,
    email: `image-analysis-${userId}@example.test`,
    password_hash: "test-only",
    role: "TALENT",
  });
  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug: `image-analysis-${profileId}`,
    first_name: "Vision",
    last_name: "Column",
    city: "New York",
    gender: "Female",
    height_cm: 178,
    bust_cm: 86,
    waist_cm: 61,
    hips_cm: 90,
    bio_raw: "",
    bio_curated: "",
  });
}, 60000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(TEST_DB_FILE);
});

describe("profiles carries the vision analysis columns", () => {
  test.each(COLUMNS)("profiles has %s after migrating to latest", async (column) => {
    expect(await profileColumns()).toContain(column);
  });

  test("the write masterVisionAnalysis performs now succeeds", async () => {
    // Exactly the shape src/domains/ai/analyzeProfileImage.js writes: the
    // sanitized castingAnalysis as JSON text, a timestamp, and the model id.
    await expect(
      knex("profiles")
        .where({ id: profileId })
        .update({
          image_analysis: JSON.stringify({
            boneStructure: "Angular",
            lookType: "Athletic",
            marketSignals: ["fitness"],
          }),
          image_analyzed_at: knex.fn.now(),
          image_analysis_model: "test-vision-model",
        }),
    ).resolves.toBe(1);

    const row = await knex("profiles").where({ id: profileId }).first();
    expect(JSON.parse(row.image_analysis).lookType).toBe("Athletic");
    expect(row.image_analysis_model).toBe("test-vision-model");
    expect(row.image_analyzed_at).toBeTruthy();
  });

  test("what is written reaches the comp card that reads it", async () => {
    // The whole reason to create the column rather than delete the write.
    // `pdf/generator.js` loads the profiles row with SELECT *, and
    // composeCompCard parses `image_analysis` into castingAnalysis — the
    // fitness signal below is only reachable through that column.
    const profile = await knex("profiles").where({ id: profileId }).first();
    const { statsBlock } = await composeCompCard({
      profile,
      images: [],
      options: { seed: "image-analysis-migration" },
    });
    expect(statsBlock.isFitness).toBe(true);
  });

  test("the description carries no identity or skin-tone field", async () => {
    // "Classify the photo, never the face." The write path strips
    // SENSITIVE_VISION_KEYS before serialising; this pins that the column is
    // not quietly used to reintroduce them.
    const {
      SENSITIVE_VISION_KEYS,
      stripSensitiveVisionFields,
    } = require("../../src/domains/ai/analyzeProfileImage");
    const stripped = stripSensitiveVisionFields({
      lookType: "Athletic",
      skinTone: "III",
      measurementEstimates: { waist: 61 },
    });
    for (const key of SENSITIVE_VISION_KEYS) {
      expect(stripped).not.toHaveProperty(key);
    }
    expect(stripped.lookType).toBe("Athletic");
  });
});

describe("the migration is re-runnable and reversible", () => {
  test("up() is idempotent", async () => {
    const before = await profileColumns();
    await expect(migration.up(knex)).resolves.toBeUndefined();
    expect(await profileColumns()).toEqual(before);
  });

  test("down() removes exactly the three columns", async () => {
    const before = await profileColumns();
    await migration.down(knex);
    const after = await profileColumns();
    expect(after).toEqual(before.filter((column) => !COLUMNS.includes(column)));
    // Restore, so the file this suite leaves behind matches `migrate latest`.
    await migration.up(knex);
    expect(await profileColumns()).toEqual(before);
  });

  test("declares transaction: false", () => {
    // SQLite has no DROP COLUMN, so down() rebuilds `profiles`; knex's
    // `PRAGMA foreign_keys = OFF` guard is ignored inside a transaction and
    // the rebuild would cascade through applications.profile_id.
    expect(migration.config).toEqual({ transaction: false });
  });
});
