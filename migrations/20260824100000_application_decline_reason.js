"use strict";

/**
 * `applications.decline_reason` — the one-click templated decline.
 *
 * Plan §9.3 pairs auto-close with a templated decline, and §9.6 ranks auto-close
 * as the cheapest trust feature in the industry. The vocabulary and the reasons
 * behind its shape live in `src/domains/agency/services/decline-reasons.js`.
 *
 * NULLABLE, permanently and deliberately. A decline with no reason is a valid
 * decline — it is what every decline in the table before this migration is, and
 * what any agency that does not want to state a reason will keep sending. The
 * column records a reason when one was chosen; it never implies one was.
 *
 * No CHECK constraint on the value. The vocabulary is versioned in application
 * code and will gain entries; a database constraint would turn every future
 * addition into a migration, and the write path already validates against the
 * canonical list via `normalizeDeclineReason`. Retiring an entry must leave the
 * historical rows readable, which a CHECK would prevent.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasColumn("applications", "decline_reason")) return;

  await knex.schema.alterTable("applications", (table) => {
    table.string("decline_reason", 40).nullable();
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  if (!(await knex.schema.hasColumn("applications", "decline_reason"))) return;

  await knex.schema.alterTable("applications", (table) => {
    table.dropColumn("decline_reason");
  });
};

/**
 * NOT transactional.
 *
 * `up()` only adds a column and would be safe either way, but `down()` drops one
 * from `applications`, and SQLite implements that as create-copy-drop-rename
 * with a `PRAGMA foreign_keys = OFF` guard that is silently ignored inside a
 * transaction. Rebuilding `applications` under a live pragma cascades — the
 * regression `tests/migrations/event-casting-schema.test.js` exists to catch.
 * The rollback path is the dangerous half, so the config covers both.
 */
exports.config = { transaction: false };
