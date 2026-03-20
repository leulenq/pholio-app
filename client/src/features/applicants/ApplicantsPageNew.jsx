import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Users,
  Check,
  X,
  Archive,
  ChevronLeft,
  ChevronRight,
  Eye,
  Settings,
  MoreVertical
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getApplicants,
  getPipelineCounts,
  acceptApplication,
  declineApplication,
  archiveApplication,
  bulkAcceptApplications,
  bulkDeclineApplications,
  bulkArchiveApplications,
  bulkAddTag,
  bulkRemoveTag,
  getAllTags,
  getFilterPresets,
  createFilterPreset
} from '../../api/agency';
import { AgencyButton } from '../../components/agency/ui/AgencyButton';
import { AgencyEmptyState } from '../../components/agency/ui/AgencyEmptyState';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { TagPill } from '../../components/agency/TagSelector';
import BulkActionToolbar from '../../components/agency/BulkActionToolbar';
import ConfirmationDialog from '../../components/agency/ConfirmationDialog';
import TagSelectorModal from '../../components/agency/TagSelectorModal';
import TagRemovalModal from '../../components/agency/TagRemovalModal';
import TagManager from '../../components/agency/TagManager';
import FilterPresetManager from '../../components/agency/FilterPresetManager';
import './ApplicantsPage.css';
import './ApplicantsFilter.css';

export default function ApplicantsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Helper function to parse URL params into filter state
  const parseFiltersFromURL = () => {
    const urlFilters = {
      status: searchParams.get('status') || '',
      search: searchParams.get('search') || '',
      city: searchParams.get('city') || '',
      min_height: searchParams.get('min_height') || '',
      max_height: searchParams.get('max_height') || '',
      gender: searchParams.get('gender') || '',
      tags: searchParams.get('tags') ? searchParams.get('tags').split(',') : [],
      date_from: searchParams.get('date_from') || '',
      date_to: searchParams.get('date_to') || '',
      sort: searchParams.get('sort') || 'az',
      page: parseInt(searchParams.get('page')) || 1,
      limit: parseInt(searchParams.get('limit')) || 50,
    };
    return urlFilters;
  };

  // Initialize filters from URL params if present, otherwise use defaults
  const [filters, setFilters] = useState(() => {
    const urlFilters = parseFiltersFromURL();
    const hasURLFilters = searchParams.toString().length > 0;
    return hasURLFilters ? urlFilters : {
      status: '',
      search: '',
      city: '',
      min_height: '',
      max_height: '',
      gender: '',
      tags: [],
      date_from: '',
      date_to: '',
      sort: 'az',
      page: 1,
      limit: 50,
    };
  });

  const [showFilters, setShowFilters] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    type: null,
    title: '',
    message: '',
    variant: 'danger',
    count: 0
  });
  const [showTagModal, setShowTagModal] = useState(false);
  const [showRemoveTagModal, setShowRemoveTagModal] = useState(false);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [showSavePresetPrompt, setShowSavePresetPrompt] = useState(false);
  const [presetName, setPresetName] = useState('');
  const queryClient = useQueryClient();

  // Fetch applicants
  const { data, isLoading } = useQuery({
    queryKey: ['applicants', filters],
    queryFn: () => getApplicants(filters),
  });

  // Fetch pipeline counts
  const { data: pipelineCounts } = useQuery({
    queryKey: ['pipeline-counts'],
    queryFn: getPipelineCounts,
  });

  // Fetch all tags for filter
  const { data: allTags } = useQuery({
    queryKey: ['agency-tags'],
    queryFn: getAllTags,
  });

  // Fetch filter presets
  const { data: filterPresets } = useQuery({
    queryKey: ['filter-presets'],
    queryFn: getFilterPresets,
  });

  // Load default preset on mount (only if no URL filters)
  useEffect(() => {
    if (filterPresets && searchParams.toString().length === 0) {
      const defaultPreset = filterPresets.find(p => p.is_default);
      if (defaultPreset) {
        setFilters(defaultPreset.filters);
      }
    }
  }, [filterPresets]);

  // Sync filters to URL params
  useEffect(() => {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'tags' && Array.isArray(value) && value.length > 0) {
        params.set('tags', value.join(','));
      } else if (key === 'page' && value === 1) {
        return;
      } else if (key === 'limit' && value === 50) {
        return;
      } else if (key === 'sort' && value === 'az') {
        return;
      } else if (value && value !== '') {
        params.set(key, value.toString());
      }
    });

    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams]);

  // Mutations
  const bulkAcceptMutation = useMutation({
    mutationFn: bulkAcceptApplications,
    onSuccess: (data) => {
      toast.success(`${data.count} application${data.count !== 1 ? 's' : ''} accepted!`);
      queryClient.invalidateQueries(['applicants']);
      queryClient.invalidateQueries(['pipeline-counts']);
      queryClient.invalidateQueries(['agency-stats']);
      clearSelection();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to accept applications');
    },
  });

  const bulkDeclineMutation = useMutation({
    mutationFn: bulkDeclineApplications,
    onSuccess: (data) => {
      toast.success(`${data.count} application${data.count !== 1 ? 's' : ''} declined`);
      queryClient.invalidateQueries(['applicants']);
      queryClient.invalidateQueries(['pipeline-counts']);
      queryClient.invalidateQueries(['agency-stats']);
      clearSelection();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to decline applications');
    },
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: bulkArchiveApplications,
    onSuccess: (data) => {
      toast.success(`${data.count} application${data.count !== 1 ? 's' : ''} archived`);
      queryClient.invalidateQueries(['applicants']);
      queryClient.invalidateQueries(['pipeline-counts']);
      queryClient.invalidateQueries(['agency-stats']);
      clearSelection();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to archive applications');
    },
  });

  const bulkAddTagMutation = useMutation({
    mutationFn: ({ applicationIds, tag, color }) => bulkAddTag(applicationIds, tag, color),
    onSuccess: (data) => {
      toast.success(`Tag added to ${data.count} application${data.count !== 1 ? 's' : ''}!`);
      queryClient.invalidateQueries(['applicants']);
      queryClient.invalidateQueries(['agency-tags']);
      clearSelection();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add tag');
    },
  });

  const bulkRemoveTagMutation = useMutation({
    mutationFn: ({ applicationIds, tag }) => bulkRemoveTag(applicationIds, tag),
    onSuccess: (data) => {
      toast.success(`Tag removed from ${data.count} application${data.count !== 1 ? 's' : ''}!`);
      queryClient.invalidateQueries(['applicants']);
      queryClient.invalidateQueries(['agency-tags']);
      clearSelection();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to remove tag');
    },
  });

  const createPresetMutation = useMutation({
    mutationFn: ({ name, filters }) => createFilterPreset(name, filters),
    onSuccess: () => {
      toast.success('Filter preset saved!');
      queryClient.invalidateQueries(['filter-presets']);
      setShowSavePresetPrompt(false);
      setPresetName('');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save preset');
    },
  });

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleStatusTab = (status) => {
    setFilters((prev) => ({ ...prev, status, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({
      status: filters.status,
      search: '',
      city: '',
      min_height: '',
      max_height: '',
      gender: '',
      tags: [],
      date_from: '',
      date_to: '',
      sort: 'az',
      page: 1,
      limit: 50,
    });
  };

  // Selection handlers
  const toggleSelection = (applicationId) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(applicationId)) {
        newSet.delete(applicationId);
      } else {
        newSet.add(applicationId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === data?.profiles?.length) {
      setSelectedIds(new Set());
    } else {
      const allIds = new Set(data?.profiles?.map((p) => p.application_id) || []);
      setSelectedIds(allIds);
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk operation handlers
  const handleBulkAccept = () => {
    setConfirmDialog({
      isOpen: true,
      type: 'accept',
      title: 'Accept Applications',
      message: 'Are you sure you want to accept these applications? This action will notify the talent.',
      variant: 'info',
      count: selectedIds.size
    });
  };

  const handleBulkDecline = () => {
    setConfirmDialog({
      isOpen: true,
      type: 'decline',
      title: 'Decline Applications',
      message: 'Are you sure you want to decline these applications? This action will notify the talent.',
      variant: 'warning',
      count: selectedIds.size
    });
  };

  const handleBulkArchive = () => {
    setConfirmDialog({
      isOpen: true,
      type: 'archive',
      title: 'Archive Applications',
      message: 'Are you sure you want to archive these applications? They can be restored later.',
      variant: 'danger',
      count: selectedIds.size
    });
  };

  const handleBulkTag = () => {
    if (selectedIds.size === 0) {
      toast.error('No applicants selected');
      return;
    }
    setShowTagModal(true);
  };

  const handleConfirmTag = (tag, color) => {
    const applicationIds = Array.from(selectedIds);
    bulkAddTagMutation.mutate({ applicationIds, tag, color });
    setShowTagModal(false);
  };

  const handleBulkRemoveTag = () => {
    if (selectedIds.size === 0) {
      toast.error('No applicants selected');
      return;
    }
    setShowRemoveTagModal(true);
  };

  const handleConfirmRemoveTag = (tag) => {
    const applicationIds = Array.from(selectedIds);
    bulkRemoveTagMutation.mutate({ applicationIds, tag });
    setShowRemoveTagModal(false);
  };

  const handleSavePreset = () => {
    if (presetName.trim()) {
      createPresetMutation.mutate({ name: presetName.trim(), filters });
    }
  };

  const handleApplyPreset = (presetFilters) => {
    setFilters({ ...presetFilters, page: 1 });
    toast.success('Preset applied');
  };

  const handleBulkExport = () => {
    if (selectedIds.size === 0) {
      toast.error('No applicants selected');
      return;
    }

    try {
      const selectedApplicants = data?.profiles?.filter(
        (applicant) => selectedIds.has(applicant.application_id)
      ) || [];

      if (selectedApplicants.length === 0) {
        toast.error('No applicants to export');
        return;
      }

      const headers = [
        'First Name',
        'Last Name',
        'Email',
        'City',
        'Height (cm)',
        'Age',
        'Gender',
        'Status',
        'Applied Date',
        'Tags',
        'Profile URL'
      ];

      const rows = selectedApplicants.map((applicant) => {
        const tags = applicant.tags?.map((t) => t.tag).join('; ') || '';
        const profileUrl = `${window.location.origin}/${applicant.slug}`;

        return [
          applicant.first_name || '',
          applicant.last_name || '',
          applicant.owner_email || '',
          applicant.city || '',
          applicant.height_cm || '',
          applicant.age || '',
          applicant.gender || '',
          applicant.application_status || '',
          applicant.application_created_at ? new Date(applicant.application_created_at).toLocaleDateString() : '',
          tags,
          profileUrl
        ];
      });

      const csvContent = [
        headers.join(','),
        ...rows.map((row) =>
          row.map((cell) => {
            const cellStr = String(cell);
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
              return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
          }).join(',')
        )
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', `applicants_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Exported ${selectedApplicants.length} applicant${selectedApplicants.length !== 1 ? 's' : ''} to CSV`);
    } catch (error) {
      console.error('CSV export error:', error);
      toast.error('Failed to export CSV');
    }
  };

  const handleConfirmBulkAction = () => {
    const applicationIds = Array.from(selectedIds);

    switch (confirmDialog.type) {
      case 'accept':
        bulkAcceptMutation.mutate(applicationIds);
        break;
      case 'decline':
        bulkDeclineMutation.mutate(applicationIds);
        break;
      case 'archive':
        bulkArchiveMutation.mutate(applicationIds);
        break;
      default:
        break;
    }

    setConfirmDialog({ ...confirmDialog, isOpen: false });
  };

  const handleCancelBulkAction = () => {
    setConfirmDialog({ ...confirmDialog, isOpen: false });
  };

  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => {
      if (['status', 'page', 'limit', 'sort'].includes(key)) return false;
      if (Array.isArray(value)) return value.length > 0;
      return value;
    }
  ).length;

  const statusTabs = [
    { label: 'All', value: '', count: pipelineCounts?.all || 0 },
    { label: 'New', value: 'new', count: pipelineCounts?.new || 0 },
    { label: 'Under Review', value: 'under-review', count: pipelineCounts?.['under-review'] || 0 },
    { label: 'Accepted', value: 'accepted', count: pipelineCounts?.accepted || 0 },
    { label: 'Declined', value: 'declined', count: pipelineCounts?.declined || 0 },
    { label: 'Archived', value: 'archived', count: pipelineCounts?.archived || 0 },
  ];

  return (
    <div className="applicants-page">
      {/* Header */}
      <div className="applicants-header">
        <div className="applicants-header-content">
          <div className="applicants-header-text">
            <h1>Applicants</h1>
            <p>Manage your talent applications</p>
          </div>

          <div className="applicants-header-actions">
            <AgencyButton
              variant="secondary"
              icon={Settings}
              onClick={() => setShowTagManager(true)}
            >
              Manage Tags
            </AgencyButton>

            <AgencyButton
              variant="secondary"
              icon={Filter}
              onClick={() => setShowFilters(!showFilters)}
            >
              Filters
              {activeFilterCount > 0 && (
                <span className="filter-badge">{activeFilterCount}</span>
              )}
            </AgencyButton>
          </div>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={selectedIds.size}
        onAccept={handleBulkAccept}
        onDecline={handleBulkDecline}
        onArchive={handleBulkArchive}
        onTag={handleBulkTag}
        onRemoveTag={handleBulkRemoveTag}
        onExport={handleBulkExport}
        onClear={clearSelection}
      />

      {/* Status Tabs */}
      <div className="applicants-tabs">
        <div className="applicants-tabs-list">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleStatusTab(tab.value)}
              className={`applicants-tab ${filters.status === tab.value ? 'applicants-tab--active' : ''}`}
            >
              {tab.label}
              <span className="applicants-tab-badge">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="applicants-layout">
        {/* Filters Sidebar */}
        {showFilters && (
          <FilterSidebar
            filters={filters}
            allTags={allTags}
            filterPresets={filterPresets}
            activeFilterCount={activeFilterCount}
            onFilterChange={handleFilterChange}
            onClearFilters={clearFilters}
            onApplyPreset={handleApplyPreset}
            onShowSavePreset={() => setShowSavePresetPrompt(true)}
            onShowPresetManager={() => setShowPresetManager(true)}
          />
        )}

        {/* Main Content */}
        <div className="applicants-main">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : !data?.profiles || data.profiles.length === 0 ? (
            <AgencyEmptyState
              icon={Users}
              title="No applicants found"
              description="Try adjusting your filters or check back later for new applications."
              action={
                <AgencyButton variant="secondary" onClick={clearFilters}>
                  Clear Filters
                </AgencyButton>
              }
            />
          ) : (
            <ApplicantsTable
              applicants={data.profiles}
              selectedIds={selectedIds}
              onToggleSelection={toggleSelection}
              onToggleSelectAll={toggleSelectAll}
            />
          )}

          {/* Pagination */}
          {data?.profiles && data.profiles.length > 0 && (
            <div className="applicants-table-container">
              <div className="applicants-pagination">
                <div className="pagination-info">
                  Showing {((filters.page - 1) * filters.limit) + 1} to {Math.min(filters.page * filters.limit, data.total || 0)} of {data.total || 0} results
                </div>
                <div className="pagination-controls">
                  <button
                    onClick={() => handleFilterChange('page', filters.page - 1)}
                    disabled={filters.page === 1}
                    className="pagination-btn"
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="pagination-info">Page {filters.page}</span>
                  <button
                    onClick={() => handleFilterChange('page', filters.page + 1)}
                    disabled={filters.page * filters.limit >= (data.total || 0)}
                    className="pagination-btn"
                    aria-label="Next page"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showTagManager && (
        <TagManager onClose={() => setShowTagManager(false)} />
      )}

      {showTagModal && (
        <TagSelectorModal
          onClose={() => setShowTagModal(false)}
          onConfirm={handleConfirmTag}
          allTags={allTags || []}
        />
      )}

      {showRemoveTagModal && (
        <TagRemovalModal
          onClose={() => setShowRemoveTagModal(false)}
          onConfirm={handleConfirmRemoveTag}
          selectedIds={selectedIds}
          applicants={data?.profiles || []}
        />
      )}

      {showPresetManager && (
        <FilterPresetManager
          onClose={() => setShowPresetManager(false)}
          presets={filterPresets || []}
        />
      )}

      {showSavePresetPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Save Filter Preset</h3>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Enter preset name..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <AgencyButton
                variant="ghost"
                onClick={() => {
                  setShowSavePresetPrompt(false);
                  setPresetName('');
                }}
              >
                Cancel
              </AgencyButton>
              <AgencyButton
                variant="primary"
                onClick={handleSavePreset}
                disabled={!presetName.trim()}
              >
                Save
              </AgencyButton>
            </div>
          </div>
        </div>
      )}

      {confirmDialog.isOpen && (
        <ConfirmationDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant}
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          onConfirm={handleConfirmBulkAction}
          onCancel={handleCancelBulkAction}
        />
      )}
    </div>
  );
}

// Filter Sidebar Component
function FilterSidebar({
  filters,
  allTags,
  filterPresets,
  activeFilterCount,
  onFilterChange,
  onClearFilters,
  onApplyPreset,
  onShowSavePreset,
  onShowPresetManager
}) {
  return (
    <div className="applicants-filter">
      <div className="applicants-filter-card">
        <div className="applicants-filter-header">
          <h3 className="applicants-filter-title">Filters</h3>
          {activeFilterCount > 0 && (
            <button className="applicants-filter-clear" onClick={onClearFilters}>
              Clear
            </button>
          )}
        </div>

        <div className="applicants-filter-content">
          {/* Preset Selector */}
          {filterPresets && filterPresets.length > 0 && (
            <div className="filter-section">
              <label className="filter-label">Quick Apply</label>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    const preset = filterPresets.find(p => p.id === e.target.value);
                    if (preset) onApplyPreset(preset.filters);
                  }
                }}
                className="filter-input"
                value=""
              >
                <option value="">Select a preset...</option>
                {filterPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.is_default ? '⭐ ' : ''}{preset.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Preset Actions */}
          <div className="preset-actions">
            <button className="preset-btn preset-btn--primary" onClick={onShowSavePreset}>
              Save Filters
            </button>
            <button className="preset-btn preset-btn--secondary" onClick={onShowPresetManager}>
              Manage
            </button>
          </div>

          {/* Search */}
          <div className="filter-section">
            <label className="filter-label">Search</label>
            <div className="filter-search">
              <Search className="filter-search-icon" size={16} />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => onFilterChange('search', e.target.value)}
                placeholder="Name..."
                className="filter-input"
              />
            </div>
          </div>

          {/* City */}
          <div className="filter-section">
            <label className="filter-label">City</label>
            <input
              type="text"
              value={filters.city}
              onChange={(e) => onFilterChange('city', e.target.value)}
              placeholder="e.g. New York"
              className="filter-input"
            />
          </div>

          {/* Height Range */}
          <div className="filter-section">
            <label className="filter-label">Height (cm)</label>
            <div className="filter-range">
              <input
                type="number"
                value={filters.min_height}
                onChange={(e) => onFilterChange('min_height', e.target.value)}
                placeholder="Min"
                className="filter-input"
              />
              <span className="filter-range-separator">-</span>
              <input
                type="number"
                value={filters.max_height}
                onChange={(e) => onFilterChange('max_height', e.target.value)}
                placeholder="Max"
                className="filter-input"
              />
            </div>
          </div>

          {/* Gender */}
          <div className="filter-section">
            <label className="filter-label">Gender</label>
            <select
              value={filters.gender}
              onChange={(e) => onFilterChange('gender', e.target.value)}
              className="filter-input"
            >
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Non-binary">Non-binary</option>
            </select>
          </div>

          {/* Tags Filter */}
          <div className="filter-section">
            <label className="filter-label">Tags</label>
            <div className="filter-tags">
              {allTags && allTags.length > 0 ? (
                allTags.map((tag) => {
                  const isSelected = filters.tags.includes(tag.tag);
                  return (
                    <div key={tag.tag} className="filter-tag-option">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            onFilterChange('tags', [...filters.tags, tag.tag]);
                          } else {
                            onFilterChange('tags', filters.tags.filter(t => t !== tag.tag));
                          }
                        }}
                        className="filter-tag-checkbox"
                      />
                      <span className="filter-tag-label">{tag.tag}</span>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500">No tags available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Applicants Table Component
function ApplicantsTable({ applicants, selectedIds, onToggleSelection, onToggleSelectAll }) {
  return (
    <div className="applicants-table-container">
      <table className="applicants-table">
        <thead>
          <tr>
            <th className="applicant-cell-checkbox">
              <input
                type="checkbox"
                checked={selectedIds.size === applicants.length && applicants.length > 0}
                onChange={onToggleSelectAll}
                aria-label="Select all applicants"
              />
            </th>
            <th className="applicant-cell-profile">Profile</th>
            <th>Status</th>
            <th>City</th>
            <th>Height</th>
            <th>Tags</th>
            <th>Applied</th>
            <th className="applicant-cell-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {applicants.map((applicant) => (
            <ApplicantRow
              key={applicant.application_id}
              applicant={applicant}
              isSelected={selectedIds.has(applicant.application_id)}
              onToggleSelection={() => onToggleSelection(applicant.application_id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Applicant Row Component
function ApplicantRow({ applicant, isSelected, onToggleSelection }) {
  const firstImage = applicant.images?.[0];
  const imageUrl = firstImage?.path?.startsWith('http')
    ? firstImage.path
    : `/${firstImage?.path || 'uploads/placeholder.jpg'}`;

  return (
    <tr>
      <td className="applicant-cell-checkbox">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelection}
          aria-label={`Select ${applicant.first_name} ${applicant.last_name}`}
        />
      </td>
      <td className="applicant-cell-profile">
        <div className="applicant-profile">
          <img
            src={imageUrl}
            alt={`${applicant.first_name} ${applicant.last_name}`}
            className="applicant-avatar"
          />
          <div className="applicant-info">
            <div className="applicant-name">
              {applicant.first_name} {applicant.last_name}
            </div>
            <div className="applicant-location">{applicant.city || 'N/A'}</div>
          </div>
        </div>
      </td>
      <td>
        <span className={`status-badge status-badge--${applicant.application_status || 'new'}`}>
          {applicant.application_status || 'new'}
        </span>
      </td>
      <td>{applicant.city || 'N/A'}</td>
      <td>{applicant.height_cm ? `${applicant.height_cm} cm` : 'N/A'}</td>
      <td>
        <div className="applicant-tags">
          {applicant.tags && applicant.tags.length > 0 ? (
            applicant.tags.slice(0, 2).map((tag) => (
              <TagPill key={tag.tag} tag={tag.tag} color={tag.color} size="sm" />
            ))
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}
          {applicant.tags && applicant.tags.length > 2 && (
            <span className="text-xs text-gray-500">+{applicant.tags.length - 2}</span>
          )}
        </div>
      </td>
      <td>
        {applicant.application_created_at
          ? new Date(applicant.application_created_at).toLocaleDateString()
          : 'N/A'}
      </td>
      <td className="applicant-cell-actions">
        <Link
          to={`/dashboard/agency/applicants/${applicant.application_id}`}
          className="inline-flex items-center justify-center w-8 h-8 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
          aria-label="View applicant details"
        >
          <Eye size={18} />
        </Link>
      </td>
    </tr>
  );
}
