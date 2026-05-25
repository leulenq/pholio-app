import React from 'react';
import { Link } from 'react-router-dom';
import { Download, RefreshCw, Star } from 'lucide-react';
import { toast } from 'sonner';
import { talentApi } from '../api/talent';
import { TransferFailureNotice } from '../../../shared/components/states';
import './CompCard.css';

const THEMES = [
  { id: 'pholio-standard', name: 'Standard', bg: '#FAFAF8', text: '#1C1C1C', accent: '#C9A55A' },
  { id: 'classic-dark', name: 'Dark', bg: '#111111', text: '#F0EEE9', accent: '#C9A55A' },
  { id: 'studio-clean', name: 'Studio', bg: '#FFFFFF', text: '#1A1A1A', accent: '#2563EB' },
  { id: 'bold-editorial', name: 'Editorial', bg: '#F5F5F5', text: '#0A0A0A', accent: '#D4A017' },
];
const THEME_IDS = new Set(THEMES.map((t) => t.id));
const LAYOUTS = [
  { id: 'auto', name: 'Auto' },
  { id: 'editorial-balanced', name: 'Editorial' },
  { id: 'runway-split', name: 'Runway' },
  { id: 'mosaic-horizontal', name: 'Mosaic' },
];
const STAT_FIELDS = [
  { key: 'height_cm', blocking: true },
  { key: 'bust_cm', blocking: false, altKeys: ['measurements'] },
  { key: 'waist_cm', blocking: false, altKeys: ['measurements'] },
  { key: 'hips_cm', blocking: false, altKeys: ['measurements'] },
  { key: 'hair_color', blocking: false },
  { key: 'eye_color', blocking: false },
];
const MAX_SUPPORT = 4;

function getImageUrl(value) {
  if (!value || typeof value !== 'string') return '';
  const t = value.trim();
  if (!t) return '';
  if (t.startsWith('http://') || t.startsWith('https://')) return t;
  if (t.startsWith('/') && !t.startsWith('//')) return t;
  return `/uploads/${t.replace(/^\/+/, '')}`;
}
function imageId(img) {
  const raw = img?.id ?? img?.image_id ?? img?.uuid ?? null;
  return raw === null || raw === undefined ? null : String(raw).trim() || null;
}
function nextSeed() {
  return `manual:${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}
function buildParams({ theme, seed, layoutFamily, lockHeroId, lockGridIds }) {
  const p = new URLSearchParams();
  if (theme) p.set('theme', theme);
  if (seed) p.set('seed', seed);
  if (layoutFamily && layoutFamily !== 'auto') p.set('layoutFamily', layoutFamily);
  if (lockHeroId) p.set('lockHeroId', lockHeroId);
  if (Array.isArray(lockGridIds) && lockGridIds.some(Boolean)) p.set('lockGridIds', lockGridIds.filter(Boolean).join(','));
  return p.toString();
}
function initialTheme(profile) {
  const t = profile?.pdf_theme;
  return t && THEME_IDS.has(t) ? t : 'pholio-standard';
}

export default function CompCard({ images = [], profile }) {
  const slug = profile?.slug;
  const isPro = !!profile?.is_pro;

  const [theme, setTheme] = React.useState(() => initialTheme(profile));
  const [seed, setSeed] = React.useState('profile:preview');
  const [layoutFamily, setLayoutFamily] = React.useState('auto');
  const [leadId, setLeadId] = React.useState(null);
  const [supportIds, setSupportIds] = React.useState([]);
  const [iframeReady, setIframeReady] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState(null);
  const [savingTheme, setSavingTheme] = React.useState(false);

  // Re-init theme only when the persisted pdf_theme changes; intentionally not depending on full profile.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { setTheme(initialTheme(profile)); }, [profile?.pdf_theme]);
  React.useEffect(() => { if (slug) setSeed(`profile:${slug}`); }, [slug]);

  const statResults = STAT_FIELDS.map((f) => {
    let ok = !!profile?.[f.key];
    if (!ok && f.altKeys) ok = f.altKeys.some((k) => !!profile?.[k]);
    return { ...f, ok };
  });
  const isBlocked = statResults.some((s) => s.blocking && !s.ok);
  const warnCount = statResults.filter((s) => !s.blocking && !s.ok).length;
  const statusTone = isBlocked ? 'blocked' : warnCount > 0 ? 'warning' : 'ready';
  const statusLabel = isBlocked ? 'Needs height' : warnCount > 0 ? `${warnCount} optional ${warnCount === 1 ? 'field' : 'fields'} open` : 'Ready';

  const queryString = buildParams({ theme, seed, layoutFamily, lockHeroId: leadId, lockGridIds: supportIds });
  const previewUrl = slug ? `/pdf/view/${slug}?${queryString}` : null;
  React.useEffect(() => { setIframeReady(false); }, [previewUrl]);

  const isAuto = !leadId && supportIds.length === 0;

  function toggleSupport(id) {
    if (id === leadId) return;
    setSupportIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SUPPORT) { toast.error(`Up to ${MAX_SUPPORT} supporting frames`); return prev; }
      return [...prev, id];
    });
  }
  function setLead(id) {
    setSupportIds((prev) => prev.filter((x) => x !== id));
    setLeadId((prev) => (prev === id ? null : id));
  }
  function resetAuto() { setLeadId(null); setSupportIds([]); }

  async function handleThemeChange(id) {
    setTheme(id);
    if (!isPro) return;
    setSavingTheme(true);
    try { await talentApi.updatePdfCustomization({ theme: id }); }
    catch (err) { toast.error(err?.message || 'Failed to save theme'); }
    finally { setSavingTheme(false); }
  }

  async function handleDownload() {
    if (!slug || isBlocked) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(`/pdf/${slug}?${queryString}&download=1`, { credentials: 'include' });
      if (!res.ok) {
        let message = 'Failed to generate comp card PDF.';
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) { const p = await res.json().catch(() => null); message = p?.message || p?.error || message; }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `pholio-${slug}-compcard.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err?.message || 'Failed to download comp card. Please try again.';
      setDownloadError(message); toast.error(message);
    } finally { setDownloading(false); }
  }

  const frames = (images || []).map((img) => ({ id: imageId(img), url: getImageUrl(img.public_url || img.path) })).filter((f) => f.id);

  return (
    <div className="cc-root">
      <div className="cc-head">
        <div className="cc-head__copy">
          <span className="mw-kicker">II — Comp card</span>
          <h2 className="mw-h2">Comp card</h2>
          <p className="mw-sub">A two-sided 5.5 × 8.5 card, composed from your frames.</p>
        </div>
        <span className={`cc-status cc-status--${statusTone}`}>
          <span className="cc-status__dot" aria-hidden="true" /> {statusLabel}
        </span>
      </div>

      {downloadError && (
        <TransferFailureNotice title="Download interrupted" body={downloadError}
          retry={{ label: 'Retry download', onClick: handleDownload }} />
      )}

      <div className="cc-layout">
        <div>
          <div className="cc-preview-card">
            <div className="cc-preview-wrap">
              {previewUrl ? (
                <>
                  {!iframeReady && <div className="cc-preview-loader">Loading…</div>}
                  <iframe src={previewUrl} title="Comp card preview" className="cc-preview-iframe" onLoad={() => setIframeReady(true)} />
                </>
              ) : (
                <div className="cc-preview-empty">Complete your profile to see a preview</div>
              )}
            </div>
          </div>
          <p className="cc-preview-caption">5.5 × 8.5 · Two-sided PDF</p>
        </div>

        <div className="cc-controls">
          <div className="cc-control">
            <div className="cc-control__head">
              <span className="cc-control__label">Composition</span>
              <button type="button" className="cc-text-btn" onClick={() => setSeed(nextSeed())} title="Try a fresh auto composition">
                <RefreshCw size={13} aria-hidden="true" /> Shuffle
              </button>
            </div>
            <div className="cc-strip" role="group" aria-label="Choose lead and supporting frames">
              {frames.map((f) => {
                const isLead = f.id === leadId;
                const isSupport = supportIds.includes(f.id);
                const cls = ['cc-chip', isLead ? 'cc-chip--lead' : '', isSupport ? 'cc-chip--support' : ''].filter(Boolean).join(' ');
                return (
                  <div key={f.id} className={cls}>
                    <button type="button" className="cc-chip__btn"
                      onClick={() => toggleSupport(f.id)} aria-pressed={isSupport}
                      title={isSupport ? 'Remove supporting frame' : 'Add supporting frame'}>
                      <img src={f.url} alt="" />
                    </button>
                    {isLead && <span className="cc-chip__role">Lead</span>}
                    {isSupport && !isLead && <span className="cc-chip__role">S</span>}
                    <button type="button" className={`cc-chip__star ${isLead ? 'cc-chip__star--on' : ''}`}
                      onClick={() => setLead(f.id)} aria-pressed={isLead} title="Set as lead frame">
                      <Star size={11} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="cc-hint">
              {isAuto ? 'Auto-composed. Tap a frame to add it, ★ to set the lead.' : (
                <button type="button" className="cc-text-btn" onClick={resetAuto}>Reset to auto</button>
              )}
            </p>
          </div>

          <div className="cc-control">
            <span className="cc-control__label">Layout</span>
            <div className="cc-seg" role="group" aria-label="Layout family">
              {LAYOUTS.map((l) => (
                <button key={l.id} type="button"
                  className={`cc-seg__btn ${layoutFamily === l.id ? 'cc-seg__btn--active' : ''}`}
                  aria-pressed={layoutFamily === l.id} onClick={() => setLayoutFamily(l.id)}>
                  {l.name}
                </button>
              ))}
            </div>
          </div>

          <div className="cc-control">
            <div className="cc-control__head">
              <span className="cc-control__label">Finish</span>
              {isPro && savingTheme && <span className="cc-hint">Saving…</span>}
            </div>
            {isPro ? (
              <div className="cc-themes">
                {THEMES.map((t) => (
                  <button key={t.id} type="button"
                    className={`cc-theme ${theme === t.id ? 'cc-theme--active' : ''}`}
                    aria-pressed={theme === t.id} onClick={() => handleThemeChange(t.id)} title={t.name}>
                    <span className="cc-theme__swatches" aria-hidden="true">
                      <span className="cc-theme__sw" style={{ background: t.bg }} />
                      <span className="cc-theme__sw" style={{ background: t.text }} />
                      <span className="cc-theme__sw" style={{ background: t.accent }} />
                    </span>
                    <span className="cc-theme__name">{t.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="cc-pro-hint">
                <Link to="/pricing" className="cc-pill-studio">Studio+</Link> unlocks curated themes.
              </p>
            )}
          </div>

          <div className="cc-control">
            {isBlocked && <Link to="/dashboard/talent/profile" className="cc-unlock">Add height to unlock downloads</Link>}
            <button type="button" className="mw-btn-gold cc-download" onClick={handleDownload}
              disabled={downloading || isBlocked || !slug}
              title={isBlocked ? 'Add height to unlock downloads' : 'Download PDF comp card'}>
              {downloading ? <><span className="cc-spinner" aria-hidden="true" /> Generating…</> : <><Download size={14} aria-hidden="true" /> Download PDF</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
