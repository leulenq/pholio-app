/**
 * Agency RBAC permission catalog and preset role matrices.
 * Keys are stable API contract — do not rename without migration.
 */

const PRESET_ROLES = ["OWNER", "ADMIN", "AGENT", "SCOUT", "VIEWER"];

const LEGACY_ROLE_ALIASES = {
  MEMBER: "SCOUT",
};

const ALL_PERMISSIONS = [
  "org.view",
  "account.accept_legal",
  "org.edit_profile",
  "org.edit_branding",
  "org.edit_settings",
  "org.complete_onboarding",
  "org.export_data",
  "org.view_analytics",
  "org.view_activity",
  "org.transfer_ownership",
  "team.view",
  "team.invite",
  "team.assign_role",
  "team.deactivate",
  "team.grant_permission",
  "team.revoke_permission",
  "team.view_audit",
  "discover.search",
  "discover.view_preview",
  "discover.view_details",
  "discover.invite",
  "talent.claim",
  "talent.download_comp_card",
  "talent.view_minor_submissions",
  "applications.view_list",
  "applications.view_detail",
  "applications.view_timeline",
  "applications.update_status",
  "applications.accept",
  "applications.decline",
  "applications.archive",
  "applications.bulk_accept",
  "applications.bulk_decline",
  "applications.bulk_archive",
  "applications.bulk_update_status",
  "boards.view",
  "boards.create",
  "boards.edit",
  "boards.delete",
  "boards.duplicate",
  "boards.edit_requirements",
  "boards.edit_weights",
  "boards.recalculate_scores",
  "boards.view_pipeline",
  "boards.assign_application",
  "boards.move_stage",
  "roster.view",
  "roster.view_profile",
  "roster.manage_status",
  "roster.add_talent",
  "roster.import",
  "roster.message",
  "open_call.view",
  "open_call.manage",
  "matching.rank",
  "matching.decide",
  "matching.view_fairness",
  "notes.view",
  "notes.create",
  "notes.edit",
  "notes.delete",
  "tags.view",
  "tags.add",
  "tags.remove",
  "tags.bulk_add",
  "tags.bulk_remove",
  "messages.view_threads",
  "messages.view",
  "messages.send",
  "messages.mark_read",
  "interviews.view",
  "interviews.schedule",
  "interviews.update",
  "interviews.complete",
  "interviews.cancel",
  "reminders.view",
  "reminders.create",
  "reminders.update",
  "reminders.complete",
  "reminders.snooze",
  "reminders.delete",
  "notifications.view",
  "notifications.mark_read",
  "notifications.mark_all_read",
  "filters.view",
  "filters.create",
  "filters.edit",
  "filters.delete",
  "filters.set_default",
  "overview.view",
];

const VIEWER_PERMISSIONS = [
  "org.view",
  "account.accept_legal",
  "org.view_analytics",
  "org.view_activity",
  "team.view",
  "discover.search",
  "discover.view_preview",
  "discover.view_details",
  "applications.view_list",
  "applications.view_detail",
  "applications.view_timeline",
  "boards.view",
  "boards.view_pipeline",
  "roster.view",
  "roster.view_profile",
  "notes.view",
  "tags.view",
  "messages.view_threads",
  "messages.view",
  "messages.mark_read",
  "interviews.view",
  "reminders.view",
  "notifications.view",
  "notifications.mark_read",
  "notifications.mark_all_read",
  "filters.view",
  "overview.view",
  // Read-only visibility into open-call funnels and fairness monitoring.
  "open_call.view",
  "matching.view_fairness",
];

const SCOUT_EXTRA = [
  "discover.invite",
  "applications.update_status",
  "applications.bulk_update_status",
  "boards.assign_application",
  "boards.move_stage",
  "notes.create",
  "tags.add",
  "tags.bulk_add",
  "interviews.schedule",
  "interviews.update",
  "reminders.create",
  "reminders.update",
  "reminders.complete",
  "reminders.snooze",
  "filters.create",
  // Scouts can run decision-support ranking on a board's applicants.
  "matching.rank",
];

const AGENT_EXTRA = [
  "talent.download_comp_card",
  "applications.accept",
  "applications.decline",
  "applications.archive",
  "applications.bulk_accept",
  "applications.bulk_decline",
  "applications.bulk_archive",
  "boards.create",
  "boards.edit",
  "boards.duplicate",
  "boards.edit_requirements",
  "boards.recalculate_scores",
  "roster.manage_status",
  "roster.add_talent",
  "roster.message",
  "notes.edit",
  "notes.delete",
  "tags.remove",
  "tags.bulk_remove",
  "messages.send",
  "interviews.complete",
  "interviews.cancel",
  "reminders.delete",
  // Agents manage open-call scouting links and record booker decisions.
  "open_call.manage",
  "matching.decide",
];

const ADMIN_EXTRA = [
  "org.edit_profile",
  "org.edit_branding",
  "org.edit_settings",
  "org.complete_onboarding",
  "org.export_data",
  "roster.import",
  "team.invite",
  "team.assign_role",
  "team.deactivate",
  "team.grant_permission",
  "team.revoke_permission",
  "team.view_audit",
  "talent.claim",
  "talent.view_minor_submissions",
  "boards.delete",
  "boards.edit_weights",
  "filters.edit",
  "filters.delete",
  "filters.set_default",
];

const OWNER_EXTRA = ["org.transfer_ownership"];

function uniq(arr) {
  return [...new Set(arr)];
}

const PRESET_PERMISSIONS = {
  VIEWER: VIEWER_PERMISSIONS,
  SCOUT: uniq([...VIEWER_PERMISSIONS, ...SCOUT_EXTRA]),
  AGENT: uniq([...VIEWER_PERMISSIONS, ...SCOUT_EXTRA, ...AGENT_EXTRA]),
  ADMIN: uniq([
    ...VIEWER_PERMISSIONS,
    ...SCOUT_EXTRA,
    ...AGENT_EXTRA,
    ...ADMIN_EXTRA,
  ]),
  OWNER: ALL_PERMISSIONS,
};

/** Roles an actor may assign to others (subset rules applied in service layer). */
const ASSIGNABLE_ROLES = {
  OWNER: ["ADMIN", "AGENT", "SCOUT", "VIEWER"],
  ADMIN: ["AGENT", "SCOUT", "VIEWER"],
};

const DANGEROUS_PERMISSIONS = new Set([
  "org.export_data",
  "org.transfer_ownership",
  "applications.accept",
  "applications.bulk_accept",
  "boards.delete",
  "team.assign_role",
  "team.grant_permission",
  "talent.view_minor_submissions",
]);

function normalizePresetRole(role) {
  if (!role) return "SCOUT";
  const upper = String(role).toUpperCase();
  if (LEGACY_ROLE_ALIASES[upper]) return LEGACY_ROLE_ALIASES[upper];
  if (PRESET_ROLES.includes(upper)) return upper;
  return "SCOUT";
}

function getPresetPermissions(presetRole) {
  const role = normalizePresetRole(presetRole);
  if (role === "OWNER") return new Set(ALL_PERMISSIONS);
  return new Set(PRESET_PERMISSIONS[role] || PRESET_PERMISSIONS.SCOUT);
}

function computeEffectivePermissions(presetRole, grantRows = []) {
  const role = normalizePresetRole(presetRole);
  const effective = getPresetPermissions(role);

  if (role === "OWNER") {
    return effective;
  }

  const now = Date.now();
  const allows = [];
  const denies = [];

  for (const row of grantRows) {
    if (row.expires_at && new Date(row.expires_at).getTime() <= now) {
      continue;
    }
    if (row.effect === "ALLOW") allows.push(row.permission_key);
    if (row.effect === "DENY") denies.push(row.permission_key);
  }

  allows.forEach((key) => effective.add(key));
  denies.forEach((key) => effective.delete(key));

  return effective;
}

function hasPermission(effectiveSet, permission) {
  return effectiveSet.has(permission);
}

function hasAnyPermission(effectiveSet, permissions) {
  return permissions.some((p) => effectiveSet.has(p));
}

function permissionsToArray(effectiveSet) {
  return [...effectiveSet].sort();
}

function canGrantPermission(grantorEffective, permissionKey) {
  return grantorEffective.has(permissionKey);
}

function canAssignRole(actorRole, targetRole) {
  const actor = normalizePresetRole(actorRole);
  const target = normalizePresetRole(targetRole);
  if (target === "OWNER") return false;
  const allowed = ASSIGNABLE_ROLES[actor] || [];
  return allowed.includes(target);
}

module.exports = {
  PRESET_ROLES,
  LEGACY_ROLE_ALIASES,
  ALL_PERMISSIONS,
  PRESET_PERMISSIONS,
  ASSIGNABLE_ROLES,
  DANGEROUS_PERMISSIONS,
  normalizePresetRole,
  getPresetPermissions,
  computeEffectivePermissions,
  hasPermission,
  hasAnyPermission,
  permissionsToArray,
  canGrantPermission,
  canAssignRole,
};
