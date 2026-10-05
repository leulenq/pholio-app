import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  digitalsLine,
  feetInches,
  listJoin,
  openBoardsLine,
  outsideLines,
  plural,
} from './placementModel';
import { SPRING } from './motion';

const TOP = 200;
const BOTTOM = 150;

function y(cm) {
  return `${((TOP - Math.min(TOP, Math.max(BOTTOM, cm))) / (TOP - BOTTOM)) * 100}%`;
}

function columnLabel(labels) {
  const words = labels.flatMap((l) => l.split(' and ')).map((w, i) => (i ? w.toLowerCase() : w));
  return listJoin(words);
}

/** Boards with the same range stand as one column. */
function columns(wall) {
  const byRange = new Map();
  for (const b of wall || []) {
    const key = b.range.join('-');
    const entry = byRange.get(key) || { key, range: b.range, labels: [] };
    entry.labels.push(b.label);
    byRange.set(key, entry);
  }
  return [...byRange.values()].sort((a, b) => a.range[0] - b.range[0]);
}

/**
 * The measuring wall, standing up: a ruler in centimetres on the left, feet
 * and inches on the right, each height-cast board as a column at its typical
 * range, and the talent as one line across all of them.
 */
function Wall({ filing }) {
  const reduce = useReducedMotion();
  const cols = columns(filing.wall);
  const h = filing.facts.heightCm;
  const ticks = [];
  for (let cm = BOTTOM; cm <= TOP; cm += 1) ticks.push(cm);

  return (
    <figure className="dk-wall" aria-label={h ? `Your height, ${h} cm, against typical board ranges` : 'Typical board height ranges'}>
      <div className="dk-wall-body">
        <div className="dk-ruler" aria-hidden>
          {ticks.map((cm) => (
            <span
              key={cm}
              className={`dk-tick${cm % 5 === 0 ? ' is-five' : ''}${cm % 10 === 0 ? ' is-ten' : ''}`}
              style={{ top: y(cm) }}
            >
              {cm % 10 === 0 ? <em>{cm}</em> : null}
            </span>
          ))}
        </div>

        <div className="dk-cols">
          {cols.map((c, i) => {
            const inside = h != null && h >= c.range[0] && h <= c.range[1];
            return (
              <div key={c.key} className={`dk-col${inside ? ' is-inside' : ''}`}>
                <motion.span
                  className="dk-col-band"
                  style={{ top: y(c.range[1]), height: `calc(${y(c.range[0])} - ${y(c.range[1])})` }}
                  initial={reduce ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ ...SPRING, delay: 0.2 + i * 0.12 }}
                />
                <span className="dk-col-range" style={{ top: y(c.range[1]) }}>
                  {c.range[0]}–{c.range[1]}
                </span>
              </div>
            );
          })}
          {h != null && (
            <motion.div
              className="dk-you"
              style={{ top: y(h) }}
              initial={reduce ? false : { opacity: 0, y: -40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: 0.6 }}
            >
              <span>You</span>
            </motion.div>
          )}
        </div>

        <div className="dk-ruler-ft" aria-hidden>
          {[60, 63, 66, 69, 72, 75, 78].map((inch) => (
            <span key={inch} style={{ top: y(inch * 2.54) }}>{feetInches(inch * 2.54)}</span>
          ))}
        </div>
      </div>
      <div className="dk-col-labels" aria-hidden>
        <span />
        {cols.map((c) => (
          <span key={c.key}>{columnLabel(c.labels)}</span>
        ))}
        <span />
      </div>
    </figure>
  );
}

const SHOT_STATE = {
  in_book: { mark: 'is-in', text: 'In your book' },
  unconfirmed: { mark: 'is-maybe', text: 'Likely. Confirm the shot type' },
  missing: { mark: 'is-out', text: 'Not in your book' },
};

export default function YouColumn({ filing, shots, digitals, registryAgencies }) {
  const h = filing.facts.heightCm;
  const outside = outsideLines(filing);
  const open = openBoardsLine(filing);
  return (
    <aside className="dk-you-col" aria-label="You, as an agency would file you">
      <div className="dk-measure">
        <p className="dk-big-number">
          {h != null ? (
            <>
              {Math.round(h)}
              <small>cm</small>
              <span>{feetInches(h)}</span>
            </>
          ) : (
            <Link to="/dashboard/talent/profile?tab=appearance" className="dk-link">Add your height</Link>
          )}
        </p>
        {filing.wall?.length > 0 && <Wall filing={filing} />}
      </div>

      {(outside.length > 0 || open) && (
        <div className="dk-notes">
          {outside.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {open && (
            <p className="dk-soft">
              {open} <Link to="/dashboard/talent/profile?tab=discipline" className="dk-link">Edit booking lanes</Link>
            </p>
          )}
        </div>
      )}

      <div className="dk-block">
        <h2 className="dk-h">Your book, against what agencies ask</h2>
        {shots.length > 0 ? (
          <ul className="dk-shots">
            {shots.map((s) => {
              const st = SHOT_STATE[s.state] || SHOT_STATE.missing;
              return (
                <li key={s.key} className={`dk-shot ${st.mark}`}>
                  <span className="dk-shot-mark" aria-hidden />
                  <span className="dk-shot-name">{s.label}</span>
                  <span className="dk-shot-n">{s.agencies}</span>
                  <span className="dk-shot-state">{st.text}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="dk-soft">No published shot lists to read yet.</p>
        )}
        {registryAgencies > 0 && (
          <p className="dk-fine">
            Number is how many of {plural(registryAgencies, 'agency', 'agencies')} publish the shot.{' '}
            <Link to="/dashboard/talent/media" className="dk-link">Go to media</Link>
          </p>
        )}
      </div>

      <div className="dk-block">
        <h2 className="dk-h">Digitals</h2>
        <p className={`dk-digitals is-${digitals?.state || 'none'}`}>{digitalsLine(digitals)}</p>
      </div>

      <p className="dk-fine">
        Ranges are typical New York practice, reviewed with Pholio&rsquo;s industry reference. Context for where agencies
        usually file someone, never a rule. Each agency&rsquo;s own published requirements are read on the right.
      </p>
    </aside>
  );
}
