"use strict";

/**
 * Contract test for migrations/20260820120000_drop_ai_look_descriptor.js.
 *
 * Verifies profiles.look_descriptor, profiles.look_descriptor_generated_at,
 * and profiles.vibe_score are gone after migrating to latest, that rolling
 * this one migration back restores whichever of them it actually dropped,
 * and that up()/down() are safe to call directly on a schema that already
 * lacks some or all of the three columns — production reality is that
 * look_descriptor and look_descriptor_generated_at were never created on
 * profiles at all (see the migration's header comment), so this suite
 * exercises both the "column exists" and "column already absent" paths.
 */

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("drop-ai-look-descriptor");
const knex = require("../../src/shared/db/knex");

const MIGRATION_NAME = "20260820120000_drop_ai_look_descriptor.js";
const migration = require(`../../migrations/${MIGRATION_NAME}`);

async function columnNames(table) {
  const info = await knex.raw(`PRAGMA table_info('${table}')`);
  return info.map((column) => column.name);
}

beforeAll(async () => {
  await migrate(knex);
}, 60000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(TEST_DB_FILE);
});

describe("drop AI look descriptor", () => {
  test("look_descriptor, look_descriptor_generated_at, and vibe_score are gone after migrating to latest", async () => {
    const columns = await columnNames("profiles");
    expect(columns).not.toContain("look_descriptor");
    expect(columns).not.toContain("look_descriptor_generated_at");
    expect(columns).not.toContain("vibe_score");
  });

  /*
   * This used to assert fit_score_* survived, on the reasoning that a talent
   * declaring their own lanes is not a machine inferring them. That reasoning
   * was sound and the premise was wrong: nothing in the client ever called
   * POST /api/talent/profile/fit-scores, the Casting Reveal it served is gone,
   * and the columns had already been removed from production. They are dropped
   * by 20260824090000_reconcile_profiles_ai_drift.js.
   *
   * What still matters here is SCOPE — that this migration never owned them.
   */
  test("this migration does not own fit_score_* — its down() does not restore them", async () => {
    await knex.migrate.down({ name: MIGRATION_NAME });
    const restored = await columnNames("profiles");
    expect(restored).toContain("look_descriptor");
    expect(restored).not.toContain("fit_score_overall");
    expect(restored).not.toContain("fit_score_runway");

    await knex.migrate.up({ name: MIGRATION_NAME });
  });

  test("down() restores all three columns when up() dropped all three", async () => {
    await knex.migrate.down({ name: MIGRATION_NAME });

    const columns = await columnNames("profiles");
    expect(columns).toEqual(
      expect.arrayContaining([
        "look_descriptor",
        "look_descriptor_generated_at",
        "vibe_score",
      ]),
    );

    // Restore to latest so this test doesn't leak state into whatever runs
    // after it in the same file.
    await knex.migrate.up({ name: MIGRATION_NAME });

    const columnsAfterReapply = await columnNames("profiles");
    expect(columnsAfterReapply).not.toContain("look_descriptor");
    expect(columnsAfterReapply).not.toContain("look_descriptor_generated_at");
    expect(columnsAfterReapply).not.toContain("vibe_score");
  });

  test("up() is safe to call directly on a schema that already lacks all three columns", async () => {
    // Bypass knex_migrations bookkeeping and call the module's up() function
    // directly — the schema at this point (post beforeAll) already lacks
    // all three columns, so this only passes if every drop is guarded by
    // hasColumn.
    await migration.up(knex);
    const columns = await columnNames("profiles");
    expect(columns).not.toContain("look_descriptor");
    expect(columns).not.toContain("look_descriptor_generated_at");
    expect(columns).not.toContain("vibe_score");
  });

  test("down() is a no-op restore when the columns already exist", async () => {
    await knex.migrate.down({ name: MIGRATION_NAME });
    // Columns now restored. Calling down()'s underlying module function
    // again must not throw or duplicate columns — it only adds what is
    // still missing.
    await migration.down(knex);
    const columns = await columnNames("profiles");
    expect(columns).toEqual(
      expect.arrayContaining([
        "look_descriptor",
        "look_descriptor_generated_at",
        "vibe_score",
      ]),
    );

    await knex.migrate.up({ name: MIGRATION_NAME });
  });
});
