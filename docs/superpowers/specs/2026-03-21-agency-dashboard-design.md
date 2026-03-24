# Agency Dashboard Redesign — Design Spec

**Date:** 2026-03-21
**Status:** Draft
**Scope:** Complete frontend layout, UI design, and component spec for the agency dashboard

---

## 1. Goals & Constraints

### Primary Goal
Optimize the agency dashboard for **high-volume applicant triage** — agencies receiving 50-200+ applications/week need to rapidly scan, tag, shortlist, and respond without context-switching.

### Secondary Goal
Support **roster operations** — managing 100-500+ signed talent across active castings with fluid movement between incoming pipeline and active roster.

### Design Decisions (Validated)
- **Layout paradigm:** Hybrid master-detail (default) with kanban toggle
- **Detail panel:** Adaptive — fixed right panel on wide screens (>=1280px), overlay drawer on narrow
- **List density:** Rich rows (two-line, avatar, name, type, score, date, tags)
- **Architecture:** Hub + Spokes — Inbox is the hub (80% of UX investment), other pages are focused spokes
- **Default landing:** Inbox (not Overview) — the agent's day starts in the triage workspace

### Brand Standards
- Primary gold: `#C9A55A`
- Typography: Inter body, Playfair Display / Noto Serif Display for headings
- Card radius: 16px; base spacing unit: 4px scale
- Standard transition: `all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`
- Spring physics (two tiers):
  - **Content entrances** (page transitions, card stagger, hero reveals): `stiffness: 55, damping: 16` — soft, bouncy, editorial feel (per CLAUDE.md)
  - **Utility panels** (detail panel slide-in, toolbar slide-down, dropdown open): `stiffness: 320, damping: 32` — snappy, no bounce, tool-like

---

## 2. Layout Architecture & Navigation

### Top Bar

Reduced from 104px to **56px** to reclaim vertical space for triage.

```
+-------------------------------------------------------------+
| PHOLIO . Agency Name          [Nav Pills]     S M3 N2 G U   |
|                                                    56px      |
+-------------------------------------------------------------+
```

- **Left:** Co-brand lockup (PHOLIO wordmark + agency name, separated by centered dot)
- **Center:** Nav pills — **Inbox** | Roster | Casting | Discover | Analytics | Overview
- **Right:** Search trigger, Messages (unread count badge), Notifications (count badge), Settings gear, User avatar dropdown
- **Sticky**, white background (`--ag-surface-1`), subtle bottom border (`1px solid --ag-surface-4`)

### Nav Pill Changes

| Current | New | Rationale |
|---------|-----|-----------|
| "Applicants" | **"Inbox"** | Shorter, signals triage mental model |
| Overview first | **Inbox first** | Default landing is the workspace, not the report |
| No counts | **Live count badges** | Ambient awareness of pending work |
| Analytics in nav | **Analytics kept** | Stays as a nav pill between Discover and Overview |

**URL change:** Route path changes from `/dashboard/agency/applicants` to `/dashboard/agency/inbox`. A redirect from the old path is required. All internal links (OverviewPage attention strip, etc.) must be updated.

- Active pill: white fill + subtle shadow (keep current pattern)
- Each pill gets a live count badge for actionable items (Inbox: pending count, Casting: active boards)

### Page Shell — Master-Detail Split

```
+------------------- 56px top bar --------------------+
|                                                      |
|  +- List Panel --------+  +- Detail Panel -------+  |
|  |                     |  |                      |  |
|  |  Filter bar         |  |  Hero + profile      |  |
|  |  ---------------    |  |                      |  |
|  |  Rich row           |  |  Actions toolbar     |  |
|  |  Rich row <- active |  |                      |  |
|  |  Rich row           |  |  Tabs: Bio | Notes | |  |
|  |  Rich row           |  |        History | Msgs|  |
|  |  Rich row           |  |                      |  |
|  |  ...                |  |  [Tab content]       |  |
|  |                     |  |                      |  |
|  +---------------------+  +----------------------+  |
|         ~45%                      ~55%               |
+------------------------------------------------------+
```

**Behavior:**
- **No detail selected:** List expands to full width, shows a richer card grid
- **Detail selected (>=1280px):** Fixed side-by-side split. List 45%, Detail 55%
- **Detail selected (<1280px):** Overlay drawer (current TalentPanel behavior)
- **Kanban toggle:** Replaces the list panel with pipeline columns. Detail panel stays.

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `Up` / `Down` | Move through list |
| `Right` or `Enter` | Open detail panel |
| `Left` or `Esc` | Close detail panel |
| `s` | Shortlist selected |
| `d` | Decline selected |
| `a` | Archive selected |
| `t` | Open tag picker |
| `k` | Toggle kanban view |
| `?` | Show shortcut overlay |

**Important:** All single-key shortcuts must be suppressed when focus is inside an `<input>`, `<textarea>`, or `[contenteditable]` element. Use a global keydown listener that checks `event.target.tagName` before dispatching.

---

## 3. Inbox Page (Hub) — Applicant Triage Workspace

The primary workspace where agents spend 70%+ of their time.

### Filter Bar

Two-row filter system at the top of the list panel.

```
+--------------------------------------------+
| P All Applicants v   Q Search name...   L K|  <- Row 1
| Status v  Type v  Score v  Tags v  x Clear |  <- Row 2
+--------------------------------------------+
```

**Row 1:**
- **Preset selector** (P icon): Dropdown of saved filter presets (wired to existing `filter_presets` API). "All Applicants" is default. Presets show as named views — "High-Score Editorial", "This Week's Submissions", etc.
- **Search**: Instant name/tag search, debounced 200ms. Client-side filter first, server fallback.
- **View toggle** (L list / K kanban): Switches between master-detail and pipeline kanban. Current view highlighted with gold underline.

**Row 2:**
- **Filter chips**: Status (pending/shortlisted/offered/declined/archived), Archetype (editorial/commercial/runway/fitness/plus), Match Score range (slider), Tags (multi-select from agency tags)
- **Active filters** show as removable chips. `x Clear` resets all.
- **Collapsed by default on narrow screens**, expandable via filter icon.

### Rich Row (List Item)

```
+--------------------------------------------+
| +----+  Maya Chen              *92   2d ago|
| | Img|  Editorial . 175cm                  |
| +----+  [runway-ready]  [nyc]              |
+--------------------------------------------+
```

| Element | Spec |
|---------|------|
| Avatar | 48x48px, rounded 8px, `object-fit: cover` |
| Line 1 | Full name (600 weight, `--ag-text-0`), match score ring (colored by threshold), relative time |
| Line 2 | Archetype pill + key stat (height). Muted text (`--ag-text-2`) |
| Line 3 | Up to 3 tag chips, overflow as `+N` counter. 11px, rounded. |
| Row height | 76px (`--ag-row-h`) |
| Selected state | 3px left border `--ag-gold`, background `--ag-gold-ghost` |
| Unread indicator | 6px gold dot on left edge for never-viewed applications |
| Hover | Background shift to `--ag-surface-2` |

**Score ring color thresholds:**
- >= 80: `--ag-gold`
- >= 60: `--ag-success`
- < 60: `--ag-text-3`

### Bulk Selection

- **Checkbox** appears on hover at the left edge (replaces unread dot)
- **Shift+click** for range select
- **Select all** checkbox in filter bar (selects current filtered set)
- When >= 1 selected, **BulkActionToolbar** slides in above the list:

```
+-------------------------------------------------------+
| [x] 12 selected   [Shortlist] [Decline] [Tag v] [Archive]  x|
+-------------------------------------------------------+
```

- Gold-tinted bar (`--ag-gold-ghost` background). Actions are icon+label buttons.
- Wired to existing bulk endpoints (`/api/agency/applications/bulk-*`).

### Kanban Mode

Triggered by view toggle or `k` key. Replaces the list panel.

```
+--- New (24) ---+-- Reviewed (8) --+-- Shortlisted (5)--+-- Offered (2) --+
| +------------+ | +------------+   | +------------+     | +----------+    |
| | Maya Chen  | | | James Park |   | | Sofia Reyes|     | | Lena K.  |    |
| | Edit.  *92 | | | Comm.  *78 |   | | Runway *88 |     | | Edit.*95 |    |
| +------------+ | +------------+   | +------------+     | +----------+    |
| +------------+ | +------------+   |                     |                |
| | ...        | | | ...        |   |                     |                |
+----------------+-----------------+---------------------+----------------+
```

**Columns:** New -> Reviewed -> Shortlisted -> Offered -> Signed -> Declined

| Element | Spec |
|---------|------|
| Column min-width | 220px (`--ag-kanban-col-min`) |
| Column header | Stage name (12px uppercase, `--ag-text-2`) + count badge |
| Card gap | 8px (`--ag-kanban-card-gap`) |
| Drop zone | Dashed border `--ag-gold` when dragging over |
| Collapsed column | 48px wide, vertical stage name, count badge only |
| Drag-and-drop | `@dnd-kit` (existing). Drop triggers status update API. |

**Kanban cards:** Compact — avatar (32x32), name, archetype, score. Click opens detail panel.

### Detail Panel

Loads when a talent is selected from list or kanban.

```
+------------------------------------------+
|  +----------------------------------+    |
|  |         HERO IMAGE               |    |
|  |         (16:9, 280px max)        |    |
|  |    Name overlay + status badge   |    |
|  +----------------------------------+    |
|                                          |
|  Maya Chen                        [x]   |
|  Editorial . 22 . 175cm . NYC           |
|  Applied 2 days ago . Score: 92         |
|                                          |
|  +---------+-----------+---------+       |
|  | Accept  | Shortlist | Decline |       |
|  +---------+-----------+---------+       |
|                                          |
|  +Bio --+ Notes -+ History -+ Msgs -+   |
|  |                                   |   |
|  |  Bio text (expandable)            |   |
|  |  ----------                       |   |
|  |  Measurements grid (2-col)        |   |
|  |  ----------                       |   |
|  |  Photo gallery (horizontal        |   |
|  |   scroll, 80x80 thumbnails)       |   |
|  |                                   |   |
|  +-----------------------------------+   |
|                                          |
|  Tags: [runway-ready] [nyc] [+ Add]     |
|                                          |
|  Reminders  [+ Set reminder]             |
|  Interviews [+ Schedule]                 |
+------------------------------------------+
```

**Hero section:**
- Primary image, 16:9 ratio, max 280px height
- Name overlaid on gradient at bottom (white text, text-shadow)
- Status badge top-right of image
- Close button (x) top-right corner of panel

**Identity bar:**
- Name: 24px, Playfair Display
- Archetype pill, age, height, city
- Submission date + match score (with colored ring)

**Action buttons:**
- Three primary actions: **Accept** (green/`--ag-success`), **Shortlist** (gold/`--ag-gold`), **Decline** (red/`--ag-danger`)
- Muted/outlined by default, fill on hover. Active state for current status.
- Keyboard shortcuts shown as tooltips

**Tabbed content:**
- **Bio:** Curated bio + measurements in 2-column grid (bust/waist/hips, shoe, dress). Photo gallery with horizontal scroll, click opens lightbox.
- **Notes:** Existing `NotesPanel` — add/edit/delete internal notes. Timestamped.
- **History:** `ActivityTimeline` — all status changes, notes, tags, messages chronologically.
- **Messages:** `MessageThread` — conversation with talent, compose new.

**Bottom section (always visible, below tabs):**
- Tag chips with `+ Add` inline trigger
- Active reminders with `+ Set reminder`
- Upcoming interviews with `+ Schedule`
- Collapsed summaries — click expands or navigates to full view

---

## 4. Roster Page (Spoke)

Agency's signed talent pool. Optimized for "who fits this brief?" and "who's available?"

### Default View: Card Grid

Roster defaults to **grid** (not list) — agencies think about talent visually.

**Card spec:**

```
+--------------------+
|                    |
|   HERO IMAGE       |
|   (3:4 ratio)      |
|   200x267px        |
|                    |
|   * Available      |  <- status dot, bottom-left overlay
|   [fav] [board] [msg]  <- top-right, hover only
+--------------------+
| Sofia Reyes   *scr |  <- 14px/600 + score ring
| Editorial . 178cm  |  <- 12px, --ag-text-2
| [runway]  [nyc]    |  <- 11px tag chips, max 2
+--------------------+
```

| Breakpoint | Columns |
|------------|---------|
| >= 1440px | 4 columns |
| 1024-1439px | 3 columns |
| < 1024px | 2 columns |

**Status dot colors:**
- Green (`--ag-status-available`): Available
- Amber (`--ag-status-on-hold`): On hold
- Blue (`--ag-status-on-booking`): On booking
- Gray (`--ag-status-inactive`): Inactive

**Hover:** Scale 1.02 + shadow (`--ag-shadow-gold`). Quick-action icons fade in.

**Click:** Opens detail panel. Grid compresses columns to accommodate.

### List View Toggle

Compact table for spec-based searching:

| Column | Content |
|--------|---------|
| Photo | 36x36 avatar |
| Name | Full name, sortable |
| Type | Archetype pill |
| Ht | Height in cm, sortable |
| Status | Colored dot + label |
| Tags | Chip list |

- Sortable columns (click header)
- Same row selection + detail panel behavior as Inbox

### Roster Filters

- **Search:** Name, tag, city — instant filter
- **Gender:** All / Female / Male / Non-binary
- **Archetype:** Editorial / Commercial / Runway / Fitness / Plus
- **Status:** Available / On Booking / On Hold / Inactive
- **Height range:** Min-max slider
- **Tags:** Multi-select from agency tags

### Roster Detail Panel

Same panel shell, **context-aware actions** change:

| Element | Roster Context |
|---------|---------------|
| Actions | Add to Board, Message, Stats (replaces Accept/Shortlist/Decline) |
| Subtitle | "Signed Jan '26 . 14 bookings" (replaces "Applied 2d ago") |
| Status control | Availability dropdown (Available/On Hold/On Booking/Inactive) |
| Tabs | Bio, Notes, **Bookings** (replaces History), Messages |

---

## 5. Casting Page (Spoke)

Manages active casting boards and their pipelines.

### Board List View (default, no board selected)

```
+--------------+ +--------------+ +--------------+ +--------------+
| Nike SS26    | | Vogue Sept   | | Zara Look    | | + New        |
| Nike Inc.    | | Conde Nast   | | Zara         | |   Board      |
| ========---- | | =========--- | | ===--------- | |              |
| 3/8 booked   | | 7/10         | | 2/12         | |              |
| Closes 4/1   | | Closes 3/28  | | Open         | |              |
+--------------+ +--------------+ +--------------+ +--------------+
```

- Gold progress bar showing slots filled
- Status: active (gold dot), closed (gray), urgent (red — closing within 48h)

### Board Selector Bar (board selected)

```
+----------------------------------------------------+
| < All Boards   Nike SS26 Campaign v   [+ New]      |
|                Nike Inc. . 3/8 booked . Closes 4/1  |
+----------------------------------------------------+
```

- Back arrow to board list
- Board name dropdown for switching
- Board metadata inline

### Pipeline Kanban

Same kanban pattern as Inbox, but scoped to one board's candidates.

**Columns:** Applied -> Shortlisted -> Offered -> Booked -> Passed

Cards show **match score prominently** (casting context — fit matters).

### Casting Detail Panel Additions

Same base panel, adds **Match Breakdown** tab:

```
|  Match Score: 92                        |
|  +----------------------------------+  |
|  | Height    ============--  88%    |  |
|  | Age       =============- 92%    |  |
|  | Type      =============== 100%  |  |
|  | Location  ==========---- 72%    |  |
|  | Exp.      =============- 90%    |  |
|  +----------------------------------+  |
```

Horizontal bar chart showing talent score against each board requirement weight.

---

## 6. Discover Page (Spoke)

Preserves its distinct "The Signal" identity. Minimal structural changes.

### Keep
- Dark theme, grain texture (`Grainient` component)
- NL search bar with intent chip cycling
- Masonry grid layout

### Align
- Talent click opens the same adaptive detail panel (inherits dark theme via CSS class)
- Detail panel actions: **Invite to Apply** (primary), **Add to Board** (secondary)

### Remove
- Resonance rings (visual noise — let masonry grid and search do the work)

---

## 7. Overview Page (Spoke)

Moves from default landing to a **reporting dashboard**. Agents land on Inbox now.

### Layout

```
+-----------------------------------------------------------+
|  Good morning, Sarah.              March 21, 2026          |
|                                                            |
|  +----------+ +----------+ +----------+ +----------+      |
|  | 24       | | 142      | | 8        | | 92%      |      |
|  | Pending  | | Roster   | | Active   | | Response |      |
|  | Apps     | | Size     | | Castings | | Rate     |      |
|  +----------+ +----------+ +----------+ +----------+      |
|                                                            |
|  +- Attention Strip ------------------------------------+  |
|  | ! 3 apps waiting >48h  | # 2 interviews today       |  |
|  | * 5 reminders due      | $ Nike board closes 4/1    |  |
|  +------------------------------------------------------+  |
|                                                            |
|  +- Recent Applicants ----------+ +- Archetype Mix -----+ |
|  | Maya Chen    2d  Pending     | |    [Donut Chart]     | |
|  | James Park   3d  Reviewed    | | Editorial  38%       | |
|  | Sofia Reyes  5d  Shortlisted | | Commercial 28%       | |
|  | [View all ->]                | | Runway     20%       | |
|  +------------------------------+ | Other      14%       | |
|                                    +---------------------+ |
+------------------------------------------------------------+
```

- **KPI cards:** Animated counters (existing). Clickable — links to relevant page.
- **Attention strip:** Urgent items only. Color-coded by type. Click navigates to context.
- **Recent applicants:** Top 5, links to Inbox with applicant selected.
- **Archetype donut:** Visual breakdown of roster composition (existing).

---

## 8. Shared Component Specs

### TalentDetailPanel (refactored from TalentPanel)

```
Props:
  applicationId?: string    // primary key for inbox + casting contexts
  profileId: string         // primary key for roster + discover contexts
  context: 'inbox' | 'roster' | 'casting' | 'discover'
  boardId?: string          // casting context only
  onClose: () => void
  mode: 'fixed' | 'drawer'  // determined by parent based on viewport
```

**Note on primary key:** In `inbox` and `casting` contexts, the primary entity is an Application (which contains a `profile_id`). The component uses `applicationId` to fetch from `GET /api/agency/applications/:id`. In `roster` and `discover` contexts, it uses `profileId` to fetch from `GET /api/agency/roster/:profileId` or `GET /api/agency/discover/:profileId/preview`.

**Context-aware rendering matrix:**

| Section | Inbox | Roster | Casting | Discover |
|---------|-------|--------|---------|----------|
| Actions | Accept / Shortlist / Decline | Add to Board / Message / Stats | Move Stage / Remove / Note | Invite / Add to Board |
| Subtitle | "Applied 2d ago . Score: 92" | "Signed Jan '26 . 14 bookings" | "Score: 92 . Stage: Shortlisted" | "Editorial . Milan" |
| Tabs | Bio, Notes, History, Msgs | Bio, Notes, Bookings, Msgs | Bio, Notes, Match, History | Bio, Portfolio |
| Status control | -- | Availability dropdown | Stage dropdown | -- |
| Tags | Yes | Yes | Yes | -- |
| Reminders | Yes | Yes | -- | -- |

**Fixed mode (>=1280px):**
- Width: 55% of page area (`--ag-panel-w`)
- Full height, independently scrollable
- Left border: `1px solid --ag-surface-4`
- No backdrop, no animation — instant render

**Drawer mode (<1280px):**
- Slides from right, 480px wide (`--ag-panel-drawer-w`), max 90vw
- Backdrop: `rgba(0,0,0,0.3)`, click to dismiss
- Spring animation: `stiffness: 320, damping: 32` (utility panel tier)

### RichRow

List item for Inbox and any list-mode view.

```
Props:
  application: Application
  isSelected: boolean
  isChecked: boolean         // bulk select
  onSelect: () => void
  onCheck: () => void
  onQuickAction: (action: string) => void
```

- Height: 76px (`--ag-row-h`)
- Selected: 3px left border `--ag-gold`, bg `--ag-gold-ghost`
- Unread: 6px gold dot, left edge
- Hover: bg `--ag-surface-2`, checkbox fades in

### TalentCard

Grid card for Roster and Board list views.

```
Props:
  profile: Profile
  status?: 'available' | 'on_booking' | 'on_hold' | 'inactive'
  matchScore?: number
  tags?: Tag[]
  onSelect: () => void
  showQuickActions?: boolean
```

- Image ratio: 3:4 (`--ag-card-ratio`)
- Grid gap: 16px (`--ag-grid-gap`)
- Hover: `transform: scale(1.02)`, shadow `--ag-shadow-gold`
- Transition: `--ag-duration --ag-ease`

### MatchScoreRing

```
Props:
  score: number (0-100)
  size: 'sm' (24px) | 'md' (36px) | 'lg' (56px)
```

| Threshold | Color |
|-----------|-------|
| >= 80 | `--ag-gold` (`--ag-score-high`) |
| >= 60 | `--ag-success` (`--ag-score-mid`) |
| < 60 | `--ag-text-3` (`--ag-score-low`) |

SVG circle with `stroke-dasharray`. Center text: score number (sm omits text).

### FilterBar

```
Props:
  filters: FilterConfig[]     // { key, label, type, options }
  activeFilters: FilterState
  onChange: (filters) => void
  presets?: FilterPreset[]
  onSavePreset: (name, filters) => void
  viewMode: 'list' | 'kanban' | 'grid'
  onViewModeChange: (mode) => void
  searchPlaceholder: string
```

Filter types: `select` (single dropdown), `multi` (multi-select chips), `range` (min/max slider), `search` (debounced text input).

### BulkActionToolbar

```
Props:
  selectedCount: number
  context: 'inbox' | 'roster' | 'casting'
  onAction: (action, ids) => void
  onClearSelection: () => void
```

**Actions by context:**
- **Inbox:** Shortlist, Decline, Archive, Tag, Add to Board
- **Roster:** Tag, Add to Board, Message, Change Status
- **Casting:** Move Stage, Remove from Board, Tag

Slides down from top of list (`transform: translateY`). Gold-tinted bg (`--ag-gold-ghost`). Height: 48px.

### ActionButtonGroup

```
Props:
  context: 'inbox' | 'roster' | 'casting' | 'discover'
  applicationId?: string
  profileId: string
  currentStatus?: string
  onAction: (action) => void
```

Row of 3 buttons, equal width. Default: outlined/muted. Hover: fill with semantic color. Active: filled bg, white text.

### KanbanColumn

```
Props:
  stage: string
  count: number
  cards: Application[]
  onDrop: (applicationId, newStage) => void
  onCardClick: (applicationId) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
```

Min-width: 220px. Flex: 1. Scrollable card area. Drop zone highlight on drag-over.

### KeyboardShortcutOverlay

Triggered by `?`. Modal overlay, centered, 480px wide. Two-column layout (action | key). Grouped: Navigation, Triage, Selection, Views. Dismiss: Esc or click outside.

---

## 9. Design Token Additions

New tokens to add to `client/src/styles/agency-tokens.css`:

```css
/* Panel system */
--ag-panel-w: 55%;
--ag-panel-drawer-w: 480px;
/* NOTE: --ag-panel-breakpoint is documentation-only. CSS custom properties
   cannot be used in @media queries. Hardcode 1280px in media queries. */
--ag-panel-breakpoint: 1280px;

/* List density */
--ag-row-h: 76px;
--ag-row-h-compact: 44px;
--ag-row-h-card: 96px;

/* Grid system */
--ag-card-ratio: 3/4;
--ag-grid-gap: 16px;
--ag-grid-cols-xl: 4;    /* >=1440px */
--ag-grid-cols-lg: 3;    /* 1024-1439px */
--ag-grid-cols-md: 2;    /* <1024px */

/* Semantic status colors */
--ag-status-available: #2D8A56;
--ag-status-on-booking: #3B7DD8;
--ag-status-on-hold: #C2850E;
--ag-status-inactive: #9C958E;

/* Score thresholds */
--ag-score-high: var(--ag-gold);
--ag-score-mid: var(--ag-success);
--ag-score-low: var(--ag-text-3);

/* Kanban */
--ag-kanban-col-min: 220px;
--ag-kanban-card-gap: 8px;
--ag-kanban-drop-border: 2px dashed var(--ag-gold);
```

### Typography Scale (existing, documented)

| Level | Spec | Usage |
|-------|------|-------|
| H1 | 24px / 1.2 / Playfair Display 700 | Page titles |
| H2 | 18px / 1.3 / Inter 600 | Section titles |
| H3 | 14px / 1.4 / Inter 600 | Card names, row names |
| Body | 14px / 1.5 / Inter 400 | Content |
| Caption | 12px / 1.4 / Inter 400 | Secondary text, metadata |
| Micro | 11px / 1.3 / Inter 500 | Tag chips, badges |

### Motion Specs (existing, documented)

| Type | Spec |
|------|------|
| Micro interactions | 150ms `--ag-ease` (hover, focus) |
| Standard transitions | 200ms `--ag-ease` (panels, filters) |
| Entrance animations | 400ms `--ag-ease-spring` (page content, card stagger) |
| Spring — content | stiffness: 55, damping: 16 (page entrances, hero reveals) |
| Spring — utility | stiffness: 320, damping: 32 (detail panel, toolbar, dropdowns) |

---

## 10. File Structure (New/Modified)

### New Components

```
client/src/components/agency/
  TalentDetailPanel.jsx       <- refactored from TalentPanel.jsx
  RichRow.jsx                 <- new: inbox list item
  TalentCard.jsx              <- new: roster/casting grid card
  FilterBar.jsx               <- new: shared filter UI
  ActionButtonGroup.jsx       <- new: context-aware action buttons
  KanbanColumn.jsx            <- new: reusable kanban column
  KanbanCard.jsx              <- new: compact kanban card
  KeyboardShortcutOverlay.jsx <- new: ? shortcut modal
  ui/
    MatchScoreRing.jsx        <- refactored from MatchScore + TalentMatchRing
```

### Modified Pages

```
client/src/routes/agency/
  InboxPage.jsx               <- renamed from ApplicantsPage, major rewrite
  InboxPage.css               <- new styles for master-detail + kanban
  RosterPage.jsx              <- refactored for card grid + adaptive panel
  RosterPage.css              <- updated
  CastingPage.jsx             <- board list + pipeline kanban
  CastingPage.css             <- updated
  OverviewPage.jsx            <- simplified reporting dashboard
  OverviewPage.css            <- updated
```

### Modified Layout

```
client/src/layouts/
  AgencyLayout.jsx            <- 56px topbar, reordered pills, count badges
  AgencyLayout.css            <- updated
```

### Modified Styles

```
client/src/styles/
  agency-tokens.css           <- new tokens added (Section 9)
```

---

## 11. API Dependencies

Most endpoints exist. **Four new endpoints are needed** before implementation.

### Existing Endpoints

| Feature | Endpoint | Status |
|---------|----------|--------|
| Inbox list | `GET /api/agency/applications` | Exists |
| Bulk accept/decline/archive | `POST /api/agency/applications/bulk-*` | Exists |
| Bulk tag | `POST /api/agency/applications/bulk-tag` | Exists |
| Filter presets | `GET/POST /api/agency/filter-presets` | Exists |
| Detail data | `GET /api/agency/applications/:id` | Exists |
| Status update | `PATCH /api/agency/applications/:id/status` | Exists |
| Notes CRUD | `/api/agency/applications/:id/notes` | Exists |
| Tags CRUD | `/api/agency/applications/:id/tags` | Exists |
| Timeline | `GET /api/agency/applications/:id/timeline` | Exists |
| Messages | `/api/agency/applications/:id/messages` | Exists |
| Roster single | `GET /api/agency/roster/:profileId` | Exists |
| Boards | `GET /api/agency/boards` | Exists |
| Board detail | `GET /api/agency/boards/:id` | Exists |
| Board scoring | `POST /api/agency/boards/:id/calculate-scores` | Exists |
| Assign to board | `POST /api/agency/applications/:id/assign-board` | Exists |
| Discovery | `GET /api/agency/discover` | Exists |
| Overview stats | `GET /api/agency/overview/stats` | Exists |

### New Endpoints Required

| Feature | Endpoint | Description |
|---------|----------|-------------|
| Roster list | `GET /api/agency/roster` | List all signed talent (filter by status, archetype, gender, height range, tags). Currently only the single-profile endpoint exists. |
| Board candidates | `GET /api/agency/boards/:id/candidates` | Get all applications assigned to a board with profile data, images, and match scores. Needed for the casting pipeline kanban view. |
| Pipeline counts | `GET /api/agency/pipeline-counts` | Return counts by application status (pending, shortlisted, offered, etc.) for nav badge counts. |
| Bulk shortlist | `POST /api/agency/applications/bulk-shortlist` | Bulk-update applications to shortlisted status. Alternatively, `PATCH /api/agency/applications/bulk-status` with a `{status: 'shortlisted'}` body would work — just needs to be created. |

### Shortlist Action Mapping

The "Shortlist" action (keyboard `s`, bulk action, detail panel button) maps to setting application status to `shortlisted` via `PATCH /api/agency/applications/:id/status` with `{status: 'shortlisted'}`. This endpoint exists for single updates. The bulk variant needs to be created.

---

## 12. Loading, Empty & Error States

### Loading States
- **List/Grid:** Skeleton rows/cards matching the shape of RichRow or TalentCard. Shimmer animation. Show 8 skeleton items.
- **Detail panel:** Skeleton with image placeholder (gray rectangle), 3 text lines, button placeholders.
- **Kanban columns:** Skeleton cards (2 per column).
- **Overview KPI cards:** Pulse animation on number placeholders.

### Empty States
- **Inbox zero:** Centered illustration + "All caught up" message + "Check Discover for new talent" CTA. Uses existing `AgencyEmptyState` component.
- **Roster empty:** "No signed talent yet" + "Review your inbox" CTA.
- **Casting no boards:** "Create your first casting board" + `+ New Board` button.
- **No search results:** "No matches for [query]" + "Try adjusting filters" suggestion.

### Error States
- **API failure:** Inline error banner at top of list/grid area with retry button. Does not replace the full page.
- **Detail panel load failure:** Error message within the panel with retry. Panel stays open.
- **Bulk action failure:** Toast notification (Sonner) with error count ("3 of 12 failed") and retry option.

---

## 13. Standalone Page Disposition

The current codebase has standalone pages that overlap with functionality now embedded in the hub. Disposition:

| Page | Decision | Rationale |
|------|----------|-----------|
| `BoardsPage` | **Keep** | Board list view lives here; Casting page links to it |
| `AnalyticsPage` | **Keep** | Stays as a nav pill |
| `InterviewsPage` | **Keep as secondary route** | Accessible from Overview attention strip + detail panel. Not in nav pills. |
| `RemindersPage` | **Keep as secondary route** | Same as Interviews — accessible from Overview + detail panel. |
| `MessagesPage` | **Keep as secondary route** | Full message inbox. Header icon links here. Detail panel shows per-application thread. |
| `ActivityPage` | **Keep as secondary route** | Global activity feed. Accessible from Overview. |
| `SignedPage` | **Remove** | Redundant with Roster page |

Secondary routes are accessible via direct URL (`/dashboard/agency/interviews`) and linked from relevant UI (attention strip, detail panel shortcuts), but do not appear in the nav pills.

---

## 14. Out of Scope

- Real-time WebSocket notifications (future enhancement)
- Commission tracking UI (separate spec)
- Export UI for CSV/JSON (API exists, UI deferred)
- Mobile-native responsive layout (tablet minimum)
- Dark mode for non-Discover pages
- Settings page redesign (functional as-is)
- Onboarding page redesign (functional as-is)
