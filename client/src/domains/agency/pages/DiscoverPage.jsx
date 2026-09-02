/**
 * DiscoverPage — "The Signal"
 *
 * Natural-language talent discovery. Agency-branded dark surface.
 *
 *   1. Threshold — the serif invitation and the bar. Once a brief has run the
 *                  invitation collapses and the bar rises to the top of the
 *                  column, so the first row of results is above the fold.
 *   2. Brief line — the reading of the brief, set as one sentence rather than
 *                  a rack of boxes. A phrase underlines in gold when reached
 *                  for and offers the one gesture that drops it.
 *   3. Grid      — exact matches first, then the closest, each card saying why
 *   4. Detail    — full-frame modal
 *
 * The brief becomes requirements. Ordering is a function of the booker's stated
 * requirements against the talent's own declared facts: no score, no ranking
 * number, no opinion about a face.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, ArrowRight, ArrowUp } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getDiscoverableTalent, inviteTalent, getAgencyProfile } from '../api/agency';
import { predictCompletion } from '../lib/intentParser';
import { DivisionMark } from '../components/status';
import BriefLine from '../components/BriefLine';
import { DiscoverDetail } from './DiscoverDetail';
import Grainient from './Grainient';
import { Place } from '../components/meta';
import { cmToImperial } from '../components/meta/metaFormat';
import './DiscoverPage.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');
/* Height comes from the shared formatter. The local one here rounded feet
   before the remainder (5′ 12″ at 182cm) and used straight quotes where the
   rest of the system uses primes. */
const fmtHeight = (cm) => cmToImperial(cm);
const strList = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.trim()) : []);
const firstPhoto = (imgs) => {
  const img = Array.isArray(imgs) ? imgs[0] : null;
  return img ? (img.public_url || img.path) : null;
};
// Treat dev placeholder bios as empty so cards don't show filler.
const realBio = (b) => {
  if (!b) return null;
  const t = b.trim();
  if (!t || /^demo talent profile\.?$/i.test(t)) return null;
  return t;
};

const PAGE_SIZE = 30;

/* The house easing (ease-out expo) and the threshold's compaction duration.
   One pair, so the headline collapse and the bar's rise are the same gesture. */
const EASE = [0.16, 1, 0.3, 1];
const THRESHOLD_MS = 0.5;

/**
 * The house AI mark — the same thin-waisted Pholio spark the talent bio writer
 * uses (BioWriter.jsx · PholioMagicMark), so "Pholio is reading this" looks the
 * same on both sides of the product. Static here; the bar's own ring carries
 * the motion.
 */
function PholioMark() {
  return (
    <svg className="dc-bar-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M9.7 3.4 C10.9 8.2 12.6 9.9 17.4 11.1 C12.6 12.3 10.9 14 9.7 18.8 C8.5 14 6.8 12.3 2 11.1 C6.8 9.9 8.5 8.2 9.7 3.4 Z" />
      <path className="dc-bar-mark-minor" d="M18.6 1 C19.1 3 19.8 3.7 21.8 4.2 C19.8 4.7 19.1 5.4 18.6 7.4 C18.1 5.4 17.4 4.7 15.4 4.2 C17.4 3.7 18.1 3 18.6 1 Z" />
      <path className="dc-bar-mark-minor" d="M18.6 15.6 C19.1 17.6 19.8 18.3 21.8 18.8 C19.8 19.3 19.1 20 18.6 22 C18.1 20 17.4 19.3 15.4 18.8 C17.4 18.3 18.1 17.6 18.6 15.6 Z" />
    </svg>
  );
}

function mapTalent(p, invitedIds) {
  return {
    id: p.id,
    first: p.first_name || '',
    last: p.last_name || '',
    name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
    // The talent's own declared board (first booking lane); nothing is assumed.
    archetype: strList(p.lanes)[0] || null,
    city: p.city || null,
    height: fmtHeight(p.height_cm),
    gender: p.gender ? cap(p.gender) : null,
    age: p.age || null,
    exp: p.experience_level ? cap(p.experience_level) : null,
    photo: firstPhoto(p.images),
    bio: realBio(p.bio_curated),
    // Query-mode truth, written by the server against the booker's own words.
    facts: strList(p.facts),
    mentions: strList(p.mentions),
    /* The semantic layer's one line: the talent's own sentence, or their
       book's description, whichever the brief actually reached for. It takes
       the "Mentions …" slot when the server sends one. */
    why: typeof p.why === 'string' && p.why.trim() ? p.why.trim() : null,
    notes: strList(p.notes),
    heritage: strList(p.heritage),
    isInvited: p.is_invited || (invitedIds && invitedIds.has(p.id)) || false,
  };
}


const PROMPTS = [
  "Tall editorial women in New York with runway experience…",
  "Commercial faces under 25 with fresh digitals…",
  "New faces, female, 5'8\" and above for commercial campaigns…",
  "Runway specialists for FW26, Paris or Milan based…",
];

// ─── Talent Card — art-directed portrait, type integrated on the image ──────────
function TalentCard({ talent, index, onOpen, onInvite, inviting }) {
  const reduce = useReducedMotion();
  const isInvited = talent.isInvited;
  const stats = [
    talent.height && { label: 'Height', value: talent.height },
    talent.gender && { label: 'Gender', value: talent.gender },
  ].filter(Boolean);

  // Query mode: the talent's own declared values that satisfied the brief, the
  // line the brief actually reached for (their bio or their book, else what
  // their own words mention), then what is off or not listed. Reserved height
  // so absent data never reflows the grid.
  const hasFacts = !!(talent.facts.length || talent.why || talent.mentions.length || talent.notes.length);

  return (
    <motion.article
      className="dc-card"
      tabIndex={0}
      aria-label={`Open ${talent.name}'s profile`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(index * 0.04, 0.4),
        duration: reduce ? 0.2 : 0.55,
        ease: EASE,
      }}
      onClick={() => onOpen(talent)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(talent);
        }
      }}
    >
      {talent.photo
        ? <img src={talent.photo} alt={talent.name} className="dc-card-img" loading="lazy" />
        : <div className="dc-card-img dc-card-img--empty"><span>{talent.name.charAt(0)}</span></div>}
      <div className="dc-card-shade" />

      <div className="dc-card-body">
        <div className="dc-card-namerow">
          <h3 className="dc-card-name">{talent.name}</h3>
        </div>
        <div className="dc-card-line">
          {talent.archetype && <DivisionMark division={talent.archetype} size="sm" onDark />}
          {talent.city && <><span className="dc-dot" /><Place value={talent.city} size="sm" className="dc-card-loc" /></>}
        </div>

        {hasFacts && (
          <div className="dc-card-facts">
            {talent.facts.length > 0 && (
              <div className="dc-card-facts-head">{talent.facts.join(' · ')}</div>
            )}
            {talent.why ? (
              <div className="dc-card-facts-why" title={talent.why}>{talent.why}</div>
            ) : talent.mentions.length > 0 ? (
              <div className="dc-card-facts-why">Mentions {talent.mentions.join(', ')}</div>
            ) : null}
            {talent.notes.length > 0 && (
              <div className="dc-card-facts-note">{talent.notes.join(' · ')}</div>
            )}
          </div>
        )}

        <div className="dc-card-reveal">
          <div className="dc-card-reveal-inner">
            {stats.length > 0 && (
              <div className="dc-card-stats">
                {stats.map((s) => (
                  <div className="dc-stat" key={s.label}>
                    <span className="dc-stat-label">{s.label}</span>
                    <span className="dc-stat-value">{s.value}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="dc-card-actions">
              <button
                className={`dc-act dc-act--invite ${isInvited ? 'dc-act--invited' : ''}`}
                disabled={inviting || isInvited}
                onClick={(e) => { e.stopPropagation(); onInvite(talent); }}
              >
                {inviting ? 'Inviting…' : isInvited ? 'Invited' : 'Invite'}
                {!isInvited && <ArrowRight size={13} strokeWidth={2} />}
              </button>
              <button
                className="dc-act dc-act--view"
                onClick={(e) => { e.stopPropagation(); onOpen(talent); }}
              >
                View
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

// ─── Skeleton grid — shown while the first page of a search is loading ────────
function SkeletonGrid() {
  return (
    <div className="dc-grid" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div className="dc-card dc-card--skeleton" key={i} aria-hidden="true">
          <span className="dc-skel dc-skel--name" />
          <span className="dc-skel dc-skel--line" />
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DiscoverPage() {
  const reduce = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQ = searchParams.get('q') || '';
  const parsedRole = Number.parseInt(searchParams.get('role') || '0', 10);
  const role = Number.isInteger(parsedRole) && parsedRole > 0 ? parsedRole : 0;

  // submitted + role are derived from the URL — that IS the source of truth, so
  // back / forward / refresh restore for free.
  const submitted = urlQ;
  const [query, setQuery] = useState(urlQ);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [isFocused, setIsFocused] = useState(false);
  const [promptIdx, setPromptIdx] = useState(0);
  const [promptVisible, setPromptVisible] = useState(true);
  const [selected, setSelected] = useState(null);
  const [invitedIds, setInvitedIds] = useState(() => new Set());
  const inputRef = useRef(null);

  const completion = useMemo(() => predictCompletion(query), [query]);
  // Brief mode is a property of the text, not a control: the moment the query
  // holds a line break (pasted brief, or Shift+Enter) the field becomes a
  // multi-line brief and grows. Nothing to toggle, nothing to discover.
  const briefMode = query.includes('\n');
  const canSubmit = query.trim().length > 0;

  // Cycle the placeholder prompts.
  useEffect(() => {
    const id = setInterval(() => {
      setPromptVisible(false);
      setTimeout(() => { setPromptIdx((i) => (i + 1) % PROMPTS.length); setPromptVisible(true); }, 420);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  // Restore the input text + reset paging when the URL query changes (a submit,
  // or back / forward / refresh). React's "store previous value" pattern —
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevUrlKey, setPrevUrlKey] = useState(`${urlQ}::${role}`);
  const urlKey = `${urlQ}::${role}`;
  if (prevUrlKey !== urlKey) {
    setPrevUrlKey(urlKey);
    setQuery(urlQ);
    setLimit(PAGE_SIZE);
  }

  // Auto-grow while multi-line; hand the height back to CSS when it collapses.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (!briefMode) { el.style.height = ''; return; }
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [briefMode, query]);

  const { data, isFetching } = useQuery({
    queryKey: ['discover', submitted, role, limit],
    queryFn: () => getDiscoverableTalent({
      q: submitted || '',
      limit,
      ...(submitted && role ? { role } : {}),
    }),
    staleTime: 30000,
    keepPreviousData: true,
  });

  const { data: agency } = useQuery({
    queryKey: ['agency-profile'],
    queryFn: getAgencyProfile,
    staleTime: 5 * 60 * 1000,
  });

  // ── response handling ──
  const v2 = data?.discover_v2 || null;
  const queryLogId = data?.query_log_id || data?.meta?.query_log_id || v2?.query_log_id || null;
  const pool = v2?.pool || data?.meta?.pool || null;
  const filters = useMemo(() => (Array.isArray(v2?.filters) ? v2.filters : []), [v2]);
  const notes = useMemo(() => (Array.isArray(v2?.notes) ? v2.notes : []), [v2]);
  const roles = useMemo(() => (Array.isArray(v2?.roles) ? v2.roles : []), [v2]);

  // Query mode counts. Browse mode (and any response without them) has neither.
  /* Browse has no `pool` block on this endpoint yet, so the pool line and the
     show-more fall back to the pagination total. Query mode always has one. */
  const browsePool = pool || (Number.isFinite(data?.pagination?.total)
    ? { eligible: data.pagination.total, shown: null }
    : null);

  /* No requirement was applied, so nothing was "matched" against: the fused
     order is the whole answer and the header says so. The server sends no
     partial group in this case. */
  const lookOnly = v2?.look_only === true;

  const hasCounts = Number.isFinite(pool?.match) || Number.isFinite(pool?.partial);
  const matchCount = Number.isFinite(pool?.match) ? pool.match : 0;
  const partialCount = Number.isFinite(pool?.partial) ? pool.partial : 0;

  // Build render groups. Query: server groups[] in order (match, then partial).
  // Browse: one flat group of the newest talent.
  const groups = useMemo(() => {
    if (v2) {
      return (v2.groups || [])
        .map((g) => ({
          key: g.kind,
          kind: g.kind,
          total: g.total ?? (g.results || []).length,
          talents: (g.results || []).map((p) => mapTalent(p, invitedIds)),
        }))
        .filter((g) => g.talents.length > 0);
    }
    const mapped = (data?.profiles || []).map((p) => mapTalent(p, invitedIds));
    return mapped.length ? [{ key: 'flat', kind: 'flat', total: mapped.length, talents: mapped }] : [];
  }, [v2, data, invitedIds]);

  // Flat list across groups — detail nav + invite state.
  const talents = useMemo(() => groups.flatMap((g) => g.talents), [groups]);

  const agencyName = agency?.agency_name?.trim() || null;

  // Exact matches carry no heading. The partial group carries a repeated one,
  // which leads the page when nothing matched exactly. A look-only brief has
  // neither group to name: the whole page is one ordered answer.
  const groupHeading = (g) => {
    if (lookOnly) return null;
    if (g.kind !== 'partial') return null;
    const total = g.total ?? partialCount;
    return matchCount === 0 ? `Closest first · ${total}` : `Partial matches · ${total}`;
  };

  const invite = useMutation({
    mutationFn: (id) => inviteTalent(id, queryLogId),
    onSuccess: (_res, id) => {
      toast.success('Invitation sent');
      setInvitedIds((prev) => new Set(prev).add(id));
    },
    onError: () => toast.error('Could not send invite'),
  });

  // ── search dispatch (the URL is the source of truth) ──
  const runSearch = (text, nextRole = 0) => {
    const t = (text || '').trim();
    setQuery(t);
    setLimit(PAGE_SIZE);
    const next = {};
    if (t) next.q = t;
    if (t && nextRole) next.role = String(nextRole);
    setSearchParams(next, { replace: false });
  };

  const onSubmit = (e) => { e?.preventDefault(); runSearch(query); };
  const clear = () => {
    setQuery(''); setLimit(PAGE_SIZE);
    setSearchParams({}, { replace: false });
  };

  const loadMore = () => setLimit((l) => l + PAGE_SIZE);

  // Filter edits are authoritative — they rewrite the brief and re-run it, so
  // the words in the bar and the filters applied can never diverge.
  const onAmendBrief = (newBrief) => runSearch(newBrief, role);
  const onRoleChange = (nextRole) => runSearch(submitted, nextRole);

  // Accept the ghosted prediction with Tab (anywhere) or → (at line end).
  const acceptCompletion = () => {
    if (!completion) return;
    setQuery((q) => q + completion);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const onKeyDown = (e) => {
    // Enter searches; Shift+Enter opens a new line (and, with it, brief mode).
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(e); return; }
    if (!completion) return;
    const el = e.target;
    const atEnd = el.selectionStart === el.selectionEnd && el.selectionStart === query.length;
    if (e.key === 'Tab' || (e.key === 'ArrowRight' && atEnd)) {
      e.preventDefault();
      acceptCompletion();
    }
  };

  const showFilters = !!v2 && !!submitted;
  const showFiltersLoading = !!submitted && isFetching && !data;
  const showSkeletonCards = !!submitted && isFetching && talents.length === 0;
  const shownCount = pool?.shown ?? talents.length;
  const hasMoreResults = !!submitted && hasCounts && shownCount < matchCount + partialCount;

  const shownMatches = hasCounts ? matchCount : talents.length;
  const resultsHeadline = lookOnly
    ? 'Closest to your brief'
    : hasCounts && matchCount === 0 && partialCount > 0
      ? 'No exact matches'
      : `${shownMatches} ${shownMatches === 1 ? 'match' : 'matches'}`;

  /* Threshold compaction. Browse keeps the serif invitation and the centred
     column; the moment a brief has run the invitation collapses to nothing and
     the bar rides up to the top of the content column, so the first row of
     results is on screen without a scroll. One duration, one easing, and a
     hard snap under prefers-reduced-motion. */
  const resultsMode = !!submitted;
  const thresholdT = { duration: reduce ? 0 : THRESHOLD_MS, ease: EASE };

  return (
    <div className="dc-page">
      {/* ── Environment ──
          One atmospheric layer for the whole page. The field is centred
          (centerX/Y 0) and zoomed out (0.55) so its light spreads edge to edge
          instead of pooling in a corner; low contrast + soft blend keep it a
          room rather than a graphic. Fixed position, so scrolling the results
          moves through the environment rather than scrolling it away. */}
      <div className="dc-bg" aria-hidden="true">
        <Grainient
          color1="#C9A55A" color2="#3D2000" color3="#6B4A10"
          timeSpeed={0.5} colorBalance={0.1} warpStrength={1.2}
          warpFrequency={3.5} warpSpeed={2.2} warpAmplitude={70}
          blendAngle={-20} blendSoftness={1} rotationAmount={280}
          noiseScale={2.2} grainAmount={0} grainScale={0}
          grainAnimated={false} contrast={1.05} gamma={0.6}
          saturation={0.85} centerX={0} centerY={0} zoom={0.55}
        />
        <div className="dc-bg-veil" />
      </div>

      {/* ── Threshold ──
          Browse holds the invitation; results collapse it and lift the bar so
          the grid clears the fold. The headline's height and the bar's layout
          animate on the same curve, and snap under reduced motion. */}
      <section className={`dc-threshold${resultsMode ? ' dc-threshold--results' : ''}`}>
        <div className="dc-threshold-inner">
          <motion.div
            className="dc-headline-wrap"
            initial={false}
            animate={resultsMode ? { height: 0, opacity: 0 } : { height: 'auto', opacity: 1 }}
            transition={thresholdT}
            aria-hidden={resultsMode || undefined}
          >
            <h1 className="dc-headline">
              Describe who you're
              <br />
              <em>looking for.</em>
            </h1>
          </motion.div>

          <motion.form
            layout="position"
            transition={{ layout: thresholdT }}
            className={`dc-bar${isFocused ? ' dc-bar--on' : ''}`}
            onSubmit={onSubmit}
          >
            <div className={`dc-bar-shell${briefMode ? ' dc-bar-shell--brief' : ''}`}>
              <PholioMark />
              <div className="dc-bar-field">
                <textarea
                  ref={inputRef}
                  className={`dc-bar-input${briefMode ? ' dc-bar-input--brief' : ''}`}
                  value={query}
                  rows={1}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Describe the talent you're looking for"
                />
                {query ? (
                  // Ghost the prediction inline: a typing aid, so only while
                  // the field has focus. A restored or submitted brief shows
                  // exactly what ran, with nothing appended.
                  isFocused && !briefMode && !query.includes('\n') && (
                    <div className="dc-ghost" aria-hidden="true">
                      <span className="dc-ghost-typed">{query}</span>
                      {completion && <span className="dc-ghost-rest">{completion}</span>}
                    </div>
                  )
                ) : (
                  <span
                    key={promptIdx}
                    className={`dc-bar-ph${promptVisible ? ' dc-bar-ph--in' : ' dc-bar-ph--out'}`}
                    aria-hidden="true"
                  >
                    {PROMPTS[promptIdx]}
                  </span>
                )}
              </div>
              <AnimatePresence>
                {query && (
                  <motion.button
                    type="button"
                    className="dc-bar-clear"
                    onClick={clear}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.14 }}
                    aria-label="Clear search"
                  >
                    <X size={14} strokeWidth={2.2} />
                  </motion.button>
                )}
              </AnimatePresence>
              <button
                type="submit"
                className="dc-bar-go"
                disabled={!canSubmit}
                aria-label="Search"
              >
                <ArrowUp size={16} strokeWidth={2.2} />
              </button>
            </div>

          </motion.form>

          {/* ── The reading of the brief — one sentence, each phrase editable ── */}
          {(showFilters || showFiltersLoading) && (
            <BriefLine
              brief={submitted}
              filters={filters}
              notes={notes}
              roles={roles}
              role={role}
              loading={showFiltersLoading}
              onAmend={onAmendBrief}
              onRoleChange={onRoleChange}
            />
          )}
        </div>
      </section>

      {/* ── Curated / Results ── */}
      <section className="dc-curated">
        {/* Results header — the count in the house serif, the brief beside it */}
        {talents.length > 0 && (
          <motion.div
            className="dc-curated-header"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
          >
            <h2 className="dc-curated-head">
              {submitted ? (
                <>
                  <span className="dc-curated-count">{resultsHeadline}</span>
                  <em className="dc-curated-brief">for “{submitted}”</em>
                </>
              ) : (
                <>
                  <span className="dc-curated-count">Newest talent</span>
                  {agencyName && <em className="dc-curated-brief">for {agencyName}</em>}
                </>
              )}
            </h2>
            {!submitted && browsePool && (
              <p className="dc-pool-line">
                Showing {browsePool.shown ?? talents.length} of {browsePool.eligible} discoverable talent
              </p>
            )}
          </motion.div>
        )}

        {showSkeletonCards ? (
          <SkeletonGrid />
        ) : talents.length === 0 ? (
          <motion.div className="dc-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <p className="dc-empty-text">
              {submitted
                ? <>No one matches “{submitted}” yet.</>
                : 'No discoverable talent yet.'}
            </p>
            {submitted && (
              <>
                <p className="dc-empty-hint">Remove a requirement above, or clear the search.</p>
                <button className="dc-empty-reset" onClick={clear}>Clear search</button>
              </>
            )}
          </motion.div>
        ) : (
          <>
            {groups.map((g) => (
              <div className="dc-group" key={g.key}>
                {groupHeading(g) && (
                  <p className="dc-group-head">
                    <span className="dc-group-label">{groupHeading(g)}</span>
                  </p>
                )}
                <div className="dc-grid">
                  {g.talents.map((t, i) => (
                    <TalentCard
                      key={t.id}
                      talent={t}
                      index={i}
                      onOpen={setSelected}
                      onInvite={(tl) => invite.mutate(tl.id)}
                      inviting={invite.isPending && invite.variables === t.id}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Show more — browse widens the pool page, a query pages across
                both groups (the server returns the next slice of each). */}
            {((!submitted && browsePool && talents.length < browsePool.eligible) || hasMoreResults) && (
              <div className="dc-more">
                <button className="dc-more-btn" onClick={loadMore} disabled={isFetching}>
                  {isFetching ? 'Loading…' : 'Show more'}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <AnimatePresence>
        {selected && (
          <DiscoverDetail
            key={selected.id}
            talent={selected}
            talents={talents}
            onClose={() => setSelected(null)}
            onNavigate={(t) => setSelected(t)}
            onInvite={(tl) => invite.mutate(tl.id)}
            inviting={invite.isPending && invite.variables === selected.id}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
