# Agency Dashboard Supplemental Audit — Security, Compliance, and Talent Alignment

Date: 2026-07-12
Scope: agency dashboard API/UI, talent submission flow, sensitive talent data, internal notes, agency decisions, uploads, and multi-user access.

## Executive launch read

Pholio is closer than a generic CRM because it already has agency RBAC, application scoping, minor-aware submission packages, image visibility helpers, guardian consent, legal acceptance for talent, audit tables, and industry-real states such as `kept_on_file`, `requested_more`, `meeting_requested`, and `development`. The launch risk is not that nothing exists; it is that the protections are uneven across surfaces and some high-risk states are still policy-only rather than product-enforced.

Highest-priority launch gates:

1. Enforce CSRF protection or a same-origin mutation token for all cookie-session write routes.
2. Move agency RBAC enforcement from configurable to always-on in production and make unmapped agency routes fail closed.
3. Add author/actor metadata and retention/export policy for internal notes, messages, and decision logs.
4. Sanitize or rasterize SVG agency-logo uploads, or disallow SVG until a sanitizer is in place.
5. Treat minor access as a named, consented disclosure with expiry/revocation semantics across details, notes, messages, exports, and downloads.
6. Align the agency and talent dashboards around shared lifecycle semantics: submission package, request-more, meeting/go-see, development/new face, signed/represented, bookout/option/hold, and withdrawal/revocation.

## Lens 1 — Security audit

### S-P0-1 — Cookie-authenticated mutation routes lack visible CSRF protection

**Finding.** The Express session is cookie-based with `httpOnly`, `sameSite: "lax"`, and production `secure`, but there is no visible CSRF middleware or per-request mutation token before JSON/body routes. Agency API clients use session cookies with `credentials: 'include'`, and write endpoints mutate applications, notes, teams, boards, reminders, interviews, messages, branding, and uploads.

**Launch risk.** A malicious page can attempt cross-site form/fetch style state changes against an authenticated agency principal. `SameSite=Lax` reduces some ambient-cookie risk, but it is not a complete CSRF control for a sensitive workspace, and future OAuth/payment/magic-link flows can accidentally widen this surface.

**Evidence.** Session cookies are configured in `src/app.js` with `sameSite: "lax"`, `httpOnly`, and production `secure`; no CSRF middleware appears in the app middleware chain before routes. Agency write routes such as application accept/decline/status and notes are standard cookie-authenticated API routes.

**Recommendation.** Add a same-origin CSRF strategy for authenticated mutations: either `csurf`/double-submit token, a server-issued `X-CSRF-Token` bound to the session, or strict Origin/Referer validation plus a non-simple custom header required on every unsafe method. Add route-level tests for `POST/PATCH/PUT/DELETE /api/agency/*` without the token.

### S-P0-2 — Agency RBAC has good coverage, but enforcement is config-dependent and unmapped routes fail open

**Finding.** The agency API guard mounts `requireRole("AGENCY")`, onboarding gating, permission loading, and route-permission enforcement. The route permission map covers many sensitive paths. However, `enforceAgencyRoutePermissions()` returns `next()` when a route has no permission mapping, and if `config.agencyRbacEnforce` is false it logs and allows violations.

**Launch risk.** A newly added agency endpoint can ship without permission mapping and become accessible to any agency member. A production misconfiguration can turn real RBAC into observability-only logging. This is especially risky for internal notes, exports, status decisions, team permissions, and sensitive roster/profile detail views.

**Evidence.** `mountAgencyApiGuard()` wires `loadAgencyPermissions` and `enforceAgencyRoutePermissions()` for `/api/agency`. `enforceAgencyRoutePermissions()` allows unmapped routes and allows denied permissions when enforcement is off. The permission catalog includes dangerous actions such as export, accept, team grants, and board deletion.

**Recommendation.** In production, fail closed for every `/api/agency/*` route without an explicit permission mapping. Make `agencyRbacEnforce` impossible to disable in production. Add a route snapshot test that enumerates registered agency routes and asserts every unsafe route maps to a permission.

### S-P0-3 — SVG logo uploads are accepted without an explicit sanitizer in the upload layer

**Finding.** Talent image uploads restrict to JPEG, PNG, and WEBP. Agency logo uploads allow PNG and SVG based on MIME and extension. The upload layer does not show SVG sanitization, rasterization, or content sniffing.

**Launch risk.** Stored SVG can contain script, external references, tracking pixels, unexpected XML payloads, or embedded content. If rendered directly in the agency rail or public agency surfaces, this can become stored XSS or data exfiltration risk. Even if React currently uses an `img`, downstream email/PDF/HTML contexts can change the risk profile.

**Evidence.** `uploadAgencyLogo` accepts `image/svg+xml` and `.svg` in `src/shared/lib/uploader.js`; regular profile upload MIME allowlist excludes SVG.

**Recommendation.** For launch, disallow SVG logos or sanitize with a hardened SVG sanitizer and serve with restrictive headers. Prefer rasterizing SVG to PNG/WebP at ingestion. Add magic-byte/content sniffing; do not trust MIME and extension alone.

### S-P1-1 — Internal notes do not capture author identity, edit history, or retention policy at the data boundary

**Finding.** The notes API verifies that the application belongs to the agency and logs note add/edit/delete activities, but inserted `application_notes` only store `application_id`, `note`, timestamps, and no visible author/actor fields in the write path. Activity logs include a note preview, but the note row itself has no ownership or edit trail.

**Launch risk.** Internal notes are high-risk because bookers may record subjective assessments, protected-trait comments, decisions, or follow-up instructions. Without actor metadata, edit history, and retention/deletion policy, Pholio cannot answer basic workplace questions: who wrote this, who changed it, why was it deleted, and what should be exported/deleted when talent withdraws?

**Evidence.** Note routes verify `application_id` and `agency_id`, then insert/update/delete note text and log activity. The migration creates `application_notes` as private agency notes.

**Recommendation.** Add `created_by_user_id`, `updated_by_user_id`, optional `deleted_at`, and an immutable note audit table. Add UI copy that notes are internal and should avoid protected-class commentary. Include notes in agency export only behind owner/admin permission and exclude from talent-facing exports unless legally required with redaction review.

### S-P1-2 — Details endpoints are minor-safe by DTO, but the raw full-profile read is still broad

**Finding.** Application detail loads the full profile row, then shapes the response through submitted packages or submission snapshots and nulls minor contact fields. Generic discovery uses tighter DTOs and minor gating. That is good, but broad raw reads increase regression risk: one future spread or debug response can leak DOB, contact, guardian, AI, or moderation fields.

**Launch risk.** Sensitive talent data can leak through a future code path, exception payload, export, or component refactor. This is a common failure mode in admin/workspace products where backend code has raw rows and client DTOs drift.

**Evidence.** Application details verify agency ownership and withdrawn status, load `profiles.*` and user rows, then build submitted profiles and minor-safe response fields. `audience-dto.js` documents static allowlists that exclude DOB, phone, guardian contacts, raw AI columns, and exact age for agency discovery/submission audiences.

**Recommendation.** Replace detail reads with `selectColumnsForAudience(AUDIENCE...)` where practical; add contract tests that assert forbidden keys never appear in every agency response, export, and submission package. Treat raw profile rows as server-internal only.

### S-P1-3 — CSP is report-only and still permits inline scripts

**Finding.** Helmet is enabled, but CSP is explicitly report-only and `scriptSrc` includes `'unsafe-inline'` because the app has inline Firebase bootstrap script usage.

**Launch risk.** If any stored-content XSS reaches a dashboard view, CSP will not block execution. Report-only is useful telemetry, not a launch-grade mitigation for a workspace with uploads, notes, messages, rich agency text, and public profile content.

**Evidence.** `src/app.js` mounts Helmet with `contentSecurityPolicy.reportOnly: true` and `scriptSrc` including `'unsafe-inline'`.

**Recommendation.** Add nonce/hash infrastructure for EJS bootstraps and Vite shell, remove unsafe inline script, then enforce CSP in production. Keep report-only in staging during rollout.

## Lens 2 — Legal, policy, and compliance audit

### C-P0-1 — Legal acceptance is enforced for talent, but agency legal acceptance is not visibly equivalent

**Finding.** Talent API routes use `requireTalentLegalAcceptance()`, with explicit exemptions for legal status/acceptance and bootstrap reads. The reviewed agency guard does not show an equivalent Terms/Privacy/Data Processing acceptance gate for agency users who process talent submissions, internal notes, and team access.

**Launch risk.** Agencies are data controllers/processors for sensitive images, measurements, minors, messages, and decisions. If agencies can operate without accepting workspace terms, privacy obligations, data processing terms, acceptable-use rules, and non-discrimination policy, Pholio has a contractual and compliance gap.

**Evidence.** Talent routes mount `requireTalentLegalAcceptance()` before all `/api/talent/*` routes. Agency API guard only enforces agency role, onboarding completion, permissions, and route permissions.

**Recommendation.** Add agency legal acceptance and policy acknowledgment before dashboard use: Terms, Privacy, agency workspace acceptable-use policy, prohibited protected-trait decisioning, model-image/data handling, and DPA where applicable. Store versioned acceptance per human member, not just agency account.

### C-P0-2 — Minor compliance is strong in the talent flow, but agency-side revocation/expiry is not fully productized

**Finding.** The codebase includes guardian consent request/verification, account-level and named-agency consent, minor submission gating, minor-safe disclosure copy, generic discovery exclusion for minors, and contact suppression in application details. However, agency-side follow-on workflows need explicit consent expiry, revocation, and post-withdrawal handling across messages, notes, details, exports, comp-card downloads, reminders, and team access.

**Launch risk.** A guardian may authorize one named-agency submission, but agency staff can continue retaining or acting on internal notes and downloaded/exported materials after withdrawal or consent expiry unless the product makes access boundaries explicit. For minors, this is a P0 trust/compliance issue.

**Evidence.** Talent applications require guardian authorization before minor submissions; disclosure copy says minors share limited data and omit raw DOB/contact. Agency details suppress minor `user_email` and contact. Withdrawn applications return 410 for details/notes, but notes/messages/reminders/exports/downloads need a consistent policy review.

**Recommendation.** Add a minor-access matrix and automated tests covering every agency endpoint. Store consent grant ID and expiry on the application/submission package. On withdrawal or consent revocation, freeze or tombstone agency access consistently, retain only legally necessary audit metadata, and block exports/downloads.

### C-P1-1 — Data export can include aggregated internal notes without a redaction workflow

**Finding.** Agency export aggregates notes into a CSV field. Internal notes can contain protected traits, subjective comments, or unreviewed personal data. There is no visible redaction or owner confirmation workflow around exporting these notes.

**Launch risk.** Exports create durable, uncontrolled copies of sensitive talent data and agency decision rationales. This increases GDPR/CCPA access/deletion complexity, discrimination risk, and breach blast radius.

**Evidence.** `src/domains/agency/routes/inbox.js` aggregates notes with `string_agg(note, ' | ' ORDER BY created_at)` for export and includes them in CSV output.

**Recommendation.** Split exports into operational roster/application export and privileged internal-notes export. Require owner/admin permission, include a warning, add audit logging, and support redaction/exclusion of internal decision notes by default.

### C-P1-2 — Decision-support scoring needs explicit anti-discrimination guardrails

**Finding.** Boards and scoring weights include age, height, measurements, body type, comfort, experience, skills, location, and social reach. This maps to real casting operations, but it also touches legally sensitive attributes and can produce discriminatory outcomes if used outside legitimate casting requirements.

**Launch risk.** Agencies may treat match scores as automated decisions rather than decision support. Age/body/measurement filters can be legitimate for certain jobs but risky for representation decisions, minors, or protected categories without policy constraints and auditability.

**Evidence.** Board requirements include min/max age, height, bust, waist, hips, body type, comfort levels, and social reach. Agency API comments identify Fit Briefs as decision support, not a decision.

**Recommendation.** Add product copy and API metadata that scores are decision support. Require a brief/job context for sensitive filters, log the rationale for age/body filters, hide exact age for non-owner audiences, and prohibit protected-trait decisioning in agency terms. Add explainability and challenge/review affordances for status changes.

### C-P1-3 — Upload and image-rights policy needs workspace-level enforcement and notices

**Finding.** The codebase has image-rights and model-release concepts and minor media gates, but agency upload/logo handling and agency viewing/downloading of talent images needs explicit rights language and endpoint enforcement.

**Launch risk.** Agencies may download or reuse talent photos beyond the submitted purpose. For a portfolio platform, misuse of digitals, tests, tearsheets, and comp cards can become a rights and trust problem quickly.

**Evidence.** Upload processing persists public URLs for R2/local assets; image-rights helpers distinguish releases, including guardian signer role for minor images. Agency routes expose images in submission packages and details.

**Recommendation.** Add a submission-purpose notice and terms around agency use: review/representation only unless separately licensed. Gate comp-card/image downloads by permission and audit event, display release/rights status where available, and disable download for images without sufficient release status.

## Lens 3 — Talent-to-agency dashboard alignment audit

### A-P0-1 — Withdrawal/revocation semantics must align across both dashboards

**Finding.** Talent can withdraw applications, and agency detail/notes endpoints return 410 for withdrawn submissions. This is the right direction. The alignment risk is ensuring all agency dashboard surfaces — lists, threads, exports, reminders, interviews, board cards, cached submission packages, and downloaded comp cards — reflect the same revocation state that the talent sees.

**Launch risk.** If talent sees “withdrawn” while an agency still sees details, notes, messages, or exportable data, trust breaks immediately. For minors, this is also compliance risk.

**Evidence.** Agency application list excludes withdrawn submissions; details and notes return `application_withdrawn`. Talent applications have withdrawal routes and delete associated artifacts in some flows.

**Recommendation.** Add a single `application_access_state` derived helper shared by agency routes. Use it in every agency query and UI empty state. Talent should see exactly what was revoked and what remains as retained audit metadata.

### A-P1-1 — Industry lifecycle states exist, but talent and agency labels need one canonical map

**Finding.** Agency API supports `submitted`, `shortlisted`, `requested_more`, `meeting_requested`, `development`, `accepted`, `booked`, `represented`, `passed`, `declined`, `archived`, and `kept_on_file`. This is much more credible than binary accept/reject. The risk is label drift: talent-facing copy still has legacy “application accepted/declined” language in some email templates, while agency surfaces use “applications” and “interviews” instead of submission/go-see/meeting semantics in places.

**Launch risk.** Talent may interpret `accepted` as signed/represented, while an agency may mean “accepted into pipeline” or “positive response.” That mismatch produces support tickets and real-world reputational harm.

**Evidence.** Agency API comments and client helpers include request-more, meeting/go-see, development, keep-on-file, accept, and decline. Email templates still include “Your application was accepted” / “has accepted your application” language in legacy templates.

**Recommendation.** Create a shared lifecycle copy map for both dashboards and emails: Submitted, In review, Shortlisted/kept on file, More digitals requested, Meeting/go-see requested, Development offer, Signed/represented, Not moving forward, Withdrawn. Avoid “accepted” unless the product defines the obligation precisely.

### A-P1-2 — Booking/availability alignment is incomplete: talent has bookouts, agency has roster status, but options/holds are not unified

**Finding.** Industry operations revolve around bookouts, holds, 1st/2nd options, confirmed bookings, fittings, vouchers, and release/cancel. The repo has profile availability/bookout migrations and agency statuses such as booked/represented, but the agency dashboard still appears centered on application/casting pipeline states rather than a complete option calendar.

**Launch risk.** Agencies cannot safely operate real bookings if a talent-declared bookout is not visible in casting decisions or if agency “booked” does not correspond to a confirmed booking with dates, usage, call sheet, and voucher status. Talent may think availability was respected while bookers see stale state.

**Evidence.** Industry references require options/holds/bookouts. The repo includes availability/bookout tables, confirmed-job safety tables, and application status `booked`, but status update endpoints only mutate application status.

**Recommendation.** Build a shared availability contract: talent bookouts block agency options; agencies can place holds/options with priority; talent sees holds/options in plain language; confirmed bookings create job safety/contact context and voucher/payment lifecycle.

### A-P1-3 — Submission package alignment is the right architectural pattern, but UI should make “what was shared” explicit on both sides

**Finding.** The agency detail route prefers a frozen submission package when available and falls back to live-profile snapshot only for legacy records. Talent disclosure copy describes the shared data categories, with minor-specific limitations.

**Launch risk.** Without matching UI surfaces, talent may believe agencies see live profile updates or private/contact data that are not shared, while agencies may believe they are reviewing current measurements/images when they are actually reviewing a frozen submission snapshot.

**Evidence.** Agency details load `submissionPackage` and freeze submitted images/profile when available. Talent disclosure copy enumerates data categories, and minor disclosure omits direct contact/social/raw DOB.

**Recommendation.** On talent application detail, show the exact submission package version and disclosure timestamp. On agency detail, label “Submitted package” vs “current profile” clearly, show measurements updated date, and provide a request-more path rather than silently showing live-private data.

### A-P2-1 — Terminology should move from generic SaaS toward agency trade language without confusing talent

**Finding.** The product already uses good terms: comp card, digitals, book, boards, bookouts, development, kept on file. Some surfaces still use generic “application,” “interview,” “status,” and “accepted” terms. These are understandable to talent but less credible for agencies.

**Launch risk.** Not a blocker, but terminology is a trust signal. A real booker expects submissions, boards, go-sees/meetings, digitals, options, holds, bookouts, vouchers, and represented/new face distinctions.

**Evidence.** Agency helpers explicitly mention “meeting / go-see,” while several APIs and email templates still call the flow applications/interviews/accepted.

**Recommendation.** Use dual-language where needed: “Submission” primary, “application” as helper copy for talent onboarding; “Meeting / go-see” in agency; “Interview” only for non-model talent or generic talent categories; “Signed / represented” instead of vague accepted when the agency decision creates representation.

## Recommended launch backlog

### Must fix before broad agency launch

- CSRF or same-origin mutation protection on all cookie-authenticated write routes.
- Production fail-closed RBAC for unmapped and unauthorized agency API routes.
- SVG logo hardening: sanitize/rasterize or disable SVG.
- Agency legal/policy acceptance per member, versioned and auditable.
- Endpoint-by-endpoint minor access/revocation test matrix.
- Internal note authorship, audit trail, and retention/export policy.

### Should fix before paid launch

- Enforced CSP with nonces/hashes and no `'unsafe-inline'`.
- Redacted/privileged export modes for notes and sensitive fields.
- Shared lifecycle copy map across talent UI, agency UI, notifications, and emails.
- Explicit submitted-package versioning on both dashboards.
- Decision-support guardrails for match scoring and sensitive filters.

### Can follow shortly after launch

- Full option/hold/bookout/confirmed-booking/voucher/payment lifecycle.
- Rights-aware image/comp-card download audit and release-status display.
- Team-level privacy training copy and protected-trait note warnings.
- Region-specific minor compliance modules: work permits, Coogan/trust account, chaperone/schooling.

## Review notes

This audit did not run the application in a browser and did not attempt exploit proof-of-concepts. It is a static product/security/legal/industry review of the current code paths and product semantics.
