/**
 * Intel — the talent-facing intelligence hub (tasks/intel-page-spec.md).
 *
 * One composed read powers the whole page:
 *   GET /api/talent/intel?days=30        → full payload (§6 backend shape)
 *   GET /api/talent/intel/day/:date     → scrub micro-ledger (Studio+)
 * Plus per-recipient share links (Capture v2):
 *   GET  /api/talent/intel/share-tokens
 *   POST /api/talent/intel/share-tokens { label, kind }
 *   DELETE /api/talent/intel/share-tokens/:id
 *
 * Tier gating follows the existing 7d/90d pattern: free clamps to 7 days,
 * Studio+ unlocks 90-day windows and scrub detail.
 */

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const { buildIntel, buildIntelDay } = require("../services/intel/compose");
const { generateShareToken } = require("../services/intel/capture");

async function loadOwnProfile(req) {
  return knex("profiles").where({ user_id: req.session.userId }).first();
}

/** Accept an IANA zone from the client; fall back to UTC on anything else. */
function resolveTimeZone(value) {
  const tz = String(value || "").trim();
  if (!tz || tz.length > 64) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

router.get(
  "/intel",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) {
      return apiResponse.error(res, "Profile not found", 404);
    }

    const isPro = Boolean(profile.is_pro);
    const maxDays = isPro ? 90 : 7;
    const requested = Number.parseInt(req.query.days, 10);
    const days = Math.min(
      Number.isFinite(requested) && requested > 0 ? requested : maxDays,
      maxDays,
    );

    // The talent's own zone, so "attention arrives Thursday afternoons" is
    // their afternoon. Validated against Intl before it reaches aggregation.
    const tz = resolveTimeZone(req.query.tz);

    const payload = await buildIntel(profile, { days, tz });
    payload.meta.tier = isPro ? "studio" : "free";
    payload.meta.maxDays = maxDays;

    // Free tier keeps the decision stack, submissions and materials — the parts
    // that tell a talent what to do. Market/source/timing detail and the ranked
    // book are Studio+. Withheld sections are omitted, never faked or blurred.
    if (!isPro && !payload.meta.minor) {
      if (payload.attention) {
        payload.attention.markets = null;
        payload.attention.sources = null;
        payload.attention.rhythm = null;
      }
      payload.book = null;
      payload.momentum = null;
      payload.decisions = payload.decisions.slice(0, 1);
    }

    return apiResponse.success(res, payload);
  }),
);

router.get(
  "/intel/day/:date",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await loadOwnProfile(req);
    if (!profile) {
      return apiResponse.error(res, "Profile not found", 404);
    }
    if (!profile.is_pro) {
      return apiResponse.error(res, "Studio+ subscription required", 403);
    }
    const date = String(req.params.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return apiResponse.error(res, "Invalid date", 400);
    }
    const detail = await buildIntelDay(profile, date);
    if (!detail) {
      return apiResponse.error(res, "Not available", 404);
    }
    return apiResponse.success(res, detail);
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
