import React, { useMemo, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { getSeasonAnalytics } from '../api/agency';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';

import { Panel, LegendKey, VizTable } from '../components/analytics/Panel';
import BoardSelect from '../components/BoardSelect';
import { SignalRail } from '../components/analytics/SignalRail';
import { FlowRibbon } from '../components/analytics/FlowRibbon';
import { VolumeStream } from '../components/analytics/VolumeStream';
import { QueueAging } from '../components/analytics/QueueAging';
import { MatchCalibration } from '../components/analytics/MatchCalibration';
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
  { days: 365, label: '12 months' },
  { days: 730, label: '24 months' },
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
  const totalCohort = flow?.totalCohort || cohort;

  // The one written line on this lens, and only when a real hand-off carries it.
  const strongestHandoff = useMemo(() => {
    const candidates = stages.filter((s) => s.conversion > 0 && s.reached >= 3);
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
            ? `${signed} of ${cohort} fully evidenced journeys reached representation${
                strongestHandoff
                  ? ` · strongest hand-off is ${strongestHandoff.stage} at ${strongestHandoff.conversion}%`
                  : ''
              }`
            : undefined
        }
        note={
          flow?.excludedIncomplete
            ? `${flow.excludedIncomplete} of ${totalCohort} submissions are excluded from this ribbon because their recorded history skips one or more hand-offs. Current outcomes remain included elsewhere in the report.`
            : 'Every hand-off in this ribbon is backed by an adjacent recorded status change.'
        }
        empty={cohort ? null : totalCohort ? 'No complete transition histories are available for this window yet.' : 'The flow draws itself once submissions land in this window.'}
        legend={
          <>
            {stages.map((s, i) => (
              <LegendKey key={s.stage} color={VIZ.depth[i]} label={s.stage} />
            ))}
            <LegendKey color={VIZ.exit} label="Closed outcome" />
          </>
        }
        table={
          <VizTable
            caption={`Pipeline flow for ${cohort} fully evidenced journeys out of ${totalCohort} submissions`}
            columns={['Stage', 'Reached', 'Advanced', 'Holding', 'Passed', 'Kept on file', 'Withdrawn', 'Conversion', 'Median in stage']}
            rows={stages.map((s) => [
              s.stage,
              s.reached,
              s.advanced,
              s.held,
              s.passed,
              s.keptOnFile,
              s.withdrawn,
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
        empty={totalCohort ? null : 'Nothing arrived in this window.'}
        legend={[...VOLUME_STACK].reverse().map((s) => (
          <LegendKey key={s.key} color={s.color} label={s.label} />
        ))}
        table={
          <VizTable
            caption="Submissions per bucket by outcome"
            columns={['Bucket', 'Total', 'Still applied', 'Shortlisted', 'Offered', 'Signed', 'Passed', 'Kept on file', 'Withdrawn']}
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
                r.keptOnFile,
                r.withdrawn,
              ])}
          />
        }
      >
        <VolumeStream volume={volume} />
      </Panel>

      <Panel
        span={4}
        title="Open work by age"
        action={<Link className="sv-panel-link" to="/dashboard/agency/submissions">Open submissions</Link>}
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
        title="Stored score against current outcomes"
        reading={
          calibration?.separation != null
            ? `Signed talent scored ${calibration.separation} points above passed talent`
            : undefined
        }
        note={
          calibration?.sample
            ? `${calibration.sample} scored submissions. This is a retrospective association, not predictive calibration: Pholio does not yet preserve an immutable score-at-submission snapshot.`
            : undefined
        }
        empty={calibration?.sample ? null : 'Match scores appear once submissions are scored against a board.'}
        legend={
          <>
            <LegendKey color={VIZ.depth[0]} label="Still open" />
            <LegendKey color={VIZ.depth[2]} label="Advanced" />
            <LegendKey color={VIZ.depth[3]} label="Signed" />
            <LegendKey color={VIZ.exit} label="Passed" />
            <LegendKey color={VIZ.keptOnFile} label="Kept on file" />
            <LegendKey color={VIZ.withdrawn} label="Withdrawn" />
            <LegendKey color={VIZ.series[1]} label="Positive action rate" shape="line" />
          </>
        }
        table={
          <VizTable
            caption="Outcome by match score band"
            columns={['Score', 'Scored', 'Still open', 'Advanced', 'Signed', 'Passed', 'Kept on file', 'Withdrawn', 'Positive action rate']}
            rows={(calibration?.bins || []).map((b) => [
              b.label,
              b.total,
              b.open,
              b.advanced,
              b.signed,
              b.passed,
              b.keptOnFile,
              b.withdrawn,
              pct(b.advanceRate),
            ])}
          />
        }
      >
        <MatchCalibration calibration={calibration} />
      </Panel>

      <Panel
        span={6}
        title="Package intake"
        reading={
          boardsWithVolume.length
            ? `${boardsWithVolume.length} ${boardsWithVolume.length === 1 ? 'package' : 'packages'} took submissions this window`
            : undefined
        }
        note="Application outcomes are not attributed to packages because the current schema has no package-specific decision history."
        empty={
          boardsWithVolume.length
            ? null
            : 'Packages appear here once submissions are assigned to a casting package.'
        }
        table={
          <VizTable
            caption="Package intake"
            columns={['Package', 'Submissions', 'Scored', 'Score coverage', 'Average match']}
            rows={(boards || []).map((b) => [
              b.name,
              b.submissions,
              b.scoredSubmissions,
              pct(b.scoreCoverage),
              num(b.averageMatch),
            ])}
          />
        }
      >
        <DistributionBars
          items={boardsWithVolume.map((board) => ({
            key: board.id,
            label: board.name,
            value: board.submissions,
            valueLabel: 'Submissions',
            note: board.averageMatch == null
              ? 'No stored scores'
              : `${board.scoredSubmissions} scored · ${board.averageMatch} average match`,
          }))}
          labelWidth={152}
        />
      </Panel>

      <Panel
        span={12}
        title="Cohort progression"
        reading="Each month's intake and how far it got"
        note="Applied is not drawn because every submission reaches it. Later stages count only when a recorded event or current status evidences that exact stage; skipped hand-offs are not backfilled."
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
        note="Where the incoming shape extends beyond the roster shape, submissions are bringing categories the agency does not yet represent."
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
        empty={roster.markets?.length ? null : 'Markets appear once roster profiles carry a representation market.'}
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
        reading={roster.size ? 'How long talent has been represented by the agency' : undefined}
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
  const { desk, meta } = data;
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
        note={`Grouped in ${meta?.timeZone || 'the agency timezone'}. Darker means busier.`}
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
        action={<Link className="sv-panel-link" to="/dashboard/agency/interviews">Open interviews</Link>}
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
        reading={interviews?.byType?.length ? 'How the agency meets talent' : undefined}
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
        action={<Link className="sv-panel-link" to="/dashboard/agency/reminders">Open reminders</Link>}
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
  const [lens, setLens] = useState('pipeline');
  const [scopeByLens, setScopeByLens] = useState({ pipeline: '', roster: '' });
  const lensRefs = useRef(new Map());
  const shouldReduceMotion = useReducedMotion();
  const boardId = lens === 'desk' ? '' : scopeByLens[lens] || '';

  const {
    data,
    error,
    isLoading,
    isError,
    isFetching,
    isPlaceholderData,
    refetch,
  } = useQuery({
    queryKey: ['agency-season', range, boardId],
    queryFn: ({ signal }) => getSeasonAnalytics({ range, boardId: boardId || null, signal }),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const reportRange = data?.meta?.range ?? range;
  const reportRangeLabel =
    RANGES.find((item) => item.days === reportRange)?.label || `${reportRange} days`;
  const boardKind = lens === 'pipeline' ? 'package' : lens === 'roster' ? 'division' : null;
  const boards = (data?.meta?.boards || []).filter((board) => board.kind === boardKind);
  const boardLabel = boardKind === 'package' ? 'Package' : 'Division';
  const generatedAt = data?.meta?.generatedAt ? new Date(data.meta.generatedAt) : null;

  const chooseLens = (nextLens) => {
    setLens(nextLens);
    lensRefs.current.get(nextLens)?.focus();
  };

  const handleLensKeyDown = (event, currentIndex) => {
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % LENSES.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + LENSES.length) % LENSES.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = LENSES.length - 1;
    if (nextIndex == null) return;
    event.preventDefault();
    chooseLens(LENSES[nextIndex].key);
  };

  return (
    <div className="sv-page">
      <header className="sv-mast">
        <h1 className="sv-title">The Season</h1>
        <p className="sv-sub">
          {data
            ? `${data.totals.windowSubmissions} submissions and ${data.roster?.size ?? 0} represented, read across ${reportRangeLabel.toLowerCase()}`
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
            <span className="sv-board-filter-label">{boardLabel}</span>
            <BoardSelect
              boards={boards}
              value={boardId || null}
              onChange={(id) => setScopeByLens((current) => ({ ...current, [lens]: id || '' }))}
              placeholder={`Every ${boardLabel.toLowerCase()}`}
              allOptionLabel={`Every ${boardLabel.toLowerCase()}`}
              allOptionSub="Whole agency perspective"
              showManageLink={false}
              ariaLabel={boardLabel}
            />
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
        <div className="sv-error" role="alert" aria-live="assertive">
          <p>The season report couldn’t load.</p>
          <button type="button" className="sv-retry" disabled={isFetching} onClick={() => refetch()}>
            {isFetching ? 'Trying again…' : 'Try again'}
          </button>
        </div>
      ) : null}

      {data ? (
        <div className="sv-content">
          {isPlaceholderData && !isError ? (
            <div className="sv-refresh-status" role="status" aria-live="polite">
              Updating this view. The figures below remain on the previous reporting scope until the new report is ready.
            </div>
          ) : null}

          {isError ? (
            <div className="sv-refresh-error" role="status" aria-live="polite">
              <span>
                Couldn’t refresh this report. Showing the last successful read
                {generatedAt
                  ? ` from ${generatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                  : ''}
                .
              </span>
              <button type="button" className="sv-retry" disabled={isFetching} onClick={() => refetch()}>
                {isFetching ? 'Retrying…' : 'Retry'}
              </button>
              {error?.message ? <span className="sr-only">{error.message}</span> : null}
            </div>
          ) : null}

          <SignalRail signals={data.signals} rangeLabel={reportRangeLabel} />

          <nav className="sv-lenses" role="tablist" aria-label="Analytics lens">
            {LENSES.map((l, index) => (
              <button
                key={l.key}
                ref={(node) => {
                  if (node) lensRefs.current.set(l.key, node);
                  else lensRefs.current.delete(l.key);
                }}
                type="button"
                role="tab"
                id={`sv-lens-${l.key}`}
                aria-selected={lens === l.key}
                aria-controls={`sv-board-${l.key}`}
                tabIndex={lens === l.key ? 0 : -1}
                className={`sv-lens${lens === l.key ? ' sv-lens--on' : ''}`}
                onClick={() => setLens(l.key)}
                onKeyDown={(event) => handleLensKeyDown(event, index)}
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
            {...(shouldReduceMotion ? {} : rise)}
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
