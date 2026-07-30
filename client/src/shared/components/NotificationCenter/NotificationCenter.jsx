import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { talentApi } from '../../../domains/talent/api/talent';
import NotificationInbox from './NotificationInbox';
import { TALENT_NOTIFICATIONS_QUERY_KEY } from './talentNotifications';
import './NotificationCenter.css';

export default function NotificationCenter({ onClose, panelClassName = '' }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
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
      if (!item.isRead) {
        await markReadMutation.mutateAsync(item.id);
      }
      onClose?.();
      if (item.routeTarget) {
        navigate(item.routeTarget);
      }
    },
    [markReadMutation, navigate, onClose],
  );

  const handleFooter = useCallback(() => {
    onClose?.();
    navigate('/dashboard/talent/applications');
  }, [navigate, onClose]);

  return (
    <NotificationInbox
      className={panelClassName}
      variant="talent"
      notifications={notifications}
      unreadCount={unreadCount}
      isLoading={isLoading}
      isError={isError}
      markAllPending={markAllMutation.isPending}
      onMarkAllRead={() => markAllMutation.mutate()}
      onItemClick={handleItemClick}
      footerLabel="Open applications"
      onFooterClick={handleFooter}
    />
  );
}
