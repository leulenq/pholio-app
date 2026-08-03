import React from 'react';
import { MetaLine, Moment } from '../meta';

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
                <span className="ov-act-av" style={{ backgroundImage: `url(${a.talentImage})` }} />
              ) : null}
              <div className="ov-act-body">
                <span className="ov-act-text">
                  {a.talentName && <strong>{a.talentName}</strong>} {a.description}
                </span>
                <MetaLine size="sm" className="ov-act-meta">
                  {a.application_label}
                  <Moment value={a.created_at} size="sm" />
                </MetaLine>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
