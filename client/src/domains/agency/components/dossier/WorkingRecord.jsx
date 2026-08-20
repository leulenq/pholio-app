import React from 'react';
import { TalentThread } from '../talent/TalentThread';
import { Quiet } from './DossierPrimitives';
import { activityVerb, fmtAgo, fmtDateTime, titleCase } from './dossierModel';
import './dossier.css';

/**
 * The Record — what this agency has actually done about this talent, beside
 * the place to do the next thing.
 *
 * Left: the audit ledger. Every status move, note, tag, and message, dated,
 * so a booker picking this up cold can see who touched it and when.
 * Right: the working thread — conversation, notes, and follow-ups.
 */
function describe(entry) {
  const meta = entry.metadata || {};
  if (entry.activity_type === 'status_change' && (meta.old_status || meta.new_status)) {
    return `${titleCase(meta.old_status || 'submitted')} → ${titleCase(meta.new_status || '')}`.trim();
  }
  if (entry.activity_type?.startsWith('tag_') && (meta.tag || meta.tag_name)) {
    return meta.tag || meta.tag_name;
  }
  return entry.description || null;
}

export function ActivityLedger({ timeline = [] }) {
  if (timeline.length === 0) {
    return <Quiet>Nothing has happened on this submission yet.</Quiet>;
  }
  return (
    <ol className="dx-log">
      {timeline.map((entry) => (
        <li className="dx-log__row" key={entry.id}>
          <span className="dx-log__when" title={fmtDateTime(entry.created_at) || ''}>
            {fmtAgo(entry.created_at)}
          </span>
          <span className="dx-log__what">
            <span className="dx-log__verb">{activityVerb(entry.activity_type)}</span>
            {describe(entry) && <span className="dx-log__detail">{describe(entry)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function WorkingRecord({ applicationId, timeline, canMessage = true }) {
  return (
    <div className="dx-record">
      <div className="dx-record__log">
        <h3 className="dx-record__title">What we have done</h3>
        <ActivityLedger timeline={timeline} />
      </div>
      <div className="dx-record__work">
        <h3 className="dx-record__title">Working notes and conversation</h3>
        <TalentThread
          applicationId={applicationId}
          canMessage={canMessage}
          messagingDisabledReason="No Pholio account yet — this applicant can't be messaged directly."
        />
      </div>
    </div>
  );
}

export default WorkingRecord;
