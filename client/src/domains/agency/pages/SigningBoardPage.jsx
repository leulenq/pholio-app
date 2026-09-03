import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, LayoutGroup } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { getCastingBoardPipeline } from '../api/agency';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';
import ReviewRoom from '../components/review/ReviewRoom';
import ComparisonOverlay from '../components/ComparisonOverlay';
import ShortcutHelp from '../components/ShortcutHelp';
import BoardIdentityEditor from '../components/BoardIdentityEditor';
import { useAgencyPermissions } from '../hooks/useAgencyPermissions';
import {
  resolveBoardIdentity, boardIdentityStyle, resolveBoardType, BOARD_VOCAB,
} from '../lib/board-identity';
import BoardMasthead from './signing/BoardMasthead';
import Wall, { WallSkeleton } from './signing/Wall';
import Ledger from './signing/Ledger';
import Shelves from './signing/Shelves';
import {
  groupCandidates, inPlayOrder, boardOrder, standingOf, legalActions, candidateId,
} from './signing/boardModel';
import { useBoardSelection } from './signing/useBoardSelection';
import { useBoardDecisions } from './signing/useBoardDecisions';
import BoardVerdictBar from './signing/BoardVerdictBar';
import './signing/SigningBoard.css';

/* ────────────────────────────────────────────────────────────────────
   The Signing Board.

   The wall in a new-faces office: the set pinned up as faces, walked top to
   bottom in decision order, argued over against each other and against who is
   already on the board. Signing is never decided one face at a time, so this
   surface is comparative by construction — the wall, the ledger, the lineup
   and one armed verdict bar, all reading from one selection.

   Deliberately not a Kanban. A stage change here notifies the talent; drag
   and drop would make a consequential decision feel like tidying, skip the
   pass reason, and offer no arming step. Every decision goes through the same
   armed, undoable idiom the Review Room established.

   Spec: docs/superpowers/specs/2026-09-01-signing-board-design.md
   ──────────────────────────────────────────────────────────────────── */

/** Which permission each action needs. Absent = always allowed. */
const ACTION_PERMISSION = {
  shortlist: 'applications.update_status',
  request_digitals: 'applications.update_status',
  invite_meeting: 'applications.update_status',
  keep_on_file: 'applications.update_status',
  represent: 'applications.update_status',
  reopen: 'applications.update_status',
  offer: 'applications.accept',
  development: 'applications.accept',
  pass: 'applications.decline',
};

/** What the same action needs when it is taken against a set, not a person.
 *  A batch write is its own permission on the server (route-permissions.js);
 *  gating a bulk keep-on-file against the single-write grant is how a seat
 *  gets a control the API will refuse. */
const BULK_ACTION_PERMISSION = {
  keep_on_file: 'applications.bulk_update_status',
  pass: 'applications.bulk_decline',
};

/** The Review Room's decision vocabulary, translated to board actions. */
/** The comparison overlay's ceiling, and the board's (spec §2.4). */
const LINEUP_LIMIT = 6;

const REVIEW_ACTION = {
  shortlist: 'shortlist',
  accept: 'offer',
  development: 'development',
  requested_more: 'request_digitals',
  meeting_requested: 'invite_meeting',
  kept_on_file: 'keep_on_file',
  decline: 'pass',
  reopen: 'reopen',
};

const isTypingTarget = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

/* The verdict bar's own note field is inside the bar, not another layer over
   it: focusing it must silence the WALL's keys without unmounting the armed
   strip the field belongs to. So a field inside `.sbv-bar` is typing for the
   page and not for the bar. */
const isInVerdictBar = (el) => Boolean(el && typeof el.closest === 'function' && el.closest('.sbv-bar'));

/* Space is the wall's select. On a real control it is that control's own
   activation, and letting both happen fires the button and toggles a tile. */
const isActivatableTarget = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'BUTTON' || tag === 'A' || tag === 'INPUT'
    || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

function SigningBoardPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const { can } = useAgencyPermissions();

  /* The view, the open record and the lineup ARE the URL. A pasted link hands
     a colleague the same wall in the same state, and browser back closes a
     layer instead of leaving the page. Selection deliberately stays out: it is
     a working gesture, not a place. */
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'ledger' ? 'ledger' : 'wall';
  const reviewId = searchParams.get('review');
  const lineupParamRaw = searchParams.get('lineup');

  const setParam = useCallback((key, value, { push = false } = {}) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: !push });
  }, [setSearchParams]);

  const [identityOpen, setIdentityOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  /* The verdict bar reports its own arming so the page can stand down from
     Enter and Escape while a decision is one keystroke from being taken. */
  const [barArmed, setBarArmed] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['board-candidates', boardId],
    queryFn: () => getCastingBoardPipeline(boardId),
    enabled: !!boardId,
    staleTime: 30000,
  });

  const board = data?.board || null;
  const candidates = useMemo(() => data?.candidates || [], [data]);
  const identity = useMemo(() => resolveBoardIdentity(board || {}), [board]);
  const vocab = useMemo(() => BOARD_VOCAB[resolveBoardType(board || {})], [board]);

  const groups = useMemo(() => groupCandidates(candidates, vocab), [candidates, vocab]);
  const inPlay = useMemo(() => inPlayOrder(groups), [groups]);
  const ordered = useMemo(() => boardOrder(groups), [groups]);
  const orderedIds = useMemo(() => ordered.map(candidateId), [ordered]);
  const byId = useMemo(
    () => new Map(ordered.map((c) => [candidateId(c), c])),
    [ordered],
  );

  /* A pasted `?lineup=` is a claim about this board that has to be checked
     against it: unknown ids are dropped, the set is capped at the overlay's
     six, and a lineup that cannot compare anything is not a lineup — the
     param goes rather than opening an overlay onto nothing. */
  const lineupIds = useMemo(() => {
    if (!lineupParamRaw) return [];
    const seen = new Set();
    const ids = [];
    lineupParamRaw.split(',').forEach((raw) => {
      const id = raw.trim();
      if (!id || seen.has(id) || !byId.has(id)) return;
      seen.add(id);
      if (ids.length < LINEUP_LIMIT) ids.push(id);
    });
    return ids.length >= 2 ? ids : [];
  }, [lineupParamRaw, byId]);

  const lineupClean = lineupIds.join(',');
  useEffect(() => {
    if (!lineupParamRaw || isLoading) return;
    if (lineupClean !== lineupParamRaw) setParam('lineup', lineupClean || null);
  }, [lineupParamRaw, lineupClean, isLoading, setParam]);

  const standingFor = useCallback((c) => standingOf(c, vocab), [vocab]);

  const selection = useBoardSelection(orderedIds);
  const { decide, busyIds, sessionDecided } = useBoardDecisions({ boardId, vocab, byId });

  /* Entrance stagger is a first-load courtesy, not a permanent behaviour. A
     wall that re-choreographs itself after every decision would turn a
     working surface into a slideshow. */
  const enterRef = useRef(true);
  const [enter, setEnter] = useState(true);
  useEffect(() => {
    if (!isLoading && enterRef.current && candidates.length > 0) {
      enterRef.current = false;
      const t = setTimeout(() => setEnter(false), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isLoading, candidates.length]);

  /* ---- layers ---------------------------------------------------------- */

  const openRecord = useCallback((id) => {
    if (id) setParam('review', id, { push: true });
  }, [setParam]);
  const closeReview = useCallback(() => setParam('review', null), [setParam]);
  const jumpReview = useCallback((id) => { if (id) setParam('review', id); }, [setParam]);
  const closeLineup = useCallback(() => setParam('lineup', null), [setParam]);

  const openLineup = useCallback(() => {
    const ids = selection.selectedInOrder().slice(0, LINEUP_LIMIT);
    if (ids.length < 2) return;
    setParam('lineup', ids.join(','), { push: true });
  }, [selection, setParam]);

  const toggleView = useCallback(() => {
    setParam('view', view === 'ledger' ? null : 'ledger');
  }, [setParam, view]);

  const onSelect = useCallback((id, opts) => selection.select(id, opts), [selection]);

  /* ---- the selection and what is legal on it --------------------------- */

  const { selectedIds } = selection;
  /* Read the selection back in WALL order, never click order: the verdict
     bar, the lineup and the review queue all have to agree on the sequence a
     booker sees on the wall. */
  const selected = useMemo(
    () => ordered.filter((c) => selectedIds.has(candidateId(c))),
    [ordered, selectedIds],
  );

  const legal = useMemo(() => {
    const raw = legalActions(selected.map((c) => c.backendStatus || c.status));
    /* Legality by status first, then by what this seat is actually allowed to
       do. An action the viewer cannot perform is absent rather than disabled —
       a row of greyed controls is how a verdict bar stops being readable. */
    const bulk = selected.length > 1;
    return new Set([...raw].filter((action) => {
      const permission = (bulk && BULK_ACTION_PERMISSION[action]) || ACTION_PERMISSION[action];
      return !permission || can(permission);
    }));
  }, [selected, can]);

  /* A record opens from anywhere the set is shown — the wall, the ledger, a
     shelf — so it is resolved against the whole board, not just the queue.
     The queue itself stays in-play: walking a shelf with J/K would be walking
     decisions that are already made. A shelved face therefore opens alone. */
  const reviewCandidate = reviewId ? byId.get(reviewId) || null : null;
  const reviewIndex = reviewId ? inPlay.findIndex((c) => candidateId(c) === reviewId) : -1;
  const inQueue = reviewIndex >= 0;

  const queueRow = useCallback((c) => ({
    applicationId: candidateId(c),
    status: c.backendStatus || c.status || 'submitted',
    photo: c.headshot || c.avatar || null,
    name: c.name,
  }), []);

  const inPlayQueue = useMemo(() => inPlay.map(queueRow), [inPlay, queueRow]);
  const reviewQueue = useMemo(() => {
    if (!reviewCandidate) return inPlayQueue;
    return inQueue ? inPlayQueue : [queueRow(reviewCandidate)];
  }, [reviewCandidate, inQueue, inPlayQueue, queueRow]);
  const reviewPosition = inQueue
    ? { index: reviewIndex, total: inPlayQueue.length }
    : { index: 0, total: 1 };

  const busy = busyIds.size > 0;
  const layerOpen = Boolean(reviewCandidate) || lineupIds.length > 0 || identityOpen || helpOpen;
  const barActive = !layerOpen && !typing;

  /* ---- decisions ------------------------------------------------------- */

  const onAction = useCallback((action, options = {}) => {
    const ids = selection.selectedInOrder();
    if (ids.length === 0) return;
    decide(action, ids, options);
    // A verdict settles the working set: the faces move to their new
    // standing and the bar steps back, the way the Review Room advances.
    selection.clear();
  }, [decide, selection]);

  /* A decision taken inside the Review Room advances the queue, exactly as it
     does on the Submissions desk — the room is the same room, the queue is
     just this board's wall order. */
  const decideFromReview = useCallback((payload) => {
    if (!reviewCandidate) return;
    const raw = typeof payload === 'string' ? payload : payload?.action;
    const action = REVIEW_ACTION[raw];
    if (!action) return;

    /* The room is a window onto this board, not a second authority over it.
       A decision arriving from inside it passes the same two gates the
       verdict bar does — what the standing allows, and what this seat is
       allowed to do — or it does not happen. Without this, opening a signed
       talent's record would offer a way to un-represent them. */
    const status = reviewCandidate.backendStatus || reviewCandidate.status;
    if (!legalActions([status]).has(action)) return;
    const permission = ACTION_PERMISSION[action];
    if (permission && !can(permission)) return;

    const id = candidateId(reviewCandidate);
    if (action === 'reopen') {
      decide('reopen', [id]);
      return;
    }

    const nextId = inQueue
      ? reviewQueue[reviewIndex + 1]?.applicationId ?? null
      : null;
    decide(action, [id], {
      declineReason: typeof payload === 'object' ? payload?.reason || null : null,
      note: typeof payload === 'object' ? payload?.note || null : null,
    });
    setParam('review', nextId);
  }, [can, decide, inQueue, reviewCandidate, reviewIndex, reviewQueue, setParam]);

  /* ---- keyboard -------------------------------------------------------- */

  /* Latest state in a ref so the handler binds once and never goes stale —
     the same pattern the Submissions desk uses. */
  const keysRef = useRef({});
  const lineupOpen = lineupIds.length > 0;
  const reviewOpen = Boolean(reviewCandidate);
  /* The actions ride in the ref alongside the state. `openLineup` closes over
     the current selection, so a dependency on it would resubscribe this
     listener on every click; routing it through the ref keeps one binding for
     the life of the surface. */
  useEffect(() => {
    keysRef.current = {
      selection, view, helpOpen, layerOpen, lineupOpen, identityOpen, reviewOpen,
      barArmed, openLineup, openRecord, toggleView, closeLineup,
    };
  });

  useEffect(() => {
    const onFocusChange = () => {
      const el = document.activeElement;
      setTyping(isTypingTarget(el) && !isInVerdictBar(el));
    };
    document.addEventListener('focusin', onFocusChange);
    document.addEventListener('focusout', onFocusChange);
    return () => {
      document.removeEventListener('focusin', onFocusChange);
      document.removeEventListener('focusout', onFocusChange);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const state = keysRef.current;
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key;

      /* The shortcut card describes the wall's keys, so it belongs to the
         wall: the Review Room and the lineup carry their own. */
      if (key === '?') {
        if (state.reviewOpen || state.lineupOpen) return;
        event.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      if (key === 'Escape') {
        /* One layer at a time, outermost first. The Review Room closes
           itself; below it, the lineup, then — once the bar has disarmed
           itself — the selection. An armed verdict owns Escape alone, or one
           press would disarm and clear in the same breath. */
        if (state.helpOpen) { setHelpOpen(false); return; }
        if (state.reviewOpen) return;
        if (state.lineupOpen) { state.closeLineup(); return; }
        if (state.barArmed) return;
        state.selection.clear();
        return;
      }

      /* Every other key belongs to whatever layer is open. */
      if (state.layerOpen) return;

      switch (key) {
        case 'j':
        case 'J':
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          state.selection.moveFocus(1);
          break;
        case 'k':
        case 'K':
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          state.selection.moveFocus(-1);
          break;
        case ' ':
        case 'Spacebar':
          /* On a real control Space is that control's own activation. Taking
             it here as well would press the button and toggle a tile. */
          if (isActivatableTarget(document.activeElement)) break;
          if (state.selection.focusedId) {
            event.preventDefault();
            state.selection.toggle(state.selection.focusedId);
          }
          break;
        case 'Enter':
          /* An armed verdict has already claimed Enter as its confirmation. */
          if (state.barArmed) break;
          if (state.selection.focusedId) {
            event.preventDefault();
            state.openRecord(state.selection.focusedId);
          }
          break;
        case 'l':
        case 'L':
          event.preventDefault();
          state.openLineup();
          break;
        case 'v':
        case 'V':
          event.preventDefault();
          state.toggleView();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /* ---- render ---------------------------------------------------------- */

  const isFirstUse = !isLoading && !isError && candidates.length === 0;

  return (
    <div
      className="sb"
      style={boardIdentityStyle(identity)}
      data-letterform={identity.letterform}
      data-treatment={identity.treatment}
    >
      <button type="button" className="sb-back" onClick={() => navigate('/dashboard/agency/signing')}>
        <ArrowLeft size={15} aria-hidden="true" /> Signing
      </button>

      <BoardMasthead
        board={board}
        identity={identity}
        vocab={vocab}
        groups={groups}
        onEditIdentity={() => setIdentityOpen(true)}
      />

      {!isLoading && !isError && candidates.length > 0 && (
        <div className="sb-viewbar">
          <button type="button" className="sb-viewtoggle" onClick={toggleView}>
            {view === 'ledger' ? 'Wall' : 'Ledger'}
          </button>
        </div>
      )}

      {isLoading && <WallSkeleton />}

      {isError && (
        <div className="sb-state">
          <p className="sb-state-text">This board could not be loaded.</p>
          <button type="button" className="sb-state-action" onClick={() => refetch()}>Try again</button>
        </div>
      )}

      {isFirstUse && (
        <div className="sb-state">
          <p className="sb-state-text">
            Talent you file to this board from Submissions appear here.
          </p>
          <Link className="sb-state-action" to="/dashboard/agency/submissions">Open Submissions</Link>
        </div>
      )}

      {!isLoading && !isError && candidates.length > 0 && (
        <>
          {view === 'ledger' ? (
            <Ledger
              candidates={ordered}
              standingFor={standingFor}
              selection={selection}
              busyIds={busyIds}
              onSelect={onSelect}
              onOpen={openRecord}
            />
          ) : (
            <LayoutGroup id="signing-board">
              <Wall
                groups={groups}
                vocab={vocab}
                standingFor={standingFor}
                selection={selection}
                busyIds={busyIds}
                enter={enter}
                onSelect={onSelect}
                onOpen={openRecord}
              />
              <Shelves
                groups={groups}
                vocab={vocab}
                standingFor={standingFor}
                selection={selection}
                onSelect={onSelect}
                onOpen={openRecord}
              />
            </LayoutGroup>
          )}
        </>
      )}

      <BoardVerdictBar
        selected={selected}
        vocab={vocab}
        legal={legal}
        busy={busy}
        active={barActive}
        sessionDecided={sessionDecided}
        onAction={onAction}
        onOpen={() => openRecord(selection.selectedInOrder()[0])}
        onLineUp={openLineup}
        onClear={selection.clear}
        onArmingChange={setBarArmed}
      />

      {lineupIds.length > 0 && (
        <ComparisonOverlay applicationIds={lineupIds} onClose={closeLineup} />
      )}

      <AnimatePresence>
        {reviewCandidate && (
          <ReviewRoom
            key="signing-record"
            applicationId={candidateId(reviewCandidate)}
            row={{
              applicationId: candidateId(reviewCandidate),
              name: reviewCandidate.name,
              photo: reviewCandidate.headshot || reviewCandidate.avatar || null,
              status: reviewCandidate.backendStatus || 'submitted',
            }}
            position={reviewPosition}
            queue={reviewQueue}
            busy={busy}
            sessionDecided={sessionDecided}
            scopeName={board?.name || 'Board'}
            onClose={closeReview}
            onJump={jumpReview}
            onDecide={decideFromReview}
          />
        )}
      </AnimatePresence>

      {board && (
        <BoardIdentityEditor board={board} open={identityOpen} onClose={() => setIdentityOpen(false)} />
      )}

      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} surface="board" />
    </div>
  );
}

export default function SigningBoardPageWrapper() {
  return (
    <ErrorBoundary>
      <SigningBoardPage />
    </ErrorBoundary>
  );
}
