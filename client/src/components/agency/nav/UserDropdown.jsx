import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
  Settings,
  Receipt,
  Users,
  HelpCircle,
  ExternalLink,
  LogOut,
} from 'lucide-react';
import { auth } from '../../../lib/firebase';
import './UserDropdown.css';

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function UserDropdown({ isOpen, onClose, profile }) {
  const firstItemRef = useRef(null);

  useEffect(() => {
    if (isOpen) firstItemRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const fullName = profile?.first_name 
    ? (profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.first_name)
    : profile?.agency_name || profile?.email?.split('@')[0] || 'Agency User';
  const agencyName = profile?.agency_name || '';
  
  // Try to find an avatar URL:
  // 1. From profile.images[0].path (talent-like structure)
  // 2. From profile.agency_logo_path (agency-specific structure)
  const avatarUrl = profile?.images?.[0]?.path
    ? `/${profile.images[0].path}`
    : profile?.agency_logo_path
    ? `/${profile.agency_logo_path}`
    : null;

  const navLinks = [
    { label: 'Settings',           icon: Settings, to: '/dashboard/agency/settings?tab=profile' },
    { label: 'Billing & Invoices', icon: Receipt,  to: '/dashboard/agency/settings?tab=billing' },
    { label: 'Team Members',       icon: Users,    to: '/dashboard/agency/settings?tab=team'    },
  ];

  async function handleLogout() {
    try {
      await signOut(auth).catch(() => {});

      const response = await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        window.location.href = data.redirect || '/login';
      } else {
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Logout failed:', error);
      window.location.href = '/login';
    }
  }

  return (
    <div className="nav-panel ud-panel" aria-label="Account menu">
      {/* Profile card */}
      <div className="ud-profile">
        <div className="ud-avatar-wrap">
          {avatarUrl ? (
            <img src={avatarUrl} alt={fullName} className="ud-avatar" />
          ) : (
            <div className="ud-avatar-initials" aria-hidden="true">
              {getInitials(fullName)}
            </div>
          )}
        </div>
        <div className="ud-info">
          <p className="ud-name">{fullName}</p>
          {agencyName && (
            <p className="ud-agency">
              {agencyName}
            </p>
          )}
        </div>
        <span className="ud-badge">Enterprise</span>
      </div>

      <div className="ud-divider" />

      {/* Nav links */}
      <nav className="ud-nav">
        {navLinks.map(({ label, icon: Icon, to }, idx) => (
          <Link
            key={label}
            to={to}
            className="ud-item"
            onClick={onClose}
            ref={idx === 0 ? firstItemRef : null}
          >
            <Icon size={16} className="ud-item-icon" />
            <span className="ud-item-label">{label}</span>
          </Link>
        ))}

        {/* Help & Support — external mailto link */}
        <a
          href="mailto:support@pholio.studio"
          target="_blank"
          rel="noopener noreferrer"
          className="ud-item"
        >
          <HelpCircle size={16} className="ud-item-icon" />
          <span className="ud-item-label">Help & Support</span>
          <ExternalLink size={12} className="ud-external-icon" />
        </a>
      </nav>

      <div className="ud-divider" />

      <button type="button" className="ud-item ud-item--logout" onClick={handleLogout}>
        <LogOut size={16} className="ud-item-icon" />
        <span className="ud-item-label">Log out</span>
      </button>
    </div>
  );
}
