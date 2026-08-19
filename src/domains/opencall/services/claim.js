"use strict";

/**
 * The claim transaction — "the claim is the receipt"
 * (`docs/open-call-applicant-flow-design-2026-08.md` §5.2, §5.3, §5.5).
 *
 * One click in the applicant's own inbox moves them from state 2 (submitted,
 * unclaimed) to state 3 (claimed), and in ONE transaction:
 *
 *   creates `users` (no password, no firebase_uid, `email_verified = true` —
 *     the click IS the verification, ruling Q4) and records legal acceptance
 *   creates `profiles` and PROJECTS every answer under that identity onto it
 *   promotes `open_call_submission_media` into `images`
 *   re-points every `applications` row from the identity to the new profile
 *   backfills the frozen snapshot and consent-audit rows
 *   stamps `applicant_identities.claimed_at` + `profile_id`
 *
 * Three invariants worth stating out loud because each is a decision:
 *
 * 1. **Idempotent, not defensive.** A magic link gets clicked twice — by the
 *    human, by their mail client's link previewer, by a corporate scanner. A
 *    second claim returns the same `{userId, profileId}` instead of an error.
 *    Only a *disowned* identity refuses.
 * 2. **Projection, not migration.** Every intake key maps to exactly one
 *    canonical column (§2.6 consequence 3), so nothing the applicant typed is
 *    wasted and nothing needs re-asking.
 * 3. **Onboarding is not finished.** `onboarding_completed_at` stays NULL. The
 *    event spec does not collect a date of birth, so the claimed user lands in a
 *    shortened, prefilled onboarding rather than a dashboard whose age gate has
 *    never been answered. That is deliberate, not an oversight.
 */

const { v4: uuidv4 } = require("uuid");

const config = require("../../../config");
const { ensureUniqueSlug } = require("../../../shared/lib/slugify");
const { recordLegalAcceptance } = require("../../../shared/lib/legal-acceptance");
const { canonicalizeGender } = require("../../../shared/lib/gender");
const {
  saveProfileSocialFields,
} = require("../../../shared/lib/social-helpers");
const {
  MODERATION_STATUS,
} = require("../../../shared/lib/content-moderation");
const {
  getState,
  initialState,
  transitionTo,
} = require("../../onboarding/services/state-machine");
const { consumeClaimToken } = require("./claim-tokens");
const {
  IDENTITIES_TABLE,
  normalizeEmailAsTyped,
} = require("./applicant-identities");

const SUBMISSIONS_TABLE = "open_call_submissions";
const SUBMISSION_MEDIA_TABLE = "open_call_submission_media";

/** `open_call_submissions.status` — only a submitted row projects. */
const SUBMISSION_STATUSES = Object.freeze({
  DRAFT: "draft",
  SUBMITTED: "submitted",
  ABANDONED: "abandoned",
});

/**
 * Media states that may become a portfolio image.
 *
 * `open_call_submission_media.moderation_state` is documented pending |
 * approved | rejected (migration `20260819110000`). Anything outside the
 * promotable set stays where it is: the organizer still sees it through the
 * frozen snapshot, but it does not enter the image pipeline. `pending` IS
 * promoted — with `images.moderation_status` set to `pending` so the existing
 * moderation linkage carries over rather than being laundered to `approved` by
 * the act of claiming. Design §7.1's hard gate (anonymous upload wired into
 * moderation before the path is enabled anywhere) is upstream of this function;
 * this is the half of it that refuses to launder a state.
 */
const PROMOTABLE_MEDIA_STATES = Object.freeze(["pending", "approved"]);

/** intake media key → `images.shot_type` (validation.js SHOT_TYPE_VALUES). */
const MEDIA_FIELD_SHOT_TYPES = Object.freeze({
  digital_headshot: "headshot",
  digital_full_length: "full_length",
  digital_profile: "profile",
  // The bare forms, in case a spec entry is ever authored without the prefix.
  headshot: "headshot",
  full_length: "full_length",
  profile: "profile",
});

/** Sentinel for the NOT NULL `profiles.city`, exactly as casting.js:540 uses. */
const CITY_SENTINEL = "Not specified";

const HEIGHT_CM_MIN = 100;
const HEIGHT_CM_MAX = 250;

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseJsonColumn(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isEmptyAnswer(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Merge the answers of every submitted application under this identity,
 * newest first, field by field: the newest non-empty value for a key wins.
 *
 * Newest-wins is the honest rule for a human who applied to Brooklyn in June
 * and Queens in September and moved city in between — and it is why the merge
 * is per-field rather than per-submission: an older application that carried an
 * Instagram handle the newer one omitted should not lose it.
 */
function mergeAnswers(submissions) {
  const merged = {};
  for (const submission of submissions) {
    const answers = parseJsonColumn(submission.answers);
    for (const [key, value] of Object.entries(answers)) {
      if (isEmptyAnswer(value)) continue;
      if (!(key in merged)) merged[key] = value;
    }
  }
  return merged;
}

/**
 * `legal_name` → first/last. Last space-separated token is the last name, the
 * rest is the first — the same rule casting.js applies to a provider display
 * name. A single token becomes a first name with an empty last name (the column
 * is nullable, but `""` matches what the rest of the codebase stores).
 */
function splitLegalName(legalName) {
  const cleaned = String(legalName || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return { firstName: "", lastName: "" };
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    lastName: parts[parts.length - 1],
    firstName: parts.slice(0, -1).join(" "),
  };
}

/** `height` is declared "Height (cm)" by the vocabulary. Integer cm or null. */
function parseHeightCm(value) {
  if (isEmptyAnswer(value)) return null;
  const numeric =
    typeof value === "number" ? value : Number(String(value).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  const cm = Math.round(numeric);
  return cm >= HEIGHT_CM_MIN && cm <= HEIGHT_CM_MAX ? cm : null;
}

/** `date_of_birth` — only ever set when a submission actually collected it. */
function parseDateOfBirth(value) {
  if (isEmptyAnswer(value)) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  return match ? match[0] : null;
}

function trimTo(value, max) {
  if (isEmptyAnswer(value)) return null;
  return String(value).trim().slice(0, max) || null;
}

/**
 * The projected profile fields, from merged answers.
 * Every key here is in the closed vocabulary (`INTAKE_FIELDS`); an answer with
 * no canonical column is *not* projected, by design — that is what custom
 * questions are for (§3.1).
 */
function projectProfileFields(answers) {
  const { firstName, lastName } = splitLegalName(answers.legal_name);
  return {
    firstName,
    lastName,
    city: trimTo(answers.city, 120),
    gender: answers.gender ? canonicalizeGender(trimTo(answers.gender, 60)) : null,
    heightCm: parseHeightCm(answers.height),
    phone: trimTo(answers.phone, 40),
    dateOfBirth: parseDateOfBirth(answers.date_of_birth),
    instagram: trimTo(answers.instagram, 120),
  };
}

/**
 * Public URL for a stored object.
 *
 * `open_call_submission_media.storage_key` holds whatever the anonymous upload
 * path stored: an R2 object key in production, a `/uploads/...` path locally.
 * `uploader.js`'s `r2PublicUrlForKey` is not exported, so the one line of it we
 * need is reproduced rather than the module's private surface widened from a
 * domain service.
 */
function publicUrlForStorageKey(storageKey) {
  const key = String(storageKey || "").trim();
  if (!key) return null;
  if (/^https?:\/\//i.test(key) || key.startsWith("/")) return key;
  const base = String(config.r2?.publicUrl || "").replace(/\/$/, "");
  return base ? `${base}/${key}` : `/uploads/${key}`;
}

/**
 * Walk the casting state machine as far as the projected data honestly reaches.
 *
 * Uses `transitionTo` rather than hand-written state JSON, which means the walk
 * obeys the machine's strict adjacency rule (audit finding M3 — no multi-step
 * jumps). The consequence is worth naming: with no date of birth collected by
 * an event spec, the walk stops after `entry`, because `birthdate` is the very
 * next step and no answer completes it. That is the correct outcome — a claimed
 * applicant resumes at the age question, which is the one thing the organizer's
 * form never asked and the platform's 18+ policy needs.
 *
 * `measurements` is never marked complete from a height alone: the step
 * collects core measurements, and a completion flag the data does not support
 * would make `canComplete` lie.
 */
function buildOnboardingState(db, projected, { promotedImageCount }) {
  const payload = initialState("entry", db);
  let state = getState({ onboarding_state_json: payload.onboarding_state_json });
  let current = payload;

  const walk = [
    // The claim itself is the entry: an account now exists and its email is
    // proven.
    ["birthdate", true],
    ["gender", Boolean(projected.dateOfBirth)],
    ["scout", Boolean(projected.gender)],
    // Digitals arrived with the application, so the scout step really is done.
    ["measurements", promotedImageCount > 0],
  ];

  for (const [target, dataExists] of walk) {
    if (!dataExists) break;
    const next = transitionTo(state, target, { source: "open_call_claim" }, db);
    if (!next) break;
    current = next;
    state = getState({ onboarding_state_json: next.onboarding_state_json });
  }

  return {
    onboarding_stage: current.onboarding_stage,
    onboarding_state_json: current.onboarding_state_json,
  };
}

async function lockIdentity(trx, identityId) {
  let query = trx(IDENTITIES_TABLE).where({ id: identityId });
  if (trx.client.config.client === "pg") {
    query = query.forUpdate();
  }
  return query.first();
}

/** Every submitted application under this identity, newest first. */
async function loadSubmittedSubmissions(trx, identityId) {
  return trx(SUBMISSIONS_TABLE)
    .where({
      applicant_identity_id: identityId,
      status: SUBMISSION_STATUSES.SUBMITTED,
    })
    .orderBy([
      { column: "submitted_at", order: "desc" },
      { column: "created_at", order: "desc" },
    ])
    .select("*");
}

/**
 * Promote anonymous uploads into `images`. Skips rows already promoted, so a
 * re-run cannot double-insert.
 *
 * @returns {Promise<number>} images inserted.
 */
async function promoteSubmissionMedia(trx, { submissionIds, profileId }) {
  if (!submissionIds.length) return 0;

  const media = await trx(SUBMISSION_MEDIA_TABLE)
    .whereIn("submission_id", submissionIds)
    .whereNull("promoted_image_id")
    .whereIn("moderation_state", PROMOTABLE_MEDIA_STATES)
    .orderBy("created_at", "asc")
    .select("*");
  if (!media.length) return 0;

  const existing = await trx("images")
    .where({ profile_id: profileId })
    .max({ maxSort: "sort" })
    .first();
  let sort = Number(existing?.maxSort) || 0;

  let inserted = 0;
  const seenShotTypes = new Set();

  for (const row of media) {
    const path = publicUrlForStorageKey(row.storage_key);
    if (!path) continue;
    const shotType = MEDIA_FIELD_SHOT_TYPES[row.field_key] || null;
    // One image per shot type: the merge across editions can produce two
    // headshots, and the newer submission's is the one already promoted first
    // by the created_at ordering above.
    if (shotType && seenShotTypes.has(shotType)) continue;
    if (shotType) seenShotTypes.add(shotType);

    const imageId = uuidv4();
    sort += 1;
    await trx("images").insert({
      id: imageId,
      profile_id: profileId,
      path,
      public_url: path,
      storage_key: /^https?:\/\//i.test(row.storage_key) ? null : row.storage_key,
      label: "Open call digital",
      image_type: "digital",
      shot_type: shotType,
      sort,
      is_primary: shotType === "headshot" && inserted === 0,
      // The submission's moderation state carries over verbatim — see
      // PROMOTABLE_MEDIA_STATES.
      moderation_status:
        row.moderation_state === "approved"
          ? MODERATION_STATUS.APPROVED
          : MODERATION_STATUS.PENDING,
      created_at: trx.fn.now(),
    });

    await trx(SUBMISSION_MEDIA_TABLE)
      .where({ id: row.id })
      .update({ promoted_image_id: imageId });
    inserted += 1;
  }

  return inserted;
}

/**
 * Re-point the organizer-facing rows from the identity to the profile.
 *
 * `applicant_identity_id` is KEPT everywhere: it is the provenance of an
 * application that arrived without an account, and §5.5's dispute surface reads
 * it. Only the NULL profile/user pointers are filled in.
 */
async function repointApplications(trx, { identityId, profileId, userId }) {
  const applicationIds = (
    await trx("applications")
      .where({ applicant_identity_id: identityId })
      .select("id")
  ).map((row) => row.id);

  const repointed = await trx("applications")
    .where({ applicant_identity_id: identityId })
    .whereNull("profile_id")
    .update({ profile_id: profileId, updated_at: trx.fn.now() });

  if (applicationIds.length) {
    await trx("talent_submission_packages")
      .whereIn("application_id", applicationIds)
      .whereNull("profile_id")
      .update({ profile_id: profileId });
    await trx("talent_submission_packages")
      .whereIn("application_id", applicationIds)
      .whereNull("user_id")
      .update({ user_id: userId });

    await trx("application_submission_consent_events")
      .whereIn("application_id", applicationIds)
      .whereNull("profile_id")
      .update({ profile_id: profileId });
    await trx("application_submission_consent_events")
      .whereIn("application_id", applicationIds)
      .whereNull("user_id")
      .update({ user_id: userId });
  }

  return { applicationIds, repointed };
}

/** The newest submitted application's call, for funnel attribution. */
function funnelContextFrom(submissions) {
  const newest = submissions[0];
  if (!newest) return null;
  return {
    openCallLinkId: newest.open_call_link_id,
    agencyId: newest.agency_id,
  };
}

async function findExistingUserForIdentity(trx, identity) {
  const candidates = [
    identity.email_normalized,
    normalizeEmailAsTyped(identity.email_normalized),
  ].filter(Boolean);
  const unique = [...new Set(candidates)];
  return trx("users")
    .whereRaw(
      `LOWER(email) IN (${unique.map(() => "?").join(", ")})`,
      unique,
    )
    .first("id", "role", "email", "email_verified");
}

/**
 * Create the profile row for a user from projected answers.
 * Sentinels for the NOT NULL columns, exactly as casting.js:540.
 */
async function insertProjectedProfile(trx, { userId, projected, onboarding }) {
  const profileId = uuidv4();
  const slugBase =
    projected.firstName && projected.lastName
      ? `${projected.firstName}-${projected.lastName}`
      : projected.firstName || `applicant-${profileId.substring(0, 8)}`;
  const slug = await ensureUniqueSlug(trx, "profiles", slugBase);

  await trx("profiles").insert({
    id: profileId,
    user_id: userId,
    slug,
    first_name: projected.firstName || "Applicant",
    last_name: projected.lastName || "",
    city: projected.city || CITY_SENTINEL,
    height_cm: projected.heightCm || 0,
    gender: projected.gender || null,
    phone: projected.phone || null,
    date_of_birth: projected.dateOfBirth || null,
    bio_raw: "",
    bio_curated: "",
    ...onboarding,
    visibility_mode: "private_intake",
    services_locked: true,
    analysis_status: "pending",
    profile_completeness: 0,
    created_at: trx.fn.now(),
    updated_at: trx.fn.now(),
  });

  return profileId;
}

/**
 * Claim an identity.
 *
 * @param {import('knex')} db
 * @param {object} input
 * @param {string} input.identityId
 * @param {boolean} [input.termsAccepted] required only when a `users` row is created.
 * @param {string} [input.tokenId] consume this claim token inside the same transaction.
 * @param {object} [input.req] accepted and unused — see the note below.
 * @returns {Promise<{userId: string, profileId: string, created: boolean, profileCreated: boolean, alreadyHadAccount: boolean, alreadyClaimed: boolean, promotedImageCount: number, applicationIds: string[], funnelContext: {openCallLinkId: string, agencyId: string}|null}>}
 *
 * `req` is accepted for call-site symmetry with the rest of the applicant flow
 * and is deliberately not used: nothing in the claim writes request metadata.
 * The IP and user-agent of record for this application were captured at submit,
 * on the submission row and the consent-audit row, which is where an auditor
 * looks for them. Recording a second, later pair here would suggest the
 * application came from this request, which it did not.
 *
 * Coded failures: IDENTITY_NOT_FOUND, IDENTITY_DISOWNED, TERMS_REQUIRED,
 * IDENTITY_EMAIL_IS_AGENCY, CLAIM_TOKEN_CONFLICT.
 */
async function claimIdentity(db, { identityId, termsAccepted, tokenId } = {}) {
  if (!identityId) throw codedError("identityId is required", "IDENTITY_NOT_FOUND");

  let result = null;
  let socialWrite = null;

  await db.transaction(async (trx) => {
    const identity = await lockIdentity(trx, identityId);
    if (!identity) throw codedError("Unknown applicant", "IDENTITY_NOT_FOUND");

    // A disowned identity is a disputed one. Claiming it would hand an account
    // to whoever forwarded the link, over the objection of the person who owns
    // the mailbox (§5.5).
    if (identity.disowned_at) {
      throw codedError(
        "This application was reported as not belonging to this address",
        "IDENTITY_DISOWNED",
      );
    }

    // ---------------------------------------------------------- idempotence
    if (identity.claimed_at) {
      const profile = identity.profile_id
        ? await trx("profiles").where({ id: identity.profile_id }).first("id", "user_id")
        : null;
      const user = profile
        ? { id: profile.user_id }
        : await findExistingUserForIdentity(trx, identity);
      if (tokenId) {
        // Best effort: a second click on a *fresh* token still spends it, but a
        // token already spent must not turn an idempotent success into an error.
        await trx("applicant_claim_tokens")
          .where({ id: tokenId })
          .whereNull("consumed_at")
          .update({ consumed_at: trx.fn.now() });
      }
      result = {
        userId: user?.id || null,
        profileId: profile?.id || identity.profile_id || null,
        created: false,
        profileCreated: false,
        alreadyHadAccount: true,
        alreadyClaimed: true,
        promotedImageCount: 0,
        applicationIds: [],
        funnelContext: null,
      };
      return;
    }

    const submissions = await loadSubmittedSubmissions(trx, identityId);
    const submissionIds = submissions.map((row) => row.id);
    const projected = projectProfileFields(mergeAnswers(submissions));

    const existingUser = await findExistingUserForIdentity(trx, identity);

    // -------------------------------------------------- existing account path
    if (existingUser) {
      const role = String(existingUser.role || "").toUpperCase();
      if (role !== "TALENT") {
        // An agency operator's mailbox must not become a talent profile because
        // someone typed it into an open call. Support resolves this, not a link.
        throw codedError(
          "This address belongs to an agency workspace",
          "IDENTITY_EMAIL_IS_AGENCY",
        );
      }

      let profile = await trx("profiles")
        .where({ user_id: existingUser.id })
        .first("id");
      let profileCreated = false;
      let promotedImageCount = 0;

      if (!profile) {
        // A `users` row with no profile: the projection has somewhere to land,
        // so treat it like a new claim from here on.
        const onboarding = buildOnboardingState(trx, projected, {
          promotedImageCount: submissionIds.length ? 1 : 0,
        });
        const profileId = await insertProjectedProfile(trx, {
          userId: existingUser.id,
          projected,
          onboarding,
        });
        profile = { id: profileId };
        profileCreated = true;
        promotedImageCount = await promoteSubmissionMedia(trx, {
          submissionIds,
          profileId,
        });
        if (projected.instagram) {
          socialWrite = { profileId, instagram: projected.instagram };
        }
      }
      // A LIVE PROFILE IS NOT OVERWRITTEN, and its portfolio is not injected
      // into. Design §5.3 row 1 says the application *attaches* to that
      // profile — the organizer reads the application's own frozen snapshot
      // (§4), so nothing is lost by leaving a curated portfolio and a curated
      // set of stats exactly as their owner left them. Projecting an answer
      // typed on a form over a field the talent maintains, or pushing
      // unreviewed camera-roll uploads into their live portfolio, would be a
      // change they never asked for.

      const { applicationIds } = await repointApplications(trx, {
        identityId,
        profileId: profile.id,
        userId: existingUser.id,
      });

      if (!existingUser.email_verified) {
        // Same reasoning as ruling Q4: possession of the mailbox was just
        // demonstrated by a single-use hashed link delivered to it.
        await trx("users")
          .where({ id: existingUser.id })
          .update({ email_verified: true });
      }

      await trx(IDENTITIES_TABLE).where({ id: identityId }).update({
        profile_id: profile.id,
        claimed_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

      if (tokenId) await consumeClaimToken(trx, tokenId);

      result = {
        userId: existingUser.id,
        profileId: profile.id,
        created: false,
        profileCreated,
        alreadyHadAccount: true,
        alreadyClaimed: false,
        promotedImageCount,
        applicationIds,
        funnelContext: funnelContextFrom(submissions),
      };
      return;
    }

    // ------------------------------------------------------- new account path
    if (termsAccepted !== true) {
      throw codedError(
        "You must accept the Terms of Service to keep this profile",
        "TERMS_REQUIRED",
      );
    }

    const userId = uuidv4();
    await trx("users").insert({
      id: userId,
      email: identity.email_normalized,
      role: "TALENT",
      first_name: projected.firstName || "Applicant",
      last_name: projected.lastName || null,
      // Ruling Q4. No password_hash and no firebase_uid: the credential is the
      // last thing asked for, not the first (§5.2). Both columns are nullable.
      email_verified: true,
      created_at: trx.fn.now(),
    });
    await recordLegalAcceptance(trx, userId, { terms: true, privacy: true });

    // Two passes over the state machine because `scout` completion depends on
    // whether media actually promoted, and promotion needs the profile id. The
    // first pass assumes the media that exists will promote, the second is
    // corrected against reality.
    const profileId = await insertProjectedProfile(trx, {
      userId,
      projected,
      onboarding: buildOnboardingState(trx, projected, {
        promotedImageCount: submissionIds.length ? 1 : 0,
      }),
    });

    const promotedImageCount = await promoteSubmissionMedia(trx, {
      submissionIds,
      profileId,
    });
    await trx("profiles")
      .where({ id: profileId })
      .update(buildOnboardingState(trx, projected, { promotedImageCount }));

    const { applicationIds } = await repointApplications(trx, {
      identityId,
      profileId,
      userId,
    });

    await trx(IDENTITIES_TABLE).where({ id: identityId }).update({
      profile_id: profileId,
      claimed_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });

    if (tokenId) await consumeClaimToken(trx, tokenId);

    if (projected.instagram) {
      socialWrite = { profileId, instagram: projected.instagram };
    }

    result = {
      userId,
      profileId,
      created: true,
      profileCreated: true,
      alreadyHadAccount: false,
      alreadyClaimed: false,
      promotedImageCount,
      applicationIds,
      funnelContext: funnelContextFrom(submissions),
    };
  });

  // `saveProfileSocialFields` opens its own connection, so it cannot join the
  // transaction above, and a social-handle write must never undo a completed
  // claim. Best-effort and non-throwing, matching casting.js's treatment of the
  // same call.
  if (socialWrite) {
    try {
      await saveProfileSocialFields(socialWrite.profileId, {
        instagram_handle: socialWrite.instagram,
      });
    } catch (error) {
      console.error("[OpenCall Claim] Instagram handle write failed:", error.message);
    }
  }

  return result;
}

/**
 * "That wasn't me" (§5.5).
 *
 * Sets `disowned_at` and nothing else. NO FOREIGN KEY IS NULLED: `applications`
 * carries a CHECK requiring one of `profile_id` / `applicant_identity_id`, and
 * more importantly the organizer's application must not silently vanish from
 * their pool — §5.5 is explicit that the organizer decides what to do with it,
 * and §4's resolver is what surfaces the dispute to them.
 *
 * Idempotent. Refuses once the identity is claimed: at that point the address
 * has been proven and an account exists, so a forwarded disown link must not be
 * able to mark a live account disputed. That path is support, not a link.
 *
 * @returns {Promise<{identity: object, disowned: boolean, alreadyDisowned: boolean}>}
 */
async function disownIdentity(db, { identityId, tokenId } = {}) {
  if (!identityId) throw codedError("identityId is required", "IDENTITY_NOT_FOUND");

  let result = null;
  await db.transaction(async (trx) => {
    const identity = await lockIdentity(trx, identityId);
    if (!identity) throw codedError("Unknown applicant", "IDENTITY_NOT_FOUND");

    if (identity.claimed_at) {
      throw codedError(
        "This profile has already been claimed",
        "IDENTITY_ALREADY_CLAIMED",
      );
    }

    if (identity.disowned_at) {
      if (tokenId) {
        await trx("applicant_claim_tokens")
          .where({ id: tokenId })
          .whereNull("consumed_at")
          .update({ consumed_at: trx.fn.now() });
      }
      result = { identity, disowned: true, alreadyDisowned: true };
      return;
    }

    await trx(IDENTITIES_TABLE).where({ id: identityId }).update({
      disowned_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
    if (tokenId) await consumeClaimToken(trx, tokenId);

    result = {
      identity: await trx(IDENTITIES_TABLE).where({ id: identityId }).first(),
      disowned: true,
      alreadyDisowned: false,
    };
  });

  return result;
}

module.exports = {
  CITY_SENTINEL,
  MEDIA_FIELD_SHOT_TYPES,
  PROMOTABLE_MEDIA_STATES,
  SUBMISSION_STATUSES,
  claimIdentity,
  disownIdentity,
  mergeAnswers,
  projectProfileFields,
  publicUrlForStorageKey,
  splitLegalName,
};
