import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Eye, Download, Zap, Bell, Check, ChevronRight } from 'lucide-react';

const getRelativeTime = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';

  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'just now';

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return 'yesterday';
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** Map backend activity_type to UI filter + icon bucket (tabs: views / downloads). */
function mapActivityTypeToUiType(activityType) {
  const t = String(activityType || '').toLowerCase();
  if (t === 'portfolio_viewed') return 'profile_view';
  if (t === 'pdf_downloaded') return 'media_download';
  if (t === 'profile_updated') return 'status_change';
  if (t === 'image_uploaded') return 'system';
  if (t === 'profile_view' || t === 'media_download' || t === 'status_change' || t === 'system') {
    return t;
  }
  return 'system';
}

function humanizeActivityType(activityType) {
  const raw = String(activityType || 'activity');
  return raw
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Normalize one row from GET /api/talent/activity (after apiClient unwrap) or legacy shape.
 * API: id, type, message, icon, metadata, createdAt, timeAgo
 * Legacy: activity_type, description, created_at
 */
function mapRealActivityToNotification(act, fallbackIndex = 0) {
  const rawType = act.type ?? act.activity_type ?? 'system';
  const uiType = mapActivityTypeToUiType(rawType);
  const msg = act.message != null && String(act.message).trim() !== '' ? String(act.message).trim() : '';
  const legacyDesc =
    act.description != null && String(act.description).trim() !== '' ? String(act.description).trim() : '';

  const title = msg || humanizeActivityType(rawType);
  const description = msg ? '' : legacyDesc || 'Action performed on your profile';

  const createdRaw = act.createdAt ?? act.created_at;
  let timestamp = null;
  if (createdRaw != null) {
    const d = new Date(createdRaw);
    if (!isNaN(d.getTime())) timestamp = d;
  }

  const timeAgo = act.timeAgo != null && String(act.timeAgo).trim() !== '' ? String(act.timeAgo).trim() : null;
  const fallbackId = `${rawType}:${createdRaw ?? 'na'}:${msg || legacyDesc || 'activity'}:${fallbackIndex}`;

  return {
    id: act.id ?? fallbackId,
    type: uiType,
    title,
    description,
    timestamp,
    timeDisplay: timeAgo,
    /** Server has no read flag; treat as unread until user marks read locally. */
    isRead: false,
    source: 'api',
  };
}

const READ_IDS_STORAGE_KEY = 'pholio-talent-notif-read-ids';

function loadReadIdsFromStorage() {
  try {
    const raw = sessionStorage.getItem(READ_IDS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function persistReadIds(ids) {
  try {
    sessionStorage.setItem(READ_IDS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / private mode */
  }
}

const NOTIF_TAB_KEYS = ['all', 'views', 'downloads'];

const NotificationItem = ({ notification, onRead }) => {
  const getIcon = (type) => {
    switch(type) {
      case 'profile_view': return <Eye size={16} aria-hidden />;
      case 'media_download': return <Download size={16} aria-hidden />;
      case 'status_change': return <Zap size={16} aria-hidden />;
      case 'system': return <Bell size={16} aria-hidden />;
      default: return <Bell size={16} aria-hidden />;
    }
  };

  const getIconClass = (type) => {
    switch(type) {
      case 'profile_view': return 'icon-view';
      case 'media_download': return 'icon-download';
      case 'status_change': return 'icon-status';
      default: return 'icon-system';
    }
  };

  const timeLabel = notification.timeDisplay ?? getRelativeTime(notification.timestamp);
  const detailParts = [notification.title];
  if (notification.description) detailParts.push(notification.description);
  if (timeLabel) detailParts.push(timeLabel);
  const ariaLabel = `${detailParts.join('. ')}. ${
    notification.isRead ? 'Read notification.' : 'Mark as read.'
  }`;

  return (
    <button
      type="button"
      className={`notification-item ${notification.isRead ? 'read' : 'unread'}`}
      onClick={() => onRead(notification.id)}
      aria-label={ariaLabel}
    >
      <div className={`notification-icon-wrapper ${getIconClass(notification.type)}`}>
        {getIcon(notification.type)}
      </div>

      <div className="notification-content">
        <div className="notification-top-row">
          <span className="notification-title">{notification.title}</span>
          {!notification.isRead ? <span className="unread-dot" aria-hidden /> : null}
        </div>
        {notification.description ? (
          <p className="notification-desc">{notification.description}</p>
        ) : null}
        <span className="notification-time">
          {timeLabel}
        </span>
      </div>
    </button>
  );
};

export default function NotificationDropdown({
  onClose,
  realActivities = [],
  activitiesLoading = false,
  onUnreadCountChange,
}) {
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'views' | 'downloads'
  const [readIds, setReadIds] = useState(loadReadIdsFromStorage);

  const baseNotifications = useMemo(() => {
    const transformedReal = (realActivities || []).map((act, index) =>
      mapRealActivityToNotification(act, index),
    );

    const sortByTimeDesc = (a, b) => {
      const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
      const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
      return timeB - timeA;
    };

    const sortedReal = [...transformedReal].sort(sortByTimeDesc);

    if (sortedReal.length > 0) return sortedReal;
    return [];
  }, [realActivities]);

  const notifications = useMemo(
    () =>
      baseNotifications.map((n) => ({
        ...n,
        isRead: n.isRead || readIds.has(n.id),
      })),
    [baseNotifications, readIds],
  );

  useEffect(() => {
    persistReadIds(readIds);
  }, [readIds]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const markAsRead = (id) => {
    const base = baseNotifications.find((n) => n.id === id);
    if (!base) return;
    const effectiveRead = base.isRead || readIds.has(id);
    if (!effectiveRead) {
      setReadIds((prev) => new Set([...prev, id]));
    }
  };

  const markAllAsRead = () => {
    const hasUnread = baseNotifications.some((n) => !n.isRead && !readIds.has(n.id));
    if (!hasUnread) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      baseNotifications.forEach((n) => {
        if (!n.isRead) next.add(n.id);
      });
      return next;
    });
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'all') return true;
    if (activeTab === 'views') return n.type === 'profile_view';
    if (activeTab === 'downloads') return n.type === 'media_download';
    return true;
  });

  const hasAnyUnread = unreadCount > 0;

  const showActivitiesLoading =
    activitiesLoading && (realActivities?.length ?? 0) === 0 && baseNotifications.length === 0;

  const handleTabListKeyDown = useCallback(
    (e) => {
      const i = NOTIF_TAB_KEYS.indexOf(activeTab);
      if (i < 0) return;

      const focusTab = (key) => {
        setActiveTab(key);
        queueMicrotask(() => document.getElementById(`notif-tab-${key}`)?.focus());
      };

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        focusTab(NOTIF_TAB_KEYS[(i + 1) % NOTIF_TAB_KEYS.length]);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        focusTab(NOTIF_TAB_KEYS[(i - 1 + NOTIF_TAB_KEYS.length) % NOTIF_TAB_KEYS.length]);
      } else if (e.key === 'Home') {
        e.preventDefault();
        focusTab(NOTIF_TAB_KEYS[0]);
      } else if (e.key === 'End') {
        e.preventDefault();
        focusTab(NOTIF_TAB_KEYS[NOTIF_TAB_KEYS.length - 1]);
      }
    },
    [activeTab],
  );

  return (
    <div className="notification-dropdown-refined">
      <div className="notification-dropdown-header">
        <div className="header-top">
          <h3>Notifications</h3>
          <button
            type="button"
            className="mark-all-read"
            onClick={markAllAsRead}
            disabled={!hasAnyUnread}
          >
            <Check size={14} aria-hidden />
            <span>Mark all read</span>
          </button>
        </div>
        
        <div
          className="notification-tabs"
          role="tablist"
          aria-label="Filter notifications by type"
          onKeyDown={handleTabListKeyDown}
        >
          <button
            type="button"
            id="notif-tab-all"
            role="tab"
            aria-selected={activeTab === 'all'}
            aria-controls="notif-list-panel"
            tabIndex={activeTab === 'all' ? 0 : -1}
            className={`notif-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button
            type="button"
            id="notif-tab-views"
            role="tab"
            aria-selected={activeTab === 'views'}
            aria-controls="notif-list-panel"
            tabIndex={activeTab === 'views' ? 0 : -1}
            className={`notif-tab ${activeTab === 'views' ? 'active' : ''}`}
            onClick={() => setActiveTab('views')}
          >
            Views
          </button>
          <button
            type="button"
            id="notif-tab-downloads"
            role="tab"
            aria-selected={activeTab === 'downloads'}
            aria-controls="notif-list-panel"
            tabIndex={activeTab === 'downloads' ? 0 : -1}
            className={`notif-tab ${activeTab === 'downloads' ? 'active' : ''}`}
            onClick={() => setActiveTab('downloads')}
          >
            Downloads
          </button>
        </div>
      </div>

      <div
        id="notif-list-panel"
        role="tabpanel"
        aria-labelledby={`notif-tab-${activeTab}`}
        className="notification-list-scroll"
      >
        {showActivitiesLoading ? (
          <div className="notification-empty notification-empty--loading" role="status" aria-live="polite">
            <p className="empty-title">Loading notifications…</p>
            <p className="empty-desc">Fetching your latest activity.</p>
          </div>
        ) : filteredNotifications.length > 0 ? (
          filteredNotifications.map((notif) => (
            <NotificationItem
              key={notif.id}
              notification={notif}
              onRead={markAsRead}
            />
          ))
        ) : (
          <div className="notification-empty">
            <div className="empty-icon-circle">
              <Bell size={24} aria-hidden />
            </div>
            <p className="empty-title">No notifications yet</p>
            <p className="empty-desc">Activities related to your profile will appear here.</p>
          </div>
        )}
      </div>

      <NavLink 
        to="/dashboard/talent/analytics" 
        className="notification-dropdown-footer"
        onClick={onClose}
      >
        <span>View all activity</span>
        <ChevronRight size={14} aria-hidden />
      </NavLink>
    </div>
  );
}
