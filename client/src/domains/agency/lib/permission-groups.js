/**
 * Permission catalog grouped for the Team custom-access modal.
 * Keys must match src/domains/agency/lib/permissions.js.
 */

export const PERMISSION_GROUPS = [
  {
    id: 'org',
    label: 'Organization',
    permissions: [
      { key: 'org.edit_profile', label: 'Edit agency profile' },
      { key: 'org.edit_branding', label: 'Edit branding' },
      { key: 'org.edit_settings', label: 'Edit settings' },
      { key: 'org.export_data', label: 'Export data' },
      { key: 'org.transfer_ownership', label: 'Transfer ownership' },
    ],
  },
  {
    id: 'team',
    label: 'Team & access',
    permissions: [
      { key: 'team.invite', label: 'Invite members' },
      { key: 'team.assign_role', label: 'Change roles' },
      { key: 'team.deactivate', label: 'Remove members' },
      { key: 'team.grant_permission', label: 'Grant custom access' },
      { key: 'team.revoke_permission', label: 'Revoke custom access' },
      { key: 'team.view_audit', label: 'View access history' },
    ],
  },
  {
    id: 'applications',
    label: 'Applicants & pipeline',
    permissions: [
      { key: 'applications.update_status', label: 'Update status / shortlist' },
      { key: 'applications.accept', label: 'Accept / sign talent' },
      { key: 'applications.decline', label: 'Decline' },
      { key: 'applications.archive', label: 'Archive' },
      { key: 'applications.bulk_accept', label: 'Bulk accept' },
      { key: 'applications.bulk_decline', label: 'Bulk decline' },
      { key: 'applications.bulk_archive', label: 'Bulk archive' },
      { key: 'applications.bulk_update_status', label: 'Bulk stage update' },
    ],
  },
  {
    id: 'boards',
    label: 'Casting boards',
    permissions: [
      { key: 'boards.create', label: 'Create boards' },
      { key: 'boards.edit', label: 'Edit boards' },
      { key: 'boards.delete', label: 'Delete boards' },
      { key: 'boards.assign_application', label: 'Assign to board' },
      { key: 'boards.move_stage', label: 'Move pipeline stage' },
    ],
  },
  {
    id: 'discover',
    label: 'Discover & scouting',
    permissions: [
      { key: 'discover.invite', label: 'Invite talent to apply' },
      { key: 'talent.download_comp_card', label: 'Download comp card' },
    ],
  },
  {
    id: 'comms',
    label: 'Notes, tags & messages',
    permissions: [
      { key: 'notes.create', label: 'Add notes' },
      { key: 'notes.edit', label: 'Edit notes' },
      { key: 'notes.delete', label: 'Delete notes' },
      { key: 'tags.add', label: 'Add tags' },
      { key: 'tags.remove', label: 'Remove tags' },
      { key: 'tags.bulk_add', label: 'Bulk add tags' },
      { key: 'tags.bulk_remove', label: 'Bulk remove tags' },
      { key: 'messages.send', label: 'Send messages' },
    ],
  },
  {
    id: 'interviews',
    label: 'Interviews & reminders',
    permissions: [
      { key: 'interviews.schedule', label: 'Schedule interviews' },
      { key: 'interviews.update', label: 'Update interviews' },
      { key: 'interviews.complete', label: 'Complete interviews' },
      { key: 'interviews.cancel', label: 'Cancel interviews' },
      { key: 'reminders.create', label: 'Create reminders' },
      { key: 'reminders.delete', label: 'Delete reminders' },
    ],
  },
];

export const DANGEROUS_PERMISSION_KEYS = new Set([
  'org.export_data',
  'org.transfer_ownership',
  'applications.accept',
  'applications.bulk_accept',
  'boards.delete',
  'team.assign_role',
  'team.grant_permission',
]);
