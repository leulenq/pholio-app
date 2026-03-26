import React, { useMemo } from 'react';
import { User, Globe, Ruler, Award, GalleryVerticalEnd, Share2, GraduationCap, Camera, Briefcase, Phone } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import styles from '../pages/ProfilePage/ProfilePage.module.css';

const NAV_ITEMS = [
  { id: 'identity', label: 'Personal Details', icon: User },
  { id: 'heritage', label: 'Heritage & Background', icon: Globe },
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'appearance', label: 'Physical Attributes', icon: Ruler },
  { id: 'credits', label: 'Credits & Experience', icon: GalleryVerticalEnd },
  { id: 'training', label: 'Training & Skills', icon: GraduationCap },
  { id: 'roles', label: 'Roles & Style', icon: Award },
  { id: 'representation', label: 'Representation', icon: Briefcase },
  { id: 'socials', label: 'Socials & Media', icon: Share2 },
  { id: 'contact', label: 'Contact', icon: Phone }
];

const VALID_NAV_IDS = new Set(NAV_ITEMS.map((item) => item.id));

const ProfileNav = ({ onNavClick, activeSection }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const resolvedTab =
    rawTab && VALID_NAV_IDS.has(rawTab) ? rawTab : 'identity';

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
    <nav aria-label="Profile Sections">
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <button
              onClick={() => handleNavClick(id)}
              className={`${styles.navItem} ${activeId === id ? styles.navItemActive : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          </li>
        ))}

        {/* Studio+ Upsell Item */}

      </ul>
    </nav>
  );
};

export default ProfileNav;
