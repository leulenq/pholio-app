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
    method: "POST",
    pattern: /^\/api\/agency\/import-jobs$/,
    permission: "org.complete_onboarding",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/analytics$/,
    permission: "org.view_analytics",
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

  // Roster
  {
    method: "GET",
    pattern: /^\/api\/agency\/roster$/,
    permission: "roster.view",
  },
  // Measured-in-person confirmation is the only write path for the
  // measured_in_person_at / measured_by_agency_id state (roster.js). Keep the
  // measured rules ABOVE the generic /roster/:id GET so they win by specificity
  // for their unsafe methods.
  {
    method: "POST",
    pattern: /^\/api\/agency\/roster\/[^/]+\/measured$/,
    permission: "roster.manage_status",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/agency\/roster\/[^/]+\/measured$/,
    permission: "roster.manage_status",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/roster\/[^/]+$/,
    permission: "roster.view_profile",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/talent-records$/,
    permission: "roster.add_talent",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/agency\/talent-records\/[^/]+$/,
    permission: "roster.add_talent",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/agency\/roster-memberships\/[^/]+$/,
    permission: "roster.manage_status",
  },

  // Booking Desk calendar. Talent-declared bookouts are included by the read
  // endpoint but remain immutable through these agency routes.
  {
    method: "GET",
    pattern: /^\/api\/agency\/commitments$/,
    permission: "calendar.view",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/commitments$/,
    permission: "calendar.manage",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/agency\/commitments\/[^/]+$/,
    permission: "calendar.manage",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/commitments\/[^/]+\/confirm$/,
    permission: "calendar.manage",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/agency\/commitments\/[^/]+$/,
    permission: "calendar.manage",
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
    pattern: /^\/api\/agency\/boards\/[^/]+\/calculate-scores$/,
    permission: "boards.recalculate_scores",
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
    method: "PUT",
    pattern: /^\/api\/agency\/boards\/[^/]+\/weights$/,
    permission: "boards.edit_weights",
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

  // Matching (decision-support ranking / booker decisions / fairness monitor)
  {
    method: "POST",
    pattern: /^\/api\/agency\/boards\/[^/]+\/rank$/,
    permission: "matching.rank",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/boards\/[^/]+\/candidates\/[^/]+\/decision$/,
    permission: "matching.decide",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/boards\/[^/]+\/fairness$/,
    permission: "matching.view_fairness",
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

  // Interviews
  {
    method: "GET",
    pattern: /^\/api\/agency\/interviews$/,
    permission: "interviews.view",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/applications\/[^/]+\/interviews$/,
    permission: "interviews.view",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/[^/]+\/interviews$/,
    permission: "interviews.schedule",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/agency\/interviews\/[^/]+$/,
    permission: "interviews.update",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/agency\/interviews\/[^/]+$/,
    permission: "interviews.cancel",
  },

  // Reminders
  {
    method: "GET",
    pattern: /^\/api\/agency\/reminders$/,
    permission: "reminders.view",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/reminders\/due$/,
    permission: "reminders.view",
  },
  {
    method: "GET",
    pattern: /^\/api\/agency\/applications\/[^/]+\/reminders$/,
    permission: "reminders.view",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/applications\/[^/]+\/reminders$/,
    permission: "reminders.create",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/agency\/reminders\/[^/]+$/,
    permission: "reminders.update",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/reminders\/[^/]+\/complete$/,
    permission: "reminders.complete",
  },
  {
    method: "POST",
    pattern: /^\/api\/agency\/reminders\/[^/]+\/snooze$/,
    permission: "reminders.snooze",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/agency\/reminders\/[^/]+$/,
    permission: "reminders.delete",
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
