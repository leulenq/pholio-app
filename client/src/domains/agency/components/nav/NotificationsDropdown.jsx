import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  markAgencyNotificationRead,
  markAllAgencyNotificationsRead,
} from '../../api/agency';
import NotificationInbox from '../../../../shared/components/NotificationCenter/NotificationInbox';
import '../../../../shared/components/NotificationCenter/NotificationCenter.css';

export default function NotificationsDropdown({
  isOpen,
  onClose,
  notifications = [],
  unreadCount = 0,
  isLoading = false,
  isError = false,
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const markReadMutation = useMutation({
    mutationFn: markAgencyNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency', 'notifications'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: markAllAgencyNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency', 'notifications'] });
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
    navigate('/dashboard/agency/submissions');
  }, [navigate, onClose]);

  if (!isOpen) return null;

  return (
    <div className="nd-panel-host">
      <NotificationInbox
        variant="agency"
        notifications={notifications}
        unreadCount={unreadCount}
        isLoading={isLoading}
        isError={isError}
        markAllPending={markAllMutation.isPending}
        onMarkAllRead={() => markAllMutation.mutate()}
        onItemClick={handleItemClick}
        footerLabel="Review submissions"
        onFooterClick={handleFooter}
      />
    </div>
  );
}
