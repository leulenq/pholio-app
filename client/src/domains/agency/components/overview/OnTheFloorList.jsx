import React from 'react';
import { Link } from 'react-router-dom';

const MARK_TONE = {
  critical: '#c0563f',
  warning: 'var(--ag-gold)',
  positive: '#7d9b82',
};

export default function OnTheFloorList({ alerts }) {
  return (
    <div className="ov-floor">
      <div className="ov-rc-head"><span className="ov-rc-title">On the floor</span></div>
      {alerts.length === 0 && <div className="ov-empty">Nothing needs you right now.</div>}
      {alerts.map((al, i) => {
        const to = al.to || al.link;
        const tone = MARK_TONE[al.type] || 'var(--ag-gold)';
        const body = (
          <>
            <span className="ov-floor-mark" aria-hidden="true" style={{ color: tone }}>•</span>
            <span>{al.text || al.message}</span>
          </>
        );
        const key = al.id ?? `${al.type || 'alert'}-${i}`;
        return to
          ? <Link key={key} to={to} className="ov-floor-row">{body}</Link>
          : <div key={key} className="ov-floor-row">{body}</div>;
      })}
    </div>
  );
}
