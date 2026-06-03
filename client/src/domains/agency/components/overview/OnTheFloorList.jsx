import React from 'react';
import { Link } from 'react-router-dom';

export default function OnTheFloorList({ alerts }) {
  return (
    <div className="ov-floor">
      <div className="ov-rc-head"><span className="ov-rc-title">On the floor</span></div>
      {alerts.length === 0 && <div className="ov-empty">Nothing needs you right now.</div>}
      {alerts.map((al, i) => {
        const body = (
          <>
            <span className="ov-floor-mark" aria-hidden="true">•</span>
            <span>{al.text || al.message}</span>
          </>
        );
        return al.to
          ? <Link key={i} to={al.to} className="ov-floor-row">{body}</Link>
          : <div key={i} className="ov-floor-row">{body}</div>;
      })}
    </div>
  );
}
