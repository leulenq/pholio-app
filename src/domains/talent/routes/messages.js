const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");

/**
 * Unified talent messaging surface.
 *
 * Threads are application-scoped (one conversation per agency submission). The
 * per-thread message list + compose already live on the applications router
 * (`/api/talent/applications/:id/messages`); these endpoints give the talent a
 * single inbox across every conversation, mirroring the agency threads view.
 */

async function getTalentProfileId(userId) {
  const profile = await knex("profiles")
    .where({ user_id: userId })
    .select("id")
    .first();
  return profile?.id || null;
}

/** Unread = messages FROM the agency the talent has not yet opened. */
function talentUnreadFilter(query, profileId) {
  return query
    .where("a.profile_id", profileId)
    .whereNot("a.status", "withdrawn")
    .where("m.sender_type", "AGENCY")
    .where("m.is_read", false);
}

/**
 * GET /api/talent/messages/threads
 * Every conversation the talent has, newest activity first, with per-thread and
 * total unread counts.
 */
router.get(
  "/threads",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profileId = await getTalentProfileId(req.session.userId);
    if (!profileId) {
      return apiResponse.success(res, { threads: [], unreadCount: 0 });
    }

    // Latest message timestamp per application.
    const latest = knex("messages")
      .select("application_id")
      .max("created_at as max_created_at")
      .groupBy("application_id")
      .as("latest");

    const rows = await knex("messages as m")
      .join("applications as a", "m.application_id", "a.id")
      .leftJoin("agencies as ag", "a.agency_id", "ag.id")
      .join(latest, function joinLatest() {
        this.on("m.application_id", "=", "latest.application_id");
        this.andOn("m.created_at", "=", "latest.max_created_at");
      })
      .where("a.profile_id", profileId)
      .whereNot("a.status", "withdrawn")
      .select(
        "a.id as id",
        "a.agency_id as agencyId",
        "a.status as status",
        "ag.name as agencyName",
        "ag.logo_path as agencyLogo",
        "m.message as preview",
        "m.sender_type as lastSenderType",
        "m.created_at as timestamp",
      )
      .orderBy("m.created_at", "desc");

    const unreadRows = await talentUnreadFilter(
      knex("messages as m").join("applications as a", "m.application_id", "a.id"),
      profileId,
    )
      .groupBy("m.application_id")
      .select("m.application_id")
      .count("* as count");

    const unreadMap = {};
    unreadRows.forEach((row) => {
      unreadMap[row.application_id] = Number(row.count) || 0;
    });

    const threads = rows.map((t) => {
      const unreadCount = unreadMap[t.id] || 0;
      return {
        id: t.id,
        agencyId: t.agencyId,
        agencyName: t.agencyName || "Agency",
        agencyLogo: t.agencyLogo || null,
        status: t.status,
        preview: t.preview || "",
        lastSenderType: t.lastSenderType,
        timestamp: t.timestamp,
        unread: unreadCount > 0,
        unreadCount,
      };
    });

    const unreadCount = threads.reduce((sum, t) => sum + t.unreadCount, 0);
    return apiResponse.success(res, { threads, unreadCount });
  }),
);

/**
 * GET /api/talent/messages/unread-count
 * Lightweight poll target for the inbox nav marker.
 */
router.get(
  "/unread-count",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profileId = await getTalentProfileId(req.session.userId);
    if (!profileId) {
      return apiResponse.success(res, { unreadCount: 0 });
    }

    const row = await talentUnreadFilter(
      knex("messages as m").join("applications as a", "m.application_id", "a.id"),
      profileId,
    )
      .count("* as count")
      .first();

    return apiResponse.success(res, { unreadCount: Number(row?.count || 0) });
  }),
);

module.exports = router;
