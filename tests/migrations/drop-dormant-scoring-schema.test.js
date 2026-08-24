"use strict";

/**
 * Contract test for migrations/20260820090000_drop_dormant_scoring_schema.js.
 *
 * Verifies the dormant NYC LL144-exposure scoring schema
 * (board_scoring_weights, applications.match_score,
 * applications.match_calculated_at) is gone after a full migrate to latest,
 * and that rolling this one migration back restores it faithfully — matching
 * the shape migrations/20260206000000_update_boards_system_complete.js
 * originally created.
 */

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("drop-dormant-scoring-schema");
const knex = require("../../src/shared/db/knex");

const MIGRATION_NAME = "20260820090000_drop_dormant_scoring_schema.js";
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

describe("drop dormant scoring schema", () => {
  test("board_scoring_weights and applications match_score columns are gone after migrating to latest", async () => {
    expect(await knex.schema.hasTable("board_scoring_weights")).toBe(false);

    const columns = await columnNames("applications");
    expect(columns).not.toContain("match_score");
    expect(columns).not.toContain("match_calculated_at");
  });

  test("down() faithfully restores the table and columns", async () => {
    await knex.migrate.down({ name: MIGRATION_NAME });

    expect(await knex.schema.hasTable("board_scoring_weights")).toBe(true);
    const weightColumns = await columnNames("board_scoring_weights");
    expect(weightColumns).toEqual(
      expect.arrayContaining([
        "id",
        "board_id",
        "age_weight",
        "height_weight",
        "measurements_weight",
        "body_type_weight",
        "comfort_weight",
        "experience_weight",
        "skills_weight",
        "location_weight",
        "social_reach_weight",
        "created_at",
        "updated_at",
      ]),
    );

    const applicationsColumns = await columnNames("applications");
    expect(applicationsColumns).toEqual(
      expect.arrayContaining(["match_score", "match_calculated_at"]),
    );

    // Restore the schema to latest so this test doesn't leak state into
    // whatever runs after it in the same file.
    await knex.migrate.up({ name: MIGRATION_NAME });

    expect(await knex.schema.hasTable("board_scoring_weights")).toBe(false);
    const columnsAfterReapply = await columnNames("applications");
    expect(columnsAfterReapply).not.toContain("match_score");
    expect(columnsAfterReapply).not.toContain("match_calculated_at");
  });

  test("up() guards are safe to call directly on a schema that already lacks the dropped objects", async () => {
    // Bypass the knex_migrations bookkeeping and call the module's up()
    // function directly — the schema at this point (post beforeAll) already
    // lacks board_scoring_weights and the match_* columns, so this only
    // passes if every drop is guarded by hasTable/hasColumn.
    await migration.up(knex);
    expect(await knex.schema.hasTable("board_scoring_weights")).toBe(false);
    const columns = await columnNames("applications");
    expect(columns).not.toContain("match_score");
    expect(columns).not.toContain("match_calculated_at");
  });
});
