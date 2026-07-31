import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Block, Finding, Emph, NotYet, Withheld } from '../Chrome';
import { Figure } from '../charts/chartKit';
import { RAMP, EASE, pct } from '../intelTheme';

const FLAG_TEXT = {
  most_opened: 'opened most',
  most_skipped: 'skipped most',
  unseen: 'barely shown',
};

function finding({ cardFront, best, images, ranked }) {
  if (!cardFront) {
    return (
      <Finding verdict="Unranked" tag="not enough views">
        no frame has been shown often enough to compare
      </Finding>
    );
  }
  const front = images.find((i) => i.id === cardFront.id);
  const top = images.find((i) => i.id === best?.id);

  if (cardFront.rank === 1) {
    return (
      <Finding verdict="Yes" tag="leading correctly" tone="good">
        your card front is also the most-opened frame, at <Emph>{pct(front?.openRate)}</Emph>
      </Finding>
    );
  }
  return (
    <Finding figure={`#${cardFront.rank}`} tag={`of ${ranked} ranked`} tone="warn">
      your card front opens at <Emph>{pct(front?.openRate)}</Emph> — your strongest frame
      opens at <Emph>{pct(top?.openRate)}</Emph>
    </Finding>
  );
}

/**
 * The photography is the chart; the data layer under each frame is an open
 * RATE, not a score. A rate is comparable between two frames and checkable
 * against the counts beside it.
 */
function Frame({ frame, index, max }) {
  const reduce = useReducedMotion();
  const rate = frame.openRate;
  const w = rate != null && max > 0 ? (rate / max) * 100 : 0;

  return (
    <motion.figure
      className={`iv-frame${frame.isPrimary ? ' is-front' : ''}`}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: reduce ? 0 : Math.min(0.3, index * 0.04), ease: EASE }}
    >
      <div className="iv-frame-photo">
        <img src={frame.url} alt={frame.label || 'Portfolio frame'} loading="lazy" />
        {frame.rank != null && <span className="iv-frame-rank">{frame.rank}</span>}
      </div>
      <figcaption className="iv-frame-meta">
        <span className="iv-frame-rate">
          {rate != null ? pct(rate) : '—'}
          <em>{rate != null ? 'opened' : 'not shown enough'}</em>
        </span>
        <span className="iv-frame-bar" aria-hidden>
          <span style={{ width: `${w}%`, background: frame.rank === 1 ? RAMP[4] : RAMP[1] }} />
        </span>
        <span className="iv-frame-sub">
          {frame.impressions} shown · {frame.opens} opened
          {frame.isPrimary ? ' · card front' : ''}
          {frame.flags?.length && FLAG_TEXT[frame.flags[0]] && !frame.isPrimary
            ? ` · ${FLAG_TEXT[frame.flags[0]]}`
            : ''}
        </span>
      </figcaption>
    </motion.figure>
  );
}

export default function BookBlock({ book, tier }) {
  const question = <>Am I leading with my <em>strongest</em> frame?</>;

  if (tier === 'free') {
    return (
      <Block id="iv-book" question={question}>
        <Withheld title="The book, ranked">
          Every frame ranked by the share of viewers who opened it — the evidence for choosing
          your card front.
        </Withheld>
      </Block>
    );
  }
  if (!book) return null;

  const images = Array.isArray(book.images) ? book.images : [];
  if (images.length === 0) {
    return (
      <Block id="iv-book" question={question}>
        <NotYet threshold="0 frames">add frames and this starts ranking them</NotYet>
      </Block>
    );
  }

  const ordered = [...images].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const max = Math.max(...images.map((i) => i.openRate ?? 0), 0.01);

  return (
    <Block
      id="iv-book"
      question={question}
      finding={
        book.calibrating ? (
          <Finding verdict="Unranked" tag="sample too small">
            frames need <Emph>5 views</Emph> each to be comparable —{' '}
            <Emph>{book.totalEvents}</Emph> so far
          </Finding>
        ) : (
          finding({ ...book, images })
        )
      }
    >
      {book.calibrating ? (
        <NotYet threshold="5 views per frame">
          a rank drawn from three views would be noise wearing a number
        </NotYet>
      ) : (
        <Figure caption="bar · open rate, relative to your best frame">
          <div className="iv-frames">
            {ordered.map((frame, i) => (
              <Frame key={frame.id} frame={frame} index={i} max={max} />
            ))}
          </div>
        </Figure>
      )}
    </Block>
  );
}
