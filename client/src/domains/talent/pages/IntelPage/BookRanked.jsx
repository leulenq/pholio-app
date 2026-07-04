import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { clamp01 } from './intelUtils';

const FLAG_LABEL = {
  most_opened: 'your most-opened frame',
  most_skipped: 'most-skipped',
  on_screen_at_pull: 'on screen when cards were pulled',
  lead: 'holds visitors longest',
};

function flagCaption(flag) {
  if (typeof flag !== 'string') return '';
  return FLAG_LABEL[flag] ?? flag.replace(/_/g, ' ');
}

/**
 * Zone 5 — The Book, Ranked. The photography IS the chart. Each frame carries a
 * quiet data layer: rank numeral, a dwell underline, and plain-text flags —
 * never a chip overlaid on the corner.
 */
export default function BookRanked({ book }) {
  const reduce = useReducedMotion();
  const images = Array.isArray(book?.images) ? book.images : [];
  const calibrating = Boolean(book?.calibrating);

  if (images.length === 0) {
    return (
      <p className="intel2-book-empty">
        Your book is empty here. Add frames in The Book and this instrument starts ranking them by
        the attention they earn.
      </p>
    );
  }

  return (
    <div className="intel2-book">
      {calibrating && (
        <p className="intel2-book-caption">
          The book is listening. Ranks appear once visitors start opening frames — nothing here is guessed.
        </p>
      )}
      <div className="intel2-book-grid">
        {images.map((img, i) => (
          <motion.figure
            key={img.id}
            className="intel2-book-frame"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5, delay: reduce ? 0 : Math.min(0.4, i * 0.05) }}
          >
            <div className="intel2-book-photo-wrap">
              <img src={img.url} alt={img.label || 'Portfolio frame'} className="intel2-book-photo" loading="lazy" />
            </div>
            <figcaption className="intel2-book-meta">
              <div className="intel2-book-rankline">
                {!calibrating && img.rank != null ? (
                  <span className="intel2-book-rank">#{img.rank}</span>
                ) : (
                  <span className="intel2-book-rank intel2-book-rank--muted">—</span>
                )}
                {img.isPrimary ? <span className="intel2-book-front">card front</span> : null}
              </div>
              {!calibrating && (
                <div className="intel2-book-dwell" aria-hidden>
                  <span className="intel2-book-dwell-fill" style={{ width: `${clamp01(img.dwellShare) * 100}%` }} />
                </div>
              )}
              {!calibrating && Array.isArray(img.flags) && img.flags.length > 0 && (
                <span className="intel2-book-flag">{flagCaption(img.flags[0])}</span>
              )}
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </div>
  );
}
