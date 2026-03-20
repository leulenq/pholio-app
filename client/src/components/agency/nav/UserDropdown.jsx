import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Settings,
  Receipt,
  Users,
  HelpCircle,
  ExternalLink,
  LogOut,
} from 'lucide-react';
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

  const firstName = profile?.first_name || 'Agency User';
  const agencyName = profile?.agency_name || '';
  const avatarUrl = profile?.images?.[0]?.path
    ? `/${profile.images[0].path}`
    : null;

  const navLinks = [
    { label: 'Settings',           icon: Settings, to: '/dashboard/agency/settings?tab=profile' },
    { label: 'Billing & Invoices', icon: Receipt,  to: '/dashboard/agency/settings?tab=billing' },
    { label: 'Team Members',       icon: Users,    to: '/dashboard/agency/settings?tab=team'    },
  ];

  return (
    <div className="nav-panel ud-panel" aria-label="Account menu">
      {/* Profile card */}
      <div className="ud-profile">
        {avatarUrl ? (
          <img src={avatarUrl} alt={firstName} className="ud-avatar" />
        ) : (
          <div className="ud-avatar-initials" aria-hidden="true">
            {getInitials(firstName)}
          </div>
        )}
        <p className="ud-name">{firstName}</p>
        {agencyName && <p className="ud-agency">{agencyName}</p>}
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

      {/* Logout — hard navigation, matches existing codebase pattern */}
      <a href="/logout" className="ud-item ud-item--logout">
        <LogOut size={16} className="ud-item-icon" />
        <span className="ud-item-label">Log out</span>
      </a>
    </div>
  );
}
