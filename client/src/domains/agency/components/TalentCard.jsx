import { ClipboardList, MessageCircle, Bookmark } from 'lucide-react';
import MatchScore from './ui/MatchScore';
import { TypeSpec, AvailabilityCell } from './status';
import './TalentCard.css';

export default function TalentCard({
  profile,
  status,
  matchScore,
  tags = [],
  onSelect,
  showQuickActions = true,
}) {
  const { name, photo, type, height_cm } = profile;

  return (
    <div className="ag-talent-card" onClick={() => onSelect?.(profile)}>
      <div className="ag-talent-card__image-wrap">
        <img
          src={photo || '/placeholder-avatar.png'}
          alt={name}
          className="ag-talent-card__image"
        />
        {showQuickActions && (
          <div className="ag-talent-card__quick-actions">
            <button className="ag-talent-card__qbtn" title="Bookmark" onClick={e => e.stopPropagation()}>
              <Bookmark size={14} />
            </button>
            <button className="ag-talent-card__qbtn" title="Add to Board" onClick={e => e.stopPropagation()}>
              <ClipboardList size={14} />
            </button>
            <button className="ag-talent-card__qbtn" title="Message" onClick={e => e.stopPropagation()}>
              <MessageCircle size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="ag-talent-card__info">
        <div className="ag-talent-card__row1">
          <span className="ag-talent-card__name">{name}</span>
          {matchScore != null && <MatchScore score={matchScore} size="sm" />}
        </div>
        <div className="ag-talent-card__row2">
          {type && <TypeSpec type={type} />}
          {height_cm && <span className="ag-talent-card__stat">{height_cm}cm</span>}
          {status && (
            <span className="ag-talent-card__avail">
              <AvailabilityCell status={status} sm />
            </span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="ag-talent-card__tags">
            {tags.slice(0, 2).map(t => (
              <span key={t.tag || t} className="ag-talent-card__tag">{t.tag || t}</span>
            ))}
            {tags.length > 2 && <span className="ag-talent-card__tag ag-talent-card__tag--overflow">+{tags.length - 2}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
