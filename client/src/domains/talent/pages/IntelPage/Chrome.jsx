import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Lock } from 'lucide-react';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { EASE } from './intelTheme';

/**
 * Intel's text system.
 *
 * There are exactly nine kinds of writing on this page, and each one gets its
 * own typographic identity so the reader can tell them apart without reading
 * them. Nothing here is "body copy":
 *
 *   Question    serif, with the operative word in italic — this is asked, not stated
 *   Figure      Inter 200 at display size — the answer, when the answer is a number
 *   Verdict     serif at display size — the answer, when the answer is a word
 *   Tag         mono, tracked, small caps — classifies the answer in two words
 *   Qualifier   Inter 350 with 550 emphasis on the operands — reads as a reading
 *   Rationale   serif italic — the industry voice, deliberately a different mouth
 *   Imperative  mono uppercase in a rule box — the only thing you can click
 *   Datum       mono tabular — anything measured
 *   Marginalia  mono at 0.62rem — provenance and caveat, sized so it never competes
 *
 * Variation is carried by size and weight, not by tint. Three type families,
 * five sizes, four weights.
 */

/** Inline emphasis inside a qualifier: the operands, in a heavier cut. */
export function Emph({ children }) {
  return <b className="iv-emph">{children}</b>;
}

/** Provenance and caveats. Never a sentence in the reading's type size. */
export function Marginalia({ children }) {
  return <p className="iv-marginalia">{children}</p>;
}

/**
 * A block of the page: the question, the answer, then the charts that are the
 * evidence for it.
 */
export function Block({ id, question, finding, children, aside }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      id={id}
      className="iv-block"
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, ease: EASE }}
    >
      <header className="iv-block-head">
        <h2 className="iv-question">{question}</h2>
        {aside}
      </header>
      {finding}
      {children}
    </motion.section>
  );
}

/**
 * The answer, composed as a lockup rather than written as a sentence.
 *
 *      50%                  <- figure, or a verdict word in serif
 *      ───
 *      of 6 sent submissions were opened      <- qualifier, operands emphasised
 *      BIGGEST DROP-OFF                       <- tag, two words, mono
 *
 * The rule between figure and qualifier is what makes it read as one object
 * instead of a heading followed by a paragraph.
 */
export function Finding({ figure, verdict, from, to, tag, tone, children }) {
  const isDelta = from != null && to != null;
  const kind = isDelta ? 'delta' : verdict != null ? 'verdict' : 'figure';

  return (
    <div className={`iv-finding iv-finding--${kind}${tone ? ` is-${tone}` : ''}`}>
      {isDelta ? (
        <p className="iv-finding-lead">
          <span className="iv-finding-from">{from}</span>
          <span className="iv-finding-arrow" aria-hidden>→</span>
          <span className="iv-finding-to">{to}</span>
        </p>
      ) : (
        <p className="iv-finding-lead">{verdict ?? figure}</p>
      )}
      {(children || tag) && <span className="iv-finding-rule" aria-hidden />}
      {children ? <p className="iv-finding-qualifier">{children}</p> : null}
      {tag ? <p className="iv-finding-tag">{tag}</p> : null}
    </div>
  );
}

/** A titled chart slot. */
export function Panel({ label, note, children }) {
  return (
    <section className="iv-panel">
      {label ? (
        <header className="iv-panel-head">
          <h3 className="iv-panel-label">{label}</h3>
          {note ? <span className="iv-panel-note">{note}</span> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function PanelRow({ children }) {
  return <div className="iv-panelrow">{children}</div>;
}

/** A measured quantity: the number leads, the label names it in mono. */
export function Stat({ value, label, tone }) {
  // A zero still belongs in the row — the comparison needs it — but it does not
  // get the same optical weight as a real measurement.
  const isNull = value === 0 || value === '0';
  return (
    <div
      className={`iv-stat${tone ? ` iv-stat--${tone}` : ''}${isNull ? ' is-null' : ''}`}
    >
      <span className="iv-stat-value">{value}</span>
      <span className="iv-stat-label">{label}</span>
    </div>
  );
}

export function StatRow({ children }) {
  return <div className="iv-statrow">{children}</div>;
}

/** Studio+ gate. Never a blurred fake chart behind it. */
export function Withheld({ title, children }) {
  return (
    <div className="iv-withheld">
      <Lock size={14} className="iv-withheld-icon" aria-hidden />
      <div>
        <p className="iv-withheld-title">{title}</p>
        <p className="iv-withheld-copy">{children}</p>
      </div>
      <PholioButton to="/dashboard/talent/settings/studio" variant="meta">
        Studio+
      </PholioButton>
    </div>
  );
}

/**
 * Not enough data to say anything true yet. Set as marginalia with a mono
 * threshold, so it reads as a measurement in progress rather than a paragraph
 * apologising for an empty box.
 */
export function NotYet({ threshold, children }) {
  return (
    <p className="iv-notyet">
      {threshold ? <span className="iv-notyet-threshold">{threshold}</span> : null}
      <span className="iv-notyet-copy">{children}</span>
    </p>
  );
}
