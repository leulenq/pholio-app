/**
 * Maps agency API routes to required permission keys.
 * Rules are evaluated top-to-bottom; first match wins.
 * Keep more specific patterns above general ones.
 */

const ROUTE_PERMISSION_RULES = [
  // Every active human member accepts the current agency workspace policies.
  {
    method: "GET",
    pattern: /^\/api\/agency\/legal-status$/,
    permission: "account.accept_legal",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/legal-acceptance$/,
    permission: "account.accept_legal",
  },

  // Organization
  { method: "GET", pattern: /^\/api\/agency\/me$/, permission: "org.view" },
  {
    method: "PUT",
    pattern: /^\/api\/agency\/profile$/,
    permission: "org.edit_profile",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/branding$/,
    permission: "org.edit_branding",
  },
  {
    method: "PUT",
    pattern: /^\/api\/agency\/settings$/,
    permission: "org.edit_settings",
  },
  // The export webhook decides where submissions are pushed, so it is settings
  // in the same sense the response window is — an org-level configuration, not
  // an applicant action.
  {
    method: "PUT",
    pattern: /^\/api\/agency\/export-webhook$/,
    permission: "org.edit_settings",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/agency\/export-webhook$/,
    permission: "org.edit_settings",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/onboarding\/complete$/,
    permission: "org.complete_onboarding",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/export$/,
    permission: "org.export_data",
  },

  // Setup / onboarding (setup.js additionally enforces OWNER/ADMIN membership).
  // Writes require org.complete_onboarding (held by OWNER/ADMIN); the read is
  // org.view so any active agency member can inspect setup state.
  {
    method: "GET",
    pattern: /^\/api\/agency\/setup$/,
    permission: "org.view",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/agency\/setup\/[^/]+$/,
    permission: "org.complete_onboarding",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/setup\/complete$/,
    permission: "org.complete_onboarding",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/activity$/,
    permission: "org.view_activity",
  },

  // Team & audit
  { method: "GET", pattern: /^\/api\/agency\/team$/, permission: "team.view" },
  {
    method: "POST",
    pattern: /^\/api\/agency\/team$/,
    permission: "team.invite",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/agency\/team\/[^/]+$/,
    permission: "team.assign_role",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/agency\/team\/[^/]+$/,
    permission: "team.deactivate",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/team\/[^/]+\/permissions$/,
    permission: "team.view",
  },
  {
    method: "PUT",
    pattern: /^\/api\/agency\/team\/[^/]+\/permissions$/,
    permission: "team.grant_permission",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/agency\/team\/[^/]+\/permissions\/[^/]+$/,
    permission: "team.revoke_permission",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/audit$/,
    permission: "team.view_audit",
  },

  // Overview
  {
    method: "GET",
    pattern: /^\/api\/agency\/overview$/,
    permission: "overview.view",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/overview\//,
    permission: "overview.view",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/stats$/,
    permission: "overview.view",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/pipeline-counts$/,
    permission: "overview.view",
  },

  // Discover
  {
    method: "GET",
    pattern: /^\/api\/agency\/discover$/,
    permission: "discover.search",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/discover\/[^/]+\/preview$/,
    permission: "discover.view_preview",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/discover\/[^/]+\/invite$/,
    permission: "discover.invite",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/profiles\/[^/]+\/details$/,
    permission: "discover.view_details",
  },

  // Applications — bulk before parameterized
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/bulk-accept$/,
    permission: "applications.bulk_accept",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/bulk-decline$/,
    permission: "applications.bulk_decline",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/bulk-archive$/,
    permission: "applications.bulk_archive",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/agency\/applications\/bulk-status$/,
    permission: "applications.bulk_update_status",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/applications$/,
    permission: "applications.view_list",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/applications\/[^/]+\/details$/,
    permission: "applications.view_detail",
  },
  {
    // The expanded talent view's aggregate read — same object as /details.
    method: "GET",
    pattern: /^\/api\/agency\/applications\/[^/]+\/dossier$/,
    permission: "applications.view_detail",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/applications\/[^/]+\/timeline$/,
    permission: "applications.view_timeline",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/[^/]+\/accept$/,
    permission: "applications.accept",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/[^/]+\/decline$/,
    permission: "applications.decline",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/[^/]+\/archive$/,
    permission: "applications.archive",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/agency\/applications\/[^/]+\/status$/,
    permission: "applications.update_status",
  },

  /* Request materials (open-call design §6). REUSES existing permission keys
     rather than introducing a new one: asking a shortlisted applicant for the
     call's shortlist-stage materials is the same class of act as moving their
     status — the roles that may triage an application are exactly the roles that
     may ask it for more — and reading the outstanding ask is part of reading the
     application. A new permission key would have to be granted to every existing
     role to preserve today's behaviour, which is a migration in exchange for no
     new distinction. */
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/[^/]+\/request-materials$/,
    permission: "applications.update_status",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/applications\/[^/]+\/material-request$/,
    permission: "applications.view_detail",
  },

  // Notes
  {
    method: "GET",
    pattern: /^\/api\/agency\/applications\/[^/]+\/notes$/,
    permission: "notes.view",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/[^/]+\/notes$/,
    permission: "notes.create",
  },
  {
    method: "PUT",
    pattern: /^\/api\/agency\/applications\/[^/]+\/notes\/[^/]+$/,
    permission: "notes.edit",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/agency\/applications\/[^/]+\/notes\/[^/]+$/,
    permission: "notes.delete",
  },

  // Tags
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/bulk-tag$/,
    permission: "tags.bulk_add",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/bulk-remove-tag$/,
    permission: "tags.bulk_remove",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/applications\/[^/]+\/tags$/,
    permission: "tags.view",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/[^/]+\/tags$/,
    permission: "tags.add",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/agency\/applications\/[^/]+\/tags\/[^/]+$/,
    permission: "tags.remove",
  },
  { method: "GET", pattern: /^\/api\/agency\/tags$/, permission: "tags.view" },

  // Boards
  {
    method: "GET",
    pattern: /^\/api\/agency\/boards$/,
    permission: "boards.view",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/boards$/,
    permission: "boards.create",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/boards\/[^/]+\/candidates$/,
    permission: "boards.view_pipeline",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/boards\/[^/]+\/duplicate$/,
    permission: "boards.duplicate",
  },
  {
    method: "PUT",
    pattern: /^\/api\/agency\/boards\/[^/]+\/requirements$/,
    permission: "boards.edit_requirements",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/boards\/[^/]+$/,
    permission: "boards.view",
  },
  {
    method: "PUT",
    pattern: /^\/api\/agency\/boards\/[^/]+$/,
    permission: "boards.edit",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/agency\/boards\/[^/]+$/,
    permission: "boards.edit",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/boards\/[^/]+\/identity-image$/,
    permission: "boards.edit",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/agency\/boards\/[^/]+$/,
    permission: "boards.delete",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/[^/]+\/assign-board$/,
    permission: "boards.assign_application",
  },

  // Open call links
  {
    method: "GET",
    pattern: /^\/api\/agency\/open-call\/links$/,
    permission: "open_call.view",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/open-call\/links$/,
    permission: "open_call.manage",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/agency\/open-call\/links\/[^/]+$/,
    permission: "open_call.manage",
  },

  // Event casting (design §f). An event call IS an open call link, so the
  // permissions are the same pair — ruling R10 forbids a parallel RBAC model
  // for organizers. Literal `pick-lists` patterns sit above the `:linkId`
  // patterns because rules are first-match and `[^/]+` would swallow them.
  {
    method: "GET",
    pattern: /^\/api\/agency\/events$/,
    permission: "open_call.view",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/events\/pick-lists\/[^/]+\/selections$/,
    permission: "open_call.view",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/agency\/events\/pick-lists\/[^/]+$/,
    permission: "open_call.manage",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/events\/pick-lists\/[^/]+\/(reissue|revoke|items)$/,
    permission: "open_call.manage",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/agency\/events\/pick-lists\/[^/]+\/items$/,
    permission: "open_call.manage",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/events\/[^/]+\/(pool|pick-lists|lineup)$/,
    permission: "open_call.view",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/events\/[^/]+\/pick-lists$/,
    permission: "open_call.manage",
  },
  {
    // Handing an applicant a slot writes their application status. It is the
    // organizer's decision, so it needs the manage grant, not the read one.
    method: "POST",
    pattern: /^\/api\/agency\/events\/[^/]+\/offers$/,
    permission: "open_call.manage",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/events\/[^/]+$/,
    permission: "open_call.view",
  },

  // Spec Builder — the requirements published against those links.
  {
    method: "GET",
    pattern: /^\/api\/agency\/spec-builder$/,
    permission: "open_call.view",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/spec-builder\/revisions$/,
    permission: "open_call.view",
  },
  {
    method: "PUT",
    pattern: /^\/api\/agency\/spec-builder\/draft$/,
    permission: "open_call.manage",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/spec-builder\/publish$/,
    permission: "open_call.manage",
  },

  // Messages
  {
    method: "GET",
    pattern: /^\/api\/agency\/messages\/threads$/,
    permission: "messages.view_threads",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/messages\/unread-count$/,
    permission: "messages.view_threads",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/applications\/[^/]+\/messages$/,
    permission: "messages.view",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/[^/]+\/messages$/,
    permission: "messages.send",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/messages\/read-all$/,
    permission: "messages.mark_read",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/messages\/[^/]+\/read$/,
    permission: "messages.mark_read",
  },

  // Notifications
  {
    method: "GET",
    pattern: /^\/api\/agency\/notifications$/,
    permission: "notifications.view",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/agency\/notifications\/[^/]+\/read$/,
    permission: "notifications.mark_read",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/notifications\/read-all$/,
    permission: "notifications.mark_all_read",
  },

  // Filter presets
  {
    method: "GET",
    pattern: /^\/api\/agency\/filter-presets$/,
    permission: "filters.view",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/filter-presets$/,
    permission: "filters.create",
  },
  {
    method: "PUT",
    pattern: /^\/api\/agency\/filter-presets\/[^/]+\/set-default$/,
    permission: "filters.set_default",
  },
  {
    method: "PUT",
    pattern: /^\/api\/agency\/filter-presets\/[^/]+$/,
    permission: "filters.edit",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/agency\/filter-presets\/[^/]+$/,
    permission: "filters.delete",
  },
];

function resolveRoutePermission(method, path) {
  const normalizedPath = (path || "").split("?")[0];
  for (const rule of ROUTE_PERMISSION_RULES) {
    if (rule.method !== method) continue;
    if (rule.pattern.test(normalizedPath)) {
      return rule.permission;
    }
  }
  return null;
}

module.exports = { ROUTE_PERMISSION_RULES, resolveRoutePermission };
