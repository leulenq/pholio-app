import React, { useMemo, useState } from 'react';
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable, DragOverlay, closestCorners,
} from '@dnd-kit/core';
import MatchScore from '../ui/MatchScore';
import './casting-kanban.css';

/**
 * The signing board as a working Kanban. Columns are the canonical casting
 * pipeline stages (casting-stage-helpers.js); "Passed" is an exit lane and
 * renders last, visually quieter. Dragging a card between columns calls
 * `onStageChange(candidate, stage)` — the page owns the optimistic update.
 */
const FORWARD_STAGES = ['Applied', 'Shortlisted', 'Offered', 'Represented'];
const EXIT_STAGE = 'Passed';
const KANBAN_STAGES = [...FORWARD_STAGES, EXIT_STAGE];

function candidateKey(c) {
  return String(c.applicationId ?? c.id);
}

function CandidateCard({ candidate, dragging, overlay }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: candidateKey(candidate),
    data: { candidate },
    disabled: overlay,
  });

  const className = [
    'ckb-card',
    isDragging ? 'ckb-card--ghost' : '',
    overlay || dragging ? 'ckb-card--lifted' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      className={className}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      aria-label={`${candidate.name}, ${candidate.stage}. Press space to lift, arrow keys to move between stages, space to drop.`}
    >
      <span
        className="ckb-card-photo"
        style={{ backgroundImage: candidate.avatar ? `url(${candidate.avatar})` : 'none' }}
        aria-hidden="true"
      />
      <span className="ckb-card-body">
        <span className="ckb-card-name">{candidate.name}</span>
        <span className="ckb-card-meta">
          {candidate.archetype || 'editorial'}
          {candidate.location ? ` · ${candidate.location}` : ''}
        </span>
        {candidate.score != null && (
          <MatchScore score={candidate.score} size="xs" className="ckb-card-score" />
        )}
      </span>
    </div>
  );
}

function StageColumn({ stage, candidates, isExit, activeStage }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const className = [
    'ckb-col',
    isExit ? 'ckb-col--exit' : '',
    isOver && activeStage && activeStage !== stage ? 'ckb-col--over' : '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={setNodeRef} className={className}>
      <div className="ckb-col-head">
        <span className="ckb-col-title">{stage}</span>
        <span className="ckb-col-count">{candidates.length}</span>
      </div>
      <div className="ckb-col-cards">
        {candidates.map((c) => (
          <CandidateCard key={candidateKey(c)} candidate={c} />
        ))}
        {candidates.length === 0 && (
          <p className="ckb-col-empty">
            {isExit ? 'No passes yet.' : 'Drag talent here.'}
          </p>
        )}
      </div>
    </div>
  );
}

export default function CastingKanban({ candidates, onStageChange }) {
  const [active, setActive] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const byStage = useMemo(() => {
    const groups = Object.fromEntries(KANBAN_STAGES.map((s) => [s, []]));
    for (const c of candidates) {
      (groups[c.stage] || groups.Applied).push(c);
    }
    return groups;
  }, [candidates]);

  const handleDragEnd = ({ active: dragged, over }) => {
    setActive(null);
    if (!over) return;
    const candidate = dragged.data.current?.candidate;
    const targetStage = String(over.id);
    if (!candidate || !KANBAN_STAGES.includes(targetStage)) return;
    if (candidate.stage === targetStage) return;
    onStageChange(candidate, targetStage);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active: dragged }) => setActive(dragged.data.current?.candidate || null)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="ckb" role="application" aria-label="Casting pipeline board">
        {KANBAN_STAGES.map((stage) => (
          <StageColumn
            key={stage}
            stage={stage}
            isExit={stage === EXIT_STAGE}
            candidates={byStage[stage]}
            activeStage={active?.stage || null}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? <CandidateCard candidate={active} overlay dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
