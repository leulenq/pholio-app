/**
 * Guardian consent verification routes (legal audit Phase 1).
 *
 * Mounted at the app root so it can serve both the authenticated talent API
 * (request a link) and the public guardian-facing verification surfaces (the
 * guardian is never logged in):
 *
 *  - POST /api/talent/guardian-consent/request  (requireRole TALENT, minors only)
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
  verifyConsentToken,
  persistProfileDateOfBirthIfNeeded,
  loadProfilePrimaryPhotoUrl,
  GuardianConsentEmailError,
} = require("../services/guardian-consent");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    const guardianEmail = String(req.body?.guardian_email || "").trim();
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

    try {
      const result = await createConsentRequest(knex, profile.id, {
        guardianEmail,
        guardianName,
        talentName,
        talentPhotoUrl,
        talentCity,
      });

      return apiResponse.success(res, {
        status: "pending",
        email_sent: true,
        guardian_email: maskEmail(guardianEmail),
        expires_at: result.expiresAt,
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
      throw err;
    }
  }),
);

/**
 * GET /api/talent/guardian-consent/verify?token=
 * Public endpoint for an SPA-driven verification UI. No auth: the guardian is not
 * a Pholio user.
 */
router.get(
  "/api/talent/guardian-consent/verify",
  asyncHandler(async (req, res) => {
    const token = String(req.query?.token || "").trim();
    const result = await verifyConsentToken(knex, token);
    if (!result.ok) {
      return apiResponse.error(res, "This consent link is not valid.", 400, {
        code: result.reason || "invalid",
      });
    }
    return apiResponse.success(res, {
      status: "verified",
      already_verified: result.reason === "already_verified",
    });
  }),
);

/**
 * GET /guardian-consent?token=
 * Public, guardian-facing page. Verifies the token server-side and renders a
 * standalone success/failure page (the guardian has no Pholio session).
 */
router.get(
  "/guardian-consent",
  asyncHandler(async (req, res) => {
    const token = String(req.query?.token || "").trim();
    const result = await verifyConsentToken(knex, token);
    return res.status(result.ok ? 200 : 400).render("guardian-consent", {
      title: "Guardian Consent · Pholio",
      layout: false,
      ok: result.ok,
      reason: result.reason || null,
    });
  }),
);

module.exports = router;
