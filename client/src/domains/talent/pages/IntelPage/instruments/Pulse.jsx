import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Clock } from 'lucide-react';
import { CountUp, Calibrating } from './parts';
import { SPRING, TIER_RAMP, TIER_META, nf, pct } from './metrics';

/**
 * Zone 1 — The Pulse. The one-glance answer, composed as an editorial statement
 * rather than a KPI row (spec §3). The Signal Spectrum replaces every invented
 * "score": the talent sees the quality mix of their attention, not a number.
 */

/** Build the headline as serif copy with count-up numerals embedded. */
function Headline({ headline, periodLabel }) {
  const { reviews = 0, advances = 0, cardPulls = 0, linkOpens = 0, topMarket } = headline || {};
  const pulls = cardPulls + linkOpens;
  const meaningful = reviews + advances + pulls;

  if (meaningful === 0) {
    return (
      <p className="pulse-headline pulse-headline--quiet">
        No buying-power signal yet {periodLabel}. This is where it lands the
        moment a booker reviews your materials or your card gets pulled.
      </p>
    );
  }

  const num = (v) => <CountUp className="pulse-headline__num" value={v} />;

  return (
    <p className="pulse-headline">
      {reviews > 0 ? (
        <>
          {num(reviews)} {reviews === 1 ? 'agency' : 'agencies'} reviewed your
          materials {periodLabel}
        </>
      ) : (
        <>Your materials drew attention {periodLabel}</>
      )}
      {pulls > 0 ? (
        <>
          , and your card was pulled {num(pulls)}{' '}
          {pulls === 1 ? 'time' : 'times'}
        </>
      ) : null}
      {advances > 0 ? (
        <>
          . {num(advances)} {advances === 1 ? 'submission' : 'submissions'}{' '}
          moved forward
        </>
      ) : null}
      {topMarket && topMarket.share >= 0.25 ? (
        <> — most of it from {topMarket.label}.</> ) : '.'}
    </p>
  );
}

/**
 * The Signal Spectrum — the signature instrument. One horizontal band showing
 * the composition of this period's attention across the five tiers, ordered by
 * signal value (Tier 1 strongest). Segments animate in by weight.
 */
function SignalSpectrum({ spectrum }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduce = useReducedMotion();
  const rows = spectrum || [];
  const total = rows.reduce((a, r) => a + (r.count || 0), 0);

  if (total === 0) {
    return (
      <Calibrating
        title="The Signal Spectrum is live."
        listening="It fills the moment attention arrives — and shifts toward the top tiers as your materials start pulling bookers."
      />
    );
  }

  return (
    <div className="spectrum" ref={ref}>
      <div className="spectrum__band" role="img" aria-label="Attention composition by signal tier">
        {rows.map((row, i) => {
          const share = row.count / total;
          if (row.count === 0) return null;
          const meta = TIER_META.find((m) => m.key === row.key) || TIER_META[i];
          return (
            <motion.div
              key={row.key}
              className="spectrum__seg"
              style={{ background: TIER_RAMP[i] }}
              initial={reduce ? false : { flexGrow: 0.0001, opacity: 0 }}
              animate={inView ? { flexGrow: share, opacity: 1 } : undefined}
              transition={{ ...SPRING, delay: reduce ? 0 : i * 0.06 }}
              title={`${meta.label}: ${nf(row.count)} (${pct(share)})`}
            >
              {share >= 0.14 ? (
                <span className="spectrum__seg-label">
                  {meta.label}
                  <em>{pct(share)}</em>
                </span>
              ) : null}
            </motion.div>
          );
        })}
      </div>
      <ol className="spectrum__legend">
        {rows.map((row, i) => {
          const meta = TIER_META.find((m) => m.key === row.key) || TIER_META[i];
          return (
            <li key={row.key} className={row.count === 0 ? 'is-empty' : undefined}>
              <span className="spectrum__dot" style={{ background: TIER_RAMP[i] }} />
              <span className="spectrum__legend-label">{meta.label}</span>
              <span className="spectrum__legend-count">{nf(row.count)}</span>
              <span className="spectrum__legend-hint">{meta.hint}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const VERDICT_COPY = {
  current: { word: 'Current', tone: 'good', line: 'Your materials are agency-ready.' },
  aging: { word: 'Aging', tone: 'warn', line: 'Some materials are approaching their window.' },
  stale: { word: 'Stale', tone: 'bad', line: 'A booker would ask you to refresh before submitting.' },
};

function MaterialsVerdict({ materials }) {
  const v = VERDICT_COPY[materials?.verdict] || VERDICT_COPY.current;
  return (
    <a className={`pulse-verdict pulse-verdict--${v.tone}`} href="#intel-lens">
      <span className="pulse-verdict__label">Materials</span>
      <span className="pulse-verdict__word">{v.word}</span>
      <span className="pulse-verdict__line">{v.line}</span>
    </a>
  );
}

function InMotionTicker({ rows }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="pulse-motion pulse-motion--empty">
        <Clock size={15} strokeWidth={1.6} aria-hidden />
        <p>Nothing advancing right now. When a house shortlists you or requests
          more, the most urgent move surfaces here.</p>
      </div>
    );
  }
  return (
    <div className="pulse-motion">
      <p className="pulse-motion__title">In motion</p>
      <ul className="pulse-motion__list">
        {rows.map((r) => (
          <li key={r.applicationId} className={r.urgent ? 'is-urgent' : undefined}>
            <span className="pulse-motion__agency">{r.agencyName}</span>
            <span className="pulse-motion__status">{r.statusLabel}</span>
            <span className="pulse-motion__when">
              {r.daysAgo === 0
                ? 'today'
                : r.daysAgo === 1
                ? '1 day ago'
                : r.daysAgo != null
                ? `${r.daysAgo} days ago`
                : ''}
            </span>
            {r.urgent ? <span className="pulse-motion__cta">Respond today</span> : null}
          </li>
        ))}
      </ul>
      <Link to="/dashboard/talent/applications" className="pulse-motion__all">
        Open Market <ArrowUpRight size={13} strokeWidth={1.8} />
      </Link>
    </div>
  );
}

export default function Pulse({ pulse, periodLabel, minor }) {
  return (
    <div className="pulse">
      {minor ? (
        <p className="pulse-headline">Your materials readiness and submissions, at a glance.</p>
      ) : (
        <Headline headline={pulse?.headline} periodLabel={periodLabel} />
      )}
      <div className="pulse__grid">
        <div className="pulse__spectrum">
          {minor ? (
            <p className="pulse-headline--quiet">
              Attention detail is withheld on this profile. Intel shows your
              materials readiness and submission states only.
            </p>
          ) : (
            <SignalSpectrum spectrum={pulse?.spectrum} />
          )}
        </div>
        <aside className="pulse__side">
          <MaterialsVerdict materials={pulse?.materials} />
          <InMotionTicker rows={pulse?.inMotion} />
        </aside>
      </div>
    </div>
  );
}
