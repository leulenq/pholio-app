import React from 'react';
import { Link } from 'react-router-dom';

// Horizontal media strip of talent (headshots + match) — content-backed, scrollable.
export default function TalentStrip({ title, talents, onSelect, viewAllTo }) {
  return (
    <section className="ov-module">
      <div className="ov-module-head">
        <h2 className="ov-module-title">{title}{talents.length ? <span className="ov-module-count">{talents.length}</span> : null}</h2>
        {viewAllTo && <Link to={viewAllTo} className="ov-module-link">View all</Link>}
      </div>
      {talents.length === 0 ? (
        <div className="ov-empty">No new applicants to preview.</div>
      ) : (
        <div className="ov-strip">
          {talents.map((t) => (
            <button key={t.id} className="ov-strip-card" onClick={() => onSelect(t)}>
              <span className="ov-strip-img" style={{ backgroundImage: t.photo ? `url(${t.photo})` : 'none' }}>
                {t.match ? <span className="ov-strip-match">{t.match}</span> : null}
              </span>
              <span className="ov-strip-name">{t.name}</span>
              <span className="ov-strip-meta">{t.typeLabel}{t.city ? ` · ${t.city}` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
