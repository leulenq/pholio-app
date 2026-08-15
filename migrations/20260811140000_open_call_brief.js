"use strict";

/**
 * The mandatory open-call brief.
 *
 * An open call with no brief is a link into silence: the applicant cannot tell
 * who it is for, what to send, or what happens after they send it. A4 #1 makes
 * the brief part of the surface rather than an optional extra.
 *
 * Columns are nullable because links already published cannot be broken by a
 * deploy. New links require a brief at the API; existing ones are grandfathered
 * and prompted to complete. `brief_completed_at` is what distinguishes "the
 * agency answered this" from "nobody has filled it in yet" — a brief of empty
 * strings would be indistinguishable otherwise.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("agency_open_call_links", (table) => {
    table.text("brief_who").nullable();
    table.text("brief_what").nullable();
    table.text("brief_eligibility").nullable();
    table.text("brief_next_steps").nullable();

    // A deadline is a decision, not always a date. Agencies run permanent open
    // calls — Storm takes walk-ins Mon–Fri — so an agency either names a
    // closing date or says explicitly that the call runs continuously. Both are
    // answers; neither is an omission.
    table.date("brief_deadline").nullable();
    table.boolean("brief_ongoing").notNullable().defaultTo(false);

    table.timestamp("brief_completed_at").nullable();
  });

  await knex.schema.alterTable("agency_open_call_links", (table) => {
    table.index(["agency_id", "brief_deadline"], "idx_open_call_links_deadline");
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable("agency_open_call_links", (table) => {
    table.dropIndex(["agency_id", "brief_deadline"], "idx_open_call_links_deadline");
  });

  await knex.schema.alterTable("agency_open_call_links", (table) => {
    table.dropColumn("brief_who");
    table.dropColumn("brief_what");
    table.dropColumn("brief_eligibility");
    table.dropColumn("brief_next_steps");
    table.dropColumn("brief_deadline");
    table.dropColumn("brief_ongoing");
    table.dropColumn("brief_completed_at");
  });
};
