# Talent Submission Flow — Industry Lifecycle Map

**Flow:** Talent → agency submission ("apply to agency") inbound lifecycle
**Surfaces:** `client/src/domains/talent/utils/applicationStatus.js`, `client/src/domains/talent/pages/OverviewPage/index.jsx`
**Persisted state set:** `applications.status` (DB CHECK constraint)
**Auditor:** The Booker (`/industry lifecycle`)
**Date:** 2026-06-24

---

## Headline

Pholio's **data model is more mature than its presentation.** The `applications.status` CHECK constraint already carries the industry-true soft-yes states — `shortlisted` and `kept_on_file` — that most "modeling CRM" software never models at all. The failure is in the **collapse layer**: `bucketCounts` flattens all of it into `active / won / closed`, and in doing so it files **`kept_on_file` — the single most common and most valuable real outcome of a submission — into the same `closed` bucket as `declined`, `passed`, and `withdrawn`.** The platform built the right state and then buried it with the rejections. That's the headline gap.

---

## Canonical inbound state machine (industry reality)

Per `reference/lifecycle.md` §2 — an inbound submission is a **submission of digitals + stats judged by a booker**, not a job application:

```
Submitted (digitals + measurements + basics)        ← talent acts
  → Received / in review                             ← agency
  → [Auto / early decline]            ← most submissions
  → Shortlisted / kept on file        ← the common "soft yes" (NON-terminal)
  → Requested more (more digitals, specific shots, in-person)
  → Invited to meeting / go-see
  → Outcome:
       ├─ Development offer (new face)
       ├─ Signed / represented
       └─ Declined (humane, non-terminal: "keep you on file / reapply")
```

**Ownership:** talent self-submits; the **agency** owns every decision transition (decline / file / shortlist / request-more / meeting / offer). Talent owns only `withdrawn`.

---

## Mapping: Pholio states → canonical machine

Persisted DB set (from `migrations/20260623000000_add_kept_on_file_application_status.js`):
`pending, submitted, shortlisted, booked, passed, accepted, declined, archived, withdrawn, kept_on_file`

| Pholio status | Talent label (`statusConfig`) | Tone → `bucketCounts` | Canonical state | Verdict |
|---|---|---|---|---|
| `submitted` | Under Review | pending → **active** | Submitted | ✅ Correct |
| `pending` | Under Review | pending → **active** | Received / in review | ✅ OK (legacy alias; renamed to `submitted` in `20260316000001`) |
| `reviewing` | In Review | pending → **active** | In review | ⚠️ P2 — in client `statusConfig` but **not** in the DB CHECK set; a label that can never persist |
| `shortlisted` | Shortlisted | pending → **active** | Shortlisted (soft yes) | 🔶 **P1** — real soft-yes, but flattened into generic "active"; the advance signal disappears |
| `kept_on_file` | Kept on File | **closed → closed** | Kept on file (soft yes, **non-terminal**) | 🔴 **P0/P1** — `tone: 'closed'` (`applicationStatus.js:100`) files the best soft outcome **with the rejections**. Misrepresents a positive as a closure |
| `accepted` | Accepted | accepted → **won** | Signed / represented | 🔶 **P1** — "won" is deal-CRM language; representation isn't "won" |
| `booked` | Booked | accepted → **won** | Booked (a *booking event*, not an inbound rep outcome) | 🔶 **P1** — conflates the booking machine with the submission machine; lumped into "won" |
| `declined` | Not Selected | closed → **closed** | Declined (non-terminal) | ✅ OK — "Not Selected" + "keep your book current" copy is humane |
| `passed` | Not Selected | closed → **closed** | Declined | ⚠️ P2 — functional duplicate of `declined` |
| `rejected` | Not Selected | closed → **closed** | Declined | ⚠️ P2 — client-only alias, not in DB; harsh word, prefer to drop |
| `archived` | Closed | closed → **closed** | Housekeeping (not a decision) | ✅ OK |
| `withdrawn` | Withdrawn | closed → **closed** | Talent withdrew | ✅ OK — correctly the only talent-owned exit |
| — **missing** — | — | — | **Requested more** (more digitals / specific shots / in-person) | 🔶 **P1** — a real, common step; agency asks the talent to *do* something. No state for it → no "ball in your court" prompt |
| — **missing** — | — | — | **Development offer / new face** | 🔶 **P1** — no way to represent "we want to develop you" vs. full sign |

**On meetings/go-sees:** these are *not* missing — they're modeled as a separate `interviews` entity (`migrations/20260208000002_create_interviews_table.js`, statuses `pending/accepted/declined/rescheduled/cancelled/completed`) and correctly surfaced on the Overview via `interviewsNeedingResponse` (`OverviewPage/index.jsx:127–129`). Keeping "invited to meeting" as its own object rather than an application status is a defensible architecture — leave it.

---

## Graded gaps

**P0/P1 — `kept_on_file` is bucketed as a closure.**
`applicationStatus.js:100` sets `tone: 'closed'` on `kept_on_file`, so `bucketCounts` (`:120`) counts it in `closed` alongside `declined/passed/archived/withdrawn`. On the Overview, a talent the agency *liked enough to keep on file* sees that filed under the same number as their rejections. This is worse than not modeling it — the right state exists and is mis-presented as a negative. The industry treats "kept on file" as a soft *yes* and the most common non-rejection outcome.

**P1 — sales-CRM framing (`active / won / closed`, "won").**
`bucketCounts` returns `{ active, won, closed }` and `OverviewPage:444` renders "**N** won." You don't "win" a submission; outcomes are *in review / kept on file / shortlisted / signed / declined* (`reference/lifecycle.md` §2). "Won pipeline" is an outsider tell.

**P1 — soft-yes states give no advance signal.**
`shortlisted` and `kept_on_file` are the two states that tell a talent they're *progressing*. One is flattened into "active," the other into "closed." Neither surfaces as its own line, even though the page already proves the pattern with `interviewsNeedingResponse`.

**P1 — `accepted` vs `booked` conflation.**
Both map to `won`. `booked` belongs to the booking/option machine (`reference/lifecycle.md` §3), not the inbound submission outcome. Mixing them muddies what "accepted" means to the talent.

**P1 — no "Requested more" state.**
The most action-generating real step (agency: "send fresh full-length digitals" / "come in") has no representation, so the Overview can never put that ball in the talent's court.

**P2 — dead/duplicate client labels.**
`reviewing` and `rejected` exist in `statusConfig` but not in the DB CHECK set — they can't persist. `passed` duplicates `declined`. Prune to the real set.

---

## Recommended correction

The DB states are mostly right — **the fix is the collapse layer and labels, not new migrations** (except optionally adding `requested_more` and a development/new-face state).

### 1. Re-group `bucketCounts` into industry-true standing
Replace `{ active, won, closed }` with outcome groups that never bury a soft yes:

```
In review     → submitted, pending, reviewing
Advancing     → shortlisted, kept_on_file        ← soft yes; NEVER in "closed"
                (+ meeting requested, from interviews)
Signed        → accepted          (keep booked separate or label it "Booked")
Closed        → declined, passed, archived, withdrawn
```

The non-negotiable change: **move `kept_on_file` (and keep `shortlisted`) out of any bucket that reads as a rejection.**

### 2. Fix the talent-facing labels (label-ready strings)
| State | Replace | With |
|---|---|---|
| group header | "won" (`OverviewPage:444`) | "Signed" (or "Advancing" for the soft-yes group) |
| `kept_on_file` tone | `'closed'` | a new positive/neutral tone — surfaced under "Advancing," not "Closed" |
| `accepted` | "Accepted" | "Signed" / "Represented" where the outcome is representation |
| Overview strip | `active · won · closed` | `In review · Advancing · Signed · Closed` |

### 3. Optionally add the two missing states (migration)
- `requested_more` — agency asked for more digitals / in-person; copy: *"{Agency} asked for fresh digitals — update your book to keep moving."* (talent's-court signal)
- `development_offer` / new-face — distinct from full `accepted`/signed.

---

## Confidence

High on the canonical state names and on the `kept_on_file` mis-bucketing (universal industry norm — "kept on file" is a soft yes everywhere). High on "won" being wrong framing. Medium on whether to add `requested_more`/`development_offer` as persisted states vs. handle via the existing `interviews`/notes entities — that's an architecture call, and the weighting of "shortlist" vs "kept on file" varies by market and agency tier, so treat the grouping labels as directional.
