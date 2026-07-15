import { useQuery } from '@tanstack/react-query';
import { talentApi } from '../../../domains/talent/api/talent';
import { TALENT_NOTIFICATIONS_QUERY_KEY } from './talentNotifications';

/** Shares the notification cache with the talent notification panel. */
export function useNotificationUnreadCount() {
  const { data } = useQuery({
    queryKey: TALENT_NOTIFICATIONS_QUERY_KEY,
    queryFn: () => talentApi.getNotifications(),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 15000,
    select: (payload) => payload?.unreadCount ?? 0,
  });
  return data ?? 0;
}
