import React, { useMemo, useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronLeft, MessageSquare, MoreHorizontal,
  MapPin, Mail, Phone, Sparkles, Clock, Camera, Calendar,
  Copy, ExternalLink, FileText, Instagram, Globe,
} from 'lucide-react';
import { TypeSpec, AvailabilityCell, getState } from '../components/status';
import { fetchRosterProfile } from '../api/agency';
import './RosterWorkspace.css';

// ── Constants ──────────────────────────────────────────────────

// Insight styling — only used when a real insight is supplied. RosterPage no
// longer synthesises insights, so `insight` is null today and the panel below
// renders nothing; the config stays so a future real signal source lights it up.
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

const SOCIAL_ICON = { instagram: Instagram };

// ── Helpers ────────────────────────────────────────────────────

function fmtDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtRelDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}wk ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function fmtCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function imageSrc(img) {
  return img?.public_url || img?.path || null;
}

// ── Sub-components ─────────────────────────────────────────────

function ProfileCompletionBar({ talent }) {
  const fields = [talent.email, talent.phone, talent.location, talent.height, talent.bust, talent.waist, talent.hips, talent.notes, talent.img, talent.tags?.length];
  const filled = fields.filter(Boolean).length;
  const pct    = Math.round((filled / fields.length) * 100);
  const color  = pct >= 80 ? 'var(--ag-success)' : pct >= 50 ? 'var(--ag-gold)' : 'var(--ag-danger)';
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

function MoreDropdown({ talent, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div className="rws-more-menu" ref={ref}>
      <button
        className="rws-more-item"
        disabled={!talent.email}
        onClick={() => { navigator.clipboard.writeText(talent.email || ''); toast.success('Email copied'); onClose(); }}
      >
        <Copy size={13} />Copy email
      </button>
      <button className="rws-more-item" onClick={() => { window.open(`/talent/${talent.id}`, '_blank'); onClose(); }}>
        <ExternalLink size={13} />View portfolio
      </button>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────

export default function RosterWorkspace({ talent: t, insight, onBack }) {
  const navigate = useNavigate();
  const cfg = insight ? INTEL_CFG[insight.type] : null;

  const [showMore, setShowMore] = useState(false);
  const moreBtnRef = useRef(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['roster-profile', t.id],
    queryFn: () => fetchRosterProfile(t.id),
    staleTime: 30000,
    enabled: !!t.id,
  });

  const profile  = data?.profile || null;
  const bookings = data?.bookings || null;
  const photos   = useMemo(() => (profile?.images || []).map(imageSrc).filter(Boolean), [profile]);
  const socials  = useMemo(() => (profile?.social || []).filter((s) => s && s.handle), [profile]);
  const bio      = profile?.bio_curated || t.notes || null;

  const displayTags = useMemo(
    () => (t.tags || []).filter((tag) => tag.toLowerCase() !== (t.type || '').toLowerCase()),
    [t.tags, t.type]
  );

  const hasBookingData = bookings && (bookings.total_bookings != null || bookings.commission_earned != null || bookings.last_booking_date != null);

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
          <TypeSpec type={t.type} />
          {t.status && <AvailabilityCell status={t.status} sm />}
          {cfg && insight && (
            <span className="rws-nav-signal" style={{ color: cfg.accent, borderColor: cfg.accent }}>
              {cfg.label}
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
              onClick={() => setShowMore((v) => !v)}
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
                  <MoreDropdown talent={t} onClose={() => setShowMore(false)} />
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
            {t.img
              ? <img src={t.img} alt={t.name} className="rws-photo" />
              : <div className="rws-photo rws-photo--fallback"><Camera size={26} /></div>}
            <div className="rws-photo-shade" />
            <div className="rws-photo-status-bar" style={{ background: getState(t.status).c }} />
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
            {t.location && (
              <div className="rws-contact-row">
                <MapPin size={12} className="rws-contact-icon" />
                <span>{t.location}</span>
              </div>
            )}
            {t.dateAdded && (
              <div className="rws-contact-row">
                <Clock size={12} className="rws-contact-icon" />
                <span>Joined {fmtDate(t.dateAdded)}</span>
              </div>
            )}
            {socials.map((s) => {
              const Icon = SOCIAL_ICON[String(s.platform || '').toLowerCase()] || Globe;
              const label = s.handle?.startsWith('@') ? s.handle : `@${s.handle}`;
              return s.url ? (
                <a key={`${s.platform}-${s.handle}`} href={s.url} target="_blank" rel="noreferrer" className="rws-contact-social">
                  <Icon size={10} className="rws-contact-social-icon" />
                  <span>{label}</span>
                </a>
              ) : (
                <div key={`${s.platform}-${s.handle}`} className="rws-contact-social">
                  <Icon size={10} className="rws-contact-social-icon" />
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Col 2: Identity + portfolio + bio ─── */}
        <div className="rws-col rws-col--center">

          {/* Identity */}
          <div className="rws-panel">
            <p className="rws-panel-section-title">Profile</p>
            <div className="rws-panel-name-row">
              <h2 className="rws-panel-name">{t.name}</h2>
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
              ].map((m) => (
                <div key={m.label} className="rws-measure">
                  <span className="rws-measure-label">{m.label}</span>
                  <span className="rws-measure-value">
                    {m.value || '—'}
                    {m.value ? <span className="rws-measure-unit">{m.unit}</span> : null}
                  </span>
                </div>
              ))}
            </div>

            {displayTags.length > 0 && (
              <div className="rws-tags">
                {displayTags.map((tag) => <span key={tag} className="rws-tag">{tag}</span>)}
              </div>
            )}
          </div>

          {/* Portfolio */}
          <div className="rws-panel rws-panel--portfolio">
            <div className="rws-panel-head">
              <p className="rws-panel-section-title">Portfolio</p>
              {!isLoading && photos.length > 0 && (
                <span className="rws-panel-head-meta"><Camera size={10} />{photos.length} images</span>
              )}
            </div>
            {isLoading ? (
              <div className="rws-portfolio">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="rws-portfolio-skel" />)}
              </div>
            ) : photos.length > 0 ? (
              <div className="rws-portfolio">
                {photos.map((src, i) => (
                  <motion.img
                    key={src}
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
            ) : (
              <p className="rws-boards-empty">No portfolio images yet.</p>
            )}
          </div>

          {/* Bio */}
          {bio && (
            <div className="rws-panel rws-panel--notes">
              <p className="rws-panel-section-title">Bio</p>
              <p className="rws-notes">{bio}</p>
            </div>
          )}
        </div>

        {/* ─── Col 3: Intelligence (if any) + booking metrics ────── */}
        <div className="rws-col rws-col--intel">

          {/* Intelligence — only rendered when a real insight is supplied */}
          {cfg && insight && (
            <div
              className="rws-intel rws-intel--signal"
              style={{ '--intel-accent': cfg.accent, '--intel-bg': cfg.bg, '--intel-border': cfg.border }}
            >
              <div className="rws-intel-head">
                <Sparkles size={11} className="rws-intel-spark" />
                <span className="rws-intel-label">Talent Intelligence</span>
              </div>
              <div className="rws-intel-body">
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
            </div>
          )}

          {/* Booking metrics — real commission data from the roster profile API */}
          <div className="rws-panel">
            <p className="rws-panel-section-title">Booking Overview</p>
            {isError ? (
              <button className="rws-retry" onClick={() => refetch()}>Booking data failed to load — retry</button>
            ) : (
              <>
                <div className="rws-metrics">
                  <div className="rws-metric">
                    <span className="rws-metric-value">{fmtRelDate(bookings?.last_booking_date || t.lastBooking)}</span>
                    <span className="rws-metric-label">Last Booking</span>
                  </div>
                  <div className="rws-metric">
                    <span className="rws-metric-value rws-metric-value--num">
                      {bookings?.total_bookings != null ? bookings.total_bookings : '—'}
                    </span>
                    <span className="rws-metric-label">Total Bookings</span>
                  </div>
                  <div className="rws-metric rws-metric--wide">
                    <span className="rws-metric-value rws-metric-value--currency">
                      {bookings?.commission_earned != null ? fmtCurrency(bookings.commission_earned) : '—'}
                    </span>
                    <span className="rws-metric-label">Commission Earned</span>
                  </div>
                </div>
                {!isLoading && !hasBookingData && (
                  <p className="rws-boards-empty">No bookings recorded for this talent yet.</p>
                )}
              </>
            )}
            <ProfileCompletionBar talent={t} />
          </div>

        </div>
      </div>
    </motion.div>
  );
}
