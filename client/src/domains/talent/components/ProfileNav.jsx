import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import styles from '../pages/ProfilePage/ProfilePage.module.css';

const NAV_ITEMS = [
  { id: 'identity', label: 'Personal Details' },
  { id: 'discipline', label: 'Discipline & Focus' },
  { id: 'appearance', label: 'Stats & Measurements' },
  { id: 'credits', label: 'Credits & Experience' },
  { id: 'training', label: 'Training & Skills' },
  { id: 'representation', label: 'Representation' },
  { id: 'socials', label: 'Socials & Media' },
  { id: 'private', label: 'Private & Compliance' },
  { id: 'contact', label: 'On-set Safety' }
];

const VALID_NAV_IDS = new Set(NAV_ITEMS.map((item) => item.id));

const ProfileNav = ({ onNavClick, activeSection }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const resolvedTab = rawTab && VALID_NAV_IDS.has(rawTab) ? rawTab : 'identity';

  const activeId = useMemo(() => {
    if (activeSection && NAV_ITEMS.some((item) => item.id === activeSection)) {
      return activeSection;
    }
    return resolvedTab;
  }, [resolvedTab, activeSection]);

  const handleNavClick = (id) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', id);
      return next;
    });
    if (onNavClick) onNavClick();
  };

  return (
    <nav className={styles.profileNav} aria-label="Profile sections">
      <div className={styles.navHeader}>
        <h2 className={styles.navTitle}>Index</h2>
      </div>
      <ol className={styles.navList}>
        {NAV_ITEMS.map(({ id, label }, index) => {
          const isActive = activeId === id;
          return (
            <li key={id} className={styles.navListItem}>
              <button
                type="button"
                data-button-exception="profile-index"
                onClick={() => handleNavClick(id)}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                aria-current={isActive ? 'true' : undefined}
              >
                <span className={styles.navMarker} aria-hidden="true">
                  <span className={styles.navNum}>{String(index + 1).padStart(2, '0')}</span>
                </span>
                <span className={styles.navLabelWrap}>
                  <span className={styles.navLabel}>{label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default ProfileNav;
