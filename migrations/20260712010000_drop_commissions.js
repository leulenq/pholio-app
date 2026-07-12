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

/**
 * Recreate the table with its original columns (see
 * migrations/20250101000000_create_tables.js) so the migration is reversible.
 *
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  const exists = await knex.schema.hasTable("commissions");
  if (exists) return;

  await knex.schema.createTable("commissions", (table) => {
    table.uuid("id").primary();
    table
      .uuid("agency_id")
      .notNullable()
      .references("id")
      .inTable("agencies")
      .onDelete("CASCADE");
    table
      .uuid("profile_id")
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");
    table.decimal("percent").notNullable();
    table.integer("amount_cents").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
};
