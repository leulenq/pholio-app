import React from 'react';
import { Mail, Phone, ArrowUpRight } from 'lucide-react';

function submittedDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function SubmissionPackageDetails({ submissionPackage, compact = false }) {
  if (!submissionPackage) return null;

  const boards = Array.isArray(submissionPackage.boards)
    ? submissionPackage.boards.filter(Boolean)
    : [];
  const contact = submissionPackage.contact || {};
  const compCard = submissionPackage.compCard || null;
  const mediaSetName = submissionPackage.mediaSet?.name || null;
  const submittedProfile = submissionPackage.profile || {};
  const languages = Array.isArray(submittedProfile.languages)
    ? submittedProfile.languages.filter(Boolean)
    : [];
  const sentOn = submittedDate(submissionPackage.submittedAt);

  return (
    <div className={`submission-package${compact ? ' submission-package--compact' : ''}`}>
      <dl className="submission-package__facts">
        {sentOn && (
          <div>
            <dt>Sent</dt>
            <dd>{sentOn}</dd>
          </div>
        )}
        <div>
          <dt>Submitted for</dt>
          <dd>{boards.length ? boards.join(' · ') : 'General consideration'}</dd>
        </div>
        {mediaSetName && (
          <div>
            <dt>Book selection</dt>
            <dd>{mediaSetName}</dd>
          </div>
        )}
        <div>
          <dt>Frames</dt>
          <dd>{submissionPackage.images?.length || 0}</dd>
        </div>
        {submittedProfile.nationality && (
          <div>
            <dt>Nationality</dt>
            <dd>{submittedProfile.nationality}</dd>
          </div>
        )}
        {languages.length > 0 && (
          <div>
            <dt>Languages</dt>
            <dd>{languages.join(' · ')}</dd>
          </div>
        )}
      </dl>

      {compCard?.viewUrl && (
        <div className="submission-package__comp-card">
          <div
            className="submission-package__card-preview"
          >
            <iframe
              src={compCard.viewUrl}
              title={`${compCard.name || 'Submitted comp card'} preview`}
              scrolling="no"
              tabIndex={-1}
            />
          </div>
          <div className="submission-package__card-copy">
            <span className="submission-package__card-label">Comp card sent</span>
            <a href={compCard.viewUrl} target="_blank" rel="noreferrer">
              {compCard.name || 'Comp card'}
              <ArrowUpRight size={13} aria-hidden />
            </a>
          </div>
        </div>
      )}

      {(contact.email || contact.phone) && (
        <div className="submission-package__contact">
          <span className="submission-package__contact-label">Submitted contact</span>
          {contact.email && (
            <a href={`mailto:${contact.email}`}>
              <Mail size={13} aria-hidden />
              {contact.email}
            </a>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`}>
              <Phone size={13} aria-hidden />
              {contact.phone}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
