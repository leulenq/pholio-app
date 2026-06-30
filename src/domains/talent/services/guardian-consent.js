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
 * Verify a raw guardian consent token. On success, marks the request verified and
 * records either account-level consent or authorization for one named agency.
 *
 * @param {import('knex')} knex
 * @param {string} rawToken
 * @returns {Promise<{ ok: boolean, reason?: string, profileId?: string }>}
 */
async function verifyConsentToken(knex, rawToken) {
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
    // Idempotent: a guardian re-clicking their link still lands on success.
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
  await knex.transaction(async (trx) => {
    await trx("guardian_consent_requests")
      .where({ id: request.id })
      .update({ status: "verified", verified_at: verifiedAt });

    if (request.agency_id) {
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
      await trx("profiles")
        .where({ id: request.profile_id })
        .update({ guardian_consent_at: verifiedAt, updated_at: trx.fn.now() });
    }
  });

  return {
    ok: true,
    profileId: request.profile_id,
    agencyId: request.agency_id || null,
  };
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
  verifyConsentToken,
  getConsentStatus,
  buildConsentUrl,
  persistProfileDateOfBirthIfNeeded,
  loadProfilePrimaryPhotoUrl,
  GuardianConsentEmailError,
  getAgencyConsentGrant,
  hasAgencyConsent,
  getAgencyConsentStatus,
};
