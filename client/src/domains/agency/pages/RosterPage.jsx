/**
 * RosterPage — Agency Talent Roster
 * Intelligent, editorial workspace for managing signed talent.
 * Clicking a talent opens a full-screen workspace matrix (no drawer).
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Plus, LayoutGrid, Rows,
  ChevronUp, ChevronDown, MessageSquare, Layers,
  MoreHorizontal, MapPin, User, ChevronRight,
  Download, Tag, Archive, Check,
} from 'lucide-react';
import RosterIntelligenceStrip from '../components/roster/RosterIntelligenceStrip';
import RosterWorkspace from './RosterWorkspace';
import { useAgencyPermissions } from '../hooks/useAgencyPermissions';
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
const STATUS_COLORS = {
  available: '#16A34A',
  booking:   '#C9A55A',
  hold:      '#3B82F6',
  inactive:  '#9CA3AF',
};

const INSIGHT_COLORS = {
  attention:   '#C0392B',
  opportunity: '#C9A55A',
  growth:      '#2D8A56',
};

const INSIGHT_LABEL = {
  attention:   'Attention',
  opportunity: 'Opportunity',
  growth:      'Growth',
};

const TYPES = {
  editorial:  { label: 'Editorial' },
  commercial: { label: 'Commercial' },
  runway:     { label: 'Runway' },
  fitness:    { label: 'Fitness' },
  plus:       { label: 'Plus' },
};

const FILTER_GENDER = [{ value: '', label: 'All Genders' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }];
const FILTER_TYPE   = [{ value: '', label: 'All Types' }, ...Object.entries(TYPES).map(([v, c]) => ({ value: v, label: c.label }))];
const FILTER_STATUS = [{ value: '', label: 'All Status' }, { value: 'available', label: 'Available' }, { value: 'booking', label: 'On Booking' }, { value: 'hold', label: 'On Hold' }, { value: 'inactive', label: 'Inactive' }];

// ── Static Roster Data ────────────────────────────────────────
const ROSTER = [
  { id: '1',  name: 'Sofia Marchetti',   gender: 'female', type: 'editorial',  status: 'available', location: 'New York',    height: 178, bust: 85,  waist: 60, hips: 88,  lastBooking: daysAgo(3),   dateAdded: new Date('2024-01-15'), tags: ['High Fashion', 'Paris Exp.', 'Bilingual'],    notes: 'Strong editorial presence. Preferred for luxury clients. Available for travel.', email: 'sofia.m@pholio.co',    phone: '+1 212 555 0101', img: u('1529626455594-4ff0802cfb7e') },
  { id: '2',  name: 'Amara Diallo',      gender: 'female', type: 'commercial', status: 'booking',   location: 'London',      height: 175, bust: 87,  waist: 63, hips: 91,  lastBooking: daysAgo(1),   dateAdded: new Date('2023-11-20'), tags: ['Commercial', 'Lifestyle', 'Brand Work'],     notes: 'Currently on a 2-week campaign. Back available Dec 15.',                          email: 'amara.d@pholio.co',    phone: '+44 20 555 0202', img: u('1531746020798-e6953c6e8e04') },
  { id: '3',  name: 'Lucas Ferreira',    gender: 'male',   type: 'runway',     status: 'available', location: 'Milan',       height: 188, bust: 98,  waist: 78, hips: 94,  lastBooking: daysAgo(7),   dateAdded: new Date('2023-09-05'), tags: ['Runway', 'Menswear', 'Avant-garde'],         notes: 'Fluent Italian and Portuguese. Strong runway walk.',                              email: 'lucas.f@pholio.co',    phone: '+39 02 555 0303', img: u('1506794778202-cad84cf45f1d') },
  { id: '4',  name: 'Priya Nair',        gender: 'female', type: 'editorial',  status: 'hold',      location: 'New York',    height: 172, bust: 83,  waist: 59, hips: 87,  lastBooking: daysAgo(14),  dateAdded: new Date('2024-03-10'), tags: ['Editorial', 'Beauty', 'High Fashion'],       notes: 'On hold for Vogue Italia shoot. Confirm by Thursday.',                            email: 'priya.n@pholio.co',    phone: '+1 212 555 0404', img: u('1534528741775-53994a69daeb') },
  { id: '5',  name: 'James Okafor',      gender: 'male',   type: 'commercial', status: 'available', location: 'Los Angeles', height: 183, bust: 100, waist: 81, hips: 97,  lastBooking: daysAgo(5),   dateAdded: new Date('2023-12-01'), tags: ['Commercial', 'Fitness', 'Lifestyle'],        notes: 'Strong fitness look. Good with athletic campaigns.',                              email: 'james.o@pholio.co',    phone: '+1 310 555 0505', img: u('1507003211169-0a1dd7228f2d') },
  { id: '6',  name: 'Elena Vasquez',     gender: 'female', type: 'fitness',    status: 'available', location: 'Los Angeles', height: 170, bust: 88,  waist: 65, hips: 92,  lastBooking: daysAgo(10),  dateAdded: new Date('2024-02-20'), tags: ['Fitness', 'Sports', 'Athletic'],             notes: 'Former professional swimmer. Great for athletic brands.',                         email: 'elena.v@pholio.co',    phone: '+1 310 555 0606', img: u('1551292831-023188e78222') },
  { id: '7',  name: 'Marcus Webb',       gender: 'male',   type: 'editorial',  status: 'inactive',  location: 'Paris',       height: 185, bust: 97,  waist: 79, hips: 95,  lastBooking: daysAgo(120), dateAdded: new Date('2023-04-01'), tags: ['Editorial', 'Menswear'],                     notes: 'Long-term inactive. Consider re-engagement outreach.',                            email: 'marcus.w@pholio.co',   phone: '+33 1 555 0707',  img: u('1500648767791-00dcc994a43e') },
  { id: '8',  name: 'Yuki Tanaka',       gender: 'female', type: 'runway',     status: 'available', location: 'Tokyo',       height: 176, bust: 82,  waist: 58, hips: 86,  lastBooking: daysAgo(4),   dateAdded: new Date('2024-04-15'), tags: ['Runway', 'Couture', 'Asian Markets'],        notes: 'Exceptional runway presence. Strong Tokyo and Paris connections.',                email: 'yuki.t@pholio.co',     phone: '+81 3 555 0808',  img: u('1499996860823-5214fcc65f8f') },
  { id: '9',  name: 'Chloe Anderson',    gender: 'female', type: 'commercial', status: 'booking',   location: 'Chicago',     height: 173, bust: 86,  waist: 62, hips: 90,  lastBooking: daysAgo(2),   dateAdded: new Date('2023-08-12'), tags: ['Commercial', 'Beauty', 'Lifestyle'],         notes: 'Currently booking for Target campaign. Available after Dec 20.',                  email: 'chloe.a@pholio.co',    phone: '+1 312 555 0909', img: u('1438761681033-6461ffad8d80') },
  { id: '10', name: 'Rafael Santos',     gender: 'male',   type: 'runway',     status: 'hold',      location: 'São Paulo',   height: 190, bust: 99,  waist: 80, hips: 96,  lastBooking: daysAgo(8),   dateAdded: new Date('2024-01-30'), tags: ['Runway', 'Fitness', 'Swimwear'],             notes: 'On hold for Valentino show. Decision by end of week.',                            email: 'rafael.s@pholio.co',   phone: '+55 11 555 1010', img: u('1552374196-c4e7ffc6e126') },
  { id: '11', name: 'Naomi Clarke',      gender: 'female', type: 'plus',       status: 'available', location: 'New York',    height: 174, bust: 102, waist: 82, hips: 110, lastBooking: daysAgo(6),   dateAdded: new Date('2024-02-05'), tags: ['Plus', 'Commercial', 'Lifestyle'],           notes: 'Strong plus-size editorial presence. Great brand ambassador.',                    email: 'naomi.c@pholio.co',    phone: '+1 212 555 1111', img: u('1567532939604-b6b5b0db2604') },
  { id: '12', name: 'Alex Chen',         gender: 'male',   type: 'commercial', status: 'available', location: 'New York',    height: 181, bust: 96,  waist: 78, hips: 93,  lastBooking: daysAgo(11),  dateAdded: new Date('2023-10-20'), tags: ['Commercial', 'Tech Brands', 'Lifestyle'],   notes: 'Excellent for tech and lifestyle brands. Clean, approachable look.',              email: 'alex.c@pholio.co',     phone: '+1 212 555 1212', img: u('1542103749-8ef59b94f47e') },
  { id: '13', name: 'Isabelle Laurent',  gender: 'female', type: 'editorial',  status: 'available', location: 'Paris',       height: 179, bust: 84,  waist: 61, hips: 89,  lastBooking: daysAgo(2),   dateAdded: new Date('2024-03-22'), tags: ['Editorial', 'Couture', 'Luxury'],            notes: 'Emerging talent with strong Parisian editorial connections.',                     email: 'isabelle.l@pholio.co', phone: '+33 1 555 1313',  img: u('1489424731084-a5d8b219a5bb') },
  { id: '14', name: 'Kofi Mensah',       gender: 'male',   type: 'fitness',    status: 'inactive',  location: 'London',      height: 186, bust: 104, waist: 82, hips: 98,  lastBooking: daysAgo(200), dateAdded: new Date('2023-03-15'), tags: ['Fitness', 'Menswear', 'Sports'],             notes: 'Was active in 2023. Consider re-engagement — strong fitness look.',               email: 'kofi.m@pholio.co',     phone: '+44 20 555 1414', img: u('1539571696357-5a69c17a67c6') },
  { id: '15', name: 'Valentina Reyes',   gender: 'female', type: 'runway',     status: 'available', location: 'Milan',       height: 177, bust: 83,  waist: 59, hips: 87,  lastBooking: daysAgo(1),   dateAdded: new Date('2024-04-01'), tags: ['Runway', 'High Fashion', 'Europe'],          notes: 'Just completed Paris Fashion Week. Very active and available.',                   email: 'valentina.r@pholio.co',phone: '+39 02 555 1515', img: u('1524504388940-b1c1722653e1') },
  { id: '16', name: 'Dylan Park',        gender: 'male',   type: 'editorial',  status: 'booking',   location: 'Seoul',       height: 184, bust: 95,  waist: 77, hips: 92,  lastBooking: daysAgo(0),   dateAdded: new Date('2024-02-14'), tags: ['Editorial', 'K-Fashion', 'Commercial'],     notes: 'Currently on booking for Dior campaign in Seoul.',                                email: 'dylan.p@pholio.co',    phone: '+82 2 555 1616',  img: u('1557804506-669a67965ba0') },
  { id: '17', name: 'Fatima Al-Hassan',  gender: 'female', type: 'commercial', status: 'available', location: 'Dubai',       height: 171, bust: 88,  waist: 64, hips: 91,  lastBooking: daysAgo(9),   dateAdded: new Date('2024-01-08'), tags: ['Commercial', 'Modest Fashion', 'Lifestyle'],notes: 'Strong in modest fashion and Middle East markets.',                               email: 'fatima.ah@pholio.co',  phone: '+971 4 555 1717', img: u('1544005313-94ddf0286df2') },
  { id: '18', name: 'Tom Bradley',       gender: 'male',   type: 'commercial', status: 'hold',      location: 'London',      height: 182, bust: 98,  waist: 80, hips: 95,  lastBooking: daysAgo(15),  dateAdded: new Date('2023-07-25'), tags: ['Commercial', 'Automotive', 'Lifestyle'],    notes: 'On hold for Land Rover campaign. Great automotive look.',                         email: 'tom.b@pholio.co',      phone: '+44 20 555 1818', img: u('1599566150163-29194dcaad36') },
  { id: '19', name: 'Mei-Ling Zhou',     gender: 'female', type: 'editorial',  status: 'available', location: 'Shanghai',    height: 174, bust: 81,  waist: 57, hips: 85,  lastBooking: daysAgo(5),   dateAdded: new Date('2024-03-05'), tags: ['Editorial', 'Beauty', 'Asian Markets'],     notes: 'Rising editorial talent. Strong China and Asia market presence.',                 email: 'meiling.z@pholio.co',  phone: '+86 21 555 1919', img: u('1494790108377-be9c29b29330') },
  { id: '20', name: 'Ryan Torres',       gender: 'male',   type: 'fitness',    status: 'available', location: 'Miami',       height: 183, bust: 103, waist: 80, hips: 97,  lastBooking: daysAgo(4),   dateAdded: new Date('2024-04-10'), tags: ['Fitness', 'Swimwear', 'Sports'],             notes: 'Top fitness model. Excellent for swimwear and active brands.',                    email: 'ryan.t@pholio.co',     phone: '+1 305 555 2020', img: u('1516914657580-de9b5b62ea9f') },
  { id: '21', name: 'Aria Kessler',      gender: 'female', type: 'plus',       status: 'booking',   location: 'Berlin',      height: 172, bust: 105, waist: 84, hips: 113, lastBooking: daysAgo(1),   dateAdded: new Date('2024-02-28'), tags: ['Plus', 'Editorial', 'Body Positive'],       notes: 'On booking for H&M body positive campaign.',                                      email: 'aria.k@pholio.co',     phone: '+49 30 555 2121', img: u('1522337360801-87f68b78db42') },
  { id: '22', name: 'Marcus Lee',        gender: 'male',   type: 'runway',     status: 'available', location: 'New York',    height: 187, bust: 96,  waist: 77, hips: 93,  lastBooking: daysAgo(6),   dateAdded: new Date('2023-11-10'), tags: ['Runway', 'High Fashion', 'Menswear'],       notes: 'Versatile runway model. Strong luxury and streetwear range.',                     email: 'marcus.l@pholio.co',   phone: '+1 212 555 2222', img: u('1519631017489-f6d55b50ed4a') },
];

const TALENT_BOARDS = {
  '1':  ['FW26 Runway', 'Beauty Editorial'],
  '2':  ['Commercial Spring', 'Lifestyle Campaign'],
  '3':  ['FW26 Runway', 'High Fashion FW'],
  '4':  ['Beauty Editorial', 'High Fashion FW'],
  '5':  ['Lifestyle Campaign'],
  '6':  ['Lifestyle Campaign', 'Commercial Spring'],
  '7':  [],
  '8':  ['FW26 Runway', 'Beauty Editorial', 'High Fashion FW'],
  '9':  ['Commercial Spring', 'Lifestyle Campaign'],
  '10': ['High Fashion FW'],
  '11': ['Commercial Spring', 'Lifestyle Campaign'],
  '12': ['Commercial Spring'],
  '13': ['FW26 Runway', 'Beauty Editorial', 'High Fashion FW'],
  '14': [],
  '15': ['FW26 Runway'],
  '16': ['Commercial Spring', 'High Fashion FW'],
  '17': ['Lifestyle Campaign'],
  '18': ['Commercial Spring'],
  '19': ['Beauty Editorial'],
  '20': ['Lifestyle Campaign'],
  '21': ['Commercial Spring', 'Lifestyle Campaign'],
  '22': ['FW26 Runway', 'High Fashion FW'],
};

const TALENT_STUDIO_PLUS = new Set(['1', '3', '8', '13']);

const TALENT_INSIGHTS = {
  '1':  { type: 'opportunity', text: 'Sofia has strong Paris editorial credentials but has worked exclusively in US commercial boards this quarter. Her market position may be narrowing.' },
  '7':  { type: 'attention',   text: 'Marcus has been inactive for 4 months. A re-engagement call may revive the relationship before he explores other representation.' },
  '8':  { type: 'opportunity', text: "Yuki is available and matches 2 active runway board briefs by profile and measurements. She hasn't been submitted to either." },
  '9':  { type: 'growth',      text: "Chloe's profile is missing key measurements. Completing this section could improve her placement in editorial casting searches." },
  '12': { type: 'growth',      text: "Alex's portfolio lacks editorial samples. Adding variety beyond commercial work could unlock higher-value booking opportunities." },
  '13': { type: 'opportunity', text: "Isabelle just completed Paris Fashion Week and is actively available. She matches 2 open runway board briefs that haven't been filled." },
  '14': { type: 'attention',   text: 'Kofi has been inactive for nearly 7 months — the longest gap on your current roster. Consider a reactivation conversation or a mutual exit.' },
};

const INSIGHT_LABEL_MAP = { attention: 'Attention', opportunity: 'Opportunity', growth: 'Growth' };

const ROSTER_STATS = ROSTER.reduce(
  (acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; },
  { available: 0, booking: 0, hold: 0, inactive: 0 },
);

// ── Intent Parser ─────────────────────────────────────────────
function parseIntent(q) {
  const chips = [];
  const s = q.toLowerCase();
  if (/\bfemale\b|\bwomen\b|\bwoman\b/.test(s)) chips.push({ key: 'gender', value: 'female', label: 'Female' });
  else if (/\bmale\b|\bmen\b|\bman\b/.test(s)) chips.push({ key: 'gender', value: 'male', label: 'Male' });
  ['editorial','commercial','runway','fitness','plus'].forEach(k => {
    if (s.includes(k)) chips.push({ key: 'type', value: k, label: TYPES[k].label });
  });
  if (/\bavailable\b/.test(s)) chips.push({ key: 'status', value: 'available', label: 'Available' });
  else if (/\bbooking\b/.test(s)) chips.push({ key: 'status', value: 'booking', label: 'On Booking' });
  else if (/\bhold\b/.test(s)) chips.push({ key: 'status', value: 'hold', label: 'On Hold' });
  [['new york','New York'],['london','London'],['paris','Paris'],['milan','Milan'],
   ['los angeles','Los Angeles'],['miami','Miami'],['seoul','Seoul'],['tokyo','Tokyo'],
   ['dubai','Dubai'],['berlin','Berlin'],['shanghai','Shanghai']].forEach(([m,l]) => {
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
  if (nameQ) r = r.filter(t =>
    t.name.toLowerCase().includes(nameQ.toLowerCase()) ||
    t.location.toLowerCase().includes(nameQ.toLowerCase()) ||
    t.tags.some(g => g.toLowerCase().includes(nameQ.toLowerCase()))
  );
  chips.forEach(c => {
    if (c.key === 'gender')    r = r.filter(t => t.gender === c.value);
    if (c.key === 'type')      r = r.filter(t => t.type === c.value);
    if (c.key === 'status')    r = r.filter(t => t.status === c.value);
    if (c.key === 'location')  r = r.filter(t => t.location === c.value);
    if (c.key === 'heightMin') r = r.filter(t => t.height >= c.value);
  });
  if (filters.gender) r = r.filter(t => t.gender === filters.gender);
  if (filters.type)   r = r.filter(t => t.type === filters.type);
  if (filters.status) r = r.filter(t => t.status === filters.status);
  r.sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name')        return dir * a.name.localeCompare(b.name);
    if (sortKey === 'lastBooking') return dir * ((a.lastBooking?.getTime() || 0) - (b.lastBooking?.getTime() || 0));
    if (sortKey === 'status')      { const o = { available: 0, booking: 1, hold: 2, inactive: 3 }; return dir * ((o[a.status] || 0) - (o[b.status] || 0)); }
    if (sortKey === 'dateAdded')   return dir * ((a.dateAdded?.getTime() || 0) - (b.dateAdded?.getTime() || 0));
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
  const active = options.find(o => o.value === value && value !== '');
  return (
    <div className={`ro-filter-dd${active ? ' ro-filter-dd--active' : ''}`} ref={ref}>
      <button className="ro-filter-dd-trigger" onClick={() => setOpen(o => !o)}>
        {active ? active.label : label}
        <ChevronDown size={12} className={`ro-filter-chevron${open ? ' ro-filter-chevron--open' : ''}`} />
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

// ── Roster Row (list view) — generous, breathing ─────────────
function RosterRow({ talent: t, onOpen }) {
  const insight = TALENT_INSIGHTS[t.id];
  const ageClass = bookingAgeClass(t.lastBooking);
  return (
    <div
      className="ro-row"
      data-status={t.status}
      onClick={() => onOpen(t)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpen(t)}
    >
      {/* Avatar */}
      <div className="ro-col-avatar">
        <div className="ro-avatar-wrap">
          <img src={t.img} alt={t.name} className="ro-avatar" loading="lazy" />
          <span className="ro-avatar-status-ring" style={{ borderColor: STATUS_COLORS[t.status] }} />
        </div>
      </div>

      {/* Name */}
      <div className="ro-col-name">
        <div className="ro-name-row">
          <span className="ro-name">{t.name}</span>
          {insight && (
            <span
              className="ro-insight-pip"
              style={{ background: INSIGHT_COLORS[insight.type] }}
              title={`${INSIGHT_LABEL_MAP[insight.type]}: ${insight.text}`}
            />
          )}
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
        <span className="ro-meas-height">{t.height}<span className="ro-meas-unit">cm</span></span>
        <span className="ro-meas-bwh">{t.bust}·{t.waist}·{t.hips}</span>
      </div>

      {/* Last Booking */}
      <div className="ro-col-booking">
        <span className={`ro-booking-date${ageClass ? ` ${ageClass}` : ''}`}>
          {formatRelativeDate(t.lastBooking)}
        </span>
      </div>

      {/* Tags */}
      <div className="ro-col-tags">
        {t.tags.slice(0, 2).map(tag => (
          <span key={tag} className="ro-tag">{tag}</span>
        ))}
        {t.tags.length > 2 && <span className="ro-tag ro-tag--more">+{t.tags.length - 2}</span>}
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
function RosterCard({ talent: t, isSelected, onSelect, onOpen }) {
  const insight = TALENT_INSIGHTS[t.id];
  return (
    <motion.div
      layout
      className={`ro-card${isSelected ? ' ro-card--selected' : ''}`}
      onClick={() => onOpen(t)}
      whileHover={{ y: -5 }}
      transition={{ type: 'spring', stiffness: 360, damping: 26 }}
      style={insight ? { '--insight-color': INSIGHT_COLORS[insight.type] } : undefined}
    >
      <div className="ro-card-check" onClick={e => { e.stopPropagation(); onSelect(t.id); }}>
        <div className={`ro-checkbox ro-checkbox--dark${isSelected ? ' ro-checkbox--checked' : ''}`}>
          {isSelected && <Check size={10} strokeWidth={3} />}
        </div>
      </div>
      {insight && <div className="ro-card-insight-bar" />}
      <img src={t.img} alt={t.name} className="ro-card-photo" loading="lazy" />
      <div className="ro-card-shade" />
      <div className="ro-card-status-stripe" style={{ background: STATUS_COLORS[t.status] }} />
      <div className="ro-card-type-pos">
        <span className="ro-type-label">{t.type}</span>
      </div>
      <div className="ro-card-identity">
        <span className="ro-card-name">{t.name}</span>
        <div className="ro-card-sub">
          <span className="ro-card-loc"><MapPin size={9} />{t.location}</span>
          <span className="ro-card-height">{t.height}cm</span>
        </div>
        {insight && (
          <span className="ro-card-insight-tag">{INSIGHT_LABEL_MAP[insight.type]}</span>
        )}
      </div>
    </motion.div>
  );
}

// ── Bulk Action Bar ───────────────────────────────────────────
const ROSTER_BULK_ACTIONS = [
  { key: 'message', label: 'Message', icon: MessageSquare, permission: 'messages.send' },
  { key: 'board', label: 'Add to Board', icon: Layers, permission: 'boards.assign_application' },
  { key: 'tag', label: 'Tag', icon: Tag, permission: 'tags.bulk_add' },
  { key: 'export', label: 'Export', icon: Download, permission: 'org.export_data' },
  { key: 'archive', label: 'Archive', icon: Archive, permission: 'applications.bulk_archive', danger: true },
];

function BulkActionBar({ count, onMessage, onBoard, onTag, onExport, onArchive, onClear }) {
  const { can } = useAgencyPermissions();
  const handlers = {
    message: onMessage,
    board: onBoard,
    tag: onTag,
    export: onExport,
    archive: onArchive,
  };
  const actions = ROSTER_BULK_ACTIONS.filter((a) => can(a.permission));

  if (actions.length === 0) return null;

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
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.key}
              className={`ro-bulk-btn${action.danger ? ' ro-bulk-btn--danger' : ''}`}
              onClick={handlers[action.key]}
            >
              <Icon size={13} />{action.label}
            </button>
          );
        })}
      </div>
      <button className="ro-bulk-clear" onClick={onClear}><X size={14} /></button>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function RosterPage() {
  const [query, setQuery]       = useState('');
  const [view, setView]         = useState('grid');
  const [sortKey, setSortKey]   = useState('lastBooking');
  const [sortDir, setSortDir]   = useState('desc');
  const [filters, setFilters]   = useState({ gender: '', type: '', status: '' });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeWorkspace, setActiveWorkspace] = useState(null);

  const chips = useMemo(() => parseIntent(query), [query]);
  const filtered = useMemo(
    () => applyFilters(ROSTER, query, chips, filters, sortKey, sortDir),
    [query, chips, filters, sortKey, sortDir],
  );
  const handleOpenWorkspace = useCallback((t) => {
    setActiveWorkspace({
      ...t,
      boards:     TALENT_BOARDS[t.id] || [],
      studioPlus: TALENT_STUDIO_PLUS.has(t.id),
    });
  }, []);

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleSort = useCallback((col) => {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(col); setSortDir('asc'); }
  }, [sortKey]);

  const removeChip = useCallback((chip) => {
    const patterns = {
      gender:    /\b(female|male|women?|men?)\b/gi,
      type:      new RegExp(`\\b${chip.value}\\b`, 'gi'),
      status:    /\b(available|booking|hold|inactive)\b/gi,
      location:  new RegExp(chip.value.toLowerCase(), 'gi'),
      heightMin: /\d{3}\s*cm/gi,
    };
    const pat = patterns[chip.key];
    if (pat) setQuery(q => q.replace(pat, '').trim());
  }, []);

  const HERO_STATS = [
    { label: 'Available',  value: ROSTER_STATS.available, tone: 'positive' },
    { label: 'On Booking', value: ROSTER_STATS.booking,   tone: 'gold'     },
    { label: 'On Hold',    value: ROSTER_STATS.hold,      tone: 'neutral'  },
    { label: 'Inactive',   value: ROSTER_STATS.inactive,  tone: 'mute'     },
  ];

  return (
    <div className="ro-page">
      <AnimatePresence mode="wait">

        {/* ── Workspace view ── */}
        {activeWorkspace ? (
          <RosterWorkspace
            key={`ws-${activeWorkspace.id}`}
            talent={activeWorkspace}
            insight={TALENT_INSIGHTS[activeWorkspace.id] || null}
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
              <button className="ro-hero-add-btn">
                <Plus size={14} />Add Talent
              </button>
            </header>

            {/* ── Intelligence Advisory ── */}
            <RosterIntelligenceStrip />

            {/* ── Command Bar ── */}
            <div className="ro-command-bar">
              <div className="ro-command-left">
                <div className="ro-search-wrap">
                  <Search size={14} className="ro-search-icon" />
                  <input
                    className="ro-search"
                    placeholder="Search roster — try 'female editorial Paris'…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  {query && (
                    <button className="ro-search-clear" onClick={() => setQuery('')}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                <FilterDropdown label="Gender" options={FILTER_GENDER} value={filters.gender} onChange={v => setFilters(f => ({ ...f, gender: v }))} />
                <FilterDropdown label="Type"   options={FILTER_TYPE}   value={filters.type}   onChange={v => setFilters(f => ({ ...f, type: v }))} />
                <FilterDropdown label="Status" options={FILTER_STATUS} value={filters.status} onChange={v => setFilters(f => ({ ...f, status: v }))} />
              </div>
              <div className="ro-command-right">
                <span className="ro-result-count">
                  {filtered.length}<span className="ro-result-sep"> / </span>{ROSTER.length}
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
              {/* Grid View */}
              {view === 'grid' && (
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
                        <RosterCard
                          talent={t}
                          isSelected={selectedIds.has(t.id)}
                          onSelect={toggleSelect}
                          onOpen={handleOpenWorkspace}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Row View */}
              {view === 'rows' && (
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
                      ) : filtered.map(t => (
                        <motion.div key={t.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <RosterRow
                            talent={t}
                            onOpen={handleOpenWorkspace}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </div>

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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
