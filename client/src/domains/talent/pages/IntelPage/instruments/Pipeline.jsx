import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useReveal } from './useReveal';
import { ArrowUpRight } from 'lucide-react';
import { Calibrating } from './parts';
import { SPRING, nf } from './metrics';
import './Pipeline.css';

/**
 * Zone 4 — The Pipeline. The submission funnel the model actually lives, drawn
 * as a flow instrument (spec §3): submissions enter, split through reviewed →
 * advanced, and settle into outcomes. Plus the Stage Clock (review latency vs
 * platform-typical band) and kept-on-file framed as the soft yes it is.
 */

const DIAGNOSIS = {
  targeting: {
    text: "Your submissions aren't getting opened. That's a targeting or volume problem, not a materials one — you may be reaching the wrong houses, or too few of them.",
    to: '/dashboard/talent/applications',
    cta: 'Review your Market',
    anchor: false,
  },
  materials: {
    text: 'Bookers are opening your submissions but not advancing them. That points at the materials — see the Agency Lens below.',
    to: '#intel-lens',
    cta: 'Open the Agency Lens',
    anchor: true,
  },
  follow_through: {
    text: "You're advancing but stalling before an outcome. Follow-through — response time and the next materials you send — is where this is being lost.",
    to: '/dashboard/talent/applications',
    cta: 'Open Market',
    anchor: false,
  },
  healthy: {
    text: 'Your pipeline is moving the way it should — submissions are being opened, advanced, and settling into outcomes.',
    to: null,
  },
};

const OUTCOME_META = [
  { key: 'signed', label: 'Signed / booked', tone: 'gold' },
  { key: 'inMotion', label: 'In motion', tone: 'gold-soft' },
  { key: 'keptOnFile', label: 'Kept on file', tone: 'gold-soft' },
  { key: 'awaiting', label: 'Awaiting review', tone: 'ink' },
  { key: 'passed', label: 'Passed', tone: 'grey' },
  { key: 'withdrawn', label: 'Withdrawn', tone: 'grey' },
];

const VB_W = 1000;
const VB_H = 300;

/** A horizontal stage column of stacked, proportional streams. */
function stageBands(items, total, x, colW) {
  const gap = 3;
  const usable = VB_H - gap * Math.max(0, items.length - 1);
  let y = 0;
  return items.map((it) => {
    const h = total > 0 ? (it.value / total) * usable : 0;
    const band = { ...it, x, y, w: colW, h: Math.max(it.value > 0 ? 6 : 0, h) };
    y += band.h + gap;
    return band;
  });
}

function FlowDiagram({ flow }) {
  const ref = useRef(null);
  const inView = useReveal();
  const reduce = useReducedMotion();

  const model = useMemo(() => {
    const total = Math.max(1, flow.entered);
    const colW = 150;
    const gap = (VB_W - colW * 3) / 2;
    const x0 = 0;
    const x1 = colW + gap;
    const x2 = (colW + gap) * 2;

    const entered = stageBands(
      [{ key: 'entered', label: 'Submitted', value: flow.entered, tone: 'ink' }],
      total,
      x0,
      colW,
    );
    const mid = stageBands(
      [
        { key: 'advanced', label: 'Advanced', value: flow.advanced, tone: 'gold' },
        {
          key: 'reviewedOnly',
          label: 'Reviewed',
          value: Math.max(0, flow.reviewed - flow.advanced),
          tone: 'ink',
        },
        {
          key: 'unopened',
          label: 'Not yet opened',
          value: Math.max(0, flow.entered - flow.reviewed),
          tone: 'grey',
        },
      ].filter((d) => d.value > 0),
      total,
      x1,
      colW,
    );
    const outcomes = stageBands(
      OUTCOME_META.map((m) => ({ ...m, value: flow.outcomes[m.key] || 0 })).filter(
        (d) => d.value > 0,
      ),
      total,
      x2,
      colW,
    );
    return { entered, mid, outcomes, x1, colW, gap };
  }, [flow]);

  const bandClass = (tone) => `pipe-band pipe-band--${tone}`;

  const renderCol = (bands, delayBase) =>
    bands.map((b, i) => (
      <motion.g
        key={b.key}
        initial={reduce ? false : { opacity: 0, x: -12 }}
        animate={inView ? { opacity: 1, x: 0 } : undefined}
        transition={{ ...SPRING, delay: reduce ? 0 : delayBase + i * 0.06 }}
      >
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} className={bandClass(b.tone)} />
        {b.h >= 22 ? (
          <>
            <text x={b.x + 12} y={b.y + b.h / 2 - 2} className="pipe-band__label">
              {b.label}
            </text>
            <text x={b.x + 12} y={b.y + b.h / 2 + 14} className="pipe-band__val">
              {nf(b.value)}
            </text>
          </>
        ) : (
          <text x={b.x + 12} y={b.y + b.h / 2 + 4} className="pipe-band__label">
            {b.label} · {nf(b.value)}
          </text>
        )}
      </motion.g>
    ));

  // A filled ribbon between two columns: thickness carries the count, so the
  // flow reads as streams settling into outcomes rather than lines between bars.
  const ribbon = (x1, y1, w1, x2, y2, w2) => {
    const mx = (x1 + x2) / 2;
    return (
      `M ${x1} ${y1 - w1 / 2} ` +
      `C ${mx} ${y1 - w1 / 2} ${mx} ${y2 - w2 / 2} ${x2} ${y2 - w2 / 2} ` +
      `L ${x2} ${y2 + w2 / 2} ` +
      `C ${mx} ${y2 + w2 / 2} ${mx} ${y1 + w1 / 2} ${x1} ${y1 + w1 / 2} Z`
    );
  };

  const entered0 = model.entered[0];
  const midRightX = model.x1 + model.colW;

  // Stage 1 — the submission pool splits into the mid column, stacked to fill
  // the entered band so the widths partition it.
  const stage1 = [];
  if (entered0) {
    let off = entered0.y;
    for (const m of model.mid) {
      const w = m.h;
      const y1 = off + w / 2;
      off += w;
      stage1.push({ key: m.key, tone: m.tone, d: ribbon(entered0.x + entered0.w, y1, w, m.x, m.y + m.h / 2, m.h) });
    }
  }

  // Stage 2 — everything settles into outcomes; stack the outcome ribbons over
  // the pool's full height at the mid column's right edge.
  const stage2 = [];
  if (entered0 && model.outcomes.length) {
    const totalOut = model.outcomes.reduce((s, o) => s + o.h, 0) || 1;
    const scale = entered0.h / totalOut;
    let off = entered0.y;
    for (const o of model.outcomes) {
      const w = o.h * scale;
      const y1 = off + w / 2;
      off += w;
      stage2.push({ key: o.key, tone: o.tone, d: ribbon(midRightX, y1, w, o.x, o.y + o.h / 2, o.h) });
    }
  }

  return (
    <svg
      ref={ref}
      className="pipe-svg"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Submission flow"
    >
      <g className="pipe-flows">
        {stage1.map((s) => (
          <motion.path
            key={`l1-${s.key}`}
            d={s.d}
            className={`pipe-flow pipe-flow--${s.tone}`}
            initial={reduce ? false : { opacity: 0 }}
            animate={inView ? { opacity: 1 } : undefined}
            transition={{ duration: 0.5, delay: reduce ? 0 : 0.2 }}
          />
        ))}
        {stage2.map((s) => (
          <motion.path
            key={`l2-${s.key}`}
            d={s.d}
            className={`pipe-flow pipe-flow--${s.tone}`}
            initial={reduce ? false : { opacity: 0 }}
            animate={inView ? { opacity: 1 } : undefined}
            transition={{ duration: 0.5, delay: reduce ? 0 : 0.35 }}
          />
        ))}
      </g>
      {renderCol(model.entered, 0.1)}
      {renderCol(model.mid, 0.25)}
      {renderCol(model.outcomes, 0.4)}
    </svg>
  );
}

/** Stage Clock — your median review latency against the platform-typical band. */
function StageClock({ clock }) {
  const ref = useRef(null);
  const inView = useReveal();
  const reduce = useReducedMotion();

  const mine = clock?.medianReviewDays;
  const band = clock?.typicalBand;

  if (mine == null || !band) {
    return (
      <div className="pipe-clock pipe-clock--quiet">
        <p className="pipe-clock__title">Review latency</p>
        <p className="pipe-clock__empty">
          Not enough reviewed submissions yet to time your median against the
          platform. Agencies are slow — silence is not rejection.
        </p>
      </div>
    );
  }

  const max = Math.max(mine, band.p75) * 1.25 || 1;
  const toPct = (v) => `${Math.min(100, (v / max) * 100)}%`;

  return (
    <div className="pipe-clock" ref={ref}>
      <p className="pipe-clock__title">Review latency</p>
      <div className="pipe-clock__scale">
        <div
          className="pipe-clock__band"
          style={{ left: toPct(band.p25), width: `calc(${toPct(band.p75)} - ${toPct(band.p25)})` }}
        />
        <motion.div
          className="pipe-clock__dot"
          style={{ left: toPct(mine) }}
          initial={reduce ? false : { scale: 0 }}
          animate={inView ? { scale: 1 } : undefined}
          transition={SPRING}
        />
        <div className="pipe-clock__axis">
          <span>0d</span>
          <span>{Math.round(max)}d</span>
        </div>
      </div>
      <p className="pipe-clock__read">
        Your median review lands in <strong>{mine} {mine === 1 ? 'day' : 'days'}</strong>.
        Typical is {band.p25}–{band.p75} days. Agencies are slow — silence is not rejection.
      </p>
    </div>
  );
}

export default function Pipeline({ pipeline }) {
  const [scope, setScope] = useState('period');
  const period = pipeline?.period || { entered: 0, outcomes: {} };
  const lifetime = pipeline?.lifetime || { entered: 0, outcomes: {} };
  const hasLifetime = lifetime.entered > 0;
  const flow = scope === 'period' ? period : lifetime;
  const diagnosis = pipeline?.diagnosis ? DIAGNOSIS[pipeline.diagnosis] : null;
  const kept = pipeline?.keptOnFile || { count: 0, agencies: 0 };

  if (period.entered === 0 && scope === 'period') {
    return (
      <div className="pipe">
        {hasLifetime ? (
          <div className="pipe-scope" role="group" aria-label="Pipeline scope">
            <button type="button" className="is-active" aria-pressed="true">This period</button>
            <button type="button" onClick={() => setScope('lifetime')} aria-pressed="false">Lifetime</button>
          </div>
        ) : null}
        <Calibrating
          title="Your pipeline is ready."
          listening="The moment you submit to an agency, this tracks it end to end — reviewed, advanced, and how it settles. Kept on file counts as a yes here."
        />
      </div>
    );
  }

  return (
    <div className="pipe">
      {hasLifetime ? (
        <div className="pipe-scope" role="group" aria-label="Pipeline scope">
          <button
            type="button"
            className={scope === 'period' ? 'is-active' : undefined}
            aria-pressed={scope === 'period'}
            onClick={() => setScope('period')}
          >
            This period
          </button>
          <button
            type="button"
            className={scope === 'lifetime' ? 'is-active' : undefined}
            aria-pressed={scope === 'lifetime'}
            onClick={() => setScope('lifetime')}
          >
            Lifetime
          </button>
        </div>
      ) : null}

      <FlowDiagram flow={flow} />

      {diagnosis ? (
        <div className="pipe-diagnosis">
          <p>{diagnosis.text}</p>
          {diagnosis.to ? (
            diagnosis.anchor ? (
              <a href={diagnosis.to} className="pipe-diagnosis__cta">
                {diagnosis.cta} <ArrowUpRight size={13} strokeWidth={1.8} />
              </a>
            ) : (
              <Link to={diagnosis.to} className="pipe-diagnosis__cta">
                {diagnosis.cta} <ArrowUpRight size={13} strokeWidth={1.8} />
              </Link>
            )
          ) : null}
        </div>
      ) : null}

      <div className="pipe-lower">
        <StageClock clock={pipeline?.stageClock} />
        {kept.count > 0 ? (
          <div className="pipe-kept">
            <p className="pipe-kept__lead">
              On file at <strong>{kept.agencies}</strong> {kept.agencies === 1 ? 'agency' : 'agencies'}.
            </p>
            <p className="pipe-kept__line">
              Kept on file is the most common real outcome — and a soft yes.
              Boards reopen; files get pulled.
            </p>
          </div>
        ) : null}
      </div>

      <Link to="/dashboard/talent/applications" className="pipe-all">
        Open the full submissions ledger <ArrowUpRight size={13} strokeWidth={1.8} />
      </Link>
    </div>
  );
}
