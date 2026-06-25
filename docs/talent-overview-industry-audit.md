# Talent Overview Tab — Industry Audit

**Surface:** `client/src/domains/talent/pages/OverviewPage/index.jsx`
**Audience:** Talent (creation/pride mindset), with agency over-the-shoulder credibility
**Auditor:** The Booker (`/industry audit`)
**Date:** 2026-06-24

---

## Verdict

Visually it's a confident command center, but it audits as a *personal-analytics SaaS dashboard wearing modeling clothes*. It centers vanity metrics (global views, "Visibility Index," link clicks, bio reads), invents a metric that doesn't exist, and uses deal-CRM language ("won") for representation. The things that actually move a modeling career — current digitals, where each submission really stands, representation state, and the minor-consent branch — are absent or flattened. A working model would find it pretty but not *about their career*; a booker glancing over their shoulder would clock the tells.

---

## P0 — trust / compliance breaks

### Minors run on the identical adult path — no guardian-consent branch, no restricted visibility
Under-18 talent is the single biggest compliance liability in this business: guardian consent must precede *collection* of measurements/full-length imagery, and stats/full-length/swim images and contact must be visibility-restricted (`reference/lifecycle.md` §5).

Pholio's Overview prompts every user identically to complete `Measurements (Bust/Waist/Hips)` and `Full-Body Photo` (`profileReadinessItems.js`), pushes a public portfolio URL (`ov-website`, lines 524–569), and offers a comp-card export "for agency submission" carrying those stats (lines 488–519) — with no DOB gate anywhere on the surface. A 15-year-old lands here and is nudged to publish full-length measurements publicly.

**Fix:** Branch on age. If DOB < 18: gate measurement/full-length prompts behind recorded guardian consent, suppress the public website panel and any public comp-card with stats, and swap the readiness copy to the minors track (permit/guardian status as the *first* required items).

### "Visibility Index" is a fabricated metric — profile completeness relabeled
Line 464 renders `{readinessPct}%` under the label `Visibility Index` (line 463), inside "The Market." block alongside real view counts. So the same completeness number appears three times (hero "Readiness" 205, "The Audit" 323, "Visibility Index" 464) and the third instance is dressed up as audience reach. A metric that "looks useful but isn't operationally meaningful." A pro who notices visibility == completeness stops trusting every other number on the page.

**Fix:** Delete "Visibility Index." If you want a reach signal, derive it from actual exposure (views × sources × submissions seen), or don't show one. Never present completeness as visibility.

---

## P1 — real workflow / state gaps

### The page leads with vanity, not the operational funnel
"The Market." headlines *Global Views (30d)*, and the Studio+ block stacks site visits, comp downloads, link clicks, bio reads, sparkline (lines 593–632). Portfolio views are near-meaningless to getting signed or booked; what moves a career is the submission funnel: submitted → in review → kept on file/shortlist → meeting → signed. That funnel exists in the data but is reduced to one number ("Submissions", 209/433) plus a three-bucket strip.

**Fix:** Make the submission funnel the spine of the Overview; demote views to a secondary stat.

### "won / closed / active" is sales-CRM language for representation
`bucketCounts` (`applicationStatus.js:120`) maps outcomes to `active/won/closed` and the strip prints "**N** won" (line 444). You don't "win" a submission to an agency — outcomes are *kept on file / shortlisted / invited to meet / signed / declined* (`reference/lifecycle.md` §2). "Won pipeline" is an outsider tell.

**Fix:** Relabel to representation outcomes: *In review · Kept on file · Signed* (or similar).

### The soft-yes states are collapsed
`shortlisted` is bucketed under `pending`/active (`applicationStatus.js`), so the most career-relevant inbound signal — *an agency shortlisted you / kept you on file / wants to meet* — vanishes into a generic "active" count. "Kept on file" is the **most common real outcome of a submission** and it's invisible here.

**Fix:** Surface "Kept on file" and "Meeting requested" as their own line, the way `interviewsNeedingResponse` (127–129) already correctly surfaces the ball-in-your-court case.

### Digitals recency is never surfaced — and it's a hard industry rule
Digitals must be current (≤3 months) or an agency discounts them on sight (`reference/standards.md`, glossary "Digitals"). The Overview tracks completeness but has no staleness logic anywhere — a model with a great but 8-month-old book reads as 100% "ready."

**Fix:** Add a recency check; when digitals/cover are >3 months old, the readiness/next-step should say "reshoot your digitals," not show green.

### No representation state exists on the talent's own home screen
The Overview models a solo user with analytics, never *where they are in representation* — unrepresented / submitted / in conversation / new face / signed / on a board (`reference/lifecycle.md` §1). There's no mother-agency concept, no "you're being developed," no board. The single most important fact about a model's career has no place here.

**Fix:** Add a representation-status line as the first thing under the hero.

### Mislabeled section headings borrow loaded industry words
"The Audit." (line 319) frames submission-readiness in accountant/software language; "The Market." (line 384) means a *geographic market* (Paris/Tokyo/NYC) in this trade, not your analytics. Both read software-first.

**Fix:** "The Audit" → *Submission Readiness* / *Your Package*; "The Market" → *Your Reach* or *Activity*.

---

## P2 — realism / polish

- **"frames" for book images** (lines 227, 232, 294, "Manage Frames") is a Pholio coinage. The trade says *images/shots*; the curated whole is the *book*. "The Book." is correctly named — but its contents aren't "frames."
- **"Global Views"** (line 425) inflates ordinary profile views with a "Global" qualifier; just "Profile views."
- **Comp-card export is offered without verifying required digitals exist** (lines 488–519). Exporting a card missing a headshot/full-body or stats coaches the talent to submit an incomplete card. Gate export on the required set.
- **Apple Wallet pass on the comp card** (lines 511–517) is a gimmick with no industry meaning — agencies don't consume wallet passes. Harmless, but don't let it sit at the same visual weight as "Export."
- **"interview needs your response"** (455) is acceptable agency↔talent, but for an inbound agency meeting the precise term is *go-see / meeting*.

---

## Highest-leverage fixes (most credibility per unit of work)

1. **Add the minor branch** (DOB-gated consent + restricted visibility + minors readiness track) — the only P0 with legal exposure.
2. **Kill "Visibility Index," relabel "won," and re-spine the page around the submission funnel** with "Kept on file / Meeting" surfaced — three small copy/logic changes that flip the whole tab from vanity-dashboard to industry-real.
3. **Add digitals-recency (≤3 mo) into readiness and the next-step CTA** — replaces a generic "Continue Audit" with the one nudge every booker actually cares about.

---

## Confidence

High on terminology, the minors gap, and the vanity-vs-funnel framing (universal). Medium on exact relabels — "kept on file / shortlist" weighting varies by market and agency tier, so treat the specific labels as directional, not gospel.
