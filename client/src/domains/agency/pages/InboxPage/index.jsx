import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApplicants, getFilterPresets, bulkUpdateCastingApplicationStage, updateCastingApplicationStage } from '../../api/agency';
import FilterBar from '../../components/FilterBar';
import RichRow from '../../components/RichRow';
import TalentDetailPanel from '../../components/TalentDetailPanel';
import BulkActionToolbar from '../../components/BulkActionToolbar';
import KanbanColumn from '../../components/KanbanColumn';
import KanbanCard from '../../components/KanbanCard';
import KeyboardShortcutOverlay from '../../components/KeyboardShortcutOverlay';
import { AgencyEmptyState } from '../../components/ui/AgencyEmptyState';
import useKeyboardShortcuts from '../../../../shared/hooks/useKeyboardShortcuts';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import './InboxPage.css';

const KANBAN_STAGES = ['pending', 'shortlisted', 'offered', 'accepted', 'declined'];
const STAGE_LABELS = { pending: 'New', shortlisted: 'Shortlisted', offered: 'Offered', accepted: 'Signed', declined: 'Declined' };

const INBOX_FILTERS = [
  { key: 'status', label: 'Status', type: 'multi', options: ['pending', 'shortlisted', 'offered', 'declined', 'archived'] },
  { key: 'archetype', label: 'Type', type: 'multi', options: ['editorial', 'commercial', 'runway', 'fitness', 'plus'] },
  { key: 'tags', label: 'Tags', type: 'multi', options: [] },
];

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('list');
  const [selectedApp, setSelectedApp] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [activeFilters, setActiveFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [panelMode, setPanelMode] = useState('fixed');

  // Responsive panel mode
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    setPanelMode(mq.matches ? 'fixed' : 'drawer');
    const handler = (e) => setPanelMode(e.matches ? 'fixed' : 'drawer');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const { data: applicationsData, isLoading } = useQuery({
    queryKey: ['agency', 'applications', activeFilters],
    queryFn: () => getApplicants(activeFilters),
  });
  const applications = applicationsData?.profiles || [];

  const { data: presets = [] } = useQuery({
    queryKey: ['agency', 'filter-presets'],
    queryFn: getFilterPresets,
  });

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchQuery) return applications;
    const q = searchQuery.toLowerCase();
    return applications.filter(a =>
      (a.name || '').toLowerCase().includes(q) ||
      (a.tags || []).some(t => (t.tag || t).toLowerCase().includes(q))
    );
  }, [applications, searchQuery]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: 'k', action: () => setViewMode(v => v === 'list' ? 'kanban' : 'list') },
    { key: '?', action: () => setShowShortcuts(s => !s) },
    { key: 'Escape', action: () => { setSelectedApp(null); setShowShortcuts(false); } },
  ], []);

  const hasSelection = checkedIds.size > 0;

  return (
    <div className={`inbox-page ${selectedApp && panelMode === 'fixed' ? 'has-panel' : ''}`}>
      <div className="inbox-page__list">
        {hasSelection && (
          <BulkActionToolbar
            selectedCount={checkedIds.size}
            context="inbox"
            onAction={async (action) => {
              const ids = Array.from(checkedIds);
              try {
                if (action === 'shortlist') await bulkUpdateCastingApplicationStage(ids, { status: 'shortlisted' });
                else if (action === 'decline') await bulkUpdateCastingApplicationStage(ids, { status: 'declined' });
                else if (action === 'archive') await bulkUpdateCastingApplicationStage(ids, { status: 'archived' });
                queryClient.invalidateQueries({ queryKey: ['agency', 'applications'] });
                setCheckedIds(new Set());
              } catch (err) { toast.error(`${action} failed for some items`); }
            }}
            onClearSelection={() => setCheckedIds(new Set())}
          />
        )}

        <FilterBar
          filters={INBOX_FILTERS}
          activeFilters={activeFilters}
          onChange={setActiveFilters}
          presets={presets}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search applicants..."
          viewModes={['list', 'kanban']}
        />

        {viewMode === 'list' ? (
          <div className="inbox-page__rows">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <div key={i} className="ag-rich-row-skeleton" />)
            ) : filtered.length === 0 ? (
              <AgencyEmptyState
                title="All caught up"
                description="No applications match your filters."
              />
            ) : (
              filtered.map(app => (
                <RichRow
                  key={app.id}
                  application={app}
                  isSelected={selectedApp?.id === app.id}
                  isChecked={checkedIds.has(app.id)}
                  onSelect={setSelectedApp}
                  onCheck={(a) => {
                    setCheckedIds(prev => {
                      const next = new Set(prev);
                      next.has(a.id) ? next.delete(a.id) : next.add(a.id);
                      return next;
                    });
                  }}
                />
              ))
            )}
          </div>
        ) : (
          <KanbanView
            applications={filtered}
            selectedApp={selectedApp}
            onCardClick={setSelectedApp}
            queryClient={queryClient}
          />
        )}
      </div>

      {selectedApp && (
        <TalentDetailPanel
          applicationId={selectedApp.id || selectedApp.applicationId}
          profileId={selectedApp.profileId || selectedApp.profile_id}
          context="inbox"
          mode={panelMode}
          onClose={() => setSelectedApp(null)}
        />
      )}

      {showShortcuts && <KeyboardShortcutOverlay onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}

function KanbanView({ applications, selectedApp, onCardClick, queryClient }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const grouped = useMemo(() => {
    const map = {};
    for (const stage of KANBAN_STAGES) map[stage] = [];
    for (const app of applications) {
      const stage = KANBAN_STAGES.includes(app.status) ? app.status : 'pending';
      map[stage].push(app);
    }
    return map;
  }, [applications]);

  return (
    <DndContext sensors={sensors} onDragEnd={({ active, over }) => {
      if (!over || active.id === over.id) return;
      const appId = active.id;
      const newStatus = over.id;
      updateCastingApplicationStage(appId, { status: newStatus })
        .then(() => queryClient.invalidateQueries({ queryKey: ['agency', 'applications'] }));
    }}>
      <div className="inbox-page__kanban">
        {KANBAN_STAGES.map(stage => (
          <KanbanColumn
            key={stage}
            id={stage}
            stage={STAGE_LABELS[stage] || stage}
            count={grouped[stage].length}
            cards={grouped[stage]}
            onCardClick={onCardClick}
            selectedCardId={selectedApp?.id}
          />
        ))}
      </div>
    </DndContext>
  );
}
