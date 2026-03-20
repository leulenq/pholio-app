import { Check, X, Archive, Tag, Download, XCircle } from 'lucide-react';

/**
 * BulkActionToolbar Component
 * Sticky toolbar that appears when applicants are selected
 * Provides bulk operations for multiple applications
 */
export default function BulkActionToolbar({
  selectedCount,
  onAccept,
  onDecline,
  onArchive,
  onTag,
  onRemoveTag,
  onExport,
  onClear
}) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="sticky top-0 z-40 bg-amber-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Selection Counter */}
          <div className="flex items-center space-x-4">
            <span className="font-medium">
              {selectedCount} applicant{selectedCount !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={onClear}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-white hover:bg-amber-700 rounded-md transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Clear Selection
            </button>
          </div>

          {/* Bulk Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onTag}
              className="flex items-center gap-2 px-4 py-2 bg-white text-amber-600 rounded-md hover:bg-gray-100 transition-colors font-medium"
            >
              <Tag className="w-4 h-4" />
              Add Tags
            </button>

            <button
              onClick={onRemoveTag}
              className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-md hover:bg-gray-100 transition-colors font-medium"
            >
              <X className="w-4 h-4" />
              Remove Tags
            </button>

            <button
              onClick={onExport}
              className="flex items-center gap-2 px-4 py-2 bg-white text-amber-600 rounded-md hover:bg-gray-100 transition-colors font-medium"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>

            <div className="h-6 w-px bg-amber-400 mx-2"></div>

            <button
              onClick={onAccept}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
            >
              <Check className="w-4 h-4" />
              Accept
            </button>

            <button
              onClick={onDecline}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium"
            >
              <X className="w-4 h-4" />
              Decline
            </button>

            <button
              onClick={onArchive}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors font-medium"
            >
              <Archive className="w-4 h-4" />
              Archive
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
