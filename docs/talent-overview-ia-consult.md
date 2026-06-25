# Talent Overview Tab — Industry Information-Architecture Consult

**Surface:** `client/src/domains/talent/pages/OverviewPage/index.jsx`
**Companion data:** `client/src/domains/talent/components/profileReadinessItems.js`, `client/src/domains/talent/utils/applicationStatus.js`
**Prior audit:** `docs/talent-overview-industry-audit.md`
**Auditor:** The Booker (`/industry consult`)
**Date:** 2026-06-24

---

## INDUSTRY CONSULT — Talent Overview ("home screen") information architecture

**Real frame.** The Overview is not a personal-analytics dashboard. It is a model's **call-sheet-for-their-own-career**: the screen a talent opens to answer one question — *"Where do I stand, and what do I do next to get represented / stay bookable?"* In the trade, that question is answered in a fixed order of importance: **(1) Who represents me right now? (2) What's happening with my live submissions? (3) Is my package current and submittable? (4) — distantly — who's looking at me?** The current build inverts this: it leads with vanity reach, invents a "Visibility Index," and demotes representation to nonexistent. The whole job of this consult is to re-spine the page onto the real order.

This is a **build answer**, not a critique pass — the audit already named the breaks. Below is the section order to ship, with industry-correct labels, the data each carries, and the single primary action per section.

---

## How the industry orders a model's "where do I stand" view

From `reference/lifecycle.md` §1 (representation), §2 (submission/inbound), and `reference/standards.md` §3 (materials) and §5 (operations), a model's own mental hierarchy is:

1. **Representation status** — am I unrepresented, submitted, in conversation, a new face in development, or signed (and to whom / which board / which markets)? This is the single most important fact about a career and it governs everything below it. (`lifecycle.md` §1.)
2. **Live submission funnel** — of the agencies I've submitted to, where does each stand, and is the ball in my court anywhere? The career-moving states are *in review → kept on file / shortlisted → meeting/go-see requested → development offer / signed → declined*. (`lifecycle.md` §2.)
3. **Package readiness + digitals recency** — is my submittable material complete **and current (≤3 months)**? A complete-but-stale book is a miscast waiting to happen. (`standards.md` §3 "Digitals", §4 recency rule.)
4. **Reach / analytics** — views, downloads, link clicks. Real but **last**; near-meaningless to getting signed or booked, useful only as a trailing vanity/marketing signal for Studio+ self-promoters.

The build must read top-to-bottom in this order. Everything else is detail.

---

## The credible section order to ship

### Section 0 — Hero (identity + standing snapshot)

**Keep, but re-load the three KPIs.** Today the hero (lines 198–211) shows *Profile Views · Readiness · Submissions*. Profile Views as the first thing a model sees is the core inversion.

- **Replace the hero KPI trio** with the three facts that actually describe standing:
  - **Representation** — plain text: `Unrepresented`, `Submitted`, `In conversation`, `New face`, or `Signed · [Agency]`. (Plain text only — no status badge; see Banned Patterns.)
  - **Live submissions** — count of submissions still in play (in review + kept on file + meeting), not lifetime total.
  - **Package** — `Ready` / `Update digitals` / `N to add` derived from required-set completeness **and** recency.
- **Industry-criticality: P0 of the layout.** Leading the hero with views is the "built by outsiders" tell. Confidence: **high** (universal across markets/tiers).

---

### Section 1 — Representation status (NEW — the first block under the hero)

This block does not exist today. It is the most important addition.

- **What it shows:** the talent's position on the representation lifecycle (`lifecycle.md` §1), with the correct branch:
  - **Unrepresented / New face seeking representation** → "You're not yet represented. Submit your digitals to agencies."
  - **Submitted, awaiting** → "Submitted to N agencies. M in review."
  - **In conversation / meeting stage** → surfaces the soft-yes.
  - **New face (in development)** → "In development with [Mother agency]" — the model is signed but not yet fully bookable.
  - **Signed / represented** → "Represented by [Mother agency]" plus **placed market agencies** if any (multi-market, non-exclusive). Show **board/division** (Women / Men / New Faces / Commercial / Curve…).
- **Correct terminology:** *mother agency*, *placed with [market] agency*, *new face*, *board / division*, *signed / represented* (glossary; `standards.md` §1–2). Never "your agency" (singular) — the data model must allow **one mother agency + N market agencies, non-exclusive** (`standards.md` §1: "software that assumes one talent ↔ one agency has already failed").
- **Primary action ("what do I do next"):**
  - Unrepresented → **Submit digitals to an agency** (open call / get scouted).
  - Signed → **View representation** (agencies, boards, markets) — read-only standing, not a CTA to churn.
- **Industry-criticality: P0.** Confidence: **high** that this belongs first; **medium** on how rich the multi-agency display is in v1 (mother-agency + board is the must-have; full market-stay tracking can defer).

---

### Section 2 — Live submission funnel ("Submissions" / "Your inbox with agencies")

Re-spine the page around this. Today it is one number (lines 209, 433) plus a three-bucket strip mislabeled with deal-CRM words.

- **What it shows:** each live submission and its real state, plus a clear **ball-in-your-court** line. Pull the funnel from `lifecycle.md` §2:
  - `In review` (the agency has your digitals + stats)
  - `Kept on file` — **surface this as its own line.** It is the **most common real outcome of a submission** and today it's bucketed invisibly into `closed` (`applicationStatus.js:98`, `bucketCounts` line 120). It is a soft *yes-for-later*, not a close.
  - `Shortlisted` — today bucketed into `pending`/active (`applicationStatus.js:34`), so the strongest inbound signal disappears. Give it its own line.
  - `Meeting / go-see requested` — the ball-in-your-court case. The code already does this correctly for interviews (`interviewsNeedingResponse`, index.jsx lines 127–129, 451–459) — extend the same prominence to the whole soft-yes tier.
  - `Signed` / `Development offer` — positive terminal.
  - `Declined` — humane, non-terminal ("keep your book current; reapply").
- **Replace the labels.** `bucketCounts` → `{ active, won, closed }` and the strip "**N** won" (index.jsx line 444) is sales language. **You do not "win" a submission to an agency.** Relabel to representation outcomes:
  - `In review · Kept on file · Meeting · Signed` (drop "won"/"closed" entirely).
- **Primary action:** whatever has the ball in the talent's court — **Respond to meeting request** > **Send requested digitals** > else **Submit to another agency**.
- **Industry-criticality: P0/P1.** "Won" on a representation surface is a top-tier outsider tell. Confidence: **high** on killing "won/closed"; **medium** on exact label weighting — kept-on-file vs. shortlist prominence varies by market/tier, so treat specific labels as directional.

---

### Section 3 — Package readiness + digitals recency ("Your Package" / "Submission Readiness")

Keep the readiness mechanic; fix the framing and add the missing recency rule.

- **Rename the heading.** "The Audit." (index.jsx line 319) is accountant/software language. Use **Submission Readiness** or **Your Package** — what a booker calls the submittable set.
- **What it shows:** the missing required items (already good content in `profileReadinessItems.js` — `REQUIRED_READINESS_ITEMS` correctly names Height, Measurements, Headshot, Full-Body) **plus a recency state the build lacks entirely.**
- **Add digitals recency (the hard rule the build is missing).** Digitals must be **current (≤3 months)** or an agency discounts them on sight (`standards.md` §3 "Digitals" rules, §4 "perishable / ≤3 months / dated"). Today a model with a great but 8-month-old book reads as `100% ready`. Add staleness logic: when the cover/digitals set is >3 months old, readiness must say **"Reshoot your digitals"** — not show complete. Treat measurements the same way (`standards.md` §4: "versioned with a date… re-confirmed").
- **Correct terminology:** *digitals / polaroids* (raw, dated, ≤3mo) are a **different object** from the *book / portfolio* (curated best work). The readiness copy in `profileReadinessItems.js` already respects this (headshot/full-body/profile/back = digitals; editorial/lifestyle = book). Preserve that separation; do not let the comp-card flow invite retouched book shots as digitals (`standards.md` §3 "critical product rule").
- **Primary action:** **Continue / complete package** (deep-links already exist via `READINESS_KEY_TO_PROFILE_URL`), or when stale, **Update digitals**.
- **Industry-criticality: P1.** Recency is the single nudge every booker actually cares about. Confidence: **high** on the ≤3-month rule (universal); the exact threshold can be market-tuned.

---

### Section 4 — The Book (portfolio preview)

Keep, demoted below readiness — it's pride/identity, not standing.

- **Fix one vocabulary tell:** the page calls images **"frames"** ("Manage Frames," `{count} frames`, index.jsx lines 227–232, 294). "Frame" is a Pholio coinage. The trade says **images / shots**; the curated whole is the **book** (glossary). "The Book." heading is correct — its contents are *images*, not "frames."
- **Primary action:** **Manage book** (→ media).
- **Industry-criticality: P2.** Confidence: high.

---

### Section 5 — Comp card artifact

Keep, but gate it.

- **Gate export on the required digitals set.** Today export is offered unconditionally (index.jsx lines 488–519). A comp card missing a headshot/full-body or stats coaches the talent to submit an incomplete card. Only enable **Export** when the required set (`REQUIRED_READINESS_ITEMS`) is satisfied and current; otherwise the CTA is **Complete your card**.
- **Terminology is already correct** — *comp card*, *polaroids* (lines 499–504). Keep it.
- **De-weight the Apple Wallet pass** (lines 511–517): agencies do not consume wallet passes; it must not sit at equal visual weight to Export.
- **Industry-criticality: P2.** Confidence: high.

---

### Section 6 — Reach / analytics (DEMOTE to the bottom; rename)

This is where the current build *starts*; it should *end*.

- **Rename "The Market."** (index.jsx line 384). In this trade a **market** is a *geographic placement market* (Paris / Tokyo / NYC stay) — `standards.md` §1. Using it for analytics is a domain-word collision. Use **Your Reach** or **Activity**.
- **Delete "Visibility Index"** (index.jsx lines 463–464). It renders `readinessPct` — profile completeness — relabeled as audience reach. Completeness already appears in the hero (line 205) and in readiness (line 323); the third instance dressed as "reach" is a fabricated metric. Remove it. If a reach signal is wanted, derive it from **actual exposure** (views × sources × submissions seen), never from completeness.
- **Rename "Global Views"** (line 425) → **Profile views**. "Global" inflates ordinary views.
- **What it shows (Studio+ only, as today):** profile views, comp downloads, link clicks, bio reads, sparkline (lines 593–632) — fine as a *trailing self-promotion* panel for talent running their own marketing, explicitly last.
- **Primary action:** **Full analytics** (→ analytics). No career action lives here.
- **Industry-criticality: P1 (placement) + P0 (delete the fake metric).** Confidence: high.

---

## Edge cases that change the layout

| Edge case | Why it matters | How the IA must branch |
|---|---|---|
| **Unrepresented (new, seeking)** | The default state for most users; no representation block content, funnel may be empty. | Section 1 becomes a **"get represented"** prompt; Section 2 leads with **Submit to an agency**; zero-state copy throughout (see below). |
| **New face (in development)** | Signed but **not yet bookable** (`lifecycle.md` §1). Different from "represented and working." | Section 1 shows **"In development with [mother agency]"**; readiness emphasizes building the book/tests; do not imply bookable. |
| **Signed / multi-market** | A model has **one mother agency + N market agencies, non-exclusively** (`standards.md` §1). | Section 1 lists mother agency **primary** + placed market agencies + board(s); never render a single "your agency." Market-stay tracking can defer to v2. |
| **Minor (under 18)** | **P0 compliance.** Guardian consent must precede *collection* of measurements/full-length imagery; stats, full-length/swim images, and contact must be visibility-restricted (`lifecycle.md` §5, `standards.md` §7). Today every user is prompted identically for `Measurements (Bust/Waist/Hips)` and `Full-Body Photo` (`profileReadinessItems.js`) and pushed a public portfolio URL (index.jsx lines 524–569) with **no DOB gate**. | **Branch the entire surface on age.** If DOB < 18: (a) the readiness track's first required items become **guardian consent** and **work permit on record**, not measurements; (b) gate measurement/full-length prompts behind recorded guardian consent; (c) **suppress the public website panel** and any public comp card carrying stats; (d) swap copy to the minors track. This is the only item with legal exposure — build it first. |
| **Stale digitals** | ≤3-month rule (`standards.md` §3–4). A complete-but-old book reads as 100% ready today. | Section 3 shows **"Reshoot your digitals"** when cover/digitals/measurements exceed the recency window, overriding a green "ready" state. |
| **Zero-state (brand-new, empty book)** | First impression for every new signup. | Each section shows its **start action**, not an empty metric: Representation → "Submit your digitals"; Submissions → "No submissions yet — find an agency"; Package → the checklist as the hero; Reach → hidden until there's data (no "0 views" vanity). |

---

## What to DEMOTE or remove vs. the current build (cited)

| Action | Current build (file · string/line) | Replace with |
|---|---|---|
| **DELETE fabricated metric** | `ov-visibility-label` "Visibility Index" rendering `readinessPct` — index.jsx lines 463–464 | Remove; if reach wanted, derive from real exposure |
| **RELABEL deal-CRM language** | `bucketCounts` → `{ active, won, closed }` (`applicationStatus.js:120`); "**N** won" strip (index.jsx line 444) | `In review · Kept on file · Meeting · Signed` representation outcomes |
| **SURFACE the soft-yes** | `shortlisted` bucketed into `pending` (`applicationStatus.js:34`); `kept_on_file` bucketed into `closed` (`applicationStatus.js:98`) | Own lines for **Kept on file** and **Shortlisted/Meeting** |
| **DEMOTE reach to bottom** | "The Market." leads with *Global Views (30d)* (index.jsx lines 384, 425) | Move analytics last; lead with representation + funnel |
| **RENAME software-first headings** | "The Audit." (line 319); "The Market." (line 384) | **Submission Readiness / Your Package**; **Your Reach / Activity** |
| **RENAME inflated label** | "Global Views" (line 425) | **Profile views** |
| **ADD missing recency** | No staleness logic anywhere; `readinessPct` ignores age | ≤3-month digitals/measurements recency → "Reshoot your digitals" |
| **ADD representation block** | No representation state on the surface at all | New Section 1 (mother agency / new face / signed / board / markets) |
| **ADD minor branch** | No DOB gate; identical prompts for all (`profileReadinessItems.js`; index.jsx 488–569) | Age-branched consent gate + restricted visibility |
| **FIX vocabulary** | "frames" / "Manage Frames" (index.jsx lines 227–232, 294) | **images / shots**; keep "The Book." |
| **GATE export** | Comp-card export unconditional (index.jsx lines 488–519) | Enable only when required set complete + current |
| **DE-WEIGHT gimmick** | Apple Wallet pass at equal weight to Export (lines 511–517) | Secondary; not equal visual weight |

---

## Banned-pattern compliance (CLAUDE.md)

This IA introduces **no** banned patterns:
- **Representation status is plain text** ("Signed · [Agency]", "New face"), not a `TalentStatusBadge` or colored green/yellow/red status pill (banned #4). A non-badge stripe/dot tied to a stripe is acceptable, a badge is not.
- **Submission funnel states are plain inline text**, not corner chips or `MatchScore`-style badges (banned #7), and **not count bubbles** on nav/cards (banned #9).
- **No eyebrows/kickers** above any of the renamed headings (banned #1–3) — heading alone.
- **No glass / `backdrop-filter` cards** for any new block (banned #8).
- **No "New / Signed / Verified" tier badges** (banned #5) — representation tier is rendered as text, not a chip.

---

## Get-right-now vs. safe-to-defer

**Must be real in v1:**
- The **section order itself** (representation → funnel → readiness/recency → reach last) — this is the entire credibility flip.
- **Representation status block** with mother-agency + board (even if minimal).
- **Kill "Visibility Index," relabel "won/closed,"** surface **kept on file / meeting**.
- **Digitals ≤3-month recency** in readiness + the next-step CTA.
- **Minor branch** (DOB-gated consent + restricted visibility + minors readiness track) — the only item with legal exposure.

**Safe to simplify / defer:**
- Full **multi-market placement / stays** tracking (mother + board is enough for v1; market-stay detail later).
- **Derived reach metric** (just remove the fake one; a real reach score can come later).
- **Apple Wallet** de-weighting (cosmetic).
- Rich **funnel timeline** per submission (a per-state count + ball-in-court line is enough for v1).

---

## Confidence

**High:** the section *order* (representation → funnel → readiness → reach), killing "Visibility Index," removing "won/closed," surfacing kept-on-file, the ≤3-month digitals rule, the minor branch, and all vocabulary corrections — these are universal across markets, tiers, and divisions.

**Medium:** exact label weighting in the funnel (kept-on-file vs. shortlist prominence varies by market and agency tier) and how rich the multi-agency representation display should be in v1 — treat specific strings as directional, not gospel.
