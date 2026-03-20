import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNotes, createNote, updateNote, deleteNote } from '../../api/agency';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Plus, Edit2, Trash2, X, Check } from 'lucide-react';
import { toast } from 'sonner';

/**
 * NotesPanel Component
 * Displays and manages notes for an application
 */
export default function NotesPanel({ applicationId }) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editText, setEditText] = useState('');

  // Fetch notes
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes', applicationId],
    queryFn: () => getNotes(applicationId),
    enabled: !!applicationId,
  });

  // Create note mutation
  const createMutation = useMutation({
    mutationFn: (note) => createNote(applicationId, note),
    onSuccess: () => {
      queryClient.invalidateQueries(['notes', applicationId]);
      setNewNoteText('');
      setIsAdding(false);
      toast.success('Note added');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add note');
    },
  });

  // Update note mutation
  const updateMutation = useMutation({
    mutationFn: ({ noteId, note }) => updateNote(applicationId, noteId, note),
    onSuccess: () => {
      queryClient.invalidateQueries(['notes', applicationId]);
      setEditingNoteId(null);
      setEditText('');
      toast.success('Note updated');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update note');
    },
  });

  // Delete note mutation
  const deleteMutation = useMutation({
    mutationFn: (noteId) => deleteNote(applicationId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries(['notes', applicationId]);
      toast.success('Note deleted');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete note');
    },
  });

  const handleAddNote = () => {
    if (!newNoteText.trim()) return;
    createMutation.mutate(newNoteText);
  };

  const handleUpdateNote = (noteId) => {
    if (!editText.trim()) return;
    updateMutation.mutate({ noteId, note: editText });
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditText('');
  };

  const startEditing = (note) => {
    setEditingNoteId(note.id);
    setEditText(note.note);
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">
        Loading notes...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Notes</h3>
          <span className="text-sm text-gray-500">({notes.length})</span>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Note
          </button>
        )}
      </div>

      {/* Add Note Form */}
      {isAdding && (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <textarea
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            placeholder="Write a note..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
            autoFocus
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAddNote}
              disabled={!newNoteText.trim() || createMutation.isPending}
              className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="w-4 h-4" />
              Save Note
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewNoteText('');
              }}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Notes List */}
      {notes.length === 0 && !isAdding ? (
        <div className="text-center py-8 text-gray-500">
          <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p>No notes yet</p>
          <p className="text-sm">Add a note to keep track of this applicant</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              {editingNoteId === note.id ? (
                // Edit mode
                <>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleUpdateNote(note.id)}
                      disabled={!editText.trim() || updateMutation.isPending}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      <Check className="w-4 h-4" />
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                // View mode
                <>
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-gray-900 whitespace-pre-wrap flex-1">{note.note}</p>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEditing(note)}
                        className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit note"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this note?')) {
                            deleteMutation.mutate(note.id);
                          }
                        }}
                        className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete note"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                    {note.updated_at && note.updated_at !== note.created_at && (
                      <span className="ml-2">(edited)</span>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
