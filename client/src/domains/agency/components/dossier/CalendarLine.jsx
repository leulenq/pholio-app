import React from 'react';
import { AvailabilityCell } from '../status/AvailabilityCell';
import { calendarSpans, fmtDayMonth, titleCase } from './dossierModel';
import { Quiet } from './DossierPrimitives';
import './dossier.css';

/**
 * The Calendar Line — one rule carrying the next 90 days.
 *
 * Bookers do not reason about availability as a word; they reason about dates.
 * This draws the talent's own bookouts and this agency's options, holds, and
 * confirmed bookings on the same rule, because a first option that collides
 * with a bookout is the exact problem the booker is looking for. Colour comes
 * from the house status system (`--ss-*`), so a span here means the same thing
 * it means on the roster.
 */
const SPAN_TITLE = (span) => {
  const kind = span.kindLabel || titleCase(span.kind);
  const range = span.to
    ? `${fmtDayMonth(span.from)} – ${fmtDayMonth(span.to)}`
    : `from ${fmtDayMonth(span.from)}`;
  return `${kind} · ${range}${span.label && span.label !== kind ? ` · ${span.label}` : ''}`;
};

export function CalendarLine({ availability }) {
  const { windowDays, spans, ticks } = calendarSpans(availability);
  const lanes = [
    { key: 'bookout', label: 'Bookouts', filter: (s) => s.kind === 'bookout' },
    { key: 'agency', label: 'Our calendar', filter: (s) => s.kind !== 'bookout' },
  ].filter((lane) => spans.some(lane.filter));

  return (
    <div className="dx-cal">
      <div className="dx-cal__state">
        {availability?.status ? (
          <AvailabilityCell status={availability.status} />
        ) : (
          <span className="dx-quiet">Availability not declared</span>
        )}
        <span className="dx-cal__window">Next {windowDays} days</span>
      </div>

      {lanes.length === 0 ? (
        <>
          <div className="dx-cal__rule dx-cal__rule--empty" aria-hidden="true">
            <span className="dx-cal__today" />
          </div>
          <Quiet>No bookouts, options, or holds on record for this window.</Quiet>
        </>
      ) : (
        <div className="dx-cal__grid">
          {lanes.map((lane) => (
            <div className="dx-cal__lane" key={lane.key}>
              <span className="dx-cal__lane-key">{lane.label}</span>
              <div className="dx-cal__rule">
                <span className="dx-cal__today" title="Today" />
                {ticks.map((tick) => (
                  <span
                    key={tick.label + tick.at}
                    className="dx-cal__tick"
                    style={{ left: `${tick.at * 100}%` }}
                  >
                    <i>{tick.label}</i>
                  </span>
                ))}
                {spans.filter(lane.filter).map((span) => (
                  <span
                    key={span.id}
                    className={`dx-cal__span dx-cal__span--${span.tone}${
                      span.kind === 'booked' ? ' is-solid' : ''
                    }`}
                    style={{ left: `${span.left * 100}%`, width: `${span.width * 100}%` }}
                    title={SPAN_TITLE(span)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {spans.length > 0 && (
        <ul className="dx-cal__list">
          {spans.map((span) => (
            <li key={`item-${span.id}`}>
              <span className={`dx-cal__chipless dx-cal__chipless--${span.tone}`} aria-hidden="true" />
              <span className="dx-cal__item-kind">{span.kindLabel || titleCase(span.kind)}</span>
              <span className="dx-cal__item-when">
                {fmtDayMonth(span.from)}
                {span.to ? ` – ${fmtDayMonth(span.to)}` : ' onward'}
              </span>
              {span.label && span.label !== (span.kindLabel || titleCase(span.kind)) && (
                <span className="dx-cal__item-note">{span.label}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CalendarLine;
