# Roster Intelligence Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/dashboard/agency/roster` as a premium intelligence dashboard — page header + stat ledger, collapsible AI advisory strip, per-talent insight signals in rows/cards, and a roster-context advisory block in the detail panel. All AI content is static mock data.

**Architecture:** Three-layer hierarchy — stat ledger → `RosterIntelligenceStrip` (new component) → roster list with per-talent signal dots. `RosterZone` (inside `TalentPanel`) receives an optional `insight` prop and renders an editorial advisory block at the top of the panel body. No backend work required; AI data shape is designed to accept real API data later.

**Tech Stack:** React 19, Framer Motion, Lucide React, CSS custom properties (`--ag-*` design tokens from `agency-tokens.css`), static mock data.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `client/src/domains/agency/components/roster/RosterIntelligenceStrip.jsx` | Create | Collapsible AI advisory strip with 3 cards |
| `client/src/domains/agency/components/roster/RosterIntelligenceStrip.css` | Create | Strip styles |
| `client/src/domains/agency/pages/RosterPage.jsx` | Modify | Header, ledger, strip import, insight data, signal dots in rows/cards |
| `client/src/domains/agency/pages/RosterPage.css` | Modify | New header/ledger/signal styles; token migration |
| `client/src/domains/agency/components/TalentPanel.jsx` | Modify | Thread `talent.insight` → `RosterZone` |
| `client/src/domains/agency/components/zones/RosterZone.jsx` | Modify | Accept `insight` prop, render advisory block |
| `client/src/domains/agency/components/zones/zones.css` | Modify | Add `.zone-advisory` styles |

---

### Task 1: Create RosterIntelligenceStrip component

**Files:**
- Create: `client/src/domains/agency/components/roster/RosterIntelligenceStrip.css`
- Create: `client/src/domains/agency/components/roster/RosterIntelligenceStrip.jsx`

- [ ] **Step 1: Create RosterIntelligenceStrip.css**

```css
/* ============================================================
   Roster Intelligence Strip — AI Advisory Surface
   Collapsible section between stat ledger and command bar.
   ============================================================ */

.rs-intel {
  border: 1px solid var(--ag-border);
  border-radius: var(--ag-radius-lg);
  background: var(--ag-surface-1);
  overflow: hidden;
  margin-bottom: 16px;
  box-shadow: var(--ag-shadow-sm);
}

.rs-intel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 11px 16px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background var(--ag-duration) var(--ag-ease);
}

.rs-intel-header:hover {
  background: var(--ag-surface-2);
}

.rs-intel-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rs-intel-sparkle {
  color: var(--ag-gold);
  flex-shrink: 0;
}

.rs-intel-label {
  font-family: var(--ag-font-body);
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--ag-text-2);
}

.rs-intel-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: var(--ag-gold-muted);
  border-radius: 100px;
  font-family: var(--ag-font-body);
  font-size: 10px;
  font-weight: 700;
  color: var(--ag-gold);
}

.rs-intel-chevron {
  color: var(--ag-text-3);
  flex-shrink: 0;
  transition: transform 0.2s var(--ag-ease);
}

.rs-intel-chevron--open {
  transform: rotate(180deg);
}

.rs-intel-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--ag-border);
  overflow: hidden;
}

.rs-intel-card {
  position: relative;
  display: flex;
  background: var(--card-bg, var(--ag-surface-1));
  padding: 16px 18px 18px 22px;
  border-right: 1px solid var(--ag-border);
  transition: background var(--ag-duration) var(--ag-ease);
}

.rs-intel-card:last-child {
  border-right: none;
}

.rs-intel-card:hover {
  background: var(--ag-surface-2);
}

.rs-intel-card-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--card-accent, var(--ag-gold));
  border-radius: 0 1px 1px 0;
}

.rs-intel-card-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.rs-intel-card-type {
  font-family: var(--ag-font-body);
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--card-accent, var(--ag-gold));
}

.rs-intel-card-title {
  font-family: var(--ag-font-body);
  font-size: 13px;
  font-weight: 600;
  color: var(--ag-text-0);
  line-height: 1.3;
}

.rs-intel-card-text {
  font-family: var(--ag-font-body);
  font-size: 11.5px;
  line-height: 1.58;
  color: var(--ag-text-2);
  margin: 2px 0 0;
}

.rs-intel-card-cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  font-family: var(--ag-font-body);
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--card-accent, var(--ag-gold));
  cursor: pointer;
  padding: 0;
  margin-top: 6px;
  align-self: flex-start;
  transition: opacity var(--ag-duration-fast) var(--ag-ease);
}

.rs-intel-card-cta:hover {
  opacity: 0.65;
}

@media (max-width: 1100px) {
  .rs-intel-cards {
    grid-template-columns: 1fr 1fr;
  }
  .rs-intel-card:nth-child(2) {
    border-right: none;
  }
}
```

- [ ] **Step 2: Create RosterIntelligenceStrip.jsx**

```jsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, TrendingUp, Star, ChevronDown, Sparkles } from 'lucide-react';
import './RosterIntelligenceStrip.css';

const INTELLIGENCE = [
  {
    id: 'idle-bench',
    type: 'attention',
    title: '3 talents idle 90+ days',
    body: "Marcus Webb, Kofi Mensah, and Tom Bradley haven't been submitted to any board in over 3 months. A targeted outreach window may prevent attrition.",
    cta: 'Review bench',
  },
  {
    id: 'editorial-gap',
    type: 'opportunity',
    title: 'Runway opportunity gap',
    body: 'Isabelle Laurent and Yuki Tanaka match 2 active runway board briefs by profile and measurements. Neither has been submitted yet.',
    cta: 'View matches',
  },
  {
    id: 'profile-gap',
    type: 'growth',
    title: 'Profile gaps limiting discoverability',
    body: 'Chloe Anderson and Alex Chen have incomplete profiles. Completing measurement fields improves placement in semantic casting searches.',
    cta: 'Review profiles',
  },
];

const TYPE_CONFIG = {
  attention:   { accent: '#C0392B', bg: 'rgba(192,57,43,0.035)',  label: 'Attention'   },
  opportunity: { accent: '#C9A55A', bg: 'rgba(201,165,90,0.06)',  label: 'Opportunity' },
  growth:      { accent: '#2D8A56', bg: 'rgba(45,138,86,0.04)',   label: 'Growth'      },
};

export default function RosterIntelligenceStrip() {
  const [open, setOpen] = useState(true);

  return (
    <div className="rs-intel">
      <button className="rs-intel-header" onClick={() => setOpen(o => !o)}>
        <div className="rs-intel-header-left">
          <Sparkles size={12} className="rs-intel-sparkle" />
          <span className="rs-intel-label">Roster Intelligence</span>
          <span className="rs-intel-count">{INTELLIGENCE.length}</span>
        </div>
        <ChevronDown
          size={13}
          className={`rs-intel-chevron${open ? ' rs-intel-chevron--open' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="cards"
            className="rs-intel-cards"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {INTELLIGENCE.map((item, i) => {
              const cfg = TYPE_CONFIG[item.type];
              return (
                <motion.div
                  key={item.id}
                  className="rs-intel-card"
                  style={{ '--card-accent': cfg.accent, '--card-bg': cfg.bg }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.2 }}
                >
                  <div className="rs-intel-card-accent" />
                  <div className="rs-intel-card-body">
                    <span className="rs-intel-card-type">{cfg.label}</span>
                    <span className="rs-intel-card-title">{item.title}</span>
                    <p className="rs-intel-card-text">{item.body}</p>
                    <button className="rs-intel-card-cta">{item.cta} →</button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 3: Verify Lucide exports (Sparkles, Clock, TrendingUp, Star all exist in the installed version)**

```bash
node -e "const l = require('/Users/lenquanhone/Projects/pholio-app/client/node_modules/lucide-react'); console.log(['Sparkles','Clock','TrendingUp','Star','ChevronDown'].map(n => n + ':' + (n in l)))"
```

Expected output: `Sparkles:true Clock:true TrendingUp:true Star:true ChevronDown:true`

If any show `false`, replace that icon with an equivalent that does exist — e.g. `Zap` instead of `Sparkles`.

- [ ] **Step 4: Commit**

```bash
git add client/src/domains/agency/components/roster/
git commit -m "feat(roster): add RosterIntelligenceStrip advisory component"
```

---

### Task 2: Redesign page header + stat ledger

**Files:**
- Modify: `client/src/domains/agency/pages/RosterPage.jsx`
- Modify: `client/src/domains/agency/pages/RosterPage.css`

- [ ] **Step 1: Add roster-wide stat computation to RosterPage.jsx**

Add this constant directly after the `ROSTER` array (before the `parseIntent` function, around line 97):

```js
const ROSTER_STATS = ROSTER.reduce(
  (acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; },
  { available: 0, booking: 0, hold: 0, inactive: 0 },
);
```

- [ ] **Step 2: Import RosterIntelligenceStrip at the top of RosterPage.jsx**

After the existing import block, add:

```jsx
import RosterIntelligenceStrip from '../components/roster/RosterIntelligenceStrip';
```

- [ ] **Step 3: Replace the command bar title block in the JSX**

Find and remove this block (approximately lines 397–414 in the current file):

```jsx
{/* ── Command Bar ── */}
<div className="ro-command-bar">
  <div className="ro-command-left">
    <div className="flex flex-col mr-6">
      <h1 className="ro-page-title m-0">Talent Roster</h1>
      <span className="text-[10px] font-bold text-[#C9A55A] uppercase tracking-[0.1em] mt-0.5 ml-0.5">NATYGEN MODELS</span>
    </div>
```

Replace the entire block up through and including the "Add Talent" `<button className="ro-add-btn">` with this new structure:

```jsx
{/* ── Page Header ── */}
<header className="rs-header">
  <div>
    <span className="rs-eyebrow">Signed Talent</span>
    <h1 className="rs-title">Roster</h1>
    <p className="rs-subline">
      {ROSTER_STATS.available} available&nbsp;&nbsp;·&nbsp;&nbsp;
      {ROSTER_STATS.booking} on booking&nbsp;&nbsp;·&nbsp;&nbsp;
      {ROSTER_STATS.hold} on hold&nbsp;&nbsp;·&nbsp;&nbsp;
      {ROSTER_STATS.inactive} inactive
    </p>
  </div>
  <button className="rs-add-btn">
    <Plus size={15} />Add Talent
  </button>
</header>

{/* ── Stat Ledger ── */}
<div className="rs-ledger">
  {[
    { label: 'Available',  value: ROSTER_STATS.available, tone: 'positive' },
    { label: 'On Booking', value: ROSTER_STATS.booking,   tone: 'gold'     },
    { label: 'On Hold',    value: ROSTER_STATS.hold,      tone: 'neutral'  },
    { label: 'Inactive',   value: ROSTER_STATS.inactive,  tone: 'mute'     },
  ].map((s, i) => (
    <motion.div
      key={s.label}
      className={`rs-stat rs-stat--${s.tone}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 + i * 0.07, duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
    >
      <span className="rs-stat-num">{s.value}</span>
      <span className="rs-stat-label">{s.label}</span>
    </motion.div>
  ))}
</div>

{/* ── AI Intelligence Strip ── */}
<RosterIntelligenceStrip />

{/* ── Command Bar (search + filters) ── */}
<div className="ro-command-bar">
  <div className="ro-command-left">
```

The `ro-command-right` block must also have the old `ro-add-btn` button removed — it moved to `rs-header`. The resulting `ro-command-right` should be:

```jsx
<div className="ro-command-right">
  <span className="ro-result-count">
    {filtered.length} <span className="ro-result-of">of {ROSTER.length}</span>
  </span>
  <div className="flex items-center gap-1 p-1 bg-[#f0ede8] rounded-md">
    <button
      className={`p-1.5 rounded-md transition-all ${view === 'rows' ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
      onClick={() => setView('rows')}
      title="Compact rows"
    >
      <Rows size={16} strokeWidth={2.4} />
    </button>
    <button
      className={`p-1.5 rounded-md transition-all ${view === 'grid' ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
      onClick={() => setView('grid')}
      title="Card grid"
    >
      <LayoutGrid size={16} strokeWidth={2.4} />
    </button>
  </div>
</div>
```

Also wrap the top-level `<div className="ro-page...">` with a Framer Motion entrance:

```jsx
return (
  <motion.div
    className={`ro-page${activePanel ? ' ro-page--panel-open' : ''}`}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
  >
```

Close with `</motion.div>` at the bottom.

- [ ] **Step 4: Add header + ledger CSS to RosterPage.css**

Add these rules at the end of the `:root` block, before `/* ── Page Shell ── */`:

```css
/* ── Page Header ── */
.rs-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin: 8px 0 20px;
}

.rs-eyebrow {
  display: block;
  font-size: 9.5px;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--ag-gold);
  font-weight: 600;
  margin-bottom: 9px;
  font-family: var(--ag-font-body);
}

.rs-title {
  font-family: var(--ag-font-display);
  font-size: 34px;
  color: #16130D;
  line-height: 1.02;
  margin: 0;
  letter-spacing: -0.01em;
}

.rs-subline {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #9b9082;
  margin: 11px 0 0;
  font-family: var(--ag-font-body);
}

.rs-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #16130D;
  color: #FAF8F5;
  border: 1px solid #16130D;
  border-radius: 6px;
  padding: 11px 18px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  font-family: var(--ag-font-body);
  box-shadow: 0 8px 20px rgba(20, 18, 14, 0.16);
  transition: background 0.2s, border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.rs-add-btn:hover {
  background: var(--ag-gold);
  border-color: var(--ag-gold);
  color: #16130D;
  transform: translateY(-2px);
  box-shadow: 0 12px 26px rgba(184, 149, 106, 0.3);
}

/* ── Stat Ledger ── */
.rs-ledger {
  display: flex;
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e2dac9;
}

.rs-stat {
  flex: 0 0 auto;
  padding: 0 32px;
  border-left: 1px solid #e2dac9;
}

.rs-stat:first-child {
  border-left: none;
  padding-left: 0;
}

.rs-stat-num {
  font-family: var(--ag-font-display);
  font-size: 36px;
  color: #16130D;
  line-height: 1;
  display: block;
}

.rs-stat-label {
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #9b9082;
  margin-top: 10px;
  display: block;
  font-family: var(--ag-font-body);
}

.rs-stat--positive .rs-stat-num { color: #2D8A56; }
.rs-stat--gold     .rs-stat-num { color: var(--ag-gold); }
.rs-stat--neutral  .rs-stat-num { color: #16130D; }
.rs-stat--mute     .rs-stat-num { color: #b3a89a; }
```

Also update `.ro-command-bar` top padding to feel lighter now that the header is above:

Find:
```css
.ro-command-bar {
  ...
  padding: 20px 0 16px;
```

Change to:
```css
.ro-command-bar {
  ...
  padding: 12px 0 12px;
```

- [ ] **Step 5: Start dev server and verify the new header**

```bash
npm run dev:all
```

Open `http://localhost:5173/dashboard/agency/roster` (login: agency@example.com / password123).

Expected:
- Gold "SIGNED TALENT" eyebrow
- Playfair "Roster" heading (34px)
- Muted uppercase subline with live counts (should read ~"12 available · 3 on booking · 2 on hold · 5 inactive")
- Playfair numerals in the stat ledger with correct colors (green/gold/dark/muted)
- Intelligence strip with 3 advisory cards below the ledger
- Command bar (search + filters) below the strip

- [ ] **Step 6: Commit**

```bash
git add client/src/domains/agency/pages/RosterPage.jsx client/src/domains/agency/pages/RosterPage.css
git commit -m "feat(roster): serif header, stat ledger, intelligence strip integration"
```

---

### Task 3: Add talent insight data + per-row/card signal dots

**Files:**
- Modify: `client/src/domains/agency/pages/RosterPage.jsx`
- Modify: `client/src/domains/agency/pages/RosterPage.css`

- [ ] **Step 1: Add TALENT_INSIGHTS and INSIGHT_LABEL constants to RosterPage.jsx**

Add directly after the `ROSTER_STATS` constant:

```js
// Static mock insight data keyed by talent id.
// Shape: { type: 'attention' | 'opportunity' | 'growth', text: string }
// Designed to accept real API data later with no structural change.
const TALENT_INSIGHTS = {
  '1':  { type: 'opportunity', text: 'Sofia has strong Paris editorial credentials but has worked exclusively in US commercial boards this quarter. Her market position may be narrowing.' },
  '7':  { type: 'attention',   text: 'Marcus has been inactive for 4 months. A re-engagement call may revive the relationship before he explores other representation.' },
  '8':  { type: 'opportunity', text: 'Yuki is available and matches 2 active runway board briefs by profile and measurements. She hasn\'t been submitted to either.' },
  '9':  { type: 'growth',      text: 'Chloe\'s profile is missing key measurements. Completing this section could improve her placement in editorial casting searches.' },
  '12': { type: 'growth',      text: 'Alex\'s portfolio lacks editorial samples. Adding variety beyond commercial work could unlock higher-value booking opportunities.' },
  '13': { type: 'opportunity', text: 'Isabelle just completed Paris Fashion Week and is actively available. She matches 2 open runway board briefs that haven\'t been filled.' },
  '14': { type: 'attention',   text: 'Kofi has been inactive for nearly 7 months — the longest gap on your current roster. Consider a reactivation conversation or a mutual exit.' },
};

const INSIGHT_LABEL = {
  attention:   'Attention',
  opportunity: 'Opportunity',
  growth:      'Growth',
};
```

- [ ] **Step 2: Update toTalentObject to include insight**

Find the `toTalentObject` adapter and add `insight`:

```js
const toTalentObject = (t) => !t ? null : ({
  id:            t.id,
  profileId:     t.id,
  applicationId: null,
  name:          t.name,
  photo: t.img || null,
  type: t.type,
  status: t.status,
  location: t.location || null,
  measurements: { height: t.height || null, bust: t.bust || null, waist: t.waist || null, hips: t.hips || null },
  bio: t.notes || null,
  insight: TALENT_INSIGHTS[t.id] || null,
});
```

- [ ] **Step 3: Add signal dot to RosterRow**

In `RosterRow`, find the name column:
```jsx
<div className="ro-col-name">
  <span className="ro-name">{t.name}</span>
  <span className="ro-location"><MapPin size={10} />{t.location}</span>
</div>
```

Replace with:
```jsx
<div className="ro-col-name">
  <div className="ro-name-row">
    <span className="ro-name">{t.name}</span>
    {TALENT_INSIGHTS[t.id] && (
      <span
        className={`rs-signal rs-signal--${TALENT_INSIGHTS[t.id].type}`}
        title={TALENT_INSIGHTS[t.id].text}
      />
    )}
  </div>
  <span className="ro-location"><MapPin size={10} />{t.location}</span>
</div>
```

- [ ] **Step 4: Add insight chip to RosterCard**

In `RosterCard`, find `.ro-card-info`:
```jsx
<div className="ro-card-info">
  <div className="ro-card-name">{t.name}</div>
  <div className="ro-card-meta">
```

Replace with:
```jsx
<div className="ro-card-info">
  <div className="ro-card-name">{t.name}</div>
  {TALENT_INSIGHTS[t.id] && (
    <div className={`rs-card-signal rs-card-signal--${TALENT_INSIGHTS[t.id].type}`}>
      <span className="rs-card-signal-dot" />
      <span className="rs-card-signal-label">{INSIGHT_LABEL[TALENT_INSIGHTS[t.id].type]}</span>
    </div>
  )}
  <div className="ro-card-meta">
```

- [ ] **Step 5: Add signal CSS to RosterPage.css**

Append after the existing `.ro-bulk-clear:hover` rule:

```css
/* ── Insight Signal (row name dot) ── */
.ro-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rs-signal {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: help;
}

.rs-signal--attention   { background: #C0392B; }
.rs-signal--opportunity { background: var(--ro-gold); }
.rs-signal--growth      { background: #2D8A56; }

/* ── Insight Chip (grid card) ── */
.rs-card-signal {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 5px;
}

.rs-card-signal-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.rs-card-signal--attention   .rs-card-signal-dot { background: #C0392B; }
.rs-card-signal--opportunity .rs-card-signal-dot { background: var(--ro-gold); }
.rs-card-signal--growth      .rs-card-signal-dot { background: #2D8A56; }

.rs-card-signal-label {
  font-family: var(--ag-font-body, 'Inter', sans-serif);
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.rs-card-signal--attention   .rs-card-signal-label { color: #C0392B; }
.rs-card-signal--opportunity .rs-card-signal-label { color: var(--ro-gold); }
.rs-card-signal--growth      .rs-card-signal-label { color: #2D8A56; }
```

- [ ] **Step 6: Start dev server and verify signal dots**

```bash
npm run dev:all
```

Open `http://localhost:5173/dashboard/agency/roster`.

In **row view**: Sofia (id 1), Marcus (id 7), Yuki (id 8), Chloe (id 9), Alex (id 12), Isabelle (id 13), Kofi (id 14) each show a small colored dot next to their name. Hover the dot — a browser native tooltip appears showing the insight text.

In **grid view** (click the grid icon): those same 7 talents show an "Opportunity" / "Attention" / "Growth" chip below their name in the correct color.

Talent with no insight (e.g. Amara Diallo, id 2) shows no dot or chip.

- [ ] **Step 7: Commit**

```bash
git add client/src/domains/agency/pages/RosterPage.jsx client/src/domains/agency/pages/RosterPage.css
git commit -m "feat(roster): per-talent insight signals in rows and cards"
```

---

### Task 4: Extend TalentPanel → RosterZone with advisory block

**Files:**
- Modify: `client/src/domains/agency/components/TalentPanel.jsx`
- Modify: `client/src/domains/agency/components/zones/RosterZone.jsx`
- Modify: `client/src/domains/agency/components/zones/zones.css`

- [ ] **Step 1: Thread insight through TalentPanel**

In `TalentPanel.jsx`, find the `case 'roster':` in `renderZone()`:

```jsx
case 'roster':
  return (
    <RosterZone
      profileId={talent.profileId}
      applicationId={talent.applicationId}
      onImagesLoaded={setCarouselImages}
    />
  );
```

Replace with:
```jsx
case 'roster':
  return (
    <RosterZone
      profileId={talent.profileId}
      applicationId={talent.applicationId}
      onImagesLoaded={setCarouselImages}
      insight={talent.insight}
    />
  );
```

- [ ] **Step 2: Add advisory block to RosterZone**

In `RosterZone.jsx`, update the function signature from:
```jsx
export const RosterZone = ({ profileId, onImagesLoaded }) => {
```
To:
```jsx
export const RosterZone = ({ profileId, onImagesLoaded, insight }) => {
```

Then in the `return (...)` block, add the advisory block as the very first child inside the outer `<div>`:

```jsx
return (
  <div>
    {insight && (
      <div className={`zone-advisory zone-advisory--${insight.type}`}>
        <div className="zone-advisory-accent" />
        <div className="zone-advisory-body">
          <span className="zone-advisory-label">
            {insight.type === 'attention' ? 'Attention' : insight.type === 'opportunity' ? 'Opportunity' : 'Growth'}
          </span>
          <p className="zone-advisory-text">{insight.text}</p>
        </div>
      </div>
    )}

    {/* Portfolio Grid */}
    <div className="zone-section">
      <PortfolioGrid images={images} />
    </div>
    ...rest of existing content unchanged...
  </div>
);
```

- [ ] **Step 3: Add advisory block CSS to zones.css**

Open `client/src/domains/agency/components/zones/zones.css` and append at the bottom:

```css
/* ── Advisory Block (Roster panel context) ── */
.zone-advisory {
  position: relative;
  display: flex;
  margin-bottom: 16px;
  padding: 14px 16px 14px 20px;
  border-radius: 8px;
  background: var(--advisory-bg, rgba(201,165,90,0.06));
  border: 1px solid var(--advisory-border, rgba(201,165,90,0.2));
  overflow: hidden;
}

.zone-advisory-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--advisory-accent, #C9A55A);
}

.zone-advisory--attention {
  --advisory-accent: #C0392B;
  --advisory-bg: rgba(192,57,43,0.04);
  --advisory-border: rgba(192,57,43,0.18);
}

.zone-advisory--opportunity {
  --advisory-accent: #C9A55A;
  --advisory-bg: rgba(201,165,90,0.06);
  --advisory-border: rgba(201,165,90,0.22);
}

.zone-advisory--growth {
  --advisory-accent: #2D8A56;
  --advisory-bg: rgba(45,138,86,0.04);
  --advisory-border: rgba(45,138,86,0.18);
}

.zone-advisory-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.zone-advisory-label {
  font-family: 'Inter', sans-serif;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--advisory-accent, #C9A55A);
}

.zone-advisory-text {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  line-height: 1.6;
  color: #4a443c;
  margin: 0;
}
```

- [ ] **Step 4: Start dev server and verify advisory block in panel**

```bash
npm run dev:all
```

Open `http://localhost:5173/dashboard/agency/roster`.

Click **Sofia Marchetti** (first row). Expected: Panel opens. A gold-accented advisory card appears at the very top of the panel body (before portfolio images), reading: "Sofia has strong Paris editorial credentials…"

Click **Marcus Webb** (scroll to find him — row 7). Expected: Red-accented advisory card reading: "Marcus has been inactive for 4 months…"

Click **Kofi Mensah** (row 14). Expected: Red advisory: "Kofi has been inactive for nearly 7 months…"

Click **Amara Diallo** (row 2 — no insight). Expected: No advisory card — panel body starts directly with the portfolio grid.

- [ ] **Step 5: Commit**

```bash
git add client/src/domains/agency/components/TalentPanel.jsx client/src/domains/agency/components/zones/RosterZone.jsx client/src/domains/agency/components/zones/zones.css
git commit -m "feat(roster): advisory block in talent panel for roster context"
```

---

### Task 5: Final visual check

- [ ] **Step 1: Run dev server and do a full walkthrough**

```bash
npm run dev:all
```

Open `http://localhost:5173/dashboard/agency/roster`.

Check each item:

1. **Header**: Gold "SIGNED TALENT" eyebrow · Serif "Roster" h1 · Muted uppercase subline with live counts
2. **Stat ledger**: 4 Playfair numerals — green (Available), gold (On Booking), dark (On Hold), muted (Inactive). Numbers match the counts in the subline.
3. **Intelligence strip**: Visible by default, 3 cards (Attention red / Opportunity gold / Growth green), each with left accent, type label, title, body, CTA. Clicking the "Roster Intelligence" header collapses/expands with smooth animation.
4. **Command bar**: Search input, Gender dropdown, Type dropdown, result count, rows/grid toggle — all functional.
5. **Row view**: 7 talents (Sofia, Marcus, Yuki, Chloe, Alex, Isabelle, Kofi) show a small colored signal dot next to their name. Hovering the dot shows the insight text as a tooltip. Remaining 15 talents show no dot.
6. **Grid view** (click grid icon): The same 7 talents show a colored "Opportunity" / "Attention" / "Growth" chip below the name.
7. **NL search**: Type "female editorial available" → filters correctly.
8. **Panel — with insight**: Click Sofia → panel shows gold advisory at top. Click Marcus → red advisory. Click Kofi → red advisory.
9. **Panel — without insight**: Click Amara → no advisory, panel body starts with portfolio grid.
10. **Bulk select**: Select 2+ rows → floating bulk action bar appears at bottom.
11. **Page entrance**: Navigate away (e.g., to Overview) and back → page fades and slides up subtly; stat ledger animates in with stagger.

- [ ] **Step 2: Commit final**

```bash
git add -A
git commit -m "feat(roster): roster intelligence dashboard — complete"
```
