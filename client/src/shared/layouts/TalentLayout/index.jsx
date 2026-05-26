import { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { Lock, ChevronDown, Bell, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../domains/auth/hooks/useAuth';
import { useFlash } from '../../hooks/useFlash';
import { getTalentHeaderTone } from '../../utils/talentHeaderTone';
import { TALENT_NAV_SECTIONS } from '../../constants/talentNav';
import { talentApi } from '../../../domains/talent/api/talent';
import { postLogoutAndRedirectToMarketing } from '../../lib/logout';
import './TalentLayout.css';

export default function TalentLayout({ outletContext = {}, children }) {
  const { pathname } = useLocation();
  const headerTone = getTalentHeaderTone(pathname);
  const { user, profile } = useAuth();
  const { message, clearFlash } = useFlash();
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const accountButtonRef = useRef(null);

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef(null);
  const notificationsButtonRef = useRef(null);

  // Fetch activities (talent notifications)
  const { data: activitiesData, isLoading, isError } = useQuery({
    queryKey: ['talent-activity'],
    queryFn: () => talentApi.getActivity(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const activities = Array.isArray(activitiesData) ? activitiesData : [];

  // Local read status state
  const [readIds, setReadIds] = useState(() => {
    try {
      const stored = localStorage.getItem('pholio_read_activities');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const unreadCount = activities.filter(act => act.id && !readIds.has(act.id)).length;

  const markAllAsRead = () => {
    const newRead = new Set([...readIds, ...activities.map(act => act.id)]);
    setReadIds(newRead);
    localStorage.setItem('pholio_read_activities', JSON.stringify([...newRead]));
  };

  const markAsRead = (id) => {
    if (readIds.has(id)) return;
    const newRead = new Set([...readIds, id]);
    const arr = [...newRead].slice(-100); // Keep last 100 to avoid infinite growth
    setReadIds(new Set(arr));
    localStorage.setItem('pholio_read_activities', JSON.stringify(arr));
  };

  const firstName = profile?.first_name || profile?.name?.split(' ')[0] || '';
  const lastName = profile?.last_name || profile?.name?.split(' ').slice(1)[0] || '';
  const initials = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || 'ME';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || profile?.name || user?.email || 'Talent user';
  const email = profile?.email || user?.email || '';
  const profileImage = profile?.profile_image || profile?.hero_image_path || '';
  const isStudioPlus = Boolean(profile?.is_pro || profile?.subscription?.isPro || user?.subscription?.isPro);
  const tierLabel = isStudioPlus ? 'Studio+' : 'Free';

  useEffect(() => {
    if (!isAccountOpen && !isNotificationsOpen) return undefined;

    const close = (event) => {
      if (isAccountOpen && accountRef.current && !accountRef.current.contains(event.target)) {
        setIsAccountOpen(false);
      }
      if (isNotificationsOpen && notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    };

    const onEscape = (event) => {
      if (event.key === 'Escape') {
        if (isAccountOpen) {
          setIsAccountOpen(false);
          accountButtonRef.current?.focus();
        }
        if (isNotificationsOpen) {
          setIsNotificationsOpen(false);
          notificationsButtonRef.current?.focus();
        }
      }
    };

    document.addEventListener('mousedown', close);
    document.addEventListener('focusin', close);
    document.addEventListener('keydown', onEscape);

    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('focusin', close);
      document.removeEventListener('keydown', onEscape);
    };
  }, [isAccountOpen, isNotificationsOpen]);

  const handleLogout = async () => {
    await postLogoutAndRedirectToMarketing();
  };

  return (
    <div className={`tl-root tl-root--tone-${headerTone}`}>
      <div className="tl-topbar">
        <div className="tl-logo-lockup" aria-label="Pholio">
          <span className="tl-logo-word">PHOLIO</span>
        </div>

        <nav className="tl-topnav" aria-label="Talent workspace">
          {TALENT_NAV_SECTIONS.map((section, sectionIndex) => (
            <div key={sectionIndex} className="tl-topnav-section">
              {sectionIndex > 0 && <span className="tl-topnav-divider" aria-hidden />}
              {section.items.map((item) => {
                const isLocked = Boolean(outletContext?.isBlocked && item.requiresProfileGate);
                const navKey = item.requiresProfileGate ? item.label.toLowerCase() : undefined;
                if (isLocked) {
                  return (
                    <span
                      key={item.to}
                      data-tl-nav={navKey}
                      aria-label={`${item.label} locked until profile is complete`}
                      className="tl-topnav-link tl-topnav-link--locked tl-topnav-link--disabled"
                    >
                      {item.label}
                      <Lock size={10} strokeWidth={1.8} aria-hidden />
                    </span>
                  );
                }

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    data-tl-nav={navKey}
                    className={({ isActive }) =>
                      `tl-topnav-link${isActive ? ' tl-topnav-link--active' : ''}`
                    }
                  >
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="tl-header-actions">
          {!isStudioPlus && (
            <>
              <a
                href="https://www.pholio.studio/pricing"
                className="tl-btn-upgrade"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Sparkles size={14} aria-hidden />
                Upgrade
              </a>
              <span className="tl-header-actions-divider" aria-hidden="true" />
            </>
          )}
          <div
            ref={notificationsRef}
            className={`tl-notifications-container${isNotificationsOpen ? ' is-open' : ''}`}
          >
            <button
              ref={notificationsButtonRef}
              type="button"
              className={`tl-action-icon${isNotificationsOpen ? ' is-open' : ''}`}
              aria-label="Notifications"
              aria-haspopup="true"
              aria-expanded={isNotificationsOpen}
              aria-controls="tl-notifications-panel"
              onClick={() => setIsNotificationsOpen((open) => !open)}
            >
              <Bell size={18} strokeWidth={1.5} />
              {unreadCount > 0 && <span className="tl-action-badge">{unreadCount}</span>}
            </button>

            {isNotificationsOpen && (
              <div id="tl-notifications-panel" className="tl-notifications-panel" aria-label="Notifications">
                <div className="tl-notifications-panel-head">
                  <h3 className="tl-notifications-panel-title">Notifications</h3>
                  {unreadCount > 0 && (
                    <button className="tl-notifications-mark-read" onClick={markAllAsRead}>
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="tl-notifications-list-container">
                  {isLoading && (
                    <div className="tl-notifications-state">Loading activities...</div>
                  )}
                  {isError && (
                    <div className="tl-notifications-state">Could not load activities.</div>
                  )}
                  {!isLoading && !isError && activities.length === 0 && (
                    <div className="tl-notifications-state">All caught up.</div>
                  )}
                  {!isLoading && !isError && activities.length > 0 && (
                    <ul className="tl-notifications-list">
                      {activities.map((activity) => {
                        const isUnread = !readIds.has(activity.id);
                        return (
                          <li
                            key={activity.id}
                            className={`tl-notifications-item${isUnread ? ' is-unread' : ''}`}
                            onClick={() => markAsRead(activity.id)}
                          >
                            <span className="tl-notifications-icon" aria-hidden="true">
                              {activity.icon || '📝'}
                            </span>
                            <div className="tl-notifications-item-content">
                              <p className="tl-notifications-item-message">{activity.message}</p>
                              <span className="tl-notifications-item-time">{activity.timeAgo}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>


          <div
            ref={accountRef}
            className={`tl-account${isAccountOpen ? ' is-open' : ''}`}
          >
            <div className="tl-account-suite">
              <button
                ref={accountButtonRef}
                type="button"
                className={`tl-account-trigger${isAccountOpen ? ' is-open' : ''}`}
                aria-label={`Account menu for ${fullName}`}
                aria-haspopup="true"
                aria-expanded={isAccountOpen}
                aria-controls="tl-account-panel"
                onClick={() => setIsAccountOpen((open) => !open)}
              >
                <span className="tl-account-mark" aria-hidden="true">
                  {profileImage ? (
                    <img src={profileImage} alt="" className="tl-account-mark-img" />
                  ) : (
                    <span className="tl-account-mark-initials">{initials}</span>
                  )}
                </span>
                <span className="tl-account-trigger-name">{fullName}</span>
                <ChevronDown
                  size={14}
                  strokeWidth={1.5}
                  className={`tl-account-chevron${isAccountOpen ? ' is-open' : ''}`}
                  aria-hidden="true"
                />
            </button>

            {isAccountOpen && (
              <>
                <div id="tl-account-panel" className="tl-account-panel" aria-label="Account">
                <div className="tl-account-panel-head">
                  <div className="tl-account-panel-identity">
                    <p className="tl-account-panel-name">{fullName}</p>
                    <span className={`tl-tier-pill ${isStudioPlus ? 'is-studio' : 'is-free'}`}>
                      {tierLabel}
                    </span>
                  </div>
                  {email ? <p className="tl-account-panel-email">{email}</p> : null}
                </div>

                <div className="tl-account-panel-section">
                  <nav className="tl-account-panel-links" aria-label="Account links">
                    {profile?.slug ? (
                      <a
                        href={`/talent/${profile.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tl-account-panel-link"
                        onClick={() => setIsAccountOpen(false)}
                      >
                        Public Profile
                      </a>
                    ) : null}
                    <Link
                      to="/dashboard/talent/settings"
                      className="tl-account-panel-link"
                      onClick={() => setIsAccountOpen(false)}
                    >
                      Account Settings
                    </Link>
                  </nav>
                </div>

                <div className="tl-account-panel-section tl-account-panel-section--footer">
                  <button
                    type="button"
                    className="tl-account-panel-link tl-account-panel-link--signout"
                    onClick={handleLogout}
                  >
                    Sign Out
                  </button>
                </div>
                </div>
              </>
            )}
          </div>
        </div>
        </div>
      </div>

      <main className="tl-content">
        {message && (
          <div className={`tl-flash tl-flash--${message.type}`}>
            <span>{message.text}</span>
            <button type="button" onClick={clearFlash} className="tl-flash-close">
              &times;
            </button>
          </div>
        )}
        {children || <Outlet context={outletContext} />}
      </main>
    </div>
  );
}
