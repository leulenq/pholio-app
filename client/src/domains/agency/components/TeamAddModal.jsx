import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { addAgencyTeamMember } from '../api/agency';
import { ASSIGNABLE_ROLES } from './team-presence';
import { useAgencyPermissions } from '../hooks/useAgencyPermissions';
import { AgencyModal, AgencyButton } from './ui';

const DEFAULT_ROLE = 'SCOUT';

export default function TeamAddModal({ open, onClose }) {
  const qc = useQueryClient();
  const { presetRole } = useAgencyPermissions();
  const emailRef = useRef(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(DEFAULT_ROLE);

  const roleOptions = ASSIGNABLE_ROLES.filter((r) => {
    if (r.value === 'ADMIN') return presetRole === 'OWNER';
    return true;
  });

  const handleClose = () => { setEmail(''); setRole(DEFAULT_ROLE); onClose(); };

  const add = useMutation({
    mutationFn: () => addAgencyTeamMember({ email: email.trim().toLowerCase(), membership_role: role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agency', 'team'] });
      toast.success('Invitation sent');
      handleClose();
    },
    onError: (e) => {
      const msg = e?.data?.message || e?.message || 'Could not send the invitation';
      toast.error(msg);
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (!email.trim()) { toast.error('Enter the member’s agency email'); return; }
    add.mutate();
  };

  const RoleHint = roleOptions.find((r) => r.value === role)?.hint;

  return (
    <AgencyModal
      open={open}
      onClose={handleClose}
      title="Invite a teammate"
      initialFocusRef={emailRef}
      className="tm-invite-modal"
      footer={(
        <>
          <AgencyButton variant="secondary" onClick={handleClose}>Cancel</AgencyButton>
          <AgencyButton type="submit" form="team-invite-form" loading={add.isPending}>
            Send invitation
          </AgencyButton>
        </>
      )}
    >
      <form id="team-invite-form" onSubmit={submit}>
        <div className="tm-modal-body">
              <div className="tm-field">
                <label className="tm-flabel" htmlFor="team-invite-email">Work email <span className="tm-req">*</span></label>
                <input
                  ref={emailRef}
                  id="team-invite-email"
                  className="tm-finput"
                  type="email"
                  placeholder="name@agency.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <p className="tm-hint">The link expires in seven days and only works for this email address.</p>
              </div>

              <div className="tm-field">
                <label className="tm-flabel">Seat</label>
                <div className="tm-seg tm-seg--wrap">
                  {roleOptions.map((r) => (
                    <button
                      type="button"
                      key={r.value}
                      className={`tm-seg-btn${role === r.value ? ' tm-seg-btn--on' : ''}`}
                      onClick={() => setRole(r.value)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                {RoleHint && <p className="tm-hint">{RoleHint}</p>}
              </div>
        </div>
      </form>
    </AgencyModal>
  );
}
