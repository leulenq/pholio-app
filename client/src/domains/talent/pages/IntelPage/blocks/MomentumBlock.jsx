import React from 'react';
import { Block, Finding, Emph, NotYet, Withheld, Stat, StatRow } from '../Chrome';
import { mostConsequential, allDormant } from '../findings';
import WeeklyBars from '../charts/WeeklyBars';
import { plural } from '../intelTheme';

function delta(now, then) {
  if (now === then) return 'level';
  return `${now > then ? '↑' : '↓'} from ${then}`;
}

/**
 * The headline is whichever measure moved most consequentially — weighted so
 * that agency attention outranks raw intent, but a collapse to zero outranks
 * both. This is what stops a 54 → 0 intent crash being reported as "Level".
 */
function finding({ recent, prior, halfWeeks }) {
  const candidates = [
    {
      key: 'agency',
      noun: 'agency attention',
      detail: 'reviews and advances',
      now: recent.reviews + recent.advances,
      then: prior.reviews + prior.advances,
      weight: 3,
    },
    {
      key: 'sent',
      noun: 'your own output',
      detail: 'submissions sent',
      now: recent.sent,
      then: prior.sent,
      weight: 2,
    },
    {
      key: 'intent',
      noun: 'intent',
      detail: 'card pulls, link opens and visits that lasted',
      now: recent.intent,
      then: prior.intent,
      weight: 1,
    },
  ];

  if (allDormant(candidates)) {
    return (
      <Finding verdict="Nothing has moved" tag="dormant" tone="warn">
        in <Emph>{halfWeeks * 2} weeks</Emph> — no agency opened a submission, and nobody
        pulled your card
      </Finding>
    );
  }

  const top = mostConsequential(candidates);
  const window = (
    <>
      last <Emph>{halfWeeks}</Emph> weeks against the <Emph>{halfWeeks}</Emph> before
    </>
  );

  if (top.shape === 'collapse') {
    return (
      <Finding from={top.then} to={0} tag="stopped" tone="warn">
        {top.detail} — <Emph>nothing</Emph> in the {window}
      </Finding>
    );
  }
  if (top.shape === 'breakout') {
    return (
      <Finding from={0} to={top.now} tag="started" tone="good">
        {top.detail}, {window}
      </Finding>
    );
  }
  if (top.shape === 'level') {
    return (
      <Finding verdict={`${top.noun} held`} tag="level">
        {top.detail} steady at <Emph>{top.now}</Emph>, {window}
      </Finding>
    );
  }
  return (
    <Finding
      from={top.then}
      to={top.now}
      tag={top.noun}
      tone={top.shape === 'up' ? 'good' : 'warn'}
    >
      {top.detail}, {window}
    </Finding>
  );
}

export default function MomentumBlock({ momentum, tier }) {
  const question = <>Am I <em>gaining ground</em>?</>;

  if (tier === 'free') {
    return (
      <Block id="iv-momentum" question={question}>
        <Withheld title="Twelve-week momentum">
          Every week&rsquo;s real counts — submissions sent, agencies that opened you, advances,
          intent events — recent half against the half before.
        </Withheld>
      </Block>
    );
  }
  if (!momentum) return null;

  const weeks = Array.isArray(momentum.weeks) ? momentum.weeks : [];
  const anything = weeks.some((w) => w.sent + w.reviews + w.advances + w.intent > 0);
  const { recent, prior, halfWeeks } = momentum;

  return (
    <Block
      id="iv-momentum"
      question={question}
      finding={anything ? finding({ recent, prior, halfWeeks }) : null}
    >
      {anything ? (
        <>
          <StatRow>
            <Stat value={recent.sent} label={`sent · ${delta(recent.sent, prior.sent)}`} />
            <Stat value={recent.reviews} label={`reviews · ${delta(recent.reviews, prior.reviews)}`} />
            <Stat value={recent.advances} label={`advances · ${delta(recent.advances, prior.advances)}`} />
            <Stat value={recent.intent} label={`intent · ${delta(recent.intent, prior.intent)}`} />
          </StatRow>
          <WeeklyBars weeks={weeks} halfWeeks={halfWeeks} />
        </>
      ) : (
        <NotYet threshold={`${plural(halfWeeks * 2, 'week')}, all empty`}>
          this fills in from your first submission — no cohort estimate stands in for it
        </NotYet>
      )}
    </Block>
  );
}
