# Pholio Product Plan — August 2026

**Status:** Working plan. Supersedes feature-level guidance in prior audits.
**Model:** Free for vetted agencies. Agencies distribute their own open-call links.
Talent apply through those links, get immediate value, and keep a reusable profile.
Optional Studio+ sells tools the talent owns — never access, placement, speed, or odds.

**Companion documents**
- [`audits/2026-08-08-pholio-strategic-decision.md`](audits/2026-08-08-pholio-strategic-decision.md) — market ceiling analysis
- [`audits/2026-08-07-pholio-market-position-pressure-test.md`](audits/2026-08-07-pholio-market-position-pressure-test.md) — competitor research (wedge section superseded)

This document has two parts. **Part A** is the feature plan across both domains and the
compliance work that must precede it. **Part B** is the market-research-derived product
opportunity: the digitals layer, which is the wedge Part A's foundations enable.

---

# PART A — Domain Feature Plan

## A0. The organizing principle

Every feature must pass one test: **does it create recurring value on both sides at
once?**

Most features fail in one direction. Response tracking: talent care, agencies don't.
Measurement structure: agencies care, talent don't. Digitals freshness is genuinely
two-sided — which is why it becomes the spine of the product in Part B.

## A1. Compliance invariants

These are product law. Every feature is tested against them.

1. **Every vetted agency is visible to every user**, paid or not.
2. **No payment changes reach, ranking, agency-visible presentation, review speed, or
   selection odds.**
3. **The open-call path is free and unlimited, always.**
4. **One honest rationale for any limit.** A limit is either anti-spam (and unliftable)
   or a commercial lever (and must not be described as quality protection).
5. **No inference of protected traits or "potential" from images.** Technical
   assessment only.
6. **Consent is per-recipient and purpose-specific**, and the talent can see exactly
   what was sent.
7. **Agency-side talent discovery must never rank or surface Studio+ talent
   preferentially.**

### The rule that resolves every current violation

> **Anything an agency sees is identical for every talent. Payment may only change what
> the talent keeps for themselves.**

**Legitimate Studio+:** custom domain, print-ready 300dpi exports, storage and image
count, multiple card designs, book version history, market-specific packs, the talent's
own portfolio analytics.

**Never Studio+:** watermark removal, QR code, agency logo, hyperlinked socials,
advanced stats, discovery visibility, application volume, review speed, ranking.

## A2. Compliance fixes — do these first

Found by direct code inspection. Each violates an invariant above.

| # | Issue | Location | Fix |
|---|---|---|---|
| 1 | Free users see only the first 20 agencies, alphabetically. Studio+ sees all | `src/domains/talent/routes/agencies.js:76` — `isPro ? normalizedAgencies : normalizedAgencies.slice(0, 20)` | Delete the slice. Show every vetted agency to everyone |
| 2 | Free comp cards carry a watermark — visible to the reviewing agency | `compcard.ejs:797`, `compcard-standard.ejs:416,498` | Remove the watermark for all users |
| 3 | Watermark text reads **"ZipSite"** — wrong product name shipping into agency inboxes | `compcard.ejs:798` | Removed by fix 2 |
| 4 | QR code is Studio+ only | `compcard.ejs:787` | Give to everyone |
| 5 | Agency logo is Studio+ only | `compcard.ejs:802` | Give to everyone |
| 6 | Social links hyperlinked only for Studio+; free users get plain text | `compcard.ejs:698–714` | Give to everyone |
| 7 | "Advanced" stats styling is Studio+ only | `compcard.ejs:518–568` | Give to everyone |
| 8 | Social URL generation degrades for free users | `src/shared/lib/social-helpers.js:131` | Generate canonical URLs for everyone |
| 9 | Different public portfolio layout for paid users | `src/routes/portfolio.js:478` | Acceptable only while portfolios are talent-owned artifacts. If portfolio links are ever surfaced to agencies, unify |
| 10 | Open-call submissions capped at 3/month | `src/shared/lib/submission-program-content.js:22`, `open-call-claims.js` | Remove the cap entirely. It breaks the core distribution promise |
| 11 | Quota rationale contradicts itself — claims inbox quality, then sells removal | `submission-program-content.js:22` | Rewrite to one honest sentence |

### The discovery quota — REQUIRED change, not optional

Current: 5 discovery submissions/month free; Studio+ unlimited
(`application-quota.js:49`, `unlimited = Boolean(profile?.is_pro)`).

**This is a statutory tripwire, not just a perception risk.** California's Krekorian
Talent Scam Prevention Act defines a regulated "talent listing service" to include
anyone who, **for a fee**, provides *"storage or maintenance for distribution or
disclosure to a person represented as offering an audition or employment opportunity…
of the artist's name, photograph, website, videotape, résumé, portfolio, or other
promotional material"* (Cal. Labor Code §1701). Paying Pholio so that more agencies
receive your submissions maps onto that language almost word for word.

Triggering it means: **$50,000 surety bond** filed before operating, mandatory contract
disclosures, a **10-business-day cancellation right with full refund**, and
recordkeeping obligations (Lab. Code §1703 et seq.).

**Required fix:** make the discovery cap a flat anti-spam limit that **no tier lifts**,
and move Studio+ entirely onto talent-owned artifacts that never touch the submission
pipeline. Remove `unlimited = Boolean(profile?.is_pro)`.

Massachusetts separately prohibits charging a fee merely to be *listed* with an agency
(454 CMR 24), which is a narrower but directly on-point analog.

**Also required:** audit every remaining `is_pro` branch against invariant 2. The ones
above were found in fifteen minutes; assume there are more.

## A3. Talent domain

### Add

| Feature | Rationale |
|---|---|
| **Digitals freshness engine** | Capture-dated sets with states: current / aging / stale / undated. Never label undated "current." The retention spine |
| **Guided refresh flow** | When a set ages out, walk through which shots to retake with framing and lighting guidance. A service, not a nag |
| **Change-triggered invalidation** ⚠️ | **Revised for BIPA — see C3.** Must NOT work by comparing faces across photo sets. Implement as talent self-declaration ("my look changed") plus non-biometric signals (new capture date, hair-colour tag, declared measurement change). Face-geometry comparison across images is the single highest-risk feature in this plan |
| **Comp card import with vision extraction** ⚠️ | Upload an existing agency card → extract name, measurements, agency, shot types → pre-fill the structured profile. Biggest completion-rate lever available. **Must extract text and layout only — no face template generation or storage** |
| **Technical image QA** ⚠️ | Objective only: exposure, focus, framing, background, resolution, shot-type verification. **Must classify the photo, never the face** — no persisted embeddings, no cross-image identity linking (see C3) |
| **"Where this appears" preview** | One screen showing what a public visitor, a discovery agency, and a submitted-to agency each see |
| **Image rights record** | Photographer, licence, territory, expiry. Largely already in schema; nobody offers it to talent |
| **Refresh-once, updates-everywhere** | Refreshing digitals improves standing across every future application |

### Change

- **Onboarding:** cut to the minimum that produces a reviewable package. Every field
  costs completion. Move the rest to progressive prompts after first submission.
- **Application receipt:** surface the immutable snapshot already stored in
  `talent_submission_packages`. "Exactly what you sent, on this date, to this agency."
  Built already; unsurfaced.
- **Freshness language:** three honest states. "Declared unretouched," never
  "unretouched."
- **Intel and portfolio analytics:** keep the talent-owned surface, but report only
  observable first-party facts: visits, referrers, shared-link opens, card pulls,
  image impressions/opens, submission states, and period comparisons above stated
  sample floors. Never translate view count, dwell, or referral source into inferred
  intent, attention quality, market demand, career momentum, or a causal diagnosis.
- **Verified-adult context:** keep the private adult-only layer, backed by an actual
  identity-document and matching-selfie age check. Store only the verification result
  and audit state; redact provider evidence after evaluation. Creator context remains
  private unless separately shared for a named submission or confirmed job.

### Remove

- Legacy AI analysis producing archetype / vibe / market-fit / potential
  (`src/routes/chat.js`, `src/routes/scout.js`)
- Gamification, reveal page, and profile-strength theatre not tied to a real recipient
  requirement

### On uploading an existing comp card

Two features that look similar and behave differently:

1. **Import source** — extract and pre-fill the structured profile. Ship this first.
2. **Attachment** — stored as "existing agency card," dated, always secondary.

A comp card must never substitute for the structured profile. An inbox of half
structured packages and half flat PDFs is email again, and an uploaded card has no
capture date — it could be three years old.

## A4. Agency domain — the complete product

| # | Surface | Contents |
|---|---|---|
| 1 | **Open Call Manager** | Create and brand links; mandatory brief (who, what, eligibility, deadline, what happens next); **Spec Builder** (see Part B); open/close; multiple concurrent calls |
| 2 | **Applicant Inbox** | Filter by completeness, digitals freshness, board, location, eligibility; sort; search; duplicate flags |
| 3 | **Applicant Detail** | The immutable submitted package — what was sent, when. Never the live profile |
| 4 | **Comparison View** | Side-by-side, uniform fields and crops. The digital equivalent of comp cards on a table |
| 5 | **Triage** | Stages, bulk actions, notes, tags, auto-decline templates |
| 6 | **Requests** | Request more materials · Request refresh — structured, with deadline |
| 7 | **Shortlist & Share** | Read-only link, no recipient account required |
| 8 | **Export** | CSV + webhook into the agency's existing system |
| 9 | **Invite to Apply** | From opt-in talent discovery. An invitation, never dossier access |
| 10 | **Team** | Seats, roles, audit log scoped to applicant actions |
| 11 | **Agency Settings** | Brand, default requirements, boards, response policy, auto-close window, own response-rate stats |
| 12 | **Season Memory** | Prior applications from this person and what has changed since |

### Remove immediately

Booking Desk · `src/domains/agency/routes/commitments.js` · `BookingDeskPage.jsx` + test
+ nav entry · `calendar.view` / `calendar.manage` permissions · `casting_briefs`
(dormant, zero writers) · commission code (`src/config.js`, `.st-split*` CSS) · roster
memberships and board standings as an ongoing system of record · interviews and
reminders as a scheduling system · match scoring and all AI ranking · off-platform
minor talent records (`roster-data.js` — reject minors at intake rather than storing
with `minor_consent_status: "pending"`) · agency market analytics.

Leave `talent_commitments` in place — dossier, roster-data, and the matching engine read
it defensively — but stop writing to it.

### The scope line

**Pholio's agency product ends when a decision is made.** Collect, compare, triage,
request, decide, hand off — ours. Options, bookings, calendars, invoices, contracts,
ongoing relationship — theirs, in the system they already pay for.

"Invite to apply" and "shortlist" sit just inside the line. "Interview scheduling" and
"roster management" sit just outside it.

## A5. Also fix

Independent of strategy, these are live defects:

- **Application status machine.** DB renamed `booked` → `represented` in
  `20260701111000`, but `roster.js`, `inbox.js`, and 8+ agency client maps still treat
  `booked` as live. `NOTIFY_STATUSES` includes `booked` but not `represented`, so
  transitions to `represented` fire no notification. Consolidate on
  `REPRESENTED_APPLICATION_STATUSES`; give `accepted` ("Offer / moving forward") and
  `represented` ("Agreement complete") distinct labels.
- **Submission receipt gap.** `GET /api/agency/profiles/:profileId/details`
  (`inbox.js:3228-3320`) reads the live profile even when a frozen snapshot exists.
  Its sibling endpoint does this correctly via `loadApplicationSubmissionPackages`.
- **Blocked agencies** don't enforce (`blocked-agencies.js` matches name/slug only;
  Discover never consults it).
- **Safety report** passes the talent's own `user_id` as target
  (`SettingsPage/index.jsx:1211-1221`).
- **Account deletion** always reports success even when `fullyErased: false`.

---

# PART B — The Digitals Layer

Derived from three market research passes, August 2026. Full evidence in the companion
audits; the operative findings are below.

## B1. What the research established

**Five voids — no product in the category does any of these:**

| Void | Evidence |
|---|---|
| Digitals freshness / expiry / versioning | Netwalk's Talent Update System (May 2026) is the category best and is 100% manual — no expiry, no staleness detection, no versions. DAM tools (Canto, Orange Logic) have had this machinery for years; it never crossed over |
| Portable multi-agency profile | Every system is agency-owned single-tenant. "Multi-agency" means commission splits. Frava's own reviewers flag mother-agency operations as its weak spot |
| Response at scale | Ashby and Greenhouse ship configurable auto-reject with templated comms. Zero modeling vendors have an equivalent |
| Structured comparison / scorecards | Go-see feedback is unstructured notes everywhere |
| "Not now, revisit later" pools | Talent is on-roster or gone |

**The spec variance is real and quantified.** Elite: 6 shots including a "personality
picture." Ford: 4. Storm / Models 1 / The Society: 3. Naming is inconsistent. Only some
agencies ban filters in writing. Models 1 explicitly bans swimwear — evidently a
recurring rejection driver. Almost no agency publishes technical specs; only The Society
(5MB) and Ford (3MB) state file limits.

Direct from a model: *"you think you have all you need but then on one agency site they
request an angle you didn't take, so you have to re-do the whole set of images."*

**Media upload is the most broken feature in every talent app tested.** Syngency:
*"Unable to upload files unless on a desktop."* Swipecast: rigid crop distorting aspect
ratio. Casting Networks: submission "stops at step 2." Portfoliopad: *"Can't do anything
on this app except view your schedule."*

**Silence is policy, not failure.** Storm and Muse both publish "we will only contact
those shortlisted." No agency publishes an SLA. Advice sources contradict each other —
"2 weeks max" versus "wait 4–6 months."

**Self-shot phone digitals are universally acceptable.** Every agency checked states
professional photography is not required.

**The category's blind spot:** Netwalk's entire 2026 release cadence — invoicing,
commission tracking, intake forms, package ordering, mother-agency commissions — is
agency-side plumbing. The most actively shipping vendor has invested essentially nothing
in the talent's experience of being represented.

## B2. The wedge

Three features are one product:

**1. Spec Registry.** Every agency's requirements as structured data — shot count, shot
types, clothing, hair and makeup, background, filter rules, file limits, height and age
floors.

> *You have 4 of Elite's 6. Missing: close-up profile with hair back, personality shot.*
> *Your current set already satisfies Storm, Models 1, and The Society.*

This is a **dataset, not code** — tedious to assemble, immediately valuable, and it
compounds with every agency onboarded. It is the most durable moat available, and it is
boring enough that nobody has bothered.

**2. Guided capture.** Don't build an uploader — build a camera. On-device framing
overlay per required shot, live checks for lighting, blur, framing, background and
filters, automatic shot-type detection. Shoot a full set against a named agency's spec
in five minutes.

Combined with the registry: *point your phone, and we'll tell you when the shot is right
for Elite.*

**3. Portable profile.** One profile, many agencies. Track which agency holds which
version. Refresh once, push everywhere. Mother agency plus placements as a graph.

**Incumbents structurally cannot build this** — they are single-tenant by design.
Pholio is talent-owned, which makes portability native. This is the one place the
architecture is an advantage.

## B3. Auto-close — the trust feature

Agencies deliberately don't respond and publish that policy. So do not sell them
"respond more."

The agency sets a review window. If nothing happens, the application auto-closes and the
talent is told plainly: *"no decision within 30 days — treat this as a pass."*

The agency does nothing. The talent gets certainty. The industry's most-cited pain is
solved by a default rather than by asking a booker to change behaviour. Pair with
one-click templated decline for agencies who prefer to answer properly.

## B4. Supporting features

**Eligibility pre-filter.** Agencies publish floors (Wilhelmina 5'8"+ women, 6'0"+ men;
The Society ages 16–23). Tell talent before they apply if they miss a hard requirement.
Saves agency triage, saves talent a rejection, costs nothing.

**Open-call calendar.** Muse Thursdays 3–4pm. Ford Chicago Mon–Thu 2–3pm. Storm Mon–Fri
walk-ins. Public, scattered across a dozen sites, aggregated by nobody. Genuine utility,
a recurring reason to open the app, gates nothing.

**Season memory.** *"You passed on her in SS26. Since then: new digitals, +2cm, now
signed in Milan."* Agencies re-review the same faces with zero recall.

**Coaching from spec data.** Not "the agency said no because X" — they won't. Instead:
*"Declined by four agencies. Three explicitly ban visible makeup in digitals, and yours
has makeup."* Legally clean, and only possible because of the registry.

## B5. Positioning

- **Talent:** *"Shoot your digitals once. We know what every agency wants."*
- **Agencies:** *"Every applicant arrives conforming to your spec, current, and
  comparable — and you never have to write a rejection email again."*

## B6. Snapcast teardown — completed 2026-08-08

**SnapCast Corp**, Boonton NJ. White-labeled intake at `{agency}.getsnapcast.com`.
Confirmed live at **Ford Models, State Management, Nomad Management, and 28 Models**.
Ford applicants have a Snapcast account created automatically and are told Ford will
review their Snapcast profile — the same open-call→account conversion Pholio is built
around.

### Finding 1 — they standardized downward, not per-agency

Three agency instances compared field by field:

| | Ford | Nomad | 28 Models |
|---|---|---|---|
| Photo count | 4 | 4 | 4 |
| Shots | close-up, profile, waist-up, full length | close-up, waist-up, full length, profile | close-up, waist-up, full length, shoulder-up, profile |
| File limit | 3MB | 3MB | 3MB |
| Instructions | no makeup, form-fitting, skinny jeans + tank | no makeup, hair pulled back, don't pose, plain white wall | unedited, plain background, natural light, no filters |

**One template, resold.** Snapcast did not encode each agency's real requirements — it
imposed its own and made agencies conform. It structurally cannot serve Elite (6 shots
including a "personality picture"), Storm or Models 1 (3 shots, explicit swimwear ban),
or any agency whose published spec differs from Snapcast's four.

**The Spec Registry thesis is intact.** Nobody has built it, including the one company
already occupying this niche.

### Finding 2 — monetization inverts every invariant in A1

From their Terms of Service, verbatim:

> "Your profile information is visible only to those agents to whom you submit within
> the 30-day period… At the expiry of the 30-day period, your profile then goes into a
> SnapCast general population ('GenPoP') folder where it remains—free of charge—for an
> additional 30-day period of time, during which it is visible to all agents and scouts
> in the SnapCast network."

After 60 days, **premium is required for continued visibility to agencies and for
updating your own profile.** Paying to be seen, and paying to stay current. This is the
Casting Networks class-action shape.

### Finding 3 — the talent side has already collapsed

**2.1 / 5 across 48 reviews.** Recurring complaints: six months with no result, premium
called a "complete waste of money," broken password recovery, profile images not
viewable, and that the app "appears to be attempting to profit off young people
interested in modeling careers." Same trajectory as ModelManagement.com (2.0/5), Nine9
(BBB "D"), and Model Mayhem.

### Finding 4 — lineage

The app is "licensed software of **Bookt, LLC**" — the dead talent app identified in
earlier research ($4.99/mo, last shipped July 2020, three ratings). Snapcast is the same
operator's second attempt, failing on the talent side the same way.

### What this changes

**Positive, and substantive.** Ford, State Management, Nomad and 28 Models each placed a
third-party white-labeled intake link on their own channels. That is real evidence for
the assumption everything else rests on — **agencies will do this.** It no longer rests
solely on one FWB relationship.

**The wedge is unoccupied.** Snapcast holds the distribution idea but shipped a generic
form with pay-to-be-seen attached. Per-agency specs, guided capture, freshness, and
portability are untouched.

**It is a live demonstration of the cost of violating A1.** Snapcast charges for
visibility and for profile updates and has 2.1 stars with users calling it predatory.
The compliance fixes in A2 are therefore also the competitive differentiator: *"we never
charge you to be seen, and never to update your profile"* can be pointed at a real
example.

### Open question

Those four agencies accepted Snapcast's template rather than their own published specs.
Whether Elite or Storm would accept a standardized form, or insist on their own, is
untested — the difference between "agencies want structured intake" and "agencies want
*their* structured intake." Ask FWB and agency #2 directly.

---

---

# PART C — US Legal Compliance

Researched August 2026 against all 50 states. **This is a product-compliance checklist,
not legal advice** — statutes and cases are cited so counsel can verify. Several
positions below are reasonable-but-untested; those are flagged explicitly in C8.

## C1. The four highest-risk items

| # | Risk | Verdict |
|---|---|---|
| 1 | **Studio+ lifting the discovery cap** → California "talent listing service" (Lab. Code §1701) | **Remove the mechanic.** See A2. $50k bond, contract disclosures, 10-day refund right if triggered |
| 2 | **"Appearance changed between sets"** → face-geometry comparison under Illinois BIPA | **Redesign before building.** $1,000 negligent / $5,000 reckless per violation, private right of action |
| 3 | **Comp card vision extraction** → incidental face processing | Text and layout extraction only; no face templates |
| 4 | **Any future AI-generated or AI-enhanced imagery** → NY Fashion Workers Act digital-replica consent | Build the separate consent gate *before* shipping any such feature |

## C2. Talent agency licensing — Pholio is likely outside, but the line is untested

Every state regime turns on **"procuring employment" for compensation**. Relevant
statutes: California Talent Agencies Act (Lab. Code §§1700–1700.47 — the artist
definition **expressly includes models**; licence + **$50,000 bond**); New York GBL
Art. 11 §§170–194 (**$10,000 bond** for modeling agencies); Florida Stat. ch. 468
Part VII; Illinois Private Employment Agency Act; Massachusetts 454 CMR 24;
Pennsylvania general employment-agency licensing. **Texas repealed its Talent Agency
Act effective 1 Sept 2011** — no state regime there. Ohio, Georgia and Tennessee have
no dedicated talent-agency licensing.

**Pholio stays outside these regimes only while it never:**
- negotiates booking terms
- represents talent to a hiring party
- takes any percentage of a booking or fee
- holds itself out as securing employment

There is **no case law on a submission-routing SaaS platform**. This is a
reasonable position, not a safe harbour. Risk is highest in CA and NY.

## C3. Biometric privacy — the binding design constraint

**Illinois BIPA (740 ILCS 14)** excludes *photographs* from the definition of
biometric identifier — but courts have held that a **face-geometry template extracted
from a photo is not itself a photograph** and therefore is not excluded
(*Monroy v. Shutterfly*, N.D. Ill. 2017). So:

- Storing photos → **outside** BIPA
- Running facial-geometry extraction or matching on those photos → **inside** BIPA

*Zellmer v. Meta Platforms* (9th Cir. 2024) held a face signature is not a biometric
identifier unless actually capable of identifying the individual — which is the legal
basis for the design rule below. It is persuasive, **not binding on Illinois state
courts**.

Obligations if triggered (§15): published retention/destruction policy (destroy within
3 years of last interaction), **written informed consent before collection** (electronic
signature suffices as of Pub. Act 103-0769, Aug 2024), no sale or disclosure, reasonable
security. Damages: **$1,000 per negligent / $5,000 per reckless violation plus fees**.
The 2024 amendment made repeat collection by the same method a *single* violation,
which reduces but does not remove exposure.

Parallel regimes: **Texas CUBI** (Bus. & Com. Code §503.001 — same conduct, AG-only
enforcement, up to $25,000 per violation); **Colorado CPA** biometric amendment (eff.
1 July 2025, AG-only); **Washington MHMDA** (broader than HB 1493 — includes facial
imagery, and carries a private right of action via the state Consumer Protection Act).

### The design rule

> **Classify the photo, never the face.** Image quality, exposure, blur, framing,
> background and shot-type detection must operate as generic computer-vision
> classification that never produces or persists a per-person biometric template and
> cannot re-identify an individual. **No stored face embeddings. No cross-image
> identity linking.**

Document this architecture decision explicitly — it is the compliance rationale.

Freshness tracking, the spec registry, and eligibility pre-filtering need **only
metadata and non-biometric classification** — capture dates, shot-type tags, resolution,
quality scores. None of them require touching biometric identification.

If appearance-change detection is ever built with face comparison, it must be an
explicit opt-in feature with its own BIPA-style notice, consent and retention flow, and
should compare-and-discard rather than persist templates.

## C4. State privacy laws

Roughly 19–20 states have comprehensive privacy statutes in force as of August 2026
(CA, VA, CO, CT, UT, IA, IN, TN, MT, OR, TX, FL, DE, NH, NJ, NE, MN, MD, RI, KY), all
Virginia-style: access, correction, deletion, portability, opt-out of sale and targeted
advertising, **opt-in consent for sensitive data**, and a privacy notice.

- A bare photograph is generally **not** sensitive data (CCPA and VCDPA both carve out
  photos). It becomes sensitive **once processed into a biometric template used to
  identify someone** — the same line as C3.
- Most states exempt businesses below ~$25M revenue / 100,000 consumers. CCPA's
  2026 inflation-adjusted threshold is **$26,625,000**.
- **Texas and Nebraska have no revenue or volume threshold** — they exempt only
  federally-defined small businesses. **Texas obligations can apply at any size.**
- A truthful privacy notice is required regardless of threshold; every state AG can act
  on a materially false privacy claim under general deceptive-practices law.

## C5. Minors

COPPA applies to services directed to under-13s or with actual knowledge of collecting
their data. Pholio's 18+ posture keeps it outside — **provided under-18 use is never
knowingly permitted or facilitated.** The FTC's 25 Feb 2026 COPPA Policy Statement
encourages age-assurance technology and offers enforcement discretion where verification
data is not retained or repurposed.

Keep the DOB field plus affirmative 18+ attestation as the baseline. If age-assurance is
added, **do not retain or repurpose that data**.

Allowing minors later would trigger the full child-performer regime state by state — NY
Child Performer Permit, employer Certificate to Employ, and **15% of gross earnings into
a trust account** (NY EPTL Art. 7; 12 NYCRR §186), plus Coogan-style statutes in CA,
LA and others. That is a dedicated compliance build, not a toggle. This reinforces the
A4 removal of off-platform minor talent records.

## C6. Right of publicity and likeness

No federal right; state-by-state statute and common law. NY Civil Rights Law §§50–51
(written consent required for advertising or trade use). Cal. Civil Code §3344.
Post-mortem terms vary widely (NY 40 years, CA 70, Indiana 100).

Three consents must be **separate**, not bundled:

1. Transmission of images to the specific agency the talent applies to — inherent in the
   submission action, but capture it explicitly
2. **Any Pholio-initiated use** — marketing, success stories, social posts, investor
   materials. Separate opt-in, never covered by general ToS acceptance
3. **Any AI-generated or enhanced likeness** — per NY Fashion Workers Act, must be
   separate and specific, stating scope, purpose, pay and duration. Routine colour
   correction and minor retouching are excluded. A power of attorney cannot authorise it

Related 2024–26 developments: Cal. AB 1836 (deceased performers, eff. 1 Jan 2026),
AB 2602 (living performers, performances fixed on/after 1 Jan 2025), Tennessee ELVIS
Act (adds voice).

Third-party AI vendors processing images must be scoped to **processing only**, never
publicity use.

## C7. FTC

- **Deception (§5).** No claim implying Studio+ improves visibility, ranking, review
  speed, or selection odds. No success-rate or discovery-odds claim without
  substantiation. The FTC's **December 2025 Consumer Alert on virtual casting-call
  scams** states plainly that paying to get a job is a scam signal — a live enforcement
  posture, directly relevant to how any paid tier is worded.
- **Endorsement Guides** (16 C.F.R. Part 255, rev. 2023). Testimonials and agency logos
  must be truthful and substantiated; cannot publish only favourable reviews; material
  connections disclosed.
- **Auto-renewal.** The FTC's 2024 click-to-cancel rule was **vacated by the Eighth
  Circuit on 8 July 2025**, but **ROSCA (15 U.S.C. §8403) remains fully in force**:
  clear and conspicuous disclosure before billing, express informed consent, and a
  simple cancellation mechanism. The FTC issued a fresh ANPRM in March 2026 (comments
  closed April 2026), so build Studio+ billing to the ROSCA standard now rather than
  betting on non-enforcement.

## C8. Where the law is genuinely unsettled

State these honestly rather than assuming safety:

- Whether a submission-routing platform with no negotiation and no commission is a
  "talent agency" under CA/NY/FL/IL/MA — **no case law on point**
- Whether image-quality and shot-type classifiers that cannot re-identify a person fall
  outside BIPA — rests on *Zellmer*, persuasive but not binding on Illinois state courts,
  and Illinois plaintiffs' firms have not conceded it
- Whether NY's Fashion Workers Act "Model Management Company" definition could reach a
  platform rather than only the agencies on it — untested, no DOL platform guidance
- The final shape of FTC negative-option rulemaking

## C9. Accessibility

No DOJ Title III web regulation exists for private commercial sites as of August 2026 —
the 2024 rule and its April 2026 extension apply to **Title II government entities**.
But Title III litigation is high-frequency: **~4,300+ website accessibility suits in
2024**, with courts treating **WCAG 2.1/2.2 Level AA** as the de facto standard.

Target WCAG 2.1/2.2 AA across the portfolio builder, comp card viewer, and PDF exports —
alt text, contrast, keyboard navigation, labelled forms, accessible exports. An
image-heavy consumer platform is a standard target profile.

## C10. Compliance additions to the build

Beyond the A2 fixes, these are required work:

- Written biometric retention/destruction policy **if** any face-derived feature ships
- Separate consent flows: agency transmission · Pholio marketing use · AI likeness
- Privacy notice covering the ~20 comprehensive-privacy states, with access, correction,
  deletion, portability and opt-out rights
- ROSCA-standard Studio+ billing: pre-purchase disclosure, express consent, self-service
  cancellation
- WCAG 2.1/2.2 AA across talent-facing surfaces and PDF output
- Marketing copy review against FTC deception and endorsement standards
- Age attestation retained; any future age-assurance data not repurposed

---

# Sequencing

**Now — compliance.** A2 fixes 1–8, 10, 11, **plus removing the Studio+ discovery-cap
lift** (C1 item 1 — a statutory tripwire, not a preference). Mostly one-line changes.
Until these ship, the stated principle is not true and the disclosure text tells users
the opposite.

**Next — removals.** A4 removal list plus A3 removals. Reduces surface area roughly
30–40% with no loss to anything that helps validate the business.

**Then — defects.** A5.

**Then — the wedge.** Spec Registry seeded with the ten agencies already researched →
Spec Builder in Open Call Manager → talent-side preflight → guided capture → freshness
engine → auto-close.

**Not yet.** Studio+ expansion, portable multi-agency graph, season memory, coaching,
open-call calendar. All good; none validate the core loop.

# What must be true

The binding assumption is unchanged: **will an agency that owes you no favour place a
Pholio link on its own channels?** Everything in this document is downstream of that.

Get two more agencies live before optimizing anything. The kill criteria in
[`audits/2026-08-08-pholio-strategic-decision.md`](audits/2026-08-08-pholio-strategic-decision.md)
still apply.
