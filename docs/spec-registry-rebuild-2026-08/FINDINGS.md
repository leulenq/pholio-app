# Spec Registry Rebuild — Cross-Cutting Findings

**Date:** 2026-08-19. All claims below are adjudicated from the per-agency evidence files in
this directory; each names its agencies so the underlying verbatim evidence is one hop away.

## 1. Systemic findings

### 1.1 The minors gap is the industry's default condition, in five distinct shapes

Not one of the ten researched agencies (nor FWB) implements a working in-form guardian
consent flow. The shapes observed:

| Shape | Where | What a guardian actually faces |
| --- | --- | --- |
| Promised but absent | **Elite NA** ("Please provide info below" — no fields exist at any DOB) | The form's own instructions dead-end |
| Advisory text only | **CURV** (one sentence; minor vs adult DOB produce byte-identical forms) | Honor system |
| Nothing at all | **JAG**, **Bicoastal**, **FWB** (DOB collected, no age logic, no guardian anything) | No signal the topic exists |
| Policy/form contradiction — blocking | **ONE** (policy welcomes 14–17 with consent; form hard-blocks age <16), **Wilhelmina** (guardian note displayed; DOB `max="2008-01-01"` natively blocks all minors) | The published policy is unusable as written |
| Out-of-band email routing, inconsistent | **State** (three different kids/guardian addresses across two channels and the privacy policy), **Ford** (policy requires guardian registration for 13–17; no mechanism on either form) | Which address/process applies is guesswork |

The only genuinely implemented conditional guardian flow found anywhere was Elite Model
Look's contest form — a different legal entity, reportedly excluding the USA. **Product
consequence:** Pholio's briefs must state exactly what a guardian must do out-of-band per
agency, and the strategic thesis that almost nobody serves 14–17 safely is now confirmed at
the intake layer with primary evidence.

### 1.2 Internal folklore failed primary-evidence verification at a remarkable rate

Claims carried in from prior internal research that this rebuild **falsified or materially
corrected** against the live DOM:

1. JAG "women of all sizes" positioning — phrase appears nowhere; form open to all genders.
2. ONE "two required 30-second video uploads" — optional YouTube-link text fields; duration
   guidance contradicts itself across Elite's… ONE's own pages (30s vs 15–40s).
3. Ford "applies through Snapcast" — canonical form is selectroom.app; Snapcast is
   Paris-only. Ford "JPEG-only ≤600KB + ≤25MB video" — PNG accepted, no caps, no video.
4. Elite "published stat floors 5'8"–6'0"" — no floors published anywhere; "silently
   rejects HEIC" — HEIC is picker-filtered but not blocked or warned (worse: the failure
   mode is invisible); "15-day guardian window" — unfindable on any live first-party page.
5. Q "Thursday 10–11am open call" — traces only to a third-party directory with wrong
   addresses; Q's own last word (2019) said calls were on hold.
6. Wilhelmina "female, male, curve, fitness, and non-binary talent ages 16 and up" — not
   published anywhere on the live site; form is binary WOMEN/MEN and blocks under-18.
7. State "site links to its Snapcast form" — no link exists anywhere; the channels are
   parallel and unconnected.

**Consequence:** every agency had at least one confident internal claim that was wrong.
The rebuild posture — primary evidence only, folklore labeled and tested — is not a
nicety; it is the difference between Pholio being right and Pholio being confidently wrong
at scale. Marketing copy, search snippets, and third-party directories must never enter
the registry unverified.

### 1.3 Published-vs-enforced divergence is the norm, in both directions

- Published stricter than enforced: Q ("JPG only, ≤3MB" — DOM accepts png/gif, no size
  check), CURV (asterisk-required fields with no HTML enforcement), Elite (HEIC).
- Enforced stricter than published: ONE (form blocks <16 against a 14+ policy), Wilhelmina
  (DOB max blocks minors the page text addresses).
- Enforced without being published: Wilhelmina's 2008-01-01 cutoff; Ford's selectroom DOB
  year list; every numeric min/max on ONE's measurement fields.

The registry model's published/enforced split (MODEL.md §2.4, §2.6) exists because of
this; a single "requirement" field cannot be truthful.

### 1.4 Platform clusters are real, and template rot travels with them

Confirmed clusters: **cDs** (Muse, CURV, Q — shared "Powered by" branding, shared
un-replaced "Agency Name" privacy-policy placeholder at two of three), **Mainboard/
Portfoliopad** (State-native, Bicoastal — near-identical §6.3/§6.4 policy text, same
6-month retention clause), **Snapcast** (State-alternate, Ford-Paris, TRUE-mirror),
**selectroom.app** (Ford-canonical), WordPress+Gravity (JAG), Google Forms (FWB). The
per-platform verification thesis is validated: one checker per platform covers most of the
set, and template defects (placeholders, typos, misdirected template links) are
platform-correlated quality signals.

### 1.5 The verified-official-link feature has a proven, concrete case

Observed live in one research day: CURV's own Contact page sends applicants to **JAG's**
submission form (template leftover); Muse's name collides with an unrelated UK agency that
surfaces in searches for Muse's own submission email; Elite's brand splits across a
separate contest entity, a stale 2020 stub domain, and a parked for-sale domain; CURV
operates three near-identical domains; MSA's and Red's official domains are dead IIS
placeholder pages. A talent navigating by name and search is at genuine risk of applying
to the wrong entity through an agency's *own* published surfaces.

### 1.6 Silence is the published norm; timelines are almost nonexistent

Explicit "we can't respond to everyone" language: Muse, ONE, Bicoastal. The only published
response timeline in the set: ONE ("one or two weeks" if interested, plus "do not email or
call"). No agency publishes re-application guidance. This confirms the auto-lapse/"silence
is legible" product thesis with primary evidence — Pholio can honestly tell talent what to
expect at exactly one agency; everywhere else the honest brief is "the agency doesn't say."

### 1.7 File-technical reality is more varied — and more often absent — than assumed

- Caps observed: 600KB/photo (ONE, published+accept-scoped), 3MB/photo DOM-enforced
  (Snapcast channels), 3MB published-unenforced (Q), 64MB platform default (JAG), and
  **no cap at all** on Elite, CURV, Bicoastal, Wilhelmina, Ford-canonical, State-native.
  The folklore of universal tight caps is wrong; the real trap is *unknown server-side
  limits* behind capless clients.
- HEIC (iPhone default): explicitly accepted (State-native, Bicoastal, Wilhelmina),
  filtered-but-not-blocked (Elite), excluded (Snapcast channels, ONE's jpeg/png list).
  Preflight guidance must be per-channel; "convert to JPG" is the only universally safe
  advice.
- Units: imperial-only (CURV), unspecified entirely (Elite, Wilhelmina — bare number
  inputs), dual-unit single options (Snapcast, Bicoastal), applicant-selectable system
  (ONE), free text (JAG). Zero agencies publish image dimensions/aspect requirements.

### 1.8 Divisions are marketing; forms are funnels

Seven of ten agencies market named divisions (Curve boards at ONE/Q/Wilhelmina/Muse;
fit/parts taxonomies at Bicoastal; boards at Ford/State) — and **none** of their forms let
an applicant select a division. Curve applicants in particular have no dedicated intake
anywhere in the set (Muse, Wilhelmina, ONE, Q all route curve hopefuls through generic
forms with no signal). Internal routing happens after submission, invisibly. Talent-facing
consequence: Pholio should not promise division targeting that no form supports.

### 1.9 The event side (FWB) is thinner and more fragile than the agency side

Six-field standing forms (the Brooklyn form collects **no email address**), a broken
Italy registration link, stale sibling forms with past dates, marketing-copy editions with
no backing infrastructure, and co-brand proliferation (Digital Fashion Week, Slayway/CTC,
World Fashion Week) since the 08-15 internal record. The event-mode product has both more
room and more responsibility to add structure than previously assumed.

## 2. Uncertainties ranked by how badly they could surprise a talent

1. **Server-side validation, everywhere.** Nothing past the submit click was observed
   (hard no-submission rule). Unknown: real file-size/type enforcement on capless forms,
   whether Q's published 3MB is enforced at upload, what Elite does with a HEIC file,
   whether honeypots/reCAPTCHA reject legitimate edge cases. This is the permanent,
   structural uncertainty class of a never-submit methodology — mitigable post-launch via
   user-reported outcomes ("exports to X started bouncing").
2. **Post-submit experience at every agency** (confirmation screens/emails) — only ONE
   documents its confirmation email.
3. **How a minor actually applies** at Elite, Ford, Wilhelmina, State (see §1.1) — the
   published processes are unusable, contradictory, or absent.
4. **Muse's open-call address and walk-in rules** — day/time verified first-party twice;
   location and what-to-bring published nowhere.
5. **Wilhelmina's disabled-submit cause chain** — reCAPTCHA v2 gates the final state;
   whether a fully-valid submission enables it could not be confirmed without solving the
   CAPTCHA (prohibited).
6. **Ford Paris/Snapcast channel's file constraints** — accept string not captured before
   the interruption; needs one follow-up fetch.
7. **Whether Wilhelmina's `max="2008-01-01"` is static** (evidence leans static —
   round date) — if static, the effective age floor silently rises over time.
8. **FWB's canonical "Brooklyn form"** — the standing 6-field form vs the 7-field casting
   form; and whether the missing email field is intentional.
9. **Elite's guardian path** — inference is "email becomeelite@", published nowhere.
10. **NYDOL certificate semantics** — certificates read "Registered"; the registry
    snapshot says "Active"; Pholio should display the certificate's own word.

## 3. Contradiction register (the load-bearing ones)

Full detail lives in each agency file's §10; the ones that must surface in any launch UI:

- **ONE:** age 14–17-with-consent (policy) vs `min="16"` hard block (form) vs "no age
  requirement" (FAQ). Three first-party sources, three answers.
- **Wilhelmina:** guardian-authorization note vs native DOB block of all minors; also
  About-page division list vs the site's own live Curve roster.
- **Elite NA:** "18 or written parental consent" (banner) vs "typically… 15 and up"
  (inline); promised guardian fields vs empty DOM; "female identified persons" vs no
  published path for anyone else in NY/LA.
- **State:** 18-independent (own policy) vs 13+ (Snapcast ToS) vs 13–17-guardian-band
  (Snapcast privacy); three kids addresses; HEIC yes/no by channel; cap/no-cap by channel.
- **CURV:** "visit our Submissions page" → link goes to JAG Models.
- **Q:** JPG-only/3MB prose vs `.jpg,.jpeg,.png,.gif`/no-cap DOM; third-party open-call
  claim vs first-party on-hold statement.
- **Ford:** guardian-registration policy vs zero guardian mechanism; "Barcelona" (site)
  vs "Spain" (form); folklore caps vs capless canonical form.
- **Bicoastal:** "can't answer every submission" vs policy's decision-time retention
  notification; "all ages and types" vs no age infrastructure; Male stat-fields template
  bug.
- **Muse:** "models of all sizes" vs 5'9"/5'11" preferences in the same paragraph;
  Suite 300 vs third-party Suite 1101.
- **FWB (site-internal):** homepage editions marquee vs functional registration pages;
  internal record's 7-field form vs live 6-field form.

## 4. Open questions for the owner

1. **Heroes vs Ford** (SELECTION.md §2): persona purity vs applicant volume — the set
   ships either way; this is a judgment call worth 5 minutes.
2. **Contradiction presentation and legal comfort:** the register above is verifiable,
   evidence-backed fact, but publishing "Agency X's form contradicts its own policy" has
   relationship and legal texture — counsel should bless the presentation pattern
   (proposed: neutral wording + verbatim quotes + checked-on dates, severity-gated per
   MODEL.md §5.3).
3. **Agencies whose forms exclude part of the persona:** Elite NA (female-identified
   only), Wilhelmina (18+ enforced) — display the exclusion prominently, or demote the
   entries? Proposal: display prominently; exclusion facts are exactly the surprises the
   product exists to surface.
4. **Minors phase-2:** §1.1 is the strongest evidence yet for the strategic bet that a
   compliant 14–17 flow is an unserved differentiator — but it also means Pholio's 18+
   launch gate must be airtight, because no agency in the set will catch an underage
   applicant Pholio lets through to an export.
5. **FWB relationship items:** the broken Italy link, the email-less Brooklyn form, and
   the stale sibling forms are findings FWB itself would want; sharing them is both good
   partnership and good product (but that outreach is the owner's call, not this doc's).
6. **The four MODEL.md §5 modeling questions** (series identity, provider-level sharing,
   contradiction gating, event entities).
