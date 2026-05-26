import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { NavLink, Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  Briefcase,
  ChevronDown,
  Compass,
  ArrowUpRight,
  BarChart3,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Settings,
  Users2,
} from 'lucide-react';
import {
  getAgencyOverview,
  getAgencyProfile,
  getAgencyTeam,
  getMessageThreads,
} from '../../domains/agency/api/agency';
import MessagesDropdown from '../../domains/agency/components/nav/MessagesDropdown';
import NotificationsDropdown from '../../domains/agency/components/nav/NotificationsDropdown';
import UserDropdown from '../../domains/agency/components/nav/UserDropdown';
import './AgencyLayout.css';

const PRIMARY_NAV = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Agency home',
    to: '/dashboard/agency/overview',
    icon: LayoutDashboard,
  },
  {
    id: 'submissions',
    label: 'Submissions',
    description: 'Review queue',
    to: '/dashboard/agency/inbox',
    icon: Inbox,
    match: ['/dashboard/agency/inbox', '/dashboard/agency/applicants'],
  },
  {
    id: 'scout',
    label: 'Scout',
    description: 'Find new faces',
    to: '/dashboard/agency/discover',
    icon: Compass,
  },
  {
    id: 'castings',
    label: 'Castings',
    description: 'Shortlists and bookings',
    to: '/dashboard/agency/casting',
    icon: Briefcase,
    match: ['/dashboard/agency/casting', '/dashboard/agency/boards'],
  },
  {
    id: 'roster',
    label: 'Roster',
    description: 'Signed talent',
    to: '/dashboard/agency/roster',
    icon: Users2,
  },
];

const SECONDARY_NAV = [
  {
    id: 'messages',
    label: 'Messages',
    description: 'Talent conversations',
    to: '/dashboard/agency/messages',
    icon: MessageSquare,
  },
  {
    id: 'activity',
    label: 'Activity',
    description: 'Team feed',
    to: '/dashboard/agency/activity',
    icon: Activity,
  },
  {
    id: 'insights',
    label: 'Insights',
    description: 'Pipeline performance',
    to: '/dashboard/agency/analytics',
    icon: BarChart3,
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Agency admin',
    to: '/dashboard/agency/settings',
    icon: Settings,
  },
];

const SECTION_META = [
  {
    match: ['/dashboard/agency/overview'],
    eyebrow: 'Agency Home',
    title: 'Overview',
    subtitle: 'High-signal view of submissions, scouting, castings, and roster movement.',
  },
  {
    match: ['/dashboard/agency/inbox', '/dashboard/agency/applicants'],
    eyebrow: 'Workflow',
    title: 'Submissions',
    subtitle: 'Review new applicants, compare talent, and push the strongest prospects forward quickly.',
  },
  {
    match: ['/dashboard/agency/discover'],
    eyebrow: 'Workflow',
    title: 'Scout',
    subtitle: 'Search for new faces, assess fit, and invite promising talent into your pipeline.',
  },
  {
    match: ['/dashboard/agency/casting', '/dashboard/agency/boards'],
    eyebrow: 'Workflow',
    title: 'Castings',
    subtitle: 'Track active roles, shortlist candidates, and move talent toward meetings or bookings.',
  },
  {
    match: ['/dashboard/agency/roster'],
    eyebrow: 'Workflow',
    title: 'Roster',
    subtitle: 'Manage signed talent, monitor utilization, and surface who needs attention next.',
  },
  {
    match: ['/dashboard/agency/messages'],
    eyebrow: 'Utility',
    title: 'Messages',
    subtitle: 'Stay on top of conversations with applicants and talent across the agency.',
  },
  {
    match: ['/dashboard/agency/activity'],
    eyebrow: 'Utility',
    title: 'Activity',
    subtitle: 'Follow the agency-wide feed of decisions, movement, and follow-up work.',
  },
  {
    match: ['/dashboard/agency/analytics'],
    eyebrow: 'Utility',
    title: 'Insights',
    subtitle: 'Read the health of your funnel, shortlist quality, and roster growth over time.',
  },
  {
    match: ['/dashboard/agency/settings'],
    eyebrow: 'Admin',
    title: 'Settings',
    subtitle: 'Manage team access, branding, billing, and agency configuration.',
  },
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

  const { data: overview } = useQuery({
    queryKey: ['agency', 'overview'],
    queryFn: getAgencyOverview,
    staleTime: 60000,
  });

  const { data: team = [] } = useQuery({
    queryKey: ['agency', 'team'],
    queryFn: getAgencyTeam,
    staleTime: 5 * 60 * 1000,
  });

  const userName = profile?.first_name 
    ? (profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.first_name)
    : profile?.agency_name || profile?.email?.split('@')[0] || 'Agency User';

  const pendingReview = overview?.kpis?.pendingReview?.count ?? 0;
  const activeCastings = overview?.kpis?.activeCastings?.count ?? 0;
  const rosterSize = overview?.kpis?.rosterSize?.count ?? 0;
  const discoverableCount = overview?.pulse?.discoverableCount ?? null;

  const navBadges = {
    submissions: pendingReview,
    scout: discoverableCount,
    castings: activeCastings,
    roster: rosterSize,
    messages: unreadMessages,
  };

  const activeSection = useMemo(() => {
    return SECTION_META.find((item) => item.match.some((path) => location.pathname.startsWith(path)))
      || SECTION_META[0];
  }, [location.pathname]);

  if (profile?.onboarding?.completed === false) {
    return <Navigate to="/dashboard/agency/onboarding" replace />;
  }

  return (
    <div className="ag-shell">
      <aside className="ag-sidebar">
        <div className="ag-sidebar__top">
          <Link to="/dashboard/agency/overview" className="ag-brand-lockup">
            <span className="ag-brand-wordmark">PHOLIO</span>
            <span className="ag-brand-chip">AGENCY</span>
          </Link>

          <div className="ag-agency-card">
            <span className="ag-agency-card__eyebrow">Collaborative Workspace</span>
            <h2 className="ag-agency-card__title">{profile?.agency_name || 'Agency Dashboard'}</h2>
            <p className="ag-agency-card__meta">
              {team.length} team member{team.length === 1 ? '' : 's'} active
              <span className="ag-agency-card__dot" />
              {pendingReview} submission{pendingReview === 1 ? '' : 's'} waiting
            </p>
            <div className="ag-agency-card__stats">
              <div className="ag-stat-pill">
                <span className="ag-stat-pill__label">Submissions</span>
                <span className="ag-stat-pill__value">{pendingReview}</span>
              </div>
              <div className="ag-stat-pill">
                <span className="ag-stat-pill__label">Castings</span>
                <span className="ag-stat-pill__value">{activeCastings}</span>
              </div>
              <div className="ag-stat-pill">
                <span className="ag-stat-pill__label">Roster</span>
                <span className="ag-stat-pill__value">{rosterSize}</span>
              </div>
            </div>
          </div>

          <nav className="ag-sidebar__nav" aria-label="Agency workflow">
            <div className="ag-sidebar__group">
              <span className="ag-sidebar__group-label">Workflow</span>
              {PRIMARY_NAV.map((item) => {
                const Icon = item.icon;
                const badge = navBadges[item.id];
                const isCurrent = (item.match || [item.to]).some((path) => location.pathname.startsWith(path));
                return (
                  <NavLink
                    key={item.id}
                    to={item.to}
                    className={`ag-nav-link${isCurrent ? ' active' : ''}`}
                  >
                    <span className="ag-nav-link__icon">
                      <Icon size={17} />
                    </span>
                    <span className="ag-nav-link__content">
                      <span className="ag-nav-link__label">{item.label}</span>
                      <span className="ag-nav-link__description">{item.description}</span>
                    </span>
                    {badge > 0 && <span className="ag-nav-link__badge">{badge}</span>}
                  </NavLink>
                );
              })}
            </div>

            <div className="ag-sidebar__group">
              <span className="ag-sidebar__group-label">Utilities</span>
              {SECONDARY_NAV.map((item) => {
                const Icon = item.icon;
                const badge = navBadges[item.id];
                const isCurrent = location.pathname.startsWith(item.to);
                return (
                  <NavLink
                    key={item.id}
                    to={item.to}
                    className={`ag-nav-link ag-nav-link--secondary${isCurrent ? ' active' : ''}`}
                  >
                    <span className="ag-nav-link__icon">
                      <Icon size={16} />
                    </span>
                    <span className="ag-nav-link__content">
                      <span className="ag-nav-link__label">{item.label}</span>
                      <span className="ag-nav-link__description">{item.description}</span>
                    </span>
                    {badge > 0 && <span className="ag-nav-link__badge">{badge}</span>}
                  </NavLink>
                );
              })}
            </div>
          </nav>
        </div>

        <div className="ag-sidebar__footer">
          <div className="ag-sidebar__footer-card">
            <span className="ag-sidebar__footer-eyebrow">Quick Moves</span>
            <p className="ag-sidebar__footer-text">
              {pendingReview > 0
                ? `${pendingReview} applicants are waiting for a decision.`
                : 'Your review queue is clear. Scout or launch the next casting brief.'}
            </p>
            <div className="ag-sidebar__footer-actions">
              <Link to="/dashboard/agency/inbox" className="ag-sidebar__footer-link">
                Review queue <ArrowUpRight size={13} />
              </Link>
              <Link to="/dashboard/agency/discover" className="ag-sidebar__footer-link">
                Scout talent <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </aside>

      <div className="ag-workspace">
        <header className="ag-utilitybar">
          <div className="ag-utilitybar__meta">
            <span className="ag-utilitybar__eyebrow">{activeSection.eyebrow}</span>
            <h1 className="ag-utilitybar__title">{activeSection.title}</h1>
            <p className="ag-utilitybar__subtitle">{activeSection.subtitle}</p>
          </div>

          <div className="ag-utilitybar__actions">
            <Link to="/dashboard/agency/inbox" className="ag-quick-action ag-quick-action--ghost">
              <Inbox size={16} />
              Review Queue
            </Link>
            <Link to="/dashboard/agency/discover" className="ag-quick-action ag-quick-action--ghost">
              <Compass size={16} />
              Scout Talent
            </Link>
            <Link to="/dashboard/agency/casting" className="ag-quick-action ag-quick-action--primary">
              <Plus size={16} />
              New Casting
            </Link>

            <div ref={messagesRef} style={{ position: 'relative' }}>
              <button
                ref={messagesBtnRef}
                className="ag-topbar-icon"
                aria-label="Messages"
                aria-expanded={openPanel === 'messages'}
                aria-haspopup="true"
                onClick={() => setOpenPanel((panel) => (panel === 'messages' ? null : 'messages'))}
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

            <div ref={notificationsRef} style={{ position: 'relative' }}>
              <button
                ref={notificationsBtnRef}
                className="ag-topbar-icon ag-topbar-icon--bell"
                aria-label="Notifications"
                aria-expanded={openPanel === 'notifications'}
                aria-haspopup="true"
                onClick={() => setOpenPanel((panel) => (panel === 'notifications' ? null : 'notifications'))}
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

            <div className="ag-topbar-sep" />

            <div ref={userRef} style={{ position: 'relative' }} className="ag-user-menu">
              <button
                ref={userBtnRef}
                className="ag-user-trigger"
                aria-expanded={openPanel === 'user'}
                aria-haspopup="true"
                onClick={() => setOpenPanel((panel) => (panel === 'user' ? null : 'user'))}
              >
                {profile?.images?.[0]?.path ? (
                  <img src={`/${profile.images[0].path}`} alt={userName} className="ag-user-avatar" />
                ) : (
                  <div className="ag-user-avatar ag-user-avatar--initials" aria-hidden="true">
                    {userName.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2)}
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

        <main className="ag-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
