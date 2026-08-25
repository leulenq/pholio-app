"use strict";

/**
 * `open_call_material_requests.kind` — separate "send us more" from
 * "send those again, current".
 *
 * Plan §9.3 lists Requests as "more materials / refresh". Only the first half
 * was built, and the second cannot reuse it: `request-materials` validates the
 * asked-for keys against the call's SHORTLIST-stage fields, on the sound
 * principle that an organizer may only ask for what their call declared. But
 * digitals are an APPLY-stage field — the talent already sent them — so a
 * refresh request is rejected by exactly the check that makes the materials
 * request safe.
 *
 * They are also different asks in substance. "More materials" means the
 * organizer needs something they have never had. "Refresh" means what they have
 * has aged out — the freshness engine's aging/stale/undated states — and the
 * talent's job is to reshoot rather than to dig something out.
 *
 * One column, one table. A second table would duplicate the fulfilment path,
 * the tokenised reply page and the chase email for what is a discriminator on
 * the same fact: this organizer is waiting on this applicant for these keys.
 *
 * Defaults to 'materials', so every row written before this migration keeps the
 * meaning it was written with.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable("open_call_material_requests"))) return;
  if (await knex.schema.hasColumn("open_call_material_requests", "kind")) {
    return;
  }

  await knex.schema.alterTable("open_call_material_requests", (table) => {
    table.string("kind", 24).notNullable().defaultTo("materials");
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  if (!(await knex.schema.hasColumn("open_call_material_requests", "kind"))) {
    return;
  }
  await knex.schema.alterTable("open_call_material_requests", (table) => {
    table.dropColumn("kind");
  });
};

/**
 * NOT transactional — `down()` drops a column, and SQLite implements that as a
 * table rebuild whose `PRAGMA foreign_keys = OFF` guard is ignored inside a
 * transaction. See tests/migrations/event-casting-schema.test.js.
 */
exports.config = { transaction: false };
