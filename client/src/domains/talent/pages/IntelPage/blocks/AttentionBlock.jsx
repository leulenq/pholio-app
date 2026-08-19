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
  instagram: 'referral',
  tiktok: 'referral',
  search: 'search referral',
  share_link: 'shared link',
  card_link: 'card link',
  direct: 'direct visit',
  agency: 'agency surface',
};

const COMPOSITION = [
  { key: 'visits', label: 'Profile visits', ink: RAMP[0] },
  { key: 'opens', label: 'Link opens', ink: RAMP[2] },
  { key: 'pulls', label: 'Card pulls', ink: RAMP[3] },
  { key: 'reviews', label: 'Agency reviews', ink: RAMP[4] },
  { key: 'advances', label: 'Advances', ink: RAMP[4] },
];

function finding({ activity, deltasSuppressed, days }) {
  const total = Number(activity?.total) || 0;

  if (total === 0) {
    return (
      <Finding verdict="No activity" tag="recorded events">
        in <Emph>{days} days</Emph> — no profile visits, card pulls, or shared-link opens
      </Finding>
    );
  }
  if (deltasSuppressed || activity.changePct == null) {
    return (
      <Finding figure={total} tag="no direction yet">
        recorded {plural(total, 'event')} — not enough history to compare periods
      </Finding>
    );
  }

  const flat = Math.abs(activity.changePct) < 0.05;
  const up = activity.changePct > 0;

  if (activity.priorTotal > 0 && total === 0) {
    return (
      <Finding from={activity.priorTotal} to={0} tag="period comparison">
        recorded profile activity in the last {days} days
      </Finding>
    );
  }
  if (flat) {
    return (
      <Finding verdict="Holding" tag="flat">
        <Emph>{total}</Emph> recorded {plural(total, 'event')} against{' '}
        <Emph>{activity.priorTotal}</Emph> in the window before
      </Finding>
    );
  }
  return (
    <Finding
      from={activity.priorTotal}
      to={total}
      tag={`activity · ${pct(Math.abs(activity.changePct))} ${up ? 'up' : 'down'}`}
    >
      profile visits, card pulls and shared-link opens, this window against the one before
    </Finding>
  );
}

export default function AttentionBlock({ attention, meta, tier }) {
  if (!attention) return null;
  const { activity, markets, sources, rhythm, composition } = attention;
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
      question={<>What happened around my <em>profile</em>?</>}
      finding={finding({ activity, deltasSuppressed: meta?.deltasSuppressed, days: meta?.days })}
    >
      <IntentTrend
        series={activity?.series}
        annotations={activity?.annotations}
        agencyDays={activity?.agencyDays}
        priorLabel={`the ${meta?.days} days before`}
      />

      <StatRow>
        <Stat value={agencySignal} label="agency reviews" />
        <Stat value={byKey.pulls || 0} label="card pulls" />
        <Stat value={byKey.opens || 0} label="link opens" />
        <Stat value={byKey.visits || 0} label="profile visits" />
      </StatRow>

      <Panel label="Recorded actions" note="counts by event type">
        <StackedShare segments={segments} />
      </Panel>

      <Panel label="Where it comes from">
        {locked ? (
          <Withheld title="Markets and sources">
            Approximate markets and whether activity came from an agency, a shared link, or the public profile.
          </Withheld>
        ) : markets?.calibrating || marketRows.length === 0 ? (
          <NotYet threshold={`${markets?.totalLocated ?? 0} of 10 located visits`}>
            approximate markets appear once enough visits carry a location
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
            label="most common arrival window, your time"
          />
          <Stat value={pct(rhythm.window.share)} label="of arrivals fall in it" />
        </StatRow>
      )}
    </Block>
  );
}
