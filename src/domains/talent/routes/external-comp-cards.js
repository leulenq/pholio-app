"use strict";

const express = require("express");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const { collectExternalCardArtifacts, deleteMediaArtifacts } = require("../../../shared/lib/media-artifact-deletion");
const router = express.Router();

router.get("/", requireRole("TALENT"), asyncHandler(async (req, res) => {
  const profile = await knex("profiles").where({ user_id: req.session.userId }).first("id");
  if (!profile) return apiResponse.success(res, { cards: [], uploadsEnabled: false });
  const cards = await knex("external_comp_cards").where({ profile_id: profile.id }).whereNull("deleted_at").orderBy("created_at", "desc");
  return apiResponse.success(res, {
    uploadsEnabled: false,
    cards: cards.map(row => ({ id: row.id, filename: row.filename, mimeType: row.mime_type, sizeBytes: row.size_bytes, createdAt: row.created_at, url: null, sharingEnabled: false })),
  });
}));

// Deliberate launch mitigation: do not parse/store unmoderated attachments.
// Existing records remain available for erasure, not new distribution.
router.post("/", requireRole("TALENT"), (_req, res) => res.status(503).json({
  success: false, error: "EXTERNAL_COMP_CARDS_DISABLED",
  message: "External comp-card uploads are temporarily unavailable. You can create a comp card from your Pholio photos.",
}));

router.delete("/:id", requireRole("TALENT"), asyncHandler(async (req, res) => {
  const card = await knex("external_comp_cards").where({ id: req.params.id, user_id: req.session.userId }).first();
  if (!card) return apiResponse.notFound(res, "Comp card not found");
  const purge = await deleteMediaArtifacts(knex, {
    userId: req.session.userId, ...collectExternalCardArtifacts(card), source: `external-card:${card.id}`,
  });
  if (!purge.safeToDropReference) return res.status(503).json({ success: false, error: "MEDIA_ERASURE_RETRY_UNAVAILABLE", message: "Storage cleanup could not be recorded. Please try again." });
  await knex("external_comp_cards").where({ id: card.id, user_id: req.session.userId }).update({ deleted_at: new Date() });
  return apiResponse.success(res, { deleted: true, erasureStatus: purge.fullyErased ? "complete" : "pending_provider_purge" }, purge.fullyErased ? 200 : 202);
}));

module.exports = router;
