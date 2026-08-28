# Banned language and the reasons it is banned

> **Shared layer.** An identical copy lives at `pholio-site/.claude/skills/pholio-site-language/references/banned-language.md`.
> Edit both together; divergence between the copies is a defect.
The negative space is load-bearing. Pholio's audience is pre-warned and
actively verifying; the words below are how they detect predators, and two
state statutes regulate several of them directly. Bans are listed with their
reasons because the skill must recognize the *speech act*, not just the
string: "Let's get you seen" contains no banned word and is still the banned
act.

Precedence: this file outranks any benchmark-derived or convention-derived
suggestion. Industry-convention evidence and compliance evidence can point
opposite directions on the same word; when they do, compliance wins
(lessons.md §23, the "Get Scouted" reversal).

---

## 1. The statutory layer (what claims are regulated)

Not legal advice; product law as the strategy documents record it.

**California, Krekorian Talent Scam Prevention Act (Lab. Code §§1701-1702.1).**
§1702.1 bans providing or *advertising* procurement of employment, auditions,
or talent agents while charging for photographs, websites, or promotional
materials. Comp cards are promotional materials; portfolio pages are
websites; "apply to agencies" adjacent to a paid tier reads as procuring
representation. §1701 separately regulates paid "storage or maintenance for
distribution" of an artist's materials (the talent listing service: $50k
bond, refund rights, prescribed disclosures). Consequence for copy:
**never imply payment increases reach, distribution, visibility, or odds**,
and never advertise Pholio as a way to obtain representation.

**New York.** GBL Art. 11 licenses anyone who "for a fee, procures or
attempts to procure employment or engagements", models expressly included.
The Fashion Workers Act adds "vocational guidance or counseling services to
models for a fee" with no placement element: paid advice, paid readiness
coaching, paid AI feedback all flirt with it. Consequence: **anything that
reads as advice is free**, and copy never implies Pholio finds anyone work.

**FTC.** §5 deception: no claim that Studio+ improves visibility, ranking,
review speed, or selection odds; no success-rate or discovery-odds claims
without substantiation. Reviews Rule: no unsubstantiated success-story
marketing. The FTC's own consumer education states "paying to get a job is
always a sign of a scam"; Pholio's copy must never occupy that shape.

**The bright line in one sentence:** Pholio may sell tools and property the
talent keeps, and may transmit free applications; it must never sell, or
imply it is selling, access to jobs, auditions, visibility, or "getting
signed".

## 2. The never-say list (owner- and strategy-settled)

From the strategic analysis §9.1, verbatim: never say **"get discovered"**,
**"get scouted"**, **"get signed"**, **"boost your chances"**. Scam-coded,
FTC-exposed, statute-adjacent in two states. Every predatory product in the
competitor corpus uses this family (Snapcast, ModelManagement.com, a product
literally named Get Scouted).

Generalize to the speech act: **any sentence whose subject is the talent's
future visibility, discovery, or signing, with Pholio as the cause.** Test:
does the sentence promise or imply an outcome Pholio does not control
(replies, meetings, representation, fame, income)? Then it is banned in any
wording. "Let's get you seen", "your big break", "we'll put you on the
map", "they're waiting for you" all fail this test with clean vocabularies.

What is allowed: mechanism statements that are literally true and bounded.
"Your application is delivered to the agency you chose" describes transport.
"Pholio puts your work in front of vetted agencies" is at the boundary:
acceptable only where the surface is factually about submission delivery,
never as a general promise of attention.

## 3. The scam lexicon (pattern-matched instantly by the warned)

From FTC guidance, agency scam warnings, and community folk-knowledge. These
patterns mark predators; some are also how legitimate copy gets mistaken for
predation.

| Pattern | Example | Why it is fatal |
|---|---|---|
| Discovery rhetoric | "get discovered", "you've got the look", "we came across your profile" | The scam opener; unsolicited flattery is the FTC's own first red flag |
| Guarantee rhetoric | "guaranteed work/exposure", "instant fame", "real opportunities" | Legit agencies promise only to look; nobody credible guarantees |
| Urgency and scarcity | "limited spots", "apply before it closes", "once-in-a-lifetime" | "Scams pressure you, real agencies give you time" is taught by every safety source |
| Exposure as currency | "great exposure!", "get seen by top casting directors" | "Exposure doesn't pay rent" is a community stock phrase; also the pay-to-play lawsuits' vocabulary |
| The relocated fee | "portfolio package", "registration", "secure your spot", fee as "investment" | The one universal heuristic: a real agency makes money when you make money |
| Flattery of the reader | "you have great potential", "we think you're special" | Selection implied where none occurred is the Barbizon mechanic |
| Selectivity theater | "you must be specially selected for our program" | FTC-catalogued script; they accept nearly everyone |
| Dream vocabulary | "dream", "chase your dreams", "become a star" | Sells the fantasy self; the credible register addresses a working professional |
| Member-count proof | "join 50,000 models" | Predators count members; credible platforms count work done |

## 4. The generic-slop layer (reads as generated, therefore untrustworthy)

From `docs/design-language/03-banned-ui.md` §9, binding on the public site,
and extended here to all Pholio copy:

- **No em-dashes in published copy.** Zero. Restructure, or use a comma,
  colon, or parentheses. (Legal documents exempt.)
- **No rule-of-three cadence repeated.** One staggered triplet per page at
  most; vary sentence length deliberately.
- **No "not just X, but Y".** No "delve", "seamless", "elevate", "unleash",
  "revolutionise", "empower", "navigate the complexities", "in today's
  landscape". Also, from the model-cynicism research: no "democratize".
- **No invented numbers.** No "10,000+ talent", no "98%", no fake precision.
- **No urgency or scarcity language** (doubly banned: slop and scam).
- **No vague trust adjectives.** "Secure", "trusted", "safe", "legit",
  "world-class", "industry-leading". Say the falsifiable thing: "Applying is
  free." "Agencies are reviewed manually." "You can withdraw a submission."
  Trust is mechanical or it is fake.
- **No performative-craftsman labels, no mock-humble asides, no "quietly".**
- **No generic step labels** (Step 1/2/3); the step's verb is the label.
- **No emoji.** Anywhere.
- **No "Unlike other platforms..."** Protesting re-raises the suspicion;
  disavow the mechanism, not the reputation (see this skill's mechanics reference).
- **Boring and correct beats clever and hollow.** Read every string cold.

## 5. Vocabulary with sharp edges (allowed, but handle precisely)

- **"Free."** True and central, but scrutinized: predatory funnels start
  free. Near every load-bearing "free", say why or what it means
  mechanically ("No fee to submit. No paid visibility." / "Agencies are
  never charged"). Never "100% free!".
- **"Opportunity."** Predator noun in marketing ("amazing opportunity!").
  The app's own CI denylist bans "opportunit-" on the requirements surface.
  In legal/consent copy ("Talent Submission and Opportunity Notice") it is
  contract vocabulary and stays. Marketing surfaces: avoid.
- **"Apply."** Correct and central (the CTA is "Apply free"). But never
  "apply now" (urgency) and never with an implied outcome attached.
- **"Verified" / "vetted".** Only for things Pholio actually verified, with
  the mechanism nearby (registry-backed, hand-checked, dated). "Verified"
  as an adjective without a mechanism is a trust adjective (banned above).
- **"Unretouched."** Only as "declared unretouched" unless Pholio itself
  verified it. Same discipline for any state Pholio records but does not
  confirm.
- **"AI."** Pholio's brand posture: it is not "AI-powered" anything
  (lessons.md §12.6). The product's intelligence is expressed through what
  it does (reads, places, checks, composes) with a concrete receipt. The
  words "AI" and "artificial intelligence" belong in the AI Notice and
  consent surfaces, where precision is legally required, and stay out of
  marketing headlines.
- **"Exposure", "visibility", "reach".** Never as things Pholio provides or
  sells. Describing the mechanics of a share link the talent controls is
  fine; promising audience is not.
- **Superlatives.** Structural ones only, and only if factually checkable
  ("the only", "the first" require proof). Emotional superlatives
  ("amazing", "stunning") never.

## 6. The enforceable-denylist precedent

The app already enforces language rules in CI: the MarketCoverage surface
may never render (case-insensitively) `unlock, boost, chance, odds, improve,
qualify, opportunit, score, %, ready, recommend, should, upgrade, Studio+`,
because, per the test's own header, "every one of them turns a reading of
published documents into advice, a score, or a gate."

Generalize the technique: when writing copy for a surface with a hard
compliance shape (requirement pages, anything near payment, anything near
minors), propose the denylist with the copy. A rule that can be a test
should become one.

## 7. Quick screen (run against any draft)

1. Does any sentence promise or imply an outcome Pholio does not control?
2. Does any sentence connect payment to reach, visibility, speed, or odds?
3. Does anything flatter the reader or their potential?
4. Any urgency, scarcity, or countdown shape?
5. Any trust adjective without a mechanism in the same breath?
6. Any invented or unverifiable number?
7. Any em-dash, emoji, or slop verb (seamless/elevate/empower/unlock)?
8. Any "free" without its why nearby?
9. Does "verified/vetted/unretouched" have its verifying mechanism stated?
10. Would this sentence be at home on Snapcast, ModelManagement, Barbizon,
    or a fee-funnel landing page? If yes, cut it regardless of which rule
    it technically passes.
