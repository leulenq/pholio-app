import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Images, FileText, BarChart2, User, CreditCard, Bell, Settings } from 'lucide-react';
import { useAuth } from '../../../domains/auth/hooks/useAuth';
import { useFlash } from '../../hooks/useFlash';
import { TierBadgeFromSubscription } from '../../components/ui/TierBadge';
import './TalentLayout.css';

const WORKSPACE_NAV = [
  { label: 'Overview',     to: '/dashboard/talent',               icon: LayoutDashboard, end: true },
  { label: 'Portfolio',    to: '/dashboard/talent/media',         icon: Images },
  { label: 'Applications', to: '/dashboard/talent/applications',  icon: FileText },
  { label: 'Analytics',    to: '/dashboard/talent/analytics',     icon: BarChart2 },
];

const PROFILE_NAV = [
  { label: 'My Profile', to: '/dashboard/talent/profile',        icon: User },
  { label: 'Comp Card',  to: '/dashboard/talent/pdf-customizer', icon: CreditCard },
];

export default function TalentLayout({ outletContext = {} }) {
  const { user, profile, subscription } = useAuth();
  const { message, clearFlash } = useFlash();

  const firstName = profile?.first_name || profile?.name?.split(' ')[0] || '';
  const initials  = firstName ? firstName.slice(0, 2).toUpperCase() : 'ME';
  const today     = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div className="tl-root">
      {/* ── Top utility bar ── */}
      <div className="tl-topbar">
        <div className="tl-topbar-logo-zone">
          <span className="tl-logo">PHOLIO.</span>
        </div>
        <div className="tl-topbar-actions">
          <span className="tl-date">{today}</span>
          <div className="tl-topbar-divider" />
          <button className="tl-icon-btn" aria-label="Notifications">
            <Bell size={15} strokeWidth={1.75} />
          </button>
          <button className="tl-icon-btn" aria-label="Settings">
            <Settings size={14} strokeWidth={1.75} />
          </button>
          <div className="tl-topbar-divider" />
          <div className="tl-avatar" aria-hidden="true">{initials}</div>
        </div>
      </div>

      {/* ── Body: sidebar + content ── */}
      <div className="tl-body">
        <aside className="tl-sidebar">
          <nav className="tl-nav" aria-label="Main navigation">
            <span className="tl-nav-section">Workspace</span>
            {WORKSPACE_NAV.map(item => <TalentNavItem key={item.to} item={item} />)}
            <span className="tl-nav-section">Profile</span>
            {PROFILE_NAV.map(item => <TalentNavItem key={item.to} item={item} />)}
          </nav>

          <div className="tl-sidebar-footer">
            <div className="tl-profile-card">
              <div className="tl-profile-avatar" aria-hidden="true" />
              <div className="tl-profile-info">
                <span className="tl-profile-name">
                  {firstName || user?.email?.split('@')[0] || 'You'}
                </span>
                <TierBadgeFromSubscription
                  subscription={subscription}
                  size="sm"
                  showIcon={false}
                  className="tl-tier-badge"
                />
              </div>
            </div>
          </div>
        </aside>

        <main className="tl-content">
          {message && (
            <div className={`tl-flash tl-flash--${message.type}`} style={{ margin: '16px 60px 0' }}>
              <span>{message.text}</span>
              <button onClick={clearFlash} className="tl-flash-close">&times;</button>
            </div>
          )}
          <Outlet context={outletContext} />
        </main>
      </div>
    </div>
  );
}

function TalentNavItem({ item }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `tl-nav-item${isActive ? ' tl-nav-item--active' : ''}`
      }
    >
      <span className="tl-nav-icon" aria-hidden="true">
        <Icon size={10} strokeWidth={2} />
      </span>
      {item.label}
    </NavLink>
  );
}
