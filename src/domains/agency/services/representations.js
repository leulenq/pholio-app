"use strict";

/**
 * Agency-originated representation rows — the write half of the signing loop
 * (industry audit §3.2, decision §7.6).
 *
 * Moving an application to `represented` used to write one string on the
 * application row. `talent_representations` — the table every other surface
 * actually reads representation from — was writable only by the talent, so the
 * signing agency read its own signed model as unrepresented in Discover.
 *
 * `recordSigning` closes that loop by writing the row the decision implies:
 * a `placement` relationship with this agency, in a market, on a board, from a
 * start date — as `status = 'pending'`, `source = 'agency'`.
 *
 * Pending is deliberate and load-bearing. Representation is a two-party fact;
 * an agency may record that it signed someone, but only the talent can confirm
 * it. Until they do (`POST /api/talent/profile/representations/:id/confirm`)
 * nothing downstream reads the row as representation — see the pending filters
 * in `discover-search.js` and `talent-dossier.js`.
 */

const { v4: uuidv4 } = require("uuid");
const {
  syncLegacyCurrentAgency,
} = require("../../talent/services/representations");

/** Agency-originated rows are always market placements, never mother agency. */
const AGENCY_RELATIONSHIP_TYPE = "placement";
const AGENCY_SOURCE = "agency";
const PENDING = "pending";
const ACTIVE = "active";
const ENDED = "ended";

/** Statuses a signing row can be in before it is settled either way. */
const OPEN_STATUSES = Object.freeze([PENDING, ACTIVE]);

// Deploy-before-migrate guard. The signing write is a side effect of a status
// change, so it must never be the reason a status change fails: if the table
// or the columns this lane added are not there yet, the status change goes
// through and no representation row is written — which is exactly the
// behaviour that shipped before this lane. Cached on the knex client (shared
// by every transaction on the pool) rather than the transaction object, which
// is new on each call.
const _schemaReadyByClient = new WeakMap();

async function signingSchemaReady(db) {
  const key = db?.client || db;
  if (!_schemaReadyByClient.has(key)) {
    let ready = false;
    try {
      ready =
        (await db.schema.hasTable("talent_representations")) &&
        (await db.schema.hasColumn("talent_representations", "board_name"));
    } catch {
      ready = false;
    }
    _schemaReadyByClient.set(key, ready);
  }
  return _schemaReadyByClient.get(key);
}

function normalizedKey(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("en-US");
}

/** Must match `domains/talent/services/representations.js#scopeKey` exactly. */
function scopeKey(market, territory) {
  return `${normalizedKey(market)}|${normalizedKey(territory)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function trimmedOrNull(value, max) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return max ? text.slice(0, max) : text;
}

/**
 * The market this agency signs into. Explicit argument first (a caller that
 * knows the board's market), then the agency's own recorded location. Null is
 * a legitimate answer — an agency that never set a location signs into an
 * unnamed market rather than into a guessed one.
 */
async function resolveMarket(trx, agencyId, market) {
  const explicit = trimmedOrNull(market, 120);
  if (explicit) return explicit;
  try {
    const agency = await trx("agencies").where({ id: agencyId }).first();
    return trimmedOrNull(agency?.location, 120);
  } catch {
    // An unnamed market is a worse row than a named one, never a reason to
    // fail the signing.
    return null;
  }
}

/**
 * The board label AT SIGNING, snapshotted rather than joined: boards get
 * renamed and deleted, and the board someone was signed to is a historical
 * fact about the signing.
 */
async function resolveBoardName(trx, application, boardName) {
  const explicit = trimmedOrNull(boardName, 160);
  if (explicit) return explicit;
  if (!application?.board_id) return null;
  try {
    const board = await trx("boards")
      .where({ id: application.board_id })
      .first("name");
    return trimmedOrNull(board?.name, 160);
  } catch {
    return null;
  }
}

/**
 * Record that this agency signed the applicant behind `applicationId`.
 *
 * Idempotent by scope: if this agency already holds an open (pending or
 * active) placement row for the same profile and market scope, that row is
 * returned untouched. Re-running the status change, a bulk update that
 * includes an already-represented row, and a retried request all converge on
 * one row.
 *
 * Returns `null` — not an error — when there is nothing to sign: an
 * identity-only application with no profile behind it, or an application that
 * does not belong to this agency.
 *
 * @param {object} args
 * @param {import('knex').Knex.Transaction} args.trx
 * @param {string} args.applicationId
 * @param {string} args.agencyId
 * @param {string|null} [args.actorUserId] agency member who recorded it
 * @param {string|null} [args.market]
 * @param {string|null} [args.boardName]
 * @param {string|null} [args.startedOn] YYYY-MM-DD, defaults to today
 * @returns {Promise<object|null>} the representation row
 */
async function recordSigning({
  trx,
  applicationId,
  agencyId,
  // Accepted and intentionally not stored: the agency member who recorded the
  // signing is already on the application's activity trail, and the only actor
  // this row names is the one who *confirmed* it — always the talent.
  actorUserId, // eslint-disable-line no-unused-vars
  market = null,
  boardName = null,
  startedOn = null,
}) {
  if (!trx || !applicationId || !agencyId) return null;
  if (!(await signingSchemaReady(trx))) return null;

  // `select *` rather than a column list: `applications.board_id` is optional
  // in some schemas, and a missing column must not throw here.
  const application = await trx("applications")
    .where({ id: applicationId, agency_id: agencyId })
    .first();
  if (!application?.profile_id) return null;

  const resolvedMarket = await resolveMarket(trx, agencyId, market);
  const key = scopeKey(resolvedMarket, null);

  const existing = await trx("talent_representations")
    .where({
      profile_id: application.profile_id,
      agency_id: agencyId,
      relationship_type: AGENCY_RELATIONSHIP_TYPE,
      scope_key: key,
    })
    .whereIn("status", OPEN_STATUSES)
    .first();
  if (existing) return existing;

  const id = uuidv4();
  await trx("talent_representations").insert({
    id,
    profile_id: application.profile_id,
    agency_id: agencyId,
    external_agency_name: null,
    external_agency_key: null,
    relationship_type: AGENCY_RELATIONSHIP_TYPE,
    market: resolvedMarket,
    territory: null,
    scope_key: key,
    division: null,
    board_name: await resolveBoardName(trx, application, boardName),
    // Exclusivity is a term of a contract the talent signed, not something an
    // application status can assert. It stays false until the talent says so.
    is_exclusive: false,
    status: PENDING,
    started_on: startedOn || today(),
    ended_on: null,
    source: AGENCY_SOURCE,
    originating_application_id: application.id,
    created_at: trx.fn.now(),
    updated_at: trx.fn.now(),
  });

  // No `syncLegacyCurrentAgency` here on purpose: `profiles.current_agency` is
  // the legacy projection of the talent's ACTIVE representation, and a pending
  // proposal is not one. It is projected on confirmation.
  return trx("talent_representations").where({ id }).first();
}

/**
 * The application moved away from `represented`. End the row this agency
 * originated for it — and only that row: rows the talent wrote themselves, and
 * rows another agency originated, are not this agency's to close.
 *
 * @param {object} args
 * @param {import('knex').Knex.Transaction} args.trx
 * @param {string} args.applicationId
 * @param {string} args.agencyId
 * @param {string|null} [args.endedOn] YYYY-MM-DD, defaults to today
 * @returns {Promise<number>} rows ended
 */
async function endRepresentation({
  trx,
  applicationId,
  agencyId,
  endedOn = null,
}) {
  if (!trx || !applicationId || !agencyId) return 0;
  if (!(await signingSchemaReady(trx))) return 0;

  const rows = await trx("talent_representations")
    .where({
      originating_application_id: applicationId,
      agency_id: agencyId,
      source: AGENCY_SOURCE,
    })
    .whereIn("status", OPEN_STATUSES)
    .select("id", "profile_id", "status");
  if (rows.length === 0) return 0;

  await trx("talent_representations")
    .whereIn(
      "id",
      rows.map((row) => row.id),
    )
    .update({
      status: ENDED,
      ended_on: endedOn || today(),
      updated_at: trx.fn.now(),
    });

  // Only an ACTIVE row was ever projected into `profiles.current_agency`, so
  // only ending one can change that projection.
  const profileIds = [
    ...new Set(
      rows.filter((row) => row.status === ACTIVE).map((row) => row.profile_id),
    ),
  ];
  for (const profileId of profileIds) {
    await syncLegacyCurrentAgency(trx, profileId);
  }

  return rows.length;
}

module.exports = {
  recordSigning,
  endRepresentation,
  scopeKey,
  AGENCY_SOURCE,
  AGENCY_RELATIONSHIP_TYPE,
  OPEN_STATUSES,
};
