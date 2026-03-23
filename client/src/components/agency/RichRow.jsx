import MatchScoreRing from './ui/MatchScoreRing';
import TalentTypePill from './ui/TalentTypePill';
import { formatDistanceToNowStrict } from 'date-fns';
import './RichRow.css';

export default function RichRow({
  application,
  isSelected = false,
  isChecked = false,
  onSelect,
  onCheck,
}) {
  const {
    name, photo, type, height_cm, match_score,
    created_at, tags = [], status, viewed,
  } = application;

  const timeAgo = created_at
    ? formatDistanceToNowStrict(new Date(created_at), { addSuffix: true })
    : '';

  return (
    <div
      className={`ag-rich-row ${isSelected ? 'is-selected' : ''}`}
      onClick={() => onSelect?.(application)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onSelect?.(application); }}
    >
      {/* Checkbox / Unread dot */}
      <div className="ag-rich-row__check" onClick={e => { e.stopPropagation(); onCheck?.(application); }}>
        {isChecked !== undefined && (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => onCheck?.(application)}
            className="ag-rich-row__checkbox"
          />
        )}
        {!viewed && !isChecked && <span className="ag-rich-row__unread" />}
      </div>

      {/* Avatar */}
      <img
        src={photo || '/placeholder-avatar.png'}
        alt={name}
        className="ag-rich-row__avatar"
      />

      {/* Content */}
      <div className="ag-rich-row__content">
        <div className="ag-rich-row__line1">
          <span className="ag-rich-row__name">{name}</span>
          <span className="ag-rich-row__meta">
            {match_score != null && <MatchScoreRing score={match_score} size="sm" />}
            <span className="ag-rich-row__time">{timeAgo}</span>
          </span>
        </div>
        <div className="ag-rich-row__line2">
          <TalentTypePill type={type} size="sm" />
          {height_cm && <span className="ag-rich-row__stat">{height_cm}cm</span>}
        </div>
        {tags.length > 0 && (
          <div className="ag-rich-row__line3">
            {tags.slice(0, 3).map(t => (
              <span key={t.tag || t} className="ag-rich-row__tag">{t.tag || t}</span>
            ))}
            {tags.length > 3 && (
              <span className="ag-rich-row__tag ag-rich-row__tag--overflow">+{tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
