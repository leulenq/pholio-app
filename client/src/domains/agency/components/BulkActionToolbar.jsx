import { motion } from 'framer-motion';
import { Star, X, Archive, Tag, ClipboardList, MessageCircle, ArrowRight, Trash2 } from 'lucide-react';
import './BulkActionToolbar.css';

const ACTIONS = {
  inbox: [
    { key: 'shortlist', label: 'Shortlist', icon: Star },
    { key: 'decline', label: 'Decline', icon: X },
    { key: 'archive', label: 'Archive', icon: Archive },
    { key: 'tag', label: 'Tag', icon: Tag },
    { key: 'add-to-board', label: 'Add to Board', icon: ClipboardList },
  ],
  roster: [
    { key: 'tag', label: 'Tag', icon: Tag },
    { key: 'add-to-board', label: 'Add to Board', icon: ClipboardList },
    { key: 'message', label: 'Message', icon: MessageCircle },
  ],
  casting: [
    { key: 'move-stage', label: 'Move Stage', icon: ArrowRight },
    { key: 'remove', label: 'Remove', icon: Trash2 },
    { key: 'tag', label: 'Tag', icon: Tag },
  ],
};

export default function BulkActionToolbar({ selectedCount, context = 'inbox', onAction, onClearSelection }) {
  const actions = ACTIONS[context] || ACTIONS.inbox;

  return (
    <motion.div
      className="ag-bulk-toolbar"
      initial={{ y: -48, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -48, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      <span className="ag-bulk-toolbar__count">{selectedCount} selected</span>
      <div className="ag-bulk-toolbar__actions">
        {actions.map(a => {
          const Icon = a.icon;
          return (
            <button key={a.key} className="ag-bulk-toolbar__btn" onClick={() => onAction(a.key)}>
              <Icon size={14} /> {a.label}
            </button>
          );
        })}
      </div>
      <button className="ag-bulk-toolbar__close" onClick={onClearSelection}>
        <X size={14} />
      </button>
    </motion.div>
  );
}
