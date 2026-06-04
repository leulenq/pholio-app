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

/**
 * GET /api/talent/notifications
 */
router.get(
  "/notifications",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const limit = req.query.limit;
    const data = await listUserNotifications(req.session.userId, { limit });
    return apiResponse.success(res, data);
  }),
);

/**
 * GET /api/talent/notifications/unread-count
 */
router.get(
  "/notifications/unread-count",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const unreadCount = await getUnreadCount(req.session.userId);
    return apiResponse.success(res, { unreadCount });
  }),
);

/**
 * PATCH /api/talent/notifications/:id/read
 */
router.patch(
  "/notifications/:id/read",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const ok = await markNotificationRead(req.session.userId, req.params.id);
    if (!ok) {
      return apiResponse.notFound(res, "Notification not found");
    }
    const unreadCount = await getUnreadCount(req.session.userId);
    return apiResponse.success(res, { unreadCount });
  }),
);

/**
 * POST /api/talent/notifications/read-all
 */
router.post(
  "/notifications/read-all",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    await markAllNotificationsRead(req.session.userId);
    return apiResponse.success(res, { unreadCount: 0 });
  }),
);

module.exports = router;
