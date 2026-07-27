import React, { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { getSeasonAnalytics } from '../api/agency';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';

import { Panel, LegendKey, VizTable } from '../components/analytics/Panel';
import { SignalRail } from '../components/analytics/SignalRail';
import { FlowRibbon } from '../components/analytics/FlowRibbon';
import { VolumeStream } from '../components/analytics/VolumeStream';
import { QueueAging } from '../components/analytics/QueueAging';
import { MatchCalibration } from '../components/analytics/MatchCalibration';
import { BoardQuadrant } from '../components/analytics/BoardQuadrant';
import { Punchcard, CohortGrid } from '../components/analytics/HeatGrid';
import { DistributionBars, Meter } from '../components/analytics/DistributionBars';
import { PairedHistogram } from '../components/analytics/PairedHistogram';
import { FitRadar } from '../components/analytics/FitRadar';
import { RosterFlow } from '../components/analytics/RosterFlow';
import {
  VIZ,
  STAGE_COLOR,
  VOLUME_STACK,
  formatBucket,
  formatMonth,
  formatValue,
  humanize,
} from '../components/analytics/viz';

import './AnalyticsPage.css';

/**
 * The Season — the agency's analytics command surface.
 *
 * Three lenses over one filter row: how the pipeline flowed, what the roster is
 * made of, and how the desk actually works. Every panel is a real aggregate
 * from GET /api/agency/analytics/season; a panel with nothing observed says so
 * in a sentence rather than drawing a confident empty chart.
 */

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'Season' },
  { days: 730, label: 'Two years' },
];

const LENSES = [
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'roster', label: 'Roster' },
  { key: 'desk', label: 'Desk' },
];

const rise = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
};

const pct = (value) => (value == null ? '—' : `${value}%`);
const num = (value) => (value == null ? '—' : `${value}`);

// ---------------------------------------------------------------------------
// Pipeline lens
// ---------------------------------------------------------------------------

function PipelineLens({ data }) {
  const { flow, volume, queue, calibration, boards, cohorts, meta } = data;
  const stages = useMemo(() => flow?.stages || [], [flow]);
  const signed = flow?.signed || 0;
  const cohort = flow?.cohort || 0;

  // The one written line on this lens, and only when a real hand-off carries it.
  const strongestHandoff = useMemo(() => {
    const candidates = stages.filter((s) => s.conversion != null && s.reached >= 3);
    if (!candidates.length) return null;
    return candidates.reduce((best, s) => (s.conversion > best.conversion ? s : best));
  }, [stages]);

  const boardsWithVolume = (boards || []).filter((b) => b.submissions > 0);

  return (
    <>
      <Panel
        span={12}
        title="How the season flowed"
        reading={
          cohort
            ? `${signed} of ${cohort} submissions reached representation${
                strongestHandoff
                  ? ` · strongest hand-off is ${strongestHandoff.stage} at ${strongestHandoff.conversion}%`
                  : ''
              }`
            : undefined
        }
        note="A stage counts as reached only where a recorded status change or the current status evidences it — a status jump never invents the hand-offs it skipped."
        empty={cohort ? null : 'The flow draws itself once submissions land in this window.'}
        legend={
          <>
            {stages.map((s, i) => (
              <LegendKey key={s.stage} color={VIZ.depth[i]} label={s.stage} />
            ))}
            <LegendKey color={VIZ.exit} label="Passed" />
          </>
        }
        table={
          <VizTable
            caption={`Pipeline flow for ${cohort} submissions`}
            columns={['Stage', 'Reached', 'Advanced', 'Holding', 'Passed', 'Conversion', 'Median in stage']}
            rows={stages.map((s) => [
              s.stage,
              s.reached,
              s.advanced,
              s.held,
              s.exited,
              pct(s.conversion),
              s.medianDwellDays != null ? `${s.medianDwellDays}d (n=${s.dwellSample})` : 'not yet timed',
            ])}
          />
        }
      >
        <FlowRibbon flow={flow} />
      </Panel>

      <Panel
        span={8}
        title="Intake and where it landed"
        reading={`${volume?.series?.reduce((sum, r) => sum + r.total, 0) || 0} submissions across the window`}
        note={`Line is the trailing ${volume?.windowSize || 7}-${volume?.granularity || 'day'} average of the same total.`}
        empty={cohort ? null : 'Nothing arrived in this window.'}
        legend={[...VOLUME_STACK].reverse().map((s) => (
          <LegendKey key={s.key} color={s.color} label={s.label} />
        ))}
        table={
          <VizTable
            caption="Submissions per bucket by outcome"
            columns={['Bucket', 'Total', 'Still applied', 'Shortlisted', 'Offered', 'Signed', 'Passed']}
            rows={(volume?.series || [])
              .filter((r) => r.total > 0)
              .map((r) => [
                formatBucket(r.bucket, volume.granularity),
                r.total,
                r.applied,
                r.shortlisted,
                r.offered,
                r.signed,
                r.passed,
              ])}
          />
        }
      >
        <VolumeStream volume={volume} />
      </Panel>

      <Panel
        span={4}
        title="Open work by age"
        reading={
          queue?.total
            ? `${queue.total} open · oldest untouched for ${queue.oldestDays} days`
            : undefined
        }
        note="Age runs from the last recorded action, not the submission date, and ignores the reporting window — stale work does not expire."
        empty={queue?.total ? null : 'Nothing is waiting on the desk.'}
        table={
          <VizTable
            caption="Open submissions by time since last action"
            columns={['Age', 'Open', 'Never opened']}
            rows={(queue?.buckets || []).map((b) => [b.label, b.count, b.unviewed])}
          />
        }
      >
        <QueueAging queue={queue} />
      </Panel>

      <Panel
        span={6}
        title="Match score against what the desk did"
        reading={
          calibration?.separation != null
            ? `Signed talent scored ${calibration.separation} points above passed talent`
            : undefined
        }
        note={
          calibration?.sample
            ? `${calibration.sample} scored submissions. A climbing line means the score is calibrated; a flat one means it is decorative.`
            : undefined
        }
        empty={calibration?.sample ? null : 'Match scores appear once submissions are scored against a board.'}
        legend={
          <>
            <LegendKey color={VIZ.depth[0]} label="Still open" />
            <LegendKey color={VIZ.depth[2]} label="Advanced" />
            <LegendKey color={VIZ.depth[3]} label="Signed" />
            <LegendKey color={VIZ.exit} label="Passed" />
            <LegendKey color={VIZ.series[1]} label="Advance rate" shape="line" />
          </>
        }
        table={
          <VizTable
            caption="Outcome by match score band"
            columns={['Score', 'Scored', 'Still open', 'Advanced', 'Signed', 'Passed', 'Advance rate']}
            rows={(calibration?.bins || []).map((b) => [
              b.label,
              b.total,
              b.open,
              b.advanced,
              b.signed,
              b.passed,
              pct(b.advanceRate),
            ])}
          />
        }
      >
        <MatchCalibration calibration={calibration} />
      </Panel>

      <Panel
        span={6}
        title="Boards by score and conversion"
        reading={
          boardsWithVolume.length
            ? `${boardsWithVolume.length} ${boardsWithVolume.length === 1 ? 'board' : 'boards'} took submissions this window`
            : undefined
        }
        note="Bubble area is submission volume. Crosshair sits at this agency's own medians."
        empty={
          boardsWithVolume.length
            ? null
            : 'Boards appear here once submissions are assigned and scored against them.'
        }
        table={
          <VizTable
            caption="Board performance"
            columns={['Board', 'Submissions', 'Average match', 'Advance rate', 'Signed', 'Slots filled']}
            rows={(boards || []).map((b) => [
              b.name,
              b.submissions,
              num(b.averageMatch),
              pct(b.advanceRate),
              b.signed,
              b.targetSlots ? `${b.filled} of ${b.targetSlots}` : num(b.filled),
            ])}
          />
        }
      >
        <BoardQuadrant boards={boards} />
      </Panel>

      <Panel
        span={12}
        title="Cohort progression"
        reading="Each month's intake and how far it got"
        note="Applied is not drawn — every submission reaches it by definition, so the column would carry no information. Read down a column to see whether the desk is getting better at a stage, and across a row to see one month's whole journey."
        empty={cohorts?.length ? null : 'Cohorts build up over the first months of submissions.'}
        table={
          <VizTable
            caption="Share of each monthly cohort reaching each stage"
            columns={['Month', 'Submitted', ...(meta?.stages || [])]}
            rows={(cohorts || []).map((c) => [
              formatMonth(c.month),
              c.size,
              ...c.stages.map((s) => `${s.count} (${pct(s.rate)})`),
            ])}
          />
        }
      >
        <CohortGrid
          cohorts={(cohorts || []).map((c) => ({ ...c, stages: c.stages.slice(1) }))}
          stages={(meta?.stages || []).slice(1)}
        />
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Roster lens
// ---------------------------------------------------------------------------

function RosterLens({ data }) {
  const { roster } = data;
  if (!roster) return null;

  const movement = roster.growth || [];
  const netThisYear = movement.reduce((sum, m) => sum + m.net, 0);
  const heightsObserved = roster.coverage?.heights || 0;
  const agesObserved = roster.coverage?.ages || 0;
  const fitObserved = roster.coverage?.fit || 0;

  return (
    <>
      <Panel
        span={7}
        title="Roster movement"
        reading={
          roster.size
            ? `${roster.size} represented · ${netThisYear >= 0 ? '+' : ''}${netThisYear} over twelve months`
            : undefined
        }
        note="Signings above the line, departures below. Roster size runs underneath on its own scale."
        empty={roster.size || roster.everSize ? null : 'Roster movement draws itself as talent signs.'}
        legend={
          <>
            <LegendKey color={VIZ.series[0]} label="Signed" />
            <LegendKey color={VIZ.series[1]} label="Left" />
            <LegendKey color={VIZ.depth[3]} label="On the roster" shape="line" />
          </>
        }
        table={
          <VizTable
            caption="Roster movement by month"
            columns={['Month', 'Signed', 'Left', 'Net', 'On the roster']}
            rows={movement.map((m) => [
              formatMonth(m.month),
              m.joined,
              m.left,
              m.net > 0 ? `+${m.net}` : `${m.net}`,
              m.total,
            ])}
          />
        }
      >
        <RosterFlow growth={movement} />
      </Panel>

      <Panel
        span={5}
        title="Divisions"
        reading={roster.boardMix?.length ? `${roster.size} across ${roster.boardMix.length} ${roster.boardMix.length === 1 ? 'division' : 'divisions'}` : undefined}
        empty={roster.boardMix?.length ? null : 'Divisions appear once roster talent is assigned to a board.'}
        table={
          <VizTable
            caption="Roster by division"
            columns={['Division', 'Talent', 'Share']}
            rows={(roster.boardMix || []).map((b) => [b.board, b.count, pct(b.share)])}
          />
        }
      >
        <DistributionBars
          items={(roster.boardMix || []).map((b) => ({
            key: b.board,
            label: b.board,
            value: b.count,
            valueLabel: 'Talent',
          }))}
        />
      </Panel>

      <Panel
        span={6}
        title="Height profile"
        reading={
          heightsObserved
            ? `Measured on ${heightsObserved} of ${roster.size} represented`
            : undefined
        }
        note="Both series are shares of their own group, so a roster of forty and an intake of four hundred stay comparable."
        empty={heightsObserved ? null : 'Height comparison appears once roster profiles carry measurements.'}
        legend={
          <>
            <LegendKey color={VIZ.series[0]} label="Roster" />
            <LegendKey color={VIZ.series[1]} label="Incoming" />
          </>
        }
        table={
          <VizTable
            caption="Height distribution, roster against incoming"
            columns={['Height (cm)', 'Roster', 'Incoming']}
            rows={(roster.heights || []).map((h) => [h.label, h.roster, h.pipeline])}
          />
        }
      >
        <PairedHistogram bins={roster.heights} />
      </Panel>

      <Panel
        span={6}
        title="Age profile"
        reading={agesObserved ? `Dated on ${agesObserved} of ${roster.size} represented` : undefined}
        empty={agesObserved ? null : 'Age comparison appears once roster profiles carry a date of birth.'}
        legend={
          <>
            <LegendKey color={VIZ.series[0]} label="Roster" />
            <LegendKey color={VIZ.series[1]} label="Incoming" />
          </>
        }
        table={
          <VizTable
            caption="Age distribution, roster against incoming"
            columns={['Age', 'Roster', 'Incoming']}
            rows={(roster.ages || []).map((a) => [a.label, a.roster, a.pipeline])}
          />
        }
      >
        <PairedHistogram bins={roster.ages} />
      </Panel>

      <Panel
        span={4}
        title="Category signature"
        reading={fitObserved ? `Averaged over ${fitObserved} represented` : undefined}
        note="Where the incoming shape bulges outside the roster shape, the market is sending something the house does not yet represent."
        empty={fitObserved ? null : 'Category fit appears once profiles have been analysed.'}
        legend={
          <>
            <LegendKey color={VIZ.series[0]} label="Roster" />
            <LegendKey color={VIZ.series[1]} label="Incoming" />
          </>
        }
        table={
          <VizTable
            caption="Average category fit, roster against incoming"
            columns={['Category', 'Roster', 'Incoming', 'Measured on']}
            rows={(roster.fit || []).map((f) => [
              f.axis,
              num(f.roster),
              num(f.pipeline),
              `${f.rosterSample} / ${f.pipelineSample}`,
            ])}
          />
        }
      >
        <FitRadar axes={roster.fit} />
      </Panel>

      <Panel
        span={4}
        title="Markets"
        reading={roster.markets?.length ? `${roster.markets.length} ${roster.markets.length === 1 ? 'market' : 'markets'} represented` : undefined}
        empty={roster.markets?.length ? null : 'Markets appear once roster profiles carry a city.'}
        table={
          <VizTable
            caption="Roster by market"
            columns={['Market', 'Talent', 'Share']}
            rows={(roster.markets || []).map((m) => [humanize(m.market), m.count, pct(m.share)])}
          />
        }
      >
        <DistributionBars
          items={(roster.markets || []).map((m) => ({
            key: m.market,
            label: humanize(m.market),
            value: m.count,
            valueLabel: 'Talent',
          }))}
        />
      </Panel>

      <Panel
        span={4}
        title="Tenure"
        reading={roster.size ? 'How long the roster has been with the house' : undefined}
        empty={roster.size ? null : 'Tenure appears once talent has been signed.'}
        table={
          <VizTable
            caption="Roster by tenure"
            columns={['Tenure', 'Talent']}
            rows={(roster.tenure || []).map((t) => [t.label, t.count])}
          />
        }
      >
        <DistributionBars
          items={(roster.tenure || []).map((t) => ({
            key: t.key,
            label: t.label,
            value: t.count,
            valueLabel: 'Talent',
          }))}
          ordinal
        />
      </Panel>

      <Panel
        span={6}
        title="Development stage"
        reading={roster.stages?.length ? 'New faces against the established book' : undefined}
        empty={roster.stages?.length ? null : 'Stages appear once roster talent is placed on a development track.'}
        table={
          <VizTable
            caption="Roster by development stage"
            columns={['Stage', 'Talent', 'Share']}
            rows={(roster.stages || []).map((s) => [humanize(s.stage), s.count, pct(s.share)])}
          />
        }
      >
        <DistributionBars
          items={(roster.stages || []).map((s) => ({
            key: s.stage,
            label: humanize(s.stage),
            value: s.count,
            valueLabel: 'Talent',
          }))}
        />
      </Panel>

      <Panel
        span={6}
        title="Experience"
        reading={roster.experience?.length ? 'Declared experience across the roster' : undefined}
        empty={roster.experience?.length ? null : 'Experience appears once roster profiles declare a level.'}
        table={
          <VizTable
            caption="Roster by declared experience"
            columns={['Level', 'Talent']}
            rows={(roster.experience || []).map((e) => [humanize(e.level), e.count])}
          />
        }
      >
        <DistributionBars
          items={(roster.experience || []).map((e) => ({
            key: e.level,
            label: humanize(e.level),
            value: e.count,
            valueLabel: 'Talent',
          }))}
        />
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Desk lens
// ---------------------------------------------------------------------------

function DeskLens({ data }) {
  const { desk } = data;
  if (!desk) return null;

  const { latency, team, interviews, reminders } = desk;

  return (
    <>
      <Panel
        span={12}
        title="When the desk works"
        reading={
          desk.punchTotal
            ? `${desk.punchTotal} recorded actions across the window`
            : undefined
        }
        note="Grouped in your own timezone. Darker means busier."
        empty={desk.punchTotal ? null : 'The working pattern appears once the team acts on submissions.'}
        table={
          <VizTable
            caption="Desk actions by day and hour"
            columns={['Day', 'Actions']}
            rows={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, dow) => [
              label,
              (desk.punchcard || []).filter((c) => c.dow === dow).reduce((sum, c) => sum + c.count, 0),
            ])}
          />
        }
      >
        <Punchcard punchcard={desk.punchcard} punchMax={desk.punchMax} />
      </Panel>

      <Panel
        span={6}
        title="Time to first response"
        reading={
          latency?.sample
            ? `Median ${formatValue(latency.medianHours, 'hours')} · nine in ten inside ${formatValue(latency.p90Hours, 'hours')}`
            : undefined
        }
        note={latency?.sample ? `Measured on ${latency.sample} submissions that have been touched.` : undefined}
        empty={latency?.sample ? null : 'Response time appears once submissions are opened or acted on.'}
        table={
          <VizTable
            caption="Submissions by time to first response"
            columns={['Time to first response', 'Submissions']}
            rows={(latency?.buckets || []).map((b) => [b.label, b.count])}
          />
        }
      >
        <DistributionBars
          items={(latency?.buckets || []).map((b) => ({
            key: b.key,
            label: b.label,
            value: b.count,
            valueLabel: 'Submissions',
          }))}
          ordinal
        />
      </Panel>

      <Panel
        span={6}
        title="Who is working the desk"
        reading={desk.teamTotal ? `${desk.teamTotal} actions across ${team.length} ${team.length === 1 ? 'member' : 'members'}` : undefined}
        empty={desk.teamTotal ? null : 'Team load appears once members act on submissions.'}
        table={
          <VizTable
            caption="Desk actions by team member"
            columns={['Member', 'Actions', 'Decisions', 'Notes', 'Share']}
            rows={(team || []).map((m) => [m.name, m.touches, m.decisions, m.notes, pct(m.share)])}
          />
        }
      >
        <DistributionBars
          items={(team || []).map((m) => ({
            key: m.id,
            label: m.name,
            value: m.touches,
            valueLabel: 'Actions',
            note: m.touches ? `${m.decisions} decisions · ${m.notes} notes` : 'no actions in this window',
          }))}
          labelWidth={132}
        />
      </Panel>

      <Panel
        span={4}
        title="Interview response"
        reading={
          interviews?.total
            ? `${interviews.total} scheduled · ${interviews.answered} answered`
            : undefined
        }
        note={
          interviews?.medianLeadDays != null
            ? `Median ${interviews.medianLeadDays} days of notice.`
            : undefined
        }
        empty={interviews?.total ? null : 'Interview measures appear once meetings are scheduled.'}
        table={
          <VizTable
            caption="Interviews by status"
            columns={['Status', 'Count']}
            rows={[
              ['Accepted', interviews?.accepted ?? 0],
              ['Declined', interviews?.declined ?? 0],
              ['Awaiting reply', interviews?.pending ?? 0],
              ['Completed', interviews?.completed ?? 0],
              ['Cancelled', interviews?.cancelled ?? 0],
            ]}
          />
        }
      >
        <Meter
          label="Accepted of answered"
          value={interviews?.acceptRate}
          caption={`${interviews?.accepted ?? 0} accepted, ${interviews?.declined ?? 0} declined`}
          tone="good"
        />
        <DistributionBars
          items={[
            { key: 'accepted', label: 'Accepted', value: interviews?.accepted ?? 0 },
            { key: 'declined', label: 'Declined', value: interviews?.declined ?? 0 },
            { key: 'pending', label: 'Awaiting reply', value: interviews?.pending ?? 0 },
            { key: 'completed', label: 'Completed', value: interviews?.completed ?? 0 },
          ]}
          labelWidth={104}
        />
      </Panel>

      <Panel
        span={4}
        title="Interview format"
        reading={interviews?.byType?.length ? 'How the house meets talent' : undefined}
        empty={interviews?.byType?.length ? null : 'Formats appear once interviews are scheduled.'}
        table={
          <VizTable
            caption="Interviews by format"
            columns={['Format', 'Count']}
            rows={(interviews?.byType || []).map((t) => [humanize(t.type), t.count])}
          />
        }
      >
        <DistributionBars
          items={(interviews?.byType || []).map((t) => ({
            key: t.type,
            label: humanize(t.type),
            value: t.count,
          }))}
          labelWidth={104}
        />
      </Panel>

      <Panel
        span={4}
        title="Follow-ups"
        reading={
          reminders
            ? `${reminders.open} open${reminders.overdue ? ` · ${reminders.overdue} overdue` : ''}`
            : undefined
        }
        empty={
          reminders && (reminders.open || reminders.completedInWindow)
            ? null
            : 'Follow-up health appears once reminders are set.'
        }
        table={
          <VizTable
            caption="Reminder health"
            columns={['Measure', 'Value']}
            rows={[
              ['Open', reminders?.open ?? 0],
              ['Overdue', reminders?.overdue ?? 0],
              ['Completed in window', reminders?.completedInWindow ?? 0],
              ['Completed on time', pct(reminders?.onTimeRate)],
            ]}
          />
        }
      >
        <Meter
          label="Cleared on time"
          value={reminders?.onTimeRate}
          caption={`${reminders?.completedInWindow ?? 0} completed in this window`}
          tone={reminders?.onTimeRate != null && reminders.onTimeRate < 50 ? 'bad' : 'good'}
        />
        <DistributionBars
          items={[
            { key: 'open', label: 'Open', value: reminders?.open ?? 0 },
            { key: 'overdue', label: 'Overdue', value: reminders?.overdue ?? 0 },
            { key: 'done', label: 'Completed', value: reminders?.completedInWindow ?? 0 },
          ]}
          labelWidth={104}
          emphasis="Overdue"
        />
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function SeasonSkeleton() {
  return (
    <div className="sv-skeleton" aria-hidden="true">
      <div className="sv-skeleton-rail">
        {['a', 'b', 'c', 'd', 'e', 'f'].map((slot) => (
          <div className="sv-skeleton-signal" key={slot} />
        ))}
      </div>
      <div className="sv-skeleton-board">
        <div className="sv-skeleton-panel sv-skeleton-panel--wide" />
        <div className="sv-skeleton-panel sv-skeleton-panel--eight" />
        <div className="sv-skeleton-panel sv-skeleton-panel--four" />
        <div className="sv-skeleton-panel sv-skeleton-panel--six" />
        <div className="sv-skeleton-panel sv-skeleton-panel--six" />
      </div>
    </div>
  );
}

function AnalyticsPage() {
  const [range, setRange] = useState(90);
  const [boardId, setBoardId] = useState('');
  const [lens, setLens] = useState('pipeline');

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['agency-season', range, boardId],
    queryFn: () => getSeasonAnalytics({ range, boardId: boardId || null }),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const rangeLabel = RANGES.find((r) => r.days === range)?.label || `${range} days`;
  const boards = data?.meta?.boards || [];
  const generatedAt = data?.meta?.generatedAt ? new Date(data.meta.generatedAt) : null;

  return (
    <div className="sv-page">
      <header className="sv-mast">
        <h1 className="sv-title">The Season</h1>
        <p className="sv-sub">
          {data
            ? `${data.totals.windowSubmissions} submissions and ${data.roster?.size ?? 0} represented, read across ${rangeLabel.toLowerCase()}`
            : 'Reading the pipeline, the roster, and the desk'}
        </p>
      </header>

      {/* One filter row above everything it scopes — never inside a panel. */}
      <div className="sv-controls">
        <div className="sv-ranges" role="group" aria-label="Reporting window">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              aria-pressed={range === r.days}
              className={`sv-range${range === r.days ? ' sv-range--on' : ''}`}
              onClick={() => setRange(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {boards.length ? (
          <label className="sv-board-filter">
            <span className="sv-board-filter-label">Board</span>
            <select value={boardId} onChange={(e) => setBoardId(e.target.value)}>
              <option value="">Every board</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {generatedAt ? (
          <span className="sv-generated">
            {isFetching ? 'Refreshing' : `Read at ${generatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
          </span>
        ) : null}
      </div>

      {isLoading ? <SeasonSkeleton /> : null}

      {isError && !data ? (
        <div className="sv-error">
          <p>The season report couldn’t load.</p>
          <button type="button" className="sv-retry" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : null}

      {data ? (
        // Held at reduced opacity while refetching rather than flashing a
        // skeleton, so the layout never jumps under the reader.
        <div className={`sv-content${isFetching ? ' sv-content--stale' : ''}`}>
          <SignalRail signals={data.signals} rangeLabel={rangeLabel} />

          <nav className="sv-lenses" role="tablist" aria-label="Analytics lens">
            {LENSES.map((l) => (
              <button
                key={l.key}
                type="button"
                role="tab"
                id={`sv-lens-${l.key}`}
                aria-selected={lens === l.key}
                aria-controls={`sv-board-${l.key}`}
                className={`sv-lens${lens === l.key ? ' sv-lens--on' : ''}`}
                onClick={() => setLens(l.key)}
              >
                {l.label}
              </button>
            ))}
          </nav>

          <motion.div
            key={lens}
            id={`sv-board-${lens}`}
            role="tabpanel"
            aria-labelledby={`sv-lens-${lens}`}
            className="sv-board"
            {...rise}
          >
            {lens === 'pipeline' ? <PipelineLens data={data} /> : null}
            {lens === 'roster' ? <RosterLens data={data} /> : null}
            {lens === 'desk' ? <DeskLens data={data} /> : null}
          </motion.div>

          <footer className="sv-foot">
            <span>
              {data.totals.allTimeSubmissions} submissions all time · {data.totals.activitiesObserved} recorded actions
              {data.meta.rosterIsDerived ? ' · roster derived from application status' : ''}
            </span>
          </footer>
        </div>
      ) : null}
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
