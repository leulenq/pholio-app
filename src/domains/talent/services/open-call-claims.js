"use strict";

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const {
  CALL_PURPOSES,
  isEventCastingCallKind,
} = require("../../../shared/constants/event-casting");

// How long a claim stays redeemable after the talent (re)arrives.
const CLAIM_TTL_DAYS = 14;
// There is no monthly ceiling on open-call submissions. The open-call path is
// free and unlimited, always — it is the product's core distribution promise,
// and an agency that puts a Pholio link on its own channels must be reachable
// through it. Abuse is already bounded structurally: a claim requires an
// arrival on that agency's own live link, and only one claim per key can ever
// be consumed — where the key is (agency, profile) for a representation call
// and (link, profile) for an event call.
//
// The split is the fix for `docs/open-call-applicant-flow-design-2026-08.md`
// §1 C4 and mirrors the application uniqueness `20260815091000` already
// enforces: an organizer running Brooklyn and Queens editions runs two calls,
// and a model exempt for one must not be taxed for the other. Enforced in the
// schema by `20260819100000` as two partial uniques.

const CLAIM_STATUSES = {
  ACTIVE: "active",
  CONSUMED: "consumed",
  EXPIRED: "expired",
  REVOKED: "revoked",
};

const LINK_STATUSES = {
  ACTIVE: "active",
  PAUSED: "paused",
  REVOKED: "revoked",
};

// Deploy-before-migrate guard: the whole open-call surface no-ops until the
// claims schema exists. Checked once per process.
let openCallSchemaPromise = null;
function hasOpenCallSchema(db) {
  if (!openCallSchemaPromise) {
    openCallSchemaPromise = Promise.all([
      db.schema.hasTable("agency_open_call_claims"),
      db.schema.hasColumn("application_submission_requests", "quota_exempt"),
    ])
      .then((checks) => checks.every(Boolean))
      .catch(() => {
        openCallSchemaPromise = null;
        return false;
      });
  }
  return openCallSchemaPromise;
}

// The brief shipped after the links did. Selecting its columns unconditionally
// would break the arrival page on a database that has the open-call schema but
// not yet the brief migration, so the projection adapts. Checked once per
// process, like `hasOpenCallSchema` above.
const BRIEF_COLUMNS = [
  "l.brief_who",
  "l.brief_what",
  "l.brief_eligibility",
  "l.brief_next_steps",
  "l.brief_deadline",
  "l.brief_ongoing",
  "l.brief_completed_at",
];
let briefColumnsPromise = null;
function hasBriefColumns(db) {
  if (!briefColumnsPromise) {
    briefColumnsPromise = db.schema
      .hasColumn("agency_open_call_links", "brief_completed_at")
      .catch(() => {
        briefColumnsPromise = null;
        return false;
      });
  }
  return briefColumnsPromise;
}

// Deploy-before-migrate guard for the per-purpose claim key: until
// `agency_open_call_claims.call_purpose` exists, every claim is keyed
// (agency, profile) exactly as before, so a deploy that lands ahead of
// `20260819100000` mints claims instead of 500ing. Checked once per process,
// like `hasOpenCallSchema` above.
let claimPurposePromise = null;
function hasClaimPurposeColumn(db) {
  if (!claimPurposePromise) {
    claimPurposePromise = db.schema
      .hasColumn("agency_open_call_claims", "call_purpose")
      .catch(() => {
        claimPurposePromise = null;
        return false;
      });
  }
  return claimPurposePromise;
}

// `call_kind` ships in `20260815092000`, later than the links table itself.
let linkCallKindPromise = null;
function hasLinkCallKindColumn(db) {
  if (!linkCallKindPromise) {
    linkCallKindPromise = db.schema
      .hasColumn("agency_open_call_links", "call_kind")
      .catch(() => {
        linkCallKindPromise = null;
        return false;
      });
  }
  return linkCallKindPromise;
}

/**
 * The purpose of the claim a link mints. The link decides — never the client,
 * and never the caller: `mintClaim` resolves this from the row it is already
 * pointing at rather than trusting a passed-in kind.
 */
async function resolveCallPurpose(db, linkId) {
  if (!linkId) return CALL_PURPOSES.REPRESENTATION;
  if (!(await hasLinkCallKindColumn(db))) return CALL_PURPOSES.REPRESENTATION;
  const link = await db("agency_open_call_links")
    .where({ id: linkId })
    .first("call_kind");
  return isEventCastingCallKind(link?.call_kind)
    ? CALL_PURPOSES.EVENT_CASTING
    : CALL_PURPOSES.REPRESENTATION;
}

/**
 * The columns that identify "the one claim" for a call, matching the partial
 * unique the schema enforces: per agency for representation, per link (i.e.
 * per edition) for an event cast.
 */
function claimKey({ purposeAware, callPurpose, linkId, agencyId, profileId }) {
  if (!purposeAware) return { agency_id: agencyId, profile_id: profileId };
  if (callPurpose === CALL_PURPOSES.EVENT_CASTING) {
    return {
      link_id: linkId,
      profile_id: profileId,
      call_purpose: CALL_PURPOSES.EVENT_CASTING,
    };
  }
  return {
    agency_id: agencyId,
    profile_id: profileId,
    call_purpose: CALL_PURPOSES.REPRESENTATION,
  };
}

function claimExpiryTimestamp(from = new Date()) {
  return new Date(
    from.getTime() + CLAIM_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

/** Unguessable url-safe link code. Never derived from agency identity. */
function generateOpenCallCode() {
  return crypto.randomBytes(12).toString("base64url");
}

/** Hash an IP for arrival telemetry — raw IPs are never stored. */
function hashArrivalIp(ip) {
  if (!ip) return null;
  const salt = process.env.OPEN_CALL_IP_SALT || process.env.SESSION_SECRET || "";
  return crypto
    .createHmac("sha256", salt)
    .update(String(ip))
    .digest("hex");
}

/**
 * Load an active link by code together with its agency, or null. Only ACTIVE
 * agencies can receive open call traffic.
 */
async function findActiveLinkByCode(db, code) {
  const normalized = String(code || "").trim();
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(normalized)) return null;
  const link = await db("agency_open_call_links as l")
    .join("agencies as a", "a.id", "l.agency_id")
    .where("l.code", normalized)
    .where("l.status", LINK_STATUSES.ACTIVE)
    .whereRaw("UPPER(a.status) = ?", ["ACTIVE"])
    .select(
      "l.id",
      "l.agency_id",
      "l.code",
      "l.label",
      "a.name as agency_name",
      "a.location as agency_location",
      "a.logo_path as agency_logo",
      "a.website as agency_website",
      "a.open_boards as agency_open_boards",
      ...((await hasBriefColumns(db)) ? BRIEF_COLUMNS : []),
    )
    .first();
  return link || null;
}

/** Append-only arrival record; returns the arrival id. */
async function recordArrival(db, { linkId, agencyId, ip, userAgent }) {
  const id = uuidv4();
  await db("agency_open_call_arrivals").insert({
    id,
    link_id: linkId,
    agency_id: agencyId,
    ip_hash: hashArrivalIp(ip),
    user_agent: userAgent ? String(userAgent).slice(0, 512) : null,
    arrived_at: db.fn.now(),
  });
  return id;
}

/**
 * Mint (or refresh) the one active claim for this call.
 *
 * The key is the call's own: (agency, profile) for a representation call,
 * (link, profile) for an event cast. A consumed claim blocks re-minting for
 * that key and only that key — one exemption per agency per profile for
 * representation, one per edition for an event. A spent Brooklyn claim must
 * therefore not stand in the way of a Queens mint.
 *
 * Returns { claim, minted } where claim is null when blocked.
 */
async function mintClaim(db, { linkId, arrivalId, agencyId, profileId }) {
  const purposeAware = await hasClaimPurposeColumn(db);
  const callPurpose = purposeAware
    ? await resolveCallPurpose(db, linkId)
    : CALL_PURPOSES.REPRESENTATION;
  const key = claimKey({
    purposeAware,
    callPurpose,
    linkId,
    agencyId,
    profileId,
  });

  let result = { claim: null, minted: false };
  await db.transaction(async (trx) => {
    const existing = await trx("agency_open_call_claims")
      .where(key)
      .whereIn("status", [CLAIM_STATUSES.ACTIVE, CLAIM_STATUSES.CONSUMED])
      .first();

    if (existing && existing.status === CLAIM_STATUSES.CONSUMED) {
      result = { claim: null, minted: false };
      return;
    }

    if (existing) {
      // Re-arrival refreshes the window and re-attributes to the latest link.
      // For an event claim the link is already the key, so this is a no-op on
      // `link_id` and a refresh of the expiry — an applicant returning to the
      // Queens call cannot move her Queens claim onto Brooklyn.
      await trx("agency_open_call_claims").where({ id: existing.id }).update({
        link_id: linkId,
        arrival_id: arrivalId || existing.arrival_id,
        expires_at: claimExpiryTimestamp(),
        updated_at: trx.fn.now(),
      });
      result = {
        claim: await trx("agency_open_call_claims")
          .where({ id: existing.id })
          .first(),
        minted: false,
      };
      return;
    }

    const id = uuidv4();
    try {
      await trx("agency_open_call_claims").insert({
        id,
        link_id: linkId,
        arrival_id: arrivalId || null,
        agency_id: agencyId,
        profile_id: profileId,
        status: CLAIM_STATUSES.ACTIVE,
        expires_at: claimExpiryTimestamp(),
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
        ...(purposeAware ? { call_purpose: callPurpose } : {}),
      });
    } catch (error) {
      // Raced with a concurrent mint for the same key.
      if (error.code === "SQLITE_CONSTRAINT" || error.code === "23505") {
        result = {
          claim: await trx("agency_open_call_claims")
            .where(key)
            .whereIn("status", [CLAIM_STATUSES.ACTIVE, CLAIM_STATUSES.CONSUMED])
            .first(),
          minted: false,
        };
        return;
      }
      throw error;
    }
    if (arrivalId) {
      await trx("agency_open_call_arrivals")
        .where({ id: arrivalId })
        .update({ claimed_by_profile_id: profileId });
    }
    result = {
      claim: await trx("agency_open_call_claims").where({ id }).first(),
      minted: true,
    };
  });
  if (result.claim && result.claim.status !== CLAIM_STATUSES.ACTIVE) {
    return { claim: null, minted: false };
  }
  return result;
}

/**
 * Convert a pending open-call session context into a claim once the visitor
 * is an authenticated talent with a profile. Safe to call on any request:
 * no-ops without context. Clears the context once handled.
 */
async function ensureClaimFromSession(db, req, profileId) {
  const context = req.session?.openCallContext;
  if (!context || !profileId) return null;
  if (context.exp && Date.parse(context.exp) < Date.now()) {
    delete req.session.openCallContext;
    return null;
  }
  // Re-validate the link at mint time: pausing or revoking a link must stop
  // converting stored arrivals into entitlements.
  const link = await db("agency_open_call_links")
    .where({ id: context.linkId, status: LINK_STATUSES.ACTIVE })
    .first();
  if (!link) {
    delete req.session.openCallContext;
    return null;
  }
  const { claim } = await mintClaim(db, {
    linkId: link.id,
    arrivalId: context.arrivalId || null,
    agencyId: link.agency_id,
    profileId,
  });
  delete req.session.openCallContext;
  return claim;
}

/** Mark overdue active claims expired. Mirrors expireInactiveDrafts. */
async function expireStaleClaims(db) {
  const nowIso = new Date().toISOString();
  let query = db("agency_open_call_claims").where(
    "status",
    CLAIM_STATUSES.ACTIVE,
  );
  if (db.client.config.client === "sqlite3") {
    query = query.whereRaw("datetime(expires_at) < datetime(?)", [nowIso]);
  } else {
    query = query.where("expires_at", "<", nowIso);
  }
  await query.update({
    status: CLAIM_STATUSES.EXPIRED,
    updated_at: db.fn.now(),
  });
}

/**
 * The talent's live claims, with agency identity for UI surfaces.
 */
async function listActiveClaims(db, profileId) {
  await expireStaleClaims(db);
  return db("agency_open_call_claims as c")
    .join("agencies as a", "a.id", "c.agency_id")
    .where("c.profile_id", profileId)
    .where("c.status", CLAIM_STATUSES.ACTIVE)
    .whereRaw("UPPER(a.status) = ?", ["ACTIVE"])
    .orderBy("c.expires_at", "asc")
    .select(
      "c.id",
      "c.agency_id",
      "c.expires_at",
      "a.name as agency_name",
      "a.location as agency_location",
      "a.logo_path as agency_logo",
    );
}

/**
 * Resolve the active, unexpired claim this submission may spend, inside the
 * submit transaction. Uses a row lock on PG so concurrent submissions
 * serialize.
 *
 * An event submission resolves by the link it came through: one organizer can
 * hold several live claims for one profile (Brooklyn and Queens both open), and
 * the agency-keyed lookup would hand the Queens submission whichever row came
 * back first. `linkId` is server-resolved from the claim behind the submission
 * — never client-supplied. Representation keeps the agency-keyed lookup, which
 * is still its uniqueness rule.
 */
async function resolveActiveClaim(trx, profileId, agencyId, options = {}) {
  const byLink =
    options.callPurpose === CALL_PURPOSES.EVENT_CASTING && options.linkId;
  let query = trx("agency_open_call_claims")
    .where({
      profile_id: profileId,
      agency_id: agencyId,
      status: CLAIM_STATUSES.ACTIVE,
      ...(byLink ? { link_id: options.linkId } : {}),
    })
    .select("*");
  if (trx.client.config.client === "pg") {
    query = query.forUpdate();
  }
  const claim = await query.first();
  if (!claim) return null;
  if (claim.expires_at && Date.parse(claim.expires_at) < Date.now()) {
    return null;
  }
  return claim;
}

/**
 * Spend the claim. Conditional update — throws if another transaction got
 * there first, which the caller treats like any other submit-time conflict.
 */
async function consumeClaim(trx, claimId, applicationId) {
  const updated = await trx("agency_open_call_claims")
    .where({ id: claimId, status: CLAIM_STATUSES.ACTIVE })
    .update({
      status: CLAIM_STATUSES.CONSUMED,
      consumed_at: trx.fn.now(),
      consumed_application_id: applicationId,
      updated_at: trx.fn.now(),
    });
  if (updated !== 1) {
    const error = new Error("Open call claim no longer active");
    error.code = "OPEN_CALL_CLAIM_CONFLICT";
    throw error;
  }
}

module.exports = {
  CLAIM_TTL_DAYS,
  CLAIM_STATUSES,
  LINK_STATUSES,
  hasBriefColumns,
  hasClaimPurposeColumn,
  hasOpenCallSchema,
  resolveCallPurpose,
  claimExpiryTimestamp,
  generateOpenCallCode,
  hashArrivalIp,
  findActiveLinkByCode,
  recordArrival,
  mintClaim,
  ensureClaimFromSession,
  expireStaleClaims,
  listActiveClaims,
  resolveActiveClaim,
  consumeClaim,
};
