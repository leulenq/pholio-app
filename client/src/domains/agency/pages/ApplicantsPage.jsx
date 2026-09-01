import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, Star, Check, X, LayoutGrid, Rows3, ArrowUpRight, ChevronDown, Columns3 } from 'lucide-react';
import {
  getApplicants, getBoards, getCastingBoardPipeline,
  acceptApplication, shortlistApplication, declineApplication, bulkDeclineApplications,
  keepOnFileApplication, requestMoreApplication, getApplicationDetails,
  requestMeetingApplication, offerDevelopmentApplication, updateCastingApplicationStage,
  createNote,
  assignToBoard,
} from '../api/agency';
import BoardSelect from '../components/BoardSelect';
import { resolveBoardIdentity, boardIdentityStyle } from '../lib/board-identity';
import ReviewRoom from '../components/review/ReviewRoom';
import { DeclineReasonModal } from '../components/decline/DeclineReasonModal';
import { SkeletonRow, SkeletonCard, SkeletonStrip, AgencyEmptyState, StatusCell } from '../components/ui';
import { resolveDivision } from '../components/status';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';
import { EmptyErrorState } from '../../../shared/components/states';
import ShortcutHelp from '../components/ShortcutHelp';
import { formatLocation } from '../../../shared/utils/locationFormat';
import { Moment } from '../components/meta';
import {
  isConfirmedApplicationStatus,
  isRepresentedApplicationStatus,
} from '../../../shared/constants/applicationStatus';
import {
  DEFAULT_ACTION_LABELS,
  LIFECYCLE_TABS,
  STATUS_FOR,
  isActiveStatus as isActive,
  isDecidedStatus as isDecided,
  isInFlightState,
  isNewStatus as isNew,
} from '../constants/applicantLifecycle';
import ComparisonOverlay from '../components/ComparisonOverlay';
import './ApplicantsPage.css';

const PAGE_SIZE = 60;
const VIEW_KEY = 'ag-submissions-view';

const initials = (name) => (name || '')
  .split(' ')
  .map((part) => part[0] || '')
  .slice(0, 2)
  .join('')
  .toUpperCase();

/** `%s` in a label is the talent's name — accessible names read as sentences. */
const withName = (template, name) => String(template).replace('%s', name);

const INITIAL_FILTERS = {
  status: [],
  talent: [],
  source: [],
  locations: [],
  // Server-backed. `GET /api/agency/applications` has always accepted these;
  // the desk simply never sent them, so it filtered whatever the endpoint
  // happened to return — and that pool is truncated at SUBMISSIONS_HARD_CAP.
  // Anything answerable authoritatively is now answered by the server.
  city: '',
  gender: '',
  minHeight: '',
  maxHeight: '',
  dateFrom: '',
  dateTo: '',
  sort: 'az',
};

/** Mirrors SUBMISSIONS_HARD_CAP in src/domains/agency/routes/inbox.js. */
const SUBMISSIONS_SHOWN_CAP = 2000;

/** Sorts the endpoint implements. `az` is its own default. */
const SORT_OPTIONS = [
  { value: 'az', label: 'Name A–Z' },
  { value: 'newest', label: 'Newest first' },
  { value: 'city', label: 'City' },
];

/**
 * The filters the SERVER owns. Sent as query params and keyed into the React
 * Query cache, so changing one refetches rather than re-slicing a stale array.
 *
 * Lifecycle tabs stay client-side on purpose: they group several application
 * statuses into one reading ("in flight", "represented") and the endpoint's
 * `status` param takes a single status, so pushing them down would narrow the
 * pool to less than the tab means.
 */
function serverFilterParams(filters, search) {
  const params = {};
  if (filters.city) params.city = filters.city;
  if (filters.gender) params.gender = filters.gender;
  if (filters.minHeight) params.min_height = filters.minHeight;
  if (filters.maxHeight) params.max_height = filters.maxHeight;
  if (filters.dateFrom) params.date_from = filters.dateFrom;
  if (filters.dateTo) params.date_to = filters.dateTo;
  if (search && search.trim()) params.search = search.trim();
  if (filters.sort && filters.sort !== 'az') params.sort = filters.sort;
  return params;
}

function mapRow(p) {
  const img = p.images?.[0];
  const status = p.application_status || 'submitted';
  return {
    applicationId: p.application_id,
    // Identity-backed rows (no Pholio account yet) arrive with `id: null` and
    // `slug: null` — never invent a profile id or a portfolio link for them.
    profileId: p.id,
    name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
    city: p.city || null,
    photo: img ? (img.public_url || img.path) : null,
    status,
    appliedAt: p.application_created_at,
    slug: p.slug,
    type: p.archetype || 'editorial',
    // Plain-data truth fields (design: open-call-applicant-flow). Undefined on
    // an older API response — the row renders nothing for those, never a guess.
    emailVerified: p.emailVerified,
    identityClaimed: p.identityClaimed,
    identityDisputed: p.identityDisputed,
    identitySource: p.identitySource,
    materialsStatus: p.materialsStatus,
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
    slug: c.slug,
    type: c.archetype || 'editorial',
    // The board-candidates endpoint does not yet resolve identity truth
    // fields — undefined here, same "render nothing" contract as mapRow.
    emailVerified: c.emailVerified,
    identityClaimed: c.identityClaimed,
    identityDisputed: c.identityDisputed,
    identitySource: c.identitySource,
    materialsStatus: c.materialsStatus,
  };
}

/** Plain-text truth fragments for a row's meta line — undefined fields render
 *  nothing (older API), and email state is only meaningful for identity rows
 *  (a profile row already went through Pholio's own signup verification). */
function identityMetaParts(a) {
  const parts = [];
  if (a.identitySource === 'submission' && typeof a.emailVerified === 'boolean') {
    parts.push(a.emailVerified ? 'Email verified' : 'Email unverified');
  }
  if (a.identityDisputed) parts.push('Identity disputed');
  return parts;
}

/**
 * The line under the name: discipline, then where they are, then the identity
 * notes.
 *
 * The discipline is deliberately NOT a DivisionMark. A mark's rectangle exists
 * to carry standing on a board (see meta-system.css: only a thing you hold
 * standing in earns a container), and an applicant holds no standing yet — so
 * every card in the book drew a dashed box around the same word, announcing
 * "standing unknown" and out-weighing the name above it. A market descriptor
 * is notation: it leads the line in slightly firmer ink, and nothing more.
 */
function SubmissionSpec({ a, className }) {
  const discipline = resolveDivision(a.type || 'editorial').label;
  const rest = [
    a.city ? formatLocation(a.city) : null,
    ...identityMetaParts(a),
  ].filter(Boolean);

  return (
    <div className={className}>
      <span className="ap-spec-lead">{discipline}</span>
      {rest.map((part) => (
        <React.Fragment key={part}>
          {/* The separator is an element so it can be quieter than the terms
              it divides, and out of the accessibility tree. */}
          <span className="ap-spec-sep" aria-hidden="true">·</span>
          <span className="ap-spec-part">{part}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

/** Multi-select checkbox affordance — a square control, not a status marker.
 *  Two grounds: 'ink' rides over card photos, 'paper' sits on the ledger row. */
function PickButton({ name, picked, variant, onToggle }) {
  return (
    <button
      type="button"
      className={`ap-pick ap-pick--${variant}${picked ? ' is-picked' : ''}`}
      aria-label={`${picked ? 'Deselect' : 'Select'} ${name}`}
      aria-pressed={picked}
      onClick={(e) => { e.stopPropagation(); onToggle(e.shiftKey); }}
      // Contain only the button's own activation keys — everything else
      // (Escape, J/K, S/A/X) must bubble to the page's keyboard handler.
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') e.stopPropagation();
      }}
    >
      {picked && <Check size={14} color="var(--ag-black, #16130D)" aria-hidden="true" />}
    </button>
  );
}

/** The three triage verbs, icon-only with a shared tooltip treatment. */
function TriageActions({
  a, busy, onShortlist, onAccept, onDecline, light = false,
  labels = DEFAULT_ACTION_LABELS,
}) {
  const shortlisted = a.status === 'shortlisted';
  const cls = `ap-icon${light ? ' ap-icon--light' : ''}`;
  return (
    <>
      {!shortlisted && (
        <button
          type="button"
          className={cls}
          aria-label={withName(labels.shortlist.aria, a.name)}
          data-tip={labels.shortlist.tip}
          disabled={busy}
          onClick={() => onShortlist(a.applicationId)}
        >
          <Star size={15} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className={`${cls} ap-icon--sign`}
        aria-label={withName(labels.accept.aria, a.name)}
        data-tip={labels.accept.tip}
        disabled={busy}
        onClick={() => onAccept(a.applicationId)}
      >
        <Check size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`${cls} ap-icon--pass`}
        aria-label={withName(labels.decline.aria, a.name)}
        data-tip={labels.decline.tip}
        disabled={busy}
        onClick={() => onDecline(a.applicationId)}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </>
  );
}

/** Book view — one sheet on the light table. Photo-led; actions rise on hover. */
function SubmissionCard({ a, index, focused, picked, onToggleSelect, onOpen, onShortlist, onAccept, onDecline, busy, cardRef, onFocus, actionLabels }) {
  const decided = isDecided(a.status);
  const quietStatus = isNew(a.status);
  return (
    <div
      ref={cardRef}
      className={`ap-card${focused ? ' ap-card--focused' : ''}${picked ? ' ap-card--picked' : ''}`}
      role="button"
      tabIndex={0}
      aria-selected={focused || undefined}
      onFocus={onFocus}
      onClick={() => onOpen(a)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
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
          <PickButton
            name={a.name}
            picked={picked}
            variant="ink"
            onToggle={(shift) => onToggleSelect(a.applicationId, index, shift)}
          />
        )}
        {!decided && (
          <span className="ap-card-acts" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <TriageActions a={a} busy={busy} onShortlist={onShortlist} onAccept={onAccept} onDecline={onDecline} labels={actionLabels} light />
          </span>
        )}
      </span>
      <span className="ap-card-row">
        <span className="ap-card-name">{a.name}</span>
      </span>
      <SubmissionSpec a={a} className="ap-card-spec" />
      <span className="ap-card-state">
        <Moment value={a.appliedAt} className="ap-card-when" />
        {!quietStatus && <StatusCell status={a.status} className="ap-card-status" />}
      </span>
    </div>
  );
}

/** Ledger view — the dense scanning row. */
function LedgerRow({ a, index, focused, picked, onToggleSelect, onOpen, onShortlist, onAccept, onDecline, busy, rowRef, onFocus, actionLabels }) {
  const decided = isDecided(a.status);
  return (
    <div
      ref={rowRef}
      className={`ap-row${focused ? ' ap-row--focused' : ''}${picked ? ' ap-row--picked' : ''}`}
      role="button"
      tabIndex={0}
      aria-selected={focused || undefined}
      onFocus={onFocus}
      onClick={() => onOpen(a)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen(a);
        }
      }}
    >
      <span className="ap-pick-cell" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {!decided && (
          <PickButton
            name={a.name}
            picked={picked}
            variant="paper"
            onToggle={(shift) => onToggleSelect(a.applicationId, index, shift)}
          />
        )}
      </span>
      <span className="ap-pic">
        {a.photo ? (
          <span className="ap-pic-img" style={{ backgroundImage: `url(${a.photo})` }} />
        ) : (
          <span className="ap-pic-img ap-pic-img--empty">{initials(a.name)}</span>
        )}
      </span>
      <div className="ap-id">
        <span className="ap-name">{a.name}</span>
        <SubmissionSpec a={a} className="ap-meta" />
      </div>
      <Moment value={a.appliedAt} className="ap-applied" />
      <span className="ap-status">
        {isNew(a.status)
          ? <span className="ap-status-quiet">Submitted</span>
          : <StatusCell status={a.status} />}
      </span>
      <div className="ap-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {decided ? (
          <span className="ap-decided" aria-hidden="true">Decided</span>
        ) : (
          <TriageActions a={a} busy={busy} onShortlist={onShortlist} onAccept={onAccept} onDecline={onDecline} labels={actionLabels} />
        )}
      </div>
    </div>
  );
}

// Board context band — shown only for a selected board: name, one-line brief
// excerpt, where-it-stands, link to the signing room. Visually aligned with /signing.
function BoardBand({ board }) {
  if (!board) return null;
  const identity = resolveBoardIdentity(board);
  const pipeline = board.application_count || 0;
  const waiting = board.submitted_count || 0;
  const represented = board.represented_count || 0;
  const brief = board.description
    ? board.description
    : 'No brief written for this board yet. Add one so every reviewer shares the same point of view.';
  return (
    <motion.section
      className="ap-band"
      aria-label={`${board.name || 'Board'} context`}
      style={boardIdentityStyle(identity)}
      data-letterform={identity.letterform}
      data-treatment={identity.treatment}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="ap-band-plate">
        {identity.logoUrl ? (
          <img className="ap-band-logo" src={identity.logoUrl} alt={identity.label} />
        ) : (
          <span className="ap-band-wordmark">{identity.label}</span>
        )}
        {board.client_name && <span className="ap-band-client">{board.client_name}</span>}
      </div>
      <div className="ap-band-body">
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
      </div>
    </motion.section>
  );
}

/**
 * The submissions desk.
 *
 * Configurable rather than cloneable (ruling R10): passing `openCallLinkId`
 * scopes it to one event call and `lifecycleTabs` relabels the ladder, which
 * is how the organizer's pool triage is this page and not a second inbox.
 */
function ApplicationsPage({
  openCallLinkId = null,
  lifecycleTabs = LIFECYCLE_TABS,
  actionLabels = DEFAULT_ACTION_LABELS,
  title = 'Submissions',
}) {
  const qc = useQueryClient();
  // Board scoping is a representation concept: a board is an agency division.
  // Scoped to one event call, the desk is already the only pool that matters.
  const scopedToCall = Boolean(openCallLinkId);
  // Composed inside the event call page, the desk is a section of that page and
  // its masthead must not be a second <h1>.
  const Title = scopedToCall ? 'h2' : 'h1';
  const [tab, setTab] = useState(lifecycleTabs[0]?.key || 'to_review');
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);
  const [q, setQ] = useState('');
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'ledger' ? 'ledger' : 'book';
    } catch {
      return 'book';
    }
  });
  // The open review IS the URL (`?review=<applicationId>`): a pasted link
  // hands a colleague the same submission, browser back closes the room, and
  // there is no second copy of the state to fall out of sync. Opening pushes
  // a history entry; jumping and closing replace it.
  const [searchParams, setSearchParams] = useSearchParams();
  const reviewId = searchParams.get('review');
  const setReviewId = useCallback((id, { push = false } = {}) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('review', id);
      else next.delete('review');
      return next;
    }, { replace: !push });
  }, [setSearchParams]);
  const [boardId, setBoardId] = useState(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  // Single-row decline confirmation (the mouse-driven "Pass" affordance).
  // The 'x' keyboard shortcut stays instant/reason-less — that fast lane is
  // the point of keyboard triage — this is only the deliberate click path.
  const [declineTarget, setDeclineTarget] = useState(null);
  const [bulkDeclineOpen, setBulkDeclineOpen] = useState(false);

  const rowRefs = useRef([]);
  const sentinelRef = useRef(null);
  const lastPickIndex = useRef(null);

  useEffect(() => {
    if (!filterOpen) return;
    const handleOutsideClick = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [filterOpen]);

  const changeView = useCallback((next) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* private mode */ }
  }, []);

  const boardsQuery = useQuery({
    queryKey: ['agency-boards'],
    queryFn: getBoards,
    staleTime: 60000,
    enabled: !scopedToCall,
  });
  const { data: boards = [] } = boardsQuery;

  // The call id is part of the key: two calls are two working sets, and one
  // must never serve the other's rows out of cache.
  // Debounced so typing does not fire a request per keystroke now that the
  // search term reaches the server.
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(timer);
  }, [q]);

  const serverParams = useMemo(
    () => serverFilterParams(filters, debouncedQ),
    [filters, debouncedQ],
  );

  const allQuery = useQuery({
    // The params are part of the key: a filter change is a different question,
    // not a different view of the same answer.
    queryKey: ['applicants', openCallLinkId, serverParams],
    queryFn: () =>
      getApplicants({
        ...(scopedToCall ? { openCallLinkId } : {}),
        ...serverParams,
      }),
    placeholderData: (previous) => previous,
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

  // Full reconcile — invalidate the desk plus every surface that reads off the
  // same decisions (boards, agency overview). Run on settle so server truth wins.
  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['applicants'] });
    qc.invalidateQueries({ queryKey: ['board-candidates'] });
    qc.invalidateQueries({ queryKey: ['agency-boards'] });
    qc.invalidateQueries({ queryKey: ['agency'] });
  }, [qc]);

  // Which cached query backs the current view, and its raw record shape.
  const activeKey = useCallback(
    () => (boardId == null ? ['applicants', openCallLinkId] : ['board-candidates', boardId]),
    [boardId, openCallLinkId],
  );

  // Write a status into the RAW cache shape for the active query so an actioned
  // row flips synchronously. `['applicants']` records live in data.profiles with
  // field `application_status`; board candidates live in data.candidates with
  // field `backendStatus`. Returns { key, prev } for rollback.
  const applyOptimistic = useCallback((idOrSet, status) => {
    const key = activeKey();
    const ids = idOrSet instanceof Set ? idOrSet : new Set([idOrSet]);
    const prev = qc.getQueryData(key);
    qc.setQueryData(key, (old) => {
      if (!old) return old;
      if (key[0] === 'applicants') {
        if (!Array.isArray(old.profiles)) return old;
        return {
          ...old,
          profiles: old.profiles.map((p) => (ids.has(p.application_id) ? { ...p, application_status: status } : p)),
        };
      }
      if (!Array.isArray(old.candidates)) return old;
      return {
        ...old,
        candidates: old.candidates.map((c) => (ids.has(c.applicationId ?? c.id) ? { ...c, backendStatus: status } : c)),
      };
    });
    return { key, prev };
  }, [qc, activeKey]);

  const rollback = useCallback((ctx) => {
    if (ctx && ctx.prev !== undefined) qc.setQueryData(ctx.key, ctx.prev);
  }, [qc]);

  // Decisions handled this sitting — the room's session ledger. A cumulative
  // count is the cheap, honest guard against the "quota illusion" (a reviewer
  // narrowing their read to the last few verdicts); undo hands the count back.
  const [sessionDecided, setSessionDecided] = useState(0);

  // Reopen / undo — return a submission to a prior standing. The server allows
  // any writable→writable move; this is the mis-key safety net the keyboard
  // fast lane owes its users.
  const reopen = useMutation({
    mutationFn: ({ applicationId: id, status }) => updateCastingApplicationStage(id, { status }),
    onMutate: async ({ applicationId: id, status }) => {
      await qc.cancelQueries({ queryKey: activeKey() });
      return applyOptimistic(id, status);
    },
    onError: (_e, _v, ctx) => { rollback(ctx); toast.error('Could not reopen'); },
    onSuccess: () => { toast.success('Returned to review'); },
    onSettled: () => { refresh(); },
  });
  const reopenRef = useRef(null);
  useEffect(() => { reopenRef.current = reopen.mutate; });
  const undoDecision = useCallback((id, prevStatus) => {
    reopenRef.current?.({ applicationId: id, status: prevStatus || 'submitted' });
    setSessionDecided((n) => Math.max(0, n - 1));
  }, []);

  // One optimistic-mutation recipe shared by all triage verbs. `kind` is a
  // STATUS_FOR key or a literal status. Every success toast carries Undo,
  // restoring the standing the row held before the keystroke.
  const triageOptions = (kind, mutationFn, successMsg) => ({
    mutationFn,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: activeKey() });
      const prevStatus = applicants.find((a) => a.applicationId === id)?.status || 'submitted';
      return { ...applyOptimistic(id, STATUS_FOR[kind] ?? kind), prevStatus };
    },
    onError: (_err, _id, ctx) => { rollback(ctx); toast.error('Action failed'); },
    onSuccess: (_data, id, ctx) => {
      setSessionDecided((n) => n + 1);
      toast.success(successMsg, {
        action: { label: 'Undo', onClick: () => undoDecision(id, ctx?.prevStatus) },
      });
    },
    onSettled: () => { refresh(); },
  });

  const shortlist = useMutation(triageOptions('shortlist', shortlistApplication, actionLabels.shortlist.toast));
  const accept = useMutation(triageOptions('accept', acceptApplication, actionLabels.accept.toast));
  // Decline supports an optional templated reason id (services/decline-reasons.js
  // is the source of truth — see useDeclineReasons). `vars` is either a bare
  // applicationId (instant decline, no reason) or { applicationId, declineReason }.
  const decline = useMutation({
    mutationFn: (vars) => {
      const id = vars?.applicationId || vars;
      const declineReason = (vars && typeof vars === 'object') ? vars.declineReason : null;
      return declineApplication(id, { declineReason });
    },
    onMutate: async (vars) => {
      const id = vars?.applicationId || vars;
      await qc.cancelQueries({ queryKey: activeKey() });
      const prevStatus = applicants.find((a) => a.applicationId === id)?.status || 'submitted';
      return { ...applyOptimistic(id, STATUS_FOR.decline), prevStatus };
    },
    onError: (_err, _vars, ctx) => { rollback(ctx); toast.error('Action failed'); },
    onSuccess: (_data, vars, ctx) => {
      const id = vars?.applicationId || vars;
      setSessionDecided((n) => n + 1);
      toast.success(actionLabels.decline.toast, {
        action: { label: 'Undo', onClick: () => undoDecision(id, ctx?.prevStatus) },
      });
    },
    onSettled: () => { refresh(); },
  });
  const keepOnFile = useMutation(triageOptions('keepOnFile', keepOnFileApplication, 'Kept on file'));
  const requestMore = useMutation(triageOptions('requestMore', requestMoreApplication, 'Requested more digitals'));
  const meeting = useMutation(triageOptions('meeting_requested', requestMeetingApplication, 'Go-see requested'));
  const development = useMutation(triageOptions('development', offerDevelopmentApplication, 'Development offer recorded'));
  const assignBoard = useMutation({
    mutationFn: ({ applicationId: id, boardId }) => assignToBoard(id, boardId),
    onError: () => toast.error('Could not file to board'),
  });
  const inFlight = (shortlist.isPending && shortlist.variables) || (accept.isPending && accept.variables) || (decline.isPending && decline.variables?.applicationId) || (keepOnFile.isPending && keepOnFile.variables) || (requestMore.isPending && requestMore.variables) || (meeting.isPending && meeting.variables) || (development.isPending && development.variables) || (reopen.isPending && reopen.variables?.applicationId) || (assignBoard.isPending && assignBoard.variables?.applicationId) || null;

  const counts = useMemo(() => {
    const c = {};
    lifecycleTabs.forEach((t) => { c[t.key] = applicants.filter((a) => t.match(a.status)).length; });
    c.in_progress = applicants.filter((a) => isInFlightState(a.status)).length;
    c.kept_on_file = applicants.filter((a) => a.status === 'kept_on_file').length;
    c.represented = applicants.filter((a) => isRepresentedApplicationStatus(a.status)).length;
    c.confirmed = applicants.filter((a) => isConfirmedApplicationStatus(a.status)).length;
    c.declined = applicants.filter((a) => a.status === 'declined' || a.status === 'passed').length;
    return c;
  }, [applicants, lifecycleTabs]);

  const toggleFilter = (category, value) => {
    setFilters((prev) => {
      const list = prev[category] || [];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [category]: next };
    });
    setFocusedIndex(-1);
    setVisibleCount(PAGE_SIZE);
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setFocusedIndex(-1);
    setVisibleCount(PAGE_SIZE);
  };

  const activeFilterCount = useMemo(() => {
    let c = 0;
    c += filters.status.length;
    c += filters.talent.length;
    c += filters.source.length;
    c += filters.locations.length;
    return c;
  }, [filters]);

  const hasActiveFilters = activeFilterCount > 0;

  const availableCities = useMemo(() => {
    const cities = new Set();
    applicants.forEach((a) => {
      if (a.city && a.city.trim()) cities.add(a.city.trim());
    });
    return Array.from(cities).sort();
  }, [applicants]);

  const filtered = useMemo(() => {
    const tabConfig = lifecycleTabs.find((t) => t.key === tab) || lifecycleTabs[0];
    let list = applicants.filter((a) => tabConfig.match(a.status));

    // Status filter
    if (filters.status.length > 0) {
      list = list.filter((a) => {
        if (filters.status.includes('in_progress') && isInFlightState(a.status)) return true;
        if (filters.status.includes('on_file') && a.status === 'kept_on_file') return true;
        return false;
      });
    }

    // Talent filter
    if (filters.talent.length > 0) {
      list = list.filter((a) => {
        const isNewFace = a.status === 'development' || a.type === 'new_face' || a.type === 'development';
        if (filters.talent.includes('new_faces') && isNewFace) return true;
        if (filters.talent.includes('existing') && !isNewFace) return true;
        return false;
      });
    }

    // Source filter
    if (filters.source.length > 0) {
      list = list.filter((a) => {
        const src = (a.source || 'open_call').toLowerCase();
        if (filters.source.includes('open_call') && (src === 'open_call' || !a.source)) return true;
        if (filters.source.includes('scouted') && src === 'scouted') return true;
        if (filters.source.includes('referral') && src === 'referral') return true;
        return false;
      });
    }

    // Location filter
    if (filters.locations.length > 0) {
      list = list.filter((a) => a.city && filters.locations.includes(a.city));
    }

    // Search, city, gender, height and date range are NOT re-applied here.
    // The server has already applied them to the whole pool; re-running them
    // over the returned page would be redundant at best, and at worst would
    // hide the difference between "no matches" and "the pool was truncated
    // before your filter ran" — which is the bug this page had.
    return [...list].sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
  }, [applicants, tab, filters, lifecycleTabs]);

  // The endpoint truncates at SUBMISSIONS_HARD_CAP and says so. Left unsaid, a
  // reviewer reads a filtered list as the complete answer to their question.
  const isPoolTruncated = Boolean(activeApplicantsQuery.data?.capped);

  const total = applicants.length;
  // The lead hero figure = what's actually on the desk: submissions still
  // awaiting a decision (new / under review / shortlisted / in-flight), not a
  // lifetime tally. Reflects the active board when one is selected.
  const activeCount = useMemo(() => applicants.filter((a) => isActive(a.status)).length, [applicants]);

  // The unscoped submission count. When a board is selected the all-scope query
  // is disabled, so we read its cached data to keep the "All submissions" total
  // honest inside the board picker.
  const allSubmissionsCount = useMemo(() => {
    const profiles = allQuery.data?.profiles;
    if (!profiles) return boardId == null ? total : 0;
    return profiles.filter((p) => p.application_id).length;
  }, [allQuery.data, boardId, total]);

  // Review-queue position, derived from the current working set. If the reviewed
  // row has fallen out of `filtered`, reviewRow is null and the panel closes.
  const reviewIndex = reviewId == null ? -1 : filtered.findIndex((a) => a.applicationId === reviewId);
  const reviewRow = reviewIndex >= 0 ? filtered[reviewIndex] : null;

  // Pass rate = how selectively the agency has decided so far. A confirmed
  // event slot is the same kind of outcome as a representation agreement.
  const keptCount = (counts.represented || 0) + (counts.confirmed || 0);
  const passedCount = counts.declined || 0;
  const decidedCount = keptCount + passedCount;
  const passRate = decidedCount ? Math.round((passedCount / decidedCount) * 100) : null;

  // Reset triage focus + windowing whenever the working set changes. Done in the
  // change handlers (not an effect) so we never chain renders off derived state.
  const resetTriage = useCallback(() => {
    setFocusedIndex(-1);
    setVisibleCount(PAGE_SIZE);
    setSelectedIds(new Set());
    setReviewId(null);
    lastPickIndex.current = null;
  }, [setReviewId]);
  const changeTab = useCallback((next) => { setTab(next); resetTriage(); }, [resetTriage]);
  const changeQuery = useCallback((next) => { setQ(next); resetTriage(); }, [resetTriage]);
  const changeBoard = useCallback((next) => { setBoardId(next); resetTriage(); }, [resetTriage]);

  const focusRow = useCallback((i) => {
    const el = rowRefs.current[i];
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  // Latest triage state in a ref so the single keyboard handler binds once.
  const triageRef = useRef({ filtered, focusedIndex, visibleCount, reviewId, helpOpen, selectedIds });

  // ---- Review queue ----
  const openReview = useCallback((a) => { if (a) setReviewId(a.applicationId, { push: true }); }, [setReviewId]);
  const closeReview = useCallback(() => setReviewId(null), [setReviewId]);
  const jumpReview = useCallback((id) => { if (id) setReviewId(id); }, [setReviewId]);
  const goNextReview = useCallback(() => {
    const { filtered: list, reviewId: rid } = triageRef.current;
    const idx = list.findIndex((a) => a.applicationId === rid);
    if (idx < 0 || idx >= list.length - 1) return;
    setReviewId(list[idx + 1].applicationId);
  }, [setReviewId]);
  const goPrevReview = useCallback(() => {
    const { filtered: list, reviewId: rid } = triageRef.current;
    const idx = list.findIndex((a) => a.applicationId === rid);
    if (idx <= 0) return;
    setReviewId(list[idx - 1].applicationId);
  }, [setReviewId]);

  // A decision made from the review room advances to the next row (or closes).
  // The review room now passes an object payload so it can carry structured
  // choices (board destination, pass reason) while still supporting simple
  // string actions from legacy callers.
  const decideFromReview = useCallback((payload) => {
    const { filtered: list, reviewId: rid } = triageRef.current;
    const idx = list.findIndex((a) => a.applicationId === rid);
    if (idx < 0) return;
    const row = list[idx];
    const action = typeof payload === 'string' ? payload : payload?.action;

    // Reopen is the one verb allowed on a decided row; it restores standing
    // and stays put so the booker can re-decide.
    if (action === 'reopen') {
      if (isDecided(row.status)) reopen.mutate({ applicationId: rid, status: 'submitted' });
      return;
    }

    if (isDecided(row.status)) return;
    const nextId = list[idx + 1]?.applicationId ?? null;

    if (action === 'shortlist') {
      if (row.status !== 'shortlisted') shortlist.mutate(rid);
      if (payload?.boardId) assignBoard.mutate({ applicationId: rid, boardId: payload.boardId });
      setReviewId(nextId);
      return;
    }

    if (action === 'decline') {
      // The pass note is house memory: persist it as a real application note
      // as the status flips (the room's reason strip collects it).
      const note = typeof payload === 'object' ? payload?.note : null;
      if (note) {
        createNote(rid, note)
          .then(() => qc.invalidateQueries({ queryKey: ['application', rid] }))
          .catch(() => toast.error('The pass note could not be saved'));
      }
      decline.mutate({ applicationId: rid, declineReason: payload?.reason || null });
    } else {
      const mutation = {
        accept,
        kept_on_file: keepOnFile,
        requested_more: requestMore,
        meeting_requested: meeting,
        development,
      }[action];
      if (!mutation) return;
      mutation.mutate(rid);
    }
    setReviewId(nextId);
  }, [shortlist, accept, decline, keepOnFile, requestMore, meeting, development, assignBoard, reopen, qc, setReviewId]);

  // ---- Multi-select ----
  const toggleSelect = useCallback((applicationId, index, shiftKey) => {
    const list = triageRef.current.filtered;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastPickIndex.current != null) {
        const lo = Math.min(lastPickIndex.current, index);
        const hi = Math.max(lastPickIndex.current, index);
        for (let i = lo; i <= hi; i += 1) {
          const row = list[i];
          if (row && !isDecided(row.status)) next.add(row.applicationId);
        }
      } else {
        const row = list[index];
        if (row && isDecided(row.status)) return prev; // decided rows never select
        if (next.has(applicationId)) next.delete(applicationId);
        else next.add(applicationId);
      }
      return next;
    });
    lastPickIndex.current = index;
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastPickIndex.current = null;
  }, []);

  // The bulk bar speaks the same vocabulary as the row actions: "Offer
  // representation" on a standing call, "Offer slot" on an event cast.
  const bulkVerbs = {
    shortlist: actionLabels.shortlist.bulk,
    accept: actionLabels.accept.bulk,
    decline: actionLabels.decline.bulk,
  };

  const selectableIds = useCallback(() => {
    const list = triageRef.current.filtered;
    return [...triageRef.current.selectedIds].filter((id) => {
      const row = list.find((a) => a.applicationId === id);
      return row && !isDecided(row.status);
    });
  }, []);

  const runBulk = useCallback(async (kind) => {
    const ids = selectableIds();
    if (!ids.length) return;
    const fn = { shortlist: shortlistApplication, accept: acceptApplication }[kind];
    if (!fn) return;
    // Flip the whole batch optimistically; the settle path reconciles from
    // server truth (and we hard-roll-back if the entire batch fails).
    await qc.cancelQueries({ queryKey: activeKey() });
    const snapshot = applyOptimistic(new Set(ids), STATUS_FOR[kind]);
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map((id) => fn(id)));
    setBulkBusy(false);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    const verb = actionLabels[kind]?.toast || 'Done';
    if (ok === 0) { rollback(snapshot); toast.error(`${verb} 0 · ${failed} failed`); }
    else if (failed) toast(`${verb} ${ok} · ${failed} failed`);
    else toast.success(`${verb} ${ok}`);
    clearSelection();
    refresh();
  }, [selectableIds, clearSelection, refresh, qc, activeKey, applyOptimistic, rollback, actionLabels]);

  // Bulk decline is one request carrying one optional reason for the whole
  // batch (POST /applications/bulk-decline) — not a loop of single declines —
  // so the reason picker's confirm goes straight to bulkDeclineApplications.
  const confirmBulkDecline = useCallback(async (declineReason) => {
    const ids = selectableIds();
    setBulkDeclineOpen(false);
    if (!ids.length) return;
    await qc.cancelQueries({ queryKey: activeKey() });
    const snapshot = applyOptimistic(new Set(ids), STATUS_FOR.decline);
    setBulkBusy(true);
    try {
      const result = await bulkDeclineApplications(ids, declineReason);
      const count = result?.count ?? ids.length;
      toast.success(`${actionLabels.decline?.toast || 'Passed'} ${count}`);
    } catch (e) {
      rollback(snapshot);
      toast.error(e?.message || 'Action failed');
    } finally {
      setBulkBusy(false);
      clearSelection();
      refresh();
    }
  }, [selectableIds, clearSelection, refresh, qc, activeKey, applyOptimistic, rollback, actionLabels]);

  // List-mode keyboard triage. Mirrors the review room's advance: act, then if
  // the row leaves the current filtered view, move focus (index + real DOM) to
  // the row that slides into its place. Optimistic updates (P0-1) flip status
  // synchronously, so we predict the next view against the freshly-written status.
  const runAction = useCallback((kind, a) => {
    if (!a) return;
    if (isDecided(a.status)) return;
    if (kind === 'shortlist' && a.status === 'shortlisted') return;
    const mutation = { shortlist, accept, decline }[kind];
    if (!mutation) return;

    const { filtered: list, focusedIndex: cur } = triageRef.current;
    const idx = (cur >= 0 && list[cur]?.applicationId === a.applicationId)
      ? cur
      : list.findIndex((r) => r.applicationId === a.applicationId);

    mutation.mutate(a.applicationId);

    if (idx < 0) return;
    // Search filters on name/city (unaffected by status), so staying in view
    // hinges purely on whether the new status still matches the active tab.
    const matcher = (lifecycleTabs.find((t) => t.key === tab) || lifecycleTabs[0]).match;
    if (matcher(STATUS_FOR[kind])) return; // row remains; leave focus put
    const nextLen = list.length - 1;
    const target = nextLen <= 0 ? -1 : Math.min(idx, nextLen - 1);
    setFocusedIndex(target);
    if (target >= 0) requestAnimationFrame(() => focusRow(target));
  }, [shortlist, accept, decline, tab, focusRow, lifecycleTabs]);

  // Keep the latest triage state fresh so the keyboard handler can bind once.
  // The effective reviewId is nulled when its row is not in view, so the
  // keyboard never falls into review mode with no panel showing.
  useEffect(() => {
    const effectiveReviewId = reviewRow ? reviewId : null;
    triageRef.current = { filtered, focusedIndex, visibleCount, reviewId: effectiveReviewId, helpOpen, selectedIds };
  }, [filtered, focusedIndex, visibleCount, reviewId, reviewRow, helpOpen, selectedIds]);

  // Fresh action closures for the bound-once keyboard handler.
  const kbdRef = useRef(null);
  useEffect(() => {
    kbdRef.current = { openReview, goNextReview, goPrevReview, decideFromReview, runAction, toggleSelect };
  });

  // Warm the neighbours so review-room paging feels instant.
  useEffect(() => {
    if (reviewId == null || reviewIndex < 0) return;
    [filtered[reviewIndex - 1]?.applicationId, filtered[reviewIndex + 1]?.applicationId].forEach((neighborId) => {
      if (!neighborId) return;
      qc.prefetchQuery({
        queryKey: ['application', neighborId],
        queryFn: () => getApplicationDetails(neighborId),
        staleTime: 60000,
      });
    });
  }, [reviewId, reviewIndex, filtered, qc]);

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
      const { filtered: list, focusedIndex: cur, reviewId: rid, helpOpen: help, selectedIds: sel } = triageRef.current;
      const k = kbdRef.current;

      // '?' toggles help from anywhere (never mid-typing / modifier chord).
      if (e.key === '?') {
        if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault(); setHelpOpen((v) => !v); return;
      }

      // Escape unwinds one layer at a time: help → review → selection.
      if (e.key === 'Escape') {
        if (typing) { t.blur(); return; }
        if (help) { setHelpOpen(false); return; }
        if (rid != null) { setReviewId(null); return; }
        if (sel.size > 0) { clearSelection(); return; }
        return;
      }

      // Never hijack keys while the booker is typing or using a modifier chord.
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      // Review open — navigation and decision shortcuts are handled by the review
      // room itself (with confirmation modals for irreversible decisions). Keep
      // this branch so list-mode shortcuts do not also fire through the page.
      if (rid != null) {
        switch (e.key) {
          case 'j': case 'J': case 'k': case 'K': case 'ArrowDown': case 'ArrowUp':
          case 's': case 'S': case 'a': case 'A': case 'x': case 'X':
          case 'ArrowLeft': case 'ArrowRight':
            e.preventDefault();
            break;
          default:
            break;
        }
        return;
      }

      // Review closed — list triage.
      const row = cur >= 0 ? list[cur] : null;
      switch (e.key) {
        case 'j': case 'J': case 'ArrowDown':
          e.preventDefault(); move(1); break;
        case 'k': case 'K': case 'ArrowUp':
          e.preventDefault(); move(-1); break;
        case 'Enter':
          if (row) { e.preventDefault(); k.openReview(row); } break;
        case 's': case 'S':
          if (row) { e.preventDefault(); k.runAction('shortlist', row); } break;
        case 'a': case 'A':
          if (row) { e.preventDefault(); k.runAction('accept', row); } break;
        case 'x': case 'X':
          if (row) { e.preventDefault(); k.runAction('decline', row); } break;
        case ' ': case 'Spacebar':
          if (t && t.tagName === 'BUTTON') return; // let a focused pick button act natively
          if (row) { e.preventDefault(); k.toggleSelect(row.applicationId, cur, false); }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusRow, clearSelection, setReviewId]);

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

  const hasActiveFilter = tab !== 'to_review' || Boolean(q.trim()) || hasActiveFilters;
  const isGenuineEmpty = applicants.length === 0;
  const hasNoResults = !isGenuineEmpty && filtered.length === 0;
  const visible = filtered.slice(0, visibleCount);

  const retrySubmissions = () => {
    boardsQuery.refetch();
    activeApplicantsQuery.refetch();
  };

  if (isLoading) {
    return (
      <div className="ap ap-loading" role="status" aria-live="polite" aria-busy="true">
        <header className="ap-hero"><Title className="ap-title">{title}</Title></header>
        <SkeletonStrip count={2} />
        <div className="ap-book"><SkeletonCard count={10} /></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="ap">
        <header className="ap-hero"><Title className="ap-title">{title}</Title></header>
        <EmptyErrorState
          title="Submissions unavailable"
          body="We could not load the current intake. Try again to resume review."
          retry={{ label: 'Try again', onClick: retrySubmissions }}
        />
      </div>
    );
  }

  const selectionMode = selectedIds.size > 0;

  const rowProps = (a, i) => ({
    a,
    index: i,
    focused: focusedIndex === i,
    picked: selectedIds.has(a.applicationId),
    onToggleSelect: toggleSelect,
    busy: inFlight === a.applicationId,
    onFocus: () => setFocusedIndex(i),
    onOpen: openReview,
    actionLabels,
    onShortlist: () => shortlist.mutate(a.applicationId),
    onAccept: () => accept.mutate(a.applicationId),
    onDecline: () => setDeclineTarget(a),
  });

  return (
    <div className="ap">
      {/* THE DESK SLIP — hero masthead. The title row carries the command bar;
          beneath it, the desk's two governing figures in the serif-ledger
          vocabulary the Overview hero speaks. */}
      <header className="ap-hero">
        <div className="ap-hero-top">
          <Title className="ap-title">{title}</Title>

          {/* One command bar — every control shares the same vocabulary. */}
          <div className="ap-bar" role="toolbar" aria-label="Submission controls">
          {!scopedToCall && (
            <BoardSelect
              boards={boards}
              value={boardId}
              onChange={(idOrNull) => changeBoard(idOrNull)}
              totalAll={allSubmissionsCount}
            />
          )}
          <div className="ap-search">
            <Search size={14} aria-hidden="true" />
            <input
              placeholder="Search by name or city…"
              value={q}
              onChange={(e) => changeQuery(e.target.value)}
              aria-label="Search submissions"
            />
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
            <span className="ap-hero-fig ap-hero-fig--lead">{activeCount}</span>
          </div>
          <div className="ap-hero-stat">
            <span className="ap-hero-lab">Pass rate</span>
            <span className={`ap-hero-fig${passRate == null ? ' ap-hero-fig--mute' : ''}`}>
              {passRate == null ? '—' : `${passRate}%`}
            </span>
          </div>
        </motion.div>
      </header>

      {/* STAGE RAIL — decision lifecycle tabs (where is this submission in the review process?)
          and FILTERS dropdown (what kind of submissions do I want to see?). */}
      <div className="ap-rail" role="tablist" aria-label="Submission decision lifecycle">
        <div className="ap-rail-tabs" role="presentation">
          {lifecycleTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`ap-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls="ap-results"
              className={`ap-tab${tab === t.key ? ' ap-tab--on' : ''}`}
              onClick={() => changeTab(t.key)}
            >
              <span className="ap-tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Filter dropdown panel */}
        <div className="ap-rail-filters" ref={filterRef}>
          <button
            type="button"
            className={`ap-filter-btn${hasActiveFilters ? ' is-active' : ''}${filterOpen ? ' is-open' : ''}`}
            aria-expanded={filterOpen}
            aria-label="Filter submissions"
            onClick={() => setFilterOpen((o) => !o)}
          >
            <span>FILTERS</span>
            {activeFilterCount > 0 && <span className="ap-filter-badge">{activeFilterCount}</span>}
            <ChevronDown size={14} className="ap-filter-chevron" aria-hidden="true" />
          </button>

          <AnimatePresence>
            {filterOpen && (
              <motion.div
                className="ap-filter-popover"
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="ap-filter-head">
                  <span className="ap-filter-title">Filters</span>
                  {hasActiveFilters && (
                    <button type="button" className="ap-filter-reset" onClick={resetFilters}>
                      Reset all
                    </button>
                  )}
                </div>

                <div className="ap-filter-body">
                  {/* STATUS GROUP */}
                  <div className="ap-filter-group">
                    <span className="ap-filter-group-label">STATUS</span>
                    <label className="ap-filter-option">
                      <input
                        type="checkbox"
                        checked={filters.status.includes('in_progress')}
                        onChange={() => toggleFilter('status', 'in_progress')}
                      />
                      <span>In progress</span>
                    </label>
                    <label className="ap-filter-option">
                      <input
                        type="checkbox"
                        checked={filters.status.includes('on_file')}
                        onChange={() => toggleFilter('status', 'on_file')}
                      />
                      <span>On file</span>
                    </label>
                  </div>

                  {/* TALENT GROUP */}
                  <div className="ap-filter-group">
                    <span className="ap-filter-group-label">TALENT</span>
                    <label className="ap-filter-option">
                      <input
                        type="checkbox"
                        checked={filters.talent.includes('new_faces')}
                        onChange={() => toggleFilter('talent', 'new_faces')}
                      />
                      <span>New faces</span>
                    </label>
                    <label className="ap-filter-option">
                      <input
                        type="checkbox"
                        checked={filters.talent.includes('existing')}
                        onChange={() => toggleFilter('talent', 'existing')}
                      />
                      <span>Existing talent</span>
                    </label>
                  </div>

                  {/* SOURCE GROUP */}
                  <div className="ap-filter-group">
                    <span className="ap-filter-group-label">SOURCE</span>
                    <label className="ap-filter-option">
                      <input
                        type="checkbox"
                        checked={filters.source.includes('open_call')}
                        onChange={() => toggleFilter('source', 'open_call')}
                      />
                      <span>Open call</span>
                    </label>
                    <label className="ap-filter-option">
                      <input
                        type="checkbox"
                        checked={filters.source.includes('scouted')}
                        onChange={() => toggleFilter('source', 'scouted')}
                      />
                      <span>Scouted</span>
                    </label>
                    <label className="ap-filter-option">
                      <input
                        type="checkbox"
                        checked={filters.source.includes('referral')}
                        onChange={() => toggleFilter('source', 'referral')}
                      />
                      <span>Referral</span>
                    </label>
                  </div>

                  {/* SERVER-BACKED GROUP — these query the whole pool, not
                      the page. Plain fields, no chips: CLAUDE.md bans corner
                      chips and count bubbles on agency surfaces. */}
                  <div className="ap-filter-group">
                    <span className="ap-filter-group-label">SORT</span>
                    <select
                      className="ap-filter-select"
                      aria-label="Sort submissions"
                      value={filters.sort}
                      onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
                    >
                      {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="ap-filter-group">
                    <span className="ap-filter-group-label">CITY</span>
                    <input
                      className="ap-filter-input"
                      type="text"
                      aria-label="Filter by city"
                      placeholder="Any city"
                      value={filters.city}
                      onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
                    />
                  </div>

                  <div className="ap-filter-group">
                    <span className="ap-filter-group-label">HEIGHT (CM)</span>
                    <div className="ap-filter-range">
                      <input
                        className="ap-filter-input"
                        type="number"
                        inputMode="numeric"
                        aria-label="Minimum height in centimetres"
                        placeholder="Min"
                        value={filters.minHeight}
                        onChange={(e) => setFilters((f) => ({ ...f, minHeight: e.target.value }))}
                      />
                      <span className="ap-filter-range-sep" aria-hidden="true">–</span>
                      <input
                        className="ap-filter-input"
                        type="number"
                        inputMode="numeric"
                        aria-label="Maximum height in centimetres"
                        placeholder="Max"
                        value={filters.maxHeight}
                        onChange={(e) => setFilters((f) => ({ ...f, maxHeight: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="ap-filter-group">
                    <span className="ap-filter-group-label">SUBMITTED</span>
                    <div className="ap-filter-range">
                      <input
                        className="ap-filter-input"
                        type="date"
                        aria-label="Submitted on or after"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                      />
                      <span className="ap-filter-range-sep" aria-hidden="true">–</span>
                      <input
                        className="ap-filter-input"
                        type="date"
                        aria-label="Submitted on or before"
                        value={filters.dateTo}
                        onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* LOCATION GROUP */}
                  {availableCities.length > 0 && (
                    <div className="ap-filter-group">
                      <span className="ap-filter-group-label">LOCATION</span>
                      {availableCities.slice(0, 6).map((city) => (
                        <label key={city} className="ap-filter-option">
                          <input
                            type="checkbox"
                            checked={filters.locations.includes(city)}
                            onChange={() => toggleFilter('locations', city)}
                          />
                          <span>{city}</span>
                        </label>
                      ))}
                    </div>
                  )}

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {activeBoard && <BoardBand board={activeBoard} />}

      {compareOpen && (
        <ComparisonOverlay
          applicationIds={[...selectedIds]}
          onClose={() => setCompareOpen(false)}
        />
      )}

      {isPoolTruncated && (
        <p className="ap-truncation-note">
          This desk is showing the first {SUBMISSIONS_SHOWN_CAP.toLocaleString()} submissions.
          There are more than that on file — narrow by city, date or search and the
          whole pool is searched, not just what is listed here.
        </p>
      )}

      <div className="ap-results" id="ap-results" role="tabpanel" aria-label="Submissions">
      {isGenuineEmpty && (
        <AgencyEmptyState
          title={scopedToCall
            ? 'Nobody has applied to this call yet'
            : activeBoard ? 'No submissions on this board' : 'No submissions yet'}
          description={scopedToCall
            ? 'Share the call link. Applicants arrive here the moment they submit.'
            : activeBoard
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
        <div className="ap-showing-bar">
          <span className="ap-showing-text">
            showing {filtered.length} {filtered.length === 1 ? 'submission' : 'submissions'}
          </span>
        </div>
      )}

      {!isGenuineEmpty && !hasNoResults && (view === 'book' ? (
        <div className={`ap-book${selectionMode ? ' is-selecting' : ''}`}>
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
        <div className={`ap-list${selectionMode ? ' is-selecting' : ''}`}>
          <div className="ap-row ap-row--head" aria-hidden="true">
            <span />
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
      </div>

      {/* BULK BAR — floats when a selection exists; sits below the review drawer. */}
      <AnimatePresence>
        {selectionMode && (
          <motion.div
            className="ap-bulk"
            role="region"
            aria-label="Bulk actions"
            initial={{ opacity: 0, x: "-50%", y: 8 }}
            animate={{ opacity: 1, x: "-50%", y: 0 }}
            exit={{ opacity: 0, x: "-50%", y: 8 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          >
            <span className="ap-bulk-count">{selectedIds.size} selected</span>
            <span className="ap-bulk-div" aria-hidden="true" />
            <button type="button" className="ap-bulk-act" disabled={bulkBusy} onClick={() => runBulk('shortlist')}>
              <Star size={15} aria-hidden="true" /> {bulkVerbs.shortlist}
            </button>
            <button type="button" className="ap-bulk-act ap-bulk-act--sign" disabled={bulkBusy} onClick={() => runBulk('accept')}>
              <Check size={15} aria-hidden="true" /> {bulkVerbs.accept}
            </button>
            <button type="button" className="ap-bulk-act ap-bulk-act--pass" disabled={bulkBusy} onClick={() => setBulkDeclineOpen(true)}>
              <X size={15} aria-hidden="true" /> {bulkVerbs.decline}
            </button>
            {selectedIds.size >= 2 && selectedIds.size <= 6 && (
              <button
                type="button"
                className="ap-bulk-act"
                disabled={bulkBusy}
                onClick={() => setCompareOpen(true)}
              >
                <Columns3 size={15} aria-hidden="true" /> Compare
              </button>
            )}
            <button type="button" className="ap-bulk-clear" disabled={bulkBusy} onClick={clearSelection}>Clear</button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reviewRow && (
          <ReviewRoom
            key="screening-room"
            applicationId={reviewRow.applicationId}
            row={reviewRow}
            position={{ index: reviewIndex, total: filtered.length }}
            onClose={closeReview}
            onDecide={decideFromReview}
            onJump={jumpReview}
            queue={filtered}
            boards={boards}
            busy={Boolean(inFlight)}
            actionLabels={actionLabels}
            sessionDecided={sessionDecided}
            scopeName={title}
          />
        )}
      </AnimatePresence>

      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

      <DeclineReasonModal
        open={Boolean(declineTarget)}
        talentName={declineTarget?.name}
        busy={decline.isPending}
        onClose={() => setDeclineTarget(null)}
        onConfirm={(declineReason) => {
          decline.mutate(
            { applicationId: declineTarget.applicationId, declineReason },
            { onSuccess: () => setDeclineTarget(null) },
          );
        }}
      />

      <DeclineReasonModal
        open={bulkDeclineOpen}
        count={selectedIds.size}
        busy={bulkBusy}
        onClose={() => setBulkDeclineOpen(false)}
        onConfirm={confirmBulkDecline}
      />
    </div>
  );
}

export default function ApplicationsPageWrapper(props) {
  return (
    <ErrorBoundary>
      <ApplicationsPage {...props} />
    </ErrorBoundary>
  );
}
