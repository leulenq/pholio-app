import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAgencyAnalytics } from '../api/agency';
import { AgencySkeleton } from '../components/ui';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';
import './AnalyticsPage.css';

/**
 * The Season Report — the agency's pipeline, read as an editorial ledger.
 * Every number is a real aggregate from GET /api/agency/analytics; sections
 * with no observed data render calibrating notes, never placeholders.
 */
const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'Season' },
];

const FORWARD = ['Applied', 'Shortlisted', 'Offered', 'Represented'];

/** One written line derived from the strongest real signal; null hides it. */
function leadInsight(a) {
  if (!a) return null;
  const stages = a.funnel?.stages || [];
  const byName = Object.fromEntries(stages.map((s) => [s.stage, s]));
  // conversionFromPrevious is a bucket-size ratio; above 100% it stops
  // describing a hand-off (the downstream stage outholds the upstream one),
  // so only sensible ratios qualify as an insight.
  const conversions = FORWARD.slice(1)
    .map((name) => byName[name])
    .filter((s) => s && s.conversionFromPrevious != null && s.conversionFromPrevious <= 100 && s.count >= 2);
  if (conversions.length) {
    const best = conversions.reduce((m, s) => (s.conversionFromPrevious > m.conversionFromPrevious ? s : m));
    return `${best.conversionFromPrevious}% of talent reaching ${best.stage} advanced from the stage before — the strongest hand-off in the pipeline right now.`;
  }
  const moves = (a.velocity || []).filter((v) => v.medianDays != null && v.sampleSize >= 2);
  if (moves.length) {
    const fastest = moves.reduce((m, v) => (v.medianDays < m.medianDays ? v : m));
    return `Talent moves from ${fastest.from} to ${fastest.to} in a median of ${fastest.medianDays} days — the fastest decision in the pipeline.`;
  }
  const growth = a.rosterGrowth || [];
  if (growth.length >= 2) {
    const delta = growth[growth.length - 1].count - growth[0].count;
    if (delta > 0) return `The roster grew by ${delta} in the last twelve months, closing at ${growth[growth.length - 1].count} represented talent.`;
  }
  return null;
}

function FunnelLedger({ funnel }) {
  const stages = funnel?.stages || [];
  const byName = Object.fromEntries(stages.map((s) => [s.stage, s]));
  const total = FORWARD.reduce((sum, name) => sum + (byName[name]?.count || 0), 0);
  const passed = byName.Passed?.count || 0;

  if (total === 0 && passed === 0) {
    return <p className="sr-calibrating">The funnel appears once submissions land in this window.</p>;
  }
  return (
    <div className="sr-funnel">
      {FORWARD.map((name) => {
        const s = byName[name] || { count: 0, conversionFromPrevious: null };
        return (
          <div className="sr-funnel-row" key={name}>
            <span className="sr-funnel-num">{s.count}</span>
            <span className="sr-funnel-stage">{name}</span>
            <span className="sr-funnel-conv">
              {s.conversionFromPrevious != null && s.conversionFromPrevious <= 100
                ? `${s.conversionFromPrevious}% advance`
                : ''}
            </span>
          </div>
        );
      })}
      <p className="sr-funnel-exit">{passed} passed on in this window.</p>
    </div>
  );
}

function VelocityTable({ velocity }) {
  const rows = velocity || [];
  const observed = rows.some((v) => v.medianDays != null);
  if (!observed) {
    return <p className="sr-calibrating">Velocity appears once submissions start moving between stages.</p>;
  }
  return (
    <table className="sr-velocity">
      <thead>
        <tr>
          <th scope="col">Transition</th>
          <th scope="col">Median</th>
          <th scope="col">Average</th>
          <th scope="col">Moves</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((v) => (
          <tr key={`${v.from}-${v.to}`}>
            <td>{v.from} → {v.to}</td>
            <td>{v.medianDays != null ? `${v.medianDays}d` : '—'}</td>
            <td>{v.averageDays != null ? `${v.averageDays}d` : '—'}</td>
            <td>{v.sampleSize}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RosterLine({ rosterGrowth }) {
  const points = rosterGrowth || [];
  const max = Math.max(...points.map((p) => p.count), 1);
  if (points.length < 2 || points.every((p) => p.count === 0)) {
    return <p className="sr-calibrating">Roster growth draws itself as talent signs.</p>;
  }
  const W = 560;
  const H = 96;
  const PAD = 6;
  const x = (i) => PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const y = (c) => H - PAD - (c / max) * (H - PAD * 2);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const label = `Roster size by month: ${points.map((p) => `${p.month} ${p.count}`).join(', ')}`;

  return (
    <figure className="sr-roster" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} className="sr-roster-svg" role="img" aria-hidden="true" preserveAspectRatio="none">
        <path d={d} className="sr-roster-path" />
        <circle cx={x(points.length - 1)} cy={y(last.count)} r="3" className="sr-roster-dot" />
      </svg>
      <figcaption className="sr-roster-caption">
        <span>{points[0].month}</span>
        <span className="sr-roster-now">{last.count} on the roster · {last.month}</span>
      </figcaption>
    </figure>
  );
}

function AnalyticsPage() {
  const [range, setRange] = useState(90);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['agency-analytics', range],
    queryFn: () => getAgencyAnalytics(range),
    staleTime: 60000,
  });

  const insight = useMemo(() => leadInsight(data), [data]);
  const inWindow = data?.funnel?.stages?.reduce((sum, s) => sum + s.count, 0) ?? 0;

  return (
    <div className="sr-page">
      <header className="sr-header">
        <div>
          <h1 className="sr-title">The Season</h1>
          <p className="sr-sub">How the pipeline performed</p>
        </div>
        <div className="sr-ranges" role="tablist" aria-label="Report range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              role="tab"
              aria-selected={range === r.days}
              className={`sr-range${range === r.days ? ' sr-range--on' : ''}`}
              onClick={() => setRange(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {isLoading && (
        <div className="sr-loading">
          <AgencySkeleton variant="strip" count={3} />
          <AgencySkeleton variant="row" count={4} />
        </div>
      )}

      {isError && (
        <div className="sr-error">
          <p>The report couldn’t load.</p>
          <button className="sr-retry" onClick={() => refetch()}>Try again</button>
        </div>
      )}

      {!isLoading && !isError && data && (
        <>
          {insight && <p className="sr-insight">{insight}</p>}

          <section className="sr-section">
            <h2 className="sr-section-title">The funnel</h2>
            <p className="sr-section-note">{inWindow} submissions in this window</p>
            <FunnelLedger funnel={data.funnel} />
          </section>

          <section className="sr-section">
            <h2 className="sr-section-title">Velocity</h2>
            <p className="sr-section-note">How long talent sits before each decision</p>
            <VelocityTable velocity={data.velocity} />
          </section>

          <section className="sr-section">
            <h2 className="sr-section-title">The roster</h2>
            <p className="sr-section-note">Twelve months of represented talent</p>
            <RosterLine rosterGrowth={data.rosterGrowth} />
          </section>

          <section className="sr-section sr-section--foot">
            <div className="sr-foot-ledger">
              <div className="sr-foot-stat">
                <span className="sr-foot-num">{data.acceptanceRate ?? 0}%</span>
                <span className="sr-foot-label">Acceptance rate</span>
              </div>
              <div className="sr-foot-stat">
                <span className="sr-foot-num">{data.matchScores?.average ?? 0}</span>
                <span className="sr-foot-label">Average match</span>
              </div>
              <div className="sr-foot-stat">
                <span className="sr-foot-num">{data.byStatus?.total ?? 0}</span>
                <span className="sr-foot-label">All-time submissions</span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default function AnalyticsPageWrapper() {
  return (
    <ErrorBoundary>
      <AnalyticsPage />
    </ErrorBoundary>
  );
}
