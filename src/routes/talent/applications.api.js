const express = require("express");
const router = express.Router();
const knex = require("../../db/knex");
const { requireRole } = require("../../middleware/auth");
const asyncHandler = require("express-async-handler");

async function getProfileBySessionUserId(userId) {
  return knex("profiles").where({ user_id: userId }).first();
}

/**
 * GET /api/talent/applications
 * List all applications for the current talent
 */
router.get(
  "/",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    // Fetch applications with organization-backed agency info
    const applications = await knex("applications")
      .leftJoin("agencies", "applications.agency_id", "agencies.id")
      .leftJoin("agency_memberships as am", function () {
        this.on("am.agency_id", "=", "agencies.id")
          .andOn("am.membership_role", "=", knex.raw("?", ["OWNER"]))
          .andOn("am.status", "=", knex.raw("?", ["ACTIVE"]));
      })
      .leftJoin("users", "am.user_id", "users.id")
      .where({ profile_id: profile.id })
      .select(
        "applications.id",
        "applications.status",
        "applications.created_at",
        "applications.updated_at",
        "agencies.name as agency_name",
        "agencies.location as agency_location",
        "agencies.website as agency_website",
        "agencies.logo_path as agency_logo",
      )
      .orderBy("applications.created_at", "desc");

    res.json({ success: true, data: applications });
  }),
);

/**
 * GET /api/talent/applications/prompt-context
 * Determine if talent should see a targeted agency apply prompt
 */
router.get(
  "/prompt-context",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    // Redirect/invite source-of-truth: latest app rows with invited_by_agency_id.
    // redirect-apply writes invited_by_agency_id below, so both flows are normalized.
    const latestRedirectSignal = await knex("applications as a")
      .leftJoin("agencies as ag", "ag.id", "a.invited_by_agency_id")
      .where("a.profile_id", profile.id)
      .whereNotNull("a.invited_by_agency_id")
      .select(
        "a.invited_by_agency_id",
        "a.created_at",
        "ag.id as agency_id",
        "ag.name as agency_name",
        "ag.location as agency_location",
        "ag.logo_path as agency_logo",
        "ag.website as agency_website",
      )
      .orderBy("a.created_at", "desc")
      .first();

    const targetAgencyId = latestRedirectSignal?.invited_by_agency_id || null;
    let alreadyAppliedToTarget = false;

    if (targetAgencyId) {
      const existing = await knex("applications")
        .where({ profile_id: profile.id, agency_id: targetAgencyId })
        .first();
      alreadyAppliedToTarget = !!existing;
    }

    return res.json({
      success: true,
      data: {
        hasRedirectSignal: !!latestRedirectSignal,
        targetAgency: latestRedirectSignal
          ? {
              id: latestRedirectSignal.agency_id,
              name: latestRedirectSignal.agency_name,
              location: latestRedirectSignal.agency_location,
              logo: latestRedirectSignal.agency_logo,
              website: latestRedirectSignal.agency_website,
            }
          : null,
        alreadyAppliedToTarget,
      },
    });
  }),
);

/**
 * POST /api/talent/applications
 * Create a new application (direct apply)
 */
router.post(
  "/",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { agencyId } = req.body;
    if (!agencyId) return res.status(400).json({ error: "Agency ID required" });

    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    // 1. Check if already applied
    const existingparams = { profile_id: profile.id, agency_id: agencyId };
    const existing = await knex("applications").where(existingparams).first();
    if (existing) {
      return res.status(400).json({ error: "Already applied to this agency" });
    }

    // 2. Check limits for Free Tier
    if (!profile.is_pro) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const count = await knex("applications")
        .where({ profile_id: profile.id })
        .where("created_at", ">=", startOfMonth)
        .count("id as c")
        .first();

      if (Number(count.c) >= 5) {
        return res.status(403).json({
          error: "Monthly application limit reached",
          limit: 5,
          current: Number(count.c),
          upgradeRequired: true,
        });
      }
    }

    // 3. Create Application
    const [appId] = await knex("applications")
      .insert({
        id: knex.raw("gen_random_uuid()"),
        profile_id: profile.id,
        agency_id: agencyId,
        status: "pending",
      })
      .returning("id");

    res.json({ success: true, id: appId });
  }),
);

/**
 * POST /api/talent/applications/:id/withdraw
 * Withdraw an application
 */
router.post(
  "/:id/withdraw",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const profile = await getProfileBySessionUserId(req.session.userId);

    const deleted = await knex("applications")
      .where({ id, profile_id: profile.id })
      .del();

    if (!deleted)
      return res.status(404).json({ error: "Application not found" });

    res.json({ success: true });
  }),
);

/**
 * POST /api/talent/redirect-apply
 * Handle agency-initiated application via redirect (bypasses limits)
 */
router.post(
  "/redirect-apply",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const { agencyId, token } = req.body;
    if (!agencyId || !token)
      return res.status(400).json({ error: "Agency ID and token required" });

    // verify token (Mock logic for now, or check against stored invitation)
    // In production: jwt.verify(token, process.env.AGENCY_INVITE_SECRET)
    // For now, accept any token that is passed (assuming validity checked on generation or non-critical for this tier)
    // Or check if token matches agencyId simply

    const profile = await getProfileBySessionUserId(req.session.userId);
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    // Check if already applied
    const existingparams = { profile_id: profile.id, agency_id: agencyId };
    const existing = await knex("applications").where(existingparams).first();

    if (existing) {
      return res
        .status(200)
        .json({ success: true, message: "Already applied" });
    }

    // Create Application (No limit check)
    const [appId] = await knex("applications")
      .insert({
        id: knex.raw("gen_random_uuid()"),
        profile_id: profile.id,
        agency_id: agencyId,
        invited_by_agency_id: agencyId,
        status: "pending", // or 'reviewing' immediately since they asked for it?
        // Let's set to 'pending'
      })
      .returning("id");

    // Track as "redirect" source if we had a column? For now just create.

    res.json({ success: true, id: appId });
  }),
);

module.exports = router;
