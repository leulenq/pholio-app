import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { markAllMessagesAsRead } from '../../api/agency';
import './MessagesDropdown.css';

/** Returns initials from a full name, e.g. "Maya Torres" → "MT" */
function getInitials(name = '') {
  if (!name.trim()) return '?';
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** Formats an ISO timestamp as a relative string: "2h ago", "1d ago", etc. */
function relativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export default function MessagesDropdown({
  isOpen,
  onClose,
  threads,
  unreadCount = 0,
  isLoading = false,
  isError = false,
}) {
  const firstItemRef = useRef(null);
  const queryClient = useQueryClient();
  const markAllMutation = useMutation({
    mutationFn: markAllMessagesAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency', 'messages', 'threads'] });
    },
  });

  // Move focus into panel when it opens
  useEffect(() => {
    if (isOpen) firstItemRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="nav-panel md-panel" aria-label="Messages">
      {/* Header */}
      <div className="md-header">
        <div className="md-heading">
          <p className="md-title">Messages</p>
          {unreadCount > 0 ? <span className="md-header-count">{unreadCount} unread</span> : null}
        </div>
        {unreadCount > 0 ? (
          <button
            type="button"
            className="md-mark-all"
            disabled={markAllMutation.isPending}
            onClick={() => markAllMutation.mutate()}
          >
            {markAllMutation.isPending ? 'Marking…' : 'Mark all read'}
          </button>
        ) : null}
      </div>

      {/* List */}
      <div className="md-list">
        {isLoading && (
          <>
            {[1, 2, 3].map(i => (
              <div key={i} className="md-skeleton-row">
                <div className="skeleton md-skel-circle" />
                <div className="md-skel-lines">
                  <div className="skeleton md-skel-line md-skel-line--wide" />
                  <div className="skeleton md-skel-line md-skel-line--short" />
                </div>
              </div>
            ))}
          </>
        )}

        {isError && (
          <div className="md-state">Couldn't load messages</div>
        )}

        {!isLoading && !isError && threads.length === 0 && (
          <div className="md-state">
            <Mail size={32} color="var(--ag-text-3)" />
            No messages yet
          </div>
        )}

        {!isLoading && !isError && threads.map((thread, idx) => {
          const unread = thread.unread;
          return (
            <Link
              key={thread.id}
              to="/dashboard/agency/messages"
              className={`md-thread${unread ? ' md-thread--unread' : ''}`}
              onClick={onClose}
              ref={idx === 0 ? firstItemRef : null}
            >
              {thread.senderAvatar ? (
                <img
                  src={thread.senderAvatar}
                  alt={thread.senderName}
                  className="md-avatar"
                />
              ) : (
                <div className="md-avatar-initials" aria-hidden="true">
                  {getInitials(thread.senderName)}
                </div>
              )}

              <div className="md-thread-body">
                <div className="md-thread-top">
                  <span className="md-sender">{thread.senderName}</span>
                  <span className="md-timestamp">{relativeTime(thread.timestamp)}</span>
                </div>
                <p className="md-context">{thread.applicationLabel}</p>
                <p className="md-preview">{thread.preview}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="md-footer">
        <Link to="/dashboard/agency/messages" onClick={onClose}>
          Open full inbox →
        </Link>
      </div>
    </div>
  );
}
