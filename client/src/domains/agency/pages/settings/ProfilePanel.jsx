import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { AgencyButton } from '../../components/ui/AgencyButton';
import AgencySocialSection from '../../components/settings/AgencySocialSection';
import { AGENCY_SOCIAL_FIELDS } from '../../components/settings/agency-social-fields';
import { updateAgencyProfile } from '../../api/agency';
import { normalizeAgencySocialFields } from '../../../../shared/lib/normalize-social-field';

const BASE_FIELDS = ['first_name', 'last_name', 'agency_name', 'agency_location', 'agency_description'];
const FIELDS = [...BASE_FIELDS, ...AGENCY_SOCIAL_FIELDS];

export default function ProfilePanel({ profile, canManage }) {
  const qc = useQueryClient();
  const initial = useMemo(
    () => FIELDS.reduce((acc, k) => ({ ...acc, [k]: profile?.[k] || '' }), {}),
    [profile],
  );
  const [form, setForm] = useState(initial);

  const dirty = FIELDS.some((k) => (form[k] || '') !== (initial[k] || ''));

  const save = useMutation({
    mutationFn: () => {
      const payload = normalizeAgencySocialFields(
        FIELDS.reduce((acc, k) => ({ ...acc, [k]: form[k] || null }), {}),
      );
      return updateAgencyProfile(payload).then(() => payload);
    },
    onSuccess: (payload) => {
      qc.invalidateQueries({ queryKey: ['agency-profile'] });
      setForm(FIELDS.reduce((acc, k) => ({ ...acc, [k]: payload[k] || '' }), {}));
      toast.success('Profile updated');
    },
    onError: (e) => toast.error(e?.message || 'Could not update the profile'),
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSocial = (k, v) => setForm((f) => ({ ...f, [k]: v ?? '' }));
  const ro = !canManage;

  return (
    <>
      {ro && <div className="st-readonly"><Lock size={13} /> Read-only — ask a principal or agent to change this.</div>}

      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Principal</h3>
          <p className="st-fieldset-sub">The person on this account.</p>
        </div>
        <div className="st-grid-2">
          <label className="st-field">
            <span className="st-label">First name <i className="st-req">*</i></span>
            <input className="st-input" value={form.first_name} onChange={set('first_name')} placeholder="Sarah" disabled={ro} />
          </label>
          <label className="st-field">
            <span className="st-label">Last name</span>
            <input className="st-input" value={form.last_name} onChange={set('last_name')} placeholder="Chen" disabled={ro} />
          </label>
        </div>
      </div>

      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">The agency</h3>
          <p className="st-fieldset-sub">How your agency presents across Pholio.</p>
        </div>
        <label className="st-field">
          <span className="st-label">Agency name <i className="st-req">*</i></span>
          <input className="st-input" value={form.agency_name} onChange={set('agency_name')} placeholder="Sterling Model Management" disabled={ro} />
        </label>
        <label className="st-field">
          <span className="st-label">Location</span>
          <input className="st-input" value={form.agency_location} onChange={set('agency_location')} placeholder="New York, NY" disabled={ro} />
        </label>
        <label className="st-field">
          <span className="st-label">Description</span>
          <textarea className="st-input st-textarea" rows={3} value={form.agency_description} onChange={set('agency_description')} placeholder="Tell your story…" disabled={ro} />
          <span className="st-help">A brief editorial overview of your agency’s focus.</span>
        </label>
      </div>

      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Social presence</h3>
          <p className="st-fieldset-sub">Connect your house accounts and public links.</p>
        </div>
        <AgencySocialSection values={form} onChange={setSocial} disabled={ro} />
      </div>

      {!ro && (
        <div className="st-panel-foot">
          {dirty && <span className="st-foot-note">You have unsaved changes</span>}
          <AgencyButton variant="primary" disabled={!dirty || save.isPending} loading={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </AgencyButton>
        </div>
      )}
    </>
  );
}
