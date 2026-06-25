# Pholio — Product / Legal / Trust & Safety Audit

**Date:** 2026-06-25
**Scope:** The actual Pholio codebase at this checkout (`src/`, `client/src/`, `views/`, `migrations/`, root docs). The `landing/` Next.js marketing site referenced in `CLAUDE.md` is **not present in this checkout** and could not be audited — several findings below are therefore conditional on it.
**Method:** Four parallel code-grounded workstreams (app/data-flow analysis, trust & safety/moderation, privacy/data-protection, legal/policy/disclosures) plus an in-house modeling-industry benchmark. Every claim is tied to real files; unverifiable items are flagged as open risks. This document is an engineering/product audit, **not legal advice** — items tagged *[counsel]* require a licensed attorney before action.

---

## 1. Executive Summary

Pholio is a functioning, data-rich talent marketplace that, today, **has essentially no legal, trust & safety, or privacy layer wrapped around it.** The product collects extensive sensitive personal data about talent — including **minors**, **body measurements**, **ethnicity**, **precise IP geolocation**, **facial photos**, **AI-derived biometric embeddings**, and an **OnlyFans handle** — and runs that data through multiple third-party AI/geolocation processors, while shipping with:

- **No Terms of Service, Privacy Policy, content policy, DMCA process, or cookie consent** anywhere in this checkout. The only reference is a passive, unbacked browsewrap link to `/terms` and `/privacy` pages that don't exist (`client/src/domains/onboarding/pages/CastingEntry.jsx:283-303`).
- **No content moderation of any kind** — no NSFW/explicit-image detection and no CSAM screening before images are stored, shown to agencies, served publicly, or rendered into comp-card PDFs (`src/domains/talent/routes/media.js`, `src/shared/lib/uploader.js`).
- **No reporting/flagging mechanism** for any user, image, message, or agency — the partner's explicitly flagged requirement is entirely absent.
- **Weak minors handling** — age is a self-declared, *nullable* date of birth; "guardian consent" is a self-attested boolean toggle; there is no age verification, no verified parental consent, and no CSAM/NCMEC reporting pathway, despite the product processing minors' photos and AI body analysis.
- **No real privacy compliance** — no consent capture, no lawful basis, no sub-processor disclosure; biometric (face) embeddings stored with no BIPA-required notice/retention schedule; "erasure" is a no-op timestamp and account deletion leaves face photos live on a public CDN.
- **A live third-party API key hardcoded in committed source** (`src/domains/ai/photo-analysis.js:42`, `src/routes/chat.js:20`, `src/routes/scout.js:11`) — independent of everything else, this should be rotated today.

The two highest-order *strategic* exposures, in priority order:

1. **Minors + unmoderated imagery + no reporting + AI body analysis** = a child-safety and CSAM-liability cluster. This is the single most serious area and the one most likely to produce criminal-statute exposure (18 U.S.C. §2258A reporting duty), app-store removal, and catastrophic reputational harm.
2. **Charging aspiring talent recurring fees while an AI ranks/hard-filters those same people by skin tone, body type, and age** to gate them toward agencies, under "Where careers are made" marketing. This is simultaneously the classic advance-fee / unlicensed-talent-agency fact pattern (CA Talent Agencies Act, CA Krekorian Act, NY GBL Art. 11) **and** a discriminatory automated-employment-decision concern (NYC Local Law 144, EU AI Act). *[counsel]*

Mitigating context (verified, and a correction to one workstream): **agencies are not open self-serve.** The login auto-create path rejects AGENCY signups with a 403 and agencies are provisioned by a manual Pholio step (`auth.js:407-422`, `src/shared/lib/user-helpers.js:142-158`, `provisioning.js`). That meaningfully reduces — but does not eliminate — the "fake scout reaches a minor" vector, because the manual provisioning has **no codified KYB/verification in code** and no "verified" status, so the gate's real strength is an unverifiable human process.

Bottom line: the engineering is ahead of the governance. Before any growth, launch, or fundraising diligence, Pholio needs (a) the child-safety controls, (b) the core legal documents with real acceptance, (c) content moderation + reporting, and (d) a privacy/biometric consent regime. The rest can be phased.

---

## 2. Product / Legal Risk Audit by Category

Severity key: **CRITICAL** (legal/criminal/child-safety exposure or launch-blocker) · **HIGH** · **MEDIUM** · **LOW**. Each finding cites code or states "not found after searching."

### 2.1 Child Safety / Minors — **CRITICAL**
- **What exists:** Real, non-trivial gating logic. `src/shared/lib/talent-age.js` derives age from `date_of_birth` (`MINOR_AGE_THRESHOLD = 18`). For minors without `guardian_consent_at`, the app blocks sensitive **measurement** fields and `full_length`/`full_body` shot tagging (`media.js` `minorBlocksSensitiveImage`; `profile.js:706-716`) and blocks public exposure/contact display (`settings.js:381-391`). Columns from `migrations/20260624210000_add_minor_compliance_to_profiles.js` (`guardian_consent_at`, `work_permit_on_file`).
- **Gaps:**
  - **DOB is nullable** (`migrations/20250104000000`). A minor who simply omits DOB is never detected → all gating silently bypassed.
  - **"Guardian consent" is a self-attested toggle** — setting `guardian_consent_recorded: true` just stamps `guardian_consent_at = now()` (`profile.js:685-694`). No guardian identity, email, document, or verification. The minor can flip it, and flipping it *unlocks* sensitive imagery + public exposure.
  - **No age gate at signup**; onboarding auto-stamps `onboarding_completed_at` (`auth.js:473`).
  - **No CSAM detection, hash-matching (PhotoDNA), or NCMEC reporting pathway** anywhere (grep `ncmec|csam` → none). 18 U.S.C. §2258A imposes a reporting duty Pholio currently cannot meet. *[counsel]*
  - **Minors are not separated from adult features** — the `onlyfans_url` field, agency messaging, and AI body analysis all apply to minor profiles.
  - `work_permit_on_file` is an unverified boolean; no Coogan/trust-account, chaperone, or working-hours concepts (industry-standard for child performers).

### 2.2 Content Moderation & Explicit Content — **CRITICAL / HIGH**
- **What exists:** Upload pipeline is MIME allowlist (`jpeg|png|webp`) + size limit + Sharp processing (`uploader.js:121-161`). `image-forensics.js` measures luma/palette for **typography placement only** — explicitly not safety. Async `classify-portfolio-image.js` labels shot/style, **no safety category**.
- **Gaps:** **No nudity/NSFW/explicit detection and no human review** before images are stored on R2, shown to agencies, served on public pages, or composited into comp-card PDFs. No moderation vendor in `package.json`. Combined with a first-class `onlyfans_url` field (`migrations/20260624000000`), the product invites adult-content adjacency with zero governing control. Becomes CRITICAL where it intersects minors (§2.1).
- **PDF guardrails** (`src/domains/pdf/guardrails.js`) only check image **rights metadata** presence (warn) and composition — not content safety.

### 2.3 Reporting / Flagging / Enforcement — **CRITICAL**
- **What exists:** Nothing. Exhaustive search across `src/` and `client/src/` for report/flag/moderation tables, routes, or UI returns only false positives (CSS, RBAC "moderate" permission names, a paywall `BlockedStatePanel`).
- **Gaps:** No way for talent or agencies to report a profile, image, message, or agency. No admin/moderator role, dashboard, or endpoints exist anywhere (only the agency-internal `ADMIN` RBAC preset and the `firebase-admin` SDK). Even if abuse were discovered out-of-band, there is **no tooling to remove content or ban a user** short of direct DB edits. This is required for app-store, legal, and basic safety posture, and is the partner's explicitly flagged gap.

### 2.4 User Safety Controls (block / suspend / rate-limit) — **HIGH**
- **What exists:** Talent can store a `blockedAgencies` free-text list in settings (`settings.js:141`, max 25). Rate limiting exists only on `/login`,`/signup`,`/upload`.
- **Gaps:** The `blockedAgencies` list appears **stored but not enforced** — no code in the application/message send paths consumes it. No suspend/ban state on users at all. Rate limiters are **disabled in serverless/production** (`app.js:413` `if (!config.isServerless)`), and the real media-upload and messaging routes have **no rate limiting** → no anti-harassment / anti-spam primitive.

### 2.5 Agency Legitimacy / Fraud — **HIGH** (corrected from CRITICAL after code verification)
- **What exists (verified):** Agencies are **not** open self-serve. Login auto-create rejects AGENCY role with 403 (`auth.js:410-422`); `POST /partners` returns 403 "provisioned manually by Pholio" (`auth.js:801-814`). Provisioning is programmatic via `provisionAgencyForUser()` → inserts `agencies` + OWNER `agency_memberships` with `status: 'ACTIVE'` (`provisioning.js:72-95`).
- **Gaps:** The manual provisioning step has **no codified KYB/business-verification in code**, no "verified" flag, and no documented vetting standard — its real strength is an out-of-band human process I cannot inspect. Given the industry's notorious fake-scout/exploitation problem, the verification standard for who gets agency access (and reach to minors) should be explicit and auditable, not implicit.
- **Related:** Agency-initiated `redirect-apply` uses a token whose JWT check is **explicitly mocked** in code (`applications.js:612-615`) — an auth-bypass-shaped gap that needs hardening.

### 2.6 Messaging Abuse — **HIGH**
- **What exists:** Application-scoped messaging only (`messages.application_id`), both directions, with sessionless magic-link reply tokens (`message-reply.js`). Length caps (4000/1200 chars). Agency-side append-only `agency_audit_events` logs access/org events (not message content for safety).
- **Gaps:** **No keyword/abuse filtering, link/contact-info controls, blocking, muting, or reporting.** `attachment_url` is accepted from the request body with no validation (`messages.js:158,184`). Email notifications to talent help move conversations off-platform — a textbook off-platform-luring / grooming surface, especially from a not-fully-verified agency (§2.5) to a possibly-minor talent (§2.1).

### 2.7 Public Exposure / UGC Scraping — **HIGH**
- **What exists:** Public portfolio `/portfolio/:slug` correctly filters shareable images and blocks minors without guardian consent (`portfolio.js:350-364`).
- **Gaps:** `GET /api/public/home` (`src/routes/api/public.js:84-169`) exposes randomly-selected talent profiles + primary photos publicly but filters only on image status — it does **not** check `is_public` or `minorPublicExposureAllowed`, so a private or minor profile's primary photo can leak to the unauthenticated homepage carousel, bypassing the portfolio-route gate. Slugs are human-readable name-based (enumeration aid). R2 photos are served as **public, unsigned URLs** (`uploader.js`), so anyone with/guessing a key can fetch any talent's images independent of app gates (bucket ACL is infra-side — see open questions).

### 2.8 AI Disclosure, Bias & Automated Decisioning — **CRITICAL** *[counsel]*
- **What exists:** AI writes user-facing bios/training summaries/submission notes/messages (`src/domains/talent/services/*-writer/*`, `message-polish`). AI vision (`analyzeProfileImage.js:47-79`, `photo-analysis.js:89-119`) extracts **skin tone, bone structure, build type, weight/measurement estimates** from every profile photo. `scoring.js` converts these into 0–100 category scores; `match-scoring.js` ranks talent against agency boards with **hard filters (auto-reject at 0)** and **age-weighted** scoring.
- **Gaps:** (a) **No "AI-generated" disclosure or accuracy disclaimer** anywhere in the UI (grep `ai.?generated|powered by ai|disclaimer` → none user-facing). (b) An AI system **ranks and hard-filters people by skin tone, body type, and age** to gate access to agency/work opportunities → discrimination + automated-employment-decision exposure (NYC Local Law 144 bias-audit duty; EU AI Act biometric-categorization/high-risk; FTC §5 for undisclosed AI; Title VII/ADEA-style theories on age/skin-tone weighting). (c) AI runs on **minors'** images with no age check and transmits them to a third-party LLM (Groq).

### 2.9 Privacy & Data Protection — **CRITICAL** *[counsel]*
- **Data collected (sensitive):** identity (name, DOB, age, nationality, ethnicity, birthplace), body measurements/body type/skin tone, social handles incl. **OnlyFans**, phone, **emergency + reference third-party contacts**, precise **IP geolocation** (silently captured at login, `auth.js`; written to `onboarding_signals`), Google People API enrichment (birthday/gender/phone/addresses), facial **photos**, and **pgvector face/look embeddings** (`migrations/20260218000002/3`, `embeddings.js`). *Note:* passport/license/work-permit are **boolean readiness flags only** — no document numbers/scans stored (a real downgrade from the initial hypothesis).
- **Consent / lawful basis:** **None.** No consent checkbox, privacy notice, or terms acceptance at signup/onboarding (`CastingEntry.jsx`). IP geolocation harvested with no notice. Photo→AI analysis triggered automatically with no consent.
- **Biometric (BIPA/CPRA/CUBI):** Face photos + AI facial analysis + embeddings are biometric identifiers, stored with **no notice, no written release, no retention/destruction schedule** → BIPA private right of action + statutory damages ($1,000–$5,000/violation). *[counsel]*
- **Sub-processors (none disclosed):** Firebase (auth), Stripe (payments), **Groq** (raw headshot image + stats), **OpenAI** (profile text embeddings), **ipapi.co** (full client IP), Google People API, Instagram/Meta OAuth, Cloudflare R2 (photos), email provider. See table in §4.
- **Data-subject rights:** Export works but is **incomplete** (omits AI analysis, embeddings, geo/onboarding_signals, messages — `settings.js:471-524`). **"Erasure" is a no-op timestamp** (`settings.js:526-540`). Account deletion hard-deletes the DB graph via cascade **but does not delete R2 photo objects or the Firebase user** (`settings.js:570-586`) → face photos persist on a public CDN after "deletion."
- **Retention:** Effectively indefinite; no TTL/auto-purge on profiles, images, messages, embeddings, analytics.
- **Minors' privacy:** COPPA (under-13) + GDPR Art. 8 (13–16) — minors' photos/measurements/embeddings processed without verifiable parental consent (§2.1). *[counsel]*
- **International transfers:** nationality/birthplace fields imply EU/UK talent; data flows to US processors with **no SCCs/adequacy/TIA** referenced. *[counsel]*
- **Cookies/tracking:** session + `visitor_id` tracking + analytics storing IP/UA, with a stored `cookie_preferences` field but **no consent banner** and prefs not enforced. (Marketing-site pixels unverifiable — `landing/` absent.)
- **Controllership:** When talent apply, agencies receive substantial PII incl. DOB/age/measurements (`inbox.js`); Pholio + agency are likely joint/independent controllers with **no data-sharing agreement** and talent never told their full profile is disclosed to specific agencies. *[counsel]*

### 2.10 Terms of Service / Contract Formation — **CRITICAL** *[counsel]*
- No ToS/EULA/acceptable-use document or route exists (searched `views/`, `client/src` route table, `src/` registrations, `docs/`). Only a passive browsewrap linking to non-existent pages (`CastingEntry.jsx:283-303`); **no acceptance captured** (no `terms_accepted_at`/version column in any migration). Agency signup references no terms. Result: no liability limitation, warranty disclaimer, arbitration/class-waiver, acceptable-use rules, termination rights, UGC license, or indemnification. Browsewrap referencing nonexistent docs is the weakest, most-likely-unenforceable posture (*Specht*, *Meyer v. Uber*).

### 2.11 UGC / Photo IP & Copyright — **CRITICAL** *[counsel]*
- The `image_rights` table (`migrations/20260326120000_image_system_phase1_foundation.js:97-119`) exists (`copyright_owner`, `photographer_name`, `license_type`, `model_release_ref`, `rights_status`, …) but is **unused**: rows insert all-null and are only updated via an optional free-text PATCH (`media.js:1008-1026`); no field is required to upload. PDF guardrail only **warns** when rights are absent (`guardrails.js:107-122`).
- Talent routinely upload **photographer-owned** copyrighted images; Pholio hosts, displays, and **redistributes them in generated comp-card PDFs** and to agencies with no license grant from the user and no rights warranty → direct + contributory infringement exposure. No DMCA framework / designated agent (§2.13) → no §512 safe harbor.

### 2.12 Modeling-Industry Regulation / Advance-Fee — **CRITICAL** *[counsel]*
- **Talent pay Pholio directly:** `/pro/upgrade` is `requireRole('TALENT')` (`pro.js:11`); Stripe checkout permits TALENT (`stripe.js:26-29`); "Studio+" ~$29/mo, 14-day trial, success redirects to the **talent** dashboard (`settings.js:197-217`, `stripe.js:172`); talent-facing `PremiumAnalyticsUnlock.jsx`. Free tier capped at **5 agency applications/month** (`applications.js:210-231`).
- Charging aspiring models recurring fees to build portfolios/comp cards and **apply to agencies** listed on the platform is the fact pattern targeted by **advance-fee / model-scam statutes** and **talent-agency licensing** regimes: CA Talent Agencies Act (Lab. Code §1700+), **CA Krekorian Talent Scam Prevention Act**, NY GBL Art. 11 (§§170–190), plus FL/TX/etc. Risk that Pholio is characterized as an unlicensed talent agency or as facilitating advance-fee schemes. *[counsel]*

### 2.13 Entity / DMCA / Jurisdiction Signals — **HIGH** *[counsel]*
- No legal entity name (LLC/Inc), governing-law/venue, arbitration clause, abuse/legal contact, or **DMCA designated agent** anywhere (only "© Pholio" footers). No DMCA §512(c) safe harbor → compounds §2.11. No way for rights-holders or regulators to serve notice.

### 2.14 Payments / Consumer Protection — **HIGH** *[counsel]*
- Stripe subscriptions with auto-renewal + 14-day trial; cancellation only via Stripe Customer Portal (`stripe.js:200-232`). **No in-app auto-renewal disclosure, renewal reminder, pre-purchase price/term/cancellation terms, or refund policy.** FTC Negative-Option/"Click-to-Cancel" Rule, ROSCA, CA Automatic Renewal Law (trial-conversion notice + affirmative consent + easy cancel).

### 2.15 Marketing Claims — **HIGH** (conditional on `landing/`)
- In-app: `TalentSpotlight.jsx:156-167` hero "**Where careers are made.**" — an implied placement/success promise to paying aspiring talent. Combined with §2.12 (talent pay) this is the deception combination regulators look for (FTC §5; state model-scam advertising). The marketing site (`landing/`, absent here) must be reviewed for earnings/placement guarantees and testimonials before launch.

### 2.16 Email / Comms Compliance — **MEDIUM**
- `src/shared/lib/email.js` sends from `noreply@pholio.studio` with **no List-Unsubscribe, unsubscribe link, or physical address**. Fine for purely transactional mail; rises to HIGH the moment any promotional/agency-outreach email is sent (CAN-SPAM, CASL, ePrivacy).

### 2.17 Commissions — **MEDIUM** *[counsel]*
- `commissions` table records agency↔talent split %/amount (`migrations/20250101000000:54-71`; README markets "talent earnings"). No money-movement/payout/Stripe Connect code (record-keeping only). Inserting Pholio into agency–talent money representation invites liability and reinforces the "talent agency" characterization (§2.12); should carry an explicit "passive record, not a party/escrow" disclaimer.

### 2.18 Security Hygiene (privacy-adjacent) — **CRITICAL (key) / MEDIUM**
- **Hardcoded live Groq API key** committed in 3 files (`photo-analysis.js:42`, `chat.js:20`, `scout.js:11`). Rotate immediately and purge from history. **CRITICAL.**
- DB TLS not verified: `knexfile.js:244` `ssl: { rejectUnauthorized: false }` despite `verify-full` URL massaging. MEDIUM-HIGH.
- Public unsigned R2 URLs (§2.7). Verbose login logging of body keys/token presence (`auth.js:126-155`). Email verification columns exist but are **not enforced** at login.

### 2.19 Accessibility — **LOW**
- No WCAG/ADA statement; heavy Framer-Motion animation with no documented reduced-motion strategy. ADA Title III / WCAG 2.1 AA / EU EAA. Lower priority.

---

## 3. Industry Perspective / Benchmark View

Benchmarked against how real modeling/talent agencies operate (in-house "Booker" lens; `reference/standards.md`). The legal/T&S gaps above are not just compliance abstractions — they map directly onto well-known industry harms and norms.

- **Minors are a separate legal regime, not "smaller adults" (P0).** The industry standard for kids/teens boards is hard: **work permits**, **guardian consent on everything**, **chaperones on set**, **limited working hours/schooling**, **Coogan/trust accounts** for earnings, and **heightened privacy** on measurements and full-length/swim images. Pholio's self-attested `guardian_consent_at` + boolean `work_permit_on_file` is a gesture at this regime, not an implementation of it. Real platforms branch the entire minor flow: who can see what, who consents, what's collected, how it's stored.
- **Fake scouts / advance-fee scams are *the* signature fraud of this industry.** Legitimate agencies **do not charge talent upfront** to be represented; they take ~15–20% commission *after* booking. A platform that charges aspiring talent a subscription to apply to agencies is, to an industry eye, walking straight into the pattern that scam-prevention statutes (Krekorian Act, NY GBL Art. 11) were written to stop. The credible posture: never gate *applying to agencies* behind a talent fee; monetize tooling/agencies instead, and state explicitly that Pholio is software, not an agency, and guarantees nothing.
- **Agency legitimacy must be visibly verified.** Working talent and parents judge a platform by whether the "agencies" on it are real. Pholio's manual provisioning is better than open self-serve, but there is no **verified-agency** concept surfaced and no codified vetting. Industry expectation: business verification (registration, website/domain, references) and a visible trust signal before an "agency" can contact talent — especially minors.
- **Model releases & image rights are load-bearing, not metadata.** Every real submission assumes a **model release** and clear usage rights; tests/TFP carry their own terms. Pholio built the `image_rights`/`model_release_ref` schema and then left it optional and unenforced. The industry-credible version makes rights/release status a **required gate** before an image can be put in a comp card or pushed to an agency.
- **Measurements/photos are sensitive by industry custom, doubly so for minors.** The trade already treats body data and full-length/swim imagery as consent-gated and access-controlled. Pholio leaking minor/private primary photos to a public homepage (`/api/public/home`) or serving unsigned public image URLs would read as amateur and unsafe to any working agency.
- **Reporting & safe-set ethics are now an expectation.** Initiatives like the Model Alliance push consent-on-nudity, safe sets, and protection from exploitation. A talent platform with **no report button** and **no way to stop an "agency" from messaging you** is behind the industry's own stated safety bar, never mind the legal one.

**Where Pholio is actually credible:** the data model itself is strong and real (dual-unit measurements, boards/divisions, application lifecycle incl. `withdrawn`/`kept_on_file`, comp-card generation, agency RBAC). The deficit is governance around that data, not industry understanding of it.

### Benchmark tiering (necessary vs. best-practice vs. nice-to-have)
- **Legally necessary / high-risk (industry + law agree):** child-performer safeguards (permits/consent/Coogan/restricted visibility), no talent advance-fee for representation, model-release enforcement, content moderation + reporting, agency verification, privacy/biometric consent.
- **Strong best practice:** verified-agency badge, options/holds booking states, usage/buyout-aware money model, digitals-vs-book separation, message safety tooling, retention schedule.
- **Lower priority:** accessibility statement, marketing-claim polish, i18n of sizing/currency, commission-disclaimer copy.

---

## 4. Consolidated Gap List

### CRITICAL — fix before any growth/launch
1. **No CSAM screening or NCMEC reporting pathway**; minors processed at all (§2.1). *[counsel]*
2. **Self-attested, bypassable minor age/guardian-consent** (nullable DOB, boolean toggle) that *unlocks* sensitive imagery/public exposure (§2.1).
3. **No content moderation** (NSFW/explicit) before storage/display/agency-share/PDF (§2.2).
4. **No reporting/flagging and no moderation/admin tooling** anywhere (§2.3).
5. **No Terms of Service with captured acceptance** (§2.10).
6. **No Privacy Policy / consent / lawful basis**; biometric face embeddings with no BIPA notice/retention; "erasure" is a no-op and deletion leaves photos on a public CDN (§2.9).
7. **AI ranks/hard-filters people by skin tone/body type/age + no AI disclosure** (§2.8).
8. **Talent pay to apply to agencies** → advance-fee / unlicensed-agency exposure (§2.12).
9. **UGC photo IP unsecured** (no license grant, no rights warranty, redistributed in PDFs); **no DMCA agent/safe harbor** (§2.11, §2.13).
10. **Hardcoded live Groq API key in source** (§2.18) — rotate now.

### HIGH
11. Public/minor photo leak via `/api/public/home`; unsigned public R2 URLs (§2.7).
12. No block-enforcement / suspend / ban; rate limiters disabled in prod (§2.4).
13. Unfiltered messaging (off-platform luring, no link/contact controls), unvalidated `attachment_url` (§2.6).
14. Agency provisioning has no codified verification; `redirect-apply` JWT check mocked (§2.5).
15. Auto-renewal/refund disclosures missing (ROSCA/ARL/click-to-cancel) (§2.14).
16. Risky implied-outcome marketing copy; full `landing/` review pending (§2.15).
17. No legal entity/governing-law/abuse-contact (§2.13).
18. International data-transfer mechanism absent (§2.9). *[counsel]*

### MEDIUM
19. Email compliance footer/unsubscribe before any promo mail (§2.16).
20. DB TLS `rejectUnauthorized:false`; verbose auth logging; email verification unenforced (§2.18).
21. Cookie consent banner + enforce stored prefs (§2.9).
22. Commission "passive record, not a party" disclaimer; controllership/data-sharing agreement with agencies (§2.17, §2.9). *[counsel]*
23. Incomplete data-export coverage (§2.9).

### LOW
24. Accessibility statement / reduced-motion (§2.19).

---

## 5. Prioritized Implementation Plan

Three phases. Each item notes whether it is **[product]**, **[policy/legal doc]**, **[counsel-gate]** (must be reviewed by an attorney before shipping), or **[ops]**.

### Phase 0 — Immediate (this week, low-effort / high-severity)
- **Rotate the leaked Groq key** and remove it from all 3 files + git history; load from env only. **[product/ops]**
- **Fix the minor/private photo leak:** make `/api/public/home` honor `is_public` + `minorPublicExposureAllowed` (reuse existing `talent-age.js` helpers). **[product]**
- **Make DOB required and add a hard age gate at signup/onboarding;** treat "no DOB" as not-eligible rather than not-a-minor. **[product]**
- **Disable the `onlyfans_url` field for any profile detected/declared as a minor** (and review whether it belongs at all). **[product]**
- **Harden `redirect-apply`** — implement real JWT verification (`applications.js:612-615`). **[product]**
- **Turn on rate limiting** for media-upload + messaging routes in production (not just non-serverless). **[product]**

### Phase 1 — Foundational governance (weeks 1–6, launch-blockers)
**Child safety (top priority):**
- Replace self-attested guardian consent with a **verified parental-consent flow** (separate guardian email + verification step, recorded with audit trail). **[product] [counsel-gate]**
- Integrate **CSAM detection** (e.g. PhotoDNA/hash-matching or a moderation vendor with CSAM coverage) on upload, and stand up an **NCMEC CyberTipline reporting pathway** and internal escalation runbook. **[product] [counsel-gate] [ops]**
- Build a **minor-restricted mode**: no public exposure, restricted measurement/full-length imagery, no adult-content fields, gated agency contact, work-permit handling. **[product] [counsel-gate]**

**Content moderation + reporting + enforcement:**
- Integrate **automated image moderation** (NSFW/explicit) on upload; route flagged content to a **review queue**. **[product]**
- Ship a **reporting/flagging system** (report profile/image/message/agency) writing to a `reports` table, plus a minimal **admin/moderation console** with the enforcement primitives the platform lacks: hide content, **suspend/ban** users, action reports, audit log. **[product]**
- Add user **block enforcement** (consume the existing `blockedAgencies` list in send paths) and message-safety controls (link/contact-info handling). **[product]**

**Core legal documents (all [counsel-gate]):**
- **Terms of Service** with **clickwrap acceptance** (checkbox + stored `terms_accepted_at` + version), covering liability limitation, warranty disclaimer, arbitration/class-waiver, acceptable-use, termination. **[policy/legal doc]**
- **Privacy Policy** covering biometric/photo analysis, AI processing, and the full sub-processor list; for EU/biometric, **explicit consent**. **[policy/legal doc]**
- **UGC IP license + content representations** — user grants Pholio a hosting/display/redistribution license and warrants rights + model/photographer release; **wire the existing `image_rights` table to be required** before PDF/agency redistribution. **[product] [policy/legal doc]**
- **AI disclosure + automated-decision notice** — label AI-generated content; disclose (and, where required, bias-audit) the photo/match scoring; provide human-review/opt-out. **[product] [policy/legal doc] [counsel-gate]**
- **DMCA policy + registered designated agent + repeat-infringer policy.** **[policy/legal doc] [ops]**

**Privacy mechanics:**
- **Consent capture** at signup (terms + privacy + biometric/AI processing), with notice before IP-geolocation/photo analysis. **[product]**
- Make **erasure actually delete** (DB + R2 objects + Firebase user); make account deletion clean up R2 + Firebase. **[product]**
- Add a **biometric retention/destruction schedule** and surface it (BIPA). **[product] [counsel-gate]**

### Phase 2 — Business-model & compliance hardening (weeks 6–12+)
- **Resolve the talent-fee exposure** *[counsel-gate]*: with counsel, decide whether to stop charging talent to apply to agencies / reposition as software-not-agency / add advance-fee + "no guaranteed placement" disclaimers and the talent-agency-licensing analysis. Adjust §2.12/§2.15 marketing accordingly. **[product] [policy/legal doc]**
- **Auto-renewal/refund compliance** (ROSCA/CA ARL/click-to-cancel): pre-purchase disclosure, renewal reminder, easy in-app cancel. **[product] [counsel-gate]**
- **Agency verification program** + visible "verified agency" status + codified KYB before talent contact. **[product] [ops]**
- **International transfers** (SCCs/TIA), **cookie consent banner** + enforce prefs, **email compliance footer**, **data-sharing/controllership terms** with agencies, **DB TLS verification**, **complete the data-export**. **[product] [policy/legal doc] [counsel-gate]**
- Industry-credibility items that double as safety (options/holds states, digitals-vs-book separation, usage/buyout money model) — lower legal priority, sequence per product roadmap. **[product]**
- **Accessibility** statement + reduced-motion. **[product]**

---

## 6. Open Questions Requiring Legal or Product Clarification

**Must be answered by counsel before shipping the relevant area:**
1. **Talent-fee model:** Does charging talent to build portfolios and apply to listed agencies trigger talent-agency licensing or advance-fee/scam statutes (CA TAA, Krekorian Act, NY GBL Art. 11) in your operating states? Reposition or restructure? *(§2.12)*
2. **Minor handling adequacy:** Does any guardian-consent/work-permit design satisfy COPPA, GDPR Art. 8, and state child-performer law (incl. Coogan)? What is the §2258A CSAM-reporting compliance plan? *(§2.1)*
3. **AI scoring as employment decision:** Does agency match-scoring (skin-tone/body/age-weighted, hard filters) constitute an Automated Employment Decision Tool under NYC LL144, or high-risk/biometric-categorization under the EU AI Act? Bias-audit + notice required? *(§2.8)*
4. **Biometrics:** Do face photos + AI analysis + pgvector embeddings trigger BIPA/CUBI/CPRA biometric regimes given indefinite retention? Consent + written release + retention schedule scope. *(§2.9)*
5. **Controllership:** Is Pholio a controller, processor, or joint controller vis-à-vis agencies, and what data-sharing agreement is required? *(§2.9)*
6. **International transfers:** SCCs/adequacy/TIA needed for EU/UK talent data flowing to US processors? *(§2.9)*

**Product/business clarifications needed (some feed the legal questions):**
7. **Who actually pays in production?** Stripe price IDs are env-driven; code permits TALENT to pay. Confirm whether talent are charged in production and for what. *(§2.12)*
8. **The `landing/` marketing site** is absent from this checkout — it must be audited for placement/earnings guarantees, testimonials, cookie pixels, and whether the `/terms` & `/privacy` pages the app links to actually exist. *(§2.10, §2.15)*
9. **R2 bucket ACLs:** Are objects world-readable by direct key (enabling enumeration past app gates), or behind an authenticated CDN? Infra-side, not in repo. *(§2.7)*
10. **Manual agency provisioning:** What does the out-of-band vetting actually require today? Should it be codified with a verification standard + "verified" status? *(§2.5)*
11. **Is the `commissions`/earnings feature ever going to move money** (Stripe Connect/payouts), or remain a passive ledger? Money-transmission implications differ. *(§2.17)*
12. **`blockedAgencies`** — confirm it is currently unenforced and prioritize enforcement. *(§2.4)*

---

*Prepared from a four-workstream code-grounded review plus an in-house industry benchmark. Findings tagged [counsel] are flagged for attorney review and are not legal advice. Items that could not be verified in this checkout are listed as open questions rather than assumed either way.*
