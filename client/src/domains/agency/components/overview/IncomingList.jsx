import React from 'react';
import { Link } from 'react-router-dom';

export default function IncomingList({ applicants, onSelect }) {
  return (
    <section className="ov-module">
      <div className="ov-module-head">
        <h2 className="ov-module-title">Incoming</h2>
        <Link to="/dashboard/agency/applicants" className="ov-module-link">View all</Link>
      </div>
      {applicants.length === 0 ? (
        <div className="ov-empty">No new applicants.</div>
      ) : (
        applicants.map((a) => (
          <button key={a.id} className="ov-incoming-row" onClick={() => onSelect(a)}>
            <span className="ov-incoming-pic" style={{ backgroundImage: a.photo ? `url(${a.photo})` : 'none' }} />
            <span style={{ minWidth: 0, textAlign: 'left' }}>
              <span className="ov-incoming-name">{a.name}</span>
              <span className="ov-incoming-meta">{a.typeLabel}{a.city ? ` · ${a.city}` : ''}</span>
            </span>
            <span className="ov-incoming-match">{a.match}</span>
          </button>
        ))
      )}
    </section>
  );
}
