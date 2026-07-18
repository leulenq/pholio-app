/**
 * RosterPage — Agency Talent Roster
 * Editorial workspace for managing signed talent, wired to the live roster API
 * (GET /api/agency/roster). Clicking a talent opens a full-screen workspace.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search, X, LayoutGrid, Rows,
  ChevronUp, ChevronDown, MapPin, User, Users, ChevronRight, Check,
} from 'lucide-react';
import { fetchRoster } from '../api/agency';
import { getState } from '../components/status';
import { AgencyEmptyState } from '../components/ui/AgencyEmptyState';
import { EmptyErrorState } from '../../../shared/components/states';
import RosterWorkspace from './RosterWorkspace';
import './RosterPage.css';

// ── Helpers ───────────────────────────────────────────────────
function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatRelativeDate(value) {
  const date = toDate(value);
  if (!date) return '—';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 14) return '1 wk ago';
  if (days < 30) return `${Math.floor(days / 7)}wk ago`;
  if (days < 60) return '1 mo ago';
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function bookingAgeClass(value) {
  const date = toDate(value);
  if (!date) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days > 180) return 'ro-age--critical';
  if (days > 90) return 'ro-age--warn';
  return '';
}

function initialsOf(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

// ── Config ────────────────────────────────────────────────────
// Statuses the roster API actually emits: available · booking · inactive.
const TYPES = {
  editorial:  { label: 'Editorial' },
  commercial: { label: 'Commercial' },
  runway:     { label: 'Runway' },
  fitness:    { label: 'Fitness' },
  plus:       { label: 'Plus' },
};

const FILTER_GENDER = [{ value: '', label: 'All Genders' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }];
const FILTER_TYPE   = [{ value: '', label: 'All Types' }, ...Object.entries(TYPES).map(([v, c]) => ({ value: v, label: c.label }))];
const FILTER_STATUS = [{ value: '', label: 'All Status' }, { value: 'available', label: 'Available' }, { value: 'booking', label: 'On Booking' }, { value: 'inactive', label: 'Inactive' }];

// ── Intent Parser ─────────────────────────────────────────────
function parseIntent(q) {
  const chips = [];
  const s = q.toLowerCase();
  if (/\bfemale\b|\bwomen\b|\bwoman\b/.test(s)) chips.push({ key: 'gender', value: 'female', label: 'Female' });
  else if (/\bmale\b|\bmen\b|\bman\b/.test(s)) chips.push({ key: 'gender', value: 'male', label: 'Male' });
  ['editorial', 'commercial', 'runway', 'fitness', 'plus'].forEach((k) => {
    if (s.includes(k)) chips.push({ key: 'type', value: k, label: TYPES[k].label });
  });
  if (/\bavailable\b/.test(s)) chips.push({ key: 'status', value: 'available', label: 'Available' });
  else if (/\bbooking\b/.test(s)) chips.push({ key: 'status', value: 'booking', label: 'On Booking' });
  else if (/\binactive\b/.test(s)) chips.push({ key: 'status', value: 'inactive', label: 'Inactive' });
  const cm = s.match(/(\d{3})\s*cm/);
  if (cm) chips.push({ key: 'heightMin', value: parseInt(cm[1], 10) - 2, label: `≥${cm[1]}cm` });
  const ft = s.match(/(\d)['′](\d+)/);
  if (ft) { const h = Math.round(parseInt(ft[1], 10) * 30.48 + parseInt(ft[2], 10) * 2.54); chips.push({ key: 'heightMin', value: h - 2, label: `≥${h}cm` }); }
  return chips;
}

function applyFilters(data, query, chips, filters, sortKey, sortDir) {
  let r = [...data];
  const nameQ = query
    .replace(/\b(female|male|women?|men?|editorial|commercial|runway|fitness|plus|available|booking|inactive|\d{3}\s*cm)\b/gi, '')
    .trim();
  if (nameQ) r = r.filter((t) =>
    (t.name || '').toLowerCase().includes(nameQ.toLowerCase()) ||
    (t.location || '').toLowerCase().includes(nameQ.toLowerCase()) ||
    (t.tags || []).some((g) => g.toLowerCase().includes(nameQ.toLowerCase()))
  );
  chips.forEach((c) => {
    if (c.key === 'gender')    r = r.filter((t) => t.gender === c.value);
    if (c.key === 'type')      r = r.filter((t) => t.type === c.value);
    if (c.key === 'status')    r = r.filter((t) => t.status === c.value);
    if (c.key === 'heightMin') r = r.filter((t) => (t.height || 0) >= c.value);
  });
  if (filters.gender) r = r.filter((t) => t.gender === filters.gender);
  if (filters.type)   r = r.filter((t) => t.type === filters.type);
  if (filters.status) r = r.filter((t) => t.status === filters.status);
  r.sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name')        return dir * (a.name || '').localeCompare(b.name || '');
    if (sortKey === 'lastBooking') return dir * ((toDate(a.lastBooking)?.getTime() || 0) - (toDate(b.lastBooking)?.getTime() || 0));
    if (sortKey === 'status')      { const o = { available: 0, booking: 1, inactive: 2 }; return dir * ((o[a.status] ?? 3) - (o[b.status] ?? 3)); }
    if (sortKey === 'dateAdded')   return dir * ((toDate(a.dateAdded)?.getTime() || 0) - (toDate(b.dateAdded)?.getTime() || 0));
    return 0;
  });
  return r;
}

// ── Sub-components ────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <span className="ro-sort-icon ro-sort-icon--neutral"><ChevronUp size={10} /><ChevronDown size={10} /></span>;
  return <span className="ro-sort-icon ro-sort-icon--active">{sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</span>;
}

function FilterDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const active = options.find((o) => o.value === value && value !== '');
  return (
    <div className={`ro-filter-dd${active ? ' ro-filter-dd--active' : ''}`} ref={ref}>
      <button className="ro-filter-dd-trigger" onClick={() => setOpen((o) => !o)}>
        {active ? active.label : label}
        <ChevronDown size={12} className={`ro-filter-chevron${open ? ' ro-filter-chevron--open' : ''}`} />
      </button>
      {open && (
        <div className="ro-filter-dd-menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`ro-filter-dd-item${value === opt.value ? ' ro-filter-dd-item--active' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {value === opt.value && <Check size={12} />}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TalentAvatar({ talent: t }) {
  if (t.img) {
    return (
      <img
        src={t.img}
        alt={t.name}
        className="ro-avatar"
        loading="lazy"
      />
    );
  }
  return <span className="ro-avatar ro-avatar--fallback">{initialsOf(t.name)}</span>;
}

// ── Roster Row (list view) — generous, breathing ─────────────
function RosterRow({ talent: t, onOpen }) {
  const ageClass = bookingAgeClass(t.lastBooking);
  return (
    <div
      className="ro-row"
      data-status={t.status}
      onClick={() => onOpen(t)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(t)}
    >
      {/* Avatar */}
      <div className="ro-col-avatar">
        <div className="ro-avatar-wrap">
          <TalentAvatar talent={t} />
          <span className="ro-avatar-status-ring" style={{ background: getState(t.status).c }} />
        </div>
      </div>

      {/* Name */}
      <div className="ro-col-name">
        <div className="ro-name-row">
          <span className="ro-name">{t.name}</span>
        </div>
        <span className="ro-location"><MapPin size={9} />{t.location}</span>
      </div>

      {/* Type */}
      <div className="ro-col-type">
        <span className="ro-type-label">{t.type}</span>
      </div>

      {/* Status */}
      <div className="ro-col-status">
        <span className="ro-status-label">{t.status}</span>
      </div>

      {/* Measurements */}
      <div className="ro-col-measurements">
        <span className="ro-meas-height">{t.height || '—'}{t.height ? <span className="ro-meas-unit">cm</span> : null}</span>
        {(t.bust || t.waist || t.hips)
          ? <span className="ro-meas-bwh">{t.bust}·{t.waist}·{t.hips}</span>
          : <span className="ro-meas-bwh">—</span>}
      </div>

      {/* Last Booking */}
      <div className="ro-col-booking">
        <span className={`ro-booking-date${ageClass ? ` ${ageClass}` : ''}`}>
          {formatRelativeDate(t.lastBooking)}
        </span>
      </div>

      {/* Tags */}
      <div className="ro-col-tags">
        {(t.tags || []).slice(0, 2).map((tag) => (
          <span key={tag} className="ro-tag">{tag}</span>
        ))}
        {(t.tags || []).length > 2 && <span className="ro-tag ro-tag--more">+{t.tags.length - 2}</span>}
      </div>

      {/* Open cue */}
      <div className="ro-col-cue">
        <span className="ro-open-cue">Open workspace</span>
        <ChevronRight size={14} className="ro-row-arrow" />
      </div>
    </div>
  );
}

// ── Roster Card (grid view) — editorial portrait ─────────────
function RosterCard({ talent: t, onOpen }) {
  return (
    <motion.div
      layout
      className="ro-card"
      onClick={() => onOpen(t)}
      whileHover={{ y: -5 }}
      transition={{ type: 'spring', stiffness: 360, damping: 26 }}
    >
      {t.img
        ? <img src={t.img} alt={t.name} className="ro-card-photo" loading="lazy" />
        : <span className="ro-card-photo ro-card-photo--fallback">{initialsOf(t.name)}</span>}
      <div className="ro-card-shade" />
      <div className="ro-card-status-stripe" style={{ background: getState(t.status).c }} />
      <div className="ro-card-type-pos">
        <span className="ro-type-label">{t.type}</span>
      </div>
      <div className="ro-card-identity">
        <span className="ro-card-name">{t.name}</span>
        <div className="ro-card-sub">
          <span className="ro-card-loc"><MapPin size={9} />{t.location}</span>
          {t.height ? <span className="ro-card-height">{t.height}cm</span> : null}
        </div>
      </div>
    </motion.div>
  );
}

// ── Skeleton (loading) ────────────────────────────────────────
function RosterSkeleton() {
  return (
    <div className="ro-grid" aria-hidden="true">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="ro-skel-card" />
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function RosterPage() {
  const [query, setQuery]     = useState('');
  const [view, setView]       = useState('grid');
  const [sortKey, setSortKey] = useState('lastBooking');
  const [sortDir, setSortDir] = useState('desc');
  const [filters, setFilters] = useState({ gender: '', type: '', status: '' });
  const [activeWorkspace, setActiveWorkspace] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['agency-roster'],
    queryFn: fetchRoster,
    staleTime: 30000,
  });

  const roster = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const chips = useMemo(() => parseIntent(query), [query]);
  const filtered = useMemo(
    () => applyFilters(roster, query, chips, filters, sortKey, sortDir),
    [roster, query, chips, filters, sortKey, sortDir],
  );

  const handleOpenWorkspace = useCallback((t) => {
    setActiveWorkspace(t);
  }, []);

  const handleSort = useCallback((col) => {
    if (sortKey === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(col); setSortDir('asc'); }
  }, [sortKey]);

  const removeChip = useCallback((chip) => {
    const patterns = {
      gender:    /\b(female|male|women?|men?)\b/gi,
      type:      new RegExp(`\\b${chip.value}\\b`, 'gi'),
      status:    /\b(available|booking|inactive)\b/gi,
      heightMin: /\d{3}\s*cm/gi,
    };
    const pat = patterns[chip.key];
    if (pat) setQuery((q) => q.replace(pat, '').trim());
  }, []);

  const stats = useMemo(() => roster.reduce(
    (acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; },
    { available: 0, booking: 0, inactive: 0 },
  ), [roster]);

  const HERO_STATS = [
    { label: 'Signed',     value: roster.length,    tone: 'neutral'  },
    { label: 'Available',  value: stats.available,  tone: 'positive' },
    { label: 'On Booking', value: stats.booking,    tone: 'gold'     },
    { label: 'Inactive',   value: stats.inactive,   tone: 'mute'     },
  ];

  return (
    <div className="ro-page">
      <AnimatePresence mode="wait">

        {/* ── Workspace view ── */}
        {activeWorkspace ? (
          <RosterWorkspace
            key={`ws-${activeWorkspace.id}`}
            talent={activeWorkspace}
            insight={null}
            onBack={() => setActiveWorkspace(null)}
          />
        ) : (

          /* ── Roster list view ── */
          <motion.div
            key="roster-list"
            className="ro-roster-view"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* ── Hero Header ── */}
            <header className="ro-hero">
              <div className="ro-hero-left">
                <h1 className="ro-hero-title">Roster</h1>
              </div>
              <div className="ro-hero-stats">
                {HERO_STATS.map((s, i) => (
                  <motion.div
                    key={s.label}
                    className={`ro-hero-stat ro-hero-stat--${s.tone}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 + i * 0.07, duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <span className="ro-hero-stat-num">{s.value}</span>
                    <span className="ro-hero-stat-label">{s.label}</span>
                  </motion.div>
                ))}
              </div>
            </header>

            {/* ── Command Bar ── */}
            <div className="ro-command-bar">
              <div className="ro-command-left">
                <div className="ro-search-wrap">
                  <Search size={14} className="ro-search-icon" />
                  <input
                    className="ro-search"
                    placeholder="Search roster — try 'female editorial'…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button className="ro-search-clear" onClick={() => setQuery('')}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                <FilterDropdown label="Gender" options={FILTER_GENDER} value={filters.gender} onChange={(v) => setFilters((f) => ({ ...f, gender: v }))} />
                <FilterDropdown label="Type"   options={FILTER_TYPE}   value={filters.type}   onChange={(v) => setFilters((f) => ({ ...f, type: v }))} />
                <FilterDropdown label="Status" options={FILTER_STATUS} value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} />
              </div>
              <div className="ro-command-right">
                <span className="ro-result-count">
                  {filtered.length}<span className="ro-result-sep"> / </span>{roster.length}
                </span>
                <div className="ro-view-toggle">
                  <button
                    className={`ro-view-btn${view === 'grid' ? ' ro-view-btn--active' : ''}`}
                    onClick={() => setView('grid')}
                    title="Card grid"
                  >
                    <LayoutGrid size={15} strokeWidth={2.2} />
                  </button>
                  <button
                    className={`ro-view-btn${view === 'rows' ? ' ro-view-btn--active' : ''}`}
                    onClick={() => setView('rows')}
                    title="Compact rows"
                  >
                    <Rows size={15} strokeWidth={2.2} />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Intent Chips ── */}
            <AnimatePresence>
              {chips.length > 0 && (
                <motion.div
                  className="ro-chips-bar"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <span className="ro-chips-label">Filtered by</span>
                  {chips.map((chip, i) => (
                    <motion.button
                      key={`${chip.key}-${chip.value}`}
                      className="ro-chip"
                      onClick={() => removeChip(chip)}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      {chip.label}<X size={10} />
                    </motion.button>
                  ))}
                  <button className="ro-chips-clear" onClick={() => setQuery('')}>Clear all</button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Content ── */}
            <div className="ro-content">
              {isLoading ? (
                <RosterSkeleton />
              ) : isError ? (
                <EmptyErrorState
                  variant="section"
                  title="Could not load your roster"
                  body="Your signed talent did not load. Try again to refresh."
                  retry={{ label: 'Try again', onClick: () => refetch() }}
                />
              ) : roster.length === 0 ? (
                <AgencyEmptyState
                  icon={Users}
                  title="Your book is empty"
                  description="Sign talent from Applications to build your roster — accepted applicants appear here."
                  action={<Link to="/dashboard/agency/applicants" className="ro-empty-cta">Review applications</Link>}
                />
              ) : view === 'grid' ? (
                <div className="ro-grid">
                  <AnimatePresence>
                    {filtered.length === 0 ? (
                      <motion.div key="empty" className="ro-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="ro-empty-icon"><User size={28} /></div>
                        <div className="ro-empty-title">No talent matched</div>
                        <div className="ro-empty-sub">Adjust your search or filters</div>
                      </motion.div>
                    ) : filtered.map((t, i) => (
                      <motion.div
                        key={t.id}
                        layout
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <RosterCard talent={t} onOpen={handleOpenWorkspace} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="ro-table">
                  <div className="ro-table-header">
                    <div className="ro-col-avatar" />
                    <button className="ro-col-name ro-th" onClick={() => handleSort('name')}>
                      Name <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                    <div className="ro-col-type ro-th">Type</div>
                    <button className="ro-col-status ro-th" onClick={() => handleSort('status')}>
                      Status <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                    <div className="ro-col-measurements ro-th">Measurements</div>
                    <button className="ro-col-booking ro-th" onClick={() => handleSort('lastBooking')}>
                      Last Booking <SortIcon col="lastBooking" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                    <div className="ro-col-tags ro-th">Tags</div>
                    <div className="ro-col-cue" />
                  </div>
                  <div className="ro-table-body">
                    <AnimatePresence>
                      {filtered.length === 0 ? (
                        <motion.div key="empty" className="ro-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          <div className="ro-empty-icon"><User size={28} /></div>
                          <div className="ro-empty-title">No talent matched</div>
                          <div className="ro-empty-sub">Adjust your search or filters</div>
                        </motion.div>
                      ) : filtered.map((t) => (
                        <motion.div key={t.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <RosterRow talent={t} onOpen={handleOpenWorkspace} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
