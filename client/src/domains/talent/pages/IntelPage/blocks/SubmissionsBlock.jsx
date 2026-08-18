import React, { useState } from 'react';
import {
  PholioToggleButton,
  PholioToggleGroup,
} from '../../../../../shared/components/ui/PholioButton';
import {
  Block, Panel, Finding, Emph, Marginalia, NotYet, Stat, StatRow,
} from '../Chrome';
import ConversionLadder from '../charts/ConversionLadder';
import StackedShare from '../charts/StackedShare';
import ReadClock from '../charts/ReadClock';
import { RAMP, pct, plural } from '../intelTheme';

const STEP_WORD = {
  sent: 'sent',
  opened: 'opened',
  advanced: 'advanced',
  settled: 'represented or kept',
};

/** Outcomes, ordered best → worst so the stack reads as a ranking. */
const OUTCOMES = [
  { key: 'represented', label: 'Represented', ink: RAMP[4] },
  { key: 'keptOnFile', label: 'Kept on file', ink: RAMP[3] },
  { key: 'inMotion', label: 'In motion', ink: RAMP[2] },
  { key: 'awaiting', label: 'Awaiting', ink: RAMP[0] },
  { key: 'passed', label: 'Passed', ink: 'rgba(42,31,20,0.24)' },
  { key: 'withdrawn', label: 'Withdrawn', ink: 'rgba(42,31,20,0.13)' },
];

function finding({ steps, weakest, scope, days }) {
  const sent = steps[0]?.count ?? 0;

  if (sent === 0) {
    return (
      <Finding verdict="Nothing sent" tag="no funnel yet">
        the ladder draws itself from your <Emph>first submission</Emph>
      </Finding>
    );
  }
  if (sent < 3) {
    return (
      <Finding figure={sent} tag="too few to read">
        {plural(sent, 'submission')} {scope === 'period' ? `in ${days} days` : 'so far'} —
        a pattern needs <Emph>three</Emph>
      </Finding>
    );
  }
  if (!weakest) {
    return (
      <Finding figure={sent} tag="no clear stall">
        submissions moving through <Emph>without a bottleneck</Emph>
      </Finding>
    );
  }
  return (
    <Finding
      figure={pct(weakest.rate)}
      tag="largest observed drop"
    >
      of <Emph>{weakest.denominator}</Emph> {STEP_WORD[weakest.from]} submissions were{' '}
      <Emph>{STEP_WORD[weakest.to]}</Emph>
    </Finding>
  );
}

export default function SubmissionsBlock({ submissions, days }) {
  const [scope, setScope] = useState(submissions?.basis ?? 'lifetime');
  if (!submissions) return null;

  const view = submissions[scope] ?? {};
  const steps = view.steps ?? [];
  const other = scope === 'period' ? submissions.lifetime : submissions.period;
  const clock = submissions.readClock ?? {};
  const open = Array.isArray(clock.open) ? clock.open : [];
  const states = clock.states ?? {};
  const stalled = (states.late || 0) + (states.cold || 0);
  const kept = submissions.keptOnFile;

  const outcomeSegments = OUTCOMES.map((o) => ({
    ...o,
    count: Number(view.outcomes?.[o.key]) || 0,
  }));

  return (
    <Block
      id="iv-submissions"
      question={<>What happened after I <em>submitted</em>?</>}
      finding={finding({ steps, weakest: submissions.weakest, scope, days })}
      aside={
        <PholioToggleGroup role="group" aria-label="Submission window">
          <PholioToggleButton active={scope === 'period'} onClick={() => setScope('period')}>
            {days}d
          </PholioToggleButton>
          <PholioToggleButton active={scope === 'lifetime'} onClick={() => setScope('lifetime')}>
            All time
          </PholioToggleButton>
        </PholioToggleGroup>
      }
    >
      {steps[0]?.count > 0 ? (
        <>
          <ConversionLadder
            steps={steps}
            compare={other?.steps}
            compareLabel={scope === 'period' ? 'all time' : `last ${days} days`}
          />
          <Panel label="Where they ended up">
            <StackedShare segments={outcomeSegments} />
          </Panel>
        </>
      ) : (
        <NotYet threshold="1 submission">
          the ladder has nothing to measure until you send one
        </NotYet>
      )}

      <Panel
        label="Open submissions"
        note={
          clock.band?.p75
            ? `typical first read ${Math.round(clock.band.p25)}–${Math.round(clock.band.p75)}d`
            : 'read band accruing'
        }
      >
        <StatRow>
          <Stat value={open.length} label="out now" />
          <Stat value={states.read || 0} label="already read" />
          <Stat
            value={stalled}
            label="past the window"
            tone={stalled > 0 ? 'attention' : null}
          />
          <Stat value={kept?.agencies ?? 0} label="holding your file" />
        </StatRow>

        {open.length > 0 ? (
          <ReadClock band={clock.band} open={open} yourMedianDays={clock.yourMedianDays} />
        ) : (
          <NotYet threshold="0 open">the clock returns when you next submit</NotYet>
        )}
      </Panel>
    </Block>
  );
}
