const express = require("express");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { isAgencyBlockedForTalent } = require("../../../shared/lib/blocked-agencies");
const { addMessage } = require("../../../shared/middleware/context");
const {
  sendApplicationStatusEmail,
  sendAgencyInviteEmail,
} = require("../../../shared/lib/email");
const {
  getSessionAgencyId,
} = require("../services/context");
const { v4: uuidv4 } = require("uuid");
const {
  findInvitation,
  createInvitation,
} = require("../services/agency-invitations");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const {
  getApplicationAccessDecision,
} = require("../services/minor-submission-access");

const router = express.Router();
// Keep the standard agency guard chain available for any /api/agency/* routes
// added here. The current routes are legacy page-form actions.
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

      const access = await getApplicationAccessDecision(knex, {
        agencyId,
        applicationId,
        allowMinor:
          req.session.agencyMembershipRole === "OWNER" ||
          req.session.agencyMembershipRole === "ADMIN",
      });
      if (!access.allowed && access.reason !== "not_found") {
        return res.status(403).json({
          error: "MINOR_SUBMISSION_ACCESS_DENIED",
          reason: access.reason,
        });
      }

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

      const nextStatus =
        action === "accept"
          ? "accepted"
          : action === "decline"
            ? "declined"
            : "archived";
      const acceptedAt = action === "accept" ? new Date() : null;
      const updateData = {
        status: nextStatus,
        updated_at: knex.fn.now(),
      };

      if (action === "accept") {
        updateData.accepted_at = acceptedAt;
        updateData.declined_at = null;
      } else if (action === "decline") {
        updateData.declined_at = knex.fn.now();
        updateData.accepted_at = null;
      } else {
        updateData.declined_at = null;
        updateData.accepted_at = null;
      }

      await knex.transaction(async (trx) => {
        await trx("applications").where({ id: applicationId }).update({
          ...updateData,
          updated_at: trx.fn.now(),
        });
      });

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

      // Page-route twin of the Discover invite in `inbox.js`. It recorded the
      // invitation the same way and inherited the same two defects, so it takes
      // the same fix: an invitation is its own record, never an application.
      // See `20260820100000_create_agency_invitations.js`.
      const [existingInvitation, existingApplication] = await Promise.all([
        findInvitation(knex, { agencyId, profileId }),
        knex("applications")
          .where({ profile_id: profileId, agency_id: agencyId })
          .first(),
      ]);

      if (existingInvitation || existingApplication) {
        const message = existingInvitation
          ? "You have already invited this talent"
          : "This talent has already applied to your agency";
        if (req.headers.accept?.includes("application/json")) {
          return res.status(409).json({ error: message });
        }
        addMessage(req, "error", message);
        return res.redirect("/dashboard/agency/discover");
      }

      const invitationId = await createInvitation(knex, {
        agencyId,
        profileId,
        id: uuidv4(),
      });

      if (!invitationId) {
        const message =
          "Invitations are briefly unavailable while Pholio finishes an update.";
        if (req.headers.accept?.includes("application/json")) {
          return res
            .status(503)
            .json({ error: "invitations_unavailable", message });
        }
        addMessage(req, "error", message);
        return res.redirect("/dashboard/agency/discover");
      }

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
