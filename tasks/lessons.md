# Lessons Learned

## 2026-08-04 — A newer main-side UI edit is not automatically canonical

- When a feature branch and `main` contain competing complete interface directions,
  do not assume the later `main` components should be blended into the feature.
- Show both rendered results before resolving the conflict when product intent is
  unclear. If the owner identifies `main` as outdated, replace that implementation
  with the approved branch design instead of producing an unrequested hybrid.

## 2026-07-30 — Scroll endpoints cannot depend on trailing percentage flex spacers

- Firefox and Chromium can disagree about whether a trailing percentage flex
  item contributes usable horizontal overflow. A tape may therefore update its
  value while its last marks stop short of the center needle.
- Build endpoint centering into one scrollable scale using inline padding. When
  tick markers sit on the left edge of fixed-width tick boxes, subtract one
  tick width from the trailing padding so maximum scroll equals the final
  marker's target exactly.
- Verify geometry numerically at both endpoints (`scrollLeft`, `maxScroll`, and
  marker-to-indicator delta), not only by looking at a middle value.

## 2026-07-30 — Widening a measuring-tape range changes its empty-state behavior

- A finite tape/slider uses its range for more than validation: its midpoint
  controls where an unset field rests and what first contact can initialize.
- When replacing narrow business ranges with broad technical bounds, preserve
  an explicit unset resting value so the control does not jump to a surprising
  new default.
- Keep height-specific feet/inches parsing opt-in. Circumference fields sharing
  the `in` unit still need ordinary decimal-inch semantics.

## 2026-07-29 — Don't vertically centre an overlay inside a native-control field

- Two offset attempts failed to align the date-of-birth age readout with
  Firefox's native calendar button: a `top` derived from label metrics sat too
  high, and a `bottom`-anchored translate sat too low. Any magic offset is
  guessing at a line box the browser owns.
- Fix: put the derived value on the **label line** (`top: 0; right: 0`) with the
  label's exact font metrics. It is aligned by construction, needs no offset,
  and cannot collide with the native picker button.
- Keep the overlay's font-size in sync with the label inside responsive queries,
  or the shared baseline breaks on mobile.

## 2026-07-29 — Drawer height animation must not permanently clip dropdowns

- Framer Motion height expand/collapse needs `overflow: hidden` only while
  animating. Leaving it on after open clips absolutely positioned selects
  (`PholioCustomSelect`) at the drawer edge — Board/Market looked cropped in
  Saved cards.
- Pattern: clip during `onAnimationStart`, set `overflow: visible` in
  `onAnimationComplete` when open; re-clip before exit. Prefer this over
  portaling unless multiple ancestors clip.

## 2026-07-29 — Reuse Profile field geometry exactly

- When the user says a control should match `/profile`, inspect the scoped
  Profile CSS before styling it. `PholioCustomSelect` / `PholioInput` alone do
  not provide the Profile appearance; `ProfilePage.module.css` overrides the
  shared 8px wells with 2px editorial field radius, white hairline borders,
  JetBrains Mono field titles, light 300-weight text, and a restrained gold
  focus state.
- A compact version may reduce height, width, font size, and padding for its
  context, but should preserve the source control's geometry and state language.
  Do not describe an approximation as matching the Profile field.
- Talent `global.css` uppercases every bare `<label>`. Scoped form titles must
  explicitly set JetBrains Mono / tracking / faint color, or they inherit the
  generic Inter uppercase treatment and look wrong next to Profile.

## 2026-07-29 — Media publishing controls: use enforced audience flags and shared controls

- Do not compose a premium audience selector from a one-off checkbox styled as
  a switch. Firefox exposed inconsistent native checkbox rendering despite the
  custom CSS. Use the shared `PholioToggle` and scope its dark-surface treatment.
- Talent `global.css` uppercases every `<label>`. Sentence-case controls inside
  talent overlays must explicitly reset `text-transform` and `letter-spacing`
  on the actual labels, then be verified in the running browser.
- `metadata.visibility` is not used by portfolio or agency image queries.
  `exclude_from_public` and `exclude_from_agency` are the enforced sources of
  truth. UI state and legacy metadata must derive from those columns rather
  than presenting three controls that can contradict one another.
- Premium composition on a narrow editor rail means open rows, clear hierarchy,
  and quiet hairlines—not nested bordered cards, saturated tracks, all-caps
  labels, or explanatory copy competing at the same weight.

## 2026-07-27 — Settings Identity blank names = mount hydration skip, not missing data

- `IdentityMovement` used empty `useState` + "adjust during render" sync that
  seeded `prevProfile` with the already-cached `auth-user` profile. On normal
  in-dashboard navigation the profile reference never changed on mount, so First
  / Last name stayed blank even though the account menu and Profile tab read the
  same cache correctly.
- Pattern: if local form state must mirror server data, **seed `useState` from
  the cached value** (like the public-handle field already did). Do not rely on
  a prev-value sync alone when `prev` is initialized to the current value.
- After `updateProfile`, merge the PUT response into `auth-user` before clearing
  dirty state, or `setDirty(false)` can race-wipe the form with a stale cache.
- Keep `users` and `profiles` name columns aligned on save/login; GET should fall
  back to the account layer when the book row is blank.

## 2026-07-26 — Intel page: keep intel2, never restore `instruments/`

- Canonical UI is the **intel2** flat tree (`PulseZone`, `IntelKit`, `intel2-*`
  CSS) in `client/src/domains/talent/pages/IntelPage/`. See `IntelPage/README.md`.
- A parallel **`instruments/` rewrite** (commits `c6fa4b5`–`17cb101`) was merged
  on `main` by mistake and regressed the finished design twice. Do not check out
  that path from git history, ours-merge stale intel branches, or reintroduce
  `instruments/parts.jsx`.
- `useIntel` must return `{ intel, meta, … }`; intel2 `index.jsx` maps `intel`
  to zone payloads. Hook thinning during unrelated merges also caused blank pages.

## 2026-07-26 — Intel page blank = hook return-shape regression, not a missing design

- `IntelPage` destructures `{ intel, meta, isLoading, isError, refetch }` from
  `useIntel`. Returning raw `useQuery` makes `intel`/`meta` always `undefined`:
  masthead only, free-tier period locks, empty content. Check the hook contract
  before redesigning zones or reseeding data.
- Thinning a domain hook to "just return useQuery" during an unrelated merge
  (`Fix duplicate settings notification handler`) is a high-blast-radius footgun
  when call sites already depend on a named shape.

## 2026-07-24 — Concurrent Netlify previews can fail without an app regression

- Four red Netlify checks (`deploy-preview`, Redirect/Header/Pages) can all fail together when the
  deploy itself errors; they are cascades, not four independent product bugs.
- If GitHub Actions is green and an earlier commit on the same PR already has a ready deploy
  preview, check whether a second push launched within a few seconds. Concurrent previews can
  error with empty summary / `plugin_state: none` even when the diff is docs-only.
- Fix by pushing one clean retrigger after the prior build settles; avoid back-to-back pushes
  that overlap Netlify build slots when possible.

## 2026-07-24 — Global AI agent operating rule is mandatory across providers

- Model choice, token budget, quality escalation, and parallel coordination are governed by
  `docs/ai-agent-operating-rule.md` (Cursor: `.cursor/rules/ai-agent-operating-rule.mdc`).
- Map vendor model names to Fast / Standard / Strong / Frontier; default Standard; escalate on blast radius.
- Parallel writers: disjoint file ownership only; no shared writable files; no worker commits; lead integrates.
- Simple tasks stay single-agent end-to-end (including commit). Do not invent multi-agent ceremony.

## 2026-07-24 — Login browsewrap must send the same legal payload as signup

- `/login` must never auto-create talent accounts. Unknown Firebase identities
  return `NEEDS_ONBOARDING` + `redirect: /onboarding`; the client sends them into
  casting. Legal acceptance is recorded during `/onboarding/entry`, not login.
- Agency team invites remain the only login auto-provision path.
- After `NEEDS_ONBOARDING`, stash Google/Instagram profile in sessionStorage and
  redirect to `/onboarding?continue=google|instagram`. CastingEntry must resume
  from `auth.currentUser` (wait for Firebase persistence) and call entry without
  a second OAuth popup. Requiring another Google click is a product bug.
- `LegalNoticeLine` on login is still browsewrap disclosure for existing sign-in;
  do not treat it as permission to skip casting for new talent.

## 2026-07-11 — Pholio cinematic work cannot be a luxury SaaS template

- Never hand-type or approximate the Pholio wordmark. Reuse the canonical shared mark: uppercase Noto Serif Display, fixed platform gold, wide tracking, and the established sweep where the shared component provides it.
- An ink sidebar, cream form pane, serif headline, and gold button do not by themselves make a surface Pholio. Full-height steppers, fake dashboard previews, avatar ledgers, checklist reviews, and success-metric strips remain generic onboarding grammar even when recolored.
- Borrow talent `/apply` and onboarding at the level of pacing: one subject per scene, chapter-specific composition, stable action dock, meaningful image/identity material, and an earned terminal reveal. Do not copy talent-specific controls or decoration into the agency system.
- Use real agency language (`agency owner`, `booker`, `board/division`, `team access`) instead of stacking invented luxury metaphors such as house, room, door, and steward.

## 2026-07-11 — Parallel agents need strict integration ownership

- When the user requests parallel agents, assign each agent a disjoint file or read-only review lane, prohibit agent commits, and keep shared integration files with the lead agent.
- The lead agent owns all cross-lane review, verification, task documentation, and commit grouping; agents report findings rather than landing overlapping changes.
- Visual, JSX, and routing audits make good parallel read-only lanes for a frontend redesign because they surface independent classes of defects without filesystem collisions.
- Codified globally in `docs/ai-agent-operating-rule.md` §6 (Parallel Agent Coordination).

## 2026-07-02 — Trace apparent field lines to section boundaries

- A horizontal line near the bottom of a field may belong to the next section, not the field itself.
  Trace the DOM order and shared section wrapper before changing input borders.
- When several lines appear at equivalent subsection boundaries inside one movement card, disable the
  shared `Section` divider at those call sites rather than adding CSS exceptions around individual fields.
- Divider visibility and section rhythm are separate requirements. If a shared divider also provides
  spacing, preserve an equivalent divider-free gap when hiding the rule.

## 2026-07-01 — Improve selected surfaces without adding symbolic confirmation

- When the user rejects one selected-state treatment, do not assume a checkmark is the desired
  replacement. A stronger full border, tonal surface, and type weight can communicate selection
  without adding another symbol.
- Preserve explicitly approved structure. For a platform field that already lives in the correct
  section, wire its native brand color into focus/click states instead of moving it into a different
  card system.

## 2026-07-01 — "From scratch" means design the ideal first, then derive the data plan

- When the user says a surface is being rebuilt from scratch and the current
  page is irrelevant, do not anchor the plan on the existing event stream,
  tables, or endpoints. That quietly reintroduces the old product as a
  constraint.
- Correct order: (1) design the ideal product — the full signal model and the
  premium visualizations it deserves; (2) derive the capture/infrastructure
  roadmap that serves that design. "Phase 1 = what exists today" is a
  sequencing detail at the end, never the frame of the spec.
- "Premium data visualization" is a requirement, not decoration: propose named,
  bespoke visual instruments (what is drawn, from what data, why it means
  something), not generic chart types.

## 2026-06-30 — Inventory intentional exceptions before enforcing a component boundary

- A design-system rollout should not assume every native button is a command
  button. Navigation indexes, dense selection fields, embedded input controls,
  and editorial list rows may have established interaction treatments that
  should remain surface-specific.
- Before adding hard global role enforcement, classify existing controls into
  generalized commands versus intentional exceptions and record those
  exceptions explicitly. Preserve the shared system for real command buttons
  without flattening specialized navigation and selection affordances.
- Do not classify exceptions from JSX tag names alone. Existing
  `PholioButton` usages can still be intentionally surface-specific when a
  local class owns their treatment; hard `!important` role rules will silently
  redesign them unless they are converted to an explicit native exception.

## 2026-06-30 — Locate and read the approved design artifact before migration

- When the user says the designs already exist, do not infer the system from
  current production CSS. Locate the referenced preview—even in Claude's
  scratchpad—and treat its role taxonomy, tokens, and interaction states as the
  contract before changing call sites.
- A partial command-button migration is not a design-system remediation.
  Inventory standalone flows, tabs, selectors, icon actions, button-like links,
  shared overlays, and local hover rules before defining scope.

## 2026-06-30 — Claude-generated previews may live outside the repo tree

- Before concluding that a generated preview does not exist, search ignored
  directories, `.superpowers`, Claude file-history/session references, and the
  matching `/private/tmp/claude-*` scratchpad.
- Distinguish persistent repository files from temporary Claude artifacts when
  returning the path.

## 2026-06-29 — Disclosure copy must match the whole data lifecycle

- Do not use absolute claims such as “never published” or “never shared
  elsewhere” when media URLs, exports, downloads, or recipient-controlled copies
  exist. State the actual workflow, recipient, retention period, withdrawal
  effect, and limits on recalling external copies.
- A retention timestamp and lazy read-time redaction do not establish a real
  retention policy. Wire expiry into the production scheduled cleanup path and
  test that expired payloads are stripped even when no reviewer opens them.
- For minors, minimize the package at the server snapshot boundary and again at
  the agency DTO boundary. Hiding fields in the review UI is not enough when a
  route still spreads the full live profile.

## 2026-06-28 — A submission snapshot is only real when every reviewer reads it

- Trace curated submission data through both sides of the workflow: talent
  write, application relationship, agency list preview, quick-view, and full
  review. Persisting a payload is not a feature if reviewer queries still load
  the live profile.
- Once an application-scoped package exists, never merge live profile media
  into it. A live-data fallback is acceptable only for legacy applications
  that predate package snapshots; otherwise held-back frames can reappear.
- Snapshot canonical server values for disclosed contact, media metadata, and
  comp-card direction. Do not preserve client-supplied labels when the server
  can resolve the owned record.
- Agency "open boards" in `/apply` are division labels, while the agency
  `boards` table also carries casting briefs. Preserve the submitted label in a
  dedicated relation, then explicitly resolve it into `board_applications`
  when pipeline placement is required. Reuse a case-insensitive agency board
  match before creating a corresponding active board.

## 2026-06-28 — Trace the live email-template export before editing

- `src/shared/lib/email.js` imports email builders from `./pholio-email`, whose
  active guardian template is `src/shared/lib/pholio-email/templates.js`.
  `src/shared/lib/email-templates.js` is not the live path for that email.
- When changing email content or adding template parameters, trace the import
  from sender to barrel export to concrete builder, then test the final rendered
  HTML. Verifying that the service passes a value is insufficient if the active
  template does not destructure and render it.
- For consent, recipient specificity must appear before the guardian decides;
  naming the agency only on the post-verification page does not make the consent
  request informed.

## 2026-06-28 — Shipping strong talent /apply + /applications UI (long redesign thread)

### Match the existing design language — never invent one
- Before designing any talent submission/market surface, READ the real source first:
  `ApplicationsView.css` (`--app-*` tokens, `.app-*` classes) and `ApplyPage/ApplyExperience.{jsx,css}`.
  Reuse warm-cream `--app-*` tokens, hairline rules, JetBrains-Mono micro-labels, Noto Serif Display
  headings, square `var(--app-radius)` (6px) corners, gold `--app-gold`. The /apply flow IS the
  /applications editorial-ledger language; do not author a parallel aesthetic.
- When the user references an existing pattern ("like the page-1 board picker", "the agency sidebar
  wordmark + divider + agency name", "the /apply facts rail", "use the attached image"), find that EXACT
  component (`apply-board__opt`, agency `CoBrandLockup`, `apply-editorial-rail__facts`) and adapt it.
  Don't approximate from memory.
- Two SEPARATE design systems: talent (warm, motion-forward, Noto Serif Display, larger radius) vs
  agency (composed, dense, Playfair, command-rail). Never blend them. See [[two-design-systems]].

### Verify in the running app, not just build/lint
- `npm run client:build` + `npx eslint <changed files>` (must be exit 0; repo-wide lint has pre-existing
  errors) catch compile/unused only. They do NOT catch text overflow, inherited `text-transform`, leaked
  `box-shadow`/`border-radius`, wrong focus colors, layout breakage, or whether the feature actually works.
- Drive the real app with Puppeteer (system Chrome `/Applications/Google Chrome.app/...`, `headless:'new'`).
  Vite :5173 serves source via HMR (no build needed for screenshots) and proxies `/api` to Express :3000;
  `AUTH_PASSTHROUGH_ENABLED=1` auto-logs-in talent@example.com / agency@example.com by path/referer — just navigate.
- PROBE the DOM; don't eyeball. `getComputedStyle` / `getBoundingClientRect` caught the real bugs here:
  consent text uppercased by an ancestor rule, a "borderless" textarea still showing the global inset
  "well" box-shadow, and the agency `<h1>` measured overflowing the rail.
- To reach a specific apply step in a screenshot, seed an `application_drafts` row with `current_step_id`
  set; the flow hydrates straight to it. Consent does NOT auto-restore from the draft — click the checkbox
  in-browser to enable submit. The dev DB is reseeded periodically, so agency/profile/preset IDs change —
  re-fetch current IDs from the DB before scripting; a stale id silently falls back to the chooser.

### Codebase style gotchas (check these every time something looks off)
- Bare `<button>` on talent pages inherits `border-radius:999px` from `global.css`
  `:where(body:not(.is-agency)) button` → custom buttons MUST set `border-radius:0` or they render as pills.
- `:where(body) textarea:focus { background:#fff; box-shadow: gold halo+inset }` (global.css) → override
  background/border/box-shadow on any custom textarea focus or it flashes white.
- A broad apply-experience rule uppercases `.app-consent-check` → use a dedicated class with explicit
  `text-transform:none; letter-spacing:normal` for sentence-case consent.
- `--app-*` tokens are scoped to `.applications-view-container`. Anything `createPortal`'d to `<body>`
  (e.g. a success overlay) MUST re-declare the token set on its root, or it renders black/unstyled.
- Size headings/values for the LONGEST real data, not the demo agency. The agency `<h1>` overflowed for
  every long house name and only "Marilyn Agency" fit — fix with a smaller `clamp()` + `min-width:0;
  overflow-wrap:anywhere; hyphens:auto`; add `overflow-wrap:anywhere` to mono value cells (long domains).

### Motion
- framer-motion ^12 is available. Spring physics (`stiffness ~58, damping ~16`), always a
  `useReducedMotion()` crossfade fallback. No confetti / cheap success flash on premium moments.
- For "no abrupt swap": keep a CONTINUOUS background ground (same cream) and animate only the inner content
  (staggered rise). Fading an overlay over a different-colored bg causes a flash — don't.

### Industry credibility (modeling domain) — use the `industry` skill KB
- It's a "submission" not a job "application"; "digitals/polaroids" not "selfies"; "comp card" not
  "business card"; "board/division" not "category". "Kept on file" is a soft-yes (advancing, never closed).
  "Booked" belongs to the booking calendar, NOT a representation outcome. Strip invented/demo labels
  ("Physiological stats", "Compiled voice", "editorial security protocol").
- A submission note is SHORT (~40–80 words), optional, skippable; the package carries the facts — don't
  overbuild it into a cover-letter form. Legal/handling copy: shared only with the named agency for
  representation review, never published; acknowledgements = accuracy + 18+/guardian + "no guarantee".

### Reading the user's direction
- "You decide" / "whatever you deem best" = make a decisive call, state the reasoning in one line, and
  DON'T ask. (Brought the agency rail back on the message step; named the flow "Secure Submission".)
- Each surface must land FINAL, not a draft: no filler/placeholder copy, no clipping/overflow, real data
  rendered (the actual comp-card front, real social icons + portfolio link, not a typed contact string).
- Address EVERY sub-point of a multi-part request explicitly — the user enumerates deliberately.
- "Do research first" / "launch a research agent" → do it (the submission-note research brief directly
  shaped that screen). Otherwise ground inline with the industry KB + codebase + one targeted web search.
- Respect intentional external edits flagged in system-reminders (the hero "The Market" rename was reverted
  on purpose) — don't re-apply a prior change.
- "Audit" = graded, cited findings (P0/P1/P2) tied to the real file/string + the credible fix, then
  implement the agreed items — not a vague review.

### Fix root causes, including adjacent pre-existing breakage
- Submit 400'd on a missing `idempotencyKey` (client never sent one; server requires it) — a pre-existing
  bug fully blocking submission. When a feature you're verifying is broken by something adjacent, FIX it
  (`idempotencyKey: crypto.randomUUID()` in the mutate payload), don't route around it.
- SQLite dev vs Postgres prod: status CHECK constraints diverge (status migrations were PG-only, so SQLite
  silently rejected new statuses). An enum-touching migration must handle BOTH — SQLite needs a raw table
  rebuild under `exports.config={transaction:false}` + `PRAGMA foreign_keys=OFF`; don't assert
  `foreign_key_check` (pre-existing `application_notes` orphans from the legacy hard-delete withdraw flow).

## 2026-06-28 — Legal notices must stand alone as legal instruments

- Do not carry the user's task phrasing into published legal copy. A notice
  must not say that it extends an in-product notice, references a workspace, or
  narrates implementation steps unless that fact is legally necessary.
- Separate legal notice drafting from product documentation. Use formal,
  talent-facing provisions covering scope, data categories, purposes,
  recipients, legal bases, retention, rights, withdrawal, and liability-relevant
  limitations; remove product-tour language, marketing claims, and operational
  filler.
- When the user names industry notices as research anchors, restart the
  research from those actual sources and distinguish source-backed industry
  practice from assumptions drawn from local product copy.

## 2026-06-28 — Use the canonical sibling landing repository

- The production marketing site is the sibling repository at
  `/Users/lenquanhone/Projects/pholio-landing`; `.pholio-landing-ref` inside
  `pholio-app` is only a reference checkout and must not be treated as the
  implementation target.
- When a task spans the app and landing site, read product behavior from
  `pholio-app` and make marketing-site changes only in the canonical sibling
  repository.

## 2026-06-27 — Preserve requested inline control structure

- When a user asks for more authority in an inline control label, first adjust
  color and weight. Do not infer that the label should move above the choices
  or switch type families unless they explicitly request a structural hierarchy
  change.
- For Bio writer controls, Length and Voice remain inline mono labels. Their
  distinction comes from bold gold text, not serif typography or stacked layout.
- Shared selection baselines belong only to the selectable options. Extending
  the line beneath an inline group label visually demotes that label into another
  choice, even when its color and weight differ.

## 2026-06-27 — Match control language to control semantics

- A reference style is not a mandate to flatten every element into the same
  role. In Bio, Length and Voice are group titles; place them above the option
  row and give them typographic authority instead of styling them as peer
  filter choices.
- Writing actions are commands, not filters. When the requested reference moves
  from Submission History filters to `/apply` navigation, use the bordered
  architectural button family and preserve command hierarchy: quieter controls
  for transformations, stronger treatment for the primary drafting action.
- Express intelligence through precise state and hierarchy—a restrained
  activity rule, scoped spinner, and clear primary action—not sparkles, pills,
  glow, assistant mascots, or magic language.

## 2026-06-27 — Writing controls inherit product navigation language

- Do not present writing modes or AI-assisted actions as rounded prompt chips,
  segmented controls, or sparkle-decorated utility buttons. That language reads
  as a generic AI product and competes with Pholio's editorial hierarchy.
- For compact Profile choices and writing actions, reuse the Submission History
  filter pattern: transparent mono labels, generous spacing, one shared
  hairline, and a restrained gold underline for selected or active work.
- When the rejected treatment is implemented by a shared component, change the
  shared component and audit every caller. Do not repair one screen while
  leaving the same banned visual language available elsewhere.

## 2026-06-27 — Verify seeded analytics through the live API

- A database row count is not proof that a dashboard API can read the rows.
  After seeding analytics, verify the authenticated live endpoint and its exact
  date-window predicates before declaring the UI populated.
- SQLite can store timestamps as both `YYYY-MM-DD HH:mm:ss` and ISO strings with
  `T`/`Z`. Range predicates that bind JavaScript `Date` objects can return zero
  against ISO text even though `DATE(column)` grouping still sees the rows.
  Use SQLite `datetime(column)` / `datetime(?)` comparisons and regression-test
  the ISO storage format.

## 2026-06-27 — Analytics UI should keep copy and identity intentional

- Do not add explanatory provenance copy to a premium overview card when the
  metrics and states already communicate the source. Labels such as
  "First-party portfolio analytics" become filler instead of increasing trust.
- When correcting a public portfolio identity, preserve the approved link
  treatment and change the canonical identity itself. For talent sites, the
  overview identity is `pholio.studio/{talent-username}`.
- Demo analytics seeders must target the named demo account explicitly and
  replace that account's analytics transactionally. Never seed whichever
  profile happens to sort first or append duplicate demo traffic.

## 2026-06-27 — Scope button redesigns to named controls

- When the approved target is Back and Next, attach dedicated classes to those
  controls. Do not override a shared variant across the page, because that also
  changes submit, retry, chooser, conflict, and shell actions that were not in
  scope.
- After narrowing the change, scan for the new selector/class and confirm every
  match is an explicitly named target.

## 2026-06-27 — Normalize timezone-less database timestamps as UTC

- SQLite `CURRENT_TIMESTAMP` is UTC but returns a timezone-less string. Passing
  that string directly to `new Date()` makes Node interpret it in the server's
  local timezone, shifting the instant before the client formats it.
- Normalize naive database timestamps by appending `Z` at the API boundary,
  preserve explicit offsets and `Date` objects, and regression-test that a fresh
  save timestamp remains close to the current instant.

## 2026-06-26 — Applied migrations are immutable

- Before extending an untracked or recently created migration, check the Knex
  migration ledger. If it has already run anywhere in the active environment,
  restore its original contract and add a forward migration; editing the applied
  file leaves existing databases behind the code and produces runtime
  "no column named" failures.
- After applying the forward migration, verify the migration row and actual table
  columns through the same configured database connection used by the API.

## 2026-06-26 — Workspace chrome must inherit the shell

- When adapting a dashboard workflow into a focused workspace, start from the
  active dashboard shell header structure and tone before borrowing composition
  from a reference. A custom top bar can make the page feel like a different
  product even if the body uses Pholio tokens.
- For apply-workspace framing, remove visible step labels when the direction is
  an editorial workspace. Progress terms like Address, Curate, Send, and "Step
  1 of 3" read as a separate flow system instead of a unified workspace.

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
## 2026-07-02 — Persistence claims require before/after evidence

- Do not infer that a newly generated value persisted because the database contains a plausible
  value or because `updated_at` advanced. Seed data or a prior save can produce both.
- For save bugs, capture the exact pre-save value, the exact submitted payload, the update result,
  and a fresh post-save read. A mocked client save/reset test proves UI state handling, not that the
  live backend stored the submitted value.
- If live browser verification is unavailable, do not describe persistence as verified. Build a
  backend integration test against the real route/update mapping or report the remaining gap.

## 2026-07-04 — Talent settings input ownership correction
- When rebuilding talent dashboard settings, do not invent standalone textbox styling. Use the Profile tab field language as the reference: white hairline fields, 8px radius, Inter labels, no decorative inset well, no hover/focus translation.
- Do not place comp-card image/layout controls in Settings unless the product has a true account-level default. Comp card composition belongs to Media / comp-card generation; Settings should only hold cross-cutting account, privacy, security, notification, billing, legal, and lifecycle controls.

## 2026-07-06 — Deliverable format must match meeting artifact request

- When the user asks for a founder/cofounder meeting document and references a styled legal page, do not stop at Markdown. Produce the actual requested shareable artifact format (`.docx` when requested) and mirror the referenced brand/document system: legal label, title metadata, table of contents, numbered sections, warm paper palette, gold rules, quiet callouts, and footer disclaimer.
- If the visual reference lives in another repo that is unavailable locally, inspect the live site/source where possible and encode the styling decision in a reproducible generator rather than manually editing a binary document only.

## 2026-07-06 — Binary artifacts may be invisible in review surfaces

- If a requested `.docx` or other binary artifact is not visible because the review surface rejects binary files, replace the committed binary with a text-safe payload (`.b64`) plus a dependency-free rebuild script. Keep the generated binary out of the diff unless the platform explicitly supports binary artifacts.

## 2026-07-12 — Continue from the live target branch

- Before extending another agent's branch, fetch that exact remote immediately before implementation and treat its latest head as authoritative. If it advances concurrently, restart integration from the new head and replay only genuinely missing work; do not merge duplicate implementations or unrelated branch history.
- Route agents by task risk: Luna for mechanical inventories or single-file cleanup, Terra for compatibility analysis, and GPT-5.6 Sol for orchestration, final review, verification, and commits. Agents must have disjoint ownership and must not commit.

## 2026-07-14 — Make isolated-worktree UI changes visible before reporting them

- When implementation lives in an isolated worktree but the user is viewing a dev server from the original checkout, a correct diff can still look like “no change.” Restart the live backend and Vite processes from the implementation worktree, then verify the exact user-facing route in the browser before reporting progress.
- Before continuing a named implementation branch, fetch and rebase onto the exact remote tip first. A branch-name match is not evidence that the checkout contains the latest branch work.

## 2026-07-29 — Never squeeze a PholioButton role into a custom footprint

- `PholioButton.css` re-declares each role with `!important` (`--primary` locks
  `min-height: 44px` and `padding: 10px 22px`). Route CSS that sets `width: 42px`
  plus a non-important `padding: 0` cannot win, and `overflow: hidden` on the
  role then clips the label — that is what cropped “Send” to “Sen”. If a control
  needs a square footprint, use `PholioIconButton`; otherwise let the role size
  to its content and give it room in the layout. In a narrow dock, skip
  `PholioButton` entirely and own a compact native control — page-scale primary
  is the wrong size for a 384px sheet.
- Replacing a `PholioButton` with `<button>` is not enough if the replacement
  keeps the same dark filled block treatment. When the direction is “do not use
  PholioButton,” remove both the component dependency and its visual language;
  the dock send should be a quiet inline action with a transparent background.
- Global `:where(body) textarea` paints a bordered white field on every bare
  textarea. A composer well that also draws a border must override the global
  rules (`border: 0 !important`, transparent background, no inset shadow) or the
  field reads as two outlines. Same trap: `:where(body:not(.is-agency)) button`
  forces pill radius and `0.75rem 1.75rem` padding on bare buttons — dock close
  and send need explicit `!important` resets.
- A composer reads composed when the field and its actions share one well: a
  borderless textarea, a hairline divider, then assist-left / send-right, with
  focus expressed as a single border-color change — not an extra outer ring.
- A message thread must open on the newest exchange. Scroll the last bubble into
  view with `block: 'nearest'` so it works whether the list scrolls (submission
  dock) or an ancestor scrolls (Messages workspace).

## 2026-07-29 — Never re-derive a distinct record from ordering

- `applications.note` had no column. The list endpoint reconstructed the
  submitted cover note as "the earliest TALENT row in `messages`", because the
  note is written into that table so it opens the agency's thread. Any talent who
  messaged after a note-less submission saw their chat surface as "Your note".
  Two records sharing one table need an explicit marker (`is_submission_note`),
  not a position guess — ordering is not identity.
- Guard a new column with a cached `hasColumn` probe on both the read and write
  path (the `hasOpenCallSchema` pattern) so a deploy that lands before its
  migration degrades to the old behaviour instead of throwing.
- Backfilling a flag that was never stored needs an anchor, not a guess. The note
  is written in the submission transaction, so `talent_submission_packages.created_at`
  (one row per send, which also covers resubmission — a revived application keeps
  its original `created_at`) dates it within seconds. Candidates matching no
  anchor stay unflagged: missing a note is recoverable, mislabelling chat is the
  bug being fixed.
- Prove a data-provenance fix by re-running the test with the old derivation
  restored. Seeing the suite return the user's exact symptom (`Received: "Hello"`)
  is the evidence; a green suite alone would not distinguish the two.
- `.env` in this repo points `DATABASE_URL` at the production Neon branch, so the
  local dev server reads production. Never run `npm run migrate` as part of
  "verifying locally" — ask first, and keep verification on the isolated SQLite
  runner (`npm test`).

## 2026-07-29 — Match the rendered reference, not an inferred component name

- “Metric / Imperial toggle” referred to the rendered editorial tab treatment:
  tracked uppercase labels and a gold active underline. Reading only the local
  module CSS suggested an inset segmented pill because global `!important`
  toggle styles override that module at runtime.
- For visual matching requests, inspect the supplied screenshot and the full
  cascade before choosing the visual primitive. A class name or stale local rule
  is weaker evidence than the rendered control.

## 2026-07-30 — “Intelligence” is not permission to replace a magic reference

- When the user asks for an AI control to “wake up” but supplies or points toward
  a magic glyph, preserve that symbolic language. An abstract neural/inference
  loop can read as an eye, loader, or generic system emblem even when its motion
  is technically sophisticated.
- “Keep the icon only” means the icon owns the action. Do not retain a popover
  plus a second rectangular Write/Refine confirmation button; put the hover,
  working, focus, and progress states on the one icon button.
- For icon feedback, inspect the exact supplied asset before drawing a substitute.
  Reuse its silhouette as the motion skeleton and animate its constituent forms
  rather than inventing a new mark from the category prompt.

## 2026-07-30 — Removing the confirmation does not remove its controls

- “Remove the Refine bio button; the icon should be the button” means preserve
  the length/voice controls while transferring the generate action to the icon.
  It does not mean deleting the control panel.
- When the user says the original icon was better, restore the approved original
  geometry exactly. Do not keep iterating on a thicker reference glyph just
  because its category is closer.
- For coordinated icon motion, prefer the installed Motion/Framer Motion SVG
  variant system over independent CSS keyframes: one parent state can orchestrate
  the major and minor paths, provide a distinct working cadence, and collapse to
  an idle state under reduced-motion preferences.

## 2026-07-30 — Popover boundaries must match the visible popover system

- A popover attached to one control must use the trigger + panel anchor as its
  inside-click/focus boundary. Using the entire field component as the boundary
  makes clicks on the textarea look “inside,” so the panel never dismisses when
  users return to writing.
- Hover-revealed panels need a short close grace period. Close on leaving the
  combined trigger/panel anchor, cancel the timer on re-entry, and still close
  immediately on Escape or pointer/focus outside.
- When the user calls the gold sweep a “thinking state,” its timing is the
  contract: it belongs around the full textarea while generation is active, not
  after the result lands. Use a low continuous boundary plus one slow perimeter
  current, ease the whole state in/out, and keep reduced motion as a static gold
  boundary. Do not reinterpret it as a fast completion flourish.

## 2026-07-30 — Intel rebuild: charts carry an analytics page, not paragraphs

- "Text-forward" does not mean paragraphs. On talent analytics the copy is a
  figure plus one clause, a stat label, or a panel label — nothing longer. Every
  block that needed explaining beyond that needed a better chart instead.
- Give copy real typographic registers or it reads as one pale grey block: serif
  for questions and verdicts, Inter for figures and working text, mono for
  labels/axes/numerals, serif *italic* for the industry reason under a decision.
  Uniform 0.9rem body ink at 60% opacity was the actual complaint behind "pale".
- Talent do not want a values table under each chart — that is an agency habit.
  Serve the a11y requirement by direct-labelling every mark in the plot instead,
  so no value is hover-only or colour-only.
- Ordinal/emphasis scales beat categorical palettes for this product: one
  validated warm ramp plus a context grey plus one reserved accent covered every
  chart, and it stays on-brand. Run the `dataviz` validator rather than eyeballing.
- **Never gate the visibility of data on an IntersectionObserver.** `whileInView`
  on SVG children silently leaves lower marks at `initial` in Chrome, and moving
  the observer to a wrapper that is zero-height until measured fails too. Tie
  mark reveals to mount. A chart that renders nothing is worse than one that
  doesn't animate.
- Verify charts by probing computed style in a real browser (opacity, transform,
  bounding width), not by reading the JSX. Three separate "invisible chart" bugs
  here looked correct in source.
- When rebuilding an analytics surface, audit the existing one for *dead* charts
  first: this page shipped a sparkline whose data shape the component rejected,
  a funnel with two different denominators, and a hardcoded "cohort band"
  rectangle with no data behind it.
- The dev server does not hot-reload CommonJS backend modules. After editing
  anything under `src/`, restart Express before trusting a browser check — I
  screenshotted stale copy twice.
- Do not `git stash` to get a baseline when the user may be editing concurrently:
  it sweeps up their uncommitted work. Compare against `git show origin/main:path`
  or a worktree instead.

## 2026-08-02 — Pholio stops at the representation decision

- Pholio's core product is the pre-representation application layer connecting
  talent and agencies. Do not treat missing booking, contracts, commissions,
  call sheets, roster operations, or ongoing relationship management as features
  Pholio should automatically build.
- In audits, distinguish a missing core application capability from an intentional
  product boundary. If existing code crosses into agency CRM/booking behavior,
  recommend removal, disablement, or a clean handoff—not completion of the CRM.
- “Discovery” should lead to an invitation to submit, with talent-controlled
  disclosure. It should not quietly turn Pholio into an open talent database or
  casting marketplace.
- Fashion Week Brooklyn only validates the core thesis when an actual agency is
  receiving a representation submission. Event casting is a different product
  object and must not be relabeled to fit the agency-application portal.
## 2026-07-29 — A "skin-tone ratio" measures hue, not skin

- The onboarding scout upload flagged an ordinary clothed selfie for moderation
  review (`high_skin_ratio`, ratio 0.639 vs a 0.6 threshold), which withheld
  `is_primary`, which made `/scout/confirm` answer `400 "No primary image set"`
  and dead-end the flow. Three defects stacked; the visible error named none of
  them.
- Measure before tuning a threshold. Cropping the frame showed the empty cream
  wall behind the subject scored **0.997** on its own: the Kovac RGB rule accepts
  any warm surface (beige paint, wood, sand), and no threshold can separate a
  backdrop from a body when both are the same hue. YCbCr bounds do not fix it
  either — beige *is* skin-hued. The fix was to add a signal the hue rule lacks
  (3x3 luma std-dev floor: flat paint ~0, photographed skin not), which dropped
  the wall to 0.021 while the face region held 0.481.
- A gate whose only escape hatch is a human queue must never block a linear
  flow. Onboarding had no moderator on call, so a false positive was an
  unbounded block. Advance the flow off the uploaded photo and keep the image
  hidden from viewers instead — the exposure rule and the progression rule are
  separate concerns.
- Tests that assert on flat solid-colour fixtures can encode the bug. Three
  suites asserted a *uniform* skin-toned PNG flags for review — i.e. exactly the
  wall case. Synthesise texture when standing in for a photograph.
## 2026-08-09 — A tier flag near a submission pipeline is a statutory question

- Implementing the 2026-08 plan's compliance phase, `is_pro` turned out to gate
  more than the plan's eleven listed sites. The plan predicted this ("assume
  there are more") and was right: `pool-status.js` derived `DISCOVERABLE` from
  `profile.is_pro && profile.is_discoverable`, making agency-side visibility a
  purchased state — the one thing invariant 2 forbids outright. It had zero
  callers, which is exactly why it was easy to miss and would have been easy to
  re-wire later. Grep the flag, not the plan's line numbers.
- The comp card gated far more than the plan's list. `isPro` also hid the whole
  extended-content block: languages, nationality, union, physical
  characteristics, specializations, notable work, representation. A free card
  reaching an agency was missing seven sections and carried a watermark reading
  **"ZipSite"**. When a payment flag sits on a template, read the whole template
  — the listed violations were the visible half.
- Copy is part of the fix. Removing the mechanic while leaving "Unlimited
  discovery submissions" in the upsell, `upgradeRequired: true` in the 403, and
  "this limit keeps agency inboxes high-quality" in the disclosure would have
  left the product still *saying* the thing the code no longer does. Under FTC
  §5 the claim is the violation.
- Establish the test baseline against your own HEAD, not the local `main` ref.
  `main` was 5 commits stale here, so a baseline worktree made three pre-existing
  failures look like fresh regressions and cost a real detour. `git stash` on the
  working tree is the honest comparison.
## 2026-08-09 — Removing a feature means removing what it claimed

- The removal phase kept turning up copy that outlived the code. The agency
  onboarding email promised "schedule interviews"; the talent notification
  settings listed interview times as an always-on category; the data-export
  description claimed interview records. Deleting a router does not retract a
  promise made in an email template. Grep the feature's *vocabulary*, not just
  its identifiers.
- Delete-by-index-range is how you remove the wrong function. Cutting
  `agency-notifications.js` from the first interview helper to
  `notifyAgencyNewMessage` also took `notifyAgencyApplicationWithdrawn`, which
  sat between them — caught only because a whole suite failed to load. When
  slicing a file between two anchors, list what is actually in the span first.
- Order the removals so each one shrinks the next. `casting_briefs` was read
  only by the matching engine; `season.queries.js` was the last reader of the
  retired interviews and reminders tables. Removing the reader first turns a
  delicate surgical edit into a plain deletion. When a slice would mean editing
  a file the next slice deletes, do them in the other order.
- Drop a table only when the plan says dormant *and* the code agrees.
  `casting_briefs` had zero writers and no rows, so a drop with a rebuilding
  `down()` is honest. `interviews` and `reminders` hold real history and stay —
  application erasure still deletes from them, so retiring the feature does not
  quietly weaken a talent's erasure request.
- A "remove X" instruction can still be blocked on a product decision. The plan
  removes all AI ranking but keeps Discover, and Discover orders by the score
  being removed. That is not an effort problem, and guessing the replacement
  ordering would have been inventing product. Ship what is unambiguous, and put
  the open decision in front of the user with the house precedent attached.
- Natural-language search and AI ranking are separate product capabilities.
  When removing match scores and ranking from Discover, preserve the written
  brief as an input method: parse it into declared factual constraints, apply
  those constraints strictly, and use a stable directory order for survivors.
  Do not silently collapse a natural-language workflow into name-only search.
- A plan item that says to remove misleading claims does not necessarily authorize
  deleting the product surface. For Intel/analytics, preserve the user-facing
  capability and replace unsupported intent/attention conclusions with true,
  attributable data. For "verified adult," build the missing verification layer
  instead of deleting the state the product needs.
