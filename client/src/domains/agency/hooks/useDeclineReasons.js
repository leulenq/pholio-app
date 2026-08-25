import { useQuery } from '@tanstack/react-query';
import { getDeclineReasons } from '../api/agency';

/**
 * The templated decline vocabulary, fetched from the server
 * (`GET /api/agency/decline-reasons`) rather than duplicated here — the
 * server is the one place the reason list and its talent-facing wording are
 * defined, so this hook exists to keep the client from ever hardcoding a copy
 * that could drift from it.
 *
 * Each option is `{ id, label, talentMessage }`: `label` is what the reviewer
 * picks from, `talentMessage` is the verbatim sentence the talent will read —
 * shown to the reviewer as a preview before they send it.
 *
 * `enabled` lets callers defer the fetch until the picker is actually visible
 * (e.g. a closed modal), so it never fires on every page mount.
 */
export function useDeclineReasons({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: ['agency', 'decline-reasons'],
    queryFn: getDeclineReasons,
    enabled,
    staleTime: Infinity, // a fixed vocabulary for the life of the session
    gcTime: Infinity,
  });

  return {
    reasons: Array.isArray(query.data) ? query.data : [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export default useDeclineReasons;
