import React, { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBoundary } from '../../../../shared/components/ErrorBoundary';
import {
  bulkUpdateCastingApplicationStage,
  createBoard,
  getBoards,
  getCastingBoardPipeline,
  updateCastingApplicationStage,
} from '../../api/agency';
import CastingCallBuilder from './CastingCallBuilder';
import CastingMatchList from './CastingMatchList';
import CastingRequirements from './CastingRequirements';
import './CastingPage.css';

const STAGES = ['Applied', 'Shortlisted', 'Offered', 'Booked', 'Passed'];

export default function CastingPageWrapper() {
  return (
    <ErrorBoundary>
      <CastingPage />
    </ErrorBoundary>
  );
}

function CastingPage() {
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

  useEffect(() => {
    setIsSidebarCollapsed(true);
  }, [viewMode]);

  const appliedCandidates = candidates.filter((c) => c.stage === 'Applied');
  const visibleCandidates = candidates.filter((candidate) => filterStage === 'All' || candidate.stage === filterStage);

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

  const handleBulkAction = (action) => {
    const appIds = candidates.filter((c) => selectedCandidates.includes(c.id)).map((c) => c.applicationId);
    if (action === 'move-stage') {
      bulkUpdateStageMutation.mutate({ applicationIds: appIds, stage: 'Shortlisted' });
    } else if (action === 'remove') {
      bulkUpdateStageMutation.mutate({ applicationIds: appIds, stage: 'Passed' });
    }
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
          type="button"
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
          type="button"
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
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        <CastingCallBuilder
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          filteredBoards={filteredBoards}
          activeCasting={activeCasting}
          onSelectCasting={setActiveCastingId}
          castingSearch={castingSearch}
          setCastingSearch={setCastingSearch}
          getBoardProgress={getBoardProgress}
          getBoardStatus={getBoardStatus}
          formatDeadline={formatDeadline}
          showNewForm={showNewForm}
          setShowNewForm={setShowNewForm}
          newRoleForm={newRoleForm}
          setNewRoleForm={setNewRoleForm}
          onSubmitNewRole={submitNewRole}
          createBoardPending={createBoardMutation.isPending}
        />

        <CastingMatchList
          activeCasting={activeCasting}
          activeCastingId={activeCastingId}
          viewMode={viewMode}
          setView={setView}
          filterStage={filterStage}
          setFilterStage={setFilterStage}
          candidates={candidates}
          displayedStages={displayedStages}
          visibleCandidates={visibleCandidates}
          appliedCandidates={appliedCandidates}
          selectedCandidates={selectedCandidates}
          setSelectedCandidates={setSelectedCandidates}
          drawerCandidate={drawerCandidate}
          setDrawerCandidate={setDrawerCandidate}
          focusMode={focusMode}
          setFocusMode={setFocusMode}
          focusIndex={focusIndex}
          setFocusIndex={setFocusIndex}
          isFocusAnimating={isFocusAnimating}
          setIsFocusAnimating={setIsFocusAnimating}
          activeId={activeId}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          commitCandidateStage={commitCandidateStage}
          onBulkAction={handleBulkAction}
        />

        <CastingRequirements
          briefExpanded={briefExpanded}
          setBriefExpanded={setBriefExpanded}
          activeCasting={activeCasting}
          getBoardStatus={getBoardStatus}
          formatDeadline={formatDeadline}
          displayedStages={displayedStages}
          candidates={candidates}
        />
      </div>
    </div>
  );
}
