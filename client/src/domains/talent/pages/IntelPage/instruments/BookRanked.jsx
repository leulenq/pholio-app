import React, { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useReveal } from './useReveal';
import { Link } from 'react-router-dom';
import { Calibrating } from './parts';
import { SPRING } from './metrics';
import './BookRanked.css';

/**
 * Zone 5 — The Book, Ranked. The most talent-native visualization possible:
 * the photography IS the chart. The talent's own frames laid out as a grid,
 * each carrying a quiet data layer (rank, dwell bar, attribution flags) below
 * the image rather than as corner chips. Image-First Rule: the photography
 * stays the brightest thing on screen; the data layer is deliberately quiet.
 */

const FLAG_COPY = {
  most_opened: 'Most opened',
  most_skipped: 'Most skipped',
};

function Frame({ image, index, inView, reduce, ranked }) {
  const showRank = ranked && image.rank != null;
  const isLead = ranked && image.rank === 1;

  return (
    <motion.figure
      className={`book-frame${isLead ? ' book-frame--lead' : ''}`}
      initial={reduce ? false : { opacity: 0, y: 16, scale: 0.97 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={{ ...SPRING, delay: reduce ? 0 : Math.min(index, 10) * 0.045 }}
      whileHover={reduce ? undefined : { y: -4, scale: 1.012 }}
    >
      <div className="book-frame__photo">
        <img src={image.url} alt={image.label || 'Book frame'} loading="lazy" />
        {image.isPrimary ? <span className="book-frame__cover">Cover</span> : null}
        {showRank ? <span className="book-frame__rank">#{image.rank}</span> : null}
      </div>
      <figcaption className="book-frame__data">
        {image.label ? <p className="book-frame__label">{image.label}</p> : null}
        {ranked ? (
          <>
            <div className="book-frame__dwelltrack" aria-hidden>
              <motion.div
                className="book-frame__dwellfill"
                initial={reduce ? false : { width: '0%' }}
                animate={inView ? { width: `${Math.round((image.dwellShare || 0) * 100)}%` } : undefined}
                transition={{ ...SPRING, delay: reduce ? 0 : Math.min(index, 10) * 0.045 + 0.08 }}
              />
            </div>
            {image.flags && image.flags.length > 0 ? (
              <ul className="book-frame__flags">
                {image.flags.map((flag) => (
                  <li key={flag} className={`book-frame__flag book-frame__flag--${flag.replace(/_/g, '-')}`}>
                    {FLAG_COPY[flag] || flag}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </figcaption>
    </motion.figure>
  );
}

function BookGrid({ images, ranked, inView, reduce }) {
  const ordered = ranked
    ? [...images].sort((a, b) => {
        const ar = a.rank == null ? Infinity : a.rank;
        const br = b.rank == null ? Infinity : b.rank;
        return ar - br;
      })
    : images;

  return (
    <div className="book-grid">
      {ordered.map((image, i) => (
        <Frame key={image.id} image={image} index={i} inView={inView} reduce={reduce} ranked={ranked} />
      ))}
    </div>
  );
}

function leadCopy(book) {
  const top = (book.images || []).find((img) => img.rank === 1 && (img.opens || 0) > 0);
  if (top) {
    return 'Your strongest frame is pulling the most attention — consider leading your book and card with it.';
  }
  return 'These are the frames doing the work. The one that holds a first-time visitor longest belongs on the front of your comp card.';
}

export default function BookRanked({ book }) {
  const ref = useRef(null);
  const inView = useReveal();
  const reduce = useReducedMotion();
  const images = book?.images || [];
  const calibrating = !!book?.calibrating;

  if (images.length === 0) {
    return (
      <div className="book" ref={ref}>
        <p className="book-empty">
          No frames yet.{' '}
          <Link to="/dashboard/talent/media" className="book-empty__link">
            Add frames to your book
          </Link>{' '}
          to start seeing which ones hold attention.
        </p>
      </div>
    );
  }

  return (
    <div className="book" ref={ref}>
      {calibrating ? (
        <Calibrating
          title="The Book is calibrating."
          listening="Once your frames start being viewed and opened, this ranks them by the attention they hold — and tells you which belongs on your card front."
        />
      ) : (
        <p className="book-lede">{leadCopy(book)}</p>
      )}

      <BookGrid images={images} ranked={!calibrating} inView={inView} reduce={reduce} />

      <p className="book-forward">
        <Link to="/dashboard/talent/media" className="book-forward__link">
          Build your comp card from your strongest frames
        </Link>
      </p>
    </div>
  );
}
