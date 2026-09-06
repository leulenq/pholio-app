"use strict";

const express = require("express");
const { z } = require("zod");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const {
  representationInputSchema,
  representationPatchSchema,
  listRepresentations,
  createRepresentation,
  updateRepresentation,
  endRepresentation,
  replaceActiveRepresentations,
  syncLegacyCurrentAgency,
} = require("../services/representations");

const router = express.Router();

/**
 * An agency-originated row awaiting this talent's answer (industry audit §3.2,
 * decision §7.6). The agency wrote it when it moved the application to
 * `represented`; until the talent confirms it, nothing reads it as
 * representation.
 */
const AGENCY_SOURCE = "agency";
const PENDING = "pending";

function isPendingAgencyRow(row) {
  return row?.source === AGENCY_SOURCE && row?.status === PENDING;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pending rows are answered, not edited. Letting the ordinary edit path touch
 * one would silently flip it to `active` (the talent service rebuilds every
 * edited row as active) — i.e. a talent could accidentally confirm a signing
 * by renaming its market, and an agency could word a row into acceptance.
 */
function rejectPendingMutation(res) {
  return res.status(409).json({
    success: false,
    message:
      "Confirm or decline this representation before changing its details",
    code: "REPRESENTATION_PENDING_CONFIRMATION",
  });
}

/**
 * The extra columns a pending row needs on screen — who wrote it, which board,
 * which application it came from — none of which the shared `toApi` shape
 * carries, because until now no row had them.
 */
async function loadPendingRepresentations(profileId) {
  const rows = await knex("talent_representations as tr")
    .leftJoin("agencies as a", "tr.agency_id", "a.id")
    .where({ "tr.profile_id": profileId, "tr.status": PENDING })
    .orderBy("tr.created_at", "asc")
    .select(
      "tr.id",
      "tr.agency_id",
      "a.name as agency_name",
      "tr.external_agency_name",
      "tr.relationship_type",
      "tr.market",
      "tr.territory",
      "tr.division",
      "tr.board_name",
      "tr.is_exclusive",
      "tr.status",
      "tr.started_on",
      "tr.source",
      "tr.originating_application_id",
      "tr.created_at",
    );

  return rows.map((row) => ({
    id: row.id,
    agency_id: row.agency_id || null,
    agency_name: row.agency_name || row.external_agency_name || null,
    external_agency_name: row.external_agency_name || null,
    relationship_type: row.relationship_type,
    market: row.market || null,
    territory: row.territory || null,
    division: row.division || null,
    board_name: row.board_name || null,
    is_exclusive: Boolean(row.is_exclusive),
    status: row.status,
    started_on: row.started_on ? String(row.started_on).slice(0, 10) : null,
    ended_on: null,
    source: row.source,
    originating_application_id: row.originating_application_id || null,
    pending_confirmation: true,
  }));
}

async function profileForSession(req, res) {
  const profile = await knex("profiles")
    .where({ user_id: req.session.userId })
    .first("id");
  if (!profile) {
    apiResponse.notFound(res, "Profile not found");
    return null;
  }
  return profile;
}

function validationFailure(res, error) {
  return res.status(400).json({
    success: false,
    message: "Validation failed",
    errors: error.flatten().fieldErrors,
  });
}

function mutationFailure(res, error) {
  const message = String(error?.message || "");
  if (
    error?.code === "23505" ||
    (error?.code === "SQLITE_CONSTRAINT" &&
      message.includes("UNIQUE constraint failed"))
  ) {
    return res.status(409).json({
      success: false,
      message: "That active representation already exists for this market",
      code: "REPRESENTATION_CONFLICT",
    });
  }
  if (error?.code === "REPRESENTATION_NOT_FOUND") {
    return apiResponse.notFound(res, "Representation not found");
  }
  if (
    error?.code === "23503" ||
    (error?.code === "SQLITE_CONSTRAINT" &&
      message.includes("FOREIGN KEY constraint failed"))
  ) {
    return res.status(400).json({
      success: false,
      message: "The selected agency does not exist",
      code: "INVALID_AGENCY",
    });
  }
  throw error;
}

router.get(
  "/profile/representations",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await profileForSession(req, res);
    if (!profile) return;
    const [rows, pending] = await Promise.all([
      listRepresentations(knex, profile.id),
      loadPendingRepresentations(profile.id),
    ]);
    return apiResponse.success(res, {
      active: rows.filter((row) => row.status === "active"),
      history: rows.filter((row) => row.status === "ended"),
      // Its own bucket, never mixed into `active`: a signing the talent has not
      // answered is not a relationship they have.
      pending,
    });
  }),
);

router.post(
  "/profile/representations",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await profileForSession(req, res);
    if (!profile) return;
    const parsed = representationInputSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed.error);
    try {
      const row = await knex.transaction((trx) =>
        createRepresentation(trx, profile.id, parsed.data),
      );
      return apiResponse.success(res, { representation: row }, 201);
    } catch (error) {
      return mutationFailure(res, error);
    }
  }),
);

router.put(
  "/profile/representations",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await profileForSession(req, res);
    if (!profile) return;
    const payloadSchema = z.object({
      representations: z.array(z.record(z.string(), z.unknown())).max(20),
    });
    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed.error);
    try {
      const result = await replaceActiveRepresentations(
        knex,
        profile.id,
        parsed.data.representations,
      );
      return apiResponse.success(res, result);
    } catch (error) {
      if (error instanceof z.ZodError) return validationFailure(res, error);
      return mutationFailure(res, error);
    }
  }),
);

router.patch(
  "/profile/representations/:id",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await profileForSession(req, res);
    if (!profile) return;
    const parsed = representationPatchSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed.error);
    const current = await knex("talent_representations")
      .where({ id: req.params.id, profile_id: profile.id })
      .first("id", "source", "status");
    if (!current) return apiResponse.notFound(res, "Representation not found");
    if (isPendingAgencyRow(current)) return rejectPendingMutation(res);
    let row;
    try {
      row = await knex.transaction((trx) =>
        updateRepresentation(trx, profile.id, req.params.id, parsed.data),
      );
    } catch (error) {
      return mutationFailure(res, error);
    }
    if (!row) return apiResponse.notFound(res, "Representation not found");
    return apiResponse.success(res, { representation: row });
  }),
);

router.delete(
  "/profile/representations/:id",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await profileForSession(req, res);
    if (!profile) return;
    const parsed = z
      .object({
        ended_on: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .safeParse(req.body || {});
    if (!parsed.success) return validationFailure(res, parsed.error);
    const current = await knex("talent_representations")
      .where({ id: req.params.id, profile_id: profile.id })
      .first("id", "source", "status");
    if (current && isPendingAgencyRow(current)) {
      return rejectPendingMutation(res);
    }
    const ended = await knex.transaction((trx) =>
      endRepresentation(
        trx,
        profile.id,
        req.params.id,
        parsed.data.ended_on,
      ),
    );
    if (!ended) return apiResponse.notFound(res, "Representation not found");
    return apiResponse.success(res, { ended: true });
  }),
);

/**
 * Answer an agency-originated signing.
 *
 * Shared by confirm and decline so the two share one ownership + state gate:
 *   404 — not this talent's row (another talent's row is *not found*, not
 *         forbidden: a 403 would confirm the id exists)
 *   409 — the row exists but is not an unanswered agency signing
 */
function answerPendingSigning(apply) {
  return asyncHandler(async (req, res) => {
    const profile = await profileForSession(req, res);
    if (!profile) return;

    const row = await knex("talent_representations")
      .where({ id: req.params.id, profile_id: profile.id })
      .first();
    if (!row) return apiResponse.notFound(res, "Representation not found");
    if (!isPendingAgencyRow(row)) {
      return res.status(409).json({
        success: false,
        message: "This representation is not awaiting your confirmation",
        code: "REPRESENTATION_NOT_PENDING",
      });
    }

    try {
      await knex.transaction(async (trx) => {
        await apply(trx, req, profile, row);
        await syncLegacyCurrentAgency(trx, profile.id);
      });
    } catch (error) {
      return mutationFailure(res, error);
    }

    const updated = await knex("talent_representations")
      .leftJoin("agencies", "talent_representations.agency_id", "agencies.id")
      .where("talent_representations.id", row.id)
      .first(
        "talent_representations.id",
        "talent_representations.status",
        "talent_representations.market",
        "talent_representations.board_name",
        "talent_representations.started_on",
        "talent_representations.ended_on",
        "talent_representations.confirmed_at",
        "talent_representations.declined_at",
        "agencies.name as agency_name",
      );
    return apiResponse.success(res, { representation: updated });
  });
}

// POST /api/talent/profile/representations/:id/confirm — the talent agrees the
// signing happened. Only now does the row become representation anyone reads.
router.post(
  "/profile/representations/:id/confirm",
  requireRole("TALENT"),
  answerPendingSigning(async (trx, req, profile, row) => {
    await trx("talent_representations")
      .where({ id: row.id, profile_id: profile.id, status: "pending" })
      .update({
        status: "active",
        confirmed_at: trx.fn.now(),
        confirmed_by_user_id: req.session.userId,
        declined_at: null,
        updated_at: trx.fn.now(),
      });
  }),
);

// POST /api/talent/profile/representations/:id/decline — the talent says this
// is not their relationship. The row is closed, not deleted: an agency claim
// the talent refused is a record worth keeping on both sides.
router.post(
  "/profile/representations/:id/decline",
  requireRole("TALENT"),
  answerPendingSigning(async (trx, req, profile, row) => {
    await trx("talent_representations")
      .where({ id: row.id, profile_id: profile.id, status: "pending" })
      .update({
        status: "ended",
        ended_on: today(),
        declined_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
  }),
);

module.exports = router;
