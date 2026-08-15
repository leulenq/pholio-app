import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';
import { EmptyErrorState } from '../../../shared/components/states';
import { Figure } from '../components/meta';
import ApplicantsPage from './ApplicantsPage';
import PickListsPanel from './events/PickListsPanel';
import LineupPanel from './events/LineupPanel';
import { formatCompensation, formatEventDates } from './events/eventFormat';
import { getEventCall } from '../api/agency';
import {
  EVENT_ACTION_LABELS,
  EVENT_LIFECYCLE_TABS,
} from '../constants/applicantLifecycle';
import './events/events.css';

/**
 * One event cast (design §e O2 detail).
 *
 * Three views of one call, and the first of them is the ordinary submissions
 * desk configured for this link — not a second inbox. Ruling R10 makes that
 * the rule rather than a convenience: the organizer triages with the same
 * keyboard shortcuts, the same bulk bar and the same review room a booker
 * uses, relabelled from `constants/applicantLifecycle`.
 *
 * The three are a switch rather than a stack because each one is a full
 * working surface; stacking them would put a 2,000-row pool above the lineup
 * an organizer opens this page to read.
 */

const VIEWS = [
  { key: 'pool', label: 'Pool' },
  { key: 'designers', label: 'Designers' },
  { key: 'lineup', label: 'Lineup' },
];

function EventCallPage() {
  const { linkId } = useParams();
  const [view, setView] = useState('pool');

  const callQuery = useQuery({
    queryKey: ['agency-event-call', linkId],
    queryFn: () => getEventCall(linkId),
    staleTime: 60_000,
  });

  const call = callQuery.data;

  if (callQuery.isError) {
    return (
      <div className="ev">
        <EmptyErrorState
          title="Event cast unavailable"
          body="We could not load this call. It may have been revoked."
          retry={{ label: 'Try again', onClick: () => callQuery.refetch() }}
        />
      </div>
    );
  }

  return (
    <div className="ev">
      <header className="ev-hero">
        <Link className="ev-back" to="/dashboard/agency/events">
          <ChevronLeft size={14} aria-hidden="true" />
          All events
        </Link>
        <h1 className="ev-title">
          {call ? call.event.name || call.label || 'Untitled cast' : 'Loading…'}
        </h1>
        {call && (
          <>
            <div className="ev-hero-meta">
              <span>{formatEventDates(call.event)}</span>
              {call.event.location && (
                <>
                  <span className="ev-hero-sep" aria-hidden="true">·</span>
                  <span>{call.event.location}</span>
                </>
              )}
              <span className="ev-hero-sep" aria-hidden="true">·</span>
              <span>{formatCompensation(call.compensation)}</span>
            </div>
            <div className="ev-hero-figures">
              <Figure label="To review" value={String(call.counts.to_review)} />
              <Figure label="Pool" value={String(call.counts.pool)} />
              <Figure label="Offered" value={String(call.counts.offered)} />
              <Figure label="Confirmed" value={String(call.counts.confirmed)} />
            </div>
          </>
        )}
      </header>

      <div className="ev-switch" role="tablist" aria-label="Event cast views">
        {VIEWS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={view === item.key}
            className={view === item.key ? 'is-on' : ''}
            onClick={() => setView(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {view === 'pool' && (
        <ApplicantsPage
          openCallLinkId={linkId}
          lifecycleTabs={EVENT_LIFECYCLE_TABS}
          actionLabels={EVENT_ACTION_LABELS}
          title="Pool"
        />
      )}
      {view === 'designers' && <PickListsPanel linkId={linkId} />}
      {view === 'lineup' && <LineupPanel linkId={linkId} />}
    </div>
  );
}

export default function EventCallPageWrapper() {
  return (
    <ErrorBoundary>
      <EventCallPage />
    </ErrorBoundary>
  );
}
