# Deferred audit items — product-decision brief

From the talent-application-lifecycle audit. These two items were **not built** because they require a product decision and **agency-side work** (the audit was scoped to the talent dashboard). Building either talent-only would create a state nothing produces — the exact dead-end the audit warns against. This brief gives each the data model, the touchpoints, effort, and the decision needed.

Current application status set (for reference): `pending → submitted → shortlisted → {accepted, booked} | {declined, passed} | archived | withdrawn`. Interviews are a separate table. There is **no** roles/casting model — applications are agency-representation only.

---

## 1. Keep-on-file / talent pool

**What it is:** a softer rejection. Instead of `declined`/`passed` (hard close), the agency keeps a talent in a "future consideration" pool and can re-engage later. Industry-standard ("silver medalist" pooling); turns a dead "no" into a warm "not yet."

**Why deferred:** needs an **agency action to set it** — a talent-only state would never be produced.

**Decision needed:**
- Is keep-on-file a distinct **status** (replaces a close) or a **flag** that coexists with closed? Recommended: a distinct status `kept_on_file` (terminal-soft, re-activatable), so it reads cleanly in the talent's status vocabulary.
- Who can re-activate — only the agency, or does the talent opt in/out?

**Data model:**
- Add `kept_on_file` to the `applications.status` enum (migration mirroring `20260622000000_add_withdrawn_application_status.js`).
- Optional `kept_on_file_at` timestamp for "on file since".

**Agency-side touchpoints (out of current scope — needs building):**
- Inbox action "Keep on file" alongside accept/decline (`src/domains/agency/routes/inbox.js` + agency UI).
- Re-engage action: move `kept_on_file → shortlisted/pending`.

**Talent-side (mostly ready):**
- `statusConfig` already has the pattern — add a `kept_on_file` entry (label "Kept on File", tone `closed` or a new soft tone, copy "The agency is keeping your profile on file for future openings").
- Reuses the existing notification + history + detail rendering. ~30 min once the status exists.

**Notifications:** `notify-talent-application.js` already maps statuses → add `kept_on_file` copy ("You're being kept on file by {agency}").

**Effort:** S–M. Talent side ~0.5 day. Agency side (action + UI + re-engage) ~1–1.5 days. Migration trivial.

**Recommendation:** Do it — high trust-per-effort, mostly reuses existing machinery. Gate on the one product call (status vs flag; recommend status).

---

## 2. Casting / role workflow (hold · pin · avail-check · first-refusal · booked)

**What it is:** the casting-industry pipeline for a talent submitted for a **specific job/role** (vs. agency representation): Submitted → Viewed → Shortlisted → Callback → **Avail Check → Pinned → First Refusal → On Hold → Booked** → Released/Not Selected.

**Why deferred:** the product has **no casting/role data model at all**. `applications` link a talent to an *agency*, not to a *role/job/casting call*. This is a whole new subsystem, not an extension.

**This is a product-direction decision first, not an engineering task.** Question for the business: *is Pholio entering the casting/job-submission space, or staying focused on talent↔agency representation?* If the latter, **drop this item** — these states don't apply.

**If yes, scope (large, multi-domain):**
- New tables: `castings`/`roles` (a job a client/agency posts), `casting_submissions` (talent↔role, with its own status machine: avail/pin/first-refusal/hold/booked/released/backup), date/usage/rate fields.
- Agency/client-side: create castings, submit talent, manage the pipeline (the bulk of the work).
- Talent-side: a new "Castings" surface distinct from "Applications"; avail-check confirmation, hold/release visibility, booking acceptance.
- Notifications + history for each transition.
- Attribution: who submitted (self vs agent).

**Effort:** L (multi-week, spans agency + talent + data). Not a talent-dashboard task.

**Recommendation:** **Do not build now.** Take the product-direction decision first. If casting is on the roadmap, spec it as its own initiative; if not, formally close this audit item as out-of-scope.

---

## Also outstanding (infra, not product)
- **True no-response auto-expiry** (`expired` status): needs a scheduler. None exists (Netlify/serverless). Today there's a truthful display-only stale cue. Options: a scheduled function (Netlify Scheduled Functions / external cron hitting an endpoint) that ages stale `pending`/`submitted` apps. Effort S once a scheduling mechanism is chosen.
- **Agency notification rendering** for the 3 new types (`message_received`, `interview_response`, `application_withdrawn`) — currently a graceful generic Bell fallback. Add entries to `client/src/shared/components/NotificationCenter/notificationHelpers.js`. Effort XS (agency-dashboard polish).
