import { useState, useEffect, useMemo } from 'react';
import { X, Tag, Trash2, Check } from 'lucide-react';

/**
 * TagRemovalModal Component
 * Modal for selecting tags to remove from multiple applications
 * Shows only tags that exist on at least one of the selected applications
 */
export default function TagRemovalModal({
  isOpen,
  onConfirm,
  onCancel,
  selectedCount,
  selectedApplications
}) {
  const [selectedTag, setSelectedTag] = useState(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedTag(null);
    }
  }, [isOpen]);

  // Extract unique tags from selected applications
  const availableTags = useMemo(() => {
    if (!selectedApplications || selectedApplications.length === 0) {
      return [];
    }

    const tagMap = new Map();

    selectedApplications.forEach((app) => {
      if (app.tags && Array.isArray(app.tags)) {
        app.tags.forEach((tag) => {
          if (!tagMap.has(tag.tag)) {
            tagMap.set(tag.tag, {
              name: tag.tag,
              color: tag.color,
              count: 1
            });
          } else {
            const existing = tagMap.get(tag.tag);
            existing.count++;
          }
        });
      }
    });

    // Convert to array and sort by count (descending)
    return Array.from(tagMap.values()).sort((a, b) => b.count - a.count);
  }, [selectedApplications]);

  const handleConfirm = () => {
    if (selectedTag) {
      onConfirm(selectedTag.name);
    }
  };

  const canConfirm = selectedTag !== null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Remove Tag from Applications
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {availableTags.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-600 mb-4">
                Select a tag to remove from all selected applications:
              </p>
              {availableTags.map((tag) => (
                <button
                  key={tag.name}
                  onClick={() => setSelectedTag(tag)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                    selectedTag?.name === tag.name
                      ? 'border-red-600 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-block px-3 py-1 text-xs font-medium rounded-full text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                    <span className="text-sm text-gray-600">
                      On {tag.count} of {selectedCount} selected applicant{selectedCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {selectedTag?.name === tag.name && (
                    <Check className="w-5 h-5 text-red-600" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Tag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No tags found on selected applications</p>
              <p className="text-sm text-gray-400 mt-2">
                Select applications with tags to remove them
              </p>
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
            className={`px-4 py-2 rounded-md transition-colors font-medium flex items-center gap-2 ${
              canConfirm
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            Remove Tag from {selectedCount} Applicant{selectedCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
