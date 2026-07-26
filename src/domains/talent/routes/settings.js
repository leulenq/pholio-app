const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { ensureUniqueSlug } = require("../../../shared/lib/slugify");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const { deleteUserAccount } = require("../../../shared/lib/account-deletion");
const { buildTalentDataExport } = require("../../../shared/lib/data-export");
const {
  recordLegalAcceptance,
  requireLegalAcceptance,
} = require("../../../shared/lib/legal-acceptance");
const apiResponse = require("../../../shared/lib/api-response");
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
  canCollectSensitiveProfileFields,
  isSensitiveImageShotType,
} = require("../../../shared/lib/talent-age");

const DEFAULT_NOTIFICATIONS = {
  emailFrequency: "immediate",
  emailNotifications: true,
  profileViews: true,
  applicationUpdates: true,
  marketing: false,
  inAppApplications: true,
  newMessages: true,
};

const DEFAULT_DISPLAY = {
  watermark: false,
  cardLayout: "editorial",
  coverImage: "first",
};

const DEFAULT_PRIVACY = {
  showContact: true,
  blockedAgencies: [],
};

// Opt-in, matching the consent banner. This used to default analytics to `true`
// (opt-out) while the banner defaulted to opt-in — two records in the same
// product disagreeing on the polarity of the same permission. The shared
// `pholio_consent` cookie is the effective gate; this row is the account-level
// mirror of it.
const DEFAULT_COOKIES = {
  analytics: false,
  marketing: false,
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
  const frequency = ["immediate", "daily", "weekly"].includes(
    incoming.emailFrequency,
  )
    ? incoming.emailFrequency
    : DEFAULT_NOTIFICATIONS.emailFrequency;

  return {
    emailFrequency: frequency,
    emailNotifications: cleanBoolean(
      incoming.emailNotifications,
      DEFAULT_NOTIFICATIONS.emailNotifications,
    ),
    profileViews: cleanBoolean(
      incoming.profileViews,
      DEFAULT_NOTIFICATIONS.profileViews,
    ),
    applicationUpdates: cleanBoolean(
      incoming.applicationUpdates,
      DEFAULT_NOTIFICATIONS.applicationUpdates,
    ),
    marketing: cleanBoolean(incoming.marketing, DEFAULT_NOTIFICATIONS.marketing),
    inAppApplications: cleanBoolean(
      incoming.inAppApplications,
      DEFAULT_NOTIFICATIONS.inAppApplications,
    ),
    newMessages: cleanBoolean(
      incoming.newMessages,
      DEFAULT_NOTIFICATIONS.newMessages,
    ),
  };
}

function sanitizeDisplay(value) {
  const incoming = value && typeof value === "object" ? value : {};
  const layout = ["editorial", "classic", "minimal"].includes(
    incoming.cardLayout,
  )
    ? incoming.cardLayout
    : DEFAULT_DISPLAY.cardLayout;
  const cover = ["first", "latest", "featured"].includes(incoming.coverImage)
    ? incoming.coverImage
    : DEFAULT_DISPLAY.coverImage;

  return {
    watermark: cleanBoolean(incoming.watermark, DEFAULT_DISPLAY.watermark),
    cardLayout: layout,
    coverImage: cover,
  };
}

function sanitizePrivacy(value) {
  const incoming = value && typeof value === "object" ? value : {};
  return {
    showContact: cleanBoolean(incoming.showContact, DEFAULT_PRIVACY.showContact),
    blockedAgencies: cleanStringArray(incoming.blockedAgencies),
  };
}

function sanitizeCookies(value) {
  const incoming = value && typeof value === "object" ? value : {};
  return {
    analytics: cleanBoolean(incoming.analytics, DEFAULT_COOKIES.analytics),
    marketing: cleanBoolean(incoming.marketing, DEFAULT_COOKIES.marketing),
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
    display_preferences: jsonForDb(DEFAULT_DISPLAY),
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

async function listSignedInSessions(userId) {
  const exists = await knex.schema.hasTable("sessions");
  if (!exists) return [];

  const rows = await knex("sessions").select("sid", "sess", "expired");
  const now = Date.now();

  return rows
    .map((row) => {
      const sess = parseJson(row.sess, {});
      if (sess.userId !== userId) return null;
      const expiredAt = row.expired ? new Date(row.expired) : null;
      return {
        id: row.sid,
        device: "Browser session",
        location: "Current workspace",
        active: expiredAt ? expiredAt.getTime() > now : true,
        expiresAt: expiredAt ? expiredAt.toISOString() : null,
        isCurrent: false,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.expiresAt || "").localeCompare(a.expiresAt || ""));
}

async function buildSettingsPayload(userId, currentSid = null) {
  const [profile, user, settingsRow, subscription, sessions] =
    await Promise.all([
      knex("profiles").where({ user_id: userId }).first(),
      knex("users").where({ id: userId }).first(),
      loadSettingsRow(userId),
      getSubscriptionStatus(userId),
      listSignedInSessions(userId),
    ]);

  const notifications = sanitizeNotifications({
    ...DEFAULT_NOTIFICATIONS,
    ...parseJson(settingsRow?.notification_preferences, {}),
  });
  const display = sanitizeDisplay({
    ...DEFAULT_DISPLAY,
    ...parseJson(settingsRow?.display_preferences, {}),
  });
  const privacy = sanitizePrivacy({
    ...DEFAULT_PRIVACY,
    ...parseJson(settingsRow?.privacy_preferences, {}),
  });
  const cookies = sanitizeCookies({
    ...DEFAULT_COOKIES,
    ...parseJson(settingsRow?.cookie_preferences, {}),
  });

  return {
    slug: profile?.slug || null,
    isPublic: profile?.is_public !== undefined ? !!profile.is_public : true,
    isDiscoverable: !!profile?.is_discoverable,
    notifications,
    display,
    showContact: privacy.showContact,
    blockedAgencies: privacy.blockedAgencies,
    cookies,
    data: {
      exportRequestedAt: formatDate(settingsRow?.data_export_requested_at),
      erasureRequestedAt: formatDate(settingsRow?.data_erasure_requested_at),
    },
    account: {
      deactivatedAt: formatDate(settingsRow?.account_deactivated_at),
      isDeactivated: !!settingsRow?.account_deactivated_at,
    },
    subscription: formatSubscription(subscription, profile),
    invoices: [],
    sessions: sessions.map((session) => ({
      ...session,
      isCurrent: currentSid ? session.id === currentSid : false,
    })),
    user: user
      ? {
          id: user.id,
          email: user.email,
          role: user.role,
          createdAt: formatDate(user.created_at),
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

    await knex("profiles").where({ user_id: userId }).update({
      is_discoverable: !!isDiscoverable,
      updated_at: knex.fn.now(),
    });

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
      showContact,
      blockedAgencies,
      notifications,
      display,
      cookies,
    } = req.body || {};

    const profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return apiResponse.notFound(res, "Profile not found");
    }

    const profileUpdate = { updated_at: knex.fn.now() };

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

    if (Object.keys(profileUpdate).length > 1) {
      await knex("profiles").where({ id: profile.id }).update(profileUpdate);
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

      if (display !== undefined) {
        update.display_preferences = jsonForDb(
          sanitizeDisplay({
            ...DEFAULT_DISPLAY,
            ...parseJson(row.display_preferences, {}),
            ...display,
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

      if (showContact !== undefined || blockedAgencies !== undefined) {
        const effectiveShowContact =
          showContact !== undefined ? !!showContact : undefined;
        if (effectiveShowContact && !minorPublicExposureAllowed(profile)) {
          return apiResponse.error(
            res,
            "A valid date of birth is required (and guardian consent for minors) before contact details can be shown publicly.",
            403,
          );
        }
        update.privacy_preferences = jsonForDb(
          sanitizePrivacy({
            ...DEFAULT_PRIVACY,
            ...parseJson(row.privacy_preferences, {}),
            ...(showContact !== undefined ? { showContact: effectiveShowContact } : {}),
            ...(blockedAgencies !== undefined ? { blockedAgencies } : {}),
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

router.post(
  "/settings/erasure-request",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    return res.status(400).json({
      error: "Use account deletion",
      message:
        "To permanently erase your personal data, delete your account from Danger Zone in Settings. That removes your profile, images, and account from Pholio.",
    });
  }),
);

router.get(
  "/settings/legal-status",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const user = await knex("users").where({ id: req.session.userId }).first();
    const accepted = requireLegalAcceptance(user, { throwOnMissing: false });
    return apiResponse.success(res, { needsAcceptance: !accepted });
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
    const payload = {
      deleted: !!result.deleted,
      fullyErased: !!result.fullyErased,
      erasureStatus: result.fullyErased ? "complete" : "pending_provider_purge",
    };

    if (!req.session) {
      return apiResponse.success(res, payload);
    }

    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      return apiResponse.success(res, { ...payload, redirect: "/login" });
    });
  }),
);

router.delete(
  "/settings/sessions/:sid",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    if (!(await knex.schema.hasTable("sessions"))) {
      return apiResponse.success(res, { revoked: false });
    }

    const row = await knex("sessions").where({ sid: req.params.sid }).first();
    if (!row) return apiResponse.notFound(res, "Session not found");

    const sess = parseJson(row.sess, {});
    if (sess.userId !== req.session.userId) {
      return apiResponse.notFound(res, "Session not found");
    }

    await knex("sessions").where({ sid: req.params.sid }).del();
    return apiResponse.success(res, { revoked: true });
  }),
);

module.exports = router;
