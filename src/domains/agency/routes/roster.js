const express = require("express");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { isAgencyBlockedForTalent } = require("../../../shared/lib/blocked-agencies");
const { addMessage } = require("../../../shared/middleware/context");
const {
  sendApplicationStatusEmail,
  sendAgencyInviteEmail,
} = require("../../../shared/lib/email");
const { getSessionAgencyId } = require("../services/context");
const { v4: uuidv4 } = require("uuid");
const { mountAgencyApiGuard } = require("./agency-api-guard");

const router = express.Router();
// Route the router's /api/agency/* endpoints (the measured-in-person writes)
// through the standard agency guard chain: role + onboarding-complete +
// permission enforcement. Non /api/agency paths on this router (page-form
// /agency/* and /dashboard/agency/* handlers) are unaffected by this mount.
mountAgencyApiGuard(router);

// POST /dashboard/agency/applications/:applicationId/accept
// POST /dashboard/agency/applications/:applicationId/decline
// POST /dashboard/agency/applications/:applicationId/archive
router.post(
  "/dashboard/agency/applications/:applicationId/:action",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req.session);
      const { applicationId, action } = req.params;

      if (!["accept", "archive", "decline"].includes(action)) {
        if (req.headers.accept?.includes("application/json")) {
          return res.status(400).json({ error: "Invalid action" });
        }
        addMessage(req, "error", "Invalid action");
        return res.redirect("/dashboard/agency/applicants");
      }

      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        if (req.headers.accept?.includes("application/json")) {
          return res.status(404).json({ error: "Application not found" });
        }
        addMessage(req, "error", "Application not found");
        return res.redirect("/dashboard/agency/applicants");
      }

      const updateData = {
        status:
          action === "accept"
            ? "accepted"
            : action === "decline"
              ? "declined"
              : "archived",
        updated_at: knex.fn.now(),
      };

      if (action === "accept") {
        updateData.accepted_at = knex.fn.now();
        updateData.declined_at = null;
      } else if (action === "decline") {
        updateData.declined_at = knex.fn.now();
        updateData.accepted_at = null;
      } else {
        updateData.declined_at = null;
        updateData.accepted_at = null;
      }

      await knex("applications")
        .where({ id: applicationId })
        .update(updateData);

      try {
        const profile = await knex("profiles")
          .where({ id: application.profile_id })
          .first();

        if (profile) {
          const talentUser = await knex("users")
            .where({ id: profile.user_id })
            .first();

          const agency = await knex("agencies").where({ id: agencyId }).first();

          if (talentUser && talentUser.email && agency && (action === "accept" || action === "decline")) {
            await sendApplicationStatusEmail({
              to: talentUser.email,
              talentName: `${profile.first_name} ${profile.last_name}`,
              agencyName: agency.name,
              status: action === "accept" ? "accepted" : "declined",
            });
          }
        }
      } catch (emailError) {
        console.error("[Application] Email send error:", emailError);
      }

      if (req.headers.accept?.includes("application/json")) {
        return res.json({ success: true, action });
      }

      addMessage(req, "success", `Application ${action}ed successfully`);
      return res.redirect("/dashboard/agency/applicants");
    } catch (error) {
      console.error("[Application] Error:", error);
      return next(error);
    }
  },
);

// NOTE: The GET /api/agency/discover/:profileId/preview handler that used to
// live here has been removed. It shadowed (and was mounted before) the
// canonical, guarded copy in inbox.js. inbox.js is the single source of truth
// for that endpoint (audit SEC-0.5 / P0-6 duplicate-route removal).

// POST /api/agency/roster/:profileId/measured - Confirm in-person measurement
// DELETE /api/agency/roster/:profileId/measured - Clear the confirmation
//
// WS6.4 / council review "copy honesty": self-reported
// `profiles.measurements_updated_at` only ever renders "last updated"; this
// is the ONLY write path allowed to set `measured_in_person_at` /
// `measured_by_agency_id`, the sole state permitted to render "measured in
// person / confirmed" (see migrations/20260710090500_profile_measured_in_person.js).
// Ownership mirrors the roster-profile check in inbox.js
// (`GET /api/agency/roster/:profileId`): the talent must actually be on this
// agency's roster (an application in an accepted/booked/represented state),
// not merely `is_discoverable`.
const ROSTER_STATUSES = ["accepted", "booked", "represented"];

async function requireRosterProfile(req, res) {
  const { profileId } = req.params;
  const agencyId = getSessionAgencyId(req.session);

  const application = await knex("applications")
    .where({ profile_id: profileId, agency_id: agencyId })
    .whereIn("status", ROSTER_STATUSES)
    .first();

  if (!application) {
    res.status(403).json({ error: "Talent is not on your roster" });
    return null;
  }

  const profile = await knex("profiles").where({ id: profileId }).first();
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return null;
  }

  return { profile, agencyId };
}

router.post(
  "/api/agency/roster/:profileId/measured",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const ctx = await requireRosterProfile(req, res);
      if (!ctx) return undefined;
      const { profileId } = req.params;
      const { agencyId } = ctx;

      const measuredInPersonAt = new Date();
      await knex("profiles")
        .where({ id: profileId })
        .update({
          measured_in_person_at: measuredInPersonAt,
          measured_by_agency_id: agencyId,
          updated_at: knex.fn.now(),
        });

      return res.json({
        success: true,
        measured_in_person_at: measuredInPersonAt.toISOString(),
        measured_by_agency_id: agencyId,
      });
    } catch (error) {
      console.error("[Roster Measured] Error setting measurement:", error);
      return next(error);
    }
  },
);

router.delete(
  "/api/agency/roster/:profileId/measured",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const ctx = await requireRosterProfile(req, res);
      if (!ctx) return undefined;
      const { profile, agencyId } = ctx;
      const { profileId } = req.params;

      // Only the agency that recorded the measurement (or an unset one) may
      // clear it — prevents a second roster-connected agency (e.g. a
      // placement agency on a shared talent) from erasing another agency's
      // confirmation.
      if (
        profile.measured_by_agency_id &&
        profile.measured_by_agency_id !== agencyId
      ) {
        return res.status(403).json({
          error: "Measurement was confirmed by a different agency",
        });
      }

      await knex("profiles")
        .where({ id: profileId })
        .update({
          measured_in_person_at: null,
          measured_by_agency_id: null,
          updated_at: knex.fn.now(),
        });

      return res.json({
        success: true,
        measured_in_person_at: null,
        measured_by_agency_id: null,
      });
    } catch (error) {
      console.error("[Roster Measured] Error clearing measurement:", error);
      return next(error);
    }
  },
);

// POST /dashboard/agency/discover/:profileId/invite - Invite talent from Discover
router.post(
  "/dashboard/agency/discover/:profileId/invite",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { profileId } = req.params;
      const agencyId = getSessionAgencyId(req.session);

      const profile = await knex("profiles")
        .where({ id: profileId, is_discoverable: true })
        .first();

      if (!profile) {
        if (req.headers.accept?.includes("application/json")) {
          return res
            .status(404)
            .json({ error: "Profile not found or not discoverable" });
        }
        addMessage(req, "error", "Profile not found or not discoverable");
        return res.redirect("/dashboard/agency/discover");
      }

      if (
        profile.user_id &&
        (await isAgencyBlockedForTalent(knex, profile.user_id, agencyId))
      ) {
        if (req.headers.accept?.includes("application/json")) {
          return res.status(403).json({
            error: "Contact blocked",
            message: "This talent has blocked contact from your agency.",
          });
        }
        addMessage(req, "error", "This talent has blocked contact from your agency.");
        return res.redirect("/dashboard/agency/discover");
      }

      const existingApplication = await knex("applications")
        .where({ profile_id: profileId, agency_id: agencyId })
        .first();

      if (existingApplication) {
        if (req.headers.accept?.includes("application/json")) {
          return res.status(409).json({ error: "Application already exists" });
        }
        addMessage(req, "error", "You have already invited this talent");
        return res.redirect("/dashboard/agency/discover");
      }

      const applicationId = uuidv4();
      await knex("applications").insert({
        id: applicationId,
        profile_id: profileId,
        agency_id: agencyId,
        status: "pending",
        invited_by_agency_id: agencyId,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      try {
        const talentUser = await knex("users")
          .where({ id: profile.user_id })
          .first();

        const agency = await knex("agencies").where({ id: agencyId }).first();

        if (talentUser && agency) {
          await sendAgencyInviteEmail({
            talentEmail: talentUser.email,
            talentName: `${profile.first_name} ${profile.last_name}`,
            agencyName: agency.name,
          });
        }
      } catch (emailError) {
        console.error("[Discover Invite] Email send error:", emailError);
      }

      if (req.headers.accept?.includes("application/json")) {
        return res.json({ success: true });
      }

      addMessage(
        req,
        "success",
        `Invitation sent to ${profile.first_name} ${profile.last_name}`,
      );
      return res.redirect("/dashboard/agency/discover");
    } catch (error) {
      console.error("[Discover Invite] Error:", error);
      return next(error);
    }
  },
);

module.exports = router;
