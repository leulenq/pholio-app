/**
 * RosterPage — Agency Talent Roster
 * Card grid / list view workspace for managing signed talent.
 * Uses shared FilterBar, TalentCard, TalentDetailPanel, BulkActionToolbar.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { fetchRoster } from '../../api/agency';
import FilterBar from '../../components/agency/FilterBar';
import TalentCard from '../../components/agency/TalentCard';
import RichRow from '../../components/agency/RichRow';
import TalentDetailPanel from '../../components/agency/TalentDetailPanel';
import BulkActionToolbar from '../../components/agency/BulkActionToolbar';
import { AgencyEmptyState } from '../../components/agency/ui/AgencyEmptyState';
import './RosterPage.css';

// ── Config ────────────────────────────────────────────────────
const TYPES = {
  editorial:  { label: 'Editorial' },
  commercial: { label: 'Commercial' },
  runway:     { label: 'Runway' },
  fitness:    { label: 'Fitness' },
  plus:       { label: 'Plus' },
};

const ROSTER_FILTERS = [
  { key: 'gender', label: 'Gender', type: 'multi', options: ['female', 'male'] },
  { key: 'type', label: 'Type', type: 'multi', options: Object.keys(TYPES) },
  { key: 'status', label: 'Status', type: 'multi', options: ['available', 'booking', 'hold', 'inactive'] },
  { key: 'tags', label: 'Tags', type: 'multi', options: [] },
];

// ── NL Intent Parser (preserved from original) ──────────────
function parseIntent(q) {
  const chips = [];
  const s = q.toLowerCase();
  if (/\bfemale\b|\bwomen\b|\bwoman\b/.test(s)) chips.push({ key: 'gender', value: 'female', label: 'Female' });
  else if (/\bmale\b|\bmen\b|\bman\b/.test(s)) chips.push({ key: 'gender', value: 'male', label: 'Male' });
  Object.entries(TYPES).forEach(([k, v]) => { if (s.includes(k)) chips.push({ key: 'type', value: k, label: v.label }); });
  if (/\bavailable\b/.test(s)) chips.push({ key: 'status', value: 'available', label: 'Available' });
  else if (/\bbooking\b/.test(s)) chips.push({ key: 'status', value: 'booking', label: 'On Booking' });
  else if (/\bhold\b/.test(s)) chips.push({ key: 'status', value: 'hold', label: 'On Hold' });
  [['new york', 'New York'], ['london', 'London'], ['paris', 'Paris'], ['milan', 'Milan'],
   ['los angeles', 'Los Angeles'], ['miami', 'Miami'], ['seoul', 'Seoul'], ['tokyo', 'Tokyo'],
   ['dubai', 'Dubai'], ['berlin', 'Berlin'], ['shanghai', 'Shanghai']].forEach(([m, l]) => {
    if (s.includes(m)) chips.push({ key: 'location', value: l, label: l });
  });
  const cm = s.match(/(\d{3})\s*cm/);
  if (cm) chips.push({ key: 'heightMin', value: parseInt(cm[1]) - 2, label: `≥${cm[1]}cm` });
  const ft = s.match(/(\d)['′](\d+)/);
  if (ft) { const h = Math.round(parseInt(ft[1]) * 30.48 + parseInt(ft[2]) * 2.54); chips.push({ key: 'heightMin', value: h - 2, label: `≥${h}cm` }); }
  return chips;
}

function applyNLFilters(data, query, chips) {
  let r = [...data];
  const nameQ = query
    .replace(/\b(female|male|women?|men?|editorial|commercial|runway|fitness|plus|available|booking|hold|inactive|new york|london|paris|milan|los angeles|miami|seoul|tokyo|dubai|berlin|shanghai|\d{3}\s*cm)\b/gi, '')
    .trim();
  if (nameQ) r = r.filter(t => (t.name || '').toLowerCase().includes(nameQ.toLowerCase()) || (t.location || '').toLowerCase().includes(nameQ.toLowerCase()) || (t.tags || []).some(g => g.toLowerCase().includes(nameQ.toLowerCase())));
  chips.forEach(c => {
    if (c.key === 'gender') r = r.filter(t => t.gender === c.value);
    if (c.key === 'type') r = r.filter(t => t.type === c.value);
    if (c.key === 'status') r = r.filter(t => t.status === c.value);
    if (c.key === 'location') r = r.filter(t => (t.location || '').includes(c.value));
    if (c.key === 'heightMin') r = r.filter(t => (t.height || 0) >= c.value);
  });
  return r;
}

// ── Adapter (preserved from original) ───────────────────────
const toTalentObject = (t) => !t ? null : ({
  id:            t.id,
  profileId:     t.id,
  applicationId: t.applicationId || null,
  name:          t.name,
  photo: t.img || t.photo || null,
  type: t.type,
  status: t.status,
  location: t.location || null,
  measurements: { height: t.height || null, bust: t.bust || null, waist: t.waist || null, hips: t.hips || null },
  bio: t.notes || null,
  email: t.email || null,
  phone: t.phone || null,
  gender: t.gender || null,
  lastBooking: t.lastBooking,
  tags: t.tags || [],
});

// ── Main Page ─────────────────────────────────────────────────
export default function RosterPage() {
  const { data: rawRoster = [], isLoading } = useQuery({
    queryKey: ['agency', 'roster'],
    queryFn: fetchRoster,
  });

  const roster = useMemo(() => {
    return rawRoster.map(t => ({
      ...t,
      lastBooking: t.lastBooking ? new Date(t.lastBooking) : null,
      dateAdded: t.dateAdded ? new Date(t.dateAdded) : null,
    }));
  }, [rawRoster]);

  const [viewMode, setViewMode] = useState('grid');
  const [selectedTalent, setSelectedTalent] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [activeFilters, setActiveFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [panelMode, setPanelMode] = useState('fixed');

  // Responsive panel mode
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    setPanelMode(mq.matches ? 'fixed' : 'drawer');
    const handler = (e) => setPanelMode(e.matches ? 'fixed' : 'drawer');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // NL parsing + filter
  const chips = useMemo(() => parseIntent(searchQuery), [searchQuery]);
  const filtered = useMemo(() => {
    let result = applyNLFilters(roster, searchQuery, chips);
    // Also apply FilterBar activeFilters
    if (activeFilters.gender?.length) result = result.filter(t => activeFilters.gender.includes(t.gender));
    if (activeFilters.type?.length) result = result.filter(t => activeFilters.type.includes(t.type));
    if (activeFilters.status?.length) result = result.filter(t => activeFilters.status.includes(t.status));
    return result;
  }, [roster, searchQuery, chips, activeFilters]);

  const toggleCheck = useCallback((talent) => {
    const id = talent.id || talent;
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const hasSelection = checkedIds.size > 0;

  return (
    <div className={`roster-page ${selectedTalent && panelMode === 'fixed' ? 'has-panel' : ''}`}>
      <div className="roster-page__main">
        {hasSelection && (
          <BulkActionToolbar
            selectedCount={checkedIds.size}
            context="roster"
            onAction={(action) => {
              // TODO: implement bulk roster actions
            }}
            onClearSelection={() => setCheckedIds(new Set())}
          />
        )}

        <FilterBar
          filters={ROSTER_FILTERS}
          activeFilters={activeFilters}
          onChange={setActiveFilters}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search roster..."
          viewModes={['grid', 'list']}
        />

        {viewMode === 'grid' ? (
          <div className="roster-page__grid">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <div key={i} className="roster-page__card-skeleton" />)
            ) : filtered.length === 0 ? (
              <AgencyEmptyState
                title="No talent matched"
                description="Try adjusting your search or filters."
              />
            ) : (
              filtered.map(t => (
                <TalentCard
                  key={t.id}
                  talent={toTalentObject(t)}
                  isSelected={selectedTalent?.id === t.id}
                  onSelect={() => setSelectedTalent(t)}
                  onQuickAction={(action) => {
                    // TODO: implement quick actions
                  }}
                />
              ))
            )}
          </div>
        ) : (
          <div className="roster-page__rows">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <div key={i} className="ag-rich-row-skeleton" />)
            ) : filtered.length === 0 ? (
              <AgencyEmptyState
                title="No talent matched"
                description="Try adjusting your search or filters."
              />
            ) : (
              filtered.map(t => (
                <RichRow
                  key={t.id}
                  application={toTalentObject(t)}
                  isSelected={selectedTalent?.id === t.id}
                  isChecked={checkedIds.has(t.id)}
                  onSelect={setSelectedTalent}
                  onCheck={toggleCheck}
                />
              ))
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedTalent && (
          <TalentDetailPanel
            profileId={selectedTalent.id}
            context="roster"
            mode={panelMode}
            onClose={() => setSelectedTalent(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
