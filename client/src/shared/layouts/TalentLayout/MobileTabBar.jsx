import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  BookOpen,
  User,
  Store,
  LineChart,
  Lock,
} from 'lucide-react';
import { TALENT_NAV_ITEMS } from '../../constants/talentNav';
import './MobileTabBar.css';

/**
 * Icon per talent IA item, keyed by the nav label from talentNav.js
 * (single source of truth). The bottom bar mirrors the top strip's items,
 * lock behaviour, and active routing — it is the mobile navigation model.
 */
const TAB_ICONS = {
  Overview: LayoutGrid,
  'The Book': BookOpen,
  Profile: User,
  Market: Store,
  Intel: LineChart,
};

export default function MobileTabBar({ isBlocked = false }) {
  return (
    <nav className="tl-tabbar" aria-label="Talent navigation">
      <ul className="tl-tabbar-list">
        {TALENT_NAV_ITEMS.map((item) => {
          const Icon = TAB_ICONS[item.label] ?? LayoutGrid;
          const isLocked = Boolean(isBlocked && item.requiresProfileGate);

          if (isLocked) {
            return (
              <li key={item.to} className="tl-tabbar-item">
                <span
                  className="tl-tabbar-link tl-tabbar-link--locked"
                  aria-label={`${item.label} locked until profile is complete`}
                  aria-disabled="true"
                >
                  <span className="tl-tabbar-icon">
                    <Icon size={20} strokeWidth={1.6} aria-hidden />
                    <Lock
                      className="tl-tabbar-lock"
                      size={11}
                      strokeWidth={2.2}
                      aria-hidden
                    />
                  </span>
                  <span className="tl-tabbar-label">{item.label}</span>
                </span>
              </li>
            );
          }

          return (
            <li key={item.to} className="tl-tabbar-item">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `tl-tabbar-link${isActive ? ' tl-tabbar-link--active' : ''}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="tl-tabbar-icon">
                      <Icon
                        size={20}
                        strokeWidth={isActive ? 2 : 1.6}
                        aria-hidden
                      />
                    </span>
                    <span className="tl-tabbar-label">{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
