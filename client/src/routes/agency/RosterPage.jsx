  /**
 * RosterPage — Agency Talent Roster
 * Compact row / card grid / detail panel workspace for managing signed talent.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Plus, LayoutGrid, Rows,
  ChevronUp, ChevronDown, MessageSquare, Layers,
  MoreHorizontal, Mail, Phone, MapPin, Calendar,
  ExternalLink, Archive, Tag, User, ChevronRight,
  Download, SlidersHorizontal, Check,
} from 'lucide-react';
import { TalentTypePill } from '../../components/agency/ui/TalentTypePill';
import { TalentStatusBadge } from '../../components/agency/ui/TalentStatusBadge';
import { TalentPanel } from '../../components/agency/TalentPanel';
import './RosterPage.css';

// ── Helpers ───────────────────────────────────────────────────
const u = (id, w = 400, h = 600) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&auto=format&q=80`;

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function formatRelativeDate(date) {
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

function bookingAgeClass(date) {
  if (!date) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days > 180) return 'ro-age--critical';
  if (days > 90) return 'ro-age--warn';
  return '';
}

// ── Config ────────────────────────────────────────────────────
const STATUS = {
  available: { label: 'Available',  var: '--ro-available', pulse: true  },
  booking:   { label: 'On Booking', var: '--ro-booking',   pulse: false },
  hold:      { label: 'On Hold',    var: '--ro-hold',      pulse: false },
  inactive:  { label: 'Inactive',   var: '--ro-inactive',  pulse: false },
};

const TYPES = {
  editorial:  { label: 'Editorial',  bg: 'rgba(109,40,217,0.09)',  color: '#6D28D9' },
  commercial: { label: 'Commercial', bg: 'rgba(4,120,87,0.09)',    color: '#047857' },
  runway:     { label: 'Runway',     bg: 'rgba(180,130,50,0.12)',  color: '#9A7030' },
  fitness:    { label: 'Fitness',    bg: 'rgba(29,78,216,0.09)',   color: '#1D4ED8' },
  plus:       { label: 'Plus',       bg: 'rgba(185,28,28,0.08)',   color: '#B91C1C' },
};

const FILTER_GENDER  = [{ value: '', label: 'All Genders' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }];
const FILTER_TYPE    = [{ value: '', label: 'All Types' }, ...Object.entries(TYPES).map(([v, c]) => ({ value: v, label: c.label }))];
const FILTER_STATUS  = [{ value: '', label: 'All Status' }, ...Object.entries(STATUS).map(([v, c]) => ({ value: v, label: c.label }))];

// ── Static Roster Data ────────────────────────────────────────
const ROSTER = [
  { id: '1',  name: 'Sofia Marchetti',   gender: 'female', type: 'editorial',  status: 'available', location: 'New York',    height: 178, bust: 85,  waist: 60, hips: 88,  lastBooking: daysAgo(3),   dateAdded: new Date('2024-01-15'), tags: ['High Fashion', 'Paris Exp.', 'Bilingual'],   img: u('1529626455594-4ff0802cfb7e'), email: 'sofia.m@example.com',    phone: '+1 212 555 0101', notes: 'Strong editorial presence. Preferred for luxury clients. Available for travel.' },
  { id: '2',  name: 'Amara Diallo',      gender: 'female', type: 'commercial', status: 'booking',   location: 'London',      height: 175, bust: 87,  waist: 63, hips: 91,  lastBooking: daysAgo(1),   dateAdded: new Date('2023-11-20'), tags: ['Commercial', 'Lifestyle', 'Brand Work'],    img: u('1531746020798-e6953c6e8e04'), email: 'amara.d@example.com',    phone: '+44 20 555 0202', notes: 'Currently on a 2-week campaign. Back available Dec 15.' },
  { id: '3',  name: 'Lucas Ferreira',    gender: 'male',   type: 'runway',     status: 'available', location: 'Milan',       height: 188, bust: 98,  waist: 78, hips: 94,  lastBooking: daysAgo(7),   dateAdded: new Date('2023-09-05'), tags: ['Runway', 'Menswear', 'Avant-garde'],        img: u('1506794778202-cad84cf45f1d'), email: 'lucas.f@example.com',    phone: '+39 02 555 0303', notes: 'Fluent Italian and Portuguese. Strong runway walk.' },
  { id: '4',  name: 'Priya Nair',        gender: 'female', type: 'editorial',  status: 'hold',      location: 'New York',    height: 172, bust: 83,  waist: 59, hips: 87,  lastBooking: daysAgo(14),  dateAdded: new Date('2024-03-10'), tags: ['Editorial', 'Beauty', 'High Fashion'],      img: u('1534528741775-53994a69daeb'), email: 'priya.n@example.com',    phone: '+1 212 555 0404', notes: 'On hold for Vogue Italia shoot. Confirm by Thursday.' },
  { id: '5',  name: 'James Okafor',      gender: 'male',   type: 'commercial', status: 'available', location: 'Los Angeles', height: 183, bust: 100, waist: 81, hips: 97,  lastBooking: daysAgo(5),   dateAdded: new Date('2023-12-01'), tags: ['Commercial', 'Fitness', 'Lifestyle'],       img: u('1507003211169-0a1dd7228f2d'), email: 'james.o@example.com',    phone: '+1 310 555 0505', notes: 'Strong fitness look. Good with athletic campaigns.' },
  { id: '6',  name: 'Elena Vasquez',     gender: 'female', type: 'fitness',    status: 'available', location: 'Los Angeles', height: 170, bust: 88,  waist: 65, hips: 92,  lastBooking: daysAgo(10),  dateAdded: new Date('2024-02-20'), tags: ['Fitness', 'Sports', 'Athletic'],            img: u('1551292831-023188e78222'),    email: 'elena.v@example.com',    phone: '+1 310 555 0606', notes: 'Former professional swimmer. Great for athletic brands.' },
  { id: '7',  name: 'Marcus Webb',       gender: 'male',   type: 'editorial',  status: 'inactive',  location: 'Paris',       height: 185, bust: 97,  waist: 79, hips: 95,  lastBooking: daysAgo(120), dateAdded: new Date('2023-04-01'), tags: ['Editorial', 'Menswear'],                    img: u('1500648767791-00dcc994a43e'), email: 'marcus.w@example.com',   phone: '+33 1 555 0707',  notes: 'Long-term inactive. Consider re-engagement outreach.' },
  { id: '8',  name: 'Yuki Tanaka',       gender: 'female', type: 'runway',     status: 'available', location: 'Tokyo',       height: 176, bust: 82,  waist: 58, hips: 86,  lastBooking: daysAgo(4),   dateAdded: new Date('2024-04-15'), tags: ['Runway', 'Couture', 'Asian Markets'],       img: u('1499996860823-5214fcc65f8f'), email: 'yuki.t@example.com',     phone: '+81 3 555 0808',  notes: 'Exceptional runway presence. Strong Tokyo and Paris connections.' },
  { id: '9',  name: 'Chloe Anderson',    gender: 'female', type: 'commercial', status: 'booking',   location: 'Chicago',     height: 173, bust: 86,  waist: 62, hips: 90,  lastBooking: daysAgo(2),   dateAdded: new Date('2023-08-12'), tags: ['Commercial', 'Beauty', 'Lifestyle'],        img: u('1438761681033-6461ffad8d80'), email: 'chloe.a@example.com',    phone: '+1 312 555 0909', notes: 'Currently booking for Target campaign. Available after Dec 20.' },
  { id: '10', name: 'Rafael Santos',     gender: 'male',   type: 'runway',     status: 'hold',      location: 'São Paulo',   height: 190, bust: 99,  waist: 80, hips: 96,  lastBooking: daysAgo(8),   dateAdded: new Date('2024-01-30'), tags: ['Runway', 'Fitness', 'Swimwear'],            img: u('1552374196-c4e7ffc6e126'),   email: 'rafael.s@example.com',   phone: '+55 11 555 1010', notes: 'On hold for Valentino show. Decision by end of week.' },
  { id: '11', name: 'Naomi Clarke',      gender: 'female', type: 'plus',       status: 'available', location: 'New York',    height: 174, bust: 102, waist: 82, hips: 110, lastBooking: daysAgo(6),   dateAdded: new Date('2024-02-05'), tags: ['Plus', 'Commercial', 'Lifestyle'],          img: u('1567532939604-b6b5b0db2604'), email: 'naomi.c@example.com',    phone: '+1 212 555 1111', notes: 'Strong plus-size editorial presence. Great brand ambassador.' },
  { id: '12', name: 'Alex Chen',         gender: 'male',   type: 'commercial', status: 'available', location: 'New York',    height: 181, bust: 96,  waist: 78, hips: 93,  lastBooking: daysAgo(11),  dateAdded: new Date('2023-10-20'), tags: ['Commercial', 'Tech Brands', 'Lifestyle'],  img: u('1542103749-8ef59b94f47e'),   email: 'alex.c@example.com',     phone: '+1 212 555 1212', notes: 'Excellent for tech and lifestyle brands. Clean, approachable look.' },
  { id: '13', name: 'Isabelle Laurent',  gender: 'female', type: 'editorial',  status: 'available', location: 'Paris',       height: 179, bust: 84,  waist: 61, hips: 89,  lastBooking: daysAgo(2),   dateAdded: new Date('2024-03-22'), tags: ['Editorial', 'Couture', 'Luxury'],           img: u('1489424731084-a5d8b219a5bb'), email: 'isabelle.l@example.com', phone: '+33 1 555 1313',  notes: 'Emerging talent with strong Parisian editorial connections.' },
  { id: '14', name: 'Kofi Mensah',       gender: 'male',   type: 'fitness',    status: 'inactive',  location: 'London',      height: 186, bust: 104, waist: 82, hips: 98,  lastBooking: daysAgo(200), dateAdded: new Date('2023-03-15'), tags: ['Fitness', 'Menswear', 'Sports'],            img: u('1539571696357-5a69c17a67c6'), email: 'kofi.m@example.com',     phone: '+44 20 555 1414', notes: 'Was active in 2023. Consider re-engagement — strong fitness look.' },
  { id: '15', name: 'Valentina Reyes',   gender: 'female', type: 'runway',     status: 'available', location: 'Milan',       height: 177, bust: 83,  waist: 59, hips: 87,  lastBooking: daysAgo(1),   dateAdded: new Date('2024-04-01'), tags: ['Runway', 'High Fashion', 'Europe'],         img: u('1524504388940-b1c1722653e1'), email: 'valentina.r@example.com', phone: '+39 02 555 1515', notes: 'Just completed Paris Fashion Week. Very active and available.' },
  { id: '16', name: 'Dylan Park',        gender: 'male',   type: 'editorial',  status: 'booking',   location: 'Seoul',       height: 184, bust: 95,  waist: 77, hips: 92,  lastBooking: daysAgo(0),   dateAdded: new Date('2024-02-14'), tags: ['Editorial', 'K-Fashion', 'Commercial'],    img: u('1557804506-669a67965ba0'),   email: 'dylan.p@example.com',    phone: '+82 2 555 1616',  notes: 'Currently on booking for Dior campaign in Seoul.' },
  { id: '17', name: 'Fatima Al-Hassan', gender: 'female', type: 'commercial', status: 'available', location: 'Dubai',       height: 171, bust: 88,  waist: 64, hips: 91,  lastBooking: daysAgo(9),   dateAdded: new Date('2024-01-08'), tags: ['Commercial', 'Modest Fashion', 'Lifestyle'], img: u('1544005313-94ddf0286df2'),  email: 'fatima.ah@example.com',  phone: '+971 4 555 1717', notes: 'Strong in modest fashion and Middle East markets.' },
  { id: '18', name: 'Tom Bradley',       gender: 'male',   type: 'commercial', status: 'hold',      location: 'London',      height: 182, bust: 98,  waist: 80, hips: 95,  lastBooking: daysAgo(15),  dateAdded: new Date('2023-07-25'), tags: ['Commercial', 'Automotive', 'Lifestyle'],   img: u('1599566150163-29194dcaad36'), email: 'tom.b@example.com',      phone: '+44 20 555 1818', notes: 'On hold for Land Rover campaign. Great automotive look.' },
  { id: '19', name: 'Mei-Ling Zhou',     gender: 'female', type: 'editorial',  status: 'available', location: 'Shanghai',    height: 174, bust: 81,  waist: 57, hips: 85,  lastBooking: daysAgo(5),   dateAdded: new Date('2024-03-05'), tags: ['Editorial', 'Beauty', 'Asian Markets'],    img: u('1494790108377-be9c29b29330'), email: 'meiling.z@example.com',  phone: '+86 21 555 1919', notes: 'Rising editorial talent. Strong China and Asia market presence.' },
  { id: '20', name: 'Ryan Torres',       gender: 'male',   type: 'fitness',    status: 'available', location: 'Miami',       height: 183, bust: 103, waist: 80, hips: 97,  lastBooking: daysAgo(4),   dateAdded: new Date('2024-04-10'), tags: ['Fitness', 'Swimwear', 'Sports'],            img: u('1516914657580-de9b5b62ea9f'), email: 'ryan.t@example.com',     phone: '+1 305 555 2020', notes: 'Top fitness model. Excellent for swimwear and active brands.' },
  { id: '21', name: 'Aria Kessler',      gender: 'female', type: 'plus',       status: 'booking',   location: 'Berlin',      height: 172, bust: 105, waist: 84, hips: 113, lastBooking: daysAgo(1),   dateAdded: new Date('2024-02-28'), tags: ['Plus', 'Editorial', 'Body Positive'],      img: u('1522337360801-87f68b78db42'), email: 'aria.k@example.com',     phone: '+49 30 555 2121', notes: 'On booking for H&M body positive campaign.' },
  { id: '22', name: 'Marcus Lee',        gender: 'male',   type: 'runway',     status: 'available', location: 'New York',    height: 187, bust: 96,  waist: 77, hips: 93,  lastBooking: daysAgo(6),   dateAdded: new Date('2023-11-10'), tags: ['Runway', 'High Fashion', 'Menswear'],      img: u('1519631017489-f6d55b50ed4a'), email: 'marcus.l@example.com',   phone: '+1 212 555 2222', notes: 'Versatile runway model. Strong luxury and streetwear range.' },
];

// ── NL Intent Parser ──────────────────────────────────────────
function parseIntent(q) {
  const chips = [];
  const s = q.toLowerCase();
  if (/\bfemale\b|\bwomen\b|\bwoman\b/.test(s)) chips.push({ key: 'gender', value: 'female', label: 'Female' });
  else if (/\bmale\b|\bmen\b|\bman\b/.test(s)) chips.push({ key: 'gender', value: 'male', label: 'Male' });
  Object.entries(TYPES).forEach(([k, v]) => { if (s.includes(k)) chips.push({ key: 'type', value: k, label: v.label }); });
  if (/\bavailable\b/.test(s)) chips.push({ key: 'status', value: 'available', label: 'Available' });
  else if (/\bbooking\b/.test(s)) chips.push({ key: 'status', value: 'booking', label: 'On Booking' });
  else if (/\bhold\b/.test(s)) chips.push({ key: 'status', value: 'hold', label: 'On Hold' });
  [['new york', 'New York'], ['london', 'London'], ['paris', 'Paris'], ['milan', 'Milan'],
   ['los angeles', 'Los Angeles'], ['miami', 'Miami'], ['seoul', 'Seoul'], ['tokyo', 'Tokyo'],
   ['dubai', 'Dubai'], ['berlin', 'Berlin'], ['shanghai', 'Shanghai']].forEach(([m, l]) => {
    if (s.includes(m)) chips.push({ key: 'location', value: l, label: l });
  });
  const cm = s.match(/(\d{3})\s*cm/);
  if (cm) chips.push({ key: 'heightMin', value: parseInt(cm[1]) - 2, label: `≥${cm[1]}cm` });
  const ft = s.match(/(\d)['′](\d+)/);
  if (ft) { const h = Math.round(parseInt(ft[1]) * 30.48 + parseInt(ft[2]) * 2.54); chips.push({ key: 'heightMin', value: h - 2, label: `≥${h}cm` }); }
  return chips;
}

function applyFilters(data, query, chips, filters, sortKey, sortDir) {
  let r = [...data];
  const nameQ = query
    .replace(/\b(female|male|women?|men?|editorial|commercial|runway|fitness|plus|available|booking|hold|inactive|new york|london|paris|milan|los angeles|miami|seoul|tokyo|dubai|berlin|shanghai|\d{3}\s*cm)\b/gi, '')
    .trim();
  if (nameQ) r = r.filter(t => t.name.toLowerCase().includes(nameQ.toLowerCase()) || t.location.toLowerCase().includes(nameQ.toLowerCase()) || t.tags.some(g => g.toLowerCase().includes(nameQ.toLowerCase())));
  chips.forEach(c => {
    if (c.key === 'gender') r = r.filter(t => t.gender === c.value);
    if (c.key === 'type') r = r.filter(t => t.type === c.value);
    if (c.key === 'status') r = r.filter(t => t.status === c.value);
    if (c.key === 'location') r = r.filter(t => t.location === c.value);
    if (c.key === 'heightMin') r = r.filter(t => t.height >= c.value);
  });
  if (filters.gender) r = r.filter(t => t.gender === filters.gender);
  if (filters.type) r = r.filter(t => t.type === filters.type);
  if (filters.status) r = r.filter(t => t.status === filters.status);
  r.sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') return dir * a.name.localeCompare(b.name);
    if (sortKey === 'lastBooking') return dir * ((a.lastBooking?.getTime() || 0) - (b.lastBooking?.getTime() || 0));
    if (sortKey === 'status') { const o = { available: 0, booking: 1, hold: 2, inactive: 3 }; return dir * ((o[a.status] || 0) - (o[b.status] || 0)); }
    if (sortKey === 'dateAdded') return dir * ((a.dateAdded?.getTime() || 0) - (b.dateAdded?.getTime() || 0));
    return 0;
  });
  return r;
}


function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <span className="ro-sort-icon ro-sort-icon--neutral"><ChevronUp size={10} /><ChevronDown size={10} /></span>;
  return <span className="ro-sort-icon ro-sort-icon--active">{sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</span>;
}

function RosterRow({ talent: t, isSelected, onSelect, onOpen, isActive, highlightHeight }) {
  const ageClass = bookingAgeClass(t.lastBooking);
  return (
    <div
      className={`ro-row${isSelected ? ' ro-row--selected' : ''}${isActive ? ' ro-row--active' : ''}`}
      onClick={() => onOpen(t)}
    >
      {/* Checkbox */}
      <div className="ro-col-check" onClick={e => { e.stopPropagation(); onSelect(t.id); }}>
        <div className={`ro-checkbox${isSelected ? ' ro-checkbox--checked' : ''}`}>
          {isSelected && <Check size={10} strokeWidth={3} />}
        </div>
      </div>

      {/* Avatar */}
      <div className="ro-col-avatar">
        <img src={t.img} alt={t.name} className="ro-avatar" loading="lazy" />
      </div>

      {/* Name */}
      <div className="ro-col-name">
        <span className="ro-name">{t.name}</span>
        <span className="ro-location"><MapPin size={10} />{t.location}</span>
      </div>

      {/* Type */}
      <div className="ro-col-type">
        <TalentTypePill type={t.type} />
      </div>

      {/* Status */}
      <div className="ro-col-status">
        <TalentStatusBadge status={t.status} />
      </div>

      {/* Measurements */}
      <div className="ro-col-measurements">
        <span className={`ro-measurements${highlightHeight ? ' ro-measurements--hl' : ''}`}>
          {t.height}cm
        </span>
        <span className="ro-measurements-bust-waist-hips">{t.bust}·{t.waist}·{t.hips}</span>
      </div>

      {/* Last Booking */}
      <div className="ro-col-booking">
        <span className={`ro-booking-date ${ageClass}`}>{formatRelativeDate(t.lastBooking)}</span>
      </div>

      {/* Tags */}
      <div className="ro-col-tags">
        {t.tags.slice(0, 2).map(tag => (
          <span key={tag} className="ro-tag">{tag}</span>
        ))}
        {t.tags.length > 2 && <span className="ro-tag ro-tag--more">+{t.tags.length - 2}</span>}
      </div>

      {/* Actions */}
      <div className="ro-col-actions" onClick={e => e.stopPropagation()}>
        <div className="ro-action-tray">
          <button className="ro-action-btn" title="Message"><MessageSquare size={14} /></button>
          <button className="ro-action-btn" title="Add to Board"><Layers size={14} /></button>
          <button className="ro-action-btn" title="More"><MoreHorizontal size={14} /></button>
        </div>
        <ChevronRight size={14} className="ro-row-arrow" />
      </div>
    </div>
  );
}

function RosterCard({ talent: t, isSelected, onSelect, onOpen }) {
  return (
    <motion.div
      layout
      className={`ro-card${isSelected ? ' ro-card--selected' : ''}`}
      onClick={() => onOpen(t)}
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      {/* Checkbox */}
      <div className="ro-card-check" onClick={e => { e.stopPropagation(); onSelect(t.id); }}>
        <div className={`ro-checkbox${isSelected ? ' ro-checkbox--checked' : ''}`}>
          {isSelected && <Check size={10} strokeWidth={3} />}
        </div>
      </div>

      {/* Photo */}
      <div className="ro-card-photo-wrap">
        <img src={t.img} alt={t.name} className="ro-card-photo" loading="lazy" />
        <div className="ro-card-photo-overlay">
          <TalentTypePill type={t.type} dark />
        </div>
        <div className="ro-card-status-badge">
          <TalentStatusBadge status={t.status} />
        </div>
      </div>

      {/* Info */}
      <div className="ro-card-info">
        <div className="ro-card-name">{t.name}</div>
        <div className="ro-card-meta">
          <span><MapPin size={10} />{t.location}</span>
          <span>{t.height}cm</span>
        </div>
      </div>
    </motion.div>
  );
}


function BulkActionBar({ count, onMessage, onBoard, onTag, onExport, onArchive, onClear }) {
  return (
    <motion.div
      className="ro-bulk-bar"
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
    >
      <div className="ro-bulk-count">
        <span className="ro-bulk-count-num">{count}</span>
        <span className="ro-bulk-count-label">selected</span>
      </div>
      <div className="ro-bulk-divider" />
      <div className="ro-bulk-actions">
        <button className="ro-bulk-btn" onClick={onMessage}><MessageSquare size={14} />Message</button>
        <button className="ro-bulk-btn" onClick={onBoard}><Layers size={14} />Add to Board</button>
        <button className="ro-bulk-btn" onClick={onTag}><Tag size={14} />Tag</button>
        <button className="ro-bulk-btn" onClick={onExport}><Download size={14} />Export</button>
        <button className="ro-bulk-btn ro-bulk-btn--danger" onClick={onArchive}><Archive size={14} />Archive</button>
      </div>
      <button className="ro-bulk-clear" onClick={onClear}><X size={14} /></button>
    </motion.div>
  );
}

// ── Filter Dropdown ───────────────────────────────────────────
function FilterDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const active = options.find(o => o.value === value && value !== '');
  return (
    <div className={`ro-filter-dd${active ? ' ro-filter-dd--active' : ''}`} ref={ref}>
      <button className="ro-filter-dd-trigger" onClick={() => setOpen(o => !o)}>
        {active ? active.label : label}
        <ChevronDown size={12} className={open ? 'ro-filter-chevron--open' : ''} />
      </button>
      {open && (
        <div className="ro-filter-dd-menu">
          {options.map(opt => (
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

// ── Adapter ───────────────────────────────────────────────────
const toTalentObject = (t) => !t ? null : ({
  id: t.id,
  name: t.name,
  photo: t.img || null,
  type: t.type,
  status: t.status,
  location: t.location || null,
  measurements: { height: t.height || null, bust: t.bust || null, waist: t.waist || null, hips: t.hips || null },
  bio: t.notes || null,
});

// ── Main Page ─────────────────────────────────────────────────
export default function RosterPage() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState('rows'); // 'rows' | 'grid'
  const [sortKey, setSortKey] = useState('lastBooking');
  const [sortDir, setSortDir] = useState('desc');
  const [filters, setFilters] = useState({ gender: '', type: '', status: '' });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activePanel, setActivePanel] = useState(null);

  const chips = useMemo(() => parseIntent(query), [query]);

  const filtered = useMemo(
    () => applyFilters(ROSTER, query, chips, filters, sortKey, sortDir),
    [query, chips, filters, sortKey, sortDir],
  );

  const heightChip = chips.find(c => c.key === 'heightMin');

  // Selection
  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)));
    }
  }, [selectedIds, filtered]);

  // Sort
  const handleSort = useCallback((col) => {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(col); setSortDir('asc'); }
  }, [sortKey]);

  // Remove chip
  const removeChip = useCallback((chip) => {
    // Remove the matching keyword from query
    const patterns = {
      gender: /\b(female|male|women?|men?)\b/gi,
      type: new RegExp(`\\b${chip.value}\\b`, 'gi'),
      status: /\b(available|booking|hold|inactive)\b/gi,
      location: new RegExp(chip.value.toLowerCase(), 'gi'),
      heightMin: /\d{3}\s*cm/gi,
    };
    const pat = patterns[chip.key];
    if (pat) setQuery(q => q.replace(pat, '').trim());
  }, []);

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  return (
    <div className={`ro-page${activePanel ? ' ro-page--panel-open' : ''}`}>

      {/* ── Command Bar ── */}
      <div className="ro-command-bar">
        <div className="ro-command-left">
          <div className="flex flex-col mr-6">
            <h1 className="ro-page-title m-0">Talent Roster</h1>
            <span className="text-[10px] font-bold text-[#C9A55A] uppercase tracking-[0.1em] mt-0.5 ml-0.5">NATYGEN MODELS</span>
          </div>
          
          {/* Search */}
          <div className="ro-search-wrap">
            <Search size={15} className="ro-search-icon" />
            <input
              className="ro-search"
              placeholder='Search roster...'
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          {/* Filter dropdowns */}
          <FilterDropdown label="Gender" options={FILTER_GENDER} value={filters.gender} onChange={v => setFilters(f => ({ ...f, gender: v }))} />
          <FilterDropdown label="Type" options={FILTER_TYPE} value={filters.type} onChange={v => setFilters(f => ({ ...f, type: v }))} />
        </div>

        <div className="ro-command-right">
          <span className="ro-result-count">
            {filtered.length} <span className="ro-result-of">of {ROSTER.length}</span>
          </span>

          {/* View toggle */}
          <div className="flex items-center gap-1 p-1 bg-[#f0ede8] rounded-md">
            <button 
              className={`p-1.5 rounded-md transition-all ${view === 'rows' ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
              onClick={() => setView('rows')} 
              title="Compact rows"
            >
              <Rows size={16} strokeWidth={2.4} />
            </button>
            <button 
              className={`p-1.5 rounded-md transition-all ${view === 'grid' ? 'active bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
              onClick={() => setView('grid')} 
              title="Card grid"
            >
              <LayoutGrid size={16} strokeWidth={2.4} />
            </button>
          </div>

          {/* Add talent */}
          <button className="ro-add-btn">
            <Plus size={15} />Add Talent
          </button>
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
                transition={{ delay: i * 0.05 }}
              >
                {chip.label}
                <X size={10} />
              </motion.button>
            ))}
            <button className="ro-chips-clear-all" onClick={() => setQuery('')}>Clear all</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content ── */}
      <div className="ro-content">

        {/* ── Row View ── */}
        {view === 'rows' && (
          <div className="ro-table">
            {/* Header */}
            <div className="ro-table-header">
              <div className="ro-col-check">
                <div className={`ro-checkbox${allSelected ? ' ro-checkbox--checked' : ''}`} onClick={toggleSelectAll}>
                  {allSelected && <Check size={10} strokeWidth={3} />}
                </div>
              </div>
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
              <div className="ro-col-actions" />
            </div>

            {/* Rows */}
            <div className="ro-table-body">
              <AnimatePresence>
                {filtered.length === 0 ? (
                  <motion.div key="empty" className="ro-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="ro-empty-icon"><User size={32} /></div>
                    <div className="ro-empty-title">No talent matched</div>
                    <div className="ro-empty-sub">Try adjusting your search or filters</div>
                  </motion.div>
                ) : filtered.map(t => (
                  <motion.div key={t.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <RosterRow
                      talent={t}
                      isSelected={selectedIds.has(t.id)}
                      isActive={activePanel?.id === t.id}
                      onSelect={toggleSelect}
                      onOpen={setActivePanel}
                      highlightHeight={!!heightChip && t.height >= heightChip.value}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* ── Grid View ── */}
        {view === 'grid' && (
          <div className="ro-grid">
            <AnimatePresence>
              {filtered.length === 0 ? (
                <motion.div key="empty" className="ro-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="ro-empty-icon"><User size={32} /></div>
                  <div className="ro-empty-title">No talent matched</div>
                  <div className="ro-empty-sub">Try adjusting your search or filters</div>
                </motion.div>
              ) : filtered.map(t => (
                <RosterCard
                  key={t.id}
                  talent={t}
                  isSelected={selectedIds.has(t.id)}
                  onSelect={toggleSelect}
                  onOpen={setActivePanel}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Detail Panel ── */}
      <AnimatePresence>
        {activePanel && (
          <TalentPanel
            key={activePanel.id}
            talent={toTalentObject(activePanel)}
            context="roster"
            onClose={() => setActivePanel(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Bulk Action Bar ── */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <BulkActionBar
            key="bulk"
            count={selectedIds.size}
            onClear={() => setSelectedIds(new Set())}
            onMessage={() => {}}
            onBoard={() => {}}
            onTag={() => {}}
            onExport={() => {}}
            onArchive={() => {}}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
