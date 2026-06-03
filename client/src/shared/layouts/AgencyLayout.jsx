import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Bell, MessageSquare, Settings, Menu } from 'lucide-react';
import { getAgencyProfile, getMessageThreads } from '../../domains/agency/api/agency';
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
import './AgencyLayout.css';

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AgencyLayout() {
  const location = useLocation();
  const { collapsed, toggle } = useRailCollapsed();
  const [openPanel, setOpenPanel] = useState(null); // 'messages' | 'notifications'
  const [drawerOpen, setDrawerOpen] = useState(false);

  const messagesRef = useRef(null);
  const notificationsRef = useRef(null);
  const messagesBtnRef = useRef(null);
  const notificationsBtnRef = useRef(null);

  const { data: profile } = useQuery({ queryKey: ['agency-profile'], queryFn: getAgencyProfile, staleTime: 5 * 60 * 1000 });
  const { data: team = [] } = useAgencyTeam();
  const { data: overview } = useAgencyOverview();
  const { data: threads = [] } = useQuery({ queryKey: ['agency', 'messages', 'threads'], queryFn: getMessageThreads, refetchInterval: 30000 });

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

  const kpis = selectKpis(overview);
  const memberRole = team.find((m) => m.userId === profile?.id)?.membership_role;
  const profileWithMeta = { ...profile, member_count: team.length || undefined };
  const unreadMessages = threads.filter((t) => t.unread).length;
  const isDiscover = location.pathname === '/dashboard/agency/discover';
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
    <div className={shellClass}>
      {drawerOpen && <div className="ag-rail-overlay" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      <aside className="ag-rail">
        <div className="ag-grain" />
        <CoBrandLockup profile={profileWithMeta} collapsed={collapsed} onToggle={toggle} />
        <RailNav counts={{ applicants: kpis.pendingReview, casting: kpis.activeCastings, team: team.length || undefined }} />
        <MemberAccountChip profile={profile} role={memberRole} />
      </aside>

      <div className="ag-body">
        <main className="ag-main">
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
              <button className="ag-topbar-icon" aria-label="Search"><Search size={17} /></button>
              <div ref={messagesRef} style={{ position: 'relative' }}>
                <button ref={messagesBtnRef} className="ag-topbar-icon" aria-label="Messages" aria-expanded={openPanel === 'messages'}
                  onClick={() => setOpenPanel((p) => (p === 'messages' ? null : 'messages'))}>
                  <MessageSquare size={17} />
                  {unreadMessages > 0 && <span className="ag-icon-badge">{unreadMessages}</span>}
                </button>
                <MessagesDropdown isOpen={openPanel === 'messages'} onClose={closePanel} threads={threads} onAllRead={() => {}} isLoading={false} isError={false} />
              </div>
              <div ref={notificationsRef} style={{ position: 'relative' }}>
                <button ref={notificationsBtnRef} className="ag-topbar-icon" aria-label="Notifications" aria-expanded={openPanel === 'notifications'}
                  onClick={() => setOpenPanel((p) => (p === 'notifications' ? null : 'notifications'))}>
                  <Bell size={17} />
                </button>
                <NotificationsDropdown isOpen={openPanel === 'notifications'} onClose={closePanel} notifications={[]} onAllRead={() => {}} isLoading={false} isError={false} />
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
