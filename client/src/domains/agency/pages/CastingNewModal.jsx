import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { createBoard } from '../api/agency';

const TYPES = ['Campaign', 'Editorial', 'Runway', 'Lookbook', 'Commercial', 'E-commerce'];
const BLANK = { name: '', client_name: '', type: 'Campaign', description: '', closes_at: '', target_slots: '', is_active: true };

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

  const create = useMutation({
    mutationFn: () => createBoard({
      name: form.name.trim(),
      client_name: form.client_name.trim() || null,
      description: form.description.trim() || null,
      closes_at: form.closes_at || null,
      target_slots: form.target_slots || null,
      is_active: form.is_active,
    }),
    onSuccess: (board) => {
      qc.invalidateQueries({ queryKey: ['agency-boards'] });
      toast.success('Casting board created');
      onClose();
      if (board?.id) navigate(`/dashboard/agency/casting/${board.id}`);
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
                <h2 className="cn-modal-title">Open a casting</h2>
              </div>
              <button type="button" className="cn-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
            </div>

            <div className="cn-modal-body">
              <div className="cn-field">
                <label className="cn-label">Board name <span className="cn-req">*</span></label>
                <input className="cn-input" value={form.name} onChange={set('name')} placeholder="SS26 Campaign" autoFocus />
              </div>

              <div className="cn-row">
                <div className="cn-field">
                  <label className="cn-label">Client</label>
                  <input className="cn-input" value={form.client_name} onChange={set('client_name')} placeholder="Prada" />
                </div>
                <div className="cn-field">
                  <label className="cn-label">Type</label>
                  <select className="cn-input" value={form.type} onChange={set('type')}>
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="cn-field">
                <label className="cn-label">The brief</label>
                <textarea
                  className="cn-input cn-textarea"
                  rows={3}
                  value={form.description}
                  onChange={set('description')}
                  style={{ resize: 'none' }}
                  placeholder="What you're casting for — the look, the energy, the references."
                />
              </div>

              <div className="cn-row">
                <div className="cn-field">
                  <label className="cn-label">Closes</label>
                  <input className="cn-input" type="date" value={form.closes_at} onChange={set('closes_at')} />
                </div>
                <div className="cn-field">
                  <label className="cn-label">Target slots</label>
                  <input className="cn-input" type="number" min="0" value={form.target_slots} onChange={set('target_slots')} placeholder="12" />
                </div>
              </div>

              <label className="cn-toggle">
                <input type="checkbox" checked={form.is_active} onChange={set('is_active')} />
                <span className="cn-toggle-box"><Check size={12} /></span>
                <span className="cn-toggle-text">Open this board for review immediately</span>
              </label>
            </div>

            <div className="cn-actions">
              <button type="button" className="cn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="cn-submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create board'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
