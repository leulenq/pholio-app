# Talent Dashboard Audit — Remediation Backlog

Audit conducted: 2026-06-23. Covers OverviewPage, MediaWorkspace, ApplyExperience, ProfileStrengthSidebar.

---

## P0 — Banned patterns (ship blockers)

- [x] **`quieter ApplyExperience`** — Remove `<span className="app-kicker">` eyebrows above headings (3 instances). *Done 2026-06-24.*

- [ ] **`quieter OverviewPage`** — Remove gradient text on `.ov-hero-firstname` in `OverviewPage.css:82-89`. *Deferred by user.*
  ```css
  /* REMOVE */
  color: transparent;
  background: linear-gradient(180deg, #d9c08f 0%, #c9a55a 58%, #b28f52 100%);
  -webkit-background-clip: text; background-clip: text;
  /* REPLACE WITH */
  color: var(--ov-gold);
  ```

---

## P1 — Contrast, touch targets, reduced motion

- [x] **`polish OverviewPage` — contrast tokens** — `--ov-text-faint` 0.22→0.45, `--ov-text-soft` 0.5→0.65; `--ov-signal-positive` token added, `ov-website-delta` now uses it. *Done 2026-06-24.*

- [x] **`adapt MediaWorkspace` — touch targets** — `.mw-frame__action` bumped from 28×28px to 36×36px. *Done 2026-06-24.*

- [x] **`animate OverviewPage + MediaWorkspace` — reduced motion** — `useReducedMotion()` guards added to all Framer Motion elements in both files. *Done 2026-06-24.*

---

## P2 — Token hygiene, perf

- [x] **`polish ProfileStrengthSidebar` — agency token bleed** — All `var(--ag-*)` references replaced with explicit talent-native values; serif switched from Playfair Display → Noto Serif Display. *Done 2026-06-24.*

- [x] **`optimize OverviewPage` — shimmer animation** — Rewritten from `background-position` to composited `transform: translateX()` on `::after` pseudo-element. *Done 2026-06-24.*

---

## P3 — Cleanup

- [x] **Remove deprecated `Header.jsx`** — Confirmed zero imports; deleted `Header.jsx` + orphaned `Header.css`. *Done 2026-06-24.*

- [x] **Fix `cursor: pointer` on `.ov-artifact-card`** — Removed; card div is a non-interactive wrapper, child `<Link>` and `<a>` elements carry pointer cursor automatically. *Done 2026-06-24.*

---

## One item remaining

- [ ] **`quieter OverviewPage`** — gradient text ban on `.ov-hero-firstname`. Deferred at user's request.
