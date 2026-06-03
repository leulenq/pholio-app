import React from 'react';
import { Link } from 'react-router-dom';

export default function IncomingList({ applicants, onSelect }) {
  return (
    <div className="ov-incoming">
      <div className="ov-rc-head">
        <span className="ov-rc-title">Incoming</span>
        <Link to="/dashboard/agency/applicants" className="ov-stat-label" style={{ color: 'var(--ag-gold)' }}>View all</Link>
      </div>
      {applicants.length === 0 && <div className="ov-empty">No new applicants.</div>}
      {applicants.map((a) => (
        <button key={a.id} className="ov-incoming-row" onClick={() => onSelect(a)}>
          <span className="ov-incoming-pic" style={{ backgroundImage: a.photo ? `url(${a.photo})` : 'none' }} />
          <span style={{ minWidth: 0, textAlign: 'left' }}>
            <span className="ov-incoming-name">{a.name}</span>
            <span className="ov-incoming-meta">{a.typeLabel}{a.city ? ` · ${a.city}` : ''}</span>
          </span>
          <span className="ov-incoming-match">{a.match}</span>
        </button>
      ))}
    </div>
  );
}
