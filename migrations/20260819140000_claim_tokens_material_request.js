"use strict";

/**
 * A materials link points at ONE request
 * (`docs/open-call-applicant-flow-design-2026-08.md` §5.4, §2 Law 2).
 *
 * `applicant_claim_tokens` carries an identity and a purpose, and the fulfilment
 * page resolved "which ask is this?" by joining the identity back through
 * `applications` and picking the newest outstanding request. That is correct for
 * exactly one outstanding request and wrong the moment there are two: an
 * applicant shortlisted by Brooklyn and by an unrelated agency in the same week
 * holds two live links, and both resolve to whichever request sorts first. One
 * organizer's emailed link then renders the other organizer's asks and, worse,
 * marks the other organizer's request fulfilled — a cross-tenant write driven by
 * a credential that was never scoped to it.
 *
 * The token is the credential, so the token names the request. ON DELETE SET
 * NULL rather than CASCADE: a request that is deleted must leave the token as an
 * ordinary expired link, not vanish mid-flight. NULL is also what every token
 * minted before this migration carries, which is why `routes/materials.js` keeps
 * the identity-join heuristic as an explicitly legacy-only fallback.
 *
 * TRANSACTIONS OFF, matching `20260819110000` and `20260819130000`: `down` drops
 * a column, knex implements a SQLite column drop as create-copy-drop-rename, and
 * the `PRAGMA foreign_keys = OFF` guarding that is silently ignored inside a
 * transaction. Every statement is individually guarded, so a partial run re-runs
 * cleanly.
 */

exports.config = { transaction: false };

const TOKENS_TABLE = "applicant_claim_tokens";
const REQUESTS_TABLE = "open_call_material_requests";
const COLUMN = "material_request_id";
const INDEX = "idx_applicant_claim_tokens_material_request";

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // Deploy-before-migrate cuts both ways: this migration must also survive
  // running against a database that never got `20260819110000`.
  if (!(await knex.schema.hasTable(TOKENS_TABLE))) return;
  if (!(await knex.schema.hasTable(REQUESTS_TABLE))) return;

  if (!(await knex.schema.hasColumn(TOKENS_TABLE, COLUMN))) {
    await knex.schema.alterTable(TOKENS_TABLE, (table) => {
      table
        .uuid(COLUMN)
        .nullable()
        .references("id")
        .inTable(REQUESTS_TABLE)
        .onDelete("SET NULL");
    });
  }

  await knex.raw(
    `CREATE INDEX IF NOT EXISTS ${INDEX} ON ${TOKENS_TABLE} (${COLUMN})`,
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable(TOKENS_TABLE))) return;

  await knex.raw(`DROP INDEX IF EXISTS ${INDEX}`);

  // Losing the binding is a return to the identity-join heuristic, which is
  // exactly what the fallback in `routes/materials.js` still handles — so this
  // rollback drops data that is recoverable behaviourally, and does not need the
  // refusal `20260819130000`'s down has to make.
  if (await knex.schema.hasColumn(TOKENS_TABLE, COLUMN)) {
    await knex.schema.alterTable(TOKENS_TABLE, (table) => {
      table.dropColumn(COLUMN);
    });
  }
};
