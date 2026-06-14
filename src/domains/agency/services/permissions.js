const knex = require("../../../shared/db/knex");
const {
  computeEffectivePermissions,
  permissionsToArray,
  normalizePresetRole,
  canGrantPermission,
  canAssignRole,
} = require("../lib/permissions");

async function loadMembershipGrants(membershipId, db = knex) {
  const hasTable = await db.schema.hasTable("agency_membership_permissions");
  if (!hasTable || !membershipId) return [];

  return db("agency_membership_permissions")
    .where({ membership_id: membershipId })
    .select(
      "permission_key",
      "effect",
      "expires_at",
      "reason",
      "granted_by_membership_id",
    );
}

async function resolveEffectivePermissionsForMembership(
  membershipId,
  presetRole,
  db = knex,
) {
  const role = normalizePresetRole(presetRole);
  const grants = await loadMembershipGrants(membershipId, db);
  return computeEffectivePermissions(role, grants);
}

async function resolveEffectivePermissionsFromSession(session, db = knex) {
  if (!session || session.role !== "AGENCY") {
    return new Set();
  }

  const membershipId = session.agencyMembershipId || null;
  const presetRole = session.agencyMembershipRole || "SCOUT";

  if (!membershipId) {
    return computeEffectivePermissions(normalizePresetRole(presetRole), []);
  }

  return resolveEffectivePermissionsForMembership(membershipId, presetRole, db);
}

async function loadPermissionsArrayForSession(session, db = knex) {
  const effective = await resolveEffectivePermissionsFromSession(session, db);
  return permissionsToArray(effective);
}

async function assertCanGrant(
  actorMembershipId,
  actorPresetRole,
  permissionKey,
  db = knex,
) {
  const actorEffective = await resolveEffectivePermissionsForMembership(
    actorMembershipId,
    actorPresetRole,
    db,
  );
  return canGrantPermission(actorEffective, permissionKey);
}

async function assertCanAssignRole(actorPresetRole, targetPresetRole) {
  return canAssignRole(actorPresetRole, targetPresetRole);
}

module.exports = {
  loadMembershipGrants,
  resolveEffectivePermissionsForMembership,
  resolveEffectivePermissionsFromSession,
  loadPermissionsArrayForSession,
  assertCanGrant,
  assertCanAssignRole,
};
