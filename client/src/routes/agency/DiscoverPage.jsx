/**
 * DiscoverPage — "The Signal"
 *
 * AI-powered talent discovery. Pure frontend prototype with static data.
 *
 * Layout:
 *   1. Threshold  — full-viewport entry with NL search bar + intent chips
 *   2. Curated    — staggered masonry portrait grid with resonance rings
 *   3. Detail Panel — right-edge drawer (no center modal)
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Mail } from 'lucide-react';
import Grainient from './Grainient';
import './DiscoverPage.css';
import { TalentPanel } from '../../components/agency/TalentPanel';
import { TalentMatchRing } from '../../components/agency/ui/TalentMatchRing';

// ─── Data adapter ─────────────────────────────────────────────────────────────
const toTalentObject = (t) => !t ? null : ({
  id:           t.id,
  name:         `${t.first} ${t.last}`,
  photo:        t.photo || null,
  type:         (t.archetype || 'editorial').toLowerCase(),
  status:       'available',
  location:     t.city || null,
  matchScore:   t.match || 0,
  measurements: {
    height: t.height || null,
    bust:   null,
    waist:  null,
    hips:   null,
  },
  bio:          t.bio || null,
});

// ─── Static talent data ───────────────────────────────────────────────────────
const TALENT = [
  {
    id: 1, first: 'Amara',    last: 'Johnson',  archetype: 'Editorial',
    city: 'New York',    match: 97, height: "5'10\"", meas: '34–25–35', shoe: '9',   age: 22,
    exp: 'Established',
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600&h=800',
    bio: 'Versatile editorial talent with a striking presence. Four years across high-fashion campaigns and lookbook production.',
  },
  {
    id: 2, first: 'Sofia',    last: 'Chen',     archetype: 'Runway',
    city: 'Los Angeles', match: 94, height: "5'11\"", meas: '33–24–34', shoe: '8.5', age: 21,
    exp: 'Established',
    photo: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=600&h=900',
    bio: 'Haute couture specialist. Featured in NYFW SS25, Paris Fashion Week, and four international runways.',
  },
  {
    id: 3, first: 'Zara',     last: 'Williams', archetype: 'Commercial',
    city: 'Miami',       match: 88, height: "5'8\"",  meas: '35–26–36', shoe: '8',   age: 24,
    exp: 'Developing',
    photo: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&q=80&w=600&h=750',
    bio: 'Natural, approachable presence perfect for lifestyle and brand campaigns. Broad commercial portfolio.',
  },
  {
    id: 4, first: 'Elena',    last: 'Marcus',   archetype: 'Editorial',
    city: 'New York',    match: 91, height: "5'9\"",  meas: '34–25–35', shoe: '8.5', age: 23,
    exp: 'Established',
    photo: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&q=80&w=600&h=850',
    bio: 'Award-winning editorial talent. Known for expressive storytelling through movement and striking camera presence.',
  },
  {
    id: 5, first: 'Mia',      last: 'Thompson', archetype: 'Lifestyle',
    city: 'Chicago',     match: 85, height: "5'7\"",  meas: '36–27–37', shoe: '7.5', age: 25,
    exp: 'Developing',
    photo: 'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?auto=format&fit=crop&q=80&w=600&h=800',
    bio: 'Wellness and fitness-focused talent. Authentic energy with strong camera confidence and digital reach.',
  },
  {
    id: 6, first: 'Léa',      last: 'Fontaine', archetype: 'Runway',
    city: 'Paris',       match: 96, height: "5'11\"", meas: '32–23–33', shoe: '9',   age: 20,
    exp: 'New Face',
    photo: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&q=80&w=600&h=900',
    bio: 'Emerging Parisian talent with extraordinary movement and proportion. Exceptional runway instinct.',
  },
  {
    id: 7, first: 'Naomi',    last: 'Adeyemi',  archetype: 'Editorial',
    city: 'London',      match: 90, height: "5'9\"",  meas: '34–24–35', shoe: '8',   age: 22,
    exp: 'Developing',
    photo: 'https://images.unsplash.com/photo-1481218110397-35a40234aafe?auto=format&fit=crop&q=80&w=600&h=800',
    bio: 'Bold, expressive editorial presence with a strong print and digital media background.',
  },
  {
    id: 8, first: 'Isabelle', last: 'Moreau',   archetype: 'Commercial',
    city: 'New York',    match: 83, height: "5'8\"",  meas: '35–26–36', shoe: '8',   age: 26,
    exp: 'Established',
    photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=600&h=750',
    bio: 'Highly versatile commercial presence. Broad client portfolio across beauty, lifestyle, and brand campaigns.',
  },
  {
    id: 9, first: 'Yuki',     last: 'Tanaka',   archetype: 'Runway',
    city: 'Tokyo',       match: 92, height: "5'10\"", meas: '33–24–34', shoe: '8.5', age: 21,
    exp: 'Developing',
    photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=600&h=850',
    bio: 'Precision and poise. Tokyo-based runway specialist with exceptional editorial crossover.',
  },
];

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
      chips.push({ label: city.replace(/\b\w/g, c => c.toUpperCase()), key: 'city' });
    }
  }

  const hm = s.match(/(\d)[''′](\d+)/);
  if (hm) chips.push({ label: `Height ${hm[0]}+`, key: 'height' });
  else if (/\btall\b/.test(s)) chips.push({ label: 'Tall', key: 'height' });

  return chips;
}

function applyChips(talent, chips) {
  if (!chips.length) return talent;
  return talent.filter(t =>
    chips.every(chip => {
      if (chip.key === 'archetype')  return t.archetype === chip.label;
      if (chip.key === 'city')       return t.city.toLowerCase().includes(chip.label.toLowerCase());
      if (chip.key === 'experience') return t.exp === chip.label;
      if (chip.key === 'height' && chip.label === 'Tall') {
        const m = t.height.match(/(\d)[''′](\d+)/);
        return m ? parseInt(m[1]) * 12 + parseInt(m[2]) >= 69 : false;
      }
      return true;
    })
  );
}

// ─── Talent Card ──────────────────────────────────────────────────────────────
function TalentCard({ talent, index, aspectRatio, onClick }) {
  const ac = ARCHETYPE[talent.archetype] || ARCHETYPE.Commercial;
  return (
    <motion.div
      className="dc-card"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.055, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
    >
      <div className="dc-card-frame" style={{ aspectRatio }}>
        <img
          src={talent.photo}
          alt={`${talent.first} ${talent.last}`}
          className="dc-card-img"
          loading="lazy"
        />

        {/* Persistent bottom gradient */}
        <div className="dc-card-grad" />

        {/* Archetype pill — top left */}
        <div
          className="dc-card-type"
          style={{ color: ac.color, background: ac.bg, borderColor: ac.border }}
        >
          {talent.archetype}
        </div>

        {/* Match ring — top right */}
        <div className="dc-card-ring">
          <TalentMatchRing score={talent.match || 0} size="md" />
        </div>

        {/* Identity — bottom, always visible */}
        <div className="dc-card-id">
          <div className="dc-card-name">{talent.first} {talent.last}</div>
          <div className="dc-card-city">
            <MapPin size={9} strokeWidth={2} />
            {talent.city}
          </div>
        </div>

        {/* Hover reveal panel */}
        <div className="dc-card-reveal">
          <div className="dc-card-stats">
            <span>{talent.height}</span>
            <span className="dc-dot">·</span>
            <span>{talent.meas}</span>
            <span className="dc-dot">·</span>
            <span>Shoe {talent.shoe}</span>
          </div>
          <div className="dc-card-exp">{talent.exp}</div>
          <div className="dc-card-btns">
            <button className="dc-btn-ghost" onClick={e => e.stopPropagation()}>
              View
            </button>
            <button className="dc-btn-gold" onClick={e => e.stopPropagation()}>
              <Mail size={12} strokeWidth={2.2} />
              Invite
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DiscoverPage() {
  const [query, setQuery]                   = useState('');
  const [chips, setChips]                   = useState([]);
  const [isFocused, setIsFocused]           = useState(false);
  const [promptIdx, setPromptIdx]           = useState(0);
  const [promptVisible, setPromptVisible]   = useState(true);
  const [selectedTalent, setSelectedTalent] = useState(null);

  // Cycle placeholder prompts
  useEffect(() => {
    const id = setInterval(() => {
      setPromptVisible(false);
      setTimeout(() => {
        setPromptIdx(i => (i + 1) % PROMPTS.length);
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

  const removeChip = label => setChips(cs => cs.filter(c => c.label !== label));
  const visible    = applyChips(TALENT, chips);

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
                  onChange={e => setQuery(e.target.value)}
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
              {chips.length > 0 ? 'Search Results' : 'Curated for SMG Models'}
            </span>
          </div>
          <span className="dc-curated-count">
            {visible.length} profiles <span className="dc-gem-inline">✦</span>
          </span>
        </div>

        {visible.length === 0 ? (
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
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Talent Panel ───────────────────────────────────── */}
      <AnimatePresence>
        {selectedTalent && (
          <TalentPanel
            key={selectedTalent.id}
            talent={toTalentObject(selectedTalent)}
            context="discover"
            onClose={() => setSelectedTalent(null)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
