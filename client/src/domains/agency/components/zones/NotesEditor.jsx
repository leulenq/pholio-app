import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { createNote } from '../../api/agency';
import './zones.css';

const formatNoteTime = (ts) =>
  new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

export const NotesEditor = ({ applicationId, notes = [], isLoading }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (text) => createNote(applicationId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', applicationId] });
      setDraft('');
      setEditing(false);
    },
    onError: () => {
      toast.error('Failed to save note. Please try again.');
    },
  });

  if (isLoading) {
    return (
      <div className="zone-section">
        <div className="zone-section-header"><PenLine size={13} /> Notes</div>
        <div className="skel-block" style={{ height: 60 }} />
      </div>
    );
  }

  return (
    <div className="zone-section">
      <div className="zone-section-header"><PenLine size={13} /> Notes</div>

      {notes.length > 0 && (
        <div className="notes-list">
          {notes.map((note, i) => (
            <div key={note.id || i} className="note-entry">
              <div className="note-meta">
                {note.created_by || 'You'} · {formatNoteTime(note.created_at)}
              </div>
              <div className="note-text">{note.note || note.text}</div>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <div className="notes-editor">
          <textarea
            className="notes-textarea"
            placeholder="Type a note..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className="notes-editor-actions">
            <button
              className="tp-btn tp-btn--primary tp-btn-sm"
              onClick={() => mutation.mutate(draft)}
              disabled={!draft.trim() || mutation.isPending}
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              className="tp-btn tp-btn--secondary tp-btn-sm"
              onClick={() => { setEditing(false); setDraft(''); }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="notes-add-btn" onClick={() => setEditing(true)}>
          + {notes.length > 0 ? 'Add another note…' : 'Add a note…'}
        </button>
      )}
    </div>
  );
};
