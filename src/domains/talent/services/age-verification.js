"use strict";

const crypto = require("crypto");
const config = require("../../../config");
const knex = require("../../../shared/db/knex");
const { stripe } = require("../../../shared/lib/stripe");
const { computeAge } = require("../../../shared/lib/talent-age");

const PROVIDER = "stripe_identity";
const ACTIVE_STATUSES = ["creating", "requires_input", "processing"];
const CONTENT_BOUNDARIES = new Set([
  "Swimwear",
  "Lingerie",
  "Implied Nudity",
  "Artistic Nudity",
  "Fitness/Athletic",
  "Body Paint",
]);

function normalizedDob(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || "").trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function dobFromStripe(output) {
  const dob = output?.dob;
  if (!dob?.year || !dob?.month || !dob?.day) return null;
  return `${String(dob.year).padStart(4, "0")}-${String(dob.month).padStart(2, "0")}-${String(dob.day).padStart(2, "0")}`;
}

async function ensureAdultContext(db, profileId, values) {
  if (!(await db.schema.hasTable("adult_context"))) return;
  const existing = await db("adult_context").where({ profile_id: profileId }).first();
  const update = { ...values, updated_at: db.fn.now() };
  if (existing) {
    await db("adult_context").where({ profile_id: profileId }).update(update);
  } else {
    await db("adult_context").insert({
      id: crypto.randomUUID(),
      profile_id: profileId,
      content_boundaries: null,
      onlyfans_url: null,
      creator_links: null,
      share_with_named_submission: false,
      share_with_confirmed_job: false,
      verified_adult: false,
      verified_adult_at: null,
      ...update,
      created_at: db.fn.now(),
    });
  }
}

async function invalidateAdultVerification(db, profileId) {
  if (!(await db.schema.hasTable("adult_context"))) return;
  await db("adult_context").where({ profile_id: profileId }).update({
    verified_adult: false,
    verified_adult_at: null,
    updated_at: db.fn.now(),
  });
}

function parseContentBoundaries(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeOnlyfansUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    const error = new Error("Enter a valid OnlyFans profile URL");
    error.code = "INVALID_CREATOR_URL";
    throw error;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.protocol !== "https:" || host !== "onlyfans.com" || url.pathname === "/") {
    const error = new Error("Enter a valid OnlyFans profile URL");
    error.code = "INVALID_CREATOR_URL";
    throw error;
  }
  url.hostname = "onlyfans.com";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function getAdultContext(profileId) {
  const context = await knex("adult_context").where({ profile_id: profileId }).first();
  if (!context?.verified_adult) {
    return { verifiedAdult: false, verifiedAt: null, contentBoundaries: [], onlyfansUrl: null };
  }
  return {
    verifiedAdult: true,
    verifiedAt: context.verified_adult_at || null,
    contentBoundaries: parseContentBoundaries(context.content_boundaries),
    onlyfansUrl: context.onlyfans_url || null,
  };
}

async function updateAdultContext(profileId, input = {}) {
  const context = await knex("adult_context").where({ profile_id: profileId }).first();
  if (!context?.verified_adult) {
    const error = new Error("Complete age verification before saving adult-only context");
    error.code = "ADULT_VERIFICATION_REQUIRED";
    throw error;
  }

  const boundaries = Array.isArray(input.contentBoundaries)
    ? [...new Set(input.contentBoundaries.map(String))]
    : [];
  if (boundaries.some((value) => !CONTENT_BOUNDARIES.has(value))) {
    const error = new Error("One or more content boundaries are not recognized");
    error.code = "INVALID_CONTENT_BOUNDARY";
    throw error;
  }

  await knex("adult_context").where({ profile_id: profileId }).update({
    content_boundaries: boundaries.length ? JSON.stringify(boundaries) : null,
    onlyfans_url: normalizeOnlyfansUrl(input.onlyfansUrl),
    // Sharing is never implied by saving. A named submission or confirmed job
    // must collect its own explicit consent before exposing this record.
    share_with_named_submission: false,
    share_with_confirmed_job: false,
    updated_at: knex.fn.now(),
  });
  return getAdultContext(profileId);
}

async function createVerificationSession(profile) {
  if (!stripe?.identity?.verificationSessions) {
    const error = new Error("Age verification is not configured");
    error.code = "AGE_VERIFICATION_NOT_CONFIGURED";
    throw error;
  }

  const dob = normalizedDob(profile.date_of_birth);
  if (!dob) {
    const error = new Error("Add your date of birth before verifying your age");
    error.code = "DOB_REQUIRED";
    throw error;
  }
  if (computeAge(dob) < 18) {
    const error = new Error("Adult verification is available only to people aged 18 or older");
    error.code = "ADULT_ONLY";
    throw error;
  }

  const active = await knex("age_verifications")
    .where({ profile_id: profile.id })
    .whereIn("status", ACTIVE_STATUSES)
    .orderBy("created_at", "desc")
    .first();
  if (active?.provider_session_id) {
    const session = await stripe.identity.verificationSessions.retrieve(active.provider_session_id);
    if (session?.url) return { record: active, session };
  }

  const id = crypto.randomUUID();
  await knex("age_verifications").insert({ id, profile_id: profile.id, status: "creating" });
  try {
    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      client_reference_id: id,
      metadata: { ageVerificationId: id },
      options: { document: { require_matching_selfie: true } },
      return_url: `${config.stripe.baseUrl}/dashboard/talent/profile?age_verification=return`,
    });
    await knex("age_verifications").where({ id }).update({
      provider_session_id: session.id,
      status: session.status || "requires_input",
      updated_at: knex.fn.now(),
    });
    return { record: { id, profile_id: profile.id }, session };
  } catch (error) {
    await knex("age_verifications").where({ id }).update({
      status: "failed",
      failure_code: String(error.code || "provider_error").slice(0, 100),
      updated_at: knex.fn.now(),
    });
    throw error;
  }
}

async function applyProviderSession(session) {
  if (!session?.id) return null;
  const record = await knex("age_verifications")
    .where({ provider_session_id: session.id })
    .first();
  if (!record) return null;

  if (session.status !== "verified") {
    const failureCode = session.last_error?.code || null;
    await knex("age_verifications").where({ id: record.id }).update({
      status: session.status || "failed",
      failure_code: failureCode ? String(failureCode).slice(0, 100) : null,
      ...(session.redaction?.status === "redacted" ? { redacted_at: knex.fn.now() } : {}),
      updated_at: knex.fn.now(),
    });
    return getVerificationStatus(record.profile_id);
  }

  const profile = await knex("profiles").where({ id: record.profile_id }).first();
  if (!profile) return null;
  const verifiedDob = dobFromStripe(session.verified_outputs);
  const profileDob = normalizedDob(profile.date_of_birth);
  const dobMatches = Boolean(verifiedDob && profileDob && verifiedDob === profileDob);
  const verifiedOver18 = Boolean(verifiedDob && computeAge(verifiedDob) >= 18);
  const verified = dobMatches && verifiedOver18;

  await knex.transaction(async (trx) => {
    await trx("age_verifications").where({ id: record.id }).update({
      status: verified ? "verified" : "failed",
      verified_over_18: verifiedOver18,
      dob_matches_profile: dobMatches,
      failure_code: verified ? null : dobMatches ? "under_18" : "dob_mismatch",
      verified_at: verified ? trx.fn.now() : null,
      updated_at: trx.fn.now(),
    });
    await ensureAdultContext(trx, profile.id, {
      verified_adult: verified,
      verified_adult_at: verified ? trx.fn.now() : null,
    });
  });

  if (!record.redaction_requested_at) {
    await knex("age_verifications").where({ id: record.id }).update({
      redaction_requested_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    stripe.identity.verificationSessions.redact(session.id).then(
      () => undefined,
      async (error) => {
        await knex("age_verifications").where({ id: record.id }).update({
          redaction_requested_at: null,
          updated_at: knex.fn.now(),
        });
        console.error("[AgeVerification] Stripe redaction failed:", error.message);
      },
    );
  }
  return getVerificationStatus(profile.id);
}

async function syncVerification(providerSessionId) {
  if (!providerSessionId || !stripe?.identity?.verificationSessions) return null;
  const session = await stripe.identity.verificationSessions.retrieve(providerSessionId);
  return applyProviderSession(session);
}

async function markVerificationRedacted(providerSessionId) {
  if (!providerSessionId) return;
  await knex("age_verifications")
    .where({ provider_session_id: providerSessionId })
    .update({ redacted_at: knex.fn.now(), updated_at: knex.fn.now() });
}

async function getVerificationStatus(profileId) {
  const [context, latest] = await Promise.all([
    knex.schema.hasTable("adult_context").then((has) =>
      has ? knex("adult_context").where({ profile_id: profileId }).first() : null,
    ),
    knex("age_verifications")
      .where({ profile_id: profileId })
      .orderBy("created_at", "desc")
      .first(),
  ]);
  return {
    verifiedAdult: Boolean(context?.verified_adult),
    verifiedAt: context?.verified_adult_at || null,
    status: latest?.status || "not_started",
    failureCode: latest?.failure_code || null,
  };
}

module.exports = {
  createVerificationSession,
  applyProviderSession,
  syncVerification,
  getVerificationStatus,
  invalidateAdultVerification,
  markVerificationRedacted,
  normalizedDob,
  dobFromStripe,
  getAdultContext,
  updateAdultContext,
};
