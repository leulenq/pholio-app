# Talent Dashboard `/profile` Multi-Discipline Audit

Date: 2026-06-30

Scope: `/dashboard/talent/profile`, its form controls and profile-readiness UI,
talent profile and representation APIs, database persistence, social
connections, guardian consent, public portfolio/home readers, agency discovery
and application readers, submission snapshots, comp-card consumers, settings,
export/deletion, and deployment controls that materially affect this surface.

This is a read-only product audit. No application code was changed.

## Executive verdict

**Release decision: DO NOT SHIP.**

The owner-facing editor has credible foundations, but the system around it is
not production-safe. The core pattern is inconsistent audience enforcement:
the authenticated talent route is comparatively controlled, while public and
agency consumers often bypass those controls by selecting and spreading raw
database rows.

The most serious blockers are:

1. tracked database and Firebase credential material;
2. unauthenticated public disclosure of complete profile/image rows;
3. agency endpoints exposing non-applicants, private fields, and unrestricted
   images;
4. guardian consent granted by opening a GET link;
5. automatic sensitive AI processing that contradicts the accepted notices;
6. ordinary adult profile saves that can silently unpublish the portfolio;
7. editable DOB and stale stored age acting as competing policy/filter sources;
8. minor image safeguards that trust client-declared metadata.

The page also fails the repository's explicit visual rules, has keyboard and
contrast barriers in core controls, and models one universal "talent profile"
where the field set should branch by discipline, division, age, market, and
disclosure context.

## What improved since the 2026-06-28 audit

The prior audit is materially stale in several areas:

- Structured representation now supports a mother agency, multiple market
  relationships, territory, division, exclusivity, dates, and history
  (`client/src/domains/talent/components/RepresentationSection.jsx:124-225`,
  `migrations/20260629234500_create_talent_representations.js:19-81`).
- Measurement confirmation is dated and stale after 90 days
  (`src/domains/talent/routes/profile.js:963-979`).
- Digitals and the curated book are separated in the submission flow
  (`client/src/domains/talent/pages/ApplyPage/ApplyExperience.jsx:258-295`).
- Minor submission snapshots omit raw DOB, direct contact, social URLs, and
  optional notes (`src/shared/lib/submission-profile.js:58-76`).
- Submission-package retention and a scheduled redactor now exist.
- Image-rights metadata, release/distribution validation, moderation, reporting,
  and CSAM-escalation scaffolding now exist.

These improvements should be preserved. They do not resolve the release
blockers below.

## Multi-discipline scorecard

| Lane | Specialist verdict | Score / state |
|---|---|---:|
| Industry standards | Credible artifacts; incorrect universal stats, consent, availability, and representation taxonomy | 6.0/10 |
| Legal / privacy | Public, agency, minor-consent, AI-notice, deletion/export, and retention gaps block launch | Blocked |
| Functionality / data integrity | Owner form works on the happy path; destructive defaults, source-of-truth drift, and non-atomic saves remain | 1.5/5 |
| Security | Critical property-level authorization failures plus tracked credentials | Critical |
| Field naming | Strong artifact vocabulary; weak taxonomy and consent semantics | 6.4/10 |
| Field choice validity | One record improperly mixes public identity, private compliance, stats, safety, booking, and adult-content data | 2/5 |
| UX / UI | Strong editorial opening, but high cognitive load, keyboard barriers, and banned patterns | 21/40 |
| Production readiness | Buildable, not releasable; test, bundle, config, observability, and migration gates remain | Blocked |

### Technical UI audit health

| Dimension | Score | Key issue |
|---|---:|---|
| Accessibility | 1/4 | Custom selects, multi-selects, and measurement tapes are not fully keyboard-operable |
| Performance | 2/4 | 2.135 MB minified main JS bundle; large monolithic page/CSS and eager dependencies |
| Responsive design | 2/4 | Breakpoints exist, but mobile Save/error/drawer behavior is incomplete |
| Theming | 2/4 | Local tokens exist, but hard-coded and low-contrast values diverge from the system |
| Anti-patterns | 1/4 | Multiple explicit repository bans are present |
| **Total** | **8/20** | **Poor — major work before release** |

## P0 — production blockers

### P0-1 — Tracked credential material must be treated as compromised

`.env.migration:2` contains a complete credential-bearing Neon connection
string, and `.env.firebase-template:4` contains a complete PEM private key.
Both files are tracked. Values are intentionally not reproduced here.

Impact: database and Firebase administrative compromise.

Required action:

- rotate/revoke both credentials immediately;
- remove them from the Git index and history through a coordinated history
  rewrite;
- invalidate old credentials and verify that they no longer authenticate;
- add repository, history, CI, and pre-commit secret scanning.

This is repo-wide rather than profile-specific, but it blocks any production
release.

### P0-2 — Public home API returns complete profile and image rows

`src/routes/api/public.js:103-200` selects `profiles.*`, spreads each row, and
returns broad image rows through `/api/public/home`; `public.js:259-265` sends
them to unauthenticated callers.

The row can contain DOB, phone, guardian and emergency contacts, source agency
state, AI analysis/errors, inferred traits, and internal workflow fields.

This is the exact failure class OWASP calls broken object property-level
authorization: returning properties the audience should never receive.
[OWASP API3:2023](https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/)

Fix:

- replace every `profiles.*`/row spread with a static public-card DTO and SQL
  allowlist;
- return only professional/display name, broad location, slug, and an approved
  public image;
- migrate `is_public` to opt-in/default false;
- add a recursive forbidden-key response test.

### P0-3 — Agency APIs bypass application, audience, minor, and image boundaries

`src/domains/agency/routes/inbox.js:683-869` deliberately includes
`applications.id IS NULL`, allowing any agency to retrieve profiles that never
submitted to it. It returns profile data and images without a discoverability
or application-ownership boundary.

Additional broad-reader paths:

- `src/domains/agency/services/discover-search.js:172-228,463-482,531-548`
  selects `profiles.*`, owner email, and unrestricted image rows;
- `src/domains/agency/routes/inbox.js:2684-2749` spreads a discoverable profile,
  all images, and user email;
- blocked-agency preferences and `exclude_from_agency` are not applied
  consistently.

Fix:

- `/applications` must inner-join applications scoped to the session agency;
- introduce one canonical agency DTO;
- require a valid application package or explicit discovery authorization;
- require named-agency guardian authorization for minors;
- enforce image status, moderation, package selection, and agency-exclusion
  filters in SQL;
- test agency A against no-application and agency-B records.

### P0-4 — Opening a GET link grants guardian consent

`src/domains/talent/routes/guardian-consent.js:190-235` calls the mutating token
verification service on GET. `src/domains/talent/services/guardian-consent.js:
191-268` writes account-level or named-agency consent immediately.

Mail scanners, link preview bots, and browser prefetch can therefore grant
consent without a guardian decision. GET is defined as safe/read-only precisely
so automated retrieval can occur without side effects.
[RFC 9110 §9.2.1](https://www.rfc-editor.org/rfc/rfc9110.html#name-safe-methods)

For known under-13 users, the FTC says "email plus" is limited to internal use;
public or third-party disclosure requires a more reliable verifiable-parental-
consent method.
[FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)

Fix:

- GET renders the disclosure, recipient, categories, purpose, retention, and
  revocation terms only;
- an explicit POST performs an atomic pending-to-verified transition;
- record consent version, scope, evidence, and affirmative action;
- separate account management, public publication, AI processing, and each
  named-agency authorization;
- use a COPPA-suitable method before public/third-party disclosure for covered
  children.

### P0-5 — AI processing contradicts accepted notices

`src/domains/talent/routes/profile.js:1006-1044` automatically invokes image
analysis after a primary-image change. `src/domains/ai/analyzeProfileImage.js:
47-94` asks the provider to infer measurements, weight, build, skin tone,
facial structure, symmetry, and market suitability.
`src/domains/ai/embeddings.js:373-430` places protected/sensitive traits into
the Discover index.

The landing Terms/AI Notice state that analysis is opt-in, withdrawable, and
does not use protected traits for ranking, but the app has no equivalent
granular control.

Fix:

- disable new sensitive inference until versioned, purpose-specific consent
  exists;
- never process a minor until valid guardian authorization covers the exact
  purpose;
- remove ethnicity, skin tone, gender, age, and body type from semantic ranking
  unless a documented lawful/fair use is approved and audited;
- delete analysis and derived embeddings on withdrawal;
- update legal pages only after code and notices match.

GDPR/UK conclusions are conditional on territorial scope, but the underlying
truthfulness problem is not.
[FTC privacy/security guidance](https://www.ftc.gov/business-guidance/privacy-security),
[ICO special-category consent guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-conditions-for-processing/)

### P0-6 — An ordinary adult save can silently unpublish the portfolio

`client/src/domains/talent/pages/ProfilePage/index.jsx:211` normalizes
`guardian_consent_recorded` to `false` for an ordinary adult with no guardian
record. The full form payload includes it. `src/domains/talent/routes/profile.js:
739-746` interprets any false value as consent revocation and sets
`is_public=false` without checking whether the profile is a minor.

Reproduction:

1. adult profile is public;
2. user edits only the bio;
3. client sends `guardian_consent_recorded:false`;
4. server commits `is_public:false`;
5. public portfolio becomes unavailable.

Fix: remove consent state from the general profile command. Consent revocation
needs a dedicated, scoped endpoint.

Release test: unrelated adult and minor saves must preserve publication and
verified consent.

### P0-7 — DOB/age is both a policy bypass and a drifting source of truth

- Onboarding and profile edit save DOB without maintaining `profiles.age`
  (`src/domains/onboarding/routes/casting.js:654-678`,
  `src/domains/talent/routes/profile.js:688-694`).
- Discover filters stored age
  (`src/domains/agency/services/discover-search.js:112-117`).
- PDF/public readers prefer or print stored age
  (`src/domains/pdf/composition/stats-formatter.js:279-289`,
  `views/portfolio/show.ejs:50-54`).
- Minor/adult policy gates immediately trust an editable DOB
  (`src/domains/talent/routes/profile.js:751-795`).

A profile can be excluded from age-filtered search when DOB exists but age is
null, remain 17 after a birthday, or self-edit DOB to unlock adult-only/public
behavior.

Fix:

- remove stored age as a source of truth and derive age from DOB;
- separate verified age status from editable display data;
- changing DOB must invalidate guardian/public/discovery authorization until
  re-verified;
- test birthday boundaries and filters on SQLite and PostgreSQL.

### P0-8 — Minor image protection trusts client metadata

The upload gate relies on client-declared shot/style metadata
(`src/domains/talent/routes/media.js:840-863`). Async classification later tags
the image but does not force public/agency exclusion
(`src/domains/talent/services/run-image-classification.js:79-128`,
`image-classification-policy.js:82-175`).

An unconsented minor can upload full-body imagery without the relevant tag and
have it visible before or after classification. Discoverability setters also
lack the same minor-consent gate (`src/domains/talent/routes/settings.js:
360-372,427-429`).

Fix: all unconsented-minor uploads default private; classification must rerun
policy and atomically force exclusions. Test pre-classification and
post-classification exposure.

## P1 — functionality and data integrity

### P1-1 — Profile save is non-atomic and stale full forms overwrite newer data

The client replaces all representations before the profile request
(`ProfilePage/index.jsx:1052-1053`). The server then commits social rows,
booking lanes, profile fields, primary image, activity, status, and derived
index work in separate phases/transactions (`profile.js:908-1067`).

Failure after any phase leaves a partial save. Two open tabs submit full
hydrated records with no version/ETag, so the later save can restore stale
values.

Fix: one transactional canonical profile command or explicit dirty-only
resource mutations, plus optimistic concurrency and 409 on stale version.

### P1-2 — Weight values and measurement freshness can become false

The form changes only `weight_kg`, while the hydrated payload can retain both
kg and lbs. The server derives one only when the other is absent
(`profile.js:836-861`). A user can therefore save 70 kg beside stale 149.9 lb,
or fail to clear weight because the other unit reconstructs it.

Because the full payload contains measurement keys, unrelated edits can refresh
`measurements_updated_at` (`profile.js:963-979`). Onboarding's measurement
confirmation does not stamp the date.

Fix: accept one canonical source unit, always derive the other server-side, and
stamp recency only when canonical values actually change.

### P1-3 — Visible male "Chest" can still fail submission readiness

The UI relabels `bust` as "Chest" but stores `bust_cm`
(`MeasurementsSection.jsx:181-200`, `profile.js:675-682`). Profile strength
accepts the alias, while send readiness requires `chest`/`chest_cm`
(`src/domains/talent/services/send-readiness.js:29-42`).

Fix: add a real `chest_cm` and stats track independent of gender identity;
support legacy compatibility only until users reconfirm.

### P1-4 — Social migration broke downstream links and connect/disconnect behavior

The social migration removed profile columns, but application snapshot and
Discover readers still load raw profile rows
(`migrations/20260629160000_create_social_accounts_table.js:202-214`,
`src/domains/talent/routes/applications.js:86-88`,
`src/shared/lib/submission-profile.js:27-35`).

New submissions can omit saved social/portfolio links.

On OAuth success, `SocialSection.jsx:148-157` reloads and resets the whole RHF
form, discarding unsaved edits. Disconnect uses `/talent/socials/...` through a
client already based at `/api/talent`, producing the wrong path
(`SocialSection.jsx:166-176`, `client/src/shared/lib/api-client.js:7`).

Fix: a canonical profile loader joins social accounts; merge returned social
fields into dirty form state; use a named API method with the correct route.

### P1-5 — Production "verified" social accounts are simulated

`src/domains/talent/routes/social-oauth.js:15-113` lets a user assert any handle,
marks it connected, and fabricates follower/engagement metrics. The behavior is
codified in `tests/social-oauth.test.js:92-117`.

Fix: remove or hard-disable mock routes outside explicit demo/development
mode. Only provider-validated callbacks can set verified status.

### P1-6 — Public portfolio and classic PDF read obsolete measurements

The editor writes `bust_cm`, `waist_cm`, and `hips_cm`. Public portfolio renders
legacy `profile.measurements` (`views/portfolio/show.ejs:38-42,230-233`), and
the classic PDF reads dropped `profile.bust/waist/hips`
(`src/domains/pdf/templates/compcard-standard.ejs:50-61`). Classic is still
selectable and is the composed engine's failure fallback.

Fix: one canonical stats DTO/formatter for profile, submission, agency, public
portfolio, and every PDF engine.

### P1-7 — Shoe size loses its sizing system

`shoeRegion` is local state defaulting to US
(`ProfilePage/index.jsx:468-470`); only a numeric `shoe_size` is persisted.
Reloading UK 8 returns as US 8. Fixed arithmetic conversion is unreliable across
men, women, kids, and brands.

Fix: persist native size, source system, and sizing track; use reviewed lookup
tables and label conversions approximate.

### P1-8 — Playing age cannot be reliably cleared or validated

Empty `valueAsNumber` can become `NaN`; client optional-number parsing does not
normalize it; the server converts empty/null to `undefined`, so an existing
value cannot be cleared. No rule enforces min <= max.

Locations:

- `ProfilePage/index.jsx:1570-1584`
- `client/src/schemas/profileSchema.ts:3-8`
- `src/shared/lib/validation.js:835-842`

Fix: explicit null semantics and cross-field range validation.

### P1-9 — Representation status can contradict structured relationships

Status is partly derived from `seeking_representation`, while changing the
radio does not reconcile active relationships
(`ProfilePage/index.jsx:101-109`,
`RepresentationSection.jsx:47-56`).

Fix: derive representation state from active relationships and store discovery
intent separately.

## P1 — field validity and industry fit

### The global form must be split by context

The current page mixes:

- public professional identity;
- private identity/minor/immigration compliance;
- model/fit stats;
- actor/performance credits and media;
- creator metrics/links;
- booking operations;
- confirmed-job emergency data;
- sexual-content boundaries and an adult-platform URL.

Data minimization requires collecting only what is necessary for a specified
purpose, not exposing one broad row to every audience.
[EDPB Article 5](https://www.edpb.europa.eu/gdpr-articles/article-5-principles-relating-processing-personal-data_en)

#### Keep on the professional profile

- professional/display name; separate legal identity only when contracting;
- primary base and optional secondary base;
- concise optional bio;
- structured credits, training, skills, and languages, conditional by
  discipline;
- structured representation relationships;
- optional pronouns, travel preference, and work interests.

#### Make conditional by track, age, division, or market

- height; bust/chest/waist/hips/inseam/weight;
- shoe, dress, suit, collar, and cup systems;
- hair/eyes/texture, tattoos, and visible piercings;
- playing age and union membership;
- ethnicity/heritage, gender identity, skin tone, and build;
- social accounts, external website, and reels.

UK/BFMA minor standards are materially stricter than a global guardian toggle;
policy must be jurisdiction and recipient aware.
[Models1/BFMA code](https://www.models1.co.uk/code-of-ethics)

#### Move out of the global profile

- guardian email/consent to private minor compliance;
- emergency contact to confirmed-job safety/call-sheet context;
- DOB to private identity/compliance with derived audience-safe age band;
- work authorization, permits, passport, nationality/citizenship, and place of
  birth to structured travel/compliance;
- date availability to booking calendar/bookouts;
- content boundaries to private safety plus per-brief consent;
- OnlyFans to a separate verified-adult creator context with explicit audience
  controls;
- free-text legacy representation notes to generated structured history.

#### Remove as global readiness targets

- self-rated Emerging/Professional/Established;
- universal weight;
- universal skin-tone/markings completion.

#### Add

- first-class discipline and stats track independent of gender;
- canonical source-unit and measurement-verification metadata;
- performer assets: headshot, showreel, audio reel, accents/dialects, and
  structured credits;
- creator media-kit data with recipient-level sharing;
- minor permit/jurisdiction/expiry/chaperone/school constraints;
- booking calendar: bookouts, ranked options, holds, confirmed jobs;
- per-field audience controls: private, public book, agency discovery, named
  submission, confirmed job.

### High-impact terminology corrections

| Current | Replace with | Reason |
|---|---|---|
| Direct bookings = not seeking | Self-represented / not seeking | Direct booking is a booking method |
| Comfort Levels | Content boundaries; per-brief consent separately | Preference is not durable consent |
| Guardian Consent | Guardian profile-management approval / named-agency authorization | Current label collapses different scopes |
| Booking Lanes | Work interests / work types | Values are not geographic markets or agency boards |
| Placement agency | Market / booking agency | Placement is the mother agent's act/relationship |
| Physical proof | Stats & measurements | "Proof" is not trade language and is objectifying |
| Primary Role / `work_status` | Primary discipline | Current field is not availability status |
| Work Eligibility | Territory-specific work authorization | Authorization is jurisdictional |
| Profile readiness | Submission readiness | Score includes package/media, not only profile fields |
| Dress / Suit Size | Separate dress and suit fields | Different systems and formats |
| Bust relabeled Chest | Separate `bust_cm` and `chest_cm` | Relabeling does not change the datum |

Additional errors:

- `Equity (US)` should be Actors' Equity Association (AEA);
- `UAD` should be Union des artistes (UDA);
- `Home City` is better represented as primary base;
- `Legacy representation notes` exposes implementation language.

## UX/UI audit

### Nielsen heuristic score

| # | Heuristic | Score | Main issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Strong save/readiness feedback; no durable load-error state |
| 2 | Match system / real world | 2 | Several labels conflict with real workflows |
| 3 | User control and freedom | 2 | No dirty-navigation guard or complete mobile drawer behavior |
| 4 | Consistency and standards | 2 | Custom controls and focus styles diverge |
| 5 | Error prevention | 2 | Fetch failure can expose an empty editor |
| 6 | Recognition rather than recall | 3 | Index helps; custom-control behaviors are hidden |
| 7 | Flexibility and efficiency | 2 | One very long form; weak keyboard path |
| 8 | Aesthetic/minimalist design | 2 | Decorative chapter apparatus adds noise |
| 9 | Error recovery | 2 | Invalid submit does not focus/scroll first error |
| 10 | Help/documentation | 1 | Sensitive fields lack audience/purpose guidance |
| **Total** |  | **21/40** | **Acceptable; significant work required** |

### Cognitive load

Six of eight checks fail. The four visible editorial "movements" conflict with
the nine-item index, while "Proof" combines credits, training, roles,
eligibility, content boundaries, and work interests.

### P1 — core controls are not fully keyboard-operable

- `PholioCustomSelect.jsx:43-113`: options are non-focusable divs with no arrow
  selection/active descendant.
- `PholioMultiSelect.jsx:83-166`: same issue; SVG tag removal is click-only.
- `PholioMeasuringTape.jsx:187-233`: pointer scroll and double-click-only edit,
  no focusable range/input model or programmatic label.

Implement the
[WAI-ARIA combobox keyboard pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
or prefer native selects/inputs.

### P1 — small text, focus, and motion fail accessibility expectations

Source-derived contrast examples:

- `--pf-text-faint` on white: approximately 2.65:1;
- `#9C958E` on white: approximately 2.96:1;
- gold `#C9A55A` on cream: approximately 2.18:1.

These colors appear on small labels/placeholders/metadata. Profile controls
remove the native outline and replace it with a weak 1px halo
(`ProfilePage.module.css:788-856`). Hero motion and the RAF score animation do
not consistently respect reduced motion.

WCAG 2.2 requires 4.5:1 for normal text and defines focus/label/target
requirements.
[WCAG 2.2](https://www.w3.org/TR/WCAG22/)

### P1 — explicit repository bans are present (ignore PER USER)

- hero eyebrow: `ProfilePage/index.jsx:1229-1235`; (This can stay)
- Studio+ pill/badge: `index.jsx:1236-1238`; (THIS CAN STAY)
- readiness status dot: `index.jsx:1261-1265`; 
- repeated numbered uppercase kickers:
  `index.jsx:1317-1324,1351-1359,1377-1385,1733-1742`;
- identical social card grid: `SocialSection.jsx:294-304`;
- 2px side-stripe checklist accent:
  `ProfileStrengthSidebar.module.css:268`;
- numbered section scaffolding in the profile index:
  `ProfileNav.jsx:45-63`.

This is a direct repository-policy failure, not a taste disagreement.

### P1 — failed loading exposes an editable-looking empty profile

`ProfilePage/index.jsx:748-767` catches load failure, emits a transient toast,
clears loading, and renders defaults. It needs a blocking error/retry state.

### P2 — mobile save, errors, and drawer behavior are incomplete

At <=768px the readiness sidebar follows the full form, so the only Save action
arrives after the entire page. Invalid submit toasts but does not focus/scroll
the first invalid field. The drawer toggle lacks `aria-expanded`/`aria-controls`;
the overlay is a click-only div (`ProfilePage/index.jsx:1187-1200`).

Add a mobile sticky save bar, first-error focus, dirty-navigation protection,
Escape/focus/body-scroll drawer behavior, and safe-area padding.

### Detector evidence

The deterministic scan found 27 warnings:

- 26 `overused-font` warnings;
- 1 `bounce-easing` warning in `MockConsentPage.module.css:68`.

The Inter warnings are false positives because Inter is an intentional,
documented product-system font. The bounce easing is valid but belongs to the
mock social-consent surface. The detector missed the repository-specific hero
eyebrow, badge, status-dot, numbered-kicker, and side-stripe bans that the manual
source review found.

No browser overlay was produced because the in-app browser had no available
target.

## Legal/privacy detail

Applicability caveats:

- GDPR/UK findings assume offering services to or monitoring EEA/UK users.
- CCPA/CPRA business duties depend on current statutory thresholds.
- COPPA applies to known under-13 users; collecting DOB gives actual knowledge
  when such a date is entered.
- Whether Pholio is a New York model management company requires counsel and
  depends on its actual role.

### Standing sexual-content preferences are not booking consent

The profile stores Lingerie, Implied Nudity, Artistic Nudity, and Body Paint as
standing values (`ProfilePage/index.jsx:252-259,1587-1603`), and agency scoring
uses them as match criteria.

New York's Fashion Workers Act requires informed, voluntary signed consent
before sexually explicit material is created, shared, or distributed for
covered actors.
[NY DOL responsibilities](https://dol.ny.gov/node/58876)

Remove these fields from generic discovery/scoring. For adults, keep private
boundaries and obtain per-brief signed consent. Never expose them for minors.

### Public controls are not field-granular

The public portfolio can render exact age, gender, weight, skin tone,
nationality, ethnicity, measurements, social handles, and city
(`views/portfolio/show.ejs:30-65,170-257`). No per-field public/agency/
submission control exists.

Use a shared audience matrix and DTO layer; default sensitive fields private.

### Emergency contacts are overcollected in the profile

The page collects a third party's name, phone, and relationship
(`ProfilePage/index.jsx:1761-1794`) and broad API rows expose them.

Move this to a private confirmed-booking safety context with narrow staff
access, purpose, and retention.

### Export, deletion, and retention do not cover the complete lifecycle

- export omits social accounts, representations, guardian requests/agency
  consents, submission packages/events, sessions, moderation/reports, and
  derived embeddings (`src/shared/lib/data-export.js:122-245`);
- deletion tolerates R2/Firebase failures, deletes the DB row, and reports
  success, removing retry state (`src/shared/lib/account-deletion.js:135-172`,
  `src/domains/talent/routes/settings.js:599-613`);
- some submission-package creation paths omit retention expiry;
- current notices describe different retention/deletion behavior.

Use one canonical data inventory for export, deletion, retention, provider
purge, and notices. Deletion should be a durable job/outbox with verified
completion.

### Legal pages contain placeholders and unsupported factual promises

The landing Privacy, Terms, and AI Notice contain placeholder entity/address/
representative details and claims about AI opt-in, CSRF, retention, incident
response, transfers, and minor account management that are not supported by the
current app.

Repository ownership:

- `pholio-app`: DTOs, authorization, consent enforcement, AI controls, deletion,
  export, retention, analytics, and field visibility;
- `pholio-landing`: legal instruments and entity/provider details.

Both must release together after an evidence-based claim review.

## Additional security findings

### P1

- Phyllo callback does not bind the returned provider account to the stored
  Phyllo user (`src/domains/talent/routes/phyllo-routes.js:67-124`).
- Auth rate limiting prefers an ephemeral session ID for unauthenticated
  requests and is bypassable without cookies (`src/app.js:219-238,426-433`).
- Guardian-email requests have no per-user/profile/recipient quota
  (`guardian-consent.js:44-147`).
- Talent can write arbitrary fit scores exposed through broad agency readers
  (`profile.js:1162-1224`).
- No-op profile saves can invoke expensive embedding/reindex work
  (`profile.js:981-1067`).
- Account deletion can falsely report full erasure.

### P2 / hardening

- login does not regenerate the session after authentication
  (`src/domains/auth/routes/auth.js:651-705`);
- CSRF relies on CORS/SameSite and lacks explicit Origin/token enforcement;
- `src/config.js:47` falls back to `pholio-secret` instead of failing production
  startup;
- failed image decoding preserves the original upload
  (`src/shared/lib/uploader.js:121-134,206-332`);
- authenticated profile responses lack explicit `private, no-store`;
- CSP is disabled (`src/app.js:265-269`).

SameSite is useful defense in depth but does not replace CSRF controls when
sibling subdomains share the site boundary.
[OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

## Production-readiness audit

Verdict: **NO-GO — 31/100**. The exact score is directional; the gates are
dispositive.

### P0 — deploy can break every profile read before a later manual migration

`netlify.toml:4` deploys code without running migrations. `README.md:334-339`
instructs operators to deploy and then invoke `/api/migrate`. Current profile
GET unconditionally reads `social_accounts` and `talent_representations`
(`profile.js:425-429,527-528`), which are recent migrations.

Failure scenario: N+1 code becomes live on the N schema and every authenticated
profile GET fails with a missing-relation error during the gap.

Fix:

- execute locked, authenticated expansion migrations before N+1 receives
  traffic;
- use expand/backfill/cutover/contract so N and N+1 can coexist;
- rehearse the exact sequence on a scrubbed PostgreSQL production clone;
- remove migration execution from ordinary application endpoints.

### P0 — production runtime is end-of-life

`netlify.toml:7-9` pins Node 20, and the function bundle targets Node 20
(`package.json:28`). Node 20 reached EOL on 2026-03-24; EOL releases receive no
security patches.
[Node.js EOL policy](https://nodejs.org/en/about/eol)

Upgrade to a supported LTS—prefer Node 24, or Node 22 if platform compatibility
requires it—then rebuild native dependencies and run function, PDF, image, and
full integration smoke tests.

### P0 — release pipeline has no quality gate

The root `build` script only echoes "Build complete" (`package.json:27`).
Netlify runs install/build steps but no lint, tests, type checking, PostgreSQL
migration validation, accessibility, or browser smoke tests (`netlify.toml:4`).
No repository CI workflow was found.

Fix:

- use lockfile-driven `npm ci`;
- require lint, server/client tests, PostgreSQL migration rehearsal, client
  build, E2E, and accessibility checks before deploy;
- build once and promote the same artifact;
- record provenance/SBOM and a tested rollback target.

### P0 — production migration endpoint can be unprotected

`src/app.js:493-520` permits `/api/migrate` when `MIGRATION_SECRET` is absent,
and `app.js:559-582` exposes detailed migration status.

Remove migration execution/status from the production app. Use a restricted
deploy identity and fail closed when required configuration is missing.

### P1 — recent social migration is a destructive one-release cutover

`migrations/20260629160000_create_social_accounts_table.js:44-57,205-225`
backfills and drops old columns in one `up`. Its `down` restores only handles/
URLs and loses OAuth tokens, metrics, and timestamps.

Use expand/backfill/dual-read or dual-write/cutover/contract across releases.
Reconcile counts/values and measure locks on a production-size PostgreSQL clone.

### P1 — save waits on derived/external work inside a 26-second request

`profile.js:1055-1071` runs embedding/reindex work before returning, while
`netlify.toml:20-22` configures a 26-second function timeout. A timeout can occur
after the DB commit, causing the client to report failure for a persisted save.

Move indexing to a durable outbox/job after commit. Expose indexing state and
retry metrics.

### P1 — frontend behavior has no automated test surface

`client/package.json:6-10` provides build/lint only. Required release evidence:

- form normalization and null/clear unit tests;
- component tests for hydration, loading error, save, validation, and dirty
  state;
- authenticated browser tests for owner save/reload and downstream audiences;
- axe/keyboard/reduced-motion checks;
- PostgreSQL integration and migration tests.

### P1 — eager routing creates an excessive initial bundle

`client/src/App.jsx:7-45` eagerly imports talent, agency, onboarding, moderation,
preview, and mock OAuth pages. The production build emitted 2.135 MB minified JS
(627 KB gzip).

Use route-level `React.lazy` and dynamic imports, remove production demo routes,
and enforce an initial-route performance budget.
[React `lazy`](https://react.dev/reference/react/lazy),
[Vite dynamic imports](https://vite.dev/guide/features.html#dynamic-import)

### P1 — production mock route ships unconditionally

`App.jsx:45,72` imports/routes `MockConsentPage` without a development feature
gate. Production builds must return 404 for mock provider/OAuth routes.

### P1 — operational observability is inadequate

Only console-style logging was found; no request IDs, traces, client error
monitoring, profile latency/error metrics, migration state, outbox lag,
dashboards, alerts, SLOs, or rollback runbook were identified.

Add structured redacted telemetry and exercise alerts/runbooks before launch.
[OWASP logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

## Verification results

### Passed

- Production client build completed.
- Targeted JSX ESLint: 0 errors; the TypeScript schema was ignored by the
  current ESLint configuration.
- Focused profile suite outside the socket-restricted sandbox:
  **53 passed, 1 failed, 1 skipped** across 9 suites.
- `git diff --check` passed for audit documentation.

### Failed / warning

- `tests/talent/profile-division.test.js:67` expects the commercial "Next up"
  list to contain three items, while current code returns four in the fixture
  because `buildReadinessLists` now slices to five
  (`profileReadinessItems.js:320-323`).
- Vite produced a **2,135.49 kB** minified main JS bundle
  (**627.49 kB gzip**) and a **681.65 kB** CSS bundle
  (**115.24 kB gzip**), with a chunk-size warning.
- Jest required `--forceExit`, indicating open handles in the focused suite.
- The npm production dependency advisory check could not complete: sandbox
  DNS was blocked and the approved network retry was rejected by the execution
  environment. Dependency vulnerability state is therefore unverified.
- No live-browser target was available. Rendered responsive, focus, screen
  reader, and end-to-end save/reload behavior remain unverified.

## Remediation sequence

### Phase 0 — incident and exposure containment

1. Rotate Neon/Firebase credentials and clean Git history.
2. Disable `/api/public/home` raw rows and broad agency endpoints, or deploy
   temporary deny-by-default responses.
3. Make profiles private/non-discoverable by default until DTO and consent
   boundaries are in place.
4. Disable sensitive AI inference/ranking and production mock OAuth.
5. Make guardian GET read-only.

### Phase 1 — canonical audience and consent model

1. Define response schemas for owner, public, discovery, named submission,
   represented-roster, and confirmed-job audiences.
2. Centralize minor/blocked-agency/image visibility policy in query-level
   helpers.
3. Implement scoped, versioned consent/authorization and verified age state.
4. Add per-field audience controls and truthful public preview.

### Phase 2 — transactional data model

1. Replace full-form, multi-request save with transactional commands and row
   versions.
2. Canonicalize DOB-derived age, stats tracks, measurement units/recency,
   structured work authorization/permits, and social-account loading.
3. Unify stats across profile, submission, agency, public portfolio, and PDFs.
4. Split professional profile, private compliance, submission, booking, and
   confirmed-job safety data.

### Phase 3 — UX/accessibility redesign

1. Replace custom control keyboard failures and meet WCAG contrast/focus/motion
   requirements.
2. Remove banned eyebrow/badge/dot/numbered-kicker/side-stripe patterns.
3. Reframe the page around discipline-aware progressive disclosure.
4. Add durable load errors, first-error focus, mobile sticky save, dirty-state
   protection, and accessible drawer behavior.

### Phase 4 — release proof

1. Add forbidden-key contract tests for every audience DTO.
2. Add browser E2E save/reload, public, agency, submission, minor, PDF, and
   rollback paths.
3. Run axe, keyboard, screen-reader, 200% zoom, mobile, reduced-motion, slow
   network, and error-injection tests.
4. Resolve the focused test failure and Jest open handles.
5. Code-split the SPA and define performance budgets.
6. Complete dependency audit, secret scan, migration rehearsal, rollback
   rehearsal, and legal-notice evidence review.

## Highest-leverage fixes

1. **Audience DTOs plus deny-by-default visibility** eliminate the largest
   security, legal, and data-minimization class at once.
2. **Scoped guardian/AI/publication consent and verified age** resolve the
   highest-risk minor and notice mismatch.
3. **One transactional, versioned save command** removes destructive defaults,
   partial persistence, stale overwrites, and false measurement recency.
4. **Discipline-aware field sets** fix the largest industry, naming,
   field-choice, and cognitive-load problems.
5. **Native/APG-compliant controls and removal of banned scaffolding** produce
   the fastest trustworthy UX improvement after containment.

## Coverage limitations

- No live browser tab was available, so rendered visual conclusions are
  source-based and not screenshot-backed.
- No screen-reader session or physical mobile device was available.
- Dependency advisory state remains unknown.
- This audit identifies legal/product risk and required counsel decisions; it
  is not a jurisdiction-specific legal opinion.
