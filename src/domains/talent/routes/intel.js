/**
 * Intel — Placement (tasks/intel-placement.md).
 *
 *   GET /api/talent/intel   → filing, shots, agencies, calendar
 *
 * Free for every tier: Intel is advice, and advice to models is never sold
 * (pholio-app-language banned-language §1).
 *
 * Per-recipient share links stay here (their opens are the talent's own
 * tracked links, not Intel's subject):
 *   GET  /api/talent/intel/share-tokens
 *   POST /api/talent/intel/share-tokens { label, kind }
 *   DELETE /api/talent/intel/share-tokens/:id
 */

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const { buildPlacement } = require("../services/placement");
const { generateShareToken } = require("../services/intel/capture");

async function loadOwnProfile(req) {
  return knex("profiles").where({ user_id: req.session.userId }).first();
}

router.get(
  "/intel",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) {
      return apiResponse.error(res, "Profile not found", 404);
    }
    const payload = await buildPlacement(profile, { userId: req.session.userId });
    return apiResponse.success(res, payload);
  }),
);

router.get(
  "/intel/share-tokens",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) {
      return apiResponse.error(res, "Profile not found", 404);
    }
    const rows = await knex("share_tokens")
      .where({ profile_id: profile.id })
      .whereNull("revoked_at")
      .orderBy("created_at", "desc")
      .select(
        "id",
        "token",
        "label",
        "kind",
        "open_count",
        "first_opened_at",
        "last_opened_at",
        "created_at",
      );
    return apiResponse.success(res, {
      tokens: rows.map((row) => ({
        ...row,
        url: `/portfolio/${profile.slug}?st=${row.token}`,
      })),
    });
  }),
);

router.post(
  "/intel/share-tokens",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) {
      return apiResponse.error(res, "Profile not found", 404);
    }
    const label = String(req.body?.label || "").trim().slice(0, 120) || null;
    const kind = req.body?.kind === "card" ? "card" : "portfolio";
    const row = {
      id: crypto.randomUUID(),
      profile_id: profile.id,
      token: generateShareToken(),
      label,
      kind,
    };
    await knex("share_tokens").insert(row);
    return apiResponse.success(
      res,
      {
        token: {
          ...row,
          open_count: 0,
          url: `/portfolio/${profile.slug}?st=${row.token}`,
        },
      },
      201,
    );
  }),
);

router.delete(
  "/intel/share-tokens/:id",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) {
      return apiResponse.error(res, "Profile not found", 404);
    }
    const updated = await knex("share_tokens")
      .where({ id: req.params.id, profile_id: profile.id })
      .whereNull("revoked_at")
      .update({ revoked_at: knex.fn.now() });
    if (!updated) {
      return apiResponse.error(res, "Share link not found", 404);
    }
    return apiResponse.success(res, { revoked: true });
  }),
);

module.exports = router;
