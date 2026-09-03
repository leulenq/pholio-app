"use strict";

const express = require("express");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const { listRepresentations } = require("../../talent/services/representations");
const { applyViewerVisibilityFilter, ensureModerationColumnChecked } = require("../../../shared/lib/content-moderation");
const { shortPortfolioUrl } = require("../../pdf/composition/portfolio-link");
const { getWalletPassConfig } = require("../services/pass-config");
const { THEMES, DEFAULT_THEME } = require("../services/pass-content");
const { buildWalletPass, WalletPassError } = require("../services/pass-builder");

const router = express.Router();
const appBaseUrl = (req) => String(process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");

function resolveThemeParam(value) {
  const key = String(value || "").trim().toLowerCase();
  return Object.hasOwn(THEMES, key) ? key : DEFAULT_THEME;
}

/**
 * Images the pass may be built from: the same set the public portfolio
 * shows (active, not excluded from public, moderation-visible), because a
 * Pholio ID is handed to casters.
 */
async function loadShareableImages(profileId) {
  await ensureModerationColumnChecked(knex);
  return knex("images")
    .where({ profile_id: profileId })
    .where(function () {
      this.whereNull("status").orWhere("status", "active");
    })
    .where(function () {
      this.whereNull("exclude_from_public").orWhere("exclude_from_public", false);
    })
    .modify((qb) => applyViewerVisibilityFilter(qb))
    .orderBy("is_primary", "desc")
    .orderBy("sort", "asc");
}

router.get("/pass", requireRole("TALENT"), asyncHandler(async (req, res) => {
  const config = getWalletPassConfig();
  if (!config.configured) {
    return res.status(503).json({ success: false, error: "Pholio ID Apple Wallet signing is not configured yet.", code: "WALLET_NOT_CONFIGURED" });
  }
  const profile = await knex("profiles").where({ user_id: req.session.userId }).first();
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found." });
  const [user, images, representations] = await Promise.all([
    knex("users").where({ id: req.session.userId }).first("first_name", "last_name"),
    loadShareableImages(profile.id),
    listRepresentations(knex, profile.id, { includeHistory: true }),
  ]);
  const theme = resolveThemeParam(req.query.theme);
  try {
    const buffer = await buildWalletPass({
      profile,
      user,
      images,
      representations,
      portfolioUrl: shortPortfolioUrl(profile, appBaseUrl(req)),
      config,
      theme,
    });
    return res
      .set({
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="pholio-id-${profile.slug || profile.id}.pkpass"`,
        "Cache-Control": "private, no-store",
      })
      .send(buffer);
  } catch (error) {
    if (error instanceof WalletPassError) {
      return res.status(error.status).json({ success: false, error: error.message, code: error.code });
    }
    throw error;
  }
}));

module.exports = router;
