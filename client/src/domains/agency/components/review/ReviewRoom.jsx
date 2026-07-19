import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Check,
  Star,
} from 'lucide-react';
import { getApplicationDetails } from '../../api/agency';
import { resolveTier, MATCH_TIER_LABELS, normalizeScore } from '../../lib/matchTier';
import { getStatusMeta } from '../ui/StatusText';
import { heightLine } from '../../pages/rosterFormat';
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

function buildVitals(profile) {
  if (!profile) return [];
  const cm = (v) => (v != null && v !== '' ? `${v} cm` : null);
  const bust = profile.bust_cm ?? profile.chest_cm;
  const bustLabel = profile.bust_cm != null ? 'Bust' : 'Chest';
  const dressLabel = profile.dress_size != null ? 'Dress' : profile.suit_size != null ? 'Suit' : null;
  const dressValue = profile.dress_size ?? profile.suit_size ?? null;
  const languages = Array.isArray(profile.languages) && profile.languages.length
    ? profile.languages.join(', ')
    : null;
  return [
    { label: 'Height', value: profile.height_cm ? heightLine(profile.height_cm) : null },
    { label: bustLabel, value: cm(bust) },
    { label: 'Waist', value: cm(profile.waist_cm) },
    { label: 'Hips', value: cm(profile.hips_cm) },
    { label: 'Shoe', value: profile.shoe_size != null && profile.shoe_size !== '' ? String(profile.shoe_size) : null },
    { label: dressLabel, value: dressValue },
    { label: 'Hair', value: titleCase(profile.hair_color) || null },
    { label: 'Eyes', value: titleCase(profile.eye_color) || null },
    { label: 'Age', value: profile.age ?? profile.age_band ?? null },
    { label: 'Based in', value: profile.city || null },
    { label: 'Nationality', value: profile.nationality || null },
    { label: 'Languages', value: languages },
  ].filter((row) => row.label && row.value != null && row.value !== '');
}

/* ── the screening room ──────────────────────────────────────────── */

/**
 * ReviewRoom — the screening room.
 *
 * A full-screen decision surface on the agency's deep ink: the photograph
 * luminous at center, the identity and vitals set as light typography beside
 * it, and one decision deck at the foot. The queue pages with directional
 * crossfades; a gold thread across the top marks progress through the desk.
 *
 * Keyboard: the page's single window handler owns J/K/S/A/X/Esc; the room
 * adds only ArrowLeft/ArrowRight for frames (no overlap, no double-fire).
 */
export default function ReviewRoom({
  applicationId,
  row,
  position,
  onPrev,
  onNext,
  onClose,
  onDecide,
  busy,
}) {
  const navigate = useNavigate();
  const [frame, setFrame] = useState(0);
  const [bioOpen, setBioOpen] = useState(false);

  // Track paging direction so the crossfade slides the way the queue moves
  // (render-time "adjust state on prop change" idiom — no ref reads in render).
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

  // Reset per-talent view state when the queue advances (render-time idiom).
  const [prevAppId, setPrevAppId] = useState(applicationId);
  if (prevAppId !== applicationId) {
    setPrevAppId(applicationId);
    setFrame(0);
    setBioOpen(false);
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

  // Frames page with ArrowLeft/ArrowRight — the only keys the room owns.
  useEffect(() => {
    if (!multi) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFrame((i) => (i - 1 + images.length) % images.length);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFrame((i) => (i + 1) % images.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [multi, images.length]);

  const bioText = profile?.bio_curated || profile?.bio_raw || '';
  const bioLong = bioText.length > 300;

  const vitals = useMemo(() => buildVitals(profile), [profile]);
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

  const factParts = [
    submittedAgo ? `Submitted ${submittedAgo}` : null,
    application ? (application.invited_by_agency_id ? 'Invited by your agency' : 'Open application') : null,
    application && !application.viewed_at ? 'First look' : null,
  ].filter(Boolean);

  return (
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
      {/* Queue progress — a gold thread across the very top. */}
      <div className="rr-thread" aria-hidden="true">
        <i style={{ width: `${progressPct}%` }} />
      </div>

      {/* ───────── TOP BAR ───────── */}
      <header className="rr-top">
        <div className="rr-top-left">
          <span className="rr-mast">The screening room</span>
          {total > 0 && (
            <span className="rr-count">{index + 1} of {total}</span>
          )}
        </div>
        <div className="rr-top-right">
          <button
            type="button"
            className="rr-toplink"
            onClick={() => navigate(`/dashboard/agency/talent/${applicationId}`)}
          >
            Full profile
            <ArrowUpRight size={13} strokeWidth={1.9} aria-hidden="true" />
          </button>
          <button type="button" className="rr-topbtn" onClick={onClose} aria-label="Close the screening room">
            <X size={17} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      {/* ───────── STAGE ROW ───────── */}
      <div className="rr-row">
        <button
          type="button"
          className="rr-edge"
          onClick={onPrev || undefined}
          disabled={!onPrev}
          aria-label="Previous submission"
          data-tip="Previous · K"
        >
          <ChevronLeft size={22} strokeWidth={1.6} />
        </button>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={applicationId}
            className="rr-scene"
            initial={{ opacity: 0, x: 26 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -26 * dir }}
            transition={{ duration: 0.19, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* The photograph */}
            <div className="rr-stage">
              <div
                className={`rr-frame${isLoading && !activeImage ? ' rr-frame--loading' : ''}`}
                style={activeImage ? { backgroundImage: `url(${imageSrc(activeImage)})` } : undefined}
                role="img"
                aria-label={activeImage?.alt || `${name} — digital ${activeFrame + 1}`}
              >
                {!activeImage && !isLoading && (
                  <span className="rr-frame-initials">{initials(name)}</span>
                )}
              </div>
              {multi && (
                <div className="rr-strip" role="group" aria-label="Digitals">
                  {images.map((img, i) => (
                    <button
                      type="button"
                      key={imageSrc(img) || i}
                      className={`rr-thumb${i === activeFrame ? ' is-active' : ''}`}
                      style={{ backgroundImage: `url(${imageSrc(img)})` }}
                      onClick={() => setFrame(i)}
                      aria-label={`View digital ${i + 1}`}
                      aria-pressed={i === activeFrame}
                    />
                  ))}
                  <span className="rr-strip-count">{activeFrame + 1} / {images.length}</span>
                </div>
              )}
            </div>

            {/* The dossier — light typography set directly on the ink. */}
            <aside className="rr-dossier">
              <h2 className="rr-name">{name}</h2>
              <p className="rr-spec">
                {[type, city].filter(Boolean).join(' · ')}
              </p>

              <div className="rr-verdict">
                {score != null && (
                  <span className={`rr-score rr-score--${tier}`}>{normalizeScore(score)}</span>
                )}
                <span className="rr-verdict-copy">
                  {tier && <span className="rr-verdict-tier">{MATCH_TIER_LABELS[tier]} match</span>}
                  {isNewStatus
                    ? <span className="rr-verdict-status">Awaiting review</span>
                    : <StatusPlate status={status} />}
                </span>
              </div>

              {factParts.length > 0 && (
                <p className="rr-facts">{factParts.join(' · ')}</p>
              )}

              {isError ? (
                <div className="rr-error">
                  <p>This submission could not be loaded.</p>
                  <button type="button" className="rr-textbtn" onClick={() => refetch()}>Try again</button>
                </div>
              ) : isLoading ? (
                <div className="rr-loading" aria-hidden="true">
                  {[72, 58, 64, 40, 52].map((w, i) => (
                    <span key={i} className="rr-bone" style={{ width: `${w}%` }} />
                  ))}
                </div>
              ) : (
                <>
                  {vitals.length > 0 && (
                    <dl className="rr-vitals">
                      {vitals.map((v) => (
                        <div className="rr-vital" key={v.label}>
                          <dt>{v.label}</dt>
                          <dd>{v.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {bioText && (
                    <div className="rr-bio-wrap">
                      <p className={`rr-bio${bioLong && !bioOpen ? ' is-clamped' : ''}`}>{bioText}</p>
                      {bioLong && (
                        <button type="button" className="rr-textbtn" onClick={() => setBioOpen((v) => !v)}>
                          {bioOpen ? 'Show less' : 'Read more'}
                        </button>
                      )}
                    </div>
                  )}

                  {(tagLine || notes.length > 0 || social.length > 0) && (
                    <div className="rr-margins">
                      {tagLine && <p className="rr-margin-line">{tagLine}</p>}
                      {notes.length > 0 && (
                        <p className="rr-margin-line">
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
                            className="rr-margin-link"
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {label}
                            <ArrowUpRight size={11} strokeWidth={1.9} aria-hidden="true" />
                          </a>
                        ) : (
                          <p key={`${s.platform || 'link'}-${i}`} className="rr-margin-line">{label}</p>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </aside>
          </motion.div>
        </AnimatePresence>

        <button
          type="button"
          className="rr-edge"
          onClick={onNext || undefined}
          disabled={!onNext}
          aria-label="Next submission"
          data-tip="Next · J"
        >
          <ChevronRight size={22} strokeWidth={1.6} />
        </button>
      </div>

      {/* ───────── DECISION DECK ───────── */}
      <footer className="rr-deck">
        {decided ? (
          <div className="rr-deck-decided">
            <StatusPlate status={status} />
            <span className="rr-deck-note">Decided — J / K to keep moving</span>
          </div>
        ) : (
          <>
            <div className="rr-deck-side">
              <button
                type="button"
                className="rr-act rr-act--pass"
                onClick={() => onDecide?.('decline')}
                disabled={busy}
              >
                <X size={15} strokeWidth={1.9} aria-hidden="true" />
                Pass
                <kbd className="rr-key">X</kbd>
              </button>
            </div>
            <div className="rr-deck-soft">
              <button
                type="button"
                className="rr-act rr-act--quiet"
                onClick={() => onDecide?.('kept_on_file')}
                disabled={busy}
              >
                Keep on file
              </button>
              <button
                type="button"
                className="rr-act rr-act--quiet"
                onClick={() => onDecide?.('requested_more')}
                disabled={busy}
              >
                Request digitals
              </button>
            </div>
            <div className="rr-deck-main">
              <button
                type="button"
                className="rr-act rr-act--shortlist"
                onClick={() => onDecide?.('shortlist')}
                disabled={busy}
              >
                <Star size={15} strokeWidth={1.9} aria-hidden="true" />
                Shortlist
                <kbd className="rr-key">S</kbd>
              </button>
              <button
                type="button"
                className="rr-act rr-act--sign"
                onClick={() => onDecide?.('accept')}
                disabled={busy}
              >
                <Check size={16} strokeWidth={2.1} aria-hidden="true" />
                Sign
                <kbd className="rr-key rr-key--ink">A</kbd>
              </button>
            </div>
          </>
        )}
      </footer>
    </motion.div>
  );
}
