import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { ErrorBoundary } from '../../components/ErrorBoundary';
import CastingPanel from '../../components/agency/CastingPanel';

// ════════════════════════════════════════════════════════════
// MOCK DATA
// ════════════════════════════════════════════════════════════

const CASTINGS = [
  {
    id: 1, role: 'Lead Female Editorial', client: 'Vogue Italia', status: 'Active',
    deadline: 'Oct 18, 2025', unreviewed: 12, filledSlots: 8, totalSlots: 12,
    brief: 'Looking for high-fashion editorial talent for a 12-page spread. Dark aesthetics, movement-focused.',
    requirements: "Height: 5'9\"+, Archetype: Editorial, Location: Milan/Remote",
    moodBoard: [
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=200&fit=crop',
      'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=200&h=200&fit=crop',
      'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?w=200&h=200&fit=crop',
    ],
  },
  {
    id: 2, role: 'Spring Runway Lookbook', client: 'Balenciaga', status: 'Closing Soon',
    deadline: 'Oct 15, 2025', unreviewed: 34, filledSlots: 4, totalSlots: 10,
    brief: 'Casting for the upcoming Spring lookbook. Strong walk and unique features preferred.',
    requirements: "Height: 5'11\"+, Archetype: Runway, Available: Oct 20-25",
    moodBoard: [],
  },
  {
    id: 3, role: 'Commercial Campaign', client: 'Glossier', status: 'Active',
    deadline: 'Oct 25, 2025', unreviewed: 0, filledSlots: 0, totalSlots: 5,
    brief: 'Natural skin focused campaign. Approachable, glowing presence.',
    requirements: 'Archetype: Commercial/Lifestyle, No height req.',
    moodBoard: [],
  },
];

const INITIAL_CANDIDATES = [
  {
    id: 101, name: 'Amara Johnson', archetype: 'editorial', score: 98,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=600&fit=crop&crop=faces',
    stage: 'Applied', height: "5'10\"", location: 'Milan, IT', measurements: '34-24-35',
    portfolio: [
      { id: 1, url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=600&fit=crop' },
      { id: 2, url: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=400&h=600&fit=crop' },
      { id: 3, url: 'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?w=400&h=600&fit=crop' },
      { id: 4, url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=600&fit=crop' },
    ],
  },
  {
    id: 102, name: 'Sofia Chen', archetype: 'runway', score: 94,
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=600&fit=crop&crop=faces',
    stage: 'Applied', height: "5'11\"", location: 'Paris, FR', measurements: '33-23-34',
    portfolio: [
      { id: 1, url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=600&fit=crop' },
      { id: 2, url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=600&fit=crop' },
    ],
  },
  {
    id: 103, name: 'Zara Williams', archetype: 'commercial', score: 88,
    avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=600&fit=crop&crop=faces',
    stage: 'Shortlisted', height: "5'8\"", location: 'New York, US', measurements: '35-25-36',
    portfolio: [],
  },
  {
    id: 104, name: 'Elena Marcus', archetype: 'editorial', score: 91,
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&h=600&fit=crop&crop=faces',
    stage: 'Interview', height: "5'9\"", location: 'London, UK', measurements: '34-24-35',
    portfolio: [
      { id: 1, url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&h=600&fit=crop' },
      { id: 2, url: 'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?w=400&h=600&fit=crop' },
    ],
  },
  {
    id: 105, name: 'Mia Thompson', archetype: 'lifestyle', score: 85,
    avatar: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400&h=600&fit=crop&crop=faces',
    stage: 'Offered', height: "5'7\"", location: 'LA, US', measurements: '35-26-37',
    portfolio: [],
  },
  {
    id: 106, name: 'Jordan Lee', archetype: 'editorial', score: 96,
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&h=600&fit=crop&crop=faces',
    stage: 'Applied', height: "5'10\"", location: 'Tokyo, JP', measurements: '33-22-33',
    portfolio: [
      { id: 1, url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&h=600&fit=crop' },
      { id: 2, url: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=400&h=600&fit=crop' },
      { id: 3, url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=600&fit=crop' },
    ],
  },
  {
    id: 107, name: 'Naomi Adeyemi', archetype: 'runway', score: 92,
    avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=600&fit=crop&crop=faces',
    stage: 'Applied', height: "5'11\"", location: 'Lagos, NG', measurements: '34-23-35',
    portfolio: [],
  },
];

const STAGES = ['Applied', 'Shortlisted', 'Interview', 'Offered', 'Booked'];

// ════════════════════════════════════════════════════════════
// CANDIDATE CARD
// ════════════════════════════════════════════════════════════

function CandidateCard({ candidate, isSelected, onSelect, onOpenDrawer, inlineStyle, innerRef, attributes, listeners, mode, index }) {
  const isGallery = mode === 'gallery';
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
          src={candidate.avatar}
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
          <Sparkles size={8} className="text-[#C9A84C]" /> {candidate.score}% Match
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
  const [activeCasting, setActiveCasting] = useState(CASTINGS.length > 0 ? CASTINGS[0] : null);
  const [candidates, setCandidates] = useState(INITIAL_CANDIDATES);
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

  // Auto-collapse logic for all views
  useEffect(() => {
    setIsSidebarCollapsed(true);
  }, [viewMode]);

  const appliedCandidates = candidates.filter(c => c.stage === 'Applied');

  const setView = (mode) => { 
    setViewMode(mode); 
    localStorage.setItem('cas-view', mode);
    setIsSidebarCollapsed(true);
  };

  // Focus Review keyboard handler
  const handleFocusKey = useCallback((e) => {
    if (!focusMode || isFocusAnimating) return;
    if (e.key === 'Escape') { setFocusMode(false); return; }
    const current = appliedCandidates[focusIndex];
    if (!current) return;
    if (e.key === 's' || e.key === 'S') {
      setIsFocusAnimating(true);
      setCandidates(prev => prev.map(c => c.id === current.id ? { ...c, stage: 'Shortlisted' } : c));
      toast.success(`${current.name} moved to Shortlisted`, { action: { label: 'Undo', onClick: () => setCandidates(prev => prev.map(c => c.id === current.id ? { ...c, stage: 'Applied' } : c)) } });
      setTimeout(() => { setFocusIndex(i => Math.min(i, appliedCandidates.length - 2)); setIsFocusAnimating(false); }, 300);
    }
    if (e.key === 'p' || e.key === 'P') {
      setIsFocusAnimating(true);
      setCandidates(prev => prev.map(c => c.id === current.id ? { ...c, stage: 'Passed' } : c));
      toast(`${current.name} passed`, { action: { label: 'Undo', onClick: () => setCandidates(prev => prev.map(c => c.id === current.id ? { ...c, stage: 'Applied' } : c)) } });
      setTimeout(() => { setFocusIndex(i => Math.min(i, appliedCandidates.length - 2)); setIsFocusAnimating(false); }, 300);
    }
    if (e.key === 'ArrowRight') setFocusIndex(i => Math.min(i + 1, appliedCandidates.length - 1));
    if (e.key === 'ArrowLeft') setFocusIndex(i => Math.max(i - 1, 0));
  }, [focusMode, focusIndex, appliedCandidates, isFocusAnimating]);

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
  const handleDragOver = (e) => {
    const { active, over } = e;
    if (!over) return;
    const activeCand = candidates.find(c => c.id === active.id);
    const overId = over.id;
    if (STAGES.includes(overId)) {
      if (activeCand.stage !== overId) setCandidates(prev => prev.map(c => c.id === active.id ? { ...c, stage: overId } : c));
      return;
    }
    const overCand = candidates.find(c => c.id === overId);
    if (overCand && activeCand.stage !== overCand.stage) {
      setCandidates(prev => prev.map(c => c.id === active.id ? { ...c, stage: overCand.stage } : c));
    }
  };
  const handleDragEnd = (e) => {
    const { active, over } = e;
    setActiveId(null);
    if (over && active.id !== over.id) {
      const oldIdx = candidates.findIndex(c => c.id === active.id);
      const newIdx = candidates.findIndex(c => c.id === over.id);
      if (newIdx !== -1) {
        const moved = candidates[oldIdx];
        const dest = candidates[newIdx];
        if (moved.stage !== dest.stage) {
          toast.success(`${moved.name} → ${dest.stage}`, { action: { label: 'Undo', onClick: () => setCandidates(prev => prev.map(c => c.id === moved.id ? { ...c, stage: moved.stage } : c)) } });
        }
        setCandidates(items => arrayMove(items, oldIdx, newIdx));
      }
    }
  };

  const toggleSelect = (id) => setSelectedCandidates(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const activeDragCandidate = candidates.find(c => c.id === activeId);
  const focusCandidate = appliedCandidates[focusIndex];
  const openDrawer = (c) => { setDrawerCandidate(c); };

  const handleCandidateAction = (action, candidate, payload) => {
    if (action === 'pass') {
      setCandidates(prev =>
        prev.map(c => c.id === candidate.id ? { ...c, stage: 'Passed' } : c)
      );
      setDrawerCandidate(prev => prev ? { ...prev, stage: 'Passed' } : prev);
      toast.success(`${candidate.name} passed`);
    } else if (action === 'advance') {
      const next = STAGES[STAGES.indexOf(candidate.stage) + 1];
      if (!next) return;
      setCandidates(prev =>
        prev.map(c => c.id === candidate.id ? { ...c, stage: next } : c)
      );
      setDrawerCandidate(prev => prev ? { ...prev, stage: next } : prev);
      toast.success(`${candidate.name} advanced to ${next}`);
    } else if (action === 'stage-change') {
      const newStage = payload;
      setCandidates(prev =>
        prev.map(c => c.id === candidate.id ? { ...c, stage: newStage } : c)
      );
      setDrawerCandidate(prev => prev ? { ...prev, stage: newStage } : prev);
      toast.success(`${candidate.name} moved to ${newStage}`);
    } else if (action === 'message') {
      toast.success('Coming soon');
    }
  };

  if (!activeCasting) {
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
                className="w-full h-9 bg-[#C9A84C]/5 border border-[#C9A84C]/20 pl-10 pr-4 text-[0.8125rem] font-sans text-slate-600 focus:outline-none focus:border-[#C9A84C]/40 transition-all placeholder:text-[#C9A84C]/60"
                style={{ borderRadius: '6px' }}
              />
            </motion.div>
          )}
        </div>

        {/* Casting cards rail */}
        <div className={['flex-1 overflow-y-auto pb-8 flex flex-col gap-3 scrollbar-hide', isSidebarCollapsed ? 'px-2' : 'px-4'].join(' ')}>
          {CASTINGS.map(c => {
            const isActive = activeCasting.id === c.id;
            const progress = (c.filledSlots / c.totalSlots) * 100;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCasting(c)}
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
                        <span className="font-display text-[1rem] font-bold text-[#0f172a] leading-tight tracking-tight">{c.role}</span>
                        <span className="text-[0.6rem] font-bold text-[#C9A84C] uppercase tracking-[0.08em]">{c.client}</span>
                      </div>
                      {c.status === 'Closing Soon' && (
                        <span className="text-[0.5625rem] font-black px-2 py-0.5 rounded-[4px] tracking-tighter uppercase whitespace-nowrap bg-[#B8860B]/10 text-[#B8860B]" style={{ borderRadius: '4px' }}>
                          {c.status}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col">
                        <span className="text-[1.5rem] font-bold text-[#0f172a] leading-none tracking-tight">{c.unreviewed || 48}</span>
                        <span className="text-[0.5rem] font-black text-[#0f172a] uppercase tracking-widest mt-1.5 ml-0.5 opacity-60">Applicants</span>
                      </div>
                      <div className="w-full">
                        <div className="flex justify-between items-end mb-1.5">
                          <span className="text-[0.625rem] font-black text-slate-500 uppercase tracking-widest">{c.filledSlots} of {c.totalSlots} Slots</span>
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
                        <span className="text-[0.7rem] font-medium tracking-tight whitespace-nowrap">{c.deadline}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="relative">
                    <div className={['w-8 h-8 rounded-full flex items-center justify-center font-display text-sm font-bold transition-all duration-300', isActive ? 'bg-[#C9A84C] text-white' : 'bg-slate-100 text-slate-400'].join(' ')}>
                      {c.role.charAt(0)}
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
        </div>
      </motion.aside>

      {/* ═══ ZONE 2: Pipeline Zone ═══ */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Toolbar Area */}
        <div className="flex flex-col flex-shrink-0">
          <div className="flex items-center justify-between px-12 pt-10 pb-6 bg-transparent">
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-4xl font-bold text-[#0f172a] tracking-tight">{activeCasting.role}</h1>
              <div className="flex items-center gap-2 ml-1">
                <span className="h-px w-6 bg-[#C9A84C]" />
                <span className="text-[0.6875rem] font-bold text-[#C9A84C] uppercase tracking-[0.2em]">{activeCasting.client}</span>
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
              {STAGES.map(stage => (
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
                  <img src={activeDragCandidate.avatar} alt={activeDragCandidate.name} className="w-full h-44 object-cover rounded-lg" />
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
              {candidates.filter(c => filterStage === 'All' || c.stage === filterStage).map((cand, idx) => (
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
              {candidates.filter(c => filterStage === 'All' || c.stage === filterStage).map((cand, idx) => (
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
            <span className="[writing-mode:vertical-rl] text-[0.6875rem] font-medium uppercase tracking-widest">Brief</span>
          )}
        </button>
        <AnimatePresence>
          {briefExpanded && (
            <motion.div
              className="pl-14 pr-8 py-8 overflow-y-auto flex-1"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
            >
              <h2 className="font-display text-xl font-bold text-[#0f172a] leading-tight">{activeCasting.role}</h2>
              <div className="flex gap-2 flex-wrap mt-3 mb-8">
                <span className="px-2.5 py-1 text-[0.5625rem] font-black uppercase tracking-widest rounded bg-[#C9A84C]/8 text-[#C9A84C] border border-[#C9A84C]/10">{activeCasting.client}</span>
                <span className={['px-2.5 py-1 text-[0.5625rem] font-black uppercase tracking-widest rounded border', activeCasting.status === 'Closing Soon' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-slate-50 text-slate-400 border-slate-100'].join(' ')}>{activeCasting.status}</span>
              </div>
              {[
                { label: 'The Brief', body: activeCasting.brief },
                { label: 'Requirements', body: activeCasting.requirements },
              ].map(s => (
                <div key={s.label} className="mb-8">
                  <h4 className="font-display text-base font-bold italic text-[#0f172a] mb-3">{s.label}</h4>
                  <p className="text-[0.8125rem] text-slate-500 leading-relaxed font-medium">{s.body}</p>
                </div>
              ))}
              <div className="mb-8">
                <h4 className="font-display text-base font-bold italic text-[#0f172a] mb-3">Mood Board</h4>
                <div className="flex gap-2 flex-wrap mt-3">
                  {activeCasting.moodBoard.length > 0
                    ? activeCasting.moodBoard.map((img, i) => <img key={i} src={img} alt="Mood" className="w-20 h-20 rounded-lg object-cover hover:-translate-y-1 transition-transform duration-200 cursor-pointer" />)
                    : <div className="w-full h-14 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-300">No assets yet.</div>
                  }
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
          <motion.div
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 border border-white/5 rounded-xl px-6 py-3 flex items-center gap-5 z-50 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.3)]"
            initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
          >
            <span className="font-display text-white text-[0.9375rem] font-medium">{selectedCandidates.length} Selected</span>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-white text-xs font-medium hover:bg-white/10 transition-all duration-200">Move Stage</button>
              <button className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-white text-xs font-medium hover:bg-white/10 transition-all duration-200">Message</button>
              <button className="px-4 py-2 rounded-lg bg-gold-500 text-white text-xs font-medium hover:bg-gold-600 transition-all duration-200">Shortlist All</button>
            </div>
            <button onClick={() => setSelectedCandidates([])} className="ml-2 w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:text-white transition-colors duration-200"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Candidate Panel ═══ */}
      <AnimatePresence>
        {drawerCandidate && (
          <CastingPanel
            key={drawerCandidate.id}
            candidate={drawerCandidate}
            casting={activeCasting}
            onClose={() => setDrawerCandidate(null)}
            onAction={handleCandidateAction}
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
                  src={focusCandidate.avatar}
                  alt={focusCandidate.name}
                  className="h-full min-h-0 flex-shrink-0 object-cover rounded-lg shadow-[0_20px_40px_-10px_rgba(0,0,0,0.4)]"
                  style={{ width: 'min(440px, calc((100vh - 240px) * 0.66))' }}
                />
                <div className="flex flex-col gap-4 pt-10 flex-1">
                  <h2 className="font-display text-5xl font-normal text-white leading-tight tracking-tight">{focusCandidate.name}</h2>
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-widest rounded bg-gold-500/8 text-gold-500 border border-gold-500/20">{focusCandidate.archetype}</span>
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-gold-500 bg-gold-500/8 px-3 py-1 rounded-full"><Sparkles size={10} /> {focusCandidate.score}% Match</span>
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
                onClick={() => { setCandidates(prev => prev.map(c => c.id === focusCandidate.id ? { ...c, stage: 'Passed' } : c)); toast(`${focusCandidate.name} passed`); setTimeout(() => setFocusIndex(i => Math.min(i, appliedCandidates.length - 2)), 300); }}
                aria-label="Pass candidate"
                className="min-w-[200px] flex-1 py-4 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-sm font-medium flex items-center justify-center gap-3 hover:bg-white/10 hover:text-white transition-all duration-200"
              >
                Pass <kbd className="inline-flex items-center justify-center w-[22px] h-[22px] rounded bg-white/10 text-[0.625rem] font-mono">P</kbd>
              </button>
              <button
                onClick={() => { setCandidates(prev => prev.map(c => c.id === focusCandidate.id ? { ...c, stage: 'Shortlisted' } : c)); toast.success(`${focusCandidate.name} → Shortlisted`); setTimeout(() => setFocusIndex(i => Math.min(i, appliedCandidates.length - 2)), 300); }}
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
              <form className="flex flex-col gap-6" onSubmit={e => { e.preventDefault(); setShowNewForm(false); toast.success('New casting created!'); }}>
                {[
                  { label: 'Role Name', type: 'text', placeholder: 'e.g. FW25 Runway Lead' },
                  { label: 'Client', type: 'text', placeholder: 'e.g. Prada' },
                  { label: 'Deadline', type: 'date', placeholder: '' },
                ].map(({ label, type, placeholder }) => (
                  <div key={label} className="flex flex-col gap-2">
                    <label className="text-[0.625rem] font-semibold uppercase tracking-widest text-slate-500">{label}</label>
                    <input type={type} placeholder={placeholder} className="px-4 py-3.5 bg-[#faf9f7] border border-transparent rounded-lg text-sm font-sans text-slate-800 transition-all duration-200 focus:outline-none focus:border-gold-500 focus:bg-white focus:shadow-[0_0_0_4px_rgba(201,165,90,0.1)]" />
                  </div>
                ))}
                <div className="flex flex-col gap-2">
                  <label className="text-[0.625rem] font-semibold uppercase tracking-widest text-slate-500">Brief</label>
                  <textarea placeholder="Describe the requirements..." rows={4} className="px-4 py-3.5 bg-[#faf9f7] border border-transparent rounded-lg text-sm font-sans text-slate-800 resize-none transition-all duration-200 focus:outline-none focus:border-gold-500 focus:bg-white focus:shadow-[0_0_0_4px_rgba(201,165,90,0.1)]" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[0.625rem] font-semibold uppercase tracking-widest text-slate-500">Mood Board Assets</label>
                  <div className="h-[120px] border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center gap-2 text-slate-400 text-sm cursor-pointer bg-[#faf9f7] hover:border-gold-500 hover:text-gold-500 hover:bg-gold-500/5 transition-all duration-200">
                    <Plus size={24} />
                    <span>Upload or drag mood board images</span>
                  </div>
                </div>
                <button type="submit" className="mt-4 w-full py-4 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-all duration-200 hover:-translate-y-0.5 font-sans">Create Role</button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
