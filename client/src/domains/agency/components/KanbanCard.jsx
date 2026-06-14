import MatchScore from './ui/MatchScore';

export default function KanbanCard({ application, onClick, isSelected }) {
  const { name, photo, type, match_score } = application;

  return (
    <div
      className={`ag-kanban-card ${isSelected ? 'is-selected' : ''}`}
      onClick={() => onClick?.(application)}
    >
      <img src={photo || '/placeholder-avatar.png'} alt={name} className="ag-kanban-card__avatar" />
      <div className="ag-kanban-card__info">
        <div className="ag-kanban-card__name-row">
          <span className="ag-kanban-card__name">{name}</span>
          {match_score != null && <MatchScore score={match_score} size="xs" />}
        </div>
        {type && (
          <div className="ag-kanban-card__meta">
            <span className="ag-kanban-card__type">{type}</span>
          </div>
        )}
      </div>
    </div>
  );
}
