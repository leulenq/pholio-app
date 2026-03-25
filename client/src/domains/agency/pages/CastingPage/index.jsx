import React, { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Plus, LayoutGrid, Rows, Image as ImageIcon,
  X, Sparkles, ChevronRight, ChevronLeft, Eye,
  Search, Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext, closestCenter, KeyboardSensor,
  PointerSensor, useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext,
  sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ErrorBoundary } from '../../../../components/ErrorBoundary';
import TalentDetailPanel from '../../components/TalentDetailPanel';
import BulkActionToolbar from '../../components/BulkActionToolbar';
import {
  bulkUpdateCastingApplicationStage,
  createBoard,
  getBoards,
  getCastingBoardPipeline,
  updateCastingApplicationStage,
} from '../../api/agency';

// ════════════════════════════════════════════════════════════
// MOCK DATA
// ════════════════════════════════════════════════════════════

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

// Maps a casting candidate to the TalentPanel talent shape.
// Casting pages use mock data so profileId/applicationId are numeric stubs —
// Zone B will show error+retry states until real IDs are wired up.
const toCastingTalentObject = (c) => !c ? null : ({
  id:            c.profileId || c.id,
  profileId:     c.profileId || c.id,
  applicationId: c.applicationId || c.id,
  name:          c.name,
  photo:         formatAssetUrl(c.avatar) || buildAvatarFallback(c.name),
  type:          c.archetype || 'editorial',
  status:        c.stage?.toLowerCase() || 'available',
  location:      c.location || null,
});

// ════════════════════════════════════════════════════════════
// CANDIDATE CARD
// ════════════════════════════════════════════════════════════

function CandidateCard({ candidate, isSelected, onSelect, onOpenDrawer, inlineStyle, innerRef, attributes, listeners, mode, index }) {
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
        
        {/* Film Grain Texture Overlay */}
        <div 
          aria-hidden="true" 
          className="absolute inset-0 pointer-events-none mix-blend-soft-light opacity-[0.12]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: '150px 150px'
          }}
        />

        {/* Cinematic Gradient */}
        <div className={[
          'absolute inset-0 transition-opacity duration-300',
          isGallery ? 'bg-gradient-to-t from-slate-900/95 via-slate-900/40 to-transparent opacity-100' : 'bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent opacity-0 group-hover:opacity-100'
        ].join(' ')} />

        {/* Score badge */}
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/10 backdrop-blur-md border border-white/10 text-white text-[9px] font-bold px-2 py-1 rounded-full shadow-sm">
          <Sparkles size={8} className="text-[#C9A84C]" /> {scoreLabel} Match
        </div>


        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={e => { e.stopPropagation(); onSelect(candidate.id); }}
          onPointerDown={e => e.stopPropagation()}
          aria-label={`Select ${candidate.name}`}
          className={[
            'absolute top-3 left-3 w-4.5 h-4.5 rounded border-white/20 bg-black/20 accent-[#C9A84C] transition-opacity z-10 cursor-pointer',
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          ].join(' ')}
        />

        {/* Actions Overlay */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
          <button
            title="View profile"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onOpenDrawer(candidate); }}
            className="w-10 h-10 rounded-full border border-white/20 bg-white/10 backdrop-blur-md text-white flex items-center justify-center hover:bg-[#C9A84C] hover:border-transparent hover:scale-110 transition-all duration-200"
          >
            <Eye size={16} />
          </button>
        </div>

        {/* Names (Gallery Mode) */}
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

// ════════════════════════════════════════════════════════════
// STAGE FILTER BAR
// ════════════════════════════════════════════════════════════

function StageFilter({ candidates, activeFilter, onFilterChange }) {
  const options = ['All', ...STAGES];
  return (
    <div className="flex gap-8">
      {options.map(s => {
        const isActive = activeFilter === s;
        const count = s === 'All' ? candidates.length : candidates.filter(c => c.stage === s).length;
        return (
          <button
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

// ════════════════════════════════════════════════════════════
// MAIN PAGE WRAPPER
// ════════════════════════════════════════════════════════════

export default function CastingPageWrapper() {
  return (
    <ErrorBoundary>
      <CastingPage />
    </ErrorBoundary>
  );
}

function CastingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeCastingId, setActiveCastingId] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('cas-view') || 'kanban');
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [drawerCandidate, setDrawerCandidate] = useState(null);
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [isFocusAnimating, setIsFocusAnimating] = useState(false);
  const [filterStage, setFilterStage] = useState('All');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(viewMode === 'kanban');
  const [castingSearch, setCastingSearch] = useState('');
  const [newRoleForm, setNewRoleForm] = useState({
    name: '',
    client_name: '',
    closes_at: '',
    target_slots: '',
    description: '',
  });

  const boardsQuery = useQuery({
    queryKey: ['agency-casting-boards'],
    queryFn: getBoards,
  });

  const boards = Array.isArray(boardsQuery.data) ? boardsQuery.data : [];
  const filteredBoards = boards.filter((board) => {
    if (!castingSearch.trim()) return true;
    const haystack = `${board.name || ''} ${board.client_name || ''}`.toLowerCase();
    return haystack.includes(castingSearch.trim().toLowerCase());
  });

  const pipelineQuery = useQuery({
    queryKey: ['agency-casting-board-pipeline', activeCastingId],
    queryFn: () => getCastingBoardPipeline(activeCastingId),
    enabled: !!activeCastingId,
  });

  const activeCasting =
    boards.find((board) => board.id === activeCastingId) || pipelineQuery.data?.board || null;
  const displayedStages = pipelineQuery.data?.stages || STAGES;

  useEffect(() => {
    if (!boards.length) {
      setActiveCastingId(null);
      return;
    }
    if (!activeCastingId || !boards.some((board) => board.id === activeCastingId)) {
      setActiveCastingId(boards[0].id);
    }
  }, [boards, activeCastingId]);

  useEffect(() => {
    setCandidates(Array.isArray(pipelineQuery.data?.candidates) ? pipelineQuery.data.candidates : []);
    setSelectedCandidates((prev) =>
      prev.filter((id) => (pipelineQuery.data?.candidates || []).some((candidate) => candidate.id === id))
    );
    setDrawerCandidate((prev) => {
      if (!prev) return prev;
      return (pipelineQuery.data?.candidates || []).find((candidate) => candidate.id === prev.id) || null;
    });
  }, [pipelineQuery.data]);

  useEffect(() => {
    if (!focusMode) return;
    const nextAppliedCandidates = candidates.filter((candidate) => candidate.stage === 'Applied');
    if (!nextAppliedCandidates.length) {
      setFocusMode(false);
      return;
    }
    if (focusIndex > nextAppliedCandidates.length - 1) {
      setFocusIndex(nextAppliedCandidates.length - 1);
    }
  }, [candidates, focusMode, focusIndex]);

  const invalidateCastingData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['agency-casting-boards'] }),
      queryClient.invalidateQueries({ queryKey: ['agency-casting-board-pipeline', activeCastingId] }),
    ]);
  }, [queryClient, activeCastingId]);

  const updateStageMutation = useMutation({
    mutationFn: ({ applicationId, stage }) =>
      updateCastingApplicationStage(applicationId, { stage }),
    onSuccess: async () => {
      await invalidateCastingData();
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to update candidate stage');
      pipelineQuery.refetch();
    },
  });

  const bulkUpdateStageMutation = useMutation({
    mutationFn: ({ applicationIds, stage }) =>
      bulkUpdateCastingApplicationStage(applicationIds, { stage }),
    onSuccess: async (_, variables) => {
      await invalidateCastingData();
      setSelectedCandidates([]);
      toast.success(`${variables.applicationIds.length} candidate${variables.applicationIds.length === 1 ? '' : 's'} moved to ${variables.stage}`);
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to update selected candidates');
      pipelineQuery.refetch();
    },
  });

  const createBoardMutation = useMutation({
    mutationFn: createBoard,
    onSuccess: async (board) => {
      await queryClient.invalidateQueries({ queryKey: ['agency-casting-boards'] });
      setActiveCastingId(board.id);
      setShowNewForm(false);
      setNewRoleForm({
        name: '',
        client_name: '',
        closes_at: '',
        target_slots: '',
        description: '',
      });
      toast.success('New casting created');
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to create casting');
    },
  });

  // Auto-collapse logic for all views
  useEffect(() => {
    setIsSidebarCollapsed(true);
  }, [viewMode]);

  const appliedCandidates = candidates.filter(c => c.stage === 'Applied');
  const visibleCandidates = candidates.filter((candidate) => filterStage === 'All' || candidate.stage === filterStage);
  const focusCandidate = appliedCandidates[focusIndex] || null;
  const activeDragCandidate = candidates.find((candidate) => candidate.id === activeId) || null;

  const setView = (mode) => { 
    setViewMode(mode); 
    localStorage.setItem('cas-view', mode);
    setIsSidebarCollapsed(true);
  };

  const formatDeadline = (value) => {
    if (!value) return 'Open-ended';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Open-ended';
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getBoardStatus = (board) => {
    if (!board?.closes_at) return 'Active';
    const closesAt = new Date(board.closes_at);
    if (Number.isNaN(closesAt.getTime())) return 'Active';
    const now = new Date();
    if (closesAt < now) return 'Closed';
    const diffDays = Math.ceil((closesAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 7 ? 'Closing Soon' : 'Active';
  };

  const getBoardProgress = (board) => {
    const totalSlots = Number(board?.target_slots) || Number(board?.application_count) || 1;
    const filledSlots = Number(board?.booked_count) || 0;
    return Math.max(0, Math.min(100, (filledSlots / totalSlots) * 100));
  };

  const updateLocalCandidateStage = useCallback((candidateId, stage) => {
    setCandidates((prev) => prev.map((candidate) => (
      candidate.id === candidateId ? { ...candidate, stage } : candidate
    )));
    setDrawerCandidate((prev) => (prev && prev.id === candidateId ? { ...prev, stage } : prev));
  }, []);

  const commitCandidateStage = useCallback((candidate, stage, successMessage) => {
    if (!candidate?.applicationId || candidate.stage === stage) return;
    const previousStage = candidate.stage;
    updateLocalCandidateStage(candidate.id, stage);
    updateStageMutation.mutate(
      { applicationId: candidate.applicationId, stage },
      {
        onSuccess: async () => {
          if (successMessage) {
            toast.success(successMessage);
          }
          await invalidateCastingData();
        },
        onError: (error) => {
          updateLocalCandidateStage(candidate.id, previousStage);
          toast.error(error?.message || 'Failed to update candidate stage');
        },
      },
    );
  }, [invalidateCastingData, updateLocalCandidateStage, updateStageMutation]);

  // Focus Review keyboard handler
  const handleFocusKey = useCallback((e) => {
    if (!focusMode || isFocusAnimating) return;
    if (e.key === 'Escape') { setFocusMode(false); return; }
    const current = appliedCandidates[focusIndex];
    if (!current) return;
    if (e.key === 's' || e.key === 'S') {
      setIsFocusAnimating(true);
      commitCandidateStage(current, 'Shortlisted', `${current.name} moved to Shortlisted`);
      setTimeout(() => { setFocusIndex(i => Math.min(i, appliedCandidates.length - 2)); setIsFocusAnimating(false); }, 300);
    }
    if (e.key === 'p' || e.key === 'P') {
      setIsFocusAnimating(true);
      commitCandidateStage(current, 'Passed', `${current.name} passed`);
      setTimeout(() => { setFocusIndex(i => Math.min(i, appliedCandidates.length - 2)); setIsFocusAnimating(false); }, 300);
    }
    if (e.key === 'ArrowRight') setFocusIndex(i => Math.min(i + 1, appliedCandidates.length - 1));
    if (e.key === 'ArrowLeft') setFocusIndex(i => Math.max(i - 1, 0));
  }, [focusMode, focusIndex, appliedCandidates, isFocusAnimating, commitCandidateStage]);

  useEffect(() => {
    window.addEventListener('keydown', handleFocusKey);
    return () => window.removeEventListener('keydown', handleFocusKey);
  }, [handleFocusKey]);

  // DnD plumbing
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const handleDragStart = (e) => setActiveId(e.active.id);
  const handleDragOver = () => {};
  const handleDragEnd = (e) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const moved = candidates.find((candidate) => candidate.id === active.id);
    if (!moved) return;

    if (displayedStages.includes(over.id)) {
      commitCandidateStage(moved, over.id, `${moved.name} moved to ${over.id}`);
      return;
    }

    const destinationCandidate = candidates.find((candidate) => candidate.id === over.id);
    if (destinationCandidate && destinationCandidate.stage !== moved.stage) {
      commitCandidateStage(moved, destinationCandidate.stage, `${moved.name} moved to ${destinationCandidate.stage}`);
    }
  };

  const toggleSelect = (id) => setSelectedCandidates(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const openDrawer = (c) => { setDrawerCandidate(c); };

  const handleCandidateAction = (action, candidate, payload) => {
    if (action === 'pass') {
      commitCandidateStage(candidate, 'Passed', `${candidate.name} passed`);
    } else if (action === 'advance') {
      const next = displayedStages[displayedStages.indexOf(candidate.stage) + 1];
      if (!next) return;
      commitCandidateStage(candidate, next, `${candidate.name} advanced to ${next}`);
    } else if (action === 'stage-change') {
      const newStage = payload;
      commitCandidateStage(candidate, newStage, `${candidate.name} moved to ${newStage}`);
    } else if (action === 'message') {
      navigate('/dashboard/agency/messages');
    }
  };

  // Translates TalentPanel's generic onAction events into casting-specific actions.
  const handleTalentPanelAction = (action, talent) => {
    const candidate = candidates.find(c => c.id === talent.id);
    if (!candidate) return;
    switch (action) {
      case 'accept':    return handleCandidateAction('advance', candidate);
      case 'shortlist': return handleCandidateAction('stage-change', candidate, 'Shortlisted');
      case 'reject':    return handleCandidateAction('pass', candidate);
      case 'message':   return handleCandidateAction('message', candidate);
      default:          toast.success('Coming soon');
    }
  };

  const submitNewRole = (e) => {
    e.preventDefault();
    createBoardMutation.mutate({
      name: newRoleForm.name,
      client_name: newRoleForm.client_name,
      closes_at: newRoleForm.closes_at || null,
      target_slots: newRoleForm.target_slots || null,
      description: newRoleForm.description || null,
    });
  };

  if (boardsQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3 font-sans">
        <h2 className="font-display text-2xl font-medium text-slate-800">Loading castings</h2>
        <p className="text-slate-400 text-sm">Fetching roles and candidate pipeline.</p>
      </div>
    );
  }

  if (boardsQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-4 font-sans">
        <h2 className="font-display text-2xl font-medium text-slate-800">Casting unavailable</h2>
        <p className="text-slate-400 text-sm">{boardsQuery.error?.message || 'Failed to load castings.'}</p>
        <button
          onClick={() => boardsQuery.refetch()}
          className="px-5 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-all duration-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!activeCasting && !boards.length) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-4 font-sans">
        <h2 className="font-display text-2xl font-medium text-slate-800">No Active Castings</h2>
        <p className="text-slate-400 text-sm">Create a new casting to start managing your pipeline.</p>
        <button 
          onClick={() => setShowNewForm(true)} 
          aria-label="Create new casting"
          className="flex items-center gap-2 mt-2 px-5 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-all duration-200 hover:-translate-y-0.5"
        >
          <Plus size={15} /> New Role
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full font-sans text-[#0f172a]" style={{ background: 'linear-gradient(135deg, #faf9f7 0%, #f5f4f2 100%)' }}>

      {/* ═══ Inner flex row: Rail + Pipeline + Brief ═══ */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">

      {/* ═══ ZONE 1: Casting Rail ═══ */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarCollapsed ? 64 : 320 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex-shrink-0 bg-transparent flex flex-col relative shadow-[8px_0_32px_rgba(0,0,0,0.06)] z-20"
      >
        {/* Sidebar Header */}
        <div className={['px-6 py-8 flex flex-col gap-6 overflow-hidden', isSidebarCollapsed ? 'items-center' : ''].join(' ')}>
          <div className="flex items-center justify-between w-full">
            {!isSidebarCollapsed && (
              <h1 className="font-display text-[1.25rem] font-bold text-[#0f172a] tracking-tight whitespace-nowrap">Castings</h1>
            )}
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className={['p-2 text-[#C9A84C] hover:bg-[#C9A84C]/10 rounded-lg transition-colors', isSidebarCollapsed ? 'mx-auto' : ''].join(' ')}
            >
              {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
            {!isSidebarCollapsed && (
              <button onClick={() => setShowNewForm(true)}
                className="px-3 py-1 bg-transparent text-[#C9A84C] text-[0.75rem] font-semibold border border-[#C9A84C] hover:bg-[#C9A84C] hover:text-white transition-all duration-200"
                style={{ borderRadius: '6px' }}
              >
                <Plus size={12} strokeWidth={3} className="inline mr-1" /> NEW
              </button>
            )}
          </div>
          
          {/* Search bar */}
          {!isSidebarCollapsed && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative group"
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C9A84C]/40" size={14} />
              <input 
                type="text" 
                placeholder="Search roles..." 
                value={castingSearch}
                onChange={(e) => setCastingSearch(e.target.value)}
                className="w-full h-9 bg-[#C9A84C]/5 border border-[#C9A84C]/20 pl-10 pr-4 text-[0.8125rem] font-sans text-slate-600 focus:outline-none focus:border-[#C9A84C]/40 transition-all placeholder:text-[#C9A84C]/60"
                style={{ borderRadius: '6px' }}
              />
            </motion.div>
          )}
        </div>

        {/* Casting cards rail */}
        <div className={['flex-1 overflow-y-auto pb-8 flex flex-col gap-3 scrollbar-hide', isSidebarCollapsed ? 'px-2' : 'px-4'].join(' ')}>
          {filteredBoards.map(c => {
            const isActive = activeCasting?.id === c.id;
            const progress = getBoardProgress(c);
            const boardStatus = getBoardStatus(c);
            const totalSlots = Number(c.target_slots) || Number(c.application_count) || 0;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCastingId(c.id)}
                className={[
                  'group w-full text-left transition-all duration-300 relative flex flex-col gap-6 overflow-hidden',
                  isSidebarCollapsed ? 'p-3 items-center' : 'p-6',
                  isActive
                    ? 'bg-white shadow-[0_8px_32px_rgba(0,0,0,0.12)] border-l-[3px] border-l-[#C9A84C] z-10 scale-[1.02]'
                    : 'bg-transparent hover:bg-black/[0.02] border-l-[3px] border-l-transparent',
                ].join(' ')}
                style={{ borderRadius: isSidebarCollapsed ? '10px' : '12px' }}
              >
                {!isSidebarCollapsed ? (
                  <>
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="font-display text-[1rem] font-bold text-[#0f172a] leading-tight tracking-tight">{c.name}</span>
                        <span className="text-[0.6rem] font-bold text-[#C9A84C] uppercase tracking-[0.08em]">{c.client_name || 'Internal Casting'}</span>
                      </div>
                      {boardStatus === 'Closing Soon' && (
                        <span className="text-[0.5625rem] font-black px-2 py-0.5 rounded-[4px] tracking-tighter uppercase whitespace-nowrap bg-[#B8860B]/10 text-[#B8860B]" style={{ borderRadius: '4px' }}>
                          {boardStatus}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col">
                        <span className="text-[1.5rem] font-bold text-[#0f172a] leading-none tracking-tight">{c.submitted_count || 0}</span>
                        <span className="text-[0.5rem] font-black text-[#0f172a] uppercase tracking-widest mt-1.5 ml-0.5 opacity-60">Applied</span>
                      </div>
                      <div className="w-full">
                        <div className="flex justify-between items-end mb-1.5">
                          <span className="text-[0.625rem] font-black text-slate-500 uppercase tracking-widest">{c.booked_count || 0} of {totalSlots} Slots</span>
                          <span className="text-[0.625rem] font-black text-[#C9A84C]">{Math.round(progress)}%</span>
                        </div>
                        <div className="w-full bg-black/[0.08] overflow-hidden" style={{ height: '3px', borderRadius: '100px' }}>
                          <motion.div 
                            className="h-full bg-[#C9A84C] rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-slate-400/60 mt-1">
                        <Calendar size={11} />
                        <span className="text-[0.7rem] font-medium tracking-tight whitespace-nowrap">{formatDeadline(c.closes_at)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="relative">
                    <div className={['w-8 h-8 rounded-full flex items-center justify-center font-display text-sm font-bold transition-all duration-300', isActive ? 'bg-[#C9A84C] text-white' : 'bg-slate-100 text-slate-400'].join(' ')}>
                      {(c.name || '?').charAt(0)}
                    </div>
                    {isActive && (
                      <motion.div 
                        layoutId="active-dot"
                        className="absolute -right-1 -top-1 w-2.5 h-2.5 bg-white border-2 border-[#C9A84C] rounded-full"
                      />
                    )}
                  </div>
                )}
              </button>
            );
          })}
          {filteredBoards.length === 0 && !isSidebarCollapsed && (
            <div className="px-2 pt-2 text-xs text-slate-400">No castings match that search.</div>
          )}
        </div>
      </motion.aside>

      {/* ═══ ZONE 2: Pipeline Zone ═══ */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Toolbar Area */}
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
          
          {/* Filters & View Toggles */}
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
                  key={id}
                  onClick={() => setView(id)}
                  title={label}
                  className={[
                    'p-2 rounded-lg transition-all duration-300',
                    viewMode === id 
                      ? 'bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)] text-slate-800' 
                      : 'text-slate-400 hover:bg-white/50 hover:text-slate-600'
                  ].join(' ')}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Kanban View ─── */}
        {viewMode === 'kanban' && (
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            <div className="flex gap-5 p-12 py-10 overflow-x-auto flex-1 items-start">
              {displayedStages.map(stage => (
                <SortableContext key={stage} id={stage}
                  items={candidates.filter(c => c.stage === stage).map(c => c.id)}
                  strategy={verticalListSortingStrategy}>
                  <div className="w-[260px] flex-shrink-0 flex flex-col gap-4" id={stage}>
                    {/* Column header */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-widest">{stage}</span>
                      <span className="font-display text-[0.875rem] font-medium text-slate-300 italic">
                        {candidates.filter(c => c.stage === stage).length}
                      </span>
                    </div>
                    {/* Review All button (Applied only) */}
                    {stage === 'Applied' && appliedCandidates.length > 0 && (
                      <button
                        onClick={() => { setFocusIndex(0); setFocusMode(true); }}
                        className="w-full py-2.5 text-xs font-semibold uppercase tracking-wider text-gold-500 bg-gold-500/8 border border-gold-500/30 rounded-lg hover:bg-gold-500 hover:text-white transition-all duration-200"
                      >
                        ▶ Review All
                      </button>
                    )}
                    {/* Cards */}
                    <div className="flex flex-col gap-4 min-h-[120px]">
                      {candidates.filter(c => c.stage === stage).map(cand => (
                        <SortableCandidateCard key={cand.id} candidate={cand}
                          isSelected={selectedCandidates.includes(cand.id)}
                          onSelect={toggleSelect} onOpenDrawer={openDrawer} />
                      ))}
                      {candidates.filter(c => c.stage === stage).length === 0 && (
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

        {/* ─── Grid View ─── */}
        {viewMode === 'grid' && (
          <div className="flex-1 overflow-y-auto px-12 py-10">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
              {visibleCandidates.map((cand, idx) => (
                <CandidateCard key={cand.id} candidate={cand} index={idx}
                  isSelected={selectedCandidates.includes(cand.id)}
                  onSelect={toggleSelect} onOpenDrawer={openDrawer} />
              ))}
            </div>
          </div>
        )}

        {/* ─── Gallery View ─── */}
        {viewMode === 'gallery' && (
          <div className="flex-1 overflow-y-auto px-12 py-10">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
              {visibleCandidates.map((cand, idx) => (
                <CandidateCard key={cand.id} candidate={cand} mode="gallery" index={idx}
                  isSelected={selectedCandidates.includes(cand.id)}
                  onSelect={toggleSelect} onOpenDrawer={openDrawer} />
              ))}
            </div>
          </div>
        )}
      </main>



      <aside
        className={[
          'flex-shrink-0 bg-white border-l border-slate-100 flex flex-col relative transition-all duration-300 ease-in-out overflow-hidden',
          briefExpanded ? 'w-[360px] shadow-[0_0_60px_-15px_rgba(0,0,0,0.12)] z-20' : 'w-11',
        ].join(' ')}
      >
        <button
          onClick={() => setBriefExpanded(v => !v)}
          className="absolute left-0 top-0 w-11 h-full border-r border-slate-100 flex flex-col items-center justify-start pt-6 gap-4 text-slate-500 hover:text-[#0f172a] transition-colors duration-200 z-10 bg-white flex-shrink-0"
        >
          {briefExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          {!briefExpanded && (
            <span className="[writing-mode:vertical-rl] text-[0.75rem] font-bold uppercase tracking-[0.2em] text-slate-600">Brief</span>
          )}
        </button>
        <AnimatePresence>
          {briefExpanded && (
            <motion.div
              className="pl-14 pr-8 py-8 overflow-y-auto flex-1"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
            >
              <h2 className="font-display text-xl font-bold text-[#0f172a] leading-tight">{activeCasting?.name}</h2>
              <div className="flex gap-2 flex-wrap mt-3 mb-8">
                <span className="px-2.5 py-1 text-[0.5625rem] font-black uppercase tracking-widest rounded bg-[#C9A84C]/8 text-[#C9A84C] border border-[#C9A84C]/10">{activeCasting?.client_name || 'Internal Casting'}</span>
                <span className={['px-2.5 py-1 text-[0.5625rem] font-black uppercase tracking-widest rounded border', getBoardStatus(activeCasting) === 'Closing Soon' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-slate-50 text-slate-400 border-slate-100'].join(' ')}>{getBoardStatus(activeCasting)}</span>
              </div>
              {[
                { label: 'The Brief', body: activeCasting?.description || 'No creative brief has been added yet.' },
                { label: 'Delivery Window', body: `Casting closes ${formatDeadline(activeCasting?.closes_at)}.` },
              ].map(s => (
                <div key={s.label} className="mb-8">
                  <h4 className="font-display text-base font-bold italic text-[#0f172a] mb-3">{s.label}</h4>
                  <p className="text-sm text-slate-700 leading-relaxed font-medium">{s.body}</p>
                </div>
              ))}
              <div className="mb-8">
                <h4 className="font-display text-base font-bold italic text-[#0f172a] mb-3">Pipeline Snapshot</h4>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {displayedStages.map((stage) => (
                    <div key={stage} className="rounded-lg border border-slate-100 bg-[#faf9f7] px-4 py-3">
                      <div className="text-[0.625rem] font-black uppercase tracking-widest text-slate-400">{stage}</div>
                      <div className="mt-2 font-display text-2xl text-[#0f172a]">
                        {candidates.filter((candidate) => candidate.stage === stage).length}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      </div>{/* end inner flex row */}

      {/* ═══ Bulk Action Bar ═══ */}
      <AnimatePresence>
        {selectedCandidates.length > 0 && (
          <BulkActionToolbar
            selectedCount={selectedCandidates.length}
            context="casting"
            onAction={(action) => {
              const appIds = candidates.filter(c => selectedCandidates.includes(c.id)).map(c => c.applicationId);
              if (action === 'move-stage') {
                bulkUpdateStageMutation.mutate({ applicationIds: appIds, stage: 'Shortlisted' });
              } else if (action === 'remove') {
                bulkUpdateStageMutation.mutate({ applicationIds: appIds, stage: 'Passed' });
              }
            }}
            onClearSelection={() => setSelectedCandidates([])}
          />
        )}
      </AnimatePresence>

      {/* ═══ Candidate Panel ═══ */}
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

      {/* ═══ Focus Review Mode ═══ */}
      <AnimatePresence>
        {focusMode && focusCandidate && (
          <motion.div
            className="fixed inset-0 bg-gradient-to-br from-slate-800 to-slate-900 z-[100] flex flex-col items-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            {/* Top bar */}
            <div className="w-full flex justify-between items-center px-10 py-6 flex-shrink-0">
              <button onClick={() => setFocusMode(false)} className="flex items-center gap-2 text-slate-400 text-sm font-medium hover:text-white transition-colors duration-200"><X size={16} /> Back to Pipeline</button>
              <span className="font-display text-slate-400 text-sm italic">{focusIndex + 1} / {appliedCandidates.length}</span>
            </div>
            {/* Candidate card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={focusCandidate.id}
                className="flex-1 max-w-[1000px] w-full flex gap-16 px-10 pb-10 items-start overflow-hidden"
                initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }}
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
            {/* HUD */}
            <div className="flex items-center gap-4 px-8 pb-8 flex-shrink-0">
              <button onClick={() => setFocusIndex(i => Math.max(i - 1, 0))} disabled={focusIndex === 0} aria-label="Previous candidate" className="w-12 h-12 rounded-full bg-white/5 border border-white/10 text-slate-400 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed"><ChevronLeft size={18} /></button>
              <button
                onClick={() => { commitCandidateStage(focusCandidate, 'Passed', `${focusCandidate.name} passed`); setTimeout(() => setFocusIndex(i => Math.min(i, appliedCandidates.length - 2)), 300); }}
                aria-label="Pass candidate"
                className="min-w-[200px] flex-1 py-4 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-sm font-medium flex items-center justify-center gap-3 hover:bg-white/10 hover:text-white transition-all duration-200"
              >
                Pass <kbd className="inline-flex items-center justify-center w-[22px] h-[22px] rounded bg-white/10 text-[0.625rem] font-mono">P</kbd>
              </button>
              <button
                onClick={() => { commitCandidateStage(focusCandidate, 'Shortlisted', `${focusCandidate.name} → Shortlisted`); setTimeout(() => setFocusIndex(i => Math.min(i, appliedCandidates.length - 2)), 300); }}
                aria-label="Shortlist candidate"
                className="min-w-[200px] flex-1 py-4 rounded-lg bg-gold-500 text-white text-sm font-medium flex items-center justify-center gap-3 hover:bg-gold-600 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(201,165,90,0.3)]"
              >
                Shortlist <kbd className="inline-flex items-center justify-center w-[22px] h-[22px] rounded bg-white/10 text-[0.625rem] font-mono">S</kbd>
              </button>
              <button onClick={() => setFocusIndex(i => Math.min(i + 1, appliedCandidates.length - 1))} disabled={focusIndex === appliedCandidates.length - 1} aria-label="Next candidate" className="w-12 h-12 rounded-full bg-white/5 border border-white/10 text-slate-400 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed"><ChevronRight size={18} /></button>
            </div>
            <p className="text-slate-500 text-xs tracking-wide pb-6 flex-shrink-0">Use ← → to navigate · S to shortlist · P to pass · Esc to exit</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ New Role Slide-over ═══ */}
      <AnimatePresence>
        {showNewForm && (
          <>
            <motion.div className="fixed bg-slate-900/40 backdrop-blur-sm z-40" style={{ top: 0, right: 0, bottom: 0, left: 0 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowNewForm(false)} />
            <motion.div
              className="fixed w-[480px] h-full bg-white z-50 p-10 overflow-y-auto shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)]"
              style={{ top: 0, right: 0 }}
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            >
              <div className="flex justify-between items-center mb-10">
                <h2 className="font-display text-3xl font-normal text-slate-800 tracking-tight">Create New Role</h2>
                <button onClick={() => setShowNewForm(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 hover:text-slate-800 transition-all duration-200"><X size={18} /></button>
              </div>
              <form className="flex flex-col gap-6" onSubmit={submitNewRole}>
                {[
                  { key: 'name', label: 'Role Name', type: 'text', placeholder: 'e.g. FW25 Runway Lead' },
                  { key: 'client_name', label: 'Client', type: 'text', placeholder: 'e.g. Prada' },
                  { key: 'closes_at', label: 'Deadline', type: 'date', placeholder: '' },
                  { key: 'target_slots', label: 'Target Slots', type: 'number', placeholder: 'e.g. 12' },
                ].map(({ key, label, type, placeholder }) => (
                  <div key={label} className="flex flex-col gap-2">
                    <label className="text-[0.625rem] font-semibold uppercase tracking-widest text-slate-500">{label}</label>
                    <input
                      type={type}
                      placeholder={placeholder}
                      value={newRoleForm[key]}
                      onChange={(e) => setNewRoleForm((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="px-4 py-3.5 bg-[#faf9f7] border border-transparent rounded-lg text-sm font-sans text-slate-800 transition-all duration-200 focus:outline-none focus:border-gold-500 focus:bg-white focus:shadow-[0_0_0_4px_rgba(201,165,90,0.1)]"
                      required={key === 'name'}
                    />
                  </div>
                ))}
                <div className="flex flex-col gap-2">
                  <label className="text-[0.625rem] font-semibold uppercase tracking-widest text-slate-500">Brief</label>
                  <textarea
                    placeholder="Describe the requirements..."
                    rows={4}
                    value={newRoleForm.description}
                    onChange={(e) => setNewRoleForm((prev) => ({ ...prev, description: e.target.value }))}
                    className="px-4 py-3.5 bg-[#faf9f7] border border-transparent rounded-lg text-sm font-sans text-slate-800 resize-none transition-all duration-200 focus:outline-none focus:border-gold-500 focus:bg-white focus:shadow-[0_0_0_4px_rgba(201,165,90,0.1)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={createBoardMutation.isPending}
                  className="mt-4 w-full py-4 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-all duration-200 hover:-translate-y-0.5 font-sans disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {createBoardMutation.isPending ? 'Creating...' : 'Create Role'}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
