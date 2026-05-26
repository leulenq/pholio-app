import React from 'react';
import { Link } from 'react-router-dom';
import {
  Download, RefreshCw, Check, Lock, Sparkles,
  LayoutPanelTop, Columns3, LayoutGrid, RotateCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { talentApi } from '../api/talent';
import { TransferFailureNotice } from '../../../shared/components/states';
import './CompCard.css';

// One PDF "page" at 96dpi: 5.5in × 8.5in. The /pdf/view doc stacks two pages.
const PAGE_W = 528;
const PAGE_H = 816;

const THEMES = [
  { id: 'pholio-standard', name: 'Standard', bg: '#FAFAF8', text: '#1C1C1C', accent: '#C9A55A' },
  { id: 'classic-dark', name: 'Dark', bg: '#111111', text: '#F0EEE9', accent: '#C9A55A' },
  { id: 'studio-clean', name: 'Studio', bg: '#FFFFFF', text: '#1A1A1A', accent: '#2563EB' },
  { id: 'bold-editorial', name: 'Editorial', bg: '#F5F5F5', text: '#0A0A0A', accent: '#D4A017' },
];
const THEME_IDS = new Set(THEMES.map((t) => t.id));
const LAYOUTS = [
  { id: 'auto', name: 'Auto', Icon: Sparkles },
  { id: 'editorial-balanced', name: 'Editorial', Icon: LayoutPanelTop },
  { id: 'runway-split', name: 'Runway', Icon: Columns3 },
  { id: 'mosaic-horizontal', name: 'Mosaic', Icon: LayoutGrid },
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
  const [side, setSide] = React.useState('front');
  const [frontReady, setFrontReady] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState(null);
  const [savingTheme, setSavingTheme] = React.useState(false);

  const cardRef = React.useRef(null);

  // Re-init theme only when the persisted pdf_theme changes; intentionally not depending on full profile.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { setTheme(initialTheme(profile)); }, [profile?.pdf_theme]);
  React.useEffect(() => { if (slug) setSeed(`profile:${slug}`); }, [slug]);

  // Scale the (fixed-size) rendered card document to fit the card frame.
  React.useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const apply = () => {
      const w = el.clientWidth;
      if (w > 0) el.style.setProperty('--cc-scale', String(w / PAGE_W));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  React.useEffect(() => { setFrontReady(false); }, [previewUrl]);

  const isAuto = !leadId && supportIds.length === 0;
  const flipped = side === 'back';
  const flip = () => setSide((s) => (s === 'front' ? 'back' : 'front'));

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

  const frames = (images || [])
    .map((img) => ({ id: imageId(img), url: getImageUrl(img.public_url || img.path) }))
    .filter((f) => f.id);

  return (
    <div className="cc-root">
      <header className="cc-head">
        <div className="cc-head__copy">
          <span className="mw-kicker">II — The Book</span>
          <h2 className="mw-h2">Comp card</h2>
          <p className="mw-sub">A two-sided 5.5 × 8.5 card, composed from your frames.</p>
        </div>
        <span className={`cc-status cc-status--${statusTone}`}>
          <span className="cc-status__dot" aria-hidden="true" /> {statusLabel}
        </span>
      </header>

      {downloadError && (
        <TransferFailureNotice title="Download interrupted" body={downloadError}
          retry={{ label: 'Retry download', onClick: handleDownload }} />
      )}

      <div className="cc-stage">
        {/* ── The card object ── */}
        <div className="cc-showcase">
          <div
            className="cc-card"
            data-flipped={flipped ? 'true' : 'false'}
            ref={cardRef}
            onClick={previewUrl ? flip : undefined}
            title={previewUrl ? 'Flip the card' : undefined}
          >
            {previewUrl ? (
              <div className="cc-card__flip">
                <div className="cc-card__face cc-card__face--front">
                  <div className="cc-card__clip">
                    <div className="cc-frame">
                      <iframe
                        src={previewUrl}
                        title="Comp card — front"
                        scrolling="no"
                        tabIndex={-1}
                        onLoad={() => setFrontReady(true)}
                      />
                    </div>
                  </div>
                </div>
                <div className="cc-card__face cc-card__face--back">
                  <div className="cc-card__clip">
                    <div className="cc-frame cc-frame--back">
                      <iframe
                        src={previewUrl}
                        title="Comp card — back"
                        scrolling="no"
                        tabIndex={-1}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="cc-card__empty">Complete your profile to see a preview</div>
            )}
            {previewUrl && !frontReady && <div className="cc-card__loader" aria-hidden="true" />}
          </div>

          <div className="cc-showcase__foot">
            <div className="cc-sideswitch" role="group" aria-label="Show card side">
              <button type="button" className={`cc-sideswitch__btn ${!flipped ? 'is-active' : ''}`}
                aria-pressed={!flipped} onClick={() => setSide('front')}>Front</button>
              <button type="button" className={`cc-sideswitch__btn ${flipped ? 'is-active' : ''}`}
                aria-pressed={flipped} onClick={() => setSide('back')}>Back</button>
            </div>
            <span className="cc-showcase__meta">5.5 × 8.5 · Two-sided PDF</span>
          </div>
        </div>

        {/* ── Curated stages ── */}
        <div className="cc-panel">
          <section className="cc-stage-block">
            <header className="cc-stage-head">
              <span className="cc-stage-no">01</span>
              <h3 className="cc-stage-title">Composition</h3>
              <button type="button" className="cc-ghost-btn" onClick={() => setSeed(nextSeed())} title="Try a fresh auto composition">
                <RefreshCw size={13} aria-hidden="true" /> Shuffle
              </button>
            </header>
            {frames.length > 0 ? (
              <>
                <div className="cc-strip" role="group" aria-label="Choose lead and supporting frames">
                  {frames.map((f) => {
                    const isLead = f.id === leadId;
                    const isSupport = supportIds.includes(f.id);
                    const cls = ['cc-th', isLead ? 'is-lead' : '', isSupport ? 'is-support' : ''].filter(Boolean).join(' ');
                    return (
                      <div key={f.id} className={cls}>
                        <button type="button" className="cc-th__img"
                          onClick={() => toggleSupport(f.id)} aria-pressed={isSupport}
                          title={isSupport ? 'Remove supporting frame' : 'Add as supporting frame'}>
                          <img src={f.url} alt="" />
                        </button>
                        <button type="button" className="cc-th__lead"
                          onClick={() => setLead(f.id)} aria-pressed={isLead}
                          title={isLead ? 'Lead frame' : 'Set as lead frame'}>
                          {isLead ? 'Lead' : 'Set lead'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="cc-stage-note">
                  {isAuto ? 'Auto-composed from your strongest frames.' : (
                    <button type="button" className="cc-link-btn" onClick={resetAuto}>Reset to auto</button>
                  )}
                </p>
              </>
            ) : (
              <p className="cc-stage-note">Add frames above to compose the card.</p>
            )}
          </section>

          <section className="cc-stage-block">
            <header className="cc-stage-head">
              <span className="cc-stage-no">02</span>
              <h3 className="cc-stage-title">Layout</h3>
            </header>
            <div className="cc-segment" role="group" aria-label="Layout family">
              {LAYOUTS.map(({ id, name, Icon }) => (
                <button key={id} type="button"
                  className={`cc-segment__btn ${layoutFamily === id ? 'is-active' : ''}`}
                  aria-pressed={layoutFamily === id} onClick={() => setLayoutFamily(id)}>
                  <Icon size={16} aria-hidden="true" strokeWidth={1.6} />
                  <span>{name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="cc-stage-block">
            <header className="cc-stage-head">
              <span className="cc-stage-no">03</span>
              <h3 className="cc-stage-title">Finish</h3>
              {isPro && savingTheme && <span className="cc-saving">Saving…</span>}
            </header>
            {isPro ? (
              <div className="cc-finishes" role="group" aria-label="Card finish">
                {THEMES.map((t) => (
                  <button key={t.id} type="button"
                    className={`cc-finish ${theme === t.id ? 'is-active' : ''}`}
                    aria-pressed={theme === t.id} onClick={() => handleThemeChange(t.id)} title={t.name}>
                    <span className="cc-finish__chip" style={{ background: t.bg }} aria-hidden="true">
                      <span className="cc-finish__bar" style={{ background: t.accent }} />
                      <span className="cc-finish__line" style={{ background: t.text }} />
                      <span className="cc-finish__line cc-finish__line--short" style={{ background: t.text }} />
                      {theme === t.id && <span className="cc-finish__check"><Check size={13} aria-hidden="true" /></span>}
                    </span>
                    <span className="cc-finish__name">{t.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="cc-locked">
                <span className="cc-locked__icon" aria-hidden="true"><Lock size={14} /></span>
                <p>Curated finishes are a <Link to="/pricing" className="cc-pill-studio">Studio+</Link> feature.</p>
              </div>
            )}
          </section>

          <div className="cc-download-row">
            <button type="button" className="mw-btn-gold cc-download" onClick={handleDownload}
              disabled={downloading || isBlocked || !slug}
              title={isBlocked ? 'Add height to unlock downloads' : 'Download PDF comp card'}>
              {downloading ? <><span className="cc-spinner" aria-hidden="true" /> Generating…</> : <><Download size={15} aria-hidden="true" /> Download PDF</>}
            </button>
            {isBlocked && <Link to="/dashboard/talent/profile" className="cc-unlock">Add height to unlock</Link>}
            {!isBlocked && (
              <button type="button" className="cc-link-btn cc-flip-hint" onClick={previewUrl ? flip : undefined} disabled={!previewUrl}>
                <RotateCw size={13} aria-hidden="true" /> Flip card
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
