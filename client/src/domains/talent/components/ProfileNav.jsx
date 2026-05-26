import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { buildNavGapBySection } from './profileReadinessItems';
import styles from '../pages/ProfilePage/ProfilePage.module.css';

const NAV_ITEMS = [
  { id: 'identity', label: 'Personal Details' },
  { id: 'heritage', label: 'Heritage & Background' },
  { id: 'photos', label: 'Photos' },
  { id: 'appearance', label: 'Physical Attributes' },
  { id: 'credits', label: 'Credits & Experience' },
  { id: 'training', label: 'Training & Skills' },
  { id: 'roles', label: 'Roles & Style' },
  { id: 'representation', label: 'Representation' },
  { id: 'socials', label: 'Socials & Media' },
  { id: 'contact', label: 'Contact' }
];

const VALID_NAV_IDS = new Set(NAV_ITEMS.map((item) => item.id));

const ProfileNav = ({ onNavClick, activeSection, fieldCompletion }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const resolvedTab =
    rawTab && VALID_NAV_IDS.has(rawTab) ? rawTab : 'identity';

  const navGaps = useMemo(
    () => (fieldCompletion ? buildNavGapBySection(fieldCompletion) : {}),
    [fieldCompletion],
  );

  const activeId = useMemo(() => {
    const navIdFromSection = activeSection === 'photos-tab' ? 'photos' : activeSection;
    if (navIdFromSection && NAV_ITEMS.some((item) => item.id === navIdFromSection)) {
      return navIdFromSection;
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
      <p className={styles.navIndexLabel}>Index</p>
      <ol className={styles.navList}>
        {NAV_ITEMS.map(({ id, label }, index) => {
          const isActive = activeId === id;
          const hasGap = !!navGaps[id];
          return (
            <li key={id} className={styles.navListItem}>
              <button
                type="button"
                onClick={() => handleNavClick(id)}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                aria-current={isActive ? 'true' : undefined}
              >
                <span className={styles.navNum} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={styles.navLabelWrap}>
                  <span className={styles.navLabel}>{label}</span>
                  {hasGap ? (
                    <span className={styles.navGapDot} title="Has incomplete fields" aria-label="Incomplete" />
                  ) : null}
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
