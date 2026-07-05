import React from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Check, Download, Plus, RefreshCw, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { TransferFailureNotice } from '../../../shared/components/states';
import PholioButton, {
  PholioIconButton,
  PholioToggleButton,
  PholioToggleGroup,
} from '../../../shared/components/ui/PholioButton';
import { talentApi } from '../api/talent';
import {
  isMinorProfile,
  minorPublicExposureAllowed,
} from '../../../shared/utils/talentAge';
import CompCardStatsNudge from './CompCardStatsNudge';
import './CompCard.css';

// Build the `/pdf/view` preview URL for a saved preset. A frozen preset
// (design captured at save time) renders by id — the stored plan is
// authoritative and never silently redesigns. Older presets fall back to
// their stored query (seed + locks + direction).
function presetPreviewUrl(slug, preset) {
  if (!slug) return null;
  if (preset?.frozen) return `/pdf/view/${slug}?preset=${encodeURIComponent(preset.id)}`;
  const q = preset?.query || (preset?.seed ? { seed: preset.seed } : {});
  const params = new URLSearchParams();
  if (q.seed) params.set('seed', q.seed);
  if (q.layoutFamily) params.set('layoutFamily', q.layoutFamily);
  if (q.styleVariant) params.set('styleVariant', q.styleVariant);
  if (q.lockHeroId) params.set('lockHeroId', q.lockHeroId);
  if (q.lockGridIds) params.set('lockGridIds', q.lockGridIds);
  if (q.structure) params.set('structure', q.structure);
  return `/pdf/view/${slug}?${params.toString()}`;
}

// Same-origin image URL (uploads are proxied in dev).
function imageUrl(img) {
  const src = img?.public_url || img?.path || '';
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  return src.startsWith('/') ? src : `/${src}`;
}

// The default (active) preset is the most-recently-used one — the server bumps
// `last_used_at` on apply, and that is what /apply preselects.
function resolveDefaultPresetId(presets) {
  if (!presets || presets.length === 0) return null;
  let best = null;
  for (const p of presets) {
    const ts = p.lastUsedAt ? Date.parse(p.lastUsedAt) : 0;
    if (!best || ts > best.ts) best = { id: p.id, ts };
  }
  return best ? best.id : presets[0].id;
}

// Comp cards are tuned by purpose: the division/lane the card is built for and
// (optionally) the market it's aimed at. Single-token values keep them tidy and
// matchable against an agency's boards on /apply.
const CARD_BOARDS = ['Commercial', 'Editorial', 'Runway', 'Fitness', 'Curve', 'Beauty'];
const CARD_MARKETS = ['NYC', 'LA', 'Miami', 'London', 'Paris', 'Milan', 'Tokyo'];

// "Commercial · NYC" — the quiet purpose tag shown on a saved card.
function presetTag(preset) {
  return [preset?.board, preset?.market].filter(Boolean).join(' · ');
}

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

// Blocking guardrail classes → accurate status + coaching copy. A talent
// whose real blocker is photo rights must not be told "needs photos".
const BLOCKING_COPY = [
  [/rights/i, {
    label: 'Rights check',
    note: 'Confirm usage rights on your photos — the card can only carry photos cleared for distribution.',
  }],
  [/type-safety/i, {
    label: 'Placement check',
    note: 'We could not verify a safe placement for your name — try another direction or a different front photo.',
  }],
  [/crop/i, {
    label: 'Crop check',
    note: 'A photo cannot be cropped safely at card size — try a different front photo.',
  }],
  [/booking|contact/i, {
    label: 'Contact needed',
    note: 'Add contact details or representation so casters can reach you.',
  }],
];

function blockingInfo(meta) {
  const checks = meta?.guardrails?.blockingChecks || [];
  for (const [pattern, info] of BLOCKING_COPY) {
    if (checks.some((c) => pattern.test(String(c?.id || '')) || pattern.test(String(c?.message || '')))) {
      return info;
    }
  }
  if (checks.length > 0) {
    return { label: 'Needs attention', note: checks[0]?.message || 'The card is blocked — review your photos and details.' };
  }
  return null;
}

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
  const minorGated = isMinorProfile(profile) && !minorPublicExposureAllowed(profile);

  const [seed, setSeed] = React.useState('profile:preview');
  const [side, setSide] = React.useState('front');
  const [frontReady, setFrontReady] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState(null);
  const [meta, setMeta] = React.useState(null);

  // ── Art direction ──
  // structure: a named direction pinned by the talent (null = Pholio's
  // choice); lockHeroId: the front photo locked by the talent (null = the
  // engine casts the strongest frame).
  const [directions, setDirections] = React.useState([]);
  const [structure, setStructure] = React.useState(null);
  // treatment: how the name is choreographed — null lets the engine decide,
  // 'classic' keeps the quiet register, 'statement' asks for one of the
  // verified editorial lockups (split/over/band/straddle).
  const [treatment, setTreatment] = React.useState(null);
  const [lockHeroId, setLockHeroId] = React.useState(null);

  // ── Saved-cards library (comp_card_presets) ──
  const [presets, setPresets] = React.useState([]);
  const [activePresetId, setActivePresetId] = React.useState(null);
  const [saveName, setSaveName] = React.useState('');
  const [saveBoard, setSaveBoard] = React.useState('');
  const [saveMarket, setSaveMarket] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [libBusyId, setLibBusyId] = React.useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState(null);

  const cardRef = React.useRef(null);

  React.useEffect(() => { if (slug) setSeed(`profile:${slug}`); }, [slug]);

  // Named creative directions this profile can be composed in (engine
  // catalog; e.g. the cutout direction only unlocks with a subject matte).
  React.useEffect(() => {
    if (!slug || minorGated) return undefined;
    const controller = new AbortController();
    fetch(`/pdf/view/${slug}?directions=1`, { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (Array.isArray(data?.directions)) setDirections(data.directions); })
      .catch(() => {});
    return () => controller.abort();
  }, [slug, minorGated]);

  const loadPresets = React.useCallback(async () => {
    if (!slug) return;
    try {
      const res = await talentApi.listCompCardPresets(slug, { skipRedirect: true });
      setPresets(Array.isArray(res?.presets) ? res.presets : []);
    } catch {
      // Library is non-critical to the composer; fail quiet (empty library).
    }
  }, [slug]);

  React.useEffect(() => { loadPresets(); }, [loadPresets]);

  const defaultPresetId = React.useMemo(() => resolveDefaultPresetId(presets), [presets]);

  // Load a saved variant into the composer and pin it as the default (the take
  // /apply will preselect). Selecting == "use this card".
  async function handleSelectPreset(preset) {
    if (!preset || libBusyId) return;
    setLibBusyId(preset.id);
    setActivePresetId(preset.id);
    setSeed(preset.seed || `profile:${slug}`);
    setStructure(preset.structure || null);
    setTreatment(preset.treatment || null);
    setLockHeroId(preset.lockHeroId || null);
    setSide('front');
    try {
      await talentApi.setDefaultCompCardPreset(slug, preset.id);
      await loadPresets();
    } catch (err) {
      toast.error(err?.message || 'Could not load that saved card.');
    } finally {
      setLibBusyId(null);
    }
  }

  // Pin the current composed take to the library under a name.
  async function handleSaveTake() {
    const name = saveName.trim();
    if (!name || !slug || saving) return;
    setSaving(true);
    try {
      const res = await talentApi.saveCompCardPreset(slug, {
        name,
        seed,
        board: saveBoard || undefined,
        market: saveMarket || undefined,
        structure: structure || undefined,
        treatment: treatment || undefined,
        lockHeroId: lockHeroId || undefined,
      });
      setSaveName('');
      setSaveBoard('');
      setSaveMarket('');
      setActivePresetId(res?.preset?.id || null);
      await loadPresets();
      toast.success(`Saved “${name}” to your cards.`);
    } catch (err) {
      toast.error(err?.message || 'Could not save this card. Try a different name.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePreset(preset) {
    if (!preset || libBusyId) return;
    setLibBusyId(preset.id);
    try {
      await talentApi.deleteCompCardPreset(slug, preset.id);
      if (activePresetId === preset.id) setActivePresetId(null);
      setConfirmDeleteId(null);
      await loadPresets();
    } catch (err) {
      toast.error(err?.message || 'Could not remove that card.');
    } finally {
      setLibBusyId(null);
    }
  }

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

  // The composer preview: a frozen saved card renders by preset id (its
  // stored design is authoritative); otherwise the live parameters — seed,
  // pinned direction, locked front photo, and the board the design should
  // respond to.
  const activePreset = React.useMemo(
    () => presets.find((p) => p.id === activePresetId) || null,
    [presets, activePresetId],
  );
  // "Another take" must feel like a NEW art direction: the previous take's
  // structure/treatment/voice ride along as avoid-hints (only for axes the
  // talent hasn't pinned), and the engine steers away from them.
  const [avoidHints, setAvoidHints] = React.useState(null);
  const previewUrl = React.useMemo(() => {
    if (!slug) return null;
    if (activePreset?.frozen) return `/pdf/view/${slug}?preset=${encodeURIComponent(activePreset.id)}`;
    const params = new URLSearchParams({ seed });
    if (structure) params.set('structure', structure);
    if (treatment) params.set('treatment', treatment);
    if (lockHeroId) params.set('lockHeroId', lockHeroId);
    if (saveBoard) params.set('board', saveBoard);
    if (avoidHints) {
      if (!structure && avoidHints.structure) params.set('avoidStructure', avoidHints.structure);
      if (!treatment && avoidHints.treatment) params.set('avoidTreatment', avoidHints.treatment);
      if (avoidHints.voice) params.set('avoidVoice', avoidHints.voice);
    }
    return `/pdf/view/${slug}?${params.toString()}`;
  }, [slug, activePreset, seed, structure, treatment, lockHeroId, saveBoard, avoidHints]);
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
  const guardrailFail = meta?.guardrails?.status === 'fail';
  const blocked = minorGated || !slug || !hasImages || guardrailFail;
  // Accurate blocking status: rights vs placement vs crops each get their
  // own label and coaching note — "Needs photos" only when photos are the
  // actual blocker.
  const blocking = guardrailFail ? blockingInfo(meta) : null;
  const suggestions = React.useMemo(() => {
    const notes = friendlySuggestions(meta);
    if (blocking?.note && !notes.includes(blocking.note)) return [blocking.note, ...notes].slice(0, 3);
    return notes;
  }, [meta, blocking]);
  const statusTone = blocked ? 'blocked' : suggestions.length > 0 ? 'warning' : 'ready';
  const statusLabel = minorGated
    ? 'Consent required'
    : !slug || !hasImages
      ? 'Needs photos'
      : blocking
        ? blocking.label
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
      // the download must carry the exact design being previewed: frozen
      // preset id, or the live seed + pinned direction + hero lock + board
      const dl = new URLSearchParams({ download: '1' });
      if (activePreset?.frozen) {
        dl.set('preset', activePreset.id);
      } else {
        dl.set('seed', seed);
        if (structure) dl.set('structure', structure);
        if (treatment) dl.set('treatment', treatment);
        if (lockHeroId) dl.set('lockHeroId', lockHeroId);
        if (saveBoard) dl.set('board', saveBoard);
      }
      const res = await fetch(`/pdf/${slug}?${dl.toString()}`, { credentials: 'include' });
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

      {minorGated && (
        <div className="cc-gate">
          <p className="cc-gate__copy">
            Guardian consent is required before your comp card can be previewed or exported.
          </p>
          <PholioButton to="/dashboard/talent/profile?tab=identity" variant="secondary">
            Record guardian consent
          </PholioButton>
        </div>
      )}

      <div className="cc-stage">
        {/* ── The card object ── */}
        <div className="cc-showcase">
          {!minorGated && <CompCardStatsNudge profile={profile} />}
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
            <PholioToggleGroup className="cc-sideswitch" role="group" aria-label="Show card side">
              <PholioToggleButton
                type="button"
                active={!flipped}
                className={`cc-sideswitch__btn ${!flipped ? 'is-active' : ''}`}
                aria-pressed={!flipped}
                onClick={() => setSide('front')}
              >
                Front
              </PholioToggleButton>
              <PholioToggleButton
                type="button"
                active={flipped}
                className={`cc-sideswitch__btn ${flipped ? 'is-active' : ''}`}
                aria-pressed={flipped}
                onClick={() => setSide('back')}
              >
                Back
              </PholioToggleButton>
            </PholioToggleGroup>
            <span className="cc-showcase__meta">5.5 × 8.5 · Two-sided PDF</span>
          </div>
        </div>

        {/* ── Atelier panel ── */}
        <div className="cc-panel">
          <section className="cc-stage-block">
            <header className="cc-stage-head">
              <h3 className="cc-stage-title">Art direction</h3>
              <PholioButton type="button" variant="secondary"
                onClick={() => {
                  setAvoidHints(meta ? { structure: meta.structure, treatment: meta.treatment, voice: meta.voice } : null);
                  setSeed(nextSeed());
                  setActivePresetId(null);
                }}
                disabled={!previewUrl} title="Compose a genuinely different take">
                <RefreshCw size={13} aria-hidden="true" /> Another take
              </PholioButton>
            </header>
            {directions.length > 0 && (
              <div className="cc-directions" role="group" aria-label="Name treatment" style={{ marginBottom: 2 }}>
                {[
                  { id: null, label: 'Pholio’s choice', hint: 'The engine chooses how your name is set' },
                  { id: 'classic', label: 'Classic', hint: 'The quiet register — name on paper, photography leads' },
                  { id: 'statement', label: 'Statement', hint: 'An editorial lockup — display type layered with the photograph, always legibility-verified' },
                ].map((t) => (
                  <PholioToggleButton
                    key={t.id || 'auto'}
                    type="button"
                    active={treatment === t.id}
                    aria-pressed={treatment === t.id}
                    className={`cc-directions__chip ${treatment === t.id ? 'is-active' : ''}`}
                    onClick={() => { setTreatment(t.id); setActivePresetId(null); }}
                    title={t.hint}
                  >
                    {t.label}
                  </PholioToggleButton>
                ))}
              </div>
            )}
            {directions.length > 0 && (
              <div className="cc-directions" role="group" aria-label="Creative direction">
                <PholioToggleButton
                  type="button"
                  active={!structure}
                  aria-pressed={!structure}
                  className={`cc-directions__chip ${!structure ? 'is-active' : ''}`}
                  onClick={() => { setStructure(null); setActivePresetId(null); }}
                  title="Let the engine choose the strongest direction for your photos"
                >
                  Pholio’s choice
                </PholioToggleButton>
                {directions.map((d) => (
                  <PholioToggleButton
                    key={d.id}
                    type="button"
                    active={structure === d.structure}
                    aria-pressed={structure === d.structure}
                    className={`cc-directions__chip ${structure === d.structure ? 'is-active' : ''}`}
                    onClick={() => { setStructure(d.structure); setActivePresetId(null); }}
                    title={d.description}
                  >
                    {d.label}
                  </PholioToggleButton>
                ))}
              </div>
            )}
            <p className="cc-stage-note">
              {meta?.direction?.label && voiceLabel
                ? <>A <span className="cc-em">{meta.direction.label.toLowerCase()}</span> composition set in the <span className="cc-em">{voiceLabel}</span> voice. Each direction is a real layout language — “Another take” explores within it.</>
                : voiceLabel
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

          {!minorGated && hasImages && (
            <section className="cc-stage-block">
              <header className="cc-stage-head">
                <h3 className="cc-stage-title">Front photo</h3>
              </header>
              <p className="cc-stage-note cc-stage-note--quiet">
                Lock the frame the front is built around, or leave the casting to Pholio.
              </p>
              <div className="cc-hero__strip" role="group" aria-label="Front photo">
                <PholioToggleButton
                  type="button"
                  active={!lockHeroId}
                  aria-pressed={!lockHeroId}
                  className={`cc-hero__auto ${!lockHeroId ? 'is-active' : ''}`}
                  onClick={() => { setLockHeroId(null); setActivePresetId(null); }}
                  title="The engine casts your strongest frame"
                >
                  Pholio’s pick
                </PholioToggleButton>
                {(images || []).filter((img) => img && img.id && !img.video_url).slice(0, 12).map((img) => {
                  const src = imageUrl(img);
                  const active = lockHeroId === img.id;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      className={`cc-hero__thumb ${active ? 'is-active' : ''}`}
                      aria-pressed={active}
                      onClick={() => { setLockHeroId(active ? null : img.id); setActivePresetId(null); }}
                      title={active ? 'Unlock — let Pholio cast the front' : 'Build the front around this frame'}
                    >
                      {src ? <img src={src} alt="" loading="lazy" /> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {!minorGated && slug && (
            <section className="cc-stage-block cc-lib">
              <header className="cc-stage-head">
                <h3 className="cc-stage-title">Saved cards</h3>
                {presets.length > 0 && (
                  <span className="cc-lib__count">{presets.length} of 40</span>
                )}
              </header>
              <p className="cc-stage-note cc-stage-note--quiet">
                Pin a take to keep it — a commercial card, an editorial card, one per market.
                The card you use last is the one your applications send by default.
              </p>

              <div className="cc-lib__save">
                <input
                  type="text"
                  className="cc-lib__name"
                  placeholder="Name this take — e.g. Commercial"
                  value={saveName}
                  maxLength={80}
                  disabled={blocked || saving}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveTake(); } }}
                />
                <PholioButton
                  type="button"
                  variant="primary"
                  onClick={handleSaveTake}
                  disabled={blocked || saving || !saveName.trim()}
                  title={blocked ? 'Add photos to save a card' : 'Save this take to your library'}
                >
                  {saving ? <span className="cc-spinner" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                  Save take
                </PholioButton>
              </div>

              {/* Purpose — the board/lane this card is built for, and an optional
                  market. Tagging lets /apply default to the right card per agency. */}
              <div className="cc-lib__purpose">
                <select
                  className="cc-lib__tag"
                  value={saveBoard}
                  disabled={blocked || saving}
                  aria-label="Board this card is built for"
                  onChange={(e) => setSaveBoard(e.target.value)}
                >
                  <option value="">Any board</option>
                  {CARD_BOARDS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <select
                  className="cc-lib__tag"
                  value={saveMarket}
                  disabled={blocked || saving}
                  aria-label="Market this card is aimed at"
                  onChange={(e) => setSaveMarket(e.target.value)}
                >
                  <option value="">Any market</option>
                  {CARD_MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {presets.length > 0 && (
                <ul className="cc-lib__list">
                  {presets.map((preset) => {
                    const isActive = preset.id === activePresetId;
                    const isDefault = preset.id === defaultPresetId;
                    const busy = libBusyId === preset.id;
                    const thumbUrl = presetPreviewUrl(slug, preset);
                    return (
                      <li key={preset.id} className={`cc-lib__item ${isActive ? 'is-active' : ''}`}>
                        <PholioToggleButton
                          type="button"
                          active={isActive}
                          aria-pressed={isActive}
                          className="cc-lib__thumb"
                          onClick={() => handleSelectPreset(preset)}
                          disabled={busy}
                          title={`Use “${preset.name}”`}
                        >
                          {thumbUrl && (
                            <div className="cc-lib__thumbframe">
                              <iframe src={thumbUrl} title={`${preset.name} preview`} scrolling="no" tabIndex={-1} loading="lazy" />
                            </div>
                          )}
                          {isActive && (
                            <span className="cc-lib__thumbmark" aria-hidden="true"><Check size={12} /></span>
                          )}
                        </PholioToggleButton>
                        <div className="cc-lib__body">
                          <span className="cc-lib__itemname">{preset.name}</span>
                          {presetTag(preset) && (
                            <span className="cc-lib__tagline">{presetTag(preset)}</span>
                          )}
                          {isDefault && <span className="cc-lib__flag">Default</span>}
                        </div>
                        <div className="cc-lib__actions">
                          {!isActive && (
                            <PholioButton type="button" variant="tertiary" onClick={() => handleSelectPreset(preset)} disabled={busy}>
                              <Bookmark size={12} aria-hidden="true" /> Use
                            </PholioButton>
                          )}
                          {confirmDeleteId === preset.id ? (
                            <span className="cc-lib__confirm">
                              <PholioButton type="button" variant="destructive" onClick={() => handleDeletePreset(preset)} disabled={busy}>Remove</PholioButton>
                              <PholioButton type="button" variant="tertiary" onClick={() => setConfirmDeleteId(null)} disabled={busy}>Keep</PholioButton>
                            </span>
                          ) : (
                            <PholioIconButton
                              label={`Remove ${preset.name}`}
                              danger
                              className="cc-lib__del"
                              onClick={() => setConfirmDeleteId(preset.id)}
                              disabled={busy}
                            >
                              <Trash2 size={13} aria-hidden="true" />
                            </PholioIconButton>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

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
            <PholioButton variant="primary" onClick={handleDownload}
              disabled={downloading || blocked}
              title={blocked ? 'Add photos to generate your card' : 'Download PDF comp card'}
              className="cc-download">
              {downloading ? <><span className="cc-spinner" aria-hidden="true" /> Composing…</> : <><Download size={15} aria-hidden="true" /> Download PDF</>}
            </PholioButton>
            {blocked ? (
              <Link
                to={minorGated ? '/dashboard/talent/profile?tab=identity' : '/dashboard/talent/profile'}
                className="cc-unlock"
              >
                {minorGated
                  ? 'Record guardian consent to unlock'
                  : blocking
                    ? 'Resolve the note above to unlock'
                    : 'Complete your profile to unlock'}
              </Link>
            ) : (
              <PholioButton type="button" variant="tertiary" className="cc-flip-hint" onClick={previewUrl ? flip : undefined} disabled={!previewUrl}>
                <RotateCw size={13} aria-hidden="true" /> Flip card
              </PholioButton>
            )}
            {!blocked && !minorGated && (
              <a href="/api/talent/wallet/pass" className="cc-wallet" aria-label="Add to Apple Wallet">
                <img src="/brand/add-to-apple-wallet-badge.svg" alt="Add to Apple Wallet" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
