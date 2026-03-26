import React, { useState, useRef, useEffect, useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bell, Sparkles, Settings, LogOut, ChevronDown, ExternalLink, Menu, X, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../domains/auth/hooks/useAuth';
import { useProfileStrength } from '../../../domains/talent/hooks/useProfileStrength';
import './Header.css';
import NotificationDropdown from './NotificationDropdown';
import { useQuery } from '@tanstack/react-query';
import { talentApi } from '../../../domains/talent/api/talent';


import { checkGatingStatus } from '../../utils/profileGating';

function trapFocusWithin(event, container) {
  if (event.key !== 'Tab' || !container) return;
  const focusables = container.querySelectorAll(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea'
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || !container.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last) {
    event.preventDefault();
    first.focus();
  }
}

export default function Header() {
  const { user, profile, subscription } = useAuth();
  const navigate = useNavigate();
  const { score: officialScore } = useProfileStrength();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const dropdownRef = useRef(null);
  const notificationsRef = useRef(null);
  const notificationTriggerRef = useRef(null);
  const mobileNavRef = useRef(null);
  const mobileNavTriggerRef = useRef(null);
  const profileTriggerRef = useRef(null);

  
  // Check Gating
  const gating = useMemo(() => checkGatingStatus(profile), [profile]);
  const { isBlocked, missingFields } = gating;
  const safeOfficialScore = Math.max(0, Math.min(100, Number(officialScore) || 0));
  
  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'long' });

  const navItems = [
    { label: 'Overview', path: '/dashboard/talent', end: true, restricted: false },
    { label: 'Profile', path: '/dashboard/talent/profile', restricted: false },
    { label: 'Portfolio', path: '/dashboard/talent/media', restricted: false },
    { label: 'Analytics', path: '/dashboard/talent/analytics', restricted: true },
    { label: 'Applications', path: '/dashboard/talent/applications', restricted: true },
  ];

  // Fetch real activities for notifications
  const { data: activitiesData, isLoading: activitiesLoading } = useQuery({
    queryKey: ['talent-activity'],
    queryFn: () => talentApi.getActivity(),
    enabled: !!profile,
  });
  const normalizedActivities = Array.isArray(activitiesData)
    ? activitiesData
    : activitiesData?.activities || [];

  const handlePublicProfileNav = () => {
    toast.info('Set your profile URL in settings to preview your public portfolio.');
    setIsProfileOpen(false);
    navigate('/dashboard/talent/settings');
  };

  const handleRestrictedNavClick = (event, destinationPath) => {
    event.preventDefault();
    const missingSummary = missingFields.slice(0, 2).map((field) => field.label).join(', ');
    toast.info(
      missingSummary
        ? `Complete ${missingSummary}${missingFields.length > 2 ? ` +${missingFields.length - 2} more` : ''} to unlock this section.`
        : 'Complete your required profile fields to unlock this section.'
    );
    const from = destinationPath ? `&from=${encodeURIComponent(destinationPath)}` : '';
    navigate(`/dashboard/talent/profile?gate=true${from}`);
    setIsMobileNavOpen(false);
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
      if (mobileNavRef.current && !mobileNavRef.current.contains(event.target)) {
        setIsMobileNavOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isMobileNavOpen) return undefined;
    const panel = document.getElementById('talent-dashboard-mobile-nav');
    queueMicrotask(() => {
      const firstFocusable = panel?.querySelector(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    });
    function handleEscape(event) {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
        mobileNavTriggerRef.current?.focus();
        return;
      }
      trapFocusWithin(event, panel);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isMobileNavOpen]);

  useEffect(() => {
    if (!isNotificationsOpen) return undefined;
    const panel = document.getElementById('talent-notifications-dropdown');
    queueMicrotask(() => {
      const firstFocusable = panel?.querySelector(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    });
    function handleOverlayKeys(event) {
      if (event.key === "Escape") {
        setIsNotificationsOpen(false);
        notificationTriggerRef.current?.focus();
        return;
      }
      trapFocusWithin(event, panel);
    }
    document.addEventListener("keydown", handleOverlayKeys);
    return () => document.removeEventListener("keydown", handleOverlayKeys);
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!isProfileOpen) return undefined;
    const panel = document.getElementById('talent-profile-dropdown');
    queueMicrotask(() => {
      const firstFocusable = panel?.querySelector(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    });
    function handleOverlayKeys(event) {
      if (event.key === "Escape") {
        setIsProfileOpen(false);
        profileTriggerRef.current?.focus();
        return;
      }
      trapFocusWithin(event, panel);
    }
    document.addEventListener("keydown", handleOverlayKeys);
    return () => document.removeEventListener("keydown", handleOverlayKeys);
  }, [isProfileOpen]);

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
      
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        const redirectValue = typeof data.redirect === 'string' ? data.redirect : '';
        let safeRedirect = '';
        if (redirectValue.startsWith('/') && !redirectValue.startsWith('//')) {
          safeRedirect = redirectValue;
        } else if (redirectValue) {
          try {
            const parsed = new URL(redirectValue, window.location.origin);
            if (parsed.origin === window.location.origin) {
              safeRedirect = `${parsed.pathname}${parsed.search}${parsed.hash}`;
            }
          } catch {
            safeRedirect = '';
          }
        }
        window.location.href = safeRedirect || 'https://www.pholio.studio';
      } else {
        if (import.meta.env.DEV) {
          console.error('Logout failed with status:', response.status);
        }
        window.location.href = 'https://www.pholio.studio';
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Logout failed:', error);
      }
      window.location.href = 'https://www.pholio.studio';
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

        <div className="header-mobile-nav" ref={mobileNavRef}>
          <button
            ref={mobileNavTriggerRef}
            type="button"
            className="header-mobile-nav-trigger"
            aria-expanded={isMobileNavOpen}
            aria-controls={isMobileNavOpen ? "talent-dashboard-mobile-nav" : undefined}
            aria-label={isMobileNavOpen ? "Close main menu" : "Open main menu"}
            onClick={(e) => {
              e.stopPropagation();
              setIsMobileNavOpen((open) => !open);
              setIsProfileOpen(false);
              setIsNotificationsOpen(false);
            }}
          >
            {isMobileNavOpen ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
          </button>
          {isMobileNavOpen && (
            <>
              <button
                type="button"
                className="header-mobile-nav-backdrop"
                aria-hidden
                tabIndex={-1}
                onClick={() => setIsMobileNavOpen(false)}
              />
              <nav
                id="talent-dashboard-mobile-nav"
                className="header-mobile-nav-panel"
                aria-label="Dashboard sections"
              >
                <ul className="header-mobile-nav-list">
                  {navItems.map((item) => {
                    const isDisabled = isBlocked && item.restricted;
                    return (
                      <li key={item.label}>
                        <NavLink
                          to={item.path}
                          end={item.end}
                          className={({ isActive }) =>
                            `header-mobile-nav-link ${isActive ? "active" : ""} ${isDisabled ? "is-disabled" : ""}`
                          }
                          onClick={(e) => {
                            if (isDisabled) {
                              handleRestrictedNavClick(e, item.path);
                              return;
                            }
                            setIsMobileNavOpen(false);
                          }}
                          aria-disabled={isDisabled || undefined}
                          title={isDisabled ? 'Finish your profile to unlock this section' : undefined}
                        >
                          <span>{item.label}</span>
                          {isDisabled && (
                            <span className="header-mobile-nav-lock" aria-hidden>
                              <Lock size={12} strokeWidth={2.25} />
                            </span>
                          )}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </>
          )}
        </div>
      </div>

      <div className="header-center">
        <nav className="nav-pills-container">
          {navItems.map((item) => {
            const isDisabled = isBlocked && item.restricted;
            return (
              <NavLink 
                key={item.label}
                to={item.path}
                end={item.end}
                onClick={(e) => {
                   if (isDisabled) {
                     handleRestrictedNavClick(e, item.path);
                   }
                }}
                className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''} ${isDisabled ? 'is-disabled' : ''}`}
                aria-disabled={isDisabled || undefined}
                title={isDisabled ? 'Finish your profile to unlock this section' : undefined}
              >
                {item.label}
                {isDisabled && (
                  <span className="header-desktop-nav-lock" aria-hidden>
                    <Lock size={10} strokeWidth={2.25} />
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="header-right">
        {!subscription?.isPro && (
          <a href="https://www.pholio.studio/pricing" className="upgrade-pill">
            <Sparkles size={16} />
            <span>Studio+</span>
          </a>
        )}

        <span className="header-date">{today}</span>
        
        <div className="notification-bell-container" ref={notificationsRef}>
          <button 
            ref={notificationTriggerRef}
            type="button"
            className={`notification-bell ${isNotificationsOpen ? 'active' : ''} ${notificationUnreadCount > 0 ? 'has-unread' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsNotificationsOpen(!isNotificationsOpen);
              setIsProfileOpen(false); // Close other dropdown
              setIsMobileNavOpen(false);
            }}
            aria-label={
              notificationUnreadCount > 0
                ? `Notifications, ${notificationUnreadCount} unread`
                : 'Notifications'
            }
            aria-expanded={isNotificationsOpen}
            aria-controls="talent-notifications-dropdown"
          >
             <Bell size={20} aria-hidden />
             {notificationUnreadCount > 0 ? (
               <span className="notification-bell-badge" aria-hidden>
                 {notificationUnreadCount > 9 ? '9+' : notificationUnreadCount}
               </span>
             ) : null}
          </button>
          
          <div
            id="talent-notifications-dropdown"
            role="dialog"
            aria-modal="true"
            aria-label="Notifications panel"
            hidden={!isNotificationsOpen}
          >
            <NotificationDropdown
              onClose={() => setIsNotificationsOpen(false)}
              realActivities={normalizedActivities}
              activitiesLoading={activitiesLoading}
              onUnreadCountChange={setNotificationUnreadCount}
            />
          </div>
        </div>
        
        {/* Refined Profile Trigger */}
        <div className="profile-trigger-container" ref={dropdownRef}>
          <button 
            ref={profileTriggerRef}
            type="button" 
            className="profile-trigger-refined"
            aria-label="User menu" 
            aria-expanded={isProfileOpen}
            aria-controls="talent-profile-dropdown"
            onClick={(e) => {
              e.stopPropagation();
              setIsProfileOpen(!isProfileOpen);
              setIsNotificationsOpen(false); // Close other dropdown
              setIsMobileNavOpen(false);
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
            <div
              id="talent-profile-dropdown"
              role="dialog"
              aria-modal="true"
              aria-label="User menu"
              className="profile-dropdown-refined"
            >
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
                    {profile ? `${profile.first_name} ${profile.last_name}` : 'Loading'}
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
                  <span className="strength-percentage">{safeOfficialScore}%</span>
                </div>
                <div className="strength-progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${safeOfficialScore}%` }}
                  />
                </div>
              </NavLink>

              <div className="dropdown-divider" />

              {/* Quick Actions */}
              <div className="dropdown-actions">
                {profile?.slug ? (
                  <a
                    href={`/portfolio/${profile.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dropdown-item"
                    onClick={() => setIsProfileOpen(false)}
                  >
                    <ExternalLink size={16} />
                    <span>View Public Profile</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={handlePublicProfileNav}
                  >
                    <ExternalLink size={16} />
                    <span>View Public Profile</span>
                  </button>
                )}

                <NavLink 
                  to="/dashboard/talent/settings" 
                  className="dropdown-item"
                  onClick={() => setIsProfileOpen(false)}
                >
                  <Settings size={16} />
                  <span>Account Settings</span>
                </NavLink>

                {!subscription?.isPro && (
                  <a 
                    href="https://www.pholio.studio/pricing"
                    className="dropdown-item upgrade-item"
                    onClick={() => setIsProfileOpen(false)}
                  >
                    <Sparkles size={16} />
                    <span>Upgrade to Studio+</span>
                  </a>
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
