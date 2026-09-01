import { useQuery } from '@tanstack/react-query';
import { talentApi } from '../../../domains/talent/api/talent';
import { TALENT_NOTIFICATIONS_QUERY_KEY } from './talentNotifications';
import { buildSignalDigest } from './talentSignalModel';

/**
 * What the bell itself needs to know. Shares the panel's cache, so opening the
 * panel costs no extra request.
 *
 * `needsAction` is the reason this returns an object rather than a number: an
 * unread offer and an unread profile view should not light the header the same
 * way, and the talent should be able to tell from the bar whether the click is
 * worth making.
 */
export function useTalentSignalSummary() {
  const { data } = useQuery({
    queryKey: TALENT_NOTIFICATIONS_QUERY_KEY,
    queryFn: () => talentApi.getNotifications(),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 15000,
    select: (payload) => {
      const digest = buildSignalDigest(payload?.notifications ?? []);
      return {
        unreadCount: payload?.unreadCount ?? 0,
        needsAction: digest.unreadActionCount > 0,
      };
    },
  });

  return data ?? { unreadCount: 0, needsAction: false };
}
