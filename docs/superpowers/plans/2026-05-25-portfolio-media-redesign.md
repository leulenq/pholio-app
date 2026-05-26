# Portfolio (Media) Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/dashboard/talent/media` as one calm, editorial cream workspace — an image library plus an in-page comp card designer — replacing the busy "The Book" UI from the ground up.

**Architecture:** A single scored-scroll page (`MediaWorkspace.jsx`) with a masthead, a Library movement (frame grid + upload + reorder + per-frame actions), and a Comp Card movement (`CompCard.jsx`: live PDF-preview iframe + theme/layout/Auto+Shuffle/lead+supporting picks + download). The separate `PdfCustomizerPage` is retired. All new CSS is scoped with an `mw-` / `cc-` prefix; the old `book-*` and `ccp-*` CSS is deleted.

**Tech Stack:** React 19, React Router v7, TanStack Query v5, Framer Motion, @dnd-kit, lucide-react, Sonner. Brand fonts (Noto Serif Display / Inter / JetBrains Mono) and palette already available globally.

**Verification note:** `client/` has **no unit-test runner** (only `eslint` + `vite build`). This is a visual redesign, so verification is: `cd client && npm run lint`, `npm run build`, and manual browser checks against the golden path. Do **not** add a test framework — it is out of scope and against existing patterns.

**Source of truth:** `docs/superpowers/specs/2026-05-25-portfolio-media-redesign-design.md` and the repo-root `Design Philosophy.html` / `Brand Reference.html`.

---

## File Structure

**Create:**
- `client/src/domains/talent/components/MediaWorkspace.jsx` — the page (masthead + Library movement + mounts CompCard).
- `client/src/domains/talent/components/MediaWorkspace.css` — scoped `mw-` styles (canvas, masthead, library grid, frame cards).
- `client/src/domains/talent/components/CompCard.jsx` — in-page comp card designer.
- `client/src/domains/talent/components/CompCard.css` — scoped `cc-` styles.

**Modify:**
- `client/src/domains/talent/pages/MediaPage/index.jsx` — render `<MediaWorkspace />`.
- `client/src/App.jsx` — remove `PdfCustomizerPage` import + `/dashboard/talent/pdf-customizer` route.
- `client/src/domains/talent/pages/OverviewPage/index.jsx` (~line 464) — repoint comp-card link to `/dashboard/talent/media`.

**Delete (after migration):**
- `client/src/domains/talent/components/MediaGallery.jsx`
- `client/src/domains/talent/components/MediaGallery.css`
- `client/src/domains/talent/components/CompCardPreview.jsx`
- `client/src/domains/talent/components/CompCardPreview.css`
- `client/src/domains/talent/pages/PdfCustomizerPage/index.jsx`
- `client/src/domains/talent/pages/PdfCustomizerPage/PdfCustomizerPage.css`

**Reuse unchanged:** `useMedia` hook, `useAuth`, `talentApi`, `ImageMetadataModal`, `PhotoEditorModal`, `ConfirmationDialog`, `TransferFailureNotice`.

---

## Task 1: Scaffold the workspace shell + base CSS

Build the masthead and empty movement scaffolding on the cream canvas, and wire the page to render it. This produces a viewable (if not yet functional) page.

**Files:**
- Create: `client/src/domains/talent/components/MediaWorkspace.css`
- Create: `client/src/domains/talent/components/MediaWorkspace.jsx`
- Modify: `client/src/domains/talent/pages/MediaPage/index.jsx`

- [ ] **Step 1: Create `MediaWorkspace.css` with scoped tokens, canvas, masthead, and shared primitives**

```css
/* ── Media Workspace — scoped tokens (brand source of truth) ── */
.mw-root {
  --mw-ink: #050505;
  --mw-cream: #FAF7F2;
  --mw-cream-warm: #F5F0E8;
  --mw-gold: #C9A55A;
  --mw-gold-warm: #C8A96E;
  --mw-gold-light: #D4BC8A;
  --mw-text: #1A1A1A;
  --mw-text-soft: rgba(26, 26, 26, 0.62);
  --mw-text-faint: rgba(26, 26, 26, 0.42);
  --mw-hair: rgba(26, 26, 26, 0.08);
  --mw-hair-strong: rgba(26, 26, 26, 0.16);
  --mw-hair-gold: rgba(201, 165, 90, 0.18);
  --mw-serif: "Noto Serif Display", Georgia, serif;
  --mw-sans: "Inter", system-ui, sans-serif;
  --mw-mono: "JetBrains Mono", "SF Mono", monospace;
  --mw-ease: cubic-bezier(0.22, 1, 0.36, 1);

  position: relative;
  min-height: 100%;
  background: var(--mw-cream);
  color: var(--mw-text);
  font-family: var(--mw-sans);
  -webkit-font-smoothing: antialiased;
}

/* Paper grain */
.mw-root::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.025;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 150px 150px;
}

.mw-wrap {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 56px 48px 96px;
}
@media (max-width: 720px) {
  .mw-wrap { padding: 32px 24px 64px; }
}

/* ── Editorial primitives ── */
.mw-kicker {
  font-family: var(--mw-mono);
  font-size: 10px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--mw-gold);
}
.mw-h1 {
  font-family: var(--mw-serif);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.02;
  font-size: clamp(40px, 6vw, 72px);
  color: var(--mw-text);
}
.mw-h2 {
  font-family: var(--mw-serif);
  font-weight: 400;
  letter-spacing: -0.015em;
  line-height: 1.05;
  font-size: clamp(28px, 3.6vw, 44px);
  color: var(--mw-text);
}
.mw-sub {
  font-family: var(--mw-sans);
  font-weight: 300;
  font-size: 16px;
  line-height: 1.6;
  color: var(--mw-text-soft);
  max-width: 56ch;
}
.mw-meta {
  font-family: var(--mw-mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--mw-text-faint);
}

/* Buttons */
.mw-btn-gold {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--mw-sans);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 11px 18px;
  border: 1px solid var(--mw-gold);
  border-radius: 2px;
  background: var(--mw-gold);
  color: var(--mw-ink);
  cursor: pointer;
  transition: background 0.2s var(--mw-ease), border-color 0.2s var(--mw-ease);
}
.mw-btn-gold:hover { background: var(--mw-gold-light); border-color: var(--mw-gold-light); }
.mw-btn-gold:disabled { opacity: 0.5; cursor: not-allowed; }

.mw-btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--mw-sans);
  font-size: 13px;
  font-weight: 500;
  padding: 10px 16px;
  border: 1px solid var(--mw-hair-strong);
  border-radius: 2px;
  background: transparent;
  color: var(--mw-text);
  cursor: pointer;
  transition: border-color 0.2s var(--mw-ease), color 0.2s var(--mw-ease);
}
.mw-btn-ghost:hover { border-color: rgba(26, 26, 26, 0.32); }

/* Gold center-fade divider */
.mw-divider {
  height: 1px;
  margin: 72px 0;
  background: linear-gradient(to right, transparent, var(--mw-gold), transparent);
  opacity: 0.7;
}
@media (max-width: 720px) { .mw-divider { margin: 48px 0; } }

/* ── Masthead ── */
.mw-masthead {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  flex-wrap: wrap;
}
.mw-masthead__copy { display: flex; flex-direction: column; gap: 14px; }
.mw-masthead__copy .mw-h1 { margin-top: 4px; }
.mw-masthead__meta { margin-top: 6px; }

/* ── Section head ── */
.mw-section-head { margin-bottom: 32px; display: flex; flex-direction: column; gap: 12px; }

@media (prefers-reduced-motion: reduce) {
  .mw-root * { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 2: Create `MediaWorkspace.jsx` shell (masthead + empty movements)**

```jsx
import React from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useMedia } from '../hooks/useMedia';
import { useAuth } from '../../auth/hooks/useAuth';
import './MediaWorkspace.css';

const ARRIVE = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
};

function getImageUrl(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return `/uploads/${trimmed.replace(/^\/+/, '')}`;
}

function metadataFor(image) {
  if (!image?.metadata) return {};
  if (typeof image.metadata === 'object') return image.metadata;
  try { return JSON.parse(image.metadata); } catch { return {}; }
}

function isHiddenFromMarket(image) {
  const m = metadataFor(image);
  return (
    m.visibility === 'private' ||
    image?.exclude_from_public ||
    image?.exclude_from_agency ||
    image?.status === 'archived'
  );
}

export default function MediaWorkspace() {
  const { images, isLoading } = useMedia();
  const { profile } = useAuth();
  const frames = images || [];

  React.useEffect(() => { document.title = 'Portfolio | Pholio'; }, []);

  const visibleCount = frames.filter((img) => !isHiddenFromMarket(img)).length;

  return (
    <div className="mw-root">
      <div className="mw-wrap">
        <motion.header className="mw-masthead" {...ARRIVE}>
          <div className="mw-masthead__copy">
            <span className="mw-kicker">Portfolio</span>
            <h1 className="mw-h1">Portfolio</h1>
            <p className="mw-sub">
              Curate the frames agencies see — then compose your comp card from them.
            </p>
            <span className="mw-meta mw-masthead__meta">
              {frames.length} {frames.length === 1 ? 'frame' : 'frames'} · {visibleCount} visible to agencies
            </span>
          </div>
          <button type="button" className="mw-btn-gold">
            <Plus size={15} aria-hidden /> Add images
          </button>
        </motion.header>

        {/* Movement I — Library (Task 2) */}
        <section aria-label="Frame library" />

        <div className="mw-divider" aria-hidden />

        {/* Movement II — Comp card (Task 3) */}
        <section aria-label="Comp card" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Point `MediaPage` at the new workspace**

Replace the entire contents of `client/src/domains/talent/pages/MediaPage/index.jsx` with:

```jsx
import MediaWorkspace from '../../components/MediaWorkspace';

export default function MediaPage() {
  return <MediaWorkspace />;
}
```

- [ ] **Step 4: Lint + build**

Run: `cd /Users/lenquanhone/Projects/pholio-app/client && npm run lint && npm run build`
Expected: lint passes; build succeeds with no errors referencing `MediaWorkspace`.

- [ ] **Step 5: Manual browser check**

Run `npm run dev:all` from repo root, log in as `talent@example.com` / `password123`, visit `/dashboard/talent/media`.
Expected: cream page, mono "PORTFOLIO" kicker, serif "Portfolio" heading, subhead, a frame-count meta line, and a gold "Add images" button. Masthead fades in once on load.

- [ ] **Step 6: Commit**

```bash
cd /Users/lenquanhone/Projects/pholio-app
git add client/src/domains/talent/components/MediaWorkspace.jsx client/src/domains/talent/components/MediaWorkspace.css client/src/domains/talent/pages/MediaPage/index.jsx
git commit -m "feat(portfolio): scaffold new media workspace shell"
```

---

## Task 2: Library movement — frame grid, upload, reorder, per-frame actions

Implement the full image-management surface: the 4:5 frame grid, upload (button + trailing tile + validation), drag-to-reorder, set-cover/edit/crop/delete actions, modals, and empty/loading states.

**Files:**
- Modify: `client/src/domains/talent/components/MediaWorkspace.jsx`
- Modify: `client/src/domains/talent/components/MediaWorkspace.css`

- [ ] **Step 1: Append Library styles to `MediaWorkspace.css`**

```css
/* ── Library grid ── */
.mw-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 18px;
}
@media (max-width: 600px) {
  .mw-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
}

.mw-helper {
  margin-top: 18px;
  font-family: var(--mw-mono);
  font-size: 9.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--mw-text-faint);
}

/* Frame card */
.mw-frame {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mw-frame__stage {
  position: relative;
  aspect-ratio: 4 / 5;
  border-radius: 2px;
  overflow: hidden;
  border: 1px solid var(--mw-hair);
  background: var(--mw-cream-warm);
  box-shadow: 0 12px 30px -18px rgba(26, 26, 26, 0.35);
  cursor: grab;
}
.mw-frame--cover .mw-frame__stage { border-color: var(--mw-hair-gold); box-shadow: 0 0 0 1px var(--mw-hair-gold), 0 12px 30px -18px rgba(201, 165, 90, 0.4); }
.mw-frame--dragging .mw-frame__stage { cursor: grabbing; }
.mw-frame__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  user-select: none;
}
.mw-frame__img--private { opacity: 0.45; filter: grayscale(0.3); }
.mw-frame__img.mw-frame__img--failed { visibility: hidden; }

/* Grain over each frame */
.mw-frame__stage::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.03;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 120px 120px;
}

.mw-frame__index {
  position: absolute;
  top: 8px;
  left: 10px;
  font-family: var(--mw-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}
.mw-tag {
  position: absolute;
  top: 8px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--mw-mono);
  font-size: 8.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 3px 7px;
  border-radius: 999px;
}
.mw-tag--cover { background: var(--mw-gold); color: var(--mw-ink); }
.mw-tag--private { background: rgba(5, 5, 5, 0.7); color: #fff; }

/* Action row (revealed on hover/focus) */
.mw-frame__actions {
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px;
  background: linear-gradient(to top, rgba(5, 5, 5, 0.55), transparent);
  opacity: 0;
  transition: opacity 0.2s var(--mw-ease);
}
.mw-frame:hover .mw-frame__actions,
.mw-frame:focus-within .mw-frame__actions { opacity: 1; }
.mw-frame__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 2px;
  background: rgba(250, 247, 242, 0.92);
  color: var(--mw-text);
  cursor: pointer;
  transition: background 0.2s var(--mw-ease), color 0.2s var(--mw-ease);
}
.mw-frame__action:hover { background: #fff; color: var(--mw-gold); }
.mw-frame__action--danger:hover { color: #b04848; }
.mw-frame__action:disabled { opacity: 0.5; cursor: not-allowed; }
.mw-frame__caption {
  font-family: var(--mw-mono);
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--mw-text-faint);
}

/* Add tile */
.mw-add-tile {
  aspect-ratio: 4 / 5;
  border: 1px dashed var(--mw-hair-strong);
  border-radius: 2px;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  color: var(--mw-text-soft);
  font-family: var(--mw-sans);
  font-size: 12px;
  transition: border-color 0.2s var(--mw-ease), color 0.2s var(--mw-ease);
}
.mw-add-tile:hover { border-color: var(--mw-gold); color: var(--mw-gold); }

/* Empty + loading */
.mw-empty {
  text-align: center;
  padding: 80px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.mw-empty__title { font-family: var(--mw-serif); font-size: 32px; color: var(--mw-text-faint); }
.mw-skeleton { aspect-ratio: 4 / 5; border-radius: 2px; border: 1px solid var(--mw-hair); background: var(--mw-cream-warm); }

.mw-file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
```

- [ ] **Step 2: Replace `MediaWorkspace.jsx` with the full Library implementation**

Replace the entire file with:

```jsx
import React from 'react';
import { motion } from 'framer-motion';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, Star, Edit2, Crop, Trash2, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMedia } from '../hooks/useMedia';
import { useAuth } from '../../auth/hooks/useAuth';
import { TransferFailureNotice } from '../../../shared/components/states';
import ImageMetadataModal from './ImageMetadataModal';
import PhotoEditorModal from './PhotoEditorModal';
import ConfirmationDialog from '../../../shared/components/ui/ConfirmationDialog';
import CompCard from './CompCard';
import './MediaWorkspace.css';

const ARRIVE = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_FILES = 12;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function getImageUrl(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return `/uploads/${trimmed.replace(/^\/+/, '')}`;
}
function metadataFor(image) {
  if (!image?.metadata) return {};
  if (typeof image.metadata === 'object') return image.metadata;
  try { return JSON.parse(image.metadata); } catch { return {}; }
}
function isHiddenFromMarket(image) {
  const m = metadataFor(image);
  return (
    m.visibility === 'private' || image?.exclude_from_public ||
    image?.exclude_from_agency || image?.status === 'archived'
  );
}
function normalizeMime(file) {
  const t = (file.type || '').toLowerCase().trim();
  return t === 'image/jpg' ? 'image/jpeg' : t;
}
function isAllowedFile(file) {
  if (ALLOWED_MIME.has(normalizeMime(file))) return true;
  return /\.(jpe?g|png|webp)$/.test((file.name || '').toLowerCase());
}
function partitionFiles(files) {
  const valid = [], invalid = [];
  files.forEach((file, index) => {
    if (index >= MAX_UPLOAD_FILES) invalid.push({ name: file.name || 'Unknown', reason: `Max ${MAX_UPLOAD_FILES} files at once` });
    else if (!isAllowedFile(file)) invalid.push({ name: file.name || 'Unknown', reason: 'Only JPEG, PNG, WebP' });
    else if (file.size > MAX_FILE_BYTES) invalid.push({ name: file.name || 'Unknown', reason: 'Max 5MB each' });
    else valid.push(file);
  });
  return { valid, invalid };
}
function showInvalidToasts(invalid) {
  if (invalid.length === 0) return;
  if (invalid.length === 1) { toast.error(`${invalid[0].name}: ${invalid[0].reason}`); return; }
  toast.error(`${invalid.length} files could not be uploaded`, {
    description: invalid.slice(0, 5).map((i) => `${i.name}: ${i.reason}`).join('\n'),
  });
}
function markBroken(e) { e.currentTarget.classList.add('mw-frame__img--failed'); }

function PortfolioFrame({ image, index, onSetCover, onEdit, onCrop, onDelete, settingCoverId }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition, zIndex: isDragging ? 10 : 1,
  };
  const isCover = !!image.is_primary;
  const isPrivate = isHiddenFromMarket(image);
  const coverBusy = !!settingCoverId;
  const cls = ['mw-frame', isCover ? 'mw-frame--cover' : '', isDragging ? 'mw-frame--dragging' : ''].filter(Boolean).join(' ');

  return (
    <article ref={setNodeRef} style={style} className={cls} aria-label={`Frame ${index + 1}`}>
      <div className="mw-frame__stage" {...attributes} {...listeners}>
        <img
          src={getImageUrl(image.public_url || image.path)}
          alt={metadataFor(image).caption || `Portfolio frame ${index + 1}`}
          className={`mw-frame__img ${isPrivate ? 'mw-frame__img--private' : ''}`}
          loading="lazy" decoding="async" draggable={false} onError={markBroken}
        />
        <span className="mw-frame__index">{String(index + 1).padStart(2, '0')}</span>
        {isCover && <span className="mw-tag mw-tag--cover">Cover</span>}
        {isPrivate && !isCover && <span className="mw-tag mw-tag--private"><EyeOff size={9} aria-hidden />Private</span>}

        <div className="mw-frame__actions" aria-label="Frame actions">
          {!isCover && (
            <button type="button" className="mw-frame__action" title="Make cover" aria-label="Make cover"
              disabled={coverBusy} onClick={(e) => { e.stopPropagation(); onSetCover(image.id); }}>
              {settingCoverId === image.id ? <Loader2 size={14} className="mw-spin" aria-hidden /> : <Star size={14} />}
            </button>
          )}
          <button type="button" className="mw-frame__action" title="Edit details" aria-label="Edit details"
            onClick={(e) => { e.stopPropagation(); onEdit(image); }}><Edit2 size={14} /></button>
          <button type="button" className="mw-frame__action" title="Crop" aria-label="Crop"
            onClick={(e) => { e.stopPropagation(); onCrop(image); }}><Crop size={14} /></button>
          <button type="button" className="mw-frame__action mw-frame__action--danger" title="Remove" aria-label="Remove"
            onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}><Trash2 size={14} /></button>
        </div>
      </div>
    </article>
  );
}

export default function MediaWorkspace() {
  const { images, upload, deleteImage, reorder, setHero, replaceImage, isUploading, isLoading } = useMedia();
  const { profile } = useAuth();

  const [localImages, setLocalImages] = React.useState(images || []);
  const [editingImage, setEditingImage] = React.useState(null);
  const [editorImage, setEditorImage] = React.useState(null);
  const [deleteId, setDeleteId] = React.useState(null);
  const [settingCoverId, setSettingCoverId] = React.useState(null);
  const [uploadError, setUploadError] = React.useState(null);
  const fileInputRef = React.useRef(null);

  React.useEffect(() => { setLocalImages(images || []); }, [images]);
  React.useEffect(() => { document.title = 'Portfolio | Pholio'; }, []);

  const frames = localImages;
  const visibleCount = frames.filter((img) => !isHiddenFromMarket(img)).length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const { valid, invalid } = partitionFiles(files);
    showInvalidToasts(invalid);
    if (valid.length === 0) { e.target.value = null; return; }
    const formData = new FormData();
    valid.forEach((f) => formData.append('media', f));
    try {
      setUploadError(null);
      await upload(formData);
    } catch (err) {
      const message = err?.message || 'Failed to upload image(s)';
      setUploadError(message);
      toast.error(message);
    } finally {
      e.target.value = null;
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = frames.findIndex((i) => i.id === active.id);
    const newIndex = frames.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const prev = frames;
    const next = arrayMove(frames, oldIndex, newIndex);
    setLocalImages(next);
    try { await reorder(next.map((i) => i.id)); }
    catch (err) { setLocalImages(prev); toast.error(err?.message || 'Failed to reorder'); }
  };

  const handleSetCover = async (id) => {
    setSettingCoverId(id);
    try {
      await setHero(id);
      setLocalImages((prev) => prev.map((img) => ({ ...img, is_primary: img.id === id })));
    } catch (err) { toast.error(err?.message || 'Failed to set cover'); }
    finally { setSettingCoverId(null); }
  };

  const handleUpdateMetadata = (id, patch) =>
    setLocalImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...patch } : img)));

  const handleOpenEditor = (image) => { setEditingImage(null); setEditorImage(image); };

  const handleSaveEditedPhoto = async (blob) => {
    if (!editorImage) return;
    try { await replaceImage(editorImage.id, blob); setEditorImage(null); }
    catch (err) { console.error(err); toast.error('Failed to save edited photo. Please try again.'); }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try { await deleteImage(deleteId); setDeleteId(null); }
    catch (err) { toast.error(err?.message || 'Failed to delete image'); }
  };

  return (
    <div className="mw-root">
      <div className="mw-wrap">
        {editingImage && (
          <ImageMetadataModal
            image={editingImage}
            onClose={() => setEditingImage(null)}
            onUpdate={handleUpdateMetadata}
            onOpenEditor={handleOpenEditor}
            mediaSets={[]}
          />
        )}
        {editorImage && (
          <PhotoEditorModal
            imageSrc={getImageUrl(editorImage.public_url || editorImage.path)}
            onClose={() => setEditorImage(null)}
            onSave={handleSaveEditedPhoto}
          />
        )}
        <ConfirmationDialog
          isOpen={deleteId !== null}
          title="Remove frame?"
          message="This frame will be removed from your portfolio and from active representation materials."
          confirmLabel="Remove frame"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteId(null)}
        />
        <input
          ref={fileInputRef}
          type="file" multiple
          accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          onChange={handleFileUpload}
          className="mw-file-input"
          disabled={isUploading}
        />

        <motion.header className="mw-masthead" {...ARRIVE}>
          <div className="mw-masthead__copy">
            <span className="mw-kicker">Portfolio</span>
            <h1 className="mw-h1">Portfolio</h1>
            <p className="mw-sub">Curate the frames agencies see — then compose your comp card from them.</p>
            <span className="mw-meta mw-masthead__meta">
              {frames.length} {frames.length === 1 ? 'frame' : 'frames'} · {visibleCount} visible to agencies
            </span>
          </div>
          <button type="button" className="mw-btn-gold" onClick={openFilePicker} disabled={isUploading}>
            <Plus size={15} aria-hidden /> {isUploading ? 'Adding…' : 'Add images'}
          </button>
        </motion.header>

        {uploadError && (
          <TransferFailureNotice
            title="Upload interrupted"
            body={uploadError}
            retry={{ label: 'Dismiss', onClick: () => setUploadError(null) }}
          />
        )}

        <section aria-label="Frame library" style={{ marginTop: '56px' }}>
          <div className="mw-section-head">
            <span className="mw-kicker">I — Library</span>
            <h2 className="mw-h2">Your frames</h2>
          </div>

          {isLoading ? (
            <div className="mw-grid">
              {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="mw-skeleton" />)}
            </div>
          ) : frames.length > 0 ? (
            <>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={frames.map((i) => i.id)} strategy={rectSortingStrategy}>
                  <div className="mw-grid">
                    {frames.map((image, index) => (
                      <motion.div key={image.id}
                        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.32, delay: index * 0.035, ease: [0.22, 1, 0.36, 1] }}>
                        <PortfolioFrame
                          image={image} index={index}
                          onSetCover={handleSetCover} onEdit={setEditingImage}
                          onCrop={setEditorImage} onDelete={setDeleteId}
                          settingCoverId={settingCoverId}
                        />
                      </motion.div>
                    ))}
                    <button type="button" className="mw-add-tile" onClick={openFilePicker} disabled={isUploading}>
                      <Plus size={20} aria-hidden />
                      <span>{isUploading ? 'Adding…' : 'Add images'}</span>
                    </button>
                  </div>
                </SortableContext>
              </DndContext>
              <p className="mw-helper">JPEG · PNG · WEBP — up to 5MB, 12 at a time</p>
            </>
          ) : (
            <div className="mw-empty">
              <span className="mw-empty__title">No frames yet.</span>
              <button type="button" className="mw-btn-gold" onClick={openFilePicker} disabled={isUploading}>
                <Plus size={15} aria-hidden /> Add images
              </button>
              <p className="mw-helper">JPEG · PNG · WEBP — up to 5MB, 12 at a time</p>
            </div>
          )}
        </section>

        <div className="mw-divider" aria-hidden />

        <section aria-label="Comp card">
          <CompCard images={frames} profile={profile} />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the spinner keyframe to `MediaWorkspace.css`**

```css
.mw-spin { animation: mw-spin 0.8s linear infinite; }
@keyframes mw-spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 4: Add a temporary CompCard stub so the page compiles before Task 3**

Create `client/src/domains/talent/components/CompCard.jsx` with a stub (replaced fully in Task 3):

```jsx
export default function CompCard() {
  return null;
}
```

- [ ] **Step 5: Lint + build**

Run: `cd /Users/lenquanhone/Projects/pholio-app/client && npm run lint && npm run build`
Expected: passes.

- [ ] **Step 6: Manual browser check**

On `/dashboard/talent/media`: frames render in a 4:5 grid with index numbers; cover frame shows a gold "Cover" tag; hovering a frame reveals set-cover / edit / crop / delete; dragging reorders; "Add images" (button + trailing tile) opens the file picker and uploads; editing opens the metadata modal; crop opens the photo editor; delete shows the confirm dialog. With zero frames, the empty state shows. Throttle network to confirm skeletons.

- [ ] **Step 7: Commit**

```bash
cd /Users/lenquanhone/Projects/pholio-app
git add client/src/domains/talent/components/MediaWorkspace.jsx client/src/domains/talent/components/MediaWorkspace.css client/src/domains/talent/components/CompCard.jsx
git commit -m "feat(portfolio): build library movement (grid, upload, reorder, actions)"
```

---

## Task 3: Comp Card movement — preview, theme, layout, Auto+Shuffle, lead/supporting, download

Replace the CompCard stub with the full in-page comp card designer. Reuses the existing server render (`/pdf/view/{slug}`) and download (`/pdf/{slug}?download=1`) endpoints and the `theme/seed/layoutFamily/lockHeroId/lockGridIds` query params.

**Files:**
- Modify: `client/src/domains/talent/components/CompCard.jsx`
- Create: `client/src/domains/talent/components/CompCard.css`

- [ ] **Step 1: Create `CompCard.css`**

```css
.cc-root { display: flex; flex-direction: column; gap: 28px; }

.cc-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
.cc-head__copy { display: flex; flex-direction: column; gap: 12px; }
.cc-status { display: inline-flex; align-items: center; gap: 7px; font-family: var(--mw-mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--mw-text-faint); }
.cc-status__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--mw-text-faint); }
.cc-status--ready .cc-status__dot { background: #4a7a3f; }
.cc-status--warning .cc-status__dot { background: var(--mw-gold); }
.cc-status--blocked .cc-status__dot { background: #b04848; }

.cc-layout { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(260px, 1fr); gap: 40px; align-items: start; }
@media (max-width: 900px) { .cc-layout { grid-template-columns: 1fr; gap: 28px; } }

/* Preview */
.cc-preview-card {
  background: #fff; border: 1px solid var(--mw-hair); border-radius: 2px;
  box-shadow: 0 24px 60px -30px rgba(26, 26, 26, 0.4); overflow: hidden;
}
.cc-preview-wrap { position: relative; width: 100%; aspect-ratio: 11 / 8.5; background: var(--mw-cream-warm); }
.cc-preview-iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.cc-preview-loader, .cc-preview-empty {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: var(--mw-sans); font-size: 13px; color: var(--mw-text-faint); text-align: center; padding: 24px;
}
.cc-preview-caption { margin-top: 12px; font-family: var(--mw-mono); font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--mw-text-faint); }

/* Controls */
.cc-controls { display: flex; flex-direction: column; gap: 28px; }
.cc-control { display: flex; flex-direction: column; gap: 12px; }
.cc-control__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.cc-control__label { font-family: var(--mw-mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--mw-gold); }
.cc-text-btn { font-family: var(--mw-sans); font-size: 12px; color: var(--mw-text-soft); background: none; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.cc-text-btn:hover { color: var(--mw-gold); }

/* Segmented (layout) */
.cc-seg { display: flex; flex-wrap: wrap; gap: 16px; }
.cc-seg__btn { font-family: var(--mw-sans); font-size: 13px; color: var(--mw-text-soft); background: none; border: none; padding: 2px 0; cursor: pointer; border-bottom: 1px solid transparent; transition: color 0.2s var(--mw-ease), border-color 0.2s var(--mw-ease); }
.cc-seg__btn:hover { color: var(--mw-text); }
.cc-seg__btn--active { color: var(--mw-text); border-bottom-color: var(--mw-gold); }

/* Theme swatches */
.cc-themes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.cc-theme { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--mw-hair); border-radius: 2px; background: #fff; cursor: pointer; transition: border-color 0.2s var(--mw-ease); }
.cc-theme:hover { border-color: var(--mw-hair-strong); }
.cc-theme--active { border-color: var(--mw-gold); }
.cc-theme__swatches { display: inline-flex; }
.cc-theme__sw { width: 12px; height: 12px; border-radius: 2px; margin-left: -3px; border: 1px solid rgba(5,5,5,0.12); }
.cc-theme__sw:first-child { margin-left: 0; }
.cc-theme__name { font-family: var(--mw-sans); font-size: 12px; color: var(--mw-text); }
.cc-pro-hint { font-family: var(--mw-sans); font-size: 12.5px; color: var(--mw-text-soft); display: flex; align-items: center; gap: 8px; }
.cc-pill-studio { display: inline-flex; align-items: center; font-family: var(--mw-sans); font-size: 10px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; padding: 4px 10px; border-radius: 999px; background: var(--mw-gold); color: var(--mw-ink); text-decoration: none; }

/* Frame picker strip */
.cc-strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 8px; }
.cc-chip { position: relative; aspect-ratio: 4/5; border-radius: 2px; overflow: hidden; border: 1px solid var(--mw-hair); cursor: pointer; padding: 0; background: var(--mw-cream-warm); }
.cc-chip img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cc-chip--support { border-color: var(--mw-gold); box-shadow: 0 0 0 1px var(--mw-gold); }
.cc-chip--lead { border-color: var(--mw-ink); box-shadow: 0 0 0 2px var(--mw-gold); }
.cc-chip__role { position: absolute; top: 3px; left: 3px; font-family: var(--mw-mono); font-size: 7.5px; letter-spacing: 0.1em; text-transform: uppercase; padding: 1px 4px; border-radius: 2px; background: var(--mw-gold); color: var(--mw-ink); }
.cc-chip__star { position: absolute; bottom: 3px; right: 3px; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border: none; border-radius: 2px; background: rgba(250,247,242,0.9); color: var(--mw-text); cursor: pointer; }
.cc-chip__star--on { background: var(--mw-gold); color: var(--mw-ink); }
.cc-hint { font-family: var(--mw-sans); font-size: 11.5px; color: var(--mw-text-faint); }

.cc-download { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; }
.cc-spinner { width: 14px; height: 14px; border: 2px solid rgba(5,5,5,0.25); border-top-color: var(--mw-ink); border-radius: 50%; animation: mw-spin 0.8s linear infinite; }
.cc-unlock { font-family: var(--mw-sans); font-size: 12px; color: var(--mw-gold); text-decoration: none; }
```

- [ ] **Step 2: Replace `CompCard.jsx` with the full implementation**

```jsx
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
          <span className="cc-status__dot" aria-hidden /> {statusLabel}
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
                <RefreshCw size={13} aria-hidden /> Shuffle
              </button>
            </div>
            <div className="cc-strip" role="group" aria-label="Choose lead and supporting frames">
              {frames.map((f) => {
                const isLead = f.id === leadId;
                const isSupport = supportIds.includes(f.id);
                const cls = ['cc-chip', isLead ? 'cc-chip--lead' : '', isSupport ? 'cc-chip--support' : ''].filter(Boolean).join(' ');
                return (
                  <div key={f.id} className={cls}>
                    <button type="button" className="cc-chip" style={{ border: 'none', boxShadow: 'none' }}
                      onClick={() => toggleSupport(f.id)} aria-pressed={isSupport}
                      title={isSupport ? 'Remove supporting frame' : 'Add supporting frame'}>
                      <img src={f.url} alt="" />
                    </button>
                    {isLead && <span className="cc-chip__role">Lead</span>}
                    {isSupport && !isLead && <span className="cc-chip__role">S</span>}
                    <button type="button" className={`cc-chip__star ${isLead ? 'cc-chip__star--on' : ''}`}
                      onClick={() => setLead(f.id)} aria-pressed={isLead} title="Set as lead frame">
                      <Star size={11} />
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
                    <span className="cc-theme__swatches" aria-hidden>
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
              {downloading ? <><span className="cc-spinner" aria-hidden /> Generating…</> : <><Download size={14} aria-hidden /> Download PDF</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Lint + build**

Run: `cd /Users/lenquanhone/Projects/pholio-app/client && npm run lint && npm run build`
Expected: passes.

- [ ] **Step 4: Manual browser check**

On `/dashboard/talent/media` (logged-in talent with a profile + frames): the comp card preview iframe renders the live card; status shows Ready / Needs height appropriately; Shuffle changes the auto composition; tapping a frame chip marks it supporting, ★ marks the lead, "Reset to auto" clears them and the preview updates; Layout toggles change the preview; theme swatches change it (Pro) or show the Studio+ note (non-Pro); Download produces a PDF (and is disabled with an "Add height" link when height is missing).

- [ ] **Step 5: Commit**

```bash
cd /Users/lenquanhone/Projects/pholio-app
git add client/src/domains/talent/components/CompCard.jsx client/src/domains/talent/components/CompCard.css
git commit -m "feat(portfolio): in-page comp card designer (preview, theme, layout, shuffle, download)"
```

---

## Task 4: Retire the separate Comp Card page

Remove `PdfCustomizerPage` and its route, and repoint the one inbound link.

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/domains/talent/pages/OverviewPage/index.jsx`

- [ ] **Step 1: Remove the route + import in `App.jsx`**

Delete the import line:
```jsx
import PdfCustomizerPage from './domains/talent/pages/PdfCustomizerPage';
```
Delete the route line:
```jsx
<Route path="/dashboard/talent/pdf-customizer" element={<PdfCustomizerPage />} />
```

- [ ] **Step 2: Repoint the Overview link**

In `client/src/domains/talent/pages/OverviewPage/index.jsx` (~line 464), change the link target:
```jsx
to="/dashboard/talent/pdf-customizer"
```
to:
```jsx
to="/dashboard/talent/media"
```
(Adjust the surrounding label copy if it says "comp card" so it still reads correctly pointing at the portfolio page; keep it accurate.)

- [ ] **Step 3: Verify no remaining references**

Run: `cd /Users/lenquanhone/Projects/pholio-app && grep -rn "pdf-customizer\|PdfCustomizerPage" client/src`
Expected: only matches inside `client/src/domains/talent/pages/PdfCustomizerPage/` itself (deleted in Task 5). No references in `App.jsx` or `OverviewPage`.

- [ ] **Step 4: Lint + build**

Run: `cd /Users/lenquanhone/Projects/pholio-app/client && npm run lint && npm run build`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
cd /Users/lenquanhone/Projects/pholio-app
git add client/src/App.jsx client/src/domains/talent/pages/OverviewPage/index.jsx
git commit -m "refactor(portfolio): retire separate comp card route, point overview to portfolio"
```

---

## Task 5: Delete dead code

Remove the old page implementations now that nothing imports them.

**Files:**
- Delete: `client/src/domains/talent/components/MediaGallery.jsx`, `MediaGallery.css`
- Delete: `client/src/domains/talent/components/CompCardPreview.jsx`, `CompCardPreview.css`
- Delete: `client/src/domains/talent/pages/PdfCustomizerPage/index.jsx`, `PdfCustomizerPage.css`

- [ ] **Step 1: Confirm zero importers**

Run:
```bash
cd /Users/lenquanhone/Projects/pholio-app
grep -rn "MediaGallery\|CompCardPreview" client/src --include=*.jsx --include=*.js | grep -v "components/MediaGallery\|components/CompCardPreview"
```
Expected: no output (nothing imports them). If anything appears, fix that importer before deleting.

- [ ] **Step 1b: Back up the current working-tree versions before deleting (they hold uncommitted WIP)**

These four files have uncommitted WIP not in git history. Copy the current versions to a backup folder so the WIP is recoverable, then commit the backup.

```bash
cd /Users/lenquanhone/Projects/pholio-app
mkdir -p docs/superpowers/backups/2026-05-25-portfolio-media
cp client/src/domains/talent/components/MediaGallery.jsx     docs/superpowers/backups/2026-05-25-portfolio-media/MediaGallery.jsx.bak
cp client/src/domains/talent/components/MediaGallery.css     docs/superpowers/backups/2026-05-25-portfolio-media/MediaGallery.css.bak
cp client/src/domains/talent/components/CompCardPreview.jsx  docs/superpowers/backups/2026-05-25-portfolio-media/CompCardPreview.jsx.bak
cp client/src/domains/talent/components/CompCardPreview.css  docs/superpowers/backups/2026-05-25-portfolio-media/CompCardPreview.css.bak
git add docs/superpowers/backups/2026-05-25-portfolio-media
git commit -m "chore(portfolio): back up legacy media gallery + comp card preview WIP before rebuild"
```
(The `.bak` extension keeps them out of the Vite build.)

- [ ] **Step 2: Delete the files**

```bash
cd /Users/lenquanhone/Projects/pholio-app
git rm client/src/domains/talent/components/MediaGallery.jsx \
       client/src/domains/talent/components/MediaGallery.css \
       client/src/domains/talent/components/CompCardPreview.jsx \
       client/src/domains/talent/components/CompCardPreview.css \
       client/src/domains/talent/pages/PdfCustomizerPage/index.jsx \
       client/src/domains/talent/pages/PdfCustomizerPage/PdfCustomizerPage.css
```

- [ ] **Step 3: Lint + build**

Run: `cd /Users/lenquanhone/Projects/pholio-app/client && npm run lint && npm run build`
Expected: passes with no missing-module errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/lenquanhone/Projects/pholio-app
git commit -m "chore(portfolio): remove old media gallery, comp card preview, pdf customizer page"
```

---

## Task 6: Final verification against the spec

- [ ] **Step 1: Lint + build clean**

Run: `cd /Users/lenquanhone/Projects/pholio-app/client && npm run lint && npm run build`
Expected: both pass with no warnings introduced by the new files.

- [ ] **Step 2: Golden-path browser pass**

Run `npm run dev:all`, log in as talent, go to `/dashboard/talent/media`. Verify the spec's acceptance criteria:
- Single cream editorial page; no command bar, no editions, no readiness score, no separate cover-editor panel.
- Library: upload (button + tile), reorder (drag), set cover, edit details, crop, delete; cover + private states visible; empty + skeleton states.
- Comp card: live preview, theme, layout, Auto + Shuffle, lead/supporting picks, download — all on this page.
- `/dashboard/talent/pdf-customizer` 404s / is gone; the Overview comp-card link lands on `/dashboard/talent/media`.
- Motion fires once on load; set OS "reduce motion" and confirm arrivals are instant.

- [ ] **Step 3: Edge cases**

- Non-Pro account: theme row shows the Studio+ note instead of swatches.
- Profile missing height: comp card status shows "Needs height", Download disabled, "Add height" link present.
- Zero frames: Library empty state; comp card preview shows "Complete your profile…" if no slug.
- Upload a >5MB file and a non-image: validation toasts fire; valid files still upload.

- [ ] **Step 4: Confirm old CSS is gone**

Run: `cd /Users/lenquanhone/Projects/pholio-app && grep -rn "book-frame-card\|book-command-bar\|ccp-root" client/src`
Expected: no output.

- [ ] **Step 5: Final commit (if any fixups were made)**

NOTE: the working tree has ~100 unrelated WIP files. NEVER use `git add -A` / `git add .`. Stage only the redesign files by explicit path, e.g.:

```bash
cd /Users/lenquanhone/Projects/pholio-app
git add client/src/domains/talent/components/MediaWorkspace.jsx \
        client/src/domains/talent/components/MediaWorkspace.css \
        client/src/domains/talent/components/CompCard.jsx \
        client/src/domains/talent/components/CompCard.css
git commit -m "fix(portfolio): final polish from verification pass"
```

---

## Self-Review (filled by plan author)

- **Spec coverage:** Masthead, Library (upload/grid/reorder/cover/edit/crop/delete/private/empty/loading), Comp card (preview/theme/layout/auto+shuffle/lead+supporting/download/status), cuts (editions/readiness/cover-editor/lock-rail/stat-bar), retire PdfCustomizerPage + repoint link, `mw-`/`cc-` CSS + delete `book-*`/`ccp-*`, arrival-only motion + reduced-motion, responsive — all mapped to Tasks 1–6.
- **Placeholders:** none — full JSX/CSS provided per file.
- **Type/name consistency:** `CompCard` props `{ images, profile }` match the mount in `MediaWorkspace`; query-param builder `buildParams` keys (`theme/seed/layoutFamily/lockHeroId/lockGridIds`) match the existing server contract; helper names (`getImageUrl`, `isHiddenFromMarket`, `nextSeed`) are defined where used.
- **Note:** Frontend has no unit-test runner; verification is lint + build + manual browser checks by design (documented above).
