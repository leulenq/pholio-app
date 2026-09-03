"use strict";

/**
 * "Not for us" — an agency's private view state on a Scout lead.
 *
 * Scout sits before the application lifecycle begins (see
 * `tasks/discover-expanded-view-2026-09.md` §1). The agency has received no
 * submission and owes the talent no answer, so the one thing it can honestly
 * record about a lead it does not want is that it does not want to be shown
 * that lead again. That is a property of the agency's own result set, not a
 * verdict on a person.
 *
 * The table is deliberately minimal — no reason, no note, no status. A reason
 * column would turn a scroll-past into a recorded judgement about someone who
 * never contacted this agency, and would immediately raise the question of who
 * else may read it. There is nothing here to disclose because there is nothing
 * here: an agency id, a profile id, and when.
 *
 * Nothing about a row here is ever communicated to the talent: no
 * notification, no activity, and it is not part of the talent's data export or
 * `talent-data-inventory.js` (which enumerates the talent's personal data —
 * this is the agency's view state, keyed by a profile id). Deletion of either
 * side cascades.
 *
 * Mirrors `20260820100000_create_agency_invitations.js` in shape, and its
 * service (`services/agency-dismissals.js`) mirrors that migration's service in
 * guarding every read for the deploy-before-migrate window.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("agency_dismissed_profiles")) return;

  await knex.schema.createTable("agency_dismissed_profiles", (table) => {
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
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    // One dismissal per pair: dismissing twice is the same fact, which is what
    // makes `POST .../dismiss` idempotent. This unique also serves the
    // agency-scoped exclusion read in Discover (leading column `agency_id`).
    table.unique(["agency_id", "profile_id"], {
      indexName: "agency_dismissed_profiles_agency_profile_unique",
    });
  });
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("agency_dismissed_profiles");
};
