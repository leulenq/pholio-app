const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const asyncHandler = require("express-async-handler");
const {
  getBlockedAgencyIds,
} = require("../../../shared/lib/blocked-agencies");

/**
 * GET /api/talent/agencies
 * List active agencies for discovery.
 */
router.get(
  "/",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await knex("profiles")
      .where({ user_id: req.session.userId })
      .first("is_pro");
    const isPro = !!profile?.is_pro;

    // 1. Fetch Agencies as organizations, not login rows
    const blockedAgencyIds = await getBlockedAgencyIds(
      knex,
      req.session.userId,
    );
    const agenciesQuery = knex("agencies")
      .where({ status: "ACTIVE" })
      .select(
        "id",
        "name",
        "location as agency_location",
        "website as agency_website",
        "description as agency_description",
        "logo_path as profile_image",
        "open_boards",
        "min_height_female",
        "max_height_female",
        "min_height_male",
        "max_height_male",
        "min_age",
        "max_age",
        "instagram_handle",
        "tiktok_handle",
        "youtube_handle",
      )
      // Match scoring is intentionally absent until it is backed by real
      // signals. A stable directory order is more useful than fabricated
      // affinity and prevents the chooser from reshuffling between requests.
      .orderBy("name", "asc")
      .orderBy("id", "asc");
    // Blocked organizations remain visible in the dedicated draft-management
    // list when a historical draft exists, but are never offered as a new
    // application destination.
    if (blockedAgencyIds.size > 0) {
      agenciesQuery.whereNotIn("id", [...blockedAgencyIds]);
    }
    const agencies = await agenciesQuery;

    // Normalize open_boards (JSON text on SQLite, array on PG) to a string[].
    const parseOpenBoards = (value) => {
      if (Array.isArray(value)) return value.filter(Boolean);
      if (typeof value === "string" && value.trim()) {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    const normalizedAgencies = agencies.map((agency) => ({
      ...agency,
      open_boards: parseOpenBoards(agency.open_boards),
    }));
    const result = isPro ? normalizedAgencies : normalizedAgencies.slice(0, 20);

    res.json({ success: true, data: result });
  }),
);

module.exports = router;
