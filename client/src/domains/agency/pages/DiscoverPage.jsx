/**
 * DiscoverPage — "The Signal"
 *
 * AI-powered semantic talent discovery. Agency-branded dark surface.
 *
 *   1. Threshold — dark hero with a natural-language search bar + example intents
 *   2. Brief     — server-only provenance + editable chips (launch mode)
 *   3. Grid      — grouped masonry portraits, tier-band rings when AI-ranked
 *   4. Detail    — full-frame modal
 *
 * The visual design (dark surface, card grid, MatchScore ring, detail modal) is
 * frozen; this file adds search-bar behaviour + informational content only.
 *
 * Response handling is dual-shape (WS5.6): launch mode returns `discover_v2`
 * (grouped, provenance, honest-zero); hybrid mode returns the legacy flat
 * `{ profiles, meta }`. Everything below feature-detects on `data.discover_v2`.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Sparkles, AlignLeft } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getDiscoverableTalent, inviteTalent, getAgencyProfile } from '../api/agency';
import { predictCompletion, suggestRefinements } from '../lib/intentParser';
import { resolveMatchScore, tierBandToScore, constraintAnnotations, amendBriefRemove } from '../lib/discoverMatch';
import MatchScore from '../components/ui/MatchScore';
import BriefUnderstanding from '../components/BriefUnderstanding';
import { DiscoverDetail } from './DiscoverDetail';
import './DiscoverPage.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');
const fmtHeight = (cm) => {
  if (!cm) return null;
  const inch = Math.round(cm / 2.54);
  return `${Math.floor(inch / 12)}'${inch % 12}"`;
};
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

const RECENT_KEY = 'pholio.discover.recent';
const PAGE_SIZE = 30;

function loadRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
function pushRecent(text) {
  const t = (text || '').trim();
  if (!t) return loadRecent();
  const next = [t, ...loadRecent().filter((s) => s.toLowerCase() !== t.toLowerCase())].slice(0, 10);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

function mapTalent(p, invitedIds) {
  // tier_band is the only ranking signal launch mode exposes; legacy shapes fall
  // back to the raw match score. Null → the card omits the ring numeral.
  const tierBand = p.tier_band || null;
  const resonance = tierBand ? tierBandToScore(tierBand) : resolveMatchScore(p);
  return {
    id: p.id,
    first: p.first_name || '',
    last: p.last_name || '',
    name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
    archetype: cap(p.archetype || 'editorial'),
    city: p.city || null,
    height: fmtHeight(p.height_cm),
    gender: p.gender ? cap(p.gender) : null,
    age: p.age || null,
    exp: p.experience_level ? cap(p.experience_level) : null,
    photo: firstPhoto(p.images),
    bio: realBio(p.bio_curated),
    resonance,
    // discover_v2 launch-mode content (undefined in legacy shape)
    keyStat: p.key_stat || null,
    ageBand: p.age_band || null,
    whyFacts: p.why_facts || null,
    constraintTruth: p.constraint_truth || null,
    annotations: constraintAnnotations(p.constraint_truth),
    tierBand,
    matchBreakdown: p.match_breakdown || null,
    matchRationale: p.match_rationale || null,
    isInvited: p.is_invited || (invitedIds && invitedIds.has(p.id)) || false,
  };
}


const PROMPTS = [
  "Tall editorial models in New York with agency experience…",
  "New faces, female, 5'8\" and above for commercial campaigns…",
  "Runway specialists for FW26 — Paris or Milan based…",
  "Athletic presence for a luxury lifestyle campaign…",
];

// ─── Talent Card — art-directed portrait, type integrated on the image ──────────
function TalentCard({ talent, index, onOpen, onInvite, inviting }) {
  const isInvited = talent.isInvited;
  const stats = [
    talent.height && { label: 'Height', value: talent.height },
    talent.gender && { label: 'Gender', value: talent.gender },
  ].filter(Boolean);

  // Always-visible factual face (spec §8.4): key stat + age band, the server
  // why_facts template (verbatim), and any constraint-truth annotation. Reserved
  // fixed height so absent data never reflows the grid.
  const headline = [
    talent.keyStat ? talent.keyStat.value : null,
    talent.ageBand,
  ].filter(Boolean).join(' · ');
  const hasFacts = !!(talent.keyStat || talent.ageBand || talent.whyFacts || talent.annotations.length);

  return (
    <motion.article
      className="dc-card"
      tabIndex={0}
      aria-label={`Open ${talent.name}'s profile`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
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
          {talent.resonance != null && <MatchScore score={talent.resonance} size="sm" tone="overlay" className="dc-card-score" />}
        </div>
        <div className="dc-card-line">
          <span className="dc-card-arch">{talent.archetype}</span>
          {talent.city && <><span className="dc-dot" /><span className="dc-card-loc">{talent.city}</span></>}
        </div>

        {hasFacts && (
          <div className="dc-card-facts">
            {headline && <div className="dc-card-facts-head">{headline}</div>}
            {talent.whyFacts && <div className="dc-card-facts-why">{talent.whyFacts}</div>}
            {talent.annotations.length > 0 && (
              <div className="dc-card-facts-note">{talent.annotations.join(' · ')}</div>
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQ = searchParams.get('q') || '';
  const urlOutside = searchParams.get('outside') === '1';

  // submitted + includeOutside are derived from the URL — that IS the source of
  // truth, so back / forward / refresh restore for free (spec §8.7).
  const submitted = urlQ;
  const includeOutside = urlOutside;
  const [query, setQuery] = useState(urlQ);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [briefMode, setBriefMode] = useState(urlQ.includes('\n'));
  const [isFocused, setIsFocused] = useState(false);
  const [promptIdx, setPromptIdx] = useState(0);
  const [promptVisible, setPromptVisible] = useState(true);
  const [selected, setSelected] = useState(null);
  const [recent, setRecent] = useState(loadRecent);
  const [invitedIds, setInvitedIds] = useState(() => new Set());
  const inputRef = useRef(null);

  const completion = useMemo(() => predictCompletion(query), [query]);
  const suggestions = useMemo(() => suggestRefinements(query), [query]);

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
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);
  if (prevUrlQ !== urlQ) {
    setPrevUrlQ(urlQ);
    setQuery(urlQ);
    setLimit(PAGE_SIZE);
  }

  // Auto-grow the brief-mode textarea.
  useEffect(() => {
    if (briefMode && inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [briefMode, query]);

  const { data, isFetching } = useQuery({
    queryKey: ['discover', submitted, includeOutside, limit],
    queryFn: () => getDiscoverableTalent({
      q: submitted || '',
      limit,
      ...(includeOutside ? { include_outside_spec: 'true' } : {}),
    }),
    staleTime: 30000,
    keepPreviousData: true,
  });

  const { data: agency } = useQuery({
    queryKey: ['agency-profile'],
    queryFn: getAgencyProfile,
    staleTime: 5 * 60 * 1000,
  });

  // ── dual-shape response handling ──
  const v2 = data?.discover_v2 || null;
  const isLaunch = !!v2;
  const queryLogId = data?.query_log_id || data?.meta?.query_log_id || v2?.query_log_id || null;
  const pool = v2?.pool || data?.meta?.pool || null;
  const honestZero = v2?.honest_zero || null;
  const understanding = v2?.understanding || null;
  const semanticActive = data?.meta?.semantic_search === true || isLaunch;

  // Panel opens on any focus — suggestions are always ready.
  const intelOpen = isFocused && !briefMode;

  // Build render groups. Launch: server groups[] in order. Legacy: one flat group.
  const groups = useMemo(() => {
    if (v2) {
      return (v2.groups || []).map((g) => ({
        key: `${g.kind}:${g.missed || ''}`,
        kind: g.kind,
        heading: g.heading,
        talents: (g.results || []).map((p) => mapTalent(p, invitedIds)),
      }));
    }
    const mapped = (data?.profiles || []).map((p) => mapTalent(p, invitedIds));
    if (semanticActive) mapped.sort((a, b) => (b.resonance ?? 0) - (a.resonance ?? 0));
    return mapped.length ? [{ key: 'flat', kind: 'flat', heading: null, talents: mapped }] : [];
  }, [v2, data, semanticActive, invitedIds]);

  // Flat list across groups — detail nav + invite state.
  const talents = useMemo(() => groups.flatMap((g) => g.talents), [groups]);

  const hasOutsideGroup = groups.some((g) => g.kind === 'outside_spec');
  const agencyName = agency?.agency_name?.trim() || null;

  const invite = useMutation({
    mutationFn: (id) => inviteTalent(id, queryLogId),
    onSuccess: (_res, id) => {
      toast.success('Invitation sent');
      setInvitedIds((prev) => new Set(prev).add(id));
    },
    onError: () => toast.error('Could not send invite'),
  });

  // ── search dispatch (also drives the URL + recent history) ──
  const applyUrl = (text, outside) => {
    const next = {};
    if (text) next.q = text;
    if (outside) next.outside = '1';
    setSearchParams(next, { replace: false });
  };

  const runSearch = (text) => {
    const t = (text || '').trim();
    setQuery(t);
    setLimit(PAGE_SIZE);
    if (t) setRecent(pushRecent(t));
    applyUrl(t, false); // URL change drives submitted / includeOutside
  };

  const onSubmit = (e) => { e?.preventDefault(); runSearch(query); };
  const clear = () => {
    setQuery(''); setLimit(PAGE_SIZE);
    setSearchParams({}, { replace: false });
  };

  const showOutsideSpec = () => applyUrl(submitted, true);

  const loadMore = () => setLimit((l) => l + PAGE_SIZE);

  // Chip edits are authoritative — re-run the search with the amended brief.
  const onAmendBrief = (newBrief) => runSearch(newBrief);
  const onRemoveHonestChip = () => {
    // The honest-zero removable chip reuses chip removal: find its applied entry
    // and amend the brief the same way the chip × does. Fall back to clearing.
    const applied = (understanding?.applied || []).find((a) => a.field === honestZero?.removable_chip);
    if (applied) {
      runSearch(amendBriefRemove(submitted, applied));
    } else {
      clear();
    }
  };

  // Accept the ghosted prediction with Tab (anywhere) or → (at line end).
  const acceptCompletion = () => {
    if (!completion) return;
    setQuery((q) => q + completion);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const onKeyDown = (e) => {
    if (!briefMode && (e.key === 'Enter')) { e.preventDefault(); onSubmit(e); return; }
    if (briefMode && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(e); return; }
    if (!completion) return;
    const el = e.target;
    const atEnd = el.selectionStart === el.selectionEnd && el.selectionStart === query.length;
    if (e.key === 'Tab' || (e.key === 'ArrowRight' && atEnd)) {
      e.preventDefault();
      acceptCompletion();
    }
  };

  const applySuggestion = (item) => runSearch(item.value);

  const showBrief = isLaunch && !!submitted;
  const showBriefLoading = !!submitted && isFetching && !data;

  return (
    <div className="dc-page">
      <div className="dc-bg" aria-hidden="true" />

      {/* ── Threshold ── */}
      <section className="dc-threshold">
        <motion.div
          className="dc-threshold-inner"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="dc-headline">
            Describe who you're
            <br />
            <em>looking for.</em>
          </h1>

          <form className={`dc-bar${isFocused ? ' dc-bar--on' : ''}`} onSubmit={onSubmit}>
            <div className={`dc-bar-shell${briefMode ? ' dc-bar-shell--brief' : ''}`}>
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
                  // Ghost the prediction inline (single-line typing aid only).
                  !briefMode && !query.includes('\n') && (
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
              <button
                type="button"
                className={`dc-bar-mode${briefMode ? ' dc-bar-mode--on' : ''}`}
                onClick={() => { setBriefMode((v) => !v); requestAnimationFrame(() => inputRef.current?.focus()); }}
                aria-label={briefMode ? 'Single-line search' : 'Paste a full brief'}
                title={briefMode ? 'Single-line search' : 'Paste a full brief'}
              >
                <AlignLeft size={15} strokeWidth={2} />
              </button>
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
              <button type="submit" className="dc-bar-go" aria-label="Search">
                <ArrowRight size={16} strokeWidth={2.2} />
              </button>
            </div>

            {/* ── Intent intelligence — recent searches, then canned briefs ── */}
            <AnimatePresence>
              {intelOpen && (
                <motion.div
                  className="dc-intel"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {recent.length > 0 && (
                    <div className="dc-intel-recent">
                      <span className="dc-intel-recent-label">Recent</span>
                      {recent.slice(0, 6).map((r) => (
                        <button
                          key={r}
                          type="button"
                          className="dc-intel-recent-row"
                          onClick={() => runSearch(r)}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="dc-intel-list">
                    {suggestions.map((item, i) => (
                      <button
                        key={item.value}
                        type="button"
                        className="dc-intel-row"
                        onClick={() => applySuggestion(item)}
                      >
                        <span className="dc-intel-row-idx">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="dc-intel-row-text">{item.label}</span>
                        <ArrowRight size={13} className="dc-intel-row-arrow" strokeWidth={1.75} />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>

          {/* ── Brief understanding — provenance + editable chips (launch) ── */}
          {(showBrief || showBriefLoading) && (
            <BriefUnderstanding
              brief={submitted}
              understanding={understanding}
              loading={showBriefLoading}
              onAmend={onAmendBrief}
            />
          )}
        </motion.div>
      </section>

      {/* ── Curated / Results ── */}
      <section className="dc-curated">
        {/* Section header + browse pool line */}
        {talents.length > 0 && (
          <motion.div
            className="dc-curated-header"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="dc-curated-head">
              {submitted
                ? <>Closest matches to <em>“{submitted}”</em></>
                : <>Newest talent{agencyName ? <> · for <em>{agencyName}</em></> : null}</>}
            </p>
            {!submitted && pool && (
              <p className="dc-pool-line">
                Showing {pool.shown ?? talents.length} of {pool.eligible} discoverable talent
              </p>
            )}
          </motion.div>
        )}

        {talents.length === 0 ? (
          <motion.div className="dc-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Sparkles size={26} className="dc-empty-gem" />
            {honestZero ? (
              <>
                <p className="dc-empty-text">{honestZero.reason}</p>
                {honestZero.removable_chip ? (
                  <button className="dc-empty-reset" onClick={onRemoveHonestChip}>
                    Loosen “{honestZero.removable_chip.replace(/_cm$/, '').replace(/_/g, ' ')}”
                  </button>
                ) : (
                  <button className="dc-empty-reset" onClick={clear}>Clear search</button>
                )}
              </>
            ) : (
              <>
                <p className="dc-empty-text">
                  {isFetching ? 'Searching the network…'
                    : submitted ? 'No talent resonated with that description.'
                      : 'No discoverable talent yet.'}
                </p>
                {submitted && <button className="dc-empty-reset" onClick={clear}>Clear search</button>}
              </>
            )}
          </motion.div>
        ) : (
          <>
            {groups.map((g) => (
              <div className="dc-group" key={g.key}>
                {g.heading && <p className="dc-group-head">{g.heading}</p>}
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

            {/* Browse: show more (widen the pool page) */}
            {!submitted && pool && talents.length < pool.eligible && (
              <div className="dc-more">
                <button className="dc-more-btn" onClick={loadMore} disabled={isFetching}>
                  {isFetching ? 'Loading…' : 'Show more'}
                </button>
              </div>
            )}

            {/* Query: reveal nearest outside-spec (explicit action only) */}
            {isLaunch && submitted && !includeOutside && !hasOutsideGroup && (
              <div className="dc-more">
                <button className="dc-outside-btn" onClick={showOutsideSpec} disabled={isFetching}>
                  Show nearest (outside spec)
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
