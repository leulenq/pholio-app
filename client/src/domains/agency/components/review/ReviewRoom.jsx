import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { X, ChevronLeft, ChevronRight, ArrowUpRight, Check, Star } from 'lucide-react';
import { getApplicationDetails } from '../../api/agency';
import { resolveTier, MATCH_TIER_LABELS, normalizeScore } from '../../lib/matchTier';
import { getStatusLabel } from '../ui/StatusText';
import { formatLocation } from '../../../../shared/utils/locationFormat';
import './ReviewRoom.css';

/* ── helpers ─────────────────────────────────────────────────────── */

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
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} minutes ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  return `on ${new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
};

const titleCase = (value) =>
  value ? String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase() : '';

const imageSrc = (img) => img?.url || img?.public_url || img?.path || null;

const DECIDED = new Set(['represented', 'booked', 'accepted', 'signed', 'declined', 'passed']);

// Frame captions come from the talent's own slot picks; they read as plain
// English rather than the storage key.
const SHOT_LABELS = {
  headshot: 'Headshot',
  profile: 'Profile',
  three_quarter: 'Three-quarter',
  full_length: 'Full length',
  back: 'Back',
  portrait: 'Portrait',
  editorial: 'Editorial',
  commercial: 'Commercial',
  polaroid: 'Digital',
  digital: 'Digital',
};

const frameCaption = (img, index, count) => {
  const key = String(img?.shot_type || img?.image_type || '').toLowerCase();
  const named = SHOT_LABELS[key] || (key ? titleCase(key.replaceAll('_', ' ')) : null);
  const position = count > 1 ? `${index + 1} of ${count}` : null;
  return [named, position].filter(Boolean).join(' · ');
};

/**
 * The measurement run — canonical, dual-unit, track-aware. `profile.stats`
 * already carries render-ready `{ label, value }` lines from the server's one
 * stats formatter, so the room never re-derives measurements. The legacy
 * columns are only a fallback for records saved before that snapshot existed.
 */
function buildMeasurements(profile) {
  if (!profile) return [];
  const fields = Array.isArray(profile.stats?.fields) ? profile.stats.fields : null;
  if (fields && fields.length) {
    return fields.map((f) => ({
      label: f.label,
      value: f.key === 'hair' || f.key === 'eyes' ? titleCase(f.value) : f.value,
    }));
  }
  const legacy = [];
  const push = (label, value) => {
    if (value == null || value === '') return;
    legacy.push({ label, value: String(value) });
  };
  push('Height', profile.height_cm ? `${profile.height_cm} cm` : null);
  push(profile.bust_cm != null ? 'Bust' : 'Chest', profile.bust_cm ?? profile.chest_cm);
  push('Waist', profile.waist_cm);
  push('Hips', profile.hips_cm);
  push('Inseam', profile.inseam_cm);
  push('Dress', profile.dress_size);
  push('Suit', profile.suit_size);
  push('Shoe', profile.shoe_size);
  push('Hair', titleCase(profile.hair_color));
  push('Eyes', titleCase(profile.eye_color));
  return legacy;
}

/** A titled group of the reading column. Separated by space and one hairline. */
function Group({ title, children }) {
  return (
    <section className="rv-group">
      <h3 className="rv-group-title">{title}</h3>
      {children}
    </section>
  );
}

/* ── the review room ─────────────────────────────────────────────── */

/**
 * ReviewRoom — where an agency decides on one submission.
 *
 * A full-page editorial spread on the house cream: the talent's book occupies
 * the left leaf as a print laid on a light table; the right leaf is a single
 * reading column of paper that runs identity → measurements → the submission
 * → their words → the agency's own record, and terminates in the decision.
 *
 * There is no panel, no card, no chrome. Grouping is carried by space, a
 * hairline, and typographic weight — never by a box. Gold appears exactly
 * three times: the primary action, the active frame, and the focus ring.
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

  const type = titleCase(profile?.archetype || row?.type || 'Editorial');
  const rawCity = profile?.city || row?.city || '';
  const city = rawCity ? formatLocation(rawCity) : '';
  const status = String(application?.status || row?.status || '').toLowerCase();
  const score = application?.match_score ?? row?.match ?? null;
  const tier = score != null ? resolveTier(score) : null;
  const decided = DECIDED.has(status);
  const isMinor = Boolean(profile?.is_minor);

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

  // ---- queue navigation -------------------------------------------------
  const index = position?.index ?? 0;
  const total = position?.total ?? queue.length;
  const prevId = index > 0 ? queue[index - 1]?.applicationId ?? null : null;
  const nextId = queue[index + 1]?.applicationId ?? null;
  const remaining = queue.filter((q) => !DECIDED.has(String(q.status || '').toLowerCase())).length;

  // Paging direction drives the crossfade (adjust-on-prop-change, no effect).
  const [paging, setPaging] = useState({ index, dir: 1 });
  if (index !== paging.index) {
    setPaging({ index, dir: index > paging.index ? 1 : -1 });
  }
  const dir = paging.dir;

  // Frames page with ArrowLeft / ArrowRight — the only list keys the room owns.
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

  // Open with the room focused so screen readers announce the dialog and the
  // page's keyboard triage keeps working without a click.
  useEffect(() => {
    roomRef.current?.focus({ preventScroll: true });
  }, []);

  // ---- reading content --------------------------------------------------
  const measurements = useMemo(() => buildMeasurements(profile), [profile]);
  const measurementNote = profile?.stats?.is_stale && profile?.stats?.updated_days_ago != null
    ? `Last confirmed ${Math.round(profile.stats.updated_days_ago / 30) || 1} months ago`
    : null;

  const bioText = profile?.bio_curated || profile?.bio_raw || '';
  const bioLong = bioText.length > 280;

  const boards = useMemo(
    () => (Array.isArray(submissionPackage?.boards) ? submissionPackage.boards.filter(Boolean) : []),
    [submissionPackage],
  );
  const contact = submissionPackage?.contact || null;
  const compCard = submissionPackage?.compCard || null;
  const mediaSetName = submissionPackage?.mediaSet?.name || null;
  const packageRedacted = Boolean(submissionPackage?.redacted || submissionPackage?.revoked);

  const submittedAgo = timeAgo(submissionPackage?.submittedAt || application?.created_at || row?.appliedAt);
  const origin = application
    ? (application.invited_by_agency_id ? 'Invited by your agency' : 'Open application')
    : null;

  const tagList = useMemo(
    () => tags.map((t) => (typeof t === 'string' ? t : t?.tag || t?.label || t?.name)).filter(Boolean),
    [tags],
  );
  const latestNote = notes.length ? (notes[0]?.body || notes[0]?.note || notes[0]?.text || '') : '';
  const social = useMemo(
    () => (Array.isArray(profile?.social) ? profile.social.filter((s) => s?.handle || s?.url) : []),
    [profile],
  );
  const hasRecord = tagList.length > 0 || notes.length > 0 || social.length > 0;

  const identityLine = [type, city, profile?.age ? `${profile.age}` : null].filter(Boolean).join(' · ');
  const standing = decided || status === 'shortlisted' || (status && status !== 'submitted' && status !== 'pending')
    ? getStatusLabel(status)
    : null;

  // Rendered through a portal so the takeover escapes the dashboard shell's
  // stacking context.
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
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* ── the lintel: exit on one side, the queue on the other ── */}
      <header className="rv-lintel">
        <div className="rv-lintel-left">
          <button type="button" className="rv-exit" onClick={onClose}>
            <X size={16} strokeWidth={1.8} aria-hidden="true" />
            Close
          </button>
          <span className="rv-lintel-where">Submissions review</span>
        </div>

        <div className="rv-lintel-right">
          {remaining > 0 && (
            <span className="rv-lintel-rest">
              {remaining} awaiting a decision
            </span>
          )}
          {total > 1 && (
            <div className="rv-step">
              <button
                type="button"
                className="rv-step-btn"
                onClick={() => prevId && onJump?.(prevId)}
                disabled={!prevId}
                aria-label="Previous submission"
              >
                <ChevronLeft size={17} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <span className="rv-step-count">{index + 1} of {total}</span>
              <button
                type="button"
                className="rv-step-btn"
                onClick={() => nextId && onJump?.(nextId)}
                disabled={!nextId}
                aria-label="Next submission"
              >
                <ChevronRight size={17} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={applicationId}
          className="rv-spread"
          initial={{ opacity: 0, y: 8 * dir }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 * dir }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* ── left leaf: the book, on the light table ── */}
          <figure className="rv-leaf">
            <div className={`rv-plate${isLoading && !activeImage ? ' is-waiting' : ''}`}>
              {activeImage ? (
                <button
                  type="button"
                  className="rv-print"
                  style={{ backgroundImage: `url(${imageSrc(activeImage)})` }}
                  onClick={() => setZoom(true)}
                  aria-label={`View ${name}'s frame at full size`}
                />
              ) : (
                <div className="rv-print rv-print--empty" role="img" aria-label={name}>
                  {!isLoading && <span className="rv-print-initials">{initials(name)}</span>}
                </div>
              )}
            </div>

            <figcaption className="rv-leaf-foot">
              {images.length > 0 && (
                <span className="rv-frame-caption">
                  {frameCaption(activeImage, activeFrame, images.length)}
                </span>
              )}
              {multi && (
                <div className="rv-frames" role="group" aria-label="Submitted frames">
                  {images.map((img, i) => (
                    <button
                      key={img.id || imageSrc(img) || i}
                      type="button"
                      aria-pressed={i === activeFrame}
                      aria-label={`Frame ${i + 1} of ${images.length}`}
                      className={`rv-frame${i === activeFrame ? ' is-on' : ''}`}
                      style={{ backgroundImage: `url(${imageSrc(img)})` }}
                      onClick={() => setFrame(i)}
                    />
                  ))}
                </div>
              )}
            </figcaption>
          </figure>

          {/* ── right leaf: the reading column ── */}
          <div className="rv-column">
            <div className="rv-read">
              <div className="rv-head">
                <h2 className="rv-name">{name}</h2>
                {identityLine && <p className="rv-identity">{identityLine}</p>}

                {score != null && (
                  <p className="rv-match">
                    <span className="rv-match-num">{normalizeScore(score)}</span>
                    <span className="rv-match-word">{MATCH_TIER_LABELS[tier]} match</span>
                  </p>
                )}

                {isMinor && (
                  <p className="rv-flag">
                    Minor — handle under your Kids &amp; Teens custody rules.
                  </p>
                )}
                {standing && (
                  <p className="rv-standing">
                    <span>Standing</span>
                    {standing}
                  </p>
                )}
              </div>

              {isError ? (
                <div className="rv-group rv-empty">
                  <p>This submission could not be loaded.</p>
                  <button type="button" className="rv-textbtn" onClick={() => refetch()}>Try again</button>
                </div>
              ) : isLoading ? (
                <div className="rv-waiting" aria-hidden="true">
                  {[70, 52, 64, 44, 58].map((w, i) => (
                    <span key={i} className="rv-bone" style={{ width: `${w}%` }} />
                  ))}
                </div>
              ) : (
                <>
                  {measurements.length > 0 && (
                    <Group title="Measurements">
                      <dl className="rv-facts">
                        {measurements.map((m) => (
                          <div className="rv-fact" key={m.label}>
                            <dt>{m.label}</dt>
                            <dd>{m.value}</dd>
                          </div>
                        ))}
                      </dl>
                      {measurementNote && <p className="rv-aside">{measurementNote}</p>}
                    </Group>
                  )}

                  <Group title="The submission">
                    <dl className="rv-facts">
                      <div className="rv-fact">
                        <dt>Submitted for</dt>
                        <dd>{boards.length ? boards.join(' · ') : 'General consideration'}</dd>
                      </div>
                      {submittedAgo && (
                        <div className="rv-fact">
                          <dt>Received</dt>
                          <dd>{submittedAgo}</dd>
                        </div>
                      )}
                      {origin && (
                        <div className="rv-fact">
                          <dt>Route</dt>
                          <dd>{origin}</dd>
                        </div>
                      )}
                      {images.length > 0 && (
                        <div className="rv-fact">
                          <dt>Frames</dt>
                          <dd>{images.length}{mediaSetName ? ` · ${mediaSetName}` : ''}</dd>
                        </div>
                      )}
                      {profile?.nationality && (
                        <div className="rv-fact">
                          <dt>Nationality</dt>
                          <dd>{profile.nationality}</dd>
                        </div>
                      )}
                      {Array.isArray(profile?.languages) && profile.languages.length > 0 && (
                        <div className="rv-fact">
                          <dt>Languages</dt>
                          <dd>{profile.languages.join(', ')}</dd>
                        </div>
                      )}
                    </dl>

                    {packageRedacted && (
                      <p className="rv-aside">
                        The talent withdrew this submission; its disclosure package is no longer available.
                      </p>
                    )}

                    <div className="rv-links">
                      {compCard?.viewUrl && (
                        <a className="rv-link" href={compCard.viewUrl} target="_blank" rel="noopener noreferrer">
                          {compCard.name || 'Comp card'}
                          <ArrowUpRight size={13} strokeWidth={1.9} aria-hidden="true" />
                        </a>
                      )}
                      {contact?.email && (
                        <a className="rv-link" href={`mailto:${contact.email}`}>{contact.email}</a>
                      )}
                      {contact?.phone && (
                        <a className="rv-link" href={`tel:${contact.phone}`}>{contact.phone}</a>
                      )}
                    </div>
                  </Group>

                  {bioText && (
                    <Group title="In their words">
                      <p className={`rv-prose${bioLong && !bioOpen ? ' is-clamped' : ''}`}>{bioText}</p>
                      {bioLong && (
                        <button type="button" className="rv-textbtn" onClick={() => setBioOpen((v) => !v)}>
                          {bioOpen ? 'Show less' : 'Read more'}
                        </button>
                      )}
                    </Group>
                  )}

                  {hasRecord && (
                    <Group title="Your record">
                      {tagList.length > 0 && <p className="rv-prose">{tagList.join(' · ')}</p>}
                      {notes.length > 0 && (
                        <p className="rv-prose">
                          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                          {latestNote ? ` — “${latestNote.slice(0, 120)}${latestNote.length > 120 ? '…' : ''}”` : ''}
                        </p>
                      )}
                      {social.length > 0 && (
                        <div className="rv-links">
                          {social.map((s, i) => {
                            const handle = s.handle
                              ? (s.handle.startsWith('@') ? s.handle : `@${s.handle}`)
                              : s.url;
                            const label = `${titleCase(s.platform || 'Link')} ${handle}`;
                            return s.url ? (
                              <a
                                key={`${s.platform || 'link'}-${i}`}
                                className="rv-link"
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {label}
                                <ArrowUpRight size={13} strokeWidth={1.9} aria-hidden="true" />
                              </a>
                            ) : (
                              <span key={`${s.platform || 'link'}-${i}`} className="rv-link rv-link--flat">{label}</span>
                            );
                          })}
                        </div>
                      )}
                    </Group>
                  )}
                </>
              )}
            </div>

            {/* ── the decision: where the column terminates ── */}
            <div className="rv-decide">
              {decided ? (
                <p className="rv-decided">
                  <strong>{getStatusLabel(status)}</strong>
                  <span>Move on with the arrows above.</span>
                </p>
              ) : (
                <>
                  <div className="rv-verbs">
                    <button
                      type="button"
                      className="rv-verb rv-verb--sign"
                      onClick={() => onDecide?.('accept')}
                      disabled={busy}
                    >
                      <Check size={16} strokeWidth={2.1} aria-hidden="true" />
                      Sign
                    </button>
                    <button
                      type="button"
                      className="rv-verb"
                      onClick={() => onDecide?.('shortlist')}
                      disabled={busy}
                    >
                      <Star size={15} strokeWidth={1.9} aria-hidden="true" />
                      Shortlist
                    </button>
                    <button
                      type="button"
                      className="rv-verb rv-verb--pass"
                      onClick={() => onDecide?.('decline')}
                      disabled={busy}
                    >
                      Pass
                    </button>
                  </div>
                  <div className="rv-softs">
                    <button type="button" className="rv-textbtn" onClick={() => onDecide?.('kept_on_file')} disabled={busy}>
                      Keep on file
                    </button>
                    <button type="button" className="rv-textbtn" onClick={() => onDecide?.('requested_more')} disabled={busy}>
                      Request more digitals
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ── full-size look ── */}
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
            <button type="button" className="rv-zoom-close" aria-label="Close full-size view">
              <X size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}
