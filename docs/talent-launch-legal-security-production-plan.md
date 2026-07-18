# Talent Launch Legal, Security, and Production Readiness Plan

**Status:** NO-GO for public production launch
**Scope:** Talent login, onboarding, portfolio, dashboard, submissions, messaging, subscriptions, public profiles, media, AI, Fashion Week Brooklyn launch, and supporting operations
**Prepared:** July 18, 2026
**Legal-document version:** `2026-07-18`

## 1. Objective

This plan combines the legal-readiness review with the earlier security and production-readiness audit. It is the single launch backlog for the Talent experience.

Publishing updated Terms, Privacy, AI, Cookie, Copyright/DMCA, Community/Safety, and Submission notices is necessary but does not make a missing product control or operating procedure real. Every commitment in a public document must have all four of the following:

1. a product or infrastructure control;
2. a named operational owner;
3. a tested procedure for failure and escalation; and
4. retained evidence that the control operated.

## 2. Launch decision and permitted test modes

| Mode | Decision | Conditions |
|---|---|---|
| Local/internal testing with synthetic data | GO | No real Talent data; production credentials prohibited. |
| Staff-only production smoke test | CONDITIONAL | Named accounts, private media, logging review, no public portfolios, no external submissions. |
| Closed 18+ FWB pilot with real data | NO-GO today | Can become conditional only after every P0 gate in Section 5 is closed. |
| Public Talent launch for 100–200 users | NO-GO | Requires P0 closure, production exercise, counsel sign-off, and launch evidence packet. |
| Minor-inclusive launch | NO-GO | Requires the separate minor/child-performer program in Workstream D. |
| AI-ranked or paid-priority FWB launch | NO-GO | Requires classification, consent, bias/AEDT, and opportunity-specific approval. |

The 100–200-user forecast is useful for capacity planning but is not a safe harbor from COPPA, the New York Child Data Protection Act, New York SHIELD Act, child-performer rules, federal reporting duties, or the TAKE IT DOWN Act.

## 3. Recommended launch posture

The shortest defensible path is:

- verified 18+ users only;
- United States-only eligibility and marketing;
- free FWB submission with no Studio+ advantage or upsell in the path;
- manual, unranked human selection;
- AI image analysis, profile embeddings, match scoring, and learned ranking disabled for FWB;
- private profiles and private media by default;
- an executed FWB/BK Style agreement;
- an FWB-specific applicant notice shown before submission;
- no publicity use without a separate release;
- named security, privacy, support, and safety owners; and
- small manual batches with daily review of incidents, delivery, and deletion requests.

If Pholio wants minors, international users, AI ranking, public-by-default profiles, or paid selection advantages in the first release, the critical path expands materially.

## 4. Priority definitions

| Priority | Meaning |
|---|---|
| P0 | Launch blocker. Must be fixed and evidenced before any real-user pilot. |
| P1 | Required before charging, enabling public discovery broadly, or operating beyond the closely supervised pilot. |
| P2 | Required before material scale or expansion into new jurisdictions/features. |

An item is not complete when code is merged. It is complete only when deployed behavior, monitoring, failure handling, and retained evidence meet its acceptance criteria.

## 5. P0 launch gates

| Gate | Accountable owner | Required proof |
|---|---|---|
| G-01 New York regulatory classification | CEO + NY labor counsel | Written opinion covering Fashion Workers Act, model-management registration, NYC employment-agency licensing, paid guidance, submission limits, ranking, event workflow, and prohibited product conduct. |
| G-02 FWB legal and operating agreement | CEO + counsel + FWB | Executed agreement with correct BK Style/FWB entity and schedules for data, labor/client roles, minors, safety, insurance, publicity, incidents, retention, and termination. |
| G-03 Eligibility decision | Product + counsel | Enforced 18+ pilot or fully approved minor program. Age rule consistent across marketing, app, FWB source list, support, and Recipient roster. |
| G-04 Authentication and session security | Security/Backend | Adversarial integration suite passes for account collision, login CSRF, verification, revocation, recovery, step-up, rate limits, and cross-account isolation. |
| G-05 Private media and truthful visibility | Backend + Infrastructure | Nonpublic originals and derivatives require authorization; public/private/block controls pass end-to-end tests; direct URL revocation tested. |
| G-06 AI disabled or approved | Product + Privacy + counsel | FWB configuration proves no prohibited AI/ranking; or completed consent map, technical memo, impact assessment, bias/AEDT determination, and independent audit where required. |
| G-07 Minor/COPPA/NY teen privacy | Privacy + Product | Neutral age gate before PII/account creation; deletion on under-13 detection; purpose-specific teen consent; guardian verification; no minor reaches work flow without required evidence. |
| G-08 Safety and statutory reporting | Trust & Safety + counsel | Live NCII intake and 48-hour queue, NCMEC registration/runbook, secure evidence access, DMCA process, trained responders, and completed tabletop. |
| G-09 Legal assent and notice deployment | Product + counsel | Legal version `2026-07-18` deployed, affirmative Terms assent, separate privacy acknowledgment/optional consents, immutable snapshots, existing-user migration, and link validation. |
| G-10 Security/privacy operations | Security + Privacy | Written security program, incident plan, breach matrix, vendor register, DSR workflow, deletion retry job, retention jobs, and privileged credential-exposure assessment. |
| G-11 Production reliability | Engineering lead | Build/test green; production config fails closed; load, provider-failure, backup/restore, email, queue, and rollback exercises meet approved thresholds. |
| G-12 Final approval | CEO + Engineering + counsel | Signed launch evidence packet with no open P0, named on-call owners, and explicit decision for every documented unknown. |

## 6. Workstream A — Corporate, New York classification, and FWB

| ID | Priority | Implementation | Dependencies | Acceptance evidence |
|---|---|---|---|---|
| A-01 | P0 | Confirm the exact contracting entity, formation state, good standing, EIN, registered agent, authority to sign, bank/Stripe entity, and founder/contractor IP assignments. | None | Counsel-verified corporate folder; no public placeholder identity. |
| A-02 | P0 | Obtain written New York Fashion Workers Act and NYC employment-agency classification. Analyze paid submission capacity, guidance, matching, event engagement, booking language, and Recipient workflows. | Product behavior inventory | Signed counsel memo and approved operating boundaries. |
| A-03 | P0 | Decide whether Pholio will remain a software/intake provider or register/license for covered activity. Encode prohibited conduct into product requirements and staff playbooks. | A-02 | Board/CEO decision; feature boundary checklist; marketing copy approved. |
| A-04 | P0 | Execute FWB agreement with the correct BK Style/FWB entity. Allocate controller roles, selection, client/employer duties, compensation, expenses, minors, permits, safety, harassment, insurance, AI, data access, breach response, retention, deletion, publicity, complaints, indemnity, and termination. | A-01, A-02 | Executed agreement and data schedule. |
| A-05 | P0 | Create and display FWB-specific program rules and applicant notice. Identify event/season, Recipient, purpose, eligibility, dates, deadline, compensation status, selection owner, AI status, data fields, retention, withdrawal, accommodation, and support. | A-04 | Counsel-approved snapshot displayed before submission; immutable acceptance event. |
| A-06 | P0 | Keep FWB participation free and independent of Studio+ ranking, routing, visibility, or quota benefits. | A-02, A-04 | Config and integration tests for free and paid accounts yield identical FWB eligibility/order. |
| A-07 | P0 | Create separate, optional publicity/likeness release if FWB or Pholio will promote applicants or selected Talent. Do not bundle with application or Terms. | A-04 | Versioned release with scope, channels, territory, term, editing, compensation, withdrawal, and signature evidence. |
| A-08 | P1 | Complete cyber, media/E&O, general liability, and event/model-related insurance analysis. Confirm which party provides required client/model coverage. | A-04 | Broker/counsel memo and active certificates. |

## 7. Workstream B — Authentication, sessions, and account lifecycle

| ID | Priority | Implementation | Dependencies | Acceptance evidence |
|---|---|---|---|---|
| B-01 | P0 | Close the unverified-email collision account-takeover path. Never associate a Firebase identity to an existing database user by email unless ownership is verified and the association follows a dedicated recovery/link flow. | None | Integration test proves an unverified identity cannot receive another user's session. |
| B-02 | P0 | Protect `/login` and `/api/login` from login CSRF/session swapping. Bind client intent to the login completion and enforce origin/state checks. | None | Cross-site form and attacker-token tests fail safely without changing victim session. |
| B-03 | P0 | Require verified email and valid onboarding state before issuing full Talent access. Remove unconditional onboarding-complete backfill. | Age/consent state model | Tests cover unverified, partial, suspended, minor, and complete accounts. |
| B-04 | P0 | Unify Firebase and Express revocation. Password reset, account compromise, user-wide logout, ban, deletion, and token revocation must invalidate application sessions. | Session design | Existing cookies fail after reset/revocation; documented maximum revocation latency. |
| B-05 | P0 | Make remote session termination effective on the selected browser, including its Firebase refresh state or device-level revocation mechanism. Correct the UI promise until this is true. | B-04 | Terminated browser cannot silently recreate a Pholio session. |
| B-06 | P0 | Require recent authentication for account deletion, data export, email change, password/security changes, billing ownership changes, and other high-impact actions. | Firebase provider support | Step-up tests for password and OAuth users; stale session rejected. |
| B-07 | P0 | Apply distributed production rate limits to `/api/login`, password reset, onboarding entry, guardian token, uploads, messaging, exports, and other abuse-sensitive endpoints. | Production cache/store | Multi-instance tests prove shared limits; forwarded-IP trust documented. |
| B-08 | P0 | Remove full request-body, credential, token, and unnecessary PII logging. Establish structured redaction and access/retention policy. | Logging platform | Secret/PII canary tests show redaction; log-access audit retained. |
| B-09 | P0 | Enforce suspension/ban state consistently on every authenticated surface, including Stripe, PDF, public session responses, messaging, and downloads. | Central auth middleware | Route inventory and integration tests for every mount. |
| B-10 | P0 | Narrow cross-subdomain trust. Do not share credentialed CORS/session access with the marketing origin unless required and protected. | Deployment architecture | Marketing-origin compromise test cannot read authenticated Talent data. |
| B-11 | P1 | Make recovery behavior uniform and non-enumerating for Firebase-only, DB-only, linked, nonexistent, and suspended accounts. | B-01, email provider | Timing/status tests and monitored delivery. |
| B-12 | P1 | Add meaningful session/device metadata, security-event history, new-login/password-change notifications, and user-wide sign-out. | B-04 | User can identify and revoke sessions; audit log survives account-security event. |
| B-13 | P1 | Complete email-change, pause/reactivation, Instagram account-linking, and one-account lifecycle behavior. | B-01, B-03 | End-to-end lifecycle tests and truthful UI copy. |

## 8. Workstream C — Legal assent, notices, and consent evidence

| ID | Priority | Implementation | Dependencies | Acceptance evidence |
|---|---|---|---|---|
| C-01 | P0 | Deploy the July 18 legal pages and update application legal constants to `2026-07-18`. Store immutable text or hash, URL, locale, surface, action, timestamp, IP, user agent, and account. | Legal approval | Database event reproduces exactly what the user saw and did. |
| C-02 | P0 | Replace silently hardcoded Terms acceptance with deliberate clickwrap. Privacy Policy is acknowledged as a notice, not bundled as optional-processing consent. | C-01 | Keyboard/screen-reader accessible acceptance; no prechecked box; blocked until action. |
| C-03 | P0 | Prompt existing users to accept material Terms changes before continuing. Do not treat passive continued use as sufficient where renewed assent is required. | C-01 | Migration cohort report; retry and support path; acceptance event. |
| C-04 | P0 | Create separate consent events for image AI, profile embeddings/profiling where required, teen nonessential processing, marketing, guardian authorization, opportunity transmission, subscription renewal, publicity, and digital replicas. | Consent taxonomy | Each event has scope, version, actor, evidence, withdrawal, and downstream deletion state. |
| C-05 | P0 | Preserve the strong per-submission evidence already present: Recipient, package fingerprint, snapshot, version, IP/UA, guardian link, and timestamp. Extend it to event/opportunity facts. | A-05 | Replayed audit record matches submitted package and Recipient. |
| C-06 | P1 | Build legal change management: document owner, counsel approval, version archive, change classification, required notice channel, delivery evidence, and rollback. | C-01 | Legal release checklist completed for a simulated revision. |

## 9. Workstream D — Age assurance, guardians, and child-performer controls

| ID | Priority | Implementation | Dependencies | Acceptance evidence |
|---|---|---|---|---|
| D-01 | P0 | Move a neutral age screen before Firebase account creation, name/email collection, persistent identifier creation, uploads, or database profile creation. Prevent back-button age changes. | Onboarding redesign | Under-13 test leaves no Firebase, DB, session, analytics, or email record beyond lawful age-screen security data. |
| D-02 | P0 | If under-13 data is discovered later, suspend access, delete all non-exempt data, notify processors as required, and retain only lawful compliance evidence. | Deletion orchestration | Full deletion trace across Firebase, DB, R2, email, analytics, AI, and backups. |
| D-03 | P0 | For the short launch, enforce 18+ in app, FWB source links, server APIs, imports, and Recipient rosters. Do not rely on Terms alone. | Executive decision | Boundary tests at 17/18 and timezone/date edges; roster reconciliation has zero minors. |
| D-04 | P0 if minors | Verify guardian adulthood, identity, relationship/authority, scope, and contact ownership using a counsel-approved method. | Identity provider/vendor | Fraud and wrong-guardian tests; immutable verification record. |
| D-05 | P0 if minors | Implement New York teen purpose-by-purpose consent, refusal prominence, easy revocation, one-year no-reprompt suppression, no unlawful degradation/price increase, and processor deletion/notification. | C-04 | UX/legal review and automated state tests for accept, refuse, revoke, age change, and processor completion. |
| D-06 | P0 if minors | Implement opportunity-specific guardian grants and prevent direct minor contact, contact-field disclosure, social-link disclosure, public media, or work progression outside the grant. | D-04 | Agency/Recipient tests prove no bypass through legacy endpoints, exports, messages, public pages, or cached data. |
| D-07 | P0 if minors | Replace self-attested work-permit toggle as a booking gate with document verification, expiry, employer certificate, notice, trust, education, hours, responsible-person, and record controls assigned to the responsible party. | A-04 | Counsel-approved checklist and verified pre-work packet for every minor. |

## 10. Workstream E — Profiles, media, visibility, and analytics

| ID | Priority | Implementation | Dependencies | Acceptance evidence |
|---|---|---|---|---|
| E-01 | P0 | Default new Talent profiles, discoverability, contact sharing, public fields, analytics, and media to private/off unless a deliberate lawful choice enables them. | Consent model | Fresh-account test shows no public or organization access before choice. |
| E-02 | P0 | Introduce a public-profile DTO/allowlist. Never render a raw profile row. Enforce field visibility, contact-sharing, minor, moderation, and account-state rules server-side. | Data inventory | Snapshot tests enumerate every public field; new DB columns do not become public automatically. |
| E-03 | P0 | Make blocked organizations effective across Discover, search previews, direct profile access, messages, invitations, exports, applications, and team accounts. Support verified domain/organization IDs, not ambiguous strings alone. | Organization identity | Adversarial block suite; safety escalation can hard-block all organization members. |
| E-04 | P0 | Store nonpublic originals, derivatives, quarantined files, minor media, withdrawn submissions, and review evidence in private buckets/keys delivered through short-lived authorization. | Storage migration | Copied raw URL fails after expiry/revocation; no object listing; access logs retained. |
| E-05 | P0 | Strip unnecessary EXIF and metadata before storage or public delivery. Keep only required forensic data in controlled records. | E-04 | Metadata scan of every derivative/original policy path. |
| E-06 | P0 | Make visibility changes revoke future delivery and purge or invalidate CDN caches where supported. Explain unavoidable prior copies. | E-04 | Private/delete action makes all tested URLs inaccessible within approved SLA. |
| E-07 | P0 | Gate public portfolio analytics by applicable consent/necessity rules. Accurately inventory `pholio_visitor_id`, profile-session cookies, IP/UA/referrer, and interaction events. | Cookie/consent architecture | Browser matrix proves behavior before/after consent and deletion. |
| E-08 | P1 | Give Talent understandable publication preview, access history where feasible, share-link revocation, audience controls, and safety-oriented block confirmation. | E-01–E-07 | Usability test confirms users correctly predict who can see each field/media item. |

## 11. Workstream F — AI, profiling, and automated selection

| ID | Priority | Implementation | Dependencies | Acceptance evidence |
|---|---|---|---|---|
| F-01 | P0 | Disable image analysis, embeddings, protected-attribute features, learned preferences, match scores, and automated ordering for FWB. | Opportunity configuration | Network, DB, and UI traces show no AI call/output/order difference. |
| F-02 | P0 | Replace implied/default-on AI consent with feature- and purpose-specific controls. Do not grandfather users through a default-true migration. | C-04 | Fresh/migrated/minor/refused accounts make zero prohibited provider calls. |
| F-03 | P0 | Make image AI, profile embeddings, Discover indexing, match scoring, and Recipient ranking independently controllable and accurately described. | AI architecture map | Control-state matrix and provider-call tests. |
| F-04 | P0 | Remove ethnicity/heritage and unjustified protected-attribute or proxy inputs from selection embeddings and ranking. Document every remaining field and business necessity. | Counsel/impact assessment | Schema/prompt/index review; regression test prevents reintroduction. |
| F-05 | P0 | Complete an AI impact assessment covering purpose, inputs, outputs, providers, minors, protected groups, misuse, accuracy, human review, retention, deletion, and alternatives. | F-03 | Signed product/privacy/counsel assessment with remediation closure. |
| F-06 | P0 | Obtain a technical biometric memo stating whether providers create or retain face geometry, landmarks, templates, or identifiers. Geoblock or consent as necessary. | Provider documentation | Signed engineering/provider memo and jurisdiction decision. |
| F-07 | P0 if used | Determine NYC AEDT applicability per specific opportunity. Complete independent annual bias audit, public summary, ten-business-day notice, assessed-characteristic disclosure, and alternative/accommodation process where required. | A-02, F-05 | Counsel determination and audit/notice evidence. |
| F-08 | P1 | Implement immutable consent/withdrawal events, provider deletion, embedding reindex, output deletion, human-review case management, and monitoring for provider/model changes. | F-02, F-03 | End-to-end deletion/objection test and model-change release gate. |

## 12. Workstream G — Safety, moderation, NCII, CSAM, and copyright

| ID | Priority | Implementation | Dependencies | Acceptance evidence |
|---|---|---|---|---|
| G-01 | P0 | Remove email-suffix moderator authorization. Use preapproved managed identities, least privilege, MFA, recent reauthentication, and audited grants. | B-03, B-06 | Unauthorized `@pholio.studio` account receives no moderator access. |
| G-02 | P0 | Build unauthenticated NCII/digital-forgery victim or representative intake with statutory statements, signature, content location, confirmation number, status, secure evidence handling, and a 48-hour deadline. | Counsel-approved form | Full TAKE IT DOWN tabletop completes removal and known-copy action within SLA. |
| G-03 | P0 | Add known-identical-copy detection/removal for valid NCII requests and controls against re-upload, with documented false-positive review. | G-02, private media | Hash/copy exercise removes known copies without exposing victim material. |
| G-04 | P0 | Register Pholio as an NCMEC electronic service provider and implement an actual-knowledge decision tree, CyberTipline procedure, emergency process, one-year preservation, chain of custody, and reviewer safety. | G-01, counsel | Registration proof; simulated case completed by trained named responders. |
| G-05 | P0 | Replace heuristic-only CSAM handling with a risk-appropriate vendor/process, fail-safe quarantine, human escalation, and monitored provider failure. Do not rely on skin-ratio heuristics as classification. | G-04 | Provider outage and suspected-content tests quarantine safely without broad reviewer exposure. |
| G-06 | P0 | Verify Copyright Office agent registration or stop claiming designation/safe harbor. Staff copyright inbox and implement notice, uploader notice, counter-notice, 10–14-day restoration, ledger, and repeat-infringer process. | Corporate address | Directory evidence and tabletop for notice/counter-notice/retraction/court notice. |
| G-07 | P0 | Add trafficking, impersonation, coercion, guardian, harassment, emergency, and rights-escalation playbooks with evidence attachment controls, receipt/status, appeal, and law-enforcement criteria. | G-01 | Tabletop suite and on-call roster. |
| G-08 | P1 | Add safety metrics without exposing victim content: queue age, SLA, reviewer access, action, appeal, provider status, and recurrence. | G-02–G-07 | Dashboard alerts before statutory/operational breach. |

## 13. Workstream H — Deletion, retention, privacy rights, and vendors

| ID | Priority | Implementation | Dependencies | Acceptance evidence |
|---|---|---|---|---|
| H-01 | P0 | Schedule and monitor `processPendingDeletions`; retry Firebase/R2/provider failures with backoff, terminal escalation, and user-visible completion state. | Provider credentials | Forced provider outage recovers; no false “deleted” message while purge is pending. |
| H-02 | P0 | Build a data inventory and retention schedule for every table, object prefix, log, analytics record, email, support case, application, AI output, consent, safety record, and backup. | System inventory | Counsel/privacy-approved schedule mapped to deletion jobs and exceptions. |
| H-03 | P0 | Implement missing cleanup for analytics/IP, visitor sessions, expired app sessions, complete application records where appropriate, messages, support, and orphaned media. Correct session-store cleanup configuration. | H-02 | Time-travel/job tests and before/after counts. |
| H-04 | P0 | Make export and deletion complete, authenticated, asynchronous where needed, idempotent, and truthful. Include or identify AI, consent, messages, applications, analytics, and provider state. | B-06, H-01 | End-to-end request with evidence manifest and completion notification. |
| H-05 | P0 | Establish privacy-request intake, identity verification, jurisdiction/deadline calculation, processor/Recipient coordination, appeal, exception, and evidence retention. | Privacy owner | Access/delete/correct/teen/guardian/representative tabletop. |
| H-06 | P0 | Create vendor register and approve contracts/security for Firebase, Stripe, Groq, OpenAI, Cloudflare, Neon, Netlify, IP geolocation, email, moderation, and support. Track subprocessors, breach notice, retention, deletion, training, transfers, and audit rights. | A-01 | Executed contracts or documented decision not to use provider. |
| H-07 | P1 | Build backup retention, legal hold, deletion propagation, and restore procedures that do not silently resurrect deleted or restricted users/media. | H-02 | Restore exercise proves deletion tombstones and bans remain effective. |

## 14. Workstream I — Billing, tax, marketing, and communications

| ID | Priority | Implementation | Dependencies | Acceptance evidence |
|---|---|---|---|---|
| I-01 | P0 if charging | Persist billing disclosure version/text/hash, displayed price, interval, trial, renewal, cancellation method, timestamp, IP/UA, and affirmative action before Stripe session creation. | C-04 | Charge can be tied to exact retained disclosure. |
| I-02 | P0 if charging | Verify same-medium/equally easy cancellation, retainable post-consent notice, annual renewal notice, material-change notice, refund/error handling, failed-payment behavior, deletion while subscribed, and support fallback. | Stripe configuration | Live-mode test and evidence emails/portal recordings. |
| I-03 | P0 if charging | Obtain New York sales-tax determination and configure registration, nexus, rates, invoices, Stripe Tax, and remittance where required. | Corporate/tax facts | CPA/tax counsel memo and successful tax test transaction. |
| I-04 | P0 | Reconcile pricing and product claims: free application count, invited caps, paid routing, “no credit card,” cancellation, trial, and agency counts. Remove unsupported or contradictory claims. | Product truth table | Marketing/app/checkout snapshot review passes. |
| I-05 | P0 | Select and configure production email provider. Fail production startup when required transactional email is unavailable; monitor bounces, suppressions, abuse, and delivery. | Vendor contract | Guardian, verification, reset, application, safety, and billing delivery tests. |
| I-06 | P1 | Enforce notification preferences and distinguish transactional, safety/legal, and commercial mail. Implement CAN-SPAM physical address, unsubscribe, suppression, and 10-business-day opt-out before promotional FWB/Studio+ campaigns. | Corporate address, email provider | Seed-list campaign and suppression tests. |

## 15. Workstream J — Production configuration, observability, and recovery

| ID | Priority | Implementation | Dependencies | Acceptance evidence |
|---|---|---|---|---|
| J-01 | P0 | Fail production startup for missing/invalid Firebase Admin, session secret, database, R2 private configuration, email, legal version, CORS/origin, and required job credentials. | Deployment config | Deliberately missing each variable prevents traffic. |
| J-02 | P0 | Audit public repository history and rotate/revoke all exposed Firebase, database, storage, Stripe, email, AI, and deployment credentials. Preserve logs and complete privileged incident/breach analysis. | Counsel + providers | Rotation inventory, forensic memo, and notification decision. |
| J-03 | P0 | Add private/no-store headers to every personalized session, public-session, token, export, reply, PDF, and authenticated endpoint. Test CDN/Netlify behavior. | Route inventory | Cache tests cannot replay one user's response to another. |
| J-04 | P0 | Establish production dashboards and alerts for auth failures, session recreation, rate limits, upload failures, provider errors, email delivery, queue age, safety SLA, deletion backlog, database saturation, and 5xx rate. | Logging/metrics | Alert drill reaches named on-call owner. |
| J-05 | P0 | Test backup restoration, database migration rollback/forward strategy, R2 recovery, credential rotation, and deployment rollback. | Production-like environment | Timed recovery exercise and written RTO/RPO. |
| J-06 | P0 | Document edge proxy/IP trust, forwarded headers, CORS, cookie domain, TLS, DNS, subdomain ownership, CDN caching, and security headers. | Hosting provider | External configuration review and automated header checks. |
| J-07 | P1 | Remove serverless timers and cleanup behavior that are unsafe or duplicated; run scheduled jobs exactly once with locks, idempotency, alerts, and dead-letter handling. | Job inventory | Concurrent invocation tests produce one effective result. |

## 16. Workstream K — Product trust, accessibility, and support

| ID | Priority | Implementation | Dependencies | Acceptance evidence |
|---|---|---|---|---|
| K-01 | P0 | Remove or correct controls and copy that promise behavior not delivered: “vetted agencies,” effective blocked-agency privacy, remote-session ending, immediate deletion, pause/reactivation, email change, AI opt-in, invited submissions “never” counting, and notification preference enforcement. | Relevant control fixes | Product/legal truth-table review with screenshots and API traces. |
| K-02 | P0 | Provide FWB accommodation contact and alternative application route. Manually test login, onboarding, age/guardian, upload, submission, assent, billing, settings, reporting, and deletion with keyboard and screen reader. | FWB program rules | WCAG 2.2 AA issue log with P0/P1 fixes and tested alternative path. |
| K-03 | P0 | Staff support, privacy, legal, copyright, and safety channels with routing, ownership, coverage hours, emergency escalation, acknowledgment templates, and case numbers. | Email/case tooling | Test messages reach correct queue and on-call owner. |
| K-04 | P1 | Add accessible account-security history, publication preview, consent center, privacy request status, deletion status, safety report status, and appeal status. | Underlying APIs | User tests show correct understanding without support intervention. |

## 17. Workstream L — Verification and stress-test program

### 17.1 Security/adversarial suite

The suite must include:

- unverified email collision against DB-only and legacy accounts;
- attacker-token login CSRF and session swapping;
- unverified/partial onboarding login and completion bypass;
- password-reset and Firebase-revocation behavior for existing Express sessions;
- terminated remote browser attempting silent session recreation;
- export/delete/email/billing action with a stale or stolen session;
- suspended user access through Talent, PDF, Stripe, session, public, messaging, and reply routes;
- marketing-origin credentialed read/write attempts;
- rate-limit behavior across two or more application instances;
- cache isolation between two authenticated users;
- moderator access from a self-created `@pholio.studio`-style account;
- blocked organization access through every alternate path;
- private/minor/quarantined/withdrawn media using copied URLs;
- under-13 signup, back-button age change, and cleanup;
- teen consent refusal, revoke, and one-year no-reprompt state;
- guardian token replay, wrong guardian, expired grant, revoked grant, and legacy API bypass;
- AI provider calls for opt-out, minor, FWB, deleted, and withdrawn accounts;
- deletion during provider outage and later retry; and
- NCII, CSAM, DMCA, trafficking, impersonation, and emergency tabletop cases.

### 17.2 Capacity and failure tests for the 100–200-user launch

Use production-like infrastructure and synthetic media/data.

| Scenario | Minimum test |
|---|---|
| Signup burst | 250 attempted signups over 15 minutes, including verification, duplicate, invalid, rate-limited, and under-age cases. |
| Concurrent sessions | 500 active sessions with dashboard reads, session refresh, logout, and revocation. |
| Media | 200 users uploading 10 images each, mixed valid/invalid sizes and formats; measure queue time, memory, orphan rate, metadata stripping, and object authorization. |
| Submissions | 200 near-simultaneous FWB submissions with identical/idempotency retries; zero duplicate packages or mismatched Recipients. |
| Messaging/notifications | Burst of status and message events with email provider delay/failure; no duplicate or unauthorized email. |
| Provider outage | Firebase, database, R2, AI, IP geolocation, email, Stripe, and moderation unavailable independently. Core safety and account state must fail closed where required. |
| Scheduled jobs | Concurrent cleanup, deletion, retention, and notification invocations; idempotent and observable. |
| Recovery | Restore database and media into isolated environment; verify bans, blocks, deletion tombstones, consent state, and legal evidence. |

Engineering must approve numerical thresholds before the run. Recommended starting gates are zero cross-account/data-integrity defects, zero unauthorized media access, zero lost or duplicate submissions, zero unhandled promise rejections, less than 1% non-deliberate application errors, and provider-independent recovery within the agreed RTO/RPO.

### 17.3 Legal and operational tabletop

Run one timed exercise for each:

1. reported stolen account with public portfolio and prior applications;
2. under-13 account discovered after upload;
3. 16-year-old selected for runway work without permit evidence;
4. nonconsensual intimate image with three known copies;
5. reviewer obtains actual knowledge of apparent CSAM;
6. photographer submits a DMCA notice and uploader submits a counter-notice;
7. exposed production database credential in public history;
8. FWB requests a spreadsheet export and later deletion;
9. Talent revokes guardian/AI/submission consent;
10. Stripe renewal dispute and cancellation failure;
11. accessibility accommodation request near a deadline; and
12. AI discrimination complaint or request for human review.

Each exercise must record timestamps, decision owner, legal basis, evidence access, communications, final action, missed SLA, and remediation.

## 18. Launch evidence packet

The final packet must include:

- signed P0 closure register;
- counsel classification memo and FWB agreement;
- legal-document approval and deployed snapshots;
- legal version/assent migration report;
- entity and insurance evidence;
- vendor and subprocessor register;
- credential rotation and privileged incident memo;
- written security program and incident/breach plan;
- architecture/data-flow and public/private media diagrams;
- auth/adversarial test results;
- load/failure/restore results;
- AI disablement proof or approved AI assessment/audit;
- age/minor decision and enforcement proof;
- NCII/NCMEC/DMCA registration and tabletop evidence;
- retention/deletion job results and open backlog count;
- production configuration and monitoring screenshots;
- accessibility report and accommodation process;
- support/on-call roster; and
- CEO, Engineering, Security/Privacy, and counsel sign-off.

## 19. Suggested execution sequence

### Phase 0 — Contain and decide (days 0–2)

- Freeze public launch and paid FWB advantage.
- Decide 18+ and U.S.-only pilot posture.
- Disable FWB AI/ranking.
- Rotate exposed credentials and preserve logs.
- Start counsel classification and FWB contract.
- Make new profiles/media private by default in release configuration.

### Phase 1 — Close critical legal/security paths (days 2–10)

- Complete B-01 through B-10.
- Complete age gate and under-13 cleanup.
- Deploy legal version and assent/consent taxonomy.
- Implement private media and blocked-organization enforcement.
- Execute FWB agreement and specific notice.
- Implement moderator hardening, NCII, NCMEC, and DMCA operations.

### Phase 2 — Prove operations (days 8–15)

- Complete deletion, retention, vendor, incident, email, and production configuration work.
- Run security/adversarial, capacity, provider-failure, restore, and legal table-top exercises.
- Fix every failed P0 acceptance criterion and rerun from clean state.

### Phase 3 — Conditional pilot

- Begin with small batches and daily go/no-go review.
- Keep public publication, AI, minors, paid advantage, and international access out of scope.
- Maintain a launch incident channel and stop authority for Security, Privacy, Trust & Safety, Engineering, and FWB operations.

### Phase 4 — P1/P2 expansion

- Add billing only after tax/renewal/cancellation readiness.
- Add minors only after the complete minor and child-performer program.
- Add AI ranking only after classification, consent, validation, audit, and monitoring.
- Add intentional EEA/UK or additional-state targeting only after the corresponding legal program.

## 20. Estimate and critical-path warning

A focused 18+, U.S.-only, free, private, manual/unranked pilot could plausibly reach reviewable readiness in approximately two to four intensive weeks if counsel and the FWB counterparty are immediately available and the existing local security fixes prove correct when deployed.

A launch including minors, paid advantages, automated ranking, broad public profiles, or intentional international use is a larger program and should not be forced into the same deadline. Those choices add legal classification, consent, audit, work-permit, tax, data-transfer, and operational dependencies that cannot be closed by legal copy or risk acceptance alone.
