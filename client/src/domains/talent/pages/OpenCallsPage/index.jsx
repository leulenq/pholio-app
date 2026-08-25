/**
 * Open calls — the whole list, not the first three.
 *
 * The Overview card shows three rows and then a link. That link used to point
 * at /dashboard/talent/applications, which is the tracker and has never queried
 * a call window in its life — it promised a calendar and delivered a different
 * page. This is the destination it was always describing.
 *
 * What makes this worth a page rather than a longer card is the half of the
 * payload the card has no room for. `GET /api/talent/call-windows` already
 * returns location, instructions, source_url and verified_on for every row, and
 * those are the fields that decide whether someone actually goes: where to
 * stand, what to bring, and how stale Pholio's information is. A walk-in hour
 * without an address is trivia.
 *
 * Grouped by day and ordered from today forward, because the question this
 * answers is "where can I go this week", not "who holds open calls". A Thursday
 * window is the first thing a model needs to see on Thursday morning and the
 * last thing they need on Friday.
 *
 * Free and gated by nothing, same as the card: an open call is public
 * information, and a model who could only see it behind a paywall would read it
 * on the agency's own site instead.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { talentApi } from '../../api/talent';
import {
  daysUntilNext,
  formatTimeRange,
  sortByNextOccurrence,
  weekdayPlural,
} from '../../utils/callWindows';
import './OpenCallsPage.css';

/* The house spring (CLAUDE.md). Days settle in sequence rather than all at
   once, which reads as a list arriving instead of a page repainting. */
const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

/** "Today" / "Tomorrow" / the day's own name — how a person says it. */
function whenLabel(days, weekday) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return weekdayPlural(weekday);
}

/**
 * Windows grouped into their next occurrence, soonest first.
 *
 * Grouping on `daysUntilNext` rather than on weekday keeps "Today" first on
 * every day of the week without a second sort, and keeps a day that has already
 * come round this week at the end where it belongs.
 */
function groupByNextDay(windows, now) {
  const ordered = sortByNextOccurrence(windows, now);
  const groups = [];
  for (const window of ordered) {
    const days = daysUntilNext(window, now);
    const last = groups[groups.length - 1];
    if (last && last.days === days) last.windows.push(window);
    else groups.push({ days, weekday: window.weekday, windows: [window] });
  }
  return groups;
}

function CallRow({ window: call, now }) {
  const time = formatTimeRange(call, now);
  return (
    <li className="oc-row">
      <div className="oc-row__head">
        <h3 className="oc-row__name">{call.displayName}</h3>
        {time && <p className="oc-row__time">{time}</p>}
      </div>

      {call.label && <p className="oc-row__label">{call.label}</p>}
      {call.location && <p className="oc-row__where">{call.location}</p>}
      {call.instructions && <p className="oc-row__instructions">{call.instructions}</p>}

      {(call.verifiedOn || call.sourceUrl) && (
        <p className="oc-row__provenance">
          {/* The verified-on stamp is the honest part. These are hand-checked,
              they go stale, and saying when it was last confirmed is what
              separates this from the sites that scrape and never re-check. */}
          {call.verifiedOn && <span>Verified {call.verifiedOn}</span>}
          {call.sourceUrl && (
            <a href={call.sourceUrl} target="_blank" rel="noreferrer noopener">
              Their page <ArrowUpRight size={11} aria-hidden />
            </a>
          )}
        </p>
      )}
    </li>
  );
}

export default function OpenCallsPage() {
  const now = React.useMemo(() => new Date(), []);
  const reduced = useReducedMotion();
  const { data, isPending, isError } = useQuery({
    queryKey: ['call-windows'],
    queryFn: talentApi.listCallWindows,
    staleTime: 1000 * 60 * 30,
    retry: 1,
  });

  const groups = React.useMemo(
    () => groupByNextDay(Array.isArray(data) ? data : [], now),
    [data, now],
  );

  return (
    <div className="oc-page">
      <Link to="/dashboard/talent" className="oc-back">
        <ArrowLeft size={13} aria-hidden /> Overview
      </Link>

      <h1 className="oc-title">
        Open <em>Calls.</em>
      </h1>

      {isPending && <p className="oc-state">Checking the calendar…</p>}

      {isError && (
        <p className="oc-state">
          The calendar could not be loaded just now. It is public information and nothing
          about your account depends on it — try again in a moment.
        </p>
      )}

      {!isPending && !isError && groups.length === 0 && (
        /* An honest empty state. Pholio lists only hand-verified walk-in hours,
           so "none" means none confirmed — not that none exist anywhere. Saying
           the first without the second would be a quiet lie. */
        <p className="oc-state">
          Pholio holds no confirmed walk-in hours right now. Only hand-verified ones are
          listed here, so this is a statement about what has been checked, not about every
          agency everywhere.
        </p>
      )}

      {groups.map((group, index) => (
        <motion.section
          key={group.days}
          className="oc-day"
          aria-labelledby={`oc-day-${group.days}`}
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: reduced ? 0 : Math.min(index, 4) * 0.06 }}
        >
          <h2 id={`oc-day-${group.days}`} className="oc-day__name">
            {whenLabel(group.days, group.weekday)}
          </h2>
          <ul className="oc-list">
            {group.windows.map((call) => (
              <CallRow key={call.id} window={call} now={now} />
            ))}
          </ul>
        </motion.section>
      ))}
    </div>
  );
}
