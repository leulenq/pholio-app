import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Section, ActionLink } from './Section';
import { rise, SPRING } from './motion';

/**
 * The review window as a line. Gold runs from the day the submission last
 * moved to today; the hairline after it is the time left; the tick at the end
 * is the day silence becomes a close. Read from the server, which uses the
 * same window the auto-close job does.
 */
function WaitLine({ wait }) {
  const reduce = useReducedMotion();
  return (
    <div className="ov-wait" role="img" aria-label={`Day ${wait.elapsed} of ${wait.total}. Closes ${wait.closesOn} if unanswered.`}>
      <div className="ov-wait-track" aria-hidden>
        <motion.span
          className="ov-wait-fill"
          style={{ transformOrigin: 'left' }}
          initial={reduce ? false : { scaleX: 0 }}
          whileInView={{ scaleX: wait.fraction }}
          viewport={{ once: true }}
          transition={{ ...SPRING, delay: 0.2 }}
        />
        <span className="ov-wait-end" />
      </div>
      <div className="ov-wait-labels" aria-hidden>
        <span className="ov-wait-day">
          Day {wait.elapsed} of {wait.total}
        </span>
        <span className="ov-wait-close">Closes {wait.closesOn} if unanswered</span>
      </div>
    </div>
  );
}

function Row({ row }) {
  return (
    <motion.li variants={rise}>
      <Link to={row.to} className={`ov-circ-row${row.waiting ? ' ov-circ-row--yours' : ''}`}>
        <span className="ov-circ-who">
          <span className="ov-circ-agency">{row.agency}</span>
          {row.place && <span className="ov-circ-place">{row.place}</span>}
        </span>
        <span className="ov-circ-standing">
          <span className="ov-circ-status">{row.standing}</span>
          <span className="ov-circ-since">{row.waiting ? 'Waiting on you' : row.since}</span>
        </span>
        <span className="ov-circ-clock">{row.wait && <WaitLine wait={row.wait} />}</span>
        <span className="ov-circ-arrow" aria-hidden>→</span>
      </Link>
    </motion.li>
  );
}

/**
 * In circulation: where the book is right now. One line per agency, the
 * standing in the agency's own words, and for anything awaiting a decision,
 * how far into the review window it is.
 */
export default function InCirculation({ circulation, loading, error }) {
  const [showClosed, setShowClosed] = useState(false);
  const { live, liveOverflow, closed } = circulation;
  const empty = !loading && !error && live.length === 0 && closed.length === 0;

  return (
    <Section
      id="ov-circ-heading"
      title="In"
      accent="circulation."
      className="ov-circ"
      link={empty ? null : { to: '/dashboard/talent/applications', label: 'All submissions' }}
    >
      {loading ? (
        <motion.div variants={rise}>
          <span className="ov-skel ov-skel--row" aria-hidden />
          <span className="ov-skel ov-skel--row" aria-hidden />
        </motion.div>
      ) : error ? (
        <motion.p className="ov-quiet-line" variants={rise} role="alert">
          Your submissions did not load. Refresh the page to try again.
        </motion.p>
      ) : empty ? (
        <motion.div className="ov-first-use" variants={rise}>
          <p className="ov-first-use-line">
            Agencies you submit to appear here, with the date each review window closes.
          </p>
          <ActionLink to="/dashboard/talent/applications">Browse agencies</ActionLink>
        </motion.div>
      ) : (
        <>
          {live.length > 0 ? (
            <ul className="ov-circ-list">
              {live.map((row) => (
                <Row key={row.id} row={row} />
              ))}
            </ul>
          ) : (
            <motion.p className="ov-quiet-line" variants={rise}>
              Nothing is with an agency right now.
            </motion.p>
          )}

          <motion.div className="ov-circ-foot" variants={rise}>
            {liveOverflow > 0 && (
              <Link to="/dashboard/talent/applications" className="ov-sec-link">
                {liveOverflow} more in submissions
              </Link>
            )}
            {closed.length > 0 && (
              <button
                type="button"
                className="ov-sec-link ov-circ-closed-toggle"
                aria-expanded={showClosed}
                onClick={() => setShowClosed((v) => !v)}
              >
                {showClosed ? 'Hide closed' : `${closed.length} closed`}
              </button>
            )}
          </motion.div>

          <AnimatePresence initial={false}>
            {showClosed && (
              <motion.ul
                className="ov-circ-closed"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                {closed.map((row) => (
                  <li key={row.id}>
                    <Link to={row.to} className="ov-circ-closed-row">
                      <span className="ov-circ-closed-agency">{row.agency}</span>
                      <span>{row.standing}</span>
                      <span className="ov-circ-closed-date">Sent {row.sentOn}</span>
                    </Link>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}
    </Section>
  );
}
