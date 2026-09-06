"use strict";

/**
 * Comp-card representation resolver (industry audit §2.1).
 *
 * A comp card is the *booking agency's* leave-behind. The agency block on the
 * back is the whole point of it, and printing the model's own phone number
 * where the agency belongs invites the client to book around the agency — in
 * the trade, that is how a model gets dropped.
 *
 * The card previously resolved representation from `profiles.partner_agency_id`,
 * a column nothing ever writes, so every card fell through to the "Direct
 * Bookings" branch. The correct source is `talent_representations`
 * (migrations/20260629234500_create_talent_representations.js): one mother
 * agency plus non-exclusive placements, each scoped by market/territory.
 *
 * PRECEDENCE (the card is printed for ONE market at a time):
 *
 *   1. an active representation whose `market` matches the card preset's
 *      market — mother before placement inside that market;
 *   2. otherwise the mother agency (the relationship that speaks for the
 *      talent everywhere);
 *   3. otherwise any active placement;
 *   4. otherwise the legacy `profiles.partner_agency_id`, if a deployment
 *      ever set it;
 *   5. otherwise nothing — and only then does the card print a direct
 *      booking line.
 *
 * An internal counterparty (`agency_id`) takes its name and contact from the
 * `agencies` row; an external one (`external_agency_name`) has only a name,
 * which is still the right thing to print — a model represented by an agency
 * that is not on Pholio is still represented.
 *
 * Pure selection (`selectRepresentation`) is separated from the DB read
 * (`resolveRepresentation`) so the precedence rule is unit-testable without a
 * database.
 */

/** Relationship kinds recorded by `talent_representations.relationship_type`. */
const MOTHER = "mother";
const PLACEMENT = "placement";

/**
 * @param {*} value
 * @returns {string} trimmed string ("" when absent)
 */
function text(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

/**
 * Market keys compare case- and whitespace-insensitively ("New York" ===
 * "new york "). An empty market means "not market-scoped".
 * @param {*} value
 * @returns {string}
 */
function marketKey(value) {
  return text(value).toLowerCase();
}

/**
 * @param {object} row
 * @returns {boolean}
 */
function isActive(row) {
  return text(row && row.status).toLowerCase() === "active";
}

/**
 * @param {object} row
 * @returns {boolean}
 */
function isMother(row) {
  return text(row && row.relationship_type).toLowerCase() === MOTHER;
}

/**
 * @param {object} row
 * @returns {boolean}
 */
function isPlacement(row) {
  return text(row && row.relationship_type).toLowerCase() === PLACEMENT;
}

/**
 * Deterministic ordering inside a precedence group: mother first, then
 * exclusive deals, then the oldest relationship, then id. Two cards composed
 * from the same data must never disagree about which agency is on them.
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function compareRows(a, b) {
  const motherRank = (row) => (isMother(row) ? 0 : 1);
  if (motherRank(a) !== motherRank(b)) return motherRank(a) - motherRank(b);

  const exclusiveRank = (row) => (row && row.is_exclusive ? 0 : 1);
  if (exclusiveRank(a) !== exclusiveRank(b)) return exclusiveRank(a) - exclusiveRank(b);

  const started = (row) => text(row && row.started_on) || "9999-12-31";
  if (started(a) !== started(b)) return started(a) < started(b) ? -1 : 1;

  const created = (row) => {
    const raw = row && row.created_at;
    if (raw == null) return "9999-12-31";
    return raw instanceof Date ? raw.toISOString() : String(raw);
  };
  if (created(a) !== created(b)) return created(a) < created(b) ? -1 : 1;

  return text(a && a.id) < text(b && b.id) ? -1 : 1;
}

/**
 * Apply the precedence rule to a set of `talent_representations` rows.
 *
 * @param {Array<object>} rows — rows for ONE profile (any status; ended rows
 *   are ignored here so callers may pass an unfiltered read)
 * @param {{ market?: string|null }} [options] — the card's market, when the
 *   preset carries one
 * @returns {object|null} the winning row, or null when the talent has no
 *   active representation
 */
function selectRepresentation(rows, options = {}) {
  const active = (Array.isArray(rows) ? rows : []).filter(
    (row) => row && typeof row === "object" && isActive(row),
  );
  if (!active.length) return null;

  const wanted = marketKey(options.market);
  if (wanted) {
    const inMarket = active
      .filter((row) => marketKey(row.market) === wanted)
      .sort(compareRows);
    if (inMarket.length) return inMarket[0];
  }

  const mothers = active.filter(isMother).sort(compareRows);
  if (mothers.length) return mothers[0];

  const placements = active.filter(isPlacement).sort(compareRows);
  if (placements.length) return placements[0];

  // A row with an unrecognized relationship_type is still an active
  // relationship — better the agency than the model's phone.
  return active.slice().sort(compareRows)[0];
}

/**
 * The agency's own contact line for the back of the card. Never the model's
 * phone: that is the exact failure this module exists to fix.
 * @param {object|null} agency — an `agencies` row
 * @returns {string}
 */
function buildAgencyContactLine(agency) {
  if (!agency) return "";
  const parts = [
    text(agency.location),
    text(agency.support_email),
    text(agency.website),
  ].filter(Boolean);
  return parts.join("  ·  ");
}

/**
 * Shape the winning row (plus its agency row, when internal) into the object
 * the composition director prints.
 * @param {object} row
 * @param {object|null} agency
 * @returns {{ name: string, kind: 'internal'|'external',
 *             relationshipType: string, market: string|null,
 *             territory: string|null, division: string|null,
 *             contactLine: string, agencyId: string|null }|null}
 */
function shapeRepresentation(row, agency) {
  const name = agency ? text(agency.name) : text(row && row.external_agency_name);
  if (!name) return null;
  return {
    name,
    kind: agency ? "internal" : "external",
    relationshipType: text(row && row.relationship_type).toLowerCase() || null,
    market: text(row && row.market) || null,
    territory: text(row && row.territory) || null,
    division: text(row && row.division) || null,
    contactLine: buildAgencyContactLine(agency),
    agencyId: agency ? text(agency.id) || null : null,
  };
}

/**
 * Resolve the representation to print on a comp card.
 *
 * Best-effort by design: a missing table or a failed read leaves the card
 * unrepresented rather than failing the render — but it must never invent a
 * direct-booking block for a talent who has one.
 *
 * @param {object} args
 * @param {import('knex').Knex} args.knex
 * @param {object} args.profile — a `profiles` row
 * @param {string|null} [args.market] — the card preset's market, when saved
 * @returns {Promise<object|null>} see {@link shapeRepresentation}
 */
async function resolveRepresentation({ knex, profile, market = null } = {}) {
  if (!knex || !profile || !profile.id) return null;

  let rows = [];
  try {
    rows = await knex("talent_representations")
      .where({ profile_id: profile.id, status: "active" })
      .select(
        "id",
        "agency_id",
        "external_agency_name",
        "relationship_type",
        "market",
        "territory",
        "division",
        "is_exclusive",
        "status",
        "started_on",
        "created_at",
      );
  } catch (error) {
    console.error("[PDF Representation] read failed:", error.message);
    rows = [];
  }

  const winner = selectRepresentation(rows, { market });
  const agencyId = winner
    ? text(winner.agency_id) || null
    : text(profile.partner_agency_id) || null;

  // Nothing recorded at all — not even the legacy column.
  if (!winner && !agencyId) return null;

  let agency = null;
  if (agencyId) {
    try {
      agency = await knex("agencies")
        .where({ id: agencyId })
        .select("id", "name", "location", "website", "support_email")
        .first();
    } catch (error) {
      console.error("[PDF Representation] agency lookup failed:", error.message);
      agency = null;
    }
  }

  if (winner) {
    // An internal row whose agency has vanished still names no one; fall back
    // to the external name if the row carries one.
    return shapeRepresentation(winner, agency);
  }

  // Legacy `profiles.partner_agency_id` — kept so any deployment that set it
  // keeps its behavior. Nothing in the app writes it today.
  return agency ? shapeRepresentation({ relationship_type: null }, agency) : null;
}

module.exports = {
  MOTHER,
  PLACEMENT,
  selectRepresentation,
  buildAgencyContactLine,
  shapeRepresentation,
  resolveRepresentation,
};
