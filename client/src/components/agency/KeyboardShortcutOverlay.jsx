import { X } from 'lucide-react';
import './KeyboardShortcutOverlay.css';

const GROUPS = [
  {
    title: 'Navigation',
    shortcuts: [
      { key: '↑ / ↓', desc: 'Move through list' },
      { key: '→ / Enter', desc: 'Open detail panel' },
      { key: '← / Esc', desc: 'Close detail panel' },
    ],
  },
  {
    title: 'Triage',
    shortcuts: [
      { key: 's', desc: 'Shortlist selected' },
      { key: 'd', desc: 'Decline selected' },
      { key: 'a', desc: 'Archive selected' },
      { key: 't', desc: 'Open tag picker' },
    ],
  },
  {
    title: 'Views',
    shortcuts: [
      { key: 'k', desc: 'Toggle kanban view' },
      { key: '?', desc: 'Show this overlay' },
    ],
  },
];

export default function KeyboardShortcutOverlay({ onClose }) {
  return (
    <div className="ag-shortcuts-backdrop" onClick={onClose}>
      <div className="ag-shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="ag-shortcuts-header">
          <h3>Keyboard Shortcuts</h3>
          <button className="ag-shortcuts-close" onClick={onClose}><X size={16} /></button>
        </div>
        {GROUPS.map(g => (
          <div key={g.title} className="ag-shortcuts-group">
            <h4 className="ag-shortcuts-group-title">{g.title}</h4>
            {g.shortcuts.map(s => (
              <div key={s.key} className="ag-shortcuts-row">
                <kbd className="ag-shortcuts-key">{s.key}</kbd>
                <span className="ag-shortcuts-desc">{s.desc}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
