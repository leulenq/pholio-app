import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plus } from 'lucide-react';
import SubmissionRecord from './SubmissionRecord';
import { statusConfig } from '../../utils/applicationStatus';
import { trackerStatusConfig } from '../../utils/submissionTracker';
import './submission-ledger.css';

/**
 * Submission history.
 *
 * A ledger, and the axis is time — which is the one thing the previous version
 * never used. Rows were ordered by date but nothing else acknowledged it: they
 * carried a running index that renumbered whenever a filter changed, and a
 * relative date with no year, so a campaign that spanned two seasons read as
 * one undifferentiated stack.
 *
 * Three decisions:
 *
 * 1. **Time is the spine.** Records group under the month they were sent, and
 *    the date column is the left edge of every row. You read a career down it.
 *
 * 2. **Route is structural, not metadata.** Whether Pholio carried a submission
 *    or merely recorded one the talent made is the single most consequential
 *    fact on this surface — it decides whether a status can be trusted, whether
 *    there is a receipt, and whether anyone else can answer. It is carried by
 *    the same gold the board uses, and stated in words in the open record.
 *
 * 3. **It opens in place**, exactly as a band does upstairs. The old side panel
 *    made history a second, differently-shaped surface sitting beside the
 *    market rather than continuing from it.
 */

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'inReview', label: 'In review' },
  { id: 'advancing', label: 'Advancing' },
  // Kept even though it is empty for almost everyone: it is the outcome the
  // whole surface exists for, and a count of zero says something true.
  { id: 'represented', label: 'Represented' },
  { id: 'closed', label: 'Closed' },
];

const EASE = [0.22, 1, 0.36, 1];

function entryConfig(entry) {
  return entry.kind === 'tracker'
    ? trackerStatusConfig(entry.row)
    : statusConfig(entry.app.status, { purpose: entry.app.call_purpose });
}

function entryDate(entry) {
  return entry.kind === 'tracker' ? entry.row.submittedOn : entry.app.created_at;
}

function entryName(entry) {
  return entry.kind === 'tracker'
    ? entry.row.agencyName
    : entry.app.agency_name || 'Unknown agency';
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Two kinds of value arrive here and they must not be read alike.
 *
 * A logged submission carries a date only — `2026-07-01` — which names a day
 * and nothing else, so it is read at UTC midnight and formatted in UTC. Read
 * locally it slips a day west of Greenwich, which filed a submission dated
 * 1 July under June.
 *
 * An on-Pholio application carries a real instant, and an instant belongs in
 * the reader's own timezone: a package sent at 8pm in Los Angeles was sent that
 * evening, not the next morning.
 */
function readDate(value) {
  const raw = String(value ?? '');
  const dateOnly = DATE_ONLY.test(raw);
  const date = new Date(dateOnly ? `${raw}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly };
}

/** Records sent in the same month belong together; the year is never dropped. */
function monthOf(value) {
  const read = readDate(value);
  if (!read) return 'Undated';
  return read.date.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    ...(read.dateOnly ? { timeZone: 'UTC' } : {}),
  });
}

function dayOf(value) {
  const read = readDate(value);
  if (!read) return '--';
  const day = read.dateOnly ? read.date.getUTCDate() : read.date.getDate();
  return String(day).padStart(2, '0');
}

function groupByMonth(entries) {
  const months = new Map();
  for (const entry of entries) {
    const key = monthOf(entryDate(entry));
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(entry);
  }
  return [...months.entries()].map(([month, rows]) => ({ month, rows }));
}

export default function SubmissionLedger({
  entries,
  isLoading,
  onLogSubmission,
  initialOpenKey = null,
  ...handlers
}) {
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState('all');
  // Deep links land on a record already open.
  const [openKey, setOpenKey] = useState(initialOpenKey);

  const filtered = useMemo(
    () =>
      filter === 'all'
        ? entries
        : entries.filter((entry) => entryConfig(entry).group === filter),
    [entries, filter],
  );

  const months = useMemo(() => groupByMonth(filtered), [filtered]);

  // Counts sit on the filters themselves. A tab row you have to click through
  // to learn the shape of your own campaign is a row that withheld it.
  const counts = useMemo(() => {
    const tally = { all: entries.length };
    for (const entry of entries) {
      const { group } = entryConfig(entry);
      tally[group] = (tally[group] || 0) + 1;
    }
    return tally;
  }, [entries]);

  if (isLoading) {
    return (
      <div className="sl-loading" aria-label="Opening your history">
        {[1, 2, 3].map((item) => (
          <div key={item} className="sl-loading__row" />
        ))}
      </div>
    );
  }

  /*
    The first-run state. It is the only moment this surface can teach that there
    are two ways a submission gets here, so it says both and offers the one the
    board upstairs cannot: logging something already sent.
  */
  if (entries.length === 0) {
    return (
      <section className="sl" aria-labelledby="sl-title">
        {/* The same head wrapper as the populated state — it is what carries the
            gutter, and without it the title sat flush to the page edge while
            everything under it was inset. */}
        <div className="sl-head">
          <h2 id="sl-title" className="sl-title">Submission history</h2>
        </div>
        <div className="sl-first">
          <p className="sl-first__line">Nothing sent yet.</p>
          <p className="sl-first__body">
            Every submission you send through Pholio lands here with a receipt of exactly
            what left. Sent something already — on an agency&rsquo;s own site, or by email?
            Put it on the record and it joins the same history.
          </p>
          <button type="button" className="sl-first__act" onClick={onLogSubmission}>
            <Plus size={14} aria-hidden /> Log a submission you already sent
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="sl" aria-labelledby="sl-title">
      <div className="sl-head">
        <h2 id="sl-title" className="sl-title">Submission history</h2>

        <div className="sl-tools">
          <div className="sl-filters" role="tablist" aria-label="Filter your history">
            {FILTERS.map((item) => {
              const count = counts[item.id] || 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === item.id}
                  className={`sl-filter${filter === item.id ? ' sl-filter--on' : ''}`}
                  onClick={() => setFilter(item.id)}
                  disabled={count === 0 && item.id !== 'all'}
                >
                  {item.label}
                  <span className="sl-filter__n">{count}</span>
                </button>
              );
            })}
          </div>

          <button type="button" className="sl-log" onClick={onLogSubmission}>
            <Plus size={13} aria-hidden /> Log a submission
          </button>
        </div>
      </div>

      {months.length === 0 ? (
        <p className="sl-none">Nothing in this view.</p>
      ) : (
        months.map((group) => (
          <div key={group.month} className="sl-month">
            <h3 className="sl-month__name">{group.month}</h3>

            <ol className="sl-rows">
              {group.rows.map((entry) => {
                const config = entryConfig(entry);
                const isOpen = openKey === entry.key;
                const carried = entry.kind === 'application';
                const panelId = `record-${entry.key}`;

                return (
                  <li
                    key={entry.key}
                    className={`sl-row${isOpen ? ' sl-row--open' : ''}`}
                  >
                    <button
                      type="button"
                      className="sl-row__face"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() =>
                        setOpenKey((current) => (current === entry.key ? null : entry.key))
                      }
                    >
                      <span className="sl-row__day">{dayOf(entryDate(entry))}</span>

                      <span className="sl-row__who">
                        <span className="sl-row__name">{entryName(entry)}</span>
                        <span
                          className={`sl-row__route${carried ? ' sl-row__route--carried' : ''}`}
                        >
                          {carried ? 'Sent through Pholio' : 'You sent it · recorded here'}
                        </span>
                      </span>

                      <span className={`sl-row__status sl-row__status--${config.tone}`}>
                        {config.label}
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen ? (
                        <motion.div
                          id={panelId}
                          className="sl-row__panel"
                          initial={reduce ? false : { height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                          transition={reduce ? { duration: 0 } : { duration: 0.38, ease: EASE }}
                        >
                          <SubmissionRecord entry={entry} {...handlers} />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ol>
          </div>
        ))
      )}
    </section>
  );
}
