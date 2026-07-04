import React, { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Delta, Calibrating, SPRING, TIER_RAMP, nf, pct } from './parts';
import './MarketBoard.css';

/**
 * Zone 3 — The Market Board. Geography the way the industry actually thinks:
 * markets, not countries (spec §3). The arc map is deferred; this ships the
 * ranked market ledger (trend, share, delta, viewer-class mix) and the source
 * narrative underneath it — a plain-language read of where attention is
 * originating, never a donut.
 */

const SPARK_W = 64;
const SPARK_H = 22;

/** Build a tiny SVG path from a { 'YYYY-MM-DD': count } map, oldest → newest. */
function buildSpark(days) {
  const entries = Object.entries(days || {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const values = entries.map(([, v]) => Number(v) || 0);

  if (values.length < 2) {
    const y = SPARK_H / 2;
    return { line: `M0,${y} L${SPARK_W},${y}`, area: null, flat: true };
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = SPARK_W / (values.length - 1);
  const pad = 3;
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = SPARK_H - pad - ((v - min) / range) * (SPARK_H - pad * 2);
    return [x, y];
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${SPARK_W},${SPARK_H} L0,${SPARK_H} Z`;
  return { line, area, flat: false };
}

function Sparkline({ days }) {
  const { line, area, flat } = buildSpark(days);
  return (
    <svg
      className="market-spark"
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {area ? <path d={area} className="market-spark__area" /> : null}
      <path d={line} className={`market-spark__line${flat ? ' is-flat' : ''}`} />
    </svg>
  );
}

const MIX_SEGMENTS = [
  { key: 'agency', label: 'Agency', color: TIER_RAMP[0] },
  { key: 'client', label: 'Client', color: TIER_RAMP[2] },
  { key: 'public', label: 'Public', color: TIER_RAMP[4] },
];

/** Viewer-class mix — a slim stacked bar, never a badge. Agency reads deepest. */
function MixBar({ mix }) {
  const values = MIX_SEGMENTS.map((s) => ({ ...s, value: Number(mix?.[s.key]) || 0 }));
  const total = values.reduce((a, v) => a + v.value, 0);

  if (total === 0) {
    return <div className="market-mix market-mix--empty" aria-hidden />;
  }

  const label = values.map((v) => `${v.label} ${nf(v.value)}`).join(', ');
  return (
    <div className="market-mix" role="img" aria-label={`Viewer mix — ${label}`}>
      {values.map((v) =>
        v.value > 0 ? (
          <span
            key={v.key}
            className="market-mix__seg"
            style={{ flexGrow: v.value / total, background: v.color }}
            title={`${v.label}: ${nf(v.value)}`}
          />
        ) : null
      )}
    </div>
  );
}

function MarketRow({ row, index, inView, reduce }) {
  return (
    <motion.div
      className="market-row"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ ...SPRING, delay: reduce ? 0 : index * 0.05 }}
    >
      <div className="market-row__label">{row.label}</div>
      <div className="market-row__spark">
        <Sparkline days={row.days} />
      </div>
      <div className="market-row__share">
        <div className="market-row__sharetrack">
          <motion.div
            className="market-row__sharefill"
            initial={reduce ? false : { width: '0%' }}
            animate={inView ? { width: pct(row.share) } : undefined}
            transition={{ ...SPRING, delay: reduce ? 0 : index * 0.05 + 0.08 }}
          />
        </div>
        <span className="market-row__sharepct">{pct(row.share)}</span>
      </div>
      <Delta value={row.delta} />
      <MixBar mix={row.mix} />
    </motion.div>
  );
}

/** One line of quiet industry framing when a single market dominates the period. */
function MarketNote({ rows }) {
  const top = rows?.[0];
  if (!top || !(top.share >= 0.3)) return null;
  return (
    <p className="market-note">
      {top.label} keeps returning — a market showing sustained interest is worth
      a conversation with your agent about a stay.
    </p>
  );
}

function MarketLedger({ markets }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduce = useReducedMotion();
  const rows = markets?.rows || [];

  if (markets?.calibrating) {
    return (
      <Calibrating
        title="The Market Board is calibrating."
        listening="Once enough located attention lands, this ranks the markets pulling your materials — NYC, Paris, Milan, your home region — the way bookers think."
      />
    );
  }

  if (rows.length === 0) {
    return <p className="market-empty">No located attention yet this period.</p>;
  }

  return (
    <div className="market-ledger" ref={ref}>
      {markets?.totalLocated ? (
        <p className="market-ledger__caption">
          Based on {nf(markets.totalLocated)} located visits this period.
        </p>
      ) : null}
      <div className="market-ledger__head" aria-hidden>
        <span>Market</span>
        <span>Trend</span>
        <span>Share</span>
        <span>Δ</span>
        <span>Viewers</span>
      </div>
      <div className="market-ledger__rows">
        {rows.map((row, i) => (
          <MarketRow key={row.market} row={row} index={i} inView={inView} reduce={reduce} />
        ))}
      </div>
      <ol className="market-mix-legend">
        {MIX_SEGMENTS.map((s) => (
          <li key={s.key}>
            <span className="market-mix-legend__dot" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ol>
      <MarketNote rows={rows} />
    </div>
  );
}

const SOURCE_LABELS = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitter: 'X/Twitter',
  search: 'Search',
  direct: 'Direct link',
};

const SOURCE_LINES = {
  instagram: 'Your social is doing the introductions.',
  tiktok: 'Short-form is pulling eyes toward your book.',
  twitter: 'Chatter on X is sending people your way.',
  search: "You're being looked up by name.",
  direct: 'People arriving straight to your link — usually because someone shared it.',
};

function titleCaseHost(host) {
  return (host || '')
    .split('.')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join('.');
}

function sourceMeta(source) {
  const key = String(source || '').toLowerCase();
  if (SOURCE_LABELS[key]) {
    return { label: SOURCE_LABELS[key], line: SOURCE_LINES[key] };
  }
  const label = titleCaseHost(key) || 'Other';
  return {
    label,
    line: `A referral from ${label} — worth noting who over there is sending people your way.`,
  };
}

function SourceRow({ row, index, inView, reduce }) {
  const meta = sourceMeta(row.source);
  return (
    <motion.li
      className="market-source"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ ...SPRING, delay: reduce ? 0 : index * 0.05 }}
    >
      <div className="market-source__head">
        <span className="market-source__label">{meta.label}</span>
        <span className="market-source__stat">
          {nf(row.count)} · {pct(row.share)}
        </span>
      </div>
      <p className="market-source__line">{meta.line}</p>
    </motion.li>
  );
}

function SourceNarrative({ sources }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduce = useReducedMotion();
  const rows = sources?.rows || [];

  if (rows.length === 0) {
    return (
      <div className="market-sources" ref={ref}>
        <p className="market-sources__title">Where attention is arriving from</p>
        <p className="market-empty">No source detail yet this period.</p>
      </div>
    );
  }

  return (
    <div className="market-sources" ref={ref}>
      <p className="market-sources__title">Where attention is arriving from</p>
      <ol className="market-sources__list">
        {rows.map((row, i) => (
          <SourceRow key={row.source} row={row} index={i} inView={inView} reduce={reduce} />
        ))}
      </ol>
    </div>
  );
}

export default function MarketBoard({ markets, sources }) {
  return (
    <div className="market">
      <MarketLedger markets={markets} />
      <SourceNarrative sources={sources} />
    </div>
  );
}
