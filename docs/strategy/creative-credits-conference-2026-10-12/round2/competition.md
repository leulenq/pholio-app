# Round 2: Competition

Note: the web-search budget ran out mid-round. New facts come from fetching vendor pages directly, and anything unchecked is marked.

## 1. Attack on Candidate A (which I backed in round 1)
New research shows **Kavyar already does most of what A says it will "replace"**, and it charges both sides. From its help centre ([index](https://help.kavyar.com/category/l0kij2tfxn-for-publishers)):
- **Mandatory team credits.** Every photo must carry team credits: a "Contribution" plus an Instagram handle, linked to the collaborator's Kavyar profile ([FACT](https://help.kavyar.com/article/jzdbs3f6zg-how-to-add-team-credits-to-a-photo)). I found no acceptance step, so these credits are asserted by the submitter.
- **Publisher-issued proof.** Publishers upload **tear sheets** onto the accepted submission, with optional release dates ([FACT](https://help.kavyar.com/article/2emntp7tip-adding-tearsheets-to-a-submission)). Release forms are attached to the submission ([FACT](https://help.kavyar.com/article/xnwwn4z1m6-how-to-upload-a-release-form)).
- **Issuer-confirmed representation.** Agency rosters run Confirmed, Unconfirmed and Denied claim states set by the agency owner ([FACT](https://help.kavyar.com/article/yskdyinuwq-what-are-agency-rosters)).
- **Most of C's surface, too.** Kavyar also offers model digitals, walk videos, jobs in NYC and Chicago, a portfolio website and bio link, and public and private reviews.

What this means for A:
- **A's magazine leg fights a funded, two-sided incumbent**, which leaves events and schools.
- **The event market is tiny.** Money's own price ("$20 per designer slot … FWB ~$800 a season") makes it a lifestyle line: 50 FWB-sized organizers bring in about $80k a year. [ASSUMPTION on organizer count]
- **A fails the founders' goal.** A creative gets one or two event credits a year, which is a record of events rather than of a person's work. The moderator is right: A is "independent casting software" again.

## 2. Attacks on named delegates
- **VC:** "an open call that replaces Google Forms and Kavyar."
  - Replacing Google Forms is plausible. Replacing Kavyar is not: it has payouts, upsells, exclusivity periods and a $99–$2,400+/mo publisher price ladder, and nothing in our codebase competes with that.
  - Pholio should **feed** Kavyar, not replace it.
- **Devil:** "Instagram strips C2PA, so Pholio signs at capture and becomes the origin."
  - Signing at capture is commoditizing at the OS and SDK layer. [ASSUMPTION, recalled and not re-verified this session] Google's Pixel 10 camera attaches Content Credentials to photos by default, and Truepic and ProofMode sell or give away capture-signing SDKs.
  - Identity is already sold by CLEAR, Persona and LinkedIn's 100M+ verified members ([R1 §8](research/R1-credit-systems.md)).
  - C's defensible part is not the cryptography. It is getting placed inside an intake flow. In fashion that slot belongs to Kavyar (digitals, walk videos) and, for agencies, to existing roster software.
  - [NOT FOUND] Whether Casting Networks or Spotlight verify media at capture. I could not confirm either way.
- **Growth:** "Source them from Kavyar-published NYC editorials."
  - Those 15 seed producers already credit their teams in Kavyar, because it is required. The team sheet only wins if it **outputs** a Kavyar-ready credit block; otherwise it is double entry.
  - Growth's K-factor bet assumes invitees organize productions. I found no evidence of how often NYC fashion shoots assemble rosters, or with what tool.
  - StudioBinder and SetHero both position on film, TV, commercials and music video, and fashion and photo are absent from their segment lists ([SetHero](https://sethero.com/pricing); StudioBinder bills itself as "Film & TV Production Management Software"). [INFERENCE] The photo and fashion team sheet has **no incumbent tool**. It lives in DMs and group chats. That is either an opening or a sign the pain is too small to buy a tool for, and only the 15-producer test can tell which.

## 3. Scores (1–10)

| | Recurring pain | Used twice | Compounds | Revenue, no money handling | Defensibility | Fidelity to "record of actual work" | Total |
|---|---|---|---|---|---|---|---|
| **A** Issuer desk | 5 | 3 (2 seasons/yr) | 3 | 6 | 4 (Kavyar owns magazines) | 4 | 25 |
| **B** Team sheet | 6 | 7 | 7 | 3 | 3 (Kavyar credits, IG collabs, Visie, Mosaic) | 8 | 34 |
| **C** Capture-verified file | 7 (hirer side) | 5 | 3 | 6 | 3 (Pixel/C2PA, CLEAR, Kavyar digitals) | 3 | 27 |
| **H** Confirmed production record | 6 | 7 | 8 | 5 | 6 | 9 | 41 |

## 4. Revised position: H, the confirmed production record
**What changed:** I drop A as the thesis and keep it only as the first heavy user. I drop the magazine-issuer leg, because Kavyar owns it.

**The core object is a production** (a shoot, a show or a video), opened by whoever assembled the team:
- Every member **confirms** their own role before anything is public. That is the gap: Kavyar credits are asserted by the submitter, Instagram caps collabs at 6, and Mosaic needs a brand's company email, which hirers say legal will never allow.
- The production's outputs:
  - an **embargo vault** that holds credits private until a release date (nobody else offers this)
  - a paste-ready caption block
  - a **Send-to-Kavyar credit block**
  - after release, a public credit page
- **FWB runs each show as one large production** and adds an "Issued by" line.
- **Digitals** are an optional, dated attribute of the person, not the product.

**Defensibility claim [BET]:** confirmed-before-publication plus embargo is the one combination that neither Kavyar (a publishing rail), Instagram (a posting rail) nor Mosaic (brand authentication) is built to do.

**Kill:** fewer than 5 of 15 seed producers open a second production unprompted within 30 days. Search seats stay dead.

## 5. Question
**Creative:** how many shoots a month do you or your photographer friends assemble a team for, and do you already type their credits into Kavyar? If Kavyar is the only place you type credits, why would you type them into Pholio first?
