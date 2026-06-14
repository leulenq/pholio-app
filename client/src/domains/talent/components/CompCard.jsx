import React from 'react';
import { Link } from 'react-router-dom';
import { Download, RefreshCw, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { TransferFailureNotice } from '../../../shared/components/states';
import './CompCard.css';

// One PDF "page" at 96dpi: 5.5in × 8.5in. The /pdf/view doc stacks two pages.
const PAGE_W = 528;

// The composition engine designs each card itself — the only direction a
// talent gives is "show me another take" (a fresh seed). Voice names mirror
// the engine's typography library.
const VOICE_LABELS = {
  'stark-grotesque': 'Stark Grotesque',
  'editorial-serif': 'Editorial Serif',
  'romantic-didone': 'Romantic Didone',
  'quiet-classic': 'Quiet Classic',
  'modern-warm': 'Modern Warm',
  'bold-grotesque': 'Bold Grotesque',
  'hairline-fashion': 'Hairline Fashion',
};

// Engine warnings → talent-facing refinement notes. Internal telemetry
// (matting, fallbacks) stays internal.
const SUGGESTIONS = [
  [/full[- ]?(body|length)/i, 'Add a full-length photo — casting directors expect one on every card.'],
  [/no headshot/i, 'Add a clean headshot to give the card its strongest front.'],
  [/hero image reused|3 preferred|image\(s\) available/i, 'Add more photos so the back page can show your range.'],
  [/booking|contact/i, 'Add contact details or representation so casters can reach you.'],
  [/months old|under 6 months/i, 'Refresh your photos — casting directors expect images under six months old.'],
];

function friendlySuggestions(meta) {
  if (!meta) return [];
  const raw = [
    ...(meta.warnings || []),
    ...((meta.guardrails && meta.guardrails.warnings) || []),
  ];
  const out = [];
  for (const [pattern, copy] of SUGGESTIONS) {
    if (raw.some((w) => pattern.test(String(w))) && !out.includes(copy)) out.push(copy);
  }
  return out.slice(0, 3);
}

function nextSeed() {
  return `take:${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

export default function CompCard({ images = [], profile }) {
  const slug = profile?.slug;

  const [seed, setSeed] = React.useState('profile:preview');
  const [side, setSide] = React.useState('front');
  const [frontReady, setFrontReady] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState(null);
  const [meta, setMeta] = React.useState(null);

  const cardRef = React.useRef(null);

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

  const previewUrl = slug ? `/pdf/view/${slug}?seed=${encodeURIComponent(seed)}` : null;
  React.useEffect(() => { setFrontReady(false); }, [previewUrl]);

  // Design summary + refinement notes from the engine (deterministic meta).
  React.useEffect(() => {
    if (!previewUrl) return undefined;
    const controller = new AbortController();
    fetch(`${previewUrl}&meta=1`, { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data && data.engine === 'composed') setMeta(data); })
      .catch(() => {});
    return () => controller.abort();
  }, [previewUrl]);

  const hasImages = (images || []).length > 0;
  const blocked = !slug || !hasImages || meta?.guardrails?.status === 'fail';
  const suggestions = friendlySuggestions(meta);
  const statusTone = blocked ? 'blocked' : suggestions.length > 0 ? 'warning' : 'ready';
  const statusLabel = blocked
    ? 'Needs photos'
    : suggestions.length > 0
      ? `${suggestions.length} ${suggestions.length === 1 ? 'note' : 'notes'}`
      : 'Ready';

  const voiceLabel = meta && VOICE_LABELS[meta.voice];
  const flipped = side === 'back';
  const flip = () => setSide((s) => (s === 'front' ? 'back' : 'front'));

  async function handleDownload() {
    if (!slug || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(`/pdf/${slug}?seed=${encodeURIComponent(seed)}&download=1`, { credentials: 'include' });
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

  return (
    <div className="cc-root">
      <header className="cc-head">
        <div className="cc-head__copy">
          <h2 className="mw-h2">Comp card</h2>
          <p className="mw-sub">Designed for you from your portfolio — two-sided 5.5 × 8.5, always current.</p>
        </div>
        <span className={`cc-status cc-status--${statusTone}`}>{statusLabel}</span>
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
              <div className="cc-card__empty">Add photos to see your comp card</div>
            )}
            {/* Composition veil: one quiet loader, no status copy. */}
            <div className={`cc-veil ${previewUrl && !frontReady ? 'is-active' : ''}`} aria-hidden="true">
              <span className="cc-veil__ring" />
            </div>
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

        {/* ── Atelier panel ── */}
        <div className="cc-panel">
          <section className="cc-stage-block">
            <header className="cc-stage-head">
              <h3 className="cc-stage-title">This design</h3>
              <button type="button" className="cc-ghost-btn" onClick={() => setSeed(nextSeed())}
                disabled={!previewUrl} title="Compose another take of your card">
                <RefreshCw size={13} aria-hidden="true" /> New direction
              </button>
            </header>
            <p className="cc-stage-note">
              {voiceLabel
                ? <>Set in the <span className="cc-em">{voiceLabel}</span> voice, composed from your strongest frames. Every take is designed around your photographs, statistics, and market.</>
                : 'Composed from your strongest frames — typography, layout, and crops are designed around your photographs, statistics, and market.'}
            </p>
            {meta?.booking?.label && (
              <p className="cc-stage-note cc-stage-note--quiet">
                {meta.booking.mode === 'represented' ? 'Carries your representation.' : `Carries your ${meta.booking.label.toLowerCase()} details.`}
                {' '}The gold Pholio mark links to your live portfolio.
              </p>
            )}
          </section>

          {suggestions.length > 0 && (
            <section className="cc-stage-block">
              <header className="cc-stage-head">
                <h3 className="cc-stage-title">Strengthen the card</h3>
              </header>
              <ul className="cc-notes">
                {suggestions.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </section>
          )}

          <div className="cc-download-row">
            <button type="button" className="mw-btn-gold cc-download" onClick={handleDownload}
              disabled={downloading || blocked}
              title={blocked ? 'Add photos to generate your card' : 'Download PDF comp card'}>
              {downloading ? <><span className="cc-spinner" aria-hidden="true" /> Composing…</> : <><Download size={15} aria-hidden="true" /> Download PDF</>}
            </button>
            {blocked ? (
              <Link to="/dashboard/talent/profile" className="cc-unlock">Complete your profile to unlock</Link>
            ) : (
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
