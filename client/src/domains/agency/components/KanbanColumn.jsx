import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import KanbanCard from './KanbanCard';
import './Kanban.css';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function KanbanColumn({
  stage,
  count,
  cards = [],
  onCardClick,
  selectedCardId,
  isCollapsed = false,
  onToggleCollapse,
  id,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: id || stage });

  if (isCollapsed) {
    return (
      <div className="ag-kanban-col ag-kanban-col--collapsed" onClick={onToggleCollapse}>
        <span className="ag-kanban-col__label-v">{stage}</span>
        <span className="ag-kanban-col__count">{count}</span>
      </div>
    );
  }

  return (
    <div className={`ag-kanban-col ${isOver ? 'is-over' : ''}`} ref={setNodeRef}>
      <div className="ag-kanban-col__header">
        <button className="ag-kanban-col__collapse" onClick={onToggleCollapse}>
          <ChevronDown size={14} />
        </button>
        <span className="ag-kanban-col__stage">{stage}</span>
        <span className="ag-kanban-col__count">{count}</span>
      </div>
      <div className="ag-kanban-col__cards">
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map(card => (
            <KanbanCard
              key={card.id}
              application={card}
              onClick={onCardClick}
              isSelected={card.id === selectedCardId}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
