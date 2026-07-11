/**
 * DiscoverPage — "The Signal"
 *
 * AI-powered semantic talent discovery. Agency-branded dark surface.
 *
 *   1. Threshold — dark hero with a natural-language search bar + example intents
 *   2. Ledger    — editorial serif stats (shell vocabulary, night mode)
 *   3. Grid      — masonry portraits, resonance rings when AI-ranked
 *   4. Panel     — right-edge TalentPanel drawer
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Sparkles } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getDiscoverableTalent, inviteTalent, getAgencyProfile } from '../api/agency';
import { predictCompletion, suggestRefinements } from '../lib/intentParser';
import { resolveMatchScore } from '../lib/discoverMatch';
import MatchScore from '../components/ui/MatchScore';
import { DiscoverDetail } from './DiscoverDetail';
import Grainient from './Grainient';
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

function mapTalent(p) {
  // Null when there is no real match signal (browse mode) — the card omits the numeral.
  const resonance = resolveMatchScore(p);
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
    matchBreakdown: p.match_breakdown || null,
    matchRationale: p.match_rationale || null,
    isInvited: p.is_invited || false,
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
  return (
    <motion.article
      className="dc-card"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => onOpen(talent)}
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
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [promptIdx, setPromptIdx] = useState(0);
  const [promptVisible, setPromptVisible] = useState(true);
  const [selected, setSelected] = useState(null);
  const inputRef = useRef(null);
  const queryClient = useQueryClient();

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

  const { data, isFetching } = useQuery({
    queryKey: ['discover', submitted],
    queryFn: () => getDiscoverableTalent({ q: submitted || '', limit: 30 }),
    staleTime: 30000,
    keepPreviousData: true,
  });

  const { data: agency } = useQuery({
    queryKey: ['agency-profile'],
    queryFn: getAgencyProfile,
    staleTime: 5 * 60 * 1000,
  });

  const semanticActive = data?.meta?.semantic_search === true;

  // Panel opens on any focus — suggestions are always ready.
  const intelOpen = isFocused;

  // Rank highest match first when semantic scores exist; otherwise preserve API order.
  const talents = useMemo(() => {
    const mapped = (data?.profiles || []).map(mapTalent);
    if (semanticActive) {
      return mapped.sort((a, b) => (b.resonance ?? 0) - (a.resonance ?? 0));
    }
    return mapped;
  }, [data, semanticActive]);

  const agencyName = agency?.agency_name?.trim() || null;

  const invite = useMutation({
    mutationFn: (id) => inviteTalent(id),
    onSuccess: (data, id) => {
      toast.success('Invitation sent');
      queryClient.setQueryData(['discover', submitted], (old) => {
        if (!old) return old;
        return {
          ...old,
          profiles: old.profiles.map((p) => p.id === id ? { ...p, is_invited: true } : p)
        };
      });
    },
    onError: () => toast.error('Could not send invite'),
  });

  const runSearch = (text) => { setQuery(text); setSubmitted(text.trim()); };
  const onSubmit = (e) => { e.preventDefault(); setSubmitted(query.trim()); };
  const clear = () => { setQuery(''); setSubmitted(''); };

  // Accept the ghosted prediction with Tab (anywhere) or → (at line end).
  const acceptCompletion = () => {
    if (!completion) return;
    setQuery((q) => q + completion);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const onKeyDown = (e) => {
    if (!completion) return;
    const el = e.target;
    const atEnd = el.selectionStart === el.selectionEnd && el.selectionStart === query.length;
    if (e.key === 'Tab' || (e.key === 'ArrowRight' && atEnd)) {
      e.preventDefault();
      acceptCompletion();
    }
  };

  const applySuggestion = (item) => runSearch(item.value);

  return (
    <div className="dc-page">
      {/* Background — kept */}
      <div className="dc-bg" aria-hidden="true">
        <Grainient
          color1="#C9A55A" color2="#3D2000" color3="#6B4A10"
          timeSpeed={0.8} colorBalance={0.4} warpStrength={1.2}
          warpFrequency={3.5} warpSpeed={2.2} warpAmplitude={70}
          blendAngle={-20} blendSoftness={0.45} rotationAmount={280}
          noiseScale={2.2} grainAmount={0} grainScale={0}
          grainAnimated={false} contrast={1.5} gamma={0.55}
          saturation={0.85} centerX={0.3} centerY={0.15} zoom={1}
        />
        <div className="dc-bg-veil" />
      </div>
      <div className="dc-neural" aria-hidden="true" />

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
            <div className="dc-bar-shell">
              <div className="dc-bar-field">
                <input
                  ref={inputRef}
                  className="dc-bar-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Describe the talent you're looking for"
                />
                {query ? (
                  // Mirror the typed text and ghost the prediction inline behind the caret.
                  <div className="dc-ghost" aria-hidden="true">
                    <span className="dc-ghost-typed">{query}</span>
                    {completion && <span className="dc-ghost-rest">{completion}</span>}
                  </div>
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
              <button type="submit" className="dc-bar-go" aria-label="Search">
                <ArrowRight size={16} strokeWidth={2.2} />
              </button>
            </div>

            {/* ── Intent intelligence — reads the brief, predicts, refines ── */}
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
        </motion.div>
      </section>

      {/* ── Curated / Results ── */}
      <section className="dc-curated">
        {talents.length > 0 && (
          <motion.p
            className="dc-curated-head"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {submitted
              ? <>Closest matches to <em>“{submitted}”</em></>
              : agencyName
                ? <>Featured for <em>{agencyName}</em></>
                : <>Featured talent</>}
          </motion.p>
        )}

        {talents.length === 0 ? (
          <motion.div className="dc-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Sparkles size={26} className="dc-empty-gem" />
            <p className="dc-empty-text">
              {isFetching ? 'Searching the network…'
                : submitted ? 'No talent resonated with that description.'
                  : 'No discoverable talent yet.'}
            </p>
            {submitted && <button className="dc-empty-reset" onClick={clear}>Clear search</button>}
          </motion.div>
        ) : (
          <div className="dc-grid">
            {talents.map((t, i) => (
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
