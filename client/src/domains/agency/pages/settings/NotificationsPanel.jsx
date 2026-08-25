import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { AgencyButton } from '../../components/ui/AgencyButton';
import { updateAgencySettings } from '../../api/agency';

// The two events Pholio persists today, in agency language.
const LIVE = [
  { id: 'notify_new_applications', label: 'New talent submissions', desc: 'When talent is scouted or applies to your board.' },
  { id: 'notify_status_changes', label: 'Pipeline movement', desc: 'When talent advances a stage — shortlisted, offered, represented.' },
];
/**
 * The review window governs auto-close: once a submission has gone this long
 * without a decision, Pholio closes it and tells the talent plainly. 0 turns it
 * off. The server validates 0-365 and resolves the default, so this control
 * only has to be honest about what each value means.
 */
const REVIEW_WINDOW_DEFAULT = 30;

const VIEWS = [
  { value: 'overview', label: 'Overview' },
  { value: 'applicants', label: 'Submissions' },
  { value: 'casting', label: 'Signing' },
];

export default function NotificationsPanel({ profile, canManage }) {
  const qc = useQueryClient();
  const initial = useMemo(() => ({
    notify_new_applications: profile?.notify_new_applications ?? true,
    notify_status_changes: profile?.notify_status_changes ?? true,
    default_view: VIEWS.some(({ value }) => value === profile?.default_view)
      ? profile.default_view
      : 'overview',
    application_review_window_days:
      profile?.application_review_window_days ?? REVIEW_WINDOW_DEFAULT,
  }), [profile]);
  const [form, setForm] = useState(initial);
  const ro = !canManage;

  const dirty =
    form.notify_new_applications !== initial.notify_new_applications ||
    form.notify_status_changes !== initial.notify_status_changes ||
    form.default_view !== initial.default_view ||
    Number(form.application_review_window_days) !==
      Number(initial.application_review_window_days);

  const save = useMutation({
    mutationFn: () =>
      updateAgencySettings({
        ...form,
        application_review_window_days: Number(form.application_review_window_days),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agency-profile'] }); toast.success('Preferences saved'); },
    onError: (e) => toast.error(e?.message || 'Could not save preferences'),
  });

  return (
    <>
      {ro && <div className="st-readonly"><Lock size={13} /> Read-only — ask a principal or agent to change this.</div>}

      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Board alerts</h3>
          <p className="st-fieldset-sub">What Pholio emails your desk about.</p>
        </div>
        <div className="st-toggles">
          {LIVE.map((t) => (
            <div className="st-toggle-row" key={t.id}>
              <div className="st-toggle-text">
                <span className="st-toggle-label">{t.label}</span>
                <span className="st-toggle-desc">{t.desc}</span>
              </div>
              <label className="st-switch">
                <input
                  type="checkbox"
                  checked={!!form[t.id]}
                  disabled={ro}
                  onChange={() => setForm((f) => ({ ...f, [t.id]: !f[t.id] }))}
                />
                <span className="st-switch-track" />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Default landing view</h3>
          <p className="st-fieldset-sub">Where the dashboard opens when you sign in.</p>
        </div>
        <div className="st-seg">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              className={`st-seg-btn${form.default_view === v.value ? ' st-seg-btn--on' : ''}`}
              disabled={ro}
              onClick={() => setForm((f) => ({ ...f, default_view: v.value }))}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Response window</h3>
          <p className="st-fieldset-sub">
            How long a submission waits for a decision before Pholio closes it and
            tells the talent. Nobody is left guessing, and your desk stops carrying
            submissions you have already moved past.
          </p>
        </div>
        <div className="st-window">
          <label className="st-window-field">
            <input
              type="number"
              min="0"
              max="365"
              step="1"
              className="st-window-input"
              aria-label="Review window in days"
              disabled={ro}
              value={form.application_review_window_days}
              onChange={(e) =>
                setForm((f) => ({ ...f, application_review_window_days: e.target.value }))
              }
            />
            <span className="st-window-unit">days</span>
          </label>
          <p className="st-window-note">
            {Number(form.application_review_window_days) === 0
              ? 'Auto-close is off. Submissions stay open until someone decides, and talent hear nothing in the meantime.'
              : `A submission with no decision after ${Number(form.application_review_window_days)} days closes itself, and the talent is told it was not taken forward.`}
          </p>
        </div>
      </div>

      {!ro && (
        <div className="st-panel-foot">
          {dirty && <span className="st-foot-note">You have unsaved changes</span>}
          <AgencyButton variant="primary" disabled={!dirty || save.isPending} loading={save.isPending} onClick={() => save.mutate()}>
            Save preferences
          </AgencyButton>
        </div>
      )}
    </>
  );
}
