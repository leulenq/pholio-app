import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllTags, getTags, addTag, removeTag } from '../../api/agency';
import { Tag, X, Plus, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Tag Component
 * Displays a single tag pill with optional remove button
 */
function TagPill({ tag, color, onRemove, size = 'md' }) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  };

  const bgColor = color || '#3B82F6';
  const textColor = isLightColor(bgColor) ? '#000000' : '#FFFFFF';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses[size]}`}
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      {tag}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-70 transition-opacity"
          title="Remove tag"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

/**
 * Check if a color is light (for text contrast)
 */
function isLightColor(hex) {
  if (!hex) return false;
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 155;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * TagSelector Component
 * Multi-select dropdown for tags with create-new functionality
 */
export default function TagSelector({ applicationId, onTagsChange }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');
  const dropdownRef = useRef(null);

  // Fetch all available tags for this agency
  const { data: allTags = [] } = useQuery({
    queryKey: ['all-tags'],
    queryFn: getAllTags,
  });

  // Fetch tags for this specific application
  const { data: applicationTags = [] } = useQuery({
    queryKey: ['tags', applicationId],
    queryFn: () => getTags(applicationId),
    enabled: !!applicationId,
  });

  // Add tag mutation
  const addMutation = useMutation({
    mutationFn: ({ tag, color }) => addTag(applicationId, tag, color),
    onSuccess: () => {
      queryClient.invalidateQueries(['tags', applicationId]);
      queryClient.invalidateQueries(['all-tags']);
      queryClient.invalidateQueries(['applicants']);
      setSearchTerm('');
      if (onTagsChange) onTagsChange();
      toast.success('Tag added');
    },
    onError: (error) => {
      if (error.message.includes('already exists')) {
        toast.error('This tag already exists on this application');
      } else {
        toast.error(error.message || 'Failed to add tag');
      }
    },
  });

  // Remove tag mutation
  const removeMutation = useMutation({
    mutationFn: (tagId) => removeTag(applicationId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries(['tags', applicationId]);
      queryClient.invalidateQueries(['applicants']);
      if (onTagsChange) onTagsChange();
      toast.success('Tag removed');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to remove tag');
    },
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddTag = (tagName, color = null) => {
    addMutation.mutate({ tag: tagName, color });
  };

  const handleCreateNew = () => {
    if (!searchTerm.trim()) return;
    handleAddTag(searchTerm.trim(), newTagColor);
  };

  const handleRemoveTag = (tagId) => {
    removeMutation.mutate(tagId);
  };

  // Filter available tags (exclude already applied tags)
  const appliedTagNames = applicationTags.map(t => t.tag.toLowerCase());
  const availableTags = allTags.filter(t =>
    !appliedTagNames.includes(t.tag.toLowerCase()) &&
    t.tag.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const canCreateNew = searchTerm.trim() &&
    !allTags.some(t => t.tag.toLowerCase() === searchTerm.trim().toLowerCase()) &&
    !appliedTagNames.includes(searchTerm.trim().toLowerCase());

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected Tags Display */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-wrap gap-2 items-center min-h-[38px] p-2 border border-gray-300 rounded-md cursor-pointer hover:border-gray-400 transition-colors"
      >
        {applicationTags.length > 0 ? (
          applicationTags.map((tag) => (
            <TagPill
              key={tag.id}
              tag={tag.tag}
              color={tag.color}
              size="sm"
              onRemove={() => handleRemoveTag(tag.id)}
            />
          ))
        ) : (
          <span className="text-gray-400 text-sm">Add tags...</span>
        )}
        <ChevronDown className={`w-4 h-4 ml-auto text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-auto">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search or create tag..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Available Tags List */}
          {availableTags.length > 0 && (
            <div className="py-1">
              {availableTags.map((tag) => (
                <button
                  key={tag.tag}
                  onClick={() => handleAddTag(tag.tag, tag.color)}
                  disabled={addMutation.isPending}
                  className="w-full px-4 py-2 text-left hover:bg-gray-100 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <TagPill tag={tag.tag} color={tag.color} size="sm" />
                  <span className="text-xs text-gray-500">({tag.usage_count})</span>
                </button>
              ))}
            </div>
          )}

          {/* Create New Tag */}
          {canCreateNew && (
            <div className="p-3 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer"
                />
                <TagPill tag={searchTerm} color={newTagColor} size="sm" />
              </div>
              <button
                onClick={handleCreateNew}
                disabled={addMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Create "{searchTerm}"
              </button>
            </div>
          )}

          {/* Empty State */}
          {availableTags.length === 0 && !canCreateNew && searchTerm && (
            <div className="p-4 text-center text-gray-500 text-sm">
              No tags found
            </div>
          )}

          {availableTags.length === 0 && !searchTerm && (
            <div className="p-4 text-center text-gray-500 text-sm">
              Type to search or create a new tag
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { TagPill };
