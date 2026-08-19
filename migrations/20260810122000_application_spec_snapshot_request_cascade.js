"use strict";

const TABLE = "application_spec_snapshots";
const COLUMN = "submission_request_id";
const CONSTRAINT = "fk_app_spec_snapshot_request";

/**
 * Replace the original RESTRICT edge with CASCADE. A talent-account deletion
 * removes profiles, applications, and submission requests through separate FK
 * paths. The snapshot belongs to the request attempt, so it must disappear
 * with that request instead of blocking the account deletion.
 *
 * Knex rebuilds the table for SQLite and emits ALTER TABLE statements for
 * PostgreSQL. Keeping the drop and add in separate schema operations works in
 * both dialects and lets the migration runner's transaction protect the swap.
 *
 * @param {import("knex").Knex} knex
 * @param {"CASCADE" | "RESTRICT"} action
 */
async function replaceSubmissionRequestForeignKey(knex, action) {
  if (!(await knex.schema.hasTable(TABLE))) {
    throw new Error(`${TABLE} is missing; apply the Spec Registry persistence migration first`);
  }
  if (!(await knex.schema.hasColumn(TABLE, COLUMN))) {
    throw new Error(`${TABLE}.${COLUMN} is missing; cannot replace its foreign key`);
  }

  await knex.schema.alterTable(TABLE, (table) => {
    if (action === "CASCADE") {
      // The original migration used Knex's dialect-default constraint name.
      table.dropForeign(COLUMN);
    } else {
      table.dropForeign(COLUMN, CONSTRAINT);
    }
  });
  await knex.schema.alterTable(TABLE, (table) => {
    const foreignKey = action === "CASCADE"
      ? table.foreign(COLUMN, CONSTRAINT)
      : table.foreign(COLUMN);
    foreignKey
      .references("id")
      .inTable("application_submission_requests")
      .onDelete(action);
  });
}

exports.up = async function up(knex) {
  await replaceSubmissionRequestForeignKey(knex, "CASCADE");
};

exports.down = async function down(knex) {
  await replaceSubmissionRequestForeignKey(knex, "RESTRICT");
};

exports.CONSTRAINT = CONSTRAINT;
exports.replaceSubmissionRequestForeignKey = replaceSubmissionRequestForeignKey;
