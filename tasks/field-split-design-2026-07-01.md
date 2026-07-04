# Discipline-Aware Field Split — Design Blueprint (Wave 2A)

Date: 2026-07-01 · Branch: profile-audit-remediation
Drives Wave 2B (migrations/schema), 2C (stats), 2D (social), 2E (export/deletion).
Grounded in `tasks/profile-tab-multidiscipline-audit-2026-06-30.md`, the real
`profiles` schema, `client/src/shared/constants/profileDivision.js`, and the
Wave-1 audience-DTO layer (`src/shared/lib/audience-dto.js`).

## Product decisions (locked with user, 2026-07-01)
1. **Branching depth: STRONG per-discipline.** Shared identity core + discipline-
   specific sections revealed conditionally.
2. **Adult content: PRIVATE verified-adult context.** Content boundaries + OnlyFans
   move OUT of generic discovery/scoring into a private, verified-adult-only
   creator context with explicit per-audience controls and per-brief consent.
   Never exposed for minors. Remove standing sexual-content prefs from match scoring.
3. **Stats default audience: AGENCY-VISIBLE, NOT PUBLIC.** Measurements default to
   agencies (discovery + submission); per-field opt-in to publish publicly.
4. **Minor compliance: STRUCTURED PERMIT MODEL.** Work-permit + jurisdiction +
   expiry, chaperone/guardian-on-set, school/education constraints, in a private
   compliance context.

## A. Discipline taxonomy (reconciled with existing divisions)
Introduce a first-class **`discipline`** (the track) above the existing **division**
(the model sub-board). `discipline` is stored/first-class; `division` stays derived
for the model track.

| discipline | maps from existing | primary field emphasis |
|---|---|---|
| `model` | fashion_editorial, commercial_lifestyle, fit_showroom (division retained as sub-board) | stats & measurements, digitals, book |
| `performer` | talent_performance | credits, reels, union, playing age, accents |
| `creator` | (new; specialties like influencer/creator) | media-kit metrics, audience, verified social |

A profile may have a primary discipline + secondary (hybrid). Stats track is
**independent of gender** (audit): a `stats_track` drives which measurement set +
sizing systems appear, not `gender`.

## B. Field inventory → destination
Legend: **CORE**=professional profile (public/agency identity) · **STATS**=conditional
stats track · **PERF**=performer assets · **CREATOR**=creator media-kit · **COMPLIANCE**=
private identity/compliance · **BOOKING**=booking calendar · **SAFETY**=confirmed-job
call-sheet · **ADULT**=private verified-adult context · **INTERNAL**=AI/infra, never
user-facing · **REMOVE**=drop as a stored/global field.

| Current column(s) | Destination |
|---|---|
| id, user_id, slug, first_name, last_name, pronouns, bio_curated, bio_raw | CORE |
| gender | CORE (identity) — but NOT the driver of stats (use stats_track) |
| city, city_secondary → **primary base / secondary base** | CORE |
| nationality, place_of_birth | COMPLIANCE (derive audience-safe only) |
| specialties, specializations, modeling_categories, languages, training, achievements | CORE (conditional emphasis by discipline) |
| availability_travel | CORE (work interests) |
| seeking_representation, current_agency, agency_affiliation, previous_representations | CORE (structured representation; kept from Wave-prior work) |
| height_cm, bust_cm, **+chest_cm (NEW)**, waist_cm, hips_cm, inseam_cm, shoe_size, dress_size, **+suit fields (NEW, split from dress)**, weight_kg/lbs/unit, measurements_updated_at, hair_color/length/type, eye_color, body_type | STATS (agency-default, per-field public opt-in) |
| skin_tone, ethnicity | COMPLIANCE/protected — REMOVE from generic discovery & scoring; never a readiness target |
| playing_age_min/max, union_membership, video_reel_url | PERF (+ NEW: headshot, showreel, audio reel, accents/dialects, structured credits) |
| social_reach, phyllo_user_id | CREATOR (+ NEW: media-kit metrics w/ recipient-level sharing; handles live in `social_accounts`) |
| date_of_birth | COMPLIANCE (age derived; audience-safe band only) |
| work_eligibility → **territory work authorization**, work_status → **primary discipline**, work_permit_on_file, passport_ready, drivers_license | COMPLIANCE (+ NEW structured minor permit/jurisdiction/expiry/chaperone/school) |
| guardian_email, guardian_consent_at | COMPLIANCE (Wave-1 hardened; scope columns deferred here) |
| emergency_contact_name/phone/relationship, reference_name/email/phone | SAFETY (confirmed-job/call-sheet only) |
| availability_schedule | BOOKING (+ NEW: bookouts, holds, ranked options, confirmed jobs) |
| comfort_levels, onlyfans_url | ADULT (private, verified-adult; out of discovery/scoring; minors never) |
| is_public, is_discoverable, visibility_mode | KEEP + NEW per-field audience-control columns |
| age, age_range | REMOVE (already unmaintained in Wave 1; contract-drop later) |
| self-rated Emerging/Professional/Established, universal weight, skin-tone/markings completion | REMOVE as global **readiness** targets |
| analysis_*, archetype, fit_score_*, predicted_*, photo_embedding, vector_summary*, search_document, visual_intel, librarian_synthesis, market_fit_rankings, onboarding_predictions, vibe_score, verified_location_intel, ip_*, google_*, source_agency_id, partner_agency_id | INTERNAL (never in any user-facing DTO; owner endpoint already strips telemetry) |

## C. Per-field audience matrix (defaults; per-field overrides allowed)
Audiences align with the DTO layer: private(owner) · public · agency-discovery ·
named-submission · represented-roster · confirmed-job.

| Field group | private | public | agency-disc | submission | roster | confirmed-job |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Identity (name, pronouns, base, bio) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Stats & measurements | ✓ | opt-in | ✓ | ✓ | ✓ | ✓ |
| Performer credits/reels | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Creator media-kit metrics | ✓ | opt-in | recipient-level | recipient-level | ✓ | ✓ |
| DOB / exact age | ✓ | — (band) | — (band) | age (snapshot) | ✓ | ✓ |
| Compliance (work auth, permits, nationality) | ✓ | — | — | — | ✓ | ✓ |
| Emergency / references | ✓ | — | — | — | — | ✓ |
| Content boundaries / OnlyFans (verified-adult) | ✓ | — | — | per-brief consent | — | per-brief consent |
| Protected traits (ethnicity/skin_tone) | ✓ | — | — | — | — | — |

## D. Terminology map
| Current | New | Where |
|---|---|---|
| Direct bookings = not seeking | Self-represented / not seeking | representation UI |
| Comfort Levels | Content boundaries (+ per-brief consent separate) | profile + apply |
| Guardian Consent | Guardian profile-management approval / named-agency authorization | consent flow |
| Booking Lanes | Work interests / work types | profile |
| Placement agency | Market / booking agency | representation |
| Physical proof | Stats & measurements | profile |
| Primary Role / `work_status` | Primary discipline | profile |
| Work Eligibility | Territory-specific work authorization | compliance |
| Profile readiness | Submission readiness | readiness sidebar |
| Dress / Suit Size | Separate dress and suit fields | stats |
| Bust relabeled Chest | Separate `bust_cm` and `chest_cm` | stats |
| Equity (US) | Actors' Equity Association (AEA) | union list |
| UAD | Union des artistes (UDA) | union list |
| Home City | Primary base | profile |
| Legacy representation notes | Structured history | representation |

## E. Migration strategy — expand / backfill / cutover / contract (no destructive cutover)
1. **Expand** (additive, nullable; safe on SQLite + Postgres):
   - `profiles.chest_cm`, `stats_track`, `discipline`, per-field audience-control
     columns (or a `profile_field_visibility` table), suit-size fields.
   - New tables: `minor_permits` (permit/jurisdiction/expiry/chaperone/school),
     `booking_calendar` (bookouts/holds/confirmed), `confirmed_job_safety`
     (emergency/references scoped to a booking), `adult_context` (content
     boundaries + verified-adult creator links, gated).
2. **Backfill**: `chest_cm ← bust_cm` where discipline/stats_track warrants;
   `discipline ← ` derived from specialties/division; default audience flags
   (stats → agency-visible, sensitive → private); migrate `comfort_levels`/
   `onlyfans_url` into `adult_context`; copy emergency/reference into safety table.
3. **Cutover**: switch readers/writers to the new model behind dual-read across a
   release so N-1 code keeps working; extend DTO allowlists + `profile-visibility`
   SELECT lists to the new homes; stats formatter (2C) reads the canonical set.
4. **Contract** (LATER release, after cutover verified): drop `age`, `age_range`,
   `comfort_levels`, moved emergency/reference columns, deprecated aliases.

## F. Execution order (Wave 2 sub-agents, when capacity returns)
- **2B** (opus): expand+backfill migrations + schema; DTO allowlist + visibility
  SELECT extensions to new homes; `discipline`/`stats_track`.
- **2C** (sonnet): one canonical stats DTO/formatter across profile, submission,
  agency, public portfolio (`views/portfolio/show.ejs`), all PDF engines;
  add `chest_cm`; split dress/suit.
- **2D** (sonnet): `social_accounts` join in reader DTOs; correct disconnect route;
  provider-validated verified only; restore prod social connect (Phyllo).
- **2E** (sonnet): extend `data-export.js` inventory to full lifecycle; durable
  deletion job; retention expiry on all package paths.
- Terminology renames fold into the discipline-aware UI rebuild (Wave 3).

## Non-negotiable invariants (carry from Wave 1)
- Every audience response stays a static allowlist DTO; contract tests (FORBIDDEN_KEYS)
  must still pass after fields move.
- Age always derived from DOB; stored age never reintroduced.
- Minors: never public/discoverable without named-agency guardian auth; adult context
  never exposed; sensitive AI gated.
