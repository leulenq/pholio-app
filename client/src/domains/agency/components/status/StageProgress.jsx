import React from 'react';
import { PIPELINE, LADDER, getStage, getLadderIndex } from './statusConfig';
import './status-system.css';

/**
 * Stage (an ordinal ladder). Stages climb, so they're drawn as progress,
 * never as a flat label. Three forms share one config:
 *
 *   StageTrack  — full node track for single-talent focus (detail panels)
 *   StageMark   — compact track + label for dense table rows
 *   StageLadder — the development standing (New Faces → Development → Main Board)
 */

/** Build the node list for a resolved stage against the canonical pipeline. */
function nodes(stage) {
  if (stage.off) {
    // Left the ladder: fill up to where it stalled, then an off terminal.
    return [
      ...PIPELINE.slice(0, 2).map((p) => ({ label: p.label, state: 'done' })),
      { label: stage.label, state: 'off' },
    ];
  }
  return PIPELINE.map((p, i) => ({
    label: p.label,
    state: i < stage.idx ? 'done' : i === stage.idx ? 'cur' : 'future',
  }));
}

export function StageTrack({ status, labelled = true }) {
  const stage = getStage(status);
  const list = nodes(stage);
  return (
    <span className={`ss-track${labelled ? ' ss-track--labelled' : ''}`} style={{ '--c': stage.c }}>
      {list.map((n, i) => (
        <React.Fragment key={i}>
          <span className={`ss-track__node ss-track__node--${n.state}`}>
            <span className="ss-track__dot" />
            {labelled && <span className="ss-track__label">{n.label}</span>}
          </span>
          {i < list.length - 1 && (
            <span className={`ss-track__seg${list[i].state === 'done' ? ' ss-track__seg--done' : ''}`} />
          )}
        </React.Fragment>
      ))}
    </span>
  );
}

export function StageMark({ status }) {
  const stage = getStage(status);
  const list = nodes(stage);
  return (
    <span className="ss-mark" style={{ '--c': stage.c }}>
      <span className="ss-mark__track">
        {list.map((n, i) => (
          <React.Fragment key={i}>
            <span
              className={`ss-mark__dot${
                n.state === 'done' ? ' ss-mark__dot--done'
                  : n.state === 'cur' ? ' ss-mark__dot--cur'
                  : n.state === 'off' ? ' ss-mark__dot--off' : ''
              }`}
            />
            {i < list.length - 1 && (
              <span className={`ss-mark__seg${list[i].state === 'done' ? ' ss-mark__seg--done' : ''}`} />
            )}
          </React.Fragment>
        ))}
      </span>
      <span className="ss-mark__label">{stage.label}</span>
    </span>
  );
}

export function StageLadder({ stage, c = 'var(--ss-live)' }) {
  const cur = getLadderIndex(stage);
  return (
    <span className="ss-ladder" style={{ '--c': c }}>
      {LADDER.map((rung, i) => {
        const cls = i < cur ? ' ss-ladder__rung--past' : i === cur ? ' ss-ladder__rung--on' : '';
        return (
          <span key={rung.key} className={`ss-ladder__rung${cls}`}>
            <span className="ss-ladder__num">{i + 1}</span>
            {rung.label}
          </span>
        );
      })}
    </span>
  );
}

export default StageMark;
