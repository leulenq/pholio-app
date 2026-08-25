"use strict";

/**
 * Contract test for migrations/20260824090000_reconcile_profiles_ai_drift.js.
 *
 * The drift this closes was invisible for a long time because nothing compared
 * the schema this repo builds against the schema production runs. A database
 * built from `migrations/` had 142 columns on `profiles`; production had 111.
 * Every one of the 34 extra columns was legacy inference, telemetry, or a
 * duplicate of a column the live code writes on `onboarding_signals`.
 *
 * So the assertions here are deliberately about the SHAPE of `profiles` after a
 * full migrate — not about the migration's internals. That is the check that
 * was missing.
 */

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("reconcile-profiles-ai-drift");
const knex = require("../../src/shared/db/knex");

const MIGRATION_NAME = "20260824090000_reconcile_profiles_ai_drift.js";
const migration = require(`../../migrations/${MIGRATION_NAME}`);

/** Every column the migration removes, by the group it belongs to. */
const DRIFT_GROUPS = {
  "Casting Reveal fit scores": [
    "fit_score_runway",
    "fit_score_editorial",
    "fit_score_commercial",
    "fit_score_lifestyle",
    "fit_score_swim_fitness",
    "fit_score_overall",
    "fit_scores_calculated_at",
  ],
  "geo/OAuth duplicates of onboarding_signals": [
    "google_addresses",
    "google_birthday",
    "google_gender",
    "google_organization",
    "google_phone",
    "ip_address",
    "ip_city",
    "ip_country",
    "ip_region",
    "ip_timezone",
    "verified_location_intel",
  ],
  "predicted traits": [
    "predicted_bust",
    "predicted_eye_color",
    "predicted_hair_color",
    "predicted_height_cm",
    "predicted_hips",
    "predicted_skin_tone",
    "predicted_waist",
    "predicted_weight_lbs",
  ],
  "legacy AI analysis layer": [
    "visual_intel",
    "librarian_synthesis",
    "market_fit_rankings",
    "onboarding_predictions",
    "photo_embedding",
    "vector_summary",
    "vector_summary_text",
  ],
  superseded: ["age"],
};

const ALL_DRIFTED = Object.values(DRIFT_GROUPS).flat();

async function profileColumns() {
  const info = await knex.raw(`PRAGMA table_info('profiles')`);
  return info.map((column) => column.name);
}

beforeAll(async () => {
  await migrate(knex);
}, 60000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(TEST_DB_FILE);
});

describe("profiles no longer carries the drifted columns", () => {
  test.each(Object.entries(DRIFT_GROUPS))(
    "%s are gone after migrating to latest",
    async (_group, columns) => {
      const present = await profileColumns();
      for (const column of columns) expect(present).not.toContain(column);
    },
  );

  test("all 34 are accounted for", () => {
    expect(ALL_DRIFTED).toHaveLength(34);
    expect(new Set(ALL_DRIFTED).size).toBe(34);
  });
});

describe("what production keeps is kept", () => {
  // The neighbours most at risk of being caught by a careless drop: each is
  // live, and each looks superficially like something on the list above.
  test.each([
    // `age` goes; `age_range` stays — production has it.
    ["age_range"],
    // Consent columns re-created by 20260804090000, both live and enforced.
    ["ai_processing_consent"],
    ["embedding_processing_consent"],
    // Self-declared, not inferred.
    ["modeling_categories"],
    ["stats_track"],
    // The measurement columns the whole product reads.
    ["height_cm"],
    ["date_of_birth"],
  ])("profiles still has %s", async (column) => {
    expect(await profileColumns()).toContain(column);
  });
});

describe("rollback is deliberately one-way", () => {
  /*
   * The rehearsal against a branch of production caught why this must not
   * restore. `up()` is a no-op on production — the columns are already gone —
   * so a restoring `down()` would CREATE 34 columns production has never had,
   * rebuilding the inference surface the compliance work removed. A rollback
   * that adds a compliance surface is worse than no rollback.
   */
  test("down() restores nothing", async () => {
    const before = await profileColumns();
    await expect(migration.down(knex)).resolves.toBeUndefined();
    expect(await profileColumns()).toEqual(before);
    for (const column of ALL_DRIFTED) {
      expect(await profileColumns()).not.toContain(column);
    }
  });

  test("up() is idempotent, so rollback-then-migrate still round-trips", async () => {
    const before = await profileColumns();
    await expect(migration.up(knex)).resolves.toBeUndefined();
    expect(await profileColumns()).toEqual(before);
  });
});

describe("the migration cannot run inside a transaction", () => {
  // SQLite has no DROP COLUMN; knex rebuilds the table and its
  // `PRAGMA foreign_keys = OFF` guard is ignored inside a transaction, which
  // would cascade through applications.profile_id and empty it.
  test("declares transaction: false", () => {
    expect(migration.config).toEqual({ transaction: false });
  });
});
