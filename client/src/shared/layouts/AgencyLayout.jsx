import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Bell, MessageSquare, Settings } from 'lucide-react';
import { getAgencyProfile, getMessageThreads } from '../../domains/agency/api/agency';
import { useAgencyTeam } from '../../domains/agency/hooks/useAgencyTeam';
import { useRailCollapsed } from '../../domains/agency/hooks/useRailCollapsed';
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
  const messagesRef = useRef(null);
  const notificationsRef = useRef(null);

  const { data: profile } = useQuery({ queryKey: ['agency-profile'], queryFn: getAgencyProfile, staleTime: 5 * 60 * 1000 });
  const { data: team = [] } = useAgencyTeam();
  const { data: threads = [] } = useQuery({ queryKey: ['agency', 'messages', 'threads'], queryFn: getMessageThreads, refetchInterval: 30000 });

  const closePanel = useCallback(() => setOpenPanel(null), []);
  useEffect(() => {
    const close = () => setOpenPanel(null);
    close();
  }, [location.pathname]);
  useEffect(() => {
    const h = (e) => {
      if (!messagesRef.current?.contains(e.target) && !notificationsRef.current?.contains(e.target)) setOpenPanel(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setOpenPanel(null); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const profileWithMeta = { ...profile, member_count: team.length || undefined };
  const unreadMessages = threads.filter((t) => t.unread).length;
  const isDiscover = location.pathname === '/dashboard/agency/discover';
  const season = 'SS26';
  const place = (profile?.location || profile?.agency_location || 'Studio').toUpperCase();

  return (
    <div className={`ag-shell ${collapsed ? 'ag-shell--collapsed' : ''} ${isDiscover ? 'ag-shell--discover' : ''}`}>
      <aside className="ag-rail">
        <div className="ag-grain" />
        <CoBrandLockup profile={profileWithMeta} collapsed={collapsed} onToggle={toggle} />
        <RailNav counts={{ applicants: profile?.pending_applications, casting: profile?.active_castings, team: team.length || undefined }} />
        <MemberAccountChip profile={profile} />
      </aside>

      <div className="ag-body">
        <main className="ag-main">
          <header className="ag-masthead">
            <div className="ag-masthead-status">The Floor &nbsp;·&nbsp; {season} Season &nbsp;·&nbsp; {place} &nbsp;·&nbsp; {nowLabel()}</div>
            <div className="ag-masthead-actions">
              <TeamPresence members={team} />
              <span style={{ width: 1, height: 16, background: '#e0d8c7' }} aria-hidden="true" />
              <button className="ag-topbar-icon" aria-label="Search"><Search size={17} /></button>
              <div ref={messagesRef} style={{ position: 'relative' }}>
                <button className="ag-topbar-icon" aria-label="Messages" aria-expanded={openPanel === 'messages'}
                  onClick={() => setOpenPanel((p) => (p === 'messages' ? null : 'messages'))}>
                  <MessageSquare size={17} />
                  {unreadMessages > 0 && <span className="ag-icon-badge">{unreadMessages}</span>}
                </button>
                <MessagesDropdown isOpen={openPanel === 'messages'} onClose={closePanel} threads={threads} onAllRead={() => {}} isLoading={false} isError={false} />
              </div>
              <div ref={notificationsRef} style={{ position: 'relative' }}>
                <button className="ag-topbar-icon" aria-label="Notifications" aria-expanded={openPanel === 'notifications'}
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
