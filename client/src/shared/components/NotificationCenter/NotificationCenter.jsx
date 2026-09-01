import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { talentApi } from '../../../domains/talent/api/talent';
import TalentSignalPanel from './TalentSignalPanel';
import { TALENT_NOTIFICATIONS_QUERY_KEY } from './talentNotifications';

/**
 * Data + navigation shell for the talent bell. All presentation and triage
 * lives in `TalentSignalPanel` / `talentSignalModel`.
 *
 * The agency bell is a separate surface (`domains/agency/components/nav/
 * NotificationsDropdown`) on a separate design system and is untouched by this.
 */
export default function NotificationCenter({ onClose }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: TALENT_NOTIFICATIONS_QUERY_KEY,
    queryFn: () => talentApi.getNotifications(),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const markReadMutation = useMutation({
    mutationFn: (id) => talentApi.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TALENT_NOTIFICATIONS_QUERY_KEY });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => talentApi.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TALENT_NOTIFICATIONS_QUERY_KEY });
    },
  });

  const handleItemClick = useCallback(
    async (item) => {
      // Navigate even if the read-write fails — the talent asked to go
      // somewhere, and a lost read flag is the cheaper failure.
      if (!item.isRead) {
        try {
          await markReadMutation.mutateAsync(item.id);
        } catch {
          /* non-blocking */
        }
      }
      onClose?.();
      if (item.routeTarget) {
        navigate(item.routeTarget);
      }
    },
    [markReadMutation, navigate, onClose],
  );

  return (
    <TalentSignalPanel
      notifications={notifications}
      unreadCount={unreadCount}
      isLoading={isLoading}
      isError={isError}
      markAllPending={markAllMutation.isPending}
      onMarkAllRead={() => markAllMutation.mutate()}
      onItemClick={handleItemClick}
      onRetry={() => refetch()}
    />
  );
}
