import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { addAgencyTeamMember } from '../api/agency';
import { ASSIGNABLE_ROLES } from './team-presence';
import { useAgencyPermissions } from '../hooks/useAgencyPermissions';

const DEFAULT_ROLE = 'SCOUT';

export default function TeamAddModal({ open, onClose }) {
  const qc = useQueryClient();
  const { presetRole } = useAgencyPermissions();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(DEFAULT_ROLE);

  const roleOptions = ASSIGNABLE_ROLES.filter((r) => {
    if (r.value === 'ADMIN') return presetRole === 'OWNER';
    return true;
  });

  const handleClose = () => { setEmail(''); setRole(DEFAULT_ROLE); onClose(); };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const add = useMutation({
    mutationFn: () => addAgencyTeamMember({ email: email.trim().toLowerCase(), membership_role: role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agency', 'team'] });
      toast.success('Team member added');
      handleClose();
    },
    onError: (e) => {
      const msg = e?.data?.message || e?.message || 'Could not add the member';
      toast.error(msg);
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (!email.trim()) { toast.error('Enter the member’s agency email'); return; }
    add.mutate();
  };

  const RoleHint = roleOptions.find((r) => r.value === role)?.hint;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="tm-overlay"
          onClick={handleClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.form
            className="tm-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 230, damping: 24 }}
          >
            <div className="tm-modal-head">
              <div>
                <h2 className="tm-modal-title">Add a member</h2>
              </div>
              <button type="button" className="tm-modal-close" onClick={handleClose} aria-label="Close"><X size={17} /></button>
            </div>

            <div className="tm-modal-body">
              <div className="tm-field">
                <label className="tm-flabel">Agency email <span className="tm-req">*</span></label>
                <input
                  className="tm-finput"
                  type="email"
                  placeholder="name@agency.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
                <p className="tm-hint">They must already have a Pholio agency login. Email invites are coming soon.</p>
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

            <div className="tm-modal-actions">
              <button type="button" className="tm-modal-cancel" onClick={handleClose}>Cancel</button>
              <button type="submit" className="tm-modal-submit" disabled={add.isPending}>
                {add.isPending ? 'Adding…' : 'Add to team'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
