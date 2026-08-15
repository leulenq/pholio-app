import React from 'react';
import { Link } from 'react-router-dom';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';
import { EmptyErrorState } from '../../../shared/components/states';
import { AgencyEmptyState } from '../components/ui';
import { Figure, Notation } from '../components/meta';
import { useEventCalls } from './events/useEventCalls';
import { formatEventDates, formatCompensation } from './events/eventFormat';
import './events/events.css';

/**
 * Every event cast this house is running (design §e O2).
 *
 * Ruling R10: this is a section of the ordinary agency dashboard, not a
 * separate product. A call is an open call link with dates and a compensation
 * statement, created in Settings alongside every other link; this page is
 * where the work on those calls happens.
 */
function EventsPage() {
  const { data, isLoading, isError, refetch } = useEventCalls();
  const calls = data?.calls || [];

  if (isLoading) {
    return (
      <div className="ev" role="status" aria-live="polite" aria-busy="true">
        <header className="ev-hero">
          <h1 className="ev-title">Events</h1>
        </header>
        <div className="ev-panel">
          <div className="ev-skel" />
          <div className="ev-skel" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="ev">
        <header className="ev-hero">
          <h1 className="ev-title">Events</h1>
        </header>
        <EmptyErrorState
          title="Events unavailable"
          body="We could not load your event calls. Try again to resume casting."
          retry={{ label: 'Try again', onClick: () => refetch() }}
        />
      </div>
    );
  }

  return (
    <div className="ev">
      <header className="ev-hero">
        <h1 className="ev-title">Events</h1>
        <div className="ev-hero-meta">
          <span>
            Casts you are running. Each one has its own pool, its own designers,
            and its own lineup.
          </span>
        </div>
      </header>

      <section className="ev-panel" aria-label="Event calls">
        {calls.length === 0 ? (
          <AgencyEmptyState
            title="No event casts yet"
            description="Create an open call in Settings and mark it as an event cast. Give it dates and say what you pay — applicants have to read that before they apply."
          />
        ) : (
          <ul className="ev-calls">
            {calls.map((call) => (
              <li key={call.id} className="ev-call">
                <div>
                  <Link className="ev-call-name" to={`/dashboard/agency/events/${call.id}`}>
                    {call.event.name || call.label || 'Untitled cast'}
                  </Link>
                  <div className="ev-call-meta">
                    <span>{formatEventDates(call.event)}</span>
                    {call.event.location && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{call.event.location}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <Notation size="sm">{formatCompensation(call.compensation)}</Notation>
                  </div>
                </div>
                <div className="ev-call-counts">
                  <Figure label="To review" value={String(call.counts.to_review)} size="sm" />
                  <Figure label="Pool" value={String(call.counts.pool)} size="sm" />
                  <Figure label="Offered" value={String(call.counts.offered)} size="sm" />
                  <Figure label="Confirmed" value={String(call.counts.confirmed)} size="sm" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function EventsPageWrapper() {
  return (
    <ErrorBoundary>
      <EventsPage />
    </ErrorBoundary>
  );
}
