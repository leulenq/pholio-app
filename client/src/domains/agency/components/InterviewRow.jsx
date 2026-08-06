import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  MoreHorizontal, Calendar, Link2, Check, X,
  ArrowUpRight, MessageSquare, RotateCcw, MapPin,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { updateInterview, cancelInterview } from '../api/agency';
import { deriveInterviewState, TYPE_META, monogram, formatWhen } from './interview-state';
import { MetaLine, Place } from './meta';
import { AgencyButton } from './ui';

export default function InterviewRow({ interview, index = 0 }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const state = deriveInterviewState(interview);
  const type = TYPE_META[interview.interview_type] || TYPE_META.video_call;
  const TypeIcon = type.icon;

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(null); // 'reschedule' | 'addlink' | null
  const [draftWhen, setDraftWhen] = useState(
    interview.proposed_datetime ? String(interview.proposed_datetime).substring(0, 16) : '',
  );
  const [draftLink, setDraftLink] = useState(interview.meeting_url || '');
  const linkRef = useRef(null);

  useEffect(() => {
    if (editing === 'addlink') linkRef.current?.focus();
  }, [editing]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['agency-interviews'] });

  const patch = useMutation({
    mutationFn: (updates) => updateInterview(interview.id, updates),
    onError: (e) => toast.error(e?.message || 'Could not update the interview'),
  });

  const cancel = useMutation({
    mutationFn: () => cancelInterview(interview.id),
    onSuccess: () => { toast.success('Interview cancelled'); refresh(); },
    onError: (e) => toast.error(e?.message || 'Could not cancel the interview'),
  });

  const closeAll = () => { setMenuOpen(false); setEditing(null); };

  const saveReschedule = () => {
    if (!draftWhen) { toast.error('Pick a new date and time'); return; }
    patch.mutate({ proposed_datetime: draftWhen, status: 'pending' }, {
      onSuccess: () => { toast.success('Interview rescheduled'); refresh(); setEditing(null); },
    });
  };
  const saveLink = () => {
    patch.mutate({ meeting_url: draftLink.trim() || null }, {
      onSuccess: () => { toast.success('Meeting link saved'); refresh(); setEditing(null); },
    });
  };
  const markComplete = () => {
    setMenuOpen(false);
    patch.mutate({ status: 'completed' }, {
      onSuccess: () => { toast.success('Marked completed'); refresh(); },
    });
  };
  const doCancel = () => {
    setMenuOpen(false);
    if (window.confirm('Cancel this interview? The talent will be notified.')) cancel.mutate();
  };

  const busy = patch.isPending || cancel.isPending;
  const closed = state.bucket === 'completed' || state.bucket === 'cancelled';

  /* Primary contextual action — plain element, not a nested component. */
  let primaryAction = null;
  if (state.primary === 'join') {
    primaryAction = (
      <a className="iv-act iv-act--join" href={interview.meeting_url} target="_blank" rel="noopener noreferrer">
        Join <ArrowUpRight size={13} />
      </a>
    );
  } else if (state.primary === 'reschedule') {
    primaryAction = <AgencyButton size="sm" onClick={() => setEditing('reschedule')}>Reschedule</AgencyButton>;
  } else if (state.primary === 'addlink') {
    primaryAction = <AgencyButton size="sm" onClick={() => setEditing('addlink')}>Add link</AgencyButton>;
  } else if (state.primary === 'complete') {
    primaryAction = <AgencyButton size="sm" onClick={markComplete} loading={patch.isPending}>Mark complete</AgencyButton>;
  }

  return (
    <motion.div
      className="iv-row"
      data-tone={state.tone}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1], delay: Math.min(index * 0.035, 0.3) }}
    >
      <span className="iv-mono">{monogram(interview.talent_name)}</span>

      <div className="iv-id">
        <div className="iv-id-top">
          <span className="iv-name">{interview.talent_name || 'Talent'}</span>
          {state.reason && <span className="iv-reason">{state.reason}</span>}
        </div>
        <MetaLine className="iv-meta" size="sm">
          <span className="iv-meta-item"><TypeIcon size={12} />{type.label}</span>
          <span className="iv-meta-item"><Calendar size={12} />{formatWhen(interview.proposed_datetime)}</span>
          {interview.duration_minutes ? (
            <span className="iv-meta-item">{interview.duration_minutes} min</span>
          ) : null}
          {/* An interview address is one of the few places the region
              genuinely matters — a booker is deciding about travel. */}
          {interview.location && state.bucket !== 'action' ? (
            <Place value={interview.location} full size="sm" icon={<MapPin size={12} />} />
          ) : null}
        </MetaLine>
      </div>

      <div className="iv-actions">
        {primaryAction}
        <div className="iv-menu-wrap">
          <button className="iv-kebab" onClick={() => setMenuOpen((v) => !v)} aria-label="More actions" disabled={busy}>
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="iv-menu-scrim" onClick={closeAll} />
              <div className="iv-menu" role="menu">
                {!closed && (
                  <>
                    <button className="iv-menu-item" onClick={() => { setMenuOpen(false); setEditing('reschedule'); }}>
                      <RotateCcw size={14} /> Reschedule
                    </button>
                    <button className="iv-menu-item" onClick={() => { setMenuOpen(false); setEditing('addlink'); }}>
                      <Link2 size={14} /> {interview.meeting_url ? 'Edit link' : 'Add link'}
                    </button>
                    <button className="iv-menu-item" onClick={markComplete}>
                      <Check size={14} /> Mark complete
                    </button>
                  </>
                )}
                <button className="iv-menu-item" onClick={() => { setMenuOpen(false); navigate('/dashboard/agency/messages'); }}>
                  <MessageSquare size={14} /> Message talent
                </button>
                {!closed && (
                  <button className="iv-menu-item iv-menu-item--danger" onClick={doCancel}>
                    <X size={14} /> Cancel interview
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Inline editors */}
      {editing === 'reschedule' && (
        <div className="iv-edit">
          <label className="iv-edit-label">New date &amp; time</label>
          <div className="iv-edit-row">
            <input
              type="datetime-local"
              className="iv-edit-input"
              value={draftWhen}
              onChange={(e) => setDraftWhen(e.target.value)}
            />
            <button className="iv-edit-save" onClick={saveReschedule} disabled={patch.isPending}>
              {patch.isPending ? 'Saving…' : 'Save'}
            </button>
            <button className="iv-edit-cancel" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
      {editing === 'addlink' && (
        <div className="iv-edit">
          <label className="iv-edit-label">Meeting link</label>
          <div className="iv-edit-row">
            <input
              ref={linkRef}
              type="url"
              className="iv-edit-input"
              placeholder="https://meet.google.com/…"
              value={draftLink}
              onChange={(e) => setDraftLink(e.target.value)}
            />
            <button className="iv-edit-save" onClick={saveLink} disabled={patch.isPending}>
              {patch.isPending ? 'Saving…' : 'Save'}
            </button>
            <button className="iv-edit-cancel" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
