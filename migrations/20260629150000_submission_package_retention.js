"use strict";

const RETENTION_MONTHS = 24;

function retentionExpiry(createdAt) {
  const date = new Date(createdAt || Date.now());
  date.setUTCMonth(date.getUTCMonth() + RETENTION_MONTHS);
  return date;
}

/**
 * Adds disclosure lifecycle metadata to immutable submission snapshots.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const tableName = "talent_submission_packages";
  if (!(await knex.schema.hasTable(tableName))) return;

  const columns = {
    retention_expires_at: await knex.schema.hasColumn(
      tableName,
      "retention_expires_at",
    ),
    revoked_at: await knex.schema.hasColumn(tableName, "revoked_at"),
    redacted_at: await knex.schema.hasColumn(tableName, "redacted_at"),
    redaction_reason: await knex.schema.hasColumn(
      tableName,
      "redaction_reason",
    ),
  };
  if (Object.values(columns).some((present) => !present)) {
    await knex.schema.alterTable(tableName, (table) => {
      if (!columns.retention_expires_at) {
        table.timestamp("retention_expires_at").nullable().index();
      }
      if (!columns.revoked_at) table.timestamp("revoked_at").nullable();
      if (!columns.redacted_at) table.timestamp("redacted_at").nullable();
      if (!columns.redaction_reason) {
        table.string("redaction_reason", 80).nullable();
      }
    });
  }

  const rows = await knex(tableName)
    .whereNull("retention_expires_at")
    .select("id", "created_at");
  for (const row of rows) {
    await knex(tableName)
      .where({ id: row.id })
      .update({ retention_expires_at: retentionExpiry(row.created_at) });
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  const tableName = "talent_submission_packages";
  if (!(await knex.schema.hasTable(tableName))) return;
  const names = [
    "retention_expires_at",
    "revoked_at",
    "redacted_at",
    "redaction_reason",
  ];
  const present = {};
  for (const name of names) {
    present[name] = await knex.schema.hasColumn(tableName, name);
  }
  if (Object.values(present).some(Boolean)) {
    await knex.schema.alterTable(tableName, (table) => {
      for (const name of names) {
        if (present[name]) table.dropColumn(name);
      }
    });
  }
};
