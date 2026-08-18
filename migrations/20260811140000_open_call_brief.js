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
  // Guarded per column so a partially-applied run can be re-run to completion.
  const columns = [
    ["brief_who", (table) => table.text("brief_who").nullable()],
    ["brief_what", (table) => table.text("brief_what").nullable()],
    ["brief_eligibility", (table) => table.text("brief_eligibility").nullable()],
    ["brief_next_steps", (table) => table.text("brief_next_steps").nullable()],
    // A deadline is a decision, not always a date. Agencies run permanent open
    // calls — Storm takes walk-ins Mon–Fri — so an agency either names a
    // closing date or says explicitly that the call runs continuously. Both are
    // answers; neither is an omission.
    ["brief_deadline", (table) => table.date("brief_deadline").nullable()],
    [
      "brief_ongoing",
      (table) => table.boolean("brief_ongoing").notNullable().defaultTo(false),
    ],
    ["brief_completed_at", (table) => table.timestamp("brief_completed_at").nullable()],
  ];

  const missing = [];
  for (const [name, build] of columns) {
    if (!(await knex.schema.hasColumn("agency_open_call_links", name))) {
      missing.push(build);
    }
  }

  if (missing.length) {
    await knex.schema.alterTable("agency_open_call_links", (table) => {
      for (const build of missing) build(table);
    });

    await knex.schema.alterTable("agency_open_call_links", (table) => {
      table.index(["agency_id", "brief_deadline"], "idx_open_call_links_deadline");
    });
  }
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
