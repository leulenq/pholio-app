# Pholio Agency Access System

**Status:** Product/system specification for implementation.
**Date:** 2026-07-10
**Scope:** Replace any agency path that implies open self-serve onboarding with a curated access-request, manual-review, approval, credentialing, and agency-specific post-login setup system. The public request form belongs in the separate `pholio-landing` marketing repo; the authenticated agency setup workflow belongs in this `pholio-app` product repo.

## 1. Real frame

Agency access is not talent onboarding and it is not an open self-serve signup. For Pholio, the credible industry frame is a **reviewed agency partnership request** on the public marketing site followed by a **private agency implementation setup** inside the app after approval. Agencies should never be sent to the public `/onboarding` casting flow. The current product already blocks automatic agency creation in login and the legacy partner form, but the user-facing model is incomplete: `/signup` still redirects unknown users to `/onboarding`, `/partners` renders a dead-end “manual provisioned” message, and agency onboarding after login is bypassed in the auth redirect path.

The correct model:

1. Agency requests access through a short, premium partnership application.
2. Pholio reviews the agency, optionally holds a qualification call, and approves/declines/keeps warm.
3. Pholio provisions the agency account and first owner/admin credentials.
4. The approved agency signs in through normal `/login`.
5. The first signed-in owner/admin completes a dedicated `/dashboard/agency/setup` workflow before normal dashboard operations.

This keeps Pholio feeling curated and protects the agency side from fake agencies, low-quality rosters, scraping, and legal/privacy risk around talent data.

## 2. Current Pholio alignment, repo boundaries, and gaps

| Area | Current behavior | Required change |
| --- | --- | --- |
| Anonymous signup | `GET /signup` redirects to `/onboarding`, which is talent-specific. | Keep `/signup` talent-only. Agency CTAs should live in `pholio-landing` and point to a landing-owned request form; never send agencies to `/onboarding`. |
| Agency self-creation | Login blocks auto-created `AGENCY` users and says agency accounts are provisioned by Pholio. | Keep this principle, but replace the dead end with a formal request-access path. |
| Partner page | `/partners` renders a legacy agency signup page; `POST /partners` returns 403 manual-provisioning copy. | Retire as signup in `pholio-app`; redirect or link to the `pholio-landing` agency request page. Keep app-side APIs only if the landing form posts into this app. |
| Post-login agency onboarding | `redirectForSession` contains a removed/bypassed agency onboarding block and `/dashboard/agency/onboarding` redirects to the dashboard. | Restore a dedicated agency setup gate, but under agency design language and agency data model, not the talent onboarding domain. |
| Existing agency app | Agency dashboard already has roster, applicants, casting, boards, team, messages, reminders, analytics, and settings. | Setup should configure these operational primitives: boards, team roles, roster/imports, open-call links, inbox rules, and brand/profile details. |

## 3. Research inputs and stress-test corrections

Research points that should shape implementation:

- Implementation should be staged: pre-review, qualification/kickoff, account provisioning, workspace configuration, team enablement, roster/import work, go-live confirmation, and handoff to ongoing support. Generic onboarding sources were used only for sequencing; Pholio copy and product shape must remain agency-native.
- Access-request systems should include approval, least-privilege provisioning, auditability, and periodic review rather than open-ended permissions. Access-governance references were used only to validate review/provisioning controls.
- Model/talent agency tools emphasize operational setup around rosters, packages/shortlists, bookings, invoices/statements, clients, calendars, and reports. Comparable category references reviewed: AgencyPin, Mainboard, Mediaslide, and LiveDesk.
- Import/migration is expected in this category: Flowboard explicitly offers migration of model records, client contacts, booking history, and portfolio files plus onboarding sessions for admins/bookers. Source: Flowboard FAQ (`https://www.flowboardpro.com/`).
- Industry reality: agencies organize talent by boards, bookers work boards, inbound talent should flow into an application/open-call inbox, and real operations include digitals, comp cards, castings/go-sees, options/holds, bookouts, vouchers, commission, and split-aware payments. Source: local industry reference `.agents/skills/industry/reference/standards.md` and `.agents/skills/industry/reference/lifecycle.md`.

Stress-test corrections applied to this plan:

- **P0 — repo boundary:** the public agency request form must be specified for `pholio-landing`; this app repo owns the authenticated setup workflow and may own the intake API.
- **P0 — no agency `/onboarding`:** agency setup must not reuse the talent casting/onboarding domain, dark onboarding design system, or talent state machine.
- **P1 — no generic platform-funnel language:** keep the external page in partnership/access language and the internal flow in agency-operations language; avoid generic sales labels where possible.
- **P1 — dashboard fit:** post-login setup should feel like a focused agency command-center checklist embedded in the agency system, not a marketing microsite or talent reveal.
- **P1 — talent-system compatibility:** request/access changes must not alter talent `/onboarding`, `/apply`, agency open-call claims, or submission quota rules. Open-call links remain agency-to-talent inbound tools after the agency is approved.
- **P2 — implementation scope:** if the full import system is too large for V1, ship an import-intake job and concierge review path rather than pretending complete automated migration is available.

## 4. Part 1 — Public agency access request

### 4.1 Page purpose, repo ownership, and positioning

**Repo ownership:** the public request form belongs in **`pholio-landing`**, not `pholio-app`. Recommended marketing route: **`/agency/request-access`** or **`/partners/request-access`** in the landing repo. The app repo may expose the receiving API, but it should not own the public marketing page. If `/partners` remains in `pholio-app` for compatibility, it should redirect to the landing-owned request page or render only a thin handoff.

The landing page should communicate:

- **Curated access:** “Pholio partners with selected agencies and management teams.”
- **Operational value:** roster command center, inbound open calls, boards, casting packages, team workflows, and migration support.
- **Review expectation:** “Every request is reviewed by our team. We may schedule a short call before approval.”
- **No instant account promise:** the CTA is “Request agency access,” not “Create account” or “Start onboarding.”
- **Data-respect posture:** Pholio manages talent images, stats, submissions, and team access with privacy and permission controls.

Avoid generic platform-funnel language: no “Sign up free,” no “Start trial,” no “Create agency account,” no “book a demo” as the primary CTA, and no dashboard screenshots that make access look instant. The page should feel like a controlled partnership request, not a sales funnel.

### 4.2 Frontend design contract for `pholio-landing`

The public request page is a marketing-repo surface, but it should borrow the **agency command-center** visual language rather than the talent onboarding system:

- Warm cream canvas, white paper form surfaces, thin ink/gold rules, and restrained gold actions.
- Playfair Display for the page masthead and major editorial title moments; Inter for all form labels, help text, fields, and buttons.
- Rectangular 8–12px controls and panels; no oversized rounded form cards.
- Dense, composed form rhythm: fieldsets separated by hairline rules and measured spacing, not repeated icon-card grids.
- Motion should be minimal and purposeful: field focus, validation, section reveal, and submit confirmation only; 150–200ms with reduced-motion fallback.
- No hero eyebrow, no pill chips, no status badges, no gradient text, no glass panels, no decorative AI ornaments, no “New/Beta/Live/AI-powered” badges.

The page may use a more editorial landing composition than the authenticated dashboard, but it should still feel like an agency director is requesting entry to a private operating system, not like a talent is entering a cinematic screen test.

### 4.3 Trust signals

Use restrained, premium proof rather than badge clutter:

- Short line on reviewed network quality: “Reviewed agencies only, so talent submissions stay high-signal.”
- Privacy/security line: “Role-based team access, audit-ready account provisioning, and controlled talent visibility.”
- Migration support line: “We can help structure boards and import roster data from spreadsheets or current systems.”
- Industry-fit line: “Built around boards, bookers, digitals, comp cards, casting packages, and agency workflows.”
- Optional proof once real: named pilot agencies, anonymized roster volume, or “used by agencies managing X talent” only if true.

Do not use “AI-powered,” “beta,” “live,” or decorative status badges because those are banned UI patterns in this repo.

### 4.4 Form structure

Recommendation for `pholio-landing`: **single editorial page with an embedded three-section form** rather than a long wizard. The request should feel selective but not like procurement. Keep it to **10 required fields + 6 optional fields**, with progressive disclosure for import/system details.

Section 1 — Agency identity:

| Field | Required? | Type | Why |
| --- | --- | --- | --- |
| Agency / management company name | Required | Text | Primary entity. |
| Website or public profile URL | Required | URL | Basic legitimacy check. |
| Primary market / headquarters city | Required | City + country/region | Market context matters for agency legitimacy and setup. |
| Additional office locations | Optional | Multi-text | Needed later for multi-office setup, not a blocker. |
| Agency type | Required | Select/multi-select: modeling agency, talent agency, mother agency, placement/scouting agency, management company, hybrid | Industry distinction affects setup and data model. |
| Primary boards represented | Required | Multi-select + “other”: women, men, new faces/development, commercial/lifestyle, curve, runway, fit, parts, kids/teens, classic/mature, influencer/digital, actors/performers | Validates industry fit and seeds setup. |

Section 2 — Primary contact:

| Field | Required? | Type | Why |
| --- | --- | --- | --- |
| Contact name | Required | Text | Review owner. |
| Work email | Required | Email | Credentialing path; prefer domain email. |
| Role/title | Required | Select/text: owner/director, head booker, booker/agent, scout, operations, accounting, other | Tells whether requester can approve implementation. |
| Phone / WhatsApp | Optional | Phone | Useful for qualification call; not required to reduce friction. |
| Best timezone | Optional | Select | Scheduling. |

Section 3 — Fit, needs, and migration:

| Field | Required? | Type | Why |
| --- | --- | --- | --- |
| Approximate roster size | Required | Range: <25, 25–75, 76–200, 201–500, 500+ | Setup/import complexity and pricing signal. |
| Number of agents/bookers/admin users | Required | Range | Team/RBAC setup. |
| Current system | Optional | Select: spreadsheets, Dropbox/Drive, Mainboard, Mediaslide, AgencyPin, LiveDesk, custom, other, none | Useful for import planning; not needed for legitimacy. |
| What do you want Pholio to help with first? | Required | Multi-select: inbound submissions/open calls, roster/boards, comp cards/packages, casting pipeline, team workflow, migration, analytics, commissions | Routes review and setup. |
| Are you requesting import/migration support? | Optional | Yes/no/unsure | If yes, follow-up in setup, not heavy upload on public form. |
| How did you hear about Pholio? | Optional | Select/text | Growth attribution. |
| Anything we should know before review? | Optional | Textarea, max 500 chars, `resize: none` | Context without turning the request into an essay. |

Do **not** collect sensitive talent data, roster files, client lists, full contracts, tax IDs, payment details, uploaded logos, or minor-related data in the public landing request form. Those belong after approval in authenticated setup with explicit data-handling terms.

### 4.5 Required vs later

Collect upfront:

- Legitimacy: agency name, website, market, agency type.
- Authority: contact name, work email, role/title.
- Implementation sizing: roster size, number of bookers/admins, primary boards.
- Intent: first use case.

Collect later after approval:

- Full agency legal entity and billing details.
- Team invites and permission roles.
- Board definitions, office-specific settings, and branding assets.
- Roster/import files, client contacts, booking history, commission settings.
- Open-call link configuration and public agency profile details.

### 4.6 Submission confirmation

After submission, render a calm confirmation state:

- “Request received” language, not “account created.”
- Set expectation: “We review agency requests manually. If there is a fit, we’ll email next steps or schedule a short call.”
- Expected response window: **2–5 business days** for normal review; optionally faster for referred agencies.
- Provide a way to update the request by replying to the confirmation email, not by resubmitting.
- Send an internal notification to Pholio ops and a confirmation email to the requester.

### 4.7 Internal review workflow

Recommended states for `agency_access_requests`:

```text
submitted
  -> triage
  -> needs_info
  -> qualification_call
  -> approved_pending_provisioning
  -> provisioned
  -> active
  -> declined
  -> waitlisted
  -> archived_duplicate
```

Review checklist:

1. Verify website/domain, public roster/profile, market presence, and contact email domain.
2. Confirm requester authority or route to an owner/director/head booker.
3. Check if the agency handles minors/kids/teens; flag additional privacy/compliance setup.
4. Identify agency type: mother agency, market agency, management, placement/scouting, hybrid.
5. Identify board complexity and import needs.
6. Decide whether a call is required. Calls should be required for large rosters, kids/teens boards, migration requests, suspicious domains, or unclear agency legitimacy.
7. Approve, decline politely, or keep warm/waitlist.

Approval creates:

- An `agencies` row in `pending_setup` or equivalent state.
- An owner `users` row with role `AGENCY` and verified/provisioned status.
- An `agency_memberships` owner/admin row.
- A password reset / set-password email through Firebase Admin or existing SMTP reset flow.
- An audit event linking request ID, reviewer ID, provisioned agency ID, and first owner user ID.

Decline copy should be concise and non-accusatory: “Pholio is currently onboarding a limited group of agencies. We’re not able to open access right now, but we’ll keep your request on file.” Avoid detailed fraud reasons.

## 5. Part 2 — Post-login agency setup workflow

### 5.1 Setup route and gating

Route recommendation in `pholio-app`: **`/dashboard/agency/setup`**.

Gating rules:

- Only approved/provisioned agency users can log in.
- If agency `setup_completed_at` / existing `onboarding_completed_at` is null, redirect agency users to `/dashboard/agency/setup` instead of the normal dashboard. This check belongs in `AgencySessionGate` or a dedicated setup guard, not the talent onboarding middleware.
- Allow limited access to logout, support, billing/legal pages, and password reset.
- Once setup is completed, `/dashboard/agency/setup` remains accessible from settings as “Implementation checklist,” but no longer blocks dashboard access.

Do not use `/onboarding` for agencies. The `/onboarding/*` domain remains talent/casting onboarding only, and the setup UI must not import the dark cinematic onboarding design system.

### 5.2 Setup principles and agency-dashboard design language

- Make the agency operational quickly; do not demand complete migration before first value.
- Use agency language: **boards, bookers, roster, open call, submissions, digitals, comp cards, packages, castings, clients, options/holds, commissions**.
- Split required setup from optional implementation depth.
- Treat import as a guided implementation track, not an upload box that promises impossible automatic cleanup.
- Make owner/admin aware of privacy and minor-data handling before inviting the team or importing roster data.
- Match the current agency dashboard design system: warm cream canvas, white paper panels, Playfair mastheads, Inter operational text, rectangular controls, thin rules, restrained gold, dense scan-friendly layouts, and 150–200ms state motion. No glass cards, badges, hero chips, generic card grids, gradient text, over-rounded surfaces, or decorative AI ornament.

### 5.3 Product UI contract for `pholio-app`

The authenticated setup should be implemented inside the agency dashboard system:

- Route: `/dashboard/agency/setup`; avoid `/onboarding`, `/dashboard/agency/onboarding`, and any shared talent onboarding components.
- Layout: a focused setup workspace using the agency shell vocabulary where possible: masthead, left progress rail or ledger-style checklist, main working panel, and a right-side implementation summary.
- Controls: reuse agency button/input/table treatments or create agency-scoped primitives; do not import talent `PholioButton` variants if they visually conflict.
- State: use plain text step states such as `Not started`, `In review`, `Ready`, `Complete`; avoid colored pill badges.
- Empty states: teach the operational task: “No boards configured yet — add the boards your bookers work from.” Avoid generic “Nothing here.”
- Loading: skeleton rows/panels in place; no center-stage spinner once the shell has loaded.
- Save model: each step can save independently, with a final “Enter agency dashboard” after required steps are complete. This prevents import/migration from blocking first value.

### 5.4 Recommended setup sequence

Step 1 — Confirm agency profile

Required:

- Agency display name.
- Primary market/city.
- Agency type.
- Public website.
- Primary contact and support/inbound email.

Optional:

- Logo/wordmark.
- Additional offices.
- Social/profile links.
- Short agency description for public/open-call surfaces.

Outcome: the dashboard has a trustworthy agency identity and open-call handoff can display safe agency data.

Step 2 — Configure boards and markets

Required:

- Select initial boards/divisions.
- Mark which boards accept inbound submissions/open calls.
- Assign a default board owner/booker if already invited, or leave unassigned temporarily.

Optional:

- Board-specific submission instructions.
- Age/minor handling flag for kids/teens boards.
- Market/office mapping for multi-office agencies.

Outcome: applicants and roster can be routed correctly. This is more credible than a generic “categories” setup.

Step 3 — Team and permissions

Required:

- Confirm first owner/admin.
- Invite at least one additional team member or explicitly skip.
- Select roles: owner/director, head booker, booker/agent, scout, assistant/coordinator, accounting, read-only.

Required security copy:

- Team members should receive least-privilege access based on their board and role.
- Sensitive talent data, minor data, financials, and imports require elevated permissions.

Outcome: bookers can work their boards without everyone becoming an owner.

Step 4 — Roster start: manual seed or import track

Required decision:

- “Start with a blank roster.”
- “Add a few talent manually.”
- “Import roster data.”

If manual seed:

- Add 1–5 sample talent with name, board, location, representation state, and basic stats; images can be added later.

If import:

- Choose source: CSV/spreadsheet, Dropbox/Drive folder, current agency system export, custom migration.
- Upload a CSV template or request concierge migration.
- Map minimum fields: talent name, board, representation status, market/location, email/contact if permitted, measurements/stats, image folder/reference.
- Explicitly mark whether minors are included; if yes, route to concierge review before processing.

Outcome: the dashboard has real roster structure without blocking on perfect data.

Step 5 — Inbound submissions and open-call links

Required:

- Decide whether to enable agency open-call links.
- Select receiving boards.
- Set notification recipients.
- Confirm submission review states: received, in review, kept on file, request more, meeting/go-see, development offer, signed/represented, declined.

Optional:

- Create first public open-call link for agency website.
- Customize board-specific instructions and response templates.

Outcome: agency can route inbound talent through Pholio without compromising the standard gated talent submission pipeline.

Step 6 — Operating defaults

Required or skippable with default:

- Timezone, currency, units (imperial/metric display preference while storing both where relevant).
- Default commission rates for internal reporting only; do not force if accounting module is not live for the agency.
- Availability/bookout defaults if calendar features are enabled.
- Notification preferences for new submissions, meeting reminders, messages, and import results.

Outcome: the agency can start using operational surfaces with sane defaults.

Step 7 — Review and go live

Show a final checklist:

- Agency profile confirmed.
- Boards configured.
- Owner/admin set.
- Roster path selected.
- Open-call/inbound choice confirmed.
- Privacy and role-access acknowledgement accepted.

Primary CTA: “Enter agency dashboard.”

Secondary CTA: “Book implementation session” if import/migration or large roster was selected.

### 5.5 Import/migration recommendation

Yes, import should be part of agency onboarding, but as a **two-tier system**:

V1 — Guided CSV import + concierge fallback:

- Provide a downloadable CSV template.
- Accept roster basics, board, market, representation status, stats, contact fields, and optional image URLs/folder references.
- Validate and preview before commit.
- Create an `agency_import_jobs` record with states: uploaded, mapping, validating, needs_review, ready_to_import, importing, completed, failed, cancelled.
- Require admin/owner permission.
- For minors, pause into `needs_review` and require Pholio/manual confirmation of consent handling before import.

V1.5 — File asset migration:

- Allow image/portfolio folder upload or cloud-share ingestion only after approval.
- Map images to talent records and label as book, digitals, comp card image, tearsheet/test where possible.
- Avoid exposing imported images publicly until agency confirms rights/visibility.

Later — System-specific migration:

- Mainboard/Mediaslide/AgencyPin/LiveDesk/custom exports.
- Client contacts, booking history, invoices/statements, commission history.
- Board-specific package templates.

Do not overpromise automated migration from every competitor in V1. The credible premium posture is “guided import with Pholio implementation support,” not “drag any agency database here and magic happens.”


### 5.6 Blocking implementation contracts from stress test

These are acceptance criteria before implementation is considered safe.

#### Setup gate enforcement

Agency setup must be enforced in three layers, because any one layer can be bypassed by direct links, stale sessions, or API calls:

1. **Login/session redirect:** `redirectForSession(session)` returns `/dashboard/agency/setup` when `session.role === 'AGENCY' && !session.agencyOnboardingCompletedAt`, unless the destination is already an allowed setup/logout/support/legal path.
2. **`next` protection:** `next` may not override setup. If an incomplete agency signs in with `?next=/dashboard/agency/roster`, store that path as `return_to_after_setup` and redirect to setup first. Only use the stored return path after setup completion.
3. **SPA guard:** `AgencySessionGate` or a dedicated setup guard redirects incomplete agency sessions to `/dashboard/agency/setup` and blocks other `/dashboard/agency/*` routes until required setup is complete.
4. **API guard:** `requireAgencyOnboardingComplete` must stop incomplete agencies from calling normal `/api/agency/*` routes, except a tight setup allowlist. Existing agency `/onboarding/complete` allowlist language should be retired in favor of setup routes.

#### Internal ops authorization

Do not add public `/api/admin/agency-access-requests` endpoints until Pholio-internal authorization exists. V1 options:

- Preferred: Firebase custom claim or server-side `internal_admins` table for Pholio ops users.
- Acceptable short-term: CLI/script provisioning behind deployment credentials, with no public HTTP admin route.
- Not acceptable: hidden routes, relying on `AGENCY` role, or trusting request origin alone.

Every status transition and provisioning action must write an immutable audit event with actor ID/email, request ID, previous status, next status, provisioned agency ID, provisioned owner user ID, timestamp, source IP, and review notes diff where applicable.

#### Agency status semantics

Provisioning must not create a fully active agency by default.

```text
agencies.status:
  PENDING_SETUP
  ACTIVE
  SUSPENDED
  ARCHIVED
```

Approval/provisioning sets `status = 'PENDING_SETUP'`, stamps `onboarding_started_at` if the existing column is reused, and leaves `onboarding_completed_at` null. `POST /api/agency/setup/complete` sets `status = 'ACTIVE'` and stamps completion only after required setup acknowledgements pass. Product copy should say **setup**, even if the persisted legacy column remains `onboarding_completed_at`.

#### Minor-data branch

If a requested board includes kids/teens or imported roster data includes minors, setup must branch before team expansion, import commit, or open-call activation:

- Require `minor_data_acknowledged_at` at agency level.
- Require board-level `accepts_minors` and `guardian_consent_required` flags.
- Block public open-call links for minor-accepting boards until guardian-consent copy and visibility rules are configured.
- Route any import with `includes_minors = true` to `needs_review` and prevent commit until Pholio confirms consent/visibility handling.
- Restrict minor measurements, full-length/swim images, contact details, financials, and import files to elevated roles.
- Require a future implementation to preserve guardian consent, work-permit, and visibility state before minors can be reviewed by non-owner team members.

#### Existing primitives, not parallel setup data

Agency setup is an orchestrated checklist over the live agency primitives. It should call/write the same profile, roster-board, team, open-call, and import tables used by the dashboard. `agency_setup_steps` tracks checklist completion, acknowledgements, and deferred/skipped choices only; it must not duplicate operational data.

#### Roster boards vs casting boards

V1 must distinguish standing roster boards/divisions from client/job-specific casting boards:

- `agency_roster_boards` / divisions: standing house structure such as Women, Men, New Faces, Curve, Commercial, E-comm, Fit, Kids/Teens, Actors/Performers, Creators, or market/office boards.
- `casting_boards` / casting packages: client/job-specific pipelines with requirements, shortlists, scoring, dates, and applications.

Setup Step 2 configures standing roster boards and inbound routing. Casting boards remain the operational casting module. If V1 reuses the existing `boards` table as a compromise, the implementation must document which casting-specific columns are ignored for roster boards and how the model will be split later.

#### Inbound lifecycle mapping

Agency-facing copy should avoid a generic “accept” action. The existing status vocabulary should map to agency language:

| Industry label | Stored status |
| --- | --- |
| Received / in review | `submitted` or `in_review` |
| Kept on file | `kept_on_file` |
| Request more | `requested_more` |
| Meeting / go-see | `meeting_requested` |
| Development offer | `development` |
| Signed / represented | `represented` |
| Declined | `declined` |

#### Open-call routing fields

If Step 5 promises board-specific open-call routing, the open-call link model needs more than a label:

```text
agency_open_call_links
  default_roster_board_id
  receiving_board_ids_json
  instructions_by_board_json
  accepts_minors
  guardian_consent_required
  notification_recipient_membership_ids_json
```

If that is too large for V1, the setup UI should say V1 creates a general agency open-call link; board-specific routing is captured as setup intent and implemented in V1.1.

#### Measurement/versioned stats import

Roster imports that include stats must preserve unit provenance and freshness. Add or plan a measurement table such as:

```text
agency_roster_measurements
  profile_or_roster_talent_id
  source_import_job_id
  measured_at
  confirmed_at
  height_cm
  bust_cm
  bust_in
  chest_cm
  chest_in
  waist_cm
  waist_in
  hips_cm
  hips_in
  inseam_cm
  inseam_in
  shoe_us
  shoe_uk
  shoe_eu
  dress_size_region
  suit_size_region
  hair
  eyes
  created_at
```

Setup/import should show “stats current as of” and flag stats older than 3 months before they are used in digitals/open-call review.

#### Representation relationships

Imports must preserve multi-agency reality where provided. Do not flatten talent to one agency. Capture:

- Mother agency relationship.
- Placement/market agency relationship.
- Market/territory.
- Division/board.
- Exclusive/non-exclusive.
- Active/ended.
- Development/new-face stage where applicable.

#### Lightweight setup shell

`/dashboard/agency/setup` should use a lightweight agency setup shell, not the full operational `AgencyLayout`. It may share agency tokens, typography, form controls, and navigation vocabulary, but it should not fetch overview KPIs, messages, notifications, roster, applicants, casting, or analytics data until setup is complete.

#### Agency-facing copy rules

Internal docs may use implementation language, but the UI should speak like an agency working tool:

- Use “Agency setup” or “Workspace setup,” not “implementation checklist.”
- Use “Open agency dashboard,” not “go live.”
- Use “team members,” not “users,” except in technical/internal docs.
- Use “owners/admins” only for permissions.
- Prefer “submissions,” “casting board,” “shortlist,” “meeting/go-see,” “development,” and “represented” over generic pipeline labels where possible.

## 6. Data model sketch

New/extended tables likely needed:

```text
agency_access_requests
  id
  agency_name
  website_url
  primary_market_city
  primary_market_country
  additional_locations_json
  agency_type
  primary_boards_json
  roster_size_range
  team_size_range
  current_system
  first_use_cases_json
  migration_interest
  contact_name
  contact_email
  contact_role
  contact_phone
  timezone
  heard_from
  notes
  status
  reviewer_user_id
  review_notes_internal
  qualification_call_at
  approved_at
  declined_at
  provisioned_agency_id
  provisioned_owner_user_id
  created_at
  updated_at

agency_setup_steps
  id
  agency_id
  step_key
  status
  completed_by_user_id
  completed_at
  data_json
  created_at
  updated_at

agency_import_jobs
  id
  agency_id
  requested_by_user_id
  source_type
  status
  original_filename
  mapping_json
  validation_summary_json
  includes_minors
  completed_at
  created_at
  updated_at
```

Existing `agencies.onboarding_completed_at` can be reused as `setup_completed_at` if renaming is too expensive, but product copy should say **agency setup**, not onboarding, to avoid colliding with talent `/onboarding`.

## 7. Routes and product surfaces

Public/anonymous (`pholio-landing` owns the page; `pholio-app` may own the receiving API):

- Landing route `GET /agency/request-access` or `GET /partners/request-access` — public editorial request page in the marketing repo.
- App API `POST /api/public/agency-access-requests` — creates request, rate-limited, spam-protected, safe CORS from the landing domain.
- App route `GET /partners` — redirect or thin handoff to the landing request page.
- App route `POST /partners` — retire legacy signup behavior and route to the request API only if server-rendered compatibility remains.

Internal/admin:

- `GET /api/admin/agency-access-requests` — list by status.
- `PATCH /api/admin/agency-access-requests/:id` — update status/review notes.
- `POST /api/admin/agency-access-requests/:id/provision` — create agency, owner user, membership, set-password email.

Agency authenticated:

- `GET /api/agency/setup` — setup state/checklist.
- `PATCH /api/agency/setup/profile`.
- `PATCH /api/agency/setup/boards`.
- `POST /api/agency/setup/team-invites`.
- `POST /api/agency/import-jobs`.
- `PATCH /api/agency/setup/open-call`.
- `POST /api/agency/setup/complete`.

Frontend:

- `client/src/domains/agency/pages/SetupPage`.
- `client/src/domains/agency/api/setup.js`.
- `client/src/domains/agency/hooks/useAgencySetup.js`.
- Gating in `AgencySessionGate` or a dedicated agency setup guard.

## 8. Success metrics

Request funnel:

- Request submissions by source.
- Qualified rate.
- Approval rate.
- Time from submitted to reviewed.
- Time from approved to first login.
- Decline/waitlist reasons.

Setup funnel:

- First-login to setup completion.
- Setup step dropoff.
- Time to first board configured.
- Time to first team invite accepted.
- Time to first roster record/import completed.
- Time to first open-call link created.
- Time to first inbound submission reviewed.

Import:

- Import jobs by source.
- Validation failure reasons.
- Percent needing concierge review.
- Minor-data review count.
- Imported talent records successfully mapped to boards.

Activation:

- Time to first submission reviewed.
- Time to first kept-on-file, request-more, or meeting/go-see decision.
- Time to first roster talent added or imported.
- Time to first open-call submission received.
- Time to first casting package/board created.
- Time to first non-owner team member action.

## 9. V1 implementation recommendation after stress test

Must ship in V1:

1. `pholio-landing` request-access page plus `pholio-app` receiving API with the field set above.
2. Internal review states and manual provisioning link from request to agency/user/membership.
3. Normal `/login` credential path for approved agencies.
4. `pholio-app` agency setup gate at `/dashboard/agency/setup`, wired through the agency session/dashboard system.
5. Setup steps: profile, boards, team, roster path, open-call choice, operating defaults, review/go-live.
6. Basic CSV roster import job with validation preview or, if implementation time is short, a “request concierge import” path that captures source and blocks no one.
7. Clear copy that agencies are reviewed, manually provisioned, and not self-serve.

Safe to defer:

- Full internal review UI polish; ops can start with an authenticated internal list and scripts.
- Deep competitor-specific migrations.
- Booking history/import, invoices/statements, and commission-history migration.
- SSO/SAML.
- Automated qualification scoring.
- Public agency directory/profile editing beyond open-call safe fields.

## 10. Copy direction

Request page title:

> Request agency access

Support copy:

> Pholio partners with selected agencies and management teams. Tell us about your agency, your boards, and the workflows you want to bring into Pholio. Every request is reviewed before access is opened.

CTA:

> Submit request

Confirmation:

> Your request has been received. Our team reviews agency access manually. If there is a fit, we will email next steps or schedule a short call before provisioning your login.

Login blocked for unprovisioned agency attempts:

> Agency access is reviewed and provisioned by Pholio. If your agency has not been approved yet, request access first.

Setup intro after first login:

> Set up your agency workspace
>
> Confirm your agency profile, boards, team, roster path, and inbound submission workflow before opening the command center.

## 11. Industry sign-off

This design reads as credible because it treats agencies like operational partners, not talent signing themselves up and not buyers entering a generic funnel. It uses the real agency primitives — boards, bookers, roster, open calls, digitals, comp cards, castings, team permissions, imports, and commission/accounting defaults — while keeping public request friction low. It also avoids collecting sensitive roster/talent data before approval, which is the correct privacy posture for a platform that may handle minors, measurements, and image rights.
