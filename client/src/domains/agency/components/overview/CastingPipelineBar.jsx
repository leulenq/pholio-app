import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function CastingPipelineBar({ stages, total }) {
  const [hover, setHover] = useState(null);
  if (!stages.length) return <div className="ov-empty">No pipeline activity yet.</div>;
  return (
    <div className="ov-pipeline">
      <div className="ov-pipeline-head">
        <span className="ov-stat-label" style={{ color: '#16130D', letterSpacing: '.16em' }}>Casting Pipeline</span>
        <span className="ov-stat-label">{total} in flight</span>
      </div>
      <div className="ov-pipeline-bar">
        {stages.map((s, i) => (
          <motion.div key={s.label} className="ov-pipeline-seg" style={{ background: s.color }}
            initial={{ width: 0 }} animate={{ width: `${s.pct}%` }}
            transition={{ duration: .7, delay: .1 + i * .08, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={() => setHover(s.label)} onMouseLeave={() => setHover(null)}
            title={`${s.label}: ${s.count}`} />
        ))}
      </div>
      <div className="ov-pipeline-legend">
        {stages.map((s) => (
          <span key={s.label} className="ov-stat-label" style={{ opacity: hover && hover !== s.label ? .4 : 1 }}>
            {s.label} · {s.count}
          </span>
        ))}
      </div>
    </div>
  );
}
