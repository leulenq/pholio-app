# Agency Dashboard — Final Implementation Plan

**Date:** 2026-07-12
**Status:** Control document. This is the single execution plan for taking the agency dashboard to launch. It sequences and reconciles the three audits below into one dependency-ordered backlog; it does not restate their detail. For the *why* and the evidence behind any item, follow the cited source.

**Source documents (read alongside this plan):**
- **[PROD]** `tasks/agency-dashboard-audit.md` — production-readiness audit (P0-1…P0-12, data-model §8, new-build §10).
- **[DESIGN]** `tasks/agency-dashboard-design-plan.md` — frontend design plan (IA, component kit, page specs, motion, a11y).
- **[SEC]** `docs/audits/2026-07-12-agency-security-compliance-alignment-audit.md` — security / compliance / alignment audit + second-reviewer addendum (S-/C-/A- findings).

**Standing constraints (do not violate):**
1. **No money, anywhere.** No commissions, fees, rates, billing, invoicing, payouts, vouchers-as-billing, or earnings — UI, API, schema, or copy. Money-shaped code that exists today is *removal* work.
2. **Access model is vetted-manual:** request → Pholio reviews legitimacy → manual grant of a login. No self-serve agency signup.
3. **Two design systems, one material.** The agency "Editorial Ledger" never blends with the talent "Portfolio Stage"; parity means equal *craft*, not shared voice.
4. **Truth on every surface.** A surface reads real data or it does not ship. No mock constants, dead buttons, or "Soon" panels in a launched product.

---

## 1. How to execute this plan

**Phases** are gates. Everything in **Phase 0** must be true before any real agency receives a login. Phases 1–3 are post-gate, ordered by dependency and value.

**Tracks** route work to the right owner and let independent items run in parallel:

| Track | Owns | Suggested owner |
|---|---|---|
| **INF** | CI, build, deps, dead-code, repo hygiene | Any |
| **SEC** | Auth, RBAC enforcement, CSRF, uploads, tokens, CSP, injection | Codex / backend |
| **CMP** | Legal acceptance, minor consent lifecycle, export/redaction, rights, decision-support guardrails | Codex / backend + product |
| **DATA** | Migrations, schema, backfills | Codex / backend |
| **API** | Route handlers, pagination, transactions, new endpoints | Codex / backend |
| **FE** | React pages, component kit, states, motion, a11y, copy | Frontend |

**Sizing:** S ≤ 1 day · M ≤ 3 days · L ≤ 1–2 weeks.

**Item format:** each item lists **Closes** (which audit findings it discharges), **Depends on**, **Do** (concrete steps), **Done when** (acceptance), **Size**. Where two audits raised the same issue, the finding is merged into one item and both references are listed — do the work once.

---

## 2. Critical path (what unblocks what)

```
INF-0.1 CI ──────────────────────────────────────────► gates every merge below
INF-0.2 dead-code purge + route deletions ─► clears ground for FE kit & page work
FE-0.3 component kit + shell primitives ──► prerequisite for every FE page refactor
SEC track (0.4–0.9) ── mostly independent of FE; run in parallel
DATA-1.1 roster_memberships ─┐
DATA-1.2 talent_records ─────┴─► FE-1.4 Roster rebuild (needs both APIs)
CMP-0.10 agency legal gate ──► blocks first real login (same gate as INF/SEC)
API-1.5 admin review console ─► operational prerequisite for granting access
DATA-2.1 commitments API ────► FE-2.2 Calendar (Booking Desk)
```

The two longest poles are **Roster reality** (DATA-1.1 + DATA-1.2 + FE-1.4) and the **security/compliance gate** (SEC + CMP Phase 0). Start both on day one; they barely intersect.

---

## 3. Phase 0 — Launch gate (all items are blockers)

Nothing here is optional. When every Phase-0 item is Done, the dashboard is safe and honest enough to put in front of a vetted agency.

### INF — infrastructure

**INF-0.1 · Continuous integration**
- **Closes:** PROD P0-12.
- **Depends on:** none. **Do this first.**
- **Do:** one workflow on push/PR — root `npm test`; `client` lint, `vitest run`, `npm run build`. Fail the merge on any red.
- **Done when:** a PR cannot merge with a failing server test, client lint error, or broken client build.
- **Size:** S.

**INF-0.2 · Dead-code purge + route/page deletions**
- **Closes:** PROD P0-4, PROD §12/Appendix A; DESIGN §4 kill-list.
- **Depends on:** INF-0.1.
- **Do:** delete every file in the PROD audit Appendix A (banned-pattern components, legacy Kanban/Interview/Reminder/Tag/Overview-2.0 families, duplicate `Grainient`, `PlaceholderPage.css`, agency-local `ConfirmationDialog`, `RosterWorkspace`, `SignedPage`, `BoardsPage`, `RepresentationPanel`); delete the `/boards`, `/signed` routes; remove the dead `counts`/`countKey` nav plumbing and dead `api/agency.js` exports (`getAgencyStats`, `getUpcomingInterviews`, `getPipelineCounts`).
- **Done when:** `git grep` finds zero imports of the deleted modules; build passes; the known `ReminderCard` `Snooze` ReferenceError is gone with the file.
- **Size:** S.

**INF-0.3 · Dependency triage**
- **Closes:** SEC S-P2-1.
- **Do:** resolve the 8 critical `npm audit` findings (upgrade or justify-and-pin); move accidental server deps (`tmux`, `gsap`) out; pick one chart lib repo-wide (drop the other).
- **Done when:** `npm audit` shows 0 critical; documented exceptions for anything unfixable.
- **Size:** S.

### SEC — security (parallel track, independent of FE)

**SEC-0.4 · CSRF protection on cookie-session mutations**
- **Closes:** SEC S-P0-1.
- **Do:** add a same-origin mutation defense — server-issued `X-CSRF-Token` bound to the session (double-submit acceptable) **or** strict Origin/Referer + required non-simple header on every unsafe method. Apply to all `POST/PUT/PATCH/DELETE /api/agency/*` and `/api/talent/*` and the unauthenticated `/api/reply/*` writes.
- **Done when:** an unsafe request without a valid token is rejected; route tests assert 403 without the token for a representative agency mutation.
- **Size:** M.

**SEC-0.5 · RBAC hardening (enforcement + coverage + guard chain)** — *merged item*
- **Closes:** PROD P0-6, P0-7, P0-8; SEC S-P0-2, S-P1-7.
- **Do:** (a) map the unmapped route families in `route-permissions.js` — open-call, matching, roster-writes, and any other registered `/api/agency/*` path; add the new permission keys to the catalog + presets. (b) Flip `enforceAgencyRoutePermissions` to **fail-closed for unsafe methods** (unmapped `POST/PUT/PATCH/DELETE` → 403 + log). (c) Mount `mountAgencyApiGuard` on `roster.js`, `setup.js`, `notifications.js` (preserve setup's onboarding allow-list). (d) Delete the duplicate `roster.js` preview handler shadowing the guarded `inbox.js` copy. (e) Make `AGENCY_RBAC_ENFORCE` impossible to disable when `NODE_ENV=production`.
- **Done when:** a route-coverage test enumerates every registered agency route and asserts each unsafe one resolves to a permission key; a VIEWER is provably blocked from export, team writes, open-call, and matching; RBAC cannot be turned off in prod.
- **Size:** M.

**SEC-0.6 · SVG logo upload hardening**
- **Closes:** SEC S-P0-3.
- **Do:** rasterize agency-logo SVG to PNG/WebP at ingestion (preferred) **or** disable SVG until a hardened sanitizer is in place; add magic-byte sniffing (don't trust MIME + extension); serve with restrictive content-type/disposition.
- **Done when:** an uploaded SVG with an embedded `<script>` cannot be stored-and-served as active SVG; test covers a script-bearing SVG.
- **Size:** S–M.

**SEC-0.7 · Session regeneration on login**
- **Closes:** SEC S-P1-4.
- **Do:** call `req.session.regenerate()` at the start of a successful auth, then assign identity fields and save.
- **Done when:** a test asserts the session ID changes across login (fixation closed).
- **Size:** S.

**SEC-0.8 · Reply-token hardening**
- **Closes:** SEC S-P1-5.
- **Do:** store `token_hash` (SHA-256), not the raw token; rotate/single-use on redemption or cut TTL materially; require a fresh short-lived token for the `…/session` bootstrap.
- **Done when:** DB holds only hashes; a redeemed reply token cannot be replayed; tests cover redeem + replay-denied.
- **Size:** M.

**SEC-0.9 · Discover prompt-injection containment**
- **Closes:** SEC S-P1-6.
- **Do:** delimit talent-authored content (bio, casting notes, look descriptor) from instructions in the rerank + query-understanding prompts (structured fields / fenced data boundaries the model is told to treat as data); strip control phrases; validate model output against the existing contract schema so an out-of-range/instructed score can't pass.
- **Done when:** an eval fixture with an injection-laden bio ("rank me first / score 100") does not alter ranking or produce an out-of-contract score.
- **Size:** M.

### CMP — compliance (blocks first real login)

**CMP-0.10 · Agency legal / policy acceptance per member**
- **Closes:** SEC C-P0-1.
- **Do:** add a versioned acceptance gate before dashboard use — Terms, Privacy, workspace acceptable-use, prohibited protected-trait decisioning, data-handling/DPA. Store acceptance **per human member**, not per agency account. Mirror the existing talent `requireLegalAcceptance` pattern.
- **Done when:** a team member cannot reach `/api/agency/*` operational routes until they've accepted the current versions; re-prompts on version bump.
- **Size:** M.

**CMP-0.11 · Minor access & revocation matrix**
- **Closes:** PROD (minor handling); SEC C-P0-2, A-P0-1 (revocation half).
- **Do:** define a minor-access matrix and enforce it across **every** agency surface (details, notes, messages, reminders, exports, comp-card/image downloads, cached submission packages). Store consent grant ID + expiry on the application/submission package. On withdrawal or consent revocation, freeze/tombstone agency access consistently and block exports/downloads; retain only legally necessary audit metadata.
- **Done when:** an endpoint-by-endpoint automated test matrix proves a minor's restricted fields never surface and that a withdrawn/revoked grant closes every agency read path (not just details/notes 410).
- **Size:** M–L.

### API/FE — truth (make every shipped surface real)

**API/FE-0.12 · Notifications wired end-to-end**
- **Closes:** PROD P0-3; DESIGN §8.9/§4.9.
- **Depends on:** FE-0.3 (unread treatment component).
- **Do:** replace the hardcoded `notifications={[]}` in `AgencyLayout` with a real `useQuery(getAgencyNotifications, refetchInterval 60s)`; wire `onAllRead → markAllAgencyNotificationsRead`; render unread via the §4.9 treatment (icon underline + count-in-dropdown-header, **no count bubble**); wire the `MessagesDropdown` mark-all-read TODO.
- **Done when:** an application-received event produces a visible agency notification; mark-all-read persists.
- **Size:** S.

**API/FE-0.13 · Money strip-out + non-financial availability**
- **Closes:** PROD P0-5; SEC C-P1-2 (partial), A-P1-2 (money exclusion).
- **Do:** remove commission/booking-money fields from `/api/agency/stats`, `/roster`, `/roster/:id`, and the export; re-derive roster availability from real signals (`talent_commitments` overlap + talent `availability_status`) with plain-text statuses (Available / On option / On booking / Booked out / Inactive); delete `POST /agency/claim`; drop the `commissions` table once no reader remains (update `seeds/seed.js` + `scripts/seed-agency-demo.js`); purge "commission" copy from `CLAUDE.md`, `client/.../agency/CLAUDE.md`, `PRODUCT.md`.
- **Done when:** no code path reads or writes `commissions`; no money string appears on any agency surface; availability reflects real state.
- **Size:** M.

**API-0.14 · Export overhaul (dialect + redaction)** — *merged item*
- **Closes:** PROD P0-10; SEC C-P1-1.
- **Do:** branch `string_agg`/`group_concat` on dialect (fixes the SQLite crash); split export into operational roster/application export vs. privileged internal-notes export; gate notes export behind `org.export_data` (owner/admin), default-exclude internal decision notes, add a warning + audit-log the export event.
- **Done when:** export works on SQLite and Postgres; a VIEWER cannot export; notes are excluded unless explicitly, permissibly included.
- **Size:** M.

**FE-0.15 · Overview + Submissions error/loading truth**
- **Closes:** PROD P0-11; DESIGN §5, §8.1, §8.2.
- **Depends on:** FE-0.3 (skeletons).
- **Do:** Overview and Submissions get skeleton-first loading, a real `isError` panel with retry (no more zeroed dashboard / empty-copy fallthrough), and distinct zero-result vs. empty states.
- **Done when:** a forced 500 on `/overview` and `/applications` renders an error+retry, not a confident all-zero or "no applicants" screen.
- **Size:** S.

**FE-0.16 · Analytics out of nav**
- **Closes:** PROD P0-2.
- **Do:** remove Analytics from `agencyNav.js`; 302 `/analytics` → Overview until FE-3.4 rebuilds it on real data.
- **Done when:** no nav path leads to fabricated numbers.
- **Size:** S.

### FE — foundation (unblocks all later FE work)

**FE-0.3 · Component kit + shell primitives**
- **Closes:** DESIGN §2, §3, §4, §6, §10; PROD §12.1/§12.2.
- **Depends on:** INF-0.2.
- **Do:** build the canonical kit — `AgencyModal` (focus trap, Escape, scrim, focus-return), `AgencySkeleton`, `AgencyRow`, `StatusText` (single status→label+color source, replacing the 5 ad-hoc maps), `FilterChips`, `useCardButton` (keyboard activation), `AgencyButton` loading/disabled states, the §4.9 unread treatment; add the shell skip link, `<MotionConfig reducedMotion="user">` + the reduced-motion CSS block, and bump the focus-ring alpha. Fix the standing visual violations here too: gradient-text numerals → solid, side-stripes → full borders/tints, `.ag-icon-badge` count bubble → §4.9.
- **Done when:** the kit is the only modal/row/skeleton/status vocabulary; a keyboard user can operate a card; reduced-motion is honored globally; no banned pattern remains in shipped CSS.
- **Size:** M.

**FE-0.17 · Terminology + route renames**
- **Closes:** DESIGN §1.1/§9; SEC A-P1-1, A-P2-1.
- **Do:** "Applications" → **Submissions**, "Casting" → **Signing** (nav, headings, empty states, toasts); add `/submissions` `/signing` routes with redirects from `/applicants` `/inbox` `/casting`; build the shared lifecycle copy map (Submitted / In review / Shortlisted / On file / More digitals requested / Meeting requested / Development / Signed / Not moving forward / Withdrawn) and apply it to agency UI **and** the legacy talent email templates that still say "accepted/declined."
- **Done when:** no agency surface or talent email uses "application accepted"; one copy map is the source of truth.
- **Size:** S–M.

---

## 4. Phase 1 — Roster reality & access model

The dashboard is safe after Phase 0; Phase 1 makes it *usable* by a real agency with a real roster.

**DATA-1.1 · `roster_memberships` table + accept-flow write**
- **Closes:** PROD §8.1.
- **Do:** create the persisted membership table (PROD §8.1 schema); backfill from qualifying applications; make application-accept create a membership transactionally. Roster reads join through it; application statuses stop doubling as roster membership.
- **Done when:** removing someone from the roster no longer mutates historical application rows; division assignment has a home.
- **Size:** M.

**DATA-1.2 · `talent_records` (off-platform, agency-private, minor-aware)**
- **Closes:** PROD §8.2.
- **Depends on:** CMP-0.11 (minor rules apply to these records too).
- **Do:** create the agency-private talent record table (PROD §8.2); never expose in Discover or public; wire the concierge `agency_import_jobs` intake to land rows here.
- **Done when:** an agency can hold a roster member who is not a Pholio user; minor records follow the same visibility discipline as platform minors.
- **Size:** M.

**API-1.3 · Roster + submissions API maturity**
- **Closes:** PROD §7.2 (pagination, N+1, transactions, validation).
- **Do:** add pagination to `/applications`, `/roster`, `/reminders`, `/interviews`, `/messages/threads` (mirror `activity.js`); wrap multi-write ops (board create/duplicate, bulk status+activity, assign-board, bulk-tag) in transactions and batch the N+1s; add zod validation + length caps to the ad-hoc handlers.
- **Done when:** core lists are paginated; no multi-write op can half-commit; free-text fields are bounded.
- **Size:** M.

**FE-1.4 · Roster rebuild**
- **Closes:** PROD P0-1, §9.1; DESIGN §8.6.
- **Depends on:** DATA-1.1, DATA-1.2, API/FE-0.13, FE-0.3.
- **Do:** rebuild `RosterPage` on the real API per DESIGN §8.6 — real data, board/division grouping, plain-text availability (StatusText), dual-unit measurements with `measurements_updated_at` staleness, computed intelligence signals (idle-90d / incomplete / stale measurements) with an honest zero-state, real bulk actions (or absent), Add-Talent opening the `talent_records` flow, drawer selection model. Delete all mock constants and the scripted intelligence copy.
- **Done when:** the page shows the agency's actual signed talent; zero mock strings; no dead buttons; keyboard-operable.
- **Size:** L.

**API-1.5 · Internal admin review console**
- **Closes:** PROD P0-9; access-model constraint.
- **Do:** minimal staff-only surface (separate namespace, e.g. `/internal/agency-requests`, guarded by a new `PLATFORM_ADMIN` check — **not** agency RBAC): list `agency_access_requests` by status, detail + review notes, actions = log qualification call / approve (→ `provisionAgencyForUser` + credential/invite email) / decline (with reason); write `agency_access_request_events` on every transition.
- **Done when:** a real access request can be reviewed and granted end-to-end with no hand-run SQL.
- **Size:** M.

**API/FE-1.6 · Notes provenance + audit**
- **Closes:** SEC S-P1-1.
- **Depends on:** DATA (small migration).
- **Do:** add `created_by_user_id`, `updated_by_user_id`, optional `deleted_at`, and an immutable note-audit table; surface author + edited-state in the UI; add internal-only copy discouraging protected-class commentary.
- **Done when:** every note shows who wrote/edited it; deletions are auditable.
- **Size:** M.

**API-1.7 · Audience-DTO the raw profile reads**
- **Closes:** SEC S-P1-2.
- **Do:** replace broad `profiles.*` reads in agency detail paths with `selectColumnsForAudience(...)`; add contract tests asserting forbidden keys (DOB, contact, guardian, raw AI, moderation) never appear in any agency response, export, or submission package.
- **Done when:** contract tests pass on every agency read surface; raw rows are server-internal only.
- **Size:** M.

**FE-1.8 · Team email invitations**
- **Closes:** PROD §10.3; DESIGN §8.10.
- **Do:** wire the dead `sendTeamInviteEmail` — invite-by-email creates a pending membership + tokened accept link; accepting provisions the user into the *already-vetted* agency with the assigned role. Add the pending-state row in the UI.
- **Done when:** an agency can add a teammate who doesn't yet have a login; the flow respects the vetted-access model (joins a vetted workspace, not the platform at large).
- **Size:** M.

**FE-1.9 · A11y floor**
- **Closes:** DESIGN §10; PROD §12.2; SEC A-P1-4 (partial).
- **Depends on:** FE-0.3.
- **Do:** apply `useCardButton` to every clickable card/row; focus-trap all overlays (on `AgencyModal`); keyboard-open the PortfolioGrid lightbox; arrow-key tablists; verify contrast floor (`--ag-text-3/4` not carrying body info on cream); `alt` on talent photos.
- **Done when:** every interactive surface is keyboard-operable with visible focus; overlays trap + return focus; no color-only status.
- **Size:** M.

---

## 5. Phase 2 — Booking desk & castings (fast-follow, non-financial)

The retention features. Start immediately after launch. **Strictly non-financial** — dates, tiers, markets, client references, usage terms; never rates or money.

**DATA-2.1 · Commitments API + conflict engine**
- **Closes:** PROD §8.3, §10.1; SEC A-P1-2 (non-money availability).
- **Do:** agency CRUD over `talent_commitments` (guarded, new `commitments.view/manage` keys); server-side overlap/conflict computation (a 2nd option over a 1st surfaces the confirm-or-release decision); talent bookouts block agency options; add `created_by_user_id` + audit.
- **Done when:** an agency can place/edit options, holds, bookings, bookouts; conflicts are detected; talent-declared bookouts are respected.
- **Size:** M.

**FE-2.2 · Calendar (Booking Desk)**
- **Closes:** PROD §10.1; DESIGN §8.8; SEC A-P1-2.
- **Depends on:** DATA-2.1, FE-0.3, FE-1.4.
- **Do:** build the week/month calendar per DESIGN §8.8 — talent rows grouped by board, spans by kind (fill/outline/hatch, never badges), drag-to-create → popover form, confirm-or-release flow, header ledger, agenda-list fallback <1024px. Wire the five real booking-desk notification types (replacing the removed "Soon" toggles).
- **Done when:** a booker can run availability for the week; nothing on the surface implies money.
- **Size:** L.

**API/FE-2.3 · True Castings + client packages**
- **Closes:** PROD §10.2, §8.4; SEC A-P1-3 (submission-vs-live clarity extends here).
- **Do:** build the client-brief Castings surface on `boards.kind='casting'` + `casting_briefs` (client, dates, market, usage, look target); assemble roster talent into a `casting_packages` share page (tokened, revocable, expiring, open-tracked — reuse the `share_tokens` pattern); packages respect `profile_field_visibility` and categorically exclude minors' restricted data.
- **Done when:** an agency can send a client a package link without login; the word "Casting" finally means a client casting.
- **Size:** L.

**FE-2.4 · Submission-package clarity (both sides)**
- **Closes:** SEC A-P1-3.
- **Do:** on agency detail, label "Submitted package" vs "current profile" and show measurements-updated date + a request-more path; on talent application detail, show the exact submission-package version + disclosure timestamp.
- **Done when:** neither side is confused about whether they're seeing a frozen snapshot or live data.
- **Size:** M.

---

## 6. Phase 3 — Depth, scale, polish

**FE-3.1 · Talent workspace consolidation** — merge the drawer + full page into one model (DESIGN §8.7); delete the leftover full-screen workspace view. Size M.

**FE-3.2 · Page refactors onto the kit** — Signing, Interviews, Activity, Settings, Messages adopt AgencyRow/AgencyModal/skeletons; Divisions panel becomes a real boards-API manager; add the "On file" tab to Submissions. DESIGN §8.3/§8.4/§8.9/§8.10/§8.11/§8.13. Size M.

**FE-3.3 · Token/hex migration** — eliminate raw hex and legacy `--agency-*`/`st-*`; worst files first (InterviewsPage, SettingsPage, CastingPage, TeamPage). New rule enforced in review: no raw hex in agency CSS. DESIGN §7. Size M.

**FE-3.4 · Analytics rebuilt on real queries** — return to nav only when live; funnel / time-in-stage / intake sources / roster growth, all real, all with zero states; follow the `dataviz` skill. PROD §9.2, DESIGN §8.14. Size M.

**INF-3.5 · Performance** — list virtualization on applicants/roster; `vite manualChunks`; image resize/`srcset` params for roster/applicant thumbnails (Sharp + R2 already present); visibility-gated polling. PROD §12.3. Size M.

**CMP-3.6 · Decision-support guardrails + rights notices** — surface the LL144/EU AI Act disclosures in the *client* (they exist server-side but aren't rendered); require brief/job context for sensitive filters and log the rationale; add submission-purpose + image-use notices and gate comp-card/image downloads by permission + audit event with release-status display. SEC C-P1-2, C-P1-3. Size M.

**SEC-3.7 · Enforced CSP** — add nonce/hash infra for the EJS/Vite bootstraps, remove `unsafe-inline`, enforce CSP in production (report-only in staging). SEC S-P1-3. Size M.

**API-3.8 · `inbox.js` decomposition** — split the 3,500-line god-file along its filename seams (org / boards / roster / team). Do before new API surfaces land where practical. PROD §7.3. Size M.

**INF-3.9 · Backend test coverage** — route tests for the untested files (roster, casting, matching, tags, interviews, reminders, messages, open-call, provisioning), authz 403-matrix first so the fail-closed policy is pinned. PROD §12.4. Size M.

**Deferred (explicitly not in this plan):** interview two-way calendar sync (ICS attachment is a small optional add under FE-3.2); saved views/filter presets (backend exists — resurrect if wanted); placement/mother-agency UI over `talent_representations`; multi-market stays; internal team chat; region-specific minor modules (permits/Coogan/chaperone) beyond the consent gate; real-time websockets. **Never:** any money/payments/voucher lifecycle.

---

## 7. Cross-cutting workstreams (thread all phases)

- **Design-system discipline** — every FE PR is reviewed against DESIGN §12.1 bans and the gold-≤10% budget; the acceptance checklist below is mandatory per page.
- **State doctrine** — every data surface ships skeleton + empty + zero-result + error (DESIGN §5). No silent failure paths.
- **Testing** — one integration-shaped test per page rendering against a fixture of the *real* endpoint response (the `tasks/lessons.md` shape-mismatch incident is why); authz matrix tests as SEC/CMP items land.
- **Copy** — the shared lifecycle map (FE-0.17) is the single source; no surface invents its own status labels.

---

## 8. Traceability — every graded finding has a home

**[PROD] production audit**

| Finding | Item |
|---|---|
| P0-1 Roster fake | FE-1.4 |
| P0-2 Analytics static | FE-0.16 (out) → FE-3.4 (rebuild) |
| P0-3 Notifications dead | API/FE-0.12 |
| P0-4 Signed page | INF-0.2 |
| P0-5 Money artifacts | API/FE-0.13 |
| P0-6 Fail-open perms | SEC-0.5 |
| P0-7 Guard bypass + dup route | SEC-0.5 |
| P0-8 RBAC killswitch | SEC-0.5 |
| P0-9 No admin console | API-1.5 |
| P0-10 string_agg SQLite | API-0.14 |
| P0-11 Overview no error state | FE-0.15 |
| P0-12 No CI | INF-0.1 |
| §7.2 pagination/N+1/txn | API-1.3 |
| §7.3 inbox.js god-file | API-3.8 |
| §8.1 roster_memberships | DATA-1.1 |
| §8.2 talent_records | DATA-1.2 |
| §8.3 commitments access | DATA-2.1 |
| §8.4 casting_packages | API/FE-2.3 |
| §10.1 Booking desk | FE-2.2 |
| §10.2 Castings/packages | API/FE-2.3 |
| §10.3 Team email invites | FE-1.8 |
| §12.1 design violations | FE-0.3 |
| §12.2 a11y | FE-1.9 |
| §12.3 performance | INF-3.5 |
| §12.4 test coverage | INF-3.9 |

**[SEC] security / compliance / alignment**

| Finding | Item |
|---|---|
| S-P0-1 CSRF | SEC-0.4 |
| S-P0-2 RBAC enforcement | SEC-0.5 |
| S-P0-3 SVG upload | SEC-0.6 |
| S-P1-1 Notes provenance | API/FE-1.6 |
| S-P1-2 Raw profile read | API-1.7 |
| S-P1-3 CSP | SEC-3.7 |
| S-P1-4 Session fixation | SEC-0.7 |
| S-P1-5 Reply tokens | SEC-0.8 |
| S-P1-6 Prompt injection | SEC-0.9 |
| S-P1-7 Guard bypass/dup | SEC-0.5 |
| S-P2-1 Deps + dev bypass | INF-0.3 |
| C-P0-1 Agency legal gate | CMP-0.10 |
| C-P0-2 Minor revocation | CMP-0.11 |
| C-P1-1 Export redaction | API-0.14 |
| C-P1-2 Decision-support guardrails | API/FE-0.13 (money) + CMP-3.6 |
| C-P1-3 Image rights/use | CMP-3.6 |
| A-P0-1 Withdrawal semantics | CMP-0.11 |
| A-P1-1 Lifecycle copy map | FE-0.17 |
| A-P1-2 Availability (non-money) | DATA-2.1 + FE-2.2 |
| A-P1-3 Submission-package clarity | FE-2.4 |
| A-P1-4 Design parity | FE-0.3 + FE-1.4 + FE-1.9 (this plan) |
| A-P2-1 Trade terminology | FE-0.17 |

**[DESIGN]** IA/renames → FE-0.17; component kit/shell → FE-0.3; page specs → FE-1.4, FE-3.1, FE-3.2; motion/a11y → FE-0.3, FE-1.9; visual enforcement → FE-0.3, FE-3.3; Roster §8.6 → FE-1.4; Calendar §8.8 → FE-2.2; Analytics §8.14 → FE-3.4.

---

## 9. Launch definition of done

The dashboard may be put in front of a vetted agency when **all** are true:

- [ ] All Phase-0 items Done; CI green and required on merge.
- [ ] No surface renders mock data, dead buttons, or "Soon" panels (INF-0.2, FE-0.15/0.16, API/FE-0.12/0.13, FE-1.4).
- [ ] No money exists anywhere — UI, API, schema, copy (API/FE-0.13).
- [ ] Security gate closed: CSRF, fail-closed RBAC that can't be disabled in prod, guard chain on every router, SVG hardened, session regeneration, hashed/rotating reply tokens, contained prompt-injection surface (SEC-0.4…0.9).
- [ ] Compliance gate closed: per-member agency legal acceptance; minor access/revocation matrix enforced and tested across every surface; export redaction + permission-gated (CMP-0.10, CMP-0.11, API-0.14).
- [ ] Access model operational: an access request can be reviewed and granted with no hand-run SQL (API-1.5).
- [ ] Roster shows the agency's real signed talent, keyboard-operable, honest states (FE-1.4, FE-1.9).
- [ ] Per-page acceptance checklist (below) passes for every shipped page.

**Per-page acceptance checklist** (every page, every PR):
- [ ] Reads only real data; zero mock constants, dead buttons, "Soon" labels.
- [ ] Skeleton, empty, zero-result, and error states all reachable and designed.
- [ ] Fully keyboard-operable; focus visible; overlays trap and return focus.
- [ ] Motion ≤300ms, state-conveying, reduced-motion-safe.
- [ ] No banned patterns (badge pills, corner chips, count bubbles, eyebrows, gradient text, side-stripes, glass, serif in controls).
- [ ] Gold ≤10%; one primary action; tokens only, no raw hex.
- [ ] Long names/labels tested; operable at 768px.
- [ ] Terminology matches the shared lifecycle map.
- [ ] Every agency response passes the audience-DTO forbidden-key contract test.
- [ ] The squint test: still a calm, warm, editorial ledger — and would a working booker trust it?
