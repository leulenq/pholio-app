# Talent Experience Audit — Full Per-Surface Review
*2026-07-01 · Surfaces: Overview · The Book (Media) · Profile · Market (Applications + Apply) · Intel (Analytics) · /onboarding · Cross-cutting*

Grounded in: actual code on `wave2-field-split`, the in-house industry knowledge base, and external research (agency application standards, digitals requirements, NY child-performer law, agency-software talent portals — Syngency/Netwalk/Mediaslide — and talent marketplaces Swipecast/Ubooker). Grades: **P0** = trust/compliance break · **P1** = real workflow/product gap · **P2** = polish/realism.

---

## 0. Executive verdict

Pholio's talent experience is **far above the "modeling SaaS built by outsiders" baseline**. The application status machine (shortlisted → requested-more → go-see → development → signed, with kept-on-file), the digitals discipline (5-slot canonical set, dated sets, 3-month recency, unretouched enforcement), the mother/placement representation model, and the minor-gating layer on the dashboard are things most competitors get wrong or don't attempt. A working model or a booker skimming these surfaces would mostly believe them.

The two biggest problems are **structural, not cosmetic**:

1. **The minor-safety story contradicts itself.** The dashboard rigorously locks measurements and body imagery behind guardian consent — but `/onboarding` collects bust/waist/hips/weight from anyone 13+, and runs AI body-measurement estimation on their photo, *before any consent exists*. The good gating downstream is invalidated by the front door. (P0)
2. **The product ends at "Signed."** There is no post-representation layer at all — no availability/bookouts, no options, no jobs, no money. For a platform whose promise is a talent career surface, the journey currently terminates at its most valuable moment. Every comparable talent portal (Syngency Mobile, Netwalk, Ubooker) is centered on exactly that layer.

Plus one immediate revenue bug: **`?debug=pro` unlocks all Studio+ analytics in production code** (`AnalyticsView.jsx:510`).

---

## 1. OVERVIEW (`/dashboard/talent` → `OverviewPage/index.jsx`)

**Verdict:** The live page is honest, well-gated, and industry-literate. Its biggest risks are a dead legacy twin full of fabricated numbers, one wrong artifact metaphor in the hero copy, and a mild tendency to hide bad news.

### Industry alignment
- ✅ "Submission Readiness" framing, submission KPIs (In review / Advancing / Signed), digitals-staleness capping readiness at 98% (`index.jsx:209-211`), and the guardian-consent CTA are all correct instincts.
- **P1 — Comp card ≠ polaroids.** Hero copy: *"professional specs composed with your latest polaroids"* (`index.jsx:574-576`). A comp card is composed from the **book** (best work); **polaroids/digitals** are the raw assessment set. This copy coaches talent to put digitals on a comp card — the exact confusion the media page carefully teaches against. Fix the sentence: "…composed from your book and current stats."
- **P1 — The journey has no "after."** KPIs end at "Signed." A signed model's Overview should pivot: representation summary, availability, next go-see. Today the page has nothing to say to your most successful users (see cross-cutting §7).

### Product / UX
- ✅ Contextual CTA laddering is genuinely good product design: `Record guardian consent` → `Reshoot your digitals` → `Continue Audit` → `View Profile` (`index.jsx:213-224`).
- **P1 — Negative deltas are suppressed.** `viewsDelta > 0 && …` (`index.jsx:464-469`) means a decline in views is silently hidden. Same pattern in legacy OverviewView. That's analytics spin; a professional tool shows the down weeks. Show signed deltas.
- **P2 —** "Interviews need your response" is the right ball-in-your-court signal; consider elevating it above the fold when non-zero — it's the single most actionable item on the page.

### Functional completeness / data
- **P1 — Dead legacy code with fabricated stats.** `OverviewView.jsx` + `DashboardPage/` are unrouted but still in-tree, containing hardcoded **"Top 12% in Editorial"**, a hardcoded **"Actively Seeking Work"** status pill, a comp-card button labeled **"Ready"** whose click says *"not available yet"*, and "Identity Node · PH-XXX" jargon. If ever resurrected, these are instant trust-killers. Delete both files.
- **P2 —** `PUBLIC_PORTFOLIO_ORIGIN = 'https://pholio.studio'` hardcoded (`index.jsx:57`) — wrong link in dev/staging; derive from env/config.

### Legal / privacy
- ✅ Minor gating (`isMinorProfile` / `minorSensitiveFieldsUnlocked`) hides the public website block and comp-card export for unconsented minors. Correct.

---

## 2. THE BOOK / MEDIA (`/dashboard/talent/media` → `MediaWorkspace.jsx`)

**Verdict:** The strongest surface in the product. A booker would recognize this taxonomy instantly. Remaining issues are capacity and small terminology choices, not structure.

### Industry alignment
- ✅ Section taxonomy is exactly right: **Digitals / The Book / Tests / Campaigns / Tearsheets / Motion** with correct blurbs ("Raw, dated agency reference — kept distinct from the book") (`MediaWorkspace.jsx:46-60`).
- ✅ The 5-slot digitals set (headshot / ¾ / full-length / profile / back) matches the canonical set agencies request; dated sets with a 3-month recency window and "reshoot to stay current" nudges are the real standard.
- ✅ Upload date prompt ("agencies read digitals by when they were taken, not when they were uploaded", `MediaWorkspace.jsx:380-383`) — this is the kind of detail that makes the platform read as insider-built.
- ✅ Send-readiness enforces **unretouched digitals** (`send-readiness.js:90-92`) — directly prevents the #1 rejection-coaching failure.
- ✅ Frame credits: photographer / MUA / hair / stylist / publication / issue, plus a rights ladder (pending → cleared → licensed → restricted → blocked) in `FrameEditor.jsx:149-160,41-48`. Tearsheets with credits and usage-rights states is agency-grade thinking.
- **P2 —** "Frames" as the universal noun is a Pholio-ism (industry says "images"/"pictures" in a book). It's consistent and defensible as brand voice; just never let it leak into agency-facing exports.

### Product / UX
- ✅ AI classification with human override, "Digitals read" panel, minor body-imagery suppression (`DigitalsBookPanel.jsx:23-38`), timeout fallback to manual read — resilient loop.
- **P1 — 5 MB per file is too small.** Professional test frames, tearsheet scans, and campaign files routinely run 8–25 MB. You process with Sharp anyway; accept ≥20 MB and downscale server-side (`MAX_FILE_BYTES`, `MediaWorkspace.jsx:41`). Rejecting a photographer's delivery file is a bad first impression for exactly your best-equipped users.
- **P1 — No bulk operations.** No multi-select for delete/reclassify/move-to-set. Anyone migrating an existing book (30–80 images) does everything one frame at a time.
- **P2 —** Motion is URL-only (no upload). Fine for now; the modal copy is honest about it.

### Data / backend
- ✅ `captured_at` never silently defaults to now; classification state is stored with source/confidence bands.
- **P2 —** Poll loop invalidates the whole `auth-user` query every 2s during classification (`MediaWorkspace.jsx:534-561`) — refetches the entire profile+images payload repeatedly; a narrower query would be cheaper.

### Legal / privacy
- ✅ Per-frame visibility (`exclude_from_public` / `exclude_from_agency` / private) and archive states exist; minors' body frames held pre-consent.

---

## 3. PROFILE (`/dashboard/talent/profile` → `ProfilePage/`, `profileSchema.ts`)

**Verdict:** The data model is unusually credible — gendered stats tracks, dual-unit, mother/placement representation, consent fields, and a job-scoped safety section. But it ships with one visible form bug, one silent data-corruption path (shoe sizes), and a two-column measurement split that will bite.

### Industry alignment
- ✅ IA is right: Personal Details / Discipline & Focus / Stats & Measurements / Credits & Experience / Training & Skills / Representation / Socials & Media / Private & Compliance / On-set Safety (`ProfileNav.jsx:5-14`).
- ✅ **Representation is the standout**: `representations[]` with `relationship_type: mother | placement`, market required for placements, exclusivity flag, one-active-mother-agency rule (`profileSchema.ts:127-161`). This models the actual multi-agency, mother-agent world — almost no competitor does.
- ✅ Stats track (Womenswear/Menswear/Ungendered) switches Bust↔Chest and Dress↔Suit; shoe conversions across US/UK/EU; metric/imperial toggle.
- **P2 — Weight is not a fashion stat.** Fashion/editorial boards do not list weight, and comp cards never show it; it's relevant mainly to fitness and some commercial/talent work. Collecting it universally (and estimating it — see §6) is both off-standard and a body-image liability. Make it division-scoped or drop it.
- **P2 —** `body_type: 'Plus-size'` → the board is called **Curve** in trade language.

### Bugs / UX
- **P1 — Hair Color rendered twice.** `MeasurementsSection.jsx` renders a `hair_color` select at 318-336 *and again* at 354-371 (paired with hair length). Two synced dropdowns for the same field on one screen. Remove the first pair's duplicate.
- **P1 — Shoe size region is not persisted.** `shoeRegion` is component state defaulting to `'US'` (`ProfilePage/index.jsx:287`); no `shoe_region` column anywhere. A German user entering **EU 42** stores bare `42`, which every reader (comp card, submissions, discover search) will interpret as US 42. This is silent data corruption on a casting-critical field. Persist region, or canonicalize to one region on write.
- **P2 —** Measuring-tape widgets are charming and on-brand, but for a known value (a model reading numbers off their agency chart) direct numeric entry should be the primary affordance, tape the secondary.

### Data / backend
- **P1 — Split-brain measurement columns.** Onboarding writes `bust_cm/waist_cm/hips_cm` (`casting.js:1103-1111`); the profile form writes `bust/waist/hips` (as cm values) — and `profileSchema.ts:78-83` carries `bust`, `bust_cm`, *and* `chest_cm`. Whether a reader sees the onboarding value or the profile value depends on which column it prefers. Unify to one canonical set with a migration before more surfaces read them.
- ✅ `measurements_updated_at` exists and the apply flow displays it — measurements are dated, which most platforms miss. (No history/versioning yet — P2, fine.)
- ✅ Field-split architecture is genuinely thoughtful: `comfort_levels` → private verified-adult `adult_context`; emergency contact / work eligibility → `confirmed_job_safety`, collected only when a job is confirmed (`completeness.js:7-14`). This is the correct data-minimization posture and worth preserving hard.

### Legal / privacy
- ✅ Guardian consent + work-permit-on-file fields; measurements locked for unconsented minors with clear copy (`MeasurementsSection.jsx:27-45`).
- **Verify:** `onlyfans_url` must never render for minor profiles or into agency DTOs for minors — the adult_context split suggests it's handled, but this deserves an explicit test given the stakes.

---

## 4. MARKET — Applications + Apply flow (`ApplicationsView.jsx`, `ApplyExperience.jsx`, `applicationStatus.js`, `src/domains/talent/routes/applications.js`)

**Verdict:** The most industry-credible submission flow I've seen in this category — the status vocabulary, the package structure, and the withdraw semantics are all real. The gaps are in *discovery* (thin, unfiltered) and one strategic-ethics landmine around paid submission quotas.

### Industry alignment
- ✅ The status machine is the crown jewel: `shortlisted`, `requested_more`, `meeting_requested` → **"Go-See Requested"**, `development` → **"New Face"**, humane non-terminal declines ("Keep your book current for future outreach"), and the enforced rule that kept-on-file/shortlisted count as *advancing*, never *closed* (`applicationStatus.js` header comment). This mirrors the real inbound lifecycle almost state-for-state.
- ✅ The apply package is a real **submission**, not a job application: Digitals → Stats ("exactly as the agency reads them", dual-unit, gendered ordering) → Book ("supporting your digitals, never replacing them") → Comp card → Message → Review (`ApplyExperience.jsx:101-131`). The copy repeatedly teaches the digitals/book distinction. Excellent.
- **P2 —** Internal status value `booked` for "Represented" is a terminology landmine — in trade language *booked* means a job booking, not signing. The label is right; consider renaming the enum before more code depends on it.
- **P2 —** "The Market." as the surface title: in the trade, a *market* is a city you work (NYC, Paris). Using it for "agencies you can apply to" is a stretch a booker would notice but forgive; the per-application fact row labeled `Market: <location>` is correct usage.

### Product / UX
- ✅ Withdraw dialog states real consequences: revoke access, redact package, delete thread, "copies already downloaded cannot be recalled" (`ApplicationsView.jsx:558-567`). Honest and legally literate.
- ✅ Staleness cue at 21 days with no fake auto-expiry (`ApplicationsView.jsx:582-584`); drafts with lifecycle/recovery; per-agency consent binding that invalidates when the package changes (`ApplyExperience.jsx:720-736`) — that last one is genuinely sophisticated consent engineering.
- **P1 — Discovery is an afterthought.** Six cards, no search, no filters by market/board/division, no agency detail page, no published submission requirements (age range, height gates, boards sought). Real talent research agencies before submitting; every agency site publishes "Become a model" criteria. This is the surface's biggest functional gap and a straightforward build: filters + an agency profile view + structured "what this agency wants" data.
- **P1 — The paid submission quota needs care.** Free = 5/month, Studio+ = unlimited (enforced server-side, `applications.js:610,778`). In this industry, *"pay to be considered by agencies"* is the classic scam-adjacent pattern every legitimate agency warns against. A quota is defensible as anti-spam; the framing is everything. Never market Studio+ as "apply to more agencies"; frame the limit as submission quality control, keep the counter low-key, and consider whether unlimited-for-everyone with per-agency cooldowns achieves the same anti-spam goal without the optics risk.

### UI
- ✅ The editorial-ledger system (`.app-*`) with numbered entries suits the content; toggle-group filters map 1:1 to standing groups.

### Data / backend
- ✅ Send-readiness gates on contact info, digitals recency, and unretouched digitals before any submission is possible — the platform refuses to let talent submit a package that would get them auto-rejected. That's product-as-coaching done right.

---

## 5. INTEL — Analytics (`/dashboard/talent/analytics` → `AnalyticsView.jsx`)

**Verdict:** The weakest surface relative to its ambition. It's a competent generic web-analytics dashboard wearing a talent product's clothes — cohort retention and scroll events answer questions no model is asking, one copy line overclaims what the data knows, and a debug flag gives away the paywall.

### P0
- **Paywall bypass in production:** `isPro = subscription?.isPro || new URLSearchParams(window.location.search).get('debug') === 'pro'` (`AnalyticsView.jsx:510-511`). Anyone who appends `?debug=pro` gets all Studio+ analytics free. Remove or gate behind `import.meta.env.DEV`.

### Industry alignment / trust
- **P1 — Overclaiming agency behavior.** "Strong retention — **agencies are coming back** to review your profile" (`AnalyticsView.jsx:315-317`) asserts viewer identity the data doesn't have; visitors are anonymous. Say "visitors." Trust in numbers is this page's entire value; one inflated sentence taxes all of it.
- **P1 — Wrong questions.** Cohort W1 retention, "Best Cohort Week," raw "Scroll Events" are SaaS-growth metrics. What talent actually want to know: *Which agencies looked? What did they open (digitals vs book vs comp card)? What happened after?* You already have the data spine for the real version: comp-card downloads by theme exist; application standing exists; agency sessions are authenticated on the agency side. "Agency X viewed your submission 3 times this week" is worth more than every cohort heatmap combined (and is standard in agency software talent portals).

### Bugs
- **P1 — Status rendering ignores the canonical config.** `MarketChapter` maps only `PENDING/REVIEWING/ACCEPTED/DECLINED` (`AnalyticsView.jsx:32-40`); any real status like `meeting_requested` renders as raw `MEETING_REQUESTED` in a pill. Use `statusConfig()` from `applicationStatus.js` — it exists precisely to be the single source of truth. (Also: these are status pills — check against banned-pattern #4 while you're in there.)

### Product
- ✅ Free/Pro laddering (7d free; 30/90d, sources, sessions, cohorts paid) is a coherent upsell structure; the ghost-grid locked state is a nice tease.
- **P2 —** The Market chapter duplicates the Applications page at lower fidelity. Replace it with what Applications *can't* show: conversion (submissions → shortlist rate vs. platform norm), response-time distributions.

---

## 6. /ONBOARDING — Casting flow (`client/src/domains/onboarding/`, `src/domains/onboarding/routes/casting.js`)

**Verdict:** The cinematic scout flow is a real differentiator and the server-authoritative state machine (`entry → gender → birthdate → scout → measurements → profile → done`) is solid engineering. But this surface holds the platform's most serious compliance failure, and its AI-measurement conceit needs honest reframing even for adults.

### P0 — Minors' body data is collected before any consent exists
The platform's own downstream policy (dashboard locks, `talent-age.js` sensitive-field list, apply-flow guardian verification) says: *guardian consent before measurements or body imagery.* Onboarding violates it:
- `POST /onboarding/measurements` accepts and stores `bust_cm/waist_cm/hips_cm/weight_kg` for **any user 13+** with no minor branch (`casting.js:1052-1127`). The comment at 1076-1077 explicitly removed range validation *"to allow outlier inputs (e.g., child models)"* — child models are contemplated, unconsented collection is not prevented.
- The scout step runs `masterVisionAnalysis` — a Groq prompt that returns `weight_kg`, build type, and measurement estimates **from the user's photo** (`analyzeProfileImage.js:47-70`) — for all ages, and stores predictions to the profile (`casting.js:900-920`). AI-inferring a 14-year-old's body measurements from a photograph, pre-consent, is exactly the kind of processing NY's Child Data Protection Act (effective June 2025) and GDPR treat as high-risk. COPPA's 13+ floor in `CastingBirthdate.jsx` is necessary but nowhere near sufficient — NYCDPA requires informed consent for 13–17 processing.
- `console.log("[Casting Measurements] Request Body:", req.body)` (`casting.js:1072`) writes minors' body measurements into server logs. Remove; logs are the least-governed data store you have.

**Fix shape:** birthdate is already collected *before* scout — the age is known in time. Branch there: minors skip AI body estimation and the measurements step entirely, land in the dashboard's existing guardian-consent path, and measurements unlock afterward (the lock UI already exists). This is mostly wiring, not new construction.

### Industry alignment
- **P1 — AI-estimated measurements coach wrong data.** Even for adults: agencies work from tape-measured stats; a wrong AI guess a user rubber-stamps becomes a miscast at a fitting — the most expensive kind of error, and it's the platform's credibility on the line. The confirm/adjust step exists, but AI numbers pre-filled (and seeded defaults `175/68/86/66/91`, `CastingMeasurements.jsx:38-42`) anchor users into confirming fiction. Frame estimates explicitly as placeholders ("Estimated from your photo — confirm with a tape measure before submitting anywhere"), require a deliberate confirmation per field, and never seed defaults that can be saved untouched.
- **P1 — Weight estimation from a photo** is additionally a body-image ethics problem (Model Alliance-adjacent territory). Fashion doesn't use weight (§3); estimating it visually and showing it to a possibly-teenaged user is all downside. Drop weight from the vision prompt.
- **P2 —** "Casting Call" as the onboarding brand: a casting call is a client casting for a job, not an agency signup. It's evocative and clearly deliberate; accept it as brand license, but expect industry users to notice.

### Product / UX
- ✅ Server-authoritative resume (`current_step` + `step_data`), legacy-state tolerance, out-of-sequence rejection — robust.
- ✅ The scout scan moment (brackets, scan line) is a strong differentiator and worth protecting through any compliance rework — gate the *data*, keep the *theater*.

---

## 7. CROSS-CUTTING & STRATEGY

### The structural gap: nothing exists after signing
Every surface quietly agrees the product ends at representation: Overview KPIs stop at "Signed," statusConfig's terminal happy state says "expect onboarding details **directly from the agency**," and there is no calendar, availability, options, bookouts, jobs, or money anywhere in the talent experience. In the real industry, signing is where the work *starts* — the operating loop is options/holds → bookings → fittings → vouchers → net pay at 60–90 days. Comparable talent portals (Syngency Mobile, Netwalk, Ubooker) center on: upcoming bookings, call times, bookouts, and money status. Pholio doesn't need the full agency-side booking engine to start; the wedge is talent-owned data:

1. **Availability & bookouts** (talent-declared unavailability) — useful pre-signing too: agencies reviewing a submission want to know the person is reachable and available. Small build, big credibility.
2. **A "My representation" home** once signed — you already store mother/placement/market/exclusivity; render it, with commission-split literacy content.
3. Later: options/holds calendar and an honest earnings view (gross → usage → commission → net → expected date). Never fake instant money.

### Feature suggestions (grounded, prioritized)
| # | Feature | Why it wins |
|---|---|---|
| 1 | **Guardian portal** for minors: consent management, visibility controls, NY permit + trust-account checklist | Turns the P0 into a moat — nobody in this category does minors well, and NYCDPA just raised the bar for everyone |
| 2 | **Agency discovery v2**: filters (market, board, height/age criteria), agency profile pages with published submission requirements | Directly fixes Market's thinnest area; structured criteria also power honest "fit" indicators |
| 3 | **Digitals refresh cadence**: 90-day reminder (push/email) with one-tap "start new dated set" | The recency engine already exists; this closes the loop and drives the platform's healthiest habit |
| 4 | **Comp card QR → scan analytics** | Ties Intel to the physical artifact's real-world life; a defensible, talent-relevant metric no generic analytics has |
| 5 | **Agency-viewed signals in Intel** (authenticated agency sessions → "Agency X opened your book") | Replaces cohort cosplay with the one number talent actually refresh the page for |
| 6 | **Open calls**: agencies post open-call events; talent see them in Market | "Open call" is the industry's front door and an obvious two-sided growth loop |

### Highest-leverage fixes (credibility per unit of work)
1. **Gate onboarding measurements + AI estimation by age** (P0 — the wiring mostly exists; branch at birthdate). Remove `req.body` logging.
2. **Remove the `?debug=pro` bypass** (P0 — one line).
3. **Fix the three small-but-visible defects**: duplicate Hair Color select, Intel's raw `MEETING_REQUESTED` labels, comp-card "polaroids" copy line.
4. **Persist shoe region + unify `bust`/`bust_cm`** before more readers depend on ambiguous columns.
5. **Delete `OverviewView.jsx` / `DashboardPage/`** so the fabricated-stats twin can never ship.

### Sources (external grounding)
- Digitals/application standards: [Brandon André — model digitals requirements](https://www.brandonandrephoto.com/blog/what-are-the-requirements-for-model-digitals), [CM Models — application](https://cmmodels.com/agency/application/), [Photogenics — how to apply](https://photogenicsmedia.com/how-to-apply-as-a-model-in-an-agency/), [Pixpa — applying to agencies](https://www.pixpa.com/blog/how-to-apply-for-modeling-agencies)
- Agency software talent portals: [Syngency](https://www.syngency.com/), [Mediaslide alternatives / feature set](https://sourceforge.net/software/product/Mediaslide/alternatives), [talent & model agency software comparison](https://sourceforge.net/software/talent-and-model-agency/)
- Talent marketplaces: [Swipecast](https://www.swipecast.com/), [UBOOKER — how it works for talent](https://u-booker.com/how-it-works-for-models)
- Minors: [NY child performer requirements — Minor Performer Alliance](https://www.minorperformeralliance.org/new-york), [FKKS — legal requirements for child models](https://fkks.com/news/legal-requirements-for-working-with-child-models), [NY Child Data Protection Act overview](https://securiti.ai/what-is-new-york-child-data-protection-act/), [Coogan law — Backstage](https://www.backstage.com/magazine/article/coogan-law-explained-child-actors-3978/), [BizParentz — NY laws](https://www.bizparentz.org/new-york-child-entertainment-laws/)
