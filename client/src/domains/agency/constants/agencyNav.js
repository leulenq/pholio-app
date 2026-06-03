import {
  LayoutGrid, Activity, Inbox, Clapperboard, CalendarClock,
  Users, Compass, UsersRound, BarChart3,
} from 'lucide-react';

export const AGENCY_NAV_GROUPS = [
  {
    label: 'Monitor',
    items: [
      { label: 'Overview', to: '/dashboard/agency', end: true, icon: LayoutGrid },
      { label: 'Activity', to: '/dashboard/agency/activity', icon: Activity },
    ],
  },
  {
    label: 'Pipeline',
    items: [
      { label: 'Applicants', to: '/dashboard/agency/applicants', icon: Inbox, countKey: 'applicants' },
      { label: 'Casting', to: '/dashboard/agency/casting', icon: Clapperboard, countKey: 'casting' },
      { label: 'Interviews', to: '/dashboard/agency/interviews', icon: CalendarClock },
    ],
  },
  {
    label: 'Roster',
    items: [
      { label: 'Talent', to: '/dashboard/agency/roster', icon: Users },
      { label: 'Discover', to: '/dashboard/agency/discover', icon: Compass },
    ],
  },
  {
    label: 'Agency',
    items: [
      { label: 'Team', to: '/dashboard/agency/team', icon: UsersRound, countKey: 'team' },
      { label: 'Analytics', to: '/dashboard/agency/analytics', icon: BarChart3 },
    ],
  },
];
