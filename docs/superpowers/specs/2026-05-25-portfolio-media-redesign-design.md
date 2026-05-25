# Portfolio (Media) Page — Ground-Up Redesign

**Date:** 2026-05-25
**Route:** `/dashboard/talent/media` (top nav label: "Portfolio")
**Status:** Design — pending user review
**Source of truth:** `Design Philosophy.html` + `Brand Reference.html` (repo root)

---

## 1. Problem

The current Media page (`client/src/domains/talent/components/MediaGallery.jsx`, ~805 lines + 923 lines CSS) is busy and unreadable. It stacks four distinct systems on top of the actual image grid:

- A command bar with a 4-stat row ("frames / visible / book state / edition").
- Editions/Sets (book / digitals / campaign) with a selector + "set current".
- A gamified readiness score with a 5-item coverage checklist (Cover / Headshot / Full Length / Editorial / Range).
- A standalone cover-frame editor panel (redundant with the grid).
- An embedded comp card preview that **duplicates** a separate dedicated page (`PdfCustomizerPage`).

The result reads as layered tweaks, not an intentional design. Invented labels ("The Book", "Opening Beat", "Shape", "Working book", "In curation", "Agency ready") add flavor noise. The comp card's own controls are also complex (a "Fresh Edit" randomizer + seed, a Layout/Tone/Lead/Support lock rail, and S1–S4 dropdown slot assignment).

## 2. Goal

Rebuild the page from the ground up — **new layout, structure, and CSS** — as one calm, premium, editorial workspace aligned to the Pholio brand. Do not build on top of the current implementation.

The page is the talent's **core visual workspace**: a single unified flow to manage images, curate the portfolio, and design the comp card. The comp card **lives here** — there is no separate comp card page.

## 3. Scope

### Keep (image management — core)
- Upload (JPEG/PNG/WebP, ≤5MB, up to 12 at a time).
- The frame grid.
- Drag-to-reorder (dnd-kit).
- Set cover (`is_primary`).
- Delete (with confirmation).
- Edit photo details (existing `ImageMetadataModal`: shot_type, style_type, caption, visibility).
- Crop / photo edit (existing `PhotoEditorModal` → `replaceImage`).
- Private / hidden-from-market state display.

### Keep (comp card — now lives here, full design + export)
- Live preview (server-rendered `/pdf/view/{slug}` iframe).
- Theme picker (4 themes: Standard / Dark / Studio / Editorial), Pro-gated.
- Layout family (Auto / Editorial / Runway / Mosaic).
- **Auto-compose + a single "Shuffle"** (reuses the existing seed/regenerate under the hood).
- Manual lead frame + supporting frames picks.
- Height-required status + "Add height" link.
- Download PDF.

### Cut
- Editions / Sets (selector, "set current", "New Edition", `fetchSets`/`createSet`/`setCurrentSet` usage on this page).
- Readiness score + coverage signal checklist + progress bar.
- Standalone cover-frame editor panel.
- Comp card lock rail (Layout/Tone/Lead/Support "held"), the seed/"Fresh Edit" jargon, and S1–S4 dropdown slot assignment (replaced by Auto + Shuffle + simple lead/supporting picks).
- The 4-stat command bar (replaced by one quiet mono meta line).

### Retire
- `PdfCustomizerPage` and its route `/dashboard/talent/pdf-customizer`.
- Repoint the single inbound link (`client/src/domains/talent/pages/OverviewPage/index.jsx:464`) to `/dashboard/talent/media`.

## 4. Visual language (from the brand docs)

- **Ground:** cream `#FAF7F2` canvas (work surface = composure), faint paper-grain overlay (~0.025 opacity). White cards inside.
- **Accent:** gold `#C9A55A` is the *only* brand color. Warm `#C8A96E`, light `#D4BC8A` for states.
- **Text:** `#1A1A1A`; soft `rgba(26,26,26,0.62)`; faint `rgba(26,26,26,0.42)`.
- **Hairlines:** 1px only — `rgba(26,26,26,0.08)`; gold-hair `rgba(201,165,90,0.18)`; gold center-fade divider `transparent → gold → transparent`.
- **Type:**
  - Noto Serif Display — headings.
  - Inter — body (300 weight, generous line-height), labels.
  - JetBrains Mono — kickers, micro labels, counts, format facts. **Already loaded** (`index.css` line 2 imports Inter / Noto Serif Display / JetBrains Mono / Playfair Display) — no font change needed.
  - Scale: kicker 10–11px mono, 0.22–0.28em tracking, uppercase, gold. H1 `clamp(40px, 6vw, 72px)`. H2 `clamp(28px, 3.6vw, 44px)`. Body 15–17px / 300. Micro 10px mono.
- **Headings:** literal serif labels, minimal flourish (user choice): "Portfolio" / "Your frames" / "Comp card". Mono kickers retained. (One-italic-word grammar is *not* forced here.)
- **Buttons:** primary = solid gold `#C9A55A`, ink text, ~2px corners, hover color-shift to `#D4BC8A` (no scale, no shadow lift). Secondary = 1px hairline outline, ink text, hover darkens border (no scale).
- **Imagery:** 4:5 frames, 2px radius, 1px hairline, soft warm shadow, subtle grain. **Frames stay in full color** — deliberate deviation from the philosophy's grayscale-imagery rule, because curation needs true color; the framing treatment carries the editorial feel.
- **No:** emoji, gradients beyond <10% gold radial glows, looping animation, gamification, stat-card parades.

## 5. Page structure (single scored scroll)

Centered wrap, max-width ~1200px, padding 48px desktop / 24px mobile. Global top nav (Header) unchanged — this is the page body only. Three parts split by gold center-fade hairlines.

### 5.1 Masthead
- Mono kicker: `PORTFOLIO`.
- Serif H1 (literal): "Portfolio".
- One-line subhead (sans 300): "Curate the frames agencies see — then compose your comp card from them."
- One thin mono meta line (replaces the 4-stat bar): `12 FRAMES · 9 VISIBLE TO AGENCIES`.
- Primary action top-right: **Add images** (gold button).

### 5.2 Movement I — Your frames (image management)
- Section head: kicker `I — Library`, serif H2 "Your frames".
- Grid of 4:5 framed cards (`auto-fill minmax(~220px, 1fr)` → ~4–5 cols desktop, 2 mobile, gap ~16–20px):
  - Frame treatment: 2px radius, 1px hairline, soft warm shadow, subtle grain; faint index number (`01`, `02`, …) as print furniture.
  - Full color images.
  - Cover frame: gold hairline border + small `COVER` mono tag.
  - Private/hidden frame: dimmed + `PRIVATE` tag with EyeOff icon.
  - Hover/focus reveals a quiet action row (color-shift, not lift): set cover (star), edit details (pencil), crop, delete (trash). All keyboard accessible.
  - Drag-to-reorder via existing dnd-kit; restrained functional lift while dragging is allowed.
  - Trailing **Add tile**: dashed-hairline 4:5 tile triggering upload.
- Quiet mono helper line: `JPEG · PNG · WEBP — UP TO 5MB, 12 AT A TIME`.
- Empty state: large faint serif "No frames yet." + one gold "Add images" CTA. No illustration, no emoji.
- Loading: hairline 4:5 skeletons.

### 5.3 Movement II — Comp card (design + export)
- Gold center-fade hairline divider above.
- Section head: kicker `II — Comp card`, serif H2 "Comp card", plus a quiet status note (dot + text: `Ready` / `Needs height` / `N optional fields open`) — not a loud pill.
- Contained two-column layout (collapses to stacked under ~900px):
  - **Preview (dominant):** the live `/pdf/view/{slug}` iframe presented as a printed white card — 2px radius, hairline, soft shadow. Mono caption beneath: `5.5 × 8.5 · TWO-SIDED PDF`. Loading + empty ("Complete your profile to see a preview") states preserved.
  - **Controls (narrow), stacked and calm:**
    1. **Composition** — auto by default, with a single **Shuffle** button (RefreshCw) to try a fresh variant. *Lead frame* picker + *supporting frames* picker for manual override.
    2. **Layout** — quiet segmented toggle: Auto / Editorial / Runway / Mosaic (gold underline on active, color-shift).
    3. **Finish** — 4 theme swatches. If not Pro: hairline note with the gold **Studio+** pill → upgrade link.
    4. **Download PDF** — gold primary; disabled when height missing, with quiet "Add height" link to profile.

## 6. Motion & states
- Arrival only: movements + grid cards fade+lift once (`y: 12 → 0`, `opacity: 0 → 1`), ~35ms stagger, easing `cubic-bezier(0.22, 1, 0.36, 1)`, 0.4–0.6s. No loops, no breathing, no scroll-tied motion.
- Hover: color/gold shift, never scale (except the functional drag lift).
- `prefers-reduced-motion`: honored (instant).
- Reuse existing `ImageMetadataModal`, `PhotoEditorModal`, `ConfirmationDialog`, `TransferFailureNotice`, and Sonner toasts (restyled only as needed to fit).

## 7. Responsive
- Wrap padding 48px → 24px at ≤720px.
- Library grid: ~4–5 cols → 2 cols (tablet) → 2 cols (mobile).
- Comp card: two-column → stacked under ~900px (preview first, controls below).

## 8. Components & files

### New / rewritten
- **`MediaGallery.jsx`** (or new `MediaWorkspace.jsx`): rewritten with fresh `mw-` markup; drops all editions/sets/coverage/cover-editor code. Continues to use the `useMedia` hook.
- **New CSS file** with `mw-` prefix; the old `book-*` CSS in `MediaGallery.css` is deleted wholesale.
- **`CompCardPreview.jsx`** simplified (or new `CompCard.jsx`) + new CSS: keep preview/theme/layout/download; replace lock rail + seed UI + S1–S4 dropdowns with Auto + Shuffle + simple lead/supporting picks.

### Removed
- `PdfCustomizerPage/` (page + `PdfCustomizerPage.css`); its import + route in `App.jsx`.

### Edited
- `App.jsx`: remove the `pdf-customizer` route + import.
- `OverviewPage/index.jsx:464`: repoint link to `/dashboard/talent/media`.

### Reused unchanged
- `useMedia` hook (upload/delete/reorder/setHero/replaceImage). Sets-related methods remain in the hook but are simply not called by this page.
- `ImageMetadataModal`, `PhotoEditorModal`, `ConfirmationDialog`, `TransferFailureNotice`.

### Naming
- New scoped class prefix: `mw-` (media workspace), avoiding collision with the deleted `book-*` classes.

## 9. Data model (no backend changes)
Uses existing image fields: `id`, `public_url` / `path`, `is_primary`, `shot_type`, `style_type`, `metadata` (`visibility`, `caption`, `role`), `exclude_from_public`, `exclude_from_agency`, `status`, `sort`. Comp card uses existing `/pdf/view/{slug}` render, `/pdf/{slug}?download=1` export, `updatePdfCustomization` (theme), and the existing query params (`theme`, `seed`, `layoutFamily`, `lockHeroId`, `lockGridIds`) — Shuffle sets a new `seed`; lead/supporting picks set `lockHeroId` / `lockGridIds`.

## 10. Out of scope
- Backend/API changes, PDF render engine, comp card layout algorithms.
- Editions/sets feature (cut from this page; hook methods left intact).
- Other talent pages.

## 11. Acceptance criteria
- Single cream editorial page; no command bar, no editions, no readiness score, no separate cover editor.
- Image grid supports upload, reorder, set cover, edit details, crop, delete; cover and private states are visible.
- Comp card section renders the live preview and supports theme, layout, Auto + Shuffle, lead/supporting picks, and download — all on this page.
- `/dashboard/talent/pdf-customizer` no longer exists; the Overview link points to `/dashboard/talent/media`.
- Motion fires once on arrival; `prefers-reduced-motion` respected.
- New `mw-` CSS only; old `book-*` CSS removed.
- Lint passes (`cd client && npm run lint`).
