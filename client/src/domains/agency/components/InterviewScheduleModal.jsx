import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Video, Phone, MapPin, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getApplicants, scheduleInterview } from '../api/agency';
import PholioCustomSelect from '../../../shared/components/ui/forms/PholioCustomSelect';

const TIME_OPTIONS = Array.from({ length: 48 }).map((_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  const ampm = h < 12 ? 'am' : 'pm';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const value = `${h.toString().padStart(2, '0')}:${m}`;
  const label = `${hour12}:${m} ${ampm}`;
  return { value, label };
});

const TYPES = [
  { value: 'video_call', label: 'Video', icon: Video },
  { value: 'phone_call', label: 'Phone', icon: Phone },
  { value: 'in_person', label: 'In person', icon: MapPin },
];
const DURATIONS = [15, 30, 45, 60];
const BLANK = {
  applicationId: '', date: '', time: '09:00', duration: 30, type: 'video_call',
  meeting_url: '', location: '', notes: '',
};

const fullName = (a) =>
  [a.first_name, a.last_name].filter(Boolean).join(' ') || a.talent_name || 'Talent';

export default function InterviewScheduleModal({ open, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(BLANK);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerFocused, setPickerFocused] = useState(false);

  // Reset on every close path so the next open starts fresh (no setState-in-effect).
  const handleClose = () => { setForm(BLANK); setPickerQuery(''); setPickerFocused(false); onClose(); };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: applicantsRaw } = useQuery({
    queryKey: ['agency-applicants', 'interview-picker'],
    queryFn: () => getApplicants({ sort: 'az' }),
    enabled: open,
    staleTime: 60000,
  });

  const applicants = useMemo(() => {
    const list = Array.isArray(applicantsRaw)
      ? applicantsRaw
      : (applicantsRaw?.profiles || applicantsRaw?.applications || applicantsRaw?.applicants || []);
    return list.filter((a) => a.application_id);
  }, [applicantsRaw]);

  const filtered = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return applicants;
    return applicants.filter((a) => fullName(a).toLowerCase().includes(q));
  }, [applicants, pickerQuery]);

  const selected = applicants.find((a) => a.application_id === form.applicationId) || null;

  const set = (key) => (e) => {
    const value = e?.target?.type === 'number' ? Number(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const create = useMutation({
    mutationFn: () => scheduleInterview(form.applicationId, {
      proposed_datetime: `${form.date}T${form.time}:00`,
      duration_minutes: form.duration,
      interview_type: form.type,
      meeting_url: form.type === 'video_call' ? (form.meeting_url.trim() || null) : null,
      location: form.type === 'in_person' ? (form.location.trim() || null) : null,
      notes: form.notes.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agency-interviews'] });
      toast.success('Interview scheduled');
      handleClose();
    },
    onError: (e) => toast.error(e?.message || 'Could not schedule the interview'),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.applicationId) { toast.error('Choose a talent to interview'); return; }
    if (!form.date) { toast.error('Pick a date'); return; }
    if (!form.time) { toast.error('Pick a time'); return; }
    create.mutate();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="iv-overlay"
          onClick={handleClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.form
            className="iv-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 230, damping: 24 }}
          >
            <div className="iv-modal-head">
              <div>
                <h2 className="iv-modal-title">Schedule a conversation</h2>
              </div>
              <button type="button" className="iv-modal-close" onClick={handleClose} aria-label="Close"><X size={17} /></button>
            </div>

            <div className="iv-modal-body">
              {/* Talent picker */}
              <div className="iv-field">
                <label className="iv-flabel">Talent <span className="iv-req">*</span></label>
                {applicants.length === 0 ? (
                  <p className="iv-picker-empty">
                    No submissions yet. Talent you move forward from Submissions can be interviewed here.
                  </p>
                ) : selected ? (
                  <div className="iv-picker-chosen">
                    <span className="iv-picker-name">{fullName(selected)}</span>
                    {selected.city && <span className="iv-picker-city">{selected.city}</span>}
                    <button type="button" className="iv-picker-change" onClick={() => setForm((f) => ({ ...f, applicationId: '' }))}>
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="iv-picker-wrapper">
                    <div className={`iv-picker-search${pickerFocused ? ' iv-picker-search--focused' : ''}`}>
                      <Search size={14} />
                      <input
                        className="iv-picker-input"
                        placeholder="Search talent…"
                        value={pickerQuery}
                        onChange={(e) => setPickerQuery(e.target.value)}
                        onFocus={() => setPickerFocused(true)}
                        onBlur={() => setPickerFocused(false)}
                      />
                    </div>
                    {pickerFocused && (
                      <div className="iv-picker-list" onMouseDown={(e) => e.preventDefault()}>
                        {filtered.slice(0, 40).map((a) => (
                          <button
                            type="button"
                            key={a.application_id}
                            className="iv-picker-opt"
                            onClick={() => {
                              setForm((f) => ({ ...f, applicationId: a.application_id }));
                              setPickerFocused(false);
                            }}
                          >
                            <span className="iv-picker-opt-name">{fullName(a)}</span>
                            {a.city && <span className="iv-picker-opt-city">{a.city}</span>}
                          </button>
                        ))}
                        {filtered.length === 0 && <span className="iv-picker-none">No match</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="iv-frow">
                <div className="iv-field">
                  <label className="iv-flabel">Date <span className="iv-req">*</span></label>
                  <input className="iv-finput iv-finput--date" type="date" value={form.date} onChange={set('date')} />
                </div>
                <div className="iv-field">
                  <label className="iv-flabel">Time <span className="iv-req">*</span></label>
                  <div className="iv-time-wrap">
                    <PholioCustomSelect
                      options={TIME_OPTIONS}
                      value={form.time}
                      onChange={(val) => setForm(f => ({ ...f, time: val }))}
                    />
                  </div>
                </div>
                <div className="iv-field iv-field--narrow">
                  <label className="iv-flabel">Duration</label>
                  <select className="iv-finput" value={form.duration} onChange={set('duration')}>
                    {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </div>
              </div>

              <div className="iv-field">
                <label className="iv-flabel">Format</label>
                <div className="iv-seg">
                  {TYPES.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        type="button"
                        key={t.value}
                        className={`iv-seg-btn${form.type === t.value ? ' iv-seg-btn--on' : ''}`}
                        onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                      >
                        <Icon size={14} /> {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {form.type === 'video_call' && (
                <div className="iv-field">
                  <label className="iv-flabel">Meeting link</label>
                  <input className="iv-finput" type="url" placeholder="https://meet.google.com/…" value={form.meeting_url} onChange={set('meeting_url')} />
                </div>
              )}
              {form.type === 'in_person' && (
                <div className="iv-field">
                  <label className="iv-flabel">Location</label>
                  <input className="iv-finput" placeholder="Studio address or room" value={form.location} onChange={set('location')} />
                </div>
              )}

              <div className="iv-field">
                <label className="iv-flabel">Notes</label>
                <textarea
                  className="iv-finput iv-ftextarea"
                  rows={2}
                  placeholder="Agenda, who's joining, what to prepare…"
                  value={form.notes}
                  onChange={set('notes')}
                />
              </div>
            </div>

            <div className="iv-modal-actions">
              <button type="button" className="iv-modal-cancel" onClick={handleClose}>Cancel</button>
              <button type="submit" className="iv-modal-submit" disabled={create.isPending}>
                {create.isPending ? 'Scheduling…' : 'Schedule interview'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
