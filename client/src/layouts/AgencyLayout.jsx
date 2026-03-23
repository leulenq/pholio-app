import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Bell,
  ChevronDown,
  Settings,
  MessageSquare,
  Inbox
} from 'lucide-react';
import { getAgencyProfile, getMessageThreads, getPipelineCounts } from '../api/agency';
import MessagesDropdown from '../components/agency/nav/MessagesDropdown';
import NotificationsDropdown from '../components/agency/nav/NotificationsDropdown';
import UserDropdown from '../components/agency/nav/UserDropdown';
import './AgencyLayout.css';

/* ─── top nav tabs ─── */
const NAV_TABS = [
  { label: 'Inbox',     to: '/dashboard/agency/inbox',      end: false },
  { label: 'Roster',    to: '/dashboard/agency/roster'                 },
  { label: 'Casting',   to: '/dashboard/agency/casting'               },
  { label: 'Discover',  to: '/dashboard/agency/discover'              },
  { label: 'Analytics', to: '/dashboard/agency/analytics'             },
  { label: 'Overview',  to: '/dashboard/agency/overview'              },
];

// MOCK_NOTIFICATIONS placeholder

// TODO: replace MOCK_NOTIFICATIONS with useQuery(['agency', 'notifications'], fetchNotifications)
// Future endpoint: GET /api/agency/notifications
const MOCK_NOTIFICATIONS = [
  {
    id: 'notif-1',
    type: 'application',
    title: 'New application received',
    detail: 'Maya Torres applied for Vogue Editorial',
    timestamp: '2026-03-15T10:30:00Z',
    unread: true,
  },
  {
    id: 'notif-2',
    type: 'interview',
    title: 'Interview scheduled',
    detail: 'James Park — Tuesday 18 March at 2:00 PM',
    timestamp: '2026-03-14T14:00:00Z',
    unread: true,
  },
  {
    id: 'notif-3',
    type: 'reminder',
    title: 'Reminder due today',
    detail: 'Follow up with Zara Studio re: placement',
    timestamp: '2026-03-15T09:00:00Z',
    unread: false,
  },
  {
    id: 'notif-4',
    type: 'placement',
    title: 'Placement confirmed',
    detail: 'Sofia Reyes — Dior Campaign · March 2026',
    timestamp: '2026-03-12T11:30:00Z',
    unread: false,
  },
];

export default function AgencyLayout() {
  const [openPanel, setOpenPanel] = useState(null); // 'messages' | 'notifications' | 'user' | null
  const location = useLocation();

  // Wrapper refs (for outside-click detection)
  const messagesRef = useRef(null);
  const notificationsRef = useRef(null);
  const userRef = useRef(null);

  // Trigger button refs (for focus-return on close)
  const messagesBtnRef = useRef(null);
  const notificationsBtnRef = useRef(null);
  const userBtnRef = useRef(null);

  // Stable close function — empty deps because setOpenPanel and btn refs are stable
  const closePanel = useCallback((panelName) => {
    setOpenPanel(null);
    if (panelName === 'messages') messagesBtnRef.current?.focus();
    else if (panelName === 'notifications') notificationsBtnRef.current?.focus();
    else if (panelName === 'user') userBtnRef.current?.focus();
  }, []);

  // Ref so the outside-click handler (stable, [] deps) can read the current openPanel
  // without capturing a stale closure value
  const openPanelRef = useRef(null);
  useEffect(() => { openPanelRef.current = openPanel; }, [openPanel]);

  // Close on outside click — calls closePanel so focus is restored to the trigger
  useEffect(() => {
    const handler = (e) => {
      const outside =
        !messagesRef.current?.contains(e.target) &&
        !notificationsRef.current?.contains(e.target) &&
        !userRef.current?.contains(e.target);
      if (outside && openPanelRef.current) closePanel(openPanelRef.current);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [closePanel]);

  // Close on route change
  useEffect(() => { setOpenPanel(null); }, [location.pathname]);

  // Close on Escape (with focus restore)
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && openPanel) closePanel(openPanel);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [openPanel, closePanel]);

  // Track whether the user has clicked "Mark all read" inside each panel.
  const [msgsAllRead, setMsgsAllRead] = useState(false);
  const [notifsAllRead, setNotifsAllRead] = useState(false);

  // Messages Logic
  const { data: threads = [], isLoading: isMsgsLoading, isError: isMsgsError } = useQuery({
    queryKey: ['agency', 'messages', 'threads'],
    queryFn: getMessageThreads,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Derived badge counts
  const unreadMessages = msgsAllRead ? 0 : threads.filter(t => t.unread).length;
  const hasUnreadNotifications = !notifsAllRead && MOCK_NOTIFICATIONS.some(n => n.unread);

  const { data: profile } = useQuery({
    queryKey: ['agency-profile'],
    queryFn: getAgencyProfile,
    staleTime: 5 * 60 * 1000,
  });

  const { data: pipelineCounts } = useQuery({
    queryKey: ['agency', 'pipeline-counts'],
    queryFn: getPipelineCounts,
    refetchInterval: 30000,
  });

  const userName = profile?.first_name 
    ? (profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.first_name)
    : profile?.agency_name || profile?.email?.split('@')[0] || 'Agency User';

  const isDiscoverPage = location.pathname === '/dashboard/agency/discover';

  if (profile?.onboarding?.completed === false) {
    return <Navigate to="/dashboard/agency/onboarding" replace />;
  }

  return (
    <div className={`ag-shell ${isDiscoverPage ? 'ag-shell--discover' : ''}`}>
      {/* ══════════════════════════════════════════════════════
          TOP NAV BAR (Full Width)
          ══════════════════════════════════════════════════════ */}
      <header className="ag-topbar">
        {/* Left — Brand Lockup */}
        <div className="ag-topbar-brand">
          <span className="ag-brand-wordmark">PHOLIO</span>
          <div className="ag-brand-separator" />
          <span className="ag-brand-agency">{profile?.agency_name?.toUpperCase() || 'SMG MODELS'}</span>
        </div>

        {/* Center — Navigation Pills */}
        <nav className="ag-topbar-nav">
          <div className="ag-nav-pills-container">
            {NAV_TABS.map((tab) => (
              <NavLink
                key={tab.label}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `ag-nav-pill ${isActive ? 'active' : ''}`
                }
              >
                {tab.label}
                {tab.label === 'Inbox' && pipelineCounts?.pending > 0 && (
                  <span className="ag-nav-pill__badge">{pipelineCounts.pending}</span>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Right — Actions + User */}
        <div className="ag-topbar-right">
          <button className="ag-topbar-icon" aria-label="Search">
            <Search size={18} />
          </button>

          {/* Messages */}
          <div ref={messagesRef} style={{ position: 'relative' }}>
            <button
              ref={messagesBtnRef}
              className="ag-topbar-icon"
              aria-label="Messages"
              aria-expanded={openPanel === 'messages'}
              aria-haspopup="true"
              onClick={() => setOpenPanel(p => p === 'messages' ? null : 'messages')}
            >
              <MessageSquare size={18} />
              {unreadMessages > 0 && <span className="ag-icon-badge">{unreadMessages}</span>}
            </button>
            <MessagesDropdown
              isOpen={openPanel === 'messages'}
              onClose={() => closePanel('messages')}
              threads={threads}
              onAllRead={() => setMsgsAllRead(true)}
              isLoading={isMsgsLoading}
              isError={isMsgsError}
            />
          </div>

          {/* Notifications */}
          <div ref={notificationsRef} style={{ position: 'relative' }}>
            <button
              ref={notificationsBtnRef}
              className="ag-topbar-icon ag-topbar-icon--bell"
              aria-label="Notifications"
              aria-expanded={openPanel === 'notifications'}
              aria-haspopup="true"
              onClick={() => setOpenPanel(p => p === 'notifications' ? null : 'notifications')}
            >
              <Bell size={18} />
              {hasUnreadNotifications && <span className="ag-bell-dot" />}
            </button>
            <NotificationsDropdown
              isOpen={openPanel === 'notifications'}
              onClose={() => closePanel('notifications')}
              notifications={MOCK_NOTIFICATIONS}
              onAllRead={() => setNotifsAllRead(true)}
              isLoading={false}
              isError={false}
            />
          </div>

          <Link to="/dashboard/agency/settings" className="ag-topbar-icon" aria-label="Settings">
            <Settings size={18} />
          </Link>

          {/* Separator */}
          <div className="ag-topbar-sep" />

          {/* User menu */}
          <div ref={userRef} style={{ position: 'relative' }} className="ag-user-menu">
            <button
              ref={userBtnRef}
              className="ag-user-trigger"
              aria-expanded={openPanel === 'user'}
              aria-haspopup="true"
              onClick={() => setOpenPanel(p => p === 'user' ? null : 'user')}
            >
              {profile?.images?.[0]?.path ? (
                <img src={`/${profile.images[0].path}`} alt={userName} className="ag-user-avatar" />
              ) : (
                <div className="ag-user-avatar ag-user-avatar--initials" aria-hidden="true">
                  {userName.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)}
                </div>
              )}
              <span className="ag-user-name">{userName}</span>
              <ChevronDown
                size={14}
                className={`ag-user-chevron ${openPanel === 'user' ? 'ag-user-chevron--open' : ''}`}
              />
            </button>
            <UserDropdown
              isOpen={openPanel === 'user'}
              onClose={() => closePanel('user')}
              profile={profile}
            />
          </div>
        </div>
      </header>

      <div className="ag-body-wrapper">
        <main className="ag-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
