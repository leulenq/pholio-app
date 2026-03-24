import MatchScoreRing from './ui/MatchScoreRing';
import { TalentTypePill } from './ui/TalentTypePill';
import { ClipboardList, MessageCircle, Bookmark } from 'lucide-react';
import './TalentCard.css';

const STATUS_COLORS = {
  available: 'var(--ag-status-available)',
  on_booking: 'var(--ag-status-on-booking)',
  on_hold: 'var(--ag-status-on-hold)',
  inactive: 'var(--ag-status-inactive)',
};

const STATUS_LABELS = {
  available: 'Available',
  on_booking: 'On Booking',
  on_hold: 'On Hold',
  inactive: 'Inactive',
};

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
        {status && (
          <span
            className="ag-talent-card__status"
            style={{ background: STATUS_COLORS[status] }}
            title={STATUS_LABELS[status]}
          />
        )}
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
          {matchScore != null && <MatchScoreRing score={matchScore} size="sm" />}
        </div>
        <div className="ag-talent-card__row2">
          <TalentTypePill type={type} size="sm" />
          {height_cm && <span className="ag-talent-card__stat">{height_cm}cm</span>}
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
