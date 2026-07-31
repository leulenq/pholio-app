import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Figure } from './chartKit';
import { useMeasure } from './chartUtils';
import { EASE } from '../intelTheme';

const BAR_H = 26;
const GAP = 2; // surface gap between segments — never a stroke

/**
 * Part-to-whole across an ordered set, as one horizontal stacked bar.
 *
 * Used for submission outcomes (signed → withdrawn) and for the signal
 * composition (agency attention → passing reach). Both are ordinal, so the
 * segments run dark-to-light along the one validated ramp and the reader sees
 * the order in the colour. Segments are separated by a 2px surface gap rather
 * than a stroke, and every segment is also named in the legend beneath, so
 * identity never rests on colour alone.
 */
export default function StackedShare({ segments, caption }) {
  const reduce = useReducedMotion();
  const [ref, width, shown] = useMeasure();

  const rows = (Array.isArray(segments) ? segments : []).filter((s) => s.count > 0);
  const total = rows.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;

  return (
    <Figure
      caption={caption}
    >
      <div ref={ref} className="iv-stack">
        {width > 0 && (() => {
          let cursor = 0;
          return (
            <svg width={width} height={BAR_H} role="img" aria-label={caption || 'Share'}>
              {rows.map((seg, i) => {
                const segW = Math.max(3, (seg.count / total) * width - GAP);
                const x = cursor;
                cursor += segW + GAP;
                return (
                  <motion.rect
                    key={seg.key}
                    x={x} y={0} width={segW} height={BAR_H} rx="3"
                    fill={seg.ink}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={shown || reduce ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 0.5, delay: i * 0.06, ease: EASE }}
                  >
                    <title>{seg.label}: {seg.count}</title>
                  </motion.rect>
                );
              })}
            </svg>
          );
        })()}
        <ul className="iv-stack-legend">
          {rows.map((seg) => (
            <li key={seg.key}>
              <span className="iv-stack-key" style={{ background: seg.ink }} aria-hidden />
              <span className="iv-stack-label">{seg.label}</span>
              <span className="iv-stack-value">{seg.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </Figure>
  );
}
