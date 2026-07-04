/**
 * Guardian consent verification service (legal audit Phase 1).
 *
 * Implements a real, token-verified guardian consent flow that replaces the
 * previous self-attested toggle for minor profiles.
 *
 * Security model:
 *  - A cryptographically random raw token is generated and embedded in the
 *    guardian email link. Only its sha256 hash is persisted (`token_hash`), so a
 *    database leak cannot be replayed to forge consent.
 *  - Requests expire after CONSENT_TOKEN_TTL_MS and are single-use.
 *  - Creating a new request revokes prior pending requests for the same scope.
 *    Account consent and each named-agency authorization remain independent.
 */

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const emailLib = require("../../../shared/lib/email");
const { getEmailAppBaseUrl } = require("../../../shared/lib/pholio-email");
const {
  parseDateOfBirthParts,
  hasRecordedDateOfBirth,
} = require("../../../shared/lib/talent-age");

const CONSENT_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const CONSENT_TOKEN_TTL_DAYS = 7;

// Quota guard: a single profile may only mint a bounded number of guardian
// consent requests within a rolling window. This contains abuse where a talent
// could otherwise spam a guardian's inbox (or harvest delivery oracles) by
// hammering the request endpoint. Scoped per-profile across all statuses so a
// burst of create/revoke churn still counts against the cap.
const CONSENT_REQUEST_WINDOW_MS = 1000 * 60 * 60; // 1 hour
const CONSENT_REQUEST_MAX_PER_WINDOW = 5;

/** sha256 hex digest of the raw token. */
function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

function generateRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

function buildConsentUrl(rawToken) {
  const base = getEmailAppBaseUrl();
  return `${base}/guardian-consent?token=${encodeURIComponent(rawToken)}`;
}

/**
 * Load the primary profile photo URL for use in guardian consent emails.
 * @param {import('knex')} knex
 * @param {string} profileId
 * @returns {Promise<string|null>}
 */
async function loadProfilePrimaryPhotoUrl(knex, profileId) {
  const image = await knex("images")
    .where({ profile_id: profileId })
    .orderBy("is_primary", "desc")
    .orderBy("sort", "asc")
    .orderBy("created_at", "asc")
    .select("public_url", "path")
    .first();
  if (!image) return null;
  return image.public_url || image.path || null;
}

class GuardianConsentEmailError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = "GuardianConsentEmailError";
    this.code = "EMAIL_DELIVERY_FAILED";
    if (cause) this.cause = cause;
  }
}

class GuardianConsentRateLimitError extends Error {
  constructor(message, { retryAfterMs } = {}) {
    super(message);
    this.name = "GuardianConsentRateLimitError";
    this.code = "RATE_LIMITED";
    if (retryAfterMs != null) this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Persist a date of birth on the profile when the talent has entered it in the
 * form but has not saved the full profile yet.
 *
 * @param {import('knex')} knex
 * @param {object} profile
 * @param {string|null|undefined} dateOfBirth
 * @returns {Promise<object>} Updated profile row
 */
async function persistProfileDateOfBirthIfNeeded(knex, profile, dateOfBirth) {
  if (hasRecordedDateOfBirth(profile)) return profile;

  const parts = parseDateOfBirthParts(dateOfBirth);
  if (!parts) {
    throw Object.assign(new Error("A valid date of birth is required."), {
      code: "DOB_REQUIRED",
    });
  }

  const normalized = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  await knex("profiles")
    .where({ id: profile.id })
    .update({ date_of_birth: normalized, updated_at: knex.fn.now() });

  return { ...profile, date_of_birth: normalized };
}

/**
 * Create a guardian consent request for a (minor) profile and email the guardian
 * a one-time verification link. Revokes any prior pending requests so only the
 * newest link is valid. Persists the guardian email on the profile for display.
 *
 * @param {import('knex')} knex
 * @param {string} profileId
 * @param {{ guardianEmail: string, guardianName?: string|null, talentName?: string|null, talentPhotoUrl?: string|null, talentCity?: string|null, agencyId?: string|null, agencyName?: string|null }} params
 * @returns {Promise<{ id: string, rawToken: string, expiresAt: string }>}
 */
async function createConsentRequest(
  knex,
  profileId,
  {
    guardianEmail,
    guardianName = null,
    talentName = null,
    talentPhotoUrl = null,
    talentCity = null,
    agencyId = null,
    agencyName = null,
  } = {},
) {
  const normalizedEmail = String(guardianEmail || "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("guardianEmail is required");
  }

  // Quota guard (audit P0-4): cap how many requests a profile can mint per
  // window so the guardian email cannot be weaponised as spam, nor used as a
  // delivery oracle. Uses the existing created_at column — no schema change.
  const windowStart = new Date(
    Date.now() - CONSENT_REQUEST_WINDOW_MS,
  ).toISOString();
  const recent = await knex("guardian_consent_requests")
    .where({ profile_id: profileId })
    .andWhere("created_at", ">=", windowStart)
    .count({ c: "*" })
    .first();
  if (Number(recent?.c || 0) >= CONSENT_REQUEST_MAX_PER_WINDOW) {
    throw new GuardianConsentRateLimitError(
      "Too many guardian consent requests were sent recently. Please wait a little while before sending another.",
      { retryAfterMs: CONSENT_REQUEST_WINDOW_MS },
    );
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONSENT_TOKEN_TTL_MS);
  const id = uuidv4();

  await knex.transaction(async (trx) => {
    // Invalidate only pending requests for this exact consent scope.
    const pendingScope = trx("guardian_consent_requests").where({
      profile_id: profileId,
      status: "pending",
    });
    if (agencyId) pendingScope.where({ agency_id: agencyId });
    else pendingScope.whereNull("agency_id");
    await pendingScope.update({ status: "revoked" });

    await trx("guardian_consent_requests").insert({
      id,
      profile_id: profileId,
      agency_id: agencyId || null,
      guardian_email: normalizedEmail,
      guardian_name: guardianName ? String(guardianName).trim() : null,
      token_hash: tokenHash,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      created_at: now.toISOString(),
    });

    await trx("profiles")
      .where({ id: profileId })
      .update({ guardian_email: normalizedEmail, updated_at: trx.fn.now() });
  });

  const consentUrl = buildConsentUrl(rawToken);
  try {
    await emailLib.sendGuardianConsentEmail({
      to: normalizedEmail,
      guardianName,
      talentName,
      talentPhotoUrl,
      talentCity,
      agencyName,
      consentUrl,
      expiresDays: CONSENT_TOKEN_TTL_DAYS,
    });
  } catch (err) {
    console.error("[GuardianConsent] Failed to send consent email:", err.message);
    await knex("guardian_consent_requests")
      .where({ id })
      .update({ status: "revoked" });
    throw new GuardianConsentEmailError(
      "We could not deliver the verification email. Check the guardian address and try again.",
      { cause: err },
    );
  }

  return { id, rawToken, expiresAt: expiresAt.toISOString() };
}

/**
 * Inspect a raw guardian consent token WITHOUT mutating anything (audit P0-4).
 *
 * This is the read-only half of the consent flow. It is the ONLY function that a
 * safe/idempotent GET (RFC 9110 §9.2.1) — i.e. the link mailed to the guardian,
 * which mail scanners, link-preview bots and browser prefetch can fetch — is
 * permitted to call. It performs zero writes: the token is neither consumed nor
 * does its status change, and even an expired token is reported lazily rather
 * than being marked `expired` here (that transition happens on confirm).
 *
 * @param {import('knex')} knex
 * @param {string} rawToken
 * @returns {Promise<{ ok: boolean, reason: string, request?: object }>}
 */
async function inspectConsentToken(knex, rawToken) {
  const token = String(rawToken || "").trim();
  if (!token) {
    return { ok: false, reason: "invalid" };
  }

  const tokenHash = hashToken(token);
  const request = await knex("guardian_consent_requests")
    .where({ token_hash: tokenHash })
    .first();

  if (!request) {
    return { ok: false, reason: "invalid" };
  }

  if (request.status === "verified") {
    // Already consented — a re-click of an already-confirmed link is a success.
    return { ok: true, reason: "already_verified", request };
  }

  if (request.status !== "pending") {
    return { ok: false, reason: request.status, request }; // revoked / expired
  }

  const expiresAt = new Date(request.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    // Lazy expiry: do NOT write here. confirmConsentToken persists `expired`.
    return { ok: false, reason: "expired", request };
  }

  return { ok: true, reason: "pending", request };
}

/**
 * Confirm a raw guardian consent token via an affirmative action (audit P0-4).
 *
 * This is the mutating half of the flow and the ONLY path that may write
 * consent. It must be reached by an explicit POST (the guardian submitting the
 * disclosure form), never a GET. The pending → verified transition is claimed
 * atomically inside a single transaction with a conditional update, so a
 * duplicate or concurrent POST cannot double-grant: only the transaction that
 * actually flips the row records the underlying account/agency consent; the
 * loser resolves to an idempotent `already_verified`.
 *
 * NOTE(schema-wave): the available columns (token_hash, status, verified_at)
 * let us record WHEN and via WHICH token consent was confirmed, but there is no
 * place to store richer verifiable-consent evidence (consent_version, the fact
 * that an affirmative POST occurred, guardian IP / user-agent, scope text shown).
 * Add consent_version + evidence columns in the schema wave and persist them here.
 *
 * @param {import('knex')} knex
 * @param {string} rawToken
 * @returns {Promise<{ ok: boolean, reason?: string, profileId?: string, agencyId?: string|null }>}
 */
async function confirmConsentToken(knex, rawToken) {
  const token = String(rawToken || "").trim();
  if (!token) {
    return { ok: false, reason: "invalid" };
  }

  const tokenHash = hashToken(token);
  const request = await knex("guardian_consent_requests")
    .where({ token_hash: tokenHash })
    .first();

  if (!request) {
    return { ok: false, reason: "invalid" };
  }

  if (request.status === "verified") {
    // Idempotent: the guardian re-submitting an already-confirmed link succeeds.
    return {
      ok: true,
      reason: "already_verified",
      profileId: request.profile_id,
      agencyId: request.agency_id || null,
    };
  }

  if (request.status !== "pending") {
    return { ok: false, reason: request.status }; // revoked
  }

  const expiresAt = new Date(request.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    await knex("guardian_consent_requests")
      .where({ id: request.id })
      .update({ status: "expired" });
    return { ok: false, reason: "expired" };
  }

  const verifiedAt = new Date().toISOString();
  let granted = false;

  await knex.transaction(async (trx) => {
    // Atomic claim: only the writer that flips pending → verified continues.
    // A concurrent/duplicate POST that lost the race updates 0 rows and bails,
    // so consent is never granted twice. The scope written is exactly the scope
    // the request was issued for — a named-agency link can never grant
    // account-level consent, and an account link can never grant agency access.
    const claimed = await trx("guardian_consent_requests")
      .where({ id: request.id, status: "pending" })
      .update({ status: "verified", verified_at: verifiedAt });
    if (!claimed) {
      return; // lost the race — another POST already consumed the token
    }
    granted = true;

    if (request.agency_id) {
      // Named-agency authorization ONLY. Distinct grant per agency.
      const existing = await trx("minor_agency_consents")
        .where({
          profile_id: request.profile_id,
          agency_id: request.agency_id,
        })
        .first("id");
      if (existing) {
        await trx("minor_agency_consents")
          .where({ id: existing.id })
          .update({
            consent_request_id: request.id,
            guardian_email: request.guardian_email,
            verified_at: verifiedAt,
            revoked_at: null,
            updated_at: trx.fn.now(),
          });
      } else {
        await trx("minor_agency_consents").insert({
          id: uuidv4(),
          profile_id: request.profile_id,
          agency_id: request.agency_id,
          consent_request_id: request.id,
          guardian_email: request.guardian_email,
          verified_at: verifiedAt,
          created_at: verifiedAt,
          updated_at: verifiedAt,
        });
      }
    } else {
      // Account-level authorization ONLY (no agency_id on the request).
      // NOTE(schema-wave): guardian_consent_at currently collapses three
      // logically separate scopes — account-management, public-publication and
      // AI-processing — into one flag. The schema cannot yet represent them
      // independently. A future migration should split these into discrete
      // consent grants; until then this path grants exactly the account scope
      // the link was issued for and never widens it.
      await trx("profiles")
        .where({ id: request.profile_id })
        .update({ guardian_consent_at: verifiedAt, updated_at: trx.fn.now() });
    }
  });

  if (!granted) {
    // Concurrent POST already verified the request — idempotent success.
    return {
      ok: true,
      reason: "already_verified",
      profileId: request.profile_id,
      agencyId: request.agency_id || null,
    };
  }

  return {
    ok: true,
    profileId: request.profile_id,
    agencyId: request.agency_id || null,
  };
}

/**
 * @deprecated Mutating verification by name (audit P0-4). Retained only as a
 * backward-compatible alias for confirmConsentToken; new code must use the
 * inspectConsentToken (GET) + confirmConsentToken (POST) split so that a safe
 * GET can never grant consent. Do NOT call this from a GET handler.
 */
async function verifyConsentToken(knex, rawToken) {
  return confirmConsentToken(knex, rawToken);
}

async function getAgencyConsentGrant(knex, profileId, agencyId) {
  if (!profileId || !agencyId) return false;
  return knex("minor_agency_consents as consent")
    .innerJoin(
      "guardian_consent_requests as request",
      "request.id",
      "consent.consent_request_id",
    )
    .where({
      "consent.profile_id": profileId,
      "consent.agency_id": agencyId,
      "request.profile_id": profileId,
      "request.agency_id": agencyId,
      "request.status": "verified",
    })
    .whereNull("consent.revoked_at")
    .first(
      "consent.id",
      "consent.consent_request_id",
      "consent.guardian_email",
      "consent.verified_at",
    );
}

async function hasAgencyConsent(knex, profileId, agencyId) {
  return Boolean(await getAgencyConsentGrant(knex, profileId, agencyId));
}

async function getAgencyConsentStatus(knex, profile, agencyId) {
  if (!profile?.id || !agencyId) {
    return {
      status: "none",
      guardianEmail: profile?.guardian_email || null,
      expiresAt: null,
    };
  }

  if (await hasAgencyConsent(knex, profile.id, agencyId)) {
    const verified = await knex("minor_agency_consents")
      .where({ profile_id: profile.id, agency_id: agencyId })
      .whereNull("revoked_at")
      .first("guardian_email", "verified_at");
    return {
      status: "verified",
      guardianEmail: verified?.guardian_email || profile.guardian_email || null,
      expiresAt: null,
      verifiedAt: verified?.verified_at || null,
    };
  }

  const pending = await knex("guardian_consent_requests")
    .where({
      profile_id: profile.id,
      agency_id: agencyId,
      status: "pending",
    })
    .orderBy("created_at", "desc")
    .first();
  if (pending && new Date(pending.expires_at).getTime() >= Date.now()) {
    return {
      status: "pending",
      guardianEmail: pending.guardian_email || profile.guardian_email || null,
      expiresAt: pending.expires_at,
    };
  }

  return {
    status: "none",
    guardianEmail: profile.guardian_email || null,
    expiresAt: null,
  };
}

/**
 * Derive the consent status for display in the talent app.
 * Returns 'verified' when consent is on file, 'pending' when a non-expired
 * request is outstanding, otherwise 'none'.
 *
 * @param {import('knex')} knex
 * @param {object} profile - profile row (must include id and guardian_consent_at)
 * @returns {Promise<{ status: 'verified'|'pending'|'none', guardianEmail: string|null, expiresAt: string|null }>}
 */
async function getConsentStatus(knex, profile) {
  if (!profile || !profile.id) {
    return { status: "none", guardianEmail: null, expiresAt: null };
  }

  if (profile.guardian_consent_at) {
    return {
      status: "verified",
      guardianEmail: profile.guardian_email || null,
      expiresAt: null,
    };
  }

  const pending = await knex("guardian_consent_requests")
    .where({ profile_id: profile.id, status: "pending" })
    .orderBy("created_at", "desc")
    .first();

  if (pending && new Date(pending.expires_at).getTime() >= Date.now()) {
    return {
      status: "pending",
      guardianEmail: pending.guardian_email || profile.guardian_email || null,
      expiresAt: pending.expires_at,
    };
  }

  return {
    status: "none",
    guardianEmail: profile.guardian_email || null,
    expiresAt: null,
  };
}

module.exports = {
  CONSENT_TOKEN_TTL_MS,
  CONSENT_TOKEN_TTL_DAYS,
  hashToken,
  createConsentRequest,
  inspectConsentToken,
  confirmConsentToken,
  verifyConsentToken,
  getConsentStatus,
  buildConsentUrl,
  persistProfileDateOfBirthIfNeeded,
  loadProfilePrimaryPhotoUrl,
  GuardianConsentEmailError,
  GuardianConsentRateLimitError,
  getAgencyConsentGrant,
  hasAgencyConsent,
  getAgencyConsentStatus,
};
