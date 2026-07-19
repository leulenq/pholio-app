import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, Star, Check, X, LayoutGrid, Rows3, ArrowUpRight } from 'lucide-react';
import {
  getApplicants, getBoards, getCastingBoardPipeline,
  acceptApplication, shortlistApplication, declineApplication,
} from '../api/agency';
import { TalentPanel } from '../components/TalentPanel';
import { SkeletonRow, SkeletonCard, SkeletonStrip, AgencyEmptyState, MatchMeasure, StatusCell } from '../components/ui';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';
import { EmptyErrorState } from '../../../shared/components/states';
import ShortcutHelp from '../components/ShortcutHelp';
import './ApplicantsPage.css';

const PAGE_SIZE = 60;
const VIEW_KEY = 'ag-submissions-view';

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

const initials = (name) => (name || '')
  .split(' ')
  .map((part) => part[0] || '')
  .slice(0, 2)
  .join('')
  .toUpperCase();

const typeLabel = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : 'Editorial');

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
// Quiet outcomes on the rail's right edge.
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

/** The three triage verbs, icon-only with a shared tooltip treatment. */
function TriageActions({ a, busy, onShortlist, onAccept, onDecline, light = false }) {
  const shortlisted = a.status === 'shortlisted';
  const cls = `ap-icon${light ? ' ap-icon--light' : ''}`;
  return (
    <>
      {!shortlisted && (
        <button
          type="button"
          className={cls}
          aria-label={`Shortlist ${a.name}`}
          data-tip="Shortlist · S"
          disabled={busy}
          onClick={() => onShortlist(a.applicationId)}
        >
          <Star size={15} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className={`${cls} ap-icon--sign`}
        aria-label={`Sign ${a.name}`}
        data-tip="Sign · A"
        disabled={busy}
        onClick={() => onAccept(a.applicationId)}
      >
        <Check size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`${cls} ap-icon--pass`}
        aria-label={`Pass on ${a.name}`}
        data-tip="Pass · X"
        disabled={busy}
        onClick={() => onDecline(a.applicationId)}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </>
  );
}

/** Book view — one sheet on the light table. Photo-led; actions rise on hover. */
function SubmissionCard({ a, focused, onOpen, onShortlist, onAccept, onDecline, busy, cardRef, onFocus }) {
  const decided = isDecided(a.status);
  const quietStatus = isNew(a.status);
  return (
    <div
      ref={cardRef}
      className={`ap-card${focused ? ' ap-card--focused' : ''}`}
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
      <span className="ap-card-photo">
        {a.photo ? (
          <span className="ap-card-img" style={{ backgroundImage: `url(${a.photo})` }} />
        ) : (
          <span className="ap-card-img ap-card-img--empty">{initials(a.name)}</span>
        )}
        {!decided && (
          <span className="ap-card-acts" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <TriageActions a={a} busy={busy} onShortlist={onShortlist} onAccept={onAccept} onDecline={onDecline} light />
          </span>
        )}
      </span>
      <span className="ap-card-row">
        <span className="ap-card-name">{a.name}</span>
        {a.match != null && <MatchMeasure score={a.match} size="sm" className="ap-card-match" />}
      </span>
      <span className="ap-card-spec">
        {typeLabel(a.type)}
        {a.city ? ` · ${a.city}` : ''}
      </span>
      <span className="ap-card-state">
        <span className="ap-card-when">{timeAgo(a.appliedAt)}</span>
        {!quietStatus && <StatusCell status={a.status} className="ap-card-status" />}
      </span>
    </div>
  );
}

/** Ledger view — the dense scanning row. */
function LedgerRow({ a, focused, onOpen, onShortlist, onAccept, onDecline, busy, rowRef, onFocus }) {
  const decided = isDecided(a.status);
  return (
    <div
      ref={rowRef}
      className={`ap-row${focused ? ' ap-row--focused' : ''}`}
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
        {a.photo ? (
          <span className="ap-pic-img" style={{ backgroundImage: `url(${a.photo})` }} />
        ) : (
          <span className="ap-pic-img ap-pic-img--empty">{initials(a.name)}</span>
        )}
      </span>
      <div className="ap-id">
        <span className="ap-name">{a.name}</span>
        <span className="ap-meta">
          {typeLabel(a.type)}
          {a.city ? ` · ${a.city}` : ''}
        </span>
      </div>
      <span className="ap-applied">{timeAgo(a.appliedAt)}</span>
      <span className="ap-score-cell">{a.match != null && <MatchMeasure score={a.match} size="sm" />}</span>
      <span className="ap-status">
        {isNew(a.status)
          ? <span className="ap-status-quiet">Submitted</span>
          : <StatusCell status={a.status} />}
      </span>
      <div className="ap-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {decided ? (
          <span className="ap-decided" aria-hidden="true">Decided</span>
        ) : (
          <TriageActions a={a} busy={busy} onShortlist={onShortlist} onAccept={onAccept} onDecline={onDecline} />
        )}
      </div>
    </div>
  );
}

// Board context band — shown only for a selected board: name, one-line brief
// excerpt, where-it-stands, link to the signing room.
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
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'ledger' ? 'ledger' : 'book';
    } catch {
      return 'book';
    }
  });
  const [selected, setSelected] = useState(null);
  const [boardId, setBoardId] = useState(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [helpOpen, setHelpOpen] = useState(false);

  const rowRefs = useRef([]);
  const sentinelRef = useRef(null);

  const changeView = useCallback((next) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* private mode */ }
  }, []);

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

  const railTabs = PRIMARY_TABS.map((t) => ({ ...t, value: counts[t.key] ?? 0 }));

  if (isLoading) {
    return (
      <div className="ap ap-loading" role="status" aria-live="polite" aria-busy="true">
        <header className="ap-hero"><h1 className="ap-title">Submissions</h1></header>
        <SkeletonStrip count={2} />
        <div className="ap-book"><SkeletonCard count={10} /></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="ap">
        <header className="ap-hero"><h1 className="ap-title">Submissions</h1></header>
        <EmptyErrorState
          title="Submissions unavailable"
          body="We could not load the current intake. Try again to resume review."
          retry={{ label: 'Try again', onClick: retrySubmissions }}
        />
      </div>
    );
  }

  const boardOptions = [
    { id: '', name: 'All submissions', count: total },
    ...boards.map((b) => ({ id: b.id, name: b.name || 'Untitled Board', count: b.application_count || 0 })),
  ];

  const rowProps = (a, i) => ({
    a,
    focused: focusedIndex === i,
    busy: inFlight === a.applicationId,
    onFocus: () => setFocusedIndex(i),
    onOpen: openTalent,
    onShortlist: () => shortlist.mutate(a.applicationId),
    onAccept: () => accept.mutate(a.applicationId),
    onDecline: () => decline.mutate(a.applicationId),
  });

  return (
    <div className="ap">
      {/* THE DESK SLIP — hero masthead. The title row carries the command bar;
          beneath it, the desk's two governing figures in the serif-ledger
          vocabulary the Overview hero speaks. */}
      <header className="ap-hero">
        <div className="ap-hero-top">
          <h1 className="ap-title">Submissions</h1>

          {/* One command bar — every control shares the same vocabulary. */}
          <div className="ap-bar" role="toolbar" aria-label="Submission controls">
          <label className="ap-board-select">
            <span className="ap-bar-key">Board</span>
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
              placeholder="Search by name or city…"
              value={q}
              onChange={(e) => changeQuery(e.target.value)}
              aria-label="Search submissions"
            />
          </div>
          <div className="ap-seg" role="group" aria-label="Sort submissions">
            <button type="button" className={sort === 'recent' ? 'is-on' : ''} aria-pressed={sort === 'recent'} onClick={() => changeSort('recent')}>Newest</button>
            <button type="button" className={sort === 'match' ? 'is-on' : ''} aria-pressed={sort === 'match'} onClick={() => changeSort('match')}>Match</button>
          </div>
          <div className="ap-seg" role="group" aria-label="View">
            <button
              type="button"
              className={view === 'book' ? 'is-on' : ''}
              aria-pressed={view === 'book'}
              aria-label="Book view"
              data-tip="Book view"
              onClick={() => changeView('book')}
            >
              <LayoutGrid size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={view === 'ledger' ? 'is-on' : ''}
              aria-pressed={view === 'ledger'}
              aria-label="Ledger view"
              data-tip="Ledger view"
              onClick={() => changeView('ledger')}
            >
              <Rows3 size={14} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className="ap-help"
            aria-label="Keyboard shortcuts"
            data-tip="Shortcuts · ?"
            onClick={() => setHelpOpen(true)}
          >
            ?
          </button>
          </div>
        </div>

        {/* The desk's governing figures — serif ledger, lead in gold. */}
        <motion.div
          className="ap-hero-ledger"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
        >
          <div className="ap-hero-stat">
            <span className="ap-hero-lab">{activeBoard ? 'On this board' : 'On the desk'}</span>
            <span className="ap-hero-fig ap-hero-fig--lead">{total}</span>
          </div>
          <div className="ap-hero-stat">
            <span className="ap-hero-lab">Pass rate</span>
            <span className={`ap-hero-fig${passRate == null ? ' ap-hero-fig--mute' : ''}`}>
              {passRate == null ? '—' : `${passRate}%`}
            </span>
          </div>
        </motion.div>
      </header>

      {/* STAGE RAIL — quiet text tabs; gold marks the active stage only.
          Quiet outcomes sit on the rail's right edge. */}
      <div className="ap-rail">
        <div className="ap-rail-tabs" role="tablist" aria-label="Filter by stage">
          {railTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`ap-tab${tab === t.key ? ' ap-tab--on' : ''}`}
              onClick={() => changeTab(t.key)}
            >
              <span className="ap-tab-label">{t.label}</span>
              <span className="ap-tab-count">{t.value}</span>
            </button>
          ))}
        </div>
        <div className="ap-rail-aside" role="group" aria-label="Secondary filters">
          {SECONDARY_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              className={`ap-aside-item${tab === t.key ? ' is-on' : ''}`}
              onClick={() => changeTab(tab === t.key ? 'all' : t.key)}
            >
              {t.label} {counts[t.key] ?? 0}
            </button>
          ))}
        </div>
      </div>

      {activeBoard && <BoardBand board={activeBoard} />}

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

      {!isGenuineEmpty && !hasNoResults && (view === 'book' ? (
        <div className="ap-book">
          {visible.map((a, i) => (
            <SubmissionCard
              key={a.applicationId}
              cardRef={(el) => { rowRefs.current[i] = el; }}
              {...rowProps(a, i)}
            />
          ))}
          {visibleCount < filtered.length && (
            <div ref={sentinelRef} className="ap-sentinel ap-sentinel--book" aria-hidden="true">
              <SkeletonCard count={5} />
            </div>
          )}
        </div>
      ) : (
        <div className="ap-list">
          <div className="ap-row ap-row--head" aria-hidden="true">
            <span />
            <span>Talent</span>
            <span>Submitted</span>
            <span>Match</span>
            <span>Status</span>
            <span />
          </div>
          {visible.map((a, i) => (
            <LedgerRow
              key={a.applicationId}
              rowRef={(el) => { rowRefs.current[i] = el; }}
              {...rowProps(a, i)}
            />
          ))}
          {visibleCount < filtered.length && (
            <div ref={sentinelRef} className="ap-sentinel" aria-hidden="true">
              <SkeletonRow count={3} />
            </div>
          )}
        </div>
      ))}

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
