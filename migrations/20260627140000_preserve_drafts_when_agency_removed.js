"use strict";

/**
 * Draft lifecycle data belongs to the talent and must survive removal of an
 * agency organization. Keep agency_id as the historical identifier, but remove
 * the destructive agency foreign keys from drafts, events, and idempotency
 * records. Profile foreign keys intentionally retain ON DELETE CASCADE.
 *
 * This is separate from the lifecycle migration because that migration may
 * already be applied in production.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  for (const tableName of [
    "application_drafts",
    "application_draft_events",
    "application_submission_requests",
  ]) {
    if (
      (await knex.schema.hasTable(tableName)) &&
      (await knex.schema.hasColumn(tableName, "agency_id"))
    ) {
      await knex.schema.alterTable(tableName, (table) => {
        table.dropForeign("agency_id");
      });
    }
  }
};

/**
 * Reinstating the original constraints is safe only when no orphan rows exist.
 * Knex/database constraint validation deliberately fails rollback otherwise,
 * rather than silently erasing retained talent data.
 *
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  for (const tableName of [
    "application_drafts",
    "application_draft_events",
    "application_submission_requests",
  ]) {
    if (
      (await knex.schema.hasTable(tableName)) &&
      (await knex.schema.hasColumn(tableName, "agency_id"))
    ) {
      await knex.schema.alterTable(tableName, (table) => {
        table
          .foreign("agency_id")
          .references("id")
          .inTable("agencies")
          .onDelete("CASCADE");
      });
    }
  }
};
