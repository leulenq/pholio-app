"use strict";

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { utcMonthWindow } = require("./application-quota");

// How long a claim stays redeemable after the talent (re)arrives.
const CLAIM_TTL_DAYS = 14;
// Ceiling on quota-exempt submissions per profile per UTC month. Bounds the
// "harvest every agency's public link" strategy; genuine arrivals from one or
// two agencies are untouched.
const OPEN_CALL_EXEMPT_MONTHLY_CAP = 3;

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
 * Mint (or refresh) the one active claim for (agency, profile). A consumed
 * claim blocks re-minting — one exemption per agency per profile, ever.
 * Returns { claim, minted } where claim is null when blocked.
 */
async function mintClaim(db, { linkId, arrivalId, agencyId, profileId }) {
  let result = { claim: null, minted: false };
  await db.transaction(async (trx) => {
    const existing = await trx("agency_open_call_claims")
      .where({ agency_id: agencyId, profile_id: profileId })
      .whereIn("status", [CLAIM_STATUSES.ACTIVE, CLAIM_STATUSES.CONSUMED])
      .first();

    if (existing && existing.status === CLAIM_STATUSES.CONSUMED) {
      result = { claim: null, minted: false };
      return;
    }

    if (existing) {
      // Re-arrival refreshes the window and re-attributes to the latest link.
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
      });
    } catch (error) {
      // Raced with a concurrent mint for the same (agency, profile).
      if (error.code === "SQLITE_CONSTRAINT" || error.code === "23505") {
        result = {
          claim: await trx("agency_open_call_claims")
            .where({ agency_id: agencyId, profile_id: profileId })
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
 * Resolve the active, unexpired claim for (profile, agency) inside the submit
 * transaction. Uses a row lock on PG so concurrent submissions serialize.
 */
async function resolveActiveClaim(trx, profileId, agencyId) {
  let query = trx("agency_open_call_claims")
    .where({
      profile_id: profileId,
      agency_id: agencyId,
      status: CLAIM_STATUSES.ACTIVE,
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

/** Quota-exempt submissions completed in the current UTC month. */
async function countExemptThisMonth(db, profileId, referenceDate = new Date()) {
  const { periodStart, periodEnd } = utcMonthWindow(referenceDate);
  let query = db("application_submission_requests")
    .where({ profile_id: profileId, status: "completed", quota_exempt: true })
    .whereNotNull("completed_at");
  if (db.client.config.client === "sqlite3") {
    query = query
      .whereRaw("datetime(completed_at) >= datetime(?)", [
        periodStart.toISOString(),
      ])
      .whereRaw("datetime(completed_at) < datetime(?)", [
        periodEnd.toISOString(),
      ]);
  } else {
    query = query
      .where("completed_at", ">=", periodStart)
      .where("completed_at", "<", periodEnd);
  }
  const row = await query.count({ count: "*" }).first();
  return Number(row?.count || 0);
}

module.exports = {
  CLAIM_TTL_DAYS,
  OPEN_CALL_EXEMPT_MONTHLY_CAP,
  CLAIM_STATUSES,
  LINK_STATUSES,
  hasOpenCallSchema,
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
  countExemptThisMonth,
};
