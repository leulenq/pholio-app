import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, Rows, Image as ImageIcon,
  X, Sparkles, ChevronRight, ChevronLeft, Eye,
} from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor,
  PointerSensor, useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TalentDetailPanel from '../../components/TalentDetailPanel';
import BulkActionToolbar from '../../components/BulkActionToolbar';

const STAGES = ['Applied', 'Shortlisted', 'Offered', 'Booked', 'Passed'];

function formatAssetUrl(path) {
  if (!path) return null;
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) {
    return path;
  }
  return `/${path.replace(/^\/+/, '')}`;
}

function buildAvatarFallback(name) {
  const initials = (name || '?')
    .split(' ')
    .map((part) => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="100%" height="100%" fill="#ede6da"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Georgia, serif" font-size="120" fill="#b69355">${initials}</text></svg>`
  )}`;
}

function CandidateCard({ candidate, isSelected, onSelect, onOpenDrawer, inlineStyle, innerRef, attributes, listeners, mode }) {
  const isGallery = mode === 'gallery';
  const scoreLabel = candidate.score === null || candidate.score === undefined ? 'NA' : `${candidate.score}`;
  return (
    <div
      ref={innerRef}
      style={{ ...inlineStyle, borderRadius: '12px' }}
      {...attributes}
      {...listeners}
      className={[
        'group relative bg-white cursor-grab select-none transition-all duration-300',
        'rounded-[12px] shadow-[0_2px_12px_rgba(0,0,0,0.08),0_12px_32px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.15),0_32px_64px_rgba(0,0,0,0.18)]',
        isGallery ? 'hover:scale-[1.03] hover:-translate-y-2' : 'hover:-translate-y-1',
        isSelected ? 'ring-2 ring-[#C9A84C] shadow-[0_0_0_4px_rgba(201,165,90,0.1)]' : '',
      ].join(' ')}
    >
      <div className={['relative overflow-hidden', isGallery ? 'rounded-[12px]' : 'rounded-t-[12px]'].join(' ')}>
        <img
          src={formatAssetUrl(candidate.avatar) || buildAvatarFallback(candidate.name)}
          alt={candidate.name}
          className={['w-full object-cover block transition-transform duration-700 group-hover:scale-110', isGallery ? 'aspect-[2/3]' : 'h-52'].join(' ')}
        />

        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none mix-blend-soft-light opacity-[0.12]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: '150px 150px',
          }}
        />

        <div className={[
          'absolute inset-0 transition-opacity duration-300',
          isGallery ? 'bg-gradient-to-t from-slate-900/95 via-slate-900/40 to-transparent opacity-100' : 'bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent opacity-0 group-hover:opacity-100',
        ].join(' ')} />

        <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/10 backdrop-blur-md border border-white/10 text-white text-[9px] font-bold px-2 py-1 rounded-full shadow-sm">
          <Sparkles size={8} className="text-[#C9A84C]" /> {scoreLabel} Match
        </div>

        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => { e.stopPropagation(); onSelect(candidate.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Select ${candidate.name}`}
          className={[
            'absolute top-3 left-3 w-4.5 h-4.5 rounded border-white/20 bg-black/20 accent-[#C9A84C] transition-opacity z-10 cursor-pointer',
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          ].join(' ')}
        />

        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
          <button
            type="button"
            title="View profile"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onOpenDrawer(candidate); }}
            className="w-10 h-10 rounded-full border border-white/20 bg-white/10 backdrop-blur-md text-white flex items-center justify-center hover:bg-[#C9A84C] hover:border-transparent hover:scale-110 transition-all duration-200"
          >
            <Eye size={16} />
          </button>
        </div>

        {isGallery && (
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <p className="font-display text-white text-xl font-normal leading-tight tracking-tight group-hover:translate-y-[-2px] transition-transform duration-300">
              {candidate.name}
            </p>
            <div className="flex items-center gap-2 mt-1.5 overflow-hidden">
              <span className="h-[1px] w-4 bg-[#C9A84C]/60 group-hover:w-8 transition-all duration-500" />
              <p className="text-[#C9A84C] text-[9px] font-black uppercase tracking-[0.2em]">{candidate.archetype}</p>
            </div>
          </div>
        )}
      </div>

      {!isGallery && (
        <div className="p-4">
          <span className="font-display block text-[#0f172a] text-[1rem] font-bold truncate tracking-tight">{candidate.name}</span>
          <span className="block text-slate-500 text-[0.625rem] font-bold uppercase tracking-widest mt-1">{candidate.archetype}</span>
        </div>
      )}
    </div>
  );
}

function SortableCandidateCard(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.candidate.id });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return <CandidateCard {...props} innerRef={setNodeRef} inlineStyle={style} attributes={attributes} listeners={listeners} />;
}

function StageFilter({ candidates, activeFilter, onFilterChange }) {
  const options = ['All', ...STAGES];
  return (
    <div className="flex gap-8">
      {options.map((s) => {
        const isActive = activeFilter === s;
        const count = s === 'All' ? candidates.length : candidates.filter((c) => c.stage === s).length;
        return (
          <button
            type="button"
            key={s}
            onClick={() => onFilterChange(s)}
            className={[
              'flex items-center gap-2 pb-2 transition-all duration-200 text-xs font-bold uppercase tracking-widest relative',
              isActive
                ? 'text-[#C9A84C]'
                : 'text-slate-400 hover:text-slate-600',
            ].join(' ')}
          >
            {s}
            <span className="text-[0.625rem] opacity-60 ml-0.5">{count}</span>
            {isActive && (
              <motion.div
                layoutId="active-tab-underline"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#C9A84C]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function CastingMatchList({
  activeCasting,
  activeCastingId,
  viewMode,
  setView,
  filterStage,
  setFilterStage,
  candidates,
  displayedStages,
  visibleCandidates,
  appliedCandidates,
  selectedCandidates,
  setSelectedCandidates,
  drawerCandidate,
  setDrawerCandidate,
  focusMode,
  setFocusMode,
  focusIndex,
  setFocusIndex,
  isFocusAnimating,
  setIsFocusAnimating,
  activeId,
  onDragStart,
  onDragOver,
  onDragEnd,
  commitCandidateStage,
  onBulkAction,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeDragCandidate = candidates.find((candidate) => candidate.id === activeId) || null;

  const toggleSelect = (id) => setSelectedCandidates((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const openDrawer = (c) => { setDrawerCandidate(c); };

  const focusCandidate = appliedCandidates[focusIndex] || null;

  const handleFocusKey = useCallback((e) => {
    if (!focusMode || isFocusAnimating) return;
    if (e.key === 'Escape') { setFocusMode(false); return; }
    const current = appliedCandidates[focusIndex];
    if (!current) return;
    if (e.key === 's' || e.key === 'S') {
      setIsFocusAnimating(true);
      commitCandidateStage(current, 'Shortlisted', `${current.name} moved to Shortlisted`);
      setTimeout(() => { setFocusIndex((i) => Math.min(i, appliedCandidates.length - 2)); setIsFocusAnimating(false); }, 300);
    }
    if (e.key === 'p' || e.key === 'P') {
      setIsFocusAnimating(true);
      commitCandidateStage(current, 'Passed', `${current.name} passed`);
      setTimeout(() => { setFocusIndex((i) => Math.min(i, appliedCandidates.length - 2)); setIsFocusAnimating(false); }, 300);
    }
    if (e.key === 'ArrowRight') setFocusIndex((i) => Math.min(i + 1, appliedCandidates.length - 1));
    if (e.key === 'ArrowLeft') setFocusIndex((i) => Math.max(i - 1, 0));
  }, [focusMode, focusIndex, appliedCandidates, isFocusAnimating, commitCandidateStage, setFocusMode, setFocusIndex, setIsFocusAnimating]);

  useEffect(() => {
    window.addEventListener('keydown', handleFocusKey);
    return () => window.removeEventListener('keydown', handleFocusKey);
  }, [handleFocusKey]);

  return (
    <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="flex flex-col flex-shrink-0">
        <div className="flex items-center justify-between px-12 pt-10 pb-6 bg-transparent">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-4xl font-bold text-[#0f172a] tracking-tight">{activeCasting?.name || 'Casting'}</h1>
            <div className="flex items-center gap-2 ml-1">
              <span className="h-px w-6 bg-[#C9A84C]" />
              <span className="text-[0.6875rem] font-bold text-[#C9A84C] uppercase tracking-[0.2em]">{activeCasting?.client_name || 'Internal Casting'}</span>
            </div>
          </div>
        </div>

        <div className="px-12 py-4 flex items-center justify-between bg-transparent">
          {viewMode !== 'kanban' && (
            <StageFilter candidates={candidates} activeFilter={filterStage} onFilterChange={setFilterStage} />
          )}

          <div className="flex items-center gap-1 p-1">
            {[
              { id: 'kanban', icon: <Rows size={15} />, label: 'Kanban' },
              { id: 'grid', icon: <LayoutGrid size={15} />, label: 'Grid' },
              { id: 'gallery', icon: <ImageIcon size={15} />, label: 'Gallery' },
            ].map(({ id, icon, label }) => (
              <button
                type="button"
                key={id}
                onClick={() => setView(id)}
                title={label}
                className={[
                  'p-2 rounded-lg transition-all duration-300',
                  viewMode === id
                    ? 'bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)] text-slate-800'
                    : 'text-slate-400 hover:bg-white/50 hover:text-slate-600',
                ].join(' ')}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewMode === 'kanban' && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-5 p-12 py-10 overflow-x-auto flex-1 items-start">
            {displayedStages.map((stage) => (
              <SortableContext
                key={stage}
                id={stage}
                items={candidates.filter((c) => c.stage === stage).map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="w-[260px] flex-shrink-0 flex flex-col gap-4" id={stage}>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-widest">{stage}</span>
                    <span className="font-display text-[0.875rem] font-medium text-slate-300 italic">
                      {candidates.filter((c) => c.stage === stage).length}
                    </span>
                  </div>
                  {stage === 'Applied' && appliedCandidates.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setFocusIndex(0); setFocusMode(true); }}
                      className="w-full py-2.5 text-xs font-semibold uppercase tracking-wider text-gold-500 bg-gold-500/8 border border-gold-500/30 rounded-lg hover:bg-gold-500 hover:text-white transition-all duration-200"
                    >
                      ▶ Review All
                    </button>
                  )}
                  <div className="flex flex-col gap-4 min-h-[120px]">
                    {candidates.filter((c) => c.stage === stage).map((cand) => (
                      <SortableCandidateCard
                        key={cand.id}
                        candidate={cand}
                        isSelected={selectedCandidates.includes(cand.id)}
                        onSelect={toggleSelect}
                        onOpenDrawer={openDrawer}
                      />
                    ))}
                    {candidates.filter((c) => c.stage === stage).length === 0 && (
                      <div className="p-8 text-center text-xs font-medium text-slate-300 border border-dashed border-slate-200 rounded-lg">
                        {stage === 'Applied' ? 'All caught up ✓' : 'Empty'}
                      </div>
                    )}
                  </div>
                </div>
              </SortableContext>
            ))}
          </div>
          <DragOverlay>
            {activeId && activeDragCandidate ? (
              <div className="bg-white rounded-xl p-2.5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.2)] rotate-2 scale-105">
                <img src={formatAssetUrl(activeDragCandidate.avatar) || buildAvatarFallback(activeDragCandidate.name)} alt={activeDragCandidate.name} className="w-full h-44 object-cover rounded-lg" />

                <div className="px-1 pt-2 pb-1">
                  <span className="font-display block text-[#0f172a] text-sm font-bold">{activeDragCandidate.name}</span>
                  <span className="text-slate-500 text-xs capitalize">{activeDragCandidate.archetype}</span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {viewMode === 'grid' && (
        <div className="flex-1 overflow-y-auto px-12 py-10">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
            {visibleCandidates.map((cand) => (
              <CandidateCard
                key={cand.id}
                candidate={cand}
                isSelected={selectedCandidates.includes(cand.id)}
                onSelect={toggleSelect}
                onOpenDrawer={openDrawer}
              />
            ))}
          </div>
        </div>
      )}

      {viewMode === 'gallery' && (
        <div className="flex-1 overflow-y-auto px-12 py-10">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
            {visibleCandidates.map((cand) => (
              <CandidateCard
                key={cand.id}
                candidate={cand}
                mode="gallery"
                isSelected={selectedCandidates.includes(cand.id)}
                onSelect={toggleSelect}
                onOpenDrawer={openDrawer}
              />
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedCandidates.length > 0 && (
          <BulkActionToolbar
            selectedCount={selectedCandidates.length}
            context="casting"
            onAction={onBulkAction}
            onClearSelection={() => setSelectedCandidates([])}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawerCandidate && (
          <TalentDetailPanel
            key={drawerCandidate.id}
            applicationId={drawerCandidate.applicationId || drawerCandidate.id}
            profileId={drawerCandidate.profileId || drawerCandidate.id}
            context="casting"
            boardId={activeCastingId}
            mode="drawer"
            onClose={() => setDrawerCandidate(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {focusMode && focusCandidate && (
          <motion.div
            className="fixed inset-0 bg-gradient-to-br from-slate-800 to-slate-900 z-[100] flex flex-col items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-full flex justify-between items-center px-10 py-6 flex-shrink-0">
              <button type="button" onClick={() => setFocusMode(false)} className="flex items-center gap-2 text-slate-400 text-sm font-medium hover:text-white transition-colors duration-200"><X size={16} /> Back to Pipeline</button>
              <span className="font-display text-slate-400 text-sm italic">{focusIndex + 1} / {appliedCandidates.length}</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={focusCandidate.id}
                className="flex-1 max-w-[1000px] w-full flex gap-16 px-10 pb-10 items-start overflow-hidden"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -60 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              >
                <img
                  src={formatAssetUrl(focusCandidate.avatar) || buildAvatarFallback(focusCandidate.name)}
                  alt={focusCandidate.name}
                  className="h-full min-h-0 flex-shrink-0 object-cover rounded-lg shadow-[0_20px_40px_-10px_rgba(0,0,0,0.4)]"
                  style={{ width: 'min(440px, calc((100vh - 240px) * 0.66))' }}
                />
                <div className="flex flex-col gap-4 pt-10 flex-1">
                  <h2 className="font-display text-5xl font-normal text-white leading-tight tracking-tight">{focusCandidate.name}</h2>
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-widest rounded bg-gold-500/8 text-gold-500 border border-gold-500/20">{focusCandidate.archetype}</span>
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-gold-500 bg-gold-500/8 px-3 py-1 rounded-full"><Sparkles size={10} /> {focusCandidate.score ?? 'NA'} Match</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    {[focusCandidate.height, focusCandidate.measurements, focusCandidate.location].map((val, i) => (
                      <span key={i} className="text-sm text-slate-400 pb-3 border-b border-white/5">{val}</span>
                    ))}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
            <div className="flex items-center gap-4 px-8 pb-8 flex-shrink-0">
              <button type="button" onClick={() => setFocusIndex((i) => Math.max(i - 1, 0))} disabled={focusIndex === 0} aria-label="Previous candidate" className="w-12 h-12 rounded-full bg-white/5 border border-white/10 text-slate-400 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed"><ChevronLeft size={18} /></button>
              <button
                type="button"
                onClick={() => { commitCandidateStage(focusCandidate, 'Passed', `${focusCandidate.name} passed`); setTimeout(() => setFocusIndex((i) => Math.min(i, appliedCandidates.length - 2)), 300); }}
                aria-label="Pass candidate"
                className="min-w-[200px] flex-1 py-4 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-sm font-medium flex items-center justify-center gap-3 hover:bg-white/10 hover:text-white transition-all duration-200"
              >
                Pass <kbd className="inline-flex items-center justify-center w-[22px] h-[22px] rounded bg-white/10 text-[0.625rem] font-mono">P</kbd>
              </button>
              <button
                type="button"
                onClick={() => { commitCandidateStage(focusCandidate, 'Shortlisted', `${focusCandidate.name} → Shortlisted`); setTimeout(() => setFocusIndex((i) => Math.min(i, appliedCandidates.length - 2)), 300); }}
                aria-label="Shortlist candidate"
                className="min-w-[200px] flex-1 py-4 rounded-lg bg-gold-500 text-white text-sm font-medium flex items-center justify-center gap-3 hover:bg-gold-600 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(201,165,90,0.3)]"
              >
                Shortlist <kbd className="inline-flex items-center justify-center w-[22px] h-[22px] rounded bg-white/10 text-[0.625rem] font-mono">S</kbd>
              </button>
              <button type="button" onClick={() => setFocusIndex((i) => Math.min(i + 1, appliedCandidates.length - 1))} disabled={focusIndex === appliedCandidates.length - 1} aria-label="Next candidate" className="w-12 h-12 rounded-full bg-white/5 border border-white/10 text-slate-400 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed"><ChevronRight size={18} /></button>
            </div>
            <p className="text-slate-500 text-xs tracking-wide pb-6 flex-shrink-0">Use ← → to navigate · S to shortlist · P to pass · Esc to exit</p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
