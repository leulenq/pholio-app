# Talent Dashboard Industry Audit

**Date:** 2026-08-02  
**Scope:** Talent-facing SPA, onboarding/open-call intake, supporting talent and agency APIs, data contracts, generated professional materials, and the downstream agency states a talent user sees.  
**Mode:** Read-only audit. No product implementation was performed.  
**Launch context:** Fashion Week Brooklyn (FWBK).  

## Executive verdict

> **Scope addendum — application portal boundary:** Pholio is intentionally a
> pre-representation application and discovery platform, not a booking, roster,
> contract, commission, or agency CRM system. Findings below that describe the
> missing machinery required for bookings/show operations should be read as a
> boundary warning: remove, disable, or hand those states off rather than build
> the complete agency backend. FWBK validates the core product only when a
> participating agency receives a representation submission; FWBK event casting
> is a separate transaction and must not be relabeled as agency intake. See the
> companion [application-portal positioning memo](2026-08-02-application-portal-market-positioning.md).

**NO-GO for presenting Pholio as an end-to-end FWBK casting, booking, or show-operations system.**

**Conditional GO for a tightly scoped, adults-only registration and pre-screening pilot** only after the minimum gates in this report are satisfied and the product plainly says that casting operations, terms, bookings, fittings, rehearsals, and show-day coordination occur elsewhere.

The core product has several unusually credible foundations: it distinguishes digitals from the book, treats mother and placement agencies as different relationships, supports dated measurements and bookouts, captures image rights at a useful level of detail, and creates a named-recipient submission receipt. Those strengths are being undermined by a more fundamental category error: the current open-call journey treats every recipient as a model agency conducting a representation review. FWBK is publicly presented as a fashion event and casting ecosystem. It cannot safely be fitted into an agency-representation state machine without changing the purpose of consent, the meaning of every status, the opportunity information talent receives, and the obligations after selection.

The dashboard also overstates certainty in several sensitive places. It can call an adult context “verified” using only a self-entered birth date, label undated digitals current, certify a reclassified image as unretouched, describe low-signal web analytics as professional intent, and promise confirmed-job safety sharing for which no working recipient flow was found. These are trust failures, not small copy issues.

### Launch decision in one sentence

Pholio currently behaves like a promising agency-submission and portfolio product with fragments of agency booking infrastructure; FWBK needs a first-class event-casting model, a defensible consent and status contract, and a talent-visible operational layer.

## Method

This audit used four evidence layers:

1. Repo-wide inspection of visible talent surfaces and the backend/data paths that determine what those surfaces mean.
2. Independent review against current agency, casting-platform, union, event, government, fraud-prevention, copyright, and metadata sources.
3. Three parallel specialist audits: professional materials/profile, FWBK casting/show operations, and representation/money/safety/legal risk.
4. A structured industry lens covering audience, terminology, workflow, privacy, safeguarding, money, rights, market variance, and the difference between representation, casting, and booking.

The parallel research was deliberately cost/risk matched: a balanced high-reasoning agent handled the bounded profile/materials taxonomy; a stronger high-reasoning agent handled FWBK casting and live-event operations; and a stronger extra-high-reasoning agent handled representation, money, New York law, privacy, and safety. The in-repo industry skill supplied a useful audit taxonomy and severity discipline, but no conclusion rests on it alone; findings were independently checked against the code and current external sources.

Every recommendation uses one of four actions:

- **KEEP:** industry-credible and worth preserving.
- **CHANGE:** the concept is useful, but its current meaning or behavior is wrong.
- **REMOVE:** misleading, unsafe, or outside a defensible product promise.
- **ADD:** a missing capability, state, disclosure, or control.

Severity:

- **P0:** launch blocker, false professional state, safety/privacy breach, or materially wrong FWBK workflow.
- **P1:** significant credibility or operational gap that should be resolved soon after the P0 boundary.
- **P2:** terminology, localization, consistency, or product-depth improvement.

This is a product/industry audit, not legal advice. Legal duties depend on the actual contracting roles of FWBK, Pholio, agencies, clients, designers, and any management companies.

## Coverage matrix

| Audit area | Current state | Industry assessment |
|---|---|---|
| Product promise and recipient roles | Wrong | Event producer/casting recipient is forced into agency representation. |
| FWBK registration and event brief | Missing | No season, event, dates, eligibility, deadline, terms, fittings, rehearsals, or show scope. |
| Identity and professional name | Partial | Strong age minimization; professional/display identity is conflated with legal identity. |
| Discipline, boards, and broader creative talent | Wrong/partial | Model, Performer, Creator exist, but readiness defaults toward fashion/editorial. |
| Measurements and sizing | Partial | Dated, metric-first, dual-unit aware; too universal and insufficiently localized. |
| Digitals | Strong foundation / unreliable truth | Correct category; freshness and unretouched claims can be false. |
| Book, tests, campaigns, tearsheets | Strong | Vocabulary and separation are credible. |
| Motion, reels, walks, self-tapes | Partial | Generic links exist; casting-grade media types and metadata do not. |
| Credits, training, skills, languages | Partial | Free-form and not searchable at performer/casting standard. |
| Public portfolio | Strong/partial | Privacy guards are good; URL construction and audience controls are inconsistent. |
| Comp card and digitals sheet | Partial | Useful outputs; output purpose, current-set selection, and provenance need correction. |
| Agency discovery and legitimacy | Partial | Internal active status exists; official-domain and NY registry verification do not. |
| Representation submissions | Strong foundation | Package review is thoughtful; immutable talent-visible receipt is incomplete. |
| Event/job casting submissions | Missing | No distinct object, consent purpose, or lifecycle. |
| Application/casting statuses | Broken | Accepted, represented, and booked are conflated across consumers. |
| Meetings, go-sees, callbacks, fittings | Conflated | Generic interviews cannot express professional event types. |
| Availability and bookouts | Partial | Correct term; insufficient granularity and no conflict/hold integration. |
| Options, holds, bookings | Agency-only | Talent cannot see, acknowledge, challenge, or accept commitments. |
| Deal memo, compensation, usage, expenses | Missing | Not represented in the work lifecycle. |
| Fittings, rehearsals, call sheets, show day | Missing | No talent operations layer. |
| Messaging and notifications | Partial | General communication exists; deadline and live-event reliability do not. |
| HMU, appearance changes, backstage safety | Missing | Generic adult boundaries are not job-specific consent or safety. |
| Minors | Dormant partial infrastructure | Public launch is adult-only; operational minor compliance is incomplete. |
| Analytics and market intelligence | Misleading | Weak signals are described as intent and market demand. |
| Adult-content privacy | Unsafe | A private per-brief model exists in schema but is bypassed by generic fields. |
| AI photo/casting analysis | High risk | Subjective physiognomic/market inferences can affect discovery without explicit consent. |
| Membership, quotas, and trust | Inconsistent | Invited-submission rules conflict; unlimited applications can feel pay-to-play. |
| Cross-surface data consistency | Broken in places | Settings can corrupt media metadata and delete languages; URLs and statuses disagree. |

## P0 launch blockers

### P0-1 — CHANGE — Create a first-class event-casting workflow

**Repo evidence**

- `client/src/domains/talent/pages/ApplyPage/ApplyExperience.jsx:229-230` says the package goes to an agency for “representation review.”
- The same flow calls the transaction a “Representation submission” and records consent for representation review around `ApplyExperience.jsx:3693` and `:3728-3750`.
- `client/src/domains/onboarding/pages/OpenCallArrivalPage.jsx:195-200` describes an active public open-call link as a personal agency invitation.
- `migrations/20260704120000_create_agency_open_call_tables.js` stores agency attribution, link state, label, and quota provenance, not an event or casting brief.

**Industry reason**

FWBK publicly describes model casting and event production supporting runway shows, designers, hair/makeup, and model coordination. A casting/event organizer is not automatically the talent’s model management company. The recipient’s role determines why data is collected, what selection means, what terms follow, and whether “represented” is even possible. [FWBK open calls](https://www.fashionweekbrooklyn.com/open-calls), [FWBK registration and operations](https://www.fashionweekbrooklyn.com/registration).

**Direction**

Model at least three distinct transactions:

- `representation_submission`
- `event_casting_submission`
- `job_casting_submission`

Each must name the recipient’s role, purpose, data package, retention, withdrawal terms, lifecycle, and next action. FWBK should appear as an event producer/casting team/client unless a signed operating agreement establishes another role. Do not list it under “Open agencies” merely to reuse the current flow.

**Confidence:** High. Exact legal classification needs the partner operating agreement.

### P0-2 — ADD — An opportunity brief before any FWBK submission

The current open-call model cannot tell a candidate what they are entering. It lacks:

- Event and season
- Organizer and contracting/casting roles
- Submission deadline and decision window
- Casting location/date and format
- Fitting, rehearsal, and show windows
- Age and work-eligibility rules
- Runway/sample requirements
- Requested materials and required walk media
- Paid, unpaid, stipend, or TBD status
- Scope, usage, exclusivity, expenses, and expected deliverables
- Accessibility/accommodation route
- Official contact, privacy purpose, retention, and withdrawal terms

FWBK’s own current public model form asks only a small set of registration details—name, email, phone, Instagram, website, gender, and whether the applicant is 18+—which reinforces that Pholio must get a signed partner brief rather than inventing the rest. [Current FWBK model application](https://docs.google.com/forms/d/e/1FAIpQLSd8WptzmPPd_3jEMj8o8a9lVehWghLR4zG3KXJ1qXKF4S9WEg/viewform?usp=publish-editor).

**Direction:** no submission CTA should appear until the recipient, opportunity, eligibility, important dates, required package, and data purpose are configured.

### P0-3 — CHANGE — Repair the canonical status machine

**Repo evidence**

- `migrations/20260701111000_rename_application_status_booked.js` renamed representation outcome `booked` to `represented`.
- `client/src/domains/talent/utils/applicationStatus.js:78-95` still groups `accepted` under signed, defines `booked`, and has no `represented` configuration.
- A real `represented` row falls through to “Status updating” around `applicationStatus.js:153-162`.
- Talent notifications still emit “Booking confirmed” for an application outcome in `src/domains/talent/routes/notifications.js:264-310`.
- Agency consumers treat `accepted`, `booked`, and `represented` inconsistently, while `casting-stage-helpers.js` has a more defensible Offered/Represented distinction.

**Industry reason**

An agency saying “we want to move forward” is not the same as an executed representation agreement. Representation is not a job booking. A booking is a particular piece of work. These distinctions affect contract status, exclusivity, commissions, conflicts, and what talent may tell another agency.

**Direction**

- `accepted` → Offer / Moving forward
- `represented` → Agreement completed and roster relationship active
- `booked` → Confirmed job only
- `kept_on_file` → Retained for possible future consideration; never signed or settled
- Event casting receives its own Submitted / Under review / Callback / Fitting / Selected / Released / Not selected lifecycle

One shared state contract must drive database validation, agency actions, talent copy, notifications, counts, analytics, and representation records.

### P0-4 — ADD — Talent-visible commitments and explicit acceptance

The agency Booking Desk supports option, hold, booked, release, market, dates, and attribution in `client/src/domains/agency/pages/BookingDeskPage.jsx`, `src/domains/agency/routes/commitments.js`, and `migrations/20260714120000_harden_talent_commitments.js`. No corresponding talent route or dashboard was found.

**Consequence:** an agency can manipulate a professional commitment that the talent cannot see, acknowledge, correct, challenge, or accept.

**Direction:** add a talent action center for options/holds, challenge deadlines, conflicts, proposed terms, accept/decline, confirmation, release/cancellation history, and acknowledged-at timestamps. An internal agency state must never silently become the talent’s commitment.

### P0-5 — ADD — Terms, money, usage, expenses, and a deal memo

`migrations/20260706130000_create_casting_briefs_and_commitments.js` explicitly excludes money/budget fields. The Booking Desk captures dates, kind, market, client reference, and notes, but no compensation, payment term, usage, expenses, deductions, overtime, meals, cancellation, or acceptance.

New York’s Fashion Workers Act materials define runway, castings, and fittings as modeling services and describe deal-memo and client/management responsibilities for covered parties, including compensation, payment terms, scope, usage, expenses, expectations, meal breaks, overtime, safety policies, and access to a representative. [NYSDOL definitions](https://dol.ny.gov/new-york-state-fashion-workers-act-definitions), [NYSDOL responsibilities](https://dol.ny.gov/responsibilities-fashion-management-and-clients), [NYSDOL FAQ](https://dol.ny.gov/new-york-state-fashion-workers-act-faqs).

**Direction:** add a versioned work-terms/deal-memo object and talent acceptance before a hold becomes booked. Support paid, unpaid, stipend, barter, and TBD only as explicit reviewed values. Never imply that runway participation is unpaid. Capture:

- Gross compensation, currency, commission, deductions, and net estimate
- Payment trigger, due date, payer, invoice/tax responsibility, and remittance status
- Scope, territory, media, term, exclusivity, renewal, and conflicts
- Fitting/rehearsal compensation where applicable
- Overtime, meals, travel, lodging, per diem, transport, and reimbursable expenses
- Cancellation/kill fee, weather/force-majeure handling, and no-show terms
- Digital replica, synthetic-media, and reuse consent as separate grants
- Version, parties, accepted-at, changes, and superseded terms

**Caveat:** counsel must map which party is legally responsible in the FWBK arrangement. The product gap exists regardless.

### P0-6 — ADD — Fittings, rehearsals, call sheets, and show-day operations

FWBK publicly describes multi-day, back-to-back shows with designers, models, HMU, styling, dressers, and backstage operations. Pholio has no talent-facing representation of:

- Fitting appointment and sample/look assignment
- Rehearsal and choreography call
- Call time and timezone
- Venue, entrance, credential, check-in, and contact
- Designer, show, look number, dresser, and change order
- Wardrobe, shoe, undergarment, hosiery, and bring-list requirements
- HMU call, appearance-change approval, allergies, and sensitivities
- Run of show and same-day changes
- Travel, meals, breaks, safe transport, and release time
- Emergency escalation, cancellation, or incident reporting
- Seen/acknowledged receipts

Without this layer Pholio may collect candidates, but it cannot reliably coordinate selected talent through a professional runway production.

### P0-7 — ADD — New York legitimacy and recipient verification

`src/domains/talent/routes/agencies.js:28-49` treats internal `ACTIVE` status as sufficient for discovery. No New York model-management registration number, certificate, verification source/date, official-domain match, or recruiter identity was found. Settings calls recipients “vetted agencies.”

New York now maintains a registry for covered model management companies and requires covered entities to display registration details in certain recruiting and contract contexts. [NYSDOL model management registry](https://dol.ny.gov/model-management-companygroup-registry), [NYSDOL registration posting instructions](https://dol.ny.gov/node/63561).

**Direction**

- Store legal entity, trade name, operating role, physical contact, official domain, registration number, jurisdiction, verification source/date, and certificate/status.
- Verify covered New York agencies against the official registry.
- Distinguish agency, mother agency, placement agency, casting director, client, event producer, and designer.
- Show a recruitment-safety notice and verified contact channel.

The FTC warns that legitimate agencies typically make money when talent makes money, while advance fees, guaranteed work, forced photographers, and rushed payment are scam signals. [FTC modeling scam guidance](https://consumer.ftc.gov/articles/modeling-scams). IMG and Models 1 also warn applicants to verify recruiter identity and reject payment or nude/lingerie requests. [IMG recruitment warning](https://imgmodels.com/recruitmentwarning/), [Models 1 application guidance](https://www.models1.co.uk/apply).

### P0-8 — KEEP adults-only for launch; REMOVE any implication of operational minor readiness

The server-enforced onboarding gate rejects users under 18, while a legacy client surface still references 13+. FWBK’s current public form explicitly asks whether a candidate is 18 or older rather than stating an adults-only rule.

The repo has useful dormant structures for guardian grants and permits, but the talent profile reduces permits to a Boolean “on file.” It does not provide a complete jurisdiction-aware workflow for permits, employer eligibility, trust accounts, work/school hours, health/education documents, chaperones/responsible persons, renewals, or job-specific access.

New York requires a child performer permit for covered under-18 work and has separate employer and safeguarding requirements. [NYSDOL child model FAQ](https://dol.ny.gov/node/6506), [NYSDOL child performer information](https://dol.ny.gov/information-child-performers). Other markets vary materially: California has its own entertainment-work permits, while UK paid modeling may require a performance licence and chaperone. [California DLSE](https://www.dir.ca.gov/dlse/EWPRequirements.html), [GOV.UK](https://www.gov.uk/child-employment/performance-licences-for-children).

**Launch direction:** obtain written FWBK confirmation that no under-18 applicant will enter Pholio. Remove the legacy 13+ contradiction. If minors are required, treat that as a separate launch program and no-go review.

### P0-9 — REMOVE — False “verified adult” state and generic adult-content routing

**Repo evidence**

- `client/src/domains/talent/pages/ProfilePage/index.jsx:1542-1585` renders “Verified-Adult Creator Context” when the profile is simply not classified as a minor.
- The dedicated `adult_context.verified_adult` field defaults false, and no working age-verification route was found.
- The migration intended adult-content boundaries and sensitive platforms to be private, verified-adult, and consented per brief, but the current UI writes comfort levels into generic profile fields and OnlyFans into generic social accounts.
- `src/shared/lib/social-accounts.js` loads all platforms; the application snapshot can include every account even though the talent review UI only previews a subset. An OnlyFans link can therefore reach an agency without being visible in the final review.
- Agency match scoring can use generic comfort levels as a hard gate or score.

**Industry reason**

Age attestation is not age verification. Intimacy, nudity, adult platforms, and personal boundaries must not become generic discovery attributes or hidden ranking inputs. Consent is opportunity-specific and revocable; a general profile preference is not consent to a particular brief.

**Direction**

- Remove “verified” until a real verification state exists.
- Keep sensitive adult-platform links and boundaries out of generic profiles, submissions, exports, discovery, and ranking.
- Rebuild them as private, age-gated, per-brief disclosures with an exact talent preview and explicit consent receipt.
- Audit historical data and previously generated snapshots for leakage.

### P0-10 — REMOVE or ISOLATE — Legacy physiognomic/casting-scoring endpoints

`src/app.js` still mounts legacy `src/routes/chat.js` and `src/routes/scout.js`. The associated analysis can rate facial symmetry, feature contrast, look type, market fit, professional potential, “vibe,” or archetype and can influence discovery/indexing. Current media upload also triggers a master vision analysis for adult profiles without a clear, specific opt-in.

**Industry reason**

The issue is not that bookers make visual judgments; it is that a platform converts subjective appearance judgments into persistent, opaque, scalable scores and retrieval signals. That creates discrimination, correction, consent, explainability, and false-authority risks. AI output must not be presented as “booker truth,” professional identity, or an objective measure of potential.

**Direction**

- Decommission unused legacy routes and data or isolate them from production discovery.
- Require explicit, purpose-specific consent for any image analysis.
- Disclose the categories inferred, how they are used, retention, human oversight, and correction/appeal.
- Never estimate height/weight or infer protected traits from an image.
- Remove AI archetype labels and casting verdicts from comp cards, public portfolios, and agency-ready professional materials.
- Require logged, legitimate brief criteria for any sensitive filter; never make demographic search a generic discovery toy.

### P0-11 — CHANGE — Stop presenting weak analytics as professional intent

**Repo evidence**

- Share-token traffic is classified as `client` even when anonymous or forwarded.
- Every profile returned in agency search can receive a discovery impression, whether or not a person opened the profile.
- A “qualified” visit can be ten seconds or merely have an external referrer.
- `AttentionBlock.jsx` asks whether “anyone with intent” is looking and can infer a name search from a search-engine referrer, even though the query is unknown.
- Viewer IP geolocation is presented as market.
- Frame rankings use very small thresholds and recommend a comp-card front from open behavior.

**Industry reason**

An impression is not a review; a review is not a shortlist; a long view is not booking intent; an IP location is not a client’s booking market; a click is not evidence that a frame is the best professional selling image. Describing these as intent produces anxiety and encourages talent to optimize for noise.

**Direction**

Rename events literally: search-result impression, profile open, link open, frame open, agency action. Do not infer identity, query, intent, or demand without evidence. Label geolocation as approximate viewer location. Require large enough samples and compare like-for-like placements before offering editorial recommendations. A booker or agent—not a low-volume click model—should choose the card front.

### P0-12 — CHANGE — Do not promise confirmed-job safety sharing until it exists

`client/src/domains/talent/pages/ProfilePage/index.jsx:1587-1625` says emergency contacts remain hidden until booked and are then shared only with the job team. A `confirmed_job_safety` table and DTO exist, but no live recipient route or end-to-end access/expiry/audit flow was found.

**Direction:** either remove the claim for launch or implement booking-scoped emergency data, named authorized recipients, explicit purpose, access log, expiry, revocation, talent preview, and incident escalation. Safety copy cannot be aspirational.

### P0-13 — CHANGE — Stop Settings from corrupting the professional package

`client/src/domains/talent/pages/SettingsPage/index.jsx:543-556` uploads a casual avatar as `portfolio`, `headshot`, `studio`, active, then makes it hero. This creates false professional metadata and can contaminate the book, public portfolio, readiness, and submissions.

**Direction:** avatar/account imagery must be separate from professional media. It may be promoted into the book only through the normal editor, classification, rights, audience, and readiness controls.

### P0-14 — FIX — “Blocked agencies” does not enforce the promised boundary

Settings promises that a blocked agency cannot see the talent’s discoverable profile, but the current paths do not support that claim:

- `src/shared/lib/blocked-agencies.js` resolves only exact agency name or slug even though the UI accepts an agency name or domain.
- `src/shared/lib/profile-visibility.js` checks in-memory/noncanonical excluded or blocked ID properties rather than the persisted talent settings.
- Discover does not load the persisted blocked-agency settings into its visibility decision.
- A comprehensive block was not found across Discover, dossier, contact, invite, message, roster action, and protected media access.

**Direction:** block by immutable verified agency ID, enforce it in every read/contact/action/media path, and test the whole boundary. Until enforcement is complete, remove the promise or disable the control. A privacy/safety control that only changes Settings state is worse than no control because it changes user behavior under false assurance.

### P0-15 — FIX — The general safety report can target the talent instead of the agency

`client/src/domains/talent/pages/SettingsPage/index.jsx:1211-1221` describes reporting an agency but passes `targetType="user"` with the talent’s own `profile.user_id`.

**Direction:** carry or let the user select the actual agency, application, message, opportunity, event, or platform target. Include categories for unsafe set/location, sexual misconduct, discrimination, nonpayment/wage theft, retaliation, coercion/trafficking, minor safety, and digital-replica misuse. Provide evidence attachment, confidential status tracking, emergency guidance, and the correct regulator/support route. A generic report form is not an operational incident system.

### P0-16 — FIX — Account deletion claims completion before provider erasure is complete

`src/shared/lib/account-deletion.js` correctly records failed storage/Firebase purges and can return `fullyErased: false`; the API can return `pending_provider_purge`. The talent UI nevertheless always displays “Account deleted,” and the pending-deletion processor appears only in tests/docs rather than a production scheduler.

**Direction:** run monitored retries, escalate persistent failure, preserve a minimal deletion job/audit record, notify the user on verified completion, and display “Pholio account removed; provider erasure pending” until all configured providers confirm. Do not promise irreversible completion from a partial state.

### P0-17 — REMOVE — Off-platform minor PII collection during an adults-only launch

`src/domains/agency/routes/roster-data.js` allows an agency to create an off-platform minor record with name, DOB, email, phone, measurements, and other data, then marks consent pending after collection. Hiding the record from later reads is not the same as obtaining authority before collecting it.

**Direction:** reject minor imports and creation for the adult-only launch before storing the PII. A future minor workflow must begin with verified guardian authority and purpose notice, then collect the minimum data required for that stage.

### P0-18 — CHANGE — Confirmed bookings cannot be generically “released”

The agency commitments API can delete a booked item by changing it to `released`. That collapses option released, hold released, client cancellation, talent cancellation, postponement, force majeure, no-show, replacement dates, and kill-fee treatment into one silent state.

**Direction:** prohibit a generic release action on confirmed work. Require actor, timestamp, reason, talent notification/acknowledgement, replacement dates where relevant, compensation/kill-fee treatment, and dispute history. Preserve an immutable event trail.

## P1 — Profile, identity, divisions, and readiness

### P1-1 — CHANGE — Replace universal “agency-ready” scoring with target packs

`DisciplineSection.jsx` offers Model, Performer, and Creator, but `profileDivision.js` ignores discipline in key routing and defaults unmatched profiles toward Fashion & Editorial. Adult readiness then requires height, bust/chest, waist, hips, and full-length digitals for nearly everyone.

Create a small universal identity/contact minimum, then purpose-specific packs:

- Fashion/new face
- Runway
- Commercial/lifestyle
- Fit/showroom
- Curve/petite/mature
- Parts/beauty/fitness
- Actor/performer/host
- Voice
- Dance/movement
- Creator/UGC
- Child talent by jurisdiction
- Recipient- or casting-specific overrides

Initial fashion scouting often needs natural images and basic information; casting profiles for performers rely more heavily on headshots, reels, credits, training, skills, locations, union/work status, and role-relevant traits. [Premier scouting guidance](https://www.premiermodelmanagement.com/blog/scouting/2509-what-do-modelling-agencies-look-for/), [Spotlight casting-profile guidance](https://www.spotlight.com/news-and-advice/getting-work/how-casting-directors-and-agents-use-spotlight/), [SAG-AFTRA performer guidance](https://www.sagaftra.org/performer-tidbits).

### P1-2 — CHANGE — Separate discipline, board, lane, and skill

The current system mixes disciplines, agency boards, market lanes, size categories, and job types. A person may legitimately be on more than one board or work across commercial, runway, beauty, fit, creator, or performance work. “Curve” and “petite” are often boards or market positioning, not booking types; “runway” is a job lane; “actor” and “creator” are disciplines.

**Direction:** model these as separate, multi-valued concepts with recipient-specific vocabulary. Do not force a single identity label to do all routing.

### P1-3 — CHANGE — Professional name is not legal identity

Readiness calls first/last name “Legal Name” and claims agencies file submissions that way. Many models and performers use professional or stage names. Legal identity is needed for age/work verification, contracts, tax, and payment—not routine public presentation.

Add professional/display name and phonetic pronunciation; keep verified legal identity private and purpose-limited. The New York child-performer form itself recognizes professional name as distinct from legal identity.

### P1-4 — CHANGE — Separate identity from presentation and board routing

Readiness says agencies depend on accurate “gender presentation” for board fit. Gender identity, pronouns, wardrobe sizing track, and the boards/roles a person wishes to be considered for are not the same field. FWBK’s current form includes Gender Fluid, while Pholio’s controlled values differ.

**Direction:** retain inclusive identity and pronouns, but ask casting-specific presentation/wardrobe/role eligibility only where relevant and only with a clear purpose. Allow recipient-specific vocabularies rather than pretending one canonical list matches every market.

### P1-5 — REMOVE — Skin tone as a readiness item beside tattoos and piercings

“Skin Tone & Markings” groups a sensitive immutable trait with tattoos/piercings and says these prevent surprises. That framing makes skin tone sound like a disclosure obligation or defect-management field.

Remove skin tone from universal readiness. Where legitimate makeup, lighting, or brief-specific representation needs exist, use consented, purpose-specific treatment and do not use it as a generic quality score.

### P1-6 — CHANGE — Body descriptors and fit categories

Values such as slim, athletic, average, curvy, curve, and muscular mix subjective body judgments with market boards. “Average” is especially poor professional language, while “curve” is frequently a board/business category.

Prefer objective current measurements plus opt-in board positioning. Do not infer or require a body descriptor. Let agencies map board naming to their market.

### P1-7 — CHANGE — Nationality, work authorization, and passport readiness

A short nationality list of US/Canada/UK/Other is not credible. “Authorized / Requires sponsorship” is meaningless without jurisdiction; passport readiness without issuing country/expiry is too weak for production.

Use full country data, multiple citizenships/nationalities where needed, work authorization by market with expiry/restrictions, and private passport/travel-document status by issuing country and expiry. Collect place of birth only for a justified contract/compliance purpose.

### P1-8 — CHANGE — Availability taxonomy

“Full-Time / Part-Time / Freelance / Weekends Only / By Appointment” mixes employment relationship with calendar availability. Most independent models are freelance regardless of how many days they are free.

Represent usual working windows, markets, travel radius, notice, blackout dates/bookouts, and employment/representation status separately.

### P1-9 — CHANGE — Readiness language and authority

Phrases such as “physical proof,” “the numbers casting filters on,” “Proof,” “Your receipts,” and “Your book is ready for agency review” sound algorithmic or outsider-written. They also overstate what a generic checklist can know.

Use concrete language: current measurements, current digitals, professional materials, and “ready for [specific recipient/package].” Never imply that profile completion predicts suitability or representation.

## P1 — Measurements, media, artifacts, and rights

### P1-10 — CHANGE — Current means dated and verified

`packageIntelligence.js` returns `isStale: false` when all digitals are undated, allowing readiness to award “Current Digitals.” Unknown age is not current.

Use three states: current, stale, and unverifiable. Freshness windows should be configurable; a material hair/body/look change should invalidate a set regardless of age. Preserve historical sets without mixing them into the current send package.

### P1-11 — CHANGE — “Unretouched” must be an attestation with provenance

`FrameEditor.jsx` clears `retouched_at` when an image is labeled digital, while `views/pdf/digitals-sheet.ejs` unconditionally prints “Unretouched · for agency review.” A previously edited image can therefore be reclassified and certified as raw.

Track source original, file hash, capture date, crop/replace history, retouch/AI declaration, and reviewer exception. Where evidence is self-attested, say “declared unretouched.” Never convert a missing field into a professional certification.

### P1-12 — CHANGE — Export a selected current digitals set

The digitals PDF currently includes every image classified as digital, including historical, undated, stale, or inconsistent frames. Export a purpose-specific current set with slot names, set/capture dates, verification state, and rights readiness; keep history separate.

### P1-13 — ADD — Runway walk and FWBK readiness media

For an FWBK brief, support current walk video, heel height/proficiency and shoe constraints, runway experience/training, pace/turn/choreography confidence, recent in-person measurement verification, fitting/sample availability, rehearsal availability, and mobility/access needs.

These are brief-specific requirements, not permanent universal profile tests. A commercial or creator candidate should not be penalized for lacking a runway walk.

### P1-14 — ADD — Structured performer and creator credentials

The profile stores free-form credits, training, skills, and language names; Motion accepts generic URL metadata. Casting-grade records should include:

- Credit, role, production, company/client, medium, year, and billing where appropriate
- Training provider, teacher/course, discipline, and year
- Language and accent proficiency
- Skill proficiency and certifications/licences
- Union status, working locations, playing age/age range where lawful and useful
- Showreel, scene, self-tape, slate, voice reel, walk, dance, and commercial clip types
- Creator platform, content category, audience market, metric source/date, brand conflicts, and usage availability

Keep model and creator profiles lean unless their target pack needs performer detail. Spotlight and SAG-AFTRA profile examples use structured credits, skills, training, locations, physical characteristics, resumes, headshots, and audio/video media. [Spotlight profile guide](https://www.spotlight.com/news-and-advice/spotlight/a-guide-to-the-new-spotlight-profile/), [SAG-AFTRA iActor example](https://iactorpub.sagaftra.org/iactor/MateoRay).

### P1-15 — CHANGE — Localize garment sizing and measurement prompts

Metric-first storage, dual-unit display, shoe regions, and dated measurements are strong. Generic dress values and free-form suit size are not enough for US/UK/EU/Italian/French systems, while every track sees waist/hips/inseam regardless of work.

Store canonical measurements plus declared sizing system. Ask only role/board-relevant fields, with optional neck/collar, glove, hat, inseam, foot, hand, or other parts details where required. Separate talent-entered, agency-verified, and fitting-measured values.

### P1-16 — ADD — Immutable talent-visible submission package

Application detail links open the current mutable Book/Profile/Comp Card rather than the exact artifacts sent. Talent should be able to inspect the immutable snapshot: images, measurements-as-of, note, disclosed socials/contact, rights state, recipient, purpose, consent version, retention, withdrawal state, and subsequent requests.

### P1-17 — CHANGE — Fix public portfolio URLs

Overview and Settings construct `${VITE_PORTFOLIO_URL || https://pholio.studio}/${slug}`, while the Express route and other consumers use `/portfolio/:slug`. A user can copy the wrong host/path.

Use one server-provided canonical portfolio URL across UI, PDFs, QR codes, messages, and metadata.

### P1-18 — CHANGE — Expose profile-field audience controls

The backend has field-visibility policy, and image-level public/agency controls are good, but the talent UI defers comparable controls for profile, stats, creator metrics, and job-only safety data.

Give talent a simple “where this appears” view for public portfolio, agency discovery, named submission, roster, and confirmed job. Preserve mandatory conservative policies for minors and sensitive fields.

### P1-19 — KEEP and strengthen image rights

The rights model—owner, photographer, usage, territory, dates, exclusivity, release reference—is well above the usual portfolio-app baseline. Keep it.

Add immutable artifact/version IDs, original hashes, source-metadata retention, release-document verification state, and optional Content Credentials inspection. Do not imply that C2PA proves copyright or permission. Photographers generally own their images absent an agreement; IPTC supports creator/copyright/usage/release metadata. [U.S. Copyright Office](https://www.copyright.gov/engage/docs/photography.pdf), [IPTC photo metadata](https://iptc.org/standards/photo-metadata/photo-metadata/), [C2PA explainer](https://spec.c2pa.org/specifications/specifications/2.4/explainer/Explainer.html).

## P1 — Casting, representation, communication, and operations

### P1-20 — CHANGE — Split agency meeting, go-see, casting, callback, and fitting

The dashboard calls a generic agency interview a “go-see,” and the entity only distinguishes video, phone, and in-person. These are different professional events:

- Agency meeting: representation conversation
- Go-see/casting: client or project evaluation
- Callback: advancement in a casting
- Fitting: garment appointment/work obligation
- Rehearsal: production preparation
- Direct booking: a specific job offered without casting

Support alternate-time proposals, deadline, timezone, calendar export, location/access, contact, and a prepare/bring list.

### P1-21 — ADD — Structured requests for more materials

`requested_more` is a status plus free-text message. A proper request needs asset type, instructions/example, deadline/timezone, upload destination, consent impact, completion, review, and whether the submission remains active.

### P1-22 — CHANGE — Bookouts and availability for production reality

Keep “bookout”; it is correct industry vocabulary. Extend the date-range model with partial-day times, timezone, market/location, travel buffer, editable reason/privacy, show/fitting/rehearsal availability, and conflict visibility against agency options and holds.

Avoid examples such as “Editorial shoot on hold” under bookouts: a hold is not a self-declared bookout.

### P1-23 — CHANGE — Recipient-specific messaging etiquette

The product always allows talent to write first and, after 21 days, encourages messaging the agency or withdrawing. Many agencies state that they will contact applicants if interested and discourage follow-up. For event casting, the useful information is a configured decision date and support contact, not a generic chase prompt. [Wilhelmina applications](https://www.wilhelmina.com/become-a-model).

Make messaging policy recipient-specific. Permit operational questions, requested materials, and scheduled-event communication without encouraging indiscriminate follow-up.

### P1-24 — ADD — Deadline-aware and live-event notifications

Messages can generate in-app/email notifications; interviews may be in-app only, while Settings claims meetings “always reach you.” A 30-second inbox poll is not a show-day guarantee.

Classify notifications as informational, response-required, same-day operational change, or emergency/cancellation. Add timezone, deadline, verified delivery channel, retry/escalation, seen, and acknowledged states. Use SMS/push only with explicit consent and tested fallback.

### P1-25 — ADD — HMU and appearance-change consent

Generic “content boundaries” do not cover runway HMU. Separate reversible styling preferences from material or persistent changes. Obtain job-specific consent for cutting, color/bleach, extensions, brows, nails, facial hair, adhesives, prosthetics, and sensitive products. Capture allergies, product sensitivities, mobility/access needs, modesty/changing needs, footwear safety, and a private incident route.

### P1-26 — CHANGE — Development and kept-on-file semantics

Keep both concepts, with precision:

- “Development offered” until terms are accepted; “In development” only after a documented relationship exists.
- “Kept on file” means retained for possible future consideration. It may be positive, neutral, or noncommittal depending on the agency. Never group it with signed/settled outcomes or promise advancement.

### P1-27 — KEEP — Structured representation, but change the source of truth

The mother/placement/market/exclusivity relationship model is credible. Preserve it. Derive representation display from active `talent_representations`, not application history, and populate it only after a real representation agreement state.

## P1 — Analytics, monetization, and trust

### P1-28 — CHANGE — Use literal analytics labels

Replace “intent,” “market searching for someone like you,” “searched by name,” and “strongest frame” with observable events. Avoid “Nobody” or “Where do submissions die?” language; it is emotionally manipulative and not analytically defensible.

Do not group signed and kept-on-file as “settled.” Do not prescribe “more boards beats more waiting” or infer that unopened means targeting while opened/no advance means package. Those are hypotheses, not facts.

### P1-29 — REMOVE — Unsupported performance claims

Legacy insight copy contains claims such as 3× or 40% without a visible evidence model. Remove any unsupported benchmark, causality claim, or universal “best day” advice. Product analytics should identify its sample, comparison set, confidence, and data limitations.

### P1-30 — CHANGE — Submission limits and pay-to-play optics

The app has conflicting invited-submission rules: one surface says the first three are exempt, another says invited submissions never count, and a local monthly count does not match the server’s quota logic.

Use one server-authoritative policy and show why each submission did or did not count. A partner invitation should not fail because Pholio’s unrelated quota was exhausted.

Unlimited paid agency applications can look like purchasing access to professional consideration. If retained, disclose prominently that:

- Agencies receive no fee from the talent’s plan
- Payment never changes ranking, visibility, response, or selection
- Representation/work is never guaranteed
- Targeted submissions are favored over volume
- An official partner invitation is accessible regardless of plan

The FTC’s scam guidance makes this boundary especially important. [FTC modeling scam guidance](https://consumer.ftc.gov/articles/modeling-scams).

### P1-31 — CHANGE — Do not call internally active agencies “vetted”

Use “listed” until official-domain, identity, role, and applicable registration checks exist. Show exactly what Pholio verified and when; do not use one vague trust word for materially different checks.

### P1-32 — CHANGE — Protect drafts on shared devices

The application dossier can persist locally for seven days. On shared or borrowed devices, private measurements, contact, media selection, and submission intent may remain accessible.

Disclose local persistence, provide “clear draft,” expire conservatively, avoid sensitive fields where possible, and never confuse a browser draft with a server-saved application.

## P1 — Cross-surface data integrity

### P1-33 — CHANGE — Do not silently delete languages

Settings reduces a multilingual profile to one of a small fixed list when saving. The professional profile must preserve all language records and proficiency levels unless the talent explicitly removes one.

### P1-34 — CHANGE — Globalize timezones

Settings offers only a small timezone list. Castings, callbacks, remote auditions, fittings, and show calls require IANA timezones, clear local rendering, and DST-safe scheduling.

### P1-35 — CHANGE — One authoritative readiness calculation

`ProfileReadinessAudit.jsx` can build its checklist without profile, image, minor, or division context and still declare the book ready. Use one evaluated server/shared contract that includes target pack, audience, current media, rights, age/jurisdiction, and recipient requirements.

### P1-36 — REMOVE or complete — Mock social connection states

The mock OAuth path is development-gated server-side, but the owner UI still routes toward a mock experience. Do not let a production user see a simulated connection as verification. Real connections need source, last verified time, scope, consent, disconnect/revocation, and per-submission preview.

### P1-37 — CHANGE — Representation records need actual contract scope

The mother/placement schema records market, territory, division, exclusivity, dates, and history, but not enough to explain the real relationship. Add contract status, signed/effective/expiry dates, notice, affirmative renewal, exclusivity category and scope, commission, mother/placement split, approved advances/deductions, travel/visa/accommodation arrangements, optional power of attorney and revocation, document/amendment history, termination reason, and post-termination royalties.

For covered New York model-management contracts, current law limits contract length, regulates renewal, commission, deductions/advances, and powers of attorney. [NY Labor Law §1035](https://www.nysenate.gov/legislation/laws/LAB/1035), [§1036](https://www.nysenate.gov/legislation/laws/LAB/1036). Applicability requires counsel.

### P1-38 — CHANGE — Remove the dormant 25% commission assumption

The real commission feature was deliberately removed, which is the correct choice until the product has an auditable financial ledger. `src/config.js` still carries a 25% default, while New York caps a covered model management company’s commission at 20%. Companion Terms in the marketing/legal repo also describe agencies recording commissions and earnings despite the feature’s removal.

Remove the dead default and align public terms with actual product conduct. If a ledger is later introduced, separate gross client fee, client service charge, talent commission, mother/placement split, approved deductions, client invoice/payment, talent statement/payout, royalties/renewals, tax records, and disputes. [NY Labor Law §1036](https://www.nysenate.gov/legislation/laws/LAB/1036).

### P1-39 — CHANGE — “Export everything” is not currently true

Settings promises an export of everything Pholio holds. The inventory omits at least bookouts, talent commitments, roster memberships, and roster board standings—records that can materially describe the talent’s calendar and agency decisions.

Either include all in-scope user-linked tables and derived decisions with a data dictionary, or narrow the promise. Generated rankings/inferences and agency-authored facts about the talent should not disappear merely because they were created on another surface.

### P1-40 — CHANGE — Make release evidence and representation disclosure real controls

The image editor can show “On file” from typed release details/URL without a stored verified artifact. Use “Release details declared” until the file, version, parties, permissions, and verification state exist.

Separately, the database has a talent-controlled `disclose_agency_name` flag, but the talent API/UI does not expose it. Let talent choose between “represented — agency undisclosed” and naming the agency, with an audience preview.

### P1-41 — CHANGE — Align companion legal notices with actual conduct

The companion marketing/legal repo currently contains claims that conflict with the app: 13–17 access despite the adults-only gate, DOB collection after initial entry despite current collection order, a Settings AI opt-out that does not exist, and commission/earnings recording that was removed.

Before launch, counsel should approve updated Terms, Privacy, AI Notice, and Submission Program Notice; bump the shared legal version and capture acceptance. The legal entity’s approved service/notices address should also be complete. This work belongs in the marketing/legal repo, not `pholio-app`.

## P2 terminology and micro-detail ledger

| Current wording or concept | Recommendation | Why |
|---|---|---|
| Choose the house | Choose an agency / Enter the FWBK casting | “House” commonly means a designer/fashion house. |
| Open agency | Use only for a model agency | An event producer or casting team is not an agency. |
| Application | Use submission for the artifact; agency application or event registration for the process | Avoids collapsing representation and casting. |
| Open-call invitation | Use only with named invite provenance | A public active link proves entry, not a personal invitation. |
| Go-See Requested | Agency Meeting Requested, Casting Requested, or Fitting Requested | These events have different purposes and obligations. |
| Interview | Reserve for actual interview/meeting | Do not use as an umbrella for callback or fitting. |
| Accepted | Offer / Moving forward | Not yet represented. |
| Represented | Use only after agreement and roster relationship | It is a professional/legal state. |
| Booked application | Remove | Booking belongs to a job, not representation. |
| Development Offer | Keep as offer; use In Development after acceptance | Avoids inventing a relationship. |
| Kept on File | Keep, with no promise | Meaning varies by agency. |
| Option / 1st option | Keep, configure agency rules | Common term, but exact force varies. |
| Hold | Keep, with deadline/meaning | Often used differently by agencies/markets. |
| Bookout | Keep | Correct talent/agency calendar term. |
| Direct Bookings as representation status | Self-represented / Direct contact | A direct booking is a job without casting, not a permanent status. |
| Current digitals | Current only when dated/verified | Unknown date is not current. |
| Unretouched | Declared unretouched unless provenance supports more | Avoid false certification. |
| Legal Name in public readiness | Professional/display name | Legal identity is contract-only. |
| Gender presentation as board fit | Identity + separate brief-specific presentation/wardrobe route | Avoid conflating identity and casting. |
| Skin Tone & Markings | Remove from generic readiness | Sensitive trait is not a “marking.” |
| Full-Time / Freelance availability | Separate work status from calendar availability | These are different dimensions. |
| Physical proof / Proof / Receipts | Current measurements / professional materials | More credible, less dehumanizing. |
| Strongest frame | Most opened frame, with sample caveat | Click behavior does not prove booking quality. |
| Market | Approximate viewer location | IP location is not booking market. |
| Vetted agency | Listed / verified with named checks | Trust language must be auditable. |
| Digital Comp Card | Comp card / e-comp / stats card | “Digital” is delivery, not the professional object. |

## P2 product-depth findings

1. **Output format:** 5.5 × 8.5 is credible for a US comp card, not a universal standard. Label outputs by market/purpose: US comp, A5/A4 stats card, e-comp, digitals sheet.
2. **Success timing:** remove generic “few days to a few weeks” review guidance unless the recipient has configured an SLA.
3. **Agency count:** discovery hard-slices a small set; expose total/eligibility/filtering accurately rather than implying a complete market.
4. **Portfolio analytics:** distinguish self-opens, public shares, agency opens, casting opens, and forwarded links.
5. **Hero image:** separate public hero, agency book opener, comp-card front, and account avatar. They serve different audiences.
6. **Creator metrics:** capture metric date/source, geography, audience authenticity limitations, and campaign-specific disclosure; followers alone are not professional suitability.
7. **Credit proof:** do not call a free-form credit list verified. Allow agency/talent-added, document-supported, and externally verified states.
8. **Representation exclusivity:** show territory, service/category, start/end/renewal, notice, and conflict implications in plain language.
9. **Withdrawal:** distinguish withdrawing a submission, declining an event, releasing a hold, terminating representation, and requesting data deletion.
10. **Profile export:** generated materials should state their as-of date and recipient purpose.

## KEEP: industry-credible foundations

These should survive the redesign:

1. Separate media buckets: Digitals, The Book, Tests, Campaigns, Tearsheets, Motion.
2. Actual digitals in the agency submission rather than substituting styled book images.
3. Dated measurements, metric-first storage, dual units, and shoe-region awareness.
4. Optional board context while preserving the agency’s final placement decision.
5. Optional short submission note rather than a forced personal essay.
6. Direct, factual note-assistant constraints instead of corporate or pleading language.
7. Named recipient, disclosed package, retention, withdrawal limits, adult authority, and no-guarantee language in the submission review.
8. Image-level public/agency controls and conservative public-portfolio/minor guards.
9. Raw-original retention and detailed image-rights fields.
10. Mother/placement/market/exclusivity representation model.
11. Bookouts and option/hold vocabulary.
12. Application-scoped messaging and report control.
13. Age-band minimization in recipient-facing snapshots rather than routine DOB exposure.
14. The principle that professional materials are purpose-specific rather than one generic gallery.

## Missing capability backlog

### FWBK/event casting

- Partner/recipient role model
- Event and season brief
- Event-specific package and consent
- Runway walk media and brief-specific readiness
- Casting/callback/fitting/rehearsal lifecycle
- Talent-visible selection and decline actions
- Deal memo and work acceptance
- Call sheets and show-week operations
- HMU/appearance consent
- Backstage safety and incident response
- Official partner support and escalation

### Representation

- Offer and agreement workflow
- Contract/version storage and acknowledgement
- Territory/division/service exclusivity detail
- Commission, expenses, statement, payment, and dispute visibility
- Mother/placement authorization and split visibility
- Renewal/termination/notice state
- Agency legitimacy and registry verification

### Professional materials

- Target-pack readiness
- Current-set management
- Digital authenticity/provenance
- Structured credits/training/skills
- Purpose-specific motion media
- Market-local sizing
- Immutable sent-package archive
- Canonical public URLs
- Field/audience preview

### Broader creative-industry support

- Performer/actor resume and reel standards
- Voice reels, accents, home-studio capability
- Dance styles, footwear, certifications, injury/access accommodations
- Host/presenter teleprompter, live, language, and travel capability
- Creator/UGC audience market, usage, conflicts, whitelisting, raw-deliverable, and exclusivity terms
- Parts/fit/beauty/fitness-specific measurements and media
- Union status and market-specific work eligibility where relevant

### Safety, privacy, and trust

- Real adult verification or removal of the claim
- Sensitive-data isolation and per-brief consent
- AI-analysis opt-in, transparency, correction, and isolation from ranking
- Minor jurisdiction engine before any minor launch
- Recruitment scam education and official contact verification
- Confirmed-job safety delivery with access audit and expiry
- Local-draft privacy controls

## FWBK launch gate

### Mandatory even for a narrow registration/pre-screen pilot

1. **Partner-role gate:** signed operating map naming client, event producer, casting decision-maker, model management company, data controller/processor roles, and talent support owner.
2. **Adults-only gate:** written confirmation that no under-18 candidate is routed through Pholio; legacy 13+ copy removed.
3. **Opportunity gate:** configured event, season, dates, eligibility, requested package, decision process, and verified contacts.
4. **Consent gate:** event-specific recipient, purpose, disclosed fields, retention, withdrawal, and immutable talent receipt.
5. **Status gate:** representation statuses repaired; event casting has its own lifecycle.
6. **Trust gate:** official-domain/identity verification and applicable NYSDOL registry checks.
7. **Data gate:** OnlyFans/adult boundaries cannot leak into generic submissions; false adult verification and legacy scoring routes are removed or isolated.
8. **Truth gate:** no false current/unretouched, intent, market, safety-sharing, or “vetted” claims.
9. **End-to-end test:** open-call link → eligibility → exact package review → consent → recipient review → status update → withdrawal/privacy check.

### Additional gates before Pholio can coordinate selected talent or show operations

10. **Terms gate:** compensation, scope, usage, expenses, policies, and versioned talent acceptance.
11. **Commitment gate:** talent-visible options, holds, conflicts, confirmation, release, and acknowledgement.
12. **Operations gate:** fittings, rehearsals, call sheets, venue/access, look assignments, HMU, run of show, and urgent changes.
13. **Safety gate:** emergency data, representative access, anti-harassment/safety policy, backstage/privacy needs, incident reporting, access logs, and expiry.
14. **Live rehearsal:** production test including late schedule change, venue change, fitting conflict, cancellation, and emergency escalation.

## Priority sequence

1. Decide the product boundary and FWBK operating roles.
2. Separate event casting, agency representation, and job booking in data, consent, copy, and statuses.
3. Remove false or unsafe trust states: verified adult, sensitive-social leakage, legacy appearance scoring, misleading analytics, unverified agency claims, and unsupported safety sharing.
4. Repair the professional package truth contract: current digitals, unretouched attestation, immutable sent snapshot, canonical portfolio URL, and avatar separation.
5. If the launch includes selection/coordination, build terms, commitments, fitting/rehearsal/call-sheet operations, notifications, and safety before expanding polish.
6. Replace universal readiness with target packs and add runway/performance/creator capabilities only where the opportunity needs them.
7. Validate the complete flow with FWBK operations, an active runway model, an agency booker, a casting lead, backstage/HMU, and New York counsel.

## Source notes and market variance

- FWBK’s public dates, roles, and intake can change. Its current site announces an October 4–10, 2026 program/partnership; treat public information as provisional until the signed partner brief is supplied. [FWBK current site](https://www.fashionweekbrooklyn.com/).
- “Digitals,” “polaroids,” “snapshots,” “go-see,” “casting,” “option,” and “hold” vary by agency and market. The product should support recipient vocabulary without changing the underlying meaning.
- “Kept on file” is intentionally non-binding and can range from genuine future interest to a polite archive state.
- Digital freshness is contextual. Eight to twelve weeks is a useful operating default in some settings, not a universal rule; material look changes override the calendar. [Storm application guidance](https://www.stormmanagement.com/info/).
- Comp-card dimensions vary by market and agency; 5.5 × 8.5 is credible in the US but should not be presented as universal.
- New York Fashion Workers Act findings are product-risk observations. Counsel must determine which duties attach to each party in the actual FWBK workflow.
- The Act's general responsibilities took effect June 19, 2025, and covered registration requirements took effect December 21, 2025. [NYSDOL Fashion Workers Act overview](https://dol.ny.gov/fashion).

## Final assessment

Pholio does not need more fashion-flavored copy. It needs stronger professional object boundaries. A representation application, an event registration, a casting, a callback, a fitting, an option, a booking, and an active representation agreement are different things. Once the product models those differences faithfully, many of the smaller vocabulary and workflow decisions become straightforward.

The launch-critical standard is simple: talent must always know **who is asking, for what opportunity, why each field is needed, exactly what was sent, what the current status legally and professionally means, what they must do next, what the work pays and permits, and who is responsible for their safety.** The current dashboard cannot yet answer all eight reliably.
