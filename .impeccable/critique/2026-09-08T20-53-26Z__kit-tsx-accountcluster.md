---
target: pholio-site AccountCluster (components/header/kit.tsx)
total_score: 21
p0_count: 2
p1_count: 3
timestamp: 2026-09-08T20-53-26Z
slug: kit-tsx-accountcluster
---
Method: dual-agent (A: design review · B: detector/manual evidence)

## Design Health Score: 21/40 — Acceptable, before rebuild

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Logout gave no feedback between click and reload |
| 2 | Match System / Real World | 3 | Labels correct and honest |
| 3 | User Control and Freedom | 2 | No Escape, no focus return, one-frame vanish on close |
| 4 | Consistency and Standards | 2 | Trigger `focus:outline-none` with no replacement; no aria-haspopup/role |
| 5 | Error Prevention | 2 | Unguarded logout call; destructive action visually identical to nav rows |
| 6 | Recognition Rather Than Recall | 3 | Icon+label rows, email visible |
| 7 | Flexibility and Efficiency | 2 | No keyboard nav; no "Dashboard" row despite `dashboardHref` in scope |
| 8 | Aesthetic and Minimalist Design | 1 | Rows ~60% empty measure; identity block over-padded relative to rows |
| 9 | Error Recognition/Recovery | 1 | No error state anywhere in the component |
| 10 | Help and Documentation | 3 | Agency gets Help & Support, talent doesn't (asymmetric but deliberate) |
| **Total** | | **21/40** | **Acceptable band** |

## Anti-Patterns Verdict

Deterministic scan (`detect.mjs`): 0 findings, file-wide, verified genuine (no config/inline suppressions). Manual fallback found one soft signal: a hardcoded `#050505` literal duplicating `TOKENS.ink.surface` instead of referencing it.

LLM assessment: not AI-slop by the mechanical checklist, but "transferable" — the structure (bordered rectangle, icon+label rows) is the most over-represented account-menu shape on the web, applied *to* rather than generating Pholio's own vocabulary. The one already-approved Pholio-specific exception (`03-banned-ui.md §4.5`'s profile-strength hairline) had been dropped with nothing replacing it.

## Priority Issues (pre-rebuild)

- **[P0]** Panel lived inside `HeroChrome`'s scroll-driven transform/opacity timeline — an open menu would slide/fade away mid-scroll while `open` stayed true, then reappear at partial opacity.
- **[P0]** No keyboard design: `focus:outline-none` with no replacement, no focus-visible state on rows (hover was mouse-only), no Escape, no aria roles.
- **[P1]** Panel read as an unattached floating card: 18px unbridged gap, full 1px border invisible against a photo, right-aligned under nothing.
- **[P1]** Email and role label sat at ~2.8:1 contrast (`textFaint` on `panel`), below the 4.5:1 floor, on the one field that confirms account identity.
- **[P1]** No "Dashboard" row despite it being the single most likely reason a signed-in visitor opens this menu from the marketing site; no plan/tier confirmation; logout unguarded (no catch, no pending state).
- **[P2]** Uneven internal rhythm — identity block over-padded, rows under-padded relative to actual content density.

## Rebuild — what changed and which finding it answers

- Portaled the close behavior to a `closeSignal`/`closeAt` prop (`MotionValue<number>` from the hero's own exit timeline) so an open menu closes itself the instant its animated ancestor starts moving, instead of riding along with it. Root-caused via `HeroChrome.tsx`'s `useTransform` timeline, not a scroll-listener band-aid.
- Real keyboard support: Escape closes + returns focus to the trigger; `ArrowUp`/`ArrowDown` rove focus across `role="menuitem"` rows; `aria-haspopup="menu"` + `aria-controls` + `role="menu"`/`"menuitem"`; native `:focus-visible` outline (gold, using the site's own `focus-visible:` idiom already present on `NavLink`) on the trigger and every row; hover and keyboard focus now share one visual state (`active`, driven by both `onMouseEnter`/`onMouseLeave` and `onFocus`/`onBlur`).
- Real exit animation via `AnimatePresence` (was a one-frame vanish).
- Anchoring: gap cut from 18px to 8px; the full 1px border replaced with the site's own pre-approved `GoldSweep` hairline as the panel's top edge plus a closing `Rule` — a slab of the page's own paper closed by hairlines, not a bordered card.
- Contrast: email promoted from `textFaint` (~2.8:1) to `textMuted` (~6.4:1).
- Content: added a full-strength "Dashboard" row leading the list (the one row with no app-side equivalent, since inside the app you're already there); added a talent-only Plan fact (Free/Studio+) in the identity block using `Kicker` in gold — the same sanctioned-furniture slot the removed profile-strength hairline used to occupy, adapted to a binary fact rather than reintroducing a percentage/progress-bar pattern that the real app's account menu doesn't have; guarded logout with try/catch, a pending "Signing out…" state, and an inline failure message instead of silent failure.
- Rebalanced row padding (11px → 13px vertical) and panel width (288px → 264px) so rows carry more visual weight relative to the identity block.
- Fixed the one detector-flagged literal: avatar-initial color now references `TOKENS.ink.surface` instead of a bare `"#050505"` string (same value, real reference).

Verification: `tsc --noEmit` clean, `eslint` 0 errors (5 pre-existing warnings elsewhere, untouched), `detect.mjs` 0 findings post-rebuild, dev server confirmed serving the change live (200, no error overlay).
