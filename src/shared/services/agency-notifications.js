/**
 * Agency-facing notification emitters (same notifications table, per member user_id).
 */

const knex = require("../db/knex");
const { upsertUserNotification, PRIORITIES } = require("./notifications");
const {
  sendEventSlotConfirmedEmail,
  sendEventSlotDeclinedEmail,
} = require("../lib/email");

const AGENCY_NOTIFICATION_TYPES = {
  APPLICATION_RECEIVED: "application_received",
  APPLICATION_WITHDRAWN: "application_withdrawn",
  MESSAGE_RECEIVED: "message_received",
  EVENT_SLOT_ANSWERED: "event_slot_answered",
};

async function getAgencyMemberUserIds(agencyId) {
  const hasMemberships = await knex.schema.hasTable("agency_memberships");
  if (hasMemberships) {
    const members = await knex("agency_memberships")
      .where({ agency_id: agencyId, status: "ACTIVE" })
      .select("user_id");
    if (members.length > 0) {
      return [...new Set(members.map((m) => m.user_id).filter(Boolean))];
    }
  }

  const legacyOwner = await knex("users")
    .where({ id: agencyId, role: "AGENCY" })
    .select("id")
    .first();
  return legacyOwner ? [legacyOwner.id] : [];
}

async function notifyAgencyMembers({
  agencyId,
  type,
  title,
  body,
  routeTarget,
  groupKey,
  sourceType,
  sourceId,
  metadata = {},
  priority = PRIORITIES.NORMAL,
  reopenOnRepeat = false,
}) {
  const memberIds = await getAgencyMemberUserIds(agencyId);
  if (!memberIds.length) return [];

  const results = [];
  for (const userId of memberIds) {
    const memberGroupKey = groupKey ? `${groupKey}:${userId}` : null;
    try {
      const id = await upsertUserNotification({
        userId,
        type,
        title,
        body,
        routeTarget,
        priority,
        groupKey: memberGroupKey,
        sourceType,
        sourceId,
        metadata: { ...metadata, agencyId },
        reopenOnRepeat,
      });
      if (id) results.push(id);
    } catch (err) {
      console.error("[Agency Notifications] Failed for member:", userId, err);
    }
  }
  return results;
}

async function notifyAgencyNewApplication({
  agencyId,
  applicationId,
  talentName,
}) {
  const name = talentName || "A talent";
  return notifyAgencyMembers({
    agencyId,
    type: AGENCY_NOTIFICATION_TYPES.APPLICATION_RECEIVED,
    title: "New application received",
    body: `${name} submitted to your agency.`,
    routeTarget: `/dashboard/agency/inbox?application=${applicationId}`,
    groupKey: `agency_app_received:${applicationId}`,
    sourceType: "application",
    sourceId: applicationId,
    metadata: { applicationId, talentName: name },
    priority: PRIORITIES.HIGH,
    reopenOnRepeat: false,
  });
}

async function notifyAgencyApplicationWithdrawn({
  agencyId,
  applicationId,
  talentName,
}) {
  const name = talentName || "A talent";
  return notifyAgencyMembers({
    agencyId,
    type: AGENCY_NOTIFICATION_TYPES.APPLICATION_WITHDRAWN,
    title: "Application withdrawn",
    body: `${name} withdrew their application.`,
    routeTarget: `/dashboard/agency/inbox?application=${applicationId}`,
    groupKey: `agency_app_withdrawn:${applicationId}`,
    sourceType: "application",
    sourceId: applicationId,
    metadata: { applicationId, talentName: name },
    priority: PRIORITIES.NORMAL,
    reopenOnRepeat: false,
  });
}

async function notifyAgencyNewMessage({
  agencyId,
  applicationId,
  talentName,
  preview,
}) {
  const name = talentName || "A talent";
  const snippet = preview ? `: "${preview}"` : ".";
  return notifyAgencyMembers({
    agencyId,
    type: AGENCY_NOTIFICATION_TYPES.MESSAGE_RECEIVED,
    title: "New message",
    body: `${name} replied${snippet}`,
    routeTarget: `/dashboard/agency/inbox?application=${applicationId}`,
    groupKey: `agency_message:${applicationId}`,
    sourceType: "application",
    sourceId: applicationId,
    metadata: { applicationId, talentName: name },
    priority: PRIORITIES.HIGH,
    reopenOnRepeat: true,
  });
}

/**
 * A slot offer was answered.
 *
 * This is the one inbound event on an event cast that an organizer has to act
 * on within hours rather than days: a declined slot has to be refilled before
 * the show, and a confirmed one closes the line-up. It therefore reaches both
 * the bell and the members' inbox, unlike the routine application traffic
 * above, and it is not grouped with anything — each answer is its own fact.
 */
async function notifyAgencyEventSlotResponse({
  agencyId,
  applicationId,
  talentName,
  eventName,
  confirmed,
}) {
  const name = talentName || "A talent";
  const event = eventName || "your event";
  const title = confirmed ? "Slot confirmed" : "Slot declined";
  const body = confirmed
    ? `${name} confirmed their slot for ${event}.`
    : `${name} declined their slot for ${event}. It is open again.`;

  const notificationIds = await notifyAgencyMembers({
    agencyId,
    type: AGENCY_NOTIFICATION_TYPES.EVENT_SLOT_ANSWERED,
    title,
    body,
    routeTarget: `/dashboard/agency/inbox?application=${applicationId}`,
    groupKey: `agency_event_slot:${applicationId}`,
    sourceType: "application",
    sourceId: applicationId,
    metadata: { applicationId, talentName: name, eventName: event, confirmed },
    priority: PRIORITIES.HIGH,
    reopenOnRepeat: true,
  });

  // Best effort, and deliberately after the in-app write: the dashboard is the
  // record of the answer, the email is only a nudge toward it.
  try {
    const memberIds = await getAgencyMemberUserIds(agencyId);
    if (memberIds.length) {
      const recipients = await knex("users")
        .whereIn("id", memberIds)
        .whereNotNull("email")
        .select("email", "first_name");
      const send = confirmed
        ? sendEventSlotConfirmedEmail
        : sendEventSlotDeclinedEmail;
      await Promise.all(
        recipients.map((recipient) =>
          send({
            to: recipient.email,
            recipientName: recipient.first_name || null,
            talentName: name,
            eventName: event,
            applicationId,
          }).catch((err) =>
            console.error("[Agency Notifications] Slot email failed:", err.message),
          ),
        ),
      );
    }
  } catch (err) {
    console.error("[Agency Notifications] Slot email fan-out failed:", err);
  }

  return notificationIds;
}

module.exports = {
  AGENCY_NOTIFICATION_TYPES,
  getAgencyMemberUserIds,
  notifyAgencyMembers,
  notifyAgencyNewApplication,
  notifyAgencyApplicationWithdrawn,
  notifyAgencyEventSlotResponse,
  notifyAgencyNewMessage,
};
