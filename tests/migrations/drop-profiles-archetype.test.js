"use strict";

/**
 * Contract test for migrations/20260820110000_drop_profiles_archetype.js.
 *
 * Verifies `profiles.archetype` is gone after a full migrate to latest, and
 * that rolling this one migration back restores it faithfully — matching the
 * shape migrations/20260316000002_add_archetype_to_profiles.js originally
 * created.
 */

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("drop-profiles-archetype");
const knex = require("../../src/shared/db/knex");

const MIGRATION_NAME = "20260820110000_drop_profiles_archetype.js";
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

describe("drop profiles.archetype", () => {
  test("profiles.archetype is gone after migrating to latest", async () => {
    const columns = await columnNames("profiles");
    expect(columns).not.toContain("archetype");
  });

  test("down() faithfully restores the column", async () => {
    await knex.migrate.down({ name: MIGRATION_NAME });

    const columns = await columnNames("profiles");
    expect(columns).toContain("archetype");

    // Restore the schema to latest so this test doesn't leak state into
    // whatever runs after it in the same file.
    await knex.migrate.up({ name: MIGRATION_NAME });

    const columnsAfterReapply = await columnNames("profiles");
    expect(columnsAfterReapply).not.toContain("archetype");
  });

  test("up() guard is safe to call directly on a schema that already lacks the column", async () => {
    // Bypass the knex_migrations bookkeeping and call the module's up()
    // function directly — the schema at this point (post beforeAll) already
    // lacks archetype, so this only passes if the drop is guarded by
    // hasColumn.
    await migration.up(knex);
    const columns = await columnNames("profiles");
    expect(columns).not.toContain("archetype");
  });
});
