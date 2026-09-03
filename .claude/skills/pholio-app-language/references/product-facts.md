# Pholio product facts

> **Shared layer.** An identical copy lives at `pholio-site/.claude/skills/pholio-site-language/references/product-facts.md`.
> Edit both together; divergence between the copies is a defect.
What Pholio actually is, what exists today, and the facts that constrain copy.
Everything here is traceable to shipped code or a strategy document. This file
is inventory and constraint, never voice reference: existing copy is not
assumed to be correct, and several known defects are listed at the end.

Sources: `pholio-app/PRODUCT.md`, `pholio-app/docs/pholio-strategic-analysis-2026-08.md`,
`pholio-app/docs/pholio-product-plan-2026-08.md`, `pholio-site/docs/app-integration.md`,
direct code inspection (August 2026).

---

## 1. What Pholio is

One sentence, from the 2026-08 strategic analysis:

> The talent-owned professional dossier and the verified front door to it:
> the tool that gets your materials right for every agency (on Pholio or not),
> tracks what you sent where, tells you when silence means no, and gives
> agencies and event casters a free intake inbox that beats the Google Form
> and the email pile.

- **Category:** the professional dossier and application toolkit for models,
  and the verified intake rail for the agencies and events that receive them.
- **Not:** an agency. Not a talent listing. Not a marketplace. Pholio never
  represents talent, never negotiates, never takes a commission, and never
  promises work, auditions, replies, or representation.
- **Two audiences:** Talent (models, actors, creatives; creation-and-pride
  mindset) and Agencies (bookers, scouts, owners; operations-and-judgement
  mindset). Agencies are never charged.
- **Revenue:** one talent subscription, Studio+ ($9.99/mo, $95.88/yr,
  14-day trial). The governing rule: payment never buys guidance, access,
  visibility, or distribution. Only craft and property the talent keeps.
  Anything an agency sees or receives is identical for every talent.

Approved positioning lines (strategy doc §9.1, B5):

- Talent: "Your digitals, right, for every agency, and the truth about where
  you stand."
- Agencies: "Your official application link: verified, conforming, organized,
  exported to whatever you already use. Free, and it stays free."
- The core promise about silence: Pholio is "the only one that tells the truth
  about silence."

## 2. What exists today (surfaces)

**Marketing site (`pholio-site`, www.pholio.studio):** home (hero, intelligence
beat, comp-card beat), `/talent` (hero + seven scene flow), `/about`,
`/agencies` (public per-agency requirement register + detail pages), legal
corpus (8 documents), footer, 404. Stubs: `/press`, `/studio-plus`.
Missing but hard-linked by the app: `/agency/request-access`.

**Product (`pholio-app`, app.pholio.studio):**

- Talent dashboard: Overview, The Book (`/media`), Profile, Intel,
  Market (`/applications`), Messages. Onboarding ("the Screen Test").
- Comp-card engine: nine editions, front/back program synthesis, PDF output.
- Spec registry: per-agency published requirements, preflight
  (pass/fail per shot), conforming export (re-encode ladder, ZIP with
  README.txt / STATS.txt / EMAIL.txt), off-Pholio apply path
  (prepare, archive, handoff).
- Applications: on-Pholio submission flow (seven-page dossier), immutable
  submission snapshots, statuses, tracker with 30-day window and 6-month
  re-apply convention.
- Agency dashboard: open calls, applicant inbox, triage, shortlist share
  links, CSV export, team/RBAC, season memory (`kept_on_file`).
- Event casting: pools, designer pick lists (no-login share links),
  offer/confirm/decline, 18+ gate.
- Verification: NY DOL registry ingestion, agency verification records,
  impersonation defense (the not-affiliated line in UI and export bundle).
- Studio+ billing (Stripe), Apple Wallet pass ("Pholio ID": signed pass
  generation with both Wallet faces is built; the update web service and
  dashboard module are not).

## 3. Compliance facts that constrain copy

Getting these wrong is a legal problem before it is a tone problem
(`pholio-site/docs/app-integration.md` §7):

- **Pholio is not an agency and does not represent talent.** Never imply it
  procures work, auditions, meetings, or representation.
- **Pholio does not charge agencies.** No commission workflow exists.
- **A paid plan never buys review, selection, representation, or booking.**
- **"Recipients", not "agencies", where the contract's scope applies.** Since
  the 2026-07-18 terms, submissions may go to agencies, casting organisations,
  event producers, brands, and other clients, collectively Recipients. Copy
  scoped to all submissions must say Recipients. Copy about a surface that
  factually only involves agencies may say agencies.
- **Minors:** minimum age 13 with guardian authorization required under 18;
  current launch posture is 18+. Minor profiles are never publicly exposable;
  minor submissions are redacted to an age band with contact routed through
  Pholio. Say "guardian", not "parent", in product copy.
- **AI is opt-in and separately disclosed.** Image analysis and profile
  embeddings are distinct, both off by default. `/ai-notice` is the canonical
  reference. The design rule with legal force: classify the photo, never the
  face.
- **"Declared unretouched", never "unretouched"**, for anything Pholio did not
  verify itself. More generally: report observable first-party facts, never
  inferred intent, attention quality, market demand, or career momentum.
- **No invented numbers, ever.** Product-level commitment. Real figures are
  fine and labeled. No success-story marketing that cannot be substantiated
  (FTC Reviews Rule exposure).
- **Entity facts:** "Pholio Studio" / "Pholio Studio, Inc." per
  `lib/legal-constants.ts`. `COMPANY_ADDRESS` is deliberately empty; never
  fabricate an address, jurisdiction, registration, or founding date. The
  company is not yet incorporated (lessons.md §6); nothing may state or imply
  an entity, and agency conventions that depend on being an agency (offices,
  city lists, street addresses) do not apply.
- **Pricing:** $9.99/month, $95.88/year ($7.99/month equivalent), 14-day
  trial, from `lib/marketing-pricing.ts`. Roles on the wire are exactly
  TALENT and AGENCY; the tier is `subscription.isPro`; there is no "STUDIO+"
  role.
- **Talent imagery** has one sanctioned source (`GET /api/public/home`,
  minor-excluding). Never a real person as placeholder; demo identity is
  `elara-k`; no placeholder names, no invented agency names.

## 4. Mechanics scheduled to die: never market them

The strategy analysis and product plan mandate removal of the paid-reach
mechanics (discovery quota lifted by Studio+, free-tier directory slice, the
`is_pro` discoverability gate). Some are still present in code. Rule:

- Never write copy that advertises, explains, or depends on payment changing
  reach, volume, visibility, or review. "Discovery applications count against
  an allowance" is, verbatim from the analysis, "the single most dangerous
  sentence in the thesis" (CA Lab. Code §1701 territory).
- The corrected Studio+ lede is the model: "Premium comp-card themes and
  90-day portfolio analytics. Nothing an agency sees or receives changes
  with it."
- If asked to write copy for a paid mechanic that gates reach, do not write
  it. Flag it as a proposition problem (see judgment.md).

## 5. The product lexicon (exact, from shipped code)

Use these spellings and casings. Labels come from shipped code, not specs
(specs have drifted; lessons.md §21.1).

**Comp-card editions** (`src/domains/pdf/composition/editions.js`, ids stable):

| id | Label | One-line tone (shipped) |
|---|---|---|
| house-classic | The Standard | "The industry card — one strong frame, a clean name band, a working back." |
| the-strip | The Strip | "The working commercial card — a full hero over a three-frame strip." |
| gallery-monograph | The Monograph | "Museum register — deep mats, caption typography, air as material." |
| editorial-masthead | The Masthead | "Magazine logic — the name set as a masthead, the photograph under it." |
| swiss-modernist | The Grid | "Structural — a visible modular grid, grotesque type, a spine rail." |
| cover-story | The Cover Story | "Display type layered behind the figure — the magazine-cover interlock." |
| ink-noir | The Night Edition | "Dark paper, reversed type, gold that finally sings." |
| duet | The Diptych | "Two frames on a hinge — a face and a figure, read together." |
| studio-cutout | The Cutout | "The figure lifted onto a flat plane, type in the silhouette's negative space." |

Nine editions total. An edition is the axis a card varies on; a city/market is
not (lessons.md §21).

**Frame taxonomy** (`src/shared/constants/frame-taxonomy.js`), three axes,
"framing · use · register":

- Shot (framing): Headshot, Close-up, Beauty close-up, Waist-up, Half body,
  Mid-length, Three-quarter, Portrait length, Full length, Profile, Back,
  Detail. Unset renders "Unplaced".
- Image type (use): Digitals, Book, Test shoot, Campaign, Tearsheet.
- Style (register): Editorial, Commercial, Lifestyle, Beauty, E-commerce,
  Swimwear, Fitness, Couture.

**Application statuses** (talent-facing labels): Under Review, Shortlisted,
More Requested, Go-See Requested, Development Offer (short: New Face),
Offer / Moving Forward, Represented, Not Selected, Closed, No Response,
Withdrawn, Kept on File (short: On File). Off-platform tracker: awaiting,
heard back, closed by talent; 30-day default window; 6-month re-apply
convention; the tracker's copy says "opens", not "blocked".

**Intel action vocabulary**, tiered by signal quality (tier 1 strongest):
Agency reviews and Advances (tier 1), Card pulls and Link opens (tier 3),
Profile visits (tier 4). Report counts and events only; never translate them
into inferred interest or momentum.

**Booking lanes:** Commercial, E-comm, Editorial, Runway, Lifestyle, Beauty,
Fitness / Athletic, Fit, Parts, Curve, Petite, Promotional / Events,
Creator / UGC.

**Markets** (`market-resolve.js`): city labels (New York, Paris, Milan,
London, Tokyo, ...). Boroughs fold into the market (Brooklyn is New York).

**Stats printing** (`stats-formatter.js`): uppercase labels joined by
middle dots on cards. Women: HEIGHT, BUST, WAIST, HIPS, DRESS, SHOES, HAIR,
EYES. Men: HEIGHT, CHEST, WAIST, INSEAM, SUIT, SHOES, HAIR, EYES. Kids: AGE,
HEIGHT, CLOTHING SIZE, SHOES, HAIR, EYES. Rules stated as copy: age/DOB is
never printed for adults; weight only for fitness talent; kids cards never
show body measurements. Dual units default.

**Event casting:** purposes representation | event_casting; compensation
PAID | UNPAID | A STIPEND (disclosure is mandatory in the brief);
"organizer" is the event-side counterpart of "agency"; applicants, pools,
pick lists, slots.

**Digitals freshness states:** current / aging / stale (never label an
undated set "current").

## 6. Known language defects in the shipped product (do not imitate)

Recorded so the skill treats them as findings, not precedent:

1. One object, four names: The Book / portfolio / images / media
   (nav says "The Book", route is `/media`, link says "Manage images").
2. "Editorial" overloaded: style value, deprecated image type, comp-card
   slot label, and design adjective.
3. Onboarding's "Let's get you seen" is the banned exposure-promise speech
   act with different words.
4. Two error registers for one event ("Could not save. Try again." vs
   "That did not save. Try once more.").
5. Agency email family is on the old design system by its own admission.
6. Mixed British/American spelling. Recommendation: American (Delaware
   entity, US-first market); flag rather than silently rewrite.
7. The site's `/about` page is pre-reset copy violating most of the current
   rules (see judgment.md worked example).
8. A second CTA label ("Start your book") exists on /talent against the
   one-CTA rule ("Apply free"). Open question for the owner; flag, do not
   silently resolve.
9. The event consent copy is written and hashed into consent records but
   unreachable in the UI flow (a compliance defect the analysis flags).
