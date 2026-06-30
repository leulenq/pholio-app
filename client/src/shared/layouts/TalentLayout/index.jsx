import { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { Lock, ChevronDown, Bell } from 'lucide-react';
import { useAuth } from '../../../domains/auth/hooks/useAuth';
import { useFlash } from '../../hooks/useFlash';
import { getTalentHeaderTone } from '../../utils/talentHeaderTone';
import { TALENT_NAV_SECTIONS } from '../../constants/talentNav';
import { postLogoutAndRedirectToMarketing } from '../../lib/logout';
import NotificationCenter, {
  useNotificationUnreadCount,
} from '../../components/NotificationCenter/NotificationCenter';
import PholioButton, {
  PholioIconButton,
} from '../../components/ui/PholioButton';
import '../../components/NotificationCenter/NotificationCenter.css';
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

  const unreadCount = useNotificationUnreadCount();

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
              <PholioButton
                to="/dashboard/talent/settings/subscription"
                variant="primary"
                tone={headerTone === 'light' ? 'light' : 'dark'}
                className="tl-btn-upgrade"
              >
                Upgrade
              </PholioButton>
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
              data-button-exception="shell-notifications"
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : 'Notifications'
              }
              className={`tl-action-icon${isNotificationsOpen ? ' is-open' : ''}${unreadCount > 0 ? ' has-unread' : ''}`}
              aria-haspopup="true"
              aria-expanded={isNotificationsOpen}
              aria-controls="tl-notifications-panel"
              onClick={() => setIsNotificationsOpen((open) => !open)}
            >
              <Bell size={18} strokeWidth={1.5} />
              {unreadCount > 0 && (
                <span className="tl-action-badge" aria-hidden>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div
                id="tl-notifications-panel"
                className="tl-notifications-panel"
                aria-label="Notifications"
              >
                <NotificationCenter onClose={() => setIsNotificationsOpen(false)} />
              </div>
            )}
          </div>


          <div
            ref={accountRef}
            className={`tl-account${isAccountOpen ? ' is-open' : ''}`}
          >
            <div className="tl-account-suite">
              <PholioButton
                ref={accountButtonRef}
                type="button"
                variant="tertiary"
                tone={headerTone === 'light' ? 'light' : 'dark'}
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
            </PholioButton>

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
                    data-button-exception="shell-signout"
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
            <PholioIconButton
              label="Dismiss message"
              tone={headerTone === 'light' ? 'light' : 'dark'}
              onClick={clearFlash}
              className="tl-flash-close"
            >
              &times;
            </PholioIconButton>
          </div>
        )}
        {children || <Outlet context={outletContext} />}
      </main>
    </div>
  );
}
