const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const {
  AUDIENCES,
  FIELD_GROUPS,
  WRITABLE_FIELD_AUDIENCE_PAIRS,
  FieldVisibilityError,
  loadFieldVisibility,
  applyFieldVisibilityUpdates,
} = require("../../../shared/lib/field-visibility");

/**
 * Per-field audience visibility — read/write API for the "public stats
 * opt-in" feature (Wave 2B/2C). Backend + API only; the toggle UI is deferred
 * to the paused profile-tab IA reorg.
 *
 * GET   /api/talent/field-visibility  — current map, merged over defaults.
 * PATCH /api/talent/field-visibility  — upsert one or more entries.
 * PUT   /api/talent/field-visibility  — alias of PATCH (same semantics).
 */

/**
 * Accepts either `{ updates: [{ field_key, audience, visible }, ...] }` or a
 * single flat `{ field_key, audience, visible }` body as shorthand for a
 * one-entry batch. Returns `null` (not an empty array) when the body has
 * neither shape, so the route can 400 with a clear message.
 */
function extractUpdates(body) {
  if (Array.isArray(body?.updates)) return body.updates;
  if (body && typeof body.field_key !== "undefined") {
    return [{ field_key: body.field_key, audience: body.audience, visible: body.visible }];
  }
  return null;
}

async function loadOwnerProfile(userId) {
  return knex("profiles").where({ user_id: userId }).first();
}

router.get(
  "/field-visibility",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnerProfile(req.session.userId);
    if (!profile) return apiResponse.notFound(res, "Profile not found");

    const visibility = await loadFieldVisibility(profile.id);
    return apiResponse.success(res, {
      visibility,
      fieldGroups: FIELD_GROUPS,
      audiences: AUDIENCES,
      writable: WRITABLE_FIELD_AUDIENCE_PAIRS,
    });
  }),
);

const handleUpdate = asyncHandler(async (req, res) => {
  const profile = await loadOwnerProfile(req.session.userId);
  if (!profile) return apiResponse.notFound(res, "Profile not found");

  const updates = extractUpdates(req.body || {});
  if (!updates || updates.length === 0) {
    return apiResponse.error(
      res,
      "Provide `updates` as a non-empty array of { field_key, audience, visible }.",
      400,
    );
  }

  try {
    const visibility = await applyFieldVisibilityUpdates(profile.id, updates, {
      profile,
    });
    return apiResponse.success(res, { visibility });
  } catch (err) {
    if (err instanceof FieldVisibilityError) {
      return apiResponse.error(res, err.message, err.status, { code: err.code });
    }
    throw err;
  }
});

router.patch("/field-visibility", requireRole("TALENT"), handleUpdate);
router.put("/field-visibility", requireRole("TALENT"), handleUpdate);

module.exports = router;
