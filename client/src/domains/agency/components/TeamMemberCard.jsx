import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Mail, UserMinus, Crown, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { updateAgencyTeamMember, removeAgencyTeamMember } from '../api/agency';
import { monogramOf, hueOf, tenureLabel, formatRole, normalizeRole, ASSIGNABLE_ROLES } from './team-presence';
import { useAgencyPermissions } from '../hooks/useAgencyPermissions';
import TeamPermissionsModal from './TeamPermissionsModal';

export default function TeamMemberCard({ member, isYou = false, canManage = false }) {
  const qc = useQueryClient();
  const { presetRole, can } = useAgencyPermissions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [permModalOpen, setPermModalOpen] = useState(false);

  const role = normalizeRole(member.membership_role || member.preset_role);
  const isOwner = role === 'OWNER';
  const inactive = member.status === 'INACTIVE';
  const pending = member.status === 'INVITED';
  const hue = hueOf(member);

  const assignableRoles = ASSIGNABLE_ROLES.filter((r) => {
    if (r.value === 'ADMIN') return presetRole === 'OWNER';
    return true;
  }).filter((r) => r.value !== role);

  const canCustomizeAccess = can('team.grant_permission');
  const manageable = canManage && !isOwner && !isYou && !inactive && !pending;

  const refresh = () => qc.invalidateQueries({ queryKey: ['agency', 'team'] });

  const setRole = useMutation({
    mutationFn: (nextRole) => updateAgencyTeamMember(member.membershipId, { membership_role: nextRole }),
    onSuccess: (_d, nextRole) => { toast.success(`${member.full_name} is now ${formatRole(nextRole)}`); refresh(); },
    onError: (e) => toast.error(e?.message || 'Could not update the role'),
  });

  const remove = useMutation({
    mutationFn: () => removeAgencyTeamMember(member.membershipId),
    onSuccess: () => { toast.success(`${member.full_name} removed from the team`); refresh(); },
    onError: (e) => toast.error(e?.message || 'Could not remove the member'),
  });

  const busy = setRole.isPending || remove.isPending;

  const pickRole = (nextRole) => {
    setMenuOpen(false);
    setRole.mutate(nextRole);
  };

  const doRemove = () => {
    setMenuOpen(false);
    if (window.confirm(`Remove ${member.full_name} from the team? They'll lose access to this agency.`)) {
      remove.mutate();
    }
  };

  const openCustomAccess = () => {
    setMenuOpen(false);
    setPermModalOpen(true);
  };

  return (
    <div
      className={`tm-card${isOwner ? ' tm-card--owner' : ''}${inactive ? ' tm-card--inactive' : ''}`}
    >
      <div className="tm-card-top">
        <span
          className="tm-mono"
          style={{ background: hue.bg, color: hue.fg, boxShadow: isOwner ? `0 0 0 2px ${hue.ring}` : undefined }}
        >
          {monogramOf(member)}
          {isOwner && <Crown size={11} className="tm-mono-crown" />}
        </span>

        {manageable && (
          <div className="tm-menu-wrap">
            <button className="tm-kebab" onClick={() => setMenuOpen((v) => !v)} aria-label="Member actions" disabled={busy}>
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="tm-menu-scrim" onClick={() => setMenuOpen(false)} />
                <div className="tm-menu" role="menu">
                  {assignableRoles.map((r) => (
                    <button key={r.value} className="tm-menu-item" onClick={() => pickRole(r.value)}>
                      Make {r.label.toLowerCase()}
                    </button>
                  ))}
                  {canCustomizeAccess && (
                    <button className="tm-menu-item" onClick={openCustomAccess}>
                      <Shield size={14} /> Custom access…
                    </button>
                  )}
                  <button className="tm-menu-item tm-menu-item--danger" onClick={doRemove}>
                    <UserMinus size={14} /> Remove from team
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="tm-id">
        <div className="tm-name-row">
          <h3 className="tm-name">{member.full_name}</h3>
          {isYou && <span className="tm-you">(you)</span>}
        </div>
        <span className="tm-role">{formatRole(role)}</span>
      </div>

      <div className="tm-foot">
        {member.email && (
          <a className="tm-email" href={`mailto:${member.email}`} title={member.email} onClick={(e) => e.stopPropagation()}>
            <Mail size={12} /> {member.email}
          </a>
        )}
        {pending ? (
          <span className="tm-tenure">Invitation pending</span>
        ) : inactive ? (
          <span className="tm-tenure tm-tenure--inactive">Former member</span>
        ) : (
          tenureLabel(member) && <span className="tm-tenure">{tenureLabel(member)}</span>
        )}
      </div>

      {!pending && (
        <TeamPermissionsModal
          open={permModalOpen}
          member={member}
          onClose={() => setPermModalOpen(false)}
        />
      )}
    </div>
  );
}
