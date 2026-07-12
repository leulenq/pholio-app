import {
  LayoutGrid, Activity, Inbox, Clapperboard, CalendarClock,
  Contact, Telescope, Building2,
} from 'lucide-react';

/** Collapse toggle sits after this group label in the rail. */
export const AGENCY_NAV_COLLAPSE_AFTER = 'Pipeline';

/**
 * Sidebar IA follows how agencies work day to day:
 * 1. Home — command center (ungrouped for hierarchy)
 * 2. Pipeline — acquisition workflow in funnel order
 * 3. Roster — signed talent management (separate mental mode)
 * 4. Organization — team, audit trail, reporting
 */
export const AGENCY_NAV_GROUPS = [
  {
    label: null,
    items: [
      { label: 'Overview', to: '/dashboard/agency', icon: LayoutGrid, end: true, permission: 'overview.view' },
    ],
  },
  {
    label: 'Pipeline',
    items: [
      { label: 'Signing',      to: '/dashboard/agency/signing',     icon: Clapperboard,  countKey: 'casting',    permission: 'boards.view'            },
      { label: 'Submissions',  to: '/dashboard/agency/submissions', icon: Inbox,         countKey: 'applicants', permission: 'applications.view_list' },
      { label: 'Interviews',   to: '/dashboard/agency/interviews', icon: CalendarClock,                              permission: 'interviews.view'        },
      { label: 'Scout',        to: '/dashboard/agency/discover',   icon: Telescope,                                  permission: 'discover.search'        },
    ],
  },
  {
    label: 'Roster',
    items: [
      { label: 'Roster', to: '/dashboard/agency/roster', icon: Contact, permission: 'roster.view' },
    ],
  },
  {
    label: 'Organization',
    items: [
      { label: 'Team',      to: '/dashboard/agency/team',      icon: Building2, countKey: 'team', permission: 'team.view'              },
      { label: 'Activity',  to: '/dashboard/agency/activity',  icon: Activity,                           permission: 'org.view_activity'      },
    ],
  },
];
