import { Outlet, NavLink } from 'react-router-dom';
import { Bell, Settings } from 'lucide-react';
import { useAuth } from '../../../domains/auth/hooks/useAuth';
import { useFlash } from '../../hooks/useFlash';
import './TalentLayout.css';

const NAV_ITEMS = [
  { label: 'Overview',     to: '/dashboard/talent',               end: true },
  { label: 'Portfolio',    to: '/dashboard/talent/media' },
  { label: 'Applications', to: '/dashboard/talent/applications' },
  { label: 'Analytics',    to: '/dashboard/talent/analytics' },
  { label: 'Profile',      to: '/dashboard/talent/profile' },
  { label: 'Comp Card',    to: '/dashboard/talent/pdf-customizer' },
];

export default function TalentLayout({ outletContext = {} }) {
  const { profile } = useAuth();
  const { message, clearFlash } = useFlash();

  const firstName = profile?.first_name || profile?.name?.split(' ')[0] || '';
  const lastName  = profile?.last_name  || profile?.name?.split(' ').slice(1)[0] || '';
  const initials  = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || 'ME';

  return (
    <div className="tl-root">
      <div className="tl-topbar">
        <div className="tl-logo-lockup" aria-label="Pholio">
          <span className="tl-logo-word">PHOLIO</span>
          <div className="tl-logo-sweep" aria-hidden />
        </div>

        <nav className="tl-topnav" aria-label="Main navigation">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `tl-topnav-link${isActive ? ' tl-topnav-link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="tl-topbar-actions">
          <button className="tl-icon-btn" aria-label="Notifications">
            <Bell size={14} strokeWidth={1.5} />
          </button>
          <button className="tl-icon-btn" aria-label="Settings">
            <Settings size={14} strokeWidth={1.5} />
          </button>
          <div className="tl-avatar" aria-hidden="true">{initials}</div>
        </div>
      </div>

      <main className="tl-content">
        {message && (
          <div className={`tl-flash tl-flash--${message.type}`}>
            <span>{message.text}</span>
            <button onClick={clearFlash} className="tl-flash-close">&times;</button>
          </div>
        )}
        <Outlet context={outletContext} />
      </main>
    </div>
  );
}
