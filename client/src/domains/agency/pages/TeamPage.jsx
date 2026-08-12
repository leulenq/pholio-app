import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { UserPlus, Users } from 'lucide-react';
import { useAgencyTeam } from '../hooks/useAgencyTeam';
import { getAgencyProfile } from '../api/agency';
import TeamMemberCard from '../components/TeamMemberCard';
import TeamAddModal from '../components/TeamAddModal';
import TeamRolesGuide from '../components/TeamRolesGuide';
import { useCanManageTeam } from '../hooks/useAgencyPermissions';
import { foundingYear, normalizeRole } from '../components/team-presence';
import { EmptyErrorState } from '../../../shared/components/states';
import PholioButton from '../../../shared/components/ui/PholioButton';
import './TeamPage.css';

const ROLE_RANK = { OWNER: 0, ADMIN: 1, AGENT: 2, SCOUT: 3, VIEWER: 4, MEMBER: 3 };

export default function TeamPage() {
  const [adding, setAdding] = useState(false);
  const [showFormer, setShowFormer] = useState(false);

  const { data: team = [], isLoading, isError, refetch } = useAgencyTeam();
  const { data: profile } = useQuery({
    queryKey: ['agency-profile'],
    queryFn: getAgencyProfile,
    staleTime: 5 * 60 * 1000,
  });

  const canManage = useCanManageTeam();

  const { leadership, members, pending, former } = useMemo(() => {
    const active = team.filter((m) => m.status !== 'INACTIVE' && m.status !== 'INVITED');
    const sortRole = (a, b) =>
      (ROLE_RANK[normalizeRole(a.membership_role)] ?? 5) -
      (ROLE_RANK[normalizeRole(b.membership_role)] ?? 5);
    return {
      leadership: active.filter((m) => {
        const r = normalizeRole(m.membership_role);
        return r === 'OWNER' || r === 'ADMIN';
      }).sort(sortRole),
      members: active.filter((m) => {
        const r = normalizeRole(m.membership_role);
        return r !== 'OWNER' && r !== 'ADMIN';
      }).sort(sortRole),
      pending: team.filter((m) => m.status === 'INVITED'),
      former: team.filter((m) => m.status === 'INACTIVE'),
    };
  }, [team]);

  const activeCount = leadership.length + members.length;
  const agencyName = profile?.agency_name || 'Your agency';
  const since = foundingYear(team);

  const renderCard = (m) => (
    <TeamMemberCard
      key={m.membershipId || m.invitationId || m.userId}
      member={m}
      isYou={m.userId === profile?.id}
      canManage={canManage}
    />
  );

  return (
    <div className="tm-page">
      {/* ── Masthead ── */}
      <motion.header
        className="tm-masthead"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 55, damping: 16 }}
      >
        <div className="tm-masthead-wash" aria-hidden="true" />
        <div className="tm-cobrand">
          <span className="tm-cobrand-pholio">PHOLIO</span>
          <span className="tm-cobrand-div" aria-hidden="true" />
          <span className="tm-cobrand-name">{agencyName}</span>
        </div>
        <div className="tm-masthead-row">
          <div>
            <h1 className="tm-title">The Team</h1>
            <p className="tm-subline">
              {activeCount ? `${activeCount} ${activeCount === 1 ? 'person' : 'people'}` : 'Just getting started'}
              {since ? <> · together since {since}</> : null}
            </p>
          </div>
          {canManage && (
            <PholioButton variant="primary" icon={<UserPlus size={16} />} onClick={() => setAdding(true)}>
              Add member
            </PholioButton>
          )}
        </div>
      </motion.header>

      {/* ── Body ── */}
      {isLoading ? (
        <div className="tm-groups">
          <div className="tm-grid">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="tm-card tm-card--skeleton" />)}
          </div>
        </div>
      ) : isError ? (
        <EmptyErrorState
          variant="compact"
          title="Could not load your team"
          body="The team list did not load. Try again to refresh."
          retry={{ label: 'Try again', onClick: () => refetch() }}
        />
      ) : activeCount === 0 && pending.length === 0 ? (
        <div className="tm-empty">
          <Users size={26} />
          <p className="tm-empty-title">No teammates yet</p>
          <p className="tm-empty-sub">Add the people you work with to make this your agency’s home.</p>
          {canManage && (
            <PholioButton variant="primary" icon={<UserPlus size={16} />} onClick={() => setAdding(true)}>
              Add member
            </PholioButton>
          )}
        </div>
      ) : (
        <div className="tm-groups">
          {leadership.length > 0 && (
            <section className="tm-group">
              <div className="tm-group-head">
                <h2 className="tm-group-title">Leadership</h2>
              </div>
              <div className="tm-grid">{leadership.map(renderCard)}</div>
            </section>
          )}

          {members.length > 0 && (
            <section className="tm-group">
              <div className="tm-group-head">
                <h2 className="tm-group-title">Team</h2>
              </div>
              <div className="tm-grid">{members.map(renderCard)}</div>
            </section>
          )}

          {pending.length > 0 && (
            <section className="tm-group">
              <div className="tm-group-head">
                <h2 className="tm-group-title">Invitations</h2>
              </div>
              <div className="tm-grid">{pending.map(renderCard)}</div>
            </section>
          )}

          {former.length > 0 && (
            <section className="tm-group tm-group--former">
              <button className="tm-former-toggle" onClick={() => setShowFormer((v) => !v)}>
                {showFormer ? 'Hide' : 'Show'} former members ({former.length})
              </button>
              {showFormer && <div className="tm-grid tm-grid--muted">{former.map(renderCard)}</div>}
            </section>
          )}
        </div>
      )}

      <TeamRolesGuide />

      <TeamAddModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
