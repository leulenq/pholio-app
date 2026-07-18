import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import { getAgencyActivity } from '../api/agency';
import { AgencySkeleton } from '../components/ui/AgencySkeleton';
import { AgencyEmptyState } from '../components/ui/AgencyEmptyState';
import { StatusText } from '../components/ui/StatusText';
import { EmptyErrorState } from '../../../shared/components/states';
import './ActivityPage.css';

/** Human labels for the quiet type filters. Unknown types title-case. */
const TYPE_LABELS = {
  status_change: 'Status',
  note_added: 'Notes',
  application_created: 'New submissions',
  profile_viewed: 'Views',
  message_sent: 'Messages',
};

function typeLabel(type) {
  return (
    TYPE_LABELS[type] ||
    String(type || '')
      .replace(/_/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

function initials(name = '') {
  if (!name.trim()) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function groupByDate(activities) {
  const groups = [];
  const index = new Map();
  for (const activity of activities) {
    const date = new Date(activity.created_at);
    let label = Number.isNaN(date.getTime()) ? 'Earlier' : format(date, 'MMMM d');
    if (!Number.isNaN(date.getTime())) {
      if (isToday(date)) label = 'Today';
      else if (isYesterday(date)) label = 'Yesterday';
    }
    if (!index.has(label)) {
      index.set(label, groups.length);
      groups.push({ label, items: [] });
    }
    groups[index.get(label)].items.push(activity);
  }
  return groups;
}

export default function ActivityPage() {
  const [filter, setFilter] = useState('all');
  const reduceMotion = useReducedMotion();

  const { data: activities = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['agency', 'activity'],
    queryFn: () => getAgencyActivity(),
    refetchInterval: 60000,
  });

  // Quiet text filters, derived from the types actually present. Counts inline.
  const filters = useMemo(() => {
    const counts = new Map();
    for (const a of activities) {
      counts.set(a.activity_type, (counts.get(a.activity_type) || 0) + 1);
    }
    const options = [{ key: 'all', label: 'All', count: activities.length }];
    for (const [type, count] of counts) {
      options.push({ key: type, label: typeLabel(type), count });
    }
    return options;
  }, [activities]);

  const visible = useMemo(
    () => (filter === 'all' ? activities : activities.filter((a) => a.activity_type === filter)),
    [activities, filter],
  );

  const groups = useMemo(() => groupByDate(visible), [visible]);

  return (
    <div className="ac-page">
      <header className="ac-header">
        <h1 className="ac-page-title">Activity</h1>
        <p className="ac-page-sub">Every movement across your roster, newest first</p>
      </header>

      {!isLoading && !isError && activities.length > 0 && (
        <nav className="ac-filters" aria-label="Filter activity by type">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`ac-filter${filter === f.key ? ' ac-filter--active' : ''}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="ac-filter-count">{f.count}</span>
            </button>
          ))}
        </nav>
      )}

      {isLoading ? (
        <div className="ac-loading">
          <AgencySkeleton variant="row" count={8} />
        </div>
      ) : isError ? (
        <EmptyErrorState
          variant="section"
          title="Could not load activity"
          body="Your roster activity did not load. Try again to refresh the feed."
          retry={{ label: 'Try again', onClick: () => refetch() }}
        />
      ) : activities.length === 0 ? (
        <AgencyEmptyState
          icon={Clock}
          title="No activity yet"
          description="As your team reviews submissions and moves talent through the pipeline, every step is recorded here."
        />
      ) : visible.length === 0 ? (
        <div className="ac-noresult">
          <p>No {typeLabel(filter).toLowerCase()} activity yet.</p>
          <button type="button" className="ac-link" onClick={() => setFilter('all')}>
            Show all activity
          </button>
        </div>
      ) : (
        <div className="ac-feed">
          {groups.map((group) => (
            <section key={group.label} className="ac-group">
              <h2 className="ac-date">{group.label}</h2>
              <div className="ac-rows">
                {group.items.map((item, i) => {
                  const newStatus = item.metadata?.new_status;
                  return (
                    <motion.div
                      key={item.id}
                      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.25,
                        ease: [0.4, 0, 0.2, 1],
                        delay: reduceMotion ? 0 : Math.min(i * 0.03, 0.18),
                      }}
                    >
                      <Link
                        to={`/dashboard/agency/talent/${item.application_id}`}
                        className="ac-row"
                      >
                        {item.talentImage ? (
                          <span
                            className="ac-avatar"
                            style={{ backgroundImage: `url(${item.talentImage})` }}
                            aria-hidden="true"
                          />
                        ) : (
                          <span className="ac-avatar ac-avatar--fallback" aria-hidden="true">
                            {initials(item.talentName)}
                          </span>
                        )}

                        <div className="ac-row-main">
                          <p className="ac-row-text">
                            {item.talentName && <strong>{item.talentName}</strong>}{' '}
                            {item.description}
                            {item.activity_type === 'status_change' && newStatus && (
                              <>
                                {' — '}
                                <StatusText status={newStatus} className="ac-row-status" />
                              </>
                            )}
                          </p>
                          <p className="ac-row-meta">
                            {item.application_label}
                            {item.application_label ? ' · ' : ''}
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
