import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bell, Sparkles, User, Settings, LogOut, ChevronDown, ExternalLink } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useProfileStrength } from '../../hooks/useProfileStrength';
import './Header.css';
import NotificationDropdown from './NotificationDropdown';
import { useQuery } from '@tanstack/react-query';
import { talentApi } from '../../api/talent';


import { checkGatingStatus } from '../../utils/profileGating';

export default function Header() {
  const { user, profile, subscription } = useAuth(); 
  const { score: officialScore } = useProfileStrength();
  const navigate = useNavigate();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const notificationsRef = useRef(null);

  
  // Check Gating
  const { isBlocked } = checkGatingStatus(profile, user);
  
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'long' });

  const navItems = [
    { label: 'Overview', path: '/dashboard/talent', end: true, restricted: false },
    { label: 'Profile', path: '/dashboard/talent/profile', restricted: false },
    { label: 'Portfolio', path: '/dashboard/talent/media', restricted: false },
    { label: 'Analytics', path: '/dashboard/talent/analytics', restricted: true },
    { label: 'Applications', path: '/dashboard/talent/applications', restricted: true },
  ];

  // Fetch real activities for notifications
  const { data: activitiesData } = useQuery({
    queryKey: ['talent-activities-header'],
    queryFn: () => talentApi.getActivity(),
    enabled: !!profile,
  });

  const [unreadCount, setUnreadCount] = useState(2); // Starting with 2 unread mock items

  const handleMarkRead = () => {
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = () => {
    setUnreadCount(0);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    try {
      const response = await fetch('/api/logout', { 
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        console.error('Logout failed with status:', response.status);
      }
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      // Redirect to main website (localhost:3000 in dev)
      if (window.location.hostname === 'localhost' && window.location.port === '5173') {
        window.location.href = 'http://localhost:3000';
      } else {
        window.location.href = '/'; 
      }
    }
  };

  return (
    <header className="header-transparent">
      <div className="header-left">
        <a 
          href="/" 
          className="pholio-logo-wrapper"
          onClick={(e) => {
            if (window.location.hostname === 'localhost' && window.location.port === '5173') {
              e.preventDefault();
              window.location.href = 'http://localhost:3000';
            }
          }}
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <span style={{
            fontFamily: "var(--font-display, 'Playfair Display', serif)",
            fontWeight: 400,
            letterSpacing: "0.2em",
            color: "#C8A96E",
            fontSize: "24px"
          }}>
            PHOLIO
          </span>
        </a>
      </div>

      <div className="header-center">
        <nav className="nav-pills-container">
          {navItems.map((item) => {
            const isDisabled = isBlocked && item.restricted;
            return (
              <NavLink 
                key={item.label}
                to={isDisabled ? '#' : item.path}
                end={item.end}
                onClick={(e) => {
                   if (isDisabled) {
                     e.preventDefault();
                   }
                }}
                className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''} ${isDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                style={isDisabled ? { pointerEvents: 'none' } : {}}
              >
                {item.label}
                {isDisabled && <span className="ml-1.5 text-[10px] opacity-70">🔒</span>}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="header-right">
        {!subscription?.isPro && (
          <NavLink to="/pricing" className="upgrade-pill">
            <Sparkles size={16} />
            <span>Studio+</span>
          </NavLink>
        )}

        <span className="header-date">{today}</span>
        
        <div className="notification-bell-container" ref={notificationsRef}>
          <button 
            type="button"
            className={`notification-bell ${isNotificationsOpen ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsNotificationsOpen(!isNotificationsOpen);
              setIsProfileOpen(false); // Close other dropdown
            }}
            aria-label="Notifications"
          >
             <Bell size={20} />
             {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
          </button>
          
          {isNotificationsOpen && (
            <NotificationDropdown 
              onClose={() => setIsNotificationsOpen(false)} 
              realActivities={activitiesData?.activities || []}
              onMarkRead={handleMarkRead}
              onMarkAllRead={handleMarkAllRead}
            />
          )}
        </div>
        
        {/* Refined Profile Trigger */}
        <div className="profile-trigger-container" ref={dropdownRef}>
          <button 
            type="button" 
            className="profile-trigger-refined"
            aria-label="User menu" 
            aria-expanded={isProfileOpen}
            onClick={(e) => {
              e.stopPropagation();
              setIsProfileOpen(!isProfileOpen);
              setIsNotificationsOpen(false); // Close other dropdown
            }}
          >
            <div className="avatar-container">
              {profile?.profile_image ? (
                <img src={profile.profile_image} alt="Profile" className="avatar-image" />
              ) : (
                <div className="avatar-initials">{profile?.first_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}</div>
              )}
              <div className={`subscription-badge ${subscription?.isPro ? 'pro' : 'free'}`} />
            </div>
            
            <ChevronDown 
              size={12} 
              className={`trigger-chevron ${isProfileOpen ? 'rotate' : ''}`} 
            />
          </button>

          {isProfileOpen && (
            <div className="profile-dropdown-refined">
              {/* Compact Identity Header */}
              <div className="dropdown-identity-compact">
                <div className="identity-avatar">
                  {profile?.profile_image ? (
                    <img src={profile.profile_image} alt="" />
                  ) : (
                    <div className="avatar-initials">{profile?.first_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}</div>
                  )}
                </div>
                <div className="identity-info">
                  <div className="identity-name">
                    {profile ? `${profile.first_name} ${profile.last_name}` : '...'}
                  </div>
                  <div className="identity-email">{profile?.email || ''}</div>
                  <div className="identity-meta">
                    <span className="role-badge">Talent</span>
                    <span className="tier-badge">{subscription?.isPro ? 'Studio+' : 'Free'}</span>
                  </div>
                </div>
              </div>

              <div className="dropdown-divider" />

              {/* Profile Strength Widget */}
              <NavLink 
                to="/dashboard/talent/profile" 
                className="profile-strength-widget"
                onClick={() => setIsProfileOpen(false)}
              >
                <div className="widget-header">
                  <span>Profile Strength</span>
                  <span className="strength-percentage">{officialScore}%</span>
                </div>
                <div className="strength-progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${officialScore}%` }}
                  />
                </div>
              </NavLink>

              <div className="dropdown-divider" />

              {/* Quick Actions */}
              <div className="dropdown-actions">
                <a 
                  href={`/talent/${profile?.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dropdown-item"
                  onClick={() => setIsProfileOpen(false)}
                >
                  <ExternalLink size={16} />
                  <span>View Public Profile</span>
                </a>

                <NavLink 
                  to="/dashboard/talent/settings" 
                  className="dropdown-item"
                  onClick={() => setIsProfileOpen(false)}
                >
                  <Settings size={16} />
                  <span>Account Settings</span>
                </NavLink>

                {!subscription?.isPro && (
                  <NavLink 
                    to="/pricing" 
                    className="dropdown-item upgrade-item"
                    onClick={() => setIsProfileOpen(false)}
                  >
                    <Sparkles size={16} />
                    <span>Upgrade to Studio+</span>
                  </NavLink>
                )}
              </div>

              <div className="dropdown-divider" />

              {/* Logout */}
              <button type="button" className="dropdown-item logout-item" onClick={handleLogout}>
                <LogOut size={16} />
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
