# Pholio Event Casting Mode — Technical Design (FWB launch)

**Status:** APPROVED with lead rulings (see §j). Implementation lanes execute this document.
**Scope authority:** `docs/pholio-strategic-analysis-2026-08.md` §6. Designed against the code at `01c4368`.

## 0. What already exists (verified)

| Asset | File | State |
|---|---|---|
| Open-call links + arrivals + claims | `migrations/20260704120000_create_agency_open_call_tables.js` | live |
| Link brief (who/what/eligibility/next/deadline-or-ongoing) | `migrations/20260811140000_open_call_brief.js`, `src/domains/agency/services/open-call-brief.js` | live |
| Link intake extras already on the table | `migrations/20260710120000_create_agency_access_and_setup_tables.js:140-155` — `accepts_minors`, `guardian_consent_required`, `receiving_board_ids`, `instructions_by_board`, `default_roster_board_id`, `notification_recipient_membership_ids` | live, unused by UI |
| `agencies.agency_type` (free text) | same migration, line 130 | live, display-only |
| Consent capture + fingerprint | `src/domains/talent/services/submission-disclosure-consent.js`, `src/shared/lib/submission-disclosure-content.js` | live |
| Hashed magic-link precedent | `src/domains/messaging/services/message-reply-tokens.js`, `migrations/20260712000000_hash_message_reply_tokens.js` | live |
| Public no-chrome page precedent | `client/src/domains/messaging/pages/ReplyPage.jsx` + route at `client/src/App.jsx:92`, SPA allowlist `src/app.js:912-928` | live |
| Frozen submission snapshot | `src/domains/agency/services/application-submission-package.js` | live |
| Auto-close | `src/shared/lib/application-auto-close.js`, daily `netlify/functions/cleanup-application-drafts.js` | live |
| Video asset | `src/domains/talent/routes/media.js:1732-1830` | **URL reference only — see R1** |

Two things that do NOT exist despite plan references: an agency shortlist-share mechanism (plan A4 #7 is plan-only), and any talent-side accept/decline endpoint (`applications.js` has only `/:id/withdraw`, line 2154).

## (a) Data-model deltas

### A1. Org type
**`agencies.org_kind varchar(24) NOT NULL DEFAULT 'agency'`, values `agency | event_organizer`.**
- `agencies.agency_type` is self-declared display copy — making it authorization-bearing invites a security hole.
- A separate `organizations` table would retarget ~20 FKs for zero capability gain.
- Live bug risk it fixes: `GET /api/talent/agencies` (`src/domains/talent/routes/agencies.js:28`) returns every ACTIVE agency as a representation destination — FWB must not appear there. `org_kind` is the filter.
- Consent purpose belongs to the *call*, not the org (an agency may run an event call); `org_kind` governs only directory visibility + label vocabulary.
- Default `'agency'` = zero backfill.

### A2. Event call = columns on `agency_open_call_links` (no new call table)

```
call_kind                 varchar(16) NOT NULL DEFAULT 'representation'   -- | 'event_casting'
compensation_type         varchar(16) NULL   -- 'paid'|'unpaid'|'stipend'; REQUIRED when event_casting
compensation_details      text NULL
event_name                varchar(180) NULL
event_starts_on           date NULL
event_ends_on             date NULL
event_location            varchar(200) NULL
requires_walk_video       boolean NOT NULL DEFAULT false
requires_availability     boolean NOT NULL DEFAULT false
requires_measurements     boolean NOT NULL DEFAULT false
review_window_days        integer NULL       -- overrides agencies.application_review_window_days per call
offer_response_window_hours integer NOT NULL DEFAULT 72
index (agency_id, call_kind, status)
```
`brief_deadline`/`brief_ongoing` model the *application* deadline; `event_starts_on/ends_on` are the event. Multiple concurrent calls already work per-link.

### A3. `applications` deltas

```
open_call_link_id  uuid NULL REFERENCES agency_open_call_links(id) ON DELETE SET NULL
call_purpose       varchar(24) NOT NULL DEFAULT 'representation'   -- | 'event_casting'
index (open_call_link_id, status)
index (agency_id, call_purpose, status)
```
`call_purpose` denormalized deliberately: purpose is immutable; every read path branches on it.

**Uniqueness swap.** `applications` carries `UNIQUE(profile_id, agency_id)` (`20250103000000:29`), blocking Brooklyn + Queens under one organizer. Replace with two partial uniques (precedent `uq_open_call_claims_agency_profile`, `20260704120000:113-117`):
```sql
DROP existing constraint/index applications_profile_id_agency_id_unique
CREATE UNIQUE INDEX uq_applications_profile_agency_repr
  ON applications (profile_id, agency_id)        WHERE call_purpose = 'representation';
CREATE UNIQUE INDEX uq_applications_profile_event_call
  ON applications (profile_id, open_call_link_id) WHERE call_purpose = 'event_casting';
```

### A4. Consent event deltas — on `application_submission_consent_events`
```
purpose                  varchar(24) NOT NULL DEFAULT 'representation'
open_call_link_id        uuid NULL FK agency_open_call_links ON DELETE SET NULL
compensation_disclosure  json NULL     -- frozen {type, details} the applicant actually read
index (purpose, created_at)
```

### A5. Three new tables (designer pick lists)

```
event_pick_lists
  id uuid pk · agency_id FK CASCADE · open_call_link_id FK CASCADE
  designer_name varchar(160) NOT NULL · designer_email varchar(254) NULL
  label varchar(120) NULL · organizer_note text NULL · slots_requested integer NULL
  status varchar(16) NOT NULL DEFAULT 'draft'   -- draft|open|closed|revoked
  token_hash varchar(64) NOT NULL UNIQUE        -- sha256 hex; raw only in the emailed URL
  expires_at timestamp NOT NULL
  open_count int DEFAULT 0 · first_opened_at/last_opened_at/submitted_at/revoked_at/rotated_at NULL
  created_by_user_id FK users SET NULL · created_at/updated_at
  index (agency_id, open_call_link_id), index (token_hash)

event_pick_list_items      -- the slice the organizer handed over
  id · pick_list_id FK CASCADE · application_id FK CASCADE · sort int 0 · added_by_user_id · created_at
  UNIQUE (pick_list_id, application_id); index (application_id)

event_pick_selections      -- the designer's answer + the organizer's offer
  id · pick_list_id FK CASCADE · application_id FK CASCADE
  mark varchar(8) NOT NULL   -- pick | maybe | pass
  note varchar(300) NULL · marked_at NOT NULL · ip_hash varchar(64) NULL · user_agent varchar(512) NULL
  offered_at NULL · offered_by_user_id FK users SET NULL
  UNIQUE (pick_list_id, application_id)
  UNIQUE (application_id) WHERE offered_at IS NOT NULL   -- one live slot offer per applicant per call
  index (application_id, mark)
```
Rejected alternatives: `boards`/`board_applications` (a board is an agency division with DivisionMark identity; standings being retired), `share_tokens` as carrier (talent-owned, CASCADE to profiles, PLAINTEXT token, open_count is the talent's Intel metric). We borrow share_tokens' open-count idiom and message_reply_tokens' hashing.

### A7. Migration sequencing (idempotent, dual-dialect; guard per object)

| # | File | Contents | Notes |
|---|---|---|---|
| M1 | `*_event_casting_application_statuses.js` | add `confirmed`, `declined_by_talent` to status CHECK | `exports.config = { transaction: false }`. PG: `DO $$ pg_constraint` drop-replace per `20260814120000:52-74`. SQLite: **introspect sqlite_master + PRAGMA, rebuild; never hardcode column lists** (prior hardcoded rebuilds silently dropped columns). |
| M2 | `*_applications_event_call_link.js` | A3 + index swap | M1 must land before M2 on SQLite (rebuild destroys partial indexes) |
| M3 | `*_open_call_event_fields.js` | A2 | guarded per column |
| M4 | `*_event_consent_and_org_kind.js` | A1 + A4 | |
| M5 | `*_event_pick_lists.js` | A5 + funnel table (g) | `jsonCol` helper from `20260710120000:24` |

## (b) Consent fork

Lives in `src/shared/lib/submission-disclosure-content.js` (purpose is hardcoded at line 9; `staticAcknowledgements[1]` line 18) + `recordSubmissionDisclosureConsent()` writing inside the submit transaction (`applications.js:1136`).

1. `buildSubmissionDisclosureSnapshot({ ..., purpose = 'representation', eventContext = null })` — default keeps existing callers byte-identical.
2. `EVENT_CASTING_DISCLOSURE_CONTENT`: handling template naming organizer + event; **mandatory third-party clause** ("Designers see your name, digitals, height, measurements, availability and walk video through a read-only link. They cannot see your email, phone, socials or date of birth, and they have no Pholio account."); acknowledgement "…does not guarantee selection, a booking, or payment"; **compensation restated verbatim from the call** ("{{organizerName}} states this is {{PAID|UNPAID|STIPEND}}. {{details}}") — this is why the field is mandatory; retention clause per ruling R4.
3. Versioning: purpose-keyed map `DISCLOSURE_VERSIONS = { representation: '2026-06-29', event_casting: '2026-09-01' }`. Do NOT bump representation (would invalidate live drafts).
4. **Fingerprint extension (highest-risk detail):** `buildSubmissionPackageFingerprint` (`submission-disclosure-consent.js:53-94`) mirrored byte-for-byte in `client/src/domains/talent/pages/ApplyPage/submissionConsentBinding.js`. Add `openCallLinkId`, `availability{from,to}`, `walkVideoUrl` **by conditional spread only when openCallLinkId non-null** — canonicalJson sorts keys and emits "null", so unconditional keys change every representation hash and break in-flight drafts (`consent_package_changed`, `applications.js:902`). Both files in the same commit; parity test mandatory.
5. `recordSubmissionDisclosureConsent` gains `purpose`, `openCallLinkId`, `compensationDisclosure`. `buildOpenCallDisclosure` (`:133`) "does not count toward your monthly discovery limit" is representation-only; branch it.
6. Client: checkbox copy at `ApplyExperience.jsx:3892` + `SubmissionThreshold.jsx` FALLBACK_SECTIONS take the event variant from server content, not a second hardcoded string.

## (c) Status-machine mapping

| Event step | Status | New? |
|---|---|---|
| submitted | `pending` | no (auto-close clock starts) |
| pool (survives triage) | `shortlisted` | no |
| cut at triage | `passed` / `declined` | no |
| held for future edition | `kept_on_file` | no |
| designer pick/maybe/pass | **not a status** — lives on `event_pick_selections.mark` (N designers, private opinions ≠ organizer decision) | — |
| organizer offers a slot | `accepted` (event label override "Offered a slot") | no |
| applicant accepts | **`confirmed`** | **NEW** |
| applicant declines | **`declined_by_talent`** | **NEW** |
| offer unanswered past window | `closed_no_response` (metadata.previousStatus='accepted') | no |
| pool never triaged past window | `closed_no_response` | no |

`represented` refused for confirmations (drives roster/DivisionMark/represented counter; application-status.js:1-9 forbids storing bookings there). `withdrawn` refused for declines (triggers package redaction + is excluded from organizer reads). `declined` refused (actor inversion in notification copy).

Both new statuses: talent-written only → new `TALENT_WRITABLE_APPLICATION_STATUSES = ['confirmed','declined_by_talent']`, excluded from `WRITABLE_APPLICATION_STATUSES`, `AWAITING_AGENCY_*`, `WITHDRAWABLE_STATUSES`. Auto-close gains Pass B (event `accepted` older than `offer_response_window_hours`) and Pass A joins the link for `review_window_days` override. `notifications.js` gains copy for both + event-purpose overrides for pending/shortlisted/accepted; `NOTIFY_STATUSES` gains the two.

## (d) Pick-list share links

- Token: `crypto.randomBytes(32).toString('base64url')`; store sha256 hex only (`message-reply-tokens.js` idiom; SEC-0.8 precedent).
- URL `/picks/:token`, route in `client/src/App.jsx` next to `/reply/:token`, outside all layouts. `src/app.js:912-928` allowlist gains `/picks`, `/picks/*`; netlify.toml redirect added (see R9). API `/api/picks/*` mounted before onboarding gates; added to `PROTECTED_API_PREFIXES` (`same-origin-mutation.js:6`); `authLimiter` rate limit.
- TTL: `event_ends_on + 7d` (or +30d if no date). No rotation on resend; explicit `POST .../reissue` only. Revocation per designer; closed = read-only; revoked/expired/unknown → identical 404 (no oracle). **No session bootstrap — designers never get accounts.**
- Designer sees: organizer masthead (event, dates, compensation, note, "pick up to N") + their slice only, rendered from the **frozen snapshot** via `loadApplicationSubmissionPackages` — never live profiles. Per applicant: name (org setting: full or first+initial), digitals, height+measurements, walk video, availability. **Never** email/phone/socials/DOB/portfolio URL/comp-card contact block. New `AUDIENCE.EVENT_DESIGNER` in `audience-dto.js` + `profile-visibility.js`; `applyMinorSubmissionFilter` applied as defence in depth.
- Designer can: mark pick/maybe/pass/clear, note ≤300 chars, "Submit my list". Nothing else.
- Write-back: `PUT /api/picks/:token/selections/:applicationId` upsert, conditional on open+unexpired, records ip_hash + UA. Organizer reads by JOIN (no denormalized mirror). A pick never writes application status; only the organizer's explicit offer does.

## (e) Per-surface UI inventory

**Organizer (agency design system — cream #F7F3EC, Playfair masthead-only, meta components, no badges):**
| # | Surface | Built from |
|---|---|---|
| O1 | Call-kind selector + EventCallFields (name/dates/location/compensation/intake toggles) | extend `pages/settings/OpenCallPanel.jsx` + sibling of `OpenCallBriefFields.jsx`; compensation = 3-way AgencyButton group per the deadline control (`OpenCallBriefFields.jsx:81-110`) |
| O2 | `/dashboard/agency/events` list + `/events/:linkId` detail | new pages; nav in Pipeline group, permission `open_call.view`, icon CalendarRange |
| O3 | Pool triage = **existing inbox, configured** | `ApplicantsPage.jsx` takes `openCallLinkId` + lifecycle-tab table; extract `LIFECYCLE_TABS`/`STATUS_FOR` into `constants/applicantLifecycle.js`; event tabs: To review → Pool → Offered → Confirmed → Passed. No second inbox/ReviewRoom/dossier. |
| O4 | PickListsPanel (create/assign/copy/reissue/revoke) | multi-select PickButton (`ApplicantsPage.jsx:110`) + bulk bar; link row = OpenCallPanel row verbatim (186-303) |
| O5 | LineupPanel (per-designer picks, Offer slot, confirmation state, CSV) | AgencyButton, MetaLine, existing export |
| O6 | Event strip on applicant detail (availability, walk video, picked-by) | new block in `components/dossier/`; Figure/Notation |

**Applicant (talent design system):**
| # | Surface | Built from |
|---|---|---|
| T1 | Event arrival page | `OpenCallArrivalPage.jsx`; briefSections gains Dates/Compensation/What we need; allowance line (261) must NOT mention monthly allowance for events; **18+ stated loudly (R8)** |
| T2 | Event intake scene (availability defaulted to event dates, walk video URL field, measurements confirm) | new `pages/ApplyPage/event/*` mounted by ONE conditional in ApplyExperience.jsx (4012 lines — no inline edits); digitals reuse existing slot picker |
| T3 | Payoff moment ("What you keep": profile · digitals set · comp card + Download + portfolio link) | extend `ApplySuccess` (`ApplyExperience.jsx:3966-4011`) — one block, no new page |
| T4 | Accept/decline slot | `ApplicationsView.jsx` detail pane beside onWithdraw (595); `utils/applicationStatus.js` gains the two statuses + event label overrides |

**Designer (public, no chrome):** new domain `client/src/domains/events/` — `PickListPage.jsx/.css`, `components/PickCard.jsx`, `api/picks.js`. Shape copied from ReplyPage (loading/invalid/ready, useQuery+useMutation, sonner, own CSS). **Wears the agency system** (professional buyer): cream canvas, Playfair event name only, gold on active pick only. PickCard photo-led, Figure-style stats, inline video, three-state control ported (not imported) from PickButton.

**Public/system:** `GET /api/public/open-call/:code` returns `callKind`, `event`, `compensation` alongside `brief`.

## (f) Route / API list

Organizer (mountAgencyApiGuard; permissions reuse `open_call.view/manage`; export keeps `org.export_data`):
```
GET/POST/PATCH /api/agency/open-call/links[...]           (+callKind, event, compensation, intake)
GET    /api/agency/events/:linkId/pool?stage=&search=
GET    /api/agency/events/:linkId/pick-lists
POST   /api/agency/events/:linkId/pick-lists              → raw URL returned once
PATCH  /api/agency/events/pick-lists/:id
POST   /api/agency/events/pick-lists/:id/reissue | /revoke
POST/DELETE /api/agency/events/pick-lists/:id/items       (bulk applicationIds)
GET    /api/agency/events/pick-lists/:id/selections
GET    /api/agency/events/:linkId/lineup
POST   /api/agency/events/:linkId/offers                  { applicationIds[], pickListId } → accepted + notify
GET    /api/agency/export?format=csv&openCallLinkId=&pickListId=&status=confirmed
```
Export = extension of `inbox.js:2433` (two filters; event columns: Designer · Mark · Availability · Walk video URL · Compensation · Confirmed date). Reuse `escapeCsvValue` + `org.data_exported` audit.

Designer (public, token): `GET /api/picks/:token` · `PUT /api/picks/:token/selections/:applicationId` · `POST /api/picks/:token/submit`

Talent: `POST /api/talent/applications/:id/confirm` · `POST /api/talent/applications/:id/decline-slot` · drafts + submit gain `openCallLinkId, availability, walkVideoUrl` (DRAFT_SCHEMA_VERSION bump)

Public: `GET /api/public/open-call/:code` (extended). Internal: `GET /api/internal/event-funnel/:linkId`.

## (g) Instrumentation

New table `event_casting_funnel_events` (modelled on `spec_registry_engagement_events`): `id · open_call_link_id FK CASCADE · agency_id FK SET NULL · profile_id FK CASCADE NULL · anon_id varchar(64) NULL · event_type varchar(40) · metadata json · occurred_at`, indexes `(open_call_link_id, event_type, occurred_at)`, `(profile_id, occurred_at)`. Writer `src/shared/services/event-funnel.js`, fire-and-forget, errors swallowed. (`profile_events` drops viewer_class='self'; `onboarding_analytics` owns its step vocabulary; neither holds pre-signup arrivals — hence new table. `anon_id` = hashed session id stitches arrival→submission.)

| # | event_type | Written at | Serves |
|---|---|---|---|
| 1 | `call_viewed` | public open-call GET (event calls) | denominator |
| 2 | `application_started` | first draft write w/ this link | applications started |
| 3 | `application_completed` | successful submit | completion rate |
| 4 | `intake_blocked` | any gated submit rejection; metadata.reason | why 2→3 leaks |
| 5 | `profile_completed_at_submit` | submit; completeness/digitals/card metadata | profile completion |
| 6 | `payoff_viewed` | ApplySuccess "What you keep" render; metadata.action | build item 6 landed |
| 7 | `second_recipient_submitted` | generic submit when prior event application exists | second-recipient |
| 8 | `returned_d30` | daily job, submits 25–35d old w/ session activity since | D30 return (not client-gameable) |

Reporting: `src/domains/agency/queries/event-funnel.queries.js` + one internal read route. NO agency-facing analytics surface.

## (h) Work breakdown — 5 lanes, strict disjoint ownership

**Lane 0 · Schema & Constants** (~1.5d, lands ALONE, first). Owns: migrations M1–M5 · `src/shared/constants/application-status.js` · new `src/shared/constants/event-casting.js` (CALL_KINDS, COMPENSATION_TYPES, PICK_MARKS, PICK_LIST_STATUSES, FUNNEL_EVENT_TYPES, TALENT_WRITABLE_APPLICATION_STATUSES) · `client/src/shared/constants/applicationStatus.js` · new `client/src/shared/constants/eventCasting.js` · `tests/migrations/event-casting-schema.test.js`. Contract = exact column names/types above + the two status strings + constants exports. No other lane writes a literal `'event_casting'`.

**Lane A · Call definition + consent fork + arrival** (~4d; after 0). Owns: `open-call-brief.js` · `routes/open-call.js` · `api/public.js` (open-call handlers only, 562-668) · `submission-disclosure-content.js` · `submission-disclosure-consent.js` · agency settings `OpenCallPanel/OpenCallBriefFields/EventCallFields/openCallBrief` · `OpenCallArrivalPage.*` · tests. Exports: extended `briefDTO`, `buildSubmissionDisclosureSnapshot({...,purpose,eventContext})`, `normalizeEventCall(input)`.

**Lane B · Intake, submit, confirmations, talent surfaces** (~5d; after 0 + A's two signatures, stubbed day 1). Owns: `routes/applications.js` · `application-drafts.js` · `validate-submission-package.js` (+`send-readiness.js` if needed) · `application-auto-close.js` · `notifications/notify-talent-application/email.js` · `ApplyPage/**` (incl. `submissionConsentBinding.js` mirror) · `ApplicationsView.jsx` · `utils/applicationStatus.js` · tests. Exports: submit populates link/purpose; the two talent endpoints.

**Lane C · Organizer surfaces** (~5d; after 0 only). Owns: new `routes/events.js` (+1 line routes/index.js) · new `services/event-pick-lists.js` (CRUD, NOT tokens) · `route-permissions.js` · `inbox.js` export handler (2433-2650) + filter block (822-1050) ONLY · new `EventsPage/EventCallPage` + `pages/events/**` · `agencyNav.js` + new `applicantLifecycle.js` · `ApplicantsPage.jsx` (constant extraction + two props) · `api/agency.js` · tests.

**Lane D · Designer public page + token security** (~3d; after 0; NO runtime dep on C). Owns: new `src/domains/events/services/pick-list-tokens.js` (mint/hash/validate — security-critical, not in C) · new `src/domains/events/routes/pick-share.js` (+1 line app.js) · `same-origin-mutation.js` · `audience-dto.js`+`profile-visibility.js` (AUDIENCE.EVENT_DESIGNER) · app.js SPA allowlist · netlify.toml redirects (picks + reply + opencall, per R9) · new `client/src/domains/events/**` · `client/src/App.jsx` (one route line) · tests incl. `tests/security/pick-share-token.test.js`. Exports to C: `mintPickListToken({pickListId}) → {rawToken, tokenHash, url}`, `validatePickToken(raw)`. C calls the first only.

**Lane E · Instrumentation** (~2d; after 0; lands last). Owns: new `src/shared/services/event-funnel.js` · new `queries/event-funnel.queries.js` · one internal route · `returned_d30` block in the daily function · tests. E publishes `recordEventFunnelEvent(...)` day 1; A/B/C/D add their own call sites in their own lanes.

Critical path: **0 → (A ∥ C ∥ D) → B → E.**

## (i→j) Risks and LEAD RULINGS (2026-08-15, binding)

| # | Risk | RULING |
|---|---|---|
| R1 | No video upload pipeline exists (`media.js` video = URL reference only) | **URL paste-and-validate for v1** (YouTube/Vimeo/Drive unlisted; validate http(s) + host allowlist message, store via existing video asset path). Real upload = phase 2 if event tier validates. |
| R2 | SQLite status-CHECK divergence (3 shapes in dev DBs; one prior migration skipped SQLite) | **Introspect-and-rebuild (M1 as specified)** + a drift-guard unit test asserting the PG CHECK list equals the union of the status constants. |
| R3 | Designer link forwarding (group chats) | **Accept.** Mitigations: TTL, per-designer revoke, visible open_count/last_opened_at, minimal EVENT_DESIGNER DTO (no contact data). No OTP — no-account is the feature. |
| R4 | 24-month package retention indefensible for a one-week event | **Event packages: `event_ends_on + 90 days`**, stated plainly in the event consent. Representation unchanged at 24mo. Counsel to confirm (flagged to owner). |
| R5 | Two new bilateral statuses | **Accepted** (`confirmed`, `declined_by_talent`); rejections of `represented`/`withdrawn`/`declined` reuse stand. |
| R6 | MAX_LINKS_PER_AGENCY=20 vs multi-edition organizers | **Per-org_kind constant:** agency 20, event_organizer 60. No column. |
| R7 | FWB volume unmeasured | **OWNER RULING (2026-08-15): proceed on an educated assumption, tweak later.** Sizing basis: peak ~250 applications/week during casting announcements; design ceiling 2,000 applications per call; ~4,000/season across editions; designer pick-list slices ≤120 applicants. Lane C: pool list must paginate comfortably at 2,000 rows (check SUBMISSIONS_HARD_CAP in inbox.js against this). Lane D: pick page must stay performant at ~120 cards (lazy-load media). |
| R10 | Separate FWB infrastructure | **OWNER RULING (2026-08-15): none, ever.** FWB-like organizers are `agencies` rows served by the SAME agency dashboard — same inbox, RBAC, settings, export. `org_kind` only filters the talent-side representation directory and switches label vocabulary. The Events nav section renders only for `org_kind='event_organizer'` (or agencies that have created an event call); the designer pick page is the sole surface outside the dashboard because designers have no accounts. Any lane tempted to fork a surface must extend instead. |
| R8 | Minors expectations | 18+ stays. Arrival page states it loudly for event calls; call-creation UI warns the organizer. |
| R9 | `/reply/*` and `/opencall/*` have no netlify.toml redirect today | Lane D fixes all three (`/picks/*`, `/reply/*`, `/opencall/*`) in its netlify.toml change; verify against production behavior first. |

## Critical files
- `src/domains/talent/routes/applications.js` (submit transaction 522-1330)
- `src/shared/lib/submission-disclosure-content.js` + `src/domains/talent/services/submission-disclosure-consent.js` (+ browser mirror `client/src/domains/talent/pages/ApplyPage/submissionConsentBinding.js`)
- `src/shared/constants/application-status.js`
- `src/domains/messaging/services/message-reply-tokens.js` (token idiom) + `client/src/domains/messaging/pages/ReplyPage.jsx` (public-page precedent)
- `src/domains/agency/routes/inbox.js` (filter 822-1050, CSV 2433-2650 — extend, never clone)
