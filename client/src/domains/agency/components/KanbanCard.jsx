import MatchScoreRing from './ui/MatchScoreRing';
import { TalentTypePill } from './ui/TalentTypePill';

export default function KanbanCard({ application, onClick, isSelected }) {
  const { name, photo, type, match_score } = application;

  return (
    <div
      className={`ag-kanban-card ${isSelected ? 'is-selected' : ''}`}
      onClick={() => onClick?.(application)}
    >
      <img src={photo || '/placeholder-avatar.png'} alt={name} className="ag-kanban-card__avatar" />
      <div className="ag-kanban-card__info">
        <span className="ag-kanban-card__name">{name}</span>
        <div className="ag-kanban-card__meta">
          <TalentTypePill type={type} size="sm" />
        </div>
      </div>
      {match_score != null && (
        <div className="ag-kanban-card__score">
          <MatchScoreRing score={match_score} size="sm" />
        </div>
      )}
    </div>
  );
}
