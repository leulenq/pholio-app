import React from 'react';

export default function StatLedger({ stats }) {
  // stats: [{ label, value, suffix?, delta?, deltaTone? }]
  return (
    <div className="ov-ledger">
      {stats.map((s) => (
        <div className="ov-stat" key={s.label}>
          <div className="ov-stat-label">{s.label}</div>
          <div className="ov-stat-num">{s.value}{s.suffix && <span className="ov-stat-suffix">{s.suffix}</span>}</div>
          {s.delta && <div className={`ov-stat-delta ov-stat-delta--${s.deltaTone || 'neutral'}`}>{s.delta}</div>}
        </div>
      ))}
    </div>
  );
}
