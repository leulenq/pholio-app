const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { ensureAuthProvider } = require("../../auth/services/auth-provider");
const { ensureUniqueSlug } = require("../../../shared/lib/slugify");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const { deleteUserAccount } = require("../../../shared/lib/account-deletion");
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
} = require("../../../shared/lib/talent-age");

// Only the two categories `shared/services/notifications.js` actually consults.
// This used to also carry `emailFrequency` (immediate/daily/weekly — no digest
// job exists anywhere in the codebase), `marketing`, `newMessages`,
// `inAppApplications` and `emailNotifications`. None had a consumer, and
// `newMessages` contradicted an explicit decision documented in
// notifications.js: messages and interviews are never gated, because a booker
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

  const provider = await resolveProvider(user);

  return {
    slug: profile?.slug || null,
    isPublic: profile?.is_public !== undefined ? !!profile.is_public : true,
    isDiscoverable: !!profile?.is_discoverable,
    notifications,
    blockedAgencies: privacy.blockedAgencies,
    cookies,
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
      blockedAgencies,
      notifications,
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
