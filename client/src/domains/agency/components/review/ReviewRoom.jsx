import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Check,
  Star,
  Maximize2,
} from 'lucide-react';
import { getApplicationDetails } from '../../api/agency';
import { resolveTier, MATCH_TIER_LABELS, normalizeScore } from '../../lib/matchTier';
import { getStatusMeta } from '../ui/StatusText';
import { cmToImperial } from '../../pages/rosterFormat';
import './ReviewRoom.css';

/* ── local helpers ───────────────────────────────────────────────── */

const initials = (name) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .map((part) => part[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

const timeAgo = (ts) => {
  if (!ts) return null;
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const titleCase = (value) =>
  value ? String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase() : '';

const imageSrc = (img) => img?.url || img?.public_url || img?.path || null;

const DECIDED = new Set(['represented', 'booked', 'accepted', 'signed', 'declined', 'passed']);
const NEWISH = new Set(['submitted', 'pending', 'new', '']);

// Compact labels for the dark status plate.
const PLATE_LABELS = {
  declined: 'Passed',
  development: 'New Face',
  requested_more: 'More digitals',
  meeting_requested: 'Meeting',
  under_review: 'In review',
};

/** Status on ink — the sharp tonal cell, restated for the dark room. */
function StatusPlate({ status }) {
  const meta = getStatusMeta(status);
  if (!meta) return null;
  const key = String(status || '').toLowerCase();
  return (
    <span className="rr-plate" style={{ '--c': meta.color }}>
      {PLATE_LABELS[key] || meta.label}
    </span>
  );
}

/** The comp-card band: the numbers a booker checks first, in print order. */
function buildCompCard(profile) {
  if (!profile) return [];
  const cells = [];
  if (profile.height_cm) {
    cells.push({ key: 'Height', value: `${profile.height_cm}`, sub: cmToImperial(profile.height_cm) });
  }
  const bwh = [profile.bust_cm ?? profile.chest_cm, profile.waist_cm, profile.hips_cm];
  if (bwh.some((v) => v != null)) {
    cells.push({
      key: profile.bust_cm != null ? 'B · W · H' : 'C · W · H',
      value: bwh.map((v) => (v != null ? v : '—')).join(' · '),
      sub: 'cm',
    });
  }
  if (profile.shoe_size != null && profile.shoe_size !== '') {
    cells.push({ key: 'Shoe', value: String(profile.shoe_size), sub: null });
  }
  return cells;
}

/** Everything after the comp card — quieter, two-up. */
function buildDetails(profile) {
  if (!profile) return [];
  const languages = Array.isArray(profile.languages) && profile.languages.length
    ? profile.languages.join(', ')
    : null;
  const dressLabel = profile.dress_size != null ? 'Dress' : profile.suit_size != null ? 'Suit' : null;
  return [
    { label: 'Hair', value: titleCase(profile.hair_color) || null },
    { label: 'Eyes', value: titleCase(profile.eye_color) || null },
    { label: 'Age', value: profile.age ?? profile.age_band ?? null },
    { label: dressLabel, value: profile.dress_size ?? profile.suit_size ?? null },
    { label: 'Based in', value: profile.city || null },
    { label: 'Nationality', value: profile.nationality || null },
    { label: 'Languages', value: languages },
  ].filter((row) => row.label && row.value != null && row.value !== '');
}

/* ── the screening room, recomposed ──────────────────────────────── */

/**
 * ReviewRoom — the screening room.
 *
 * An editorial spread on the agency's deep ink: the photograph is the whole
 * left page, full bleed under a warm stage light; the right page is the
 * dossier — identity, the comp-card band, verdict, details — terminating in
 * the decision deck. A queue rail of faces runs along the foot with
 * click-to-jump; a gold thread across the top marks progress.
 *
 * Keyboard: the page owns J/K/S/A/X/Esc. The room adds only ArrowLeft/Right
 * (frames) and Escape-capture while the zoom overlay is open.
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
  const navigate = useNavigate();
  const [frame, setFrame] = useState(0);
  const [bioOpen, setBioOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const queueRailRef = useRef(null);

  // Paging direction for the crossfade (render-time adjust-on-prop-change).
  const [paging, setPaging] = useState({ index: position?.index ?? 0, dir: 1 });
  const posIndex = position?.index ?? 0;
  if (posIndex !== paging.index) {
    setPaging({ index: posIndex, dir: posIndex > paging.index ? 1 : -1 });
  }
  const dir = paging.dir;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => getApplicationDetails(applicationId),
    enabled: !!applicationId,
  });

  const application = data?.application || null;
  const profile = data?.profile || null;
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

  const type = profile?.archetype || row?.type || 'Editorial';
  const city = profile?.city || row?.city || '';
  const status = String(application?.status || row?.status || '').toLowerCase();
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

  // Frames page with ArrowLeft/ArrowRight — the only list keys the room owns.
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
      if (e.key === 'Escape') {
        e.stopPropagation();
        setZoom(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [zoom]);

  // Keep the current face centered in the queue rail.
  useEffect(() => {
    const rail = queueRailRef.current;
    if (!rail) return;
    const current = rail.querySelector('.rr-q.is-current');
    if (current) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      current.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [applicationId, queue.length]);

  const bioText = profile?.bio_curated || profile?.bio_raw || '';
  const bioLong = bioText.length > 260;

  const compCard = useMemo(() => buildCompCard(profile), [profile]);
  const details = useMemo(() => buildDetails(profile), [profile]);
  const decided = DECIDED.has(status);
  const isNewStatus = NEWISH.has(status);

  const tagLine = useMemo(
    () =>
      tags
        .map((t) => (typeof t === 'string' ? t : t?.tag || t?.label || t?.name))
        .filter(Boolean)
        .join(' · '),
    [tags],
  );
  const latestNote = notes.length
    ? notes[0]?.body || notes[0]?.note || notes[0]?.text || ''
    : '';
  const social = Array.isArray(profile?.social) ? profile.social.filter((s) => s?.handle || s?.url) : [];

  const submittedAgo = timeAgo(application?.created_at || row?.appliedAt);
  const total = position?.total ?? 0;
  const index = position?.index ?? 0;
  const progressPct = total > 0 ? ((index + 1) / total) * 100 : 0;
  const remaining = queue.filter((q) => !DECIDED.has(String(q.status || '').toLowerCase())).length;

  const factParts = [
    submittedAgo ? `Submitted ${submittedAgo}` : null,
    application ? (application.invited_by_agency_id ? 'Invited by your agency' : 'Open application') : null,
    application && !application.viewed_at ? 'First look' : null,
  ].filter(Boolean);

  // Rendered through a portal to <body> so the full-screen takeover escapes
  // the dashboard shell's stacking context (the rail's own layer would
  // otherwise bleed through the ink).
  return createPortal(
    <motion.div
      className="rr-room"
      role="dialog"
      aria-modal="true"
      aria-label={`Reviewing ${name}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* Queue progress — the gold thread. */}
      <div className="rr-thread" aria-hidden="true">
        <i style={{ width: `${progressPct}%` }} />
      </div>

      {/* ───────── TOP BAR ───────── */}
      <header className="rr-top">
        <button type="button" className="rr-back" onClick={onClose}>
          <ArrowLeft size={15} strokeWidth={1.9} aria-hidden="true" />
          The desk
        </button>
        <div className="rr-top-right">
          {total > 0 && <span className="rr-count">{index + 1} of {total}</span>}
          <button
            type="button"
            className="rr-toplink"
            onClick={() => navigate(`/dashboard/agency/talent/${applicationId}`)}
          >
            Full profile
            <ArrowUpRight size={13} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* ───────── THE SPREAD ───────── */}
      <div className="rr-main">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={applicationId}
            className="rr-scene"
            initial={{ opacity: 0, x: 24 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 * dir }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Left page — the portrait, centered under the stage light. */}
            <figure className={`rr-stage${isLoading && !activeImage ? ' is-loading' : ''}`}>
              <div className="rr-frame">
                {activeImage ? (
                  <button
                    type="button"
                    className="rr-photo"
                    style={{ backgroundImage: `url(${imageSrc(activeImage)})` }}
                    onClick={() => setZoom(true)}
                    aria-label={`View ${name}'s digital at full size`}
                  />
                ) : (
                  <div className="rr-photo rr-photo--empty" role="img" aria-label={name}>
                    {!isLoading && <span className="rr-photo-initials">{initials(name)}</span>}
                  </div>
                )}
                <div className="rr-stage-bar">
                  {multi ? (
                    <span className="rr-frame-nav">
                      <button type="button" className="rr-frame-btn" onClick={prevFrame} aria-label="Previous digital">
                        <ChevronLeft size={15} strokeWidth={1.9} />
                      </button>
                      <span className="rr-frame-count">{activeFrame + 1} / {images.length}</span>
                      <button type="button" className="rr-frame-btn" onClick={nextFrame} aria-label="Next digital">
                        <ChevronRight size={15} strokeWidth={1.9} />
                      </button>
                    </span>
                  ) : <span />}
                  {activeImage && (
                    <button type="button" className="rr-frame-btn" onClick={() => setZoom(true)} aria-label="View full size">
                      <Maximize2 size={14} strokeWidth={1.9} />
                    </button>
                  )}
                </div>
              </div>
            </figure>

            {/* Right page — the dossier. */}
            <div className="rr-page">
              <div className="rr-read">
                <h2 className="rr-name">{name}</h2>
                <p className="rr-spec">{[type, city].filter(Boolean).join(' · ')}</p>

                {/* The comp card — the numbers a booker checks first. */}
                {compCard.length > 0 && (
                  <div className="rr-comp">
                    {compCard.map((c) => (
                      <div className="rr-comp-cell" key={c.key}>
                        <span className="rr-comp-key">{c.key}</span>
                        <span className="rr-comp-val">
                          {c.value}
                          {c.sub && <em>{c.sub}</em>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Verdict — one baseline. */}
                <div className="rr-verdict">
                  {score != null && (
                    <span className={`rr-score rr-score--${tier}`}>{normalizeScore(score)}</span>
                  )}
                  {tier && <span className="rr-verdict-tier">{MATCH_TIER_LABELS[tier]} match</span>}
                  {isNewStatus
                    ? <span className="rr-verdict-status">Awaiting review</span>
                    : <StatusPlate status={status} />}
                </div>
                {factParts.length > 0 && <p className="rr-facts">{factParts.join(' · ')}</p>}

                {isError ? (
                  <div className="rr-error">
                    <p>This submission could not be loaded.</p>
                    <button type="button" className="rr-textbtn" onClick={() => refetch()}>Try again</button>
                  </div>
                ) : isLoading ? (
                  <div className="rr-loading" aria-hidden="true">
                    {[64, 46, 58, 38].map((w, i) => (
                      <span key={i} className="rr-bone" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                ) : (
                  <>
                    {details.length > 0 && (
                      <dl className="rr-details">
                        {details.map((v) => (
                          <div className="rr-detail" key={v.label}>
                            <dt>{v.label}</dt>
                            <dd>{v.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    {bioText && (
                      <div className="rr-section">
                        <span className="rr-key">Bio</span>
                        <p className={`rr-bio${bioLong && !bioOpen ? ' is-clamped' : ''}`}>{bioText}</p>
                        {bioLong && (
                          <button type="button" className="rr-textbtn" onClick={() => setBioOpen((v) => !v)}>
                            {bioOpen ? 'Show less' : 'Read more'}
                          </button>
                        )}
                      </div>
                    )}

                    {(tagLine || notes.length > 0 || social.length > 0) && (
                      <div className="rr-section">
                        <span className="rr-key">Agency record</span>
                        {tagLine && <p className="rr-line">{tagLine}</p>}
                        {notes.length > 0 && (
                          <p className="rr-line">
                            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                            {latestNote ? ` — “${latestNote.slice(0, 90)}${latestNote.length > 90 ? '…' : ''}”` : ''}
                          </p>
                        )}
                        {social.map((s, i) => {
                          const label = `${(s.platform || 'link').toLowerCase()} — ${
                            s.handle ? (s.handle.startsWith('@') ? s.handle : `@${s.handle}`) : s.url
                          }`;
                          return s.url ? (
                            <a
                              key={`${s.platform || 'link'}-${i}`}
                              className="rr-line rr-line--link"
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {label}
                              <ArrowUpRight size={11} strokeWidth={1.9} aria-hidden="true" />
                            </a>
                          ) : (
                            <p key={`${s.platform || 'link'}-${i}`} className="rr-line">{label}</p>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* The decision deck — terminates the reading flow. */}
              <div className="rr-deck">
                {decided ? (
                  <div className="rr-deck-decided">
                    <StatusPlate status={status} />
                    <span className="rr-deck-note">Decided — J / K to keep moving</span>
                  </div>
                ) : (
                  <>
                    <div className="rr-deck-row">
                      <button
                        type="button"
                        className="rr-act rr-act--sign"
                        onClick={() => onDecide?.('accept')}
                        disabled={busy}
                      >
                        <Check size={16} strokeWidth={2.1} aria-hidden="true" />
                        Sign
                        <kbd className="rr-key-cap rr-key-cap--ink">A</kbd>
                      </button>
                      <button
                        type="button"
                        className="rr-act rr-act--shortlist"
                        onClick={() => onDecide?.('shortlist')}
                        disabled={busy}
                      >
                        <Star size={15} strokeWidth={1.9} aria-hidden="true" />
                        Shortlist
                        <kbd className="rr-key-cap">S</kbd>
                      </button>
                      <button
                        type="button"
                        className="rr-act rr-act--pass"
                        onClick={() => onDecide?.('decline')}
                        disabled={busy}
                      >
                        <X size={15} strokeWidth={1.9} aria-hidden="true" />
                        Pass
                        <kbd className="rr-key-cap">X</kbd>
                      </button>
                    </div>
                    <div className="rr-deck-quiet">
                      <button type="button" className="rr-soft" onClick={() => onDecide?.('kept_on_file')} disabled={busy}>
                        Keep on file
                      </button>
                      <span className="rr-soft-div" aria-hidden="true">·</span>
                      <button type="button" className="rr-soft" onClick={() => onDecide?.('requested_more')} disabled={busy}>
                        Request digitals
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ───────── QUEUE RAIL — the desk's stack, visible ───────── */}
      {queue.length > 1 && (
        <div className="rr-queue">
          <span className="rr-queue-key">
            Queue
            <em>{remaining} to review</em>
          </span>
          <div className="rr-queue-rail" ref={queueRailRef}>
            {queue.map((q) => {
              const qDecided = DECIDED.has(String(q.status || '').toLowerCase());
              const current = q.applicationId === applicationId;
              return (
                <button
                  key={q.applicationId}
                  type="button"
                  className={`rr-q${current ? ' is-current' : ''}${qDecided ? ' is-decided' : ''}`}
                  onClick={() => onJump?.(q.applicationId)}
                  aria-label={`Review ${q.name}`}
                  aria-current={current || undefined}
                >
                  {q.photo ? (
                    <span className="rr-q-img" style={{ backgroundImage: `url(${q.photo})` }} />
                  ) : (
                    <span className="rr-q-img rr-q-img--empty">{initials(q.name)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ───────── ZOOM — the detail look ───────── */}
      <AnimatePresence>
        {zoom && activeImage && (
          <motion.div
            className="rr-zoom"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setZoom(false)}
          >
            <img src={imageSrc(activeImage)} alt={activeImage?.alt || name} />
            <button type="button" className="rr-topbtn rr-zoom-close" aria-label="Close detail view">
              <X size={17} strokeWidth={1.8} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}
