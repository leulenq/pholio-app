import React from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bookmark, Check, ChevronDown, Download, Lock, Pencil, Plus, RefreshCw, RotateCw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import PholioSpark from '../../../shared/components/ui/PholioSpark';
import { TransferFailureNotice } from '../../../shared/components/states';
import PholioButton, {
  PholioIconButton,
  PholioToggleButton,
  PholioToggleGroup,
} from '../../../shared/components/ui/PholioButton';
import PholioInput from '../../../shared/components/ui/forms/PholioInput';
import PholioCustomSelect from '../../../shared/components/ui/forms/PholioCustomSelect';
import { talentApi } from '../api/talent';
import {
  isMinorProfile,
  minorPublicExposureAllowed,
} from '../../../shared/utils/talentAge';
import { buildCompCardPresetRenamePayload } from '../utils/compCardPresetRename';
import CompCardStatsNudge from './CompCardStatsNudge';
import './CompCard.css';

// Build the `/pdf/view` preview URL for a saved preset. A frozen preset
// (design captured at save time) renders by id — the stored plan is
// authoritative and never silently redesigns. Older presets fall back to
// their stored query (seed + locks + direction + edition).
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
  // Editions: a preset saved under an edition renders that edition (the
  // server pins it from the preset row too, but thread it so the parameter
  // preview matches the frozen design).
  if (q.edition || preset?.edition) {
    params.set('edition', q.edition || preset.edition);
    params.set('editions', '1');
  }
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

// The back page fills up to four cells from the talent's photos — the server
// clamps `lockGridIds` to four, so the picker does too.
const BACK_GRID_MAX = 4;

// Voice names mirror the engine's typography library — the register the
// current edition is "set in".
const VOICE_LABELS = {
  'stark-grotesque': 'Stark Grotesque',
  'editorial-serif': 'Editorial Serif',
  'romantic-didone': 'Romantic Didone',
  'quiet-classic': 'Quiet Classic',
  'modern-warm': 'Modern Warm',
  'bold-grotesque': 'Bold Grotesque',
  'hairline-fashion': 'Hairline Fashion',
  'clean-modern': 'Clean Modern',
};

// Honest unlock copy for editions the talent's photos can't yet support.
// Keyed by edition id and derived from the server's real suitability gates
// (composition/editions.js `needs`) — never an invented reason. The server's
// `available` flag decides *whether* to show this; the map only phrases *why*.
const EDITION_UNLOCK_COPY = {
  'the-strip': 'Needs four photos for the filmstrip',
  'gallery-monograph': 'Needs three photos for the gallery',
  'cover-story': 'Unlocks with a clean studio frame',
  'studio-cutout': 'Unlocks with a clean studio frame',
  duet: 'Needs a full-length frame for the diptych',
  'ink-noir': 'A dark register set for adult portfolios',
};

/** The condition reads as a continuation of the locked edition's name. */
function lowerFirst(text) {
  if (!text) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function unlockCopy(id, minor) {
  return (
    EDITION_UNLOCK_COPY[id] ||
    (minor ? 'Set for adult portfolios' : 'Not available for this card yet')
  );
}

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

// ── Local persistence (per-slug): the last-served seed and the recent-takes
// strip survive reloads so a returning talent doesn't re-open the identical
// first card forever. Fail-quiet in private-mode / no-storage environments.
const seedKey = (slug) => `pholio:cc:seed:${slug}`;
const takesKey = (slug) => `pholio:cc:takes:${slug}`;
function readLS(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeLS(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* storage blocked — non-critical */ }
}

/**
 * One refinement, folded away until it is wanted.
 *
 * The control column used to stack six sibling blocks — direction, the direction
 * chooser, casting, recent takes, saved cards, suggestions — each with its own
 * serif heading, its own line of instruction and its own controls, all at one
 * weight and separated by identical hairlines. Nothing in it was primary, so the
 * whole column had to be read before any of it could be used.
 *
 * Composing a card is one decision. Everything else is adjustment, and adjustment
 * belongs behind a line that states where it currently stands — so the summary
 * answers the question most of the time and the controls only appear when the
 * answer is not the wanted one.
 */
function CardDrawer({ title, summary, children, defaultOpen = false }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const shouldReduce = useReducedMotion();
  // Height animation needs overflow:hidden while collapsing/expanding. Once
  // open and settled, lift the clip so absolute dropdowns (Board / Market)
  // can escape the drawer instead of being cropped at the body edge.
  const [clipBody, setClipBody] = React.useState(!defaultOpen);
  const id = React.useId();

  const toggleDrawer = () => {
    if (open) {
      setClipBody(true);
      setOpen(false);
      return;
    }
    setClipBody(!shouldReduce);
    setOpen(true);
  };

  return (
    <div className={`cc-drawer${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="cc-drawer__bar"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggleDrawer}
      >
        <span className="cc-drawer__title">{title}</span>
        {summary ? <span className="cc-drawer__summary">{summary}</span> : null}
        <ChevronDown size={14} className="cc-drawer__chev" aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={id}
            className="cc-drawer__body"
            initial={shouldReduce ? false : { height: 0, opacity: 0 }}
            animate={shouldReduce ? {} : { height: 'auto', opacity: 1 }}
            exit={shouldReduce ? {} : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onAnimationStart={() => {
              if (!shouldReduce) setClipBody(true);
            }}
            onAnimationComplete={() => {
              if (open) setClipBody(false);
            }}
            style={{ overflow: clipBody ? 'hidden' : 'visible' }}
          >
            <div className="cc-drawer__inner">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default function CompCard({ images = [], profile }) {
  const slug = profile?.slug;
  const minor = isMinorProfile(profile);
  const minorGated = minor && !minorPublicExposureAllowed(profile);

  const [seed, setSeed] = React.useState('profile:preview');
  const [side, setSide] = React.useState('front');
  const [frontReady, setFrontReady] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState(null);
  const [meta, setMeta] = React.useState(null);

  // ── Art direction (Editions) ──
  // edition: the named art direction pinned by the talent (null = Pholio's
  // choice, the resolver draws). structure/treatment: legacy front-field pins
  // carried only by older saved presets; the new UI drives editions instead.
  // lockHeroId: the front frame; lockGridIds: the back-page cells.
  const [editions, setEditions] = React.useState([]);
  const [edition, setEdition] = React.useState(null);
  const [structure, setStructure] = React.useState(null);
  const [treatment, setTreatment] = React.useState(null);
  const [lockHeroId, setLockHeroId] = React.useState(null);
  const [lockGridIds, setLockGridIds] = React.useState([]);

  // Avoid-history: a most-recent-first FIFO (depth 3) of prior takes' edition
  // + hero ids. "New direction" pushes the current take on and steers the
  // resolver away from it — the unit of surprise.
  const [avoidHistory, setAvoidHistory] = React.useState([]);
  // Recent takes: the last ~8 takes (seed + edition), each revisitable.
  const [recentTakes, setRecentTakes] = React.useState([]);
  const lastTakeSeedRef = React.useRef(null);

  // ── Saved-cards library (comp_card_presets) ──
  const [presets, setPresets] = React.useState([]);
  const [activePresetId, setActivePresetId] = React.useState(null);
  const [saveName, setSaveName] = React.useState('');
  const [saveBoard, setSaveBoard] = React.useState('');
  const [saveMarket, setSaveMarket] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [libBusyId, setLibBusyId] = React.useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState(null);
  const [renamePresetId, setRenamePresetId] = React.useState(null);
  const [renameName, setRenameName] = React.useState('');

  const cardRef = React.useRef(null);

  // Adjust during render: reset seed/takes when slug changes (returning users
  // see their last-served seed instead of the static default).
  const [prevSlug, setPrevSlug] = React.useState(slug);
  if (slug !== prevSlug) {
    setPrevSlug(slug);
    if (slug) {
      setSeed(readLS(seedKey(slug)) || `profile:${slug}`);
      const rawTakes = readLS(takesKey(slug));
      if (rawTakes) {
        try {
          const arr = JSON.parse(rawTakes);
          setRecentTakes(Array.isArray(arr) ? arr.slice(0, 8) : []);
        } catch { setRecentTakes([]); }
      } else {
        setRecentTakes([]);
      }
    }
  }
  // Ref reset stays in an effect (ref mutations must not happen during render).
  React.useEffect(() => {
    if (slug) lastTakeSeedRef.current = null;
  }, [slug]);

  // Editions catalog for this profile — with real availability (e.g. the
  // cutout unlocks only with a subject matte, the diptych with a full-length
  // support frame). Opt into the editions engine with `editions=1`.
  React.useEffect(() => {
    if (!slug || minorGated) return undefined;
    const controller = new AbortController();
    fetch(`/pdf/view/${slug}?directions=1&editions=1`, { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (Array.isArray(data?.editions)) setEditions(data.editions); })
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

  // Inline the fetch — setState only happens inside .then() (async), never synchronously.
  React.useEffect(() => {
    if (!slug) return undefined;
    let active = true;
    talentApi.listCompCardPresets(slug, { skipRedirect: true })
      .then((res) => {
        if (active) setPresets(Array.isArray(res?.presets) ? res.presets : []);
      })
      .catch(() => {
        // Library is non-critical to the composer; fail quiet (empty library).
      });
    return () => { active = false; };
  }, [slug]);

  const defaultPresetId = React.useMemo(() => resolveDefaultPresetId(presets), [presets]);

  // Load a saved variant into the composer and pin it as the default (the take
  // /apply will preselect). Selecting == "use this card".
  async function handleSelectPreset(preset) {
    if (!preset || libBusyId) return;
    setLibBusyId(preset.id);
    setActivePresetId(preset.id);
    setSeed(preset.seed || `profile:${slug}`);
    setEdition(preset.edition || null);
    setStructure(preset.structure || null);
    setTreatment(preset.treatment || null);
    setLockHeroId(preset.lockHeroId || null);
    setLockGridIds(Array.isArray(preset.lockGridIds) ? preset.lockGridIds.filter(Boolean).slice(0, BACK_GRID_MAX) : []);
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
        edition: edition || undefined,
        structure: structure || undefined,
        treatment: treatment || undefined,
        lockHeroId: lockHeroId || undefined,
        lockGridIds: lockGridIds.length ? lockGridIds : undefined,
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

  function beginRenamePreset(preset) {
    if (!preset || libBusyId) return;
    setConfirmDeleteId(null);
    setRenamePresetId(preset.id);
    setRenameName(preset.name || '');
  }

  function cancelRenamePreset() {
    setRenamePresetId(null);
    setRenameName('');
  }

  async function handleRenamePreset(preset) {
    if (!preset || !slug || libBusyId) return;

    let payload;
    try {
      payload = buildCompCardPresetRenamePayload(preset, renameName);
    } catch (error) {
      toast.error(error.message);
      return;
    }

    if (payload.name === preset.name) {
      cancelRenamePreset();
      return;
    }

    setLibBusyId(preset.id);
    try {
      const res = await talentApi.renameCompCardPreset(slug, preset.id, payload);
      const renamed = res?.preset;
      setPresets((current) =>
        current.map((item) =>
          item.id === preset.id
            ? (renamed || { ...item, name: payload.name, payload })
            : item,
        ),
      );
      cancelRenamePreset();
      toast.success(`Renamed card to “${payload.name}”.`);
    } catch (error) {
      toast.error(error?.message || 'Could not rename this saved card.');
    } finally {
      setLibBusyId(null);
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

  const activePreset = React.useMemo(
    () => presets.find((p) => p.id === activePresetId) || null,
    [presets, activePresetId],
  );

  // The composer preview. A frozen saved card renders by preset id (its
  // stored design is authoritative). Otherwise the live parameters — seed,
  // pinned edition (or Pholio's-choice draw with avoid-history), locked front
  // photo, chosen back-page cells, and the board the design responds to. The
  // dashboard opts into the editions engine with `editions=1` on every URL.
  const previewUrl = React.useMemo(() => {
    if (!slug) return null;
    if (activePreset?.frozen) return `/pdf/view/${slug}?preset=${encodeURIComponent(activePreset.id)}`;
    const params = new URLSearchParams({ seed, editions: '1' });
    if (edition) params.set('edition', edition);
    if (structure) params.set('structure', structure);
    if (treatment) params.set('treatment', treatment);
    if (lockHeroId) params.set('lockHeroId', lockHeroId);
    if (lockGridIds.length) params.set('lockGridIds', lockGridIds.join(','));
    if (saveBoard) params.set('board', saveBoard);
    // Only steer away from history while drawing a fresh direction (unpinned):
    // once an edition is pinned the avoid list is moot.
    if (!edition && avoidHistory.length) {
      const avoidEds = avoidHistory.map((h) => h.edition).filter(Boolean);
      if (avoidEds.length) params.set('avoidEdition', avoidEds.join(','));
      const avoidHero = avoidHistory.find((h) => h.heroId)?.heroId;
      if (avoidHero) params.set('avoidHero', avoidHero);
    }
    return `/pdf/view/${slug}?${params.toString()}`;
  }, [slug, activePreset, seed, edition, structure, treatment, lockHeroId, lockGridIds, saveBoard, avoidHistory]);
  // Adjust during render: reset front-ready flag whenever the preview URL changes.
  const [prevPreviewUrl, setPrevPreviewUrl] = React.useState(previewUrl);
  if (previewUrl !== prevPreviewUrl) {
    setPrevPreviewUrl(previewUrl);
    setFrontReady(false);
  }

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

  // Persist the last-served seed and record the take once the engine resolves
  // it. Keyed on seed so tweaking hero/back-grid within a take doesn't spawn a
  // duplicate history entry; restoring an older take re-promotes it.
  React.useEffect(() => {
    if (!meta || !meta.edition || !slug || activePreset?.frozen) return;
    if (lastTakeSeedRef.current === seed) return;
    lastTakeSeedRef.current = seed;
    writeLS(seedKey(slug), seed);
    setRecentTakes((prev) => {
      const entry = { seed, edition: meta.edition.id, label: meta.edition.label };
      const next = [entry, ...prev.filter((t) => t.seed !== seed)].slice(0, 8);
      writeLS(takesKey(slug), JSON.stringify(next));
      return next;
    });
  }, [meta, seed, slug, activePreset]);

  const hasImages = (images || []).length > 0;
  const guardrailFail = meta?.guardrails?.status === 'fail';
  const blocked = minorGated || !slug || !hasImages || guardrailFail;
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

  // ── The two gestures ──
  // "New direction": push the current take to avoid-history, clear the pin,
  // and re-seed — the resolver draws a genuinely different edition.
  function handleNewDirection() {
    const curEd = meta?.edition?.id || edition || null;
    const curHero = meta?.takeSignature?.heroId || lockHeroId || null;
    if (curEd || curHero) {
      setAvoidHistory((h) => [{ edition: curEd, heroId: curHero }, ...h].slice(0, 3));
    }
    setEdition(null);
    setStructure(null);
    setTreatment(null);
    setSeed(nextSeed());
    setActivePresetId(null);
  }

  // "Another take of this": re-seed WITHIN the established edition — pin it and
  // let internal variation (hero, field, register, lockup) carry the change.
  function handleAnotherTake() {
    const curEd = edition || meta?.edition?.id;
    if (!curEd) return;
    setEdition(curEd);
    setStructure(null);
    setTreatment(null);
    setSeed(nextSeed());
    setActivePresetId(null);
  }

  // Pin (or unpin → Pholio's choice) an edition from the rail. Keeps the seed
  // so it's the *same* take re-cast in the chosen direction.
  function selectEdition(id) {
    setEdition(id);
    setStructure(null);
    setTreatment(null);
    setActivePresetId(null);
    if (id === null) setAvoidHistory([]);
  }

  // Restore an exact earlier take (seed + edition) — "take #3 was best."
  function restoreTake(take) {
    if (!take) return;
    setSeed(take.seed);
    setEdition(take.edition || null);
    setStructure(null);
    setTreatment(null);
    setActivePresetId(null);
    setSide('front');
  }

  // Toggle a photo into/out of the back-page cells (capped at BACK_GRID_MAX).
  function toggleGridId(id) {
    setLockGridIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= BACK_GRID_MAX) return prev;
      return [...prev, id];
    });
    setActivePresetId(null);
  }

  const activeEditionId = edition || meta?.edition?.id || null;
  const activeEditionEntry = React.useMemo(
    () => editions.find((e) => e.id === activeEditionId) || null,
    [editions, activeEditionId],
  );
  const editionLabel = meta?.edition?.label || activeEditionEntry?.label || null;
  const editionTone = activeEditionEntry?.tone || null;

  const gridImages = React.useMemo(
    () => (images || []).filter((img) => img && img.id && !img.video_url),
    [images],
  );

  async function handleDownload() {
    if (!slug || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      // The download must carry the exact design being previewed: frozen
      // preset id, or the live seed + edition + hero/back-grid locks + board.
      // Editions params match the preview so the PDF matches the screen.
      const dl = new URLSearchParams({ download: '1' });
      if (activePreset?.frozen) {
        dl.set('preset', activePreset.id);
      } else {
        dl.set('seed', seed);
        dl.set('editions', '1');
        if (edition) dl.set('edition', edition);
        if (structure) dl.set('structure', structure);
        if (treatment) dl.set('treatment', treatment);
        if (lockHeroId) dl.set('lockHeroId', lockHeroId);
        if (lockGridIds.length) dl.set('lockGridIds', lockGridIds.join(','));
        if (saveBoard) dl.set('board', saveBoard);
        if (!edition && avoidHistory.length) {
          const avoidEds = avoidHistory.map((h) => h.edition).filter(Boolean);
          if (avoidEds.length) dl.set('avoidEdition', avoidEds.join(','));
          const avoidHero = avoidHistory.find((h) => h.heroId)?.heroId;
          if (avoidHero) dl.set('avoidHero', avoidHero);
        }
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

          {/*
            The export lives with the object it exports, and the status lives
            with the export it gates. "Rights check" used to sit alone in red at
            the top of the control column, ~800px from both — a warning about an
            action you could not see.
          */}
          {/*
            One export, then the ways it travels. The wallet badge used to hang
            below the primary as a third stacked block of its own — a 40px black
            Apple asset floating under a black button, belonging to nothing. It is
            a second way to carry the same card, so it sits on the status line as
            the quiet half of one export group.
          */}
          <div className="cc-export">
            <PholioButton variant="primary" onClick={handleDownload}
              disabled={downloading || blocked}
              title={blocked ? 'Add photos to generate your card' : 'Download PDF comp card'}
              className="cc-download">
              {downloading ? <><span className="cc-spinner" aria-hidden="true" /> Composing…</> : <><Download size={15} aria-hidden="true" /> Download PDF</>}
            </PholioButton>
            <div className="cc-export__foot">
              <span className={`cc-status cc-status--${statusTone}`}>{statusLabel}</span>
              {!blocked && !minorGated && (
                <a href="/api/talent/wallet/pass" className="cc-wallet" aria-label="Add to Apple Wallet">
                  <img src="/brand/add-to-apple-wallet-badge.svg" alt="Add to Apple Wallet" />
                </a>
              )}
            </div>
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
            ) : null}
          </div>
        </div>

        {/* ── The control column ── */}
        <div className="cc-panel">
          {/*
            THE decision, and the only thing at full weight here: which direction
            the card is composed in. The edition name names where it stands, the
            list underneath is the choice, and one primary act draws a new one.
            This was two separate same-weight blocks — the name and tone in one,
            the chooser in another — which split a single decision across a
            hairline and left neither half looking like the point.
          */}
          {/*
            The card's current state, in three deliberately different registers.
            The name, the voice and the tone were all set in the same 12.5–13px
            sans, so "Set in Stark Grotesque" and "Dark paper, reversed type, gold
            that finally sings" read as two equal sentences with no indication
            that one is a typeface and the other is a description. Serif names it,
            mono states the voice, sans describes it.
          */}
          {/*
            A specimen plate. The three facts about the card in play — what the
            edition is called, what it is set in, how it reads — were three loose
            left-aligned lines in three sizes of sans, which is a stack of
            statements rather than a composition. They are set as a type specimen
            now: the name in serif, the typeface as a ruled mono label, and the
            tone as an italic serif epigraph, which is the register that phrase
            ("gold that finally sings") was always written in.
          */}
          <section className="cc-state">
            <h3 className="cc-editionname">
              {editionLabel ? (
                <span className="cc-editionname__label">{editionLabel}</span>
              ) : (
                <span className="cc-editionname__label cc-editionname__label--pending">Your direction</span>
              )}
            </h3>
            {editionLabel && voiceLabel && (
              <span className="cc-editionname__voice">{voiceLabel}</span>
            )}
            {editionTone && <p className="cc-state__tone">{editionTone}</p>}

            {!editionLabel && !editions.length && (
              <p className="cc-state__tone">
                Composed from your strongest frames — typography, layout, and crops are designed around your photographs, statistics, and market.
              </p>
            )}
          </section>

          <section className="cc-decision">

            {editions.length > 0 && (
              <>
              {/*
                A selector, not a list of links. These were underlined words in a
                wrapped type grid — indistinguishable from body copy and from each
                other, so the one real decision on this surface looked like a
                paragraph. They are tiles now: a real surface, a press state, and
                the chosen one filled rather than underlined.
              */}
              <div className="cc-eds" role="group" aria-label="Card direction">
                <button
                  type="button"
                  aria-pressed={!edition}
                  className={`cc-ed ${!edition ? 'is-active' : ''}`}
                  onClick={() => selectEdition(null)}
                  title="Let Pholio choose the direction that suits your photos"
                >
                  <span className="cc-ed__name">Pholio’s choice</span>
                </button>
                {editions.filter((e) => e.available).map((e) => {
                  const isSelected = edition === e.id;
                  const isCurrent = !edition && meta?.edition?.id === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      aria-pressed={isSelected}
                      className={`cc-ed ${isSelected ? 'is-active' : ''} ${isCurrent ? 'is-current' : ''}`}
                      onClick={() => selectEdition(isSelected ? null : e.id)}
                      title={e.tone}
                    >
                      <span className="cc-ed__name">{e.label}</span>
                    </button>
                  );
                })}
              </div>

              {/*
                A schedule of conditions: each direction and what it needs, in two
                aligned columns. A <dl> because that is exactly what this is —
                terms and what each requires. The names share a left edge and the
                conditions share theirs, which is what makes a list of
                restrictions read as deliberate rather than as a pile of
                rejections, and the lock on each row carries the state without a
                heading having to announce it.
              */}
              {editions.some((e) => !e.available) && (
                <dl className="cc-locked" aria-label="Directions not yet available">
                  {editions.filter((e) => !e.available).map((e) => (
                    <React.Fragment key={e.id}>
                      <dt className="cc-locked__name">
                        <Lock size={10} className="cc-locked__icon" aria-hidden="true" />
                        {e.label}
                      </dt>
                      <dd className="cc-locked__why">{lowerFirst(unlockCopy(e.id, minor))}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              )}
              </>
            )}

            <div className="cc-gestures">
              <PholioButton
                type="button"
                variant="primary"
                className="cc-gesture cc-gesture--new"
                onClick={handleNewDirection}
                disabled={!previewUrl}
                title="Draw a genuinely different edition"
              >
                <PholioSpark size={14} aria-hidden="true" /> New direction
              </PholioButton>
              {activeEditionId && (
                /* Shares the row with "New direction" — hierarchy comes from ink
                   fill against a hairline, not from demoting one of them to an
                   underlined text link. */
                <PholioButton
                  type="button"
                  variant="secondary"
                  className="cc-gesture"
                  onClick={handleAnotherTake}
                  disabled={!previewUrl}
                  title="Another version within this edition"
                >
                  <RefreshCw size={13} aria-hidden="true" /> Another take
                </PholioButton>
              )}
            </div>

            {meta?.booking?.label && (
              <p className="cc-stage-note cc-stage-note--quiet cc-decision__foot">
                {meta.booking.mode === 'represented' ? 'Carries your representation.' : `Carries your ${meta.booking.label.toLowerCase()} details.`}
                {' '}The gold Pholio mark links to your live portfolio.
              </p>
            )}
          </section>

          {/* ── Adjustments ── */}
          <div className="cc-drawers">
          {!minorGated && hasImages && (
            /* One drawer, two rows. "Front photo" and "Back page photos" are the
               same interaction — pick frames, or leave it to Pholio — and were
               two serif-titled sections each carrying its own line of
               instruction, which put two headings and two paragraphs of prose
               through the middle of the panel to explain one idea. */
            <CardDrawer
              title="Casting"
              summary={
                !lockHeroId && lockGridIds.length === 0
                  ? 'Pholio’s pick'
                  : [lockHeroId ? 'front locked' : null, lockGridIds.length ? `${lockGridIds.length} on back` : null]
                      .filter(Boolean)
                      .join(' · ')
              }
            >
              <p className="cc-stage-note cc-stage-note--quiet">
                Lock the frames the card is built around, or leave the casting to Pholio.
              </p>

              <div className="cc-cast">
                <div className="cc-cast__row">
                  <span className="cc-cast__key">Front</span>
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
                    {gridImages.slice(0, 12).map((img) => {
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
                </div>

                <div className="cc-cast__row">
                  <span className="cc-cast__key">
                    Back page
                    {lockGridIds.length > 0 && (
                      <span className="cc-cast__count">{lockGridIds.length}/{BACK_GRID_MAX}</span>
                    )}
                  </span>
                  <div className="cc-grid__strip" role="group" aria-label="Back page photos">
                    <PholioToggleButton
                      type="button"
                      active={lockGridIds.length === 0}
                      aria-pressed={lockGridIds.length === 0}
                      className={`cc-hero__auto ${lockGridIds.length === 0 ? 'is-active' : ''}`}
                      onClick={() => { setLockGridIds([]); setActivePresetId(null); }}
                      title="Let Pholio choose the back-page frames"
                    >
                      Pholio’s pick
                    </PholioToggleButton>
                    {gridImages.slice(0, 12).map((img) => {
                      const src = imageUrl(img);
                      const selected = lockGridIds.includes(img.id);
                      const atMax = lockGridIds.length >= BACK_GRID_MAX;
                      return (
                        <button
                          key={img.id}
                          type="button"
                          className={`cc-grid__thumb ${selected ? 'is-active' : ''}`}
                          aria-pressed={selected}
                          disabled={!selected && atMax}
                          onClick={() => toggleGridId(img.id)}
                          title={selected ? 'Remove from the back page' : atMax ? 'Back page is full — remove one first' : 'Add to the back page'}
                        >
                          {src ? <img src={src} alt="" loading="lazy" /> : null}
                          {selected && (
                            <span className="cc-grid__mark" aria-hidden="true"><Check size={11} /></span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardDrawer>
          )}

          {!minorGated && recentTakes.length > 1 && (
            <CardDrawer title="Recent takes" summary={String(recentTakes.length)}>
              <p className="cc-stage-note cc-stage-note--quiet">
                Jump back to a take you liked.
              </p>
              <div className="cc-recents" role="group" aria-label="Recent takes">
                {recentTakes.map((take) => {
                  const active = take.seed === seed;
                  return (
                    <button
                      key={take.seed}
                      type="button"
                      className={`cc-recent ${active ? 'is-active' : ''}`}
                      aria-pressed={active}
                      onClick={() => restoreTake(take)}
                      title={active ? 'Showing now' : `Restore ${take.label}`}
                    >
                      {take.label}
                    </button>
                  );
                })}
              </div>
            </CardDrawer>
          )}

          {!minorGated && slug && (
            <CardDrawer
              title="Saved cards"
              summary={presets.length > 0 ? `${presets.length} of 40` : 'None yet'}
            >
              <p className="cc-stage-note cc-stage-note--quiet">
                Pin a take to keep it — a commercial card, an editorial card, one per market.
                The card you use last is the one your applications send by default.
              </p>

              {/*
                Same components as /profile (PholioInput + PholioCustomSelect).
                Field chrome is scoped in CompCard.css to match Profile's hairline
                geometry and JetBrains Mono titles — shared PholioForms defaults
                alone are the wrong wells.
              */}
              <div className="cc-lib__form">
                <PholioInput
                  label="Name this take"
                  placeholder="e.g. Commercial"
                  value={saveName}
                  maxLength={80}
                  disabled={blocked || saving}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveTake(); } }}
                />

                {/* Purpose — the board/lane this card is built for, and an optional
                    market. Tagging lets /apply default to the right card per agency.
                    Side by side: they are one thought, and the rail has the measure
                    for it. */}
                <div className="cc-lib__purpose">
                  <PholioCustomSelect
                    label="Board"
                    id="cc-board"
                    placeholder="Any board"
                    disabled={blocked || saving}
                    value={saveBoard}
                    onChange={setSaveBoard}
                    options={[
                      { value: '', label: 'Any board' },
                      ...CARD_BOARDS.map((b) => ({ value: b, label: b })),
                    ]}
                  />
                  <PholioCustomSelect
                    label="Market"
                    id="cc-market"
                    placeholder="Any market"
                    disabled={blocked || saving}
                    value={saveMarket}
                    onChange={setSaveMarket}
                    options={[
                      { value: '', label: 'Any market' },
                      ...CARD_MARKETS.map((m) => ({ value: m, label: m })),
                    ]}
                  />
                </div>

                <PholioButton
                  type="button"
                  variant="primary"
                  className="cc-lib__savebtn"
                  onClick={handleSaveTake}
                  disabled={blocked || saving || !saveName.trim()}
                  title={blocked ? 'Add photos to save a card' : 'Save this take to your library'}
                >
                  {saving ? <span className="cc-spinner" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                  Save take
                </PholioButton>
              </div>

              {presets.length > 0 && (
                <ul className="cc-lib__list">
                  {presets.map((preset) => {
                    const isActive = preset.id === activePresetId;
                    const isDefault = preset.id === defaultPresetId;
                    const busy = libBusyId === preset.id;
                    const isRenaming = renamePresetId === preset.id;
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
                          {isRenaming ? (
                            <input
                              type="text"
                              className="cc-lib__rename-input"
                              value={renameName}
                              maxLength={80}
                              autoFocus
                              aria-label={`Rename ${preset.name}`}
                              disabled={busy}
                              onChange={(event) => setRenameName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  void handleRenamePreset(preset);
                                }
                                if (event.key === 'Escape') {
                                  event.preventDefault();
                                  cancelRenamePreset();
                                }
                              }}
                            />
                          ) : (
                            <>
                              <span className="cc-lib__itemname">{preset.name}</span>
                              {presetTag(preset) && (
                                <span className="cc-lib__tagline">{presetTag(preset)}</span>
                              )}
                              {isDefault && <span className="cc-lib__flag">Default</span>}
                            </>
                          )}
                        </div>
                        <div className="cc-lib__actions">
                          {isRenaming ? (
                            <>
                              <PholioIconButton
                                label={`Save name for ${preset.name}`}
                                onClick={() => void handleRenamePreset(preset)}
                                disabled={busy || !renameName.trim()}
                              >
                                <Check size={13} aria-hidden="true" />
                              </PholioIconButton>
                              <PholioIconButton
                                label="Cancel rename"
                                onClick={cancelRenamePreset}
                                disabled={busy}
                              >
                                <X size={13} aria-hidden="true" />
                              </PholioIconButton>
                            </>
                          ) : confirmDeleteId === preset.id ? (
                            <span className="cc-lib__confirm">
                              <PholioButton type="button" variant="destructive" onClick={() => handleDeletePreset(preset)} disabled={busy}>Remove</PholioButton>
                              <PholioButton type="button" variant="tertiary" onClick={() => setConfirmDeleteId(null)} disabled={busy}>Keep</PholioButton>
                            </span>
                          ) : (
                            <>
                              {!isActive && (
                                <PholioButton type="button" variant="tertiary" onClick={() => handleSelectPreset(preset)} disabled={busy}>
                                  <Bookmark size={12} aria-hidden="true" /> Use
                                </PholioButton>
                              )}
                              <PholioIconButton
                                label={`Rename ${preset.name}`}
                                onClick={() => beginRenamePreset(preset)}
                                disabled={busy}
                              >
                                <Pencil size={13} aria-hidden="true" />
                              </PholioIconButton>
                              <PholioIconButton
                                label={`Remove ${preset.name}`}
                                danger
                                className="cc-lib__del"
                                onClick={() => {
                                  setRenamePresetId(null);
                                  setConfirmDeleteId(preset.id);
                                }}
                                disabled={busy}
                              >
                                <Trash2 size={13} aria-hidden="true" />
                              </PholioIconButton>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardDrawer>
          )}
          </div>

          {/*
            Advice, not a control — so it closes the column as a quiet note rather
            than a sixth serif-titled section competing with the decision above it.
          */}
          {suggestions.length > 0 && (
            <section className="cc-closing">
              <ul className="cc-notes">
                {suggestions.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
