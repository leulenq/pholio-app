/**
 * Agency matching route — decision-support ranking for a board/brief's applicants.
 *
 * POST /api/agency/boards/:boardId/rank
 *   Evaluates every applicant on the board against the resolved criteria and
 *   returns a PROMETHEE partial order of fit briefs (comparability, not a forced
 *   total order), plus feasibility-failed candidates separately. This is decision
 *   support — a person decides — so the response carries the required disclosures.
 *
 * Body/query (optional): withCases (bool), withReasoning (bool).
 */

"use strict";

const express = require("express");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const { rankSet } = require("../../matching");
const { CANDIDATE_NOTICE } = require("../../matching/notice");

const router = express.Router();
mountAgencyApiGuard(router);

router.post(
  "/api/agency/boards/:boardId/rank",
  requireRole("AGENCY"),
  async (req, res, next) => {
    try {
      const { boardId } = req.params;
      const agencyId = req.session.userId;

      const board = await knex("boards")
        .where({ id: boardId, agency_id: agencyId })
        .first();
      if (!board) return res.status(404).json({ error: "Board not found" });

      const rows = await knex("board_applications as ba")
        .join("applications as a", "a.id", "ba.application_id")
        .join("profiles as p", "p.id", "a.profile_id")
        .where({ "ba.board_id": boardId, "a.agency_id": agencyId })
        .select("p.*");

      if (!rows.length) {
        return res.json({
          scope: { type: board.kind === "casting" ? "brief" : "board", id: boardId },
          ranked: [],
          ineligible: [],
          partial_order: { outranks: [], incomparable: [], tiers: [] },
          notice: null,
          candidate_notice: CANDIDATE_NOTICE,
        });
      }

      const truthy = (v) => v === true || v === "true" || v === "1" || v === 1;
      const withCases = truthy(req.body?.withCases ?? req.query?.withCases);
      const withReasoning = truthy(req.body?.withReasoning ?? req.query?.withReasoning);

      const scope = {
        type: board.kind === "casting" ? "brief" : "board",
        id: boardId,
      };

      const result = await rankSet(knex, scope, rows, {
        withCases,
        withReasoning,
        caseScopeIds: [boardId],
        persist: true,
      });

      return res.json({ ...result, candidate_notice: CANDIDATE_NOTICE });
    } catch (error) {
      console.error("[Matching API] rank error:", error);
      return res.status(500).json({ error: "Failed to rank candidates" });
    }
  },
);

module.exports = router;
