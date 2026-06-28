/**
 * Add workflow position and optimistic-concurrency metadata to application
 * drafts. This is intentionally separate from the table-creation migration:
 * existing environments may already have applied that migration.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable("application_drafts"))) return;

  const columns = [
    ["schema_version", (table) => table.integer("schema_version").notNullable().defaultTo(1)],
    ["current_step_id", (table) => table.string("current_step_id", 32).notNullable().defaultTo("board")],
    ["version", (table) => table.integer("version").notNullable().defaultTo(1)],
    ["last_saved_by_client_id", (table) => table.string("last_saved_by_client_id", 128).nullable()],
    ["client_updated_at", (table) => table.timestamp("client_updated_at").nullable()],
  ];

  for (const [name, addColumn] of columns) {
    if (!(await knex.schema.hasColumn("application_drafts", name))) {
      await knex.schema.alterTable("application_drafts", addColumn);
    }
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable("application_drafts"))) return;

  for (const name of [
    "client_updated_at",
    "last_saved_by_client_id",
    "version",
    "current_step_id",
    "schema_version",
  ]) {
    if (await knex.schema.hasColumn("application_drafts", name)) {
      await knex.schema.alterTable("application_drafts", (table) => {
        table.dropColumn(name);
      });
    }
  }
};
