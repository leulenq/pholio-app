import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { createBoard } from '../api/agency';
import { resolveBoardIdentity, boardIdentityStyle } from '../lib/board-identity';
import { AgencyButton } from '../components/ui';
import PholioCustomSelect from '../../../shared/components/ui/forms/PholioCustomSelect';
import '../components/BoardIdentityEditor.css';

const TYPES = ['Campaign', 'Editorial', 'Runway', 'Lookbook', 'Commercial', 'E-commerce'];
const BLANK = { name: '', client_name: '', type: 'Campaign', description: '', closes_at: '', target_slots: '', is_active: true, board_type: null };

// Live house-identity hint: the plate this board will wear, resolved from the
// client name as the booker types. Full art direction lives in the board's
// Identity editor after creation.
function IdentityHint({ form }) {
  const identity = useMemo(
    () => resolveBoardIdentity({ name: form.name, client_name: form.client_name.trim() }),
    [form.name, form.client_name],
  );
  return (
    <div
      className="bide-preview"
      style={{ ...boardIdentityStyle(identity), marginBottom: 0 }}
      data-letterform={identity.letterform}
      data-treatment={identity.treatment}
      aria-hidden="true"
    >
      <span className="bide-preview-mark">{identity.label}</span>
      <span className="bide-preview-meta">Board plate</span>
    </div>
  );
}

export default function CastingNewModal({ open, onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState(BLANK);

  // Close on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const set = (key) => (e) => {
    const value = e?.target?.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  // A client name or slot target reads as a client package; otherwise it's a
  // division signing board. The chips below let the booker override.
  const impliedType = form.client_name.trim() || form.target_slots ? 'package' : 'division';
  const boardType = form.board_type || impliedType;

  const create = useMutation({
    mutationFn: () => createBoard({
      name: form.name.trim(),
      client_name: form.client_name.trim() || null,
      description: form.description.trim() || null,
      closes_at: form.closes_at || null,
      target_slots: form.target_slots || null,
      is_active: form.is_active,
      board_type: boardType,
    }),
    onSuccess: (board) => {
      qc.invalidateQueries({ queryKey: ['agency-boards'] });
      toast.success('Signing board created');
      onClose();
      if (board?.id) navigate(`/dashboard/agency/signing/${board.id}`);
    },
    onError: () => toast.error('Could not create the board'),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Give the board a name'); return; }
    create.mutate();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="cn-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.form
            className="cn-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 230, damping: 24 }}
          >
            <div className="cn-modal-head">
              <div>
                <h2 className="cn-modal-title">Open a signing board</h2>
              </div>
              <button type="button" className="cn-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
            </div>

            <div className="cn-modal-body">
              <div className="cn-field">
                <label className="cn-label">Board name <span className="cn-req">*</span></label>
                <div className="cn-input-wrap">
                  <input value={form.name} onChange={set('name')} placeholder="SS26 Campaign" autoFocus />
                </div>
              </div>

              <div className="cn-row">
                <div className="cn-field">
                  <label className="cn-label">Client</label>
                  <div className="cn-input-wrap">
                    <input value={form.client_name} onChange={set('client_name')} placeholder="Prada" />
                  </div>
                </div>
                <div className="cn-field">
                  <label className="cn-label">Type</label>
                  <PholioCustomSelect
                    options={TYPES.map((t) => ({ value: t, label: t }))}
                    value={form.type}
                    onChange={(val) => setForm((f) => ({ ...f, type: val }))}
                  />
                </div>
              </div>

              {form.client_name.trim() !== '' && <IdentityHint form={form} />}

              <div className="cn-field">
                <span className="cn-label">Board kind</span>
                <div className="cn-types">
                  <button
                    type="button"
                    className={`cn-type${boardType === 'package' ? ' cn-type--on' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, board_type: 'package' }))}
                  >
                    Client package
                  </button>
                  <button
                    type="button"
                    className={`cn-type${boardType === 'division' ? ' cn-type--on' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, board_type: 'division' }))}
                  >
                    Division board
                  </button>
                </div>
              </div>

              <div className="cn-field">
                <label className="cn-label">The brief</label>
                <div className="cn-input-wrap cn-textarea-wrap">
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={set('description')}
                    placeholder="Describe the board focus, the look, and what reviewers should prioritize."
                  />
                </div>
              </div>

              <div className="cn-row cn-row--split">
                <div className="cn-field">
                  <label className="cn-label">Closes</label>
                  <div className="cn-input-wrap">
                    <input type="date" value={form.closes_at} onChange={set('closes_at')} />
                  </div>
                </div>
                <div className="cn-field">
                  <label className="cn-label">Target slots</label>
                  <div className="cn-input-wrap">
                    <input type="number" min="0" value={form.target_slots} onChange={set('target_slots')} placeholder="12" />
                  </div>
                </div>
              </div>

              <label className="cn-toggle">
                <input type="checkbox" checked={form.is_active} onChange={set('is_active')} />
                <span className="cn-toggle-box"><Check size={12} /></span>
                <span className="cn-toggle-text">Open this board for review immediately</span>
              </label>
            </div>


            <div className="cn-actions">
              <AgencyButton variant="secondary" onClick={onClose}>Cancel</AgencyButton>
              <AgencyButton type="submit" loading={create.isPending}>
                Create board
              </AgencyButton>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
