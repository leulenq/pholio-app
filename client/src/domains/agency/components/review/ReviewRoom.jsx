import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  X, ChevronLeft, ChevronRight, ArrowUpRight, Camera,
} from 'lucide-react';
import { getApplicationDetails } from '../../api/agency';
import { getStatusLabel } from '../ui/StatusText';
import {
  DIGITALS_SLOTS, frameForSlot,
} from '../../../../shared/utils/profileReadinessImages';
import { SHOT_LABELS, normalizeShotSlug } from '../../../../shared/constants/frameTaxonomy';
import { formatLocation } from '../../../../shared/utils/locationFormat';
import {
  OFFERED_APPLICATION_STATUSES,
  REPRESENTED_APPLICATION_STATUSES,
} from '../../../../shared/constants/applicationStatus';
import { ImageLightbox } from '../ImageLightbox';
import { DecisionConfirmation } from './DecisionConfirmation';
import './ReviewRoom.css';

/* ────────────────────────────────────────────────────────────────────
   Submissions Review Room — the surface an agency decides a submission on.

   Designed as a dense, scannable broadsheet: queue chrome, a compact talent
   hero, the canonical five-slot digitals sheet, a tight provenance block, and
   a sticky decision bar. Everything a booker needs to triage in ~10 seconds
   sits above the fold; nothing requires a click to evaluate.

   Keyboard:
     ArrowLeft / ArrowRight  previous / next submission
     J / K                   previous / next submission (legacy)
     A                       offer representation (opens confirmation)
     S                       shortlist (opens confirmation)
     X                       pass (opens confirmation)
     Esc                     close lightbox → close room
   ──────────────────────────────────────────────────────────────────── */

const DECIDED = new Set([
  ...OFFERED_APPLICATION_STATUSES,
  ...REPRESENTED_APPLICATION_STATUSES,
  'declined',
  'passed',
]);

/* ── helpers ─────────────────────────────────────────────────────── */

const initials = (name) =>
  (name || '').trim().split(/\s+/).map((p) => p[0] || '').slice(0, 2).join('').toUpperCase();

const timeAgo = (ts) => {
  if (!ts) return null;
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'Yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const monthsAgo = (days) => {
  if (days == null) return null;
  if (days < 45) return `${Math.max(1, Math.round(days))} days ago`;
  const m = Math.round(days / 30);
  if (m < 18) return `${m} months ago`;
  return `${Math.round(days / 365)} years ago`;
};

const titleCase = (v) =>
  v ? String(v).charAt(0).toUpperCase() + String(v).slice(1).toLowerCase() : '';

const imageSrc = (img) => img?.url || img?.public_url || img?.path || null;

const isSubmittedStatus = (s) => !s || s === 'submitted' || s === 'pending' || s === 'new';

/** Label for a frame, using its canonical shot type or falling back to Unplaced. */
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

/** Confirmation measurements — everything except height (promoted) and weight (never shown). */
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
      value: f.key === 'hair' || f.key === 'eyes' ? titleCase(f.value) : f.value,
    }));
}

/* ── small composed pieces ───────────────────────────────────────── */

function Stamp({ children, tone }) {
  return (
    <span className={`rv-stamp${tone ? ` rv-stamp--${tone}` : ''}`}>
      <span>{children}</span>
    </span>
  );
}

function Spec({ label, value, unit, sub, lead }) {
  if (value == null || value === '') return null;
  return (
    <div className={`rv-cell${lead ? ' rv-cell--lead' : ''}`}>
      <span className="rv-k">{label}</span>
      <span className="rv-v">
        {value}
        {unit && <em>{unit}</em>}
      </span>
      {sub && <span className="rv-sub">{sub}</span>}
    </div>
  );
}

function Row({ label, value, unit, muted }) {
  if (value == null || value === '') return null;
  return (
    <div className={`rv-row${muted ? ' rv-row--muted' : ''}`}>
      <dt>{label}</dt>
      <dd>
        {value}
        {unit && <em>{unit}</em>}
      </dd>
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
}) {
  const [bioOpen, setBioOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [pendingDecision, setPendingDecision] = useState(null);
  const roomRef = useRef(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => getApplicationDetails(applicationId),
    enabled: !!applicationId,
  });

  const application = data?.application || null;
  const profile = data?.profile || null;
  const submissionPackage = data?.submissionPackage || null;
  const notes = useMemo(() => (Array.isArray(data?.notes) ? data.notes : []), [data]);
  const tags = useMemo(() => (Array.isArray(data?.tags) ? data.tags : []), [data]);

  // Reset per-talent view state when the queue advances.
  const [prevAppId, setPrevAppId] = useState(applicationId);
  if (prevAppId !== applicationId) {
    setPrevAppId(applicationId);
    setBioOpen(false);
    setLightboxOpen(false);
    setPendingDecision(null);
  }

  const name = useMemo(() => {
    const full = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
    return full || row?.name || 'Talent';
  }, [profile, row]);

  const type = titleCase(profile?.archetype || row?.type || '');
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

  const sheet = useMemo(
    () => buildDigitalSheet(images),
    [images],
  );
  const lbFrames = useMemo(() => lightboxFrames(sheet), [sheet]);

  const openLightboxForSlot = useCallback(
    (slotKey) => {
      const idx = lbFrames.findIndex(({ slot }) => slot?.key === slotKey);
      if (idx >= 0) {
        setLightboxIndex(idx);
        setLightboxOpen(true);
      }
    },
    [lbFrames],
  );

  const openLightboxForUnplaced = useCallback(
    (img) => {
      const idx = lbFrames.findIndex(({ frame }) => frame.id === img.id);
      if (idx >= 0) {
        setLightboxIndex(idx);
        setLightboxOpen(true);
      }
    },
    [lbFrames],
  );

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
  const heightImperial = stats?.height?.feet_inches || null;
  const confirmation = useMemo(
    () => buildConfirmationStats(profile, { hideBody: isMinor }),
    [profile, isMinor],
  );
  const measuredAgo = monthsAgo(stats?.updated_days_ago);
  const measurementsStale = Boolean(stats?.is_stale);

  const boardsApplied = useMemo(
    () => (Array.isArray(submissionPackage?.boards) ? submissionPackage.boards.filter(Boolean) : []),
    [submissionPackage],
  );
  const selects = submissionPackage?.mediaSet?.name || null;
  const contact = submissionPackage?.contact || null;
  const compCard = submissionPackage?.compCard || null;
  const packageRedacted = Boolean(submissionPackage?.redacted || submissionPackage?.revoked);

  const receivedAgo = timeAgo(submissionPackage?.submittedAt || application?.created_at || row?.appliedAt);
  const scouted = Boolean(application?.invited_by_agency_id);
  const firstLook = Boolean(application && !application.viewed_at);

  const bioText = profile?.bio_curated || profile?.bio_raw || '';
  const tagList = useMemo(
    () => tags.map((t) => (typeof t === 'string' ? t : t?.tag || t?.label || t?.name)).filter(Boolean),
    [tags],
  );
  const social = useMemo(
    () => (Array.isArray(profile?.social) ? profile.social.filter((s) => s?.handle || s?.url) : []),
    [profile],
  );
  const languages = Array.isArray(profile?.languages) && profile.languages.length
    ? profile.languages.join(' · ')
    : null;

  // ---- decisions --------------------------------------------------------
  const startDecision = useCallback((mode) => setPendingDecision(mode), []);
  const cancelDecision = useCallback(() => setPendingDecision(null), []);
  const confirmDecision = useCallback(
    (payload) => {
      setPendingDecision(null);
      onDecide?.(payload);
    },
    [onDecide],
  );

  // ---- keyboard + focus -------------------------------------------------
  // Capture-phase Escape: close the top-most layer so the page's global handler
  // never rips the whole room away while a lightbox/modal is open.
  useEffect(() => {
    const onKeyCapture = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (lightboxOpen) {
        setLightboxOpen(false);
        return;
      }
      if (pendingDecision) {
        cancelDecision();
        return;
      }
      onClose?.();
    };
    window.addEventListener('keydown', onKeyCapture, true);
    return () => window.removeEventListener('keydown', onKeyCapture, true);
  }, [lightboxOpen, pendingDecision, onClose, cancelDecision]);

  useEffect(() => {
    if (lightboxOpen) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;

      if (e.key === 'ArrowLeft' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        prevId && onJump?.(prevId);
      } else if (e.key === 'ArrowRight' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        nextId && onJump?.(nextId);
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        if (!decided) startDecision('offer');
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (!decided) startDecision('shortlist');
      } else if (e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        if (!decided) startDecision('pass');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, prevId, nextId, onJump, decided, startDecision]);

  useEffect(() => { roomRef.current?.focus({ preventScroll: true }); }, []);

  // Warm the next submission's lead frame.
  useEffect(() => {
    const nextPhoto = queue[index + 1]?.photo;
    if (!nextPhoto) return;
    const img = new Image();
    img.src = nextPhoto;
  }, [queue, index]);

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
      {/* ───── chrome ───── */}
      <header className="rv-chrome">
        <div className="rv-chrome-start">
          <span className="rv-scope">Submissions</span>
          {total > 0 && (
            <span className="rv-counter">
              {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </span>
          )}
          {undecided > 0 && <span className="rv-undecided">{undecided} undecided</span>}
          {firstLook && <span className="rv-firstlook">First look</span>}
        </div>

        <div className="rv-chrome-end">
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
            <X size={18} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={applicationId}
          className="rv-sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* ═══ compact hero ═══ */}
          <div className="rv-hero">
            <div className="rv-hero-main">
              <h1 className="rv-name">{name}</h1>
              <div className="rv-hero-line">
                {type && <span className="rv-hero-fact">{type}</span>}
                {type && city && <i aria-hidden="true">·</i>}
                {city && <span className="rv-hero-fact">{city}</span>}
                {age != null && (
                  <>
                    <i aria-hidden="true">·</i>
                    <span className="rv-hero-fact">Age {age}</span>
                  </>
                )}
                {isMinor && (
                  <>
                    <i aria-hidden="true">·</i>
                    <span className="rv-hero-fact rv-hero-fact--alert">Minor</span>
                  </>
                )}
                {!isSubmittedStatus(status) && (
                  <Stamp>{getStatusLabel(status)}</Stamp>
                )}
              </div>
            </div>
          </div>

          {/* ═══ spec line ═══ */}
          <div className="rv-spec">
            <Spec
              lead
              label="Height"
              value={heightCm ?? '—'}
              unit={heightCm ? 'cm' : null}
              sub={heightImperial}
            />
            <Spec
              label="Submitted for"
              value={boardsApplied[0] || 'General consideration'}
              sub={boardsApplied.length > 1 ? `Also ${boardsApplied.slice(1).join(' · ')}` : null}
            />
            <Spec
              label="Based in"
              value={city || '—'}
              sub={profile?.nationality || null}
            />
            <Spec
              label="Received"
              value={receivedAgo || '—'}
            />
          </div>

          {/* ═══ digitals contact sheet ═══ */}
          <section className="rv-digitals">
            <div className="rv-dighead">
              <div className="rv-dighead-start">
                <span className="rv-dighead-title">Digitals</span>
                <span className="rv-dighead-count">
                  {sheet.filledCount} / {sheet.requiredCount}
                </span>
                {selects && <span className="rv-dighead-selects">· {selects}</span>}
              </div>
              {missingSlots > 0 && (
                <button
                  type="button"
                  className="rv-dighead-action"
                  onClick={() => onDecide?.({ action: 'requested_more' })}
                  disabled={busy || decided}
                >
                  <Camera size={13} aria-hidden="true" />
                  Request {missingSlots} missing
                </button>
              )}
            </div>

            {isError ? (
              <div className="rv-fallback">
                <p>This submission could not be loaded.</p>
                <button type="button" className="rv-more" onClick={() => refetch()}>Try again</button>
              </div>
            ) : images.length === 0 ? (
              <div className="rv-fallback rv-fallback--plate">
                <span>{isLoading ? '' : initials(name)}</span>
              </div>
            ) : (
              <>
                <div className={`rv-slotsheet${isLoading ? ' is-waiting' : ''}`}>
                  {sheet.slots.map(({ slot, frame }) => (
                    <div key={slot.key} className="rv-slotcol">
                      {frame ? (
                        <button
                          type="button"
                          className="rv-slotframe"
                          style={{ backgroundImage: `url(${imageSrc(frame)})` }}
                          aria-label={`${slot.label} — view full size`}
                          onClick={() => openLightboxForSlot(slot.key)}
                        />
                      ) : (
                        <div className="rv-slotframe rv-slotframe--missing" aria-label={`${slot.label} missing`}>
                          <span className="rv-slotmissing">Missing</span>
                        </div>
                      )}
                      <span className={`rv-slotlabel${frame ? '' : ' is-missing'}`}>{slot.label}</span>
                    </div>
                  ))}
                </div>

                {sheet.unplaced.length > 0 && (
                  <div className="rv-unplaced">
                    <span className="rv-unplaced-title">Unplaced · {sheet.unplaced.length}</span>
                    <div className="rv-unplaced-list">
                      {sheet.unplaced.map((img) => (
                        <button
                          key={img.id}
                          type="button"
                          className="rv-unplaced-frame"
                          style={{ backgroundImage: `url(${imageSrc(img)})` }}
                          aria-label={`${frameLabel(img)} — view full size`}
                          onClick={() => openLightboxForUnplaced(img)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* ═══ confirmation columns ═══ */}
          <div className="rv-cols">
            <section className="rv-col rv-col--measurements">
              <div className="rv-h"><span className="rv-caps">Measurements</span></div>
              {confirmation.length > 0 ? (
                <dl className="rv-mgrid">
                  {confirmation.map((m) => (
                    <Row key={m.key} label={m.label} value={m.value} />
                  ))}
                </dl>
              ) : (
                <p className="rv-note">No measurements on this submission.</p>
              )}
              {isMinor && (
                <p className="rv-note rv-note--alert">
                  Body measurements withheld — talent is a minor
                </p>
              )}
              {!isMinor && measurementsStale && (
                <p className="rv-note rv-note--alert">
                  Not confirmed in person · over 90 days old
                </p>
              )}
              <p className="rv-prov">
                Self-reported{measuredAgo ? ` · ${measuredAgo}` : ''}
              </p>
            </section>

            <section className="rv-col">
              <div className="rv-h"><span className="rv-caps">Fit &amp; provenance</span></div>
              <dl>
                <Row label="Route" value={scouted ? 'Scouted by your agency' : 'Open call'} />
                <Row label="Boards" value={boardsApplied.join(' · ') || 'General consideration'} />
                <Row label="Languages" value={languages} />
                <Row label="Nationality" value={profile?.nationality} />
                <Row label="Track" value={titleCase(stats?.track)} />
              </dl>
              {packageRedacted && (
                <p className="rv-note rv-note--alert">
                  The talent withdrew this submission; its disclosure package is no longer available.
                </p>
              )}
              <div className="rv-links">
                {compCard?.viewUrl && (
                  <a href={compCard.viewUrl} target="_blank" rel="noopener noreferrer">
                    {compCard.name || 'Comp card'}
                    <ArrowUpRight size={12} strokeWidth={1.9} aria-hidden="true" />
                  </a>
                )}
                {contact?.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
                {contact?.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}
              </div>
              {isMinor && (
                <p className="rv-note">
                  Contact withheld — route all correspondence through the guardian on record
                </p>
              )}
            </section>

            <section className="rv-col">
              <div className="rv-h"><span className="rv-caps">House record</span></div>
              <dl>
                <Row label="Tags" value={tagList.length ? tagList.join(' · ') : null} />
                <Row
                  label="Notes"
                  value={notes.length ? `${notes.length} on file` : 'None yet'}
                  muted={!notes.length}
                />
                {social.map((s, i) => (
                  <Row
                    key={`${s.platform || 'link'}-${i}`}
                    label={titleCase(s.platform) || 'Link'}
                    value={s.handle ? (s.handle.startsWith('@') ? s.handle : `@${s.handle}`) : s.url}
                  />
                ))}
              </dl>
              {bioText && (
                <>
                  <p className={`rv-bio${bioOpen ? ' is-open' : ''}`}>{bioText}</p>
                  {bioText.length > 150 && (
                    <button type="button" className="rv-more" onClick={() => setBioOpen((v) => !v)}>
                      {bioOpen ? 'Less' : 'Read more'}
                    </button>
                  )}
                </>
              )}
            </section>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ═══ the verdict ═══ */}
      <footer className="rv-verdict">
        <div className="rv-who">
          {decided ? 'Decided' : 'Deciding on'}
          <b>{decided ? getStatusLabel(status) : name}</b>
        </div>
        {decided ? (
          <span className="rv-decided">Use the arrows to keep moving</span>
        ) : (
          <>
            <div className="rv-softs">
              <button type="button" onClick={() => onDecide?.({ action: 'kept_on_file' })} disabled={busy}>
                Keep on file
              </button>
            </div>
            <div className="rv-verbs">
              <button
                type="button"
                className="rv-verb rv-verb--represent"
                onClick={() => startDecision('offer')}
                disabled={busy}
              >
                Offer representation
              </button>
              <button type="button" className="rv-verb" onClick={() => startDecision('shortlist')} disabled={busy}>
                Shortlist
              </button>
              <button type="button" className="rv-verb" onClick={() => startDecision('pass')} disabled={busy}>
                Pass
              </button>
            </div>
          </>
        )}
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

      {/* ═══ decision confirmations ═══ */}
      <DecisionConfirmation
        mode={pendingDecision}
        talentName={name}
        boards={boards}
        busy={busy}
        onClose={cancelDecision}
        onConfirm={confirmDecision}
      />
    </motion.div>,
    document.body,
  );
}
