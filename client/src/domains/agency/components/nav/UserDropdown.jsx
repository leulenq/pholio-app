import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
  Settings,
  Users,
  HelpCircle,
  ExternalLink,
  LogOut,
} from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '../../../../shared/lib/firebase';
import { InlineErrorText } from '../../../../shared/components/states';
import { postLogoutAndRedirectToMarketing } from '../../../../shared/lib/logout';
import './UserDropdown.css';

function pathMatches(pathname, matchPath) {
  return pathname === matchPath || pathname.startsWith(`${matchPath}/`);
}

export default function UserDropdown({ isOpen, onClose }) {
  const firstItemRef = useRef(null);
  const [logoutError, setLogoutError] = useState(null);
  const location = useLocation();

  useEffect(() => {
    if (isOpen) firstItemRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const navLinks = [
    {
      label: 'Settings',
      icon: Settings,
      to: '/dashboard/agency/settings?tab=profile',
      matchPath: '/dashboard/agency/settings',
    },
    {
      label: 'Team Members',
      icon: Users,
      to: '/dashboard/agency/team',
      matchPath: '/dashboard/agency/team',
    },
  ];

  async function handleLogout() {
    setLogoutError(null);
    try {
      await signOut(auth).catch(() => {});

      await postLogoutAndRedirectToMarketing();
      return;
    } catch (error) {
      console.error('Logout failed:', error);
      const message = error?.message || 'Sign-out failed. Try again.';
      setLogoutError(message);
      toast.error(message);
    }
  }

  return (
    <div className="ud-panel" aria-label="Account menu">
      <nav className="ud-nav">
        {navLinks.map(({ label, icon: Icon, to, matchPath }, idx) => {
          const active = pathMatches(location.pathname, matchPath);
          return (
            <NavLink
              key={label}
              to={to}
              className={`ud-item${active ? ' ud-item--active' : ''}`}
              onClick={onClose}
              ref={idx === 0 ? firstItemRef : null}
            >
              <Icon size={14} strokeWidth={1.6} className="ud-item-icon" aria-hidden="true" />
              <span className="ud-item-label">{label}</span>
            </NavLink>
          );
        })}

        <a
          href="mailto:support@pholio.studio"
          target="_blank"
          rel="noopener noreferrer"
          className="ud-item"
        >
          <HelpCircle size={14} strokeWidth={1.6} className="ud-item-icon" aria-hidden="true" />
          <span className="ud-item-label">Help & Support</span>
          <ExternalLink size={12} strokeWidth={1.6} className="ud-external-icon" aria-hidden="true" />
        </a>
      </nav>

      <div className="ud-divider" />

      {logoutError && (
        <div className="ud-logout-error">
          <InlineErrorText message={logoutError} />
        </div>
      )}

      <button type="button" className="ud-item ud-item--logout" onClick={handleLogout}>
        <LogOut size={14} strokeWidth={1.6} className="ud-item-icon" aria-hidden="true" />
        <span className="ud-item-label">Log out</span>
      </button>
    </div>
  );
}
