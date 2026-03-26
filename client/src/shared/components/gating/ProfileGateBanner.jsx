import { Link } from 'react-router-dom';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import './ProfileGateBanner.css';

function toSummaryText(missingFields = []) {
  if (!missingFields.length) return '';
  const first = missingFields.slice(0, 3).map((field) => field.label);
  if (missingFields.length <= 3) return first.join(', ');
  return `${first.join(', ')} +${missingFields.length - 3} more`;
}

function toGroupSummary(missingByGroup = {}) {
  return Object.entries(missingByGroup)
    .filter(([, fields]) => fields?.length)
    .map(([group, fields]) => `${group} (${fields.length})`);
}

export default function ProfileGateBanner({
  missingFields = [],
  missingByGroup = {},
  completionPercent = 0,
  completedCount = 0,
  totalRequired = 0
}) {
  const safeCompletion = Math.max(0, Math.min(100, Number(completionPercent) || 0));
  const ringStyle = { '--profile-gate-angle': `${safeCompletion * 3.6}deg` };
  const missingSummary = toSummaryText(missingFields);
  const groupSummary = toGroupSummary(missingByGroup);
  const priorityMissing = missingFields.slice(0, 4);

  return (
    <section className="profile-gate-banner" role="status" aria-live="polite" style={ringStyle}>
      <div className="profile-gate-banner__mesh" aria-hidden />
      <div className="profile-gate-banner__vignette" aria-hidden />
      <div className="profile-gate-banner__content">
        <div className="profile-gate-banner__identity">
          <div className="profile-gate-banner__status-chip">
            <Lock size={13} strokeWidth={2.4} />
            <span>Profile gate active</span>
          </div>
          <h2 className="profile-gate-banner__title">Elegant profiles unlock premium agency visibility</h2>
          <p className="profile-gate-banner__description">
            Your profile is <span>{safeCompletion}% complete</span>. Finish your required essentials to access
            Analytics, Applications, and full discoverability.
          </p>

          <div className="profile-gate-banner__chips" aria-label="Missing fields by category">
            {groupSummary.map((item) => (
              <span key={item} className="profile-gate-banner__chip">{item}</span>
            ))}
          </div>

          {priorityMissing.length > 0 && (
            <ul className="profile-gate-banner__missing-list" aria-label="Top missing required fields">
              {priorityMissing.map((field) => (
                <li key={field.key}>
                  <span className="profile-gate-banner__dot" aria-hidden />
                  {field.label}
                </li>
              ))}
            </ul>
          )}

          <p className="profile-gate-banner__summary">Missing now: {missingSummary}</p>
        </div>

        <div className="profile-gate-banner__glass-card">
          <div
            className="profile-gate-banner__radial-wrap"
            role="progressbar"
            aria-label="Profile completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={safeCompletion}
          >
            <div className="profile-gate-banner__radial-center">
              <strong>{safeCompletion}%</strong>
              <span>completed</span>
            </div>
          </div>

          <p className="profile-gate-banner__progress-copy">
            {completedCount} of {totalRequired} required fields complete
          </p>

          <Link to="/dashboard/talent/profile?gate=true" className="profile-gate-banner__cta">
            <Sparkles size={14} strokeWidth={2.2} />
            Complete profile now
            <ArrowRight size={14} strokeWidth={2.2} />
          </Link>
        </div>
      </div>
    </section>
  );
}
