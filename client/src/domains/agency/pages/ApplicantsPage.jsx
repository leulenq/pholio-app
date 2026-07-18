import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, Star, Check, X, ChevronRight, ArrowUpRight } from 'lucide-react';
import {
  getApplicants, getBoards, getCastingBoardPipeline,
  acceptApplication, shortlistApplication, declineApplication,
} from '../api/agency';
import { TalentPanel } from '../components/TalentPanel';
import MatchScore from '../components/ui/MatchScore';
import { SkeletonRow, SkeletonStrip, AgencyEmptyState, StatusText } from '../components/ui';
import { TypeSpec } from '../components/status';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';
import { EmptyErrorState } from '../../../shared/components/states';
import ShortcutHelp from '../components/ShortcutHelp';
import './ApplicantsPage.css';

const PAGE_SIZE = 60;

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

const isNew = (s) => s === 'submitted' || s === 'pending' || s === 'new' || !s;
const SIGNED_STATES = ['represented', 'booked', 'accepted', 'signed'];
const isSigned = (s) => SIGNED_STATES.includes(s);
// A submission is "decided" once it has left the review ladder in either direction.
const isDecided = (s) => isSigned(s) || s === 'declined' || s === 'passed';

// Primary ledger-as-tabs — the five views a booker triages between.
const PRIMARY_TABS = [
  { key: 'submitted', label: 'New', match: isNew },
  { key: 'shortlisted', label: 'Shortlisted', match: (s) => s === 'shortlisted' },
  { key: 'development', label: 'New Faces', match: (s) => s === 'development' },
  { key: 'represented', label: 'Signed', match: isSigned },
  { key: 'all', label: 'All', match: () => true },
];
// Quiet outcomes folded out of the ledger; reachable from the "More" filter row.
const SECONDARY_TABS = [
  { key: 'kept_on_file', label: 'On file', match: (s) => s === 'kept_on_file' },
  { key: 'declined', label: 'Passed', match: (s) => s === 'declined' },
];
const ALL_TABS = [...PRIMARY_TABS, ...SECONDARY_TABS];

function mapRow(p) {
  const img = p.images?.[0];
  const status = p.application_status || 'submitted';
  return {
    applicationId: p.application_id,
    profileId: p.id,
    name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
    city: p.city || null,
    photo: img ? (img.public_url || img.path) : null,
    status,
    appliedAt: p.application_created_at,
    match: p.match_score ?? null,
    slug: p.slug,
    type: p.archetype || 'editorial',
  };
}

// Board pipeline candidates arrive in a different shape than /applications profiles.
function mapCandidate(c) {
  return {
    applicationId: c.applicationId ?? c.id,
    profileId: c.profileId,
    name: c.name || 'Unknown',
    city: c.location || null,
    photo: c.avatar || null,
    status: c.backendStatus || 'submitted',
    appliedAt: c.created_at,
    match: c.score ?? null,
    slug: c.slug,
    type: c.archetype || 'editorial',
  };
}

function ApplicantRow({ a, focused, onOpen, onShortlist, onAccept, onDecline, busy, rowRef, onFocus }) {
  const decided = isDecided(a.status);
  const shortlisted = a.status === 'shortlisted';
  const classes = [
    'ap-row',
    'ap-row--talent',
    focused ? 'ap-row--focused' : '',
  ].filter(Boolean).join(' ');
  return (
    <div
      ref={rowRef}
      className={classes}
      role="button"
      tabIndex={0}
      aria-selected={focused || undefined}
      onFocus={onFocus}
      onClick={() => onOpen(a)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          onOpen(a);
        }
      }}
    >
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
      <span className="ap-score-cell">{a.match != null && <MatchScore score={a.match} size="sm" />}</span>
      <span className="ap-status"><StatusText status={a.status} /></span>
      <div className="ap-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {decided ? (
          <span className="ap-decided" aria-hidden="true">Decided</span>
        ) : (
          <>
            {!shortlisted && (
              <button
                type="button"
                className="ap-act"
                aria-label={`Shortlist ${a.name}`}
                disabled={busy}
                onClick={() => onShortlist(a.applicationId)}
              >
                <Star size={14} aria-hidden="true" />
                <span className="ap-act-label">Shortlist</span>
              </button>
            )}
            <button
              type="button"
              className="ap-act ap-act--accept"
              aria-label={`Sign ${a.name}`}
              disabled={busy}
              onClick={() => onAccept(a.applicationId)}
            >
              <Check size={14} aria-hidden="true" />
              <span className="ap-act-label">Sign</span>
            </button>
            <button
              type="button"
              className="ap-act ap-act--decline"
              aria-label={`Pass on ${a.name}`}
              disabled={busy}
              onClick={() => onDecline(a.applicationId)}
            >
              <X size={14} aria-hidden="true" />
              <span className="ap-act-label">Pass</span>
            </button>
          </>
        )}
        <button
          type="button"
          className="ap-act ap-act--review"
          aria-label={`Review ${a.name}`}
          onClick={() => onOpen(a)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// Board context band — replaces the collapsible brief rail. Shown only for a
// selected board: name, one-line brief excerpt, where-it-stands, link to signing.
function BoardBand({ board }) {
  if (!board) return null;
  const pipeline = board.application_count || 0;
  const waiting = board.submitted_count || 0;
  const represented = board.represented_count || board.booked_count || 0;
  const brief = board.description
    ? board.description
    : 'No brief written for this board yet. Add one so every reviewer shares the same point of view.';
  return (
    <motion.section
      className="ap-band"
      aria-label={`${board.name || 'Board'} context`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="ap-band-copy">
        <h2 className="ap-band-name">{board.name || 'Untitled Board'}</h2>
        <p className="ap-band-brief">{brief}</p>
        <p className="ap-band-stands">
          {pipeline} in pipeline · {waiting} awaiting review · {represented} represented
        </p>
      </div>
      <Link className="ap-band-link" to={`/dashboard/agency/signing/${board.id}`}>
        Open board
        <ArrowUpRight size={14} aria-hidden="true" />
      </Link>
    </motion.section>
  );
}

function ApplicationsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [selected, setSelected] = useState(null);
  const [boardId, setBoardId] = useState(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [helpOpen, setHelpOpen] = useState(false);

  const rowRefs = useRef([]);
  const sentinelRef = useRef(null);
  const searchRef = useRef(null);

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

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['applicants'] });
    qc.invalidateQueries({ queryKey: ['board-candidates'] });
    qc.invalidateQueries({ queryKey: ['agency-boards'] });
    qc.invalidateQueries({ queryKey: ['agency'] });
  }, [qc]);

  const shortlist = useMutation({ mutationFn: (id) => shortlistApplication(id), onSuccess: () => { refresh(); toast.success('Shortlisted'); }, onError: () => toast.error('Action failed') });
  const accept = useMutation({ mutationFn: (id) => acceptApplication(id), onSuccess: () => { refresh(); toast.success('Signed'); }, onError: () => toast.error('Action failed') });
  const decline = useMutation({ mutationFn: (id) => declineApplication(id), onSuccess: () => { refresh(); toast.success('Passed'); }, onError: () => toast.error('Action failed') });
  const inFlight = (shortlist.isPending && shortlist.variables) || (accept.isPending && accept.variables) || (decline.isPending && decline.variables) || null;

  const counts = useMemo(() => {
    const c = {};
    ALL_TABS.forEach((t) => { c[t.key] = applicants.filter((a) => t.match(a.status)).length; });
    return c;
  }, [applicants]);

  const filtered = useMemo(() => {
    const matcher = (ALL_TABS.find((t) => t.key === tab) || ALL_TABS[0]).match;
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

  // Pass rate = how selectively the agency has decided so far.
  const representedCount = counts.represented || 0;
  const passedCount = counts.declined || 0;
  const decidedCount = representedCount + passedCount;
  const passRate = decidedCount ? Math.round((passedCount / decidedCount) * 100) : null;

  // Reset triage focus + windowing whenever the working set changes. Done in the
  // change handlers (not an effect) so we never chain renders off derived state.
  const resetTriage = useCallback(() => {
    setFocusedIndex(-1);
    setVisibleCount(PAGE_SIZE);
  }, []);
  const changeTab = useCallback((next) => { setTab(next); resetTriage(); }, [resetTriage]);
  const changeQuery = useCallback((next) => { setQ(next); resetTriage(); }, [resetTriage]);
  const changeSort = useCallback((next) => { setSort(next); resetTriage(); }, [resetTriage]);
  const changeBoard = useCallback((next) => { setBoardId(next); resetTriage(); }, [resetTriage]);

  const focusRow = useCallback((i) => {
    const el = rowRefs.current[i];
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  const openTalent = useCallback((a) => { if (a) setSelected(a); }, []);

  const runAction = useCallback((kind, a) => {
    if (!a) return;
    if (isDecided(a.status)) return;
    if (kind === 'shortlist') {
      if (a.status === 'shortlisted') return;
      shortlist.mutate(a.applicationId);
    } else if (kind === 'accept') {
      accept.mutate(a.applicationId);
    } else if (kind === 'decline') {
      decline.mutate(a.applicationId);
    }
  }, [shortlist, accept, decline]);

  // Keep the latest triage state in a ref so the keyboard handler can bind once.
  const triageRef = useRef({ filtered, focusedIndex, visibleCount, selected, helpOpen });
  useEffect(() => {
    triageRef.current = { filtered, focusedIndex, visibleCount, selected, helpOpen };
  }, [filtered, focusedIndex, visibleCount, selected, helpOpen]);

  useEffect(() => {
    const move = (dir) => {
      const { filtered: list, focusedIndex: cur } = triageRef.current;
      const n = list.length;
      if (!n) return;
      let next = cur < 0 ? (dir > 0 ? 0 : n - 1) : cur + dir;
      next = Math.max(0, Math.min(n - 1, next));
      setFocusedIndex(next);
      if (next >= triageRef.current.visibleCount) {
        setVisibleCount(next + PAGE_SIZE);
        requestAnimationFrame(() => focusRow(next));
      } else {
        focusRow(next);
      }
    };

    const onKey = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

      if (e.key === 'Escape') {
        if (typing) { t.blur(); return; }
        if (triageRef.current.helpOpen) { setHelpOpen(false); return; }
        if (triageRef.current.selected) { setSelected(null); return; }
        return;
      }

      // Never hijack keys while the booker is typing or using a modifier chord.
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      const { filtered: list, focusedIndex: cur } = triageRef.current;
      const row = cur >= 0 ? list[cur] : null;

      switch (e.key) {
        case 'j': case 'J': case 'ArrowDown':
          e.preventDefault(); move(1); break;
        case 'k': case 'K': case 'ArrowUp':
          e.preventDefault(); move(-1); break;
        case 'Enter':
          if (row) { e.preventDefault(); openTalent(row); } break;
        case 's': case 'S':
          if (row) { e.preventDefault(); runAction('shortlist', row); } break;
        case 'a': case 'A':
          if (row) { e.preventDefault(); runAction('accept', row); } break;
        case 'x': case 'X':
          if (row) { e.preventDefault(); runAction('decline', row); } break;
        case '?':
          e.preventDefault(); setHelpOpen((v) => !v); break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusRow, openTalent, runAction]);

  // Incremental rendering — grow the window when the sentinel scrolls into view.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || visibleCount >= filtered.length) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((v) => Math.min(filtered.length, v + PAGE_SIZE));
      }
    }, { rootMargin: '400px 0px' });
    io.observe(node);
    return () => io.disconnect();
  }, [filtered.length, visibleCount]);

  const hasActiveFilter = tab !== 'all' || Boolean(q.trim());
  const isGenuineEmpty = applicants.length === 0;
  const hasNoResults = !isGenuineEmpty && filtered.length === 0;
  const visible = filtered.slice(0, visibleCount);

  const resetFilters = () => { setTab('all'); setQ(''); resetTriage(); };
  const retrySubmissions = () => {
    boardsQuery.refetch();
    activeApplicantsQuery.refetch();
  };

  const ledgerTabs = PRIMARY_TABS.map((t) => ({ ...t, value: counts[t.key] ?? 0 }));

  if (isLoading) {
    return (
      <div className="ap ap-loading" role="status" aria-live="polite" aria-busy="true">
        <header className="ap-header"><h1 className="ap-title">Submissions</h1></header>
        <SkeletonStrip count={5} />
        <div className="ap-list"><SkeletonRow count={8} /></div>
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

  const boardOptions = [
    { id: '', name: 'All submissions', count: allSubmissionTotal || total },
    ...boards.map((b) => ({ id: b.id, name: b.name || 'Untitled Board', count: b.application_count || 0 })),
  ];

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
          <label className="ap-board-select">
            <span className="ap-board-select-label">Board</span>
            <select
              value={boardId ?? ''}
              onChange={(e) => changeBoard(e.target.value || null)}
              aria-label="Filter submissions by board"
            >
              {boardOptions.map((b) => (
                <option key={b.id || 'all'} value={b.id}>
                  {b.name} · {b.count}
                </option>
              ))}
            </select>
          </label>
          <div className="ap-search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={searchRef}
              placeholder="Search by name or city…"
              value={q}
              onChange={(e) => changeQuery(e.target.value)}
              aria-label="Search submissions"
            />
          </div>
          <div className="ap-sort" role="group" aria-label="Sort submissions">
            <button type="button" className={sort === 'recent' ? 'is-on' : ''} aria-pressed={sort === 'recent'} onClick={() => changeSort('recent')}>Newest</button>
            <button type="button" className={sort === 'match' ? 'is-on' : ''} aria-pressed={sort === 'match'} onClick={() => changeSort('match')}>Match</button>
          </div>
        </div>
      </header>

      {/* LEDGER-AS-TABS — the stat row IS the stage filter. */}
      <motion.div
        className="ap-ledger"
        role="tablist"
        aria-label="Filter by stage"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
      >
        {ledgerTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`ap-stat${tab === t.key ? ' ap-stat--on' : ''}${t.key === 'submitted' && t.value ? ' ap-stat--live' : ''}`}
            onClick={() => changeTab(t.key)}
          >
            <span className="ap-stat-num">{t.value}</span>
            <span className="ap-stat-label">{t.label}</span>
          </button>
        ))}
        <div className="ap-stat ap-stat--static" aria-hidden="true">
          <span className="ap-stat-num">{passRate == null ? '—' : `${passRate}%`}</span>
          <span className="ap-stat-label">Pass rate</span>
        </div>
      </motion.div>

      {/* MORE — the quiet outcomes folded out of the ledger. */}
      <div className="ap-more" role="group" aria-label="Secondary filters">
        <span className="ap-more-key">More</span>
        {SECONDARY_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            className={`ap-more-item${tab === t.key ? ' is-on' : ''}`}
            onClick={() => changeTab(tab === t.key ? 'all' : t.key)}
          >
            {t.label} {counts[t.key] ?? 0}
          </button>
        ))}
      </div>

      {activeBoard && <BoardBand board={activeBoard} />}

      <p className="ap-hint">J/K to move · S shortlist · A sign · X pass · ? help</p>

      <div className="ap-list">
        {isGenuineEmpty && (
          <AgencyEmptyState
            title={activeBoard ? 'No submissions on this board' : 'No submissions yet'}
            description={activeBoard
              ? 'Assign talent to this board from the signing room to start reviewing here.'
              : 'Inbound digitals from open calls and direct invitations will appear here for review.'}
          />
        )}

        {hasNoResults && (
          <AgencyEmptyState
            title="No submissions match this view"
            description={hasActiveFilter
              ? 'Adjust the search or stage filter to see talent already in the pipeline.'
              : 'Try another view to continue review.'}
            action={hasActiveFilter
              ? <button type="button" className="ap-empty-action" onClick={resetFilters}>Clear filters</button>
              : undefined}
          />
        )}

        {!isGenuineEmpty && !hasNoResults && (
          <>
            <div className="ap-row ap-row--head" aria-hidden="true">
              <span />
              <span>Talent</span>
              <span>Submitted</span>
              <span className="ap-c">Match</span>
              <span>Status</span>
              <span />
            </div>
            {visible.map((a, i) => (
              <ApplicantRow
                key={a.applicationId}
                a={a}
                focused={focusedIndex === i}
                busy={inFlight === a.applicationId}
                rowRef={(el) => { rowRefs.current[i] = el; }}
                onFocus={() => setFocusedIndex(i)}
                onOpen={openTalent}
                onShortlist={() => shortlist.mutate(a.applicationId)}
                onAccept={() => accept.mutate(a.applicationId)}
                onDecline={() => decline.mutate(a.applicationId)}
              />
            ))}
            {visibleCount < filtered.length && (
              <div ref={sentinelRef} className="ap-sentinel" aria-hidden="true">
                <SkeletonRow count={3} />
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <TalentPanel key={selected.applicationId} talent={selected} context="applicants" onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>

      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
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
