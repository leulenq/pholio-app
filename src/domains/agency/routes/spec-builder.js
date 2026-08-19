"use strict";

/*
 * Spec Builder — the agency authors the requirements its open-call applicants
 * are measured against.
 *
 * Everything published here is advisory. A1 invariant 3 keeps the open-call
 * path free and unlimited, so a requirement tells an applicant what is missing
 * and never stops them sending. That is stated in the payload rather than left
 * for the client to assume.
 */

const express = require("express");
const asyncHandler = require("express-async-handler");

const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { mountAgencyApiGuard } = require("./agency-api-guard");
const { getSessionAgencyId, getSessionActorUserId } = require("../services/context");
const {
  SpecAuthoringError,
  checkDraft,
  listBuilderRevisions,
  loadBuilderState,
  publishDraft,
  saveDraft,
} = require("../../spec-registry/authoring/spec-builder-service");

const router = express.Router();
mountAgencyApiGuard(router);

/**
 * The service raises typed authoring errors for every condition an agency can
 * reach — a missing website, no open call yet, a refused field. They are
 * answers, not faults, so they are surfaced verbatim rather than flattened into
 * a 500 by the shared handler.
 */
function handleAuthoringError(error, res, next) {
  if (error instanceof SpecAuthoringError) {
    return res.status(error.status || 422).json({
      success: false,
      error: error.code,
      message: error.message,
      details: error.details || null,
    });
  }
  return next(error);
}

/** GET /api/agency/spec-builder — draft, published state, and the vocabulary. */
router.get(
  "/api/agency/spec-builder",
  requireRole("AGENCY"),
  asyncHandler(async (req, res, next) => {
    try {
      const state = await loadBuilderState(knex, getSessionAgencyId(req));
      return res.json({ success: true, data: state });
    } catch (error) {
      return handleAuthoringError(error, res, next);
    }
  }),
);

/**
 * PUT /api/agency/spec-builder/draft
 *
 * Saves and re-checks in one call. The composed revision is validated against
 * the same rules the editorial package passes, and any problems come back with
 * the draft so the builder can show them in place while the agency is still
 * editing.
 */
router.put(
  "/api/agency/spec-builder/draft",
  requireRole("AGENCY"),
  asyncHandler(async (req, res, next) => {
    const agencyId = getSessionAgencyId(req);
    const draft = req.body?.draft;
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
      return res.status(400).json({
        success: false,
        error: "invalid_draft",
        message: "A draft object is required.",
      });
    }

    try {
      const state = await saveDraft(knex, {
        agencyId,
        userId: getSessionActorUserId(req),
        draft,
      });

      // A draft is saveable before it is publishable — an agency may leave a
      // rule half-finished. Problems are reported, never a reason to lose work.
      let issues = [];
      try {
        ({ errors: issues } = await checkDraft(knex, agencyId, draft));
      } catch (error) {
        if (!(error instanceof SpecAuthoringError)) throw error;
        issues = [{ code: error.code, location: "/draft", message: error.message }];
      }

      return res.json({ success: true, data: { ...state, issues } });
    } catch (error) {
      return handleAuthoringError(error, res, next);
    }
  }),
);

/** POST /api/agency/spec-builder/publish — mint the next immutable revision. */
router.post(
  "/api/agency/spec-builder/publish",
  requireRole("AGENCY"),
  asyncHandler(async (req, res, next) => {
    try {
      const agencyId = getSessionAgencyId(req);
      const result = await publishDraft(knex, {
        agencyId,
        userId: getSessionActorUserId(req),
      });
      const state = await loadBuilderState(knex, agencyId);
      return res.json({ success: true, data: { ...result, ...state } });
    } catch (error) {
      return handleAuthoringError(error, res, next);
    }
  }),
);

/** GET /api/agency/spec-builder/revisions — the published history. */
router.get(
  "/api/agency/spec-builder/revisions",
  requireRole("AGENCY"),
  asyncHandler(async (req, res, next) => {
    try {
      const revisions = await listBuilderRevisions(knex, getSessionAgencyId(req));
      return res.json({ success: true, data: revisions });
    } catch (error) {
      return handleAuthoringError(error, res, next);
    }
  }),
);

module.exports = router;
