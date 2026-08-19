import {
  LayoutGrid, Activity, Inbox, Clapperboard,
  Telescope, Building2, CalendarRange,
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
      { label: 'Scout',       to: '/dashboard/agency/discover',    icon: Telescope,     permission: 'discover.search'        },
    ],
  },
  {
    label: 'Organization',
    items: [
      { label: 'Team',     to: '/dashboard/agency/team',     icon: Building2,    permission: 'team.view'          },
      { label: 'Activity', to: '/dashboard/agency/activity', icon: Activity,     permission: 'org.view_activity'  },
    ],
  },
];

/**
 * Events sits in Pipeline, between Submissions and Signing: an event cast
 * happens downstream of intake and instead of signing.
 *
 * It is not in `AGENCY_NAV_GROUPS` because it is conditional, and per ruling
 * R10 the condition is emphatically NOT a separate dashboard — it is the same
 * rail, one entry longer, for an agency that runs event calls. A house that
 * runs none never sees a section that would only ever be empty.
 */
export const EVENTS_NAV_ITEM = Object.freeze({
  label: 'Events',
  to: '/dashboard/agency/events',
  icon: CalendarRange,
  permission: 'open_call.view',
  group: 'Pipeline',
  after: 'Submissions',
});

/**
 * The rail's items, filtered by permission and by what this workspace does.
 *
 * @param {object} options
 * @param {(permission: string) => boolean} options.can - permission predicate
 * @param {boolean} [options.showEvents] - `org_kind` is `event_organizer`, or
 *   this agency has at least one event call (ruling R10). Defaults to false so
 *   a caller that has not resolved it yet never flashes the entry in.
 */
export function selectAgencyNavGroups({ can, showEvents = false }) {
  const allow = typeof can === 'function' ? can : () => true;

  return AGENCY_NAV_GROUPS.map((group) => {
    let items = group.items;

    if (showEvents && group.label === EVENTS_NAV_ITEM.group) {
      const at = items.findIndex((item) => item.label === EVENTS_NAV_ITEM.after);
      const insertAt = at === -1 ? items.length : at + 1;
      items = [...items.slice(0, insertAt), EVENTS_NAV_ITEM, ...items.slice(insertAt)];
    }

    items = items.filter((item) => !item.permission || allow(item.permission));
    return items.length ? { ...group, items } : null;
  }).filter(Boolean);
}
