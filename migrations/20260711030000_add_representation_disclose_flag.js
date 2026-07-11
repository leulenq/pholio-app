"use strict";

/**
 * Discover search — representation-status disclosure opt-in (WS6.1 / LB-5).
 *
 * `talent_representations.disclose_agency_name` — talent-controlled opt-in.
 * Default false ("undisclosed"). The agency-discovery `representation_status`
 * derivation (`shared/lib/audience-dto.js`) may only name the representing
 * agency (`represented_by`) when the relevant row has this flag true;
 * otherwise Discover renders "represented — undisclosed". Naming an agency is
 * never the default — see council review LB-5.
 *
 * Dual-dialect (PG + SQLite); guarded `hasColumn` so a repeat/partial deploy
 * (or a deploy-before-migrate window) is a safe no-op.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn(
    "talent_representations",
    "disclose_agency_name",
  );
  if (!hasColumn) {
    await knex.schema.alterTable("talent_representations", (table) => {
      table.boolean("disclose_agency_name").notNullable().defaultTo(false);
    });
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn(
    "talent_representations",
    "disclose_agency_name",
  );
  if (hasColumn) {
    await knex.schema.alterTable("talent_representations", (table) => {
      table.dropColumn("disclose_agency_name");
    });
  }
};
