import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  getAgencyTeam,
  addAgencyTeamMember,
  updateAgencyTeamMember,
  removeAgencyTeamMember,
} from '../../api/agency';
import { AgencyButton } from '../../components/ui/AgencyButton';

export default function TeamSection({ profile }) {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');

  const { data: members = [], isLoading, isError, error } = useQuery({
    queryKey: ['agency-team'],
    queryFn: getAgencyTeam,
  });

  const addMemberMutation = useMutation({
    mutationFn: addAgencyTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries(['agency-team']);
      setInviteEmail('');
      setInviteRole('MEMBER');
      toast.success('Team member added');
    },
    onError: (err) => toast.error(err.message || 'Failed to add team member'),
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ membershipId, membership_role }) =>
      updateAgencyTeamMember(membershipId, { membership_role }),
    onSuccess: () => {
      queryClient.invalidateQueries(['agency-team']);
      toast.success('Team member updated');
    },
    onError: (err) => toast.error(err.message || 'Failed to update team member'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: removeAgencyTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries(['agency-team']);
      toast.success('Team member removed');
    },
    onError: (err) => toast.error(err.message || 'Failed to remove team member'),
  });

  const isMutating =
    addMemberMutation.isPending ||
    updateMemberMutation.isPending ||
    removeMemberMutation.isPending;

  return (
    <div className="st-card">
      <div className="st-card-header">
        <h3>Organization Members</h3>
        <span className="st-help">Manage existing provisioned agency logins for this organization.</span>
      </div>
      <div className="st-card-form">
        <div className="st-field-row">
          <div className="st-field">
            <label>Member Email</label>
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@agency.com"
              className="st-input"
            />
          </div>
          <div className="st-field">
            <label>Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="st-input"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
        </div>
        <AgencyButton
          variant="primary"
          size="sm"
          icon={Users}
          loading={addMemberMutation.isPending}
          disabled={!inviteEmail.trim()}
          onClick={() => addMemberMutation.mutate({
            email: inviteEmail.trim(),
            membership_role: inviteRole,
          })}
        >
          Add Member
        </AgencyButton>
      </div>
      <div className="st-team-list">
        {isLoading && (
          <div className="st-member-row">
            <div className="st-member-details">Loading team members...</div>
          </div>
        )}
        {isError && (
          <div className="st-member-row">
            <div className="st-member-details">
              Failed to load team members{error?.message ? `: ${error.message}` : '.'}
            </div>
          </div>
        )}
        {!isLoading && !isError && members.length === 0 && (
          <div className="st-member-row">
            <div className="st-member-details">No team members found.</div>
          </div>
        )}
        {members.map((m) => (
          <div key={m.membershipId} className="st-member-row">
            <div className="st-member-info">
              <div className="st-member-avatar">{(m.full_name || m.email || '?')[0]}</div>
              <div className="st-member-details">
                <span className="st-member-name">
                  {m.full_name}
                  {m.membership_role === 'OWNER' && <span className="st-owner-tag">Owner</span>}
                </span>
                <span className="st-member-email">{m.email}</span>
              </div>
            </div>
            <div className="st-member-role">
              {m.membership_role === 'OWNER' ? (
                'OWNER'
              ) : (
                <select
                  value={m.membership_role}
                  className="st-input"
                  style={{ minWidth: 110 }}
                  disabled={isMutating || m.userId === profile?.id}
                  onChange={(e) => updateMemberMutation.mutate({
                    membershipId: m.membershipId,
                    membership_role: e.target.value,
                  })}
                >
                  <option value="MEMBER">MEMBER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              )}
            </div>
            <div className="st-member-status">
              <span className={`st-status-dot ${m.status === 'ACTIVE' ? 'active' : ''}`} />
              {m.status}
            </div>
            {m.membership_role === 'OWNER' || m.userId === profile?.id ? (
              <span className="st-help">Protected</span>
            ) : (
              <AgencyButton
                variant="ghost"
                size="sm"
                disabled={isMutating}
                onClick={() => removeMemberMutation.mutate(m.membershipId)}
              >
                Remove
              </AgencyButton>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
