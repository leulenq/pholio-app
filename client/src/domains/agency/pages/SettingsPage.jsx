import { useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Palette, Layers, Bell, ScrollText, Shield } from 'lucide-react';
import { getAgencyProfile } from '../api/agency';
import { useAgencyTeam } from '../hooks/useAgencyTeam';
import { useCanManageOrg } from '../hooks/useAgencyPermissions';
import { formatRole, normalizeRole } from '../components/team-presence';
import { EmptyErrorState } from '../../../shared/components/states';
import ProfilePanel from './settings/ProfilePanel';
import BrandingPanel from './settings/BrandingPanel';
import DivisionsPanel from './settings/DivisionsPanel';
import NotificationsPanel from './settings/NotificationsPanel';
import RepresentationPanel from './settings/RepresentationPanel';
import SecurityPanel from './settings/SecurityPanel';
import './SettingsPage.css';

const GROUPS = [
  {
    label: 'House',
    items: [
      { id: 'profile', label: 'Identity', icon: User, desc: 'Agency name, location, social presence & contact' },
      { id: 'branding', label: 'Branding', icon: Palette, desc: 'Logo, color & visual identity' },
    ],
  },
  {
    label: 'Roster',
    items: [
      { id: 'divisions', label: 'Divisions & Boards', icon: Layers, desc: 'How talent is organized across the house' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'notifications', label: 'Notifications', icon: Bell, desc: 'Board, booking & desk alerts' },
      { id: 'representation', label: 'Representation', icon: ScrollText, desc: 'Exclusivity, commission & contracts' },
    ],
  },
  {
    label: 'Account',
    items: [
      { id: 'security', label: 'Security', icon: Shield, desc: 'Sign-in & access' },
    ],
  },
];
const TABS = GROUPS.flatMap((g) => g.items);

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const activeTab = TABS.some((t) => t.id === requested) ? requested : 'profile';
  const current = TABS.find((t) => t.id === activeTab);

  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: ['agency-profile'],
    queryFn: getAgencyProfile,
    staleTime: 5 * 60 * 1000,
  });
  const { data: team = [] } = useAgencyTeam();

  const myRole = useMemo(
    () => normalizeRole(team.find((m) => m.userId === profile?.id)?.membership_role),
    [team, profile],
  );
  const canManage = useCanManageOrg();

  // Team management lives on the dedicated Team page — not in Settings.
  useEffect(() => {
    if (requested === 'team') {
      navigate('/dashboard/agency/team', { replace: true });
    }
  }, [requested, navigate]);

  // Normalize an unknown ?tab into the canonical value once profile context exists.
  useEffect(() => {
    if (requested && requested !== 'team' && !TABS.some((t) => t.id === requested)) {
      setSearchParams({ tab: 'profile' }, { replace: true });
    }
  }, [requested, setSearchParams]);

  const selectTab = (id) => setSearchParams({ tab: id });

  const renderPanel = () => {
    switch (activeTab) {
      case 'branding': return <BrandingPanel profile={profile} canManage={canManage} />;
      case 'divisions': return <DivisionsPanel />;
      case 'notifications': return <NotificationsPanel profile={profile} canManage={canManage} />;
      case 'representation': return <RepresentationPanel />;
      case 'security': return <SecurityPanel profile={profile} canManage={canManage} />;
      default: return <ProfilePanel profile={profile} canManage={canManage} />;
    }
  };

  return (
    <div className="st-page">
      {/* ── Header ── */}
      <header className="st-head">
        <div className="st-head-id">
          <h1 className="st-head-title">Settings</h1>
        </div>
        {myRole && (
          <div className={`st-seat st-seat--${myRole.toLowerCase()}`}>
            <span className="st-seat-role">{formatRole(myRole)}</span>
          </div>
        )}
      </header>

      {/* ── Console ── */}
      {isError ? (
        <EmptyErrorState
          variant="compact"
          title="Could not load settings"
          body="Your agency settings did not load. Try again to refresh."
          retry={{ label: 'Try again', onClick: () => refetch() }}
        />
      ) : (
        <div className="st-console">
          <aside className="st-rail">
            {GROUPS.map((group) => (
              <div className="st-rail-group" key={group.label}>
                <span className="st-rail-group-label">{group.label}</span>
                {group.items.map((tab) => {
                  const Icon = tab.icon;
                  const on = activeTab === tab.id;
                  return (
                    <button key={tab.id} className={`st-rail-item${on ? ' st-rail-item--on' : ''}`} onClick={() => selectTab(tab.id)}>
                      <Icon className="st-rail-icon" size={16} strokeWidth={1.7} />
                      <span className="st-rail-text">{tab.label}</span>
                      {on && <motion.span layoutId="st-rail-active" className="st-rail-bleed" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </aside>

          <main className="st-panel">
            <div className="st-panel-head">
              <h2 className="st-panel-title">{current?.label}</h2>
              <p className="st-panel-desc">{current?.desc}</p>
            </div>
            <div className="st-panel-body">
              {isLoading ? (
                <div className="st-panel-loading">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="st-skel" />)}
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ type: 'spring', stiffness: 55, damping: 16 }}
                  >
                    {renderPanel()}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
