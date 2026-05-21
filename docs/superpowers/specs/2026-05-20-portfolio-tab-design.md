# Talent Portfolio Tab — Design Spec

**Date:** 2026-05-20  
**Route:** `/dashboard/talent/portfolio` (renamed from `/dashboard/talent/media`)  
**Replaces:** `MediaPage` at `client/src/domains/talent/pages/MediaPage`

---

## Overview

The Portfolio tab is where talent manages their book — the curated, sequenced collection of images they present to agencies and the world. It replaces the existing `MediaPage` wholesale, keeping the same route structure but rebuilding the experience around professional book curation rather than file management.

The primary mental model is **sequence, not folders**. All uploaded images are part of the book by default. Shoots and metadata are organizational tools that serve the sequence, not the other way around. The page should feel like reviewing a printed book with a directorial eye — not managing a Dropbox.

---

## Design Language

Follows the established pholio-app editorial system:

- **Layout:** Three-column skeleton identical to ProfilePage (left nav, wide center, right panel)
- **Typography:** Serif 300 for headings, one italic gold word per headline, mono for kickers and labels
- **Motion:** Single entrance animation per section (fade + lift, 0.65s cubic-bezier(0.22, 1, 0.36, 1)), no loops
- **Images:** 4:5 portrait ratio, 2px border-radius, subtle grain overlay, hairline borders — framed, never cropped
- **Signals:** Persistent micro-badges on thumbnails — visible at a glance, not hover-dependent
- **Color:** Gold (`#C9A55A`) for primary accents; cream (`#FAF7F2`) for surfaces; ink (`#050505`) for conviction moments

---

## Route & File Changes

### Route rename
```
/dashboard/talent/media  →  /dashboard/talent/portfolio
```

`App.jsx` updated: `MediaPage` import renamed to `PortfolioPage`, route path updated. Any top-nav link pointing to `/media` updated to `/portfolio`.

### New files
```
client/src/domains/talent/pages/PortfolioPage/
  index.jsx                  Main page: layout, state, data fetching
  PortfolioPage.module.css   All page-scoped styles
  PortfolioNav.jsx            Left sidebar nav (3 sections + counts)
  BookSection.jsx             The Book section: upload dropzone + image grid
  ImageCell.jsx               Single image card: thumbnail, drag handle, signals
  ShootsSection.jsx           Shoots section: images grouped by set
  VisibilitySection.jsx       Visibility section: exclude controls grid
  ImageDetailPanel.jsx        Right panel: quiet state + selected image detail
```

### Deleted files
- `client/src/domains/talent/pages/MediaPage/` — removed entirely

---

## Page Structure

Three-column layout matching ProfilePage:

```
┌─────────────┬──────────────────────────────┬──────────────────┐
│  PortfolioNav│        Center column          │ ImageDetailPanel │
│  (left nav) │   (The Book / Shoots / Vis.)  │  (right panel)   │
│   ~200px    │         flex: 1               │    ~300px        │
└─────────────┴──────────────────────────────┴──────────────────┘
```

### Page header (above the three columns)
A movement header in the same pattern as ProfilePage:

```
[kicker]  Your  book.
[lede]    Add images, sequence them, refine what agencies see.
```

- Kicker: `PORTFOLIO` in mono, gold, uppercase, tracked
- Title: `Your` plain + `book.` italic gold — the only italic on the page
- Lede: 15px Inter 300, max 52ch

### Section movements (center column)
Three `<article>` movements, each with a header and card body:

| # | Kicker | Title | id |
|---|--------|-------|----|
| I | Book | Your *sequence* | `book` |
| II | Shoots | Image *sets* | `shoots` |
| III | Visibility | Privacy *controls* | `visibility` |

---

## Left Navigation — `PortfolioNav`

Same `.navList` / `.navItem` / `.navNum` / `.navLabel` CSS classes as ProfileNav. Index label: `"Sections"`.

Three items:
```
01  The Book      [N images]
02  Shoots        [N shoots]
03  Visibility    [N hidden]  ← only shown if > 0
```

Count badges sit at the right edge of each nav item in mono 10px, color `rgba(26,26,26,0.35)`. The Visibility count only renders when hidden image count > 0 (zero hidden = no noise).

Scroll-spy via `IntersectionObserver` (same pattern as ProfilePage) updates the active item as the user scrolls through sections.

**Mobile:** collapses behind the same `navToggle` / `navOverlay` pattern as ProfilePage. A hamburger icon top-left opens the nav as an overlay.

---

## Center Column

### Section I — The Book (`BookSection`)

**Upload dropzone** at the top of the section, styled as an image cell peer (same width as a grid cell, dashed hairline border, `Camera` icon, "Add to book" label in mono). Clicking opens a file picker. Files can also be dragged onto the dropzone. Accepts JPEG, PNG, WebP, max 5MB per file, max 12 at once. Calls `talentApi.uploadMedia(formData)`. On success, new images append to the end of the sequence.

**Image grid** below the dropzone. 3 columns desktop, 2 columns tablet, 1 column mobile. Each column gap: 12px. Each cell: 4:5 aspect ratio portrait card.

Drag-and-drop reordering via `@dnd-kit/sortable`. On drag start: lifted shadow, no scale. On drag over: gap opens at destination. On drop: optimistic sort update in local state, then `talentApi.reorderMedia(newImageIds)` fires. If the request fails, state reverts with an error toast.

### `ImageCell` component

Each cell renders:

```
┌──────────────────────┐
│ #03          [HERO]  │  ← position number (mono) + signal badges
│                      │
│   [image]            │
│                      │
│                      │
└──────────────────────┘
```

**Persistent signals** (always visible, not hover-dependent):

| Signal | Condition | Visual |
|--------|-----------|--------|
| `HERO` | `image.is_primary === true` | Gold pill, top-right |
| `OPENER` | Position 1, `is_primary === false` | Mono label top-right, amber color — signals mismatch between opener and hero |
| `#N` | Every image | Position number top-left, mono 10px, `rgba(255,255,255,0.55)` on image |
| `HIDDEN` | `exclude_from_public` or `exclude_from_agency` | Muted gray pill top-right |
| Sequence warning | 3+ consecutive images with same `shot_type` | Thin 3px amber left-border on the run of images |

**Sequence warning logic** (client-side only, no backend):
```
Walk sorted images array.
Track current run: { shot_type, count, startIndex }.
When shot_type changes or array ends:
  if count >= 3, mark images[startIndex..current] as warned.
Reset run.
```
This gives a thin amber left-border on each image in a run of 3+ same shot types. Images with `shot_type = null` do not participate in run detection.

**Selected state:** clicking a cell adds a 2px gold ring (`outline: 2px solid #C9A55A, outline-offset: 2px`) and opens `ImageDetailPanel`. The selected image id is stored in `selectedImageId` state in `index.jsx`.

**Hover state:** cursor changes to `grab` when dragging is possible. A faint drag-handle icon (six dots) appears bottom-right on hover.

### Section II — Shoots (`ShootsSection`)

Images grouped by `set_id`. Each shoot renders as a labeled block:
- Shoot name as a mono-kicker sub-header (e.g., `LONDON EDITORIAL — 14 images`)
- Images in a 3-column grid (same `ImageCell`, same signals)
- An "Unassigned" block at the bottom for images with `set_id = null`

No drag-and-drop within this view — sequencing happens only in The Book. Shoots is a read-only organizational view.

A `+ New shoot` button at the section top opens an inline form (shoot name input + create button). Calls `talentApi.createMediaSet({ name })`.

### Section III — Visibility (`VisibilitySection`)

A grid of all images (same 3-column layout, same `ImageCell`) with visibility state visible as badges. A filter row at the top: "All", "Public only", "Hidden from public", "Hidden from agencies."

No drag-and-drop here. Clicking an image selects it and opens `ImageDetailPanel` as in The Book — the visibility toggles in the panel are the primary editing surface here.

---

## Right Panel — `ImageDetailPanel`

Always visible on desktop. Fixed width ~300px.

### Quiet state (no image selected)

Book stats in large serif numerals, editorial layout:

```
[large serif number]  images in your book
[large serif number]  shoots
[large serif number]  hidden  ← only if > 0
```

Below stats: a short prompt in 13px Inter 300 — "Select an image to edit its details."

### Selected state

**Image preview** — full panel width, 4:5 aspect, no overlaid controls. Below: position number + original filename in mono 10px, `rgba(26,26,26,0.45)`.

**Primary actions row:**
- `Set as hero` button — calls `talentApi.setHeroImage(id)`, then invalidates the images query. Disabled (reads "Hero image") if `image.is_primary` is already true.
- Delete icon button — destructive, shows a confirmation inline ("Delete this image?" with Confirm / Cancel). Calls `talentApi.deleteMedia(id)`.

**Metadata fields** (each auto-saves on blur via `talentApi.updateMedia(id, partialData)`):

| Field | Component | Bound to |
|-------|-----------|----------|
| Shoot | `PholioCustomSelect` | `set_id` |
| Shot type | `PholioCustomSelect` | `shot_type` |
| Style | `PholioCustomSelect` | `style_type` |
| Captured | `PholioInput` type=date | `captured_at` |
| Caption | `PholioTextarea` rows=2 | `metadata.caption` |

`shot_type` options: `Full Body`, `Three-Quarter`, `Half Body`, `Close-Up`, `Detail`  
`style_type` options: `Editorial`, `Commercial`, `Lifestyle`, `Fashion`, `Beauty`, `Fitness`

The Shoot select includes a `+ New shoot` inline option at the bottom of the dropdown that creates a set on the fly (`talentApi.createMediaSet({ name })`) and immediately selects the new set_id.

**Visibility section** (below a hairline divider, secondary visual weight):

```
Hide from public portfolio    [toggle]
Hide from agency view         [toggle]
```

Each toggle auto-saves on change (no blur required for booleans). Calls `talentApi.updateMedia(id, { exclude_from_public: bool })`.

**`metadata` update pattern:** when any `metadata.*` field changes, the frontend assembles the full current metadata object and sends it as `{ metadata: { caption, tags } }`. The backend stores it as a JSON blob.

---

## Data Fetching

All image data fetched from `GET /api/talent/profile` (returns `images` array alongside profile) or directly via a dedicated media endpoint if one exists. The images array is already fetched and available in the auth context. On the Portfolio page, use TanStack Query to keep images fresh:

```js
const { data: images } = useQuery({
  queryKey: ['talent-images'],
  queryFn: () => talentApi.getProfile().then(d => d.images),
});
```

After any mutation (upload, reorder, update, delete, setHero), invalidate `['talent-images']` and `['auth-user']` to keep the header and profile strength in sync.

Shoots data:
```js
const { data: shoots } = useQuery({
  queryKey: ['talent-shoots'],
  queryFn: () => talentApi.getMediaSets(),
});
```

---

## Backend — No New Endpoints Required

All required API operations are already implemented:

| Operation | Endpoint |
|-----------|----------|
| Fetch images | Via `GET /api/talent/profile` → `images` |
| Upload | `POST /api/talent/media` |
| Reorder | `PUT /api/talent/media/reorder` |
| Update metadata | `PUT /api/talent/media/:id` (partial, all fields optional) |
| Set hero | `PUT /api/talent/media/:id/hero` |
| Delete | `DELETE /api/talent/media/:id` |
| Fetch shoots | `GET /api/talent/media/sets` |
| Create shoot | `POST /api/talent/media/sets` |
| Set current shoot | `PATCH /api/talent/media/sets/:id/current` |

The `PUT /api/talent/media/:id` endpoint accepts partial updates — only fields present in the body are updated. `metadata` is sent as a complete assembled object.

---

## State Architecture (`index.jsx`)

```js
// Server state (TanStack Query)
images          // sorted by `sort` asc
shoots          // from getMediaSets()

// Local UI state
selectedImageId   // string | null — which image the detail panel shows
activeSection     // string — scroll spy result for nav highlight
navOpen           // boolean — mobile nav toggle
localOrder        // string[] | null — optimistic image id order during drag
```

`localOrder` is set on drag start from current `images` ids, updated as the user drags, committed (cleared) on drop after the reorder request resolves. If the request fails, `localOrder` is cleared (reverts to server order) and an error toast fires.

---

## Mobile Behavior

- Left nav collapses behind hamburger toggle (same pattern as ProfilePage)
- Right panel (`ImageDetailPanel`) becomes a bottom sheet: hidden by default, slides up from bottom when an image is tapped, dismissed by tapping outside or a close button
- Grid goes to 2 columns on tablet, 1 column on mobile
- Upload dropzone maintains full width

---

## Accessibility

- Each `ImageCell` is a `<button>` (or `<div role="button" tabIndex={0}>`) with `aria-label="Image N of M: [filename]"`
- The detail panel has `role="complementary" aria-label="Image details"`
- Drag-and-drop handles keyboard: `@dnd-kit` provides keyboard sensor by default
- Confirmation dialogs use `role="alertdialog"`
- All icon-only buttons have `aria-label`

---

## What This Does NOT Include

- AI-powered book analysis or smart ordering suggestions (future)
- Image rights management (`image_rights` table) — exists in DB, not surfaced here
- Comp card customization — lives in `PdfCustomizerPage`
- Public portfolio preview — exists as a separate shared portfolio route
- Bulk metadata editing — individual per-image editing only
