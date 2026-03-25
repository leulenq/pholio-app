import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Eye, 
  Download, 
  Zap, 
  Bell, 
  Check, 
  MoreHorizontal,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

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
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const MOCK_NOTIFICATIONS = [
  {
    id: '1',
    type: 'profile_view',
    title: 'Profile View',
    description: 'Agency "Elite Models" viewed your profile',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    isRead: false,
  },
  {
    id: '2',
    type: 'media_download',
    title: 'Comp Card Download',
    description: 'A scout downloaded your primary comp card',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // Yesterday
    isRead: false,
  },
  {
    id: '3',
    type: 'status_change',
    title: 'Profile Level Up!',
    description: 'You reached "Advanced" profile strength',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48), // 2 days ago
    isRead: true,
  },
  {
    id: '4',
    type: 'profile_view',
    title: 'New Interaction',
    description: 'Someone from New York viewed your portfolio',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72), // 3 days ago
    isRead: true,
  }
];

const NotificationItem = ({ notification, onRead }) => {
  const getIcon = (type) => {
    switch(type) {
      case 'profile_view': return <Eye size={16} />;
      case 'media_download': return <Download size={16} />;
      case 'status_change': return <Zap size={16} />;
      case 'system': return <Bell size={16} />;
      default: return <Bell size={16} />;
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

  return (
    <div 
      className={`notification-item ${notification.isRead ? 'read' : 'unread'}`}
      onClick={() => onRead(notification.id)}
    >
      <div className={`notification-icon-wrapper ${getIconClass(notification.type)}`}>
        {getIcon(notification.type)}
      </div>
      
      <div className="notification-content">
        <div className="notification-top-row">
          <span className="notification-title">{notification.title}</span>
          {!notification.isRead && <span className="unread-dot" />}
        </div>
        <p className="notification-desc">{notification.description}</p>
        <span className="notification-time">
          {getRelativeTime(notification.timestamp)}
        </span>
      </div>
    </div>
  );
};

export default function NotificationDropdown({ onClose, realActivities = [], onMarkRead, onMarkAllRead }) {
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'views' | 'downloads'
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    // Transform real logs if available, otherwise use mock
    const transformedReal = realActivities.map(act => {
      // Ensure we have a valid date
      let dateObj = new Date(act.created_at);
      if (isNaN(dateObj.getTime())) {
        dateObj = new Date(); // Fallback to now if invalid
      }

      return {
        id: act.id,
        type: act.activity_type === 'profile_updated' ? 'system' : 'profile_view',
        title: (act.activity_type || 'Activity').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        description: act.description || 'Action performed on your profile',
        timestamp: dateObj,
        isRead: true,
      };
    });

    // Combine and sort
    const combined = [...transformedReal, ...MOCK_NOTIFICATIONS].sort((a, b) => {
      // Safety check for sort
      const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
      const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
      return timeB - timeA;
    });
    setNotifications(combined);
  }, [realActivities]);

  const markAsRead = (id) => {
    const notif = notifications.find(n => n.id === id);
    if (notif && !notif.isRead) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      onMarkRead();
    }
  };

  const markAllAsRead = () => {
    const unreadExist = notifications.some(n => !n.isRead);
    if (unreadExist) {
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      onMarkAllRead();
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'all') return true;
    if (activeTab === 'views') return n.type === 'profile_view';
    if (activeTab === 'downloads') return n.type === 'media_download';
    return true;
  });

  return (
    <div className="notification-dropdown-refined">
      <div className="notification-dropdown-header">
        <div className="header-top">
          <h3>Notifications</h3>
          <button className="mark-all-read" onClick={markAllAsRead}>
            <Check size={14} />
            <span>Mark all read</span>
          </button>
        </div>
        
        <div className="notification-tabs">
          <button 
            className={`notif-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button 
            className={`notif-tab ${activeTab === 'views' ? 'active' : ''}`}
            onClick={() => setActiveTab('views')}
          >
            Views
          </button>
          <button 
            className={`notif-tab ${activeTab === 'downloads' ? 'active' : ''}`}
            onClick={() => setActiveTab('downloads')}
          >
            Downloads
          </button>
        </div>
      </div>

      <div className="notification-list-scroll">
        {filteredNotifications.length > 0 ? (
          filteredNotifications.map(notif => (
            <NotificationItem 
              key={notif.id} 
              notification={notif} 
              onRead={markAsRead} 
            />
          ))
        ) : (
          <div className="notification-empty">
            <div className="empty-icon-circle">
              <Bell size={24} />
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
        <ChevronRight size={14} />
      </NavLink>
    </div>
  );
}
