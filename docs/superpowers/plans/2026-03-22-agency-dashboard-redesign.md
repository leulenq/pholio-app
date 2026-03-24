# Agency Dashboard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the agency dashboard as a hub+spokes layout with Inbox as the primary triage workspace, featuring master-detail split, kanban toggle, adaptive detail panel, and optimized spoke pages.

**Architecture:** Bottom-up build — design tokens first, then shared primitives (MatchScoreRing, RichRow, TalentCard), then shared composites (FilterBar, TalentDetailPanel, KanbanColumn), then pages (Inbox hub, then Roster/Casting/Discover/Overview spokes), then layout and routing last.

**Tech Stack:** React 19, Vite, React Router v7, TanStack Query v5, Framer Motion, @dnd-kit, Lucide React, CSS custom properties, Sonner (toasts)

**Spec:** `docs/superpowers/specs/2026-03-21-agency-dashboard-design.md`

---

## Dependency Graph

```
Task 1 (Tokens) ──────────────────────────────────┐
Task 2 (API: pipeline-counts) ─────────────────────┤
Task 3 (MatchScoreRing) ──► Task 5 (RichRow) ─────┤
                           ──► Task 6 (TalentCard) ┤
Task 4 (FilterBar) ───────────────────────────────►┤
Task 7 (ActionButtonGroup) ──► Task 8 (DetailPanel)┤
Task 9 (KanbanColumn+Card) ───────────────────────►┤
Task 10 (BulkActionToolbar) ──────────────────────►┤
Task 11 (KeyboardShortcuts) ──────────────────────►┤
                                                    ▼
Task 12 (InboxPage) ◄── all shared components ─────┘
Task 13 (RosterPage) ◄── TalentCard, FilterBar, DetailPanel
Task 14 (CastingPage) ◄── KanbanColumn, DetailPanel
Task 15 (DiscoverPage) ◄── DetailPanel
Task 16 (OverviewPage) ◄── none (standalone)
Task 17 (AgencyLayout) ◄── none (can parallel with pages)
Task 18 (Routing + Cleanup)
```

**Parallelizable groups:**
- Tasks 1-2 (foundation) — independent
- Tasks 3-4 (primitives) — independent after Task 1
- Tasks 5-6-7-9-10-11 (components) — independent after Task 3
- Tasks 12-13-14-15-16-17 (pages) — independent after their deps
- Task 18 (routing) — last

---

## API Verification

The spec review flagged 4 "missing" endpoints. After reading the actual backend code:

| Endpoint | Spec Said | Actually | Action |
|----------|-----------|----------|--------|
| `GET /api/agency/roster` | Missing | **Exists** (line 3205 of `src/routes/api/agency.js`) | No work needed |
| `GET /api/agency/boards/:id/candidates` | Missing | **Exists** (line 902) | No work needed |
| `PATCH /api/agency/applications/bulk-status` | Missing | **Exists** as `bulkUpdateCastingApplicationStage` in client | No work needed |
| `GET /api/agency/pipeline-counts` | Missing | **Truly missing** | Task 2 |

Only **one new endpoint** is needed: `GET /api/agency/pipeline-counts`.

---

## Task 1: Design Token Additions

**Files:**
- Modify: `client/src/styles/agency-tokens.css`

- [ ] **Step 1: Read current tokens file**

Read `client/src/styles/agency-tokens.css` to find the insertion point (after existing tokens).

- [ ] **Step 2: Add new tokens**

Add the following block after the existing `/* ── Motion ──` section:

```css
/* ── Panel system ── */
--ag-panel-w: 55%;
--ag-panel-drawer-w: 480px;
--ag-panel-breakpoint: 1280px; /* documentation-only; hardcode in @media */

/* ── List density ── */
--ag-row-h: 76px;
--ag-row-h-compact: 44px;
--ag-row-h-card: 96px;

/* ── Grid system ── */
--ag-card-ratio: 3 / 4;
--ag-grid-gap: 16px;

/* ── Semantic status colors ── */
--ag-status-available: #2D8A56;
--ag-status-on-booking: #3B7DD8;
--ag-status-on-hold: #C2850E;
--ag-status-inactive: #9C958E;

/* ── Score thresholds ── */
--ag-score-high: var(--ag-gold);
--ag-score-mid: var(--ag-success);
--ag-score-low: var(--ag-text-3);

/* ── Kanban ── */
--ag-kanban-col-min: 220px;
--ag-kanban-card-gap: 8px;
```

- [ ] **Step 3: Verify tokens load**

Run: `cd client && npm run dev`
Open browser devtools on any agency page → Inspect `:root` → verify `--ag-panel-w` etc. are present.

- [ ] **Step 4: Commit**

```bash
git add client/src/styles/agency-tokens.css
git commit -m "feat(tokens): add panel, grid, status, and kanban design tokens"
```

---

## Task 2: Pipeline Counts API Endpoint

**Files:**
- Modify: `src/routes/api/agency.js`
- Modify: `client/src/api/agency.js`

- [ ] **Step 1: Add backend endpoint**

In `src/routes/api/agency.js`, add before the export/closing section:

```javascript
// GET /api/agency/pipeline-counts
router.get('/pipeline-counts', requireAuth, requireRole('AGENCY'), async (req, res) => {
  const agencyId = getSessionAgencyId(req);
  const rows = await req.db('applications')
    .where({ agency_id: agencyId })
    .select('status')
    .count('* as count')
    .groupBy('status');

  const counts = {};
  for (const row of rows) {
    counts[row.status] = parseInt(row.count, 10);
  }
  res.json({ success: true, data: counts });
});
```

- [ ] **Step 2: Add client function**

In `client/src/api/agency.js`, verify that `getPipelineCounts` already exists (it does at ~line 168). If not, add:

```javascript
export async function getPipelineCounts() {
  return request('/pipeline-counts');
}
```

- [ ] **Step 3: Test manually**

Run: `npm run dev:all`
Visit: `http://localhost:3000/api/agency/pipeline-counts` (with active session)
Expected: JSON object with status counts like `{ "pending": 5, "accepted": 3, ... }`

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/agency.js client/src/api/agency.js
git commit -m "feat(api): add pipeline-counts endpoint for nav badge counts"
```

---

## Task 3: MatchScoreRing Component

Consolidates existing `MatchScore.jsx` + `TalentMatchRing.jsx` into one SVG component.

**Files:**
- Create: `client/src/components/agency/ui/MatchScoreRing.jsx`
- Reference: `client/src/components/agency/ui/TalentMatchRing.jsx` (existing, for pattern)

- [ ] **Step 1: Create MatchScoreRing**

```jsx
import { motion } from 'framer-motion';

const SIZES = { sm: 24, md: 36, lg: 56 };
const STROKE = { sm: 2.5, md: 3, lg: 4 };

function scoreColor(score) {
  if (score >= 80) return 'var(--ag-score-high)';
  if (score >= 60) return 'var(--ag-score-mid)';
  return 'var(--ag-score-low)';
}

export default function MatchScoreRing({ score, size = 'sm' }) {
  const dim = SIZES[size];
  const stroke = STROKE[size];
  const r = (dim - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = scoreColor(score);

  return (
    <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} style={{ flexShrink: 0 }}>
      <circle
        cx={dim / 2} cy={dim / 2} r={r}
        fill="none" stroke="var(--ag-surface-4)" strokeWidth={stroke}
      />
      <motion.circle
        cx={dim / 2} cy={dim / 2} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
      />
      {size !== 'sm' && (
        <text
          x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
          fill="var(--ag-text-0)"
          fontSize={dim * 0.32} fontWeight={600} fontFamily="var(--ag-font-body)"
        >
          {score}
        </text>
      )}
    </svg>
  );
}
```

- [ ] **Step 2: Verify it renders**

Temporarily import into any existing page and render `<MatchScoreRing score={85} size="md" />`. Verify gold ring with "85" center text.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/agency/ui/MatchScoreRing.jsx
git commit -m "feat(ui): add MatchScoreRing component consolidating score displays"
```

---

## Task 4: FilterBar Component

Shared filter UI used by Inbox, Roster, and Casting pages.

**Files:**
- Create: `client/src/components/agency/FilterBar.jsx`
- Create: `client/src/components/agency/FilterBar.css`

- [ ] **Step 1: Create FilterBar component**

```jsx
import { useState, useRef, useEffect } from 'react';
import { Search, X, List, Columns3, LayoutGrid, SlidersHorizontal } from 'lucide-react';
import './FilterBar.css';

export default function FilterBar({
  filters = [],
  activeFilters = {},
  onChange,
  presets = [],
  activePreset = null,
  onSelectPreset,
  onSavePreset,
  viewMode = 'list',
  onViewModeChange,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  viewModes = ['list', 'kanban'],
}) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const activeCount = Object.values(activeFilters).filter(v =>
    Array.isArray(v) ? v.length > 0 : v != null && v !== ''
  ).length;

  return (
    <div className="ag-filter-bar">
      {/* Row 1: Preset + Search + View Toggle */}
      <div className="ag-filter-bar__row1">
        {presets.length > 0 && (
          <select
            className="ag-filter-bar__preset"
            value={activePreset || ''}
            onChange={e => onSelectPreset?.(e.target.value || null)}
          >
            <option value="">All</option>
            {presets.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        <div className="ag-filter-bar__search">
          <Search size={16} className="ag-filter-bar__search-icon" />
          <input
            type="text"
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="ag-filter-bar__search-input"
          />
          {searchValue && (
            <button className="ag-filter-bar__search-clear" onClick={() => onSearchChange('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="ag-filter-bar__actions">
          {filters.length > 0 && (
            <button
              className={`ag-filter-bar__toggle ${filtersExpanded ? 'is-active' : ''}`}
              onClick={() => setFiltersExpanded(!filtersExpanded)}
            >
              <SlidersHorizontal size={16} />
              {activeCount > 0 && <span className="ag-filter-bar__badge">{activeCount}</span>}
            </button>
          )}

          <div className="ag-filter-bar__views">
            {viewModes.includes('list') && (
              <button
                className={`ag-filter-bar__view-btn ${viewMode === 'list' ? 'is-active' : ''}`}
                onClick={() => onViewModeChange('list')}
                title="List view"
              >
                <List size={16} />
              </button>
            )}
            {viewModes.includes('kanban') && (
              <button
                className={`ag-filter-bar__view-btn ${viewMode === 'kanban' ? 'is-active' : ''}`}
                onClick={() => onViewModeChange('kanban')}
                title="Kanban view"
              >
                <Columns3 size={16} />
              </button>
            )}
            {viewModes.includes('grid') && (
              <button
                className={`ag-filter-bar__view-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
                onClick={() => onViewModeChange('grid')}
                title="Grid view"
              >
                <LayoutGrid size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Filter chips (expandable) */}
      {filtersExpanded && filters.length > 0 && (
        <div className="ag-filter-bar__row2">
          {filters.map(f => (
            <FilterChip
              key={f.key}
              filter={f}
              value={activeFilters[f.key]}
              onChange={val => onChange({ ...activeFilters, [f.key]: val })}
            />
          ))}
          {activeCount > 0 && (
            <button className="ag-filter-bar__clear" onClick={() => onChange({})}>
              <X size={12} /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ filter, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const hasValue = Array.isArray(value) ? value.length > 0 : value != null && value !== '';

  if (filter.type === 'select' || filter.type === 'multi') {
    return (
      <div className="ag-filter-chip" ref={ref}>
        <button
          className={`ag-filter-chip__trigger ${hasValue ? 'has-value' : ''}`}
          onClick={() => setOpen(!open)}
        >
          {filter.label} {hasValue ? `(${Array.isArray(value) ? value.length : 1})` : ''}
        </button>
        {open && (
          <div className="ag-filter-chip__dropdown">
            {filter.options.map(opt => {
              const optValue = typeof opt === 'string' ? opt : opt.value;
              const optLabel = typeof opt === 'string' ? opt : opt.label;
              const isSelected = filter.type === 'multi'
                ? (value || []).includes(optValue)
                : value === optValue;

              return (
                <button
                  key={optValue}
                  className={`ag-filter-chip__option ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => {
                    if (filter.type === 'multi') {
                      const arr = value || [];
                      onChange(isSelected ? arr.filter(v => v !== optValue) : [...arr, optValue]);
                    } else {
                      onChange(isSelected ? null : optValue);
                      setOpen(false);
                    }
                  }}
                >
                  {optLabel}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null; // range type can be added later
}
```

- [ ] **Step 2: Create FilterBar.css**

```css
.ag-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid var(--ag-border);
}

.ag-filter-bar__row1 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ag-filter-bar__preset {
  padding: 6px 12px;
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface-1);
  font-size: 13px;
  color: var(--ag-text-1);
  cursor: pointer;
}

.ag-filter-bar__search {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.ag-filter-bar__search-icon {
  position: absolute;
  left: 10px;
  color: var(--ag-text-3);
  pointer-events: none;
}

.ag-filter-bar__search-input {
  width: 100%;
  padding: 8px 32px 8px 34px;
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface-1);
  font-size: 13px;
  color: var(--ag-text-0);
  outline: none;
  transition: border-color var(--ag-duration-fast) var(--ag-ease);
}

.ag-filter-bar__search-input:focus {
  border-color: var(--ag-gold);
}

.ag-filter-bar__search-clear {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: var(--ag-text-3);
  cursor: pointer;
  padding: 2px;
}

.ag-filter-bar__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ag-filter-bar__toggle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface-1);
  color: var(--ag-text-2);
  cursor: pointer;
  transition: all var(--ag-duration-fast) var(--ag-ease);
}

.ag-filter-bar__toggle.is-active {
  border-color: var(--ag-gold);
  color: var(--ag-gold);
}

.ag-filter-bar__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--ag-gold);
  color: white;
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ag-filter-bar__views {
  display: flex;
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  overflow: hidden;
}

.ag-filter-bar__view-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: var(--ag-surface-1);
  color: var(--ag-text-3);
  cursor: pointer;
  transition: all var(--ag-duration-fast) var(--ag-ease);
}

.ag-filter-bar__view-btn + .ag-filter-bar__view-btn {
  border-left: 1px solid var(--ag-border);
}

.ag-filter-bar__view-btn.is-active {
  background: var(--ag-gold);
  color: white;
}

.ag-filter-bar__row2 {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ag-filter-bar__clear {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  background: none;
  color: var(--ag-text-3);
  font-size: 12px;
  cursor: pointer;
}

.ag-filter-bar__clear:hover {
  color: var(--ag-danger);
}

.ag-filter-chip {
  position: relative;
}

.ag-filter-chip__trigger {
  padding: 5px 12px;
  border: 1px solid var(--ag-border);
  border-radius: 16px;
  background: var(--ag-surface-1);
  font-size: 12px;
  color: var(--ag-text-2);
  cursor: pointer;
  transition: all var(--ag-duration-fast) var(--ag-ease);
}

.ag-filter-chip__trigger.has-value {
  border-color: var(--ag-gold);
  color: var(--ag-gold);
  background: var(--ag-gold-ghost);
}

.ag-filter-chip__dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 160px;
  padding: 4px;
  background: var(--ag-surface-1);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  box-shadow: var(--ag-shadow-md);
  z-index: 50;
}

.ag-filter-chip__option {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: none;
  text-align: left;
  font-size: 12px;
  color: var(--ag-text-1);
  border-radius: var(--ag-radius-sm);
  cursor: pointer;
}

.ag-filter-chip__option:hover {
  background: var(--ag-surface-2);
}

.ag-filter-chip__option.is-selected {
  background: var(--ag-gold-ghost);
  color: var(--ag-gold);
  font-weight: 500;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/agency/FilterBar.jsx client/src/components/agency/FilterBar.css
git commit -m "feat(ui): add shared FilterBar component with presets, search, filters, view toggle"
```

---

## Task 5: RichRow Component

The list item for Inbox master-detail view.

**Files:**
- Create: `client/src/components/agency/RichRow.jsx`
- Create: `client/src/components/agency/RichRow.css`

- [ ] **Step 1: Create RichRow component**

```jsx
import MatchScoreRing from './ui/MatchScoreRing';
import TalentTypePill from './ui/TalentTypePill';
import { formatDistanceToNowStrict } from 'date-fns';
import './RichRow.css';

export default function RichRow({
  application,
  isSelected = false,
  isChecked = false,
  onSelect,
  onCheck,
}) {
  const {
    name, photo, type, height_cm, match_score,
    created_at, tags = [], status, viewed,
  } = application;

  const timeAgo = created_at
    ? formatDistanceToNowStrict(new Date(created_at), { addSuffix: true })
    : '';

  return (
    <div
      className={`ag-rich-row ${isSelected ? 'is-selected' : ''}`}
      onClick={() => onSelect?.(application)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onSelect?.(application); }}
    >
      {/* Checkbox / Unread dot */}
      <div className="ag-rich-row__check" onClick={e => { e.stopPropagation(); onCheck?.(application); }}>
        {isChecked !== undefined && (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => onCheck?.(application)}
            className="ag-rich-row__checkbox"
          />
        )}
        {!viewed && !isChecked && <span className="ag-rich-row__unread" />}
      </div>

      {/* Avatar */}
      <img
        src={photo || '/placeholder-avatar.png'}
        alt={name}
        className="ag-rich-row__avatar"
      />

      {/* Content */}
      <div className="ag-rich-row__content">
        <div className="ag-rich-row__line1">
          <span className="ag-rich-row__name">{name}</span>
          <span className="ag-rich-row__meta">
            {match_score != null && <MatchScoreRing score={match_score} size="sm" />}
            <span className="ag-rich-row__time">{timeAgo}</span>
          </span>
        </div>
        <div className="ag-rich-row__line2">
          <TalentTypePill type={type} size="sm" />
          {height_cm && <span className="ag-rich-row__stat">{height_cm}cm</span>}
        </div>
        {tags.length > 0 && (
          <div className="ag-rich-row__line3">
            {tags.slice(0, 3).map(t => (
              <span key={t.tag || t} className="ag-rich-row__tag">{t.tag || t}</span>
            ))}
            {tags.length > 3 && (
              <span className="ag-rich-row__tag ag-rich-row__tag--overflow">+{tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create RichRow.css**

```css
.ag-rich-row {
  display: flex;
  align-items: center;
  gap: 12px;
  height: var(--ag-row-h, 76px);
  padding: 0 16px;
  cursor: pointer;
  transition: background var(--ag-duration-fast) var(--ag-ease);
  border-left: 3px solid transparent;
  position: relative;
}

.ag-rich-row:hover {
  background: var(--ag-surface-2);
}

.ag-rich-row:hover .ag-rich-row__checkbox {
  opacity: 1;
}

.ag-rich-row.is-selected {
  border-left-color: var(--ag-gold);
  background: var(--ag-gold-ghost, rgba(201, 165, 90, 0.08));
}

.ag-rich-row__check {
  width: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ag-rich-row__checkbox {
  opacity: 0;
  cursor: pointer;
  accent-color: var(--ag-gold);
  transition: opacity var(--ag-duration-fast) var(--ag-ease);
}

.ag-rich-row__checkbox:checked {
  opacity: 1;
}

.ag-rich-row__unread {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ag-gold);
}

.ag-rich-row__avatar {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.ag-rich-row__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ag-rich-row__line1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ag-rich-row__name {
  font-weight: 600;
  font-size: 14px;
  color: var(--ag-text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ag-rich-row__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ag-rich-row__time {
  font-size: 12px;
  color: var(--ag-text-3);
  white-space: nowrap;
}

.ag-rich-row__line2 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ag-text-2);
}

.ag-rich-row__stat {
  font-size: 12px;
  color: var(--ag-text-2);
}

.ag-rich-row__line3 {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 1px;
}

.ag-rich-row__tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ag-surface-3);
  font-size: 11px;
  font-weight: 500;
  color: var(--ag-text-2);
}

.ag-rich-row__tag--overflow {
  color: var(--ag-text-3);
  background: none;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/agency/RichRow.jsx client/src/components/agency/RichRow.css
git commit -m "feat(ui): add RichRow component for inbox list items"
```

---

## Task 6: TalentCard Component

Grid card for Roster and Board list views.

**Files:**
- Create: `client/src/components/agency/TalentCard.jsx`
- Create: `client/src/components/agency/TalentCard.css`

- [ ] **Step 1: Create TalentCard component**

```jsx
import MatchScoreRing from './ui/MatchScoreRing';
import TalentTypePill from './ui/TalentTypePill';
import { ClipboardList, MessageCircle, Bookmark } from 'lucide-react';
import './TalentCard.css';

const STATUS_COLORS = {
  available: 'var(--ag-status-available)',
  on_booking: 'var(--ag-status-on-booking)',
  on_hold: 'var(--ag-status-on-hold)',
  inactive: 'var(--ag-status-inactive)',
};

const STATUS_LABELS = {
  available: 'Available',
  on_booking: 'On Booking',
  on_hold: 'On Hold',
  inactive: 'Inactive',
};

export default function TalentCard({
  profile,
  status,
  matchScore,
  tags = [],
  onSelect,
  showQuickActions = true,
}) {
  const { name, photo, type, height_cm } = profile;

  return (
    <div className="ag-talent-card" onClick={() => onSelect?.(profile)}>
      <div className="ag-talent-card__image-wrap">
        <img
          src={photo || '/placeholder-avatar.png'}
          alt={name}
          className="ag-talent-card__image"
        />
        {status && (
          <span
            className="ag-talent-card__status"
            style={{ background: STATUS_COLORS[status] }}
            title={STATUS_LABELS[status]}
          />
        )}
        {showQuickActions && (
          <div className="ag-talent-card__quick-actions">
            <button className="ag-talent-card__qbtn" title="Bookmark" onClick={e => e.stopPropagation()}>
              <Bookmark size={14} />
            </button>
            <button className="ag-talent-card__qbtn" title="Add to Board" onClick={e => e.stopPropagation()}>
              <ClipboardList size={14} />
            </button>
            <button className="ag-talent-card__qbtn" title="Message" onClick={e => e.stopPropagation()}>
              <MessageCircle size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="ag-talent-card__info">
        <div className="ag-talent-card__row1">
          <span className="ag-talent-card__name">{name}</span>
          {matchScore != null && <MatchScoreRing score={matchScore} size="sm" />}
        </div>
        <div className="ag-talent-card__row2">
          <TalentTypePill type={type} size="sm" />
          {height_cm && <span className="ag-talent-card__stat">{height_cm}cm</span>}
        </div>
        {tags.length > 0 && (
          <div className="ag-talent-card__tags">
            {tags.slice(0, 2).map(t => (
              <span key={t.tag || t} className="ag-talent-card__tag">{t.tag || t}</span>
            ))}
            {tags.length > 2 && <span className="ag-talent-card__tag ag-talent-card__tag--overflow">+{tags.length - 2}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create TalentCard.css**

```css
.ag-talent-card {
  border-radius: 16px;
  overflow: hidden;
  background: var(--ag-surface-1);
  border: 1px solid var(--ag-border);
  cursor: pointer;
  transition: transform var(--ag-duration) var(--ag-ease),
              box-shadow var(--ag-duration) var(--ag-ease);
}

.ag-talent-card:hover {
  transform: scale(1.02);
  box-shadow: var(--ag-shadow-gold);
}

.ag-talent-card:hover .ag-talent-card__quick-actions {
  opacity: 1;
}

.ag-talent-card__image-wrap {
  position: relative;
  aspect-ratio: var(--ag-card-ratio, 3 / 4);
  overflow: hidden;
}

.ag-talent-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ag-talent-card__status {
  position: absolute;
  bottom: 10px;
  left: 10px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.ag-talent-card__quick-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--ag-duration-fast) var(--ag-ease);
}

.ag-talent-card__qbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: rgba(255,255,255,0.9);
  color: var(--ag-text-1);
  cursor: pointer;
  backdrop-filter: blur(4px);
}

.ag-talent-card__qbtn:hover {
  background: white;
  color: var(--ag-gold);
}

.ag-talent-card__info {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ag-talent-card__row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ag-talent-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ag-text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ag-talent-card__row2 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ag-text-2);
}

.ag-talent-card__stat {
  font-size: 12px;
}

.ag-talent-card__tags {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}

.ag-talent-card__tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ag-surface-3);
  font-size: 11px;
  font-weight: 500;
  color: var(--ag-text-2);
}

.ag-talent-card__tag--overflow {
  color: var(--ag-text-3);
  background: none;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/agency/TalentCard.jsx client/src/components/agency/TalentCard.css
git commit -m "feat(ui): add TalentCard grid component for roster and casting views"
```

---

## Task 7: ActionButtonGroup Component

Context-aware primary action buttons for the detail panel.

**Files:**
- Create: `client/src/components/agency/ActionButtonGroup.jsx`
- Create: `client/src/components/agency/ActionButtonGroup.css`

- [ ] **Step 1: Create ActionButtonGroup**

```jsx
import { Check, Star, X, ClipboardList, MessageCircle, BarChart3, UserPlus, ArrowRight, Trash2, StickyNote } from 'lucide-react';
import './ActionButtonGroup.css';

const ACTIONS_BY_CONTEXT = {
  inbox: [
    { key: 'accept', label: 'Accept', icon: Check, color: 'var(--ag-success)', shortcut: 'a' },
    { key: 'shortlist', label: 'Shortlist', icon: Star, color: 'var(--ag-gold)', shortcut: 's' },
    { key: 'decline', label: 'Decline', icon: X, color: 'var(--ag-danger)', shortcut: 'd' },
  ],
  roster: [
    { key: 'add-to-board', label: 'Add to Board', icon: ClipboardList, color: 'var(--ag-gold)' },
    { key: 'message', label: 'Message', icon: MessageCircle, color: 'var(--ag-info)' },
    { key: 'stats', label: 'Stats', icon: BarChart3, color: 'var(--ag-text-2)' },
  ],
  casting: [
    { key: 'move-stage', label: 'Move Stage', icon: ArrowRight, color: 'var(--ag-gold)' },
    { key: 'remove', label: 'Remove', icon: Trash2, color: 'var(--ag-danger)' },
    { key: 'note', label: 'Add Note', icon: StickyNote, color: 'var(--ag-text-2)' },
  ],
  discover: [
    { key: 'invite', label: 'Invite', icon: UserPlus, color: 'var(--ag-gold)' },
    { key: 'add-to-board', label: 'Add to Board', icon: ClipboardList, color: 'var(--ag-text-2)' },
  ],
};

export default function ActionButtonGroup({ context, currentStatus, onAction }) {
  const actions = ACTIONS_BY_CONTEXT[context] || [];

  return (
    <div className="ag-action-group">
      {actions.map(a => {
        const Icon = a.icon;
        const isActive = currentStatus === a.key;
        return (
          <button
            key={a.key}
            className={`ag-action-btn ${isActive ? 'is-active' : ''}`}
            style={{ '--action-color': a.color }}
            onClick={() => onAction(a.key)}
            title={a.shortcut ? `${a.label} (${a.shortcut})` : a.label}
          >
            <Icon size={16} />
            <span>{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create ActionButtonGroup.css**

```css
.ag-action-group {
  display: flex;
  gap: 8px;
}

.ag-action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  background: var(--ag-surface-1);
  color: var(--ag-text-2);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--ag-duration-fast) var(--ag-ease);
}

.ag-action-btn:hover {
  border-color: var(--action-color);
  color: var(--action-color);
  background: color-mix(in srgb, var(--action-color) 8%, transparent);
}

.ag-action-btn.is-active {
  background: var(--action-color);
  border-color: var(--action-color);
  color: white;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/agency/ActionButtonGroup.jsx client/src/components/agency/ActionButtonGroup.css
git commit -m "feat(ui): add ActionButtonGroup with context-aware actions for detail panel"
```

---

## Task 8: TalentDetailPanel Component

Refactored from TalentPanel. Adaptive (fixed vs drawer), context-aware.

**Files:**
- Create: `client/src/components/agency/TalentDetailPanel.jsx`
- Create: `client/src/components/agency/TalentDetailPanel.css`
- Reference: `client/src/components/agency/TalentPanel.jsx` (existing pattern)

- [ ] **Step 1: Create TalentDetailPanel**

This is the largest component. Key architecture decisions:
- Fetches its own data via React Query (keyed on applicationId or profileId)
- Delegates to existing sub-components: `NotesPanel`, `ActivityTimeline`, `MessageThread`
- Uses `ActionButtonGroup` for context-aware actions
- Uses `MatchScoreRing` for score display
- Tab state managed internally

```jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Tag, Plus, Clock, Calendar } from 'lucide-react';
import ActionButtonGroup from './ActionButtonGroup';
import MatchScoreRing from './ui/MatchScoreRing';
import TalentTypePill from './ui/TalentTypePill';
import TalentStatusBadge from './ui/TalentStatusBadge';
import NotesPanel from './NotesPanel';
import ActivityTimeline from './ActivityTimeline';
import TagManager from './TagManager';
import MessageThread from './MessageThread';
import ReminderSection from './ReminderSection';
import InterviewSection from './InterviewSection';
import {
  getApplicationDetails, acceptApplication, declineApplication,
  archiveApplication, updateCastingApplicationStage,
  fetchRosterProfile, getProfilePreview,
} from '../../api/agency';
import { formatDistanceToNowStrict } from 'date-fns';
import './TalentDetailPanel.css';

const TABS_BY_CONTEXT = {
  inbox: ['Bio', 'Notes', 'History', 'Messages'],
  roster: ['Bio', 'Notes', 'Bookings', 'Messages'],
  casting: ['Bio', 'Notes', 'Match', 'History'],
  discover: ['Bio', 'Portfolio'],
};

export default function TalentDetailPanel({
  applicationId,
  profileId,
  context = 'inbox',
  boardId,
  onClose,
  mode = 'fixed',
}) {
  const [activeTab, setActiveTab] = useState('Bio');
  const queryClient = useQueryClient();

  // Fetch data based on context
  const { data: detail, isLoading } = useQuery({
    queryKey: context === 'inbox' || context === 'casting'
      ? ['agency', 'application-detail', applicationId]
      : ['agency', 'profile-detail', profileId],
    queryFn: () => {
      if (context === 'inbox' || context === 'casting') return getApplicationDetails(applicationId);
      if (context === 'roster') return fetchRosterProfile(profileId);
      return getProfilePreview(profileId);
    },
    enabled: !!(applicationId || profileId),
  });

  const handleAction = async (action) => {
    if (!applicationId) return;
    try {
      if (action === 'accept') await acceptApplication(applicationId);
      else if (action === 'decline') await declineApplication(applicationId);
      // updateCastingApplicationStage calls PATCH /applications/:id/status — correct endpoint
      // despite the misleading name, it accepts any status payload
      else if (action === 'shortlist') await updateCastingApplicationStage(applicationId, { status: 'shortlisted' });
      else if (action === 'archive') await archiveApplication(applicationId);
      queryClient.invalidateQueries({ queryKey: ['agency'] });
    } catch (err) {
      console.error('Action failed:', err);
    }
  };

  const tabs = TABS_BY_CONTEXT[context] || TABS_BY_CONTEXT.inbox;

  if (mode === 'drawer') {
    return (
      <AnimatePresence>
        <motion.div className="ag-detail-backdrop" onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        />
        <motion.div className="ag-detail-panel ag-detail-panel--drawer"
          initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        >
          <PanelContent
            detail={detail} isLoading={isLoading} context={context}
            activeTab={activeTab} setActiveTab={setActiveTab} tabs={tabs}
            onClose={onClose} onAction={handleAction} applicationId={applicationId}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  // Fixed mode
  return (
    <div className="ag-detail-panel ag-detail-panel--fixed">
      <PanelContent
        detail={detail} isLoading={isLoading} context={context}
        activeTab={activeTab} setActiveTab={setActiveTab} tabs={tabs}
        onClose={onClose} onAction={handleAction} applicationId={applicationId}
      />
    </div>
  );
}

function PanelContent({ detail, isLoading, context, activeTab, setActiveTab, tabs, onClose, onAction, applicationId }) {
  if (isLoading || !detail) {
    return (
      <div className="ag-detail-panel__loading">
        <div className="ag-detail-panel__skeleton-hero" />
        <div className="ag-detail-panel__skeleton-lines">
          <div className="ag-detail-panel__skeleton-line" style={{ width: '60%' }} />
          <div className="ag-detail-panel__skeleton-line" style={{ width: '40%' }} />
          <div className="ag-detail-panel__skeleton-line" style={{ width: '50%' }} />
        </div>
      </div>
    );
  }

  const {
    name, first_name, last_name, photo, hero_image_path,
    type, archetype, age, height_cm, city, location,
    bio_curated, bio_raw, status, match_score,
    created_at, accepted_at, tags, measurements,
  } = detail;

  const displayName = name || `${first_name || ''} ${last_name || ''}`.trim();
  const heroImg = hero_image_path || photo;
  const displayType = type || archetype;

  return (
    <div className="ag-detail-panel__inner">
      {/* Hero */}
      <div className="ag-detail-panel__hero">
        {heroImg && <img src={heroImg} alt={displayName} className="ag-detail-panel__hero-img" />}
        <div className="ag-detail-panel__hero-gradient" />
        <button className="ag-detail-panel__close" onClick={onClose}><X size={18} /></button>
        {status && <TalentStatusBadge status={status} className="ag-detail-panel__status-badge" />}
      </div>

      {/* Identity */}
      <div className="ag-detail-panel__identity">
        <h2 className="ag-detail-panel__name">{displayName}</h2>
        <div className="ag-detail-panel__meta">
          {displayType && <TalentTypePill type={displayType} />}
          {age && <span>{age}</span>}
          {height_cm && <span>{height_cm}cm</span>}
          {(city || location) && <span>{city || location}</span>}
        </div>
        <div className="ag-detail-panel__sub-meta">
          {context === 'inbox' && created_at && (
            <span>Applied {formatDistanceToNowStrict(new Date(created_at), { addSuffix: true })}</span>
          )}
          {context === 'roster' && accepted_at && (
            <span>Signed {formatDistanceToNowStrict(new Date(accepted_at), { addSuffix: true })}</span>
          )}
          {match_score != null && (
            <span className="ag-detail-panel__score">
              Score: <MatchScoreRing score={match_score} size="sm" /> {match_score}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="ag-detail-panel__actions">
        <ActionButtonGroup context={context} currentStatus={status} onAction={onAction} />
      </div>

      {/* Tabs */}
      <div className="ag-detail-panel__tabs">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`ag-detail-panel__tab ${activeTab === tab ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="ag-detail-panel__tab-content">
        {activeTab === 'Bio' && (
          <div className="ag-detail-panel__bio">
            {(bio_curated || bio_raw) && (
              <p className="ag-detail-panel__bio-text">{bio_curated || bio_raw}</p>
            )}
            {measurements && (
              <div className="ag-detail-panel__measurements">
                {measurements.bust && <div><span>Bust</span><strong>{measurements.bust}</strong></div>}
                {measurements.waist && <div><span>Waist</span><strong>{measurements.waist}</strong></div>}
                {measurements.hips && <div><span>Hips</span><strong>{measurements.hips}</strong></div>}
                {measurements.shoe && <div><span>Shoe</span><strong>{measurements.shoe}</strong></div>}
              </div>
            )}
          </div>
        )}
        {activeTab === 'Notes' && applicationId && <NotesPanel applicationId={applicationId} />}
        {activeTab === 'History' && applicationId && <ActivityTimeline applicationId={applicationId} />}
        {activeTab === 'Messages' && applicationId && (
          <MessageThread applicationId={applicationId} />
        )}
        {activeTab === 'Bookings' && (
          <div className="ag-detail-panel__bookings">
            <p className="ag-detail-panel__empty-tab">Booking history will appear here.</p>
          </div>
        )}
        {activeTab === 'Match' && detail.match_details && (
          <div className="ag-detail-panel__match-breakdown">
            {Object.entries(detail.match_details).map(([key, val]) => (
              <div key={key} className="ag-detail-panel__match-row">
                <span className="ag-detail-panel__match-label">{key}</span>
                <div className="ag-detail-panel__match-bar">
                  <div className="ag-detail-panel__match-fill" style={{ width: `${val}%` }} />
                </div>
                <span className="ag-detail-panel__match-pct">{val}%</span>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'Portfolio' && detail.images && (
          <div className="ag-detail-panel__portfolio">
            {detail.images.map(img => (
              <img key={img.id} src={img.path} alt="" className="ag-detail-panel__portfolio-img" />
            ))}
          </div>
        )}
      </div>

      {/* Bottom: Tags + Quick Links */}
      {(context === 'inbox' || context === 'roster' || context === 'casting') && (
        <div className="ag-detail-panel__bottom">
          {applicationId && (
            <div className="ag-detail-panel__section">
              <TagManager applicationId={applicationId} tags={tags || []} />
            </div>
          )}
          {(context === 'inbox' || context === 'roster') && applicationId && (
            <>
              <div className="ag-detail-panel__section">
                <ReminderSection applicationId={applicationId} compact />
              </div>
              <div className="ag-detail-panel__section">
                <InterviewSection applicationId={applicationId} compact />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create TalentDetailPanel.css**

```css
/* --- Panel Modes --- */
.ag-detail-panel--fixed {
  width: var(--ag-panel-w);
  border-left: 1px solid var(--ag-surface-4);
  height: calc(100vh - 56px);
  overflow-y: auto;
  background: var(--ag-surface-1);
}

.ag-detail-panel--drawer {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: var(--ag-panel-drawer-w);
  max-width: 90vw;
  z-index: 100;
  background: var(--ag-surface-1);
  overflow-y: auto;
  box-shadow: -8px 0 24px rgba(0,0,0,0.12);
}

.ag-detail-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  z-index: 99;
}

.ag-detail-panel__inner {
  display: flex;
  flex-direction: column;
}

/* --- Hero --- */
.ag-detail-panel__hero {
  position: relative;
  aspect-ratio: 16 / 9;
  max-height: 280px;
  overflow: hidden;
  background: var(--ag-surface-3);
}

.ag-detail-panel__hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ag-detail-panel__hero-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent 50%, rgba(0,0,0,0.6));
  pointer-events: none;
}

.ag-detail-panel__close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.9);
  color: var(--ag-text-0);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  z-index: 2;
}

.ag-detail-panel__close:hover { background: white; }

.ag-detail-panel__status-badge {
  position: absolute;
  top: 12px;
  right: 52px;
  z-index: 2;
}

/* --- Identity --- */
.ag-detail-panel__identity {
  padding: 16px 20px 0;
}

.ag-detail-panel__name {
  font-family: var(--ag-font-display);
  font-size: 24px;
  font-weight: 700;
  color: var(--ag-text-0);
  margin: 0 0 4px;
  line-height: 1.2;
}

.ag-detail-panel__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ag-text-2);
  flex-wrap: wrap;
}

.ag-detail-panel__meta > span + span::before {
  content: '\00B7';
  margin-right: 8px;
}

.ag-detail-panel__sub-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--ag-text-3);
  margin-top: 6px;
}

.ag-detail-panel__score {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* --- Actions --- */
.ag-detail-panel__actions {
  padding: 16px 20px;
}

/* --- Tabs --- */
.ag-detail-panel__tabs {
  display: flex;
  border-bottom: 1px solid var(--ag-border);
  padding: 0 20px;
  gap: 0;
}

.ag-detail-panel__tab {
  padding: 10px 16px;
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--ag-text-3);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all var(--ag-duration-fast) var(--ag-ease);
}

.ag-detail-panel__tab:hover { color: var(--ag-text-1); }

.ag-detail-panel__tab.is-active {
  color: var(--ag-gold);
  border-bottom-color: var(--ag-gold);
}

/* --- Tab Content --- */
.ag-detail-panel__tab-content {
  padding: 16px 20px;
  flex: 1;
}

.ag-detail-panel__bio-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--ag-text-1);
  margin: 0 0 16px;
}

.ag-detail-panel__measurements {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.ag-detail-panel__measurements > div {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--ag-surface-2);
  border-radius: var(--ag-radius-sm);
  font-size: 13px;
}

.ag-detail-panel__measurements span { color: var(--ag-text-3); }
.ag-detail-panel__measurements strong { color: var(--ag-text-0); font-weight: 600; }

/* Match Breakdown */
.ag-detail-panel__match-breakdown {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ag-detail-panel__match-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ag-detail-panel__match-label {
  width: 80px;
  font-size: 12px;
  color: var(--ag-text-2);
  text-transform: capitalize;
}

.ag-detail-panel__match-bar {
  flex: 1;
  height: 8px;
  background: var(--ag-surface-3);
  border-radius: 4px;
  overflow: hidden;
}

.ag-detail-panel__match-fill {
  height: 100%;
  background: var(--ag-gold);
  border-radius: 4px;
  transition: width 0.4s var(--ag-ease-spring);
}

.ag-detail-panel__match-pct {
  width: 36px;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: var(--ag-text-1);
}

/* Portfolio grid */
.ag-detail-panel__portfolio {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.ag-detail-panel__portfolio-img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: var(--ag-radius-sm);
}

/* Empty tab */
.ag-detail-panel__empty-tab {
  font-size: 13px;
  color: var(--ag-text-3);
  text-align: center;
  padding: 32px 0;
}

/* --- Bottom Section --- */
.ag-detail-panel__bottom {
  padding: 0 20px 20px;
  border-top: 1px solid var(--ag-border);
  margin-top: auto;
}

.ag-detail-panel__section {
  padding: 12px 0;
  border-bottom: 1px solid var(--ag-border);
}

.ag-detail-panel__section:last-child { border-bottom: none; }

/* --- Loading Skeleton --- */
.ag-detail-panel__loading {
  padding: 0;
}

.ag-detail-panel__skeleton-hero {
  aspect-ratio: 16 / 9;
  max-height: 280px;
  background: var(--ag-surface-3);
  animation: ag-shimmer 1.5s ease-in-out infinite;
}

.ag-detail-panel__skeleton-lines {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ag-detail-panel__skeleton-line {
  height: 14px;
  background: var(--ag-surface-3);
  border-radius: 4px;
  animation: ag-shimmer 1.5s ease-in-out infinite;
}

@keyframes ag-shimmer {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* --- Dark theme override for Discover context --- */
.ag-shell--discover .ag-detail-panel--fixed,
.ag-shell--discover .ag-detail-panel--drawer {
  background: #1A1815;
  color: #FAF8F5;
}

.ag-shell--discover .ag-detail-panel__name { color: #FAF8F5; }
.ag-shell--discover .ag-detail-panel__tab { color: rgba(250,248,245,0.5); }
.ag-shell--discover .ag-detail-panel__tab.is-active { color: var(--ag-gold); }
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/agency/TalentDetailPanel.jsx client/src/components/agency/TalentDetailPanel.css
git commit -m "feat(ui): add TalentDetailPanel with adaptive mode and context-aware rendering"
```

---

## Task 9: KanbanColumn + KanbanCard Components

Reusable kanban primitives for Inbox and Casting pages.

**Files:**
- Create: `client/src/components/agency/KanbanColumn.jsx`
- Create: `client/src/components/agency/KanbanCard.jsx`
- Create: `client/src/components/agency/Kanban.css`

- [ ] **Step 1: Create KanbanCard**

```jsx
import MatchScoreRing from './ui/MatchScoreRing';
import TalentTypePill from './ui/TalentTypePill';

export default function KanbanCard({ application, onClick, isSelected }) {
  const { name, photo, type, match_score } = application;

  return (
    <div
      className={`ag-kanban-card ${isSelected ? 'is-selected' : ''}`}
      onClick={() => onClick?.(application)}
    >
      <img src={photo || '/placeholder-avatar.png'} alt={name} className="ag-kanban-card__avatar" />
      <div className="ag-kanban-card__info">
        <span className="ag-kanban-card__name">{name}</span>
        <div className="ag-kanban-card__meta">
          <TalentTypePill type={type} size="sm" />
        </div>
      </div>
      {match_score != null && (
        <div className="ag-kanban-card__score">
          <MatchScoreRing score={match_score} size="sm" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create KanbanColumn**

```jsx
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import KanbanCard from './KanbanCard';
import './Kanban.css';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function KanbanColumn({
  stage,
  count,
  cards = [],
  onCardClick,
  selectedCardId,
  isCollapsed = false,
  onToggleCollapse,
  id,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: id || stage });

  if (isCollapsed) {
    return (
      <div className="ag-kanban-col ag-kanban-col--collapsed" onClick={onToggleCollapse}>
        <span className="ag-kanban-col__label-v">{stage}</span>
        <span className="ag-kanban-col__count">{count}</span>
      </div>
    );
  }

  return (
    <div className={`ag-kanban-col ${isOver ? 'is-over' : ''}`} ref={setNodeRef}>
      <div className="ag-kanban-col__header">
        <button className="ag-kanban-col__collapse" onClick={onToggleCollapse}>
          <ChevronDown size={14} />
        </button>
        <span className="ag-kanban-col__stage">{stage}</span>
        <span className="ag-kanban-col__count">{count}</span>
      </div>
      <div className="ag-kanban-col__cards">
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map(card => (
            <KanbanCard
              key={card.id}
              application={card}
              onClick={onCardClick}
              isSelected={card.id === selectedCardId}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create Kanban.css**

```css
/* --- Kanban Column --- */
.ag-kanban-col {
  min-width: var(--ag-kanban-col-min, 220px);
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--ag-surface-0);
  border-radius: var(--ag-radius-lg);
  border: 1px solid var(--ag-border);
  transition: border-color var(--ag-duration-fast) var(--ag-ease);
}

.ag-kanban-col.is-over {
  border: 2px dashed var(--ag-gold);
  background: var(--ag-gold-ghost);
}

.ag-kanban-col--collapsed {
  min-width: 48px;
  max-width: 48px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  gap: 8px;
}

.ag-kanban-col__label-v {
  writing-mode: vertical-lr;
  text-orientation: mixed;
  font-size: 12px;
  font-weight: 600;
  color: var(--ag-text-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ag-kanban-col__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--ag-border);
}

.ag-kanban-col__collapse {
  background: none;
  border: none;
  color: var(--ag-text-3);
  cursor: pointer;
  padding: 2px;
  display: flex;
}

.ag-kanban-col__stage {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ag-text-2);
}

.ag-kanban-col__count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--ag-surface-3);
  font-size: 11px;
  font-weight: 600;
  color: var(--ag-text-1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ag-kanban-col__cards {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: var(--ag-kanban-card-gap, 8px);
}

/* --- Kanban Card --- */
.ag-kanban-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: var(--ag-surface-1);
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-md);
  cursor: pointer;
  transition: all var(--ag-duration-fast) var(--ag-ease);
}

.ag-kanban-card:hover {
  border-color: var(--ag-gold-dim);
  box-shadow: 0 2px 8px rgba(201,165,90,0.1);
}

.ag-kanban-card.is-selected {
  border-color: var(--ag-gold);
  background: var(--ag-gold-ghost);
}

.ag-kanban-card__avatar {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.ag-kanban-card__info {
  flex: 1;
  min-width: 0;
}

.ag-kanban-card__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ag-text-0);
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ag-kanban-card__meta {
  margin-top: 2px;
}

.ag-kanban-card__score {
  flex-shrink: 0;
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/agency/KanbanColumn.jsx client/src/components/agency/KanbanCard.jsx client/src/components/agency/Kanban.css
git commit -m "feat(ui): add KanbanColumn and KanbanCard components with dnd-kit integration"
```

---

## Task 10: BulkActionToolbar Component

**Files:**
- Create: `client/src/components/agency/BulkActionToolbar.jsx`
- Create: `client/src/components/agency/BulkActionToolbar.css`

- [ ] **Step 1: Read existing BulkActionToolbar**

Read `client/src/components/agency/BulkActionToolbar.jsx` to understand current implementation.

- [ ] **Step 2: Refactor with context-aware actions**

Update the existing file to accept a `context` prop and render different action buttons:

```jsx
import { motion } from 'framer-motion';
import { Star, X, Archive, Tag, ClipboardList, MessageCircle, ArrowRight, Trash2 } from 'lucide-react';
import './BulkActionToolbar.css';

const ACTIONS = {
  inbox: [
    { key: 'shortlist', label: 'Shortlist', icon: Star },
    { key: 'decline', label: 'Decline', icon: X },
    { key: 'archive', label: 'Archive', icon: Archive },
    { key: 'tag', label: 'Tag', icon: Tag },
    { key: 'add-to-board', label: 'Add to Board', icon: ClipboardList },
  ],
  roster: [
    { key: 'tag', label: 'Tag', icon: Tag },
    { key: 'add-to-board', label: 'Add to Board', icon: ClipboardList },
    { key: 'message', label: 'Message', icon: MessageCircle },
  ],
  casting: [
    { key: 'move-stage', label: 'Move Stage', icon: ArrowRight },
    { key: 'remove', label: 'Remove', icon: Trash2 },
    { key: 'tag', label: 'Tag', icon: Tag },
  ],
};

export default function BulkActionToolbar({ selectedCount, context = 'inbox', onAction, onClearSelection }) {
  const actions = ACTIONS[context] || ACTIONS.inbox;

  return (
    <motion.div
      className="ag-bulk-toolbar"
      initial={{ y: -48, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -48, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      <span className="ag-bulk-toolbar__count">{selectedCount} selected</span>
      <div className="ag-bulk-toolbar__actions">
        {actions.map(a => {
          const Icon = a.icon;
          return (
            <button key={a.key} className="ag-bulk-toolbar__btn" onClick={() => onAction(a.key)}>
              <Icon size={14} /> {a.label}
            </button>
          );
        })}
      </div>
      <button className="ag-bulk-toolbar__close" onClick={onClearSelection}>
        <X size={14} />
      </button>
    </motion.div>
  );
}
```

Add styles (inline in same file or separate CSS):
```css
.ag-bulk-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 16px;
  background: var(--ag-gold-ghost);
  border-bottom: 1px solid var(--ag-gold-dim);
}
.ag-bulk-toolbar__count { font-size: 13px; font-weight: 600; color: var(--ag-text-0); white-space: nowrap; }
.ag-bulk-toolbar__actions { display: flex; gap: 4px; flex: 1; }
.ag-bulk-toolbar__btn {
  display: flex; align-items: center; gap: 4px; padding: 5px 10px;
  border: 1px solid var(--ag-border); border-radius: var(--ag-radius-md);
  background: var(--ag-surface-1); font-size: 12px; font-weight: 500;
  color: var(--ag-text-1); cursor: pointer;
}
.ag-bulk-toolbar__btn:hover { border-color: var(--ag-gold); color: var(--ag-gold); }
.ag-bulk-toolbar__close { background: none; border: none; color: var(--ag-text-3); cursor: pointer; padding: 4px; }
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/agency/BulkActionToolbar.jsx
git commit -m "feat(ui): add context-aware BulkActionToolbar with slide animation"
```

---

## Task 11: Keyboard Shortcut System

**Files:**
- Create: `client/src/components/agency/KeyboardShortcutOverlay.jsx`
- Create: `client/src/hooks/useKeyboardShortcuts.js`

- [ ] **Step 1: Create the hook**

```jsx
import { useEffect } from 'react';

const INPUT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

export default function useKeyboardShortcuts(shortcuts, deps = []) {
  useEffect(() => {
    function handler(e) {
      // Suppress in text inputs
      if (INPUT_TAGS.includes(e.target.tagName)) return;
      if (e.target.isContentEditable) return;

      const binding = shortcuts.find(s => s.key === e.key && !s.ctrl === !e.ctrlKey);
      if (binding) {
        e.preventDefault();
        binding.action();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, deps);
}
```

- [ ] **Step 2: Create KeyboardShortcutOverlay**

```jsx
import { X } from 'lucide-react';

const GROUPS = [
  {
    title: 'Navigation',
    shortcuts: [
      { key: '↑ / ↓', desc: 'Move through list' },
      { key: '→ / Enter', desc: 'Open detail panel' },
      { key: '← / Esc', desc: 'Close detail panel' },
    ],
  },
  {
    title: 'Triage',
    shortcuts: [
      { key: 's', desc: 'Shortlist selected' },
      { key: 'd', desc: 'Decline selected' },
      { key: 'a', desc: 'Archive selected' },
      { key: 't', desc: 'Open tag picker' },
    ],
  },
  {
    title: 'Views',
    shortcuts: [
      { key: 'k', desc: 'Toggle kanban view' },
      { key: '?', desc: 'Show this overlay' },
    ],
  },
];

export default function KeyboardShortcutOverlay({ onClose }) {
  return (
    <div className="ag-shortcuts-backdrop" onClick={onClose}>
      <div className="ag-shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="ag-shortcuts-header">
          <h3>Keyboard Shortcuts</h3>
          <button className="ag-shortcuts-close" onClick={onClose}><X size={16} /></button>
        </div>
        {GROUPS.map(g => (
          <div key={g.title} className="ag-shortcuts-group">
            <h4 className="ag-shortcuts-group-title">{g.title}</h4>
            {g.shortcuts.map(s => (
              <div key={s.key} className="ag-shortcuts-row">
                <kbd className="ag-shortcuts-key">{s.key}</kbd>
                <span className="ag-shortcuts-desc">{s.desc}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

Add inline styles or a small CSS block:
```css
.ag-shortcuts-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 200; display: flex; align-items: center; justify-content: center; }
.ag-shortcuts-modal { width: 480px; max-width: 90vw; background: var(--ag-surface-1); border-radius: 16px; padding: 24px; box-shadow: 0 16px 48px rgba(0,0,0,0.2); }
.ag-shortcuts-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.ag-shortcuts-header h3 { font-size: 18px; font-weight: 600; color: var(--ag-text-0); margin: 0; }
.ag-shortcuts-close { background: none; border: none; color: var(--ag-text-3); cursor: pointer; }
.ag-shortcuts-group { margin-bottom: 16px; }
.ag-shortcuts-group-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ag-text-3); margin: 0 0 8px; font-weight: 600; }
.ag-shortcuts-row { display: flex; align-items: center; padding: 4px 0; }
.ag-shortcuts-key { min-width: 80px; padding: 3px 8px; background: var(--ag-surface-3); border-radius: 4px; font-family: var(--ag-font-mono, monospace); font-size: 12px; color: var(--ag-text-1); text-align: center; }
.ag-shortcuts-desc { font-size: 13px; color: var(--ag-text-2); margin-left: 12px; }
```

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useKeyboardShortcuts.js client/src/components/agency/KeyboardShortcutOverlay.jsx
git commit -m "feat(ui): add keyboard shortcut system with overlay and input suppression"
```

---

## Task 12: InboxPage (Hub)

The main triage workspace. Largest task — depends on Tasks 3-11.

**Files:**
- Create: `client/src/routes/agency/InboxPage.jsx`
- Create: `client/src/routes/agency/InboxPage.css`

- [ ] **Step 1: Scaffold InboxPage with master-detail layout**

Wire up:
- `useQuery(['agency', 'applications'], getApplicants)` for list data
- `FilterBar` with status/type/score/tags filters
- `RichRow` rendering in a scrollable list
- `TalentDetailPanel` on the right (adaptive via `useMediaQuery` or `window.innerWidth` check)
- `useState` for `selectedId`, `viewMode`, `checkedIds`, `activeFilters`

```jsx
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApplicants, getFilterPresets, bulkUpdateCastingApplicationStage, updateCastingApplicationStage } from '../../api/agency';
import FilterBar from '../../components/agency/FilterBar';
import RichRow from '../../components/agency/RichRow';
import TalentDetailPanel from '../../components/agency/TalentDetailPanel';
import BulkActionToolbar from '../../components/agency/BulkActionToolbar';
import KanbanColumn from '../../components/agency/KanbanColumn';
import KanbanCard from '../../components/agency/KanbanCard';
import KeyboardShortcutOverlay from '../../components/agency/KeyboardShortcutOverlay';
import AgencyEmptyState from '../../components/agency/ui/AgencyEmptyState';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import './InboxPage.css';

const KANBAN_STAGES = ['pending', 'shortlisted', 'offered', 'accepted', 'declined'];
const STAGE_LABELS = { pending: 'New', shortlisted: 'Shortlisted', offered: 'Offered', accepted: 'Signed', declined: 'Declined' };

const INBOX_FILTERS = [
  { key: 'status', label: 'Status', type: 'multi', options: ['pending', 'shortlisted', 'offered', 'declined', 'archived'] },
  { key: 'archetype', label: 'Type', type: 'multi', options: ['editorial', 'commercial', 'runway', 'fitness', 'plus'] },
  { key: 'tags', label: 'Tags', type: 'multi', options: [] }, // populated from API
];

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('list');
  const [selectedApp, setSelectedApp] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [activeFilters, setActiveFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [panelMode, setPanelMode] = useState('fixed');

  // Responsive panel mode
  // Use matchMedia to determine fixed vs drawer
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    setPanelMode(mq.matches ? 'fixed' : 'drawer');
    const handler = (e) => setPanelMode(e.matches ? 'fixed' : 'drawer');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['agency', 'applications', activeFilters],
    queryFn: () => getApplicants(activeFilters),
  });

  const { data: presets = [] } = useQuery({
    queryKey: ['agency', 'filter-presets'],
    queryFn: getFilterPresets,
  });

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchQuery) return applications;
    const q = searchQuery.toLowerCase();
    return applications.filter(a =>
      (a.name || '').toLowerCase().includes(q) ||
      (a.tags || []).some(t => (t.tag || t).toLowerCase().includes(q))
    );
  }, [applications, searchQuery]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: 'k', action: () => setViewMode(v => v === 'list' ? 'kanban' : 'list') },
    { key: '?', action: () => setShowShortcuts(s => !s) },
    { key: 'Escape', action: () => { setSelectedApp(null); setShowShortcuts(false); } },
  ], []);

  const hasSelection = checkedIds.size > 0;

  return (
    <div className={`inbox-page ${selectedApp && panelMode === 'fixed' ? 'has-panel' : ''}`}>
      <div className="inbox-page__list">
        {hasSelection && (
          <BulkActionToolbar
            selectedCount={checkedIds.size}
            context="inbox"
            onAction={async (action) => {
              const ids = Array.from(checkedIds);
              try {
                if (action === 'shortlist') await bulkUpdateCastingApplicationStage(ids, { status: 'shortlisted' });
                else if (action === 'decline') await bulkUpdateCastingApplicationStage(ids, { status: 'declined' });
                else if (action === 'archive') await bulkUpdateCastingApplicationStage(ids, { status: 'archived' });
                queryClient.invalidateQueries({ queryKey: ['agency', 'applications'] });
                setCheckedIds(new Set());
              } catch (err) { toast.error(`${action} failed for some items`); }
            }}
            onClearSelection={() => setCheckedIds(new Set())}
          />
        )}

        <FilterBar
          filters={INBOX_FILTERS}
          activeFilters={activeFilters}
          onChange={setActiveFilters}
          presets={presets}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search applicants..."
          viewModes={['list', 'kanban']}
        />

        {viewMode === 'list' ? (
          <div className="inbox-page__rows">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <div key={i} className="ag-rich-row-skeleton" />)
            ) : filtered.length === 0 ? (
              <AgencyEmptyState
                title="All caught up"
                description="No applications match your filters."
              />
            ) : (
              filtered.map(app => (
                <RichRow
                  key={app.id}
                  application={app}
                  isSelected={selectedApp?.id === app.id}
                  isChecked={checkedIds.has(app.id)}
                  onSelect={setSelectedApp}
                  onCheck={(a) => {
                    setCheckedIds(prev => {
                      const next = new Set(prev);
                      next.has(a.id) ? next.delete(a.id) : next.add(a.id);
                      return next;
                    });
                  }}
                />
              ))
            )}
          </div>
        ) : (
          <KanbanView
            applications={filtered}
            selectedApp={selectedApp}
            onCardClick={setSelectedApp}
            queryClient={queryClient}
          />
        )}
      </div>

      {selectedApp && (
        <TalentDetailPanel
          applicationId={selectedApp.id || selectedApp.applicationId}
          profileId={selectedApp.profileId || selectedApp.profile_id}
          context="inbox"
          mode={panelMode}
          onClose={() => setSelectedApp(null)}
        />
      )}

      {showShortcuts && <KeyboardShortcutOverlay onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}

function KanbanView({ applications, selectedApp, onCardClick, queryClient }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const grouped = useMemo(() => {
    const map = {};
    for (const stage of KANBAN_STAGES) map[stage] = [];
    for (const app of applications) {
      const stage = KANBAN_STAGES.includes(app.status) ? app.status : 'pending';
      map[stage].push(app);
    }
    return map;
  }, [applications]);

  return (
    <DndContext sensors={sensors} onDragEnd={({ active, over }) => {
      if (!over || active.id === over.id) return;
      const appId = active.id;
      const newStatus = over.id; // column id = status
      updateCastingApplicationStage(appId, { status: newStatus })
        .then(() => queryClient.invalidateQueries({ queryKey: ['agency', 'applications'] }));
    }}>
      <div className="inbox-page__kanban">
        {KANBAN_STAGES.map(stage => (
          <KanbanColumn
            key={stage}
            id={stage}
            stage={STAGE_LABELS[stage] || stage}
            count={grouped[stage].length}
            cards={grouped[stage]}
            onCardClick={onCardClick}
            selectedCardId={selectedApp?.id}
          />
        ))}
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 2: Create InboxPage.css**

Master-detail split layout:
```css
.inbox-page { display: flex; height: calc(100vh - 56px); }
.inbox-page__list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
.inbox-page.has-panel .inbox-page__list { flex: 0 0 45%; }
.inbox-page__rows { flex: 1; overflow-y: auto; }
.inbox-page__kanban { display: flex; gap: 12px; overflow-x: auto; flex: 1; padding: 16px; }

/* Loading skeletons */
.ag-rich-row-skeleton {
  height: var(--ag-row-h, 76px);
  border-radius: 8px;
  background: linear-gradient(90deg, var(--ag-surface-2, #F0EDE8) 25%, var(--ag-surface-1, #fff) 50%, var(--ag-surface-2, #F0EDE8) 75%);
  background-size: 200% 100%;
  animation: ag-shimmer 1.5s ease-in-out infinite;
}
@keyframes ag-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

- [ ] **Step 3: Verify basic rendering**

Run dev server, navigate to `/dashboard/agency/inbox` (will wire routing in Task 18). Test:
- List renders with RichRow items
- Clicking a row opens detail panel
- Kanban toggle works
- Filter bar functional

- [ ] **Step 4: Commit**

```bash
git add client/src/routes/agency/InboxPage.jsx client/src/routes/agency/InboxPage.css
git commit -m "feat(inbox): add InboxPage with master-detail split and kanban toggle"
```

---

## Task 13: RosterPage Refactor

Refactor existing RosterPage for card grid default with adaptive detail panel.

**Files:**
- Modify: `client/src/routes/agency/RosterPage.jsx`
- Modify: `client/src/routes/agency/RosterPage.css`

- [ ] **Step 1: Read current RosterPage**

Read `client/src/routes/agency/RosterPage.jsx` fully to understand the existing adapter functions, filter logic, and NL parser.

- [ ] **Step 2: Refactor to use shared components**

Replace inline grid cards with `TalentCard`. Replace inline filter dropdowns with `FilterBar`. Replace inline detail drawer with `TalentDetailPanel` (context='roster'). Keep the `toTalentObject` adapter and `parseIntent` NL parser.

Key changes:
- Default view: `grid` (was `rows`)
- Add `FilterBar` with roster-specific filters (Gender, Archetype, Status, Height range, Tags)
- View modes: `grid` and `list` (not kanban)
- Grid uses responsive columns (4/3/2 via CSS grid with media queries)
- `TalentDetailPanel` with `context="roster"` and `mode` from viewport check
- Bulk selection with `BulkActionToolbar` context='roster'

- [ ] **Step 3: Update RosterPage.css**

Responsive grid:
```css
.roster-page__grid {
  display: grid;
  gap: var(--ag-grid-gap);
  grid-template-columns: repeat(4, 1fr);
}
@media (max-width: 1439px) { .roster-page__grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 1023px) { .roster-page__grid { grid-template-columns: repeat(2, 1fr); } }
.roster-page.has-panel .roster-page__grid { grid-template-columns: repeat(3, 1fr); }
@media (max-width: 1439px) { .roster-page.has-panel .roster-page__grid { grid-template-columns: repeat(2, 1fr); } }
```

- [ ] **Step 4: Verify**

Run dev server, test: card grid renders, clicking card opens detail panel, list view toggle works, filters work.

- [ ] **Step 5: Commit**

```bash
git add client/src/routes/agency/RosterPage.jsx client/src/routes/agency/RosterPage.css
git commit -m "refactor(roster): use TalentCard grid, shared FilterBar, adaptive TalentDetailPanel"
```

---

## Task 14: CastingPage Refactor

Board list view + pipeline kanban using shared components.

**Files:**
- Modify: `client/src/routes/agency/CastingPage.jsx`
- Modify: `client/src/routes/agency/CastingPage.css`

- [ ] **Step 1: Read current CastingPage**

Understand the existing dnd-kit setup, board selection, and candidate card rendering.

- [ ] **Step 2: Refactor**

Key changes:
- Board list view as default (no board selected): card grid of boards with progress bars
- Board selected: pipeline kanban using `KanbanColumn` + `KanbanCard`
- Board selector bar with back arrow, dropdown, metadata
- `TalentDetailPanel` with `context="casting"` and `boardId`
- Keep existing `toCastingTalentObject` adapter

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/agency/CastingPage.jsx client/src/routes/agency/CastingPage.css
git commit -m "refactor(casting): board list view + pipeline kanban with shared components"
```

---

## Task 15: DiscoverPage Alignment

Minor changes — swap detail drawer for shared TalentDetailPanel.

**Files:**
- Modify: `client/src/routes/agency/DiscoverPage.jsx`

- [ ] **Step 1: Read current DiscoverPage**

Understand current talent selection and panel rendering.

- [ ] **Step 2: Replace panel with TalentDetailPanel**

- Remove inline detail drawer / TalentPanel usage
- Add `TalentDetailPanel` with `context="discover"` and dark theme CSS class
- Remove resonance rings component if present
- Keep everything else (dark theme, NL search, masonry grid, Grainient)

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/agency/DiscoverPage.jsx
git commit -m "refactor(discover): use shared TalentDetailPanel, remove resonance rings"
```

---

## Task 16: OverviewPage Simplification

Simplify to reporting dashboard. No longer the default landing.

**Files:**
- Modify: `client/src/routes/agency/OverviewPage.jsx`
- Modify: `client/src/routes/agency/OverviewPage.css`

- [ ] **Step 1: Read current OverviewPage**

Understand existing KPI cards, attention strip, charts.

- [ ] **Step 2: Simplify**

Key changes:
- Keep: Greeting, KPI cards (animated counters), attention strip, recent applicants list, archetype donut
- Remove: Excessive chart complexity (keep simple donut, remove recharts AreaChart if overly complex)
- Update: "View all" links → point to `/dashboard/agency/inbox`
- Update: Attention strip items link to correct pages (inbox, interviews, reminders)

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/agency/OverviewPage.jsx client/src/routes/agency/OverviewPage.css
git commit -m "refactor(overview): simplify to reporting dashboard, update links to inbox"
```

---

## Task 17: AgencyLayout — Topbar + Nav Redesign

**Files:**
- Modify: `client/src/layouts/AgencyLayout.jsx`
- Modify: `client/src/layouts/AgencyLayout.css`

- [ ] **Step 1: Update NAV_TABS**

```javascript
const NAV_TABS = [
  { label: 'Inbox',     to: '/dashboard/agency/inbox',      end: false },
  { label: 'Roster',    to: '/dashboard/agency/roster'                 },
  { label: 'Casting',   to: '/dashboard/agency/casting'               },
  { label: 'Discover',  to: '/dashboard/agency/discover'              },
  { label: 'Analytics', to: '/dashboard/agency/analytics'             },
  { label: 'Overview',  to: '/dashboard/agency/overview'              },
];
```

- [ ] **Step 2: Add live count badges**

```jsx
import { useQuery } from '@tanstack/react-query';
import { getPipelineCounts } from '../api/agency';

// Inside component:
const { data: pipelineCounts } = useQuery({
  queryKey: ['agency', 'pipeline-counts'],
  queryFn: getPipelineCounts,
  refetchInterval: 30000,
});

// In nav pill rendering:
{tab.label === 'Inbox' && pipelineCounts?.pending > 0 && (
  <span className="ag-nav-pill__badge">{pipelineCounts.pending}</span>
)}
```

- [ ] **Step 3: Reduce topbar height to 56px**

Update `.ag-topbar` in CSS:
```css
.ag-topbar {
  height: 56px;
  /* ... keep other properties ... */
}
```

Update the padding and spacing to be tighter for 56px height.

- [ ] **Step 4: Verify**

Test all nav pills navigate correctly. Verify badge shows pending count. Verify 56px height doesn't break the page layout.

- [ ] **Step 5: Commit**

```bash
git add client/src/layouts/AgencyLayout.jsx client/src/layouts/AgencyLayout.css
git commit -m "refactor(layout): 56px topbar, reordered nav pills, live count badges"
```

---

## Task 18: Route Wiring + Cleanup

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Add InboxPage route and redirect**

The existing `App.jsx` uses **flat absolute paths** under the `<AgencyLayout>` wrapper (not nested relative paths). All route changes must follow this pattern.

```jsx
// Add import at top:
import AgencyInbox from './routes/agency/InboxPage';

// Inside the <AgencyLayout> route group, make these changes:

// 1. Change the default /dashboard/agency to redirect to inbox:
<Route path="/dashboard/agency" element={<Navigate to="/dashboard/agency/inbox" replace />} />

// 2. Add inbox route:
<Route path="/dashboard/agency/inbox" element={<AgencyInbox />} />

// 3. Keep applicants as redirect to inbox:
<Route path="/dashboard/agency/applicants" element={<Navigate to="/dashboard/agency/inbox" replace />} />

// 4. Add overview at its own explicit path:
<Route path="/dashboard/agency/overview" element={<AgencyOverview />} />

// 5. Remove the signed route (redundant with roster):
// DELETE: <Route path="/dashboard/agency/signed" element={<AgencySigned />} />
```

- [ ] **Step 2: Remove SignedPage route and clean up old files**

- Remove the `signed` route import and `<Route>` element (redundant with Roster per spec Section 13)
- Remove `import AgencySigned from './routes/agency/SignedPage'`
- Keep `ApplicantsPage.jsx` for now (redirect handles it) — mark with a `// DEPRECATED: use InboxPage` comment at top. Full deletion can happen after all pages are verified.
- Keep `TalentPanel.jsx` for now — secondary pages (Interviews, Reminders, etc.) may still use it. Mark deprecated.

- [ ] **Step 3: Update all internal links**

Search codebase for `/dashboard/agency/applicants` and replace with `/dashboard/agency/inbox`. Check OverviewPage attention strip links, any `<Link>` or `navigate()` calls.

Run: `grep -r "applicants" client/src/ --include="*.jsx" --include="*.js"` to find all references.

- [ ] **Step 4: Verify routing**

Test:
- `/dashboard/agency` → redirects to `/dashboard/agency/inbox`
- `/dashboard/agency/applicants` → redirects to `/dashboard/agency/inbox`
- `/dashboard/agency/inbox` → InboxPage renders
- `/dashboard/agency/overview` → OverviewPage renders
- All other routes still work

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat(routing): inbox as default, redirect from old applicants path, remove signed page"
```

---

## Verification Checklist

After all tasks complete, verify end-to-end:

- [ ] Inbox: List view renders, row selection opens detail panel, kanban toggle works
- [ ] Inbox: Bulk select + toolbar actions work
- [ ] Inbox: Filter bar filters, search, presets
- [ ] Inbox: Keyboard shortcuts (arrow nav, s/d/a actions, k toggle, ? overlay)
- [ ] Detail panel: Fixed mode on ≥1280px, drawer mode on <1280px
- [ ] Detail panel: Context switches between inbox/roster/casting/discover
- [ ] Roster: Card grid renders, view toggle to list works
- [ ] Casting: Board list → board selection → pipeline kanban
- [ ] Discover: Shared detail panel with dark theme
- [ ] Overview: Simplified dashboard with correct links
- [ ] Layout: 56px topbar, correct nav pill order, live count badges
- [ ] Routing: Default redirects to inbox, old path redirects work
- [ ] No console errors, no broken imports
