# Pholio Pre-Production Founder Status Report

**Audience:** Pholio cofounders, business/legal advisors, and Fashion Week Brooklyn launch partner
**Prepared:** July 6, 2026
**Document type:** Business/status report for a founder meeting — not a product requirements spec
**Decision window:** Before production launch, before taking meaningful applicant volume, before scaling paid operations

---

## 1. Executive summary

Pholio is no longer just a prototype. The repo now reflects a substantial full-stack product: a talent portfolio and comp-card system, agency application and roster workflows, Studio+ subscription infrastructure, Firebase-backed authentication, Stripe billing, image upload/processing, AI-assisted analysis, and legal/privacy primitives such as consent capture, account deletion, and data export. The business question is no longer “can this be built?” It is “can this be safely launched, supported, paid for, and operated without creating legal, immigration, trust, or infrastructure risk?”

The answer today is: **Pholio is close enough to plan a controlled production launch, but not ready for an unrestricted launch through Fashion Week Brooklyn.** Fashion Week Brooklyn’s reported applicant flow of more than 100 applicants per week changes the launch profile from “friendly beta” to “real public intake.” A partner launch can create immediate trust, brand, data, and support obligations. The platform must be treated as a live business system before the first partner campaign goes out.

The most important pre-production decisions are:

1. **Founder/legal structure must be resolved now.** Equal economic ownership may be possible, but active work by an F-1 student founder is a separate immigration question from passive ownership. This needs coordinated startup counsel and immigration counsel before production operations scale.
2. **Infrastructure must move off fragile free-plan assumptions.** Netlify, Neon, email, object storage, observability, domain/security operations, and AI usage need budgeted production plans and spend caps.
3. **Fashion Week Brooklyn launch must be staged.** A sudden 100+ applicant/week flow is operationally meaningful because it hits onboarding, image upload, AI analysis, PDF generation, email, database, support, moderation, and partner expectation-setting at the same time.
4. **Legal readiness must be treated as a launch blocker.** Terms, privacy, talent/applicant disclosures, minor/guardian workflows, consent logs, subscription terms, refunds, data retention, IP assignments, founder agreements, and partner responsibilities must be settled before the launch channel drives real users.
5. **Studio+ packaging must support adoption first, revenue second.** The free tier should let talent create a credible professional profile and submit enough to understand value. Studio+ should monetize advanced presentation, scale, analytics, export/control, and workflow acceleration — not basic trust or legally necessary controls.

**Recommended operating posture:** Launch as a **controlled partner pilot** rather than a public full production launch. Cap traffic, invite in batches, monitor conversion and support, keep a manual escalation path, and do not let the product imply agency representation, paid work, or guaranteed Fashion Week Brooklyn outcomes unless counsel approves the language.

---

## 2. Current company and product status before production

### 2.1 Company status

Pholio is at the point where business formation, founder ownership, IP assignment, tax/accounting, banking, privacy, subscription billing, launch partnership terms, and production infrastructure are no longer optional cleanup items. They are prerequisites for launch credibility.

Current company-level status appears to be:

- **Cofounder structure:** Two equal cofounders are intended: Lenquan and Natan.
- **Immigration asymmetry:** Lenquan is an international student on F-1 status; Natan is a U.S. citizen. This makes ownership, employment, compensation, founder title, operational control, and active day-to-day work sensitive.
- **Launch partner context:** Fashion Week Brooklyn is tied to launch planning and may bring meaningful applicant volume quickly.
- **Commercial model:** Studio+ exists as a talent subscription concept. Current app documentation references $9.99/month, $95.88/year, and a 14-day trial.
- **Legal surface:** Public legal pages belong in the separate marketing repository, not this app repository, but the app itself already collects data and has workflows that depend on those policies.

### 2.2 Product maturity

Pholio has crossed from prototype into **late pre-production / pilot-ready software**, but not yet into fully hardened production. The architecture has real product breadth:

- Talent-facing portfolio creation.
- Image upload, processing, curation, and storage.
- PDF comp-card generation.
- Agency applications and submission lifecycle.
- Agency roster, inbox, boards, tags, interviews, reminders, messages, overview, and commission-related concepts.
- Firebase authentication plus Express sessions.
- Stripe subscription checkout and webhook lifecycle.
- AI-assisted photo/casting analysis through Groq and semantic search through OpenAI embeddings.
- Transactional email scaffolding.
- Consent, minor, account deletion, data export, and privacy-oriented backend primitives.

The product is therefore strong enough to support a **credible curated pilot**, but production readiness depends on reliability, legal clarity, capacity planning, data protection, and support operations — not merely whether screens exist.

### 2.3 Core systems/workflows that exist

#### Talent systems

- Profile creation and profile strength concepts.
- Portfolio/photo management.
- Image processing with Sharp and optional R2-backed storage.
- Comp-card generation through Puppeteer and PDF workflows.
- Studio+ subscription gating and billing surfaces.
- Agency applications and status tracking.
- Analytics surfaces.
- Settings, account deletion, data export, and legal acceptance primitives.

#### Agency systems

- Agency dashboard APIs and pages.
- Roster and applicant intake workflows.
- Inbox/review flows.
- Casting/board concepts.
- Tags, interviews, reminders, messages, overview, activity timeline, and commission-related workflows.
- RBAC scaffolding.
- Discover/search concepts using embeddings.

#### Platform systems

- Express backend and Vite React SPA.
- Netlify deployment path with serverless function entrypoint.
- Neon/Postgres production database path, SQLite local dev path.
- Firebase authentication.
- Stripe subscriptions and webhooks.
- SMTP transactional email.
- Cloudflare R2/S3-compatible object storage support.
- Groq AI integration.
- OpenAI embeddings integration.
- Rate limiting, sessions, CORS, and error handling.

### 2.4 What is still in audit/redesign

The product has several areas that should be considered **audit-active** before production:

1. **Comp-card reliability.** Existing audit notes indicate the comp-card system is architecturally promising but still has production-trust defects, especially around name placement, saved artifact immutability, and perception/judgment integrations.
2. **Talent overview and application-state presentation.** Existing industry audits flag mismatch between real agency submission outcomes and how status buckets are presented.
3. **Studio+ packaging and copy alignment.** Documentation notes a mismatch between free-tier application limits, landing copy, and app behavior.
4. **Minor/guardian disclosure workflows.** The platform has started addressing minors seriously, but minor data and agency disclosure are legal-risk areas requiring counsel review.
5. **Email production readiness.** If SMTP is not configured, production email can silently become non-operational; this is a serious launch risk for verification, guardian consent, application status, agency invites, and notifications.
6. **Infrastructure/free-plan fragility.** Netlify and Neon free-plan usage is already creating issues before production, according to the launch brief.
7. **Observability and support operations.** Production needs error monitoring, uptime monitoring, user support intake, incident triage, and cost alerts.

### 2.5 What is risky or unresolved

The main unresolved risks are:

- **Immigration risk:** F-1 ownership vs active work, founder role/title, compensation, work authorization, and future visa path.
- **Corporate risk:** No launch should happen until equity, vesting, IP assignment, decision rights, bank/account ownership, and founder exits are clear.
- **Partner-launch risk:** Fashion Week Brooklyn traffic could expose instability, unclear support ownership, ambiguous promises, or legal copy gaps.
- **Data/privacy risk:** Talent profiles include photos, measurements, age/DOB implications, location/market signals, agency submissions, messages, and possibly minors’ data.
- **Subscription risk:** Studio+ billing, trials, cancellation, refund, tax, and plan-benefit disclosures must be precise.
- **Operational risk:** 100 applicants/week is not huge by enterprise standards, but it is enough to break a founder-operated launch if every applicant uploads multiple images, triggers AI analysis, requests PDFs, submits to agencies, receives emails, and asks support questions.
- **Trust risk:** The modeling/talent industry is highly trust-sensitive. Wrong language around representation, casting, payment, or Fashion Week Brooklyn participation can create reputational harm.

### 2.6 Must be complete before production

Before a production launch, Pholio needs:

- Signed founder agreement, IP assignment, and equity/vesting structure.
- Immigration counsel signoff on Lenquan’s allowed and prohibited activities.
- Terms, Privacy Policy, subscription terms, refund/cancellation language, consent language, minor/guardian workflow, and partner-launch disclosures.
- Netlify paid production plan and configured deployment guardrails.
- Neon paid production setup with backups, pooling, monitoring, and migration discipline.
- Production email provider and verified sending domain.
- Production object storage with lifecycle and deletion policy.
- Error monitoring, uptime monitoring, logging, and incident response.
- Stripe live-mode verification, webhook hardening, customer portal, cancellation/refund flow, and pricing-copy alignment.
- Load and smoke testing against the applicant launch scenario.
- Partner launch plan with batch sizes, support owner, escalation channels, and launch copy approved by counsel.

---

## 3. Launch context: Fashion Week Brooklyn

### 3.1 Why the Fashion Week Brooklyn launch matters operationally

Fashion Week Brooklyn reportedly receives **more than 100 applicants per week**. If Pholio is introduced as part of that intake, a nontrivial amount of traffic can arrive immediately. This is not massive internet scale, but it is enough to stress a young platform because each applicant is media-heavy and workflow-heavy.

A realistic launch week could include:

- 100–250 new accounts.
- 500–2,500 image uploads if each applicant uploads 5–10 images.
- Hundreds of image-processing jobs.
- AI analysis requests if enabled on upload/onboarding.
- Dozens or hundreds of PDF comp-card renders.
- Email verification, guardian consent, application updates, and partner-related transactional emails.
- Support questions about login, uploads, accepted formats, partner meaning, subscription, billing, application status, and whether Pholio/Fashion Week Brooklyn guarantees anything.
- Agency/partner staff reviewing applicant inflow and expecting dashboard stability.

The operational load is therefore not just web requests. It is **user trust plus media processing plus partner expectation management**.

### 3.2 What the launch means for the business

A Fashion Week Brooklyn launch would likely be Pholio’s first public trust event. The platform would be seen not only as software but as a gateway attached to a real fashion institution. That creates several business consequences:

- **Higher conversion opportunity:** Talent have a reason to complete profiles quickly.
- **Higher trust burden:** Applicants may assume affiliation, endorsement, selection, representation, or casting opportunity.
- **Higher support burden:** Applicants who believe a real opportunity is attached will ask urgent questions.
- **Higher legal burden:** Marketing language and disclosures must clearly state what Pholio does and does not provide.
- **Higher reliability burden:** Early instability harms both Pholio and the partner relationship.
- **Higher data sensitivity:** Applicants may submit photos, measurements, personal details, social links, and potentially minor-related information.

### 3.3 Is the current setup ready?

**For a controlled pilot:** likely close, if the team completes the launch blockers listed in this document.
**For a broad public launch through Fashion Week Brooklyn:** not yet.

The current setup is not safe enough for an unrestricted launch if:

- Netlify and Neon remain on free plans.
- Production email is not fully verified and monitored.
- Stripe live billing and subscription language are not legally aligned.
- Legal pages and in-app consent language are not finalized.
- The F-1 founder operating role is not clarified.
- No support owner and escalation process exists.
- No launch throttle, waitlist, invite batching, or rollback plan exists.
- No monitoring/cost alerts exist for AI, database, storage, email, and serverless usage.

### 3.4 Recommended Fashion Week Brooklyn launch model

Do **not** launch as “open to everyone immediately.” Launch as a staged partner pilot:

#### Phase 0 — internal production rehearsal

- 20–30 internal/test users.
- Real production environment.
- Real Stripe test-to-live verification.
- Real email domain.
- Real R2/storage.
- Real Neon production database.
- Error monitoring and logs watched live.
- Full account deletion and data export tested.

#### Phase 1 — partner soft pilot

- 25–50 Fashion Week Brooklyn applicants.
- Manual applicant batch import or invite links.
- Support inbox monitored daily.
- Partner dashboard usage observed.
- Freeze noncritical product changes.
- Daily incident/cost review.

#### Phase 2 — controlled weekly intake

- 100 applicants/week accepted into Pholio flow.
- Queue/waitlist if error rate, support load, or infrastructure metrics degrade.
- Publish only approved partner copy.
- Keep manual override tools for refunds, subscription issues, account problems, and mistaken submissions.

#### Phase 3 — public launch

Only after two stable weeks of controlled intake:

- Error rate acceptable.
- Upload/PDF generation reliable.
- Support load understood.
- Database and hosting costs predictable.
- Legal and partner language tested.
- No critical immigration/corporate uncertainty remains.

### 3.5 Launch safety checklist

| Area | Required before partner traffic | Status posture |
|---|---:|---|
| Founder/legal structure | Yes | Blocker until counsel-reviewed |
| F-1 role/work boundaries | Yes | Blocker until immigration counsel-reviewed |
| Terms/Privacy/consents | Yes | Blocker |
| Netlify paid production plan | Yes | Blocker |
| Neon paid production database | Yes | Blocker |
| Email provider configured | Yes | Blocker |
| Object storage configured | Yes | Blocker for media-heavy launch |
| Stripe live billing verified | Yes if Studio+ is offered | Blocker for paid launch |
| Error monitoring | Yes | Blocker |
| Cost alerts | Yes | Blocker |
| Support process | Yes | Blocker |
| Load/smoke test | Yes | Blocker |
| Partner copy approval | Yes | Blocker |

---

## 4. Founder ownership and F-1 immigration issue

> **Important:** This section is not legal advice. It is a risk-framing section for startup counsel and immigration counsel. The team should not rely on this document to decide what Lenquan may do while in F-1 status.

### 4.1 The core distinction: ownership is not the same as work

The key issue is that **equal cofounder ownership and active employment are different legal questions**.

A person may be able to own equity in a company as a passive investor or founder-owner. But actively operating that company — building product, selling, fundraising, signing contracts, hiring, marketing, customer support, managing day-to-day operations, or receiving compensation — can be considered work/employment and may require authorization.

The practical question is not only “Can Lenquan own 50%?” It is:

- What activities can Lenquan perform today while in F-1 status?
- Are any activities authorized through CPT, pre-completion OPT, post-completion OPT, STEM OPT, on-campus employment, or another route?
- Is the work directly related to Lenquan’s field of study if OPT/CPT is used?
- Who supervises, controls, or employs Lenquan?
- Who signs contracts and operates the business day to day?
- Is Lenquan compensated, reimbursed, granted equity for services, or accruing deferred compensation?
- How will this look in a future visa, green card, OPT, STEM OPT, H-1B, O-1, or International Entrepreneur Rule context?

### 4.2 Is equal cofounder ownership possible?

**Potentially yes, but counsel must structure it.** Equal economic ownership is not automatically impossible just because one founder is on F-1 status. The risk is not the spreadsheet saying 50/50. The risk is whether the F-1 founder is actively working without authorization or whether the equity is treated as compensation for unauthorized services.

Counsel should evaluate structures such as:

- Equal founder shares subject to vesting, with Lenquan’s service obligations conditioned on work authorization.
- Lenquan as passive shareholder until authorization permits active work.
- IP assignment and founder equity agreements that recognize contributions without requiring unauthorized ongoing services.
- Natan as the operating officer/authorized U.S. worker during any restricted period.
- A board/manager consent structure where operational authority is clearly allocated.
- Deferred active role that begins only after CPT/OPT/other authorization is approved.
- A future transition plan to OPT, STEM OPT, O-1, H-1B through a company with independent control, or International Entrepreneur Rule if eligible.

### 4.3 F-1 employment/work risk areas

High-risk activities for an F-1 founder without proper authorization can include:

- Coding production features for the company.
- Running customer support.
- Marketing Pholio publicly.
- Negotiating or signing partner agreements.
- Handling sales or subscriptions.
- Managing contractors.
- Fundraising as an active company representative.
- Performing operational work for Fashion Week Brooklyn launch.
- Receiving salary, contractor pay, stipends, or deferred compensation.
- Holding oneself out publicly as an active operator if not authorized.

Lower-risk activities may include purely passive ownership, general ideation, coursework-related activity, or limited preparatory steps — but the boundary is fact-specific and should be confirmed by counsel and the school’s DSO.

### 4.4 CPT, OPT, STEM OPT, and startup work

F-1 students commonly think “I can own it, so I can work on it.” That is not the right analysis.

Counsel should specifically address:

- Whether CPT is available through Lenquan’s school and program.
- Whether Pholio work can qualify as curricular practical training.
- Whether post-completion OPT would allow self-employment or employment by the startup.
- Whether STEM OPT is possible and, if so, whether Pholio can meet E-Verify, training-plan, employer-supervision, wage, and bona fide employer requirements.
- Whether a self-owned startup creates control/supervision problems under STEM OPT.
- Whether Natan or an independent board can create sufficient employer control for future visa strategies.
- Whether O-1, H-1B, International Entrepreneur Rule, or another route is more appropriate.

USCIS describes practical training as employment directly related to a student’s major area of study, and DHS/Study in the States materials emphasize that F-1 entrepreneurship involving work requires proper employment authorization. USCIS also maintains an entrepreneur-options resource and an International Entrepreneur Rule pathway for some founders. These are starting points for counsel, not substitutes for advice.

### 4.5 Safer near-term operating posture

Until counsel gives a written plan, the conservative posture is:

- Natan acts as the U.S.-authorized operating founder for external business operations.
- Lenquan does not perform unauthorized active work.
- Any work Lenquan performs is mapped to an approved authorization category or stopped.
- Founder title, public website/team copy, investor decks, partner emails, and contracts avoid implying unauthorized active employment.
- Equity documents separate ownership from current active operating obligations.
- IP already created is assigned correctly, but future contribution obligations are immigration-compliant.
- Compensation, reimbursements, and deferred salary are not promised without counsel.
- A written memo from immigration counsel defines allowed activities, prohibited activities, documentation, and future visa strategy.

### 4.6 Questions for startup counsel

1. What entity should Pholio use now — Delaware C-Corp, LLC, or other?
2. If venture funding is plausible, should the company form as a Delaware C-Corp immediately?
3. Can the founders hold 50/50 equity, and should it vest over time?
4. How should vesting work if one founder cannot legally work actively yet?
5. Should there be a board, manager, or officer structure that creates operational control separate from passive ownership?
6. Who owns the current code, designs, brand, domain, data, Stripe account, Netlify account, Neon account, Firebase project, and social handles?
7. What IP assignment is needed from each founder and any contributors?
8. Who can sign the Fashion Week Brooklyn agreement?
9. What partner agreement, data processing terms, liability limits, and launch disclaimers are needed?
10. What insurance should be in place before launch?
11. How should paid Studio+ revenue flow through company accounts?
12. How should taxes, accounting, and founder reimbursements be handled?

### 4.7 Questions for immigration counsel

1. Can Lenquan own 50% of Pholio while in F-1 status?
2. What active activities can Lenquan legally perform today, if any?
3. Does coding, design, customer support, product management, investor outreach, or partner planning count as work?
4. Can Lenquan be listed publicly as cofounder? If yes, with what wording?
5. Can Lenquan receive founder equity now? If yes, can it vest based on time or milestones?
6. Can Lenquan receive distributions, dividends, reimbursements, salary, contractor pay, or deferred compensation?
7. Is CPT available and appropriate for Pholio work?
8. Is post-completion OPT available and appropriate for Pholio work?
9. Is STEM OPT possible with Pholio? What employer-control, E-Verify, wage, and training-plan requirements must be met?
10. Would a 50/50 structure create future H-1B employer-control issues?
11. Is O-1 a viable path, and what evidence should the company start preserving?
12. Is International Entrepreneur Rule plausible if Pholio raises funding or receives qualifying grants?
13. What records should be kept to distinguish passive ownership from active work?
14. What should Lenquan avoid doing before authorization is secured?

### 4.8 Decision needed before launch

Before production launch, the founders need a written answer to this:

> **Who is legally allowed to operate Pholio, sign launch commitments, support users, accept money, and perform company work during the Fashion Week Brooklyn launch?**

If that answer is unclear, production launch should pause.

---

## 5. Legal readiness beyond immigration

> **Important:** This section is a business/legal issue map for counsel. It is not legal advice.

### 5.1 Company formation

Before launch, Pholio should have a formed legal entity that owns the business assets. If the company expects outside investment, a Delaware C-Corp is often the default startup structure; if the company is intended to remain founder-owned or cash-flow-oriented, counsel may evaluate LLC or other options. The decision should account for F-1 constraints, investor expectations, tax treatment, founder ownership, and future visa strategy.

Required decisions:

- Entity type and state.
- Registered agent.
- EIN.
- Bank account.
- Accounting system.
- Founder equity issuance.
- Cap table recordkeeping.
- Tax election if applicable.
- Who has signing authority.

### 5.2 Founder agreements

A founder agreement should cover:

- Equity split.
- Vesting schedule.
- Cliff and acceleration.
- Role expectations.
- Immigration-conditioned work obligations.
- Decision rights.
- Deadlock resolution.
- Founder departure.
- Repurchase rights.
- Non-solicit/confidentiality terms where enforceable.
- IP ownership.
- Domain/account ownership.
- Expense reimbursement.
- Compensation policy.

For a 50/50 team, **deadlock planning is not optional**. If ownership is equal, there must be a way to resolve disputes around fundraising, partner commitments, hiring, pricing, shutdown, sale, or pivot.

### 5.3 IP assignment

Pholio must make sure the company owns:

- Source code.
- UI designs.
- Brand identity.
- Copy and documentation.
- Domain names.
- Social handles.
- Database schemas.
- AI prompts and workflows.
- Generated templates and PDF design systems.
- Marketing assets.
- Any contractor/freelancer work.

Every founder and contributor should sign IP assignment. If Lenquan’s immigration status affects active work, counsel should still structure ownership of past contributions without creating unauthorized future-work obligations.

### 5.4 Terms of Service

The Terms should clearly state:

- Pholio is a portfolio/application workflow platform, not an agency and not a guarantee of representation, jobs, runway placement, casting, Fashion Week Brooklyn selection, income, or bookings.
- Talent are responsible for accuracy of submitted data, measurements, images, permissions, and releases.
- Agencies/partners are responsible for their own decisions and compliance.
- Pholio may moderate, remove, or restrict content.
- Studio+ subscription terms, trial, renewal, cancellation, and refunds.
- User-generated content license to operate the service.
- Account termination rules.
- Dispute resolution, governing law, liability limits, and warranty disclaimers.
- Minor use restrictions and guardian obligations.
- Prohibited content and conduct.

### 5.5 Privacy Policy

The Privacy Policy must map the actual product, not generic SaaS copy. Pholio handles sensitive talent-related data:

- Names and contact details.
- Login/auth identifiers.
- Photos and image metadata.
- Measurements/stats.
- DOB or age-related information.
- Guardian information for minors.
- Agency applications and statuses.
- Messages and notes.
- Subscription/payment metadata.
- Analytics and usage events.
- AI analysis outputs.
- IP addresses and device/browser data.

The policy should cover:

- What data is collected.
- Why it is collected.
- Who receives it.
- Agency/partner disclosure.
- AI processing and third-party processors.
- Storage and retention.
- Account deletion and data export.
- Security practices.
- Minors/guardian handling.
- State privacy rights, especially for U.S. users.
- International data transfer if relevant.

### 5.6 Consent, applicant disclosures, and partner launch language

The Fashion Week Brooklyn launch needs special applicant-facing disclosure. At minimum:

- What submitting through Pholio means.
- Whether Fashion Week Brooklyn will review the submission.
- Whether Pholio shares the profile/comp card/images with Fashion Week Brooklyn.
- Whether Pholio shares data with agencies or only selected partner staff.
- Whether a Studio+ subscription affects application review. Ideally it should not.
- Whether applicants can apply without paying.
- Whether Pholio or Fashion Week Brooklyn guarantees selection. They should not.
- How applicants can withdraw, delete, or correct data.
- How minors participate, if allowed.

Avoid claims like:

- “Get discovered.”
- “Guaranteed agency exposure.”
- “Fast-track your casting.”
- “Official representation pipeline.”
- “AI-approved talent.”

Use language closer to:

- “Create a polished application profile.”
- “Submit materials for review.”
- “Track your submission status.”
- “Keep your portfolio and comp card organized.”

### 5.7 Studio+ legal/billing implications

Studio+ requires:

- Clear price display before checkout.
- Trial length and renewal date.
- Cancellation instructions.
- Refund policy.
- What happens when subscription lapses.
- No pay-to-be-selected implication.
- No dark patterns around cancellation.
- Stripe Customer Portal enabled.
- Receipts and tax treatment.
- Support process for billing issues.
- Chargeback/dispute response process.

If Studio+ is offered during the Fashion Week Brooklyn launch, copy must say that Studio+ improves Pholio tooling, presentation, analytics, or workflow — **not selection chances**.

### 5.8 Data/privacy implications of a talent platform

Pholio is not just storing generic profile data. It stores material that can affect a person’s career and privacy. This raises the bar for:

- Access control.
- Agency visibility settings.
- Partner data-sharing boundaries.
- Audit logs.
- Deletion and retention.
- Consent logs.
- Minor data restrictions.
- Image moderation.
- Clear profile visibility states.
- Security review.

Talent measurements, DOB/age, photos, and agency outcomes should be treated as sensitive even if not all of them are legally “sensitive personal information” in every jurisdiction.

### 5.9 Minors

Minors are a P0 legal and trust area. If Pholio allows under-18 talent:

- Guardian consent must be explicit and logged.
- Consent must distinguish account creation, data collection, and disclosure to a specific agency/partner.
- Minor profiles should have stricter visibility defaults.
- Applicant-facing language must avoid adult assumptions.
- Support must be ready for guardian requests.
- Counsel should review child privacy, work permit, agency disclosure, and state-law implications.

If the team cannot fully support minors before launch, the safer business decision may be to **exclude minors from the first Fashion Week Brooklyn pilot** or require manual guardian-reviewed handling only.

### 5.10 AI and automated assessment disclosure

If Pholio uses Groq or OpenAI to analyze photos, rank applicants, generate recommendations, or power agency discovery, legal copy should explain:

- What AI features do.
- Whether AI affects application review.
- Whether humans make final decisions.
- Whether images or profile text are sent to third-party AI providers.
- Whether users can opt out of optional AI processing.
- Whether AI outputs are advisory and may be wrong.

Do not market AI scoring as objective judgment of talent potential. In this industry, that can damage trust and invite bias/fairness scrutiny.

### 5.11 Insurance and risk transfer

Before production, ask counsel/broker about:

- General liability.
- Technology errors and omissions.
- Cyber liability.
- Media liability if using images and content.
- Directors and officers insurance if fundraising.
- Employment practices liability later.

A partner launch increases the value of insurance because reputational and privacy issues can involve multiple organizations.

---

## 6. Infrastructure and production readiness

### 6.1 Production architecture reality

Pholio’s current stack includes:

- Netlify for app hosting/serverless deployment.
- Neon/Postgres for production database.
- Firebase for authentication.
- Stripe for subscriptions.
- Cloudflare R2 or S3-compatible storage for uploaded media.
- SMTP provider for transactional email.
- Groq for AI photo/casting analysis.
- OpenAI for embeddings/discover search.
- Puppeteer/Chromium for PDF generation.
- Sharp for image processing.

This is a reasonable early-stage architecture, but it has important production risks:

- Serverless cold starts and timeouts around Puppeteer/PDF generation.
- Media-heavy upload bursts.
- Database connection pooling and migration safety.
- AI rate limits and variable cost.
- Email deliverability and domain reputation.
- Privacy/security around image storage and deletion.
- Lack of monitoring if not explicitly added.

### 6.2 Netlify recommendation

**Recommendation:** Move to **Netlify Pro** before production and budget for usage overages. Consider Enterprise only if partner obligations require SLA, advanced security, or higher support.

Current Netlify pricing materials list:

- Free: $0.
- Personal: $9/month.
- Pro: $20/month with unlimited members and higher included credits.
- Enterprise: custom, starting around $500/month.

For Pholio, Pro is the minimum credible plan because the app has:

- Production app hosting.
- Serverless backend entrypoint.
- Media upload and PDF-related workflows.
- Multiple collaborators.
- Need for build/deploy metrics.
- Need to avoid free-tier fragility during partner launch.

**Production note:** Netlify Pro does not by itself solve backend scalability. Pholio should still load-test serverless function paths, especially upload, onboarding, PDF generation, Stripe webhooks, and agency dashboards.

### 6.3 Neon recommendation

**Recommendation:** Move Neon to a paid **Launch** plan for early production, with autoscaling configured, backups/recovery verified, and spend alerts. Consider **Scale** only if production metrics require higher limits, more demanding support, or sustained throughput.

Current Neon pricing materials describe usage-based compute:

- Launch compute: about $0.106 per CU-hour.
- Scale compute: about $0.222 per CU-hour.
- Storage around $0.35/GB-month.
- Free plan includes limited storage/compute per project and can scale to zero when idle.

For Pholio, Launch is the right initial production posture because:

- The expected launch load is meaningful but not enterprise-scale.
- Cost can remain low if compute scales down.
- The platform needs production reliability beyond free-tier limits.
- Database cost should be monitored before committing to a higher tier.

**Must configure before launch:**

- Connection pooling.
- Database backups and restore test.
- Migration runbook.
- Separate production/staging branches or projects.
- Query monitoring for slow agency/talent dashboards.
- Storage growth monitoring due to profiles, applications, sessions, events, AI caches, and messages.

### 6.4 Cloudflare R2 / object storage recommendation

**Recommendation:** Use Cloudflare R2 with billing enabled, production bucket separation, access controls, lifecycle policy, and deletion verification.

R2 is attractive because current pricing includes:

- Free monthly allocation for storage and operations.
- Paid standard storage around $0.015/GB-month.
- Class A operation charges for writes/lists/mutations.
- Class B operation charges for reads.
- No egress bandwidth charges.

For a media-heavy talent platform, R2 is likely a strong fit. The cost risk is not egress; it is storage growth and request volume. If 100 applicants/week upload 10 images each, and each original plus processed variants totals 5–15 MB, monthly storage could grow by tens of GB. That is still inexpensive on R2, but deletion, privacy, and access-control correctness matter more than raw cost.

### 6.5 Firebase recommendation

**Recommendation:** Use Firebase Authentication in production with billing and quota monitoring enabled. Avoid SMS/phone auth at launch unless there is a specific reason and budget.

Firebase’s standard email/password and social auth can be inexpensive at early scale, but production needs:

- Verified auth domain.
- Authorized domains set correctly.
- Admin SDK credentials secured.
- User deletion path tested.
- Password reset and verification flows tested.
- Billing/quota monitoring enabled.
- No phone auth unless needed, because SMS can create variable costs.

### 6.6 Stripe recommendation

**Recommendation:** Keep Stripe as the subscription provider, but do not launch Studio+ publicly until live-mode setup, webhook verification, cancellation, refund, and pricing-copy alignment are complete.

Stripe cost areas:

- Standard online card processing, commonly listed at 2.9% + $0.30 per successful charge in the U.S.
- Stripe Billing fees for recurring subscriptions, currently described as usage-based on billing volume.
- Disputes/chargebacks.
- Refunds do not always return processing fees depending on Stripe/account terms.

For a $9.99/month Studio+ plan, payment fees materially affect unit economics. A rough example:

- $9.99 gross monthly subscription.
- Approximate card processing: $0.59 per transaction at 2.9% + $0.30.
- Approximate Stripe Billing fee if 0.7%: $0.07.
- Net before infrastructure/support/tax/refunds: about $9.33.

This is viable, but only if support and variable AI/PDF costs are controlled.

### 6.7 Groq recommendation

**Recommendation:** Do not rely on Groq free tier for production launch. Set up paid billing or explicit rate-limit plan, then cap usage by feature.

Groq is useful for fast AI analysis, but AI calls are variable-cost and rate-limit-sensitive. Production rules should be:

- No unbounded AI calls on every page load.
- Run expensive analysis asynchronously where possible.
- Cache AI outputs.
- Limit re-analysis frequency.
- Degrade gracefully when Groq fails.
- Disable optional AI during incidents.
- Track cost per applicant and cost per Studio+ subscriber.

### 6.8 OpenAI embeddings recommendation

**Recommendation:** Keep OpenAI embeddings for agency Discover if it is actively used, but make it background/cached and cost-capped.

Embedding costs are usually manageable at early scale, but risks include:

- Backfills over all talent.
- Re-embedding too often.
- Semantic search being used as a default path when simple filters would do.
- Lack of monitoring around token usage.

### 6.9 Email recommendation

**Recommendation:** Use Resend Pro or comparable transactional email provider before launch.

Resend’s current public pricing lists:

- Free: 3,000 emails/month.
- Pro: $20/month for 50,000 emails/month with overages around $0.90 per 1,000.
- Scale: $90/month for 100,000 emails/month.

For Pholio, Pro is the practical minimum because production email affects:

- Verification.
- Password reset.
- Guardian consent.
- Application updates.
- Agency invites.
- New-message notifications.
- Billing/support communications.

Email failure during a partner launch can look like product failure, not just infrastructure failure.

### 6.10 Monitoring and observability recommendation

**Recommendation:** Add Sentry Team or equivalent before launch, plus uptime monitoring.

Sentry pricing currently shows a free Developer tier and paid team/business tiers, with Team commonly around $26–$29/month and Business around $80/month depending on billing. Pholio should budget at least Team-level monitoring because a founder launch needs:

- Frontend error tracking.
- Backend/serverless exception tracking.
- Release tracking.
- Alerting.
- Performance traces on slow routes.
- Error spikes during partner launch.

Add separate uptime monitoring such as Better Stack, Checkly, or UptimeRobot if Sentry is not enough for external checks.

### 6.11 Production readiness checklist

| System | Minimum production requirement |
|---|---|
| Netlify | Pro plan, env var audit, deploy previews, rollback, usage alerts |
| Neon | Paid Launch plan, backups, pooling, restore test, migration runbook |
| R2/storage | Production bucket, billing, private/public access rules, deletion test |
| Firebase | Production project/domain, billing/quota alerts, auth flows tested |
| Stripe | Live products/prices, webhook endpoint, portal, refund/cancel support |
| Email | Verified domain, SPF/DKIM/DMARC, provider plan, send monitoring |
| Groq | Paid/rate-limit plan, caching, graceful degradation, cost cap |
| OpenAI | API key, usage cap, embedding cache, backfill guardrails |
| Monitoring | Sentry or equivalent, uptime checks, alert routing |
| Security | Secret rotation, least privilege, dependency audit, CSP/headers review |
| Support | Shared inbox, owner, response templates, escalation process |

---

## 7. Financial planning

### 7.1 Pre-launch one-time / immediate costs

| Category | Likely action | Estimated cost |
|---|---|---:|
| Startup counsel | Formation, founder docs, IP assignment, partner agreement review | $2,000–$8,000+ |
| Immigration counsel | F-1 founder memo and visa strategy | $500–$3,000+ |
| Accounting/tax setup | EIN, bookkeeping, chart of accounts, founder reimbursements | $300–$1,500 |
| Domain/email setup | Domain, DNS, email authentication | $20–$200 |
| Insurance review | Broker consultation; policy may start later | $0–$1,000+ upfront |
| Production rehearsal | Testing accounts, small paid service setup | $100–$500 |
| Branding/legal copy review | Terms, privacy, partner launch copy | Included in counsel or $500–$3,000 |

**Minimum practical pre-launch cash need:** about **$4,000–$12,000** if counsel is lean. More if corporate/immigration complexity is significant.

### 7.2 Monthly recurring infrastructure budget

| Service | Recommended launch plan | Estimated monthly cost |
|---|---|---:|
| Netlify | Pro | $20+ usage |
| Neon | Launch usage-based | $10–$100 early, monitor closely |
| Cloudflare R2 | Usage-based | $0–$25 early |
| Resend | Pro | $20 |
| Sentry | Team | $26–$29 |
| Uptime monitoring | Basic paid or free | $0–$30 |
| Firebase Auth | Mostly usage-based; avoid SMS | $0–$25 early |
| Stripe | Per transaction/subscription | Variable |
| Groq | Usage-based / paid developer | $0–$100+ depending usage |
| OpenAI embeddings | Usage-based | $0–$50 early |
| Domain/DNS/misc | Amortized | $2–$20 |
| Support inbox/helpdesk | Basic shared inbox initially | $0–$30 |

**Minimum safe infrastructure budget:** **$150–$400/month**.
**More realistic early launch budget with cushions:** **$300–$750/month**.
**With counsel/accounting amortized and partner support:** **$1,000–$3,000/month operational runway** is more realistic.

### 7.3 Variable-cost risk areas

The biggest cost spikes are likely:

1. **AI usage** — repeated photo analysis, reranks, or uncached analysis.
2. **PDF generation** — serverless compute and Puppeteer runtime pressure.
3. **Image storage and processing** — upload bursts and variants.
4. **Email volume** — verification, reminders, status updates, partner launch sequences.
5. **Database compute** — always-on or high-CU database settings.
6. **Serverless web requests** — partner campaign spikes.
7. **Stripe disputes/refunds** — if users misunderstand Studio+ value or launch affiliation.
8. **Support time** — founder time is the hidden cost that can dominate early launch.

### 7.4 Unit economics rough model

If Studio+ remains $9.99/month:

- 100 free applicants, 5% convert = 5 subscribers = about $50 gross MRR.
- 100 free applicants, 10% convert = 10 subscribers = about $100 gross MRR.
- 400 applicants/month, 5% convert = 20 subscribers = about $200 gross MRR.
- 400 applicants/month, 10% convert = 40 subscribers = about $400 gross MRR.

At early volume, Studio+ will not fully cover counsel, support, or robust infrastructure. It can offset operating costs, but the first launch should be measured as a **validation and partner-growth launch**, not a cash-flow-positive launch.

### 7.5 Minimum safe operating budget

For the first 60–90 days, plan as if Pholio needs:

- **$4,000–$12,000 pre-launch** for legal/company setup.
- **$300–$750/month** for production SaaS/infrastructure.
- **$500–$2,000/month** for legal/accounting/support contingency.
- **$1,000–$3,000/month total safe operating cushion**, excluding founder salaries.

If money is tight, do not cut legal/immigration review. Cut scope, launch volume, AI usage, and nonessential polish first.

---

## 8. Studio+ packaging

### 8.1 Strategic principle

Studio+ should monetize **professional leverage**, not basic participation. Talent should be able to create a credible profile and apply without paying. Paid features should help serious talent present better, understand performance, move faster, export better materials, and control more of their professional presence.

If Studio+ feels like a toll booth in front of Fashion Week Brooklyn access, it will damage trust.

### 8.2 What should stay free

Free should include:

- Account creation.
- Basic profile.
- Core measurements/stats.
- A limited but credible portfolio.
- Basic image upload/management.
- One usable comp-card/default presentation.
- Ability to submit to Fashion Week Brooklyn or launch partner flow.
- Basic application status visibility.
- Privacy/account controls.
- Account deletion and data export.
- Guardian/minor safety controls if minors are allowed.
- Basic support for login, upload, and submission problems.

Free must be good enough that an applicant can participate without paying.

### 8.3 What should go into Studio+

Studio+ should likely include:

- More portfolio images/storage.
- Multiple comp-card designs or saved comp-card presets.
- Advanced comp-card customization.
- Higher-quality exports/downloads.
- Custom public portfolio link or richer profile presentation.
- Advanced analytics: profile views, comp-card downloads, link clicks, agency engagement.
- Application history and richer status timeline.
- More agency submissions beyond the free limit, if legally and strategically appropriate.
- AI-assisted curation and photo recommendations with clear disclaimers.
- Priority processing for PDF generation or analysis.
- Versioned portfolio/comp-card snapshots.
- Possibly custom branding/removal of Pholio watermark — but be careful because Pholio branding can also build trust.

### 8.4 What should not be paid-only

Do not put these behind Studio+:

- Legal/privacy controls.
- Account deletion.
- Data export.
- Consent controls.
- Guardian/minor safety.
- Ability to correct inaccurate profile information.
- Basic submission to a launch partner if the partner campaign implies access.
- Basic application status.
- Security features.

### 8.5 Packaging recommendation

Use a simple two-tier model for launch:

#### Free

“Create and submit a professional Pholio.”

- Profile.
- Starter portfolio.
- One core comp card.
- Fashion Week Brooklyn submission flow.
- Limited agency submissions.
- Basic status tracking.

#### Studio+

“Upgrade the way your book travels.”

- Expanded portfolio capacity.
- Advanced comp-card styles/exports.
- AI curation assistant.
- Analytics.
- More saved versions.
- More submissions or advanced submission tools.
- Premium public presentation.

Avoid agency-facing paid tiers until the agency workflow is validated. For agencies, use “contact sales” or pilot agreements first.

### 8.6 Pricing view

At $9.99/month, Studio+ is accessible to emerging talent. The annual $95.88 option is sensible if framed as two months free. However:

- Do not require Studio+ for partner submission.
- Do not imply paid users are reviewed more favorably.
- Make cancellation easy.
- Consider a launch coupon or partner code only if it does not confuse fairness.
- Consider delaying aggressive monetization until after the first partner cohort if trust is the priority.

---

## 9. Operational readiness

### 9.1 Support readiness

A Fashion Week Brooklyn launch needs a defined support operation:

- Support email address.
- Named support owner.
- Response-time target.
- Launch-week daily triage.
- Templates for login, upload, billing, partner-submission, minors, deletion, and status questions.
- Escalation path to technical founder.
- Escalation path to partner contact.
- Refund/billing process.
- Abuse/moderation process.

### 9.2 Internal admin tools

Before launch, founders should be able to:

- Find a user by email.
- See onboarding/application status.
- Confirm email verification.
- Resend important emails.
- See upload errors.
- See subscription status.
- Cancel/refund through Stripe.
- Delete/export user data.
- Manually resolve stuck applications.
- Flag or remove inappropriate images.

If admin tools do not exist, create a manual database/runbook process for the first pilot — but keep access restricted and audited.

### 9.3 Incident response

Create a one-page incident runbook:

- What counts as P0/P1/P2.
- Who is on call during launch week.
- How to pause signups or switch to waitlist.
- How to disable AI features.
- How to disable Studio+ checkout.
- How to roll back Netlify deploys.
- How to restore database backup.
- How to communicate with Fashion Week Brooklyn.
- How to communicate with users if data, billing, or submission flow breaks.

### 9.4 Trust and safety

Because Pholio handles talent imagery, trust and safety must include:

- Prohibited content policy.
- Image moderation/flagging.
- Report user/profile flow eventually.
- Minor handling.
- Agency access controls.
- Prevention of fake agency accounts.
- Clear separation between agencies, partners, and Pholio staff.

Fake agencies/scouts are an industry reality. If Pholio allows agency onboarding broadly, verification becomes a major trust requirement.

---

## 10. Security and privacy readiness

Minimum production controls:

- Secret audit and rotation before launch.
- Remove any committed live credentials.
- Separate production and development credentials.
- Least-privilege API keys.
- Strong session secret.
- Secure cookies in production.
- CORS restricted to production domains.
- Rate limits on auth, upload, onboarding, and AI-triggering routes.
- File validation for uploads.
- Malware/content moderation plan.
- Account deletion tested across database, Firebase, and R2.
- Data export tested.
- Backups and restore tested.
- Access log and admin access policy.

A partner launch should not proceed if production secrets, user deletion, or auth flows are sloppy.

---

## 11. Business decisions that must be made now

### 11.1 Founder/company decisions

- Entity type.
- Equity split and vesting.
- Immigration-compliant roles.
- Who can sign contracts.
- Who owns active operations.
- IP assignment.
- Deadlock resolution.
- Bank/account ownership.
- Accounting and taxes.

### 11.2 Launch decisions

- Is Fashion Week Brooklyn launch a pilot or public launch?
- How many users in the first batch?
- Is Studio+ offered during the first cohort?
- Are minors allowed in the first cohort?
- Who handles support?
- What is the pause/rollback condition?
- What exact partner language is approved?

### 11.3 Product/business decisions

- Free submission limit.
- Studio+ benefits.
- Studio+ price and trial.
- Refund policy.
- Agency pricing posture.
- AI feature positioning.
- Whether AI affects any partner review.
- Data-sharing scope with Fashion Week Brooklyn.

### 11.4 Infrastructure decisions

- Netlify Pro start date.
- Neon Launch configuration.
- R2 bucket and domain structure.
- Email provider and sending domain.
- Monitoring provider.
- Cost alert thresholds.
- Production owner for deployments.

---

## 12. Recommended 30-day action plan

### Week 1 — legal/company/immigration blockers

- Meet startup counsel.
- Meet immigration counsel.
- Decide entity structure.
- Draft founder agreement and IP assignment.
- Get written F-1 role guidance.
- Draft Fashion Week Brooklyn partner terms/disclosures.
- Freeze public claims until approved.

### Week 2 — production infrastructure

- Upgrade Netlify.
- Move Neon to paid production posture.
- Configure R2 production bucket.
- Configure Resend or equivalent email.
- Configure Sentry and uptime monitoring.
- Rotate secrets.
- Verify Stripe live mode.
- Add cost alerts.

### Week 3 — launch rehearsal

- Run production smoke test.
- Test sign up/login/password reset/email verification.
- Test upload/onboarding/application.
- Test comp-card/PDF generation.
- Test Studio+ checkout/cancel/refund if offered.
- Test account deletion/export.
- Test 25–50 simulated applicant flow.
- Prepare support macros and incident runbook.

### Week 4 — controlled partner pilot

- Invite first Fashion Week Brooklyn batch.
- Monitor errors, email, database, serverless, storage, AI, and support daily.
- Hold daily founder review.
- Capture user confusion and support topics.
- Do not expand until metrics are stable.

---

## 13. Meeting agenda for cofounder + Fashion Week Brooklyn partner

### Part 1 — status alignment

- What Pholio can do today.
- What remains unresolved before production.
- What is launch-blocking vs nice-to-have.

### Part 2 — partner launch scope

- Confirm expected applicant volume.
- Confirm how Fashion Week Brooklyn wants applicants to enter Pholio.
- Confirm what partner staff need to see.
- Confirm applicant communication language.
- Confirm whether minors are in scope.
- Confirm timeline and batch sizes.

### Part 3 — legal and ownership

- Founder structure and signing authority.
- Immigration constraints.
- Terms/privacy/consent obligations.
- Partner agreement and data-sharing terms.

### Part 4 — operating budget

- Pre-launch legal costs.
- Monthly production costs.
- Variable-cost risks.
- Who pays what and when.

### Part 5 — launch/no-launch decision

Use this decision rule:

> Pholio launches with Fashion Week Brooklyn only if legal/immigration roles are clarified, paid production infrastructure is configured, legal disclosures are approved, support is staffed, and the first cohort is capped.

---

## 14. Source notes and external references

This report uses Pholio repository context plus current public pricing/legal reference points as of July 6, 2026. Pricing changes frequently; confirm before purchasing.

### Product/repo references

- `README.md` — product overview, features, stack, Firebase/Stripe/Groq/OpenAI references, production environment guidance.
- `.env.example` — production connector assumptions: Neon/Postgres, Groq, OpenAI, Stripe, SMTP, R2-style upload configuration.
- `docs/stripe-billing-alignment.md` and `docs/stripe-live-setup.md` — Studio+ pricing and Stripe live setup notes.
- `docs/comp-card-audit-2026-07/README.md` — comp-card production audit and remaining trust risks.
- `docs/talent-submission-lifecycle.md` and `docs/talent-overview-industry-audit.md` — industry-state audit for agency submissions and overview presentation.
- `docs/email-setup.md` — transactional email setup and production warning.
- `migrations/20260628120000_add_minor_agency_consents.js` — scoped minor agency consent model.
- `migrations/20260701110000_create_account_deletion_failures.js` — account deletion failure tracking.

### Pricing references checked

- Netlify pricing: https://www.netlify.com/pricing/
- Netlify pricing updates: https://www.netlify.com/changelog/2026-04-14-pricing-updates-april-2026/
- Neon pricing: https://neon.com/pricing
- Neon plans docs: https://neon.com/docs/introduction/plans
- Groq pricing: https://groq.com/pricing
- Groq rate limits: https://console.groq.com/docs/rate-limits
- Firebase pricing: https://firebase.google.com/pricing
- Stripe pricing: https://stripe.com/pricing
- Stripe Billing pricing: https://stripe.com/billing/pricing
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Resend pricing: https://resend.com/pricing
- Sentry pricing: https://sentry.io/pricing/

### Immigration/legal framing references checked

- USCIS entrepreneur options: https://www.uscis.gov/working-in-the-united-states/options-for-alien-entrepreneurs-to-work-in-the-united-states
- USCIS International Entrepreneur Rule: https://www.uscis.gov/working-in-the-united-states/international-entrepreneur-rule
- USCIS practical training policy manual: https://www.uscis.gov/policy-manual/volume-2-part-f-chapter-5
- DHS Study in the States, international students and entrepreneurship: https://studyinthestates.dhs.gov/international-students-and-entrepreneurship
- DHS Study in the States, F-1 OPT: https://studyinthestates.dhs.gov/sevis-help-hub/student-records/fm-student-employment/f-1-optional-practical-training-opt
- ICE SEVIS employment overview: https://www.ice.gov/sevis/employment
- WashU OISS entrepreneurial activities guidance: https://oiss.washu.edu/entrepreneurial-activities/

---

## 15. Bottom line

Pholio is credible enough to take seriously and close enough to production that the next decisions are business decisions, not just engineering decisions.

The company should not treat Fashion Week Brooklyn as a casual launch channel. It should treat it as a controlled market-entry event with legal, immigration, infrastructure, support, and brand consequences.

**Recommended decision:** proceed toward a controlled Fashion Week Brooklyn pilot only after counsel clears the founder/immigration structure, production infrastructure is upgraded, legal disclosures are approved, and the first cohort is capped and actively monitored.
