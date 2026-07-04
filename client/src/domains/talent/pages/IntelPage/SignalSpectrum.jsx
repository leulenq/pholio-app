import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { TIER_INK, TIER_LABEL, SECTION_EASE } from './intelUtils';

/**
 * The Signal Spectrum — a single horizontal band showing the composition of
 * this period's attention across the five tiers. It replaces every invented
 * "score": the talent watches the mix shift toward tier 1–3 as materials
 * improve. Width is share of raw count (honest at small n); segments with zero
 * count collapse to a hairline tick so the tier stays legible.
 */
export default function SignalSpectrum({ spectrum }) {
  const reduce = useReducedMotion();
  const rows = Array.isArray(spectrum) ? spectrum : [];
  const total = rows.reduce((sum, r) => sum + (Number(r.count) || 0), 0);

  return (
    <div className="intel2-spectrum">
      <div className="intel2-spectrum-band" role="img" aria-label="Attention composition across the five signal tiers">
        {total === 0 ? (
          <div className="intel2-spectrum-empty" />
        ) : (
          rows.map((r) => {
            const count = Number(r.count) || 0;
            const share = count / total;
            const ink = TIER_INK[r.tier];
            if (count === 0) {
              return <span key={r.tier} className="intel2-spectrum-tick" aria-hidden style={{ background: ink }} />;
            }
            return (
              <motion.span
                key={r.tier}
                className="intel2-spectrum-seg"
                style={{ background: ink }}
                initial={reduce ? { flexGrow: share } : { flexGrow: 0 }}
                whileInView={{ flexGrow: share }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: reduce ? 0 : 0.9, ease: SECTION_EASE }}
              />
            );
          })
        )}
      </div>
      <div className="intel2-spectrum-legend">
        {rows.map((r) => (
          <span key={r.tier} className="intel2-spectrum-legend-item">
            <span className="intel2-spectrum-legend-dot" style={{ background: TIER_INK[r.tier] }} aria-hidden />
            {TIER_LABEL[r.key] ?? r.key}
            <span className="intel2-spectrum-legend-num">{Number(r.count) || 0}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
