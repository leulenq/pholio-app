import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  X, ChevronLeft, ChevronRight, ChevronDown, ArrowUpRight, ArrowDown, Camera, Plus,
} from 'lucide-react';
import {
  getApplicationDetails, getTimeline, createNote, addTag, removeTag,
} from '../../api/agency';
import { getStatusLabel } from '../ui/StatusText';
import {
  recency, recencyFromDays, calendarDate, heightFigure, typeset, enumLabel,
} from '../meta/metaFormat';
import { useDeclineReasons } from '../../hooks/useDeclineReasons';
import { useAgencyPermissions } from '../../hooks/useAgencyPermissions';
import {
  DIGITALS_SLOTS, frameForSlot,
} from '../../../../shared/utils/profileReadinessImages';
import { SHOT_LABELS, normalizeShotSlug } from '../../../../shared/constants/frameTaxonomy';
import { formatLocation } from '../../../../shared/utils/locationFormat';
import {
  OFFERED_APPLICATION_STATUSES,
  REPRESENTED_APPLICATION_STATUSES,
} from '../../../../shared/constants/applicationStatus';
import { DEFAULT_ACTION_LABELS } from '../../constants/applicantLifecycle';
import { ImageLightbox } from '../ImageLightbox';
import './ReviewRoom.css';

/* ────────────────────────────────────────────────────────────────────
   The Review Room — the surface an agency decides a submission on.

   Two tempos, one room. The first viewport is the STAGE: the five-slot
   digitals sheet at maximum size beside the identity column — everything a
   booker reads in the first thirty seconds, in the standardized order that
   keeps one applicant comparable to the next. Below the fold is THE RECORD:
   the full frame set, the complete measurement ledger, provenance, and the
   house record (tags, notes, activity) — the deep read for survivors of the
   fast pass. The verdict bar is persistent and carries the whole real
   vocabulary of the decision: pass (with a templated reason), keep on file,
   request digitals, invite to meet, shortlist, development, representation.

   The room speaks the /apply workspace language (Noto Serif Display,
   JetBrains Mono, cream and ink, one gold) — the two ends of the same
   high-intent transaction share one design register. Agency bans hold: no
   badges, no chips, no eyebrows, plain words for state.

   Keyboard:
     ← / K            previous submission        → / J   next submission
     A                arm the offer (A A or Enter confirms)
     S                shortlist, instantly
     X                arm the pass (X X or Enter confirms; reason kept)
     F                keep on file               D       request digitals
     M                invite to a go-see         N       jot a house note
     U                reopen a decided submission
     Esc              close lightbox → note → arming → room
   ──────────────────────────────────────────────────────────────────── */

const DECIDED = new Set([
  ...OFFERED_APPLICATION_STATUSES,
  ...REPRESENTED_APPLICATION_STATUSES,
  'declined',
  'passed',
]);

const PASS_REASON_KEY = 'ag-pass-reason';

/* ── helpers ─────────────────────────────────────────────────────── */

/* All value formatting comes from the agency's shared metaFormat module —
   one recency vocabulary, one date form, one typographic normalization —
   so this room cannot drift from the rest of the dashboard (or grow a
   sixth local timeAgo, which is exactly how the last drift happened). */

const when = (ts) => recency(ts)?.label ?? null;

/* Absence copy — one voice for every empty state: a quiet fragment, no period. */
const EMPTY = Object.freeze({
  tags: 'No tags yet',
  notes: 'No notes yet',
  activity: 'No activity yet',
  measurements: 'No measurements provided',
});

/* Staleness reads identically wherever measurements appear. */
const STALE_MEASUREMENTS = 'Measurements over 90 days old · not confirmed in person';

const imageSrc = (img) => img?.url || img?.public_url || img?.path || null;

/** Plain-text materials line — undefined `materialsStatus` renders nothing. */
const materialsLine = (materialsStatus, materialRequest) => {
  if (materialsStatus === 'fulfilled') return 'Materials received';
  if (materialsStatus === 'overdue') {
    const due = materialRequest?.dueAt ? calendarDate(materialRequest.dueAt) : null;
    return due ? `Materials overdue · due ${due}` : 'Materials overdue';
  }
  if (materialsStatus === 'requested') {
    const due = materialRequest?.dueAt ? calendarDate(materialRequest.dueAt) : null;
    return due ? `Materials requested · due ${due}` : 'Materials requested';
  }
  return null;
};

const isSubmittedStatus = (s) => !s || s === 'submitted' || s === 'pending' || s === 'new';

const frameLabel = (img) => {
  const slug = normalizeShotSlug(img?.shot_type);
  if (slug && SHOT_LABELS[slug]) return SHOT_LABELS[slug];
  if (img?.image_type === 'digital') return 'Digital';
  return 'Unplaced';
};

/** The canonical five-slot digitals sheet, plus any unplaced extras. */
function buildDigitalSheet(images) {
  const all = Array.isArray(images) ? images.filter((i) => imageSrc(i)) : [];
  const slotFrames = DIGITALS_SLOTS.map((slot) => ({
    slot,
    frame: frameForSlot(all, slot.key),
  }));
  const placedIds = new Set(slotFrames.filter(({ frame }) => frame).map(({ frame }) => frame.id));
  const unplaced = all.filter((img) => !placedIds.has(img.id));
  const filledCount = slotFrames.filter(({ frame }) => frame).length;
  return { slots: slotFrames, unplaced, filledCount, requiredCount: DIGITALS_SLOTS.length };
}

/** Frames in the order the lightbox presents them: canonical slots first, then extras. */
function lightboxFrames(sheet) {
  const placed = sheet.slots.filter(({ frame }) => frame).map(({ slot, frame }) => ({ slot, frame }));
  const extras = sheet.unplaced.map((frame) => ({ slot: null, frame }));
  return [...placed, ...extras];
}

/** Measurements minus height (promoted) and weight (never shown). */
function buildConfirmationStats(profile, { hideBody }) {
  if (!profile) return [];
  const fields = Array.isArray(profile.stats?.fields) ? profile.stats.fields : [];
  const BODY = new Set(['bust', 'chest', 'waist', 'hips', 'inseam']);
  return fields
    .filter((f) => f.key !== 'height' && f.key !== 'weight')
    .filter((f) => !(hideBody && BODY.has(f.key)))
    .map((f) => ({
      key: f.key,
      label: f.label,
      value: f.key === 'hair' || f.key === 'eyes' ? enumLabel(f.value) : typeset(f.value),
    }));
}

const readStoredReason = () => {
  try { return localStorage.getItem(PASS_REASON_KEY) || ''; } catch { return ''; }
};
const storeReason = (id) => {
  try { localStorage.setItem(PASS_REASON_KEY, id || ''); } catch { /* private mode */ }
};

/* ── small composed pieces ───────────────────────────────────────── */

function Stamp({ children, tone }) {
  return (
    <span className={`rv-stamp${tone ? ` rv-stamp--${tone}` : ''}`}>
      <span>{children}</span>
    </span>
  );
}

function Row({ label, value, unit, muted }) {
  if (value == null || value === '') return null;
  return (
    <div className={`rv-row${muted ? ' rv-row--muted' : ''}`}>
      <dt className="rv-key">{label}</dt>
      <dd className="rv-value">
        {value}
        {unit && <em>{unit}</em>}
      </dd>
    </div>
  );
}

/**
 * Flags — the conditions a reviewer must register before reading anything
 * else: a minor, a disputed identity, stale measurements, a withdrawn
 * package. Scattered as pale sentences they read as footnotes; collected
 * under one rust rule they read as a checkpoint. Not badges — a titled
 * group of plain sentences, which is what an agency actually writes.
 */
function Flags({ items }) {
  const flags = items.filter(Boolean);
  if (!flags.length) return null;
  return (
    <section className={`rv-flags${flags.some((f) => f.tone === 'alert') ? ' is-alert' : ''}`}>
      <h2 className="rv-flags-title rv-key">
        {flags.length === 1 ? 'Before you decide' : `Before you decide · ${flags.length}`}
      </h2>
      <ul>
        {flags.map((f) => (
          <li key={f.key} className={f.tone === 'alert' ? 'is-alert' : undefined}>
            <strong>{f.label}</strong>
            {f.detail && <span>{f.detail}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One digitals frame — a full-bleed plate with its slot name set beneath it. */
function Plate({ slot, frame, hero, waiting, onOpen }) {
  const label = slot?.label || (frame ? frameLabel(frame) : '');
  return (
    <figure className={`rv-plate${hero ? ' rv-plate--hero' : ''}`}>
      {frame ? (
        <button
          type="button"
          className="rv-frame"
          style={{ backgroundImage: `url(${imageSrc(frame)})` }}
          aria-label={`${label} — view full size`}
          onClick={onOpen}
        />
      ) : (
        <div
          className={`rv-frame rv-frame--missing${waiting ? ' is-waiting' : ''}`}
          aria-label={waiting ? 'Loading' : `${label} missing`}
        >
          {!waiting && <span className="rv-key">Not sent</span>}
        </div>
      )}
      <figcaption className={`rv-plate-label rv-key${frame ? '' : ' is-missing'}`}>{label}</figcaption>
    </figure>
  );
}

/** Editable tag strip — the dossier's TagStrip pattern in the room's register. */
function TagLine({ applicationId, tags, editable }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['application', applicationId] });

  const add = useMutation({
    mutationFn: (tag) => addTag(applicationId, tag),
    onSuccess: () => { invalidate(); setDraft(''); setAdding(false); },
    onError: (e) => toast.error(e?.message || 'Could not add that tag'),
  });
  const drop = useMutation({
    mutationFn: (tagId) => removeTag(applicationId, tagId),
    onSuccess: invalidate,
    onError: (e) => toast.error(e?.message || 'Could not remove that tag'),
  });

  return (
    <div className="rv-tags">
      {tags.length === 0 && !adding && <span className="rv-quiet rv-prose">{EMPTY.tags}</span>}
      {tags.map((tag) => (
        <span className="rv-tag" key={tag.id}>
          {tag.tag || tag.name}
          {editable && (
            <button
              type="button"
              className="rv-tag-x"
              aria-label={`Remove tag ${tag.tag || tag.name}`}
              onClick={() => drop.mutate(tag.id)}
            >
              <X size={11} aria-hidden="true" />
            </button>
          )}
        </span>
      ))}
      {editable && (adding ? (
        <input
          className="rv-tag-input"
          autoFocus
          value={draft}
          placeholder="Tag…"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (!draft.trim()) setAdding(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) add.mutate(draft.trim());
            if (e.key === 'Escape') { setDraft(''); setAdding(false); }
            e.stopPropagation();
          }}
        />
      ) : (
        <button type="button" className="rv-tag rv-tag--add" onClick={() => setAdding(true)}>
          <Plus size={11} aria-hidden="true" /> Tag
        </button>
      ))}
    </div>
  );
}

/* ── the review room ─────────────────────────────────────────────── */

export default function ReviewRoom({
  applicationId,
  row,
  position,
  onJump,
  onClose,
  onDecide,
  busy,
  queue = [],
  boards = [],
  actionLabels = DEFAULT_ACTION_LABELS,
  sessionDecided = 0,
  scopeName = 'Submissions',
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [arming, setArming] = useState(null);            // null | 'pass' | 'offer'
  const [offerVariant, setOfferVariant] = useState('represent');
  const [passReason, setPassReason] = useState(readStoredReason);
  const [passNote, setPassNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const roomRef = useRef(null);
  const scrollRef = useRef(null);
  const recordRef = useRef(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const reducedMotion = useReducedMotion();
  const { can, canAny } = useAgencyPermissions();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => getApplicationDetails(applicationId),
    enabled: !!applicationId,
  });

  const timelineQuery = useQuery({
    queryKey: ['application-timeline', applicationId],
    queryFn: () => getTimeline(applicationId),
    enabled: !!applicationId,
    staleTime: 30000,
  });

  const { reasons } = useDeclineReasons({ enabled: arming === 'pass' });

  const application = data?.application || null;
  const profile = data?.profile || null;
  const submissionPackage = data?.submissionPackage || null;
  const freshness = data?.digitalsFreshness || null;
  const notes = useMemo(() => (Array.isArray(data?.notes) ? data.notes : []), [data]);
  const tags = useMemo(() => (Array.isArray(data?.tags) ? data.tags : []), [data]);

  // Plain-data truth fields — absent on an older API response, render nothing.
  const emailVerified = data?.emailVerified;
  const identityDisputed = Boolean(data?.identityDisputed);
  const identitySource = data?.identitySource;
  const materialsStatus = data?.materialsStatus;
  const materialRequest = data?.materialRequest || null;
  const possibleDuplicateOf = data?.possibleDuplicateOf || null;
  const materialsText = materialsLine(materialsStatus, materialRequest);
  const emailLine = identitySource === 'submission' && typeof emailVerified === 'boolean'
    ? (emailVerified ? 'Verified' : 'Unverified')
    : null;

  // Reset per-talent view state when the queue advances.
  const [prevAppId, setPrevAppId] = useState(applicationId);
  if (prevAppId !== applicationId) {
    setPrevAppId(applicationId);
    setLightboxOpen(false);
    setArming(null);
    setOfferVariant('represent');
    setPassNote('');
    setNoteOpen(false);
    setNoteDraft('');
    setBoardMenuOpen(false);
  }
  useEffect(() => {
    try {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    } catch {
      /* jsdom */
    }
  }, [applicationId]);

  const name = useMemo(() => {
    const full = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
    return full || row?.name || 'Talent';
  }, [profile, row]);

  const type = enumLabel(profile?.archetype || row?.type || '');
  const rawCity = profile?.city || row?.city || '';
  const city = rawCity ? formatLocation(rawCity) : '';
  const status = String(application?.status || row?.status || '').toLowerCase();
  const decided = DECIDED.has(status);
  const isMinor = Boolean(profile?.is_minor);
  const age = profile?.age ?? null;

  const images = useMemo(() => {
    const list = Array.isArray(profile?.images) ? profile.images.filter((i) => imageSrc(i)) : [];
    if (list.length) return list;
    if (row?.photo) return [{ path: row.photo, alt: row?.name }];
    return [];
  }, [profile, row]);

  const sheet = useMemo(() => buildDigitalSheet(images), [images]);
  const lbFrames = useMemo(() => lightboxFrames(sheet), [sheet]);

  const openLightboxAt = useCallback((predicate) => {
    const idx = lbFrames.findIndex(predicate);
    if (idx >= 0) {
      setLightboxIndex(idx);
      setLightboxOpen(true);
    }
  }, [lbFrames]);

  // ---- queue ------------------------------------------------------------
  const index = position?.index ?? 0;
  const total = position?.total ?? queue.length;
  const prevId = index > 0 ? queue[index - 1]?.applicationId ?? null : null;
  const nextId = index < queue.length - 1 ? queue[index + 1]?.applicationId ?? null : null;
  const undecided = queue.filter((q) => !DECIDED.has(String(q.status || '').toLowerCase())).length;

  // ---- reading content --------------------------------------------------
  const missingSlots = sheet.requiredCount - sheet.filledCount;
  const stats = profile?.stats || null;
  const heightCm = stats?.height?.cm ?? profile?.height_cm ?? null;
  const height = heightFigure(heightCm);
  const heightImperial = height?.sub || typeset(stats?.height?.feet_inches) || null;
  const confirmation = useMemo(
    () => buildConfirmationStats(profile, { hideBody: isMinor }),
    [profile, isMinor],
  );
  const measuredAgo = recencyFromDays(stats?.updated_days_ago)?.label ?? null;
  const measurementsStale = Boolean(stats?.is_stale);

  const boardsApplied = useMemo(
    () => (Array.isArray(submissionPackage?.boards) ? submissionPackage.boards.filter(Boolean) : []),
    [submissionPackage],
  );
  const selects = submissionPackage?.mediaSet?.name || null;
  const contact = submissionPackage?.contact || null;
  const compCard = submissionPackage?.compCard || null;
  const packageRedacted = Boolean(submissionPackage?.redacted || submissionPackage?.revoked);

  const receivedAgo = when(submissionPackage?.submittedAt || application?.created_at || row?.appliedAt);
  /* "Received yesterday" reads as a sentence; "Received 9 aug" reads as a
     typo. Only the word-labels fold into lower case — dates keep theirs. */
  const receivedLead = /^(Yesterday|Just now)$/.test(String(receivedAgo))
    ? String(receivedAgo).toLowerCase()
    : receivedAgo;
  const scouted = Boolean(application?.invited_by_agency_id);
  const firstLook = Boolean(application && !application.viewed_at);

  const bioText = profile?.bio_curated || profile?.bio_raw || '';
  const social = useMemo(
    () => (Array.isArray(profile?.social) ? profile.social.filter((s) => s?.handle || s?.url) : []),
    [profile],
  );
  const instagram = social.find((s) => String(s.platform || '').toLowerCase() === 'instagram') || null;
  const languages = Array.isArray(profile?.languages) && profile.languages.length
    ? profile.languages.join(' · ')
    : null;
  const timeline = Array.isArray(timelineQuery.data) ? timelineQuery.data.slice(0, 14) : [];

  const freshnessLine = useMemo(() => {
    if (!freshness || !freshness.hasDigitals) return null;
    const dated = freshness.currentSet?.capturedOn ? calendarDate(freshness.currentSet.capturedOn) : null;
    return {
      state: freshness.state,
      text: `${freshness.label || enumLabel(freshness.state)}${dated ? ` · set dated ${dated}` : ''}`,
    };
  }, [freshness]);

  // ---- permissions ------------------------------------------------------
  const canOffer = can('applications.accept');
  const canPass = can('applications.decline');
  const canMove = can('applications.update_status');
  const canBoard = can('boards.assign_application') && boards.length > 0;
  const canTag = canAny(['tags.add', 'tags.remove']);

  // ---- decisions --------------------------------------------------------
  const decide = (payload) => {
    setArming(null);
    setBoardMenuOpen(false);
    onDecide?.(payload);
  };

  const confirmPass = () => {
    storeReason(passReason);
    decide({ action: 'decline', reason: passReason || null, note: passNote.trim() || null });
    setPassNote('');
  };

  const confirmOffer = () => {
    decide({ action: offerVariant === 'development' ? 'development' : 'accept' });
  };

  const armPass = () => {
    if (decided || !canPass) return;
    setArming('pass');
  };

  const armOffer = () => {
    if (decided || !canOffer) return;
    setOfferVariant('represent');
    setArming('offer');
  };

  // ---- notes ------------------------------------------------------------
  const noteMutation = useMutation({
    mutationFn: (text) => createNote(applicationId, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['application', applicationId] });
      setNoteDraft('');
      setNoteOpen(false);
      toast.success('Noted');
    },
    onError: (e) => toast.error(e?.message || 'Could not save the note'),
  });
  const saveNote = () => {
    const text = noteDraft.trim();
    if (text) noteMutation.mutate(text);
  };

  const jumpToRecord = () => {
    recordRef.current?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
  };

  // ---- keyboard + focus -------------------------------------------------
  // Capture-phase Escape: close the top-most layer so the page's global
  // handler never rips the whole room away while a layer is open.
  useEffect(() => {
    const onKeyCapture = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (lightboxOpen) { setLightboxOpen(false); return; }
      if (boardMenuOpen) { setBoardMenuOpen(false); return; }
      if (noteOpen) { setNoteOpen(false); return; }
      if (arming) { setArming(null); return; }
      onClose?.();
    };
    window.addEventListener('keydown', onKeyCapture, true);
    return () => window.removeEventListener('keydown', onKeyCapture, true);
  }, [lightboxOpen, boardMenuOpen, noteOpen, arming, onClose]);

  // The handler binds once and reads the latest closures from a ref (the
  // desk's kbdRef idiom) — fresh state every keystroke, zero re-subscription.
  const keysRef = useRef(null);
  useEffect(() => {
    keysRef.current = {
      lightboxOpen, prevId, nextId, decided, arming, canMove,
      decide, confirmPass, confirmOffer, armPass, armOffer,
    };
  });

  useEffect(() => {
    const onKey = (e) => {
      const k = keysRef.current;
      if (!k || k.lightboxOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;

      const key = e.key;
      if (key === 'Enter' && k.arming) {
        e.preventDefault();
        if (k.arming === 'pass') k.confirmPass();
        else k.confirmOffer();
        return;
      }
      if (key === 'ArrowLeft' || key === 'k' || key === 'K') {
        e.preventDefault();
        k.prevId && onJump?.(k.prevId);
      } else if (key === 'ArrowRight' || key === 'j' || key === 'J') {
        e.preventDefault();
        k.nextId && onJump?.(k.nextId);
      } else if (key === 'a' || key === 'A') {
        e.preventDefault();
        if (k.arming === 'offer') k.confirmOffer();
        else k.armOffer();
      } else if (key === 'x' || key === 'X') {
        e.preventDefault();
        if (k.arming === 'pass') k.confirmPass();
        else k.armPass();
      } else if (key === 's' || key === 'S') {
        e.preventDefault();
        if (!k.decided && k.canMove) k.decide({ action: 'shortlist' });
      } else if (key === 'f' || key === 'F') {
        e.preventDefault();
        if (!k.decided && k.canMove) k.decide({ action: 'kept_on_file' });
      } else if (key === 'd' || key === 'D') {
        e.preventDefault();
        if (!k.decided && k.canMove) k.decide({ action: 'requested_more' });
      } else if (key === 'm' || key === 'M') {
        e.preventDefault();
        if (!k.decided && k.canMove) k.decide({ action: 'meeting_requested' });
      } else if (key === 'n' || key === 'N') {
        e.preventDefault();
        setNoteOpen(true);
      } else if (key === 'u' || key === 'U') {
        e.preventDefault();
        if (k.decided && k.canMove) k.decide({ action: 'reopen' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onJump]);

  useEffect(() => { roomRef.current?.focus({ preventScroll: true }); }, []);

  // Warm the next submission's lead frame.
  useEffect(() => {
    const nextPhoto = queue[index + 1]?.photo;
    if (!nextPhoto) return;
    const img = new Image();
    img.src = nextPhoto;
  }, [queue, index]);

  /* ── render pieces ─────────────────────────────────────────────── */

  const heroSlot = sheet.slots[0];
  const restSlots = sheet.slots.slice(1);

  const fade = reducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
      initial: { opacity: 0, y: 6 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 0 },
    };

  const verbLabel = (labels) => labels?.bulk || '';

  return createPortal(
    <motion.div
      ref={roomRef}
      className="rv-room"
      role="dialog"
      aria-modal="true"
      aria-label={`Reviewing ${name}`}
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* ───── top chrome — the /apply workspace header, receiving end ───── */}
      <header className="rv-top">
        <button type="button" className="rv-top-mark" onClick={onClose} aria-label="Close the review room">
          <span>Pholio</span>
        </button>

        <div className="rv-top-scope rv-chrome-caps" aria-label={`Reviewing ${scopeName}`}>
          <span>Reviewing</span>
          <strong>{scopeName}</strong>
        </div>

        <div className="rv-top-end">
          <div className="rv-ledger rv-read" aria-live="polite">
            <span className="rv-ledger-count">
              {String(index + 1).padStart(2, '0')} of {String(total).padStart(2, '0')}
              {undecided > 0 ? ` · ${undecided} open` : ''}
            </span>
            {sessionDecided > 0 ? (
              <strong className="rv-ledger-status">
                Sitting · {sessionDecided} decided
              </strong>
            ) : firstLook ? (
              <strong className="rv-ledger-status">
                First look
              </strong>
            ) : null}
          </div>
          <div className="rv-pager">
            <button
              type="button"
              onClick={() => prevId && onJump?.(prevId)}
              disabled={!prevId}
              aria-label="Previous submission"
            >
              <ChevronLeft size={16} strokeWidth={1.7} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => nextId && onJump?.(nextId)}
              disabled={!nextId}
              aria-label="Next submission"
            >
              <ChevronRight size={16} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </div>
          <button type="button" className="rv-close" onClick={onClose} aria-label="Close review room">
            <X size={17} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* ───── the scrolling body: stage above the fold, record below ───── */}
      <div className="rv-scroll" ref={scrollRef}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={applicationId}
            {...fade}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {isError ? (
              <div className="rv-halt">
                <p>This submission could not be loaded.</p>
                <button type="button" className="rv-more" onClick={() => refetch()}>Try again</button>
              </div>
            ) : (
              <>
                {/* ═══ THE STAGE ═══ */}
                <section className="rv-stage" aria-label="Digitals and identity">
                  <div className="rv-sheetcol">
                    <div className="rv-sheet">
                      <Plate
                        hero
                        slot={heroSlot?.slot}
                        frame={heroSlot?.frame}
                        waiting={isLoading}
                        onOpen={() => openLightboxAt(({ slot }) => slot?.key === heroSlot.slot.key)}
                      />
                      <div className="rv-quad">
                        {restSlots.map(({ slot, frame }) => (
                          <Plate
                            key={slot.key}
                            slot={slot}
                            frame={frame}
                            waiting={isLoading}
                            onOpen={() => openLightboxAt(({ slot: s }) => s?.key === slot.key)}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="rv-sheetfoot">
                      <span className="rv-sheetcount rv-read">
                        Digitals · {sheet.filledCount} of {sheet.requiredCount}
                        {selects ? ` · ${selects}` : ''}
                      </span>
                      {freshnessLine && (
                        <span className={`rv-freshness rv-read rv-freshness--${freshnessLine.state}`}>
                          {freshnessLine.text}
                        </span>
                      )}
                      {missingSlots > 0 && !decided && canMove && (
                        <button
                          type="button"
                          className="rv-sheetaction"
                          onClick={() => decide({ action: 'requested_more' })}
                          disabled={busy}
                        >
                          <Camera size={12} aria-hidden="true" />
                          Request {missingSlots} missing
                        </button>
                      )}
                      {sheet.unplaced.length > 0 && (
                        <button type="button" className="rv-sheetmore" onClick={jumpToRecord}>
                          +{sheet.unplaced.length} more in the record
                          <ArrowDown size={11} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── identity column ── */}
                  <aside className="rv-id">
                    <h1 className="rv-name">{name}</h1>
                    <div className="rv-factline rv-value">
                      {[type, city, age != null ? `Age ${age}` : null]
                        .filter(Boolean)
                        .map((fact, i) => (
                          <React.Fragment key={fact}>
                            {i > 0 && <i aria-hidden="true">·</i>}
                            <span>{fact}</span>
                          </React.Fragment>
                        ))}
                      {isMinor && (
                        <>
                          <i aria-hidden="true">·</i>
                          <span className="rv-fact-alert">Minor</span>
                        </>
                      )}
                      {!isSubmittedStatus(status) && <Stamp>{getStatusLabel(status)}</Stamp>}
                    </div>
                    <Flags
                      items={[
                        identityDisputed && {
                          key: 'identity',
                          tone: 'alert',
                          label: 'Identity disputed',
                          detail: 'The person behind this email says they did not submit this application.',
                        },
                        isMinor && {
                          key: 'minor',
                          tone: 'alert',
                          label: 'Minor',
                          detail: 'Body measurements withheld · route all correspondence through the guardian on record.',
                        },
                        !isMinor && measurementsStale && {
                          key: 'stale',
                          label: 'Measurements not current',
                          detail: 'Over 90 days old and not confirmed in person.',
                        },
                        packageRedacted && {
                          key: 'redacted',
                          tone: 'alert',
                          label: 'Submission withdrawn',
                          detail: 'The disclosure package is no longer available.',
                        },
                        materialsStatus === 'overdue' && {
                          key: 'materials',
                          label: 'Materials overdue',
                          detail: materialsText,
                        },
                      ]}
                    />

                    <dl className="rv-figures">
                      <div className="rv-fig rv-fig--lead rv-figure">
                        <dt className="rv-key">Height</dt>
                        <dd>
                          {height?.value ?? '—'}
                          {height && <em>{height.unit}</em>}
                          {heightImperial && <span className="rv-fig-sub">{heightImperial}</span>}
                        </dd>
                      </div>
                      {confirmation.slice(0, 5).map((m) => (
                        <div className="rv-fig rv-figure" key={m.key}>
                          <dt className="rv-key">{m.label}</dt>
                          <dd>{m.value}</dd>
                        </div>
                      ))}
                    </dl>

                    {/* Provenance is context, not a finding: one quiet line,
                       not a ledger competing with the measurements above it. */}
                    <p className="rv-context">
                      {[
                        boardsApplied.join(' · ') || 'General consideration',
                        receivedAgo && `Received ${receivedLead}`,
                        scouted ? 'Scouted by your agency' : 'Open call',
                        emailLine && `Email ${emailLine.toLowerCase()}`,
                        materialsStatus !== 'overdue' ? materialsText : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                    {possibleDuplicateOf && (
                      <p className="rv-context">
                        May be the same person as{' '}
                        <button
                          type="button"
                          className="rv-more rv-more--inline"
                          onClick={() => navigate(`/dashboard/agency/talent/${possibleDuplicateOf}`)}
                        >
                          an earlier submission
                        </button>
                      </p>
                    )}

                    <div className="rv-links">
                      {compCard?.viewUrl && (
                        <a href={compCard.viewUrl} target="_blank" rel="noopener noreferrer">
                          {compCard.name || 'Comp card'}
                          <ArrowUpRight size={12} strokeWidth={1.9} aria-hidden="true" />
                        </a>
                      )}
                      {instagram && (
                        <a
                          href={instagram.url || `https://instagram.com/${String(instagram.handle || '').replace(/^@/, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {instagram.handle
                            ? (instagram.handle.startsWith('@') ? instagram.handle : `@${instagram.handle}`)
                            : 'Instagram'}
                          <ArrowUpRight size={12} strokeWidth={1.9} aria-hidden="true" />
                        </a>
                      )}
                    </div>
                    <button type="button" className="rv-record-cue rv-marker" onClick={jumpToRecord}>
                      The record
                      <ArrowDown size={12} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </aside>
                </section>

                {/* ═══ THE RECORD ═══ */}
                <section className="rv-record" ref={recordRef} aria-label="The record">
                  <div className="rv-record-grid">
                    <div className="rv-record-main">
                      {(sheet.unplaced.length > 0 || lbFrames.length > 0) && (
                        <section className="rv-sec">
                          <h2 className="rv-sec-title rv-title">The submission</h2>
                          <div className="rv-book">
                            {lbFrames.map(({ slot, frame }, i) => (
                              <figure className="rv-bookplate" key={frame.id || `${i}`}>
                                <button
                                  type="button"
                                  className="rv-frame"
                                  style={{ backgroundImage: `url(${imageSrc(frame)})` }}
                                  aria-label={`${slot?.label || frameLabel(frame)} — view full size`}
                                  onClick={() => {
                                    setLightboxIndex(i);
                                    setLightboxOpen(true);
                                  }}
                                />
                                <figcaption className="rv-key">{slot?.label || frameLabel(frame)}</figcaption>
                              </figure>
                            ))}
                          </div>
                        </section>
                      )}

                      <section className="rv-sec">
                        <h2 className="rv-sec-title rv-title">Measurements</h2>
                        {confirmation.length > 0 || height ? (
                          <dl className="rv-mgrid">
                            <Row
                              label="Height"
                              value={height
                                ? `${height.value} ${height.unit}${heightImperial ? ` · ${heightImperial}` : ''}`
                                : heightImperial}
                            />
                            {confirmation.map((m) => (
                              <Row key={m.key} label={m.label} value={m.value} />
                            ))}
                          </dl>
                        ) : (
                          <p className="rv-quiet rv-prose">{EMPTY.measurements}</p>
                        )}
                        <p className="rv-provline rv-annot">
                          Self-reported{measuredAgo ? ` · ${measuredAgo}` : ''}
                        </p>
                        {measurementsStale && !isMinor && (
                          <p className="rv-note rv-note--alert rv-prose">{STALE_MEASUREMENTS}</p>
                        )}
                      </section>

                      <section className="rv-sec">
                        <h2 className="rv-sec-title rv-title">Fit &amp; provenance</h2>
                        <dl className="rv-mgrid">
                          <Row label="Boards" value={boardsApplied.join(' · ') || 'General consideration'} />
                          <Row label="Track" value={enumLabel(stats?.track)} />
                          <Row label="Languages" value={languages} />
                          <Row label="Nationality" value={profile?.nationality} />
                          {!isMinor && contact?.email && <Row label="Email" value={contact.email} />}
                          {!isMinor && contact?.phone && <Row label="Phone" value={contact.phone} />}
                          {social.map((s, i) => (
                            <Row
                              key={`${s.platform || 'link'}-${i}`}
                              label={enumLabel(s.platform) || 'Link'}
                              value={s.handle ? (s.handle.startsWith('@') ? s.handle : `@${s.handle}`) : s.url}
                            />
                          ))}
                        </dl>
                      </section>

                      {bioText && (
                        <section className="rv-sec">
                          <h2 className="rv-sec-title rv-title">In their words</h2>
                          <p className="rv-bio">{bioText}</p>
                        </section>
                      )}
                    </div>

                    {/* ── house record ── */}
                    <aside className="rv-record-side">
                      <section className="rv-sec">
                        <h2 className="rv-sec-title rv-title">Tags</h2>
                        <TagLine applicationId={applicationId} tags={tags} editable={canTag} />
                      </section>

                      <section className="rv-sec">
                        <h2 className="rv-sec-title rv-title">House notes</h2>
                        {notes.length === 0 && <p className="rv-quiet rv-prose">{EMPTY.notes}</p>}
                        <ul className="rv-notes">
                          {notes.map((n) => (
                            <li key={n.id}>
                              <p>{n.note}</p>
                              <span className="rv-annot">{when(n.created_at)}</span>
                            </li>
                          ))}
                        </ul>
                        <button type="button" className="rv-more" onClick={() => setNoteOpen(true)}>
                          Add a note <span className="rv-keyhint">N</span>
                        </button>
                      </section>

                      <section className="rv-sec">
                        <h2 className="rv-sec-title rv-title">The record so far</h2>
                        {timeline.length === 0 ? (
                          <p className="rv-quiet rv-prose">{EMPTY.activity}</p>
                        ) : (
                          <ul className="rv-ledgerlist">
                            {timeline.map((entry) => (
                              <li key={entry.id}>
                                <span className="rv-value">{entry.description || enumLabel(String(entry.activity_type || '').replace(/_/g, ' '))}</span>
                                <em className="rv-annot">{when(entry.created_at)}</em>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    </aside>
                  </div>
                </section>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ───── note composer — slides up over the verdict bar ───── */}
      <AnimatePresence>
        {noteOpen && (
          <motion.div
            className="rv-notepanel"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="rv-notepanel-key rv-marker">House note — {name}</span>
            <textarea
              autoFocus
              rows={2}
              value={noteDraft}
              placeholder="What the desk should remember…"
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  saveNote();
                }
              }}
            />
            <div className="rv-notepanel-actions">
              <button type="button" className="rv-quietbtn" onClick={() => setNoteOpen(false)}>
                Cancel <span className="rv-keyhint">Esc</span>
              </button>
              <button
                type="button"
                className="rv-confirm"
                onClick={saveNote}
                disabled={!noteDraft.trim() || noteMutation.isPending}
              >
                Save note <span className="rv-keyhint">↵</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ the verdict ═══ */}
      <footer className="rv-verdict">
        <AnimatePresence mode="wait" initial={false}>
          {decided ? (
            <motion.div key="decided" className="rv-verdict-row" {...fade} transition={{ duration: 0.16 }}>
              <div className="rv-who rv-chrome-caps">
                Decided
                <b>{getStatusLabel(status)}</b>
              </div>
              <span className="rv-hint">Use the arrows to keep moving</span>
              {canMove && (
                <button type="button" className="rv-verb" onClick={() => decide({ action: 'reopen' })} disabled={busy}>
                  Reopen <span className="rv-keyhint">U</span>
                </button>
              )}
            </motion.div>
          ) : arming === 'pass' ? (
            <motion.div key="pass" className="rv-arm" {...fade} transition={{ duration: 0.16 }}>
              <div className="rv-arm-head">
                <span className="rv-arm-label rv-marker">Pass — {name}</span>
                <div className="rv-reasons" role="radiogroup" aria-label="Pass reason">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={passReason === ''}
                    className={`rv-reason${passReason === '' ? ' is-on' : ''}`}
                    onClick={() => setPassReason('')}
                  >
                    No reason
                  </button>
                  {reasons.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={passReason === r.id}
                      className={`rv-reason${passReason === r.id ? ' is-on' : ''}`}
                      onClick={() => setPassReason(r.id)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rv-arm-tail">
                <span className="rv-arm-preview rv-prose">
                  {passReason
                    ? (reasons.find((r) => r.id === passReason)?.talentMessage || '')
                    : 'The talent sees a plain decline, nothing more.'}
                </span>
                <input
                  className="rv-arm-note"
                  value={passNote}
                  placeholder="House note, kept internal…"
                  onChange={(e) => setPassNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); confirmPass(); }
                  }}
                />
                <button type="button" className="rv-quietbtn" onClick={() => setArming(null)}>
                  Cancel <span className="rv-keyhint">Esc</span>
                </button>
                <button type="button" className="rv-confirm" onClick={confirmPass} disabled={busy}>
                  {verbLabel(actionLabels.decline) || 'Pass'} <span className="rv-keyhint">↵</span>
                </button>
              </div>
            </motion.div>
          ) : arming === 'offer' ? (
            <motion.div key="offer" className="rv-arm rv-arm--offer" {...fade} transition={{ duration: 0.16 }}>
              <span className="rv-arm-label rv-marker">Offer — {name}</span>
              <div className="rv-reasons" role="radiogroup" aria-label="Offer kind">
                <button
                  type="button"
                  role="radio"
                  aria-checked={offerVariant === 'represent'}
                  className={`rv-reason${offerVariant === 'represent' ? ' is-on' : ''}`}
                  onClick={() => setOfferVariant('represent')}
                >
                  {verbLabel(actionLabels.accept) || 'Representation'}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={offerVariant === 'development'}
                  className={`rv-reason${offerVariant === 'development' ? ' is-on' : ''}`}
                  onClick={() => setOfferVariant('development')}
                >
                  Development · New Faces
                </button>
              </div>
              <span className="rv-arm-preview rv-prose">
                {offerVariant === 'development'
                  ? 'Records a development offer — building the book before full representation.'
                  : 'Sends the decision to the talent. The agreement itself happens between you.'}
              </span>
              <div className="rv-arm-tail">
                <button type="button" className="rv-quietbtn" onClick={() => setArming(null)}>
                  Cancel <span className="rv-keyhint">Esc</span>
                </button>
                <button type="button" className="rv-confirm rv-confirm--gold" onClick={confirmOffer} disabled={busy}>
                  Confirm offer <span className="rv-keyhint">↵</span>
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="resting" className="rv-verdict-row" {...fade} transition={{ duration: 0.16 }}>
              <div className="rv-who rv-chrome-caps">
                Deciding on
                <b>{name}</b>
              </div>

              {canMove && (
                <div className="rv-softs">
                  <button type="button" onClick={() => decide({ action: 'kept_on_file' })} disabled={busy}>
                    Keep on file <span className="rv-keyhint">F</span>
                  </button>
                  <button type="button" onClick={() => decide({ action: 'requested_more' })} disabled={busy}>
                    Request digitals <span className="rv-keyhint">D</span>
                  </button>
                  <button type="button" onClick={() => decide({ action: 'meeting_requested' })} disabled={busy}>
                    Invite to meet <span className="rv-keyhint">M</span>
                  </button>
                </div>
              )}

              <div className="rv-verbs">
                {canPass && (
                  <button type="button" className="rv-verb" onClick={armPass} disabled={busy}>
                    {verbLabel(actionLabels.decline) || 'Pass'} <span className="rv-keyhint">X</span>
                  </button>
                )}
                {canMove && (
                  <span className="rv-split">
                    <button
                      type="button"
                      className="rv-verb"
                      onClick={() => decide({ action: 'shortlist' })}
                      disabled={busy}
                    >
                      {verbLabel(actionLabels.shortlist) || 'Shortlist'} <span className="rv-keyhint">S</span>
                    </button>
                    {canBoard && (
                      <button
                        type="button"
                        className="rv-verb rv-split-caret"
                        aria-label="Shortlist to a board"
                        aria-expanded={boardMenuOpen}
                        onClick={() => setBoardMenuOpen((v) => !v)}
                        disabled={busy}
                      >
                        <ChevronDown size={13} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                    )}
                    {boardMenuOpen && (
                      <div className="rv-boardmenu" role="menu">
                        <span className="rv-key">File to a board</span>
                        {boards.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            role="menuitem"
                            onClick={() => decide({ action: 'shortlist', boardId: b.id })}
                          >
                            {b.name || 'Untitled board'}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                )}
                {canOffer && (
                  <button type="button" className="rv-verb rv-verb--gold" onClick={armOffer} disabled={busy}>
                    {verbLabel(actionLabels.accept) || 'Offer representation'} <span className="rv-keyhint">A</span>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </footer>

      {/* ═══ lightbox ═══ */}
      <AnimatePresence>
        {lightboxOpen && lbFrames.length > 0 && (
          <ImageLightbox
            images={lbFrames.map(({ frame }) => ({ ...frame, path: imageSrc(frame) }))}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}
