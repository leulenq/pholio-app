import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, MapPin, Zap, Target, TrendingUp, AlertCircle, 
  PenLine, UserPlus, Check, Download, MessageCircle, 
  Star, LayoutGrid, ChevronDown, ChevronUp, XCircle 
} from 'lucide-react';
import { TalentTypePill } from './ui/TalentTypePill';
import { TalentStatusBadge } from './ui/TalentStatusBadge';
import './TalentPanel.css';

/**
 * Canonical Talent Panel — Detail drawer for dashboard-wide talent viewing.
 * @param {Object} props
 * @param {Object|null} props.talent - Talent object to display, or null to close.
 * @param {'overview'|'discover'|'applicants'|'roster'} props.context
 * @param {Function} props.onClose
 */
const AI_SIGNALS = [
  { icon: Target,      text: 'Matches 3 open castings based on measurements and type.' },
  { icon: TrendingUp,  text: 'Applied to 4 agencies in the past 6 months — actively seeking.' },
  { icon: AlertCircle, text: 'Profile 78% complete — missing runway experience and second language.' },
];

export const TalentPanel = ({ talent, context = 'roster', onClose, onAction }) => {
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [notes, setNotes] = useState([]);
  const [bioExpanded, setBioExpanded] = useState(false);

  useEffect(() => {
    setEditingNote(false);
    setNoteDraft('');
    setNotes([]);
    setBioExpanded(false);
  }, [talent?.id]);

  const getInitials = (name) => {
    const parts = (name || '').trim().split(' ');
    return parts.length > 1
      ? (parts[0][0] || '') + (parts[1][0] || '')
      : (parts[0]?.[0] || '');
  };

  const handleAction = (action) => {
    if (onAction) {
      onAction(action, talent);
    } else {
      toast.success('Coming soon');
    }
  };

  if (!talent) return null;

  const handleSaveNote = () => {
    if (!noteDraft.trim()) return;
    setNotes([{ text: noteDraft, timestamp: new Date() }, ...notes]);
    setNoteDraft('');
    setEditingNote(false);
  };

  return (
    <>
      <motion.div 
        className="talent-panel-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div 
        className="talent-panel"
        initial={{ x: 480 }}
        animate={{ x: 0 }}
        exit={{ x: 480 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      >
        {/* ZONE 1: HERO */}
        <div className="tp-hero">
          {talent.photo || talent.avatar ? (
            <>
              <img src={talent.photo || talent.avatar} className="tp-hero-img" alt={talent.name} />
              <div className="tp-hero-gradient" />
            </>
          ) : (
            <div className="tp-hero-fallback">
              {getInitials(talent.name).toUpperCase()}
            </div>
          )}
          <button className="tp-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
          
          <div className="tp-hero-identity">
            <h2 className="tp-name">{talent.name}</h2>
            <div className="tp-hero-row">
              <TalentTypePill type={talent.type || 'editorial'} dark />
              <TalentStatusBadge status={talent.status || 'available'} />
            </div>
            {(talent.location || talent.city) && (
              <div className="tp-location">
                <MapPin size={12} />
                <span>{talent.location || talent.city}</span>
              </div>
            )}
          </div>
        </div>

        {/* ZONE 2: ACTION BAR */}
        <div className="tp-action-bar">
          {context === 'discover' && (
            <button className="tp-btn tp-btn--primary" onClick={() => handleAction('invite')}>
              <UserPlus size={16} /> Invite
            </button>
          )}
          {['applicants', 'overview'].includes(context) && (
            <button className="tp-btn tp-btn--primary" onClick={() => handleAction('accept')}>
              <Check size={16} /> Accept
            </button>
          )}
          {context === 'roster' && (
            <button className="tp-btn tp-btn--primary" onClick={() => handleAction('download-comp-card')}>
              <Download size={16} /> Comp Card
            </button>
          )}
          {['overview', 'roster'].includes(context) && (
            <button className="tp-btn tp-btn--secondary" onClick={() => handleAction('message')}>
              <MessageCircle size={16} /> Message
            </button>
          )}
          {context === 'applicants' && (
            <button className="tp-btn tp-btn--secondary" onClick={() => handleAction('shortlist')}>
              <Star size={16} /> Shortlist
            </button>
          )}
          <button className="tp-btn tp-btn--secondary tp-btn--icon" title="Add to Board" onClick={() => handleAction('add-to-board')}>
            <LayoutGrid size={16} />
          </button>
          {context === 'applicants' && (
            <button className="tp-btn tp-btn--secondary tp-btn--icon tp-btn--danger" title="Reject" onClick={() => handleAction('reject')}>
              <XCircle size={16} />
            </button>
          )}
        </div>

        {/* ZONE 3: BODY */}
        <div className="tp-body">
          {/* Measurements Strip */}
          <div className="tp-measurements">
            {[
              { label: 'Height', value: talent.measurements?.height },
              { label: 'Bust',   value: talent.measurements?.bust   },
              { label: 'Waist',  value: talent.measurements?.waist  },
              { label: 'Hips',   value: talent.measurements?.hips   },
            ].map(({ label, value }) => (
              <div key={label} className="tp-measure-chip">
                <span className="tp-measure-label">{label}</span>
                <span className="tp-measure-value">{value ?? '—'}</span>
              </div>
            ))}
          </div>

          {/* AI Signals */}
          <section className="tp-section">
            <header className="tp-section-header">
              <Zap size={13} color="#C9A55A" />
              AI Signals
            </header>
            <div className="tp-signals-list">
              {AI_SIGNALS.map((signal, idx) => (
                <div key={idx} className="tp-signal-row">
                  <signal.icon size={14} className="tp-signal-icon" />
                  <span className="tp-signal-text">{signal.text}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Notes */}
          <section className="tp-section">
            <header className="tp-section-header">
              <PenLine size={13} />
              Notes
            </header>
            
            {editingNote ? (
              <div className="tp-note-editor">
                <textarea 
                  className="tp-note-textarea"
                  placeholder="Type a note..."
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  autoFocus
                />
                <div className="tp-editor-actions">
                  <button className="tp-btn tp-btn--primary tp-btn-sm" onClick={handleSaveNote} disabled={!noteDraft.trim()}>Save</button>
                  <button className="tp-btn tp-btn--secondary tp-btn-sm" onClick={() => { setEditingNote(false); setNoteDraft(''); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="tp-notes-list">
                {notes.map((note, idx) => (
                  <div key={idx} className="tp-note-entry">
                    <div className="tp-note-time">{note.timestamp.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                    <div className="tp-note-text">{note.text}</div>
                  </div>
                ))}
                {notes.length === 0 && (
                  <div className="tp-notes-empty" onClick={() => setEditingNote(true)}>
                    + Add a note...
                  </div>
                )}
                {notes.length > 0 && (
                  <div className="tp-notes-empty" onClick={() => setEditingNote(true)} style={{ fontStyle: 'normal', color: '#C9A55A', fontWeight: 600 }}>
                    + Add another note
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Bio */}
          {talent.bio && (
            <section className="tp-section">
              <header className="tp-section-header">Bio</header>
              <div className="tp-bio-content">
                <div className="tp-bio-text">
                  {bioExpanded ? talent.bio : talent.bio.slice(0, 100)}
                  {talent.bio.length > 100 && !bioExpanded && '…'}
                </div>
                {talent.bio.length > 100 && (
                  <div className="tp-bio-toggle" onClick={() => setBioExpanded(!bioExpanded)}>
                    {bioExpanded ? (
                      <><ChevronUp size={14} /> Show Less</>
                    ) : (
                      <><ChevronDown size={14} /> Read Full Bio</>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </motion.div>
    </>
  );
};
