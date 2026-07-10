# Pholio Agency Access System

**Status:** Product/system specification for implementation.
**Date:** 2026-07-10
**Scope:** Replace any agency path that implies open self-serve onboarding with a curated access-request, manual-review, approval, credentialing, and agency-specific post-login setup system.

## 1. Real frame

Agency access is not talent onboarding. For Pholio, the credible industry frame is a **reviewed agency partnership request** followed by a **private agency implementation setup**. Agencies should never be sent to the public `/onboarding` casting flow. The current product already blocks automatic agency creation in login and the legacy partner form, but the user-facing model is incomplete: `/signup` still redirects unknown users to `/onboarding`, `/partners` renders a dead-end “manual provisioned” message, and agency onboarding after login is bypassed in the auth redirect path.

The correct model:

1. Agency requests access through a short, premium partnership application.
2. Pholio reviews the agency, optionally holds a qualification call, and approves/declines/keeps warm.
3. Pholio provisions the agency account and first owner/admin credentials.
4. The approved agency signs in through normal `/login`.
5. The first signed-in owner/admin completes a dedicated `/dashboard/agency/setup` workflow before normal dashboard operations.

This keeps Pholio feeling curated and protects the agency side from fake agencies, low-quality rosters, scraping, and legal/privacy risk around talent data.

## 2. Current Pholio alignment and gaps

| Area | Current behavior | Required change |
| --- | --- | --- |
| Anonymous signup | `GET /signup` redirects to `/onboarding`, which is talent-specific. | Keep `/signup` talent-only or route agency CTAs to `/agency/request-access`; never send agencies to `/onboarding`. |
| Agency self-creation | Login blocks auto-created `AGENCY` users and says agency accounts are provisioned by Pholio. | Keep this principle, but replace the dead end with a formal request-access path. |
| Partner page | `/partners` renders a legacy agency signup page; `POST /partners` returns 403 manual-provisioning copy. | Retire as signup; make it request-access or redirect to request-access. |
| Post-login agency onboarding | `redirectForSession` contains a removed/bypassed agency onboarding block and `/dashboard/agency/onboarding` redirects to the dashboard. | Restore a dedicated agency setup gate, but under agency design language and agency data model, not the talent onboarding domain. |
| Existing agency app | Agency dashboard already has roster, applicants, casting, boards, team, messages, reminders, analytics, and settings. | Setup should configure these operational primitives: boards, team roles, roster/imports, open-call links, inbox rules, and brand/profile details. |

## 3. External research inputs

Research points that should shape implementation:

- Enterprise/customer onboarding works best as staged implementation: pre-kickoff, kickoff/goal alignment, account setup/configuration, training/adoption, go-live confirmation, and handoff to ongoing success. Source: CheckFlow SaaS onboarding checklist (`https://checkflow.io/templates/customer-management/saas-customer-onboarding-checklist`).
- Customer onboarding for enterprise SaaS is where the vendor turns the contract/request into outcomes and adoption, not just account creation. Source: Innovecs enterprise SaaS onboarding guide (`https://innovecs.com/blog/enterprise-saas-onborading-best-practices/`).
- Access-request systems should include approval, least-privilege provisioning, auditability, and periodic review rather than open-ended permissions. Sources: Veza access request best practices (`https://veza.com/blog/access-requests-best-practices/`), SailPoint access request docs (`https://documentation.sailpoint.com/saas/user-help/requests/request_center.html`), Microsoft Entra access review docs (`https://learn.microsoft.com/en-us/entra/id-governance/create-access-review`).
- Model/talent agency software competitors emphasize operational agency setup around rosters, packages/shortlists, bookings, invoices/statements, clients, calendars, and reports. Sources: AgencyPin (`https://agencypin.com/`), Mainboard (`https://www.mainboard.com/`), Mediaslide (`https://www.mediaslide.com/`), LiveDesk (`https://www.livedesk.agency/modelling-agency-software`).
- Import/migration is expected in this category: Flowboard explicitly offers migration of model records, client contacts, booking history, and portfolio files plus onboarding sessions for admins/bookers. Source: Flowboard FAQ (`https://www.flowboardpro.com/`).
- Industry reality: agencies organize talent by boards, bookers work boards, inbound talent should flow into an application/open-call inbox, and real operations include digitals, comp cards, castings/go-sees, options/holds, bookouts, vouchers, commission, and split-aware payments. Source: local industry reference `.agents/skills/industry/reference/standards.md` and `.agents/skills/industry/reference/lifecycle.md`.

## 4. Part 1 — Agency request / application flow

### 4.1 Page purpose and positioning

Route recommendation: **`/agency/request-access`** in the app product, with marketing CTAs from the separate landing repo pointing here. If `/partners` remains for compatibility, it should 301/302 to `/agency/request-access` or render the same request form.

The page should communicate:

- **Curated access:** “Pholio partners with selected agencies and management teams.”
- **Operational value:** roster command center, inbound open calls, boards, casting packages, team workflows, and migration support.
- **Review expectation:** “Every request is reviewed by our team. We may schedule a short call before approval.”
- **No instant account promise:** the CTA is “Request agency access,” not “Create account” or “Start onboarding.”
- **Data-respect posture:** Pholio manages talent images, stats, submissions, and team access with privacy and permission controls.

Avoid generic self-serve language: no “Sign up free,” no “Start trial,” no “Create agency account.”

### 4.2 Trust signals

Use restrained, premium proof rather than badge clutter:

- Short line on reviewed network quality: “Reviewed agencies only, so talent submissions stay high-signal.”
- Privacy/security line: “Role-based team access, audit-ready account provisioning, and controlled talent visibility.”
- Migration support line: “We can help structure boards and import roster data from spreadsheets or current systems.”
- Industry-fit line: “Built around boards, bookers, digitals, comp cards, casting packages, and agency workflows.”
- Optional proof once real: named pilot agencies, anonymized roster volume, or “used by agencies managing X talent” only if true.

Do not use “AI-powered,” “beta,” “live,” or decorative status badges because those are banned UI patterns in this repo.

### 4.3 Form structure

Recommendation: **single page with three sections** rather than a long wizard. The agency request should feel selective but not like procurement. Keep it to **10 required fields + 6 optional fields**, with progressive disclosure for import/system details.

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

Do **not** collect sensitive talent data, roster files, client lists, full contracts, tax IDs, payment details, or minor-related data in the public request form. Those belong after approval in authenticated setup with explicit data-handling terms.

### 4.4 Required vs later

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

### 4.5 Submission confirmation

After submission, render a calm confirmation state:

- “Request received” language, not “account created.”
- Set expectation: “We review agency requests manually. If there is a fit, we’ll email next steps or schedule a short call.”
- Expected response window: **2–5 business days** for normal review; optionally faster for referred agencies.
- Provide a way to update the request by replying to the confirmation email, not by resubmitting.
- Send an internal notification to Pholio ops and a confirmation email to the requester.

### 4.6 Internal review workflow

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

Route recommendation: **`/dashboard/agency/setup`**.

Gating rules:

- Only approved/provisioned agency users can log in.
- If agency `setup_completed_at` / `onboarding_completed_at` is null, redirect agency users to `/dashboard/agency/setup` instead of the normal dashboard.
- Allow limited access to logout, support, billing/legal pages, and password reset.
- Once setup is completed, `/dashboard/agency/setup` remains accessible from settings as “Implementation checklist,” but no longer blocks dashboard access.

Do not use `/onboarding` for agencies. The `/onboarding/*` domain remains talent/casting onboarding only.

### 5.2 Setup principles

- Make the agency operational quickly; do not demand complete migration before first value.
- Use agency language: **boards, bookers, roster, open call, submissions, digitals, comp cards, packages, castings, clients, options/holds, commissions**.
- Split required setup from optional implementation depth.
- Treat import as a guided implementation track, not an upload box that promises impossible automatic cleanup.
- Make owner/admin aware of privacy and minor-data handling before inviting the team or importing roster data.

### 5.3 Recommended setup sequence

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

### 5.4 Import/migration recommendation

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

Public/anonymous:

- `GET /agency/request-access` — React standalone or server-rendered request page.
- `POST /api/public/agency-access-requests` — creates request, rate-limited, spam-protected.
- `GET /partners` — redirect/render alias to request-access.
- `POST /partners` — retire legacy signup behavior and route to request API if server-rendered compatibility remains.

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

## 9. V1 implementation recommendation

Must ship in V1:

1. Request-access page and API with the field set above.
2. Internal review states and manual provisioning link from request to agency/user/membership.
3. Normal `/login` credential path for approved agencies.
4. Agency setup gate at `/dashboard/agency/setup`.
5. Setup steps: profile, boards, team, roster path, open-call choice, operating defaults, review/go-live.
6. Basic CSV roster import job with validation preview or, if implementation time is short, a “request concierge import” path that captures source and blocks no one.
7. Clear copy that agencies are reviewed and not self-serve.

Safe to defer:

- Full admin UI polish; ops can start with an authenticated internal list and scripts.
- Deep competitor-specific migrations.
- Booking history/import, invoices/statements, and commission-history migration.
- SSO/SAML.
- Automated qualification scoring.
- Public agency directory/profile editing beyond open-call safe fields.

## 10. Copy direction

Request page title:

> Request agency access

Support copy:

> Pholio partners with selected agencies and management teams. Tell us about your agency, your boards, and how you want to use Pholio. We review each request before opening access.

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

This design reads as credible because it treats agencies like operational partners, not talent signing themselves up. It uses the real agency primitives — boards, bookers, roster, open calls, digitals, comp cards, castings, team permissions, imports, and commission/accounting defaults — while keeping public request friction low. It also avoids collecting sensitive roster/talent data before approval, which is the correct privacy posture for a platform that may handle minors, measurements, and image rights.
