import React from 'react';
import {
  Block, Panel, Finding, Emph, NotYet, Withheld, Stat, StatRow,
} from '../Chrome';
import IntentTrend from '../charts/IntentTrend';
import MarketBars from '../charts/MarketBars';
import RankedBars from '../charts/RankedBars';
import StackedShare from '../charts/StackedShare';
import { RAMP, pct, plural, dowName, hourRange, sourceLabelFor } from '../intelTheme';

const SOURCE_MEANING = {
  instagram: 'reach',
  tiktok: 'reach',
  search: 'searched by name',
  share_link: 'your link',
  card_link: 'card scan',
  direct: 'direct',
  agency: 'agency-side',
};

/** Weakest → strongest, so the stack reads as a quality ladder. */
const COMPOSITION = [
  { key: 'reach', label: 'Passing reach', ink: RAMP[0] },
  { key: 'qualified', label: 'Qualified visits', ink: RAMP[1] },
  { key: 'opens', label: 'Link opens', ink: RAMP[2] },
  { key: 'pulls', label: 'Card pulls', ink: RAMP[3] },
  { key: 'reviews', label: 'Agency reviews', ink: RAMP[4] },
  { key: 'advances', label: 'Advances', ink: RAMP[4] },
];

function finding({ intent, deltasSuppressed, days }) {
  const total = Number(intent?.total) || 0;

  if (total === 0) {
    return (
      <Finding verdict="Nobody" tag="no intent" tone="warn">
        in <Emph>{days} days</Emph> — no card pulled, no link opened, no visit that lasted
      </Finding>
    );
  }
  if (deltasSuppressed || intent.changePct == null) {
    return (
      <Finding figure={total} tag="no direction yet">
        intent {plural(total, 'event')} — not enough history to call a trend
      </Finding>
    );
  }

  const flat = Math.abs(intent.changePct) < 0.05;
  const up = intent.changePct > 0;

  if (intent.priorTotal > 0 && total === 0) {
    return (
      <Finding from={intent.priorTotal} to={0} tag="stopped" tone="warn">
        intent events — <Emph>nothing</Emph> in the last {days} days
      </Finding>
    );
  }
  if (flat) {
    return (
      <Finding verdict="Holding" tag="flat">
        <Emph>{total}</Emph> intent {plural(total, 'event')} against{' '}
        <Emph>{intent.priorTotal}</Emph> in the window before
      </Finding>
    );
  }
  return (
    <Finding
      from={intent.priorTotal}
      to={total}
      tag={`intent · ${pct(Math.abs(intent.changePct))} ${up ? 'up' : 'down'}`}
      tone={up ? 'good' : 'warn'}
    >
      card pulls, link opens and visits that lasted, this window against the one before
    </Finding>
  );
}

export default function AttentionBlock({ attention, meta, tier }) {
  if (!attention) return null;
  const { intent, markets, sources, rhythm, composition } = attention;
  const locked = tier === 'free';
  const marketRows = Array.isArray(markets?.rows) ? markets.rows : [];

  const byKey = Object.fromEntries(
    (composition || []).map((c) => [c.key, Number(c.count) || 0]),
  );
  const segments = COMPOSITION.map((c) => ({ ...c, count: byKey[c.key] || 0 }));
  const agencySignal = (byKey.reviews || 0) + (byKey.advances || 0);

  const sourceRows = (Array.isArray(sources) ? sources : []).map((row) => ({
    key: row.source,
    label: sourceLabelFor(row.source),
    value: row.count,
    share: row.share,
    meaning: SOURCE_MEANING[row.source] ?? 'referred',
  }));

  return (
    <Block
      id="iv-attention"
      question={<>Is anyone with <em>intent</em> actually looking?</>}
      finding={finding({ intent, deltasSuppressed: meta?.deltasSuppressed, days: meta?.days })}
    >
      <IntentTrend
        series={intent?.series}
        annotations={intent?.annotations}
        agencyDays={intent?.agencyDays}
        priorLabel={`the ${meta?.days} days before`}
      />

      <StatRow>
        <Stat value={agencySignal} label="agency reviews" />
        <Stat value={byKey.pulls || 0} label="card pulls" />
        <Stat value={byKey.opens || 0} label="link opens" />
        <Stat value={byKey.qualified || 0} label="visits that lasted" />
      </StatRow>

      <Panel label="Quality of the attention" note="weakest → strongest">
        <StackedShare segments={segments} />
      </Panel>

      <Panel label="Where it comes from">
        {locked ? (
          <Withheld title="Markets and sources">
            Which markets your attention comes from, and whether it is agency, client or public.
          </Withheld>
        ) : markets?.calibrating || marketRows.length === 0 ? (
          <NotYet threshold={`${markets?.totalLocated ?? 0} of 10 located visits`}>
            markets resolve once enough attention carries a location
          </NotYet>
        ) : (
          <MarketBars
            rows={marketRows}
            showShare={!meta?.smallSample}
            showDelta={!meta?.deltasSuppressed}
          />
        )}
      </Panel>

      {!locked && sourceRows.length > 0 && (
        <Panel label="Referrers">
          <RankedBars rows={sourceRows} />
        </Panel>
      )}

      {!locked && rhythm?.window && (
        <StatRow>
          <Stat
            value={`${dowName(rhythm.window.dow).slice(0, 3)} ${hourRange(rhythm.window.startHour, rhythm.window.endHour)}`}
            label="when attention lands, your time"
          />
          <Stat value={pct(rhythm.window.share)} label="of arrivals fall in it" />
        </StatRow>
      )}
    </Block>
  );
}
