import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Download, CheckCircle, AlertCircle, XCircle, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/hooks/useAuth';
import { talentApi } from '../api/talent';
import './CompCardPreview.css';

// ─── Pro theme options ────────────────────────────────────────
const PRO_THEMES = [
  { id: 'pholio-standard', name: 'Standard',       bg: '#FAFAF8', text: '#1C1C1C', accent: '#C9A55A' },
  { id: 'classic-dark',    name: 'Dark',            bg: '#111111', text: '#F0EEE9', accent: '#C9A55A' },
  { id: 'studio-clean',    name: 'Studio',          bg: '#FFFFFF', text: '#1A1A1A', accent: '#2563EB' },
  { id: 'bold-editorial',  name: 'Editorial',       bg: '#F5F5F5', text: '#0A0A0A', accent: '#D4A017' },
];

const PRO_THEME_IDS = new Set(PRO_THEMES.map((t) => t.id));

function initialThemeFromProfile(profile) {
  const t = profile?.pdf_theme;
  if (t && PRO_THEME_IDS.has(t)) return t;
  return 'pholio-standard';
}

// ─── Stats fields ─────────────────────────────────────────────
const STAT_FIELDS = [
  { key: 'height_cm',  label: 'Height',      blocking: true },
  { key: 'bust_cm',    label: 'Bust',        blocking: false, altKeys: ['measurements'] },
  { key: 'waist_cm',   label: 'Waist',       blocking: false, altKeys: ['measurements'] },
  { key: 'hips_cm',    label: 'Hips',        blocking: false, altKeys: ['measurements'] },
  { key: 'hair_color', label: 'Hair',        blocking: false },
  { key: 'eye_color',  label: 'Eyes',        blocking: false },
];

// ─── Role colours ─────────────────────────────────────────────
const ROLE_SLOTS = [
  { role: 'headshot',  label: 'Headshot',  color: '#C9A55A' },
  { role: 'full_body', label: 'Full Body', color: '#2563EB' },
  { role: 'editorial', label: 'Editorial', color: '#7C3AED' },
  { role: 'lifestyle', label: 'Lifestyle', color: '#059669' },
];

function getImageUrl(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return `/uploads/${trimmed.replace(/^\/+/, '')}`;
}

function parseRole(img) {
  if (img?.shot_type && ROLE_SLOTS.some((slot) => slot.role === img.shot_type)) {
    return img.shot_type;
  }
  if (img?.style_type && ROLE_SLOTS.some((slot) => slot.role === img.style_type)) {
    return img.style_type;
  }
  try {
    const m = typeof img.metadata === 'string' ? JSON.parse(img.metadata) : img.metadata;
    return m?.role || null;
  } catch { return null; }
}

export default function CompCardPreview({ images }) {
  const { profile } = useAuth();
  const slug      = profile?.slug;
  const isPro     = !!profile?.is_pro;
  const persistedTheme = profile?.pdf_theme;

  const [selectedTheme, setSelectedTheme] = useState(() =>
    initialThemeFromProfile(profile)
  );
  const [savingTheme,   setSavingTheme]   = useState(false);
  const [downloading,   setDownloading]   = useState(false);
  const [iframeReady,   setIframeReady]   = useState(false);
  const iframeRef = useRef(null);

  // Stats completeness
  const statResults = STAT_FIELDS.map(f => {
    let ok = !!profile?.[f.key];
    if (!ok && f.altKeys) ok = f.altKeys.some(k => !!profile?.[k]);
    return { ...f, ok };
  });
  const isBlocked = statResults.some(s => s.blocking && !s.ok);
  const warnCount = statResults.filter(s => !s.blocking && !s.ok).length;

  // Image roles summary
  const roleMap = {};
  (images || []).forEach(img => {
    const r = parseRole(img);
    if (r && !roleMap[r]) roleMap[r] = img;
  });

  // Preview URL
  const previewUrl = slug
    ? `/pdf/view/${slug}?theme=${selectedTheme}`
    : null;

  useEffect(() => {
    if (persistedTheme && PRO_THEME_IDS.has(persistedTheme)) {
      setSelectedTheme(persistedTheme);
      return;
    }
    setSelectedTheme('pholio-standard');
  }, [persistedTheme]);

  useEffect(() => {
    setIframeReady(false);
  }, [previewUrl]);

  // ─── Download ─────────────────────────────────────────────
  async function handleDownload() {
    if (!slug || isBlocked) return;
    setDownloading(true);
    try {
      const res = await fetch(`/pdf/${slug}?theme=${selectedTheme}&download=1`, { credentials: 'include' });
      if (!res.ok) throw new Error('PDF generation failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `pholio-${slug}-compcard.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      toast.error('Failed to download comp card. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  // ─── Theme change (Pro) ────────────────────────────────────
  async function handleThemeChange(id) {
    setSelectedTheme(id);
    if (!isPro) return;
    setSavingTheme(true);
    try {
      await talentApi.updatePdfCustomization({ theme: id });
    } catch (err) {
      console.error('Theme save failed:', err);
      toast.error('Failed to save theme. Please try again.');
    } finally {
      setSavingTheme(false);
    }
    if (iframeRef.current) {
      setIframeReady(false);
      iframeRef.current.src = `/pdf/view/${slug}?theme=${id}`;
    }
  }

  return (
    <div className="ccp-root">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="ccp-header">
        <div>
          <h3 className="ccp-title">Comp Card</h3>
          <p className="ccp-subtitle">5.5″ × 8.5″ · 2 pages</p>
        </div>
        {warnCount > 0 && (
          <span className="ccp-warn-chip">
            {warnCount} field{warnCount > 1 ? 's' : ''} missing
          </span>
        )}
      </div>

      {/* ── iframe preview ──────────────────────────────────── */}
      <div className="ccp-preview-wrap">
        {previewUrl ? (
          <>
            {!iframeReady && <div className="ccp-preview-loader">Loading…</div>}
            <iframe
              ref={iframeRef}
              src={previewUrl}
              className="ccp-preview-iframe"
              title="Comp card preview"
              onLoad={() => setIframeReady(true)}
            />
          </>
        ) : (
          <div className="ccp-preview-empty">
            Complete your profile to see a preview
          </div>
        )}
      </div>

      {/* ── Download ────────────────────────────────────────── */}
      <div className="ccp-download-row">
        <button
          className="ccp-download-btn"
          onClick={handleDownload}
          disabled={downloading || isBlocked || !slug}
          title={isBlocked ? 'Add height to unlock downloads' : 'Download PDF comp card'}
        >
          {downloading ? (
            <><span className="ccp-spinner" />Generating…</>
          ) : (
            <><Download size={13} />Download PDF</>
          )}
        </button>
        {isBlocked && (
          <Link to="/dashboard/talent/profile" className="ccp-unlock-hint">
            Add height →
          </Link>
        )}
      </div>

      {/* ── Stats completeness ──────────────────────────────── */}
      <div className="ccp-section">
        <div className="ccp-section-label">Stats</div>
        <div className="ccp-stats-list">
          {statResults.map(s => {
            const Icon = s.ok ? CheckCircle : s.blocking ? XCircle : AlertCircle;
            const cls  = s.ok ? 'ok' : s.blocking ? 'err' : 'warn';
            return (
              <div key={s.key} className="ccp-stat-row">
                <Icon size={11} className={`ccp-stat-icon ccp-stat-icon--${cls}`} />
                <span className={`ccp-stat-label ${s.ok ? '' : 'ccp-stat-label--dim'}`}>{s.label}</span>
                {!s.ok && (
                  <Link to="/dashboard/talent/profile" className="ccp-stat-add">Add →</Link>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Image roles ─────────────────────────────────────── */}
      <div className="ccp-section">
        <div className="ccp-section-label">Roles</div>
        <div className="ccp-roles-row">
          {ROLE_SLOTS.map(slot => {
            const img = roleMap[slot.role];
            return (
              <div key={slot.role} className="ccp-role-slot" title={slot.label}>
                {img ? (
                  <>
                    <img src={getImageUrl(img.public_url || img.path)} alt={slot.label} className="ccp-role-img" loading="lazy" />
                    <div className="ccp-role-badge" style={{ background: slot.color }}>
                      {slot.label.charAt(0)}
                    </div>
                  </>
                ) : (
                  <div className="ccp-role-empty" style={{ borderColor: slot.color + '55' }}>
                    <span style={{ color: slot.color, opacity: 0.5, fontSize: 14 }}>+</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="ccp-roles-hint">
          Tag photos using the edit icon on each image.
        </p>
      </div>

      {/* ── Theme (Pro) ──────────────────────────────────────── */}
      <div className="ccp-section">
        <div className="ccp-section-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Palette size={11} aria-hidden="true" />
          Theme
          {isPro && savingTheme && <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#9ca3af' }}>Saving…</span>}
        </div>
        {isPro ? (
          <div className="ccp-themes-row">
            {PRO_THEMES.map(t => (
              <button
                key={t.id}
                className={`ccp-theme-btn ${selectedTheme === t.id ? 'ccp-theme-btn--active' : ''}`}
                onClick={() => handleThemeChange(t.id)}
                title={t.name}
              >
                <div className="ccp-theme-swatches">
                  <div className="ccp-swatch" style={{ background: t.bg,     border: '1px solid #ccc' }} />
                  <div className="ccp-swatch" style={{ background: t.text                              }} />
                  <div className="ccp-swatch" style={{ background: t.accent                            }} />
                </div>
                <span className="ccp-theme-name">{t.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="ccp-pro-hint">
            <Link to="/pricing">Upgrade to Pro</Link> to unlock 4 curated themes.
          </p>
        )}
      </div>

    </div>
  );
}
