"use strict";

/**
 * Comp card studio API.
 *
 *   GET  /api/talent/compcard                    studio payload (profile facts, usable images, perception cache, saved card)
 *   PUT  /api/talent/compcard/perceptions/:id    cache perception for one of the talent's images
 *   PUT  /api/talent/compcard                    save the card (settings + composed scene)
 *   GET  /api/talent/compcard/pdf?variant=       the talent's saved card as PDF (digital | print)
 *   GET  /compcard/:slug.pdf              the saved card, for anyone the talent shares it with
 */

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const { minorPublicExposureAllowed } = require("../../../shared/lib/talent-age");
const { loadCardData, absoluteUrl, studioTables } = require("../services/card-data");

/** 503 when the comp card migration hasn't run on this database. */
async function requireStorage(res) {
  if (await studioTables()) return true;
  res.status(503).json({ success: false, error: "COMPCARD_STORAGE_MISSING", message: "Comp card storage isn't set up on this server yet (run migrations)." });
  return false;
}
const { sanitizeScene, SceneError } = require("../services/scene");
const { renderCardPdf } = require("../services/render-pdf");

const router = express.Router();
const PERCEPTION_MAX_BYTES = 200 * 1024;

async function ownSlug(req) {
  const row = await knex("profiles").where({ user_id: req.session.userId }).first("slug");
  return row?.slug || null;
}

function fileName(profile, variant) {
  const base = `${profile.first_name || ""}-${profile.last_name || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "comp-card";
  return `${base}-comp-card${variant === "print" ? "-print" : ""}.pdf`;
}

router.get(
  "/api/talent/compcard",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const slug = await ownSlug(req);
    if (!slug) return apiResponse.notFound(res, "Profile not found");
    const loaded = await loadCardData(slug);
    if (!loaded) return apiResponse.notFound(res, "Profile not found");
    return apiResponse.success(res, { data: loaded.data, perceptions: loaded.perceptions, card: loaded.card, storage: loaded.storage });
  }),
);

/**
 * Same-origin bytes of one of the talent's own photos, so the studio can
 * read pixels (face/body detection) regardless of the storage host's CORS.
 * Only the caller's images, only http(s) or local uploads — never a URL
 * from the request.
 */
const IMAGE_MAX_BYTES = 30 * 1024 * 1024;

function sniffImageType(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (b.toString("ascii", 4, 8) === "ftyp" && /avif|avis/.test(b.toString("ascii", 8, 12))) return "image/avif";
  if (b.toString("ascii", 0, 3) === "GIF") return "image/gif";
  return null;
}
router.get(
  "/api/talent/compcard/images/:imageId",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await knex("profiles").where({ user_id: req.session.userId }).first("id");
    if (!profile) return apiResponse.notFound(res, "Profile not found");
    const image = await knex("images").where({ id: req.params.imageId, profile_id: profile.id }).first("public_url", "path");
    if (!image) return apiResponse.notFound(res, "Photo not found");
    const src = image.public_url || image.path || "";
    if (!/^https?:\/\//i.test(src)) {
      if (!src.startsWith("/")) return apiResponse.notFound(res, "Photo not found");
      return res.redirect(src);
    }
    const upstream = await fetch(src);
    if (!upstream.ok) return apiResponse.error(res, "Photo unavailable", 502);
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > IMAGE_MAX_BYTES) return apiResponse.error(res, "Photo too large", 413);
    // Trust the bytes, not the storage host's header.
    const type = sniffImageType(buf);
    if (!type) return apiResponse.error(res, "Not an image", 502);
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.send(buf);
  }),
);

router.put(
  "/api/talent/compcard/perceptions/:imageId",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    if (!(await requireStorage(res))) return undefined;
    const profile = await knex("profiles").where({ user_id: req.session.userId }).first("id");
    if (!profile) return apiResponse.notFound(res, "Profile not found");
    const image = await knex("images").where({ id: req.params.imageId, profile_id: profile.id }).first("id", "public_url", "path");
    if (!image) return apiResponse.notFound(res, "Photo not found");
    const { version, data } = req.body || {};
    if (!Number.isInteger(version) || !data || typeof data !== "object") return apiResponse.error(res, "Invalid perception record", 400);
    const json = JSON.stringify(data);
    if (json.length > PERCEPTION_MAX_BYTES) return apiResponse.error(res, "Perception record too large", 413);
    const row = { image_id: image.id, version, source_url: image.public_url || image.path || null, data: json, created_at: new Date() };
    await knex("image_perceptions").insert(row).onConflict("image_id").merge(["version", "source_url", "data", "created_at"]);
    return apiResponse.success(res, { stored: true });
  }),
);

router.put(
  "/api/talent/compcard",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    if (!(await requireStorage(res))) return undefined;
    const slug = await ownSlug(req);
    if (!slug) return apiResponse.notFound(res, "Profile not found");
    const loaded = await loadCardData(slug);
    const imagesById = new Map(loaded.data.images.map((i) => [i.id, i]));
    let scene;
    try {
      scene = sanitizeScene(req.body?.scene, imagesById);
    } catch (e) {
      if (e instanceof SceneError) return apiResponse.error(res, e.message, 400);
      throw e;
    }
    const settings = req.body?.settings && typeof req.body.settings === "object" ? req.body.settings : {};
    const settingsJson = JSON.stringify(settings);
    if (settingsJson.length > 20000) return apiResponse.error(res, "Settings too large", 413);
    const notes = Array.isArray(req.body?.notes) ? req.body.notes.slice(0, 20).map((n) => ({ level: String(n.level || "note").slice(0, 10), text: String(n.text || "").slice(0, 300) })) : [];
    const now = new Date();
    const existing = await knex("comp_cards").where({ profile_id: loaded.profileId }).first("id");
    if (existing) {
      await knex("comp_cards").where({ id: existing.id }).update({ settings: settingsJson, scene: JSON.stringify(scene), notes: JSON.stringify(notes), updated_at: now });
    } else {
      await knex("comp_cards").insert({ id: uuidv4(), profile_id: loaded.profileId, settings: settingsJson, scene: JSON.stringify(scene), notes: JSON.stringify(notes), created_at: now, updated_at: now });
    }
    return apiResponse.success(res, { saved: true, updatedAt: now });
  }),
);

/**
 * Re-validate a stored scene against the profile's CURRENT images: a photo
 * removed, hidden by moderation or flagged for rights since the card was
 * saved must not print.
 */
function currentScene(loaded) {
  const imagesById = new Map(loaded.data.images.map((i) => [i.id, i]));
  const stored = loaded.card.scene;
  const filtered = {
    ...stored,
    pages: stored.pages.map((p) => ({
      ...p,
      elements: p.elements.filter((el) => el.type !== "photo" || !el.imageId || imagesById.has(el.imageId)),
    })),
  };
  return sanitizeScene(filtered, imagesById);
}

async function sendPdf(res, loaded, variant, disposition) {
  const scene = currentScene(loaded);
  const p = loaded.data.profile;
  const pdf = await renderCardPdf(scene, {
    variant,
    title: `${[p.first_name, p.last_name].filter(Boolean).join(" ")} — Comp card`,
    absoluteUrl,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${fileName(p, variant)}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-CompCard-Engine", "studio");
  return res.send(pdf);
}

router.get(
  "/api/talent/compcard/pdf",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const slug = await ownSlug(req);
    if (!slug) return apiResponse.notFound(res, "Profile not found");
    const loaded = await loadCardData(slug);
    if (!loaded?.card?.scene) return apiResponse.notFound(res, "Save your card before downloading it");
    return sendPdf(res, loaded, req.query.variant === "print" ? "print" : "digital", "attachment");
  }),
);

/** Public link to the saved card (agencies, submissions). Same consent gate as every outward document. */
async function servePublic(req, res, next) {
  const slug = String(req.params.slug || "").replace(/\.pdf$/i, "");
  const loaded = await loadCardData(slug);
  if (!loaded?.card?.scene) return next ? next() : apiResponse.notFound(res, "Comp card not found");
  if (!minorPublicExposureAllowed(loaded.profileRow)) {
    return res.status(403).json({ error: "Guardian consent is required before this comp card can be shared publicly.", code: "MINOR_CONSENT_REQUIRED" });
  }
  return sendPdf(res, loaded, req.query.variant === "print" ? "print" : "digital", "inline");
}

router.get(
  "/compcard/:slug",
  asyncHandler((req, res) => servePublic(req, res, null)),
);

module.exports = router;
module.exports.servePublic = servePublic;
