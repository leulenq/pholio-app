# Talent Profile Tab Comprehensive Audit

Date: 2026-06-28

Scope: `/dashboard/talent/profile`, the supporting talent/profile/settings routes, agency/public readers, guardian-consent flow, AI/profile scoring helpers, and downstream consumers that render or expose profile data.

This is a read-only audit. No product code was changed.

## Executive summary

The profile tab is not production-safe yet.

The main blockers are:

- agency-facing APIs returning far more profile data than they should;
- minor/public-visibility policy not consistently enforced across profile, settings, agency discovery, and public readers;
- guardian consent implemented as a state-changing GET;
- several visible-but-not-functional or brittle controls in the UI;
- mismatches between the model/profile editor and how real casting/model portfolios are reviewed.

I would not call this backend-wired clean or legally safe for a talent-facing profile system in its current state.

## Severity summary

- P0: agency/public data overexposure, minor visibility bypasses, and guardian-consent semantics
- P1: profile data integrity, stale or mismatched display fields, dead-end social controls, incompatible size/age modeling
- P2: completeness gaps, brittle conversions, reviewer-surface mismatch, and unfinished creator/actor tooling

## Functional / data audit

### P0

1. Agency discover and detail endpoints return full profile rows and all images instead of a reviewer-safe DTO.

Evidence:

- `src/domains/agency/services/discover-search.js:172-180`
- `src/domains/agency/routes/inbox.js:2552-2617`

Impact:

- exposes owner email, DOB, guardian email, emergency contacts, adult-content URLs, work eligibility, and internal state to agency users;
- returns image rows without a narrow allowlist.

2. Agency applications are not limited to actual applicants.

Evidence:

- `src/domains/agency/routes/inbox.js:676-821`

Impact:

- the API starts from `profiles`, not an application-scoped row set;
- unrelated talent can be returned with full profile/image payloads.

3. Public portfolio and public homepage readers still select broad profile rows.

Evidence:

- `src/routes/api/public.js:100-200`
- `src/routes/api/public.js:209-266`

Impact:

- public homepage responses can include more profile state than a public audience should see;
- the current filtering is image-centric, not row-centric.

### P1

4. `age` is still a denormalized source of truth in some reads, but DOB updates do not maintain it.

Evidence:

- `src/domains/talent/routes/profile.js:646-651`
- `src/domains/agency/services/discover-search.js:112-117`

Impact:

- age filters and public/profile displays can drift from DOB;
- current data is already inconsistent enough to make reviewer results unreliable.

5. Public portfolio measurement rendering is disconnected from the editor.

Evidence:

- `src/domains/talent/routes/profile.js:633-640`
- `views/portfolio/show.ejs:38-42`

Impact:

- saved `bust_cm`, `waist_cm`, and `hips_cm` do not reliably render in public portfolio views.

6. Shoe size region is only local UI state and conversion math is not trustworthy.

Evidence:

- `client/src/domains/talent/pages/ProfilePage/index.jsx:447-449`
- `client/src/domains/talent/pages/ProfilePage/MeasurementsSection.jsx:121-165`
- `client/src/shared/utils/measurementConversions.js:29-38`

Impact:

- same numeric shoe value is persisted regardless of US/UK/EU selection;
- reloads can mislabel the same size;
- the conversion formula is materially wrong.

7. Unknown-age profiles show sensitive controls even though the server fail-closes.

Evidence:

- `client/src/shared/utils/talentAge.js:47-50`
- `src/shared/lib/talent-age.js:116-163`
- `src/domains/talent/routes/profile.js:720-753`

Impact:

- the form invites interaction with measurements and adult-content fields before the age gate is actually satisfied;
- the save path can reject unrelated edits because the UI and backend disagree on what is allowed.

8. Social links are partially dead-ended or brittle.

Evidence:

- `client/src/domains/talent/pages/ProfilePage/SocialSection.jsx:124-128`
- `src/domains/talent/routes/profile.js:866-885`

Impact:

- four “Connect” actions are explicitly not functional;
- X and YouTube handling is brittle enough to corrupt stored URLs on save/reload.

9. Representation and availability are under-modeled for real review workflows.

Evidence:

- `client/src/domains/talent/components/RepresentationSection.jsx:33-119`
- `client/src/domains/talent/pages/ProfilePage/index.jsx:250-256`

Impact:

- “represented” can be saved without an agency actually being known;
- availability reads like employment scheduling, not booking availability.

10. A profile-fetch failure can leave the page editable with default values.

Evidence:

- `client/src/domains/talent/pages/ProfilePage/index.jsx:726-745`

Impact:

- a transient fetch failure can expose an unhydrated form state that overwrites real values on save.

### P2

11. Booking lanes are separately persisted from the profile update.

Evidence:

- `src/domains/talent/routes/profile.js:266-288`
- `src/domains/talent/routes/profile.js:944-950`

Impact:

- partial save failures can leave the join table changed while the profile write fails.

12. `profile_completeness` is computed but not persisted in the same save path.

Evidence:

- `src/domains/talent/routes/profile.js:1052-1059`

Impact:

- other consumers can read stale completeness values.

13. Save can succeed in the database but still surface as a failure if the follow-up notification step errors.

Evidence:

- `src/domains/talent/routes/profile.js:1069`

Impact:

- users can retry and create confusing duplicate-save scenarios.

14. The profile tab does not expose portfolio URLs even though the broader data model supports them.

Evidence:

- `client/src/domains/talent/pages/ProfilePage/SocialSection.jsx:161-176`

Impact:

- a supported field is effectively unreachable from the UI.

15. `previous_representations` is serialized in a way that the backend rejects in at least one path.

Evidence:

- `client/src/domains/talent/pages/ProfilePage/index.jsx:975-989`
- `src/shared/lib/validation.js:433-465`

Impact:

- some edit flows are structurally invalid even before business rules are applied.

## Industry audit

The profile tab is broadly aligned with talent/model profile norms in that it collects:

- core identity;
- location;
- DOB / playing age;
- height and body measurements;
- hair and eye color;
- credits, training, languages, union status;
- representation status;
- social and reel links.

What is off-standard or incomplete is the reviewer surface and the data model consistency:

- the talent editor captures far more than the agency reviewer surfaces;
- shoe sizing is not internationally sound;
- age is handled as both a stored field and a derived concept;
- exact age is exposed publicly where play age would usually be the useful casting value;
- heritage/skin-tone/body preferences are overused for search/filtering in a way that does not match current industry review norms;
- creator and actor workflows are too generic compared with actual submission/review practices;
- nudity/comfort fields should be treated as per-brief preferences, not standing consent.

The industry pass did not find a “fake profile” problem. It found a mismatch between what the editor asks for and what the downstream reviewer actually uses.

## Legal audit

Main legal risks:

- public-by-default behavior and broad public rows;
- minors remaining discoverable and visible through agency flows;
- guardian consent implemented as a one-click GET;
- AI and privacy notices that do not match actual data processing;
- overcollection and overexposure of third-party contact data;
- access/export/delete workflows that do not fully line up with modern privacy expectations.

The strongest legal conclusions from the code are:

- no safe publish gate is enforced before public exposure for adults;
- minor safeguards do not fully govern agency discovery;
- guardian verification is not a robust informed-consent flow;
- published AI/privacy claims are materially out of sync with actual implementation.

## Security audit

### P0

1. Broken object/property level authorization in agency readers.

Evidence:

- `src/domains/agency/services/discover-search.js:172-180`
- `src/domains/agency/routes/inbox.js:2552-2617`

Why this is security-relevant:

- the API is not just “showing too much”; it is returning an over-privileged object to an authenticated agency caller;
- the response includes PII and internal state that should be subject to field-level authorization and audience-specific DTOs.

2. Guardian consent verification is a state-changing GET.

Evidence:

- `src/domains/talent/routes/guardian-consent.js:124-160`

Why this is security-relevant:

- GET requests can be preloaded, prefetched, scanned, or visited by systems that are not the intended human guardian;
- the current design can record consent without a second affirmative action.

### P1

3. Session-authenticated mutating routes do not show any anti-CSRF middleware in the profile/settings area.

Evidence:

- `src/domains/talent/routes/profile.js:402-404,557-561`
- `src/domains/talent/routes/settings.js:360-429`

Why this matters:

- these routes are cookie/session authenticated and mutate profile state;
- I did not find an obvious CSRF defense in the relevant route stack.

4. Minor/public-visibility logic is inconsistent across settings, profile save, and agency readers.

Evidence:

- `src/domains/talent/routes/settings.js:415-429`
- `src/domains/talent/routes/profile.js:749-753`
- `src/shared/lib/talent-age.js:157-163`

Why this matters:

- one audience can still reach data after another audience is denied;
- “blocked agency” is not the same thing as “cannot discover this profile.”

5. Public APIs and detail endpoints expose data beyond a minimal public DTO.

Evidence:

- `src/routes/api/public.js:100-200`
- `src/routes/api/public.js:209-266`

Why this matters:

- even when the route is intended to be public, returning raw rows increases data-minimization and overexposure risk.

## Verified functional wiring

- `/dashboard/talent/profile` is routed and loads.
- Talent profile GET/PUT is role-scoped to authenticated talent users.
- Minor DOB gating for sensitive measurements exists on the server.
- OnlyFans is blocked server-side for minors or unknown age.
- Guardian tokens are hashed, expiring, and single-use once created.
- Public portfolio image filtering exists for status/exclusion/moderation.

## Coverage gaps

- no browser-level end-to-end proof covers every field through save/reload and downstream public/agency rendering;
- the existing persistence test suite is not sufficient to prove field-level correctness for the current profile surface;
- I did not find a canonical field-level authorization layer for agency/public DTOs.

## Bottom line

The profile tab is functionally active, but it is not yet safe to treat as a finished talent profile system.

The most important next fixes are:

1. shrink agency/public payloads to audience-specific DTOs;
2. enforce one consistent minor/public/discovery policy;
3. replace guardian-consent GET with a real confirm step;
4. fix the shoe-size, age, and social-link data model mismatches;
5. add browser-level verification for save/reload and downstream exposure.

