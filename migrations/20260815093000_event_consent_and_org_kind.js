"use strict";

/**
 * Two small additions that share one theme: telling representation apart from
 * event casting at the org level and in the consent audit trail.
 *
 * A1 — `agencies.org_kind`
 *
 * `agencies.agency_type` already exists and is self-declared display copy;
 * making it authorization-bearing would be a security hole with a text box in
 * front of it. `org_kind` is a closed vocabulary the platform sets during
 * vetting. It governs exactly two things: whether the org appears in the
 * talent-facing representation directory (`GET /api/talent/agencies` returns
 * every ACTIVE agency today — an event organizer must not show up there as a
 * place to seek representation) and which label vocabulary the UI uses.
 * Default `'agency'` means zero backfill.
 *
 * A4 — consent event deltas
 *
 * Consent purpose belongs to the call, not the org: an agency may run an event
 * cast, and the disclosure it must show for one is not the disclosure for the
 * other. `compensation_disclosure` freezes the {type, details} the applicant
 * actually read, because the organizer can edit the live call afterwards and
 * the audit trail has to record what was on screen, not what is on screen now.
 */

/**
 * Transactions are off for the same reason as `20260815091000`: knex's SQLite
 * column drop rebuilds the table, and its `PRAGMA foreign_keys = OFF` guard is
 * a no-op inside a transaction. Dropping `agencies.org_kind` under a live
 * pragma would take every application, membership and roster row with it.
 */
exports.config = { transaction: false };

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const isPg =
    knex.client.config.client === "pg" || knex.client.config.client === "postgresql";

  if (!(await knex.schema.hasColumn("agencies", "org_kind"))) {
    await knex.schema.alterTable("agencies", (table) => {
      table.string("org_kind", 24).notNullable().defaultTo("agency");
    });
  }

  const table = "application_submission_consent_events";

  if (!(await knex.schema.hasColumn(table, "purpose"))) {
    await knex.schema.alterTable(table, (t) => {
      t.string("purpose", 24).notNullable().defaultTo("representation");
    });
  }

  if (!(await knex.schema.hasColumn(table, "open_call_link_id"))) {
    await knex.schema.alterTable(table, (t) => {
      t.uuid("open_call_link_id")
        .nullable()
        .references("id")
        .inTable("agency_open_call_links")
        .onDelete("SET NULL");
    });
  }

  if (!(await knex.schema.hasColumn(table, "compensation_disclosure"))) {
    await knex.schema.alterTable(table, (t) => {
      if (isPg) t.jsonb("compensation_disclosure").nullable();
      else t.text("compensation_disclosure").nullable();
    });
  }

  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_submission_consent_purpose_created ON ${table} (purpose, created_at)`,
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  const table = "application_submission_consent_events";

  await knex.raw("DROP INDEX IF EXISTS idx_submission_consent_purpose_created");

  const present = [];
  for (const name of ["purpose", "open_call_link_id", "compensation_disclosure"]) {
    if (await knex.schema.hasColumn(table, name)) present.push(name);
  }
  if (present.length) {
    await knex.schema.alterTable(table, (t) => {
      t.dropColumns(...present);
    });
  }

  if (await knex.schema.hasColumn("agencies", "org_kind")) {
    await knex.schema.alterTable("agencies", (t) => {
      t.dropColumn("org_kind");
    });
  }
};
