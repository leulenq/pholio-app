import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, MessageSquare, Settings, Menu } from 'lucide-react';
import { getAgencyProfile, getMessageThreads, getAgencyNotifications } from '../../domains/agency/api/agency';
import { useAgencyTeam } from '../../domains/agency/hooks/useAgencyTeam';
import { useAgencyOverview } from '../../domains/agency/hooks/useAgencyOverview';
import { useRailCollapsed } from '../../domains/agency/hooks/useRailCollapsed';
import { selectKpis } from '../../domains/agency/components/overview/overviewData';
import CoBrandLockup from '../../domains/agency/components/nav/CoBrandLockup';
import RailNav from '../../domains/agency/components/nav/RailNav';
import MemberAccountChip from '../../domains/agency/components/nav/MemberAccountChip';
import TeamPresence from '../../domains/agency/components/nav/TeamPresence';
import MessagesDropdown from '../../domains/agency/components/nav/MessagesDropdown';
import NotificationsDropdown from '../../domains/agency/components/nav/NotificationsDropdown';
import { applyAgencyBrandTheme } from '../../domains/agency/lib/agency-branding';
import './AgencyLayout.css';

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AgencyLayout() {
  const location = useLocation();
  const { collapsed, toggle, setCollapsed } = useRailCollapsed();
  const [openPanel, setOpenPanel] = useState(null); // 'messages' | 'notifications'
  const [drawerOpen, setDrawerOpen] = useState(false);

  const shellRef = useRef(null);
  const messagesRef = useRef(null);
  const notificationsRef = useRef(null);
  const messagesBtnRef = useRef(null);
  const notificationsBtnRef = useRef(null);

  const { data: profile } = useQuery({ queryKey: ['agency-profile'], queryFn: getAgencyProfile, staleTime: 5 * 60 * 1000 });
  const { data: team = [] } = useAgencyTeam();
  const { data: overview } = useAgencyOverview();
  const { data: threads = [] } = useQuery({ queryKey: ['agency', 'messages', 'threads'], queryFn: getMessageThreads, refetchInterval: 30000 });
  const {
    data: notificationsData,
    isLoading: notificationsLoading,
    isError: notificationsError,
  } = useQuery({ queryKey: ['agency', 'notifications'], queryFn: getAgencyNotifications, refetchInterval: 60000 });
  const notifications = notificationsData?.notifications ?? [];
  const unreadNotifications = notificationsData?.unreadCount ?? 0;

  // Focus-return on close: remember which trigger opened the panel.
  const openPanelRef = useRef(null);
  useEffect(() => { openPanelRef.current = openPanel; }, [openPanel]);
  const closePanel = useCallback(() => {
    const p = openPanelRef.current;
    setOpenPanel(null);
    if (p === 'messages') messagesBtnRef.current?.focus();
    else if (p === 'notifications') notificationsBtnRef.current?.focus();
  }, []);

  // Close panels + drawer on navigation.
  useEffect(() => {
    const reset = () => { setOpenPanel(null); setDrawerOpen(false); };
    reset();
  }, [location.pathname]);

  // Autocollapse sidebar when leaving overview tab
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    const prev = prevPathRef.current;
    const curr = location.pathname;
    const isOverview = (p) => p === '/dashboard/agency' || p === '/dashboard/agency/';
    
    if (isOverview(prev) && !isOverview(curr)) {
      setCollapsed(true);
    }
    prevPathRef.current = curr;
  }, [location.pathname, setCollapsed]);

  // Outside click closes the open dropdown.
  useEffect(() => {
    const h = (e) => {
      if (!messagesRef.current?.contains(e.target) && !notificationsRef.current?.contains(e.target)) closePanel();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [closePanel]);

  // Escape closes dropdown then drawer.
  useEffect(() => {
    const h = (e) => {
      if (e.key !== 'Escape') return;
      if (openPanelRef.current) closePanel();
      else setDrawerOpen(false);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [closePanel]);

  // Toggle body class for style scoping
  useEffect(() => {
    document.body.classList.add('is-agency');
    return () => {
      document.body.classList.remove('is-agency');
    };
  }, []);

  // Agency accent on workspace shell only — Pholio wordmark stays platform gold.
  useLayoutEffect(() => {
    applyAgencyBrandTheme(profile?.agency_brand_color, shellRef.current);
  }, [profile?.agency_brand_color]);


  const kpis = selectKpis(overview);
  const memberRole = team.find((m) => m.userId === profile?.id)?.membership_role;
  const profileWithMeta = { ...profile, member_count: team.length || undefined };
  const unreadMessages = threads.filter((t) => t.unread).length;
  const isDiscover = location.pathname.startsWith('/dashboard/agency/discover');
  const isRoster = location.pathname === '/dashboard/agency/roster';
  const season = 'SS26';
  // Cross-board context (agencies run many boards) — not anchored to one location/board.
  const activeBoards = kpis.activeCastings;
  const pipelineTotal = (overview?.pipeline || []).reduce((s, r) => s + (r.count || 0), 0);
  const statusSegments = [
    `${season} Season`,
    activeBoards ? `${activeBoards} Active Board${activeBoards === 1 ? '' : 's'}` : null,
    pipelineTotal ? `${pipelineTotal} in Pipeline` : null,
    nowLabel(),
  ].filter(Boolean);

  const shellClass = [
    'ag-shell',
    collapsed ? 'ag-shell--collapsed' : '',
    isDiscover ? 'ag-shell--discover' : '',
    drawerOpen ? 'ag-shell--drawer-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={shellRef} className={shellClass}>
      {drawerOpen && <div className="ag-rail-overlay" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      <aside className="ag-rail">
        <div className="ag-grain" />
        <CoBrandLockup profile={profileWithMeta} collapsed={collapsed} />
        <RailNav
          counts={{ applicants: kpis.pendingReview, casting: kpis.activeCastings, team: team.length || undefined }}
          collapsed={collapsed}
          onToggleCollapse={toggle}
        />
        <MemberAccountChip profile={profile} role={memberRole} />
      </aside>

      <div className="ag-body">
        <main className={`ag-main${isDiscover ? ' ag-main--discover' : ''}${isRoster ? ' ag-main--roster' : ''}`}>
          <header className="ag-masthead">
            <div className="ag-masthead-left">
              <button className="ag-hamburger" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}>
                <Menu size={18} />
              </button>
              <div className="ag-masthead-status">{statusSegments.join('   ·   ')}</div>
            </div>
            <div className="ag-masthead-actions">
              <TeamPresence members={team} />
              <span style={{ width: 1, height: 16, background: '#e0d8c7' }} aria-hidden="true" />
              <div ref={messagesRef} style={{ position: 'relative' }}>
                <button ref={messagesBtnRef} className="ag-topbar-icon" aria-label={unreadMessages > 0 ? `Messages (${unreadMessages} unread)` : 'Messages'} aria-expanded={openPanel === 'messages'}
                  onClick={() => setOpenPanel((p) => (p === 'messages' ? null : 'messages'))}>
                  <MessageSquare size={17} />
                  {unreadMessages > 0 && <span className="ag-icon-unread" aria-hidden="true" />}
                </button>
                <MessagesDropdown isOpen={openPanel === 'messages'} onClose={closePanel} threads={threads} onAllRead={() => {}} isLoading={false} isError={false} />
              </div>
              <div ref={notificationsRef} style={{ position: 'relative' }}>
                <button ref={notificationsBtnRef} className="ag-topbar-icon" aria-label="Notifications" aria-expanded={openPanel === 'notifications'}
                  onClick={() => setOpenPanel((p) => (p === 'notifications' ? null : 'notifications'))}>
                  <Bell size={17} />
                </button>
                <NotificationsDropdown
                  isOpen={openPanel === 'notifications'}
                  onClose={closePanel}
                  notifications={notifications}
                  unreadCount={unreadNotifications}
                  isLoading={notificationsLoading}
                  isError={notificationsError}
                />
              </div>
              <Link to="/dashboard/agency/settings" className="ag-topbar-icon" aria-label="Settings"><Settings size={17} /></Link>
            </div>
          </header>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
