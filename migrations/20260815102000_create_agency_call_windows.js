"use strict";

/**
 * Recurring open-call hours — "Thursdays 3–4 PM ET, bring unretouched digitals".
 *
 * `docs/talent-trust-loop-design-2026-08.md` §(a) M3, ruling R6.
 *
 * NAMING: "open call" already means Pholio's own agency intake link
 * (`agency_open_call_links`, the `pholio_open_call` channel). These rows are a
 * different thing entirely — a curated fact about an agency's public walk-in
 * hours, which the agency does not administer through Pholio. The code
 * namespace is therefore `call_windows` everywhere; only the talent-facing
 * label says "open calls", because that is the industry term.
 *
 * `weekday` is ISO 8601 (1 = Monday … 7 = Sunday), spelled once in
 * src/shared/constants/submission-tracker.js and mirrored client-side.
 *
 * `start_minute`/`end_minute` are minutes from local midnight in `timezone`,
 * and both are nullable: some agencies publish the day but not the hour, and
 * "Tuesdays, time unpublished" is a true and useful row. Storing wall-clock
 * minutes plus an IANA zone rather than a UTC instant is deliberate — the fact
 * being recorded is "Thursdays at 3pm their time", which does not move when
 * daylight saving does.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("agency_call_windows")) return;

  await knex.schema.createTable("agency_call_windows", (table) => {
    table.uuid("id").primary();
    // Spec-registry organisation slug for reference entries.
    table.string("organization_id", 120).nullable();
    table
      .uuid("agency_id")
      .nullable()
      .references("id")
      .inTable("agencies")
      .onDelete("SET NULL");
    // Denormalised so the Overview card can render a row without joining
    // through two possible owners to find a name.
    table.string("display_name", 160).notNullable();
    table.string("label", 120).notNullable();
    // ISO weekday: 1 = Monday … 7 = Sunday.
    table.integer("weekday").notNullable();
    // Minutes from local midnight; NULL = day published, time not.
    table.integer("start_minute").nullable();
    table.integer("end_minute").nullable();
    table.string("timezone", 64).notNullable().defaultTo("America/New_York");
    table.string("location", 200).nullable();
    table.string("instructions", 500).nullable();
    table.string("source_url", 500).nullable();
    table.date("verified_on").notNullable();
    // Delisting is a flag, not a delete: a window that stops being published
    // should stop rendering without losing when we last confirmed it.
    table.boolean("active").notNullable().defaultTo(true);
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    table.index("organization_id", "idx_agency_call_windows_organization");
    table.index("agency_id", "idx_agency_call_windows_agency");
    // The "this week" read: live windows ordered by day.
    table.index(["active", "weekday"], "idx_agency_call_windows_active_weekday");
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("agency_call_windows");
};
