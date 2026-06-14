const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");

/**
 * Append-only agency audit log for access control and org mutations.
 *
 * @param {object} params
 * @param {string} params.agencyId
 * @param {string|null} [params.actorMembershipId]
 * @param {string|null} [params.actorUserId]
 * @param {string} params.eventType
 * @param {string|null} [params.targetType]
 * @param {string|null} [params.targetId]
 * @param {string} params.summary
 * @param {object|null} [params.beforeState]
 * @param {object|null} [params.afterState]
 * @param {import('express').Request} [params.req]
 * @param {import('knex').Knex} [params.db]
 */
async function recordAuditEvent({
  agencyId,
  actorMembershipId = null,
  actorUserId = null,
  eventType,
  targetType = null,
  targetId = null,
  summary,
  beforeState = null,
  afterState = null,
  req = null,
  db = knex,
}) {
  const hasTable = await db.schema.hasTable("agency_audit_events");
  if (!hasTable) return null;

  const row = {
    id: uuidv4(),
    agency_id: agencyId,
    actor_membership_id: actorMembershipId,
    actor_user_id: actorUserId,
    event_type: eventType,
    target_type: targetType,
    target_id: targetId,
    summary,
    before_state: beforeState ? JSON.stringify(beforeState) : null,
    after_state: afterState ? JSON.stringify(afterState) : null,
    ip_address: req?.ip || null,
    user_agent: req?.get?.("user-agent") || null,
    created_at: db.fn.now(),
  };

  await db("agency_audit_events").insert(row);
  return row.id;
}

module.exports = { recordAuditEvent };
