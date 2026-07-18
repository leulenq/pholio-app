import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Search, CalendarClock, ChevronRight } from 'lucide-react';
import { getInterviews } from '../api/agency';
import InterviewRow from '../components/InterviewRow';
import { deriveInterviewState } from '../components/interview-state';
import InterviewScheduleModal from '../components/InterviewScheduleModal';
import { AgencyEmptyState } from '../components/ui/AgencyEmptyState';
import { EmptyErrorState } from '../../../shared/components/states';
import './InterviewsPage.css';

const LANES = [
  { key: 'action', label: 'Needs Action', tone: 'action' },
  { key: 'scheduled', label: 'Scheduled', tone: 'scheduled' },
  { key: 'awaiting', label: 'Awaiting Response', tone: 'awaiting' },
];

// Sort upcoming soonest-first; past items most-recent-first.
const byTime = (asc) => (a, b) => {
  const ta = Date.parse(a.proposed_datetime) || 0;
  const tb = Date.parse(b.proposed_datetime) || 0;
  return asc ? ta - tb : tb - ta;
};

export default function InterviewsPage() {
  const [search, setSearch] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['agency-interviews'],
    queryFn: () => getInterviews(),
    staleTime: 30000,
  });

  const interviews = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  // Bucket every interview by its derived lifecycle state.
  const buckets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const acc = { action: [], scheduled: [], awaiting: [], completed: [], cancelled: [] };
    for (const iv of interviews) {
      if (q && !(iv.talent_name || '').toLowerCase().includes(q)) continue;
      const { bucket } = deriveInterviewState(iv);
      (acc[bucket] || acc.awaiting).push(iv);
    }
    acc.action.sort(byTime(true));
    acc.scheduled.sort(byTime(true));
    acc.awaiting.sort(byTime(true));
    acc.completed.sort(byTime(false));
    acc.cancelled.sort(byTime(false));
    return acc;
  }, [interviews, search]);

  const ledger = [
    { label: 'Need Action', value: buckets.action.length, tone: buckets.action.length ? 'gold' : 'mute' },
    { label: 'Scheduled', value: buckets.scheduled.length, tone: 'ink' },
    { label: 'Awaiting', value: buckets.awaiting.length, tone: 'ink' },
    { label: 'Completed', value: buckets.completed.length, tone: 'mute' },
  ];

  const hasAny = interviews.length > 0;
  const visibleCount =
    buckets.action.length + buckets.scheduled.length + buckets.awaiting.length +
    buckets.completed.length + buckets.cancelled.length;

  return (
    <div className="iv-page">
      <header className="iv-header">
        <div>
          <h1 className="iv-page-title">Interviews</h1>
          <p className="iv-page-sub">Coordinate every conversation in your pipeline</p>
        </div>
        <button className="iv-new" onClick={() => setScheduling(true)}>
          <Plus size={16} /> Schedule
        </button>
      </header>

      {hasAny && (
        <div className="iv-search">
          <Search size={15} />
          <input
            className="iv-search-input"
            placeholder="Search talent by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {hasAny && (
        <motion.div
          className="iv-ledger"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        >
          {ledger.map((s) => (
            <div key={s.label} className={`iv-stat iv-stat--${s.tone}`}>
              <span className="iv-stat-num">{s.value}</span>
              <span className="iv-stat-label">{s.label}</span>
            </div>
          ))}
        </motion.div>
      )}

      {isLoading ? (
        <div className="iv-loading">
          <span className="iv-spinner" /> Loading interviews…
        </div>
      ) : isError ? (
        <EmptyErrorState
          variant="compact"
          title="Could not load interviews"
          body="Your scheduled interviews did not load. Try again to refresh."
          retry={{ label: 'Try again', onClick: () => refetch() }}
        />
      ) : !hasAny ? (
        <AgencyEmptyState
          icon={CalendarClock}
          title="No interviews yet"
          description="Schedule a conversation with talent from your pipeline to start coordinating here."
          action={<button className="iv-new" onClick={() => setScheduling(true)}><Plus size={16} /> Schedule an interview</button>}
        />
      ) : visibleCount === 0 ? (
        <div className="iv-noresult">
          <p>No interviews match “{search}”.</p>
          <button className="iv-link" onClick={() => setSearch('')}>Clear search</button>
        </div>
      ) : (
        <div className="iv-lanes">
          {LANES.map((lane) => {
            const items = buckets[lane.key];
            if (items.length === 0) return null;
            return (
              <section className="iv-lane" key={lane.key} data-tone={lane.tone}>
                <div className="iv-lane-head">
                  <h2 className="iv-lane-title">{lane.label}</h2>
                  {lane.key !== 'action' && <span className="iv-lane-count">{items.length}</span>}
                </div>
                <div className="iv-lane-rows">
                  {items.map((iv, i) => <InterviewRow key={iv.id} interview={iv} index={i} />)}
                </div>
              </section>
            );
          })}

          {buckets.completed.length > 0 && (
            <section className="iv-lane iv-lane--completed" data-tone="completed">
              <button className="iv-lane-head iv-lane-head--toggle" onClick={() => setCompletedOpen((v) => !v)}>
                <h2 className="iv-lane-title">Completed</h2>
                <span className="iv-lane-count">{buckets.completed.length}</span>
                <ChevronRight size={15} className={`iv-lane-chev${completedOpen ? ' iv-lane-chev--open' : ''}`} />
              </button>
              {completedOpen && (
                <div className="iv-lane-rows">
                  {buckets.completed.map((iv, i) => <InterviewRow key={iv.id} interview={iv} index={i} />)}
                </div>
              )}
            </section>
          )}

          {buckets.cancelled.length > 0 && (
            <div className="iv-cancelled">
              <button className="iv-link" onClick={() => setShowCancelled((v) => !v)}>
                {showCancelled ? 'Hide' : 'Show'} cancelled ({buckets.cancelled.length})
              </button>
              {showCancelled && (
                <div className="iv-lane-rows iv-lane-rows--muted">
                  {buckets.cancelled.map((iv, i) => <InterviewRow key={iv.id} interview={iv} index={i} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isFetching && !isLoading && <div className="iv-refetch" aria-hidden="true" />}

      <InterviewScheduleModal open={scheduling} onClose={() => setScheduling(false)} />
    </div>
  );
}
