import React from 'react';
import { Figure } from './Figure';
import { Place } from './Place';
import { MetaLine } from './MetaLine';
import { ageFigure, heightFigure } from './metaFormat';
import './CardMeta.css';

/**
 * CardMeta — the type under a face.
 *
 * One grammar for every surface that prints a person as a photo and a few
 * lines: the submissions book and ledger, the signing wall, the shelves.
 * Restrained to the least a booker needs to route a decision — see
 * docs/superpowers/specs/2026-09-01-talent-card-metadata.md §7 (owner
 * feedback: the earlier four-slot cut was too much):
 *
 *   figures     height, age, city — ONE line, joined by the house dot
 *   stage       the standing and how long (signing wall / shelves only)
 *   notations   the quiet asides that are actionable: safety, identity
 *
 * Hierarchy is INK, never a container and never a size jump beyond the
 * figure line. Nothing here sets a background, a border, a radius or a
 * shadow: a height in a box reads as a badge, which this system bans and
 * which is also simply wrong — a measurement is a fact about a person, not
 * a state they are in.
 *
 * Absence is silence. A missing height, age or city prints nothing at all;
 * only the notations tier may name an absence, and only where the absence
 * is itself actionable ("Age not recorded").
 *
 * @param {{heightCm?: number|string, age?: number|string, person?: object}} [figures]
 *        `person` is any record `ageFigure` understands (age, date_of_birth,
 *        age_band) and is used only when `age` is not given outright.
 * @param {{city?: string}} [context]
 * @param {{text: string, since?: string}} [stage]  The standing line — the
 *        signing wall and shelves only. Submissions carries none.
 * @param {Array<{text: string, tone?: 'warning'|'danger'}>} [notations]
 * @param {string} [className]
 */
export function CardMeta({ figures, context, stage, notations, className = '', ...rest }) {
  const height = heightFigure(figures?.heightCm);
  /* `age` may arrive as a number or as the record it lives on — the wall holds
     candidates, the submissions desk holds a mapped row. One formatter either
     way, so the two surfaces cannot drift on what a birthday means. */
  const ageSource =
    figures?.age != null && typeof figures.age !== 'object'
      ? { age: figures.age }
      : figures?.age || figures?.person || null;
  const age = ageSource ? ageFigure(ageSource) : null;
  const city = context?.city || null;

  const notes = (notations || []).filter((n) => n && n.text);
  const stageLine = stage?.text || null;
  const hasFigures = Boolean(height || age || city);

  if (!hasFigures && !stageLine && notes.length === 0) return null;

  return (
    <div className={`cm ${className}`.trim()} {...rest}>
      {hasFigures && (
        <MetaLine size="sm" wrap className="cm-figures">
          {/* Height leads: it is the hard gate in every fashion division. */}
          {height && <Figure inline size="sm" value={height.value} unit={height.unit} />}
          {age && <Figure inline size="sm" value={age.value} unit={age.unit} />}
          {city && <Place size="sm" value={city} />}
        </MetaLine>
      )}

      {stageLine && (
        <p className="cm-stage">
          {stageLine}
          {stage.since && <span className="cm-since">{stage.since}</span>}
        </p>
      )}

      {notes.length > 0 && (
        <p className="cm-notations">
          {notes.map((note, i) => (
            <React.Fragment key={note.text}>
              {i > 0 && (
                /* The separator is an element so it can stay quieter than the
                   words it divides, and out of the accessibility tree. */
                <span className="cm-sep" aria-hidden="true">·</span>
              )}
              <span className={note.tone ? `cm-note cm-note--${note.tone}` : 'cm-note'}>
                {note.text}
              </span>
            </React.Fragment>
          ))}
        </p>
      )}
    </div>
  );
}

export default CardMeta;
