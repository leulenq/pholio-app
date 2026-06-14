import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ChevronLeft, MessageSquare, MoreHorizontal,
  MapPin, Mail, Phone, Sparkles, Clock, Award,
  TrendingUp, Camera, Calendar, Check, X,
  Copy, ExternalLink, FileText, Archive, Layers,
  Instagram,
} from 'lucide-react';
import './RosterWorkspace.css';

// ── Constants ──────────────────────────────────────────────────

const STATUS_COLORS = {
  available: '#16A34A',
  booking:   '#C9A55A',
  hold:      '#3B82F6',
  inactive:  '#9CA3AF',
};

const TYPE_CFG = {
  editorial:  { color: '#7C3AED', bg: 'rgba(124,58,237,0.08)',  border: 'rgba(124,58,237,0.18)' },
  commercial: { color: '#047857', bg: 'rgba(4,120,87,0.08)',    border: 'rgba(4,120,87,0.18)'   },
  runway:     { color: '#9A7030', bg: 'rgba(201,165,90,0.10)',  border: 'rgba(201,165,90,0.22)' },
  fitness:    { color: '#1D4ED8', bg: 'rgba(29,78,216,0.08)',   border: 'rgba(29,78,216,0.18)'  },
  plus:       { color: '#B91C1C', bg: 'rgba(185,28,28,0.08)',   border: 'rgba(185,28,28,0.18)'  },
};

const INTEL_CFG = {
  attention: {
    accent: 'var(--ag-danger)',
    bg:     'var(--ag-danger-dim)',
    border: 'rgba(192,57,43,0.18)',
    label:  'Attention',
    action: 'Schedule a re-engagement call this week before the relationship cools further.',
    cta:    'Draft message',
    route:  '/dashboard/agency/messages',
  },
  opportunity: {
    accent: 'var(--ag-gold)',
    bg:     'var(--ag-gold-ghost)',
    border: 'var(--ag-border-gold)',
    label:  'Opportunity',
    action: 'Submit to matching open briefs before the booking window closes.',
    cta:    'View open briefs',
    route:  '/dashboard/agency/casting',
  },
  growth: {
    accent: 'var(--ag-success)',
    bg:     'var(--ag-success-dim)',
    border: 'rgba(45,138,86,0.18)',
    label:  'Growth',
    action: 'Request an updated portfolio shoot and complete missing profile fields to improve search placement.',
    cta:    'Request update',
    route:  '/dashboard/agency/messages',
  },
};

const ALL_BOARDS = ['FW26 Runway', 'Commercial Spring', 'Beauty Editorial', 'Lifestyle Campaign', 'High Fashion FW'];
const BRANDS     = ['Vogue Italia', "Harper's Bazaar", 'Dior', 'Valentino', 'Net-a-Porter', 'Gucci', 'Bottega Veneta', 'Loewe'];
const ACTIVITY_ICON = {
  booking: <Award size={12} />,
  message: <MessageSquare size={12} />,
  board:   <Layers size={12} />,
  join:    <TrendingUp size={12} />,
};

// ── Mock data ──────────────────────────────────────────────────

function getMockStats(id) {
  const s = parseInt(id) || 1;
  return {
    total:       (s * 7 + 3) % 18 + 3,
    commission:  ((s * 3847 + 1000) % 35000) + 8000,
    dayRate:     ((s * 892) % 4000) + 1500,
    bookingRate: Math.round(((s * 17) % 40) + 45),
  };
}

function getMockActivity(talent) {
  const s   = parseInt(talent.id) || 1;
  const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
  return [
    { type: 'booking', label: `Booked — ${BRANDS[s % BRANDS.length]}`,              date: talent.lastBooking || ago(14) },
    { type: 'message', label: 'Availability confirmed for upcoming window',          date: ago((s * 3) % 12 + 3) },
    { type: 'board',   label: `Submitted to "${ALL_BOARDS[s % ALL_BOARDS.length]}"`, date: ago((s * 5) % 25 + 6) },
    { type: 'join',    label: 'Joined agency roster',                                date: talent.dateAdded },
  ].filter(a => a.date);
}

function getPortfolioImages(img) {
  const base = img?.split('?')[0];
  if (!base) return [];
  return [
    `${base}?w=320&h=440&fit=crop&auto=format&q=78`,
    `${base}?w=320&h=420&fit=crop&crop=top&auto=format&q=78`,
    `${base}?w=320&h=460&fit=crop&crop=faces&auto=format&q=78`,
    `${base}?w=320&h=400&fit=crop&crop=center&auto=format&q=78`,
    `${base}?w=320&h=480&fit=crop&auto=format&q=78`,
    `${base}?w=320&h=440&fit=crop&crop=entropy&auto=format&q=78`,
  ];
}

// ── Helpers ────────────────────────────────────────────────────

function fmtDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtRelDate(date) {
  if (!date) return '—';
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}wk ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function fmtCurrency(n) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

// ── Sub-components ─────────────────────────────────────────────

function TypeChip({ type }) {
  if (!type) return null;
  const c = TYPE_CFG[type.toLowerCase()] || TYPE_CFG.editorial;
  return (
    <span className="rws-type-chip" style={{ color: c.color, background: c.bg, borderColor: c.border }}>
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}

function ProfileCompletionBar({ talent }) {
  const fields  = [talent.email, talent.phone, talent.location, talent.height, talent.bust, talent.waist, talent.hips, talent.notes, talent.img, talent.tags?.length];
  const filled  = fields.filter(Boolean).length;
  const pct     = Math.round((filled / fields.length) * 100);
  const color   = pct >= 80 ? 'var(--ag-success)' : pct >= 50 ? 'var(--ag-gold)' : 'var(--ag-danger)';
  return (
    <div className="rws-completion">
      <div className="rws-completion-head">
        <span className="rws-completion-label">Profile Completion</span>
        <span className="rws-completion-pct" style={{ color }}>{pct}%</span>
      </div>
      <div className="rws-completion-track">
        <div className="rws-completion-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function BoardPopover({ currentBoards, onClose, onToggle }) {
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div className="rws-popover" ref={ref}>
      <div className="rws-popover-head">Manage Boards</div>
      {ALL_BOARDS.map(board => {
        const active = currentBoards.includes(board);
        return (
          <button key={board} className={`rws-popover-item${active ? ' rws-popover-item--active' : ''}`} onClick={() => onToggle(board)}>
            <span className={`rws-popover-check${active ? ' rws-popover-check--on' : ''}`}>
              {active && <Check size={10} />}
            </span>
            {board}
          </button>
        );
      })}
    </div>
  );
}

function MoreDropdown({ talent, onArchive, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div className="rws-more-menu" ref={ref}>
      <button className="rws-more-item" onClick={() => { navigator.clipboard.writeText(talent.email || ''); toast.success('Email copied'); onClose(); }}>
        <Copy size={13} />Copy email
      </button>
      <button className="rws-more-item" onClick={() => { window.open(`/talent/${talent.id}`, '_blank'); onClose(); }}>
        <ExternalLink size={13} />View portfolio
      </button>
      <div className="rws-more-divider" />
      <button className="rws-more-item rws-more-item--danger" onClick={onArchive}>
        <Archive size={13} />Archive talent
      </button>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────

export default function RosterWorkspace({ talent: t, insight, onBack }) {
  const navigate = useNavigate();
  const stats    = useMemo(() => getMockStats(t.id), [t.id]);
  const activity = useMemo(() => getMockActivity(t), [t]);
  const photos   = useMemo(() => getPortfolioImages(t.img), [t.img]);
  const cfg      = insight ? INTEL_CFG[insight.type] : null;

  const [boards, setBoards]           = useState(t.boards || []);
  const [showBoardPicker, setShowBoardPicker] = useState(false);
  const [showMore, setShowMore]       = useState(false);
  const moreBtnRef                    = useRef(null);

  const toggleBoard = useCallback((board) => {
    setBoards(prev => prev.includes(board) ? prev.filter(b => b !== board) : [...prev, board]);
  }, []);

  function handleArchive() {
    setShowMore(false);
    toast.success(`${t.name.split(' ')[0]} archived from roster`);
    onBack();
  }

  const displayTags = useMemo(
    () => (t.tags || []).filter(tag => tag.toLowerCase() !== (t.type || '').toLowerCase()),
    [t.tags, t.type]
  );

  return (
    <motion.div
      className="rws-root"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* ── Top nav ── */}
      <header className="rws-nav">
        <button className="rws-back" onClick={onBack}>
          <ChevronLeft size={15} strokeWidth={2.2} />
          <span>Roster</span>
        </button>

        <div className="rws-nav-sep" />

        <div className="rws-nav-identity">
          <span className="rws-nav-name">{t.name}</span>
          <TypeChip type={t.type} />
          {insight && (
            <span
              className="rws-nav-signal"
              style={{ color: INTEL_CFG[insight.type]?.accent, borderColor: INTEL_CFG[insight.type]?.accent }}
            >
              {INTEL_CFG[insight.type]?.label}
            </span>
          )}
        </div>

        <div className="rws-nav-actions">
          <button className="rws-btn rws-btn--primary" onClick={() => navigate('/dashboard/agency/messages')}>
            <MessageSquare size={13} />Message
          </button>
          <button className="rws-btn" onClick={() => window.open(`/api/talent/${t.id}/compcard`, '_blank')}>
            <FileText size={13} />Comp Card
          </button>
          <button className="rws-btn" onClick={() => navigate('/dashboard/agency/interviews')}>
            <Calendar size={13} />Schedule
          </button>

          <div className="rws-btn-wrap" ref={moreBtnRef}>
            <button
              className={`rws-btn rws-btn--icon${showMore ? ' rws-btn--active' : ''}`}
              title="More actions"
              onClick={() => setShowMore(v => !v)}
            >
              <MoreHorizontal size={15} />
            </button>
            <AnimatePresence>
              {showMore && (
                <motion.div
                  className="rws-more-wrap"
                  initial={{ opacity: 0, y: 4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.97 }}
                  transition={{ duration: 0.13 }}
                >
                  <MoreDropdown talent={t} onArchive={handleArchive} onClose={() => setShowMore(false)} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* ── Matrix ── */}
      <div className="rws-matrix">

        {/* ─── Col 1: Photo + contact ─────────────────────── */}
        <div className="rws-col rws-col--photo">
          <div className="rws-photo-card">
            <img src={t.img} alt={t.name} className="rws-photo" />
            <div className="rws-photo-shade" />
            <div className="rws-photo-status-bar" style={{ background: STATUS_COLORS[t.status] }} />
          </div>

          <div className="rws-contact">
            {t.email && (
              <a href={`mailto:${t.email}`} className="rws-contact-row">
                <Mail size={12} className="rws-contact-icon" />
                <span>{t.email}</span>
              </a>
            )}
            {t.phone && (
              <a href={`tel:${t.phone}`} className="rws-contact-row">
                <Phone size={12} className="rws-contact-icon" />
                <span>{t.phone}</span>
              </a>
            )}
            <div className="rws-contact-row">
              <MapPin size={12} className="rws-contact-icon" />
              <span>{t.location}</span>
            </div>
            {t.dateAdded && (
              <div className="rws-contact-row">
                <Clock size={12} className="rws-contact-icon" />
                <span>Joined {fmtDate(t.dateAdded)}</span>
              </div>
            )}
            <div className="rws-contact-social">
              <Instagram size={10} className="rws-contact-social-icon" />
              <span>@{t.name.toLowerCase().replace(/\s+/g, '_')}</span>
            </div>
          </div>
        </div>

        {/* ─── Col 2: Identity + portfolio + notes + boards ─── */}
        <div className="rws-col rws-col--center">

          {/* Identity */}
          <div className="rws-panel">
            <p className="rws-panel-section-title">Profile</p>
            <div className="rws-panel-name-row">
              <h2 className="rws-panel-name">{t.name}</h2>
              {t.studioPlus && <span className="rws-studio-plus">Studio+</span>}
              <a
                href={`/talent/${t.id}`}
                target="_blank"
                rel="noreferrer"
                className="rws-portfolio-link"
              >
                <ExternalLink size={11} />
                <span>Portfolio</span>
              </a>
            </div>

            <div className="rws-measures">
              {[
                { label: 'Height', value: t.height, unit: 'cm' },
                { label: 'Bust',   value: t.bust,   unit: 'cm' },
                { label: 'Waist',  value: t.waist,  unit: 'cm' },
                { label: 'Hips',   value: t.hips,   unit: 'cm' },
              ].map(m => (
                <div key={m.label} className="rws-measure">
                  <span className="rws-measure-label">{m.label}</span>
                  <span className="rws-measure-value">
                    {m.value ?? '—'}
                    {m.value && <span className="rws-measure-unit">{m.unit}</span>}
                  </span>
                </div>
              ))}
            </div>

            {displayTags.length > 0 && (
              <div className="rws-tags">
                {displayTags.map(tag => <span key={tag} className="rws-tag">{tag}</span>)}
              </div>
            )}
          </div>

          {/* Portfolio */}
          <div className="rws-panel rws-panel--portfolio">
            <div className="rws-panel-head">
              <p className="rws-panel-section-title">Portfolio</p>
              <span className="rws-panel-head-meta"><Camera size={10} />{photos.length} images</span>
            </div>
            <div className="rws-portfolio">
              {photos.map((src, i) => (
                <motion.img
                  key={i}
                  src={src}
                  alt=""
                  className="rws-portfolio-img"
                  loading="lazy"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05, duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                  whileHover={{ scale: 1.03 }}
                />
              ))}
            </div>
          </div>

          {/* Notes */}
          {t.notes && (
            <div className="rws-panel rws-panel--notes">
              <p className="rws-panel-section-title">Agency Notes</p>
              <p className="rws-notes">{t.notes}</p>
            </div>
          )}

          {/* Casting Boards */}
          <div className="rws-panel rws-panel--boards">
            <div className="rws-panel-head">
              <p className="rws-panel-section-title">Casting Boards</p>
              <div className="rws-btn-wrap">
                <button
                  className="rws-boards-manage-btn"
                  onClick={() => setShowBoardPicker(v => !v)}
                >
                  <Layers size={10} />Manage
                </button>
                <AnimatePresence>
                  {showBoardPicker && (
                    <motion.div
                      className="rws-popover-wrap"
                      initial={{ opacity: 0, y: 4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.97 }}
                      transition={{ duration: 0.13 }}
                    >
                      <BoardPopover
                        currentBoards={boards}
                        onClose={() => setShowBoardPicker(false)}
                        onToggle={toggleBoard}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            {boards.length > 0 ? (
              <div className="rws-boards-list">
                {boards.map(board => (
                  <div key={board} className="rws-board-chip">
                    <span>{board}</span>
                    <button className="rws-board-remove" onClick={() => toggleBoard(board)}>
                      <X size={9} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rws-boards-empty">Not assigned to any active boards.</p>
            )}
          </div>
        </div>

        {/* ─── Col 3: Intelligence + metrics + activity ────── */}
        <div className="rws-col rws-col--intel">

          {/* Intelligence */}
          <div
            className={`rws-intel${cfg ? ' rws-intel--signal' : ''}`}
            style={cfg ? { '--intel-accent': cfg.accent, '--intel-bg': cfg.bg, '--intel-border': cfg.border } : {}}
          >
            <div className="rws-intel-head">
              <Sparkles size={11} className="rws-intel-spark" />
              <span className="rws-intel-label">Talent Intelligence</span>
            </div>
            {cfg && insight ? (
              <div className="rws-intel-body">
                <div className="rws-intel-bar" />
                <span className="rws-intel-type">{cfg.label}</span>
                <p className="rws-intel-signal-text">{insight.text}</p>
                <div className="rws-intel-action-block">
                  <span className="rws-intel-action-label">Suggested action</span>
                  <p className="rws-intel-action-text">{cfg.action}</p>
                </div>
                <button className="rws-intel-cta" onClick={() => navigate(cfg.route)}>
                  {cfg.cta} →
                </button>
              </div>
            ) : (
              <div className="rws-intel-empty">
                <span className="rws-intel-empty-title">No active signals</span>
                <p className="rws-intel-empty-text">
                  No outstanding signals for {t.name.split(' ')[0]} right now. The system monitors for booking gaps, profile gaps, and market opportunities.
                </p>
              </div>
            )}
          </div>

          {/* Booking metrics */}
          <div className="rws-panel">
            <p className="rws-panel-section-title">Booking Overview</p>
            <div className="rws-metrics">
              <div className="rws-metric">
                <span className="rws-metric-value">{fmtRelDate(t.lastBooking)}</span>
                <span className="rws-metric-label">Last Booking</span>
              </div>
              <div className="rws-metric">
                <span className="rws-metric-value rws-metric-value--num">{stats.total}</span>
                <span className="rws-metric-label">Total Bookings</span>
              </div>
              <div className="rws-metric">
                <span className="rws-metric-value rws-metric-value--currency">{fmtCurrency(stats.commission)}</span>
                <span className="rws-metric-label">Commission YTD</span>
              </div>
              <div className="rws-metric">
                <span className="rws-metric-value rws-metric-value--currency">{fmtCurrency(stats.dayRate)}</span>
                <span className="rws-metric-label">Day Rate</span>
              </div>
              <div className="rws-metric rws-metric--wide">
                <span className="rws-metric-value rws-metric-value--num">{stats.bookingRate}%</span>
                <span className="rws-metric-label">Booking Rate (submissions → booked)</span>
              </div>
            </div>
            <ProfileCompletionBar talent={t} />
          </div>

          {/* Activity */}
          <div className="rws-panel rws-panel--activity">
            <p className="rws-panel-section-title">Recent Activity</p>
            <div className="rws-timeline">
              {activity.map((item, i) => (
                <motion.div
                  key={i}
                  className={`rws-timeline-item rws-timeline-item--${item.type}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.07, duration: 0.25 }}
                >
                  <span className="rws-timeline-icon">{ACTIVITY_ICON[item.type]}</span>
                  <div className="rws-timeline-body">
                    <span className="rws-timeline-label">{item.label}</span>
                    <span className="rws-timeline-date">{fmtDate(item.date)}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </motion.div>
  );
}
