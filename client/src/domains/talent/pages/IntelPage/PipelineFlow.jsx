import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PholioToggleButton, PholioToggleGroup } from '../../../../shared/components/ui/PholioButton';
import StageClock from './StageClock';
import { SECTION_EASE } from './intelUtils';

const DIAGNOSIS_COPY = {
  materials: 'Submissions are being reviewed but not advancing — that’s a materials signal. The Lens below shows what to fix.',
  targeting: 'Submissions aren’t being opened — aim at different boards, or submit more.',
  follow_through: 'You advance, then stall — keep the momentum: respond fast and follow up.',
  healthy: 'The pipeline is moving the way it should.',
};

const OUTCOME_ORDER = [
  { key: 'signed', label: 'Signed', color: '#B08D45' },
  { key: 'inMotion', label: 'In motion', color: '#C9A55A' },
  { key: 'keptOnFile', label: 'Kept on file', color: '#8A6F4E' },
  { key: 'awaiting', label: 'Awaiting', color: 'rgba(26,24,21,0.28)' },
  { key: 'passed', label: 'Passed', color: 'rgba(26,24,21,0.16)' },
  { key: 'withdrawn', label: 'Withdrawn', color: 'rgba(26,24,21,0.12)' },
];

const W = 720;
const H = 210;
const TOP = 16;
const BOT = 178;
const PLOT_H = BOT - TOP;

function Spine({ data }) {
  const reduce = useReducedMotion();
  const entered = Number(data.entered) || 0;
  const ref = Math.max(1, entered);
  const stages = [
    { label: 'Entered', count: entered, x: 70 },
    { label: 'Reviewed', count: Number(data.reviewed) || 0, x: 250 },
    { label: 'Advanced', count: Number(data.advanced) || 0, x: 430 },
  ];
  const bandH = (c) => (c === 0 ? 0 : Math.max(6, (c / ref) * PLOT_H));
  const bandY = (c) => BOT - bandH(c);
  const halfW = 26;

  const outcomes = OUTCOME_ORDER
    .map((o) => ({ ...o, count: Number(data.outcomes?.[o.key]) || 0 }))
    .filter((o) => o.count > 0);
  const outTotal = outcomes.reduce((s, o) => s + o.count, 0) || 1;
  const outX = 610;
  // Stack outcome bands bottom-up before render so JSX stays mutation-free.
  const placed = [];
  for (let i = 0, acc = BOT; i < outcomes.length; i += 1) {
    const o = outcomes[i];
    const h = Math.max(4, (o.count / outTotal) * PLOT_H);
    acc -= h;
    placed.push({ ...o, h, y: acc });
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="intel2-pipe-svg" role="img" aria-label="Submission pipeline flow">
      {/* connectors */}
      {stages.slice(0, -1).map((s, i) => {
        const next = stages[i + 1];
        return (
          <motion.path
            key={`cx-${s.label}`}
            d={`M${s.x + halfW},${bandY(s.count)} L${next.x - halfW},${bandY(next.count)} L${next.x - halfW},${BOT} L${s.x + halfW},${BOT} Z`}
            fill="rgba(184,149,106,0.12)"
            initial={{ opacity: reduce ? 1 : 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 + i * 0.1 }}
          />
        );
      })}
      {/* connector into outcomes */}
      <motion.path
        d={`M${stages[2].x + halfW},${bandY(stages[2].count)} L${outX - 20},${TOP} L${outX - 20},${BOT} L${stages[2].x + halfW},${BOT} Z`}
        fill="rgba(184,149,106,0.08)"
        initial={{ opacity: reduce ? 1 : 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.4 }}
      />

      {/* spine bands */}
      {stages.map((s, i) => (
        <g key={s.label}>
          <motion.rect
            x={s.x - halfW} width={halfW * 2}
            rx="3"
            initial={reduce ? { y: bandY(s.count), height: bandH(s.count) } : { y: BOT, height: 0 }}
            whileInView={{ y: bandY(s.count), height: bandH(s.count) }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.7, delay: i * 0.12, ease: SECTION_EASE }}
            fill={i === 0 ? '#1A1815' : i === 1 ? '#8A6F4E' : '#C9A55A'}
          />
          <text x={s.x} y={BOT + 16} textAnchor="middle" className="intel2-pipe-axis">{s.label}</text>
          <text x={s.x} y={bandY(s.count) - 8} textAnchor="middle" className="intel2-pipe-count">{s.count}</text>
        </g>
      ))}

      {/* outcomes stacked column */}
      {placed.map((o) => (
        <g key={o.key}>
          <motion.rect
            x={outX - 20} width="40" rx="3"
            y={o.y} height={o.h - 2}
            fill={o.color}
            initial={{ opacity: reduce ? 1 : 0, x: reduce ? outX - 20 : outX - 4 }}
            whileInView={{ opacity: 1, x: outX - 20 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.5 }}
          />
          <text x={outX + 28} y={o.y + o.h / 2 + 3} className="intel2-pipe-outlabel">{o.label} {o.count}</text>
        </g>
      ))}
    </svg>
  );
}

/**
 * Zone 4 — The Pipeline. The funnel the model actually lives, drawn as a flow
 * instrument with an automatic diagnosis, the Stage Clock, and kept-on-file
 * framed as the soft yes it really is.
 */
export default function PipelineFlow({ pipeline }) {
  const [scope, setScope] = useState('period');
  const data = pipeline?.[scope] || {};
  const diagnosis = pipeline?.diagnosis ? DIAGNOSIS_COPY[pipeline.diagnosis] : null;
  const kept = pipeline?.keptOnFile;

  return (
    <div className="intel2-pipe">
      <div className="intel2-pipe-controls">
        <PholioToggleGroup role="group" aria-label="Pipeline scope">
          <PholioToggleButton active={scope === 'period'} onClick={() => setScope('period')}>
            This period
          </PholioToggleButton>
          <PholioToggleButton active={scope === 'lifetime'} onClick={() => setScope('lifetime')}>
            Lifetime
          </PholioToggleButton>
        </PholioToggleGroup>
      </div>

      <Spine data={data} />

      {diagnosis && <p className="intel2-pipe-diagnosis">{diagnosis}</p>}

      {kept && (kept.agencies > 0 ? (
        <p className="intel2-pipe-kept">
          On file at {kept.agencies} {kept.agencies === 1 ? 'agency' : 'agencies'}. Boards reopen; files get pulled.
        </p>
      ) : (
        <p className="intel2-pipe-kept intel2-pipe-kept--quiet">
          Nothing kept on file yet — it&rsquo;s a soft yes that arrives after a board reviews you.
        </p>
      ))}

      <StageClock stageClock={pipeline?.stageClock} />
    </div>
  );
}
