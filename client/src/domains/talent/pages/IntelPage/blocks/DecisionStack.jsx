import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EASE, plural } from '../intelTheme';

const SEVERITY_ORDER = { act: 0, fix: 1, grow: 2 };

const SENDABILITY = {
  ready: 'Your package is current. It can go out today.',
  caveat: 'Your package can go out, with one thing dated.',
  hold: 'Your package is not ready to send.',
};

/**
 * The lede: the state of play, then what to do about it.
 *
 * Each row is three voices stacked — an observation in Inter medium, the
 * industry rationale in serif italic, and the act in mono. Three registers on
 * one row is what stops a list of advice from reading as a wall of grey.
 */
export default function DecisionStack({ decisions, sendability, standing }) {
  const reduce = useReducedMotion();
  const rows = [...(decisions || [])].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );

  return (
    <section className="iv-lead">
      <p className="iv-lead-state">{SENDABILITY[sendability] ?? SENDABILITY.caveat}</p>

      {standing?.open > 0 && (
        <p className="iv-lead-standing">
          <span className="iv-lead-figure">{standing.open}</span>
          <span>{plural(standing.open, 'submission')} out</span>
          {standing.late > 0 ? (
            <>
              <span className="iv-lead-sep" aria-hidden />
              <span className="iv-lead-figure iv-lead-figure--flag">{standing.late}</span>
              <span className="iv-lead-flag">past the read window</span>
            </>
          ) : null}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="iv-lead-clear">
          No current materials or submission record calls for an action.
        </p>
      ) : (
        <ol className="iv-decisions">
          {rows.map((d, i) => (
            <motion.li
              key={d.key}
              className={`iv-decision iv-decision--${d.severity}`}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.45, delay: i * 0.07, ease: EASE }}
            >
              {d.severity === 'act' ? (
                <span className="iv-decision-rank">Act now</span>
              ) : null}
              <p className="iv-decision-headline">{d.headline}</p>
              <p className="iv-decision-reason">{d.reason}</p>
              <Link to={d.to} className="iv-decision-action">
                {d.action}
                <ArrowRight size={13} aria-hidden />
              </Link>
            </motion.li>
          ))}
        </ol>
      )}
    </section>
  );
}
