import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { eventLine, formatDay } from './placementModel';
import { timelineRows } from './timelineModel';
import { SPRING } from './motion';

const pc = (x) => `${(x * 100).toFixed(3)}%`;

/** "Walk-in open call, 3pm to 4pm New York time" → "Thursdays, 3pm to 4pm New York time". */
function callTime(event) {
  const day = formatDay(event.date, { weekday: 'long' });
  const what = eventLine(event).what.replace(/^[^,]*,?\s*/, '');
  return `${day}s${what ? `, ${what}` : ''}`;
}

function Row({ label, sub, children, tone }) {
  return (
    <div className={`dk-row${tone ? ` is-${tone}` : ''}`}>
      <div className="dk-row-label">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
      <div className="dk-row-track">{children}</div>
    </div>
  );
}

function Lane({ title, children }) {
  return (
    <div className="dk-lane">
      <div className="dk-lane-title">{title}</div>
      {children}
    </div>
  );
}

/**
 * One axis, a month back to six months out, with every dated thing in
 * Placement on it. Reading left to right is reading the plan: what is in
 * motion now, what closes when, when each passed agency reopens, which open
 * calls recur, and when the digitals run out.
 */
export default function Timeline({ placement, now = new Date(), onNow }) {
  const reduce = useReducedMotion();
  const { axis, waiting, again, calls, digitals } = timelineRows(placement, now);
  const goCount = (placement.agencies || []).filter((a) => a.group === 'go').length;
  const grow = () => (reduce ? false : { scaleX: 0 });
  const t = (i) => ({ ...SPRING, delay: 0.15 + i * 0.07 });
  const empty = !waiting.length && !again.length && !calls.length && !digitals;

  return (
    <div className="dk-timeline" role="img" aria-label="Your placement timeline, one month back to six months ahead">
      <div className="dk-axis">
        <div className="dk-row-label" />
        <div className="dk-row-track">
          {axis.months.map((m) => (
            <span key={m.key} className="dk-month" style={{ left: pc(m.x) }}>{m.label}</span>
          ))}
        </div>
      </div>

      <div className="dk-grid">
        <div className="dk-grid-lines" aria-hidden>
          {axis.months.map((m) => (
            <span key={m.key} style={{ left: pc(m.x) }} />
          ))}
          <span className="dk-today" style={{ left: pc(axis.today) }}>
            <em>Today</em>
          </span>
        </div>

        {goCount > 0 && (
          <Lane title="Now">
            <Row label={`${goCount} agencies`} sub="open to approach" tone="now">
              <button
                type="button"
                className="dk-now-mark"
                style={{ left: pc(axis.today) }}
                onClick={onNow}
                aria-label={`See the ${goCount} agencies to approach now`}
              >
                {goCount}
              </button>
            </Row>
          </Lane>
        )}

        {waiting.length > 0 && (
          <Lane title="Waiting to hear">
            {waiting.map((w, i) => (
              <Row key={w.key} label={w.name} sub={w.yourMove ? 'Asked you for more' : w.closesAt ? `Closes ${formatDay(w.closesAt, { day: 'numeric', month: 'short' })}` : null} tone={w.yourMove ? 'now' : null}>
                <motion.span
                  className="dk-bar"
                  style={{ left: pc(w.from), width: pc(Math.max(0.004, w.to - w.from)) }}
                  initial={grow()}
                  animate={{ scaleX: 1 }}
                  transition={t(i)}
                />
                <span className="dk-bar-elapsed" style={{ left: pc(w.from), width: pc(Math.max(0, axis.today - w.from)) }} />
                {w.closesAt && <span className="dk-end" style={{ left: pc(w.to) }} />}
              </Row>
            ))}
          </Lane>
        )}

        {again.length > 0 && (
          <Lane title="Try again">
            {again.map((a, i) => (
              <Row key={a.key} label={a.name} sub={`From ${formatDay(a.on, { day: 'numeric', month: 'short' })}`}>
                <motion.span
                  className="dk-wait"
                  style={{ left: pc(axis.today), width: pc(Math.max(0, a.x - axis.today)) }}
                  initial={grow()}
                  animate={{ scaleX: 1 }}
                  transition={t(i)}
                />
                <motion.span
                  className={`dk-point${a.beyond ? ' is-beyond' : ''}`}
                  style={{ left: pc(a.x) }}
                  initial={reduce ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={t(i + 2)}
                />
              </Row>
            ))}
          </Lane>
        )}

        {calls.length > 0 && (
          <Lane title="Walk-in open calls">
            {calls.map((c, i) => (
              <Row key={c.key} label={c.name} sub={callTime(c.event)}>
                {c.ticks.map((tk, j) => (
                  <motion.span
                    key={tk.date}
                    className="dk-call"
                    style={{ left: pc(tk.x) }}
                    title={formatDay(tk.date, { weekday: 'long', day: 'numeric', month: 'long' })}
                    initial={reduce ? false : { scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ ...SPRING, delay: 0.2 + i * 0.05 + j * 0.01 }}
                  />
                ))}
              </Row>
            ))}
          </Lane>
        )}

        {digitals && (
          <Lane title="Your digitals">
            <Row
              label="Current set"
              sub={digitals.dueOn ? `${digitals.overdue ? 'Out of date since' : 'Current until'} ${formatDay(digitals.dueOn, { day: 'numeric', month: 'short' })}` : null}
              tone={digitals.overdue ? 'now' : null}
            >
              {digitals.due != null && (
                <>
                  <motion.span
                    className="dk-bar dk-bar--digitals"
                    style={{ left: pc(digitals.from), width: pc(Math.max(0.004, digitals.due - digitals.from)) }}
                    initial={grow()}
                    animate={{ scaleX: 1 }}
                    transition={t(0)}
                  />
                  <motion.span
                    className="dk-overdue"
                    style={{ left: pc(digitals.due), width: pc(1 - digitals.due) }}
                    initial={grow()}
                    animate={{ scaleX: 1 }}
                    transition={t(1)}
                  />
                </>
              )}
            </Row>
          </Lane>
        )}

        {empty && !goCount && <p className="dk-soft dk-empty">Nothing dated yet. Submissions, passes and open calls appear here as they happen.</p>}
      </div>
    </div>
  );
}
