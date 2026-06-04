import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Check } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { talentApi } from '../api/talent';
import { TALENT_NOTIFICATIONS_QUERY_KEY } from '../../../shared/components/NotificationCenter/NotificationCenter';
import { toast } from 'sonner';
import './ApplyModal.css';

const PACKAGES = [
  {
    id: 'full',
    label: 'Full Profile',
    desc: 'Portfolio, bio, stats & contact links',
    payload: { readiness: 'full' },
  },
  {
    id: 'portfolio',
    label: 'Portfolio Focus',
    desc: 'Photos and measurements only',
    payload: { readiness: 'portfolio' },
  },
];

const NOTE_MAX = 240;

export default function ApplyModal({ agency, onClose }) {
  const queryClient = useQueryClient();
  const [pkg, setPkg] = useState('full');
  const [note, setNote] = useState('');
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: talentApi.createApplication,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: TALENT_NOTIFICATIONS_QUERY_KEY });
      toast.success(`Application to ${agency.name} submitted`);
      onClose();
    },
    onError: (err) => {
      if (err.data?.upgradeRequired) {
        toast.error('Monthly limit reached. Upgrade to Studio+ for more applications.');
        return;
      }
      toast.error(err?.message || 'Failed to submit application');
    },
  });

  const handleSubmit = () => {
    const selected = PACKAGES.find(p => p.id === pkg);
    mutation.mutate({
      agencyId: agency.id,
      note: note.trim() || undefined,
      submissionPackage: { ...selected.payload, consentConfirmed: true },
    });
  };

  const isPending = mutation.isPending;

  return (
    <div
      className="apm-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="apm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Apply to ${agency.name}`}
      >
        {/* Header row */}
        <div className="apm-header">
          <span className="apm-kicker">Application</span>
          <button
            ref={closeRef}
            className="apm-close"
            onClick={onClose}
            aria-label="Close"
            disabled={isPending}
          >
            <X size={15} />
          </button>
        </div>

        {/* Step 1 — Confirm agency */}
        <div className="apm-agency">
          <div className="apm-agency-avatar">
            {agency.profile_image
              ? <img src={agency.profile_image} alt={agency.name} />
              : <span className="apm-agency-initial">{agency.name?.[0] ?? 'A'}</span>}
          </div>
          <div className="apm-agency-info">
            <span className="apm-agency-name">{agency.name}</span>
            {agency.agency_location && (
              <span className="apm-agency-loc">
                <MapPin size={11} aria-hidden />
                {agency.agency_location}
              </span>
            )}
          </div>
        </div>

        {/* Step 2 — Choose package */}
        <fieldset className="apm-packages">
          <legend className="apm-label">Package</legend>
          {PACKAGES.map(p => (
            <label
              key={p.id}
              className={`apm-pkg${pkg === p.id ? ' apm-pkg--on' : ''}`}
            >
              <input
                type="radio"
                name="apm-package"
                value={p.id}
                checked={pkg === p.id}
                onChange={() => setPkg(p.id)}
                className="apm-pkg-radio"
              />
              <span className="apm-pkg-dot">
                {pkg === p.id && <Check size={9} strokeWidth={3.5} />}
              </span>
              <span className="apm-pkg-body">
                <span className="apm-pkg-name">{p.label}</span>
                <span className="apm-pkg-desc">{p.desc}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {/* Step 3 — Note */}
        <div className="apm-note-wrap">
          <div className="apm-label-row">
            <label className="apm-label" htmlFor="apm-note">Note</label>
            <span className="apm-optional">optional</span>
          </div>
          <textarea
            id="apm-note"
            className="apm-note"
            placeholder="Introduce yourself or mention why you're a good fit…"
            value={note}
            onChange={e => setNote(e.target.value.slice(0, NOTE_MAX))}
            rows={3}
            disabled={isPending}
          />
          <span className="apm-note-count">{note.length} / {NOTE_MAX}</span>
        </div>

        {/* Step 4 — Submit */}
        <div className="apm-footer">
          <button
            className="apm-cancel"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            className="apm-submit"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending
              ? <><span className="apm-spinner" aria-hidden />Submitting…</>
              : 'Submit Application'}
          </button>
        </div>
      </div>
    </div>
  );
}
