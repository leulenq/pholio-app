import {
  LayoutGrid, Activity, Inbox, Clapperboard, CalendarClock, CalendarDays,
  Telescope, Building2, Users,
} from 'lucide-react';

/** Collapse toggle sits after this group label in the rail. */
export const AGENCY_NAV_COLLAPSE_AFTER = 'Pipeline';

/**
 * Sidebar IA follows how agencies work day to day:
 * 1. Home — command center (ungrouped for hierarchy)
 * 2. Pipeline — acquisition workflow in funnel order
 * 3. Organization — team and audit trail
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
      { label: 'Submissions', to: '/dashboard/agency/submissions', icon: Inbox,         permission: 'applications.view_list' },
      { label: 'Signing',     to: '/dashboard/agency/signing',     icon: Clapperboard,  permission: 'boards.view'            },
      { label: 'Interviews',  to: '/dashboard/agency/interviews',  icon: CalendarClock, permission: 'interviews.view'        },
      { label: 'Scout',       to: '/dashboard/agency/discover',    icon: Telescope,     permission: 'discover.search'        },
      { label: 'Roster',      to: '/dashboard/agency/roster',      icon: Users,         permission: 'roster.view'            },
      { label: 'Booking Desk', to: '/dashboard/agency/calendar',   icon: CalendarDays,  permission: 'calendar.view'          },
    ],
  },
  {
    label: 'Organization',
    items: [
      { label: 'Team',     to: '/dashboard/agency/team',     icon: Building2, permission: 'team.view'         },
      { label: 'Activity', to: '/dashboard/agency/activity', icon: Activity,  permission: 'org.view_activity' },
    ],
  },
];
