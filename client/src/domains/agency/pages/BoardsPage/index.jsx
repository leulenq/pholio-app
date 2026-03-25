import React, { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, Plus, Pencil, Trash2, Users, X } from 'lucide-react';
import { getBoards, createBoard, updateBoard, deleteBoard } from '../../api/agency';
import { AgencyEmptyState } from '../../components/ui/AgencyEmptyState';
import './BoardsPage.css';

export default function BoardsPage() {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal state
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit' | 'delete'
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  const fetchBoards = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getBoards();
      setBoards(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error('[BoardsPage] Failed to fetch boards:', err);
      setError(err.message || 'Failed to load boards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  // Modal handlers
  const openCreate = () => {
    setFormData({ name: '', description: '' });
    setSelectedBoard(null);
    setModalMode('create');
  };

  const openEdit = (e, board) => {
    e.stopPropagation();
    setFormData({ name: board.name, description: board.description || '' });
    setSelectedBoard(board);
    setModalMode('edit');
  };

  const openDelete = (e, board) => {
    e.stopPropagation();
    setSelectedBoard(board);
    setModalMode('delete');
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedBoard(null);
    setFormData({ name: '', description: '' });
    setSaving(false);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await createBoard({
          name: formData.name.trim(),
          description: formData.description.trim(),
          is_active: true
        });
      } else if (modalMode === 'edit' && selectedBoard) {
        await updateBoard(selectedBoard.id, {
          name: formData.name.trim(),
          description: formData.description.trim()
        });
      }
      closeModal();
      fetchBoards();
    } catch (err) {
      console.error('[BoardsPage] Save failed:', err);
      setError(err.message || 'Failed to save board');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedBoard) return;
    setSaving(true);
    try {
      await deleteBoard(selectedBoard.id);
      closeModal();
      fetchBoards();
    } catch (err) {
      console.error('[BoardsPage] Delete failed:', err);
      setError(err.message || 'Failed to delete board');
      setSaving(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="boards-page">
        <div className="boards-loading">
          <div className="boards-spinner" />
          Loading boards...
        </div>
      </div>
    );
  }

  return (
    <div className="boards-page">
      {/* Header */}
      <div className="boards-header">
        <div>
          <h1>Boards</h1>
          <p>Organize talent into custom collections</p>
        </div>
        <button className="boards-create-btn" onClick={openCreate}>
          <Plus size={16} />
          New Board
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: 'var(--agency-danger)', marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Empty State */}
      {boards.length === 0 ? (
        <AgencyEmptyState
          icon={LayoutGrid}
          title="No boards yet"
          description="Create your first board to start organizing talent into custom collections."
          action={
            <button className="boards-create-btn" onClick={openCreate}>
              <Plus size={16} />
              Create your first board
            </button>
          }
        />
      ) : (
        /* Board Grid */
        <div className="boards-grid">
          {boards.map((board) => (
            <div key={board.id} className="board-card">
              <div className="board-card-top">
                <div className="board-card-icon">
                  <LayoutGrid size={22} />
                </div>
                <div className="board-card-actions">
                  <button
                    className="board-card-action-btn"
                    onClick={(e) => openEdit(e, board)}
                    title="Edit board"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="board-card-action-btn danger"
                    onClick={(e) => openDelete(e, board)}
                    title="Delete board"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <h3 className="board-card-name">{board.name}</h3>
              {board.description && (
                <p className="board-card-desc">{board.description}</p>
              )}

              <div className="board-card-stats">
                <div className="board-card-stat">
                  <span className="board-card-stat-value">
                    {board.application_count || board.applicant_count || 0}
                  </span>
                  <span className="board-card-stat-label">Talent</span>
                </div>
                <div className="board-card-stat">
                  <span className="board-card-stat-value">
                    {board.is_active ? '●' : '○'}
                  </span>
                  <span className="board-card-stat-label">
                    {board.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <div className="board-modal-backdrop" onClick={closeModal}>
          <div className="board-modal" onClick={(e) => e.stopPropagation()}>
            <div className="board-modal-header">
              <h2>{modalMode === 'create' ? 'New Board' : 'Edit Board'}</h2>
              <button className="board-modal-close" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>

            <div className="board-modal-body">
              <div className="board-modal-field">
                <label>Board Name</label>
                <input
                  type="text"
                  placeholder="e.g. Summer Campaign 2026"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="board-modal-field">
                <label>Description (optional)</label>
                <textarea
                  placeholder="What is this board for?"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
            </div>

            <div className="board-modal-footer">
              <button className="board-modal-cancel" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="board-modal-save"
                onClick={handleSave}
                disabled={!formData.name.trim() || saving}
              >
                {saving ? 'Saving...' : modalMode === 'create' ? 'Create Board' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {modalMode === 'delete' && selectedBoard && (
        <div className="board-modal-backdrop" onClick={closeModal}>
          <div className="board-modal" onClick={(e) => e.stopPropagation()}>
            <div className="board-modal-header">
              <h2>Delete Board</h2>
              <button className="board-modal-close" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>

            <div className="board-modal-body">
              <p className="board-confirm-text">
                Are you sure you want to delete <strong>{selectedBoard.name}</strong>?
                This will remove the board and all its talent assignments. This action cannot be undone.
              </p>
            </div>

            <div className="board-modal-footer">
              <button className="board-modal-cancel" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="board-modal-delete"
                onClick={handleDelete}
                disabled={saving}
              >
                {saving ? 'Deleting...' : 'Delete Board'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
