import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion';

function Counter({ value }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  const [d, setD] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const c = animate(mv, value, { duration: reduce ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] });
    const u = rounded.on('change', setD);
    return () => { c.stop(); u(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);
  return <span>{d}</span>;
}

export default function PipelineCommandHero({ pendingReview, oldestDaysAgo, heroImage, onReview, onNewCasting }) {
  return (
    <motion.section className="ov-hero" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .5, ease: [0.16, 1, 0.3, 1] }}>
      <div className="ag-grain" style={{ opacity: .07, zIndex: 3 }} />
      <div className="ov-hero-panel">
        <div className="ov-hero-label">Pipeline Command</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div className="ov-hero-number"><Counter value={pendingReview} /></div>
          <div className="ov-hero-sub">
            applicants awaiting<br />your decision
            {oldestDaysAgo != null && oldestDaysAgo > 0 ? ` · oldest ${oldestDaysAgo}d` : ''}
          </div>
        </div>
        <div className="ov-hero-cta-row">
          <button className="ov-cta-gold" onClick={onReview}>Open review queue</button>
          <button className="ov-cta-ghost" onClick={onNewCasting}>New casting</button>
        </div>
      </div>
      <div className="ov-hero-imgwrap">
        <div className="ov-hero-scrim" />
        {heroImage && <img className="ov-hero-img" src={heroImage} alt="" />}
      </div>
    </motion.section>
  );
}
