/**
 * Separate, affirmative processing purposes for the talent launch.
 *
 * These fields are intentionally on profiles rather than a generic settings
 * blob: every asynchronous image/index job reads the same canonical consent as
 * the request path. Defaults are false so legacy, missing, and new accounts
 * fail closed. The guarded additions make this safe for SQLite and PostgreSQL
 * environments that may have partial historical schema state.
 */
exports.up = async function up(knex) {
  const columns = [
    "ai_processing_consent",
    "embedding_processing_consent",
  ];

  for (const column of columns) {
    if (await knex.schema.hasColumn("profiles", column)) continue;
    await knex.schema.alterTable("profiles", (table) => {
      table.boolean(column).notNullable().defaultTo(false);
    });
  }
};

// This migration establishes a safety baseline. It intentionally has no down
// migration: rolling it back could make previously explicit preferences
// unrepresentable and re-enable an unsafe implied-consent path.
exports.down = async function down() {};
