# R2 — How agencies are organised, run a roster, and talk about representation (2026)

Research date: **2026-09-03**. All URLs accessed 2026-09-03 unless noted.
Method: raw-HTML fetch (curl, desktop UA) plus WebFetch/WebSearch. Where a site is JS-rendered, I read the
serialised data payload (Next.js flight data, WordPress GraphQL JSON, jQuery templates) rather than the
rendered DOM — this turned out to be the single most valuable technique, because it exposes the agency's
*internal* content model (e.g. Select's CMS type is literally `ModelBoard`, Premier's CSS classes are
`board-item` / `board-item-text-board`).

Sample: **18 agencies** (US, UK, FR, AU, AE), **5 agency-software vendors**, **3 regulator/industry-body
sources**, plus secondary corroboration clearly labelled. Failures noted in §7.

---

## 1. The practitioner's mental model

### 1.1 The board is the unit of organisation — not the roster

The word practitioners actually organise around is **board**. A roster is the whole agency's talent; a
**board** is a *desk*: a named subset of talent, with its own bookers, its own phone line, its own client
list, and its own page on the agency site. The board is simultaneously (a) an internal team, (b) a
commercial segment, and (c) a stage in a model's career. That triple meaning is the thing outsiders miss.

The strongest evidence that a board is a *desk* and not a website category is that agencies publish phone
numbers per board:

- Storm (UK), contact page: `"Models Board: Women +44 (0) 207 376 7764; Men +44 (0) 207 376 7464"` and
  `"Talent Board: Talent Management +44 (0) 207 376 7764"`. Elsewhere in the same markup: `MODELS BOARD`,
  `TALENT BOARD`, `Men's Board`, `Women's Board`.
  <https://www.stormmanagement.com/info/>
- The MiLK Collective (UK), contact page renders a table keyed by board, each with its own number:
  `Fashion` / `Women` `+44 (0) 203 857 3690` / `New Faces` `+44 (0) 203 857 3690` / `Curve`
  `+44 (0) 203 857 3691` / `Men` `+44 (0) 203 857 3692` / `Talent` `+44 (0) 203 857 3693`.
  <https://www.milkmanagement.co.uk/contact>

So when a booker says "put her on New Faces", they mean: assign her to that desk, that phone line, that set
of clients, and that fee expectation. It is a routing decision, a pricing decision, and a career-stage
decision at once.

### 1.2 Two axes, not one

Boards are almost universally a **matrix of two axes**:

- **Axis 1 — gender/category segment**: Women / Men / (increasingly) Non-binary / Talent / Curve / Classic /
  Kids / Creators.
- **Axis 2 — career stage within that segment**: New Faces → Development → Main(board) → Image.

Agencies encode this in URLs in both orders, which tells you neither axis is "primary":

- Premier: `/women/new-faces/`, `/women/image/`, `/women/women/`, `/men/new-faces/` (segment first)
- Storm: `/new-faces/women/`, `/mainboard/women/`, `/image/women/`, `/curve/women/` (stage first)
- Chadwick (AU): `/divisions/main/women`, `/divisions/new-faces/men`, `/divisions/development/women`
- Milk: `/section/women-image`, `/section/curve-new-faces`, `/section/men-main`

Note `/women/women/` and `/men/men/` at Premier, and `/men/men/` at Wilhelmina: when the middle tier has no
special name, agencies repeat the segment name. That is a real modelling quirk — **the default board is
often just called by the segment name**, and "Main" is only made explicit when there is something above it.

### 1.3 Career stage is a promotion ladder, and it is public

New Faces / Development is the entry board. Main is the working board. Image is the elite board. Movement is
upward and is a deliberate act by the agency, not a status the talent sets.

Corroborating definition (secondary, but consistent with the URL evidence above): "*Development and New
Faces are basically the same, just different terms used by various agencies... The agency will begin sending
the model to castings and go-sees, but will not promote them to the main board until their portfolio is
complete and they have gained some experience*"; "*Image boards usually feature the top models at an
agency... mainboard consists of the worker bees*."
<http://amodelsdiary.blogspot.com/2020/02/demystifying-modeling-agency-boards.html> (secondary)

Operationally, **"in development" means: signed, but not yet sellable at full rate.** The agency is
investing — tests, digitals, a book being built, maybe grooming and a walk — and is deliberately pricing the
model low or sending them only to selected castings. It is *not* a pre-signing pipeline stage. Viviens (AU)
makes this explicit by naming the board `in-development` and listing it alongside Women/Men/Classic/Curve as
a peer board of signed talent. <https://www.viviensmodels.com.au/>

### 1.4 Signing is a discrete, contractual, agency-initiated act

The verb is **sign** — "we signed her", "she's signed with X", "signed to X". Talent are **represented by**
an agency. The state that matters legally is **representation**, and New York now defines it:

> **Exclusive Representation** — "*An agreement between a model and a model management company that
> restricts the model from being represented by anyone else.*"
> NY DOL, Fashion Workers Act definitions. <https://dol.ny.gov/new-york-state-fashion-workers-act-definitions>

Crucially: an agency signs, a model accepts. There is no mutual-match ceremony. There is no "application
accepted" state. The transition is *offer of representation → contract signed → placed on a board*.

### 1.5 The multi-agency reality: mother agency + placements

A working model is typically represented in several markets at once, and this is normal, not a conflict:

- **Mother agency** — the agency that discovered/developed the model and manages their overall career; it
  keeps a cut of everything, everywhere, indefinitely.
- **Placement agencies** — the agencies in each booking market (NY, Paris, Milan, London, Tokyo, Seoul,
  Shanghai) that the mother agency **places** the model with.

Evidence that this is a first-class operational concept and not just folklore: **AgencyPin's accounting
module produces "Talent, mother-agency, and co-mother-agency statements."**
<https://www.agencypin.com/> — i.e. commission splitting between a mother agency and a co-mother agency is a
built-in ledger feature. models.com maintains an entire agency category "Mother Agencies"
(<https://models.com/agencies/Mother>), and a mother agency describes itself as specialising in
"*placements across Asia's leading fashion markets... to secure representation*" (Perception Models, via
models.com listing).

The practitioner sentence is: *"We're her mother agency; she's placed with Next in New York and Viva in
Paris."* Note the verb: models are **placed with** an agency, by another agency.

### 1.6 The booking state machine (what a booker actually stares at all day)

This is the most standardised vocabulary in the whole industry, and it is **three states plus one**:

> "*Per-talent statuses such as **request**, **option**, and **confirmed**.*" — AgencyPin
> <https://www.agencypin.com/>

- **Request / enquiry** — client asking about availability.
- **Option** (a.k.a. **hold**, and ranked: *first option*, *second option*) — a soft, non-binding
  reservation of a date. Multiple options can stack on one date. First option gets the right to be
  "challenged": if second option wants to confirm, first option must confirm or release.
- **Confirmed / booked** — the job is on.
- **Bookout** — the model has declared themselves unavailable (holiday, another market, exams, illness).

Mediaslide: "*Just drag and drop to manage **castings**, **jobs**, and **options**.*"
<https://www.mediaslide.com/booking-system-model-agency/>
Syngency exposes "*full talent **charts** and booking details*" — a **chart** is the model's date grid, the
canonical booker artefact. Corroborated by a 2026 booker job posting describing "*updating portfolio logs
and model **booking charts***" (ZipRecruiter, secondary).

**A casting / go-see is not a booking.** It is an unpaid audition. `casting` (fashion, EU/UK) and `go-see`
(US, often the informal/portfolio-drop version) are the terms; Syngency calls the outbound broadcast a
"**Casting Call**" — "*Broadcast casting opportunities to your talent*".

### 1.7 The client-facing artefact is a *package*, not a profile link

When an agency proposes talent to a client, it sends a **package** (also *e-comp*, *submission*, *show
package*). This is a curated, ordered, branded selection — not a search result.

- Syngency: "**Talent Package**" — "*send HD images and videos in a beautifully presented Syngency
  package*"; "*Packages*" built with a "*drag-and-drop interface*".
- AgencyPin: "*Packages workflow — Search talent, build a client-ready package, send a branded link*", with
  "*Client responses tracked as **Interested**, **Maybe**, or **Not interested***."
- Netwalk: "*Packages Tool*", "*Fast Package*".
- Mediaslide: "*Send beautifully designed model portfolios to your clients... They can make **selections**,
  add comments, and chat directly with your bookers.*"
- DNA (US) publishes seasonal PDFs literally named `DNA-Show-Package-FW2016.pdf`, `dna_womens_fw22.pdf`.
  <https://www.dnamodels.com/>

So the direction of travel is **agency → client**. Talent do not build packages; bookers do.

---

## 2. Vocabulary table

Region key: US / UK / EU / AU / GLOBAL. "Evidence" = count of distinct primary sources in my sample.

| Term | Meaning | Who says it | Region | Evidence | Verbatim + URL |
|---|---|---|---|---|---|
| **Board** | A named desk/division of talent with its own bookers and clients | Agency, talent | UK/EU/AU dominant; US present | 8 | `MODELS BOARD`, `TALENT BOARD`, `Women's Board` — <https://www.stormmanagement.com/info/>; CMS type `"__typename":"ModelBoard"` — selectmodel.com/london; CSS `board-item-text-board` — premiermodelmanagement.com; `/div/women-main-board/` — dnamodels.com |
| **Division** | Same as board; the preferred word in *software* and in Australia | Agency, vendors | AU, vendor-speak | 3 | URL path `/divisions/main/women` — chadwickmodels.com; "*Divisions*" — syngency.com; "*by division, agent, model and category*" — Syngency |
| **Mainboard / Main Board / Main** | The working board; established, fully-priced models | Agency, talent | GLOBAL | 11 | `/mainboard/women/` — stormmanagement.com, silentmodels.com, viviensmodels.com.au; `/div/women-main-board/` — dnamodels.com; `/new-york/men/main` — wilhelmina.com |
| **New Faces** | Newly signed, brand-new to the industry, lower rates, book being built | Agency, talent, clients | UK/EU/AU dominant | 7 | `/new-faces/women/` — stormmanagement.com; `/women/new-faces/` — premiermodelmanagement.com; `New Faces +44 (0) 203 857 3690` — milkmanagement.co.uk; `/divisions/new-faces/men` — chadwickmodels.com |
| **Development / In Development** | Signed but still being built; tests, grooming, selective castings | Agency | US/EU/AU | 8 | `/new-york/women/development` — wilhelmina.com; `/development/women/` — viva-paris.com; `/in-development/` — viviensmodels.com.au; `/div/women-development/` — dnamodels.com; `Development` — imgmodels.com |
| **Image** | The elite/editorial board; top clients, top rates, tightly managed | Agency | UK/EU/AU | 8 | `/women/image/` — premiermodelmanagement.com, models1.co.uk, selectmodel.com; `/image/women/` — stormmanagement.com; `/divisions/image/women` — chadwickmodels.com |
| **Curve** | Plus-size board. The 2026 term; "plus" is legacy | Agency, talent | UK/EU/AU/US | 4 | `/curve/women/` — stormmanagement.com; `/section/curve-main` — milkmanagement.co.uk; `/perth/divisions/curve` — chadwickmodels.com; `/brisbane/curve/` — viviensmodels.com.au |
| **Classic** | Older / mature models (roughly 40+). Sometimes "Timeless" | Agency | AU/UK | 2 | `/perth/divisions/classic` — chadwickmodels.com; `/melbourne/classic/` — viviensmodels.com.au |
| **Direct** | Commercial/lifestyle board booked direct by clients at lower rates | Agency | US/UK | 1 | `/new-york/women/women-direct` — wilhelmina.com |
| **Talent** | Non-model represented people: actors, presenters, musicians, DJs, creatives | Agency | UK/EU | 6 | `Talent Board` — stormmanagement.com; `/talent/main` — models1.co.uk; `/talent/musicians-djs/`, `/talent/creatives/`, `/talent/digital/` — selectmodel.com; `/london/talent` — nextmanagement.com |
| **Creators / Creatives / Digital / Influencers** | Social-first talent | Agency | GLOBAL, growing | 5 | `/new-york/creators` — nextmanagement.com; `Creator` — imgmodels.com; `/status/influencers/` — viviensmodels.com.au; `/ae/category/influencers/` — mmgmodels.com |
| **Artists** | Hair/makeup/stylists/photographers represented by the same house | Agency | US | 2 | `/new-york/artists` — nextmanagement.com; `/artists` — fordmodels.com |
| **Non-binary** | A board, in 2026, at mainstream agencies | Agency | UK/AU | 2 | nav label `"Non-binary"` — selectmodel.com; `/divisions/main/non-binary` — sydney.chadwickmodels.com |
| **Management / Legacy / Newcomers / Special Bookings** | Single-agency board names | Agency | quirk | 1 each | `/women/management/`, `/women/newcomers/` — newmadison.fr; `/section/women-legacy` — milkmanagement.co.uk; `/div/men-special-bookings/` — dnamodels.com |
| **Represented by** | The relationship. The neutral, correct phrasing | Agency, talent, regulator | GLOBAL | 4 | "*restricts the model from being represented by anyone else*" — NY DOL; "*obtain written approval from **represented models***" — NY DOL |
| **Signed / signed with / signed to** | The act and the state of entering representation | Agency, talent | GLOBAL | secondary + regulator-adjacent | Universal in bios and trade press; the verb of the industry |
| **Mother agency / mother agent** | Discovering agency that manages the career and places the model elsewhere | Agency, talent | GLOBAL | 2 primary | "*Talent, **mother-agency**, and **co-mother-agency** statements*" — agencypin.com; models.com category "Mother Agencies" |
| **Placement / placed with** | Getting a model represented in another market | Mother agency | GLOBAL | 2 | "*placements across Asia's leading fashion markets... to secure representation*" — Perception Models via models.com |
| **Exclusive representation** | Legally defined restriction to one agency (per market/territory) | Regulator, agency | US (NY statutory) | 1 primary | NY DOL definitions page (verbatim above) |
| **Model management company** | The statutory term for "modelling agency" in NY | Regulator | US-NY | 1 | "*is in the business of managing models' participation in entertainments, exhibitions, or performances*" — NY DOL |
| **Client** | The brand/publication/production that hires. NOT the model | Agency, regulator, vendor | GLOBAL | 5 | "*A person, business, or organization that contracts for modeling services*" — NY DOL |
| **Deal memo** | Plain-language summary of a booked job, given to the model before work | Regulator, agency | US-NY | 1 | "*A summary written in plain language of the key components of a job booked by a model management company on behalf of a model*" — NY DOL |
| **Option / first option / second option / hold** | Soft reservation of a date | Booker, client | GLOBAL | 3 | "*statuses such as request, option, and confirmed*" — agencypin.com; "*castings, jobs, and options*" — mediaslide.com |
| **Confirmed** | The booking is firm | Booker, client | GLOBAL | 2 | agencypin.com; syngency.com |
| **Bookout** | Model-declared unavailability | Booker, talent | GLOBAL | thin (0 primary in sample) | Widely used; I could not capture a verbatim vendor instance — see §6 |
| **Chart** | The model's date grid; the booker's primary screen | Booker | GLOBAL | 2 | "*full talent charts and booking details*" — syngency.com; "*Talent chart*" — agencypin.com |
| **Package / e-comp / show package** | Curated client-facing selection of talent | Booker, client | GLOBAL | 5 | "*Talent Package*" — syngency.com; "*Packages workflow*" — agencypin.com; `DNA-Show-Package-FW2016.pdf` — dnamodels.com |
| **Casting / go-see** | Unpaid audition | All | casting=UK/EU, go-see=US | 3 | "*Casting Calls — Broadcast casting opportunities to your talent*" — syngency.com; "*manage castings, jobs, and options*" — mediaslide.com |
| **Book** | The physical/digital portfolio | Agency, talent | GLOBAL | 1 primary | "*books — the term used for portfolios*" — mediaslide.com FAQ |
| **Digitals / polaroids** | Unretouched, no-makeup, natural-state reference images | Agency, talent | digitals=modern GLOBAL; polaroids=legacy synonym | 3 | "*Headshot, Mid length, Full length... in their natural state, free of filters and retouching... without makeup and with natural hair*" — stormmanagement.com/apply; "*headshots, digitals, editorials, and videos*" — syngency.com/mobile |
| **Comp card / composite / sed card / zed card / Z-card** | The one-sheet leave-behind | Agency, talent, printers | comp card=US; sed/zed card=UK/EU legacy | secondary | All synonyms; "*comp card (also called composite card, Z card, zed card or Sed card)*" — Wikipedia/compcard.com (secondary) |
| **Open call** | Scheduled walk-in day for unrepresented hopefuls | Agency, talent | GLOBAL | secondary | "*a time specified by an agency for any prospective models... to show up*" |
| **Scouting / scouted** | Agency-initiated discovery | Agency | GLOBAL | 2 | "*Scouting management — Use our integrated map to plan trips, **track scouted models**, and share proposals*" — mediaslide.com; "*track proposed or introduced models*" — netwalk.eu |
| **Application / submission** | Inbound, talent-initiated | Agency, vendor | GLOBAL | 3 | "*Applications — Collect talent applications online*" — agencypin.com; `apply-to-become-a-model` — stormmanagement.com |
| **Shortlisted** | The only inbound-prospect status agencies publish | Agency | UK | 1 | "*we will only contact those who have been shortlisted*" — stormmanagement.com/apply |
| **Digital replica** | AI likeness; now consent-gated by statute | Regulator, agency | US-NY, and BFMA in UK | 2 | "*A computer-generated or artificial intelligence-enhanced representation of a model's likeness*" — NY DOL; BFMA AI code |

### 2.1 Outsider / wrong terms practitioners would flinch at

| Outsider term | Why it grates | What they'd say instead |
|---|---|---|
| **"Candidate"** | HR/recruiting register. A person applying to an agency is not applying for a job; they are asking to be represented. Also implies a vacancy exists — boards don't have headcount slots. | *applicant*, *submission*, *new face*, *prospect*, *she/he came in* |
| **"Pipeline"** | Sales-CRM register. Agencies do track scouted people, but the framing is discovery-and-investment, not conversion funnel. Netwalk's own word is "*track proposed or introduced models*". | *scouting*, *people we're watching*, *coming in*, *on the scouting trip* |
| **"Interview"** | In *fashion* this is wrong: you *meet* someone, they *come in*, they attend an *open call*. "Interview" is scam-adjacent in fashion because scouts-who-charge use it. **BUT** it is genuinely used by US commercial/child agencies — SMG: "*we will invite you for an **interview***". So it is segment-split, not universally wrong. | *meeting*, *come in and see us*, *open call*, *go-see* |
| **"Signing board"** | Direct homonym collision. **"Board" already means division.** A screen called "signing board" reads as "the board of models called Signing", which is nonsense. This is the single most dangerous word to reuse. | *new faces*, *scouting*, *applications* |
| **"Roster"** | Not wrong, but loose. It is the *whole agency*, spoken about externally ("our roster"). Internally nobody works "in the roster" — they work a board. A flat roster with no board dimension is the alien part, not the word. | *the women's board*, *main board*, *our talent* |
| **"Profile"** | Talent have a *book* (portfolio) and a *card* (comp card) and, internally, a *record*. "Profile" is web-product language; tolerated but never native. Vendors say "*Talent Profiles*" (Syngency) so it's safe in software. | *book*, *card*, *chart*, *talent record* |
| **"Match" / "match score"** | Nothing in agency software scores talent-to-client fit. Clients express interest as "*Interested / Maybe / Not interested*" (AgencyPin) on a human-curated package. An algorithmic match score would read as unserious. | *package*, *selection*, *client feedback* |
| **"Applied / application status: accepted"** | Agencies do not "accept" applications. They *offer representation*, which is then contracted. And most never reply at all. | *shortlisted*, *offered representation*, *signed* |
| **"Available / Unavailable" as a talent-set toggle** | Availability is a *date-range* concept on a chart (bookout), never a global on/off flag. A model is not "unavailable"; they are "booked out 12–19 Oct". | *bookout*, *chart*, *booked* |
| **"Plus size"** | Superseded. | *Curve* |
| **"Vital statistics" / "measurements" for minors** | BFMA: "*We believe it is inappropriate to measure any young person under the age 18 except for their height.*" A product that collects bust/waist/hips from a 16-year-old is in breach of UK best practice. | height only, under 18 |

---

## 3. Workflow / state model

### 3.1 Unknown → represented (who acts at each step)

```
[0] UNKNOWN
     │
     ├─ agency acts ──► SCOUTED           street scouting, scouting trips, social/Instagram scouting,
     │                                    scouting competitions. Vendor support: Mediaslide "Scouting
     │                                    management... plan trips, track scouted models, and share
     │                                    proposals"; Netwalk "track proposed or introduced models".
     │
     └─ talent acts ──► APPLIED           online application form, open call walk-in, or email submission.
                                          Storm: "apply-to-become-a-model". AgencyPin: "Applications —
                                          Collect talent applications online".
                              │
                              ▼
[1] IN THE INBOX / ON FILE (weak, short-lived state)
     • Storm publishes the only clear status word: "we will only contact those who have been SHORTLISTED".
     • Storm also publishes the retention rule: "Your application data will be kept here for no longer
       than 30 working days."  ⇒ In the UK/EU, a *persistent* applicant database is a GDPR liability,
       not an asset. Agencies deliberately do not keep one.
     • Silence is the norm. There is no rejection event. Nothing is sent.
                              │
                              ▼
[2] MEETING / OPEN CALL      Agency acts. Model "comes in". Agency shoots its own digitals in-house
                             (this is why submitted digitals only need to be good enough to earn the
                             meeting, not good enough to sell). Height and look verified in person.
                              │
                              ▼
[3] OFFER OF REPRESENTATION  Agency acts, unilaterally. Not a mutual match.
                              │
                              ▼
[4] CONTRACT SIGNED          Under 18 ⇒ parent/guardian signs. BFMA: "All agreements for any model who
                             is under 18 must be signed by the parent/s or guardian."
                             NY: written agreement, ≤20% commission, deal memo per job, separate written
                             consent for digital replica.
                              │
                              ▼
[5] PLACED ON A BOARD        New Faces or Development. THIS is the first moment the person is public.
                             Agency acts. Reversible (models are dropped, boards are reshuffled).
                              │
                              ▼
[6] DEVELOPED                Tests / test shoots, book built, digitals refreshed, comp card printed,
                             sent to selected castings and go-sees. Agency invests; model is deliberately
                             under-priced during this period.
                              │
                              ▼
[7] PROMOTED TO MAIN BOARD   Agency acts. Public and visible — the URL changes.
                              │
                              ▼
[8] PLACED IN OTHER MARKETS  Mother agency acts. Model becomes represented by placement agencies in
                             NY / Paris / Milan / London / Tokyo / Seoul. Commission splits; AgencyPin
                             ledgers "mother-agency and co-mother-agency statements".
                              │
                              ▼
[9] IMAGE BOARD (few)        Agency acts. Elite tier.
```

### 3.2 The ongoing loop once represented (this is where 95% of the work is)

```
CLIENT ENQUIRY ──► booker builds PACKAGE ──► client responds "Interested / Maybe / Not interested"
                          │
                          ▼
                   CASTING / GO-SEE (unpaid) ──► client requests dates
                          │
                          ▼
      REQUEST ──► OPTION (1st / 2nd, stackable, challengeable) ──► CONFIRMED ──► job ──► invoice
                          │                                             │
                          └──────────── released / cancelled ◄──────────┘
        BOOKOUT sits across all of this as model-declared unavailability on the CHART.
```

### 3.3 Reversibility and obligation — what each transition actually commits

| Transition | Reversible? | Obligates whom? |
|---|---|---|
| Application submitted | Trivially — agencies delete after ~30 working days (Storm) | Nobody. Explicitly no reply owed. |
| Shortlisted | Yes, silently | Nobody |
| Meeting held | n/a | Nobody |
| Representation offered | Yes, until signed | Nobody |
| **Contract signed** | Yes but formally — notice periods, termination clauses | **Both.** Commission ≤20% (NY). Agency owes deal memos, statements, safety duties. |
| Board placement / promotion | Yes, freely | Nobody — it's an internal routing decision |
| Package sent to client | Yes | Nobody |
| **Option placed** | **Yes — this is the point.** Options exist to be released. | Nobody legally. Socially: 1st option must be given the chance to confirm before 2nd option takes the date. |
| **Confirmed** | Only by cancellation, with cancellation fees | **Both.** Deal memo owed before work begins (NY). |
| Bookout | Yes | Model owes the agency notice |

The critical asymmetry: **everything before "contract signed" obligates nobody and is expected to
evaporate.** A product that models pre-signing states as durable, tracked, notified records is modelling
something agencies deliberately do not keep.

---

## 4. Data conventions on a model profile

### 4.1 The stat set is small, fixed, and ordered

Observed field order, verbatim, across three agencies in three countries:

| Agency | Order | Units |
|---|---|---|
| Premier (UK) | Height, Bust, Waist, Hips, Shoe, Hair, Eyes | **Imperial leads**, metric on toggle |
| Storm (UK) | Height, Bust, Waist, Hips, Hair, Eyes (+Shoes) | **Imperial only** |
| Viva (FR) | Height, Bust, Waist, Hips, Shoes, Hair, Eyes | **Metric only (cm)** |

Premier verbatim (women's board, imperial pane):
`Height 5' 11''` · `Bust 32½''` · `Waist 24½''` · `Hips 35''` · `Shoe 6` · `Hair Light brown` · `Eyes Blue`
metric pane: `Height 180` · `Bust 82.5` · `Waist 62` · `Hips 89.5` · `Shoe 39`
<https://www.premiermodelmanagement.com/women/image/2811-luna-bijl/>

Storm verbatim: `Height 5'11'' 1/2` · `Bust 33''` · `Waist 25''` · `Hips 37''` · `Hair Black` · `Eyes Brown`
<https://www.stormmanagement.com/mainboard/women/adual-akol/4082/>

Viva verbatim (bilingual FR/EN): `Height/Hauteur 178 cm` · `Bust/Poitrine 84 cm` · `Waist/Taille 66 cm` ·
`Hips/Hanches 90 cm` · `Shoes/Chaussures 41` · `Hair/Cheveux Châtain/Chestnut` · `Eyes/Yeux Bleu`
<https://www.viva-paris.com/new-faces/agathe-castelletta/3095/>

**Findings:**

1. **Seven fields, that's it.** Height, Bust, Waist, Hips, Shoe, Hair, Eyes. No weight. No dress size on
   fashion boards (dress/suit sizes appear on commercial and curve boards). No cup size.
2. **Order is invariant**: Height first, then B/W/H top-to-bottom, then shoe, then colouring last.
3. **Both Premier and Storm render single-letter abbreviations alongside the words** — `H`, `B`, `W`, `H`,
   `S`, `H`, `E` — because that is the comp-card layout. The comp card is the source format; the web
   profile imitates it.
4. **Dual units are a toggle, not a dual display.** Premier ships two complete `<section class="profile-stats">`
   blocks and swaps them (`onclick="changeStats('metrics')"`), even firing an analytics ping to
   `stats.php?type=`. They care which unit you chose. Never show `180cm / 5'11"` side by side.
5. **Regional lead unit: UK/US imperial-first, EU metric-only.** Shoe size is *always* localised to the
   agency's market (UK 6 = EU 39 for the same person, per Premier's own two panes).
6. **Height is the one measurement with fractional precision** — `5'11'' 1/2` (Storm). Half-inches matter.

### 4.2 What is deliberately absent

- **Age and date of birth are NOT shown.** Confirmed absent on Premier, Storm and Viva profiles. DOB is
  collected at application (Storm's form requires it) and held internally for licensing/permits, but it is
  never published. A public age field would be a red flag.
- **No location/city on the model profile** — the *board* and the *office* supply that.
- **No availability, no rates, no "status".** Those live in the booking system behind the login.
- **No badges, scores, or verification marks** anywhere in the sample.

### 4.3 Media sections

- Storm's profile anchors are `#portfolio` / `#portfolioimage1..30` — the public section is
  "**portfolio**".
- Premier's profile tabs: **Portfolio**, **Campaign**, **Instagram**.
- Syngency's talent app calls the media store "**Galleries**" containing "*headshots, digitals, editorials,
  and videos*". Syngency's plan limits are stated as "*3 Galleries per Talent*".
- Netwalk: "*talent portfolios*", "*talent presentations*". Mediaslide FAQ uses "**books**" for portfolios.

So: **"book" and "portfolio" are the talent/agency words; "gallery" is the software word; "images" is
nobody's word.** There is no public "digitals" tab on agency sites in my sample — digitals are an
internal/submission artefact, not a public one.

### 4.4 Instagram

Instagram *handles* and links are shown (Storm links "Visit Adual's instagram"; Premier has an Instagram
tab). **Follower counts are not published as a stat field** — Premier mentions "*Instagram following of
over 275K*" in prose bio copy only. But follower count IS a bookable filter internally: Syngency's
"*Advanced Talent Search*" filters by "*availability, specific skill levels, geolocations, **social media
followers***". Public = link; internal = number.

### 4.5 Downloadable comp cards

**No downloadable comp card was found on any of the 18 agency sites sampled.** Public sites do not offer
"Download comp card". The card is printed, or PDF'd into a client-facing *package* by a booker. DNA's PDFs
are `..._Show_Package_...pdf` — the unit distributed is the package, not the individual card.

Naming (secondary, but unanimous): *comp card* = *composite card* = *sed card* = *zed card* = *Z-card*, all
the same object. "Comp card" is the US default; "sed/zed card" is UK/EU and older. Origin: "*Sebastian Sed,
the London agent credited with popularizing the format*" (compcard.com / thelooksheet.com, secondary).

---

## 5. Trust and legitimacy signals

### 5.1 What legitimate agencies say — near-verbatim consensus across three agencies

| Agency | What they promise never to do |
|---|---|
| IMG | "*IMG Models does not conduct interviews via Skype*"; "*we never request photos in the nude or lingerie*"; "*we never require monetary payment*" — <https://www.imgmodels.com/recruitmentwarning/> |
| Premier | Scouts/agents "*will never: Request payment to become a model*" or "*Request nude or lingerie photos*"; and will not "*Need you to submit a portfolio of modelling work to apply*" — <https://www.premiermodelmanagement.com/staying-safe/> |
| SMG | "*SMG does not charge you a fee for representation. We make our money by charging a commission for the work we secure for you. Beware of agencies that charge any sort of up-front fees.*"; "*SMG does not request nude/lingerie photos, and we will never ask you to send us money.*" — <https://www.smgmodels.com/apply> |

Three independent agencies converge on the same three refusals: **no fee, no nudes/lingerie, no payment of
any kind.** Plus a fourth from Premier that is easy to miss and very relevant to a portfolio product:
**a legitimate agency does not require you to already have a portfolio of professional work.** Requiring
one is itself a soft scam signal.

### 5.2 Identity verification is the 2026 obsession

Both Premier and IMG lead with impersonation, not fee fraud:

- Premier: "*all Premier employees (including our scouts) will correspond via an email domain ending with
  premiermodelmanagement.com*"; the reply-to must be "*from a named individual, rather than 'info or
  safety'*"; "*all Premier official digital (social media) channels are verified*". Red flag: being moved
  off-domain to "*a Gmail, iCloud, Yahoo or other email client or a messaging app/social media channel*".
- IMG: "*certain individuals on the internet falsely claiming to be representatives (or "scouts") of IMG
  Models*"... "*do not respond without first verifying their identity. Promptly call us directly*".
- Storm: "*many people are approached by imposters*".

**Implication for any product:** the number-one trust question in 2026 is *"is this agency contact actually
that agency?"* — not *"is this agency real?"*. Verified agency identity and on-platform, on-domain
communication are the trust primitives.

### 5.3 Scam-coded language legitimate players avoid

- "Guaranteed work" / "guaranteed bookings"
- "Registration fee", "portfolio fee", "web fee", "administration fee", "you'll need professional photos
  first — we work with a photographer"
- "Scouted" as flattery delivered by DM from a non-agency-domain account
- Skype/WhatsApp "interviews"
- Requests for lingerie/swim/nude digitals — flatly prohibited for minors: BFMA, "*It is unacceptable to
  take, send or receive body, bikini or lingerie digitals of any young person under the age of 18.*"

### 5.4 Minors — hard rules that constrain product design

- **BFMA (UK):** "*We believe it is inappropriate to measure any young person under the age 18 except for
  their height.*" · "*All agreements for any model who is under 18 must be signed by the parent/s or
  guardian.*" · "*Under 18s must be chaperoned*" for test shoots.
  <https://bfma.fashion/bfma-code-of-practice/>
- **Storm:** "*If you are under 18, a parent or legal guardian must complete the application for you and
  provide their consent.*" — the guardian completes the *whole form*, not just a consent checkbox.
- **SMG (US, children):** age-gated intake — "*accepting children 2-12 through online submission only*".

### 5.5 Regulatory frame (2026)

- **New York Fashion Workers Act** (in force since 19 June 2025; NY Labor Law Art. 11). Defined terms:
  *Model*, *Modeling Services*, *Client*, *Model Management Company*, *Model Management Group*, *Exclusive
  Representation*, *Deal Memo*, *Digital Replica*. Duties: give the model "*a written or digital copy of
  their deal memo before work begins*"; the final booking agreement within 7 days "*in the language
  requested by the model*"; commission capped — may not "*charge a commission fee greater than 20 percent
  of a model's total pay*"; written approval before deductions; explicit signed consent for digital
  replicas and for sexually explicit material. Clients owe 1.5× after 8 hours and a 30-minute meal break.
  <https://dol.ny.gov/new-york-state-fashion-workers-act-definitions> ·
  <https://dol.ny.gov/responsibilities-fashion-management-and-clients>
  IMG publicly posts its licence at `/new-york-state-fashion-workers-act` — **agencies now display
  registration credentials as a trust signal.**
- **UK:** BFMA members "*are employment agents and, as such, are regulated by The Conduct of Employment
  Agencies & Employment Businesses Regulations 2003*". Note the consequence: under those regulations a UK
  agency generally cannot charge a work-seeker a fee for finding them work.
- **AI:** BFMA code, model's voice: "*My digital version is an extension of my identity and profession.
  Therefore, I wish to be digitally represented in a way with which I feel morally, ethically and
  artistically aligned.*" Storm, Premier and Milk each publish an **AI Code of Practice**; Premier publishes
  an **anti-AI-data-mining** page (`/anti-ai-data-mining/`). Consent-to-AI is now a standing agency-website
  fixture.

### 5.6 The infrastructure tell

**Models 1 and The MiLK Collective both footer-credit "Mediaslide Model Agency Software."** Their public
board pages are rendered from the same database their bookers work in. Select Model's CMS content type is
`ModelBoard`. Premier's markup is `board-item` / `board-item-text-board`.

This is the most important structural finding in this report: **for many agencies the public website and the
booking system are one system, and "board" is a first-class entity in the data model.** Any tool that gives
an agency a board-less flat list is not just using the wrong word — it is missing the primary key.

---

## 6. Open questions and contested points

1. **"Interview" — wrong, or just segment-specific?** *Contested.* Fashion agencies never say it and IMG
   uses it as a scam marker ("*does not conduct interviews via Skype*"). But SMG (US commercial/child)
   says "*we will invite you for an interview*". **Conclusion: wrong for fashion, acceptable for US
   commercial/kids. Safer neutral word: "meeting".**
2. **"Board" vs "division".** *Regional/register split, not a disagreement.* "Board" dominates UK/EU/AU
   public and internal use (8 sources); "division" dominates software (Syngency) and Australia (Chadwick's
   `/divisions/`). Both are correct; "board" is more native to talent and bookers, "division" to admins.
3. **Does talent identify by board?** *Evidence is indirect but strong.* Boards are public URLs, have
   dedicated phone numbers, and promotion between them is visible. I did not capture verbatim model
   self-description ("I'm on the main board at X") from a primary source — models.com returned **403** and
   Instagram bios were not directly fetchable. **Treat as: highly likely, primary evidence thin.**
4. **Bookout.** I could not capture a verbatim vendor instance of the word "bookout"/"book out", despite
   it being standard booker vocabulary. Mediaslide/Syngency/AgencyPin marketing pages cover
   castings/options/jobs/charts but not unavailability explicitly. **Evidence thin — flag before relying
   on the exact spelling.**
5. **New Faces vs Development — same or different?** *Contested.* Secondary sources say interchangeable.
   But **primary URL evidence shows six agencies operating them as separate peer boards**: Viva has both
   `/new-faces/` and `/development/`; Milk has both `/section/new-faces` and `/section/curve-development`;
   Chadwick has both `/divisions/new-faces/` and `/divisions/development/`. **Conclusion: at small agencies
   synonymous; at large agencies "New Faces" = just signed / brand new, "Development" = signed and being
   actively invested in. Do not hard-code them as one concept.**
6. **Kids boards.** Not present in my 18-agency fashion sample (SMG, a commercial agency, handles children).
   Kids/child divisions are a commercial-agency structure, not a fashion-house one. **Under-sampled.**
7. **Asia.** Weak. Tokyo Models, Bananas, Donna, Oui, Brute all failed to fetch (§7). Asian market
   structure is represented here only indirectly, via mother-agency placement language ("*Tokyo, China,
   Seoul*"). **Do not generalise my board frequencies to Asia.**
8. **Comp card downloads.** Absent from all 18 public sites. I cannot tell from public evidence whether
   agencies expose downloadable cards *behind* client logins. **Open.**

---

## 7. Sources

### Primary — agency websites (all accessed 2026-09-03)

| # | Source | URL | Used for |
|---|---|---|---|
| 1 | Storm Management (UK) | stormmanagement.com — `/`, `/info/`, `/apply-to-become-a-model/`, `/mainboard/women/`, model profile `/mainboard/women/adual-akol/4082/` | Boards (mainboard/image/curve/new-faces), "Models Board"/"Talent Board" phone desks, application requirements, digitals wording, 30-working-day retention, "shortlisted", imperial-only stats |
| 2 | Premier Model Management (UK) | premiermodelmanagement.com — `/`, `/become/`, `/staying-safe/`, `/women/image/2811-luna-bijl/` | Boards (image/women/men/new-faces), `board-item` CSS internals, dual-unit stat toggle + `stats.php`, scam refusals, identity-verification guidance |
| 3 | Models 1 (UK) | models1.co.uk — `/`, `/contact` | `/women/image`, `/men/image`, `/talent/main`; **Mediaslide** footer credit |
| 4 | Select Model Management (UK) | selectmodel.com/london | CMS type `"__typename":"ModelBoard"`; nav labels incl. **"Non-binary"**; `/women/image/`, `/men/mainboard/`, `/talent/{creatives,digital,musicians-djs}` |
| 5 | The MiLK Collective (UK) | milkmanagement.co.uk — `/`, `/contact` | Board-keyed phone table (Fashion/Women/New Faces/Curve/Men/Talent); `/section/` boards incl. women-legacy, women-management, curve-main/development/new-faces; **Mediaslide** credit; BFMA + AI code links |
| 6 | IMG Models (US/global) | imgmodels.com — `/`, `/board/women`, `/recruitmentwarning/`, `/new-york-state-fashion-workers-act` | "Model / Development / Talent / Creator"; `/board/` URL; recruitment-scam refusals; public display of FWA licence |
| 7 | Wilhelmina (US) | wilhelmina.com/new-york | `women/image`, `women/main`, `women/development`, `women-direct`, `men/main`, `men/men`, `men/development` — **"Direct" board** |
| 8 | DNA Model Management (US) | dnamodels.com | `/div/` paths: women-main-board, women-development, men-main-board, men-development, **men-special-bookings**; seasonal **"Show Package"** PDFs |
| 9 | Next Management (global) | nextmanagement.com | Per-city boards: women, men, talent, creators, **artists** |
| 10 | Ford Models (US) | fordmodels.com | `/artists` |
| 11 | The Lions (US) | thelionsny.com | `/main` |
| 12 | Viva Model Management (Paris) | viva-paris.com — `/`, `/new-faces/`, `/contact/`, model profile `/new-faces/agathe-castelletta/3095/` | `main`/`development`/`new-faces`/`talent`; **metric-only bilingual stats**, FR/EN label pairs |
| 13 | Silent Models (Paris) | silentmodels.com | `/mainboard/women/`, `/new-faces/women/` |
| 14 | New Madison (Paris) | newmadison.fr | `image` / `management` / `development` / `newcomers` |
| 15 | Chadwick Models (AU) | chadwickmodels.com (sydney/melbourne/perth) | **`/divisions/` URL path**; main, image, new-faces, development, curve, classic, **non-binary** |
| 16 | Viviens (AU) | viviensmodels.com.au | women, men, classic, curve, **in-development**, mainboard, `/status/influencers/` |
| 17 | MMG Models (Dubai/AE) | mmgmodels.com | `/ae/category/men/`, `/ae/category/influencers/` |
| 18 | SMG Model Management (US) | smgmodels.com/apply | Commercial/child intake: 4 photos, ages 2–12, **"invite you for an interview"**, explicit no-fee statement |

### Primary — agency software vendors

| # | Source | URL | Used for |
|---|---|---|---|
| 19 | Syngency | syngency.com, syngency.com/mobile | "Divisions", "Talent Profiles", "Talent Package", "Casting Calls", "charts", "Galleries" (headshots/digitals/editorials/videos), "Advanced Talent Search" incl. social-media-follower filter, "by division, agent, model and category" |
| 20 | AgencyPin | agencypin.com | **"request, option, and confirmed"** statuses; "Talent chart"; "Packages workflow"; client responses "Interested / Maybe / Not interested"; "Applications — Collect talent applications online"; **"mother-agency and co-mother-agency statements"** |
| 21 | Mediaslide | mediaslide.com, /booking-system-model-agency/, /faq/ | "castings, jobs, and options"; **"Scouting management... track scouted models, and share proposals"**; "books" for portfolios; powers Models 1 + Milk websites |
| 22 | Netwalk | netwalk.eu | "Packages Tool", "Fast Package", "Talent Update System", "Models Browser", **"track proposed or introduced models"**, scouting map |
| 23 | ModelManagement.com | modelmanagement.com | Marketplace-side vocabulary: "Castings", "Post a casting", "Pro directory", "Rankings", "Digital Twins"; self-select roles incl. "I'm a Newcomer" |

### Primary — regulators and industry bodies

| # | Source | URL | Used for |
|---|---|---|---|
| 24 | NY DOL — Fashion Workers Act definitions | dol.ny.gov/new-york-state-fashion-workers-act-definitions | Verbatim statutory definitions: Model, Modeling Services, Client, Model Management Company, Model Management Group, **Exclusive Representation**, **Deal Memo**, Digital Replica |
| 25 | NY DOL — duties of model management companies and clients | dol.ny.gov/responsibilities-fashion-management-and-clients | Deal memo before work; final agreement within 7 days in model's chosen language; **20% commission cap**; written approval for deductions; digital-replica and explicit-content consent; client 1.5×/meal-break duties |
| 26 | BFMA Code of Practice (UK) | bfma.fashion/bfma-code-of-practice/ | **No measurements under 18 except height**; no bikini/lingerie digitals under 18; guardian signature; chaperoning; commission/statement transparency; model-voice AI clause |

### Secondary (corroboration only — labelled as such throughout)

| # | Source | Used for |
|---|---|---|
| 27 | amodelsdiary.blogspot.com — "Demystifying Modeling Agency Boards" | Board-tier definitions (main/new faces/development/image); "some use the word 'division' instead of the word 'board'" |
| 28 | Wikipedia — "Mother agent", "Comp card", "Modeling agency" | Mother-agency/placement mechanics; comp card synonym set |
| 29 | compcard.com, thelooksheet.com | Comp card = sed card = zed card = Z-card; Sebastian Sed etymology |
| 30 | ZipRecruiter / Indeed / EntertainmentCareers 2026 booker postings | Booker duties incl. "model booking charts"; titles in market |
| 31 | sandrareynolds.co.uk team page (via search) | UK title set: Managing Director, Head Booker, **Head of New Faces**, Senior Booker, Client Account Manager |
| 32 | backstage.com, mymodelreality.com | digitals ≡ polaroids; open-call mechanics |

### Failures / not reachable (2026-09-03)

- **models.com — HTTP 403** on both `/agency/` and `/agency/dna-models`. This was the biggest single gap:
  it is the canonical source for agency board listings and for how models' multi-agency representation is
  displayed. Worked around via search snippets only.
- **bookaface.com — domain parked for sale** (HugeDomains). Book a Face appears defunct; do not treat it
  as a live competitor.
- **netwalk.co — parked for sale**; the live product is **netwalk.eu**.
- Connection failures / 502 via proxy: tokyo-models.com, themodelwerks.de, brutemodels.com,
  oui-management.com, bananas-models.com, donna-models.com, priscillasmodels.com.au.
  ⇒ **Asia and Germany are under-sampled; Australia is covered via Chadwick + Viviens.**
- portfoliopad.com homepage carries no feature vocabulary; `netwalk.eu/features/scouting` and
  `syngency.com/features` returned 404.
- thelions.com resolved to an unrelated staffing site; used thelionsny.com instead.
- elitemodel.com 308-redirects to elitemodels.com, whose nav is location-first — no board names exposed
  without JS.

---

## 8. Direct answers to the audit questions

**"Roster"** — safe but shallow. Agencies say it externally about the whole agency. The failure is not the
word, it is a roster with **no board dimension**. A roster screen that cannot answer "show me Women / New
Faces" is missing the industry's primary organising key.

**"Signing board"** — **actively harmful.** "Board" is a taken word meaning *division*. "Signing board"
parses as "the division called Signing". Any kanban-style UI must not be called a board in this domain.

**"Pipeline"** — alien. Sales-CRM register. Agencies say *scouting*, *applications*, *coming in*. Netwalk's
native phrasing is "*track proposed or introduced models*"; Mediaslide's is "*track scouted models*".

**"Candidates"** — alien and slightly insulting. It implies a vacancy and an HR process. Agencies say
*applications*, *submissions*, *new faces*, or just "*people we're seeing*". The one status word agencies
actually publish is **"shortlisted"** (Storm).

**"Interviews"** — wrong for fashion (IMG treats "interview" as a scam tell), right for US commercial/child
(SMG says it). Use **"meeting"** if one word must serve both.

**The deepest structural mismatch:** most products model the pre-signing phase as a rich, persistent,
notification-bearing pipeline. Agencies model it as **near-nothing** — no reply is owed, no rejection is
sent, and in the UK/EU the data is deliberately deleted (Storm: "*no longer than 30 working days*"). The
rich, persistent, high-stakes data structure begins *after* the contract is signed and is organised by
**board** and by **chart**. A tool that inverts that weighting will feel, to a booker, like it was built by
someone who has never sat on a board.
