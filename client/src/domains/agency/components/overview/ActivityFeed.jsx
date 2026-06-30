import React from 'react';

function timeAgo(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// activity_type → accent tone for the marker
const TONE = {
  status_change: 'gold',
  submitted: 'gold',
  booked: 'positive',
  accepted: 'positive',
  development: 'positive',
  declined: 'muted',
  note_added: 'muted',
};

export default function ActivityFeed({ items }) {
  return (
    <section className="ov-module">
      <div className="ov-module-head"><h2 className="ov-module-title">What changed</h2></div>
      {items.length === 0 ? (
        <div className="ov-empty">No recent activity.</div>
      ) : (
        <div className="ov-activity">
          {items.map((a) => (
            <div key={a.id} className="ov-act-row">
              {a.talentImage ? (
                <span className="ov-act-av" style={{ backgroundImage: `url(${a.talentImage})` }}>
                  <span className={`ov-act-pip ov-act-pip--${TONE[a.activity_type] || 'muted'}`} aria-hidden="true" />
                </span>
              ) : (
                <span className={`ov-act-dot ov-act-dot--${TONE[a.activity_type] || 'muted'}`} aria-hidden="true" />
              )}
              <div className="ov-act-body">
                <span className="ov-act-text">
                  {a.talentName && <strong>{a.talentName}</strong>} {a.description}
                </span>
                <span className="ov-act-meta">
                  {a.application_label}{a.application_label ? ' · ' : ''}{timeAgo(a.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
