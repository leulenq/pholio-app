"use strict";

/**
 * Booking Desk hardening.
 *
 * `talent_commitments` originally existed only as matching-engine context. This
 * makes every agency-authored calendar row attributable, releasable (rather
 * than destructively deleted), and addressable through a roster membership.
 * The roster link also allows an agency-private talent record to participate
 * in the booking calendar without inventing a public Pholio profile.
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable("talent_commitments"))) return;

  // The original column was required because only platform profiles existed.
  // A roster membership now supplies the subject boundary, so private roster
  // records intentionally have a null profile_id.
  await knex.schema.alterTable("talent_commitments", (table) => {
    table.uuid("profile_id").nullable().alter();
  });

  const additions = [
    ["roster_membership_id", (table) => table.uuid("roster_membership_id").nullable().references("id").inTable("roster_memberships").onDelete("CASCADE")],
    ["talent_record_id", (table) => table.uuid("talent_record_id").nullable().references("id").inTable("talent_records").onDelete("CASCADE")],
    ["status", (table) => table.string("status", 20).notNullable().defaultTo("active")],
    ["created_by_user_id", (table) => table.uuid("created_by_user_id").nullable().references("id").inTable("users").onDelete("SET NULL")],
    ["updated_by_user_id", (table) => table.uuid("updated_by_user_id").nullable().references("id").inTable("users").onDelete("SET NULL")],
    ["confirmed_at", (table) => table.timestamp("confirmed_at").nullable()],
    ["confirmed_by_user_id", (table) => table.uuid("confirmed_by_user_id").nullable().references("id").inTable("users").onDelete("SET NULL")],
    ["released_at", (table) => table.timestamp("released_at").nullable()],
    ["released_by_user_id", (table) => table.uuid("released_by_user_id").nullable().references("id").inTable("users").onDelete("SET NULL")],
    ["release_reason", (table) => table.text("release_reason").nullable()],
  ];

  for (const [column, add] of additions) {
    if (!(await knex.schema.hasColumn("talent_commitments", column))) {
      await knex.schema.alterTable("talent_commitments", add);
    }
  }

  // Connect historical rows to the active membership where the relationship
  // is unambiguous. Rows from another agency or without an agency stay
  // historical and do not appear in an agency's Booking Desk.
  const rows = await knex("talent_commitments")
    .whereNull("roster_membership_id")
    .whereNotNull("agency_id")
    .whereNotNull("profile_id")
    .select("id", "agency_id", "profile_id");
  for (const row of rows) {
    const membership = await knex("roster_memberships")
      .where({ agency_id: row.agency_id, profile_id: row.profile_id, status: "active" })
      .first("id");
    if (membership) {
      await knex("talent_commitments")
        .where({ id: row.id })
        .update({ roster_membership_id: membership.id });
    }
  }

  await knex.raw(
    "create index if not exists idx_commitments_agency_window on talent_commitments (agency_id, status, start_date, end_date)",
  );
  await knex.raw(
    "create index if not exists idx_commitments_membership_window on talent_commitments (roster_membership_id, status, start_date, end_date)",
  );
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable("talent_commitments"))) return;
  await knex.raw("drop index if exists idx_commitments_agency_window");
  await knex.raw("drop index if exists idx_commitments_membership_window");
  for (const column of [
    "release_reason",
    "released_by_user_id",
    "released_at",
    "confirmed_by_user_id",
    "confirmed_at",
    "updated_by_user_id",
    "created_by_user_id",
    "status",
    "talent_record_id",
    "roster_membership_id",
  ]) {
    if (await knex.schema.hasColumn("talent_commitments", column)) {
      await knex.schema.alterTable("talent_commitments", (table) => table.dropColumn(column));
    }
  }
};
