import { useQuery } from '@tanstack/react-query';
import { getEventCalls } from '../../api/agency';
import { useAgencyPermissions } from '../../hooks/useAgencyPermissions';

export const EVENT_CALLS_KEY = ['agency-event-calls'];

/**
 * The agency's event calls, plus its `org_kind`.
 *
 * One query backs both the Events pages and the sidebar entry, so opening the
 * dashboard does not cost an extra request and the nav cannot disagree with
 * the page it links to.
 */
export function useEventCalls({ enabled = true } = {}) {
  const { can } = useAgencyPermissions();
  const permitted = can('open_call.view');

  return useQuery({
    queryKey: EVENT_CALLS_KEY,
    queryFn: getEventCalls,
    enabled: enabled && permitted,
    staleTime: 60_000,
    // A workspace with no event schema yet answers 503; asking again on a
    // loop would not change that.
    retry: (failureCount, error) => error?.status !== 503 && failureCount < 2,
  });
}

/**
 * Ruling R10, in one boolean: the Events entry renders for an event organizer,
 * or for an agency that has created at least one event call. Never a separate
 * dashboard — one extra item in the same rail.
 *
 * The rule itself is evaluated server-side (`GET /api/agency/events`) so the
 * nav and the page cannot disagree. False while loading and on error, so a
 * house that runs no events never sees the entry appear and then vanish.
 */
export function useEventsEnabled() {
  const { data } = useEventCalls();
  return Boolean(data?.eventsEnabled);
}
