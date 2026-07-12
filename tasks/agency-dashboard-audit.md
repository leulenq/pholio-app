# Agency Dashboard — Production-Readiness Audit

**Date:** 2026-07-12 · **Revision:** v1.1 (post-verification pass — the §4.3 RBAC finding was corrected against the actual rule table; scope of exposure narrowed and made precise)
**Scope:** Everything agency-facing: `client/src/domains/agency/**`, `src/domains/agency/**`, the shell (`AgencyLayout`, `AgencySessionGate`, router), the agency-relevant data model (`migrations/`), and the industry fit of the whole surface.
**Method:** Full code survey (every page, route, and migration), graded against (a) how a working agency actually operates — boards, submissions, options/holds, minors compliance — and (b) the repo's own design system (`client/src/domains/agency/DESIGN.md`) and product register.
**Audience:** A developer or agent who will implement directly from this document. Every finding cites files. Severity: **P0** = launch blocker / trust or security break, **P1** = real workflow gap a working agency hits in week one, **P2** = polish, debt, maturity.

**Product decision baked into this audit (owner-confirmed):** Pholio does **not** charge agencies and does **not** track agency money. There is no commission, fee, billing, invoicing, payout, or monetization workflow anywhere in the agency product. The access model is: agency requests access → Pholio reviews legitimacy/fit → approved agencies are manually granted a login. All findings and proposals below conform to this. Anything money-shaped that exists in the code today is treated as **removal work**, not unfinished feature work. See §4.2 and Appendix B.

---

## 1. Verdict

**Not production-ready.** Ship it today and the first real agency loses trust inside ten minutes — not because the product is thin, but because its most-trafficked page is a stage set.

The headline finding is a **split-brain product**. The backend, data model, and two flagship features (Discover search, the Overview command center) are genuinely strong — tested, agency-scoped, industry-literate, in places more sophisticated than commercial agency software. But three of the surfaces a booker lives in are **fabricated or dead**:

- **Roster** (`pages/RosterPage.jsx`) renders a hardcoded array of 22 fictional models with Unsplash photos and fake `@pholio.co` contact details. It never calls the working `GET /api/agency/roster` endpoint. Its "AI intelligence" strip is scripted copy about those same fictional people. Its bulk actions are `() => {}` no-ops and its "Add Talent" button has no handler at all.
- **Analytics** (`pages/AnalyticsPage.jsx`) is 100% static inline data; the date-range control swaps between three pre-baked objects. The working `GET /api/agency/analytics` endpoint is never called.
- **Notifications** — the topbar bell is wired to a hardcoded empty array (`AgencyLayout.jsx:167`), so no agency user can ever receive an in-app notification, despite a complete backend (`notifications.js`) and a fully built dropdown component.

Layered on that: real **within-agency authorization holes** (a read-only Viewer can export the full applicant PII CSV and can add team members, §7.1), an entire **booking-desk data model that exists in the schema but has no UI** (`talent_commitments` — options, holds, bookouts), and **~35 dead component files** including banned-pattern components the design system explicitly outlawed.

The good news: the distance to launch is shorter than it looks, because most of what's missing on-screen already exists below the waterline. The roster API works. The analytics API works. The notifications API works. The availability schema exists. This is predominantly a **wiring, truth, and enforcement** problem, then a focused set of genuinely new builds (§10).

---

## 2. Readiness scoreboard

| Dimension | Grade | One-line assessment |
|---|---|---|
| Product strategy | **B** | Right product (submissions inbox + roster + scouting + team ops for vetted agencies); Roster/Analytics fakery and the missing booking desk undercut it |
| Information architecture | **B−** | Nav is sane (Pipeline / Roster / Organization); orphan routes (`/boards`, `/signed`), Casting-vs-Divisions conflation, Reminders reachable only by deep link |
| Workflow completeness | **C** | Submission triage is real and good; roster management, availability/options, client packages, "kept on file" surfacing, off-platform talent all missing |
| Feature gaps | **C+** | Booking-desk calendar, roster truth, notifications, email team invites, admin review console — all absent or dead |
| Design-system consistency | **C+** | Strong written system; live violations of its own bans, 1015 hardcoded hex vs 558 token uses, two class-prefix families, two token families |
| Usability | **B−** | Working pages are dense and scannable; no-op buttons, silent error states, and permanent "Soon" panels erode trust |
| Accessibility | **D+** | No skip link, zero focus traps, default roster/discover cards not keyboard-operable, `prefers-reduced-motion` in only 2 of ~30 animated CSS files |
| Performance | **C** | No pagination on 5 core endpoints, no virtualization, no manual chunking, WebGL + framer-motion everywhere; fine at demo scale, degrades at real-roster scale |
| Technical architecture | **B−** | Clean domain routing and services; `inbox.js` is a 3,500-line god-file, duplicate routes, mixed data-fetch idioms, N+1s and missing transactions |
| Data model | **A−** | Deep and industry-literate (commitments, representations, minor-consent chain, casting briefs, RBAC, audit); a few structural gaps (§8) |
| Launch readiness | **Blocked** | P0 list in §4; no CI; 2 frontend tests; 49 npm audit findings (8 critical) acknowledged as debt |

---

## 3. What the agency dashboard does well today (Q1)

Credit where due — these are real assets to protect during the fixes:

1. **Discover is a flagship.** Multi-leg retrieval (dense visual/casting/market embeddings + lexical FTS) fused with RRF, Groq listwise rerank with layered graceful degradation (Groq → intent-parser fallback → RRF-only → plain browse; `services/discover-search.js:905-922`), a 5-minute parse cache, per-user rate limiting, top-K caps at every stage, an "honest zero" empty state that explains *why* zero and offers to loosen a constraint, and a provenance chip UI (`BriefUnderstanding.jsx`) that is actually tested. Fairness impact-ratio audits (`match_fairness_audits`) and automated-decision disclosures framed around NYC LL144 / EU AI Act (`src/domains/matching/notice.js`) are ahead of the market.
2. **The Overview endpoint is honest and tested.** All nine KPI/pipeline/pulse blocks in `queries/overview.queries.js` are live aggregates with real zero-state handling, verified by 34 tests asserting exact numeric correctness (`tests/agency-overview.test.js`). Nothing on `/api/agency/overview` is stubbed.
3. **The RBAC *model* is right.** Five preset roles (OWNER/ADMIN/AGENT/SCOUT/VIEWER), a 60+ permission catalog, per-member ALLOW/DENY grants with expiry and reason, DENY-wins semantics, owner-immunity, and an audit-event trail (`lib/permissions.js`, `agency_audit_events`). Enforcement has holes (§7.1) but the design needs no rework.
4. **Setup/commissioning is real and compliance-aware.** Seven-step gated onboarding with per-step persistence, a hard minor-data acknowledgment gate before activation (`setup.js:511-555`, `MINOR_PRIVACY_ACK_REQUIRED`), transactional writes throughout, and a concierge import-job intake.
5. **Minor protections hold at the API boundary.** Roster nulls a minor's email/phone (`inbox.js:2927-2948`), Discover preview fails closed for minors (tested in `tests/integration/agency-rbac.test.js`), and the guardian-consent chain (`guardian_consent_requests` → `minor_agency_consents`) is scoped per-agency.
6. **Cross-tenant isolation is enforced and tested.** Every handler scopes by `agency_id`; a historical leak in the roster join was found, fixed, and pinned with an isolation test (`inbox.js:733-741` comment; `tests/integration/agency-rbac.test.js`).
7. **The vocabulary is mostly the trade's.** "Digitals and polaroids only," "New Faces → Development → Main Board," "tearsheets," "boards," "Scout," "book" — the copy in `DivisionsPanel.jsx` and the applicants pipeline reads like it was written by someone who has sat on a board. This is rare and worth protecting.
8. **Messaging has a thoughtful talent-side loop:** blocked-agency checks, withdrawn-thread closure (410s), and email magic-link replies so talent can respond without logging in (`messages.js:276-320`).
9. **A written design system that is genuinely distinct** (editorial ledger: cream canvas, Playfair mastheads, Inter operations, gold ≤10%) with real banned-pattern discipline in the *live* nav (no count bubbles on rail items, no eyebrow text on any live agency screen).
10. **Open call links** — capped, revocable, transactionally cascaded, quota-exempting — a real scouting-funnel feature agencies will actually use.

---

## 4. Launch blockers (Q2) — the P0 list

### 4.1 Fabricated data on primary surfaces

**P0-1 · Roster page is a demo, not a product.**
`pages/RosterPage.jsx:84` hardcodes `ROSTER` (22 fictional talent, Unsplash images, fake emails/phones); `TALENT_INSIGHTS` scripts fake "AI" observations; `RosterIntelligenceStrip.jsx` hardcodes three "signals" naming the same fictional people; `RosterWorkspace.jsx` fabricates per-talent stats via `getMockStats()`/`getMockActivity()`. Meanwhile `api/agency.js` already exports a working `fetchRoster()` and the backend `GET /api/agency/roster` (`inbox.js:2842`) returns real signed talent.
**Fix:** Rebuild RosterPage on the real API (full spec in §9.1). Delete every mock constant. An agency whose first signed talent doesn't appear on the roster page — or worse, who sees 22 strangers — is gone.

**P0-2 · Analytics page is static fiction.**
`pages/AnalyticsPage.jsx:13-30+` inlines `SIGNALS`, `FUNNEL_DATA`, `VELOCITY_DATA`, `ROSTER_DATA`; the 30D/90D/6M control swaps literals. `getAgencyAnalytics()` exists in the API client and `GET /api/agency/analytics` (`inbox.js:3037`) is live.
**Fix (choose one, both acceptable):** (a) wire the page to the real endpoint and cut any block the endpoint can't honestly support; or (b) remove Analytics from `constants/agencyNav.js` for launch and ship it later against real data. Do not ship invented numbers. Recommendation: (b) for launch, (a) as fast-follow — the funnel (Invited → Applied → Shortlisted → Signed) is derivable from `applications` + `application_activities` today.

**P0-3 · Notifications can never arrive.**
`shared/layouts/AgencyLayout.jsx:167` renders `<NotificationsDropdown notifications={[]} onAllRead={() => {}} …>`. The backend (`routes/notifications.js`), the emitter fan-out to all team members (`shared/services/agency-notifications.js`), and the dropdown component are all complete.
**Fix:** `useQuery(['agency','notifications'], getAgencyNotifications, { refetchInterval: 60000 })` in the layout; wire `onAllRead` to `markAllAgencyNotificationsRead`; invalidate on `PATCH …/read`. ~Half-day task, disproportionate trust payoff: application-received alerts are the agency's heartbeat.

**P0-4 · "Signed" page is a permanent empty state.**
`pages/SignedPage.jsx` unconditionally renders "No signed talent yet" with no fetch and no conditional path — even for agencies with signed talent. It's also absent from the nav (orphan route).
**Fix:** Delete the route and the page. Roster is the canonical signed-talent surface.

### 4.2 Money remnants (product decision: there is no money)

**P0-5 · Strip every commission/booking-money artifact from the agency surface.**
The `commissions` table is written by **nothing** in `src/` (repo-wide confirmed) yet is read into user-facing numbers: agency stats `SUM(amount_cents)` (`inbox.js:962-969`), roster "lastBooking" and the derived `available`/`booking`/`inactive` status (`inbox.js:2874-2925`), roster detail "bookings" block (`inbox.js:2997-3019`), and the CSV export. Under the no-money model this is not unfinished — it is fabricated: every talent reads "available" forever and every money figure is $0.
**Fix, in order:**
1. Remove commission/booking-money fields from `GET /api/agency/stats`, `GET /api/agency/roster`, `GET /api/agency/roster/:profileId`, and the export.
2. Re-derive roster availability from real signals: `talent_commitments` (`kind: booked/option/hold/bookout` overlapping today) and the talent-set `profiles.availability_status`. Display statuses stay industry-correct: **Available / On option / On booking / Booked out / Inactive** — plain text per the design system, never a badge pill.
3. Remove "Commission YTD" / "Day Rate" / "Booking Rate" concepts from the roster workspace design entirely (they only exist in mock code today).
4. Drop the `commissions` table in a migration once no reader remains; delete `POST /agency/claim` (`roster.js:27`), whose purpose was commission claiming. Note: `scripts/seed-agency-demo.js:991-1008` and `seeds/seed.js:335` also touch the table (dev tooling only — the only writers anywhere) and must be updated in the same change.
5. Purge stale product copy: `CLAUDE.md` ("track commissions"), `client/src/domains/agency/CLAUDE.md` ("commissions"), `PRODUCT.md` ("track commissions") — replace with the real model (vetted access, roster/casting operations).

### 4.3 Authorization and enforcement

**P0-6 · Fail-open permission enforcement leaves newer endpoint families ungoverned.**
*(Corrected after a verification pass: the rule table in `lib/route-permissions.js` is more complete than first surveyed — export, team, branding, settings, analytics, and stats are all correctly mapped, so a VIEWER **cannot** export the PII CSV or add team members on guarded routers. The real gaps are narrower but still real.)*
`enforceAgencyRoutePermissions()` **fails open**: any route with no entry in the rule table passes every team role (`require-auth.js:305-308`, `resolveRoutePermission` returns `null` → `next()`). Grep-verified unmapped families on **guarded** routers: all of **open-call link management** (`routes/open-call.js` — a VIEWER can create, pause, and irreversibly revoke open-call links; the UI itself warns "This can't be undone") and all of **matching** (`routes/matching.js` — a VIEWER can run `POST /boards/:id/rank`, record booker decisions via `/candidates/:profileId/decision` which trains the agency preference model, and read fairness audits). `setup.js` writes are protected by a separate `requireAgencyMembershipRole("OWNER","ADMIN")` check, so setup is safe by different means.
**Fix:** (a) Add rules for the open-call and matching families (new keys, e.g. `open_call.view/manage`, `matching.rank/decide/view_fairness`, added to the catalog + presets). (b) Flip the middleware default for **write** methods to fail-closed: unmapped `POST/PUT/PATCH/DELETE` under `/api/agency/*` → 403 + log, unmapped `GET` → allow + warn (transition period), then fully fail-closed. (c) Add a CI test asserting every registered agency route resolves to a permission key, so a new route file can never ship ungoverned again.

**P0-7 · Three route files bypass the guard chain entirely.**
`roster.js`, `setup.js`, `notifications.js` never call `mountAgencyApiGuard` — they skip onboarding gating and RBAC (only `requireRole("AGENCY")`). This makes parts of the rule table dead letter: notifications rules **exist** in `route-permissions.js` (lines 403-413) but never execute because the router never runs the enforcement middleware. Likewise any team role can hit `roster.js`'s measured-in-person writes, `/agency/claim`, and the Discover invite handler. Worse, `GET /api/agency/discover/:profileId/preview` is registered in **both** `roster.js:197` (unguarded router, mounted first — wins) and `inbox.js:3444` (guarded) — any guard added to the guarded copy silently never runs.
**Fix:** Apply `mountAgencyApiGuard` in all three files (keep setup's allow-list working via `AGENCY_ONBOARDING_ALLOW`); delete the duplicate preview route from `roster.js`; delete the legacy dual-response handlers (`POST /dashboard/agency/applications/:id/:action`, `roster.js:105`) that duplicate the JSON API.

**P0-8 · RBAC has a global killswitch that fails open.**
`AGENCY_RBAC_ENFORCE=false` (or a typo'd value in prod) downgrades all permission enforcement to `console.warn` (`config.js:213-216`, `require-auth.js:294-339`).
**Fix:** Remove the killswitch, or invert it to an explicit dev-only escape hatch that refuses to disable when `NODE_ENV === 'production'`.

### 4.4 Access model completeness

**P0-9 · The front door has no inside handle.**
The owner-confirmed access model (request → legitimacy review → manual grant) is fully modeled in the schema — `agency_access_requests` (status, reviewer, qualification-call/approve/decline timestamps, provisioning links) and `agency_access_request_events` — provisioning is transactional (`services/provisioning.js`), and the public intake half already exists (`POST /api/public/agency-access-requests`, `src/routes/api/public.js:178`, fed by the landing-site form; the legacy `/partners` signup has been correctly retired to a redirect, `auth.js:991-1003`). But there is **no surface for Pholio staff to review, approve, decline, or provision a request**. Launch means real requests arriving; today each one requires hand-run SQL.
**Fix:** Build a minimal internal admin console (§10.6). It does not need to be pretty; it needs to exist, be role-locked to platform staff (a new `PLATFORM_ADMIN` guard — do **not** overload the agency RBAC), write `agency_access_request_events` on every transition, and call `provisionAgencyForUser` on approve.

### 4.5 Stability & correctness

**P0-10 · Export route breaks on SQLite.** `knex.raw("string_agg(…)")` (`inbox.js:2299-2312`) is PostgreSQL-only; every other query in the domain is deliberately dialect-branched. Dev/test environments 500 on export. **Fix:** branch `string_agg`/`group_concat` on `knex.client.config.client`, mirroring `discover-retrieval.js:390-401`.

**P0-11 · Overview page has no error state.** `OverviewPage.jsx` destructures data without `isLoading`/`isError`; a 500 on `/api/agency/overview` renders a confidently all-zero dashboard — indistinguishable from "your agency has no activity." **Fix:** page-level error panel with retry (use the existing `EmptyErrorState`), and skeletons on first load per the design system's own rule.

**P0-12 · No CI.** `.github/workflows` doesn't exist. 105 server test files and a working vitest setup run only when someone remembers. **Fix:** one workflow: root `npm test`, `client npm run lint`, `client npm run test`, `client npm run build`. Nothing below in this document is safe to execute without it.

---

## 5. What real agencies need from this product (Q3)

The industry model, mapped to Pholio, money excluded by product decision. A working agency runs on six loops; the table shows where each stands:

| # | Operating loop | What it is in the trade | Pholio today | Verdict |
|---|---|---|---|---|
| 1 | **Inbound triage** | Submissions (digitals + stats) arrive; a booker sweeps daily: decline most, **keep on file**, request more, invite to a go-see/meeting, offer development | ApplicantsPage + inbox API: real statuses incl. `kept_on_file`, `requested_more`, `meeting_requested`, `development`; bulk ops; activity log | **Present.** Gap: `kept_on_file` has no UI tab (§6.3); "Applications" label is off-register (§6.14) |
| 2 | **Roster & boards** | Talent grouped by board (Women / Men / New Faces / Development / Curve…); per-talent record: book, digitals, stats (dual-unit, dated), representation, notes | Backend roster is derived from `applications.status`; boards exist (`kind='division'`); the roster **UI is fake** (P0-1); no persisted membership, no board grouping on the page, no manual talent | **Broken at the UI; structurally partial** (§8.1, §9.1) |
| 3 | **Availability & the calendar** | The board's day runs on **options (1st/2nd), holds, confirmed bookings, bookouts**. "Who is free the week of the 14th?" is the most-asked question in the building | `talent_commitments` table models exactly this (option tier, dates, market, non-financial client ref); the matching engine already reads it for availability posture (`src/domains/matching/index.js:105-107`), but there is **no agency-facing CRUD, calendar, or conflict flow** | **Absent above the schema.** Biggest genuinely-new build (§10.1) |
| 4 | **Casting & packages** | A client brief comes in (dates, market, usage, look); booker assembles a **package** of talent and sends it out; shortlist → go-see → confirm | `boards.kind='casting'` + `casting_briefs` (shoot dates, market, usage, look target) exist; stages `Applied→Shortlisted→Offered→Represented→Passed` are actually a **signing** pipeline wearing a "Casting" label; no package-out-to-client exists | **Mislabeled + missing the outbound half** (§6.2, §10.2) |
| 5 | **Scouting** | Open calls, street/social scouting, placement leads; "new face" development tracking | Discover (excellent), open-call links (real), development status exists in pipeline | **Present and strong** |
| 6 | **Compliance & trust** | Minors (consent, permits, restricted visibility), image rights, data protection | Guardian-consent chain, minor field-nulling, fail-closed previews, permits table, field-visibility matrix | **Present** — best-in-audit area |

Also required by real teams, independent of the loops: working **team invitations** (currently in-app-only, requiring the invitee to already have an agency login — `inbox.js:1967-1975`; `sendTeamInviteEmail` is dead code), **notifications that fire** (P0-3), and **data they can trust** — every number on screen either real or absent.

---

## 6. Surface-by-surface findings

Disposition key: **Keep** (works, minor fixes) · **Patch** (targeted fixes) · **Redesign** (rebuild on the same route) · **Cut** (delete).

| Surface | Route | State | Disposition |
|---|---|---|---|
| Overview | `/dashboard/agency` | Real data; no error/loading state (P0-11); gradient-text KPI numeral & gold side-stripe violate own bans | **Patch** |
| Applicants | `/applicants` | Real, good; no `kept_on_file` tab; no error UI (falls into empty-state copy); rows have `role="button"` w/o `onKeyDown` | **Patch** |
| Casting | `/casting`, `/casting/:boardId` | Real; label conflates signing pipeline with client casting; FitBriefs panel is live and good | **Patch + IA rename** (§6.2) |
| Boards | `/boards` | Orphan route; legacy CRUD, non-RQ fetching, modals w/o Escape/focus handling; superseded by Casting | **Cut** |
| Discover | `/discover` | Flagship; card not keyboard-operable; WebGL bg always on | **Keep** |
| Roster | `/roster` | 100% mock (P0-1) | **Redesign** (§9.1) |
| Signed | `/signed` | Permanent empty state, orphan route | **Cut** (P0-4) |
| Interviews | `/interviews` | Real; lanes model is thoughtful; no ICS/email | **Keep**, add ICS (§10.4) |
| Reminders | `/reminders` | Real but non-RQ, no cache coordination (completing in list doesn't update Due sidebar); `DueReminders` ignores its `limit` prop and renders only a count; reachable only via deep link | **Patch** |
| Messages | `/messages` | Real, polling, read receipts; "Mark all read" in the nav dropdown is local-state only (`MessagesDropdown.jsx:56` TODO) | **Patch** |
| Analytics | `/analytics` | 100% static (P0-2) | **Cut from nav now, rebuild on real queries** |
| Activity | `/activity` | Real, paginated, polling | **Keep** |
| Team | `/team` | Real; invites limited to pre-provisioned logins | **Patch** (email invites, §10.3) |
| Settings | `/settings` | Profile/Branding/OpenCall/Notifications live; **Divisions & Representation panels are fully static with "Soon" labels**; 5 disabled "booking desk" toggles | **Patch** (§6.10) |
| Setup | `/setup` | Real, gated, transactional | **Keep** |
| Talent full view | `/talent/:applicationId` | Real; portfolio grid images not keyboard-openable | **Patch** |

Details for the non-obvious rows:

### 6.1 Overview (`OverviewPage.jsx`)
- P0-11 (error state) above.
- `.ov-brief-figure` uses `background-clip: text` gradient fill (`OverviewPage.css:34-37`) — explicitly banned in `DESIGN.md` ("Don't use gradient text"). Same technique in `MatchScore.css:26-29`, which is rendered on nearly every talent card in the product. Replace with solid ink/gold numerals; emphasis via weight/size per the system's own rule.
- `.ov-move { border-left: 2px solid var(--ag-gold) }` (`OverviewPage.css:183`) — banned side-stripe. Also `zones.css:407` (3px hardcoded gold stripe on the live Application Status card), `MessagesPage.css:108`, `TalentThread.css:164`. Replace with full hairline borders or background tints.
- The legacy `GET /api/agency/overview/stats` (`inbox.js:3299`) computes a system-wide `totalTalentPool` (not agency-scoped) and is redundant with `routes/overview.js`; its client caller `getAgencyStats()` is dead. Delete both.

### 6.2 Casting vs. Divisions — the IA conflation
The stages (`casting-stage-helpers.js:1-7`: `Applied → Shortlisted → Offered → Represented → Passed`) are a **representation/signing** pipeline. In the trade, a *casting* is for a specific client job; recruiting talent to your board is scouting/signing. The schema already knows the difference (`boards.kind = 'division' | 'casting'`, `casting_briefs` with shoot dates/market/usage), but the UI presents one page called "Casting" doing signing work.
**Fix (naming + split, not a rebuild):**
- Nav "Casting" → **"Signing"** or **"Pipeline"** for the current page (board-scoped signing pipelines are a legitimate, good feature — keep the mechanics).
- Introduce a true **Castings** surface for `kind='casting'` boards driven by `casting_briefs` (client, dates, market, usage, look target) — see §10.2. Until it ships, don't use the word "Casting" for signing.
- Tab label inconsistency: ApplicantsPage says "Represented" where CastingDetailPage says "Booked" for the same underlying statuses — unify on "Represented" ("Booked" means something specific in the trade: a confirmed job).

### 6.3 Applicants (`ApplicantsPage.jsx`)
- Add an **"On file"** tab surfacing `kept_on_file` (the most common real outcome of a submission; the backend enum has it, the UI hides it). Include a "return to review" action.
- Add a real `isError` branch — today errors fall through to "No applicants in this view," which reads as an empty agency.
- Decline flow: ensure the talent-facing message is the industry-humane "kept on file / not right now" register, never a hard rejection template (check `notifyTalentForApplicationStatus` copy).

### 6.4 Discover
Keep. Two fixes: the result card (`dc-card`) is a `motion.article` with `onClick` only — add `role="button"`, `tabIndex`, `onKeyDown`; gate the `Grainient` WebGL background behind `prefers-reduced-motion` and a capability check (it currently always runs a shader loop on a page whose job is a dense list).

### 6.5 Reminders
Move `ReminderList`/`DueReminders` to React Query with shared keys so completing a reminder updates the due count; make `DueReminders` actually render the due list (it ignores its `limit` prop — `RemindersPage.jsx` passes `limit={10}` to a component whose signature is `function DueReminders()`); add Reminders to the rail nav under Pipeline or surface due-today items in the Overview docket (recommended — reminders are a workflow, not a destination).

### 6.10 Settings static panels
`DivisionsPanel.jsx` and `RepresentationPanel.jsx` are illustrative mockups with "Soon" tags (hardcoded ladder, hardcoded commission split "Mother · 10% / Placement · 20%", hardcoded markets). Two problems: (a) shipped "Soon" panels in a launch product read as vaporware; (b) the Representation panel's commission-split content violates the no-money decision outright.
**Fix:** Replace DivisionsPanel with a real divisions manager (CRUD over `boards kind='division'` — the API exists). **Delete RepresentationPanel** for launch (its future non-money form — exclusivity, term, markets — can return with `talent_representations` UI later). Remove the five disabled "booking desk" toggles from NotificationsPanel until the booking desk (§10.1) ships; a settings page should never be a roadmap.

### 6.14 Terminology sweep (industry register)
- Nav "Applications" → **"Submissions"** (talent submit digitals to an agency; they don't file job applications). Backend enum names can stay; this is a label change (`constants/agencyNav.js`, page headings, empty states).
- "Interviews" is acceptable for agency↔talent meetings; if a client-casting surface ships later, its meetings are **go-sees/castings**, never "interviews."
- Roster statuses: use **"Booked out"** (not "Unavailable"), **"On option"**, **"On booking"** — plain text.
- Keep the excellent existing copy in DivisionsPanel's ladder ("digitals and polaroids only", "tearsheets") — it's the register to match everywhere else.

---

## 7. Backend & security audit

### 7.1 Authorization (P0-6/7/8 above)
Summarized in §4.3 (with the verification-pass correction: the core rule table is solid; the exposure is the unguarded routers, the unmapped open-call/matching families, the fail-open default, and the killswitch). One addition: `inbox.js`'s team routes exist in parallel with `team-rbac.js`'s permission routes — consolidate team endpoints into one file so the RBAC story lives in one place.

### 7.2 Scale and data access (P1)
- **No pagination:** `GET /api/agency/applications` (`inbox.js:702`), `/roster` (`:2842`), `/reminders`, `/interviews`, `/messages/threads` return every row. A mid-size agency (300 roster, 5k submissions/yr) makes these multi-MB responses rendered into unvirtualized `.map()` lists. **Fix:** cursor or offset pagination (mirror `activity.js`'s `limit≤100 + offset + total`), then either paginate the UI or virtualize (`@tanstack/react-virtual` fits the stack).
- **N+1 / missing transactions:** `recalculate-board-scores.js:39-73` (4 queries × N, no transaction); `tags.js` bulk-tag/untag loops per row; board create/duplicate does 3 non-transactional inserts (`inbox.js:281-355`, `:621-691`) — a crash strands a board with no requirements/weights; bulk status ops update in one query but log activity in a per-row loop outside the transaction. **Fix:** wrap each in `knex.transaction`, batch inserts (`insert([...])`), batch score recalc reads.
- **Validation inconsistency:** zod on profile/RBAC writes, ad-hoc truthy checks elsewhere; several free-text fields (reminder notes, interview location/meeting_url) have no length caps while messages cap at 4000. **Fix:** zod schemas per route file; cap all free text.

### 7.3 Architecture (P1/P2)
- `routes/inbox.js` is ~3,500 lines / 49 handlers spanning boards, applications, team, profile, settings, branding, export, roster, analytics, discover. **Fix:** split along the seams that already exist as filenames (`roster` reads → `roster.js`, boards → `casting.js` or a new `boards.js`, team → `team-rbac.js`, org profile/settings/branding/export → new `org.js`). Mechanical, high-value for every future change.
- Session note: `req.session.userId` holds the **agency id** for agency sessions (`auth/routes/auth.js:182,844`) with `memberUserId` for the human — functional but a trap for every future developer. Standardize on `getSessionAgencyId(req)` and document the invariant where the session is created.
- Frontend fetch idioms: React Query everywhere except `BoardsPage` (dies with the page), `ReminderList`/`DueReminders` (§6.5). Broad `invalidateQueries(['agency'])` after every talent action refetches the whole overview — acceptable now; tighten keys when pagination lands.

---

## 8. Data model: what a serious agency product requires (Q7)

The schema is the strongest layer (see §3). Required changes, in priority order:

### 8.1 Persist roster membership (new table) — P1, prerequisite for §9.1
Roster is currently *derived*: `applications.status IN ('accepted','booked','represented')`. Consequences: removing someone from the roster means mutating their historical application; board/division assignment for signed talent has no home (`board_id` on the application conflates "submitted to board" with "sits on board"); no signed-date vs applied-date distinction; and off-platform talent are impossible.

```
roster_memberships
  id uuid PK
  agency_id uuid FK agencies NOT NULL
  profile_id uuid FK profiles NULL          -- platform talent
  talent_record_id uuid FK talent_records NULL  -- off-platform talent (§8.2)
  board_id uuid FK boards NULL              -- division assignment
  stage text NOT NULL DEFAULT 'main'        -- new_face | development | main
  status text NOT NULL DEFAULT 'active'     -- active | inactive | left | ended
  source_application_id uuid FK applications NULL
  joined_at timestamptz, left_at timestamptz, notes text
  created_at, updated_at
  CHECK (profile_id IS NOT NULL OR talent_record_id IS NOT NULL)
  UNIQUE (agency_id, profile_id) WHERE status='active'
```
Backfill from qualifying applications in the same migration. Accepting an application then *creates* a membership (transactionally) instead of merely being one. Roster reads join through this table; application statuses return to meaning what they say.

### 8.2 Off-platform talent (new table) — P1
Every real agency arrives with an existing roster; today the only path is the concierge `agency_import_jobs` queue (metadata-only). Add:

```
talent_records
  id uuid PK
  agency_id uuid FK agencies NOT NULL       -- privately owned by the agency
  first_name, last_name, email, phone
  gender, date_of_birth
  height_cm int, measurements jsonb         -- dual-unit derived at render
  board_hint text, market text
  photo_path text
  claimed_profile_id uuid FK profiles NULL  -- set if the person later joins Pholio
  is_minor boolean NOT NULL DEFAULT false   -- minors: restrict fields, require consent flags
  created_by_user_id, created_at, updated_at
```
Strictly agency-private (never in Discover, never public). This unblocks "Add Talent" (P0-1's dead button) and makes the import pipeline (`agency_import_jobs`) have somewhere to land rows. Minor records must follow the same visibility discipline as platform minors.

### 8.3 Agency-side commitments access — P1 (schema exists; add routes)
`talent_commitments` already models option/hold/booked/bookout with tier, dates, market, and a deliberately **non-financial** `client_ref` — it matches the no-money decision perfectly, and the matching engine already consumes it read-only for availability evaluation (`src/domains/matching/index.js:105-107`), so Fit Briefs will get smarter for free once agencies can write commitments. Needed: agency CRUD routes (guarded, `roster.manage_status`-class permission), conflict detection (overlapping option tiers on the same dates → surface the confirm-or-release decision), and the calendar UI (§10.1). Add `created_by_user_id` and an updated-audit trail to the table.

### 8.4 Casting packages (new table) — P2 (fast-follow)
For §10.2's outbound half:
```
casting_packages
  id uuid PK, agency_id, board_id FK boards (kind='casting')
  title text, note text
  status text  -- draft | sent | closed
  share_token text UNIQUE, expires_at, revoked_at
  created_by_user_id, created_at

casting_package_entries
  package_id FK, roster_membership_id FK, sort int, note text
```
Reuse the talent-side `share_tokens` pattern (tokened, revocable, open-tracked). Package pages respect `profile_field_visibility` and exclude minors' restricted data categorically.

### 8.5 Cleanups
- **Drop `commissions`** after P0-5 removes all readers.
- `boards.kind` already discriminates division/casting — add a CHECK constraint and backfill any ambiguous rows.
- The `interviews.status` value `'accepted'` is filtered on but never written by any agency route — verify the talent-side writer exists (talent domain) or the "Awaiting response" lane never resolves; add a test either way.
- Add composite indexes for the new hot paths: `applications (agency_id, status, created_at)`, `talent_commitments (profile_id, start_date, end_date)`, `roster_memberships (agency_id, status, board_id)`.

---

## 9. What should be redesigned rather than patched (Q5)

### 9.1 Roster — rebuild the page on real data (the big one)
Not a patch: the current page is mock-shaped (its filters, stats, and workspace all assume fields the real API doesn't return, and money fields the product must not have). Spec for the rebuild:

- **Data:** React Query on `fetchRoster()` (post-P0-5 shape) + `roster_memberships` (§8.1) once it lands. Server-side pagination + search.
- **Layout:** keep the current visual language (hero stats, grid/row toggle, filter dropdowns) — it's on-system. Group or filter by **board/division**, with stage (New Face / Development / Main) as plain text.
- **Per-talent status:** derived from commitments + talent availability (§4.2 fix 2): Available / On option / On booking / Booked out / Inactive. Plain text, no pills.
- **Workspace (detail view):** replace mock stats with real operational data: current commitments (§10.1), boards submitted to (from `board_applications`), submission history, notes (`application_notes`), tags, interviews, messages link, measurements **in cm and imperial with `measurements_updated_at` staleness shown** ("Measured 4 mo ago" is load-bearing information for a booker; the field exists — `profiles.measurements_updated_at` — and `measured_in_person` already has confirm/clear routes).
- **Bulk actions:** implement or remove — message (nav to compose), assign board, tag, export (permission-gated post-P0-6), archive (writes membership `status='inactive'` after a confirm dialog). No `() => {}` handlers survive.
- **Add Talent:** opens the `talent_records` create flow (§8.2), with a clear "This talent is private to your agency" note.
- **Intelligence strip:** delete the scripted copy. Reintroduce only if computed from real queries (idle-90-days = no `board_applications` in 90d; profile-gaps = null measurement fields; brief-matches = live `match_evaluations`) — all three are computable today; ship zero-state honest ("No signals this week") rather than filler.

### 9.2 Analytics — rebuild against real queries (post-launch)
Cut from nav now (P0-2). Rebuild as a thin page over `overview.queries.js`-style aggregates: submission funnel (submitted → shortlisted → development → represented, from `applications` + `application_activities` timestamps), time-in-stage, source breakdown (open-call vs organic vs Discover-invited — all derivable: `quota_exempt`/claims, `discover_query_events.invite`), roster growth (already computed for Overview). Follow `dataviz` skill guidance when charting; recharts is already in the bundle — remove chart.js (§12.3).

### 9.3 Permission enforcement — invert the default (design change, small diff)
Fail-closed for writes (§4.3). This is a redesign of the *policy*, not the code shape: the rule table stays, the miss-behavior changes, and a route-coverage test makes regressions structural.

### 9.4 `inbox.js` decomposition (§7.3)
Redesign of module boundaries only; zero behavior change; do it before any of the new §10 routes land so new code has a sane home.

---

## 10. What should be added (Q4) — new pages, systems, workflows

### 10.1 The Booking Desk (availability calendar) — the flagship addition
The single highest-credibility feature a real agency will look for, and the schema already exists (`talent_commitments`). Strictly non-financial.
- **New page** `/dashboard/agency/calendar` (nav: Pipeline → "Calendar" or "Booking desk"): week/month grid, rows = roster talent (grouped by board), spans = commitments colored by kind via semantic tokens (option = outline, booking = filled, bookout = hatched/neutral) — status by tone and text, never badge pills.
- **Interactions:** create option (tier 1/2) / hold / booking / bookout on a date range with market + client_ref + notes; the **confirm-or-release** flow when a 2nd option requests dates held by a 1st; talent-set bookouts (talent side already has availability surfaces — PR11) render read-only.
- **Backend:** `GET/POST/PATCH/DELETE /api/agency/commitments` (guarded; new permission keys `commitments.view/manage` added to the catalog and the route map), overlap/conflict computation server-side.
- **Roster + Overview integration:** availability status (§9.1) and a "This week on the board" Overview module both read from it.
- **Notifications:** option placed/expiring, booking confirmed, bookout added — these are exactly the five "Soon" toggles already sketched in `NotificationsPanel.jsx`; wire them for real.

### 10.2 True Castings (client briefs + packages) — fast-follow
Build on `boards.kind='casting'` + `casting_briefs` (§6.2): a Castings list/detail showing client, shoot dates, market, usage terms, look target; attach roster talent; generate a **package** (§8.4) as a tokened, revocable, expiring share page (no login required for the client; open-tracking like `share_tokens`). This completes loop #4 of §5 without any money surface.

### 10.3 Team email invitations
Wire the dead `sendTeamInviteEmail` (`shared/lib/email.js:273`): invite-by-email creates a pending membership + tokened accept link; accepting provisions the user into the agency with the assigned role. Removes the "must already have a Pholio agency login" wall (`inbox.js:1967-1975`, `TeamAddModal.jsx:91`). Fits the manual-vetting model: members join a *vetted agency's* workspace, they don't self-serve into the platform.

### 10.4 Interview logistics
ICS attachment generation on schedule/reschedule (pure server-side, no calendar OAuth needed at launch) + email notify to talent alongside the existing in-app notification. Defer two-way calendar sync.

### 10.5 Saved views / filter presets
`filter_presets` table + full API exist; `FilterPresetManager.jsx` is dead code. Resurrect deliberately on ApplicantsPage ("My board, new this week") — cheap because the backend is done. Defer if timeline is tight.

### 10.6 Internal admin console (P0-9)
Minimal staff-only surface (separate route namespace, e.g. `/internal/agency-requests`, guarded by a platform-staff check, **not** agency RBAC): list `agency_access_requests` by status, detail view with review notes, actions = qualification-call logged / approve (→ `provisionAgencyForUser`, send credentials/invite email) / decline (with reason). Every transition writes `agency_access_request_events`. This is the operational half of the owner's access model.

### Explicitly rejected additions
- **Any payments/commission/invoicing system** — product decision.
- **Real-time websockets** — polling (10–60s) is adequate at launch scale; revisit with usage data.
- **Client-facing CRM (contacts/companies)** — real gap for agencies, but a second product's worth of scope; the package share-link (§10.2) covers the launch-critical client touchpoint.
- **A rebuilt drag-and-drop Kanban** — the dead `@dnd-kit` Kanban should be deleted, not finished; the tab-filtered pipeline works and is more accessible.

---

## 11. Must-have vs. defer (Q6)

**Launch gate (must all be true before real agencies get logins):**
1. P0-1 … P0-12 closed (§4).
2. Roster rebuilt on real data with working Add Talent (needs §8.1 + §8.2).
3. Route-permission map complete + fail-closed writes + coverage test.
4. Notifications live end-to-end; team email invites working (10.3) — a single-seat launch is defensible, but invites-by-email is cheap and the model is team-based.
5. Admin review console (10.6) operational.
6. Dead-code purge (Appendix A) — it ships banned patterns and a known crash to the bundle.
7. CI green on every merge.

**Fast-follow (first 4–6 weeks post-launch):**
- Booking Desk (10.1) — start immediately; it's the retention feature.
- Analytics rebuilt on real queries (9.2).
- True Castings + packages (10.2).
- Pagination + virtualization on applicants/roster (7.2).
- Accessibility pass (§12.2) to an honest WCAG AA floor.
- `kept_on_file` tab, terminology sweep (6.3, 6.14).

**Deliberately deferred:**
- Interview two-way calendar sync; saved views (10.5); placement/mother-agency UI over `talent_representations`; multi-market stays/travel; internal team chat; mobile-optimized rail beyond the existing drawer.

---

## 12. Debt registers

### 12.1 Design-system compliance (violations of the repo's own bans)
| Violation | Where | Fix |
|---|---|---|
| Gradient text (`background-clip: text`) | `OverviewPage.css:34-37` (hero KPI), `MatchScore.css:26-29` (every match score) | Solid ink/gold numeral |
| Colored side-stripes >1px | `OverviewPage.css:183`, `zones.css:407` (3px hardcoded), `MessagesPage.css:108`, `TalentThread.css:164` | Full hairline border or bg tint |
| Corner count bubble on nav icon | `.ag-icon-badge`, `AgencyLayout.css:262` + `AgencyLayout.jsx:158` | Unread state via dot-free treatment: bold label + "3 unread" text in the dropdown, or tone shift on the icon |
| Banned components still in tree | `TalentStatusBadge.jsx`, `TalentTypePill.jsx` (with inline `backdropFilter` glass), `TalentCard.jsx` | Delete (Appendix A) |
| Token debt | 1015 hardcoded hex vs 558 `var(--ag-*)`; worst: `InterviewsPage.css` (123 hex), `SettingsPage.css` (108), `CastingPage.css` (98), `TeamPage.css` (92) | Mechanical migration, one file per PR; also collapse legacy `--agency-*` aliases and the stray `st-*` class prefix family (ActivityPage, MessagesPage) into `ag-*` |
| Duplicated component | `components/Grainient.jsx` byte-identical to `pages/Grainient.jsx` | Delete the unimported copy |

### 12.2 Accessibility (target: honest AA floor)
1. **Skip link** in `AgencyLayout.jsx` → `#ag-main` (none exists anywhere in the shell).
2. **Focus traps**: zero modals trap focus (grep-confirmed). Adopt one primitive — native `<dialog>` or a small `useFocusTrap` — and apply to `CastingNewModal`, `InterviewScheduleModal`, `TeamAddModal`, `DiscoverDetail`, `TalentPanel`. Escape already handled in most; `BoardsPage` modals die with the page.
3. **Keyboard-operable cards**: `ApplicantRow`, `CastingCard`, `CandidateCard` have `role="button"`+`tabIndex` but no `onKeyDown` (ARIA promises interactivity the keyboard can't deliver); Discover's `dc-card` and Roster grid cards have nothing. One shared `useCardButton(onActivate)` hook fixes all.
4. **`prefers-reduced-motion`**: present in 2 CSS files out of ~30 animated surfaces despite the design doc's explicit promise. Global approach: wrap the domain in framer-motion's `<MotionConfig reducedMotion="user">` + a CSS kill-switch block in `agency-tokens.css`.
5. **PortfolioGrid** lightbox images: `onClick` on `<img>` — wrap in `<button>`.
6. Placeholder/tertiary text contrast: verify `--ag-text-3/4` (`#9C958E`, `#C8C2BA`) usage never carries body-level information on cream (`#FAF8F5`) — `#9C958E` is ~2.9:1 there.

### 12.3 Performance
- Pagination + virtualization (§7.2) — the structural item.
- `vite.config.js`: add `manualChunks` (vendor: react/router/query; motion; charts) — the "existing large-chunk warning" is acknowledged in `tasks/todo.md`.
- Remove one chart library: recharts and chart.js are both shipped; agency uses neither today (Analytics is static), talent decides the keeper — pick one repo-wide.
- Audit `three` + `@tsparticles` client deps and `gsap`/`tmux` in **server** `package.json` (`tmux` as an npm server dependency is almost certainly accidental) — remove unused.
- Real talent images render raw upload URLs with no `srcset`/resize params (only the *mock* Unsplash URLs had them — telling). Add a resize/query-param layer for roster/applicant thumbnails; Sharp + R2 are already in the stack.
- Polling budget: Messages page (10s) + threads (30s) + layout threads (30s, deduped) + Activity (60s) is fine; add `document.visibilityState` gating so background tabs stop polling (React Query `refetchIntervalInBackground` is already false by default — verify, then rely on it).

### 12.4 Testing & CI
- CI workflow (P0-12).
- Backend route coverage for the untested files: `roster.js`, `casting.js`, `matching.js`, `tags.js`, `interviews.js`, `reminders.js`, `messages.js`, `open-call.js`, `provisioning.js` — priority on authz assertions (per-role 403 matrix) once P0-6/7 land, so the fail-closed policy is pinned.
- Frontend: component tests for the rebuilt Roster and the Applicants tab/action flows (the two highest-churn surfaces). The existing `BriefUnderstanding`/`discoverMatch` tests are the model.
- The `tasks/lessons.md` incident (client selectors written against assumed API shapes crashing the Overview) argues for one integration-shaped test per page: render page against a fixture of the *real* endpoint response.

---

## 13. Implementation roadmap

Sequenced so nothing lands on sand. Sizes: S ≤ 1 day, M ≤ 3 days, L ≤ 1–2 weeks.

**Phase 0 — Truth & safety (everything here is a launch gate)**
| # | Task | Size | Refs |
|---|---|---|---|
| 0.1 | CI workflow (server tests, client lint+test+build) | S | P0-12 |
| 0.2 | Dead-code purge (Appendix A) + delete `/boards`, `/signed` routes + `PlaceholderPage.css` | S | §6, P0-4 |
| 0.3 | Wire notifications bell end-to-end; fix MessagesDropdown mark-all-read TODO | S | P0-3 |
| 0.4 | Strip money: API fields, roster status re-derivation, copy purge, drop `commissions`, delete `/agency/claim` | M | P0-5 |
| 0.5 | RBAC: map open-call + matching + roster-write routes, fail-closed writes, guard `roster/setup/notifications` routers, de-duplicate preview route, remove killswitch, route-coverage test | M | P0-6/7/8 |
| 0.6 | `string_agg` dialect branch; Overview error/loading states; ApplicantsPage error state | S | P0-10/11 |
| 0.7 | Cut Analytics from nav; add "On file" tab; "Applications"→"Submissions" label sweep | S | P0-2, §6.3, §6.14 |
| 0.8 | Design-ban fixes: gradient numerals, side-stripes, icon count bubble | S | §12.1 |

**Phase 1 — Roster reality (launch gate)**
| # | Task | Size | Refs |
|---|---|---|---|
| 1.1 | Migration: `roster_memberships` + backfill; accept-flow writes membership transactionally | M | §8.1 |
| 1.2 | Migration: `talent_records` (agency-private, minor-aware) + CRUD routes + permissions | M | §8.2 |
| 1.3 | Rebuild RosterPage + RosterWorkspace on real data per §9.1 spec (includes real bulk actions, Add Talent, measurement staleness, real availability status) | L | §9.1 |
| 1.4 | Split `inbox.js` into `org.js` / boards / roster / team seams (before 1.3's new endpoints if possible) | M | §9.4 |
| 1.5 | Team email invites (tokened accept flow, wire `sendTeamInviteEmail`) | M | §10.3 |
| 1.6 | Internal admin console for `agency_access_requests` | M | §10.6 |
| 1.7 | Accessibility floor: skip link, focus-trap primitive on all modals, `useCardButton` on the four card families, `MotionConfig reducedMotion` | M | §12.2 |

**Phase 2 — The Booking Desk (fast-follow, start immediately after launch)**
| # | Task | Size | Refs |
|---|---|---|---|
| 2.1 | Commitments API (CRUD + conflict/overlap engine + permission keys) | M | §8.3 |
| 2.2 | Calendar page (week/month, option/hold/booking/bookout spans, confirm-or-release flow) | L | §10.1 |
| 2.3 | Roster availability + Overview "this week" module fed by commitments | S | §10.1 |
| 2.4 | Wire the five booking-desk notification types (replace the "Soon" toggles) | S | §6.10 |

**Phase 3 — Depth & scale**
| # | Task | Size | Refs |
|---|---|---|---|
| 3.1 | Pagination (API) + virtualization (UI) for applicants/roster | M | §7.2 |
| 3.2 | Analytics rebuilt on real aggregates | M | §9.2 |
| 3.3 | True Castings: briefs UI + `casting_packages` share links | L | §10.2 |
| 3.4 | Interview ICS + email | S | §10.4 |
| 3.5 | Token/prefix migration (worst 4 CSS files first); vite `manualChunks`; drop one chart lib; image resize params | M | §12.1/12.3 |
| 3.6 | Backend test coverage for untested route files (authz matrix first) | M | §12.4 |

---

## Appendix A — Dead code deletion list (confirmed zero import sites)

Components: `components/ui/TalentStatusBadge.jsx`+`.css`, `components/ui/TalentTypePill.jsx`, `components/ui/MatchBreakdownTooltip.jsx`+`.css`, `components/TalentCard.jsx`+`.css`, `components/Grainient.jsx`+`.css` (duplicate), `components/KanbanColumn.jsx`, `components/KanbanCard.jsx`, `components/Kanban.css`, `components/InterviewSection.jsx`, `components/InterviewCard.jsx`, `components/InterviewScheduler.jsx`, `components/InterviewList.jsx`, `components/ReminderSection.jsx`, `components/ReminderCreator.jsx`, `components/ReminderCard.jsx` (contains a live `ReferenceError`: renders `<Snooze/>` without importing it), `components/TagManager.jsx`, `components/TagSelector.jsx`, `components/TagSelectorModal.jsx`, `components/TagRemovalModal.jsx`, `components/CastingPanel.jsx`+`.css`, `components/RichRow.jsx`+`.css`, `components/NotesPanel.jsx`, `components/MessageThread.jsx`, `components/TalentDetailPanel.jsx`, `components/ActivityTimeline.jsx`, `components/ActionButtonGroup.jsx`+`.css`, `components/BulkActionToolbar.jsx`+`.css`, `components/FilterBar.jsx`+`.css`, `components/FilterPresetManager.jsx` (resurrect deliberately if 10.5 ships), `components/KeyboardShortcutOverlay.jsx`+`.css`, `components/ConfirmationDialog.jsx` (inferior duplicate of the shared one), `components/zones/NotesEditor.jsx`.

Overview legacy family: `components/overview/PipelineCommandHero.jsx` (contains eyebrow-pattern markup), `StatLedger.jsx`, `ActiveBoards.jsx`, `AttentionStrip.jsx`, `CastingPipelineBar.jsx`, `OnTheFloorList.jsx`.

Pages/routes: `pages/BoardsPage.jsx`+`.css` (+ route), `pages/SignedPage.jsx`+`.css` (+ route), `pages/PlaceholderPage.css` (no JSX counterpart).

Hooks/API: `hooks/useStats.js`; dead exports in `api/agency.js` — `getAgencyStats`, `getUpcomingInterviews`, `getPipelineCounts` (keep `fetchRoster`, `getAgencyAnalytics`, `getAgencyNotifications` — they get consumers in Phases 0–1).

Backend: duplicate preview route + legacy handlers in `roster.js` (per P0-7), legacy `GET /api/agency/overview/stats` (`inbox.js:3299`), the retired `POST /partners` handler + `views/auth/partners.ejs` "Join as an Agency or Scout" template (`auth.js:1002-…` — superseded by the landing-site request form and the vetted-access model; keep the `GET /partners` redirect).

Nav plumbing: the unused `counts`/`countKey` wiring in `RailNav.jsx`/`agencyNav.js` (computed, never rendered — the ban on count bubbles is honored; remove the dead plumbing).

## Appendix B — Out of scope by product decision

No commission tracking, agency fees, subscriptions, billing, invoicing, payouts, vouchers-as-billing, or any agency monetization. Agencies are vetted and manually granted free access (request → review → grant, via `agency_access_requests` + the §10.6 console). The booking desk (§10.1) and castings (§10.2) are deliberately **operational-only**: dates, tiers, markets, usage terms, and client references — never rates or money. The `talent_commitments` schema already encodes this ("client_ref — non-financial job label"); keep that property permanent.
