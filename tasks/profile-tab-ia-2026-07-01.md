# Profile Tab — Information Architecture Audit (Wave 2, `wave2-field-split`)

Date: 2026-07-01 · Design-only. No code changed. Grounded in the ACTUAL current
components on `wave2-field-split`, the Wave 2A blueprint
(`tasks/field-split-design-2026-07-01.md`), `client/src/schemas/profileSchema.ts`,
and `client/src/shared/constants/profileDivision.js`.

Skills invoked: `impeccable` (IA / grouping / cognitive load / progressive
disclosure) + `industry` (agency director / head booker credibility).

**Headline verdict:** The read-side of the field split already shipped (backend
DTOs, stats formatter, PDF, submission all read `chest_cm`, `suit_size`,
`stats_track`, `discipline` — see grep evidence in §B0). The **write-side (this
form) never collects any of them.** The profile tab is still one flat, gender-keyed
mega-form. The single most important structural fix is not reordering labels — it
is introducing `discipline` + `stats_track` as the drivers and splitting the
conflated inputs the backend already expects.

---

## A. CURRENT-STATE MAP (in render order)

Source of truth: `client/src/domains/talent/pages/ProfilePage/index.jsx`. The form
is grouped into four editorial "movements", each with a numbered kicker.

### Movement I — "I — Identity / Who you are" (`index.jsx:1035-1067`)
Renders `IdentitySection` (`ProfilePage/IdentitySection.jsx`), which composes two `Section`s:

- **`#identity` "Personal Details"** (`components/IdentitySection.jsx:49-343`)
  - `first_name`, `last_name` (grid)
  - `city` (autocomplete), `gender` (select)
  - `date_of_birth` (+ live age badge), `pronouns`
  - **Minor compliance block** (conditional `isMinor`, `:156-225`): guardian consent
    copy, `guardian_email` + send-link button, `work_permit_on_file` toggle
  - `bio` + AI refine/generate/length/voice controls (kicker "Bio")
- **`#heritage` "Heritage & Background"** (`IdentitySection.jsx:69-138`)
  - `ethnicity` (multi-select), `nationality` (country), `place_of_birth` (city),
    `city_secondary` ("Secondary City")

### Movement II — "II — Measurements / Physical proof" (`index.jsx:1069-1093`)
Renders `MeasurementsSection` (`ProfilePage/MeasurementsSection.jsx`), one `Section`:

- **`#appearance` "Physical Attributes"** — metric/imperial unit toggle in header
  - Height (tape), Weight (tape) — `:78-127`
  - Shoe Size + US/UK/EU region toggle + live conversions — `:129-179`
  - **Bust/Chest** (single `bust` field, label = `gender === 'Female' ? 'Bust' : 'Chest'`),
    Waist, Hips — `:181-244`
  - **"Dress / Suit Size"** (single `dress_size` string input) + Inseam — `:246-273`
  - Eye Color + Hair Color; Hair Length + **Skin Tone**; Hair Type + Body Type — `:275-372`
  - Visible Tattoos + Piercings — `:374-412`
  - When minor + no consent: entire section replaced by a locked notice (`:27-46`)

### Movement III — "III — Proof / Credits & craft" (`index.jsx:1095-1449`)
Four inline `Section`s defined directly in `index.jsx`:

- **`#credits` "Credits & Experience"** — `experience_level` (Emerging/Professional/
  Established), `experience_details` (CreditsEditor) — `:1106-1143`
- **`#training` "Training & Skills"** — `training_summary` (+ AI format/summarize/
  draft), `specialties` ("Special Skills" tags), `languages` — `:1145-1247`
- **`#roles` "Roles & Style"** (grab-bag) — `work_status` ("Primary Role":
  Model/Actor/Dancer/Voiceover/Influencer), `union_membership`, `playing_age_min/max`,
  `comfort_levels` ("Comfort Levels"), then an admin grid: `availability_schedule`,
  `work_eligibility` ("Work Eligibility"), `availability_travel`, `passport_ready`,
  `drivers_license` — `:1249-1420`
- **`#market` "Booking Lanes"** — `booking_primary_lane` + `booking_secondary_lanes`
  (primary/secondary lane picker + Pholio fit signals) — `:1422-1447`

### Movement IV — "IV — Reach / Representation & contact" (`index.jsx:1451-1514`)
- **`#representation` "Agency representation"** (`components/RepresentationSection.jsx`)
  — tri-state status (Seeking / Represented / **"Direct bookings"**), structured
  `representations[]` (relationship mother/placement, agency name, market, territory,
  division, exclusivity, start date), `previous_representations` ("Legacy
  representation notes" textarea)
- **`#socials` "Socials & Media"** (`ProfilePage/SocialSection.jsx`) — IG, TikTok, X,
  YouTube, Website, **OnlyFans** (hidden only for minors), Reel; OAuth verify +
  follower/engagement metrics
- **`#contact` "Contact & Emergency"** — `emergency_contact_name`, `..._phone`,
  `..._relationship`

Left-rail nav (`components/ProfileNav.jsx:6-14`): identity, heritage, appearance,
credits, training, roles, representation, socials, contact. Note **`market`
(Booking Lanes) is missing from the nav** and from `PROFILE_NAV_SECTION_IDS`
(`index.jsx:87-97`), so scroll-spy never tracks it.

### What the refactor already did WELL (keep)
- **Structured representation** matching the real mother-agency model: separate
  mother vs placement rows, per-market/territory/division, exclusivity, one-mother
  rule (`profileSchema.ts:147-153`). This is genuinely credible — biggest industry win on the page.
- **Booking lanes** with primary + up to 3 secondary and a Pholio "signal" — a real
  routing concept, correctly kept separate from Special Skills (`index.jsx:205-216`).
- **Dual-unit measurements** (metric/imperial tapes) + **shoe region US/UK/EU** with
  live conversion — correct data-model instinct (`MeasurementsSection.jsx:55-179`).
- **Minor gate**: measurements/weight locked until guardian consent; OnlyFans hidden
  for minors; guardian one-time email link (`index.jsx:697-704`, `SocialSection.jsx:292`).
- Movements give the page a narrative spine and a working scroll-spy.

---

## B. IA PROBLEMS

### B0. THE STRUCTURAL GAP: no `discipline`, no `stats_track`, no split inputs (P0)
The backend already reads these (grep, `wave2-field-split`):
- `stats_track`, `chest_cm`, `suit_size`, `discipline` are in the audience DTO
  allowlists (`src/shared/lib/audience-dto.js:114-130,203-227`), submission profile
  (`src/shared/lib/submission-profile.js:14-23`), the canonical stats formatter
  (`src/shared/lib/stats-formatter.js:12-132,296-377`), and every PDF engine
  (`src/domains/pdf/composition/stats-formatter.js:333-609`). Migrations
  `20260701100000_add_stats_track_fields.js` and `20260701100100_add_profile_discipline.js`
  created the columns and backfilled them.

The form does **not**:
- `profileSchema.ts` has **no** `discipline`, `stats_track`, `chest_cm`, or
  `suit_size`. It carries a single `bust` and a single `dress_size` (`:78-84`).
  `.passthrough()` (`:190`) lets the API's real columns ride through form state
  unused, so they silently exist but are never editable.
- `formNormalization.js:211` maps `bust: profile.bust_cm` — the one `bust` field is
  hardwired to `bust_cm`; `chest_cm` is never surfaced or written.

Consequences, checked against the audit's explicit asks:

1. **Dress/suit split — NOT surfaced. MUST-FIX.** `MeasurementsSection.jsx:246-252`
   is a single "Dress / Suit Size" text input bound to `dress_size`. The `suit_size`
   column exists and is read by the formatter/DTO/PDF, but the talent can never enter
   it. A menswear talent has no correct sizing input; a womenswear talent sees a
   label implying suit sizing applies to them.
2. **Chest vs bust — relabel, not real split.** `MeasurementsSection.jsx:183` toggles
   the label on the *same* `bust` field by `gender` (`=== 'Female' ? 'Bust' : 'Chest'`).
   Industry + backend both key the circumference on **`stats_track`, not `gender`**
   (`stats-formatter.js:100-118` is explicit: "NEVER driven by gender"). A non-binary
   or menswear-track talent gets the wrong field entirely, and it always writes
   `bust_cm`, never `chest_cm`.
3. **Stats not track-driven.** Everyone — every discipline, every track — is shown
   Bust/Waist/Hips + Dress, the womenswear set. There is no `stats_track` selector.
   Fit/menswear/ungendered talent see an incorrect measurement set.
4. **No discipline progressive disclosure.** There is no `discipline` control and no
   branching. `work_status` ("Primary Role") exists but drives nothing and is buried
   at `index.jsx:1256`. A performer is forced through Bust/Waist/Hips/Dress and body
   type (irrelevant); a pure fashion model is forced through playing age, union,
   comfort levels, reel. It is exactly the "one flat mega-form" the blueprint's
   product decision #1 (STRONG per-discipline branching) rules out.

### B1. Private/compliance fields interleaved with public identity (P0/P1)
Blueprint §B routes work-authorization, permits, nationality, DOB to a **private
COMPLIANCE** context. Currently they are scattered through public movements:
- `work_eligibility`, `passport_ready`, `drivers_license`, `availability_travel` sit
  inside **"Roles & Style"** (`index.jsx:1327-1418`), interleaved with creative-role
  fields — mixing private legal status with public casting attributes in one grid.
- `nationality` + `place_of_birth` sit in **"Heritage & Background"** (Movement I),
  framed as casting-diversity data, not compliance.
- `work_permit_on_file` + guardian consent live in Personal Details (Movement I).
- There is no single "private / only-agencies" boundary. A talent cannot tell which
  of these fields a public viewer sees. Blueprint decision #3/§C says stats and
  compliance default to agency/private, never public — the form communicates none of that.

### B2. Emergency contacts sit in the general profile (P1)
`#contact` "Contact & Emergency" (`index.jsx:1478-1512`) collects emergency contact
name/phone/relationship inline. Blueprint §B routes emergency + references to a
**SAFETY (confirmed-job / call-sheet)** context — released only when a booking is
confirmed, not standing profile data. Sitting in the general edit form both misframes
it (looks like public contact info) and collects sensitive next-of-kin data with no
booking to justify it. References (`reference_*`) are absent entirely.

### B3. Content boundaries / OnlyFans in the general form (P0 for minors-adjacent, P1 otherwise)
Blueprint decision #2: `comfort_levels` + `onlyfans_url` move OUT of generic
discovery/scoring into a **private, verified-adult creator context**, per-brief
consent, never for minors, and removed from standing match scoring.
- `comfort_levels` ("Comfort Levels") is a plain multi-select inside "Roles & Style"
  (`index.jsx:1305-1322`) — a standing, discoverable preference.
- `onlyfans_url` is a normal card in the public `SocialSection` (`SocialSection.jsx:91-101`),
  merely hidden for minors. For an adult it reads as a public social link, not a
  gated verified-adult context. Both violate decision #2.

### B4. Stats section mixes protected traits into casting data (P1)
- `skin_tone` is a free-text input inside Measurements (`MeasurementsSection.jsx:335`).
  Blueprint §B: **REMOVE** `skin_tone`/`ethnicity` from generic discovery & scoring
  (protected). Still collected here as if a filterable stat.
- `ethnicity` in "Heritage & Background" is framed "Helps match you with diverse
  casting calls" (`IdentitySection.jsx:73`) — presenting a protected trait as a match lever.

### B5. "Roles & Style" is an unsorted grab-bag (P1, cognitive load)
`#roles` (`index.jsx:1249-1420`) mixes at least three unrelated concerns in one
section: creative identity (`work_status`, `union_membership`, `playing_age`),
adult boundaries (`comfort_levels`), and pure logistics/compliance
(`availability_schedule`, `work_eligibility`, `availability_travel`, `passport_ready`,
`drivers_license`). Nine+ heterogeneous fields, no sub-grouping — high scan cost and
no mental model for what this section "is."

### B6. Ordering / positioning problems (P1/P2)
- **Discipline & track are absent from the top**, so nothing downstream can adapt.
  The one field that should shape the whole form (`work_status`) is buried mid-page
  in Movement III and inert.
- **Booking Lanes** (market routing — high-value, high-scan) sits last in Movement III
  after five admin dropdowns, and is not in the nav — it reads as an afterthought.
- **`city_secondary`** (a base/location field, CORE per blueprint) is stranded in
  "Heritage & Background" next to ethnicity/nationality — wrong grouping.
- Compliance/private fields are sprinkled across Movements I and III instead of
  landing last as an intentional "private" close.

### B7. Design-language smells relevant to IA (P2, defer to impeccable)
Movement kickers "I — Identity", "II — Measurements", etc. (`index.jsx:1037` et al.)
are numbered section eyebrows — banned pattern #1/#5 in CLAUDE.md and a saturated
"AI scaffold" tell. `bioKicker` "Bio" (`components/IdentitySection.jsx:229`) and the
hero `LOCATION` eyebrow (`index.jsx:948-953`) are the same pattern. Flagged for the
Wave 3 rebuild, not part of the IA reorg itself.

---

## C. PROPOSED IA (target structure)

Ordered story: **identity → discipline (the driver) → stats → discipline-specific
craft → representation → public links → private compliance → verified-adult → on-set
safety.** Public, most-scanned fields first; everything private/compliance closes the
form. Conditionality is driven by `discipline` (model/performer/creator), `stats_track`
(womenswear/menswear/ungendered), and age (minor).

**1. Identity** — always
`first_name`, `last_name`, `pronouns`, `gender`, **Primary base** (`city`),
**Secondary base** (`city_secondary`), `date_of_birth` (+ age badge), `bio`.
- *Deviation from blueprint:* blueprint routes `date_of_birth` to COMPLIANCE. Keep DOB
  here. Justification: DOB is the single load-bearing gate on the page — it drives the
  minor lock, guardian flow, and playing-age sanity. Collecting it last would break
  progressive gating. Age is derived/displayed; the raw date is treated as private.
- Move `city_secondary` here from Heritage (it is a base, not heritage).

**2. Discipline & focus** — always (NEW, the progressive-disclosure driver)
**Primary discipline** (`discipline`: Model / Performer / Creator) + optional secondary
(hybrid); for the model track, **Stats track** (`stats_track`: Womenswear / Menswear /
Ungendered — explicitly independent of `gender`); **Work interests / work types**
(the current Booking Lanes primary/secondary + Pholio signal, relabeled).
- This section sits second so every section below can branch on it.
- `work_status` is absorbed into `discipline` (see §D) and retired as a separate field.

**3. Stats & measurements** — conditional (model, or any talent who opts to add stats);
minor-locked until guardian consent; **agency-default visibility, per-field public opt-in**
Height, Weight, Shoe (+region), **Chest/Bust** rendered from `stats_track`
(womenswear → `bust_cm`; menswear/ungendered → `chest_cm`), Waist, Hips, Inseam,
**Dress size (womenswear) and Suit size (menswear) as SEPARATE inputs**, Hair
color/length/type, Eye color, Body type, Tattoos, Piercings.
- **Remove `skin_tone`** (protected; blueprint REMOVE).
- Field set + sizing systems shown are chosen by `stats_track`, never `gender`.

**4. Performer craft** — conditional (`discipline` includes performer)
`experience_level` + structured credits, `training_summary`, `playing_age_min/max`,
`union_membership` (with corrected union labels, §D), reels (`video_reel_url` + future
showreel/audio), accents/dialects (new), `languages`, `specialties` (Special Skills).
- Today these render for everyone; gate to the performer track. A pure fashion model
  should not be shown playing age / union / reel by default (can opt in as hybrid).

**5. Creator media-kit** — conditional (`discipline` includes creator)
Verified social accounts + follower/engagement metrics with recipient-level sharing;
media-kit emphasis. (The `SocialSection` OAuth/metrics machinery already exists; this
section is its creator-facing framing.)

**6. Representation** — always
Keep as-is structurally (tri-state status, structured mother/placement rows, markets,
exclusivity). Relabel "Direct bookings" → "Self-represented / not seeking"; "Legacy
representation notes" → "Representation history" (§D).

**7. Socials & links** — always (public)
Public handles: Instagram, TikTok, X, YouTube, personal website, reel.
- **Remove OnlyFans from here** → §9.

**8. Private & compliance** — always present; expansions conditional by age/territory
Framed clearly as "Private — shared only with agencies / on roster." Contains:
`nationality`, `place_of_birth`, **Territory work authorization** (`work_eligibility`,
relabeled), `passport_ready`, `drivers_license`, `availability_schedule`,
`availability_travel`, and — when minor — guardian consent, `work_permit_on_file`, plus
the future structured minor-permit model (jurisdiction / expiry / chaperone / school).
- Consolidates every private/legal field now scattered across Movements I and III.

**9. Verified-adult creator context** — conditional (18+ and verified/opted-in);
never rendered for minors
**Content boundaries** (`comfort_levels`, relabeled) with per-brief consent framing +
`onlyfans_url`. Private, out of standing discovery/scoring (blueprint decision #2).

**10. On-set safety** — always present, framed "released only when you're booked"
`emergency_contact_*` + references (`reference_*`, new). Explicitly not public/standing
profile data (blueprint SAFETY context).

**Conditionality summary**

| Section | Shown when |
|---|---|
| 1 Identity | always |
| 2 Discipline & focus | always (drives 3–5) |
| 3 Stats & measurements | `discipline`=model or stats opted-in; locked for minor w/o consent; track-driven |
| 4 Performer craft | `discipline` includes performer |
| 5 Creator media-kit | `discipline` includes creator |
| 6 Representation | always |
| 7 Socials & links | always |
| 8 Private & compliance | always; minor-permit block only when minor |
| 9 Verified-adult context | 18+ and verified; never for minors |
| 10 On-set safety | always (released-on-booking framing) |

---

## D. TERMINOLOGY DELTAS STILL NEEDED
Cross-checked against blueprint §D — none of these renames have landed in the UI yet.

| Current label / value (file) | Target |
|---|---|
| Movement II "Physical proof" / "Physical Attributes" (`MeasurementsSection.jsx:31,52`) | **Stats & measurements** |
| "Dress / Suit Size" single input (`MeasurementsSection.jsx:248`) | **Dress size** and **Suit size** — separate |
| Bust/Chest gender-relabel (`MeasurementsSection.jsx:183`) | Track-driven **Bust** (`bust_cm`) vs **Chest** (`chest_cm`) |
| "Primary Role" / `work_status` (`index.jsx:1262`) | **Primary discipline** (`discipline`) |
| "Work Eligibility" (`index.jsx:1349`) | **Territory work authorization** |
| "Comfort Levels" (`index.jsx:1312`) | **Content boundaries** (moved to verified-adult) |
| "Booking Lanes" (`index.jsx:1424`) | **Work interests / work types** |
| "Direct bookings" status (`RepresentationSection.jsx:31`) | **Self-represented / not seeking** |
| "City" / "Secondary City" (`IdentitySection.jsx:78`, `ProfilePage/IdentitySection.jsx:132`) | **Primary base** / **Secondary base** |
| "Legacy representation notes" (`RepresentationSection.jsx:236`) | **Representation history** |
| Union "Equity (US)" (`index.jsx:63`) | **Actors' Equity Association (AEA)** |
| Union "UAD" (`index.jsx:66`) | **Union des artistes (UDA)** |
| "Profile readiness" (`ProfileStrengthSidebar.jsx:167`) | **Submission readiness** |
| Nav "Physical Attributes" / "Contact" (`ProfileNav.jsx:8,14`) | **Stats & measurements** / **On-set safety** (+ add Discipline, Booking/Work interests) |

---

## E. IMPLEMENTATION CHECKLIST (ordered)

Do these top-down; each is verifiable by loading `/dashboard/talent/profile`.

1. **[MUST-FIX] Split dress vs suit into two inputs.** In `MeasurementsSection.jsx:246-252`
   replace the single "Dress / Suit Size" input with a **Dress size** input bound to
   `dress_size` and a **Suit size** input bound to `suit_size`. Add `suit_size` to
   `profileSchema.ts` (string, nullable). Wire `suit_size` through
   `formNormalization.js` load/save. The `suit_size` column + formatter/DTO/PDF
   already consume it (`stats-formatter.js:328-360`).

2. **[MUST-FIX] Make chest vs bust track-driven and add `chest_cm`.** Add `chest_cm`
   and `stats_track` to `profileSchema.ts`. In `MeasurementsSection.jsx:181-201`,
   drive the label and bound field off `stats_track` (womenswear → `bust_cm`;
   menswear/ungendered → `chest_cm`), not `gender`. Update `formNormalization.js:211`
   to load/save `chest_cm` alongside `bust_cm` (stop conflating).

3. **Introduce `discipline` + `stats_track` selectors as a new "Discipline & focus"
   section** placed second (right after Identity). Add both to `profileSchema.ts` and
   `formNormalization.js`. Migrations already provide the columns
   (`20260701100100_add_profile_discipline.js`, `20260701100000_add_stats_track_fields.js`).

4. **Gate sections by discipline.** In `index.jsx`, render **Stats & measurements**
   for the model track (or opt-in), **Performer craft** (the current
   credits/training/roles content minus logistics) for the performer track, and a
   **Creator media-kit** framing for the creator track. Retire `work_status` in favor
   of `discipline`.

5. **Extract a "Private & compliance" section** and move into it: `work_eligibility`
   (→ Territory work authorization), `passport_ready`, `drivers_license`,
   `availability_schedule`, `availability_travel` (out of "Roles & Style",
   `index.jsx:1327-1418`) and `nationality`, `place_of_birth` (out of Heritage,
   `IdentitySection.jsx:92-121`). Fold the minor guardian/permit block here. Position
   it near the end, clearly marked private/agency-only.

6. **Move content boundaries + OnlyFans to a verified-adult section.** Remove
   `comfort_levels` from "Roles & Style" (`index.jsx:1305-1322`) and `onlyfans_url`
   from `SocialSection.jsx:306-308`; render both only for 18+/verified, gated, out of
   standing scoring (relabel "Comfort Levels" → "Content boundaries").

7. **Reframe emergency contacts as On-set safety.** Move the `#contact` block
   (`index.jsx:1478-1512`) into a "released only when booked" section; add optional
   `reference_*` fields.

8. **Remove protected traits from stats/casting framing.** Drop `skin_tone`
   (`MeasurementsSection.jsx:335`) from stats; re-frame or restrict `ethnicity`
   (`IdentitySection.jsx:69-91`) away from "match you with casting calls."

9. **Reorder + rehome remaining CORE fields.** Move `city_secondary` from Heritage into
   Identity as "Secondary base"; move Booking Lanes / Work interests up into the
   Discipline section; delete the now-empty "Heritage & Background" wrapper (ethnicity
   folds into Identity or a protected-info note).

10. **Apply terminology renames** from §D across `MeasurementsSection.jsx`,
    `index.jsx` (union options, section titles), `RepresentationSection.jsx`,
    `components/IdentitySection.jsx`, `ProfileNav.jsx`, and `ProfileStrengthSidebar.jsx`.

11. **Fix the nav.** Update `ProfileNav.jsx:6-14` + `PROFILE_NAV_SECTION_IDS`
    (`index.jsx:87-97`) to the new section set (add Discipline + Work interests; rename
    Physical Attributes → Stats & measurements, Contact → On-set safety) so scroll-spy
    tracks every section, including the currently-orphaned `market`.

12. **(Wave 3, defer to impeccable)** Replace the numbered movement kickers, `bioKicker`,
    and hero `LOCATION` eyebrow (banned patterns) during the discipline-aware rebuild.

**Definition of done for the reorg:** a Menswear/Performer talent sees Suit size (not
Dress), a Chest field bound to `chest_cm`, no Bust/Waist/Hips-by-default, no
irrelevant playing-age vs. no relevant reel mismatch; all private/legal fields live in
one clearly-private section at the end; content boundaries + OnlyFans never appear for
minors and are gated for adults.
