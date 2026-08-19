# Spec Registry Rebuild — Launch Selection

**Date:** 2026-08-19
**Decision:** the 10 off-Pholio agencies Pholio should launch with, alongside Fashion Week
Brooklyn (fixed). Selection was made from first principles against a 32-candidate researched
pool (see §4 for the pool and per-rejection reasoning). All liveness/registry facts below were
verified 2026-08-19 against live sites and the in-repo NY DOL registry snapshot (2026-08-15).

## 1. Selection principles (first principles, in priority order)

1. **Serve the launch talent.** The launch cohort is FWB-adjacent: aspiring/new-face models in
   NYC, disproportionately diverse and non-traditional (FWB's editions include an LGBTQIA+
   showcase), many closer to commercial/curve/fit work than to high-fashion stat floors, plus
   the majors every aspirant applies to regardless. An agency earns a slot by being somewhere
   this cohort genuinely applies *and* can genuinely be considered.
2. **Cover the real shapes of applying.** The registry's model must be built against reality's
   full variety on day one — proprietary web forms, third-party provider forms (Snapcast),
   email-only submissions, walk-in open calls, video-required intakes, guardian-consent
   language, tight and generous file caps. A selection that is 10 similar web forms would
   under-fit the model and over-fit the product.
3. **Be verifiable and stay verifiable.** Public, inspectable application channels; live,
   NY DOL-registered entities where NY jurisdiction applies; hosts whose posture permits
   respectful re-verification. (Trust is a launch feature: every entry can carry a registry
   cert and a "checked on date" stamp.)
4. **Brand pull where it serves talent.** A small number of majors belong because talent
   arrives with them in mind — the traps in their applications (tight caps, silently rejected
   formats) are exactly where preparation tooling earns trust. They are reference entries:
   Pholio prepares you; you submit on their site.

## 2. The launch set — 10 agencies + FWB

| # | Entry | Role in the set | Core justification |
| --- | --- | --- | --- |
| — | **Fashion Week Brooklyn** | Fixed launch partner (event casting, not representation) | Verified 2026-08-19: registration is still four Google Forms (Brooklyn/Japan/London live; Italy's link broken) plus a fifth form for an in-person casting Aug 26, 2026. Season 2 Oct 4–10 confirmed. Detail in `fashion-week-brooklyn.md`. |
| 1 | **Muse Management NYC** | Best persona match; email-channel + walk-in archetype | Curve + commercial boards; a standing weekly walk-in open call; NYDOL cert 26-67AN4-LSFW. Email-only submission stress-tests the exact package-export product Pholio is building. Known confusability with the unrelated "musetheagency.com" makes a verified official-channel entry concretely valuable. |
| 2 | **Wilhelmina** | Accessible major | The one global name whose own copy explicitly welcomes the launch persona ("female, male, curve, fitness, and non-binary talent… no professional experience required"), 16+. NYDOL cert 26-69UG6-LSFW (late registrant — a talent-relevant trust fact in itself). Market-selector form stress-tests multi-market routing. |
| 3 | **Elite Model Management (NA)** | Flagship reference major | The brand every aspirant knows; narrow published stat floors and reportedly strict file handling (HEIC rejection folklore) make it the highest-surprise-density application in the set — exactly where "no surprises" tooling earns trust. NYDOL cert 26-69YIX-LSFW. Multiple Elite routes (NA vs global vs regional) are themselves a finding to model. |
| 4 | **Ford Models** | Reference major; provider-form archetype A | Second-most-recognized brand in the pool; applies through a Snapcast-hosted flow with a heavy measurement block and anti-bot layer — a dense test of provider forms, measurement fields, and per-city routing. NYDOL cert 26-69V5K-LSFW (also late — post-deadline registration). |
| 5 | **State Management** | Commercial/fit/kids breadth; provider-form archetype B | Explicitly commercial/e-commerce/fit segments serve the non-runway majority of the cohort; second Snapcast entry enables the per-platform (rather than per-agency) verification thesis to be tested against two instances of one provider. NYDOL cert 26-66CVV-LSFW. Separate kids email channel is a minors-routing data point. |
| 6 | **Q Management** | Curve division; clean modern form | Explicit Curve board; a fully public, inspectable JPG-only ≤3MB spec — a crisp mid-tier difficulty case for preflight/export. NYDOL cert 26-6771P-LSFW. |
| 7 | **ONE Management** | Curve division; video-in-the-flow intake | Explicit Curve division plus the set's hardest technical spec: 600KB-per-file photo caps and a two-video ask (walking + personality) — deep research showed the videos are optional YouTube-link text fields rather than required uploads, which stress-tests the model differently but just as hard (external-link media, optionality contradictions, and a live age-validation contradiction). NYDOL cert 26-69U8B-LSFW. |
| 8 | **JAG Models** | Inclusive positioning; generous-cap contrast | Published inclusive positioning "removing barriers around size, weight, gender, and race" (deep research corrected an earlier internal premise of "women of all sizes" — that phrase appears nowhere on the site, and the form is open to all genders); the most generous per-file cap found (64MB — adjudicated as a platform default, not a creative spec) anchors the easy end of the spec spectrum; its published "All JAG employees use valid email addresses that end in @jagmodels.com" notice feeds the verification layer. NYDOL cert 26-66BCS-LSFW. |
| 9 | **CURV Management** | Curve-exclusive specialist; guardian-language case | The purest persona match found anywhere in the pool — curve-exclusive by identity, not as a side board ("removing barriers around size, age, gender, and race"). Freshly NYDOL-registered (cert 26-69SRC-LSFW, issued 2026-08-07). Published under-18 parental-consent language makes it a primary guardian-handling case study. |
| 10 | **Bicoastal Management** | Fit/plus/commercial with mass-market proof | Explicit Plus and Fit divisions with a mass-market client roster (Gap, Macy's, Madewell) — evidence of real work for the commercial persona, not aspirational placement. Department-specific email channels alongside a web form stress-test multi-channel routing. NYDOL cert 26-675G6-LSFW. |

**Channel-shape coverage achieved:** proprietary web forms (Elite, Wilhelmina, Q, ONE, JAG,
CURV, Bicoastal) · third-party provider forms ×2, same provider (Ford, State via Snapcast) ·
email-only (Muse; Bicoastal department emails as secondary) · walk-in open call (Muse) ·
video-required (ONE) · guardian/minor language (CURV, Wilhelmina 16+, State kids channel) ·
event casting via Google Forms (FWB). Every published file-cap regime from ~600KB to 64MB is
represented.

**First alternate:** **Heroes Model Management** (NYDOL 26-66LAQ-LSFW) — the most explicitly
non-binary-inclusive intake found (SHE/THEY/HE), with a 4-photo + 2-video spec. It lost the
last slot to Ford on applicant-volume grounds (a major serves more of the cohort's actual
application lists) and because ONE already carries the video-requirement archetype. If the
owner prefers persona purity over brand coverage, swap Heroes in for Ford — the model is
stress-tested either way; the tradeoff is volume-of-talent-served vs. inclusivity signal.

## 3. Current-dataset agencies: kept vs dropped

The v1 dataset covered ten routes. Disposition, with reasons:

| v1 entry | Disposition | Reason |
| --- | --- | --- |
| Muse Model Management NYC (email) | **Kept** (re-researched from scratch) | Best persona fit in the whole pool; see §2. |
| Wilhelmina (selected-market online) | **Kept** (re-researched from scratch) | Accessible major; see §2. |
| Elite Models NA (online) | **Kept** (re-researched from scratch) | Flagship reference; see §2. |
| Ford Models (selected-city online) | **Kept** (re-researched from scratch) | Reference major + Snapcast archetype; see §2. Audit found the v1 spec omitted the form's entire measurement block — an argument for rebuild, not for dropping the agency. |
| Elite Model Management global (online) | **Dropped as a separate launch route** | Route proliferation without launch value: the NA route is what a NYC aspirant uses. The Elite lane documents the route landscape so the global form's facts (e.g., guardian-approval-window language) are preserved as evidence, and it can ship later as a distinct route if the owner wants global coverage. |
| Elite Japan Tokyo (online) | **Dropped** | Geographically and culturally irrelevant to the launch cohort (Tokyo office, 173cm/183cm floors). Verified live and legitimate — a fine future entry for a Tokyo market, not for this launch. |
| Models 1 UK (online) | **Dropped** | London agency with no NYC presence. Live, legitimate, accessible spec — but a Brooklyn launch dataset should spend its ten slots on agencies the cohort can realistically sign with. Future London-market entry. |
| Storm Management UK (online) | **Dropped** | Same geography argument as Models 1, plus a concrete operational one: Storm's robots.txt disallows all generic crawlers site-wide — under this rebuild's rules that means manual-only verification, which raises the standing cost of keeping its entry honest. Its v1 status was "conflicting" (guardian-age contradiction) — still true on the live site, and now documented as prior art only. |
| IMG Models global (online) | **Dropped from launch 10** | The apply flow is a client-rendered SPA whose deeper steps sit behind an actual submission — v1 itself could only mark it "provisional." Under the no-submission rule, Pholio cannot honestly promise "no surprises" for a flow it cannot fully observe. Better served later as a reference entry with explicitly-bounded coverage than as 1 of only 10 launch entries. |
| The Society Management NYC (online) | **Dropped from launch 10** | Live, legitimate, well-documented — but its published applicant window ("girls and boys between 16 and 23") sits awkwardly against Pholio's 18+ launch gate: for an 18+ product the usable overlap is 18–23, and featuring it at launch invites the exact minor-adjacent ambiguity the legal posture avoids. Also partially redundant with Women Management (shared CMS/platform pattern). Strong candidate for the post-launch expansion wave with careful age-window presentation. |

## 4. Other notable rejections (from the 32-candidate pool)

- **Heroes Model Management** — first alternate; see §2.
- **Women Management** — major with genuinely accessible copy and the strongest
  impersonation-defense story (a documented near-trafficking impersonation used a lookalike
  domain). Lost on redundancy: the set already carries three majors, and its form platform is
  the same pattern as The Society's. High-priority expansion candidate; the verified-link
  feature is the right vehicle for the impersonation story regardless of registry membership.
- **Next Management** — major with a reasonable New-Faces on-ramp; its host serves the apply
  page fine but 403s robots.txt at the root, and the brand's folklore (silent HEIC rejection)
  is already represented by Elite in this set. Expansion candidate.
- **Fusion Models NYC** — the only Brooklyn-HQ'd agency found (Williamsburg; NYDOL cert with a
  Brooklyn address). Rejected because the story flatters the launch narrative more than it
  serves talent: boutique stat floors, no walk-ins/open calls, and no isolatable apply page as
  of 2026-08-19. The honest general finding: "NYC-dense" is in practice Manhattan-dense, and
  FWB itself is doing the Brooklyn-access work in this launch, not any agency.
- **MSA Models** — excluded on dead-infrastructure grounds: msamodels.com serves an
  unconfigured IIS placeholder with broken HTTPS (verified 2026-08-19). Its Tuesday open call
  may be real, but there is no online channel to spec, and pointing talent at a dead site
  fails the no-surprises standard.
- **Red Model Management** — defunct as a standalone brand: rednyc.com is a dead IIS
  placeholder, and the NY DOL entity "Marilyn Red Model Management LLC" documents the merger
  into Marilyn. Listed nowhere as a separate agency.
- **Marilyn NY** — legitimate, low-friction 3-photo spec; lost on persona coverage (no open
  call, no curve board found) against the seven persona slots. Expansion candidate.
- **TRUE Model Management** — strong curve/diverse positioning and a fifth confirmed Snapcast
  user, but its primary domain is Cloudflare-challenge-gated to automation; only the Snapcast
  mirror is verifiable. Kept on the bench pending a decision about listing an agency whose
  own domain can't be respectfully re-verified.
- **IPM / CM Models / Nomad / 28Models / Twenty8** — plausible persona fits (IPM and CM
  especially) but each carries an unresolved legitimacy or identity gap as of 2026-08-19: no
  NY DOL match under searched names (all five), un-isolated apply channel (IPM), email-only
  with international-entity ambiguity (CM), or unresolved two-entity name confusion
  (28Models vs Twenty8). None of these are scam findings — they are open questions that a
  10-slot launch set has no room to carry.
- **The Bureau (Fashion Week)** — resolved identity: the "4 photos + walk video ≤95MB"
  benchmark cited in internal strategy belongs to The Bureau Fashion Week, a casting
  organization, not a representation agency. Excluded from the agency registry; retained as
  the design benchmark for Pholio's event mode (its published spec — 4 photos at 15MB each in
  JPG/PNG/WebP, walk video MP4/MOV/WebM ≤95MB, 18+, free, "kept for future seasons" — is the
  bar FWB's event intake should be measured against).
- **WINK Models** — Australia-only; its "hundreds of applications a week" quote remains a
  citation about agency-side pain, not a registry entry.
- **Soul Artist / Major Model / APM / New York Model Management / Two Management / The
  Management NYC** — all NYDOL-verified with live sites; not selected for launch on persona or
  data-completeness grounds (several would need one more research pass to be launch-honest;
  Two Management's own form omits New York from its office list despite the NY registration —
  an unresolved flag). Bench for expansion.

## 5. What this selection deliberately is not

- It is not a ranking of agency quality or prestige, and Pholio must never present it as one.
- It is not exhaustive coverage of where the cohort applies — it is the ten entries where
  Pholio can be *most accurately useful on day one* while stress-testing the model against
  the full variety of real application shapes.
- It is not static: §4's bench is the expansion queue, and the registry model treats every
  entry as a dated snapshot with a review deadline, not a permanent truth.
