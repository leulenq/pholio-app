import { useState, useEffect } from 'react';
import { X, Tag, Plus, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getAllTags } from '../../api/agency';

/**
 * TagSelectorModal Component
 * Modal for selecting existing tags or creating new ones to add to applications
 */
export default function TagSelectorModal({
  isOpen,
  onConfirm,
  onCancel,
  selectedCount
}) {
  const [mode, setMode] = useState('select'); // 'select' or 'create'
  const [selectedTag, setSelectedTag] = useState(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#8b5cf6'); // Purple default

  // Fetch existing tags
  const { data: existingTags, isLoading } = useQuery({
    queryKey: ['agency-tags'],
    queryFn: getAllTags,
    enabled: isOpen
  });

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setMode('select');
      setSelectedTag(null);
      setNewTagName('');
      setNewTagColor('#8b5cf6');
    }
  }, [isOpen]);

  // Predefined color palette
  const colorOptions = [
    { name: 'Purple', value: '#8b5cf6' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Green', value: '#10b981' },
    { name: 'Yellow', value: '#f59e0b' },
    { name: 'Red', value: '#ef4444' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Indigo', value: '#6366f1' },
    { name: 'Teal', value: '#14b8a6' },
    { name: 'Orange', value: '#f97316' },
    { name: 'Gray', value: '#6b7280' }
  ];

  const handleConfirm = () => {
    if (mode === 'select' && selectedTag) {
      onConfirm(selectedTag.tag, selectedTag.color);
    } else if (mode === 'create' && newTagName.trim()) {
      onConfirm(newTagName.trim(), newTagColor);
    }
  };

  const canConfirm =
    (mode === 'select' && selectedTag) ||
    (mode === 'create' && newTagName.trim());

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Tag className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Add Tag to Applications
              </h3>
              <p className="text-sm text-gray-600">
                {selectedCount} applicant{selectedCount !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setMode('select')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              mode === 'select'
                ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Select Existing Tag
          </button>
          <button
            onClick={() => setMode('create')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              mode === 'create'
                ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center gap-1">
              <Plus className="w-4 h-4" />
              Create New Tag
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {mode === 'select' ? (
            <div className="space-y-2">
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">
                  Loading tags...
                </div>
              ) : existingTags && existingTags.length > 0 ? (
                existingTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => setSelectedTag(tag)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                      selectedTag?.id === tag.id
                        ? 'border-amber-600 bg-amber-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block px-3 py-1 text-xs font-medium rounded-full text-white"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.tag}
                      </span>
                      <span className="text-sm text-gray-600">
                        Used {tag.usage_count || 0} time{tag.usage_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {selectedTag?.id === tag.id && (
                      <Check className="w-5 h-5 text-amber-600" />
                    )}
                  </button>
                ))
              ) : (
                <div className="text-center py-8">
                  <Tag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No tags yet</p>
                  <button
                    onClick={() => setMode('create')}
                    className="mt-2 text-sm text-amber-600 hover:text-amber-700 font-medium"
                  >
                    Create your first tag
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Tag Name Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tag Name
                </label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="e.g., Priority, Featured, VIP"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  maxLength={30}
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-500">
                  {newTagName.length}/30 characters
                </p>
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tag Color
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setNewTagColor(color.value)}
                      className={`relative h-10 rounded-lg transition-all ${
                        newTagColor === color.value
                          ? 'ring-2 ring-offset-2 ring-gray-900'
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    >
                      {newTagColor === color.value && (
                        <Check className="w-5 h-5 text-white absolute inset-0 m-auto" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {newTagName.trim() && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preview
                  </label>
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <span
                      className="inline-block px-3 py-1 text-xs font-medium rounded-full text-white"
                      style={{ backgroundColor: newTagColor }}
                    >
                      {newTagName}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-md transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 rounded-md transition-colors font-medium ${
              canConfirm
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Add Tag to {selectedCount} Applicant{selectedCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
