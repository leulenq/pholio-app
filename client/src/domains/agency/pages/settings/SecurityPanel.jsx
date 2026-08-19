import { Mail, KeyRound, AlertTriangle } from 'lucide-react';

export default function SecurityPanel({ profile, canManage }) {
  return (
    <>
      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Sign-in</h3>
          <p className="st-fieldset-sub">The email used to authenticate this account.</p>
        </div>
        <div className="st-readout">
          <Mail size={15} />
          <span>{profile?.email || '—'}</span>
        </div>
      </div>

      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Password &amp; access</h3>
          <p className="st-fieldset-sub">Account credentials are managed through Pholio.</p>
        </div>
        <div className="st-sec-row">
          <div className="st-sec-text">
            <span className="st-sec-label"><KeyRound size={14} /> Password</span>
            <span className="st-sec-desc">Reset your password from the Pholio sign-in screen, or contact support.</span>
          </div>
          <a className="st-textlink" href="mailto:support@pholio.studio?subject=Password%20help">Get help</a>
        </div>
      </div>

      {canManage && (
        <div className="st-fieldset st-fieldset--danger">
          <div className="st-fieldset-head">
            <h3 className="st-fieldset-title">Danger zone</h3>
            <p className="st-fieldset-sub">Irreversible, organization-wide actions.</p>
          </div>
          <div className="st-sec-row">
            <div className="st-sec-text">
              <span className="st-sec-label"><AlertTriangle size={14} /> Deactivate organization</span>
              <span className="st-sec-desc">Permanently removes the agency workspace, submissions, and all members. Handled by support to prevent mistakes.</span>
            </div>
            <a className="st-textlink st-textlink--danger" href="mailto:support@pholio.studio?subject=Deactivate%20agency">Request</a>
          </div>
        </div>
      )}
    </>
  );
}
