import React, { useEffect, useState } from 'react';
import { User, Globe, Ruler, Award, GalleryVerticalEnd, Share2, GraduationCap, Camera, Sparkles, Briefcase, Phone } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import styles from '../pages/ProfilePage/ProfilePage.module.css';

const NAV_ITEMS = [
  { id: 'identity', label: 'Personal Details', icon: User },
  { id: 'heritage', label: 'Heritage & Background', icon: Globe },
  { id: 'appearance', label: 'Physical Attributes', icon: Ruler },
  { id: 'credits', label: 'Credits & Experience', icon: GalleryVerticalEnd },
  { id: 'training', label: 'Training & Skills', icon: GraduationCap },
  { id: 'roles', label: 'Roles & Style', icon: Award },
  { id: 'representation', label: 'Representation', icon: Briefcase },
  { id: 'socials', label: 'Socials & Media', icon: Share2 },
  { id: 'contact', label: 'Contact', icon: Phone }
];

const ProfileNav = ({ onNavClick, activeSection }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { subscription } = useAuth();
  const activeTab = searchParams.get('tab') || 'identity';

  // highlight active tab based on scroll or URL
  const [activeId, setActiveId] = useState('identity');

  // Sync internal state with URL or Prop
  useEffect(() => {
     if (activeSection) {
       setActiveId(activeSection);
     } else if (activeTab) {
       setActiveId(activeTab);
     }
  }, [activeTab, activeSection]);

  const handleNavClick = (id) => {
    setSearchParams({ tab: id });
    setActiveId(id);
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
