"use strict";

function isPostgres(knex) {
  const client = String(knex.client.config.client || "").toLowerCase();
  return client === "pg" || client === "postgresql";
}

function jsonColumn(knex, table, name) {
  return isPostgres(knex) ? table.jsonb(name) : table.text(name);
}

/**
 * The submissions a talent made on an agency's own site.
 *
 * `docs/talent-trust-loop-design-2026-08.md` §(a) M1. Pholio can deliver to a
 * handful of agencies and carries specs for fifty; the fifty are exactly where
 * the "30-agency list in a Notes app" lives today. This table is that list,
 * owned by the talent (ruling R9: hard delete allowed — there is no agency
 * counterparty on these rows).
 *
 * `agency_name` is denormalised on purpose. A tracked row must survive the
 * registry dropping a series, an agency renaming itself, and an agency that was
 * never in the registry at all — so the name the talent typed is the record,
 * and `series_id` is the optional link back to a spec, not the identity.
 *
 * No lapse column: ruling R1 makes lapse a display-time computation from
 * `submitted_on + review_window_days`, so there is no stored status to drift
 * out of date and no daily job to run. `review_window_days` is stored per row
 * rather than read from the constant at display time so that per-agency
 * response policies (deferred) slot in later without a migration.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("off_platform_submissions")) return;

  await knex.schema.createTable("off_platform_submissions", (table) => {
    table.uuid("id").primary();
    table
      .uuid("profile_id")
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");
    // Null for an agency Pholio carries no spec for — the common case.
    table
      .string("series_id", 180)
      .nullable()
      .references("series_id")
      .inTable("spec_registry_series")
      .onDelete("SET NULL");
    table.string("agency_name", 160).notNullable();
    // Spec-pack `scope.channel.type` vocabulary plus 'other'. See
    // src/shared/constants/submission-tracker.js — no other file spells these.
    table.string("channel", 32).notNullable().defaultTo("official_web_form");
    table.string("destination_url", 500).nullable();
    table.date("submitted_on").notNullable();
    // Ruling R2: {revisionId, fileCount, exportEventId} when the row was logged
    // straight off a conforming export; null for a hand-entered row. Not a
    // versioning system — just an honest note of what left the building.
    jsonColumn(knex, table, "sent_summary").nullable();
    table.string("note", 500).nullable();
    table.string("status", 24).notNullable().defaultTo("awaiting");
    table.string("outcome_note", 300).nullable();
    table.integer("review_window_days").notNullable().defaultTo(30);
    table.timestamp("status_changed_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    // The ledger read: one talent's history, newest first.
    table.index(["profile_id", "submitted_on"], "idx_off_platform_profile_date");
    // The filter tabs on the merged Applications view.
    table.index(["profile_id", "status"], "idx_off_platform_profile_status");
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("off_platform_submissions");
};
