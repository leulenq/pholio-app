import { useState } from 'react';
import { X, Star, Trash2, Edit2, Check, Play } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * FilterPresetManager Component
 * Modal for managing saved filter presets
 */
export default function FilterPresetManager({
  isOpen,
  onClose,
  onApplyPreset
}) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const queryClient = useQueryClient();

  // Fetch presets
  const { data: presets, isLoading } = useQuery({
    queryKey: ['filter-presets'],
    queryFn: async () => {
      const response = await fetch('/api/agency/filter-presets', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to load presets');
      const data = await response.json();
      return data.data;
    },
    enabled: isOpen
  });

  // Update preset mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, name }) => {
      const response = await fetch(`/api/agency/filter-presets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error('Failed to update preset');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Preset updated');
      queryClient.invalidateQueries(['filter-presets']);
      setEditingId(null);
    },
    onError: () => {
      toast.error('Failed to update preset');
    }
  });

  // Delete preset mutation
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const response = await fetch(`/api/agency/filter-presets/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to delete preset');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Preset deleted');
      queryClient.invalidateQueries(['filter-presets']);
    },
    onError: () => {
      toast.error('Failed to delete preset');
    }
  });

  // Set default mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id) => {
      const response = await fetch(`/api/agency/filter-presets/${id}/set-default`, {
        method: 'PUT',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to set default');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Default preset updated');
      queryClient.invalidateQueries(['filter-presets']);
    },
    onError: () => {
      toast.error('Failed to set default');
    }
  });

  const startEdit = (preset) => {
    setEditingId(preset.id);
    setEditName(preset.name);
  };

  const saveEdit = () => {
    if (editName.trim()) {
      updateMutation.mutate({ id: editingId, name: editName.trim() });
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleApply = (preset) => {
    onApplyPreset(preset.filters);
    onClose();
  };

  const handleDelete = (preset) => {
    if (window.confirm(`Delete preset "${preset.name}"?`)) {
      deleteMutation.mutate(preset.id);
    }
  };

  // Generate filter summary
  const getFilterSummary = (filters) => {
    const parts = [];
    if (filters.status) parts.push(`Status: ${filters.status}`);
    if (filters.gender) parts.push(`Gender: ${filters.gender}`);
    if (filters.city) parts.push(`City: ${filters.city}`);
    if (filters.search) parts.push(`Search: "${filters.search}"`);
    if (filters.min_height || filters.max_height) {
      const height = [];
      if (filters.min_height) height.push(`min ${filters.min_height}cm`);
      if (filters.max_height) height.push(`max ${filters.max_height}cm`);
      parts.push(`Height: ${height.join(', ')}`);
    }
    if (filters.tags && filters.tags.length > 0) {
      parts.push(`Tags: ${filters.tags.join(', ')}`);
    }
    if (filters.date_from || filters.date_to) {
      const dates = [];
      if (filters.date_from) dates.push(`from ${filters.date_from}`);
      if (filters.date_to) dates.push(`to ${filters.date_to}`);
      parts.push(`Date: ${dates.join(' ')}`);
    }
    return parts.length > 0 ? parts.join(' • ') : 'No filters';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Manage Filter Presets
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Save and manage your favorite filter combinations
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">
              Loading presets...
            </div>
          ) : presets && presets.length > 0 ? (
            <div className="space-y-3">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-amber-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {editingId === preset.id ? (
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            className="flex-1 px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                            autoFocus
                          />
                          <button
                            onClick={saveEdit}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mb-2">
                          {preset.is_default && (
                            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                          )}
                          <h4 className="font-medium text-gray-900 truncate">
                            {preset.name}
                          </h4>
                          {preset.is_default && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                              Default
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-sm text-gray-600 truncate">
                        {getFilterSummary(preset.filters)}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Created {new Date(preset.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleApply(preset)}
                        className="p-2 text-amber-600 hover:bg-amber-50 rounded transition-colors"
                        title="Apply filters"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDefaultMutation.mutate(preset.id)}
                        className={`p-2 rounded transition-colors ${
                          preset.is_default
                            ? 'text-yellow-500 bg-yellow-50'
                            : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        title={preset.is_default ? 'Default preset' : 'Set as default'}
                      >
                        <Star className={`w-4 h-4 ${preset.is_default ? 'fill-yellow-500' : ''}`} />
                      </button>
                      <button
                        onClick={() => startEdit(preset)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        title="Edit name"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(preset)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Star className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-2">No saved presets yet</p>
              <p className="text-sm text-gray-400">
                Apply some filters and click "Save Current Filters" to create your first preset
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-md transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
