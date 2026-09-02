const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const {
  LikenessConsentError,
  consentHistory,
  consentState,
  grantConsent,
  withdrawConsent,
} = require("../services/likeness-consent");

const { requireRole } = require("../../auth/middleware/require-auth");
const { ensureAuthProvider } = require("../../auth/services/auth-provider");
const { ensureUniqueSlug } = require("../../../shared/lib/slugify");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const {
  buildAccountDeletionResponse,
  deleteUserAccount,
} = require("../../../shared/lib/account-deletion");
const { buildTalentDataExport } = require("../../../shared/lib/data-export");
const {
  recordLegalAcceptance,
  requireLegalAcceptance,
} = require("../../../shared/lib/legal-acceptance");
const {
  CURRENT_LEGAL_VERSION,
  changelogFor,
} = require("../../../shared/lib/legal-versions");
const apiResponse = require("../../../shared/lib/api-response");
const {
  listUserDevices,
  revokeOtherSessions,
  revokeSession,
} = require("../../../shared/lib/session-registry");
const {
  getSubscriptionStatus,
  getTrialDaysRemaining,
  isCanceling,
  isInTrial,
  isSubscriptionActive,
} = require("../../../shared/lib/subscriptions");
const config = require("../../../config");
const {
  STUDIO_PLUS_PLAN,
  getStudioPlusCheckoutPlans,
  getStudioPlusPlan,
  getStudioPlusPlanForPriceId,
} = require("../../../shared/lib/billing-plan");
const { v4: uuidv4 } = require("uuid");
const {
  minorPublicExposureAllowed,
  hasRecordedDateOfBirth,
  isMinorProfile,
} = require("../../../shared/lib/talent-age");
const {
  purgeProfileEmbeddingDerivatives,
  purgeImageEmbeddingDerivatives,
} = require("../../ai/embeddings");
const {
  scheduleDiscoverReindex,
} = require("../services/discover-reindex-hooks");

// Bumped 2026-09-02 with the Discover semantic layer
// (tasks/discover-semantic-2026-09.md §6). The embedding disclosure now names
// what is actually sent — the bio, the declared details, and the photo
// descriptions — because the corpus grew past "a limited profile summary".
// Migration 20260804090000 still carries the 2026-08-04 text and hashes: that
// is the historical evidence of what talent agreed to then, and it must not be
// edited. Grants recorded under the old version stay valid grants; the settings
// screen simply re-presents the new text (it renders `ai.disclosureVersion`
// from the payload) and a NEW grant must echo the current version back.
const AI_CONSENT_DISCLOSURE_VERSION = "2026-09-02";
const AI_CONSENT_PURPOSES = {
  image_analysis: {
    column: "ai_processing_consent",
    disclosure:
      "Allow Pholio to send portfolio images to its image-analysis provider for shot classification and profile insights.",
  },
  agency_search_matching: {
    column: "embedding_processing_consent",
    disclosure:
      "Allow Pholio to send your bio, your declared profile details, and short descriptions of your portfolio photos (written by the image-analysis provider and describing styling, lighting, mood, and setting, never your face, age, heritage, or body) to its embedding provider, so vetted agency searches can find you by the look they describe. You can withdraw this at any time; the stored descriptions and vectors are deleted when you do.",
  },
};

function consentDisclosureHash(purpose) {
  const disclosure = AI_CONSENT_PURPOSES[purpose]?.disclosure;
  if (!disclosure) throw new Error(`Unknown AI consent purpose: ${purpose}`);
  return crypto
    .createHash("sha256")
    .update(`${AI_CONSENT_DISCLOSURE_VERSION}\n${disclosure}`, "utf8")
    .digest("hex");
}

// Only the two categories `shared/services/notifications.js` actually consults.
// This used to also carry `emailFrequency` (immediate/daily/weekly — no digest
// job exists anywhere in the codebase), `marketing`, `newMessages`,
// `inAppApplications` and `emailNotifications`. None had a consumer, and
// `newMessages` contradicted an explicit decision documented in
// notifications.js: messages are never gated, because a booker
// reaching out always has to reach the talent.
const DEFAULT_NOTIFICATIONS = {
  profileViews: true,
  applicationUpdates: true,
};

// `showContact` used to live here, defaulting to true and claiming to control
// whether email/phone appear "on eligible public surfaces". No public surface
// renders talent contact details at all — not the portfolio views, not the PDF
// templates — so the toggle described exposure that never happened. Removed
// rather than left as a privacy control that controls nothing.
const DEFAULT_PRIVACY = {
  blockedAgencies: [],
};

// Opt-in, matching the consent banner. This used to default analytics to `true`
// (opt-out) while the banner defaulted to opt-in — two records in the same
// product disagreeing on the polarity of the same permission. The shared
// `pholio_consent` cookie is the effective gate; this row is the account-level
// mirror of it.
//
// `marketing` is deliberately absent: the canonical consent contract in
// `shared/lib/consent.js` has no marketing category, so a marketing toggle here
// was fake granularity over a permission the product does not model.
const DEFAULT_COOKIES = {
  analytics: false,
};

function parseJson(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function jsonForDb(value) {
  const isPostgres =
    knex.client.config.client === "pg" ||
    knex.client.config.client === "postgresql";
  return isPostgres ? value : JSON.stringify(value);
}

function cleanBoolean(value, fallback = false) {
  return value === undefined ? fallback : !!value;
}

function hasExplicitConsent(value) {
  return value === true || value === 1;
}

function isExplicitAdultAiEligible(profile) {
  return hasRecordedDateOfBirth(profile) && !isMinorProfile(profile);
}

async function hasColumn(db, table, column) {
  try {
    return await db.schema.hasColumn(table, column);
  } catch {
    return false;
  }
}

async function hasTable(db, table) {
  try {
    return await db.schema.hasTable(table);
  } catch {
    return false;
  }
}

function removeImageMetadataDerivatives(rawMetadata, image = {}) {
  const metadata = parseJson(rawMetadata, {});
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { changed: false, metadata: rawMetadata, columnUpdates: {} };
  }
  const next = { ...metadata };
  const classification = next.ai?.classification;
  const userAuthored = classification?.source === "user";
  if (userAuthored) {
    const preserved = {
      source: "user",
      confirmed: classification.confirmed === true,
      band: classification.band || "ask",
    };
    if (classification.review_deferred === true) {
      preserved.review_deferred = true;
    }
    for (const field of ["shot_type", "style_type", "image_type"]) {
      if (image[field] != null && String(image[field]).trim()) {
        preserved[field] = { value: image[field], source: "user" };
      }
    }
    next.ai = { classification: preserved };
  } else {
    delete next.ai;
  }

  const columnUpdates = {};
  if (classification && !userAuthored) {
    for (const field of ["shot_type", "style_type", "image_type"]) {
      columnUpdates[field] = null;
    }
  }
  return {
    changed: Object.hasOwn(metadata, "ai"),
    metadata: JSON.stringify(next),
    columnUpdates,
  };
}

/** Remove Pholio-held results derived from provider-backed image processing. */
async function purgeLocalImageDerivatives(db, profileId) {
  const profileColumns = [
    "image_analysis",
    "image_analyzed_at",
    "image_analysis_model",
    "look_descriptor",
    "look_descriptor_generated_at",
    "archetype",
    "fit_score_runway",
    "fit_score_editorial",
    "fit_score_commercial",
    "fit_score_lifestyle",
    "fit_score_swim_fitness",
    "fit_score_overall",
    "fit_scores_calculated_at",
    "photo_embedding",
    "vector_summary",
    "vector_summary_text",
    "visual_intel",
    "onboarding_predictions",
    "librarian_synthesis",
    "market_fit_rankings",
    "vibe_score",
    "predicted_height_cm",
    "predicted_weight_lbs",
    "predicted_bust",
    "predicted_waist",
    "predicted_hips",
    "predicted_hair_color",
    "predicted_eye_color",
    "predicted_skin_tone",
  ];

  const profileUpdate = {};
  for (const column of profileColumns) {
    if (await hasColumn(db, "profiles", column)) profileUpdate[column] = null;
  }
  if (await hasColumn(db, "profiles", "is_unicorn")) {
    profileUpdate.is_unicorn = false;
  }
  if (Object.keys(profileUpdate).length) {
    profileUpdate.updated_at = db.fn.now();
    await db("profiles").where({ id: profileId }).update(profileUpdate);
  }

  if (await hasTable(db, "images")) {
    const images = await db("images")
      .where({ profile_id: profileId })
      .select("id", "metadata", "shot_type", "style_type", "image_type");
    for (const image of images) {
      const next = removeImageMetadataDerivatives(image.metadata, image);
      if (next.changed) {
        await db("images").where({ id: image.id }).update({
          metadata:
            db.client.config.client === "pg" ||
            db.client.config.client === "postgresql"
              ? JSON.parse(next.metadata)
              : next.metadata,
          ...next.columnUpdates,
        });
      }
    }

    if (await hasColumn(db, "images", "embedding")) {
      await db("images").where({ profile_id: profileId }).update({ embedding: null });
    }
  }

  if (await hasTable(db, "image_signals")) {
    await db("image_signals")
      .whereIn("image_id", db("images").where({ profile_id: profileId }).select("id"))
      .del();
  }
  if (await hasTable(db, "image_classification_feedback")) {
    await db("image_classification_feedback").where({ profile_id: profileId }).del();
  }

  if (await hasTable(db, "onboarding_signals")) {
    const columns = [
      "ai_results",
      "archetype_runway_pct",
      "archetype_editorial_pct",
      "archetype_lifestyle_pct",
      "archetype_commercial_pct",
      "archetype_label",
      "casting_verdict",
    ];
    const update = {};
    for (const column of columns) {
      if (await hasColumn(db, "onboarding_signals", column)) update[column] = null;
    }
    if (Object.keys(update).length) {
      await db("onboarding_signals").where({ profile_id: profileId }).update(update);
    }
  }

  if (
    (await hasTable(db, "ai_profile_analysis")) &&
    (await hasColumn(db, "ai_profile_analysis", "profile_id"))
  ) {
    await db("ai_profile_analysis").where({ profile_id: profileId }).del();
  }
}

function requestEvidence(req) {
  return {
    actorUserId: req.session?.userId || null,
    actorType: "talent",
    requestIp: req.ip ? String(req.ip).slice(0, 64) : null,
    userAgent: req.get?.("user-agent")
      ? String(req.get("user-agent")).slice(0, 2048)
      : null,
  };
}

async function recordAiConsentEvent(db, {
  profileId,
  purpose,
  granted,
  eventType,
  deletionState,
  deletionError = null,
  relatedEventId = null,
  actorUserId = null,
  actorType = "system",
  requestIp = null,
  userAgent = null,
}) {
  if (!(await hasTable(db, "ai_processing_consent_events"))) return null;

  const id = uuidv4();
  await db("ai_processing_consent_events").insert({
    id,
    profile_id: profileId,
    actor_user_id: actorUserId,
    purpose,
    event_type: eventType,
    granted: !!granted,
    disclosure_version: AI_CONSENT_DISCLOSURE_VERSION,
    disclosure_hash: consentDisclosureHash(purpose),
    actor_type: actorType,
    request_ip: requestIp,
    user_agent: userAgent,
    deletion_state: deletionState,
    deletion_error: deletionError,
    related_event_id: relatedEventId,
    occurred_at: db.fn.now(),
  });
  return id;
}

async function latestDeletionStates(db, profileId) {
  const defaults = {
    image_analysis: "not_requested",
    agency_search_matching: "not_requested",
  };
  if (!(await hasTable(db, "ai_processing_consent_events"))) return defaults;

  const rows = await db("ai_processing_consent_events")
    .where({ profile_id: profileId })
    .whereIn("purpose", Object.keys(AI_CONSENT_PURPOSES))
    .orderBy("sequence", "desc");
  const states = { ...defaults };
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.purpose)) continue;
    states[row.purpose] = row.deletion_state;
    seen.add(row.purpose);
  }
  return states;
}

async function finishWithdrawal(db, pending, purge) {
  let deletionState = "complete";
  let deletionError = null;
  try {
    await purge();
  } catch (error) {
    deletionState = "failed";
    deletionError = String(error?.code || error?.name || "purge_failed").slice(0, 255);
    console.error("[AI consent] Local derivative purge failed", {
      purpose: pending.purpose,
      code: deletionError,
    });
  }

  await recordAiConsentEvent(db, {
    ...pending.evidence,
    profileId: pending.profileId,
    purpose: pending.purpose,
    granted: false,
    eventType:
      deletionState === "complete" ? "deletion_complete" : "deletion_failed",
    deletionState,
    deletionError,
    relatedEventId: pending.eventId,
  });
  return deletionState;
}

function cleanStringArray(value, max = 25) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .slice(0, max)
    .filter((v) => {
      const key = v.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function sanitizeNotifications(value) {
  const incoming = value && typeof value === "object" ? value : {};
  return {
    profileViews: cleanBoolean(
      incoming.profileViews,
      DEFAULT_NOTIFICATIONS.profileViews,
    ),
    applicationUpdates: cleanBoolean(
      incoming.applicationUpdates,
      DEFAULT_NOTIFICATIONS.applicationUpdates,
    ),
  };
}

function sanitizePrivacy(value) {
  const incoming = value && typeof value === "object" ? value : {};
  return {
    blockedAgencies: cleanStringArray(incoming.blockedAgencies),
  };
}

function sanitizeCookies(value) {
  const incoming = value && typeof value === "object" ? value : {};
  return {
    analytics: cleanBoolean(incoming.analytics, DEFAULT_COOKIES.analytics),
  };
}

async function hasSettingsTable() {
  return knex.schema.hasTable("talent_user_settings");
}

async function loadSettingsRow(userId) {
  if (!(await hasSettingsTable())) return null;
  return knex("talent_user_settings").where({ user_id: userId }).first();
}

async function ensureSettingsRow(userId) {
  if (!(await hasSettingsTable())) return null;

  const existing = await knex("talent_user_settings")
    .where({ user_id: userId })
    .first();
  if (existing) return existing;

  const row = {
    id: uuidv4(),
    user_id: userId,
    notification_preferences: jsonForDb(DEFAULT_NOTIFICATIONS),
    privacy_preferences: jsonForDb(DEFAULT_PRIVACY),
    cookie_preferences: jsonForDb(DEFAULT_COOKIES),
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  };

  await knex("talent_user_settings").insert(row);
  return knex("talent_user_settings").where({ user_id: userId }).first();
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatSubscription(subscription, profile) {
  const checkoutPlans = getStudioPlusCheckoutPlans();
  const defaultPlan = getStudioPlusPlan();

  if (!subscription) {
    const displayPlan = profile?.is_pro ? defaultPlan : null;
    return {
      planName: profile?.is_pro ? "Studio+" : "Free",
      status: profile?.is_pro ? "active" : "free",
      isPro: !!profile?.is_pro,
      isTrialing: false,
      billingInterval: displayPlan?.interval || defaultPlan.interval,
      priceLabel: displayPlan?.priceLabel || "$0",
      priceUnit: displayPlan?.priceUnit || "/month",
      trialDays: STUDIO_PLUS_PLAN.trialDays,
      billingDisclosureVersion: STUDIO_PLUS_PLAN.billingDisclosureVersion,
      checkoutPlans,
      renewalDate: null,
      trialEndDate: null,
      trialDaysRemaining: null,
      cancelAtPeriodEnd: false,
      stripeCustomerId: null,
    };
  }

  const active = isSubscriptionActive(subscription.status);
  const trialing = isInTrial(subscription);
  const displayPlan = active
    ? getStudioPlusPlanForPriceId(subscription.stripe_price_id, config)
    : null;
  const renewalLabel = displayPlan?.renewalLabel || defaultPlan.renewalLabel;

  return {
    planName: active ? "Studio+" : "Free",
    status: subscription.status,
    isPro: active,
    isTrialing: trialing,
    billingInterval: displayPlan?.interval || defaultPlan.interval,
    priceLabel: trialing ? "$0" : displayPlan?.priceLabel || "$0",
    priceUnit: trialing ? " during trial" : displayPlan?.priceUnit || "/month",
    trialDays: STUDIO_PLUS_PLAN.trialDays,
    billingDisclosureVersion: STUDIO_PLUS_PLAN.billingDisclosureVersion,
    checkoutPlans,
    renewalDate: formatDate(subscription.current_period_end),
    trialEndDate: formatDate(subscription.trial_end),
    trialDaysRemaining: getTrialDaysRemaining(subscription),
    renewalLabel,
    cancelAtPeriodEnd: isCanceling(subscription),
    stripeCustomerId: subscription.stripe_customer_id || null,
  };
}

/**
 * How the account signs in. Drives whether settings shows Google identity or an
 * email/password account, and whether offering a password reset is honest.
 *
 * Accounts that pre-date `users.auth_provider` carry a null column until their
 * next sign-in, so resolve it from Firebase once and persist rather than let the
 * surface describe a Google account as email-and-password. Still `null` when
 * genuinely unknown — the client treats that as unknown, not as a password login.
 */
async function resolveProvider(user) {
  const raw = await ensureAuthProvider(knex, user);
  if (!raw) return null;
  if (["google", "instagram", "apple", "facebook", "password"].includes(raw)) {
    return raw;
  }
  return "other";
}

async function buildSettingsPayload(userId, currentSid = null) {
  const [profile, user, settingsRow, subscription, devices] = await Promise.all([
    knex("profiles").where({ user_id: userId }).first(),
    knex("users").where({ id: userId }).first(),
    loadSettingsRow(userId),
    getSubscriptionStatus(userId),
    listUserDevices(knex, userId, currentSid),
  ]);

  const notifications = sanitizeNotifications({
    ...DEFAULT_NOTIFICATIONS,
    ...parseJson(settingsRow?.notification_preferences, {}),
  });
  const privacy = sanitizePrivacy({
    ...DEFAULT_PRIVACY,
    ...parseJson(settingsRow?.privacy_preferences, {}),
  });
  const cookies = sanitizeCookies({
    ...DEFAULT_COOKIES,
    ...parseJson(settingsRow?.cookie_preferences, {}),
  });
  const [hasImageConsentColumn, hasEmbeddingConsentColumn] = await Promise.all([
    hasColumn(knex, "profiles", "ai_processing_consent"),
    hasColumn(knex, "profiles", "embedding_processing_consent"),
  ]);
  const adultEligible = isExplicitAdultAiEligible(profile);
  const deletionStates = profile
    ? await latestDeletionStates(knex, profile.id)
    : {
        image_analysis: "not_requested",
        agency_search_matching: "not_requested",
      };

  const provider = await resolveProvider(user);

  return {
    slug: profile?.slug || null,
    isPublic: profile?.is_public !== undefined ? !!profile.is_public : true,
    isDiscoverable: !!profile?.is_discoverable,
    notifications,
    blockedAgencies: privacy.blockedAgencies,
    cookies,
    ai: {
      imageProcessing: hasImageConsentColumn
        ? hasExplicitConsent(profile?.ai_processing_consent)
        : false,
      profileEmbedding: hasEmbeddingConsentColumn
        ? hasExplicitConsent(profile?.embedding_processing_consent)
        : false,
      imageProcessingDeletionState: deletionStates.image_analysis,
      profileEmbeddingDeletionState:
        deletionStates.agency_search_matching,
      disclosureVersion: AI_CONSENT_DISCLOSURE_VERSION,
      imageProcessingDisclosure:
        AI_CONSENT_PURPOSES.image_analysis.disclosure,
      profileEmbeddingDisclosure:
        AI_CONSENT_PURPOSES.agency_search_matching.disclosure,
      disclosureHashes: {
        imageProcessing: consentDisclosureHash("image_analysis"),
        profileEmbedding: consentDisclosureHash("agency_search_matching"),
      },
      canEnable:
        adultEligible && hasImageConsentColumn && hasEmbeddingConsentColumn,
      imageProcessingAvailable:
        process.env.PHOLIO_ENABLE_IMAGE_ANALYSIS === "true",
      profileEmbeddingAvailable:
        process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS === "true",
    },
    data: {
      exportRequestedAt: formatDate(settingsRow?.data_export_requested_at),
    },
    account: {
      deactivatedAt: formatDate(settingsRow?.account_deactivated_at),
      isDeactivated: !!settingsRow?.account_deactivated_at,
    },
    subscription: formatSubscription(subscription, profile),
    // Live sessions, one per device, described from data recorded at sign-in.
    // Never includes expired rows: those are not devices.
    devices,
    user: user
      ? {
          id: user.id,
          email: user.email,
          role: user.role,
          createdAt: formatDate(user.created_at),
          authProvider: provider,
          // A Google/Instagram account has no Pholio password to reset, so the
          // client must not offer one.
          canResetPassword: provider === null || provider === "password",
        }
      : null,
  };
}

/**
 * GET /api/talent/settings
 * Get all settings needed by the talent settings surface.
 */
router.get(
  "/settings",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    await ensureSettingsRow(req.session.userId);
    const settings = await buildSettingsPayload(req.session.userId, req.sessionID);
    return res.json({ success: true, settings });
  }),
);

/**
 * POST /api/talent/discoverability
 * Update discoverability (Scout pool opt-in); canonical talent route (was legacy api.js).
 */
router.post(
  "/discoverability",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { isDiscoverable } = req.body;
    const userId = req.session.userId;

    const profile = await knex("profiles")
      .where({ user_id: userId })
      .first("id");
    await knex("profiles").where({ user_id: userId }).update({
      is_discoverable: !!isDiscoverable,
      updated_at: knex.fn.now(),
    });

    // Discover semantic layer §3.5: `is_discoverable` decides whether the
    // hourly sweep considers this profile at all, so opting in has to build
    // the corpus rather than wait for a later edit to trigger it.
    if (profile) {
      scheduleDiscoverReindex(profile.id, { reason: "discoverability" });
    }

    res.json({ success: true, isDiscoverable: !!isDiscoverable });
  }),
);

/**
 * PUT /api/talent/settings
 * Update one or more settings sections.
 */
router.put(
  "/settings",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    const {
      slug,
      isPublic,
      isDiscoverable,
      blockedAgencies,
      notifications,
      cookies,
      aiProcessingConsent,
      embeddingProcessingConsent,
      aiConsentDisclosureVersion,
    } = req.body || {};

    const profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return apiResponse.notFound(res, "Profile not found");
    }

    const requestedAiConsents = [
      aiProcessingConsent,
      embeddingProcessingConsent,
    ].filter((value) => value !== undefined);
    if (requestedAiConsents.some((value) => typeof value !== "boolean")) {
      return apiResponse.error(
        res,
        "AI processing preferences must be true or false.",
        400,
      );
    }
    if (
      requestedAiConsents.some((value) => value === true) &&
      !isExplicitAdultAiEligible(profile)
    ) {
      return apiResponse.error(
        res,
        "Image analysis and profile indexing are available only to adults with a valid date of birth on file.",
        403,
      );
    }
    if (
      requestedAiConsents.some((value) => value === true) &&
      aiConsentDisclosureVersion !== AI_CONSENT_DISCLOSURE_VERSION
    ) {
      return apiResponse.error(
        res,
        "Review the current optional-processing disclosure before granting permission.",
        409,
      );
    }
    if (requestedAiConsents.length) {
      const [hasImageConsentColumn, hasEmbeddingConsentColumn] =
        await Promise.all([
          hasColumn(knex, "profiles", "ai_processing_consent"),
          hasColumn(knex, "profiles", "embedding_processing_consent"),
        ]);
      if (!hasImageConsentColumn || !hasEmbeddingConsentColumn) {
        return apiResponse.error(
          res,
          "AI processing settings are not available until the current database migration is applied.",
          503,
        );
      }
    }

    const profileUpdate = { updated_at: knex.fn.now() };

    if (aiProcessingConsent !== undefined) {
      profileUpdate.ai_processing_consent = aiProcessingConsent;
    }
    if (embeddingProcessingConsent !== undefined) {
      profileUpdate.embedding_processing_consent = embeddingProcessingConsent;
    }

    if (slug !== undefined) {
      const cleanSlug = String(slug)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      if (cleanSlug && cleanSlug !== profile.slug) {
        profileUpdate.slug = await ensureUniqueSlug(knex, "profiles", cleanSlug);
      }
    }

    if (isPublic !== undefined) {
      const wantsPublic = !!isPublic;
      if (wantsPublic && !minorPublicExposureAllowed(profile)) {
        return apiResponse.error(
          res,
          "A valid date of birth is required (and guardian consent for minors) before a profile can be made public.",
          403,
        );
      }
      profileUpdate.is_public = wantsPublic;
    }

    if (isDiscoverable !== undefined) {
      profileUpdate.is_discoverable = !!isDiscoverable;
    }

    const evidence = requestEvidence(req);
    const requestedPurposes = [
      ["image_analysis", aiProcessingConsent],
      ["agency_search_matching", embeddingProcessingConsent],
    ].filter(([, value]) => value !== undefined);
    const pendingWithdrawals = [];

    if (Object.keys(profileUpdate).length > 1 || requestedPurposes.length) {
      await knex.transaction(async (trx) => {
        if (Object.keys(profileUpdate).length > 1) {
          await trx("profiles").where({ id: profile.id }).update(profileUpdate);
        }

        for (const [purpose, granted] of requestedPurposes) {
          const currentGranted = hasExplicitConsent(
            profile[AI_CONSENT_PURPOSES[purpose].column],
          );
          if (granted === true) {
            if (!currentGranted) {
              await recordAiConsentEvent(trx, {
                ...evidence,
                profileId: profile.id,
                purpose,
                granted: true,
                eventType: "granted",
                deletionState: "not_requested",
              });
            }
            continue;
          }

          // Persist the withdrawal and its pending deletion evidence in the
          // same transaction before any purge work starts. Repeating `false`
          // intentionally retries a prior failed/pending deletion.
          const eventId = await recordAiConsentEvent(trx, {
            ...evidence,
            profileId: profile.id,
            purpose,
            granted: false,
            eventType: "withdrawn",
            deletionState: "pending",
          });
          pendingWithdrawals.push({
            profileId: profile.id,
            purpose,
            eventId,
            evidence,
          });
        }
      });
    }

    // Provider-side retention remains governed by the vendor agreement. These
    // states describe deletion of every derivative Pholio itself stores.
    for (const pending of pendingWithdrawals) {
      if (pending.purpose === "image_analysis") {
        await finishWithdrawal(knex, pending, async () => {
          await purgeLocalImageDerivatives(knex, profile.id);
          await purgeImageEmbeddingDerivatives(knex, profile.id);
        });
      } else {
        await finishWithdrawal(knex, pending, () =>
          purgeProfileEmbeddingDerivatives(knex, profile.id),
        );
      }
    }

    // Discover semantic layer (tasks/discover-semantic-2026-09.md §3.5). A
    // GRANT builds the corpus now instead of leaving the talent unsearchable
    // until the hourly sweep; a WITHDRAWAL has already been handled above by
    // purgeProfileEmbeddingDerivatives, which deletes the chunks and the photo
    // descriptions outright. Changing discoverability alone also reindexes,
    // because `is_discoverable` decides whether the profile is swept at all.
    if (embeddingProcessingConsent === true || isDiscoverable !== undefined) {
      scheduleDiscoverReindex(profile.id, { reason: "consent_or_discovery" });
    }

    const row = await ensureSettingsRow(userId);
    if (row) {
      const update = { updated_at: knex.fn.now() };

      if (notifications !== undefined) {
        update.notification_preferences = jsonForDb(
          sanitizeNotifications({
            ...DEFAULT_NOTIFICATIONS,
            ...parseJson(row.notification_preferences, {}),
            ...notifications,
          }),
        );
      }

      if (cookies !== undefined) {
        update.cookie_preferences = jsonForDb(
          sanitizeCookies({
            ...DEFAULT_COOKIES,
            ...parseJson(row.cookie_preferences, {}),
            ...cookies,
          }),
        );
      }

      if (blockedAgencies !== undefined) {
        update.privacy_preferences = jsonForDb(
          sanitizePrivacy({
            ...DEFAULT_PRIVACY,
            ...parseJson(row.privacy_preferences, {}),
            blockedAgencies,
          }),
        );
      }

      if (Object.keys(update).length > 1) {
        await knex("talent_user_settings").where({ id: row.id }).update(update);
      }
    }

    const settings = await buildSettingsPayload(userId, req.sessionID);
    return res.json({ success: true, settings });
  }),
);

router.post(
  "/settings/data-export",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    const row = await ensureSettingsRow(userId);
    if (row) {
      await knex("talent_user_settings").where({ id: row.id }).update({
        data_export_requested_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
    }

    const [exportPayload, settings] = await Promise.all([
      buildTalentDataExport(knex, userId),
      buildSettingsPayload(userId, req.sessionID),
    ]);

    return apiResponse.success(res, {
      requestedAt: new Date().toISOString(),
      export: {
        ...exportPayload,
        settings,
      },
    });
  }),
);

router.get(
  "/settings/legal-status",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const user = await knex("users").where({ id: req.session.userId }).first();
    const accepted = requireLegalAcceptance(user, { throwOnMissing: false });
    // Version + changelog come from the server so the acceptance dialog can't
    // drift from the version the gate actually enforces.
    return apiResponse.success(res, {
      needsAcceptance: !accepted,
      version: CURRENT_LEGAL_VERSION,
      changes: changelogFor(),
    });
  }),
);

/* ── Likeness consent (plan C6, §9.6 #7) ─────────────────────────────────────
   Marketing use and AI-replica likeness. Two independent permissions, granted
   and withdrawn one at a time on purpose: C6 requires them separate and never
   bundled, so there is no endpoint that sets both. */

router.get(
  "/settings/likeness-consent",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await knex("profiles")
      .where({ user_id: req.session.userId })
      .first("id");
    if (!profile) {
      return apiResponse.error(res, "Profile not found", 404);
    }
    const [state, history] = await Promise.all([
      consentState(knex, profile.id),
      consentHistory(knex, profile.id),
    ]);
    // The history is the talent's own record of what they agreed to. Theirs to
    // read is half of why it is kept.
    return apiResponse.success(res, { state, history });
  }),
);

router.post(
  "/settings/likeness-consent",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await knex("profiles")
      .where({ user_id: req.session.userId })
      .first("id");
    if (!profile) {
      return apiResponse.error(res, "Profile not found", 404);
    }

    const granting = req.body?.granted === true;
    const shared = {
      profileId: profile.id,
      purpose: req.body?.purpose,
      actorUserId: req.session.userId,
      actorType: "talent",
      requestIp: req.clientIp || req.ip || null,
      userAgent: req.get("user-agent") || null,
    };

    try {
      if (granting) {
        await grantConsent(knex, {
          ...shared,
          scope: req.body?.scope,
          usePurpose: req.body?.usePurpose,
          compensation: req.body?.compensation,
          startsOn: req.body?.startsOn,
          endsOn: req.body?.endsOn,
        });
      } else {
        await withdrawConsent(knex, shared);
      }
    } catch (error) {
      if (error instanceof LikenessConsentError) {
        // The refusals explain themselves in terms the talent can act on —
        // especially the Fashion Workers Act one — so they are passed through.
        return apiResponse.error(res, error.message, error.code === "unavailable" ? 503 : 400);
      }
      throw error;
    }

    const state = await consentState(knex, profile.id);
    return apiResponse.success(res, { state });
  }),
);

router.post(
  "/settings/legal-acceptance",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const terms = req.body?.terms_accepted === true;
    const privacy = req.body?.privacy_accepted === true;
    if (!terms || !privacy) {
      return res.status(400).json({
        error: "Validation error",
        message: "Terms and Privacy Policy acceptance are required.",
      });
    }

    await recordLegalAcceptance(knex, req.session.userId, {
      terms: true,
      privacy: true,
    });

    return apiResponse.success(res, { accepted: true });
  }),
);

router.post(
  "/settings/deactivate",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    const row = await ensureSettingsRow(userId);
    if (row) {
      await knex("talent_user_settings").where({ id: row.id }).update({
        account_deactivated_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
    }

    const update = {
      is_public: false,
      is_discoverable: false,
      updated_at: knex.fn.now(),
    };
    if (await knex.schema.hasColumn("profiles", "visibility_mode")) {
      update.visibility_mode = "deactivated";
    }
    await knex("profiles").where({ user_id: userId }).update(update);

    const settings = await buildSettingsPayload(userId, req.sessionID);
    return apiResponse.success(res, settings.account);
  }),
);

router.delete(
  "/settings/account",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    const result = await deleteUserAccount(knex, userId);

    // The account row (and everything cascaded from it) is gone from
    // Pholio's own systems either way, so we always sign the caller out and
    // redirect. What must stay truthful is whether erasure is actually
    // COMPLETE: if an R2/Firebase provider purge failed, `fullyErased` is
    // false and the failure was durably recorded for retry — the response
    // must not claim full erasure it hasn't verified.
    const { payload, status: responseStatus } =
      buildAccountDeletionResponse(result);

    if (!req.session) {
      return apiResponse.success(res, payload, responseStatus);
    }

    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      return apiResponse.success(res, payload, responseStatus);
    });
  }),
);

/**
 * End every session except the caller's own. The bulk action a talent actually
 * wants when something looks wrong — ending unrecognised devices one at a time
 * was the only option before.
 *
 * Registered before the `:sid` route so it isn't captured as a session id.
 */
router.delete(
  "/settings/sessions",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const result = await revokeOtherSessions(
      knex,
      req.session.userId,
      req.sessionID,
    );
    return apiResponse.success(res, result);
  }),
);

router.delete(
  "/settings/sessions/:sid",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    if (req.params.sid === req.sessionID) {
      return apiResponse.error(
        res,
        "You can't end the session you're currently using. Use log out instead.",
        400,
      );
    }

    const result = await revokeSession(knex, req.session.userId, req.params.sid);
    if (result.notFound) return apiResponse.notFound(res, "Session not found");
    return apiResponse.success(res, { revoked: result.revoked });
  }),
);

module.exports = router;
module.exports.aiConsent = {
  purgeLocalImageDerivatives,
  recordAiConsentEvent,
  finishWithdrawal,
};
module.exports.__testables = {
  AI_CONSENT_DISCLOSURE_VERSION,
  AI_CONSENT_PURPOSES,
  consentDisclosureHash,
  hasExplicitConsent,
  isExplicitAdultAiEligible,
  removeImageMetadataDerivatives,
  purgeLocalImageDerivatives,
  recordAiConsentEvent,
  finishWithdrawal,
};
