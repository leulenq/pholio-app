/**
 * DiscoverPage — "The Signal"
 *
 * AI-powered talent discovery. Wired to real backend data.
 *
 * Layout:
 *   1. Threshold  — full-viewport entry with NL search bar + intent chips
 *   2. Curated    — staggered masonry portrait grid with resonance rings
 *   3. Detail Panel — right-edge drawer (no center modal)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Mail, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getAgencyProfile, getDiscoverableTalent, inviteTalent } from '../../api/agency';
import Grainient from '../../components/Grainient';
import './DiscoverPage.css';
import TalentDetailPanel from '../../components/TalentDetailPanel';

// ─── Height/measurement helpers ───────────────────────────────────────────────
function cmToFeetInches(cm) {
  if (!cm) return null;
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

function formatMeas(bust_cm, waist_cm, hips_cm) {
  const toIn = (v) => (v ? Math.round(v / 2.54) : null);
  const b = toIn(bust_cm);
  const w = toIn(waist_cm);
  const h = toIn(hips_cm);
  if (!b && !w && !h) return null;
  return [b, w, h].map((v) => v ?? '—').join('–');
}

// ─── Data adapter: API profile → display object ───────────────────────────────
function toTalentObject(profile) {
  if (!profile) return null;
  const primaryImage =
    profile.images?.find((img) => img.is_primary) || profile.images?.[0];
  return {
    id: profile.id,
    profileId: profile.id,
    applicationId: null,
    name: `${profile.first_name} ${profile.last_name || ''}`.trim(),
    photo: primaryImage?.path || null,
    archetype: profile.archetype || 'Commercial',
    type: (profile.archetype || 'commercial').toLowerCase(),
    status: 'available',
    location: profile.city || null,
    height: cmToFeetInches(profile.height_cm),
    meas: formatMeas(profile.bust_cm, profile.waist_cm, profile.hips_cm),
    shoe: profile.shoe_size || null,
    exp: profile.experience_level || null,
    measurements: {
      height: cmToFeetInches(profile.height_cm),
      bust: profile.bust_cm ? `${Math.round(profile.bust_cm / 2.54)}"` : null,
      waist: profile.waist_cm ? `${Math.round(profile.waist_cm / 2.54)}"` : null,
      hips: profile.hips_cm ? `${Math.round(profile.hips_cm / 2.54)}"` : null,
    },
    bio: profile.bio_curated || null,
  };
}

// Alternating card heights for masonry rhythm
const ASPECT_RATIOS = ['3/4', '2/3', '4/5', '3/4', '2/3', '4/5', '3/4', '4/5', '2/3'];

// NL search bar cycling prompts
const PROMPTS = [
  "Tall editorial models in New York with agency experience…",
  "New faces, female, 5'8\" and above for commercial campaigns…",
  "Runway specialists for FW26 — Paris or Milan based…",
  "Athletic presence for a luxury lifestyle campaign…",
];

// Archetype pill palette
const ARCHETYPE = {
  Editorial:  { color: '#C9A55A',               bg: 'rgba(201,165,90,0.10)',  border: 'rgba(201,165,90,0.28)' },
  Runway:     { color: 'rgba(255,255,255,0.85)', bg: 'rgba(255,255,255,0.07)', border: 'rgba(255,255,255,0.18)' },
  Commercial: { color: 'rgba(255,255,255,0.65)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)' },
  Lifestyle:  { color: 'rgba(255,255,255,0.65)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)' },
};

// ─── Intent parsing ───────────────────────────────────────────────────────────
function parseIntent(q) {
  const s = q.toLowerCase();
  const chips = [];

  if (/\bfemale\b|\bwomen?\b|\bgirl\b/.test(s))  chips.push({ label: 'Female',     key: 'gender'     });
  if (/\bmale\b|\bmen?\b|\bguy\b/.test(s))        chips.push({ label: 'Male',       key: 'gender'     });
  if (/editorial/.test(s))                        chips.push({ label: 'Editorial',  key: 'archetype'  });
  if (/runway/.test(s))                           chips.push({ label: 'Runway',     key: 'archetype'  });
  if (/commercial/.test(s))                       chips.push({ label: 'Commercial', key: 'archetype'  });
  if (/lifestyle/.test(s))                        chips.push({ label: 'Lifestyle',  key: 'archetype'  });
  if (/new face|newcomer/.test(s))                chips.push({ label: 'New Face',   key: 'experience' });

  const CITIES = ['new york', 'los angeles', 'miami', 'chicago', 'london', 'paris', 'tokyo', 'milan'];
  for (const city of CITIES) {
    if (s.includes(city)) {
      chips.push({ label: city.replace(/\b\w/g, (c) => c.toUpperCase()), key: 'city' });
    }
  }

  const hm = s.match(/(\d)[''′](\d+)/);
  if (hm) chips.push({ label: `Height ${hm[0]}+`, key: 'height' });
  else if (/\btall\b/.test(s)) chips.push({ label: 'Tall', key: 'height' });

  return chips;
}

// ─── Chips → API params ───────────────────────────────────────────────────────
function chipsToParams(chips, q) {
  const params = {};
  if (q.trim()) params.q = q.trim();

  for (const chip of chips) {
    if (chip.key === 'gender')     params.gender = chip.label;
    if (chip.key === 'archetype')  params.archetype = chip.label;
    if (chip.key === 'city')       params.city = chip.label;
    if (chip.key === 'experience') params.experience_level = 'Beginner';
    if (chip.key === 'height') {
      if (chip.label === 'Tall') {
        params.min_height = 175; // ~5'9"
      } else {
        const m = chip.label.match(/(\d)[''′](\d+)/);
        if (m) params.min_height = Math.round((parseInt(m[1]) * 12 + parseInt(m[2])) * 2.54);
      }
    }
  }
  return params;
}

// ─── Skeleton card ────────────────────────────────────────────────────────────
function SkeletonCard({ aspectRatio }) {
  return (
    <div className="dc-card">
      <div className="dc-card-frame dc-card-skeleton" style={{ aspectRatio }} />
    </div>
  );
}

// ─── Talent Card ──────────────────────────────────────────────────────────────
function TalentCard({ talent, index, aspectRatio, onClick, onInvite, isInviting, isInvited }) {
  const ac = ARCHETYPE[talent.archetype] || ARCHETYPE.Commercial;

  const handleInviteClick = (e) => {
    e.stopPropagation();
    if (!isInvited && !isInviting) onInvite(talent.id);
  };

  return (
    <motion.div
      className="dc-card"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.055, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
    >
      <div className="dc-card-frame" style={{ aspectRatio }}>
        {talent.photo ? (
          <img
            src={talent.photo}
            alt={talent.name}
            className="dc-card-img"
            loading="lazy"
          />
        ) : (
          <div className="dc-card-img dc-card-img--fallback" aria-hidden="true" />
        )}

        {/* Persistent bottom gradient */}
        <div className="dc-card-grad" />

        {/* Archetype pill — top left */}
        <div
          className="dc-card-type"
          style={{ color: ac.color, background: ac.bg, borderColor: ac.border }}
        >
          {talent.archetype}
        </div>

        {/* Identity — bottom, always visible */}
        <div className="dc-card-id">
          <div className="dc-card-name">{talent.name}</div>
          {talent.location && (
            <div className="dc-card-city">
              <MapPin size={9} strokeWidth={2} />
              {talent.location}
            </div>
          )}
        </div>

        {/* Hover reveal panel */}
        <div className="dc-card-reveal">
          <div className="dc-card-stats">
            {talent.height && <span>{talent.height}</span>}
            {talent.height && talent.meas && <span className="dc-dot">·</span>}
            {talent.meas && <span>{talent.meas}</span>}
            {talent.shoe && <><span className="dc-dot">·</span><span>Shoe {talent.shoe}</span></>}
          </div>
          {talent.exp && <div className="dc-card-exp">{talent.exp}</div>}
          <div className="dc-card-btns">
            <button className="dc-btn-ghost" onClick={(e) => { e.stopPropagation(); onClick(); }}>
              View
            </button>
            <button
              className={`dc-btn-gold${isInvited ? ' dc-btn-gold--done' : ''}`}
              onClick={handleInviteClick}
              disabled={isInviting || isInvited}
            >
              {isInviting ? (
                <Loader2 size={12} strokeWidth={2.2} className="dc-spin" />
              ) : (
                <Mail size={12} strokeWidth={2.2} />
              )}
              {isInvited ? 'Invited' : 'Invite'}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DiscoverPage() {
  const queryClient = useQueryClient();

  const { data: agencyProfile } = useQuery({
    queryKey: ['agency-profile'],
    queryFn: getAgencyProfile,
  });

  const [query, setQuery]                   = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [chips, setChips]                   = useState([]);
  const [isFocused, setIsFocused]           = useState(false);
  const [promptIdx, setPromptIdx]           = useState(0);
  const [promptVisible, setPromptVisible]   = useState(true);
  const [selectedTalent, setSelectedTalent] = useState(null);
  const [invitingIds, setInvitingIds]       = useState(new Set());
  const [invitedIds, setInvitedIds]         = useState(new Set());

  // Debounce query → API
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 500);
    return () => clearTimeout(t);
  }, [query]);

  // Cycle placeholder prompts
  useEffect(() => {
    const id = setInterval(() => {
      setPromptVisible(false);
      setTimeout(() => {
        setPromptIdx((i) => (i + 1) % PROMPTS.length);
        setPromptVisible(true);
      }, 420);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  // Parse query into intent chips
  useEffect(() => {
    if (!query.trim()) { setChips([]); return; }
    setChips(parseIntent(query));
  }, [query]);

  const removeChip = (label) => setChips((cs) => cs.filter((c) => c.label !== label));

  // Build API params from chips + debounced query
  const apiParams = useMemo(() => chipsToParams(chips, debouncedQuery), [chips, debouncedQuery]);

  // Fetch real talent data
  const { data, isLoading, isError } = useQuery({
    queryKey: ['discover', apiParams],
    queryFn: () => getDiscoverableTalent(apiParams),
    staleTime: 30_000,
  });

  const profiles = data?.profiles || [];
  const pagination = data?.pagination;
  const visible = profiles.map(toTalentObject).filter(Boolean);

  // Invite handler
  const handleInvite = useCallback(async (profileId) => {
    setInvitingIds((prev) => new Set([...prev, profileId]));
    try {
      await inviteTalent(profileId);
      setInvitedIds((prev) => new Set([...prev, profileId]));
      toast.success('Invitation sent');
      // Invalidate so this profile drops off results on next fetch
      queryClient.invalidateQueries({ queryKey: ['discover'] });
    } catch (err) {
      if (err?.status === 409) {
        toast.info('Already invited');
        setInvitedIds((prev) => new Set([...prev, profileId]));
      } else {
        toast.error('Failed to send invitation');
      }
    } finally {
      setInvitingIds((prev) => {
        const next = new Set(prev);
        next.delete(profileId);
        return next;
      });
    }
  }, [queryClient]);

  const handlePanelAction = useCallback((action, talent) => {
    if (action === 'invite') handleInvite(talent.profileId);
    else toast.success('Coming soon');
  }, [handleInvite]);

  return (
    <div className="dc-page">

      {/* ── Background ─────────────────────────────────────── */}
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

      {/* Neural dot grid substrate */}
      <div className="dc-neural" aria-hidden="true" />

      {/* ── Threshold ──────────────────────────────────────── */}
      <section className="dc-threshold">
        <motion.div
          className="dc-threshold-inner"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="dc-eyebrow">
            <span className="dc-eyebrow-gem">◈</span>
            <span>AI Discovery</span>
            <span className="dc-eyebrow-rule" />
          </div>

          <h1 className="dc-headline">
            Describe what you're
            <br />
            <em>looking for.</em>
          </h1>

          {/* NL Search Bar */}
          <div className={`dc-bar${isFocused ? ' dc-bar--on' : ''}`}>
            <div className="dc-bar-shell">
              <span className="dc-bar-gem" aria-hidden="true">◈</span>
              <div className="dc-bar-field">
                <input
                  className="dc-bar-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Describe the talent you're looking for"
                />
                {!query && (
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
                    className="dc-bar-clear"
                    onClick={() => setQuery('')}
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
              <div className="dc-bar-enter" aria-hidden="true">↵</div>
            </div>
          </div>

          {/* Intent Chips */}
          <AnimatePresence>
            {chips.length > 0 && (
              <motion.div
                className="dc-chips"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
              >
                {chips.map((chip, i) => (
                  <motion.button
                    key={chip.label}
                    className="dc-chip"
                    initial={{ opacity: 0, scale: 0.8, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ delay: i * 0.06, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => removeChip(chip.label)}
                  >
                    {chip.label}
                    <X size={9} strokeWidth={2.5} />
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </section>

      {/* ── Curated Section ────────────────────────────────── */}
      <section className="dc-curated">
        <div className="dc-curated-head">
          <div className="dc-curated-head-l">
            <svg className="dc-wave" width="46" height="20" viewBox="0 0 46 20" fill="none" aria-hidden="true">
              <polyline
                points="0,10 5,10 8,3 11,17 14,6 17,14 20,10 46,10"
                stroke="#C9A55A" strokeWidth="1.3" strokeOpacity="0.55"
                strokeLinejoin="round" strokeLinecap="round"
              />
            </svg>
            <span className="dc-curated-label">
              {chips.length > 0 || debouncedQuery ? 'Search Results' : `Curated for ${agencyProfile?.agency_name || 'your agency'}`}
            </span>
          </div>
          <span className="dc-curated-count">
            {isLoading ? (
              <Loader2 size={14} className="dc-spin" />
            ) : (
              <>{pagination?.total ?? visible.length} profiles <span className="dc-gem-inline">✦</span></>
            )}
          </span>
        </div>

        {isError ? (
          <motion.div className="dc-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="dc-empty-gem">◈</div>
            <p className="dc-empty-text">Failed to load talent. Please try again.</p>
          </motion.div>
        ) : isLoading ? (
          <div className="dc-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} aspectRatio={ASPECT_RATIOS[i % ASPECT_RATIOS.length]} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <motion.div className="dc-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="dc-empty-gem">◈</div>
            <p className="dc-empty-text">No talent matched your criteria.</p>
            <button className="dc-empty-reset" onClick={() => setQuery('')}>Clear search</button>
          </motion.div>
        ) : (
          <div className="dc-grid">
            {visible.map((t, i) => (
              <TalentCard
                key={t.id}
                talent={t}
                index={i}
                aspectRatio={ASPECT_RATIOS[i % ASPECT_RATIOS.length]}
                onClick={() => setSelectedTalent(t)}
                onInvite={handleInvite}
                isInviting={invitingIds.has(t.id)}
                isInvited={invitedIds.has(t.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Talent Panel ───────────────────────────────────── */}
      <AnimatePresence>
        {selectedTalent && (
          <TalentDetailPanel
            key={selectedTalent.id}
            profileId={selectedTalent.profileId || selectedTalent.id}
            context="discover"
            mode="drawer"
            onClose={() => setSelectedTalent(null)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
