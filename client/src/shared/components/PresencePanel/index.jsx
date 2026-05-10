import { User } from 'lucide-react';
import './PresencePanel.css';

const STATUS = {
  strong:     { label: 'Strong Foundation', pip: 'strong' },
  attention:  { label: 'Needs Attention',   pip: 'attention' },
  incomplete: { label: 'Incomplete',        pip: 'incomplete' },
};

function scoreToStatus(score) {
  if (score >= 70) return 'strong';
  if (score >= 40) return 'attention';
  return 'incomplete';
}

/**
 * @param {object}   props
 * @param {number}   props.score            0–100
 * @param {string}   props.interpretation   Sentence shown in italic
 * @param {Array<{text: string, reason: string, priority: 'high'|'med'|'low'}>} props.actions
 * @param {string|null} props.photoUrl      First portfolio image URL; null → placeholder
 */
export default function PresencePanel({ score = 0, interpretation = '', actions = [], photoUrl = null }) {
  const statusKey = scoreToStatus(score);
  const { label: statusLabel } = STATUS[statusKey];
  const showActions = actions.length > 0 && !(score >= 95 && actions.length === 0);

  return (
    <div className="pp-panel">
      {/* Score zone */}
      <div className="pp-score-zone">
        <span className="pp-eyebrow">Profile Strength</span>
        <div className="pp-number">{score}</div>
        <div className="pp-denom">/ 100</div>
        <div className={`pp-status pp-status--${statusKey}`}>
          <span className="pp-status-pip" aria-hidden="true" />
          <span className="pp-status-text">{statusLabel}</span>
        </div>
      </div>

      {/* Vertical divider */}
      <div className="pp-divider" aria-hidden="true" />

      {/* Content zone */}
      <div className="pp-content-zone">
        <span className="pp-eyebrow pp-content-eyebrow">How you're presenting</span>
        <p className="pp-interpretation">{interpretation}</p>
        {showActions && (
          <ul className="pp-actions" aria-label="Profile improvements">
            {actions.map((action, i) => (
              <li key={i} className="pp-action">
                <div
                  className={`pp-action-bar pp-action-bar--${action.priority}`}
                  aria-hidden="true"
                />
                <div>
                  <div className="pp-action-main">{action.text}</div>
                  {action.reason && (
                    <div className="pp-action-sub">{action.reason}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Photo accent */}
      <div className="pp-photo-zone" aria-hidden="true">
        <div className="pp-photo-frame">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="pp-photo-img" />
          ) : (
            <span className="pp-photo-placeholder">
              <User size={16} strokeWidth={1.5} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
