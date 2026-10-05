import React from 'react';
import { Link } from 'react-router-dom';
import { eventLine, formatDay } from './placementModel';
import { thisWeek } from './timelineModel';

function line(item) {
  if (item.kind === 'your_move') return { who: item.name, what: 'Asked you for more. Reply from your submission.', to: '/dashboard/talent/applications' };
  if (item.kind === 'digitals') {
    return {
      who: 'Your digitals',
      what: item.overdue ? 'Out of date. Shoot a new set before your next submission.' : 'Go out of date this week.',
      to: '/dashboard/talent/media',
    };
  }
  if (item.kind === 'no_digitals') return { who: 'Your digitals', what: 'None in your book. Agencies review digitals first.', to: '/dashboard/talent/media' };
  return { ...eventLine(item.event), href: item.event?.sourceUrl || null };
}

/** The next seven days, and anything waiting on the talent right now. */
export default function ThisWeek({ placement, now }) {
  const items = thisWeek(placement, now);
  return (
    <section className="dk-week" aria-labelledby="dk-week-h">
      <h2 id="dk-week-h" className="dk-h">This week</h2>
      {items.length === 0 ? (
        <p className="dk-soft">Nothing dated in the next seven days.</p>
      ) : (
        <ol className="dk-week-list">
          {items.map((item, i) => {
            const l = line(item);
            return (
              <li key={i} className={`dk-week-item is-${item.kind}`}>
                <span className="dk-week-when">
                  {item.when ? formatDay(item.when, { weekday: 'short', day: 'numeric' }) : 'Now'}
                </span>
                <span className="dk-week-who">{l.who}</span>
                <span className="dk-week-what">
                  {l.what}{' '}
                  {l.to && <Link to={l.to} className="dk-link">Open</Link>}
                  {l.href && (
                    <a href={l.href} className="dk-link" target="_blank" rel="noopener noreferrer">Details</a>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
