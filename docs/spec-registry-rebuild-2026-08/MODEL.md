# Spec Registry Rebuild — Proposed Data Model

**Date:** 2026-08-19. Status: proposal for owner review; nothing here is implemented.
**Derivation:** built from first principles against the primary evidence gathered in this
rebuild (ten agencies + FWB, live form DOM inspection), with the v1 schema treated as prior
art to map against — never as the starting point.

## 1. What the model must achieve

The product goal, restated as a data requirement: when a talent opens an agency in Market,
Pholio must be able to tell them **everything they need to know to submit correctly** —
clearly enough that the agency's actual application holds no surprises, including the
package they download for an off-Pholio submission. The pipeline is:

> agency's real application → **complete evidence model** → **clean normalized Spec
> Registry** → **clear talent-facing brief**

Three layers, strictly separated. The old dataset's non-factual failures — duplicated or
near-duplicated requirements, bad canonical labels/capitalization, raw research language
leaking into the frontend, awkward representations of what agencies actually ask — were all
failures of layer separation: research prose was doing presentation work, and normalization
was happening at capture time. The proposed model makes each layer's job explicit:

| Layer | Job | Owner of its text |
| --- | --- | --- |
| **Evidence** | Capture reality verbatim, with provenance. Never summarized, never prettified. | The source (quoted) |
| **Normalized registry** | One canonical record per real-world requirement, machine-usable, deduplicated, style-consistent. | Curated vocabulary |
| **Talent brief / presentation** | Human-authored plain language per entry. Never auto-derived from research notes. | An editor (human or reviewed generation), per style guide |

Rules that fall out of this and are non-negotiable in the rebuild:

1. **Verbatim survives forever.** Every normalized record points at verbatim evidence; the
   frontend may show canonical labels but the verbatim is always one hop away.
2. **Normalization is where dedup happens.** Multiple sources restating one requirement
   (page prose + DOM attribute + FAQ) become one normalized record with multiple evidence
   references — not three records. (v1's near-duplicate problem came from capturing each
   restatement as its own assertion.)
3. **Canonical labels are a curated vocabulary with a style guide** (casing, terminology,
   "Close-up" not "close up (hair pulled back)!") — source labels are data, not UI.
4. **Research language never reaches the frontend.** `sourceLabel`, reviewer notes, and
   uncertainty reasons feed the brief-writing process; the brief itself is authored text
   with its own review state. Unknowns surface as honest talent-facing phrasing ("the
   agency doesn't say"), authored once per fact class, not improvised per entry.

## 2. The model, entity by entity

### 2.1 Organization

The legal/brand entity. Fields: legal name; brand name(s); registry credentials (NY DOL
cert number, issue/expiry, the certificate's own status word — Elite's PDF says
"Registered", not "Active"; store the source's word); official domains **including alias
and confusable domains with disposition** (CURV's three-domain set; Muse vs the unrelated
musetheagency.com; Elite's parked/stale domains); published anti-impersonation statements
verbatim (JAG's "@jagmodels.com" rule, ONE's verified-handles list); sister-brand routing
(CURV→Villains for men); offices/markets.

*Why first-principles:* impersonation defense and domain confusion are live, observed
talent hazards in this evidence set — they are registry data, not marketing copy.

### 2.2 Channel — first-class, multiple per organization

The single biggest structural lesson of this research: **an agency is not a form.** State
runs two parallel, unlinked channels with different formats, caps, and legal regimes.
Elite runs a form and an email. Muse is email-only plus a walk-in call. Ford fronts a
provider form. CURV's site contains a broken link to a different agency's channel.

Channel fields:
- `kind`: `native_web_form` | `provider_web_form` | `email` | `open_call_in_person` |
  `external_contest` | `event_form` (FWB's Google Forms) | `department_email`
- `address`: URL **or email address** (v1 structurally could not store Muse's
  scouting@musenyc.com — the single most operationally important fact of an email route)
- `provider` + `platform_cluster`: Snapcast (State-alternate, Ford-Paris), selectroom.app
  (Ford-canonical), cDs (Muse/CURV/Q), Mainboard/Portfoliopad (State-native/Bicoastal),
  Google Forms (FWB), WordPress+Gravity (JAG). Clusters drive
  per-platform re-verification (evidenced twice in this set by near-identical template
  text across unrelated agencies).
- `account_required`: Snapcast embeds password creation in the application; Elite Model
  Look requires signup. v1 had no concept for this.
- `anti_bot`: reCAPTCHA v2 checkbox / v3 invisible / none observed — Ford, State (both
  channels), Elite (v2), Bicoastal (v3), CURV (present) all differ; determines what
  assistance Pholio can honestly offer.
- `legal_regime`: whose terms govern at the point of application — the agency's or the
  provider's. On State's Snapcast channel the applicant accepts *Snapcast's* terms,
  including a perpetual, irrevocable, worldwide likeness license materially broader than
  State's own policy. This is per-channel, not per-agency, and it is talent-facing.
- `status`: `live` | `broken` | `misdirected` | `signin_walled` | `stale` — FWB's Italy
  form (sign-in wall), CURV's Contact-page link to JAG (misdirected), rednyc.com (dead).
  A registry that can't say "this official link is broken" can't protect talent from it.
- `canonicality`: which channel a NYC applicant should use, with the basis for that call.
- For `open_call_in_person`: schedule verbatim + address + what-to-bring, each with its
  own verification level — Muse's call has first-party day/time but **no published
  address**; Q's rumored call failed verification entirely. Open-call facts get
  first-class uncertainty, never inherited confidence.

### 2.3 Spec revision (per channel × applicant scope)

Keeps v1's strongest ideas: immutable revisions, series identity, `observedOn`/review
lifecycle, unknowns-as-data, evidence references on every claim. Changes:

- **Review status per section, not only per revision.** v1's single status forced IMG's
  hash-verified adult path to carry "provisional" because the minor path was gated. Each
  major section (fields / uploads / eligibility / minors / process) carries its own
  confidence; the revision-level status becomes a roll-up.
- **Claim labels** follow this rebuild's set: FACT / PREFERENCE / OBSERVED / INFERENCE /
  UNCERTAIN / CONTRADICTION (v1's modality vocabulary maps into FACT/PREFERENCE nuances;
  CONTRADICTION becomes a record type, not just an unknown-reason).

### 2.4 Form fields

Per field: verbatim label (including the agency's own typos — Elite's "Adress", CURV's
"Instragram" are real UI a talent will see); control type; **requiredness with an
evidence-typed basis**: `native_required_attr` | `aria_required` | `asterisk_marker` |
`published_prose` | `enforced_validation_observed` | `none_found` (→ "present,
requiredness unknown"). Eight agencies used at least four different requiredness signals;
JAG uses aria+span, Elite uses only asterisks, ONE uses native attrs, CURV uses only
placeholder text. Also per field:

- validation attributes verbatim (`pattern`, `min`/`max`/`step`, `maxlength`) **plus
  observed enforcement** — ONE's `age min=16` actively blocks; Q's published "3MB" has no
  client enforcement at all. Published rule and enforced rule are separate facts that can
  contradict (and did, twice).
- **conditional visibility** as structured rules: trigger field + value → shown/hidden
  set (ONE's gender/unitType swaps; Snapcast's four-gender field matrix; contrast with
  "should-be-conditional-but-isn't": Elite's promised guardian fields, CURV's inert
  birthday). v1 could express static `appliesWhen` conditions but not UI-conditional
  behavior — both are needed, and they are different things.
- **default state**: Bicoastal pre-selects Female; Snapcast pre-checks FEMALE. A default
  the talent doesn't notice becomes wrong submitted data — talent-facing fact.
- **units**: imperial/metric/both-in-one-option/unspecified. Elite's bare number inputs
  with no units anywhere are a top surprise; Snapcast's combined `5'8" / 173cm` options
  and Bicoastal's four-system dress sizes need faithful representation.
- option lists verbatim + canonical mapping (gender vocabularies differ per agency —
  "Gender Fluid" (FWB), "Male (transgender)" (ONE), SHE/THEY/HE (Heroes) — preserve
  exactly; never collapse into one Pholio gender taxonomy at the evidence layer).
- honeypot/anti-spam fields flagged as such (JAG's fake "LinkedIn" field; ONE's hidden
  `dead` field) so tooling and talent both ignore them.

### 2.5 Media requirements

- **Photo slots**: verbatim slot label + canonical shot taxonomy + explicit
  slot↔instruction mapping status (JAG never states which upload is "Full length" —
  the mapping itself can be unknown).
- **File constraints per channel** with a `basis` that distinguishes: published prose /
  DOM-enforced (`data-rule-filesize=3145728`) / **platform default** (JAG's 64MB) /
  absent. The talent brief renders these differently ("State's Snapcast form rejects
  files over 3MB" vs "the platform accepts up to 64MB — not a creative ask").
- `accept` strings verbatim + derived format list + the HEIC story as structured data:
  `heic_accepted` (State native: explicitly yes) / `heic_filtered_not_blocked` (Elite:
  absent from accept, no client validation — server behavior unknown) / `heic_rejected`
  (Snapcast channels: not in accept list). This precision is the difference between
  Pholio's preflight being right and folklore.
- **Video as first-class**, with `mechanism`: `file_upload` | `external_link_field` |
  `email_attachment` | `none`. ONE's videos are optional YouTube-link text inputs with
  contradictory duration guidance (30s form vs 15–40s FAQ) — the model must hold
  mechanism, optionality, duration guidance (plural, contradictory), and fallback
  instructions ("email the link") without flattening.
- **Example-image-only guidance**: Bicoastal publishes zero written photo instructions —
  only reference photos. The model records that guidance exists, its medium is visual,
  plus a labeled OBSERVED description; a brief generated from text fields alone would
  wrongly say "no guidance".
- Dimensions/aspect/orientation: still zero instances observed across all researched
  routes, but the field belongs in the model (the export feature needs it the day one
  agency publishes one; the v1 audit and export brief both flagged its absence).

### 2.6 Eligibility

Each rule: verbatim text, scope exactly as published (gender/track/market), modality
(requirement vs preference — Muse's "we prefer 5'9"+" beside "models of all sizes" is a
preference plus an unresolved tension, recorded as both), **and the published-vs-enforced
split**: ONE's FAQ says "no age requirement" while the form enforces min=16; the form's
numeric bounds (heights 5'0"–6'11", CURV's dress sizes to 26) are *data-entry bounds*,
recorded separately from *published floors* and never promoted into them.

### 2.7 Minors & guardians — a dedicated sub-model

The single most consequential finding class in this research. Fields:

- published policy verbatim (per source — policies conflict across pages: State 18 /
  Snapcast 13 / Snapcast-privacy 13–17 band; ONE 13-and-under vs 14–18 vs FAQ "none").
- **implementation enum** for what the channel actually does: `hard_block` (ONE's
  min=16) | `conditional_guardian_fields` (Elite Model Look's parent block — the only
  genuine implementation found) | `advisory_text_only` (CURV) | `separate_email_channel`
  (State's kids routes ×3) | `nothing` (JAG, Bicoastal, FWB) | `promised_but_absent`
  (Elite NA's "Please provide info below" with no fields — verified by DOB testing).
- guardian contact routes with their inconsistencies preserved (State's scouting@ vs
  kids@ vs repmykid@).
- This sub-model exists because "policy requires a guardian process, the form implements
  none" occurred in **at least four of eight** fully-researched agencies — it is the
  systemic condition of the industry's intake, and Pholio's brief must say exactly what a
  guardian must do out-of-band.

### 2.8 Consent, legal, process

- Point-of-application consent texts verbatim; which entity's documents are linked;
  notable grants extracted (Snapcast's perpetual license; Elite Model Look's worldwide
  media grant); retention windows as structured durations (State/Bicoastal 6-month
  unsuccessful-application retention; Storm's 30-working-day language in prior art) —
  v1 had nowhere to put any time-bound fact and silently dropped them.
- Anti-scam/no-fee statements verbatim (ONE, Elite, DNA, JAG, Bicoastal's "no upfront
  fees") — feed both the brief and the verification layer; v1 had no category for them.
- Process facts: response policy verbatim (Muse's "not able to respond to every
  submission"; ONE's "1–2 weeks if interested / don't call"; Bicoastal's "can't answer
  every submission" **in tension with** its policy's decision-time notification clause —
  a recorded contradiction), deadlines/windows (Slayway's Aug 28 deadline; FWB's Aug 26
  casting), re-application guidance (none published anywhere in this set — itself a
  registry-level fact worth surfacing).

### 2.9 Contradiction records — first-class

Two or more evidence references, both sides verbatim, a severity rank (how badly it can
surprise a talent), and a talent-facing consequence sentence. This research produced
contradictions in **every single fully-researched agency**; they are the highest-value
content in the registry and the model must stop treating them as footnotes inside
unknowns. The presentation layer renders them as cautions, never resolves them.

### 2.10 Verification & drift

Keep v1's `nextReviewOn` discipline and evidence hashing; add: per-platform-cluster
checkers as the re-verification unit (two clusters already confirmed); channel `status`
probes (a broken link is drift of the most urgent kind); and user-reported-drift flags
per the strategy doc. Every talent-facing brief carries its "checked on DATE" stamp
derived from the weakest-recently-verified section it depends on.

## 3. Mapping to the current v1 schema

### 3.1 What v1 already represents well (retain the concepts)

| v1 concept | Verdict |
| --- | --- |
| Immutable revisions + manifest + series identity | Keep as-is |
| Shot slots with compound `match` expressions | Keep; feed from the new media model |
| File constraints (per-file/package scope, byte normalization) | Keep; add `basis` (published/DOM/platform-default) |
| `appliesWhen` static conditions (age/gender/track) | Keep; distinct from new UI-conditional visibility |
| Unknowns-as-data with reason enum | Keep — v1's best idea; extend reasons with `contradiction_record_ref` |
| Evidence records + content hashes (JS-bundle hashing) | Keep; extend to DOM dumps and screenshots |
| Modality vs evaluationMode separation; advisory-only default | Keep unchanged — the legal posture depends on it |
| Conservative normalization rules (preserve source labels, don't infer MIME, exact scoping) | Keep as written |

### 3.2 Where reality does not fit v1 (every gap, with the evidence that proves it)

1. **Multiple channels per agency** — v1: one `scope.channel` per series. Reality: State's
   two unlinked forms; Elite form+email; Muse email+walk-in; Bicoastal form+department
   emails. Modeling each as a separate series loses the "these are the same agency,
   pick one" relationship a talent needs.
2. **Email channels can't store the email address** — `channel.url` pattern requires
   `https://`. Muse's scouting@musenyc.com appears nowhere in the v1 spec.
3. **Per-channel legal regime** — no concept. Snapcast's terms (perpetual likeness
   license) vs State's own policy is a material talent-facing difference.
4. **Account creation requirement** — no concept (Snapcast embeds password creation).
5. **CAPTCHA/anti-bot** — no concept (present on 6+ of the researched channels).
6. **Channel liveness/misdirection** — no concept (FWB Italy sign-in wall; CURV→JAG
   misdirected link; dead agency sites).
7. **Video** — no shot-taxonomy or constraint concept at all; and reality's dominant
   video mechanism here is an *external-link text field*, not an upload.
8. **Requiredness evidence type** — v1 has presence enums but can't say *why* something
   is required (native attr vs asterisk vs prose), which drives how much to trust it.
9. **Published-vs-enforced split** — no way to record that Q publishes "JPG ≤3MB" while
   the DOM accepts `.png/.gif` with no size check, or that ONE's form blocks age <16
   against its own policy. This split produced the two highest-severity findings.
10. **UI-conditional field visibility** — `appliesWhen` covers applicant facts, not
    "selecting Male hides bust and shows chest" (Snapcast/ONE), nor "promised
    conditional block absent" (Elite NA).
11. **Field default states** — no concept (Bicoastal/Snapcast pre-selected Female).
12. **Per-field validation metadata** — no `pattern`/length representation (ONE's name
    regex rejecting digits; maxlengths throughout).
13. **Time-bound facts** — no deadlines, retention windows, approval windows, event
    dates (Slayway deadline, State/Bicoastal 6-month retention, FWB casting date).
14. **Fee/anti-scam statements** — no category, though five agencies publish them and
    they anchor Pholio's trust posture.
15. **Minors implementation reality** — v1 has guardian *fields* but no way to say "the
    policy requires X and the form implements nothing" — the modal industry condition.
16. **Contradictions as records** — v1 can mark an unknown `conflicting` but can't hold
    both sides, severity, and consequence (needed in 8/8 agencies).
17. **Per-section review status** — single revision status conflates verified and
    unverifiable parts (IMG precedent; now also State's two channels).
18. **Example-image-only guidance** — no medium concept; Bicoastal's only styling
    guidance is visual.
19. **Platform clusters** — no provider identity on channels, so per-platform
    re-verification can't be expressed.
20. **Open-call schedule facts** — no representation for day/time/address with per-fact
    verification (Muse: time verified, address unpublished).
21. **Sister-brand routing** — no concept (CURV routes men off-site to Villains).
22. **Honeypot fields** — no way to mark a control as not-a-real-field (JAG, ONE).
23. **Units-unspecified as a hazard** — v1 can note unknown units but has no
    talent-facing hazard rank; Elite's unitless measurement block is a top surprise.
24. **Image dimensions/aspect/orientation** — still no fields (confirmed gap from the
    audit and the export brief; zero live instances yet, but structurally required).

### 3.3 Taxonomy gaps confirmed against this evidence set

Gender vocabularies (per-agency, non-collapsible), hair/eye color lists (CURV's and
ONE's differ; typos are live data), clothing categories beyond v1's six values, shot
purposes beyond `personality`, no tattoo/piercing visibility field, no studio-light
values, kids shoe sizing (Bicoastal's "(kids)" size tail), dress-size range values
("0-2"), and honeypot/anti-spam as a control class.

## 4. What the rebuild explicitly does differently because of the old failures

| Old failure | Structural fix |
| --- | --- |
| Duplicated/near-duplicated requirements | Dedup at the normalization layer: one requirement, many evidence refs. Validator rejects two normalized records with identical (channel, subject, constraint). |
| Bad canonical labels/capitalization | Curated label vocabulary with style guide; source labels are evidence, never UI. Typos preserved in evidence, corrected in canon, both visible. |
| Research language leaking into frontend | Presentation strings are authored artifacts with their own review state; nothing renders `sourceLabel`, reviewer notes, or uncertainty reasons directly. |
| Awkward representation of real asks | The §3.2 gap list is the fix: model what exists (external-link videos, two channels, visual-only guidance) instead of forcing the closest field. |
| Silent dropping of unfittable facts | Rule: if a lane's evidence has no home in the model, the model grows — tracked as an explicit model-change log per revision. |

## 5. Open modeling questions for the owner

1. **Series identity with multi-channel agencies:** one spec revision spanning all
   channels of an org+scope (with per-channel sections), or one series per channel with
   an org-level "channel map"? This proposal assumes the former (talent thinks in
   agencies, not channels); the v1 publisher assumes the latter.
2. **How much provider-level fact sharing:** Snapcast's terms/caps are identical across
   Ford/State/TRUE — store once per platform with per-agency overrides, or denormalize
   per agency? Proposal: platform-level records referenced by channels (keeps the
   re-verification unit honest).
3. **Contradiction presentation:** always surfaced to talent, or severity-gated?
   Proposal: HIGH always; MEDIUM in the detailed view; LOW internal-only.
4. **Event entities (FWB):** same model with `event_form` channels and a "casting, not
   representation" flag (this proposal), or a separate event schema? The evidence says
   the same model fits with ~3 extra fields (edition, season dates, casting events).
