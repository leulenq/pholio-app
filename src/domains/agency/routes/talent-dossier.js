"use strict";

/**
 * GET /api/agency/applications/:applicationId/dossier
 *
 * The single aggregate read behind the expanded talent view. The dossier is a
 * strictly richer read of the same object `/details` returns, so it must never
 * be the looser door: it carries the same ownership check, the same
 * withdrawn-submission revocation, and it is registered in
 * MINOR_SUBMISSION_ENDPOINT_MATRIX so `enforceMinorSubmissionAccess` (mounted
 * by the agency API guard) gates it exactly as it gates `/details`.
 */

const express = require("express");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { getSessionAgencyId } = require("../services/context");
const { buildTalentDossier } = require("../services/talent-dossier");
const { mountAgencyApiGuard } = require("./agency-api-guard");

const router = express.Router();

mountAgencyApiGuard(router);

router.get(
  "/api/agency/applications/:applicationId/dossier",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { applicationId } = req.params;
      const agencyId = getSessionAgencyId(req.session);

      const application = await knex("applications")
        .where({ id: applicationId, agency_id: agencyId })
        .first();

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (application.status === "withdrawn") {
        return res.status(410).json({
          error: "application_withdrawn",
          message:
            "The talent withdrew this submission and Pholio revoked access to its disclosure package.",
        });
      }

      const dossier = await buildTalentDossier(knex, {
        application,
        agencyId,
      });

      if (!dossier) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // Opening the dossier is a read of the submission, same as /details.
      await knex("applications")
        .where({ id: applicationId })
        .update({ viewed_at: knex.fn.now() });

      return res.json({ success: true, data: dossier });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
