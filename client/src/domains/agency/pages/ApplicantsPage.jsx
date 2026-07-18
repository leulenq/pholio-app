import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Search, Star, Check, X, ChevronRight, ChevronLeft } from 'lucide-react';
import {
  getApplicants, getBoards, getCastingBoardPipeline,
  acceptApplication, shortlistApplication, declineApplication,
} from '../api/agency';
import { TalentPanel } from '../components/TalentPanel';
import MatchScore from '../components/ui/MatchScore';
import { SkeletonRow, SkeletonStrip } from '../components/ui';
import { TypeSpec, StageMark } from '../components/status';
import { useCardButton } from '../hooks/useCardButton';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';
import { EmptyErrorState } from '../../../shared/components/states';
import './ApplicantsPage.css';

const timeAgo = (ts) => {
  if (!ts) return '—';
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'Yesterday';
  if (d < 14) return `${d}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const isNew = (s) => s === 'submitted' || s === 'pending' || !s;
const TABS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'submitted', label: 'New', match: isNew },
  { key: 'shortlisted', label: 'Shortlisted', match: (s) => s === 'shortlisted' },
  { key: 'kept_on_file', label: 'On file', match: (s) => s === 'kept_on_file' },
  { key: 'development', label: 'New Faces', match: (s) => s === 'development' },
  { key: 'represented', label: 'Represented', match: (s) => ['represented', 'booked', 'accepted'].includes(s) },
  { key: 'declined', label: 'Passed', match: (s) => s === 'declined' },
];

const BOARD_SELECTOR_DIRECTIONS = [
  { id: 'index', number: '01', name: 'Editorial index' },
  { id: 'folios', number: '02', name: 'Board folios' },
  { id: 'masthead', number: '03', name: 'Masthead' },
  { id: 'spines', number: '04', name: 'Archive spines' },
  { id: 'register', number: '05', name: 'Open register' },
  { id: 'typeset', number: '06', name: 'Typeset field' },
];

// Translates the active board into the brief detail panel's shape.
function boardBrief(board) {
  if (!board) return null;
  const pipeline = board.application_count || 0;
  const waiting = board.submitted_count || 0;
  const represented = board.represented_count || board.booked_count || 0;
  return {
    title: board.name || 'Untitled Board',
    status: board.is_active === false ? 'Closed' : 'Open',
    pipeline,
    sections: [
      {
        label: 'The Brief',
        body: board.description
          || 'No brief written for this board yet. Add one so every reviewer shares the same point of view.',
      },
      {
        label: 'Where It Stands',
        body: `${pipeline} in pipeline · ${waiting} awaiting review · ${represented} represented.`,
      },
    ],
  };
}

function mapRow(p) {
  const img = p.images?.[0];
  const status = p.application_status || 'submitted';
  return {
    applicationId: p.application_id,
    profileId: p.id,
    name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
    archetype: p.archetype || 'editorial',
    city: p.city || null,
    photo: img ? (img.public_url || img.path) : null,
    status,
    appliedAt: p.application_created_at,
    match: p.match_score ?? null,
    slug: p.slug,
    type: p.archetype || 'editorial',
    location: p.city || null,
  };
}

// Board pipeline candidates arrive in a different shape than /applications profiles.
function mapCandidate(c) {
  return {
    applicationId: c.applicationId ?? c.id,
    profileId: c.profileId,
    name: c.name || 'Unknown',
    archetype: c.archetype || 'editorial',
    city: c.location || null,
    photo: c.avatar || null,
    status: c.backendStatus || 'submitted',
    appliedAt: c.created_at,
    match: c.score ?? null,
    slug: c.slug,
    type: c.archetype || 'editorial',
    location: c.location || null,
  };
}


function ApplicantRow({ a, onOpen, onShortlist, onAccept, onDecline, busy }) {
  const decided = a.status === 'accepted' || a.status === 'booked' || a.status === 'declined';
  const shortlisted = a.status === 'shortlisted';
  const cardButtonProps = useCardButton(() => onOpen(a), { disabled: busy });
  return (
    <div className="ap-row" onClick={() => onOpen(a)} {...cardButtonProps}>
      <span className="ap-pic">
        <span className="ap-pic-img" style={{ backgroundImage: a.photo ? `url(${a.photo})` : 'none' }} />
      </span>
      <div className="ap-id">
        <span className="ap-name">{a.name}</span>
        <span className="ap-meta">
          <TypeSpec type={a.type} />
          {a.city && <span className="ap-meta-city">{a.city}</span>}
        </span>
      </div>
      <span className="ap-applied">{timeAgo(a.appliedAt)}</span>
      {a.match != null && <MatchScore score={a.match} size="sm" className="ap-score" />}
      <span className="ap-status"><StageMark status={a.status} /></span>
      <div className="ap-actions" onClick={(e) => e.stopPropagation()}>
        {!decided && (
          <>
            {!shortlisted && (
              <button className="ap-act" title="Shortlist" disabled={busy} onClick={() => onShortlist(a.applicationId)}>
                <Star size={15} />
              </button>
            )}
            <button className="ap-act ap-act--accept" title="Sign" disabled={busy} onClick={() => onAccept(a.applicationId)}>
              <Check size={15} />
            </button>
            <button className="ap-act ap-act--decline" title="Pass" disabled={busy} onClick={() => onDecline(a.applicationId)}>
              <X size={15} />
            </button>
          </>
        )}
        <button className="ap-act ap-act--review" title="Review" onClick={() => onOpen(a)}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function selectorBoards(boards, total) {
  return [
    {
      id: null,
      name: 'All submissions',
      application_count: total,
      selector_context: 'Complete intake',
      selector_waiting: 'Across every board',
    },
    ...boards.map((board) => ({
      ...board,
      name: board.name || 'Untitled Board',
      selector_context: board.client_name || 'Agency division',
    })),
  ];
}

function boardCountLabel(board) {
  const count = board.application_count || 0;
  return `${count} submission${count === 1 ? '' : 's'}`;
}

function boardWaitingLabel(board) {
  if (board.selector_waiting) return board.selector_waiting;
  const waiting = board.submitted_count || 0;
  return waiting > 0 ? `${waiting} awaiting review` : 'Intake clear';
}

function BoardSelectorStudy({ direction, onDirectionChange }) {
  return (
    <div className="ap-selector-study" aria-label="Board selector prototype direction">
      <span className="ap-selector-study-label">Board selector study</span>
      <div className="ap-selector-study-options">
        {BOARD_SELECTOR_DIRECTIONS.map((option) => (
          <button
            key={option.id}
            className={`ap-selector-study-option${direction === option.id ? ' is-active' : ''}`}
            aria-pressed={direction === option.id}
            onClick={() => onDirectionChange(option.id)}
          >
            <span>{option.number}</span>
            {option.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function BoardSelector({ boards, total, selectedId, onSelect, direction = 'index' }) {
  const items = selectorBoards(boards, total);
  const active = items.find((board) => board.id === selectedId) || items[0];
  const selectProps = (board) => ({
    role: 'tab',
    'aria-selected': board.id === selectedId,
    onClick: () => onSelect(board.id),
  });

  if (direction === 'folios') {
    return (
      <div className="ap-board-selector ap-board-selector--folios" role="tablist" aria-label="Board context">
        {items.map((board, index) => (
          <button
            key={board.id || 'all'}
            className={`ap-board-folio${board.id === selectedId ? ' is-active' : ''}`}
            {...selectProps(board)}
          >
            <span className="ap-board-folio-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="ap-board-folio-copy">
              <span className="ap-board-folio-name">{board.name}</span>
              <span className="ap-board-folio-meta">{board.selector_context} / {boardCountLabel(board)}</span>
            </span>
            <span className="ap-board-folio-waiting">{boardWaitingLabel(board)}</span>
          </button>
        ))}
      </div>
    );
  }

  if (direction === 'masthead') {
    return (
      <div className="ap-board-selector ap-board-selector--masthead" role="tablist" aria-label="Board context">
        <button className="ap-board-masthead-active" {...selectProps(active)}>
          <span className="ap-board-masthead-name">{active.name}</span>
          <span className="ap-board-masthead-meta">
            {active.selector_context} / {boardCountLabel(active)} / {boardWaitingLabel(active)}
          </span>
        </button>
        <div className="ap-board-masthead-index">
          {items.filter((board) => board.id !== active.id).map((board) => (
            <button key={board.id || 'all'} className="ap-board-masthead-option" {...selectProps(board)}>
              <span>{board.name}</span>
              <span>{board.application_count || 0}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (direction === 'spines') {
    return (
      <div className="ap-board-selector ap-board-selector--spines" role="tablist" aria-label="Board context">
        {items.map((board, index) => (
          <button
            key={board.id || 'all'}
            className={`ap-board-spine${board.id === selectedId ? ' is-active' : ''}`}
            {...selectProps(board)}
          >
            <span className="ap-board-spine-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="ap-board-spine-name">{board.name}</span>
            <span className="ap-board-spine-count">{board.application_count || 0}</span>
          </button>
        ))}
      </div>
    );
  }

  if (direction === 'register') {
    return (
      <div className="ap-board-selector ap-board-selector--register" role="tablist" aria-label="Board context">
        <div className="ap-board-register-lead">
          <span>{active.name}</span>
          <span>{boardCountLabel(active)} / {boardWaitingLabel(active)}</span>
        </div>
        <div className="ap-board-register-lines">
          {items.map((board, index) => (
            <button
              key={board.id || 'all'}
              className={`ap-board-register-line${board.id === selectedId ? ' is-active' : ''}`}
              {...selectProps(board)}
            >
              <span className="ap-board-register-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="ap-board-register-name">{board.name}</span>
              <span className="ap-board-register-rule" aria-hidden="true" />
              <span className="ap-board-register-count">{board.application_count || 0}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (direction === 'typeset') {
    return (
      <div className="ap-board-selector ap-board-selector--typeset" role="tablist" aria-label="Board context">
        {items.map((board, index) => (
          <button
            key={board.id || 'all'}
            className={`ap-board-typeset${board.id === selectedId ? ' is-active' : ''}${index === 0 ? ' is-all' : ''}`}
            {...selectProps(board)}
          >
            <span className="ap-board-typeset-name">{board.name}</span>
            <span className="ap-board-typeset-count">{board.application_count || 0}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="ap-board-selector ap-board-selector--index" role="tablist" aria-label="Board context">
      {items.map((board) => (
        <button
          key={board.id || 'all'}
          className={`ap-board-index${board.id === selectedId ? ' is-active' : ''}`}
          {...selectProps(board)}
        >
          <span className="ap-board-index-name">{board.name}</span>
          <span className="ap-board-index-meta">{board.selector_context} / {boardCountLabel(board)}</span>
          <span className="ap-board-index-waiting">{boardWaitingLabel(board)}</span>
        </button>
      ))}
    </div>
  );
}

// DETAIL — brief panel, shown only when a board is in context.
function BriefRail({ brief }) {
  const [open, setOpen] = useState(true);
  return (
    <motion.aside
      className="ap-brief-rail"
      data-open={open ? 'true' : 'false'}
      animate={{ width: open ? 332 : 46 }}
      transition={{ type: 'spring', stiffness: 55, damping: 16 }}
    >
      <button className="ap-rail-tab ap-rail-tab--right" onClick={() => setOpen((v) => !v)} title={open ? 'Collapse brief' : 'Open brief'}>
        {open ? <ChevronRight size={15} /> : (
          <>
            <ChevronLeft size={15} />
            <span className="ap-rail-tab-label">Brief</span>
          </>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            key={brief.title}
            className="ap-brief-body"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 14 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            <h2 className="ap-brief-role">{brief.title}</h2>
            <p className="ap-brief-meta">
              {brief.status}{brief.pipeline != null ? ` · ${brief.pipeline} in pipeline` : ''}
            </p>
            {brief.sections.map((s) => (
              <div key={s.label} className="ap-brief-sec">
                <h4 className="ap-brief-sec-label">{s.label}</h4>
                <p className="ap-brief-sec-body">{s.body}</p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

function ApplicationsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [selected, setSelected] = useState(null);
  const [boardId, setBoardId] = useState(null);
  const [selectorDirection, setSelectorDirection] = useState(() => {
    if (!import.meta.env.DEV) return 'index';
    const requested = new URLSearchParams(window.location.search).get('board-selector');
    return BOARD_SELECTOR_DIRECTIONS.some((direction) => direction.id === requested)
      ? requested
      : 'index';
  });

  const boardsQuery = useQuery({
    queryKey: ['agency-boards'],
    queryFn: getBoards,
    staleTime: 60000,
  });
  const { data: boards = [] } = boardsQuery;

  const allQuery = useQuery({
    queryKey: ['applicants'],
    queryFn: () => getApplicants({}),
    staleTime: 30000,
    enabled: boardId == null,
  });
  const boardQuery = useQuery({
    queryKey: ['board-candidates', boardId],
    queryFn: () => getCastingBoardPipeline(boardId),
    staleTime: 30000,
    enabled: boardId != null,
  });

  const activeApplicantsQuery = boardId == null ? allQuery : boardQuery;
  const isLoading = boardsQuery.isLoading || activeApplicantsQuery.isLoading;
  const isError = boardsQuery.isError || activeApplicantsQuery.isError;

  const applicants = useMemo(() => {
    if (boardId != null) return (boardQuery.data?.candidates || []).map(mapCandidate);
    return (allQuery.data?.profiles || []).filter((p) => p.application_id).map(mapRow);
  }, [boardId, allQuery.data, boardQuery.data]);

  const activeBoard = useMemo(() => boards.find((b) => b.id === boardId) || null, [boards, boardId]);
  const brief = useMemo(() => boardBrief(activeBoard), [activeBoard]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['applicants'] });
    qc.invalidateQueries({ queryKey: ['board-candidates'] });
    qc.invalidateQueries({ queryKey: ['agency-boards'] });
    qc.invalidateQueries({ queryKey: ['agency'] });
  };
  const shortlist = useMutation({ mutationFn: (id) => shortlistApplication(id), onSuccess: () => { refresh(); toast.success('Shortlisted'); }, onError: () => toast.error('Action failed') });
  const accept = useMutation({ mutationFn: (id) => acceptApplication(id), onSuccess: () => { refresh(); toast.success('Represented'); }, onError: () => toast.error('Action failed') });
  const decline = useMutation({ mutationFn: (id) => declineApplication(id), onSuccess: () => { refresh(); toast.success('Passed'); }, onError: () => toast.error('Action failed') });
  const inFlight = (shortlist.isPending && shortlist.variables) || (accept.isPending && accept.variables) || (decline.isPending && decline.variables) || null;

  const counts = useMemo(() => {
    const c = {};
    TABS.forEach((t) => { c[t.key] = applicants.filter((a) => t.match(a.status)).length; });
    return c;
  }, [applicants]);

  const filtered = useMemo(() => {
    const matcher = (TABS.find((t) => t.key === tab) || TABS[0]).match;
    let list = applicants.filter((a) => matcher(a.status));
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(s) || (a.city || '').toLowerCase().includes(s));
    }
    return [...list].sort((a, b) =>
      sort === 'match' ? (b.match || 0) - (a.match || 0) : new Date(b.appliedAt) - new Date(a.appliedAt));
  }, [applicants, tab, q, sort]);

  const total = applicants.length;
  const allSubmissionTotal = useMemo(
    () => (allQuery.data?.profiles || []).filter((profile) => profile.application_id).length,
    [allQuery.data],
  );
  const newCount = counts.submitted || 0;

  // Pass rate = how selectively the agency has decided so far.
  const representedCount = applicants.filter((a) => ['represented', 'booked', 'accepted'].includes(a.status)).length;
  const passedCount = applicants.filter((a) => a.status === 'declined').length;
  const decided = representedCount + passedCount;
  const passRate = decided ? Math.round((passedCount / decided) * 100) : null;

  const ledger = [
    { label: 'New', value: newCount, tone: newCount ? 'gold' : 'mute' },
    { label: 'Shortlisted', value: counts.shortlisted || 0, tone: 'ink' },
    { label: 'New Faces', value: counts.development || 0, tone: 'ink' },
    { label: 'Represented', value: representedCount, tone: 'ink' },
    { label: 'Pass Rate', value: passRate == null ? '—' : passRate, suffix: passRate == null ? '' : '%', tone: 'mute' },
  ];

  const hasActiveFilter = tab !== 'all' || Boolean(q.trim());
  const isGenuineEmpty = applicants.length === 0;
  const hasNoResults = !isGenuineEmpty && filtered.length === 0;
  const resetFilters = () => {
    setTab('all');
    setQ('');
  };
  const retrySubmissions = () => {
    boardsQuery.refetch();
    activeApplicantsQuery.refetch();
  };
  const changeSelectorDirection = (direction) => {
    setSelectorDirection(direction);
    const url = new URL(window.location.href);
    url.searchParams.set('board-selector', direction);
    window.history.replaceState({}, '', url);
  };

  if (isLoading) {
    return (
      <div className="ap ap-loading" role="status" aria-live="polite" aria-busy="true">
        <header className="ap-header"><h1 className="ap-title">Submissions</h1></header>
        <SkeletonStrip count={5} />
        <SkeletonRow count={6} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="ap">
        <header className="ap-header"><h1 className="ap-title">Submissions</h1></header>
        <EmptyErrorState
          title="Submissions unavailable"
          body="We could not load the current intake. Try again to resume review."
          retry={{ label: 'Try again', onClick: retrySubmissions }}
        />
      </div>
    );
  }

  return (
    <div className="ap">
      <header className="ap-header">
        <div>
          <h1 className="ap-title">Submissions</h1>
          <p className="ap-sub">
            {activeBoard
              ? `${activeBoard.name} · ${total} submission${total === 1 ? '' : 's'}`
              : `${total} total submission${total === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="ap-controls">
          <div className="ap-search">
            <Search size={14} />
            <input placeholder="Search by name or city…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="ap-sort">
            <button className={sort === 'recent' ? 'is-on' : ''} onClick={() => setSort('recent')}>Newest</button>
            <button className={sort === 'match' ? 'is-on' : ''} onClick={() => setSort('match')}>Match</button>
          </div>
        </div>
      </header>

      {import.meta.env.DEV && (
        <BoardSelectorStudy
          direction={selectorDirection}
          onDirectionChange={changeSelectorDirection}
        />
      )}
      <BoardSelector
        boards={boards}
        total={allSubmissionTotal || total}
        selectedId={boardId}
        onSelect={setBoardId}
        direction={selectorDirection}
      />

      <div className="ap-body">
        <div className="ap-main">
          <motion.div
            className="ap-ledger"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 55, damping: 16 }}
          >
            {ledger.map((s) => (
              <div key={s.label} className={`ap-stat ap-stat--${s.tone}`}>
                <span className="ap-stat-num">{s.value}{s.suffix ? <span className="ap-stat-suffix">{s.suffix}</span> : null}</span>
                <span className="ap-stat-label">{s.label}</span>
              </div>
            ))}
          </motion.div>

          <div className="ap-tabs">
            {TABS.map((t) => (
              <button key={t.key} className={`ap-tab${tab === t.key ? ' ap-tab--on' : ''}`} onClick={() => setTab(t.key)}>
                {t.label}<span className="ap-tab-count">{counts[t.key] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="ap-list">
            {!isGenuineEmpty && (
              <div className="ap-row ap-row--head">
                <span aria-hidden="true" />
                <span>Talent</span>
                <span>Submitted</span>
                <span className="ap-c">Match</span>
                <span>Status</span>
                <span aria-hidden="true" />
              </div>
            )}
            {isGenuineEmpty && (
              <div className="ap-empty" role="status">
                <p className="ap-empty-title">No submissions yet</p>
                <p>Inbound digitals from open calls and direct invitations will appear here for review.</p>
              </div>
            )}
            {hasNoResults && (
              <div className="ap-empty" role="status">
                <p className="ap-empty-title">No submissions match this view</p>
                <p>{hasActiveFilter ? 'Adjust the search or stage filter to see talent already in the pipeline.' : 'Try another view to continue review.'}</p>
                {hasActiveFilter && <button className="ap-empty-action" onClick={resetFilters}>Clear filters</button>}
              </div>
            )}
            {!isGenuineEmpty && !hasNoResults && filtered.map((a) => (
              <ApplicantRow
                key={a.applicationId}
                a={a}
                busy={inFlight === a.applicationId}
                onOpen={setSelected}
                onShortlist={() => shortlist.mutate(a.applicationId)}
                onAccept={() => accept.mutate(a.applicationId)}
                onDecline={() => decline.mutate(a.applicationId)}
              />
            ))}
          </div>
        </div>

        {brief && <BriefRail brief={brief} />}
      </div>

      <AnimatePresence>
        {selected && (
          <TalentPanel key={selected.applicationId} talent={selected} context="applicants" onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ApplicationsPageWrapper() {
  return (
    <ErrorBoundary>
      <ApplicationsPage />
    </ErrorBoundary>
  );
}
