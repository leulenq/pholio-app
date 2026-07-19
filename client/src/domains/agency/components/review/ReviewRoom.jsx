import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
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
import { MatchMeasure, StatusCell, SkeletonRow, SkeletonFigure } from '../ui';
import { resolveTier, MATCH_TIER_LABELS } from '../../lib/matchTier';
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

// Relative time, mirroring the Submissions list vocabulary.
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

const shortDate = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const titleCase = (value) =>
  value ? String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase() : '';

const imageSrc = (img) => img?.url || img?.public_url || img?.path || null;

// A submission has left the review ladder once decided in either direction.
const DECIDED = new Set(['represented', 'booked', 'accepted', 'signed', 'declined', 'passed']);
const NEWISH = new Set(['submitted', 'pending', 'new', '']);

const BIO_CLAMP = 420;

/* ── field ledger rows ───────────────────────────────────────────── */

function VitalRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="rr-vital">
      <span className="rr-vital-k">{label}</span>
      <span className="rr-vital-v">{value}</span>
    </div>
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
    { label: 'Inseam', value: cm(profile.inseam_cm) },
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

/* ── the drawer ──────────────────────────────────────────────────── */

/**
 * ReviewRoom — the Submissions review drawer.
 *
 * A booker reviews digitals serially: big imagery on the left stage, complete
 * vitals + submission facts + agency record on the right dossier, and a
 * decision deck at the foot. Prev/next walk the review queue.
 *
 * The caller wraps conditional renders in <AnimatePresence> for the exit.
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

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => getApplicationDetails(applicationId),
    enabled: !!applicationId,
  });

  const application = data?.application || null;
  const profile = data?.profile || null;
  const notes = useMemo(() => (Array.isArray(data?.notes) ? data.notes : []), [data]);
  const tags = useMemo(() => (Array.isArray(data?.tags) ? data.tags : []), [data]);

  // Reset per-talent view state whenever the queue advances — the
  // render-time "adjust state on prop change" idiom (no effect, no cascade).
  const [prevAppId, setPrevAppId] = useState(applicationId);
  if (prevAppId !== applicationId) {
    setPrevAppId(applicationId);
    setFrame(0);
    setBioOpen(false);
  }

  // Identity — prefer loaded profile, fall back to the list row while fetching.
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

  const bioText = profile?.bio_curated || profile?.bio_raw || '';
  const bioLong = bioText.length > BIO_CLAMP;

  const vitals = useMemo(() => buildVitals(profile), [profile]);

  const decided = DECIDED.has(status);
  const isNew = NEWISH.has(status);

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

  // Keyboard lives in the page's single window handler (J/K queue, S/A/X
  // decide, Esc close) — one owner, so decisions never double-fire.

  const submittedAgo = timeAgo(application?.created_at || row?.appliedAt);
  const openedDate = shortDate(application?.viewed_at);

  return (
    <>
      <motion.div
        className="rr-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="rr-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Reviewing ${name}`}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 240, damping: 30, mass: 0.9 }}
      >
        {/* ───────── HEADER ───────── */}
        <header className="rr-head">
          <div className="rr-nav">
            <button
              type="button"
              className="rr-icon"
              onClick={onPrev || undefined}
              disabled={!onPrev}
              aria-label="Previous submission"
            >
              <ChevronLeft size={16} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              className="rr-icon"
              onClick={onNext || undefined}
              disabled={!onNext}
              aria-label="Next submission"
            >
              <ChevronRight size={16} strokeWidth={1.9} />
            </button>
            {position && Number.isFinite(position.index) && (
              <span className="rr-position">
                {position.index + 1} of {position.total}
              </span>
            )}
          </div>

          <div className="rr-identity">
            <h2 className="rr-name">{name}</h2>
            <p className="rr-subline">
              {[type, city].filter(Boolean).join(' · ')}
            </p>
          </div>

          <div className="rr-head-actions">
            <button
              type="button"
              className="rr-fulllink"
              onClick={() => navigate(`/dashboard/agency/talent/${applicationId}`)}
            >
              Full profile
              <ArrowUpRight size={14} strokeWidth={1.9} aria-hidden="true" />
            </button>
            <button type="button" className="rr-icon" onClick={onClose} aria-label="Close review">
              <X size={16} strokeWidth={1.9} />
            </button>
          </div>
        </header>

        {/* ───────── BODY ───────── */}
        <div className="rr-body">
          {isError ? (
            <div className="rr-error">
              <p className="rr-error-msg">This submission could not be loaded.</p>
              <button type="button" className="rr-retry" onClick={() => refetch()}>
                Try again
              </button>
            </div>
          ) : (
            <div className="rr-grid">
              {/* ── STAGE ── */}
              <div className="rr-stage">
                {isLoading && !images.length ? (
                  <SkeletonFigure className="rr-frame-skeleton" />
                ) : (
                  <>
                    <div
                      className="rr-frame"
                      style={activeImage ? { backgroundImage: `url(${imageSrc(activeImage)})` } : undefined}
                      role="img"
                      aria-label={activeImage?.alt || `${name} — digital ${activeFrame + 1}`}
                    >
                      {!activeImage && <span className="rr-frame-initials">{initials(name)}</span>}
                      {multi && (
                        <>
                          <button
                            type="button"
                            className="rr-frame-arrow rr-frame-arrow--prev"
                            onClick={() => setFrame((i) => (i - 1 + images.length) % images.length)}
                            aria-label="Previous image"
                          >
                            <ChevronLeft size={17} strokeWidth={1.9} />
                          </button>
                          <button
                            type="button"
                            className="rr-frame-arrow rr-frame-arrow--next"
                            onClick={() => setFrame((i) => (i + 1) % images.length)}
                            aria-label="Next image"
                          >
                            <ChevronRight size={17} strokeWidth={1.9} />
                          </button>
                        </>
                      )}
                    </div>
                    {multi && (
                      <span className="rr-frame-count">
                        {activeFrame + 1} / {images.length}
                      </span>
                    )}
                    {multi && (
                      <div className="rr-strip">
                        {images.map((img, i) => (
                          <button
                            type="button"
                            key={imageSrc(img) || i}
                            className={`rr-thumb${i === activeFrame ? ' is-active' : ''}`}
                            style={{ backgroundImage: `url(${imageSrc(img)})` }}
                            onClick={() => setFrame(i)}
                            aria-label={`View image ${i + 1}`}
                            aria-pressed={i === activeFrame}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── DOSSIER ── */}
              <div className="rr-dossier">
                {isLoading ? (
                  <div className="rr-dossier-loading">
                    <SkeletonRow count={4} compact />
                  </div>
                ) : (
                  <>
                    {/* Verdict */}
                    <div className="rr-verdict">
                      <div className="rr-verdict-match">
                        {score != null && <MatchMeasure score={score} size="md" />}
                        {tier && <span className="rr-verdict-tier">{MATCH_TIER_LABELS[tier]} match</span>}
                      </div>
                      {isNew ? (
                        <span className="rr-verdict-status">Submitted</span>
                      ) : (
                        <StatusCell status={status} />
                      )}
                    </div>

                    {/* Submission facts */}
                    <div className="rr-facts">
                      {submittedAgo && <p className="rr-fact">Submitted {submittedAgo}</p>}
                      <p className="rr-fact">
                        {application?.invited_by_agency_id ? 'Invited by your agency' : 'Open application'}
                      </p>
                      <p className="rr-fact">
                        {openedDate ? `First opened ${openedDate}` : 'First look'}
                      </p>
                    </div>

                    {/* Vitals */}
                    {vitals.length > 0 && (
                      <section className="rr-section">
                        <h3 className="rr-key">Vitals</h3>
                        <div className="rr-vitals">
                          {vitals.map((v) => (
                            <VitalRow key={v.label} label={v.label} value={v.value} />
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Bio */}
                    {bioText && (
                      <section className="rr-section">
                        <h3 className="rr-key">Bio</h3>
                        <p className={`rr-bio${bioLong && !bioOpen ? ' is-clamped' : ''}`}>
                          {bioText}
                        </p>
                        {bioLong && (
                          <button
                            type="button"
                            className="rr-textbtn"
                            onClick={() => setBioOpen((v) => !v)}
                          >
                            {bioOpen ? 'Show less' : 'Read more'}
                          </button>
                        )}
                      </section>
                    )}

                    {/* Agency record */}
                    <section className="rr-section">
                      <h3 className="rr-key">Agency record</h3>
                      {tagLine && <p className="rr-record-tags">{tagLine}</p>}
                      {notes.length > 0 ? (
                        <div className="rr-record-notes">
                          <p className="rr-record-count">
                            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                          </p>
                          {latestNote && <p className="rr-record-snippet">{latestNote}</p>}
                        </div>
                      ) : (
                        !tagLine && <p className="rr-record-empty">No notes or tags yet.</p>
                      )}
                    </section>

                    {/* Social */}
                    {social.length > 0 && (
                      <section className="rr-section">
                        <h3 className="rr-key">Social</h3>
                        <div className="rr-social">
                          {social.map((s, i) => {
                            const label = `${(s.platform || 'link').toLowerCase()} — ${
                              s.handle ? (s.handle.startsWith('@') ? s.handle : `@${s.handle}`) : s.url
                            }`;
                            return s.url ? (
                              <a
                                key={`${s.platform || 'link'}-${i}`}
                                className="rr-social-link"
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {label}
                                <ArrowUpRight size={12} strokeWidth={1.9} aria-hidden="true" />
                              </a>
                            ) : (
                              <span key={`${s.platform || 'link'}-${i}`} className="rr-social-plain">
                                {label}
                              </span>
                            );
                          })}
                        </div>
                      </section>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ───────── FOOTER DECK ───────── */}
        <footer className="rr-deck">
          {decided ? (
            <div className="rr-deck-decided">
              <StatusCell status={status} />
              <span className="rr-deck-decided-note">Decided — J / K to keep moving.</span>
            </div>
          ) : (
            <>
              <div className="rr-deck-row">
                <button
                  type="button"
                  className="rr-btn rr-btn--pass"
                  onClick={() => onDecide?.('decline')}
                  disabled={busy}
                >
                  <X size={15} strokeWidth={1.9} aria-hidden="true" />
                  Pass
                </button>
                <div className="rr-deck-primary">
                  <button
                    type="button"
                    className="rr-btn rr-btn--shortlist"
                    onClick={() => onDecide?.('shortlist')}
                    disabled={busy}
                  >
                    <Star size={15} strokeWidth={1.9} aria-hidden="true" />
                    Shortlist
                  </button>
                  <button
                    type="button"
                    className="rr-btn rr-btn--sign"
                    onClick={() => onDecide?.('accept')}
                    disabled={busy}
                  >
                    <Check size={16} strokeWidth={2} aria-hidden="true" />
                    Sign
                  </button>
                </div>
              </div>
              <div className="rr-deck-quiet">
                <div className="rr-deck-soft">
                  <button
                    type="button"
                    className="rr-textbtn"
                    onClick={() => onDecide?.('kept_on_file')}
                    disabled={busy}
                  >
                    Keep on file
                  </button>
                  <button
                    type="button"
                    className="rr-textbtn"
                    onClick={() => onDecide?.('requested_more')}
                    disabled={busy}
                  >
                    Request more digitals
                  </button>
                </div>
                <span className="rr-deck-hint">S · A · X decide — J / K next</span>
              </div>
            </>
          )}
        </footer>
      </motion.div>
    </>
  );
}
