import { Check, Star, X, ClipboardList, MessageCircle, BarChart3, UserPlus, ArrowRight, Trash2, StickyNote } from 'lucide-react';
import './ActionButtonGroup.css';

const ACTIONS_BY_CONTEXT = {
  inbox: [
    { key: 'accept', label: 'Accept', icon: Check, color: 'var(--ag-success)', shortcut: 'a' },
    { key: 'shortlist', label: 'Shortlist', icon: Star, color: 'var(--ag-gold)', shortcut: 's' },
    { key: 'decline', label: 'Decline', icon: X, color: 'var(--ag-danger)', shortcut: 'd' },
  ],
  roster: [
    { key: 'add-to-board', label: 'Add to Board', icon: ClipboardList, color: 'var(--ag-gold)' },
    { key: 'message', label: 'Message', icon: MessageCircle, color: 'var(--ag-info)' },
    { key: 'stats', label: 'Stats', icon: BarChart3, color: 'var(--ag-text-2)' },
  ],
  casting: [
    { key: 'move-stage', label: 'Move Stage', icon: ArrowRight, color: 'var(--ag-gold)' },
    { key: 'remove', label: 'Remove', icon: Trash2, color: 'var(--ag-danger)' },
    { key: 'note', label: 'Add Note', icon: StickyNote, color: 'var(--ag-text-2)' },
  ],
  discover: [
    { key: 'invite', label: 'Invite', icon: UserPlus, color: 'var(--ag-gold)' },
    { key: 'add-to-board', label: 'Add to Board', icon: ClipboardList, color: 'var(--ag-text-2)' },
  ],
};

export default function ActionButtonGroup({ context, currentStatus, onAction }) {
  const actions = ACTIONS_BY_CONTEXT[context] || [];

  return (
    <div className="ag-action-group">
      {actions.map(a => {
        const Icon = a.icon;
        const isActive = currentStatus === a.key;
        return (
          <button
            key={a.key}
            className={`ag-action-btn ${isActive ? 'is-active' : ''}`}
            style={{ '--action-color': a.color }}
            onClick={() => onAction(a.key)}
            title={a.shortcut ? `${a.label} (${a.shortcut})` : a.label}
          >
            <Icon size={16} />
            <span>{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}
