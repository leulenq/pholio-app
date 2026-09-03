import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { getProfilePreview, dismissTalent, undismissTalent } from '../../api/agency';
import { ageFigure, cmToImperial, recency, typeset, enumLabel } from '../meta/metaFormat';
import { formatLocation } from '../../../../shared/utils/locationFormat';
import './ScoutRoom.css';

/* ────────────────────────────────────────────────────────────────────
   The Scout Room. The surface an agency reads a LEAD on.

   Scout sits before the application lifecycle begins: the agency went
   looking, the talent has not submitted, and nothing here is a verdict.
   The one outbound action is the industry's "request digitals", which in
   Pholio is an invitation to apply. Everything the Review Room does with
   verdicts, keystroke decisions, auto advance and a session tally belongs
   to a stage this surface has not reached.

   It joins the Review Room's system and inverts one thing on purpose: the
   Review Room is a paper page with an ink bar, and this is an ink stage
   with a paper rail. The Review Room adjudicates a record. Scout reads a
   book, so photography owns the surface.

   Composition:
     chrome   the search you are inside, the band, the position, the pager
     stage    the book on ink at maximum size, the facts beside it on paper
     record   the whole book, their own words, and the stated boundary
     bar      one outbound verb, one private verb, the movement hint

   Keyboard:
     left / right   the previous and next lead in the result set
     up / down      the previous and next frame of the book
     Esc            close, returning focus to the card you were on
   ──────────────────────────────────────────────────────────────────── */

/* ── local formatters ────────────────────────────────────────────────
   Recency comes from the shared metaFormat module, so this room cannot
   grow a sixth timeAgo. The two below are absolute date FORMS rather
   than elapsed time, which metaFormat does not carry: a long day for a
   contact event ("2 June"), a bare month for a measurement date, which
   is deliberately coarser than the day it was typed. */

const LOCALE = 'en-GB';

const asDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const sameYear = (d) => d.getUTCFullYear() === new Date().getUTCFullYear();

/** "2 June", or "2 June 2025" once the year matters. */
function longDay(value) {
  const d = asDate(value);
  if (!d) return null;
  return d.toLocaleDateString(LOCALE, {
    day: 'numeric', month: 'long', timeZone: 'UTC',
    ...(sameYear(d) ? {} : { year: 'numeric' }),
  });
}

/** "June", or "June 2025" once the year matters. */
function longMonth(value) {
  const d = asDate(value);
  if (!d) return null;
  return d.toLocaleDateString(LOCALE, {
    month: 'long', timeZone: 'UTC',
    ...(sameYear(d) ? {} : { year: 'numeric' }),
  });
}

const imageSrc = (img) => img?.public_url || img?.url || img?.path || null;

const listOf = (v) => {
  if (Array.isArray(v)) return v.filter((s) => typeof s === 'string' && s.trim());
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
};

/* Dev seeds carry a placeholder bio. Printing it as the talent's own
   words would be a claim about them that is not theirs. */
const realBio = (b) => {
  const t = typeof b === 'string' ? b.trim() : '';
  if (!t || /^demo talent profile\.?$/i.test(t)) return null;
  return t;
};

/* ── representation: the gate ─────────────────────────────────────────
   A scout who approaches someone exclusive with another mother agency has
   made a real professional mistake, so this is the first and most
   prominent fact in the column, and it is always words. Absence is not a
   positive claim, and `unrepresented` is an absence: the DTO returns it
   whenever a profile has no active representation row, no legacy agency
   string and no seeking flag, which is exactly the profile of a talent who
   never answered the question. A talent who IS free and wants to be found
   reads as `seeking`, so nothing is lost by refusing to assert the rest. */
function representationLine(profile) {
  const status = profile?.representation_status;
  if (status === 'seeking') return { text: 'Seeking representation', tone: 'free' };
  if (status === 'exclusive_elsewhere') return { text: 'Exclusive elsewhere', tone: 'taken' };
  if (status === 'represented') {
    const by = typeof profile?.represented_by === 'string' ? profile.represented_by.trim() : '';
    if (by && by.toLowerCase() !== 'undisclosed') {
      return { text: `Represented by ${by}`, tone: 'taken' };
    }
    return { text: 'Represented, agency undisclosed', tone: 'taken' };
  }
  return { text: 'Representation not stated', tone: 'unknown' };
}

/* ── figures ──────────────────────────────────────────────────────────
   Bust, waist, hips and shoe are the published set every board reads, so
   each one states its own absence. Inseam, dress and suit print only when
   published: a suit size reading "Not listed" on every women's board is
   manufactured absence, not honesty. */
function measurementRows(p) {
  const bust = p?.bust_cm ?? null;
  const chest = p?.chest_cm ?? null;
  const rows = [
    { key: bust == null && chest != null ? 'Chest' : 'Bust', cm: bust ?? chest },
    { key: 'Waist', cm: p?.waist_cm ?? null },
    { key: 'Hips', cm: p?.hips_cm ?? null },
    { key: 'Shoe', text: p?.shoe_size ? typeset(String(p.shoe_size)) : null },
  ];
  if (p?.inseam_cm != null) rows.push({ key: 'Inseam', cm: p.inseam_cm });
  if (p?.dress_size) rows.push({ key: 'Dress', text: typeset(String(p.dress_size)) });
  if (p?.suit_size) rows.push({ key: 'Suit', text: typeset(String(p.suit_size)) });
  return rows;
}

/* Declared appearance and working facts. Every one prints only when the
   talent published it. */
function declaredRows(p) {
  if (!p) return [];
  /* A declared yes or no arrives as a boolean on Postgres and as 0 or 1 on
     SQLite. Both are the same statement by the talent, and a declared "no"
     is a fact rather than an absence, so it prints. */
  const declared = (v) => {
    if (v === true || v === 1) return 'Yes';
    if (v === false || v === 0) return 'None declared';
    return v || null;
  };
  const rows = [
    { key: 'Hair', value: p.hair_color ? enumLabel(p.hair_color) : null },
    { key: 'Eyes', value: p.eye_color ? enumLabel(p.eye_color) : null },
    { key: 'Heritage', value: listOf(p.heritage).join(', ') || null },
    { key: 'Languages', value: listOf(p.languages).join(', ') || null },
    { key: 'Experience', value: p.experience_level ? enumLabel(p.experience_level) : null },
    { key: 'Specialties', value: listOf(p.specialties).join(', ') || null },
    { key: 'Union', value: p.union_membership ? String(p.union_membership) : null },
    { key: 'Travel', value: declared(p.availability_travel) },
    {
      key: 'Playing age',
      value: p.playing_age_min && p.playing_age_max
        ? `${p.playing_age_min} to ${p.playing_age_max}`
        : null,
    },
    { key: 'Tattoos', value: declared(p.tattoos) },
    { key: 'Piercings', value: declared(p.piercings) },
  ];
  return rows.filter((r) => r.value);
}

const bandLabel = (band) => {
  if (band === 'match') return 'Exact match';
  if (band === 'partial') return 'Close match';
  return null;
};

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

/* ════════════════════════════════════════════════════════════════════ */

export default function ScoutRoom({
  talent,
  talents = [],
  brief = '',
  onClose,
  onNavigate,
  onInvite,
  inviting = false,
}) {
  const roomRef = useRef(null);
  const scrollRef = useRef(null);
  const stripRef = useRef(null);
  const reduce = useReducedMotion();

  const [frame, setFrame] = useState(0);
  const [dismissedLocal, setDismissedLocal] = useState(null);

  /* The card supplies the instant header so the room opens without a
     blank flash; the preview supplies the book. Progressive, not
     blocking. */
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['discover-preview', talent?.id],
    queryFn: () => getProfilePreview(talent.id),
    enabled: !!talent?.id,
    staleTime: 60_000,
  });

  const profile = useMemo(() => {
    if (!data) return null;
    if (data.profile) return data.profile;
    return typeof data === 'object' && data.id ? data : null;
  }, [data]);

  // Reset per lead view state when the result set advances.
  const [prevId, setPrevId] = useState(talent?.id);
  if (prevId !== talent?.id) {
    setPrevId(talent?.id);
    setFrame(0);
    setDismissedLocal(null);
  }
  useEffect(() => {
    try { scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' }); } catch { /* jsdom */ }
  }, [talent?.id]);

  // ── position in the result set ──
  const index = talents.findIndex((t) => t.id === talent?.id);
  const at = index >= 0 ? index : 0;
  const prevTalent = at > 0 ? talents[at - 1] : null;
  const nextTalent = at < talents.length - 1 ? talents[at + 1] : null;
  const total = talents.length || 1;
  const band = bandLabel(talent?.band);

  // ── identity ──
  const name = useMemo(() => {
    const full = profile?.display_name
      || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
    return full || talent?.name || 'Talent';
  }, [profile, talent]);

  const lanes = listOf(profile?.lanes).length ? listOf(profile.lanes) : listOf(talent?.archetype);
  const rawCity = profile?.city || talent?.city || '';
  const city = rawCity ? formatLocation(rawCity) : '';
  const citySecond = profile?.city_secondary ? formatLocation(profile.city_secondary) : '';
  const isMinor = Boolean(profile?.is_minor);
  /* Only one of the two age bands does any work on an agency surface. The
     adult band states the launch posture back at the reader and earns no
     line, which is the rule metaFormat's bandFigure already holds. */
  const ageBand = ageFigure({ age_band: profile?.age_band })?.value || null;

  const factParts = [
    lanes.join(' · ') || null,
    [city, citySecond].filter(Boolean).join(' and ') || null,
  ].filter(Boolean);

  // ── the book, in the talent's own order ──
  const images = useMemo(() => {
    const list = Array.isArray(profile?.images) ? profile.images.filter(imageSrc) : [];
    if (list.length) return list;
    if (!profile && talent?.photo) return [{ id: 'card', path: talent.photo }];
    return [];
  }, [profile, talent]);

  /* Until the profile lands, the only frame in hand is the card's, which is
     enough to open the room without a blank flash but is not the book. The
     count and the strip wait for the real thing rather than claiming a one
     frame book. */
  const bookReady = !isLoading && !!profile;
  const frameCount = images.length;
  const safeFrame = frameCount ? Math.min(frame, frameCount - 1) : 0;
  const currentSrc = frameCount ? imageSrc(images[safeFrame]) : null;

  const frameWord = !bookReady
    ? 'Loading the book'
    : frameCount === 0
      ? 'No frames published'
      : `${frameCount} ${frameCount === 1 ? 'frame' : 'frames'}`;

  const stepFrame = useCallback((delta) => {
    if (frameCount < 2) return;
    setFrame((f) => {
      const nextIndex = (f + delta + frameCount) % frameCount;
      const tab = stripRef.current?.querySelectorAll('button')[nextIndex];
      if (stripRef.current?.contains(document.activeElement)) tab?.focus();
      return nextIndex;
    });
  }, [frameCount]);

  const raiseFrame = useCallback((i) => {
    setFrame(i);
    try {
      scrollRef.current?.scrollTo({ top: 0, behavior: reduce ? 'instant' : 'smooth' });
    } catch { /* jsdom */ }
  }, [reduce]);

  // ── representation, figures, freshness, contact ──
  const rep = representationLine(profile);
  const heightCm = profile?.height_cm ?? null;
  const rows = measurementRows(profile);
  const declared = declaredRows(profile);
  const bio = realBio(profile?.bio_curated ?? talent?.bio);
  const why = typeof talent?.why === 'string' && talent.why.trim() ? talent.why.trim() : null;
  const slug = profile?.slug || null;

  /* Freshness has exactly two possible sources here, and neither is
     guaranteed. One quiet line when there is something true to say, and
     nothing at all when there is not. */
  const updated = recency(profile?.profile_updated_at)?.label || null;
  const measured = longMonth(profile?.measurements_updated_at);
  const freshnessLine = updated
    ? (measured ? `Updated ${updated} · measurements updated ${measured}` : `Updated ${updated}`)
    : (measured ? `Measurements updated ${measured}` : null);

  const contact = profile?.contact || null;
  const invitedAt = contact?.invited_at || null;
  const appliedAt = contact?.applied_at || null;
  const invited = Boolean(talent?.isInvited || profile?.is_invited || invitedAt);

  const contactLines = [];
  if (invitedAt) contactLines.push(`Invited ${longDay(invitedAt)}`);
  else if (invited) contactLines.push('Invited');
  if (appliedAt) contactLines.push(`Applied ${longDay(appliedAt)}`);
  if (!contactLines.length) contactLines.push('No prior contact');

  // ── not for us: private, never communicated ──
  const dismissed = dismissedLocal ?? Boolean(profile?.dismissed || talent?.dismissed);

  const dismiss = useMutation({
    mutationFn: ({ id, on }) => (on ? dismissTalent(id) : undismissTalent(id)),
    onMutate: ({ on }) => setDismissedLocal(on),
    onError: (_err, { on }) => {
      setDismissedLocal(!on);
      toast.error(on ? 'Could not save that' : 'Could not undo that');
    },
  });

  // ── keyboard, focus trap, body scroll ──
  const keys = useRef(null);
  useEffect(() => {
    keys.current = { prevTalent, nextTalent, stepFrame };
  });

  useEffect(() => {
    const onKeyCapture = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose?.();
    };
    window.addEventListener('keydown', onKeyCapture, true);
    return () => window.removeEventListener('keydown', onKeyCapture, true);
  }, [onClose]);

  useEffect(() => {
    /* One handler owns all four arrows, so the two scopes cannot collide:
       left and right are always the result set, up and down are always the
       book, wherever focus sits inside the room. */
    const onKey = (e) => {
      const k = keys.current;
      if (!k) return;

      if (e.key === 'Tab') {
        const nodes = roomRef.current?.querySelectorAll(FOCUSABLE);
        if (!nodes || !nodes.length) return;
        const list = Array.from(nodes).filter((n) => n.offsetParent !== null || n === document.activeElement);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (k.prevTalent) onNavigate?.(k.prevTalent);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (k.nextTalent) onNavigate?.(k.nextTalent);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        k.stepFrame(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        k.stepFrame(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNavigate]);

  useEffect(() => { roomRef.current?.focus({ preventScroll: true }); }, []);

  useEffect(() => {
    const prior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prior; };
  }, []);

  if (!talent) return null;

  const scope = brief ? `“${brief}”` : 'Newest talent';
  const fade = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  const figure = (row) => {
    if (row.cm != null) {
      return (
        <dd className="sc-figure">
          {Math.round(row.cm)}
          <em>cm</em>
          <span className="sc-fig-sub">{Math.round(row.cm / 2.54)}″</span>
        </dd>
      );
    }
    if (row.text) return <dd className="sc-figure">{row.text}</dd>;
    return <dd className="sc-absent">Not listed</dd>;
  };

  return createPortal(
    <motion.div
      ref={roomRef}
      className="sc-room"
      role="dialog"
      aria-modal="true"
      aria-label={`Scouting ${name}`}
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* ───── chrome: the search you are inside ───── */}
      <header className="sc-top">
        <button type="button" className="sc-top-mark" onClick={onClose} aria-label="Back to the search">
          <span>Pholio</span>
        </button>

        <div className="sc-top-scope sc-chrome-caps">
          <span>Scouting</span>
          <strong title={brief || 'Newest talent'}>{scope}</strong>
        </div>

        <div className="sc-top-end">
          <p className="sc-ledger sc-read" aria-live="polite">
            {band && (
              <>
                <strong className="sc-ledger-band">{band}</strong>
                <i className="sc-ledger-sep" aria-hidden="true">·</i>
              </>
            )}
            <span>{at + 1} / {total}</span>
          </p>
          <div className="sc-pager">
            <button
              type="button"
              onClick={() => prevTalent && onNavigate?.(prevTalent)}
              disabled={!prevTalent}
              aria-label="Previous talent"
            >
              <ChevronLeft size={16} strokeWidth={1.7} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => nextTalent && onNavigate?.(nextTalent)}
              disabled={!nextTalent}
              aria-label="Next talent"
            >
              <ChevronRight size={16} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </div>
          <button type="button" className="sc-close" onClick={onClose} aria-label="Close">
            <X size={17} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* ───── body: the stage, then the record ───── */}
      <div className="sc-scroll" ref={scrollRef}>
        {isError ? (
          <div className="sc-halt">
            <p className="sc-prose">This profile could not be loaded.</p>
            <button type="button" className="sc-quietbtn" onClick={() => refetch()}>Try again</button>
          </div>
        ) : (
          <motion.div {...fade} transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}>
            {/* ═══ THE STAGE ═══ */}
            <section className="sc-stage" aria-label="The book and the facts">
              <div className="sc-book">
                <div
                  className={`sc-plate${!currentSrc && !bookReady ? ' sc-plate--wait' : ''}${!currentSrc && bookReady ? ' sc-plate--empty' : ''}`}
                  id="sc-plate"
                  role="tabpanel"
                  aria-label={frameCount ? `Frame ${safeFrame + 1} of ${frameCount}` : 'No frames published'}
                >
                  <AnimatePresence initial={false}>
                    {currentSrc && (
                      <motion.img
                        key={currentSrc}
                        src={currentSrc}
                        alt={`${name}, frame ${safeFrame + 1} of ${frameCount}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduce ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
                      />
                    )}
                  </AnimatePresence>
                  {!currentSrc && bookReady && (
                    <span className="sc-plate-initial" aria-hidden="true">{name.charAt(0)}</span>
                  )}
                </div>

                {/* The strip is the talent's own order. No imposed slots, no
                    empty frames for shots nobody requested. */}
                <div className="sc-stripline">
                  {bookReady && frameCount > 0 && (
                    <div
                      className="sc-strip"
                      ref={stripRef}
                      role="tablist"
                      aria-orientation="vertical"
                      aria-label="Frames"
                    >
                      {images.map((img, i) => (
                        <button
                          key={img.id || imageSrc(img) || i}
                          type="button"
                          role="tab"
                          aria-selected={i === safeFrame}
                          aria-controls="sc-plate"
                          aria-label={`Frame ${i + 1}`}
                          tabIndex={i === safeFrame ? 0 : -1}
                          style={{ backgroundImage: `url(${imageSrc(img)})` }}
                          onClick={() => setFrame(i)}
                        />
                      ))}
                    </div>
                  )}
                  <p className="sc-stripcount sc-read">{frameWord}</p>
                </div>
              </div>

              {/* ── the facts, on paper, in the scout's order of attention ── */}
              <aside className="sc-facts" aria-label="The facts">
                <h2 className="sc-name">{name}</h2>

                {(factParts.length > 0 || isMinor || ageBand) && (
                  <p className="sc-factline sc-value">
                    {factParts.map((part, i) => (
                      <React.Fragment key={part}>
                        {i > 0 && <i aria-hidden="true">·</i>}
                        <span>{part}</span>
                      </React.Fragment>
                    ))}
                    {(isMinor || ageBand) && (
                      <>
                        {factParts.length > 0 && <i aria-hidden="true">·</i>}
                        <span className={isMinor ? 'sc-fact-alert' : undefined}>
                          {ageBand || 'Under 18'}
                        </span>
                      </>
                    )}
                  </p>
                )}

                <div className="sc-block">
                  <span className="sc-block-key sc-key">Representation</span>
                  <p className={`sc-rep-value sc-rep--${rep.tone}`}>{rep.text}</p>
                  {rep.tone === 'taken' && (
                    <p className="sc-rep-note sc-prose">
                      Check before you approach. This person already has an agency relationship.
                    </p>
                  )}
                </div>

                <dl className="sc-figures">
                  <div className="sc-fig sc-fig--lead">
                    <dt className="sc-key">Height</dt>
                    {heightCm != null ? (
                      <dd className="sc-figure">
                        <span className="sc-fig-imp">{cmToImperial(heightCm)}</span>
                        <span className="sc-fig-sub">{Math.round(heightCm)} cm</span>
                      </dd>
                    ) : (
                      <dd className="sc-absent">Not listed</dd>
                    )}
                  </div>
                  {rows.map((row) => (
                    <div className="sc-fig" key={row.key}>
                      <dt className="sc-key">{row.key}</dt>
                      {figure(row)}
                    </div>
                  ))}
                </dl>

                {freshnessLine && (
                  <div className="sc-lines">
                    <p className="sc-prose sc-lead-line">{freshnessLine}</p>
                  </div>
                )}

                {why && (
                  <div className="sc-block">
                    <span className="sc-block-key sc-key">Matched your brief</span>
                    <p className="sc-why-line sc-prose">{why}</p>
                  </div>
                )}

                <div className="sc-block">
                  <span className="sc-block-key sc-key">Prior contact</span>
                  {contactLines.map((line) => (
                    <p className="sc-prose sc-lead-line" key={line}>{line}</p>
                  ))}
                </div>
              </aside>
            </section>

            {/* ═══ THE RECORD ═══ */}
            <div className="sc-record">
              <section className="sc-sec">
                <h3 className="sc-sec-title sc-marker">The book in full</h3>
                {bookReady && frameCount > 0 ? (
                  <ul className="sc-bookgrid">
                    {images.map((img, i) => (
                      <li key={img.id || imageSrc(img) || i}>
                        <button
                          type="button"
                          aria-current={i === safeFrame}
                          aria-label={`Raise frame ${i + 1}`}
                          style={{ backgroundImage: `url(${imageSrc(img)})` }}
                          onClick={() => raiseFrame(i)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="sc-quiet sc-prose">
                    {bookReady ? 'This person has not published any frames.' : 'Loading the book'}
                  </p>
                )}
              </section>

              <div className="sc-recordcols">
                <div className="sc-recordmain">
                  <section className="sc-sec">
                    <h3 className="sc-sec-title sc-marker">In their words</h3>
                    {bio
                      ? <p className="sc-bio sc-prose">{bio}</p>
                      : <p className="sc-quiet sc-prose">No bio published.</p>}
                  </section>

                  {/* The stated boundary. An agency is looking at someone who
                      did not contact them, so what is not here is said
                      plainly, beside their own words rather than after them. */}
                  <section className="sc-sec sc-boundary">
                    <h3 className="sc-sec-title sc-marker">What an application would add</h3>
                    <p className="sc-prose">
                      This page shows what this person chose to publish. It does not include their
                      dossier, their exact date of birth, their contact details, or any measurements
                      they have not published.
                    </p>
                    <p className="sc-prose">
                      An application is the only thing that makes those visible.
                    </p>
                  </section>
                </div>

                <section className="sc-sec">
                  <h3 className="sc-sec-title sc-marker">Published details</h3>
                  {declared.length > 0 ? (
                    <dl className="sc-dlist">
                      {declared.map((row) => (
                        <div className="sc-drow" key={row.key}>
                          <dt className="sc-key">{row.key}</dt>
                          <dd className="sc-value">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="sc-quiet sc-prose">
                      {bookReady ? 'Nothing else published.' : 'Loading'}
                    </p>
                  )}
                </section>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* ───── the bar: one outbound verb, one private verb ───── */}
      <footer className="sc-bar">
        <div className="sc-bar-row">
          <div className="sc-act">
            <div className="sc-act-row">
              <button
                type="button"
                className={`sc-invite${invited ? ' sc-invite--done' : ''}`}
                disabled={invited || inviting}
                onClick={() => onInvite?.(talent)}
              >
                {invited ? 'Invited' : inviting ? 'Sending' : 'Invite to apply'}
              </button>
              {invited && invitedAt && (
                <span className="sc-act-when sc-annot">{longDay(invitedAt)}</span>
              )}
            </div>
            <p className="sc-consent">
              An invitation asks them to apply. It does not share your search or open their dossier.
            </p>
          </div>

          <div className="sc-private">
            {slug && (
              <>
                <a
                  className="sc-quietbtn"
                  href={`/pdf/${slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Comp card
                </a>
                <a
                  className="sc-quietbtn"
                  href={`/portfolio/${slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Portfolio
                </a>
                <span className="sc-privatesep" aria-hidden="true">·</span>
              </>
            )}
            {dismissed ? (
              <>
                <span>Not for us</span>
                <button
                  type="button"
                  className="sc-quietbtn"
                  onClick={() => dismiss.mutate({ id: talent.id, on: false })}
                >
                  Undo
                </button>
              </>
            ) : (
              <button
                type="button"
                className="sc-quietbtn"
                onClick={() => dismiss.mutate({ id: talent.id, on: true })}
              >
                Not for us
              </button>
            )}
          </div>

          <p className="sc-hint sc-read">← → talent · ↑ ↓ frames</p>
        </div>
      </footer>
    </motion.div>,
    document.body,
  );
}
