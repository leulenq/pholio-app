import React from 'react';
import { Link } from 'react-router-dom';

// Clickable triage tiles — "what needs attention" across all boards.
export default function AttentionStrip({ items }) {
  return (
    <div className="ov-attn">
      {items.map((it) => (
        <Link key={it.key} to={it.to} className={`ov-attn-tile ov-attn-tile--${it.tone}`}>
          <span className="ov-attn-n">{it.n}</span>
          <span className="ov-attn-label">{it.label}</span>
          {it.sub && <span className="ov-attn-sub">{it.sub}</span>}
        </Link>
      ))}
    </div>
  );
}
