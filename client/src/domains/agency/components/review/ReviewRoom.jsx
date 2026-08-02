import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { X, ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-react';
import { getApplicationDetails } from '../../api/agency';
import { resolveTier, MATCH_TIER_LABELS, normalizeScore } from '../../lib/matchTier';
import { getStatusLabel } from '../ui/StatusText';
import { SHOT_LABELS, normalizeShotSlug } from '../../../../shared/constants/frameTaxonomy';
import { formatLocation } from '../../../../shared/utils/locationFormat';
import './ReviewRoom.css';

/* ────────────────────────────────────────────────────────────────────
   The information architecture of this screen is driven by how bookers
   actually work a submission queue: they eliminate, they do not appraise.
   Volumes run 50–100 inbound a day at a few seconds each, so the screen
   is built as a rejection funnel with a very short leading edge.

   Gate 0  admissibility  — age, minor status, market, board applied to
   Gate 1  physical spec  — height against the board (the ONLY measurement
                            that screens; Storm's own application collects
                            height and nothing else)
   Gate 2  the look       — face AND silhouette, which is why the whole set
                            of digitals is co-visible rather than one hero
                            with the full-length buried below the fold
   Gate 3  honesty        — do the frames and the numbers agree, and are the
                            frames raw? Hence slot coverage + measurement
                            provenance rendered as first-class facts.
   Gate 4  board need     — what this person IS, in one word, to compare
                            against what the board already carries.
   Gate 5  confirmation   — full measurements, provenance, house record.
                            Present, but subordinate. Survivors only.

   Everything for gates 0–4 sits above the fold. Nothing there requires a
   click. Weight is never rendered: it appears on no comp card and no major
   agency application, and it is a reputational hazard beside a photograph
   of a young person.
   ──────────────────────────────────────────────────────────────────── */

/** The canonical digitals set every agency asks for, in submission order. */
const DIGITAL_SLOTS = ['headshot', 'profile', 'three_quarter', 'full_length', 'back'];

const DECIDED = new Set(['represented', 'booked', 'accepted', 'signed', 'declined', 'passed']);

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

/** Frame caption — the slot the talent placed it in, in the house's words. */
const frameLabel = (img) => {
  const slug = normalizeShotSlug(img?.shot_type);
  if (slug && SHOT_LABELS[slug]) return SHOT_LABELS[slug];
  if (img?.image_type === 'digital') return 'Digital';
  return 'Unplaced';
};

/**
 * Which of the canonical digitals slots this submission actually covers.
 * A missing full-length or headshot is the single most common reason a
 * booker asks for more rather than passing, so it is rendered as a ledger
 * rather than left for them to work out by counting frames.
 */
function slotCoverage(images, picks) {
  const bySlot = new Set();
  Object.entries(picks || {}).forEach(([slot, id]) => {
    if (id && images.some((img) => img.id === id)) bySlot.add(slot);
  });
  images.forEach((img) => {
    const slug = normalizeShotSlug(img?.shot_type);
    if (slug) bySlot.add(slug);
  });
  return DIGITAL_SLOTS.map((slot) => ({
    slot,
    label: SHOT_LABELS[slot] || titleCase(slot.replaceAll('_', ' ')),
    present: bySlot.has(slot),
  }));
}

/**
 * The confirmation measurements — everything except height, which is
 * promoted into the spec line, and except weight, which is never shown.
 * Values come from the server's one canonical stats formatter so this
 * screen can never disagree with the comp card or the profile.
 */
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

/** The stage stamp — a letterpress rule frame, never a coloured status pill. */
function Stamp({ children, tone }) {
  return (
    <span className={`rv-stamp${tone ? ` rv-stamp--${tone}` : ''}`}>
      <span>{children}</span>
    </span>
  );
}

/** One cell of the spec line: a tracked key over a typeset value. */
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

/**
 * ReviewRoom — the surface an agency decides a submission on.
 *
 * Composed as a broadsheet: house chrome, a billing block where the name is
 * deliberately held back so the screening facts carry the hierarchy, a spec
 * line, the digitals as a full-width contact sheet, three typeset columns of
 * confirmation, and an ink verdict bar.
 *
 * Keyboard: the submissions page owns J/K/S/A/X/Esc. The room adds only
 * ArrowLeft/Right (paging frames) and captures Escape while zoom is open.
 */
export default function ReviewRoom({
  applicationId,
  row,
  position,
  onJump,
  onClose,
  onDecide,
  busy,
  queue = [],
}) {
  const [frame, setFrame] = useState(0);
  const [bioOpen, setBioOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
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
    setFrame(0);
    setBioOpen(false);
    setZoom(false);
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

  const score = application?.match_score ?? row?.match ?? null;
  const tier = score != null ? resolveTier(score) : null;

  const images = useMemo(() => {
    const list = Array.isArray(profile?.images) ? profile.images.filter((i) => imageSrc(i)) : [];
    if (list.length) return list;
    if (row?.photo) return [{ path: row.photo, alt: row?.name }];
    return [];
  }, [profile, row]);

  const activeFrame = Math.min(frame, Math.max(0, images.length - 1));
  const activeImage = images[activeFrame] || null;
  const multi = images.length > 1;

  const nextFrame = useCallback(
    () => setFrame((i) => (i + 1) % Math.max(1, images.length)),
    [images.length],
  );
  const prevFrame = useCallback(
    () => setFrame((i) => (i - 1 + Math.max(1, images.length)) % Math.max(1, images.length)),
    [images.length],
  );

  // ---- queue ------------------------------------------------------------
  const index = position?.index ?? 0;
  const total = position?.total ?? queue.length;
  const prevId = index > 0 ? queue[index - 1]?.applicationId ?? null : null;
  const nextId = queue[index + 1]?.applicationId ?? null;
  const undecided = queue.filter((q) => !DECIDED.has(String(q.status || '').toLowerCase())).length;

  // ---- reading content --------------------------------------------------
  const coverage = useMemo(
    () => slotCoverage(images, submissionPackage?.digitalSlotPicks),
    [images, submissionPackage],
  );
  const missingSlots = coverage.filter((c) => !c.present).length;

  const stats = profile?.stats || null;
  const heightCm = stats?.height?.cm ?? profile?.height_cm ?? null;
  const heightImperial = stats?.height?.feet_inches || null;
  const confirmation = useMemo(
    () => buildConfirmationStats(profile, { hideBody: isMinor }),
    [profile, isMinor],
  );
  const measuredAgo = monthsAgo(stats?.updated_days_ago);
  const measurementsStale = Boolean(stats?.is_stale);

  const boards = useMemo(
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

  // ---- keyboard + focus -------------------------------------------------
  useEffect(() => {
    if (!multi) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); prevFrame(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nextFrame(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [multi, prevFrame, nextFrame]);

  // Zoom owns Escape while open (capture phase, so the page never sees it).
  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setZoom(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [zoom]);

  useEffect(() => { roomRef.current?.focus({ preventScroll: true }); }, []);

  // Warm the next submission's lead frame. At a few seconds per submission a
  // half-second image load, sixty times over, is what makes a booker abandon
  // the tool — the queue must never make them wait for a face.
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
      {/* ───── house chrome ───── */}
      <header className="rv-chrome">
        <span className="rv-mark">Pholio</span>
        <div className="rv-chrome-mid">
          <span className="rv-caps">Submissions review</span>
          {total > 0 && (
            <strong>
              {String(index + 1).padStart(2, '0')} / {total}
            </strong>
          )}
        </div>
        <div className="rv-chrome-end">
          {total > 1 && (
            <div className="rv-pager">
              <button
                type="button"
                onClick={() => prevId && onJump?.(prevId)}
                disabled={!prevId}
                aria-label="Previous submission"
              >
                <ChevronLeft size={15} strokeWidth={1.7} aria-hidden="true" />
              </button>
              {undecided > 0 && <span className="rv-mono">{undecided} undecided</span>}
              <button
                type="button"
                onClick={() => nextId && onJump?.(nextId)}
                disabled={!nextId}
                aria-label="Next submission"
              >
                <ChevronRight size={15} strokeWidth={1.7} aria-hidden="true" />
              </button>
            </div>
          )}
          <button type="button" className="rv-exit rv-caps" onClick={onClose}>Exit room</button>
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
          {/* ═══ the billing — the name is held back on purpose ═══ */}
          <div className="rv-billing">
            <div className="rv-billing-id">
              <h1 className="rv-name">{name}</h1>
              <div className="rv-idline">
                {type && <span className="rv-italic">{type}</span>}
                {type && city && <i aria-hidden="true">/</i>}
                {city && <span className="rv-italic">{city}</span>}
                {status && <Stamp>{getStatusLabel(status)}</Stamp>}
                {isMinor && (
                  <Stamp tone="alert">
                    Minor{age != null ? ` — age ${age}` : ''}
                  </Stamp>
                )}
              </div>
            </div>
            {firstLook && <div className="rv-firstlook rv-caps">First look</div>}
          </div>

          {/* ═══ the spec line — gate 0 and gate 1, and nothing else ═══ */}
          <div className="rv-spec">
            <Spec
              lead
              label="Height"
              value={heightCm ?? '—'}
              unit={heightCm ? 'cm' : null}
              sub={heightImperial}
            />
            <Spec
              lead
              label="Age"
              value={age ?? '—'}
              sub={isMinor ? 'Guardian consent required' : null}
            />
            <Spec
              label="Submitted for"
              value={boards[0] || 'General consideration'}
              sub={boards.length > 1 ? `Also read for ${boards.slice(1).join(' · ')}` : null}
            />
            <Spec
              label="Based in"
              value={city || '—'}
              sub={profile?.nationality || null}
            />
            <Spec
              label="Received"
              value={receivedAgo || '—'}
              sub={scouted ? 'Scouted by your agency' : 'Open call'}
            />
          </div>

          {/* ═══ the digitals — the primary evidence, face and silhouette together ═══ */}
          <section className="rv-digitals">
            <div className="rv-dighead">
              <span className="rv-caps rv-dighead-t">
                Digitals
                <em>
                  {images.length} {images.length === 1 ? 'frame' : 'frames'}
                  {selects ? ` · selects “${selects}”` : ''}
                </em>
              </span>
              {images.length > 0 && (
                <div className="rv-slots rv-mono" aria-label="Digitals slot coverage">
                  {coverage.map((c) => (
                    <span key={c.slot} className={`rv-slot${c.present ? '' : ' is-missing'}`}>
                      <i className="rv-tick" aria-hidden="true" />
                      <b>{c.label}</b>
                      <span className="rv-sr">{c.present ? 'supplied' : 'missing'}</span>
                    </span>
                  ))}
                </div>
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
                <div className={`rv-plates${isLoading ? ' is-waiting' : ''}`} style={{ gridTemplateColumns: `repeat(${Math.max(images.length, 3)}, minmax(0, 1fr))` }}>
                  {images.map((img, i) => (
                    <button
                      key={img.id || imageSrc(img) || i}
                      type="button"
                      className={`rv-plate${i === activeFrame ? ' is-on' : ''}`}
                      style={{ backgroundImage: `url(${imageSrc(img)})` }}
                      aria-label={`${frameLabel(img)} — frame ${i + 1} of ${images.length}, view full size`}
                      onClick={() => { setFrame(i); setZoom(true); }}
                    >
                      <span className="rv-no" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                    </button>
                  ))}
                </div>
                <div className="rv-platecaps rv-mono" style={{ gridTemplateColumns: `repeat(${Math.max(images.length, 3)}, minmax(0, 1fr))` }} aria-hidden="true">
                  {images.map((img, i) => (
                    <span key={img.id || i} className={i === activeFrame ? 'is-on' : undefined}>
                      {frameLabel(img)}
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* ═══ confirmation — survivors only, deliberately subordinate ═══ */}
          <div className="rv-cols">
            <section className="rv-col">
              <div className="rv-h">
                <span className="rv-caps">Measurements</span>
                <span className="rv-prov rv-mono">
                  Self-reported{measuredAgo ? ` · ${measuredAgo}` : ''}
                </span>
              </div>
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
                <p className="rv-note rv-note--alert rv-mono">
                  Body measurements withheld — talent is a minor
                </p>
              )}
              {!isMinor && measurementsStale && (
                <p className="rv-note rv-note--alert rv-mono">
                  Not confirmed in person · over 90 days old
                </p>
              )}
            </section>

            <section className="rv-col">
              <div className="rv-h"><span className="rv-caps">Fit &amp; provenance</span></div>
              <dl>
                {score != null && (
                  <div className="rv-fit">
                    <dt>Pholio board fit</dt>
                    <dd>
                      {normalizeScore(score)}
                      <span>{MATCH_TIER_LABELS[tier]}</span>
                    </dd>
                  </div>
                )}
                <Row label="Route" value={scouted ? 'Scouted by your agency' : 'Open call'} />
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
                <p className="rv-note rv-mono">
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
        <div className="rv-who rv-caps">
          {decided ? 'Decided' : 'Deciding on'}
          <b>{decided ? getStatusLabel(status) : name}</b>
        </div>
        {decided ? (
          <span className="rv-decided rv-mono">Use the arrows above to keep moving</span>
        ) : (
          <>
            <div className="rv-softs">
              <button type="button" onClick={() => onDecide?.('kept_on_file')} disabled={busy}>
                Keep on file
              </button>
              <button type="button" onClick={() => onDecide?.('requested_more')} disabled={busy}>
                {missingSlots > 0 ? `Request ${missingSlots} missing` : 'Request digitals'}
              </button>
            </div>
            <div className="rv-verbs">
              <button
                type="button"
                className="rv-verb rv-verb--represent"
                onClick={() => onDecide?.('accept')}
                disabled={busy}
              >
                Offer representation
              </button>
              <button type="button" className="rv-verb" onClick={() => onDecide?.('shortlist')} disabled={busy}>
                Shortlist
              </button>
              <button type="button" className="rv-verb" onClick={() => onDecide?.('decline')} disabled={busy}>
                Pass
              </button>
            </div>
          </>
        )}
      </footer>

      {/* ═══ the full-size look ═══ */}
      <AnimatePresence>
        {zoom && activeImage && (
          <motion.div
            className="rv-zoom"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setZoom(false)}
          >
            <img src={imageSrc(activeImage)} alt={activeImage?.alt || name} />
            <span className="rv-zoom-cap rv-mono">
              {frameLabel(activeImage)} · {activeFrame + 1} / {images.length}
            </span>
            {multi && (
              <>
                <button
                  type="button"
                  className="rv-zoom-nav rv-zoom-nav--prev"
                  aria-label="Previous frame"
                  onClick={(e) => { e.stopPropagation(); prevFrame(); }}
                >
                  <ChevronLeft size={20} strokeWidth={1.6} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="rv-zoom-nav rv-zoom-nav--next"
                  aria-label="Next frame"
                  onClick={(e) => { e.stopPropagation(); nextFrame(); }}
                >
                  <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
                </button>
              </>
            )}
            <button type="button" className="rv-zoom-close" aria-label="Close full-size view">
              <X size={18} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}
