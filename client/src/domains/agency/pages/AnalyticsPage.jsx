import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { getAgencyAnalytics } from '../api/agency';
import { AgencyEmptyState } from '../components/ui/AgencyEmptyState';
import { EmptyErrorState } from '../../../shared/components/states';
import './AnalyticsPage.css';

/* ── Ledger ─────────────────────────────────────────────────── */
function Ledger({ byStatus, acceptanceRate }) {
  const items = [
    { label: 'Applications',    value: byStatus.total,    tone: 'ink' },
    { label: 'Under Review',    value: byStatus.pending,  tone: byStatus.pending ? 'gold' : 'mute' },
    { label: 'Accepted',        value: byStatus.accepted, tone: 'ink' },
    { label: 'Acceptance Rate', value: `${acceptanceRate}%`, tone: 'mute' },
  ];
  return (
    <motion.div
      className="an-ledger"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 55, damping: 16 }}
    >
      {items.map((s) => (
        <div key={s.label} className={`an-stat an-stat--${s.tone}`}>
          <span className="an-stat-num">{s.value}</span>
          <span className="an-stat-label">{s.label}</span>
        </div>
      ))}
    </motion.div>
  );
}

/* ── Funnel ─────────────────────────────────────────────────── */
function ConversionPct({ count, prevCount }) {
  if (prevCount == null || prevCount === 0) return null;
  const pct = Math.round((count / prevCount) * 100);
  const cls = pct >= 50 ? 'an-pct--pos' : pct >= 25 ? 'an-pct--warn' : 'an-pct--neg';
  return <span className={`an-stage-pct ${cls}`}>{pct}%</span>;
}

function FunnelConnector({ receivingCount, maxCount, index }) {
  const strokeWidth = 2 + ((receivingCount / Math.max(maxCount, 1)) * 8);
  return (
    <svg className="an-stage-connector" viewBox="0 0 48 48">
      <motion.path
        d="M 0 24 L 44 24"
        stroke="rgba(201,165,90,0.4)"
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.4 + index * 0.08, duration: 0.5, ease: 'easeOut' }}
      />
      <polygon points="40,20 48,24 40,28" fill="rgba(201,165,90,0.4)" />
    </svg>
  );
}

function FunnelView({ byStatus }) {
  const reviewed = byStatus.accepted + byStatus.declined;
  const stages = [
    { id: 'applied',  label: 'Applications', count: byStatus.total },
    { id: 'reviewed', label: 'Reviewed',     count: reviewed },
    { id: 'accepted', label: 'Accepted',     count: byStatus.accepted },
  ];
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className="an-funnel">
      <h2 className="an-section-title">Application Outcomes</h2>
      <div className="an-funnel-row">
        {stages.map((stage, i) => (
          <React.Fragment key={stage.id}>
            <motion.div
              className="an-stage"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 55, damping: 16, delay: i * 0.06 }}
            >
              <span className="an-stage-label">{stage.label}</span>
              <span className="an-stage-count">{stage.count}</span>
              <ConversionPct count={stage.count} prevCount={i > 0 ? stages[i - 1].count : null} />
            </motion.div>
            {i < stages.length - 1 && (
              <FunnelConnector receivingCount={stages[i + 1].count} maxCount={maxCount} index={i} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ── Applications timeline (30 days) ────────────────────────── */
const CHART_W = 600;
const CHART_H = 100;
const LABEL_H = 20;
const SVG_H = CHART_H + LABEL_H;

function ApplicationsTimeline({ timeline, overTime }) {
  const hasVolume = timeline.some((d) => d.count > 0);
  const maxDomain = Math.max(...timeline.map((d) => d.count), 1) * 1.2;
  const toX = (i) => (i / Math.max(timeline.length - 1, 1)) * CHART_W;
  const toY = (count) => CHART_H - (count / maxDomain) * CHART_H;
  const lineD = timeline.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.count)}`).join(' ');
  const fillD = `${lineD} L ${toX(timeline.length - 1)} ${CHART_H} L ${toX(0)} ${CHART_H} Z`;
  const labelEvery = Math.max(1, Math.round(timeline.length / 6));

  return (
    <div className="an-panel">
      <h3 className="an-panel-title">Applications — last 30 days</h3>
      {hasVolume ? (
        <>
          <svg
            viewBox={`0 0 ${CHART_W} ${SVG_H}`}
            style={{ width: '100%', height: SVG_H, display: 'block' }}
            preserveAspectRatio="none"
          >
            <path d={fillD} fill="rgba(201,165,90,0.12)" />
            <motion.path
              d={lineD}
              fill="none"
              stroke="#C9A55A"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: 'easeInOut' }}
            />
            {timeline.map((d, i) => (
              (i % labelEvery === 0 || i === timeline.length - 1) ? (
                <text
                  key={d.date}
                  x={toX(i)}
                  y={SVG_H - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#9b9082"
                  fontFamily="Inter, sans-serif"
                >
                  {Number(d.date.slice(8, 10))}
                </text>
              ) : null
            ))}
          </svg>
          <div className="an-overtime">
            <span><strong>{overTime.today}</strong> today</span>
            <span><strong>{overTime.thisWeek}</strong> this week</span>
            <span><strong>{overTime.thisMonth}</strong> this month</span>
            <span><strong>{overTime.last3Months}</strong> last 3 months</span>
          </div>
        </>
      ) : (
        <p className="an-module-empty">Applications appear here as talent submit to your agency.</p>
      )}
    </div>
  );
}

/* ── Match score distribution ───────────────────────────────── */
const SCORE_BANDS = [
  { key: 'excellent', label: 'Excellent (80+)', cls: 'gold' },
  { key: 'good',      label: 'Good (60–79)',    cls: 'success' },
  { key: 'fair',      label: 'Fair (40–59)',    cls: 'warning' },
  { key: 'poor',      label: 'Poor (<40)',      cls: 'muted' },
];

function MatchScorePanel({ matchScores }) {
  const { distribution, average, total } = matchScores;
  return (
    <div className="an-panel">
      <h3 className="an-panel-title">Match Score Distribution</h3>
      {total > 0 ? (
        <>
          <p className="an-panel-subtitle">Average {average} across {total} scored candidate{total === 1 ? '' : 's'}</p>
          <div className="an-dist">
            {SCORE_BANDS.map((band) => {
              const count = distribution[band.key] || 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={band.key} className="an-dist-row">
                  <span className="an-dist-label">{band.label}</span>
                  <div className="an-dist-track">
                    <div className={`an-dist-fill an-dist-fill--${band.cls}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="an-dist-count">{count}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="an-module-empty">Match scores appear once talent are ranked on your casting boards.</p>
      )}
    </div>
  );
}

/* ── Board breakdown ────────────────────────────────────────── */
function BoardBreakdownPanel({ byBoard }) {
  const maxCount = Math.max(...byBoard.map((b) => b.count), 1);
  return (
    <div className="an-panel">
      <h3 className="an-panel-title">Applications by Board</h3>
      {byBoard.length > 0 ? (
        <div className="an-board-list">
          {byBoard.map((b) => (
            <div key={b.board_id} className="an-board-row">
              <span className="an-board-name">{b.board_name}</span>
              <div className="an-board-track">
                <div className="an-board-fill" style={{ width: `${Math.round((b.count / maxCount) * 100)}%` }} />
              </div>
              <span className="an-board-count">{b.count}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="an-module-empty">Board activity appears once you assign talent to casting boards.</p>
      )}
    </div>
  );
}

/* ── Skeleton ───────────────────────────────────────────────── */
function AnalyticsSkeleton() {
  return (
    <div className="an-skeleton" aria-hidden="true">
      <div className="an-skel-block an-skel-block--ledger" />
      <div className="an-skel-block an-skel-block--wide" />
      <div className="an-skel-zone">
        <div className="an-skel-block" />
        <div className="an-skel-block" />
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export default function AnalyticsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['agency-analytics'],
    queryFn: getAgencyAnalytics,
    staleTime: 60000,
  });

  const analytics = data?.analytics || null;

  return (
    <div className="an-page">
      <header className="an-header">
        <h1 className="an-title">Analytics</h1>
        <p className="an-sub">How submissions move through your pipeline</p>
      </header>

      {isLoading ? (
        <AnalyticsSkeleton />
      ) : isError || !analytics ? (
        <EmptyErrorState
          variant="section"
          title="Could not load analytics"
          body="Your pipeline analytics did not load. Try again to refresh."
          retry={{ label: 'Try again', onClick: () => refetch() }}
        />
      ) : analytics.byStatus.total === 0 ? (
        <AgencyEmptyState
          icon={BarChart3}
          title="No application data yet"
          description="Analytics populate as talent apply to your agency. Once submissions arrive, you'll see outcomes, volume, and match-score trends here."
        />
      ) : (
        <>
          <Ledger byStatus={analytics.byStatus} acceptanceRate={analytics.acceptanceRate} />
          <FunnelView byStatus={analytics.byStatus} />
          <ApplicationsTimeline timeline={analytics.timeline} overTime={analytics.overTime} />
          <div className="an-zone3">
            <MatchScorePanel matchScores={analytics.matchScores} />
            <BoardBreakdownPanel byBoard={analytics.byBoard} />
          </div>
        </>
      )}
    </div>
  );
}
