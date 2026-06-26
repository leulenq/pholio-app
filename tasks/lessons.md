# Lessons Learned

## 2026-06-25 — Billing scope distinctions

- Do not collapse separate billing concepts into one rule. "Agencies have no
  self-serve in-app billing" does not mean removing marketing-site
  enterprise/contact-sales offers, and "Studio+ is $9.99/month" does not rule
  out an annual Stripe price when the business also defines one.

## 2026-06-24 — Restoring reverted UI work

- After another editor touches the same UI surface, verify both JSX and CSS before assuming a component is still restored. The profile index rollback left the simplified JSX in place but reverted the nested-scroll/active-row CSS, so restoration checks need to include presentation selectors and responsive overrides.
- When a user asks to restore previous direction, include follow-up corrections from the same thread as part of the target state. For Booking Lanes, the restored state includes extra separation from license fields, no "Define the briefs..." paragraph, and no divider treatment.
- Important profile fields still need to live inside the profile tab's established rhythm. Do not jump to icon cards or dashboard-like controls when a premium thin-rule field treatment would preserve hierarchy and feel more native.
- When mixing custom choice surfaces with normal profile form fields, scope casing overrides only to the custom choice text. Let actual `PholioInput` / `PholioTextarea` labels inherit the profile-wide form label styling so field labels stay consistent.

## 2026-06-24 — Profile scroll tracking in talent shell

- Talent dashboard pages scroll inside `.tl-content`, not `window`. Profile section
  tracking and deep-link scrolling must resolve the page's scrollable ancestor
  before binding listeners or computing target offsets; otherwise the nav can
  remain stuck on the initial section.

## 2026-06-22 — Apply experience hierarchy and intelligence

- When a user chooses a specific agency before entering the apply flow, the UI
  must honor that decision as a focused single-agency composition. Do not keep
  chooser/sidebar framing, "Applying to" labels, or change-agency affordances in
  the first viewport unless the user entered from a broad apply-new path.
- "Premium" in the talent apply surface means better hierarchy and richer
  decision support, not more badges or status decoration. Avoid pulsing/status
  dots and standalone website links; integrate actions into the identity lockup
  and surface location as primary identity.
- Agency fit guidance should read as Pholio Intelligence: wants, strengths,
  missing signals, and weak/strong fit areas. A plain checklist or paragraph
  does not meet the bar for an agency decision surface.

## 2026-06-11 — Enumerated design options read as templates

- When the user asks for output that is "uniquely designed per X," any system
  built from enumerated choices (layout families, named grids, variant lists,
  fixed tone palettes) will eventually be called out as a template engine —
  even when seeded per-user. The bar is a continuous/parametric design space
  where the *data itself* (image geometry, image pixels, category, archetype)
  produces the parameters, and no two outputs share a recognizable skeleton.
- Pattern to reach for: generative solvers (constrained recursive
  partition for layout), measured signals (dominant color, luminance quiet
  zones) driving palette/type placement, and continuous ranges (type scale
  ratios, margins, pacing) instead of variant enums. Keep determinism via
  seeds; keep taste via hard bounds, not fixed options.
- This mirrors the login-redesign lesson: "rebuild from scratch" /
  "uniquely designed" means a real structural departure, not re-skinning.

## 2026-06-07 — Instruction sync before implementation

- When the user interrupts implementation to point at repository agent docs, stop the active feature work immediately and verify `CLAUDE.md` / `AGENTS.md` alignment before continuing. If a Codex-facing guide already exists, update or clarify that canonical file instead of creating a second competing instruction document.
- Treat "first" ordering language literally: complete the requested instruction/documentation grounding before returning to UI or code changes.

## 2026-06-04 — Premium visual feedback

- When the user calls out a high-value dashboard signal as visually weak, upgrade it as a reusable system component instead of styling one instance. The match score appears in overview cards, rows, drawers, and full profiles, so a shared badge with fixed dimensions, tones, and browser verification prevents uneven polish.
- In the agency dashboard, "premium" must not become rounded, filled, capsule-like, or ornament-heavy. Use the command-center shell vocabulary first: open typography, thin rules, restrained gold, square/minimal geometry, and no bulky badge containers unless the existing system already uses one.
- When a metric is meant to be luxury-minimal, avoid explanatory labels beside it unless explicitly requested. For match score, the final approved direction is raw number only in a sharp, thin-border rectangular frame.

## 2026-06-02 — Agency command-center redesign

- **Verify API response shapes by reading the route/query code before writing client mappers/selectors.** Writing `mapApplicant`/`selectKpis`/`selectPipeline`/alert + profile mappers against *assumed* field names caused a whole class of silent failures (Incoming list broken, pipeline all-gray, alerts non-clickable, greeting/nav-counts/logo blank) AND a hard crash (`Objects are not valid as a React child`) because every `/overview` KPI is a wrapper object (`pendingReview {count,oldestDaysAgo}`, `activeCastings {count,closingToday}`, `rosterSize {count,trend,changeThisMonth}`, `placementRate {current,lastSeason}`, `utilization {active,total,pct}`), not a scalar. The actual shapes live in `src/domains/agency/routes/inbox.js` (recent-applicants, `/me`) and `src/domains/agency/queries/overview.queries.js` (kpis/pipeline/alerts). Real payload field names there: applicants use `applicationId/profileId/profileImage/matchScore/location`; `/me` uses `agency_logo_path/agency_location` (no `membership_role`/`images`); pipeline labels are display strings; alerts use `link`/`message`.
- **`npm run build` + lint do NOT catch shape mismatches or object-as-child errors** — only runtime does. For a data-bound client change, a live click-through (logged in) is required before claiming "bound to real data." The client has no test runner, so this gap is real.
- The repo's `npm run lint` has pre-existing errors in unrelated files; gate changed work with `npx eslint <changed files>` (must be exit 0), not the repo-wide run.

## 2026-05-25

- When redesigning Sonner toasts, verify rendered data attributes and class attachment in `client/node_modules/sonner/dist` before styling. Sonner uses `data-sonner-theme`, not `data-theme`.
- For premium UI requests, prioritize high contrast and unmistakable brand posture first; subtle changes read as "no change" to users.
- Scope toaster styles to a namespaced host class (for example `pholio-toaster`) so styling is predictable and non-leaky.
