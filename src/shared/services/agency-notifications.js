/**
 * Agency-facing notification emitters (same notifications table, per member user_id).
 */

const knex = require("../db/knex");
const { upsertUserNotification, PRIORITIES } = require("./notifications");

const AGENCY_NOTIFICATION_TYPES = {
  APPLICATION_RECEIVED: "application_received",
  INTERVIEW_SCHEDULED: "interview_scheduled",
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

async function notifyAgencyInterviewScheduled({
  agencyId,
  applicationId,
  interviewId,
  talentName,
  proposedDatetime,
}) {
  const name = talentName || "Talent";
  const when = proposedDatetime
    ? new Date(proposedDatetime).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "soon";

  return notifyAgencyMembers({
    agencyId,
    type: AGENCY_NOTIFICATION_TYPES.INTERVIEW_SCHEDULED,
    title: "Interview scheduled",
    body: `${name} — ${when}`,
    routeTarget: `/dashboard/agency/inbox?application=${applicationId}`,
    groupKey: `agency_interview:${interviewId}`,
    sourceType: "interview",
    sourceId: interviewId,
    metadata: { applicationId, interviewId, proposedDatetime },
    priority: PRIORITIES.NORMAL,
    reopenOnRepeat: false,
  });
}

module.exports = {
  AGENCY_NOTIFICATION_TYPES,
  getAgencyMemberUserIds,
  notifyAgencyMembers,
  notifyAgencyNewApplication,
  notifyAgencyInterviewScheduled,
};
