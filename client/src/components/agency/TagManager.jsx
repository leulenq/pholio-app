import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAllTags } from '../../api/agency';
import { TagPill } from './TagSelector';
import { X, Tag, Palette } from 'lucide-react';
import { toast } from 'sonner';

/**
 * TagManager Modal
 * Manage all tags for the agency (view, edit colors, see usage)
 */
export default function TagManager({ isOpen, onClose }) {
  const queryClient = useQueryClient();

  // Fetch all tags
  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['all-tags'],
    queryFn: getAllTags,
    enabled: isOpen,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Tag className="w-6 h-6 text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-900">Manage Tags</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">
              Loading tags...
            </div>
          ) : tags.length === 0 ? (
            <div className="text-center py-12">
              <Tag className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No tags yet</h3>
              <p className="text-gray-500">
                Tags will appear here once you create them on applications
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-gray-600 mb-4">
                {tags.length} tag{tags.length !== 1 ? 's' : ''} in use
              </div>
              {tags.map((tag) => (
                <TagRow key={tag.tag} tag={tag} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * TagRow Component
 * Individual tag display with usage count
 */
function TagRow({ tag }) {
  return (
    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3 flex-1">
        <TagPill tag={tag.tag} color={tag.color} size="md" />
        <div className="text-sm text-gray-600">
          Used on {tag.usage_count} application{tag.usage_count !== 1 ? 's' : ''}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded border border-gray-300"
          style={{ backgroundColor: tag.color || '#3B82F6' }}
          title="Tag color"
        />
      </div>
    </div>
  );
}
