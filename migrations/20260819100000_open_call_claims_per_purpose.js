"use strict";

/**
 * The quota exemption learns the difference between an agency and an edition
 * (`docs/open-call-applicant-flow-design-2026-08.md` §1 C4).
 *
 * `20260815091000` made an *application* unique per edition for event calls:
 *
 *   representation — one live application per (profile, agency)
 *   event_casting  — one per (profile, open_call_link)
 *
 * The claim that exempts a submission from the monthly discovery quota never
 * followed. `uq_open_call_claims_agency_profile` (`20260704120000:113`) is keyed
 * `(agency_id, profile_id) WHERE status IN ('active','consumed')`, and
 * `mintClaim` treats a consumed row as "this profile has already spent its one
 * exemption with this agency, ever". Under one organizer running two editions
 * that reads as: a model who applied to FWBK Brooklyn cannot be exempt for
 * FWBK Queens, so her Queens application silently burns one of her five
 * monthly discovery submissions. Nobody wrote that rule; it is the old key
 * outliving the reason it was chosen.
 *
 * So the claim key becomes purpose-dependent, mirroring the application index:
 *
 *   representation — one live-or-spent claim per (agency, profile)
 *   event_casting  — one per (link, profile), i.e. per edition
 *
 * `call_purpose` is denormalized onto the claim for the same reason
 * `applications.call_purpose` is: a partial index cannot filter on a joined
 * column, and the purpose of a claim cannot change once minted — an edition
 * claim never becomes a representation claim. Partial unique indexes work on
 * both PostgreSQL and SQLite; the precedent is the index this replaces.
 *
 * The backfill reads `agency_open_call_links.call_kind`, which only exists once
 * `20260815092000` has run — guarded, because a database may hold the claims
 * table without the event fields, and a claim minted through a link that is
 * *now* an event call was still an agency-keyed claim when it was spent.
 * Guarding also keeps the correlated UPDATE off databases where it would fail.
 *
 * TRANSACTIONS OFF, per `20260815091000` and `20260815092000`. `down` drops a
 * column, knex implements a SQLite column drop as create-copy-drop-rename, and
 * the `PRAGMA foreign_keys = OFF` it guards that with is silently ignored
 * inside a transaction — which would let `DROP TABLE agency_open_call_claims`
 * cascade through `application_submission_requests.exemption_claim_id` and
 * every arrival attribution hanging off it. Outside a transaction knex's own
 * guard works; every statement here is individually guarded so a partial run
 * re-runs cleanly.
 */

exports.config = { transaction: false };

const TABLE = "agency_open_call_claims";
const LINKS_TABLE = "agency_open_call_links";

const LEGACY_INDEX = "uq_open_call_claims_agency_profile";
const REPR_INDEX = "uq_open_call_claims_agency_profile_repr";
const EVENT_INDEX = "uq_open_call_claims_link_profile_event";

// Spelled here rather than imported from src/shared/constants/event-casting.js:
// a migration is a historical record of the statements a database ran, and it
// must keep saying what it said even after the application's vocabulary moves.
// The constants module is the single source for every runtime read of these.
const REPRESENTATION = "representation";
const EVENT_CASTING = "event_casting";

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn(TABLE, "call_purpose"))) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.string("call_purpose", 24).notNullable().defaultTo(REPRESENTATION);
    });
  }

  // Backfill from the link the claim was minted through. Only rows that need
  // moving are touched, and only when the source column exists.
  if (await knex.schema.hasColumn(LINKS_TABLE, "call_kind")) {
    await knex(TABLE)
      .whereNot("call_purpose", EVENT_CASTING)
      .whereIn("link_id", function linksOfKind() {
        this.select("id").from(LINKS_TABLE).where("call_kind", EVENT_CASTING);
      })
      .update({ call_purpose: EVENT_CASTING });
  }

  // Drop the blanket key before creating the per-purpose ones: on a database
  // where a Brooklyn claim is consumed and a Queens claim is about to be
  // minted, the two must not coexist.
  await knex.raw(`DROP INDEX IF EXISTS ${LEGACY_INDEX}`);

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${REPR_INDEX}
      ON ${TABLE} (agency_id, profile_id)
      WHERE status IN ('active', 'consumed') AND call_purpose = '${REPRESENTATION}'
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${EVENT_INDEX}
      ON ${TABLE} (link_id, profile_id)
      WHERE status IN ('active', 'consumed') AND call_purpose = '${EVENT_CASTING}'
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  // Both partial indexes filter on `call_purpose`, so they have to go before
  // the column does — knex's SQLite column drop replays this table's indexes
  // onto the rebuilt table, and an index over a column that no longer exists
  // fails the replay.
  await knex.raw(`DROP INDEX IF EXISTS ${EVENT_INDEX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${REPR_INDEX}`);

  // Restoring the blanket key is only safe if no organizer has since taken two
  // edition claims from one profile. If they have, this statement fails loudly,
  // which is the correct outcome: a rollback must not decide which of a model's
  // two consumed exemptions to throw away.
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${LEGACY_INDEX}
      ON ${TABLE} (agency_id, profile_id)
      WHERE status IN ('active', 'consumed')
  `);

  if (await knex.schema.hasColumn(TABLE, "call_purpose")) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.dropColumn("call_purpose");
    });
  }
};
