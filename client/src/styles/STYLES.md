# Client Styling Reference

**Scope:** `client/src/styles/` — the React SPA only.
The marketing site (`landing/`) has its own Tailwind 4 setup. The EJS-rendered pages (portfolio, auth, errors) use `public/styles/global.css`, a separate file that is not edited here.

---

## Load Order

`main.jsx` and `index.css` together establish the full cascade:

```
main.jsx
  ├── styles/agency-tokens.css        ← 1. Agency token layer (--ag-*, --agency-*)
  ├── styles/agency-dark-overrides.css← 2. Tailwind→token remaps inside .ag scope
  └── index.css
        ├── Google Fonts (Inter, Playfair Display, Noto Serif Display, JetBrains Mono)
        ├── styles/tokens.css          ← 3. Talent/shared token layer (--color-*, --font-size-*, etc.)
        ├── styles/global.css          ← 4. Base resets + global primitives
        ├── styles/utilities.css       ← 5. Layout helpers, gold Tailwind shims, pholio-card/-label
        └── tailwindcss               ← 6. Tailwind utility layer
              @theme { gold-*, font-display }  ← extends Tailwind with brand tokens
```

Component-level `.css` files are co-located next to their JSX files and imported directly by the component (Vite processes them via the component's `import './Foo.css'`).

---

## File-by-File Reference

### `agency-tokens.css` — Agency Design Token Layer

Loaded first (before index.css) so every subsequent rule can reference `--ag-*`.

| Group | Key tokens | Notes |
|-------|-----------|-------|
| Surfaces | `--ag-surface-0` (#FAF8F5) through `--ag-surface-4` (#EDE9E3) | Warm cream scale |
| Brand gold | `--ag-gold` (#C9A55A), `--ag-gold-hover` (#B8956A), `--ag-gold-ghost/muted` | Gold is always Pholio gold, never agency-branded |
| Text | `--ag-text-0` (#1A1815) through `--ag-text-4` (#C8C2BA) | Warm dark → ghost scale |
| Borders | `--ag-border`, `--ag-border-strong`, `--ag-border-gold`, `--ag-border-error/warning/success` | |
| Semantic | `--ag-success/danger/warning/info` + `*-dim` tints | |
| Shadows | `--ag-shadow-sm/md/lg`, `--ag-shadow-gold` | Warm-toned |
| Typography | `--ag-font-display` (Playfair), `--ag-font-body` (Inter), `--ag-font-mono` | `--ag-font-serif` is an alias |
| Text sizes | `--ag-text-hero` through `--ag-text-mono` | rem scale |
| Motion | `--ag-ease`, `--ag-ease-spring`, `--ag-duration-fast/normal/slow` | |
| Layout | `--ag-sidebar-w` (220px), `--ag-header-h` (56px), `--ag-panel-w` (55%) | |
| Talent layout | `--td-sidebar-w`, `--td-topbar-h`, `--td-content-pad-*`, `--td-section-gap`, `--td-module-gap` | Talent dashboard geometry |
| Radii | `--ag-radius-sm/md/lg/xl/full` | 4 / 8 / 12 / 20 / 100px |
| Spacing | `--ag-page-x/y`, `--ag-card-pad`, `--ag-gap` | Page and card gutters |
| Z-index | `--ag-z-base/dropdown/panel/modal/toast` | 1 / 20 / 40 / 100 / 200 |
| Kanban | `--ag-kanban-col-min`, `--ag-kanban-card-gap` | |
| Branding hooks | `--agency-primary/-hover/-light`, `--agency-shadow-focus` | Runtime agency-brand accent, overridden on `.ag-shell`; the old `--agency-*` alias family is deleted — use `--ag-*` |
| Error primitives | `--ph-error-*` | Shared across agency and talent error states; bridge between the two token systems |

---

### `agency-dark-overrides.css` — Tailwind→Token Remaps

Scoped under `.ag` (the agency shell root element). Remaps common Tailwind utility classes (`bg-white`, `bg-gray-50`, `text-gray-900`, etc.) to agency tokens so Tailwind-authored components look correct inside the agency dashboard without needing to re-author every class.

---

### `tokens.css` — Talent / Shared Token Layer

Used by talent dashboard components and shared utilities. Not used by agency components (those use `--ag-*` exclusively).

| Group | Key tokens |
|-------|-----------|
| Primary | `--color-primary` (#C9A55A), `--color-primary-hover` (#b08d45) |
| Gold scale | `--color-gold-400/500/600` |
| Text | `--color-text-dark` (#0f172a), `--color-text-slate` (#64748b), `--color-text-light` (#94a3b8) |
| Backgrounds | `--color-bg-primary` (#faf9f7), `--color-bg-secondary`, `--color-bg-surface` |
| Borders | `--color-border-light` (#e2e8f0), `--color-border-hover` (#cbd5e1) |
| Semantic | `--color-success/error/warning/info` |
| Error primitives | `--ph-error-*` (mirrors agency-tokens.css version; both resolve to the same values via `--ag-*` vars) |
| Font sizes | `--font-size-xs` (12px) through `--font-size-4xl` (36px) |
| Font weights | `--font-weight-regular/medium/semibold/bold` |
| Letter spacing | `--letter-spacing-tight/normal/wide` |
| Spacing | `--spacing-xs` (8px) through `--spacing-3xl` (48px) |
| Radii | `--radius-sm/md/lg/xl/pill` (4 / 8 / 12 / 16 / 9999px) |
| Shadows | `--shadow-elevation-1/2/3`, `--shadow-card`, `--shadow-button-hover`, `--shadow-focus` |
| Transitions | `--transition-fast/normal/slow` |

---

### `global.css` — Base Resets & Global Primitives

**245 lines** of app-level rules that must be in scope for every page.

| Section | What it does |
|---------|-------------|
| `:root` vars | 9 variables consumed only by this file's own rules (font stacks, `--color-bg`, `--color-accent`, `--max-width`, `--header-height`). Full tokens are in `tokens.css` / `agency-tokens.css`. |
| Box-model reset | `*, *::before, *::after { box-sizing: border-box }` |
| Document base | `html` (font-size 16px, smooth scroll), `@media (prefers-reduced-motion)` disables scroll-behavior |
| `body` | Warm canvas background, text color, Inter font, 1.6 line-height |
| `a` | Strips link chrome; decoration/color applied per component |
| Focus rings | `:focus-visible` on `a, button, input, textarea, select` → 2px gold outline |
| `img` | `max-width: 100%; display: block` |
| `.lucide` | `flex-shrink: 0` + pointer-events fix for icon-only buttons/links |
| `.skip-link` | Off-screen by default; revealed on `:focus` (WCAG 2.4.1) |
| `.container` | `min(90%, 1240px)` centered wrapper |
| Button reset | `:where(body:not(.is-agency)) button, input[type="submit"]` — baseline radius/padding/cursor for talent pages. The `.is-agency` guard prevents conflict with `ag-*` button styles in the agency dashboard. |
| Table reset | `.table-responsive` (overflow-x scroll) + scoped `table/th/td` defaults |
| Form inputs | `:where(body) input/textarea/select` — unified 44px height, gold focus ring, warm placeholder color |
| Form/label | `:where(body:not(.is-agency)) form/label` — grid gap and uppercase label style for talent/auth forms |

**The `.is-agency` guard:** `AgencyLayout.jsx` adds `is-agency` to `<body>` on mount and removes it on unmount. All `:where(body:not(.is-agency))` selectors in global.css are therefore inactive while any agency page is rendered.

---

### `utilities.css` — Layout Helpers & Shared Component Tokens

**208 lines** in two logical halves:

#### Part 1 — Tailwind-mimicking layout utilities
A minimal set of Flexbox/grid helpers that predate the full Tailwind integration. Still in use in a few talent-side components.

```
.flex, .justify-between, .justify-end, .items-center
.space-y-6, .space-y-4, .mb-6, .pt-4, .w-full
.text-xl, .font-bold
.grid, .gap-4, .grid-cols-1, @media md:grid-cols-2/3, md:w-auto
```

#### Part 2 — Gold color shims + `font-display`
Tailwind v4 `@theme` does not generate these utility classes automatically, so they are declared explicitly as unlayered rules (higher specificity than `@layer utilities`):

```
.font-display            → Playfair Display
.text-gold-400/500/600
.bg-gold-500/600  + .bg-gold-500/{5,8,10}
.border-gold-500  + .border-gold-500/{10,20,30}
.hover:text-gold-500, .hover:bg-gold-500/600, .hover:border-gold-500
.focus:border-gold-500, .ring-gold-500
```

#### Part 3 — Shared component tokens
Reusable presentation classes for the dashboard design system:

| Class | Purpose |
|-------|---------|
| `@keyframes dash-entrance` | `translateY(10px) → 0` fade-up entrance; used by dashboard panels |
| `@keyframes panel-drop` | `translateY(-4px) → 0` drop-in for floating panels |
| `.pholio-card` | Standard elevated card (`--ag-surface-1`, 20px radius, warm shadow + inset highlight) with hover lift |
| `.pholio-label` | All-caps metadata label above sections (0.6875rem, 0.12em tracking, `--ag-text-3`) |
| `.pholio-section-heading` | Playfair Display section heading at dashboard scale (1.25rem) |
| `.scrollbar-hide` | Hides native scrollbars while preserving scroll functionality (Firefox + WebKit) |
| `.agency-textarea` | Premium editorial textarea — white bg, 2px border-radius, hairline border, gold focus ring |

---

## Tailwind Integration (`index.css` `@theme` block)

Extends Tailwind's color palette and font scale with brand tokens:

```css
--color-gold-400: #D4AF37
--color-gold-500: #C9A55A   ← primary brand gold
--color-gold-600: #B8944A
--font-sans: "Inter", system-ui, sans-serif
--font-display: "Playfair Display", serif
```

These feed `text-gold-500`, `bg-gold-500`, `font-display`, etc. in Tailwind markup. `utilities.css` provides the same classes as a fallback for cases where Tailwind doesn't generate them.

`index.css` also globally suppresses number input spinners (webkit + Firefox).

---

## Component-Level CSS Pattern

Each component owns its styles in a co-located `.css` file. The convention for selectors is a short BEM-like prefix tied to the component:

| Prefix | Component area |
|--------|---------------|
| `ag-*` | Agency shell / nav / shared agency UI |
| `tp-*` | TalentPanel |
| `tm-*` | TeamModal |
| `iv-*` | InterviewCard |
| `sc-*` | ScoutRoom (the Scout expanded lead view) |
| `ov-*` | OverviewPage / OverviewPulse |
| `cas-*` | CastingPage / CastingPanel |
| `tfv-*` | TalentFullView |
| `an-*` | AnalyticsPage (agency) |

Agency-domain components also use `--ag-*` tokens directly in their CSS rather than hardcoding values.

---

## Dead Files (Not Imported, Safe to Delete Later)

| File | Lines | Why dead |
|------|-------|----------|
| `styles/dashboard-shell.css` | 275 | Legacy talent dashboard shell. The actual shell moved to `TalentLayout.css` + Tailwind; 0 classes referenced in JSX. |
| `styles/dashboard.css` | 173 | Legacy sidebar layout. Never imported in the current codebase. |

These files are not imported by `index.css` or any component. They pose no runtime cost but clutter the directory.

---

## What Goes Where — Quick Guide

| I need to… | File to touch |
|------------|--------------|
| Add a new `--ag-*` token (agency dashboard) | `agency-tokens.css` |
| Add a new `--color-*` or `--spacing-*` token (talent/shared) | `tokens.css` |
| Fix a global reset or base browser behavior | `global.css` |
| Add a new gold Tailwind utility class | `utilities.css` |
| Add a new shared component pattern (pholio-card variant, etc.) | `utilities.css` |
| Style a specific component | Co-located `<Component>.css` |
| Override how a Tailwind class looks inside the agency shell | `agency-dark-overrides.css` |
