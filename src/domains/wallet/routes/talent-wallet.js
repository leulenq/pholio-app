"use strict";

const express = require("express");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const { listRepresentations } = require("../../talent/services/representations");
const { getWalletPassConfig } = require("../services/pass-config");
const { buildWalletPass, WalletPassError } = require("../services/pass-builder");

const router = express.Router();
const appBaseUrl = (req) => String(process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");

router.get("/pass", requireRole("TALENT"), asyncHandler(async (req, res) => {
  const config = getWalletPassConfig();
  if (!config.configured) return res.status(503).json({ success: false, error: "Pholio ID Apple Wallet signing is not configured yet.", code: "WALLET_NOT_CONFIGURED" });
  const profile = await knex("profiles").where({ user_id: req.session.userId }).first();
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found." });
  const [user, image, representations] = await Promise.all([
    knex("users").where({ id: req.session.userId }).first("first_name", "last_name"),
    knex("images").where({ profile_id: profile.id }).where((query) => query.whereNull("asset_kind").orWhereNot("asset_kind", "video")).orderBy("is_primary", "desc").orderBy("sort", "asc").first("path", "public_url", "absolute_path", "storage_key"),
    listRepresentations(knex, profile.id, { includeHistory: false }),
  ]);
  try {
    const buffer = await buildWalletPass({ profile, user, image, representations, portfolioUrl: `${appBaseUrl(req)}/p/${encodeURIComponent(profile.slug)}`, config });
    return res.set({ "Content-Type": "application/vnd.apple.pkpass", "Content-Disposition": `attachment; filename="pholio-id-${profile.slug || profile.id}.pkpass"`, "Cache-Control": "private, no-store" }).send(buffer);
  } catch (error) {
    if (error instanceof WalletPassError) return res.status(error.status).json({ success: false, error: error.message, code: error.code });
    throw error;
  }
}));

module.exports = router;
