"use strict";

/**
 * Discover search — in-person measurement provenance (WS3.7).
 *
 * `profiles.measured_in_person_at` + `measured_by_agency_id` — the ONLY state
 * allowed to render "measured in person / confirmed" in agency-facing UI.
 * Set by an agency action (roster/detail surface), never by AI estimates or
 * talent self-report. Both nullable; NULL = self-reported stats only.
 *
 * `measured_by_agency_id` references users (the AGENCY-role user who
 * confirmed), ON DELETE SET NULL so the timestamp survives account deletion.
 *
 * Dual-dialect (PG + SQLite).
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasAt = await knex.schema.hasColumn("profiles", "measured_in_person_at");
  const hasBy = await knex.schema.hasColumn("profiles", "measured_by_agency_id");

  await knex.schema.alterTable("profiles", (table) => {
    if (!hasAt) table.timestamp("measured_in_person_at").nullable();
    if (!hasBy) {
      table
        .uuid("measured_by_agency_id")
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
    }
  });
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  const hasAt = await knex.schema.hasColumn("profiles", "measured_in_person_at");
  const hasBy = await knex.schema.hasColumn("profiles", "measured_by_agency_id");

  await knex.schema.alterTable("profiles", (table) => {
    if (hasAt) table.dropColumn("measured_in_person_at");
    if (hasBy) table.dropColumn("measured_by_agency_id");
  });
};
