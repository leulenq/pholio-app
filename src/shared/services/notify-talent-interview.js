/**
 * Notify a talent user about interview events on one of their applications.
 * Talent had no interview visibility before — these close that gap.
 */

const knex = require("../db/knex");
const {
  NOTIFICATION_TYPES,
  PRIORITIES,
  upsertUserNotification,
} = require("./notifications");

function whenLabel(datetime) {
  if (!datetime) return "soon";
  const d = new Date(datetime);
  if (Number.isNaN(d.getTime())) return "soon";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const VARIANTS = {
  scheduled: (agency, when) => ({
    title: "Interview scheduled",
    body: `${agency} proposed an interview — ${when}. Confirm your availability.`,
    priority: PRIORITIES.HIGH,
  }),
  rescheduled: (agency, when) => ({
    title: "Interview rescheduled",
    body: `${agency} moved your interview to ${when}. Confirm the new time.`,
    priority: PRIORITIES.HIGH,
  }),
  cancelled: (agency) => ({
    title: "Interview cancelled",
    body: `${agency} cancelled the scheduled interview.`,
    priority: PRIORITIES.NORMAL,
  }),
};

/**
 * @param {object} args
 * @param {object} args.interview - the interviews row (has talent_id, application_id, id, proposed_datetime)
 * @param {string} args.agencyId
 * @param {'scheduled'|'rescheduled'|'cancelled'} args.variant
 */
async function notifyTalentForInterview({ interview, agencyId, variant }) {
  if (!interview?.talent_id || !interview?.application_id) return;
  const build = VARIANTS[variant];
  if (!build) return;

  const agency = await knex("agencies")
    .where({ id: agencyId })
    .select("name")
    .first();
  const agencyName = agency?.name || "An agency";
  const { title, body, priority } = build(
    agencyName,
    whenLabel(interview.proposed_datetime),
  );

  try {
    await upsertUserNotification({
      userId: interview.talent_id,
      type: NOTIFICATION_TYPES.INTERVIEW_SCHEDULED,
      title,
      body,
      routeTarget: `/dashboard/talent/applications?application=${interview.application_id}`,
      priority,
      groupKey: `interview:${interview.id}`,
      sourceType: "interview",
      sourceId: interview.id,
      metadata: {
        interviewId: interview.id,
        applicationId: interview.application_id,
        variant,
      },
      reopenOnRepeat: true,
    });
  } catch (err) {
    console.error("[Notifications] Talent interview notify failed:", err);
  }
}

module.exports = { notifyTalentForInterview };
