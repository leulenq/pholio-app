import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Bell, UserPlus, Calendar, Clock, CheckCircle } from 'lucide-react';
import './NotificationsDropdown.css';

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

const TYPE_CONFIG = {
  application: { icon: UserPlus,     color: 'var(--ag-gold)'    },
  interview:   { icon: Calendar,     color: 'var(--ag-info)'    },
  reminder:    { icon: Clock,        color: 'var(--ag-warning)' },
  placement:   { icon: CheckCircle,  color: 'var(--ag-success)' },
};

export default function NotificationsDropdown({
  isOpen,
  onClose,
  notifications,
  onAllRead,
  isLoading = false,
  isError = false,
}) {
  const [readIds, setReadIds] = useState(new Set());
  const firstItemRef = useRef(null);

  useEffect(() => {
    if (isOpen) firstItemRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const isUnread = (n) => n.unread && !readIds.has(n.id);
  const anyUnread = notifications.some(isUnread);

  const markAllRead = () => {
    // TODO: call PATCH /api/agency/notifications/read-all then invalidate ['agency','notifications'] query
    setReadIds(new Set(notifications.map(n => n.id)));
    onAllRead?.();
  };

  return (
    <div className="nav-panel nd-panel" aria-label="Notifications">
      {/* Header */}
      <div className="nd-header">
        <p className="nd-title">Notifications</p>
        {anyUnread && (
          <button className="nd-mark-read" onClick={markAllRead}>
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <ul role="list" className="nd-list">
        {isLoading && (
          <>
            {[1, 2, 3].map(i => (
              <div key={i} className="nd-skeleton-row">
                <div className="skeleton nd-skel-circle" />
                <div className="nd-skel-lines">
                  <div className="skeleton nd-skel-line nd-skel-line--wide" />
                  <div className="skeleton nd-skel-line nd-skel-line--short" />
                </div>
              </div>
            ))}
          </>
        )}

        {isError && (
          <div className="nd-state">Couldn't load notifications</div>
        )}

        {!isLoading && !isError && notifications.length === 0 && (
          <div className="nd-state">
            <Bell size={32} color="var(--ag-text-3)" />
            You're all caught up
          </div>
        )}

        {!isLoading && !isError && notifications.map((notif, idx) => {
          const unread = isUnread(notif);
          const { icon: Icon, color } = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.application;

          return (
            <li
              key={notif.id}
              role="listitem"
              className={`nd-item${unread ? ' nd-item--unread' : ''}`}
              ref={idx === 0 ? firstItemRef : null}
              tabIndex={0}
            >
              <div className="nd-icon-circle" style={{ background: color }}>
                <Icon size={16} color="#ffffff" />
              </div>
              <div className="nd-item-body">
                <div className="nd-item-top">
                  <span className="nd-item-title">{notif.title}</span>
                  <span className="nd-item-time">{relativeTime(notif.timestamp)}</span>
                </div>
                <p className="nd-item-detail">{notif.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div className="nd-footer">
        <Link to="/dashboard/agency/activity" onClick={onClose}>
          View all activity →
        </Link>
      </div>
    </div>
  );
}
