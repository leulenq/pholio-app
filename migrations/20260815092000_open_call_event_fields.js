"use strict";

/**
 * Event calls are open-call links with more on them (design A2) — not a second
 * call table. Arrivals, claims, the brief, per-board routing and the code all
 * already hang off `agency_open_call_links`; a parallel table would fork every
 * one of those for a set of columns that are nullable on the existing row.
 *
 * `brief_deadline` / `brief_ongoing` model the *application* deadline and stay
 * as they are. `event_starts_on` / `event_ends_on` are the event itself, which
 * is a different date and frequently a much later one.
 *
 * `compensation_type` is nullable in the schema and mandatory in the API for
 * event calls: existing representation links have no compensation to state,
 * and backfilling them with a value nobody chose would put words in an
 * agency's mouth. The event consent copy quotes this field verbatim, so the
 * validator — not the column — is where "you must say" belongs.
 *
 * Every column is added under its own guard so a partially applied run
 * re-runs cleanly.
 *
 * Transactions are off for the same reason as `20260815091000`: knex's SQLite
 * column drop is a table rebuild, and the `PRAGMA foreign_keys = OFF` it wraps
 * that in is a no-op inside a transaction — leaving `down` free to cascade
 * away every arrival and claim hanging off these links.
 */

exports.config = { transaction: false };

const TABLE = "agency_open_call_links";

const COLUMNS = [
  ["call_kind", (table) => table.string("call_kind", 16).notNullable().defaultTo("representation")],
  ["compensation_type", (table) => table.string("compensation_type", 16).nullable()],
  ["compensation_details", (table) => table.text("compensation_details").nullable()],
  ["event_name", (table) => table.string("event_name", 180).nullable()],
  ["event_starts_on", (table) => table.date("event_starts_on").nullable()],
  ["event_ends_on", (table) => table.date("event_ends_on").nullable()],
  ["event_location", (table) => table.string("event_location", 200).nullable()],
  ["requires_walk_video", (table) => table.boolean("requires_walk_video").notNullable().defaultTo(false)],
  ["requires_availability", (table) => table.boolean("requires_availability").notNullable().defaultTo(false)],
  ["requires_measurements", (table) => table.boolean("requires_measurements").notNullable().defaultTo(false)],
  // Per-call override of agencies.application_review_window_days. NULL = inherit.
  ["review_window_days", (table) => table.integer("review_window_days").nullable()],
  [
    "offer_response_window_hours",
    (table) => table.integer("offer_response_window_hours").notNullable().defaultTo(72),
  ],
];

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  for (const [name, define] of COLUMNS) {
    if (await knex.schema.hasColumn(TABLE, name)) continue;
    await knex.schema.alterTable(TABLE, (table) => define(table));
  }

  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_open_call_links_agency_kind_status ON ${TABLE} (agency_id, call_kind, status)`,
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.raw("DROP INDEX IF EXISTS idx_open_call_links_agency_kind_status");

  const present = [];
  for (const [name] of COLUMNS) {
    if (await knex.schema.hasColumn(TABLE, name)) present.push(name);
  }
  if (!present.length) return;

  await knex.schema.alterTable(TABLE, (table) => {
    table.dropColumns(...present);
  });
};
