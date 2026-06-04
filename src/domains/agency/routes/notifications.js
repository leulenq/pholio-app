const express = require("express");
const router = express.Router();
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const {
  listUserNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../../../shared/services/notifications");
const { getSessionActorUserId } = require("../services/context");

function resolveNotificationUserId(req) {
  return getSessionActorUserId(req.session) || req.session?.userId || null;
}

/**
 * GET /api/agency/notifications
 */
router.get(
  "/api/agency/notifications",
  requireRole("AGENCY"),
  asyncHandler(async (req, res) => {
    const userId = resolveNotificationUserId(req);
    if (!userId) {
      return apiResponse.unauthorized(res, "Agency session required");
    }
    const limit = req.query.limit;
    const data = await listUserNotifications(userId, { limit });
    return apiResponse.success(res, data);
  }),
);

/**
 * PATCH /api/agency/notifications/:id/read
 */
router.patch(
  "/api/agency/notifications/:id/read",
  requireRole("AGENCY"),
  asyncHandler(async (req, res) => {
    const userId = resolveNotificationUserId(req);
    if (!userId) {
      return apiResponse.unauthorized(res, "Agency session required");
    }
    const ok = await markNotificationRead(userId, req.params.id);
    if (!ok) {
      return apiResponse.notFound(res, "Notification not found");
    }
    const unreadCount = await getUnreadCount(userId);
    return apiResponse.success(res, { unreadCount });
  }),
);

/**
 * POST /api/agency/notifications/read-all
 */
router.post(
  "/api/agency/notifications/read-all",
  requireRole("AGENCY"),
  asyncHandler(async (req, res) => {
    const userId = resolveNotificationUserId(req);
    if (!userId) {
      return apiResponse.unauthorized(res, "Agency session required");
    }
    await markAllNotificationsRead(userId);
    return apiResponse.success(res, { unreadCount: 0 });
  }),
);

module.exports = router;
