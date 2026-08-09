/**
 * Event-driven user notifications with dedupe/grouping via group_key.
 */

const { randomUUID } = require("crypto");
const knex = require("../db/knex");

const NOTIFICATION_TYPES = {
  AGENCY_PROFILE_VIEW: "agency_profile_view",
  APPLICATION_SUBMITTED: "application_submitted",
  APPLICATION_STATUS: "application_status",
  MESSAGE_RECEIVED: "message_received",
  PROFILE_NOT_SUBMISSION_READY: "profile_not_submission_ready",
  CONFIRMATION: "confirmation",
};

const PRIORITIES = {
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
};

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function serializeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  return JSON.stringify(metadata);
}

/**
 * Respect the talent's in-app notification preferences for the two opt-out-able
 * categories. Defaults are ON, so a missing/failed lookup never suppresses.
 * Time-sensitive categories (messages) are intentionally not gated here — a
 * booker reaching out always reaches the bell.
 *
 * @param {string} userId
 * @param {"profileViews"|"applicationUpdates"} prefKey
 * @returns {Promise<boolean>}
 */
async function talentNotificationPrefEnabled(userId, prefKey) {
  if (!userId || !prefKey) return true;
  try {
    if (!(await knex.schema.hasTable("talent_user_settings"))) return true;
    const row = await knex("talent_user_settings")
      .where({ user_id: userId })
      .select("notification_preferences")
      .first();
    if (!row) return true;
    const prefs = parseMetadata(row.notification_preferences);
    // Only an explicit `false` opts out; any other value keeps the default ON.
    return prefs?.[prefKey] !== false;
  } catch (err) {
    console.error("[Notifications] Preference lookup failed:", err);
    return true;
  }
}

function getTimeAgo(date) {
  if (!date) return "";
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatNotificationRow(row) {
  const metadata = parseMetadata(row.metadata);
  const lastAt = row.last_occurred_at || row.created_at;
  const count = Number(row.occurrence_count) || 1;

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body || "",
    routeTarget: row.route_target,
    priority: row.priority,
    isRead: row.read_at != null,
    readAt: row.read_at,
    createdAt: row.created_at,
    lastOccurredAt: lastAt,
    timeAgo: getTimeAgo(lastAt),
    occurrenceCount: count,
    grouped: count > 1,
    sourceType: row.source_type,
    sourceId: row.source_id,
    metadata,
  };
}

/**
 * Upsert by (user_id, group_key). Re-opens unread when a grouped event recurs.
 */
async function upsertUserNotification({
  userId,
  type,
  title,
  body = "",
  routeTarget,
  priority = PRIORITIES.NORMAL,
  groupKey = null,
  sourceType = null,
  sourceId = null,
  metadata = {},
  reopenOnRepeat = true,
}) {
  if (!userId || !type || !title || !routeTarget) {
    return null;
  }

  const now = knex.fn.now();
  const metaJson = serializeMetadata(metadata);

  if (groupKey) {
    const existing = await knex("notifications")
      .where({ user_id: userId, group_key: groupKey })
      .first();

    if (existing) {
      const nextCount = Number(existing.occurrence_count || 1) + 1;
      await knex("notifications")
        .where({ id: existing.id })
        .update({
          type,
          title,
          body,
          route_target: routeTarget,
          priority,
          source_type: sourceType,
          source_id: sourceId,
          metadata: metaJson,
          occurrence_count: nextCount,
          last_occurred_at: now,
          updated_at: now,
          read_at: reopenOnRepeat && nextCount > 1 ? null : existing.read_at,
        });
      return existing.id;
    }
  }

  const id = randomUUID();
  await knex("notifications").insert({
    id,
    user_id: userId,
    type,
    title,
    body,
    route_target: routeTarget,
    priority,
    group_key: groupKey,
    source_type: sourceType,
    source_id: sourceId,
    metadata: metaJson,
    occurrence_count: 1,
    read_at: null,
    last_occurred_at: now,
    created_at: now,
    updated_at: now,
  });

  return id;
}

async function createUserNotification(payload) {
  return upsertUserNotification(payload);
}

async function listUserNotifications(userId, { limit = 40 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 100);

  const rows = await knex("notifications")
    .where({ user_id: userId })
    .orderBy("last_occurred_at", "desc")
    .limit(safeLimit);

  const unreadRow = await knex("notifications")
    .where({ user_id: userId })
    .whereNull("read_at")
    .count({ total: "*" })
    .first();

  return {
    notifications: rows.map(formatNotificationRow),
    unreadCount: Number(unreadRow?.total || 0),
  };
}

async function getUnreadCount(userId) {
  const row = await knex("notifications")
    .where({ user_id: userId })
    .whereNull("read_at")
    .count({ total: "*" })
    .first();
  return Number(row?.total || 0);
}

async function markNotificationRead(userId, notificationId) {
  const updated = await knex("notifications")
    .where({ id: notificationId, user_id: userId })
    .update({ read_at: knex.fn.now(), updated_at: knex.fn.now() });
  return updated > 0;
}

async function markAllNotificationsRead(userId) {
  await knex("notifications")
    .where({ user_id: userId })
    .whereNull("read_at")
    .update({ read_at: knex.fn.now(), updated_at: knex.fn.now() });
}

async function getTalentUserIdForProfile(profileId) {
  const profile = await knex("profiles")
    .where({ id: profileId })
    .select("user_id")
    .first();
  return profile?.user_id || null;
}

function applicationStatusCopy(status, agencyName) {
  const agency = agencyName || "An agency";
  const map = {
    pending: {
      title: "Application under review",
      body: `${agency} is reviewing your submission.`,
    },
    submitted: {
      title: "Application under review",
      body: `${agency} is reviewing your submission.`,
    },
    shortlisted: {
      title: "You were shortlisted",
      body: `${agency} moved your application forward.`,
    },
    requested_more: {
      title: "More materials requested",
      body: `${agency} asked for more from your submission.`,
    },
    meeting_requested: {
      title: "Meeting requested",
      body: `${agency} wants to meet — check your submission for details.`,
    },
    development: {
      title: "Development offer",
      body: `${agency} wants to develop you as a new face before full representation.`,
    },
    accepted: {
      title: "Representation update",
      body: `${agency} would like to move forward with representation.`,
    },
    booked: {
      title: "Booking confirmed",
      body: `${agency} marked your application as booked.`,
    },
    declined: {
      title: "Application closed",
      body: `${agency} declined this application.`,
    },
    passed: {
      title: "Application closed",
      body: `${agency} passed on this application.`,
    },
    archived: {
      title: "Application archived",
      body: `${agency} archived this application.`,
    },
    kept_on_file: {
      title: "Kept on file",
      body: `${agency} is keeping your profile on file for future openings.`,
    },
  };
  return (
    map[status] || {
      title: "Application updated",
      body: `${agency} updated your application status.`,
    }
  );
}

const NOTIFY_STATUSES = new Set([
  "submitted",
  "pending",
  "shortlisted",
  "requested_more",
  "meeting_requested",
  "development",
  "accepted",
  "booked",
  "declined",
  "passed",
  "archived",
  "kept_on_file",
]);

async function notifyTalentApplicationSubmitted({
  userId,
  applicationId,
  agencyId,
  agencyName,
}) {
  const name = agencyName || "the agency";
  return upsertUserNotification({
    userId,
    type: NOTIFICATION_TYPES.APPLICATION_SUBMITTED,
    title: "Application submitted",
    body: `Your application to ${name} is in review.`,
    routeTarget: `/dashboard/talent/applications?application=${applicationId}`,
    priority: PRIORITIES.HIGH,
    groupKey: `application_submitted:${applicationId}`,
    sourceType: "application",
    sourceId: applicationId,
    metadata: { agencyId, agencyName: name, status: "pending" },
    reopenOnRepeat: false,
  });
}

async function notifyTalentApplicationStatusChange({
  userId,
  applicationId,
  agencyId,
  agencyName,
  status,
}) {
  if (!NOTIFY_STATUSES.has(status)) return null;
  if (!(await talentNotificationPrefEnabled(userId, "applicationUpdates"))) {
    return null;
  }

  const copy = applicationStatusCopy(status, agencyName);
  return upsertUserNotification({
    userId,
    type: NOTIFICATION_TYPES.APPLICATION_STATUS,
    title: copy.title,
    body: copy.body,
    routeTarget: `/dashboard/talent/applications?application=${applicationId}`,
    priority: [
      "development",
      "accepted",
      "booked",
      "meeting_requested",
      "requested_more",
    ].includes(status)
      ? PRIORITIES.HIGH
      : PRIORITIES.NORMAL,
    groupKey: `application_status:${applicationId}:${status}`,
    sourceType: "application",
    sourceId: applicationId,
    metadata: { agencyId, agencyName, status },
    reopenOnRepeat: false,
  });
}

async function notifyTalentAgencyProfileView({ userId, agencyId, agencyName }) {
  if (!(await talentNotificationPrefEnabled(userId, "profileViews"))) {
    return null;
  }
  const name = agencyName || "An agency";
  const notificationId = await upsertUserNotification({
    userId,
    type: NOTIFICATION_TYPES.AGENCY_PROFILE_VIEW,
    title: `${name} viewed your profile`,
    body: "An agency opened your portfolio in Scout.",
    routeTarget: "/dashboard/talent",
    priority: PRIORITIES.NORMAL,
    groupKey: `agency_view:${agencyId}`,
    sourceType: "agency",
    sourceId: agencyId,
    metadata: { agencyId, agencyName: name },
    reopenOnRepeat: true,
  });

  if (notificationId) {
    await refreshAgencyViewNotificationTitle(notificationId, name);
  }

  return notificationId;
}

async function refreshAgencyViewNotificationTitle(notificationId, agencyName) {
  const row = await knex("notifications").where({ id: notificationId }).first();
  if (!row) return;
  const count = Number(row.occurrence_count) || 1;
  const name = agencyName || "An agency";
  let title = `${name} viewed your profile`;
  let body = "An agency reviewed your portfolio in Scout.";

  if (count > 1) {
    title = `${name} showed repeat interest`;
    body =
      count === 2
        ? "This agency viewed your profile again."
        : `This agency viewed your profile ${count} times recently.`;
  }

  await knex("notifications")
    .where({ id: notificationId })
    .update({ title, body, updated_at: knex.fn.now() });
}

async function notifyTalentProfileNotSubmissionReady({
  userId,
  missingLabels = [],
}) {
  const preview =
    missingLabels.length > 0
      ? `Missing: ${missingLabels.slice(0, 3).join(", ")}${missingLabels.length > 3 ? "…" : ""}`
      : "Add required photos and profile fields before submitting.";

  return upsertUserNotification({
    userId,
    type: NOTIFICATION_TYPES.PROFILE_NOT_SUBMISSION_READY,
    title: "Profile no longer submission-ready",
    body: preview,
    routeTarget: "/dashboard/talent/profile?gate=true",
    priority: PRIORITIES.HIGH,
    groupKey: `profile_readiness:${userId}`,
    sourceType: "profile",
    sourceId: null,
    metadata: { missingLabels },
    reopenOnRepeat: true,
  });
}

/**
 * A booker sent the talent a message. This is the highest-signal inbound event
 * in the talent workflow, so it always reaches the bell (email is sent
 * separately). Grouped per thread so a burst of replies reads as one live
 * conversation and re-opens as unread on each new message.
 */
async function notifyTalentNewMessage({
  userId,
  applicationId,
  agencyId,
  agencyName,
  preview = "",
}) {
  if (!userId || !applicationId) return null;
  const name = agencyName || "An agency";
  const trimmedPreview =
    typeof preview === "string" && preview.trim()
      ? preview.trim().slice(0, 140)
      : "Open the conversation to read it.";

  return upsertUserNotification({
    userId,
    type: NOTIFICATION_TYPES.MESSAGE_RECEIVED,
    title: `${name} sent you a message`,
    body: trimmedPreview,
    routeTarget: `/dashboard/talent/messages?thread=${applicationId}`,
    priority: PRIORITIES.HIGH,
    groupKey: `message:${applicationId}`,
    sourceType: "application",
    sourceId: applicationId,
    metadata: { agencyId, agencyName: name, applicationId },
    reopenOnRepeat: true,
  });
}

/**
 * Clear the grouped message notification for a thread once the talent opens it,
 * keeping the bell's unread count in step with the read conversation.
 */
async function markMessageNotificationsReadForApplication(userId, applicationId) {
  if (!userId || !applicationId) return;
  await knex("notifications")
    .where({
      user_id: userId,
      group_key: `message:${applicationId}`,
    })
    .whereNull("read_at")
    .update({ read_at: knex.fn.now(), updated_at: knex.fn.now() });
}

async function notifyTalentConfirmation({
  userId,
  title,
  body,
  routeTarget,
  groupKey,
  metadata = {},
}) {
  return upsertUserNotification({
    userId,
    type: NOTIFICATION_TYPES.CONFIRMATION,
    title,
    body,
    routeTarget,
    priority: PRIORITIES.NORMAL,
    groupKey,
    sourceType: "confirmation",
    sourceId: null,
    metadata,
    reopenOnRepeat: false,
  });
}

module.exports = {
  NOTIFICATION_TYPES,
  PRIORITIES,
  upsertUserNotification,
  createUserNotification,
  listUserNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  getTalentUserIdForProfile,
  notifyTalentApplicationSubmitted,
  notifyTalentApplicationStatusChange,
  notifyTalentAgencyProfileView,
  refreshAgencyViewNotificationTitle,
  notifyTalentNewMessage,
  markMessageNotificationsReadForApplication,
  notifyTalentProfileNotSubmissionReady,
  notifyTalentConfirmation,
  talentNotificationPrefEnabled,
  formatNotificationRow,
  getTimeAgo,
};
