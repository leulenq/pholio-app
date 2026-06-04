# Lessons Learned

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
