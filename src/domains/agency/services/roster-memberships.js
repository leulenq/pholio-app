"use strict";

const { v4: uuidv4 } = require("uuid");

const REPRESENTED_APPLICATION_STATUSES = Object.freeze([
  "accepted",
  "booked",
  "represented",
]);

function isRepresentedStatus(status) {
  return REPRESENTED_APPLICATION_STATUSES.includes(status);
}

async function ensureRosterMembershipForApplication(
  db,
  application,
  { actorUserId = null, boardId = null, stage = "main" } = {},
) {
  if (!application?.id || !application?.agency_id || !application?.profile_id) {
    throw new Error("A complete application is required to create roster membership");
  }

  const existing = await db("roster_memberships")
    .where({
      agency_id: application.agency_id,
      profile_id: application.profile_id,
      status: "active",
    })
    .first();

  if (existing) return existing;

  const row = {
    id: uuidv4(),
    agency_id: application.agency_id,
    profile_id: application.profile_id,
    talent_record_id: null,
    board_id: boardId || application.board_id || null,
    stage,
    status: "active",
    source_application_id: application.id,
    joined_at: application.accepted_at || db.fn.now(),
    created_by_user_id: actorUserId,
    created_at: db.fn.now(),
    updated_at: db.fn.now(),
  };

  await db("roster_memberships").insert(row);
  return row;
}

async function syncRosterMembershipForApplication(db, application, nextStatus, options) {
  if (!isRepresentedStatus(nextStatus)) return null;
  return ensureRosterMembershipForApplication(db, application, options);
}

module.exports = {
  REPRESENTED_APPLICATION_STATUSES,
  isRepresentedStatus,
  ensureRosterMembershipForApplication,
  syncRosterMembershipForApplication,
};
