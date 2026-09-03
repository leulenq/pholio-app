import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, LayoutGrid, Rows3, ArrowUpRight, ChevronDown } from 'lucide-react';
import {
  getApplicants, getBoards, getCastingBoardPipeline,
  acceptApplication, shortlistApplication, declineApplication, bulkDeclineApplications,
  bulkUpdateCastingApplicationStage,
  keepOnFileApplication, requestMoreApplication, getApplicationDetails,
  requestMeetingApplication, offerDevelopmentApplication, updateCastingApplicationStage,
  createNote,
  assignToBoard,
} from '../api/agency';
import BoardSelect from '../components/BoardSelect';
import { resolveBoardIdentity, boardIdentityStyle } from '../lib/board-identity';
import ReviewRoom from '../components/review/ReviewRoom';
import { SkeletonRow, SkeletonCard, SkeletonStrip, AgencyEmptyState } from '../components/ui';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';
import { EmptyErrorState } from '../../../shared/components/states';
import ShortcutHelp from '../components/ShortcutHelp';
import { CardMeta, Moment } from '../components/meta';
import VerdictBar from '../components/verdict/VerdictBar';
import { useTalentSelection } from '../hooks/useTalentSelection';
import { useAgencyPermissions } from '../hooks/useAgencyPermissions';
import {
  ageNotation, legalActions, restorableStatus, standingOf, standingWord,
} from '../lib/standing';
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
    /* When the standing last moved — what the standing line counts from.
       Absent on an older API response; the line then counts from the
       submission, which is the truth for a row nobody has decided. */
    statusChangedAt: p.status_changed_at ?? p.statusChangedAt ?? null,
    slug: p.slug,
    // What gates a first look: height, age, market. Every one of these
    // renders nothing when the response does not carry it; a card never
    // guesses a measurement.
    heightCm: p.height_cm ?? null,
    age: p.age ?? null,
    ageUnknown: p.ageUnknown,
    isMinor: p.is_minor,
    // The dossier engine's shape, verbatim. Absent on an older API response —
    // the card then says nothing about digitals rather than "none".
    digitalsFreshness: p.digitalsFreshness ?? null,
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
    statusChangedAt: c.statusChangedAt ?? c.status_changed_at ?? null,
    slug: c.slug,
    // The board-candidates route already resolves these; a legacy "178 cm"
    // string is left to `heightFigure`, which reads a number or nothing.
    heightCm: c.heightCm ?? null,
    age: c.age ?? null,
    ageUnknown: c.ageUnknown,
    isMinor: c.isMinor,
    digitalsFreshness: c.digitalsFreshness ?? null,
    // The board-candidates endpoint does not yet resolve identity truth
    // fields — undefined here, same "render nothing" contract as mapRow.
    emailVerified: c.emailVerified,
    identityClaimed: c.identityClaimed,
    identityDisputed: c.identityDisputed,
    identitySource: c.identitySource,
    materialsStatus: c.materialsStatus,
  };
}

/**
 * The notations a submission carries — the least a booker needs to route the
 * decision, in order: the compliance fact, then digitals, then identity.
 *
 * Undefined/null `digitalsFreshness` means the response never carried it (an
 * identity-only row, or an older API) — the card says nothing about digitals
 * rather than claiming there are none.
 */
function submissionNotations(a) {
  const notes = [];
  const ageNote = ageNotation(a);
  if (ageNote) notes.push({ text: ageNote, tone: 'warning' });
  if (a.digitalsFreshness && !a.digitalsFreshness.hasDigitals) {
    notes.push({ text: 'No digitals', tone: 'warning' });
  }
  if (a.identityDisputed) notes.push({ text: 'Identity disputed', tone: 'danger' });
  return notes;
}

/**
 * Where a submission stands, in the words the signing wall uses — one standing
 * model for both surfaces, so a face cannot be `Shortlisted` on one screen and
 * something else on the other (talent-card-metadata §9, defect 1).
 */
function submissionStanding(a) {
  return standingOf({ status: a.status, statusChangedAt: a.statusChangedAt || a.appliedAt });
}

/** Every card and row prints the same content: the figures line, the standing
 *  where the tab does not already say it, then whatever notations are
 *  actionable.
 *
 *  `stage: false` is the ledger, where the standing has a column of its own
 *  and printing it twice in one row is noise, not hierarchy. */
function submissionMeta(a, { stage = true } = {}) {
  const meta = {
    figures: { heightCm: a.heightCm, age: a.age },
    /* `Place` parses the stored free-text location itself and prints the
       city; the full string stays one hover away. */
    context: { city: a.city },
    notations: submissionNotations(a),
  };
  /* The To review tab is already the answer to "where does this stand": a
     line reading `Filed` under every face on it says nothing. */
  if (stage && !isNew(a.status)) {
    const standing = submissionStanding(a);
    meta.stage = { text: standing.text, since: standing.since };
  }
  return meta;
}

/**
 * Book view — one sheet on the light table.
 *
 * A face selects on click, opens on its name or a double click, and carries
 * nothing in its corners: no checkbox, no hover icons over the photo. The
 * verdict bar below is where a decision is taken, on whatever is selected —
 * the same language the signing wall speaks (talent-card-metadata §9).
 */
function SubmissionCard({ a, selected, focused, tabbable, busy, onSelect, onOpen, onFocus }) {
  const ref = useRef(null);

  /* Focus follows the keyboard: J/K move it, and the element it lands on
     takes real DOM focus so the browser scrolls it into view and a screen
     reader reads it. */
  useEffect(() => {
    if (focused && ref.current && document.activeElement !== ref.current) {
      ref.current.focus({ preventScroll: true });
      ref.current.scrollIntoView({ block: 'nearest' });
    }
  }, [focused]);

  return (
    <div
      ref={ref}
      className={`ap-card${focused ? ' ap-card--focused' : ''}${selected ? ' ap-card--selected' : ''}${busy ? ' is-busy' : ''}`}
      role="option"
      aria-selected={selected}
      /* The listbox has one tab stop. Until the keyboard has moved the focus
         it is the first face, so Tab reaches the set at all. */
      tabIndex={focused || tabbable ? 0 : -1}
      data-id={a.applicationId}
      onFocus={() => onFocus(a.applicationId)}
      onClick={(e) => onSelect(a.applicationId, { additive: e.metaKey || e.ctrlKey, range: e.shiftKey })}
      onDoubleClick={() => onOpen(a.applicationId)}
    >
      <span className="ap-card-photo">
        {a.photo ? (
          <span className="ap-card-img" style={{ backgroundImage: `url(${a.photo})` }} />
        ) : (
          <span className="ap-card-img ap-card-img--empty">{initials(a.name)}</span>
        )}
      </span>
      {/* The name IS the way in — a scrim over the face carrying the word
          "Open" would hide the one thing the card is for. */}
      <span className="ap-card-row">
        <button
          type="button"
          className="ap-card-name"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); onOpen(a.applicationId); }}
        >
          {a.name}
        </button>
      </span>
      <CardMeta className="ap-card-spec" {...submissionMeta(a)} />
    </div>
  );
}

/** Ledger view — the dense scanning row. A table earns its columns; the
 *  standing lives in one of them rather than under the name. */
function LedgerRow({ a, selected, focused, tabbable, busy, onSelect, onOpen, onFocus }) {
  const ref = useRef(null);
  const standing = submissionStanding(a);

  useEffect(() => {
    if (focused && ref.current && document.activeElement !== ref.current) {
      ref.current.focus({ preventScroll: true });
      ref.current.scrollIntoView({ block: 'nearest' });
    }
  }, [focused]);

  return (
    <div
      ref={ref}
      className={`ap-row${focused ? ' ap-row--focused' : ''}${selected ? ' ap-row--selected' : ''}${busy ? ' is-busy' : ''}`}
      role="option"
      aria-selected={selected}
      tabIndex={focused || tabbable ? 0 : -1}
      data-id={a.applicationId}
      onFocus={() => onFocus(a.applicationId)}
      onClick={(e) => onSelect(a.applicationId, { additive: e.metaKey || e.ctrlKey, range: e.shiftKey })}
      onDoubleClick={() => onOpen(a.applicationId)}
    >
      <span className="ap-pic">
        {a.photo ? (
          <span className="ap-pic-img" style={{ backgroundImage: `url(${a.photo})` }} />
        ) : (
          <span className="ap-pic-img ap-pic-img--empty">{initials(a.name)}</span>
        )}
      </span>
      <div className="ap-id">
        <button
          type="button"
          className="ap-name"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); onOpen(a.applicationId); }}
        >
          {a.name}
        </button>
        <CardMeta className="ap-meta" {...submissionMeta(a, { stage: false })} />
      </div>
      <Moment value={a.appliedAt} className="ap-applied" />
      {/* The same words the card prints, as plain type: a state is not a
          designed cell, and a tinted box around it is a badge by another
          name. */}
      <span className="ap-status">
        {standing.text}
        {standing.since && <span className="ap-status-since">{standing.since}</span>}
      </span>
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

/** The comparison overlay's ceiling, and the desk's. */
const LINEUP_LIMIT = 6;

/** Which permission each verb needs. Absent = always allowed. */
const ACTION_PERMISSION = {
  shortlist: 'applications.update_status',
  request_digitals: 'applications.update_status',
  invite_meeting: 'applications.update_status',
  keep_on_file: 'applications.update_status',
  reopen: 'applications.update_status',
  offer: 'applications.accept',
  development: 'applications.accept',
  pass: 'applications.decline',
  file_to_board: 'boards.assign_application',
};

/** What the same verb needs when it is taken against a set, not a person. A
 *  batch write is its own permission on the server (route-permissions.js);
 *  gating a bulk shortlist against the single-write grant is how a seat gets a
 *  control the API will refuse. */
const BULK_ACTION_PERMISSION = {
  shortlist: 'applications.bulk_update_status',
  keep_on_file: 'applications.bulk_update_status',
  pass: 'applications.bulk_decline',
};

/**
 * The inbox's verb set for the shared verdict bar.
 *
 * Curated, not copied: the desk files to a board and shortlists a batch, which
 * a board meeting never does, and it has no `Mark represented`, which is the
 * wall's own verb. Everything else — the arming, the keys, the ink register —
 * is the one language both surfaces speak.
 */
const INBOX_VERBS = [
  { action: 'open', label: 'Open', key: 'Enter', kind: 'plain' },
  { action: 'lineup', label: 'Line up', key: 'L', kind: 'plain', bulk: true, max: LINEUP_LIMIT },
  { action: 'shortlist', label: 'Shortlist', key: 'S', kind: 'plain', bulk: true },
  { action: 'request_digitals', label: 'Request digitals', key: 'D', kind: 'plain' },
  { action: 'invite_meeting', label: 'Invite to meet', key: 'M', kind: 'plain' },
  { action: 'keep_on_file', label: 'Keep on file', key: 'F', kind: 'plain', bulk: true },
  { action: 'reopen', label: 'Reopen', kind: 'plain' },
  { action: 'clear', label: 'Clear', key: 'Esc', kind: 'plain', single: false, bulk: true },
  { action: 'pass', label: 'Pass', key: 'X', kind: 'arm', armLabel: 'Confirm pass', bulk: true },
  { action: 'file_to_board', label: 'File to board', key: 'B', kind: 'arm' },
  { action: 'offer', label: 'Offer representation', key: 'A', kind: 'arm' },
];

/**
 * One row per verb the bar can fire: the standing the optimistic write
 * records, the call for one id, the batch route where one exists (its absence
 * is what makes a verb single-only), and the toast in the agency register
 * (signing spec §4.3).
 */
const VERB_API = {
  shortlist: {
    status: 'shortlisted',
    single: (id) => shortlistApplication(id),
    bulk: (ids) => bulkUpdateCastingApplicationStage(ids, { status: 'shortlisted' }),
    toast: (name) => `Shortlisted ${name}`,
    bulkToast: (n) => `${n} shortlisted`,
  },
  request_digitals: {
    status: 'requested_more',
    single: (id) => requestMoreApplication(id),
    toast: (name) => `Digitals requested from ${name}`,
  },
  invite_meeting: {
    status: 'meeting_requested',
    single: (id) => requestMeetingApplication(id),
    toast: (name) => `Meeting requested with ${name}`,
  },
  offer: {
    status: 'accepted',
    single: (id) => acceptApplication(id),
    toast: (name) => `Offer sent to ${name}`,
  },
  development: {
    status: 'development',
    single: (id) => offerDevelopmentApplication(id),
    toast: (name) => `Development offer sent to ${name}`,
  },
  keep_on_file: {
    status: 'kept_on_file',
    single: (id) => keepOnFileApplication(id),
    bulk: (ids) => bulkUpdateCastingApplicationStage(ids, { status: 'kept_on_file' }),
    toast: (name) => `${name} kept on file`,
    bulkToast: (n) => `${n} kept on file`,
  },
  pass: {
    status: 'declined',
    single: (id, opts) => declineApplication(id, { declineReason: opts?.declineReason || null }),
    bulk: (ids, opts) => bulkDeclineApplications(ids, opts?.declineReason || null),
    toast: (name) => `Passed on ${name}`,
    bulkToast: (n) => `Passed on ${n}`,
  },
  reopen: {
    status: 'shortlisted',
    single: (id) => updateCastingApplicationStage(id, { status: 'shortlisted' }),
    toast: (name) => `Reopened ${name}`,
  },
};

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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [helpOpen, setHelpOpen] = useState(false);
  const [lineupIds, setLineupIds] = useState([]);
  /* The verdict bar reports its own arming so the page can stand down from
     Enter and Escape while a decision is one keystroke from being taken. */
  const [barArmed, setBarArmed] = useState(false);
  const [typing, setTyping] = useState(false);
  const [busyIds, setBusyIds] = useState(() => new Set());

  const { can } = useAgencyPermissions();
  const sentinelRef = useRef(null);

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
  /* The server params are part of the key because they are part of the
     question: an optimistic write keyed on a prefix would silently miss the
     cache entry the view is actually reading. */
  const activeKey = useCallback(
    () => (boardId == null
      ? ['applicants', openCallLinkId, serverParams]
      : ['board-candidates', boardId]),
    [boardId, openCallLinkId, serverParams],
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
    setVisibleCount(PAGE_SIZE);
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
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

  // ---- selection ----
  /* One selection language with the signing wall: click selects, cmd/ctrl
     toggles, shift ranges along the visible order (spec §9, defect 2). The
     order is the filtered working set, so a range picked in the book means
     the same thing in the ledger. */
  const filteredIds = useMemo(() => filtered.map((a) => a.applicationId), [filtered]);
  const selection = useTalentSelection(filteredIds);
  const { selectedIds } = selection;
  const selected = useMemo(
    () => filtered.filter((a) => selectedIds.has(a.applicationId)),
    [filtered, selectedIds],
  );

  // Reset triage focus + windowing whenever the working set changes. Done in the
  // change handlers (not an effect) so we never chain renders off derived state.
  const resetTriage = useCallback(() => {
    setVisibleCount(PAGE_SIZE);
    selection.clear();
    setLineupIds([]);
    setReviewId(null);
  }, [setReviewId, selection]);
  const changeTab = useCallback((next) => { setTab(next); resetTriage(); }, [resetTriage]);
  const changeQuery = useCallback((next) => { setQ(next); resetTriage(); }, [resetTriage]);
  const changeBoard = useCallback((next) => { setBoardId(next); resetTriage(); }, [resetTriage]);
  /* A selection belongs to the set a booker can see, so the third way that set
     changes underneath one — the book/ledger toggle — clears it too. */
  const changeView = useCallback((next) => {
    setView(next);
    selection.clear();
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* private mode */ }
  }, [selection]);

  /* Focus can walk past the rendered window; the window is derived so it
     already reaches the focused row on the render that moved the focus,
     rather than the focus stopping at an invisible edge. */
  const { focusedId } = selection;
  const focusIndex = focusedId ? filteredIds.indexOf(focusedId) : -1;
  const windowSize = Math.max(visibleCount, focusIndex + 1);

  // Latest triage state in a ref so the single keyboard handler binds once.
  const triageRef = useRef({ filtered, reviewId, helpOpen });

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

  // ---- the verdict bar ----
  /* What the standing allows, then what this seat is allowed to do. An action
     a status makes meaningless, or one the viewer cannot perform, is absent
     rather than disabled: a row of greyed verbs is how a bar stops being
     readable. */
  const legal = useMemo(() => {
    const raw = legalActions(selected.map((a) => a.status));
    /* Filing to a board is the inbox's own verb and not part of the standing
       ladder: it is legal on anything still on the desk, and meaningless on a
       submission that has already been decided. */
    if (selected.length === 1 && !isDecided(selected[0].status)) raw.add('file_to_board');
    const bulk = selected.length > 1;
    return new Set([...raw].filter((action) => {
      const permission = (bulk && BULK_ACTION_PERMISSION[action]) || ACTION_PERMISSION[action];
      return !permission || can(permission);
    }));
  }, [selected, can]);

  const markBusy = useCallback((ids, on) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  const nameFor = useCallback(
    (id) => triageRef.current.filtered.find((a) => a.applicationId === id)?.name || 'Unnamed applicant',
    [],
  );

  /**
   * Undo: PATCH each id back to the standing it held. It restores the record,
   * not the notification — the toast copy is careful about that difference,
   * and it names the standing that was actually written, never the raw prior.
   */
  const undoVerb = useCallback(async (priors) => {
    const restore = priors
      .map((prior) => ({ id: prior.id, status: restorableStatus(prior.status) }))
      .filter((prior) => prior.status);
    if (restore.length === 0) return;
    const ids = restore.map((prior) => prior.id);
    await qc.cancelQueries({ queryKey: activeKey() });
    /* One snapshot, taken before the first write: a snapshot per row would
       capture a cache the previous row had already mutated. */
    const snapshot = { key: activeKey(), prev: qc.getQueryData(activeKey()) };
    restore.forEach((prior) => applyOptimistic(prior.id, prior.status));
    markBusy(ids, true);
    try {
      await Promise.all(restore.map((prior) => updateCastingApplicationStage(prior.id, { status: prior.status })));
      setSessionDecided((n) => Math.max(0, n - restore.length));
      toast.success(restore.length === 1
        ? `Restored ${nameFor(restore[0].id)} to ${standingWord(restore[0].status)}`
        : `Restored ${restore.length} to prior standing`);
    } catch {
      rollback(snapshot);
      toast.error('Action failed');
    } finally {
      markBusy(ids, false);
      refresh();
    }
  }, [qc, activeKey, applyOptimistic, rollback, refresh, markBusy, nameFor]);

  /** The toast every decision ends on: the words, and Undo where the prior
   *  standing is one an agency may write back. */
  const settle = useCallback((message, priors) => {
    setSessionDecided((n) => n + priors.length);
    const undoable = priors.every((prior) => restorableStatus(prior.status));
    toast.success(
      message,
      undoable ? { action: { label: 'Undo', onClick: () => undoVerb(priors) } } : undefined,
    );
  }, [undoVerb]);

  /**
   * File a submission to a board. The confirm shortlists a face nobody has
   * shortlisted yet — a name on a board that is still sitting in "To review"
   * is a board with an unread name on it — and then assigns it.
   */
  const fileToBoard = useCallback(async (row, { boardId: destId, boardName }) => {
    if (!row || !destId) return;
    const id = row.applicationId;
    const prior = row.status;
    const shouldShortlist = isNew(prior);
    await qc.cancelQueries({ queryKey: activeKey() });
    const snapshot = applyOptimistic(id, shouldShortlist ? 'shortlisted' : prior);
    markBusy([id], true);
    try {
      if (shouldShortlist) await shortlistApplication(id);
      await assignToBoard(id, destId);
    } catch (e) {
      rollback(snapshot);
      toast.error(e?.message || 'Could not file to board');
      return;
    } finally {
      markBusy([id], false);
      refresh();
    }
    /* Undo restores the standing, which is all it has ever claimed to do:
       the toast never says the board assignment was taken back. */
    settle(`Filed ${row.name} to ${boardName}`, [{ id, status: prior }]);
  }, [qc, activeKey, applyOptimistic, rollback, refresh, markBusy, settle]);

  /**
   * Every verb the bar fires, against the current selection. The optimistic
   * write flips the rows synchronously so the tab re-sorts under the hand;
   * the settle path reconciles from server truth.
   */
  const runVerb = useCallback(async (action, opts = {}) => {
    const rows = selected;
    if (rows.length === 0) return;

    if (action === 'file_to_board') {
      await fileToBoard(rows[0], opts);
      selection.clear();
      return;
    }

    const spec = VERB_API[action];
    const ids = rows.map((a) => a.applicationId);
    if (!spec) return;
    if (ids.length > 1 && !spec.bulk) return;

    const priors = rows.map((a) => ({ id: a.applicationId, status: a.status || 'submitted' }));
    // A verdict settles the working set: the faces move to their new standing
    // and the bar steps back, the way the Review Room advances.
    selection.clear();

    await qc.cancelQueries({ queryKey: activeKey() });
    const snapshot = applyOptimistic(new Set(ids), spec.status);
    markBusy(ids, true);
    try {
      if (ids.length > 1) await spec.bulk(ids, opts);
      else await spec.single(ids[0], opts);
    } catch (e) {
      rollback(snapshot);
      markBusy(ids, false);
      toast.error(e?.message || 'Action failed');
      return;
    }

    // The house note rides alongside a pass; a failed note must not read as a
    // failed decision, so it is reported on its own.
    const note = typeof opts.note === 'string' ? opts.note.trim() : '';
    if (note) {
      const results = await Promise.allSettled(ids.map((id) => createNote(id, note)));
      if (results.some((r) => r.status === 'rejected')) toast.error('Could not save the note');
    }

    markBusy(ids, false);
    settle(
      ids.length > 1 ? spec.bulkToast(ids.length) : spec.toast(rows[0].name),
      priors,
    );
    refresh();
  }, [selected, selection, fileToBoard, qc, activeKey, applyOptimistic, rollback, refresh, markBusy, settle]);

  const openLineup = useCallback(() => {
    const ids = selection.selectedInOrder().slice(0, LINEUP_LIMIT);
    if (ids.length < 2) return;
    setLineupIds(ids);
  }, [selection]);

  // Keep the latest triage state fresh so the keyboard handler can bind once.
  // The effective reviewId is nulled when its row is not in view, so the
  // keyboard never falls into review mode with no panel showing.
  useEffect(() => {
    const effectiveReviewId = reviewRow ? reviewId : null;
    triageRef.current = { filtered, reviewId: effectiveReviewId, helpOpen };
  }, [filtered, reviewId, reviewRow, helpOpen]);

  // Fresh action closures for the bound-once keyboard handler. `openLineup`
  // closes over the current selection, so routing it through the ref keeps one
  // binding for the life of the surface instead of resubscribing on every click.
  const kbdRef = useRef(null);
  useEffect(() => {
    kbdRef.current = {
      openReview, goNextReview, goPrevReview, decideFromReview,
      selection, openLineup, barArmed, lineupOpen: lineupIds.length > 0,
    };
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

  /* The bar owns S, D, M, F, B, A, X and N — and Enter and Escape while it is
     armed. What stays here is the surface's own: moving the focus, selecting,
     opening a record, lining a set up, and unwinding one layer at a time. */
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const isTyping = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const { reviewId: rid, helpOpen: help } = triageRef.current;
      const k = kbdRef.current;

      // '?' toggles help from anywhere (never mid-typing / modifier chord).
      if (e.key === '?') {
        if (isTyping || e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault(); setHelpOpen((v) => !v); return;
      }

      /* Escape unwinds one layer at a time, outermost first: help, the review
         room, the lineup, then — once the bar has disarmed itself — the
         selection. An armed verdict owns Escape alone, or one press would
         disarm and clear in the same breath. */
      if (e.key === 'Escape') {
        if (isTyping) { t.blur(); return; }
        if (help) { setHelpOpen(false); return; }
        if (rid != null) { setReviewId(null); return; }
        if (k.lineupOpen) { setLineupIds([]); return; }
        if (k.barArmed) return;
        k.selection.clear();
        return;
      }

      // Never hijack keys while the booker is typing or using a modifier chord.
      if (isTyping || e.metaKey || e.ctrlKey || e.altKey) return;

      // Review open — navigation and decision shortcuts are handled by the review
      // room itself. Keep this branch so list-mode shortcuts do not also fire.
      if (rid != null || k.lineupOpen) {
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

      switch (e.key) {
        case 'j': case 'J': case 'ArrowDown': case 'ArrowRight':
          e.preventDefault(); k.selection.moveFocus(1); break;
        case 'k': case 'K': case 'ArrowUp': case 'ArrowLeft':
          e.preventDefault(); k.selection.moveFocus(-1); break;
        case ' ': case 'Spacebar':
          /* On a real control Space is that control's own activation. Taking
             it here as well would press the button and toggle a card. */
          if (t && (t.tagName === 'BUTTON' || t.tagName === 'A')) return;
          if (k.selection.focusedId) {
            e.preventDefault();
            k.selection.toggle(k.selection.focusedId);
          }
          break;
        case 'Enter':
          /* An armed verdict has already claimed Enter as its confirmation. */
          if (k.barArmed) break;
          if (k.selection.focusedId) {
            e.preventDefault();
            setReviewId(k.selection.focusedId, { push: true });
          }
          break;
        case 'l': case 'L':
          e.preventDefault(); k.openLineup(); break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setReviewId]);

  /* The bar's own note field is inside the bar, not another layer over it:
     focusing it must silence the PAGE's keys without unmounting the armed
     strip the field belongs to. So a field inside `.sbv-bar` is typing for the
     page and not for the bar. */
  useEffect(() => {
    const onFocusChange = () => {
      const el = document.activeElement;
      const inBar = Boolean(el && typeof el.closest === 'function' && el.closest('.sbv-bar'));
      const tag = el?.tagName;
      const isField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable;
      setTyping(Boolean(isField) && !inBar);
    };
    document.addEventListener('focusin', onFocusChange);
    document.addEventListener('focusout', onFocusChange);
    return () => {
      document.removeEventListener('focusin', onFocusChange);
      document.removeEventListener('focusout', onFocusChange);
    };
  }, []);

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
  const visible = filtered.slice(0, windowSize);

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
  const barActive = !reviewRow && !helpOpen && lineupIds.length === 0 && !typing;

  const rowProps = (a, i) => ({
    a,
    selected: selectedIds.has(a.applicationId),
    focused: selection.focusedId === a.applicationId,
    tabbable: !selection.focusedId && i === 0,
    busy: busyIds.has(a.applicationId) || inFlight === a.applicationId,
    onFocus: selection.setFocused,
    onSelect: selection.select,
    onOpen: (id) => setReviewId(id, { push: true }),
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
        <div
          className={`ap-book${selectionMode ? ' is-selecting' : ''}`}
          role="listbox"
          aria-multiselectable="true"
          aria-label="Submissions"
        >
          {visible.map((a, i) => (
            <SubmissionCard key={a.applicationId} {...rowProps(a, i)} />
          ))}
          {windowSize < filtered.length && (
            <div ref={sentinelRef} className="ap-sentinel ap-sentinel--book" aria-hidden="true">
              <SkeletonCard count={5} />
            </div>
          )}
        </div>
      ) : (
        <div className={`ap-list${selectionMode ? ' is-selecting' : ''}`}>
          <div className="ap-row ap-row--head" aria-hidden="true">
            <span />
            <span>Talent</span>
            <span>Submitted</span>
            <span>Status</span>
          </div>
          <div role="listbox" aria-multiselectable="true" aria-label="Submissions">
            {visible.map((a, i) => (
              <LedgerRow key={a.applicationId} {...rowProps(a, i)} />
            ))}
          </div>
          {windowSize < filtered.length && (
            <div ref={sentinelRef} className="ap-sentinel" aria-hidden="true">
              <SkeletonRow count={3} />
            </div>
          )}
        </div>
      ))}
      </div>

      {/* THE VERDICT BAR — the same ink bar the signing wall works from,
          carrying the inbox's own verb set. */}
      <VerdictBar
        selected={selected}
        verbs={INBOX_VERBS}
        legal={legal}
        boards={boards}
        busy={busyIds.size > 0}
        active={barActive}
        sessionDecided={sessionDecided}
        onAction={runVerb}
        onOpen={() => {
          const [first] = selection.selectedInOrder();
          if (first) setReviewId(first, { push: true });
        }}
        onLineUp={openLineup}
        onClear={selection.clear}
        onArmingChange={setBarArmed}
      />

      {lineupIds.length > 0 && (
        <ComparisonOverlay applicationIds={lineupIds} onClose={() => setLineupIds([])} />
      )}

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

      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} surface="submissions" />

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
