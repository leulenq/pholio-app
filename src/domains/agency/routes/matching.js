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
const {
  recordDecision,
  learnAgencyPreferences,
  auditFairness,
} = require("../../matching/preference-learner");

const router = express.Router();
mountAgencyApiGuard(router);

// Resolve the matching scope for a board the agency owns, or null.
async function ownedBoardScope(boardId, agencyId) {
  const board = await knex("boards").where({ id: boardId, agency_id: agencyId }).first();
  if (!board) return null;
  return { board, scope: { type: board.kind === "casting" ? "brief" : "board", id: boardId } };
}

async function scopePriorImportance(scope) {
  const row = await knex("match_criteria")
    .where({ scope_type: scope.type, scope_id: scope.id })
    .first();
  if (!row) return {};
  let sr = row.signal_relevance;
  if (typeof sr === "string") {
    try {
      sr = JSON.parse(sr);
    } catch {
      sr = {};
    }
  }
  return sr?.importance || {};
}

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

// Record a booker decision (a preference label) and re-learn the agency's model.
router.post(
  "/api/agency/boards/:boardId/candidates/:profileId/decision",
  requireRole("AGENCY"),
  async (req, res) => {
    try {
      const { boardId, profileId } = req.params;
      const agencyId = req.session.userId;
      const owned = await ownedBoardScope(boardId, agencyId);
      if (!owned) return res.status(404).json({ error: "Board not found" });

      const decision = String(req.body?.decision || "").toLowerCase();
      const allowed = ["advance", "shortlist", "pass", "book", "release"];
      if (!allowed.includes(decision)) {
        return res.status(400).json({ error: `decision must be one of ${allowed.join(", ")}` });
      }

      await recordDecision(knex, {
        agencyId,
        scopeType: owned.scope.type,
        scopeId: owned.scope.id,
        profileId,
        decision,
        evaluationId: req.body?.evaluationId || null,
        decidedBy: agencyId,
        notes: req.body?.notes || null,
      });

      // Update the learned model + refresh the fairness snapshot (monitoring only).
      const priorImportance = await scopePriorImportance(owned.scope);
      const learned = await learnAgencyPreferences(knex, {
        agencyId,
        scopeType: owned.scope.type,
        scopeId: owned.scope.id,
        priorImportance,
      });
      const fairness = await auditFairness(knex, {
        agencyId,
        scopeType: owned.scope.type,
        scopeId: owned.scope.id,
      }).catch(() => null);

      return res.json({
        ok: true,
        learned: learned
          ? { importance: learned.importance, alpha: learned.alpha, n: learned.n }
          : null,
        fairness: fairness ? { impactRatio: fairness.impactRatio, flagged: fairness.flagged } : null,
      });
    } catch (error) {
      console.error("[Matching API] decision error:", error);
      return res.status(500).json({ error: "Failed to record decision" });
    }
  },
);

// Fairness snapshot for the agency's decisions (impact ratio of a monitored attribute).
router.get(
  "/api/agency/boards/:boardId/fairness",
  requireRole("AGENCY"),
  async (req, res) => {
    try {
      const { boardId } = req.params;
      const agencyId = req.session.userId;
      const owned = await ownedBoardScope(boardId, agencyId);
      if (!owned) return res.status(404).json({ error: "Board not found" });

      const attribute = req.query?.attribute ? String(req.query.attribute) : "gender";
      const result = await auditFairness(knex, {
        agencyId,
        scopeType: owned.scope.type,
        scopeId: owned.scope.id,
        attribute,
      });
      return res.json(result);
    } catch (error) {
      console.error("[Matching API] fairness error:", error);
      return res.status(500).json({ error: "Failed to compute fairness audit" });
    }
  },
);

module.exports = router;
