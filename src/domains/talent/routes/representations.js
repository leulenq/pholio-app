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
} = require("../services/representations");

const router = express.Router();

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
    const rows = await listRepresentations(knex, profile.id);
    return apiResponse.success(res, {
      active: rows.filter((row) => row.status === "active"),
      history: rows.filter((row) => row.status === "ended"),
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

module.exports = router;
