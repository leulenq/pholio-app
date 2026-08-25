"use strict";

/**
 * The rights/consent ledger (§9.6 #7) — marketing use and AI-replica likeness.
 *
 * §9.6 ranks this as "the AI-era position that doesn't require building AI
 * imagery; aligns with FWA replica consent and the H&M ownership template."
 * That framing is the point: Pholio does not generate likenesses, and this
 * ledger is not a step towards doing so. It is the record that lets a talent
 * say yes or no to each use separately, and prove later which they said.
 *
 * THE RULES, each traceable to plan C6.
 *
 * 1. THE TWO PURPOSES ARE INDEPENDENT. Marketing use and AI replica are never
 *    granted together, never implied by one another, and never implied by
 *    accepting the terms of service. C6: "Separate opt-in, never covered by
 *    general ToS acceptance." A convenience that granted both at once would be
 *    the bundling the statute prohibits, so no such call exists here.
 *
 * 2. A REPLICA GRANT MUST STATE SCOPE, PURPOSE, PAY AND DURATION. The NY
 *    Fashion Workers Act names all four. A grant missing any of them is refused
 *    rather than stored, because a record that cannot say what was agreed is
 *    worse than no record — it looks like consent while proving nothing.
 *
 * 3. EVERYTHING IS APPEND-ONLY. A withdrawal is a new row. Nothing is updated,
 *    nothing is deleted. The only situation this ledger exists for is someone
 *    asking later what this person agreed to and when, and an editable history
 *    cannot answer that.
 *
 * 4. DEFAULT IS NO. Absence of a grant is a denial, not an unknown. Every read
 *    resolves to a boolean the caller can gate on without a second thought.
 *
 * 5. WITHDRAWAL IS ALWAYS AVAILABLE and takes effect immediately. A consent that
 *    cannot be withdrawn is not consent.
 *
 * Deliberately NOT here: any authority for someone other than the talent (or a
 * verified guardian) to grant. C6 is explicit that "a power of attorney cannot
 * authorise it", so there is no agency-side or admin-side grant path at all —
 * the absence is the feature.
 */

const crypto = require("crypto");

/** The two independent purposes. Never a combined value. */
const PURPOSES = Object.freeze({
  MARKETING: "marketing_use",
  AI_REPLICA: "ai_replica",
});

const EVENT = Object.freeze({ GRANTED: "granted", WITHDRAWN: "withdrawn" });

const TABLE = "talent_likeness_consents";

/**
 * The exact words shown for each purpose, versioned.
 *
 * Versioned because a dispute must be about a fixed text rather than about what
 * the page happened to say that month. Changing the wording means a new version
 * and a new hash; it never edits what someone already agreed to.
 */
const DISCLOSURE_VERSION = "2026-08-25";

const DISCLOSURES = Object.freeze({
  [PURPOSES.MARKETING]:
    "Allow Pholio to use your name and images in its own marketing — the website, social posts, success stories and investor materials. This is separate from applying to agencies, and you can withdraw it at any time.",
  [PURPOSES.AI_REPLICA]:
    "Allow the creation or use of an AI-generated or AI-enhanced likeness of you. This does not cover routine colour correction or minor retouching. It must state what it covers, what it is for, what you are paid, and how long it lasts, and you can withdraw it at any time.",
});

function disclosureHash(purpose) {
  return crypto
    .createHash("sha256")
    .update(`${DISCLOSURE_VERSION}\n${DISCLOSURES[purpose]}`, "utf8")
    .digest("hex");
}

let schemaPromise = null;

/** Deploy-before-migrate guard, cached per process. */
async function hasLikenessSchema(db) {
  if (!schemaPromise) schemaPromise = db.schema.hasTable(TABLE).catch(() => false);
  return schemaPromise;
}

/** Test seam. */
function resetLikenessSchemaCache() {
  schemaPromise = null;
}

class LikenessConsentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LikenessConsentError";
    this.code = code;
  }
}

function assertPurpose(purpose) {
  if (!Object.values(PURPOSES).includes(purpose)) {
    throw new LikenessConsentError(
      "unknown_purpose",
      `Unknown likeness purpose "${purpose}".`,
    );
  }
}

function text(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/**
 * Record a grant.
 *
 * A replica grant without scope, purpose, compensation and duration is refused.
 * The FWA names those four, and a stored record that cannot state them looks
 * like consent while proving nothing — which is the worst of both.
 *
 * @param {import('knex')} db
 * @param {object} input
 * @returns {Promise<{id: string}>}
 */
async function grantConsent(db, input) {
  const {
    profileId,
    purpose,
    scope,
    usePurpose,
    compensation,
    startsOn,
    endsOn,
    actorUserId = null,
    actorType = "talent",
    requestIp = null,
    userAgent = null,
  } = input || {};

  assertPurpose(purpose);
  if (!profileId) {
    throw new LikenessConsentError("profile_required", "A profile is required.");
  }
  if (!(await hasLikenessSchema(db))) {
    throw new LikenessConsentError(
      "unavailable",
      "Consent recording is briefly unavailable while Pholio finishes an update.",
    );
  }

  if (purpose === PURPOSES.AI_REPLICA) {
    const missing = [];
    if (!text(scope)) missing.push("scope");
    if (!text(usePurpose)) missing.push("purpose");
    if (!text(compensation)) missing.push("compensation");
    if (!text(startsOn) || !text(endsOn)) missing.push("duration");
    if (missing.length) {
      throw new LikenessConsentError(
        "replica_terms_required",
        `An AI-likeness consent must state ${missing.join(", ")}. The Fashion Workers Act requires all four, and a record that cannot state them is not consent.`,
      );
    }
  }

  const id = crypto.randomUUID();
  await db(TABLE).insert({
    id,
    profile_id: profileId,
    purpose,
    event_type: EVENT.GRANTED,
    scope: text(scope),
    use_purpose: text(usePurpose),
    compensation: text(compensation),
    starts_on: text(startsOn),
    ends_on: text(endsOn),
    disclosure_version: DISCLOSURE_VERSION,
    disclosure_hash: disclosureHash(purpose),
    actor_user_id: actorUserId,
    actor_type: actorType,
    request_ip: requestIp,
    user_agent: userAgent,
    occurred_at: db.fn.now(),
  });

  return { id };
}

/**
 * Record a withdrawal. Always available, effective immediately, and a new row
 * rather than an edit — a consent that cannot be withdrawn is not consent.
 *
 * @param {import('knex')} db
 * @param {object} input
 */
async function withdrawConsent(db, input) {
  const {
    profileId,
    purpose,
    actorUserId = null,
    actorType = "talent",
    requestIp = null,
    userAgent = null,
  } = input || {};

  assertPurpose(purpose);
  if (!(await hasLikenessSchema(db))) {
    throw new LikenessConsentError(
      "unavailable",
      "Consent recording is briefly unavailable while Pholio finishes an update.",
    );
  }

  const current = await db(TABLE)
    .where({ profile_id: profileId, purpose })
    .orderBy("sequence", "desc")
    .first("id");

  const id = crypto.randomUUID();
  await db(TABLE).insert({
    id,
    profile_id: profileId,
    purpose,
    event_type: EVENT.WITHDRAWN,
    disclosure_version: DISCLOSURE_VERSION,
    disclosure_hash: disclosureHash(purpose),
    actor_user_id: actorUserId,
    actor_type: actorType,
    request_ip: requestIp,
    user_agent: userAgent,
    supersedes_id: current?.id || null,
    occurred_at: db.fn.now(),
  });

  return { id };
}

/**
 * Is this use permitted right now?
 *
 * Absence is a denial, never an unknown — including when the table does not
 * exist yet. A caller gating a marketing post on this must get `false` from a
 * database that has not been migrated, not an exception it might catch and
 * treat as permission.
 *
 * An expired duration is also a denial: a replica grant that ran to a date now
 * past has ended, and continuing to rely on it is exactly the harm the FWA's
 * duration requirement exists to prevent.
 *
 * @param {import('knex')} db
 * @param {string} profileId
 * @param {string} purpose
 * @param {Date} [now]
 * @returns {Promise<boolean>}
 */
async function isConsented(db, profileId, purpose, now = new Date()) {
  assertPurpose(purpose);
  if (!profileId) return false;
  if (!(await hasLikenessSchema(db))) return false;

  const latest = await db(TABLE)
    .where({ profile_id: profileId, purpose })
    // Insertion order, not wall clock: two events in the same
    // millisecond must still resolve in the order they happened.
    .orderBy("sequence", "desc")
    .first();

  if (!latest || latest.event_type !== EVENT.GRANTED) return false;

  if (latest.ends_on) {
    const ends = new Date(`${String(latest.ends_on).slice(0, 10)}T23:59:59.999Z`);
    if (Number.isFinite(ends.getTime()) && ends < now) return false;
  }
  if (latest.starts_on) {
    const starts = new Date(`${String(latest.starts_on).slice(0, 10)}T00:00:00.000Z`);
    if (Number.isFinite(starts.getTime()) && starts > now) return false;
  }
  return true;
}

/**
 * The full ledger for a profile, newest first — the talent's own record of what
 * they agreed to. Theirs to read, which is half of why it is kept.
 *
 * @param {import('knex')} db
 * @param {string} profileId
 */
async function consentHistory(db, profileId) {
  if (!(await hasLikenessSchema(db))) return [];
  return db(TABLE)
    .where({ profile_id: profileId })
    .orderBy("sequence", "desc")
    .select(
      "id",
      "purpose",
      "event_type",
      "scope",
      "use_purpose",
      "compensation",
      "starts_on",
      "ends_on",
      "disclosure_version",
      "actor_type",
      "occurred_at",
    );
}

/**
 * Current state of both purposes, for a settings screen.
 *
 * @param {import('knex')} db
 * @param {string} profileId
 */
async function consentState(db, profileId) {
  const [marketing, replica] = await Promise.all([
    isConsented(db, profileId, PURPOSES.MARKETING),
    isConsented(db, profileId, PURPOSES.AI_REPLICA),
  ]);
  return {
    [PURPOSES.MARKETING]: marketing,
    [PURPOSES.AI_REPLICA]: replica,
    disclosureVersion: DISCLOSURE_VERSION,
    disclosures: DISCLOSURES,
  };
}

module.exports = {
  DISCLOSURES,
  DISCLOSURE_VERSION,
  EVENT,
  LikenessConsentError,
  PURPOSES,
  TABLE,
  consentHistory,
  consentState,
  disclosureHash,
  grantConsent,
  hasLikenessSchema,
  isConsented,
  resetLikenessSchemaCache,
  withdrawConsent,
};
