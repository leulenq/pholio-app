"use strict";

const crypto = require("crypto");

/**
 * Wave 2B — Expand + Backfill (confirmed-job safety).
 *
 * Emergency contacts + professional references belong to the confirmed-job /
 * call-sheet context only (design section B/C: visible to confirmed_job, never in
 * discovery). This table scopes them to a booking/application.
 *
 * `application_id` is nullable: backfilled rows are profile-level snapshots
 * (application_id NULL) capturing the talent's current default safety contacts,
 * COPIED from the existing `profiles.emergency_contact_*` / `profiles.reference_*`
 * columns. Those source columns are NOT dropped this pass (contract is later).
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable("confirmed_job_safety");
  if (!hasTable) {
    await knex.schema.createTable("confirmed_job_safety", (table) => {
      table.uuid("id").primary();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table
        .uuid("application_id")
        .nullable()
        .references("id")
        .inTable("applications")
        .onDelete("SET NULL");
      table.string("emergency_contact_name", 100).nullable();
      table.string("emergency_contact_phone", 40).nullable();
      table.string("emergency_contact_relationship", 60).nullable();
      table.string("reference_name", 100).nullable();
      table.string("reference_email", 160).nullable();
      table.string("reference_phone", 40).nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      table.index(["profile_id"]);
      table.index(["application_id"]);
    });
  }

  // Backfill profile-level snapshots from existing profile columns.
  const profiles = await knex("profiles")
    .where((qb) => {
      qb.whereNotNull("emergency_contact_name")
        .orWhereNotNull("emergency_contact_phone")
        .orWhereNotNull("emergency_contact_relationship")
        .orWhereNotNull("reference_name")
        .orWhereNotNull("reference_email")
        .orWhereNotNull("reference_phone");
    })
    .select(
      "id",
      "emergency_contact_name",
      "emergency_contact_phone",
      "emergency_contact_relationship",
      "reference_name",
      "reference_email",
      "reference_phone",
    );

  const rows = [];
  for (const p of profiles) {
    const existing = await knex("confirmed_job_safety")
      .where({ profile_id: p.id, application_id: null })
      .first();
    if (existing) continue;
    rows.push({
      id: crypto.randomUUID(),
      profile_id: p.id,
      application_id: null,
      emergency_contact_name: p.emergency_contact_name || null,
      emergency_contact_phone: p.emergency_contact_phone || null,
      emergency_contact_relationship: p.emergency_contact_relationship || null,
      reference_name: p.reference_name || null,
      reference_email: p.reference_email || null,
      reference_phone: p.reference_phone || null,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
  if (rows.length > 0) {
    await knex.batchInsert("confirmed_job_safety", rows, 200);
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable("confirmed_job_safety")) {
    await knex.schema.dropTable("confirmed_job_safety");
  }
};
