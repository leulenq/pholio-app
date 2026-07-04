import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Calibrating } from './IntelKit';
import { pct, sourceLabel, sourceMeaning } from './intelUtils';

function Sparkline({ points }) {
  const vals = Array.isArray(points) ? points.map((p) => Number(p) || 0) : [];
  if (vals.length < 2) return <span className="intel2-spark intel2-spark--flat" aria-hidden />;
  const w = 72;
  const h = 22;
  const max = Math.max(1, ...vals);
  const step = w / (vals.length - 1);
  const d = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 3) - 1.5).toFixed(1)}`).join(' L');
  return (
    <svg className="intel2-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path d={`M${d}`} fill="none" stroke="#B8956A" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function MixBar({ mix }) {
  const agency = Number(mix?.agency) || 0;
  const client = Number(mix?.client) || 0;
  const pub = Number(mix?.public) || 0;
  const total = agency + client + pub;
  if (total === 0) return null;
  return (
    <div className="intel2-mix">
      <div className="intel2-mix-bar" aria-hidden>
        <span style={{ width: `${(agency / total) * 100}%`, background: '#1A1815' }} />
        <span style={{ width: `${(client / total) * 100}%`, background: '#B8956A' }} />
        <span style={{ width: `${(pub / total) * 100}%`, background: 'rgba(184,149,106,0.35)' }} />
      </div>
      <span className="intel2-mix-caption">{agency} agency · {client} client · {pub} public</span>
    </div>
  );
}

function MarketRow({ row, showShare, showDelta }) {
  const label = row.label || String(row.market || '').toUpperCase();
  const delta = row.delta;
  return (
    <li className="intel2-market-row">
      <span className="intel2-market-name">{label}</span>
      <Sparkline points={row.days} />
      <span className="intel2-market-figs">
        {showShare ? <span className="intel2-market-share">{pct(row.share)}%</span> : null}
        {/* delta is a raw count difference vs the prior period, not a percent */}
        {showDelta && delta != null && delta !== 0 ? (
          <span className={`intel2-market-delta ${delta > 0 ? 'is-up' : 'is-down'}`}>
            {delta > 0 ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
            {delta > 0 ? '+' : '−'}{Math.abs(delta)}
          </span>
        ) : null}
      </span>
      <MixBar mix={row.mix} />
    </li>
  );
}

/**
 * Zone 3 — The Market Board. Attention rendered as the industry thinks:
 * markets, not countries. Sustained market attention is a placement signal.
 * Sources fold in below as a ranked list with one meaning each — never a donut.
 */
export default function MarketBoard({ markets, sources, meta }) {
  const smallSample = Boolean(meta?.smallSample);
  const deltasSuppressed = Boolean(meta?.deltasSuppressed);
  const marketRows = Array.isArray(markets?.rows) ? markets.rows : [];
  const sourceRows = Array.isArray(sources?.rows) ? sources.rows : [];

  return (
    <div className="intel2-market">
      {markets?.calibrating || marketRows.length === 0 ? (
        <Calibrating>
          The Market Board lights up as located attention accrues — markets resolve from the next
          visit onward. Nothing here is estimated.
        </Calibrating>
      ) : (
        <ol className="intel2-market-list">
          {marketRows.map((row) => (
            <MarketRow
              key={row.market}
              row={row}
              showShare={!smallSample}
              showDelta={!deltasSuppressed}
            />
          ))}
        </ol>
      )}

      {sourceRows.length > 0 && (
        <div className="intel2-sources">
          <h3 className="intel2-subhead">Where it comes from</h3>
          <ul className="intel2-source-list">
            {sourceRows.map((row) => (
              <li key={row.source} className="intel2-source-row">
                <span className="intel2-source-name">{sourceLabel(row.source)}</span>
                <span className="intel2-source-count">
                  {Number(row.count) || 0}{!smallSample ? ` · ${pct(row.share)}%` : ''}
                </span>
                <span className="intel2-source-meaning">{sourceMeaning(row.source)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
