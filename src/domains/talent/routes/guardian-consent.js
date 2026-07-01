/**
 * Guardian consent verification routes (legal audit Phase 1).
 *
 * Mounted at the app root so it can serve both the authenticated talent API
 * (request a link) and the public guardian-facing verification surfaces (the
 * guardian is never logged in):
 *
 *  - POST /api/talent/guardian-consent/request  (requireRole TALENT, minors only)
 *  - GET  /api/talent/guardian-consent/agency/:agencyId
 *  - GET  /api/talent/guardian-consent/verify    (public — JSON for the SPA)
 *  - GET  /guardian-consent                       (public — EJS success/failure page)
 */

const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const { isMinorProfile } = require("../../../shared/lib/talent-age");
const {
  createConsentRequest,
  inspectConsentToken,
  confirmConsentToken,
  persistProfileDateOfBirthIfNeeded,
  loadProfilePrimaryPhotoUrl,
  GuardianConsentEmailError,
  GuardianConsentRateLimitError,
  getAgencyConsentStatus,
} = require("../services/guardian-consent");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Build the disclosure context shown to a guardian before they consent.
 * Resolves the talent's display name and (for agency-scoped requests) the agency
 * name so the page can state precisely who is consenting and to what scope.
 * Read-only — used by the safe GET.
 */
async function buildDisclosure(request) {
  const profile = await knex("profiles")
    .where({ id: request.profile_id })
    .first("first_name", "last_name");
  const talentName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    "this talent";
  const agency = request.agency_id
    ? await knex("agencies").where({ id: request.agency_id }).first("name")
    : null;
  const scope = request.agency_id ? "agency" : "account";
  return {
    scope,
    talentName,
    guardianEmail: request.guardian_email || null,
    agencyName: agency?.name || null,
    expiresAt: request.expires_at || null,
  };
}

function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!domain) return null;
  const head = local.length <= 2 ? local[0] || "" : local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, local.length - head.length))}@${domain}`;
}

/**
 * POST /api/talent/guardian-consent/request
 * Talent submits the guardian's email; we email a one-time verification link.
 * Only valid for minor profiles — adults ignore guardian fields entirely.
 */
router.post(
  "/api/talent/guardian-consent/request",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    let profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return apiResponse.notFound(res, "Profile not found");
    }

    try {
      profile = await persistProfileDateOfBirthIfNeeded(
        knex,
        profile,
        req.body?.date_of_birth,
      );
    } catch (err) {
      if (err.code === "DOB_REQUIRED") {
        return apiResponse.error(
          res,
          "Add your date of birth before requesting guardian consent.",
          400,
          { code: "DOB_REQUIRED" },
        );
      }
      throw err;
    }

    if (!isMinorProfile(profile)) {
      return apiResponse.error(
        res,
        "Guardian consent is only required for talent under 18.",
        400,
        { code: "NOT_A_MINOR" },
      );
    }

    const guardianEmail = String(
      req.body?.guardian_email || profile.guardian_email || "",
    ).trim();
    if (!EMAIL_RE.test(guardianEmail)) {
      return apiResponse.error(res, "A valid guardian email is required.", 400, {
        code: "INVALID_GUARDIAN_EMAIL",
      });
    }

    const guardianName = req.body?.guardian_name
      ? String(req.body.guardian_name).trim().slice(0, 120)
      : null;
    const talentName =
      [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null;
    const talentPhotoUrl = await loadProfilePrimaryPhotoUrl(knex, profile.id);
    const talentCity = profile.city ? String(profile.city).trim() : null;
    const agencyId = req.body?.agency_id
      ? String(req.body.agency_id).trim()
      : null;
    let agency = null;
    if (agencyId) {
      if (!profile.guardian_consent_at) {
        return apiResponse.error(
          res,
          "Account-level guardian consent is required before requesting permission for an agency submission.",
          409,
          { code: "ACCOUNT_GUARDIAN_CONSENT_REQUIRED" },
        );
      }
      agency = await knex("agencies")
        .where({ id: agencyId, status: "ACTIVE" })
        .first("id", "name");
      if (!agency) {
        return apiResponse.notFound(res, "Agency not found");
      }
    }

    try {
      const result = await createConsentRequest(knex, profile.id, {
        guardianEmail,
        guardianName,
        talentName,
        talentPhotoUrl,
        talentCity,
        agencyId: agency?.id || null,
        agencyName: agency?.name || null,
      });

      return apiResponse.success(res, {
        status: "pending",
        email_sent: true,
        guardian_email: maskEmail(guardianEmail),
        expires_at: result.expiresAt,
        agency_id: agency?.id || null,
      });
    } catch (err) {
      if (err instanceof GuardianConsentEmailError) {
        return apiResponse.error(
          res,
          err.message,
          503,
          { code: err.code || "EMAIL_DELIVERY_FAILED" },
        );
      }
      if (err instanceof GuardianConsentRateLimitError) {
        return apiResponse.error(res, err.message, 429, {
          code: err.code || "RATE_LIMITED",
        });
      }
      throw err;
    }
  }),
);

router.get(
  "/api/talent/guardian-consent/agency/:agencyId",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await knex("profiles")
      .where({ user_id: req.session.userId })
      .first();
    if (!profile) return apiResponse.notFound(res, "Profile not found");

    const agency = await knex("agencies")
      .where({ id: req.params.agencyId })
      .first("id", "name");
    if (!agency) return apiResponse.notFound(res, "Agency not found");

    if (!isMinorProfile(profile)) {
      return apiResponse.success(res, {
        required: false,
        status: "not_required",
        agency_id: agency.id,
        agency_name: agency.name,
      });
    }

    const status = await getAgencyConsentStatus(knex, profile, agency.id);
    return apiResponse.success(res, {
      required: true,
      status: status.status,
      guardian_email: status.guardianEmail
        ? maskEmail(status.guardianEmail)
        : null,
      expires_at: status.expiresAt,
      verified_at: status.verifiedAt || null,
      account_consent_verified: Boolean(profile.guardian_consent_at),
      agency_id: agency.id,
      agency_name: agency.name,
    });
  }),
);

/**
 * GET /api/talent/guardian-consent/verify?token=
 * Public, read-only inspection endpoint (audit P0-4). A GET must be safe/
 * idempotent, so this ONLY reports the token's disclosure state — it never
 * grants consent. Confirmation happens via POST /api/talent/guardian-consent/confirm.
 */
router.get(
  "/api/talent/guardian-consent/verify",
  asyncHandler(async (req, res) => {
    const token = String(req.query?.token || "").trim();
    const result = await inspectConsentToken(knex, token);
    if (!result.ok && result.reason !== "already_verified") {
      return apiResponse.error(res, "This consent link is not valid.", 400, {
        code: result.reason || "invalid",
      });
    }
    const disclosure = await buildDisclosure(result.request);
    return apiResponse.success(res, {
      status: result.reason === "already_verified" ? "verified" : "pending",
      already_verified: result.reason === "already_verified",
      scope: disclosure.scope,
      talent_name: disclosure.talentName,
      guardian_email: maskEmail(disclosure.guardianEmail),
      agency_name: disclosure.agencyName,
      expires_at: disclosure.expiresAt,
    });
  }),
);

/**
 * POST /api/talent/guardian-consent/confirm
 * Public JSON confirm endpoint. The ONLY API path that may grant consent —
 * performs the atomic pending → verified transition.
 */
router.post(
  "/api/talent/guardian-consent/confirm",
  asyncHandler(async (req, res) => {
    const token = String(
      req.body?.token || req.query?.token || "",
    ).trim();
    const result = await confirmConsentToken(knex, token);
    if (!result.ok) {
      return apiResponse.error(res, "This consent link is not valid.", 400, {
        code: result.reason || "invalid",
      });
    }
    const agency = result.agencyId
      ? await knex("agencies").where({ id: result.agencyId }).first("name")
      : null;
    return apiResponse.success(res, {
      status: "verified",
      already_verified: result.reason === "already_verified",
      agency_name: agency?.name || null,
    });
  }),
);

/**
 * GET /guardian-consent?token=
 * Public, guardian-facing page. SAFE / READ-ONLY (audit P0-4): it inspects the
 * token and renders a disclosure page with a confirmation form. It performs no
 * writes — mail scanners, link-preview bots and browser prefetch can hit this
 * without ever granting consent. Consent is only recorded by the POST below.
 */
router.get(
  "/guardian-consent",
  asyncHandler(async (req, res) => {
    const token = String(req.query?.token || "").trim();
    const result = await inspectConsentToken(knex, token);

    // Terminal states (invalid / expired / revoked) show a failure page.
    if (!result.ok && result.reason !== "already_verified") {
      return res.status(400).render("guardian-consent", {
        title: "Guardian Consent · Pholio",
        layout: false,
        mode: "error",
        reason: result.reason || "invalid",
        token,
        disclosure: null,
        error: null,
      });
    }

    const disclosure = await buildDisclosure(result.request);

    // Already confirmed — show the confirmed state, no form.
    if (result.reason === "already_verified") {
      return res.status(200).render("guardian-consent", {
        title: "Guardian Consent · Pholio",
        layout: false,
        mode: "confirmed",
        reason: null,
        token,
        disclosure,
        error: null,
      });
    }

    // Pending + valid — render the disclosure with a POST form. No writes.
    return res.status(200).render("guardian-consent", {
      title: "Guardian Consent · Pholio",
      layout: false,
      mode: "disclose",
      reason: null,
      token,
      disclosure,
      error: null,
    });
  }),
);

/**
 * POST /guardian-consent
 * The guardian's affirmative action. The ONLY page path that grants consent:
 * performs the atomic pending → verified transition and renders the result.
 */
router.post(
  "/guardian-consent",
  express.urlencoded({ extended: false }),
  asyncHandler(async (req, res) => {
    const token = String(req.body?.token || "").trim();
    const result = await confirmConsentToken(knex, token);

    if (!result.ok) {
      // Re-inspect so an expired/revoked token can still be explained. If the
      // token vanished entirely we fall back to a generic invalid state.
      const inspected = await inspectConsentToken(knex, token);
      return res.status(400).render("guardian-consent", {
        title: "Guardian Consent · Pholio",
        layout: false,
        mode: "error",
        reason: result.reason || inspected.reason || "invalid",
        token,
        disclosure: null,
        error: null,
      });
    }

    const agency = result.agencyId
      ? await knex("agencies").where({ id: result.agencyId }).first("name")
      : null;
    return res.status(200).render("guardian-consent", {
      title: "Guardian Consent · Pholio",
      layout: false,
      mode: "confirmed",
      reason: null,
      token,
      disclosure: {
        scope: result.agencyId ? "agency" : "account",
        talentName: null,
        guardianEmail: null,
        agencyName: agency?.name || null,
        expiresAt: null,
      },
      error: null,
    });
  }),
);

module.exports = router;
