"use strict";

/**
 * Preserve the exact verified guardian request that authorized a minor's
 * disclosure. Existing adult events remain null.
 */
exports.up = async function up(knex) {
  const tableName = "application_submission_consent_events";
  if (!(await knex.schema.hasTable(tableName))) return;

  const hasColumn = await knex.schema.hasColumn(
    tableName,
    "guardian_consent_request_id",
  );
  if (hasColumn) return;

  await knex.schema.alterTable(tableName, (table) => {
    table
      .uuid("guardian_consent_request_id")
      .nullable()
      .references("id")
      .inTable("guardian_consent_requests")
      .onDelete("RESTRICT");
    table.index(
      ["guardian_consent_request_id"],
      "idx_submission_consent_guardian_request",
    );
  });
};

exports.down = async function down(knex) {
  const tableName = "application_submission_consent_events";
  if (!(await knex.schema.hasTable(tableName))) return;

  const hasColumn = await knex.schema.hasColumn(
    tableName,
    "guardian_consent_request_id",
  );
  if (!hasColumn) return;

  await knex.schema.alterTable(tableName, (table) => {
    table.dropIndex(
      ["guardian_consent_request_id"],
      "idx_submission_consent_guardian_request",
    );
    table.dropColumn("guardian_consent_request_id");
  });
};
