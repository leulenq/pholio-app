import React from 'react';
import { ArrowRight } from 'lucide-react';
import CountUp from './CountUp';
import SignalSpectrum from './SignalSpectrum';
import { agoLabel, cap, pluralize } from './intelUtils';

/** Weave the data-generated clauses into "a, b and c" order. */
function joinClauses(nodes) {
  if (nodes.length <= 1) return nodes;
  const out = [];
  nodes.forEach((node, i) => {
    out.push(<React.Fragment key={`c${i}`}>{node}</React.Fragment>);
    if (i < nodes.length - 2) out.push(<React.Fragment key={`s${i}`}>, </React.Fragment>);
    else if (i === nodes.length - 2) out.push(<React.Fragment key={`s${i}`}> and </React.Fragment>);
  });
  return out;
}

function num(value) {
  return <CountUp value={value} className="intel2-pulse-num" />;
}

function HeadlineSentence({ headline }) {
  const reviews = Number(headline?.reviews) || 0;
  const advances = Number(headline?.advances) || 0;
  const cardPulls = Number(headline?.cardPulls) || 0;
  const linkOpens = Number(headline?.linkOpens) || 0;
  const topMarket = headline?.topMarket;

  const clauses = [];
  if (reviews > 0) clauses.push(<>{num(reviews)} {pluralize(reviews, 'agency', 'agencies')} reviewed your materials</>);
  if (advances > 0) clauses.push(<>{num(advances)} {pluralize(advances, 'submission')} advanced</>);
  if (cardPulls > 0) clauses.push(<>your card was pulled {num(cardPulls)} {pluralize(cardPulls, 'time')}</>);
  if (linkOpens > 0) clauses.push(<>your link was opened {num(linkOpens)} {pluralize(linkOpens, 'time')}</>);

  if (clauses.length === 0) {
    return (
      <p className="intel2-pulse-headline">
        Your book is live. The market hasn&rsquo;t knocked yet — the{' '}
        <a href="#intel2-lens" className="intel2-inline-link">Lens</a> below shows what to sharpen.
      </p>
    );
  }

  return (
    <p className="intel2-pulse-headline">
      {joinClauses(clauses)}
      {topMarket ? <> — most of it from {topMarket.label || String(topMarket.market || '').toUpperCase()}</> : null}.
    </p>
  );
}

function InMotionTicker({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return (
    <div className="intel2-motion">
      <span className="intel2-motion-label">In motion</span>
      <ul className="intel2-motion-list">
        {rows.map((row) => (
          <li
            key={row.applicationId}
            className={`intel2-motion-row${row.urgent ? ' intel2-motion-row--urgent' : ''}`}
          >
            <span className="intel2-motion-agency">{row.agencyName}</span>
            <span className="intel2-motion-detail">
              {' — '}{String(row.statusLabel || '').toLowerCase()}, {agoLabel(row.daysAgo)}.
              {row.urgent ? <span className="intel2-motion-urge"> Respond today.</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const VERDICT_COPY = {
  current: 'Your materials read as current to a booker.',
  aging: 'Your materials are starting to age.',
  stale: 'Your materials are reading as stale.',
};

function MaterialsVerdict({ materials }) {
  const verdict = materials?.verdict;
  if (!verdict) return null;
  return (
    <p className="intel2-pulse-materials">
      {VERDICT_COPY[verdict] ?? 'Materials status'}{' '}
      <a href="#intel2-lens" className={`intel2-verdict intel2-verdict--${verdict}`}>
        {cap(verdict)}
        <ArrowRight size={12} aria-hidden />
      </a>
    </p>
  );
}

/**
 * Zone 1 — The Pulse. The one-glance answer as an editorial statement rather
 * than a KPI row, carried by the Signal Spectrum.
 */
export default function PulseZone({ pulse }) {
  if (!pulse) return null;
  return (
    <div className="intel2-pulse">
      <HeadlineSentence headline={pulse.headline} />
      {pulse.spectrum ? <SignalSpectrum spectrum={pulse.spectrum} /> : null}
      <div className="intel2-pulse-foot">
        <InMotionTicker rows={pulse.inMotion} />
        <MaterialsVerdict materials={pulse.materials} />
      </div>
    </div>
  );
}
