import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
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
  onAllRead,
  isLoading = false,
  isError = false,
}) {
  // readIds tracks which thread ids have been locally marked as read within this mount.
  // Note: resets on panel close/reopen (unmount) — acceptable for mock phase.
  // The nav badge count is cleared via onAllRead() which updates parent state.
  const [readIds, setReadIds] = useState(new Set());
  const firstItemRef = useRef(null);

  // Move focus into panel when it opens
  useEffect(() => {
    if (isOpen) firstItemRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const isUnread = (t) => t.unread && !readIds.has(t.id);
  const anyUnread = threads.some(isUnread);

  const markAllRead = () => {
    // TODO: call PATCH /api/agency/messages/read-all then invalidate ['agency','messages','threads'] query
    setReadIds(new Set(threads.map(t => t.id)));
    onAllRead?.(); // clears the nav badge in the parent
  };

  return (
    <div className="nav-panel md-panel" aria-label="Messages">
      {/* Header */}
      <div className="md-header">
        <p className="md-title">Messages</p>
        {anyUnread && (
          <button className="md-mark-read" onClick={markAllRead}>
            Mark all read
          </button>
        )}
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
          const unread = isUnread(thread);
          return (
            <Link
              key={thread.id}
              to="/dashboard/agency/messages"
              className={`md-thread${unread ? ' md-thread--unread' : ''}`}
              onClick={onClose}
              ref={idx === 0 ? firstItemRef : null}
            >
              {unread && <span className="md-unread-dot" aria-hidden="true" />}

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
