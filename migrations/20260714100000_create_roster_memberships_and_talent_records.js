"use strict";

/**
 * Follow-up hardening for the Phase 1 roster tables introduced by
 * 20260712020000/20260712030000 on the audit branch. This migration stays
 * additive so environments that already applied those branch migrations can
 * move forward safely.
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("talent_records")) {
    const columns = [
      ["minor_consent_status", (table) => table.string("minor_consent_status", 32).notNullable().defaultTo("not_required")],
      ["minor_consent_grant_id", (table) => table.uuid("minor_consent_grant_id").nullable()],
      ["minor_consent_expires_at", (table) => table.timestamp("minor_consent_expires_at").nullable()],
    ];
    for (const [name, add] of columns) {
      if (!(await knex.schema.hasColumn("talent_records", name))) {
        await knex.schema.alterTable("talent_records", add);
      }
    }
    await knex.raw(
      "create index if not exists idx_talent_records_agency_created on talent_records (agency_id, created_at)",
    );
    await knex.raw(
      "create index if not exists idx_talent_records_claimed_profile on talent_records (agency_id, claimed_profile_id)",
    );
    await knex.raw(
      "create index if not exists idx_talent_records_minor on talent_records (agency_id, is_minor)",
    );
  }

  if (await knex.schema.hasTable("roster_memberships")) {
    if (!(await knex.schema.hasColumn("roster_memberships", "created_by_user_id"))) {
      await knex.schema.alterTable("roster_memberships", (table) => {
        table
          .uuid("created_by_user_id")
          .nullable()
          .references("id")
          .inTable("users")
          .onDelete("SET NULL");
      });
    }
    await knex.raw(
      "create index if not exists idx_roster_agency_status_board on roster_memberships (agency_id, status, board_id)",
    );
    await knex.raw(
      "create index if not exists idx_roster_agency_joined on roster_memberships (agency_id, joined_at)",
    );
    await knex.raw(
      "create index if not exists idx_roster_source_application on roster_memberships (source_application_id)",
    );
    await knex.raw(`
      create unique index if not exists uniq_active_roster_record
      on roster_memberships (agency_id, talent_record_id)
      where status = 'active' and talent_record_id is not null
    `);
  }

  if (
    (await knex.schema.hasTable("agency_import_jobs")) &&
    !(await knex.schema.hasColumn("agency_import_jobs", "imported_record_count"))
  ) {
    await knex.schema.alterTable("agency_import_jobs", (table) => {
      table.integer("imported_record_count").notNullable().defaultTo(0);
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable("roster_memberships")) {
    await knex.raw("drop index if exists uniq_active_roster_record");
    if (await knex.schema.hasColumn("roster_memberships", "created_by_user_id")) {
      await knex.schema.alterTable("roster_memberships", (table) => {
        table.dropColumn("created_by_user_id");
      });
    }
  }
  if (await knex.schema.hasTable("talent_records")) {
    for (const column of [
      "minor_consent_status",
      "minor_consent_grant_id",
      "minor_consent_expires_at",
    ]) {
      if (await knex.schema.hasColumn("talent_records", column)) {
        await knex.schema.alterTable("talent_records", (table) => {
          table.dropColumn(column);
        });
      }
    }
  }
  if (
    (await knex.schema.hasTable("agency_import_jobs")) &&
    (await knex.schema.hasColumn("agency_import_jobs", "imported_record_count"))
  ) {
    await knex.schema.alterTable("agency_import_jobs", (table) => {
      table.dropColumn("imported_record_count");
    });
  }
};
