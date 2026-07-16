"use strict";

/**
 * Drop the `commissions` table.
 *
 * Pholio does not charge agencies and has no money/booking workflow. Nothing in
 * the application ever wrote to `commissions` (only seeds/demo scripts did), yet
 * the table was read into user-facing figures — fabricated data. It is removed
 * here along with all reads of it.
 *
 * Dual-dialect (PostgreSQL + SQLite). Idempotent.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.dropTableIfExists("commissions");
};

// Intentionally irreversible. Rolling back must not recreate a money-shaped
// table that the product has explicitly removed.
exports.down = async function down() {};
