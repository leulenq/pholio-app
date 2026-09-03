# R1 — How agencies take in new talent: the inbound / submission side (as of 2026)

Research lane: intake / submissions. All primary sources fetched live **2026-09-03** unless noted.
Sample: **24 agency intake surfaces** across US / UK / DE / ES / IT / JP, tiers from top-tier fashion to
regional commercial to curve and kids specialists, plus one regulator (NY DOL) and one agency-software
vendor. models.com was not used (403s through the proxy, per brief); several agencies failed to fetch and
are listed in §7 as failures rather than silently dropped.

---

## 1. Summary of the mental model (the practitioner's own frame)

An agency's inbound channel is **not an application to a job**. It is a **look submission for a first
screening**. The practitioner frame, stated almost identically across tiers:

> "We will do a first screening based on the information supplied by you and, should we deem it
> interesting to go further, we will propose you a meeting in our offices."
> — The Society Management, "Information to the applicant", `thesocietymanagement.com/become-model.web`

Three structural facts drive everything about the form design:

**(a) The submission is a measurement instrument, not a portfolio.** Every agency in the sample tells the
applicant to *strip out* the things a normal creative application would add: no makeup, no styling, no
retouching, no filters, no smiling, no posing, no professional photographer, no baggy clothes. ONE
Management states the purpose outright: *"Your submission will allow us to see you as a blank canvas"* and
*"These images help document your look for us - much like a passport photo does."* Ford's headline for the
same thing: *"We don't want to see you in your fanciest outfit with lots of makeup on. We are looking for
you at your most natural."* The agency is trying to see an unmodified body and face so it can predict how
that person photographs for a client. Anything that improves the photo degrades the instrument.

**(b) Volume dictates a silent-rejection default.** Nobody in the sample promises a response to everyone.
The universal convention is contact-if-interested, and the more explicit agencies convert the silence into
a deadline (§3). ONE goes furthest: an automated receipt email *"is the only communication you will receive
from us regarding your application"*, followed by *"Please do not email or call us to inquire about the
status of your application."*

**(c) Intake is a legal-risk surface, so it is heavily instrumented for minors, fraud, and data
retention.** Roughly every serious agency page carries three blocks the applicant did not ask for: an age
gate, an impostor/recruitment warning, and a data-retention statement. Storm auto-deletes unsuccessful
applications after 30 days; Society after 6 months; IMG says application photos are *"securely deleted from
our system"* after evaluation. In New York this is now backed by statute — the Fashion Workers Act
(eff. 19 June 2025) makes fee-taking at intake/signing unlawful and requires model management companies to
register with NY DOL (deadline 21 Dec 2025).

The practitioner therefore reads an inbound submission in roughly this order: **market/board fit → age and
guardian status → height/measurements gate → the four photos → social handles → everything else.** The
free-text "tell us about yourself" is read last and rarely decides anything; multiple agencies do not ask
for it at all.

---

## 2. Vocabulary table

Evidence counts are out of the 24 intake surfaces sampled (§7). "Verbatim example" is quoted from the page.

| Term | Meaning | Who uses it | Region | Count | Verbatim example + URL |
|---|---|---|---|---|---|
| **Get scouted** | The act of submitting yourself for consideration | Agency → aspiring talent | US-led, now global | 9 | "GET SCOUTED … Interested in becoming an IMG Model? Get scouted by completing the form below and submitting your photos where requested." — getscouted.imgmodels.com |
| **Become a model** | Same act, softer/older phrasing | Agency → aspiring talent | UK/EU-led | 8 | "Become A Model … Want to become a model with Wilhelmina?" — wilhelmina.com/become-a-model |
| **Apply / Application** | Same act, procedural framing | Agency, both sides | UK, AU, commercial US | 9 | "Online Application … Before You Begin" — stormmanagement.com/apply-to-become-a-model |
| **Submission / Submit** | The artifact (the photos+stats package) and the act | Agency internal + public | US | 6 | "PHOTO SUBMISSIONS … You can submit your pictures for review by sending them to: submission.women@dnamodels.com" — dnamodels.com/submissions |
| **Open call** | Scheduled walk-in window where anyone may present in person | Agency → talent | US + UK | 4 explicit, 2 explicit denials | "UPCOMING OPEN CALL DATES / Thursday, September 24th 1PM-4PM" — theagencyaz.com/pages/get-scouted |
| **Walk-in** | Same thing, UK phrasing | UK agencies | UK | 2 | "Our London office welcomes walk-ins during the following hours: Monday to Friday: Morning 10:30 AM - 12:30 PM / Afternoon 2:00 PM - 5:00 PM" — stormmanagement.com/info |
| **Board** | The roster subdivision a model sits on | Agency internal, leaks into forms | Universal | 7 | "please select a board — Women: Image / One.1 / Development / Curve / Studio; Men: Image / Main / Development; Talent; Engagers" — onemanagement.com |
| **Division** | Same as board; more common in US forms | Agency → applicant | US | 4 | "6. WHICH DIVISION WOULD YOU LIKE TO JOIN? women / men / I also want to be considered for the Sports+Fitness Division (US Only)" — wilhelmina.com/become-a-model |
| **New Faces** | Board for newly signed, undeveloped models | Agency public site | Universal | 8 (board labels) | "Women / Curve / Image / Mainboard / New Faces" — stormmanagement.com nav |
| **Development** | Board for signed-but-not-yet-working talent | Agency | US/UK | 5 | "WOMEN main board / development" — dnamodels.com |
| **Main board / Mainboard** | The working roster | Agency | Universal | 6 | chadwickmodels.com nav; dnamodels.com; fashionmodel.it "MAIN BOARD" |
| **Image** | Top editorial board above main | Agency | Universal | 5 | "Women: Image / One.1 / Development / Curve / Studio" — onemanagement.com |
| **Digitals** | Clean, unstyled reference photos of a *signed* model, reshot periodically | Agency internal, bookers, clients | Universal | 2 (both internal, 0 in public instructions) | Mediaslide picture-category on a live Uno model profile: `"link_model_picture_category_picture_category":"Digitals"`, `"…name":"Jun26"` — unomodels.com; `.modal-digitals` CSS class — nextmanagement.com |
| **Polaroids** | Historic synonym for digitals; still used by veteran bookers and curve/commercial agencies | Agency, talent | UK/EU skew | 1 in sample | "Next would be taking your polaroid's and measurements and researching relevant agencies" — bridgeagency.com/news/application-faqs |
| **Snapshots** | What agencies call the submission photos when addressing parents | Agency → guardians | UK | 2 | "We prefer natural snapshots taken in daylight, on a plain backdrop" — stormmanagement.com/legal/under-18-applicants; near-identical wording in IMG's under-18 FAQ |
| **Books open / books closed** | Whether the agency is currently accepting into a division | Agency, kids/commercial esp. | UK | 2 | "Books Open" (division status label) — bizzykidz.com/apply-to-join; "our books are always open for lovely new children to apply" — sandrareynoldsjuniors.co.uk |
| **Scout** | A person who finds talent; also the verb | Agency | Universal | 8 | "We scout models through our social media channels - @onemanagement (verified)…" — onemanagement.com/submissions/warning |
| **Mother agency** | The agency that discovers/develops a model and places them with agencies in other markets | Agency, models | Universal | 0 in intake pages (asked indirectly) | Proxied by "Do You Already Have Representation?*" — elitemodels.com/become-elite; "currently_signed" form field — bridgeagency.com/apply |
| **Applicant** | What the agency calls the person *before* any interest | Agency → self and lawyers | Universal | 6 | "APPLICANT FIRST NAME" / "The applicant should be at least 14 years old." — getscouted.imgmodels.com; "Information to the applicant" — thesocietymanagement.com |
| **Aspiring model / aspiring talent** | What the agency calls the person in safety copy | Agency → public | Universal | 6 | "The safety and well-being of aspiring talent is ONE's top priority." — onemanagement.com |
| **Prospect** | *(not observed)* | — | — | 0 | Not used on any sampled public intake page |

### Terms an outsider uses that would make a booker flinch

| Outsider phrasing | Why it's wrong | What the industry says instead |
|---|---|---|
| "Upload your **portfolio**" at intake | A portfolio/book is what a *signed* model builds after signing. Premier lists needing one as a **scam marker**: legitimate scouts will never *"Need you to submit a portfolio of modelling work to apply."* Heroes goes further: *"we encourage aspiring models not to pay for portfolio images, as all you need to apply are natural pictures from a phone."* | "photos", "images", "pictures" |
| "**Résumé / CV / cover letter**" for a fashion submission | Absent from every fashion-board form sampled. Only the **commercial/actor** lane asks: Wehmann ("Resume ( max file size: 2MB )", PDF), The Option Agency's actor track, Bizzykidz' actor divisions. Asking a 16-year-old fashion applicant for a CV signals you don't know the business. | measurements + 3–4 photos + socials |
| "**Headshot**" as the single required image | In fashion a headshot alone is useless — the body is the product. Every fashion form demands a set covering face *and* proportions. "Headshot" as *the* deliverable is actor/commercial vocabulary. | "close up / profile / waist-up / full length" |
| "**Casting**" for the act of applying | A casting is a client-facing selection for a specific job. Applying to an agency is a *submission* or *open call*, never a casting. Ford's warning even uses casting in its scam line: *"You should never pay to attend a casting."* | "submission", "application", "open call" |
| "**Audition**" | Performing-arts vocabulary; no fashion agency sampled uses it. | "go-see", "casting" (client side only) |
| "**Talent profile is 100% complete!**" gamification | Nothing in the sample rewards completeness; several actively penalise padding. ONE: *"an application that is filled with unreliable data will not be reviewed."* | — |
| "**Your application is under review by 3 agencies**" | Agencies do not disclose pipeline state at all; ONE explicitly refuses to. A status tracker implies a service level nobody offers. | silence, then contact-if-interested |
| "**Book me**" / "hire me" from an unsigned person | Booking is what clients do to signed talent through a booker. | — |
| "**Model card / comp card**" at intake | A comp card is a *post-signing* marketing artifact printed from a model's book. Only two sampled pages mention one — both as something the agency *provides after signing* ("Free Z-Card", bizzykidz.com). Asking an applicant to attach one inverts the sequence. | — |
| "**Modelling school / course completed**" as a credential | Not asked anywhere in the sample; strongly scam-coded (a paid-course upsell). | — |
| "**Sign up**" / "register" / "join the network" | Reads as a paid-directory service. Legit agencies say apply / submit / get scouted. Fashion Model Management leads its page with *"DISTRUST people who promise that you can be a model paying a fee."* | — |

**Regional notes on vocabulary.** "Get scouted" is the dominant US label and has been exported (Fashion
Model Management Milan, Heroes NY, The Agency Arizona, Ford, IMG). UK sites more often say "Apply" (Storm,
Models 1, Milk, Nemesis) or "Become a Model" (Premier). Japan's Bravo uses a bilingual bespoke label
"BECOME BRAVO" with 応募資格 ("application eligibility") / 応募フォーム ("application form"). Spain's Uno
uses "Become a Model" for models and "Become a Talent" for creators — a distinct second lane.

---

## 3. Workflow / state model, as practitioners describe it

The lifecycle below is assembled from agencies that publish their process (ONE, Society, Bridge, Storm,
IMG, Wehmann, Nemesis, Bravo). Where they disagree, both readings are shown.

```
                  ┌─────────────────────────┐
   applicant ────►│ 1. SUBMISSION RECEIVED  │  auto-receipt email (ONE, Elite) or nothing at all
                  └───────────┬─────────────┘
                              │  "Submitting your application is the first step in our review process."
                              ▼
                  ┌─────────────────────────┐
                  │ 2. FIRST SCREENING      │  by an "applications team" (Bridge) or scouting team (IMG)
                  └───────────┬─────────────┘
                    ┌─────────┴──────────┐
                    ▼                    ▼
       ┌────────────────────┐   ┌─────────────────────────────┐
       │ 3a. NO OUTCOME     │   │ 3b. INTEREST                │
       │  (silence)         │   │  invite to meet / video call │
       └─────────┬──────────┘   └──────────────┬──────────────┘
                 │ data deleted:                │  guardian must attend if minor
                 │  Storm 30 days               ▼
                 │  Society 6 months  ┌────────────────────────────────┐
                 │  IMG "after eval"  │ 4. MEETING / OPEN CALL / TEST  │
                 ▼                    └──────────────┬─────────────────┘
        reapply later (Bridge: "welcome                │
        to reapply in six months time")                ▼
                                      ┌────────────────────────────────┐
                                      │ 5. SIGNING → placed on a BOARD │
                                      │   New Faces / Development      │
                                      └────────────────────────────────┘
```

**Who acts at each step.**
- Steps 1–2 are entirely agency-side and invisible to the applicant. Bridge names the actor:
  *"Your application comes through to our applications team and that's where it will get reviewed!"*
- Step 3b is always **agency-initiated**. No sampled agency lets an applicant request a meeting, schedule
  a call, or escalate. ONE: *"if we want to learn more about you, we will contact you."*
- Step 4 for minors is guardian-gated: Storm and IMG both state *"a legal guardian must accompany minors
  to any in-person meetings or video calls."* Storm additionally requires guardian **ID upload** at
  application time for under-18s, and guardian ID shown in person for walk-ins.
- Step 5 is where a contract exists. Storm's under-18 FAQ describes the meeting content: *"we will tell
  you about the modelling industry, the agency, introduce you to the team, explain what it means to be
  represented by Storm Models and discuss your development process."* Wehmann's is more commercial:
  *"you will find out how the business works, discuss payment and commission structure, clients we work
  with, the time it takes to get established."*

**How outcomes are communicated — verbatim, ranked by explicitness.**

| Pattern | Verbatim | Source |
|---|---|---|
| Silence = rejection, with a clock | "The team will usually get back to you within a week - unfortunately if you haven't heard back in a week then your application has not been successful. However, you are welcome to reapply in six months time!" | Bridge Agency FAQ |
| Silence = rejection, with a clock | "Applications are reviewed regularly. If you have not received a response within two weeks of submitting your application, please assume that your application has been unsuccessful on this occasion." | Nemesis Models |
| Contact-if-interested + window | "Unfortunately due to the volume of submissions, we are unable to respond to all inquiries. If you have any interest from our team, you should expect to receive a response within one or two weeks of your submission." | ONE Management FAQ |
| Contact-if-interested + window | "Allow 2-3 weeks for review. We will only contact those individuals we are interested in seeing for an appointment." | The Agency Arizona |
| Shortlist-only | "Due to the volume of applications, we will only contact those who have been shortlisted. Thank you & good luck." | Storm Management |
| No individual replies | "Due to the high number of applications that we receive daily, we are unable to respond to every application individually. A member of our team will be in touch if we wish to take your application further" | The MiLK Collective |
| No individual replies | "Due to the high volume of applications we receive we are unfortunately unable to get back to unsuccessful applicants." | Bridge Agency (apply page) |
| Conditional | "someone will be in touch with you if we feel that you have the right look for us" | Wilhelmina |
| Conditional | "If your profile aligns with what we're looking for, a member of our team will contact you shortly." | Elite Models (post-submit modal) |
| Fast, positive-only | "If we are interested, we will contact you within 3 business days." | Uno Models |
| Pass-only, no phone follow-up | "書類審査を通過した方へのみ電話またはメールにてご連絡させていただきます。電話での合否の確認はお受けできかねます。" — only those who pass the document screening will be contacted by phone or email; we cannot accept enquiries about the result by phone | Bravo Models Tokyo |
| **Guaranteed reply to everyone (outlier)** | "Our team carefully reviews every submission and will respond within 7-10 business days." | Wehmann (commercial/talent, Minneapolis) |
| Status queries explicitly forbidden | "Please do not email or call us to inquire about the status of your application - we will be in touch with you if we have an interest." / "Please refrain from sending multiple follow-up emails as all applications do get reviewed." | ONE Management; Bridge Agency |

**How common is each outcome?** No agency in the sample publishes a rate, and I found no primary
statement of one — this is a real evidence gap. The only quantitative signal located is *secondary* and
weak: a booker on the Fashion Spot forum describing signing roughly three new faces per month to their
board, market-dependent. What *is* firmly evidenced is the shape of the distribution rather than its
numbers: eleven of twenty-four surfaces pre-emptively explain that most applicants will hear nothing, two
set an explicit "assume no" deadline, one forbids status enquiries, and only one (a commercial agency,
not a fashion board) promises to answer everybody. Treat "vast majority receive no reply" as
well-evidenced; treat any specific percentage as unevidenced.

**What is reversible / what obligates.**
- A submission obligates the agency to **nothing**, and several say so structurally (auto-delete after 30
  days / 6 months means the artifact literally ceases to exist).
- The applicant is not exclusive to anyone by submitting, and can submit to many agencies. Two agencies
  nonetheless ask about existing representation at intake — Elite ("Do You Already Have Representation?*")
  and Bridge (`currently_signed`) — because a signed model must be approached through their mother agency,
  not poached.
- Reapplication is normal and explicitly permitted (Bridge: six months).
- **Signing is the only step that creates obligations**, and in New York those are now statutory: max 3-year
  exclusive term, no automatic renewal, commission capped at 20%, deal memo before work, and **no fee or
  deposit at signing** (NY DOL FWA FAQs).

**"Keeping on file."** I searched all 24 captured surfaces for "on file" / "keep your details" language and
found **zero** instances. Instead of a file-keeping promise, serious agencies publish a **deletion**
promise. The one hedged exception is Society: *"There might be exceptions, in cases in which, though we not
be immediately interested, we might wish to meet you in the future. We will inform you and your
parent/legal guardian, should this be the case."* Product implication: "we'll keep you on file" is a
sympathetic-sounding phrase that legitimate 2026 agencies have largely replaced with a retention limit.

---

## 4. Data conventions

### 4.1 The photo set — the single most standardised thing in the industry

**Count.** Three or four. Twelve of the fourteen forms with upload slots require exactly 3 or 4.
- **Four** (full length, waist-up, close-up, profile): Wilhelmina ("close up / Profile / Waist-up /
  Full-length"), ONE ("full length, waist up, close up, and profile"), Heroes (same four), Viva
  ("Full-Length / Waist-Up / Close-Up / Profile"), Ford (four per its published tips), The Option Agency
  ("Four photos that show your true self"), Uno (by email: "close-up, waist up, full body, and
  three-quarter profile").
- **Three** (headshot, profile/mid, full length): Storm ("Headshot / Mid length / Full length"), Premier
  ("Head Shot / Side Profile / Full Length"), IMG ("upload head shot / upload profile / upload full
  length"), Models 1 ("three photos"), MiLK ("1 headshot, 1 side profile picture and 1 full length"),
  Nemesis ("Headshot / Mid Length / Full Length"), Society ("full-length, close-up, and profile").
- **Six (outlier, Elite):** "Full length / Full length profile / Portrait length / Close up (hair pulled
  back) / Close up profile (hair pulled back) / **Personality pic**" — Elite is the only agency sampled
  that asks for a deliberately *un*-neutral image alongside the neutral set.
- **Two minimum, four max (BMG):** `Image_1*`, `Image_2*`, `Image_3`, `Image_4`.
- **Bravo (Tokyo):** バストアップ / Waist up + 全身 / Full length — two.

**Framing vocabulary, ranked by frequency across the sample:** *full length* (13) > *close up* (8) ≈
*headshot* (7) > *profile* / *side profile* (12 combined) > *waist up* (6) / *mid length* (3) >
*three-quarter profile* (1) > *portrait length* (1) > *personality pic* (1).

**Makeup.** Prohibited, near-universally and in the imperative: "Do not wear makeup" (Society), "Please
avoid wearing baggy clothing, make-up, or smiling" (IMG), "Wear no make-up" (Models 1), "Have a clean face
with absolutely no makeup" (Ford), "Present yourself without makeup and with natural hair" (Storm), "no
makeup or digital filters" (Viva), "Don't wear make-up, sunglasses, or hats" (MiLK), "no makeup, no baggy
clothing, and no poses" (ONE), "Please do not wear any makeup or large accessories for instance hoop
earrings or bracelets as they may be distracting" (Elite). **Contested single-agency quirk:** Bravo Tokyo's
English text says *"Have a clean face with natural makeup"* while its Japanese says
ノーメイクかそれに近いもの ("no makeup or close to it") — a softer Japanese-market norm.

**Smiling.** Explicitly banned by five: IMG ("or smiling"), Storm ("Keep a neutral facial expression
without smiling or pouting"), Elite ("No smiles!"), Heroes ("No smiles"), ONE ("no smiles or selfie style
poses").

**Clothing.** Form-fitting, and the reason is always stated: "Wear a form fitting outfit like skinny jeans
and a tank top. We need to see the shape of your body." (Ford); "please wear form fitted clothing so that
we can clearly see your body shape" (Elite); "A white t-shirt/tank top and skinny jeans are ideal" (ONE);
"Wearing a vest top and slim fitting jeans is fine" (Models 1); "Opt for well-fitted clothing" (Storm);
"Avoid baggy clothes, dresses, and skirts" (Viva); "Frame fitted casting outfit… great fitted jeans or
leggings, and a tee or tank" (The Agency Arizona). Society is the deliberate outlier, inviting personality:
*"Wear either form-fitting clothing and/or your favorite outfit, since we would love to see your personal
style!"*

**Swimwear/lingerie — a live split.**
- **Banned by the fashion mainstream, and framed as a safety rule:** "Please do not submit photos wearing
  swimwear or underwear" (Models 1); "Don't submit any lingerie, swimwear, or bikini images" (MiLK);
  "No nudity / no explicit images" (Bridge); and the near-universal safety line "We never request photos in
  the nude or lingerie" (ONE, IMG, Ford, DNA, Heroes, Premier).
- **Requested by one commercial agency:** Nemesis (Manchester) — *"try to include at least one full-body
  photo in swimwear or sportswear."* This is a genuine regional/commercial divergence, not an error, but it
  is the minority and it sits uneasily beside the sector's own scam-warning language.
- **The Agency Arizona defuses the ambiguity at open call:** "You do not need to bring or wear a swimsuit."
- **Elite** asks applicants to *wear a bikini for measuring* — but for accuracy of the tape, not for a photo.

**Background & light.** "in front of a plain background" (Ford); "on a plain backdrop" (Storm U18);
"natural lighting with a plain backdrop… Your background should be free of clutter" (ONE); "Make sure you
have a clear, preferably white, background" (Bridge); "take photos in bright, natural light" (Models 1);
"Shoot your photos in natural daylight, but not direct sunlight" (Heroes); "taken in natural daylight"
(Viva); "Take images in front facing natural daylight" (Society); "taken in a well-lit space" (Society).

**Hair.** Two opposite conventions, both common: **hair down** (ONE "wear your hair down"; Heroes "Wear
your hair down"; MiLK "keep your hair away from your face") vs **hair back/pulled away** (Ford "Pull your
hair back"; Elite "Close up (hair pulled back)"; Models 1 "keeping your hair away from your face"; Viva
"Your hair should be kept away from your face, and your jawline should be visible in the profile photo").
The invariant is *the jaw and hairline must be visible*, not the styling.

**Retouching / filters / professional photography — prohibited, in near-identical words:**
- "The photos you submit should not be filtered, re-touched, or professionally taken." (IMG)
- "Photos should be in their natural state, free of filters and retouching." / "Refrain from submitting
  selfie photos." (Storm)
- "Photos should be in colour with no filters, effects or retouching used." / "You do not need
  professional photos; they can be taken on a phone." (Models 1)
- "All photos must be unretouched and containing no filter." (DNA)
- "You don't need professional images and please don't retouch or use any filters." (MiLK)
- "Original, in-focus and hi-resolution images only. Please do not send through screenshots or photos with
  filters on or extremely re-touched images" (Bridge)
- "Photos shouldn't be professionally taken." (Ford) — "These do not need to be professional, phone pics
  work just fine." (The Option Agency) — "non-professional images" (The Agency Arizona)
- "You don't need previous experience or expensive photos or videos to apply." (ONE)

**Selfies.** Storm bans them outright; ONE bans "selfie-style poses"; ONE, Ford and Heroes all instruct the
applicant to have a **trusted person or tripod** take the photos. Nobody in the sample *requires* a selfie.

**Recency.** Weakly specified — a real gap. Only Bridge states it: *"Make sure the images are your most
recent photos and that your measurements are up-to-date."* No sampled agency gives a numeric window (the
"within 3 months" rule circulating in coaching blogs is **secondary**, not agency-published).

**File constraints (actual published limits):** 30 MB per image (Wilhelmina, IMG, MiLK); 10 MB (Viva);
5 MB (Society); 2 MB per image and 8 MB total (Nemesis); 2 MB (Wehmann). Formats: JPG/JPEG/PNG (Viva,
Bravo, Nemesis); **JPG/JPEG only** (MiLK).

**Video — a genuine 2026 shift, not yet a majority.** Three of twenty-four require or request video:
- **ONE:** "Video 1: Please submit a short 30 second **Walking Video**… It is not meant to be a runway walk
  - just walk naturally." / "Video 2: … a short 30 second **Personality Video**… Tell us something about
  yourself as person - we want to know you and see you talk." Submitted as **links**, not uploads.
- **Heroes:** "Submit two videos of yourself: **Introductory Video**: … introduce yourself: your name, your
  age, and where you are from. Then show both of your profiles. **Walking Video**: Walk towards the camera,
  and then away from the camera."
- **Wehmann:** "a casting video to tell us a little about yourself (recommended)".
Note both fashion implementations ask for the *same two* archetypes: a walk and a talk.

### 4.2 Required fields — what is actually asked

Aggregated from the fourteen forms whose fields I could read directly.

**Asked by nearly everyone (≥10/14):** first name, last name (or "Full name"), email, phone, date of birth
(or age), city + country of residence, **height**, at least one social handle, consent checkbox.

**Height is the only measurement that is universal.** It is offered as a **dropdown showing cm and
ft/in together** on every European form (Storm "170cm / 5'7\"", Society "170 cm - 5'7''", Fashion Model
Management "5-9in / 175cm", Heroes with a Metric/Imperial toggle, Bridge "5' 7\" / 170 cm"). US commercial
forms use split feet/inches inputs (Wehmann "ft"/"in"; ONE "Height (feet)"/"Height (inch)").

**Full measurement sets — asked by about half, and this is the clearest tier split in the whole sample.**

| Agency | Bust/Chest | Waist | Hips | Shoe | Hair | Eye | Extra |
|---|---|---|---|---|---|---|---|
| Wilhelmina | Bust, Cup | ✓ | ✓ | ✓ | ✓ | ✓ | Collar, Suit, Inseam |
| Elite | Bust | ✓ | ✓ | ✓ | ✓ | ✓ | Cup |
| ONE | Bust | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Heroes | Bust | ✓ | ✓ | ✓ (EU) | ✓ | ✓ | — |
| BMG | Bust, Chest | ✓ | ✓ | ✓ (M/F) | ✓ | ✓ | Collar, Suit, Inseam, Dress Size, Ethnicity |
| Bridge (curve) | Bust, Chest, Bra size | ✓ | Hip | ✓ | ✓ | ✓ | Trousers, tattoos/piercings/scars |
| Bravo (Tokyo) | Bust | ✓ | ✓ | ✓ (**in cm**) | — | — | Nationality |
| Fashion Model Mgmt | (gate only) | (gate only) | (gate only) | — | — | — | "size max 50" for men |
| Nemesis | ✓ | ✓ | ✓ | — | — | — | tattoos/piercings/scars, medical issues, driving |
| **Storm** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | height only |
| **Premier** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | height only |
| **Models 1** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | height only |
| **Society** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | height only |
| **IMG** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | height not even required |
| MiLK | ✗ | ✗ | ✗ | **Shoe Size** ✓ | ✗ | ✗ | Skills |
| Wehmann (commercial) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **Weight**, Ethnicity |

This is the most product-relevant finding in the data: **the top-tier fashion boards in London and New
York (Storm, Premier, Models 1, Society, IMG) do not ask for bust/waist/hips at first submission at all.**
They ask height, DOB, location, socials and three photos. Measurements are taken later, in person, by the
agency. Agencies that *do* ask at intake skew US commercial (Wilhelmina, BMG, Elite, ONE), curve (Bridge,
where size *is* the board definition), or Asia (Bravo).

**Shoe size units differ by market and are not interchangeable:** EU half-sizes (Heroes: 35.5–45.5),
separate male/female fields (BMG: `Shoe_Size_Female`, `Shoe_Size_Male`), and **centimetres** (Bravo:
靴 / Shoes … cm). A single "shoe size" number without a unit is meaningless.

**Social handles.** Ten of fourteen ask; two make them **required** (ONE: "Instagram*", "Tiktok*").
Instagram + TikTok is the standard pair (Wilhelmina, Storm, Premier, Models 1 nav, MiLK adds YouTube,
Bridge one generic `social_handle`). **Wilhelmina and Storm both add the same qualifier:**
"(Public profiles only)" / "Please enter your Instagram handle (Public profiles only)". Bridge's influencer
lane is the only one that asks for **audience metrics**: "Minimum 10K following… Submit Instagram Stats
Screenshots for: Location (with percentages) / Gender / Post Stats (posted within the last week) / IG Story
(within the last week)".

**Board / division selection inside the form — asked by 7 of 24.** Wilhelmina ("6. WHICH DIVISION WOULD YOU
LIKE TO JOIN? women / men" + two opt-in checkboxes for Sports+Fitness and WillyMoves); ONE (a per-city board
picker across NY / LA / Chicago / Spain / UK); Bridge ("I want to apply in London / New York" and "I want to
apply as A Model / An Influencer / Artist"); The Option Agency (Portland / Los Angeles); The Agency Arizona
(Model / Actor/Actress / Influencer / Littles); Nemesis (FEMALE / MALE × ADULT / KIDS); Wehmann ("What is
your talent? Check all that apply. Model / Acting / Voice / Artist / Wrangler"). **City-first is more common
than board-first:** Wilhelmina, Ford and IMG all open with "Select the city closest to you" / "Choose a
city" before anything else, and Wilhelmina attaches a legal condition to it — *"NOTE: You must have a lawful
legal status to live and work in the selected territories."*

**Free text.** Roughly half ask, and always optionally or briefly: "10. ANYTHING YOU'D LIKE TO SHARE?"
(Wilhelmina); "Briefly tell us about yourself. Where are you from? What are your goals?*" (Elite, required);
"Tell us about yourself" (Bridge); "自己PR・備考 / Notes" (Bravo); "Message" (MiLK, BMG); "General Message"
(Wehmann). Nobody asks for a cover letter, and nobody asks *why this agency*.

**What is conspicuously NOT asked, anywhere in the fashion sample:**
résumé/CV (fashion boards: 0/14 — only commercial/actor lanes), cover letter (0/24), references (0/24),
prior campaigns or tearsheets (0/24), a portfolio or book (0/24 — and Premier names requesting one as a
scam marker), education (0/24 fashion; Agency AZ asks "School enrollment status" for its under-18 lane),
weight (1/24, Wehmann, a commercial/talent agency), a headshot by a professional photographer (0/24),
availability calendar (Nemesis asks "Can you get time off in the week to model?" — 1/24), rate expectations
(0/24), union status (0/24).

### 4.3 Age minimums and how minors are handled

| Agency | Minimum age to submit | Guardian mechanism |
|---|---|---|
| IMG | **14** — hard gate: age is the very first question, and under-14 is refused with "we are unfortunately unable to accept applications for those who are under 14 years old at this time" | "Please confirm the following details for your legal guardian(s)" — **Guardian 1 / Guardian 2**, each with title, name and **relationship**; "Check box for one guardian" |
| ONE | **14** ("If you are 13 years of age or younger… you may not apply online with us. Your parent or legal guardian can contact our offices") | "between the ages of 14 and 18 you are welcome to apply online with the cooperation and consent of your parents or legal guardian" |
| Elite | scouts "**15** and up" (female-identified); "All applicants must be 18 years old or have written parental consent" | consent asserted via a submitter-identity checkbox |
| Storm | **15** ("we accept applications from aspiring talent between 15 and 18 years old") | guardian must complete the form, **and upload guardian photo ID**; guardian ID shown in person for walk-ins; checkbox "if you are 18 or younger, this form has been completed with a parent or guardian" |
| Society | **16–23** ("this application is intended for girls and for boys between 16 and 23 years of age") | dedicated `parentName` / `parentEmail` / `parentPhone` fields; approval must arrive **within 15 days** or all data is deleted; the guardian's contact details are *"the only ones we will utilize"*; guardian must attend any meeting |
| Bravo (Tokyo) | **14** (F 14–25, M 14–27) | not stated on the form |
| Bridge | **18+**, "no maximum age restriction" | n/a |
| The Agency Arizona | **14+ for open call**; under-14 must "submit online" | "may bring a parent or guardian" |
| Milk / Option / Nemesis / Wilhelmina | not numerically stated | "make sure that you have your parent or guardian's permission" (Milk); "Minors, please have a parent or guardian fill out this form with their contact info on your behalf" (Option); "NOTE: Minors must ask parent/legal guardian's authorization." (Wilhelmina) |

**Universal norm:** 14 or 15 is the floor for online fashion submission; 16 in Italy-run Society; 18 for
curve. Nobody in the sample accepts an unaccompanied under-13 online. **UK regional layer:** minors also
require a local-authority child performance licence per job — not part of intake, but it is why UK kids
agencies front-load guardian process (Bizzykidz publishes "Child Performance regulation guidelines" from
its apply page).

**Two structurally different guardian models are in use.** (a) *Guardian as co-signer* — the minor fills
the form, the guardian consents (Wilhelmina, Milk, Storm). (b) *Guardian as the account* — the guardian is
the only contactable party (Society: "your parent/legal guardian contact information will be the only ones
we will utilize"; Option: "have a parent or guardian fill out this form with their contact info on your
behalf"). IMG's two-guardian record with relationship-per-guardian is the most structured version seen.

### 4.4 Data retention and consent — a 2026 norm

Storm's consent checkbox is the most explicit in the sample:
> "By submitting this form you give your clear consent Storm Model Management will process your data only
> for the purpose of evaluating your potential as a (becoming a) model, and can use this data to contact
> you. **Your application data will be kept here for no longer than 30 working days.**"

Compare Society (EU storage, *"not to exceed 6 (six) months"*, then deleted if unsuccessful), Storm's U18
FAQ (*"If your child's application is unsuccessful, all data is automatically deleted after 30 days"*), and
IMG's U18 FAQ (photos used only for assessment then *"securely deleted from our system"*). Storm's page
also opens with a jurisdictional trigger absent two years ago: *"In line with the UK Online Safety Act
2023, all applicants must confirm their age before continuing."*

---

## 5. Trust & legitimacy signals

### 5.1 What legitimate agencies say — the four-part standard warning

Eleven of twenty-four surfaces carry an impostor/recruitment warning, and they converge on the same four
claims. Counted across the sample:

1. **"We never ask for nude or lingerie photos."** — 7 agencies verbatim (IMG, Ford, ONE, DNA, Heroes,
   Premier, Wilhelmina's imposter modal by implication).
2. **"We never charge a fee."** — 8 agencies. IMG: "does not require any kind of monetary payment."
   Ford: "You should never pay to attend a casting." ONE: "we never require any monetary payment or
   consideration of any kind to apply." Storm/IMG U18 FAQ: "there is no fee to apply or to sign… We do not
   charge any application or registration fees." Heroes adds the sharpest version:
   *"We also encourage aspiring models not to pay for portfolio images, as all you need to apply are
   natural pictures from a phone or digital camera."* Fashion Model Management leads its whole page with
   *"DISTRUST people who promise that you can be a model paying a fee. Not everybody can be a model."*
3. **"Verify the domain / the verified handle."** — 6 agencies name their own email domain as the proof:
   "@stormmanagement.com or @stormmanagement-la.com" (Storm); "a verified @premiermodelmanagement.com
   domain" (Premier); "email domains that end with fordmodels.com" (Ford); "@models1.co.uk" plus named
   Instagram/TikTok handles (Models 1); "first-name.last-name@onemanagement.com" plus eight verified social
   handles (ONE). Premier adds the reply-address trick: *"Always check the 'reply to' email address ends
   with premiermodelmanagement.com and is coming from a named individual, rather than 'info or safety.'"*
4. **"If you are under 18, tell a trusted adult."** — 5 agencies (IMG, DNA, Premier, Storm, Heroes).

Distinct additional claims worth noting:
- **No video interviews with strangers:** "nor do we conduct interviews via facetime" (DNA); IMG's warning
  page likewise disclaims Skype interviews.
- **No off-platform contact:** "we will never contact you through WhatsApp or Facebook" (Models 1);
  "certain individuals on social media and messaging apps such as WhatsApp and Telegram" (Premier);
  Nemesis: anyone who "asks you to send photographs directly to them, communicate outside of our official
  channels, or meet away from the agency is not acting on our behalf."
- **No sister-agency network claim:** "We are not part of a network, and anyone claiming to be a sister
  agency is not truthful." (Heroes)
- **Territorial honesty:** "Please also note that Models1 operates exclusively in the UK." (Models 1)
- **Impersonation is a crime, here's who to call:** "Falsely claiming to be a representative or scout of
  Wilhelmina Models is illegal. If you believe you have had dealings with or communications from an
  imposter, contact the Better Business Bureau, the FBI, or other law enforcement agencies." (Wilhelmina)
- **A dedicated safety inbox:** safety@premiermodelmanagement.com (Premier); scouting@heroesmodels.com and
  "We does not accept walk ins" (Heroes).

### 5.2 What legitimate agencies refuse to say

- They do not promise work, exposure, or a timeline to being booked. The strongest promise in the entire
  sample is a *meeting*.
- They do not promise a reply (one exception, §3).
- They do not ask for money, ever, at intake or signing. In New York this is now law, not etiquette:
  *"Under the Fashion Workers Act, your model management company cannot charge a fee or collect a deposit
  when signing an agreement with them"* and *"The Fashion Workers Act prohibits a company from requiring or
  collecting any fee or deposit from a model upon the signing of, or as a condition to entering into, any
  contract or agreement"* (NY DOL FWA FAQs).
- They do not ask for a portfolio, a paid test shoot, or "professional headshots".
- They do not ask for measurements they can take themselves later (top-tier boards, §4.2).
- They do not gate the form behind account creation, payment, or a subscription. Every form sampled is a
  single anonymous page.

### 5.3 The contested edge: fees at kids/commercial agencies

**Bizzykidz (UK, kids/talent)** publishes division cards reading **"Book Fee Applies"** for its Talent
Dept and Baby Talent divisions, and **"No Fee Applicable"** for its Child Actors and Adult Actors
divisions — the fee bundling "Online Digital Profile & calendar, Handy App, Free Z-Card, Telegram Group
Membership, Self Tape Capability Software…". Secondary UK sources describe comparable annual "publicity
fees" (~£72) at other child agencies. This is a **regional and sector-specific divergence**, not evidence
that the norm has moved: (a) it appears only in the UK kids/extras lane; (b) no fashion board in the sample
charges anything; (c) in New York the equivalent charge at signing is now unlawful; (d) California's
Krekorian Talent Scam Prevention Act similarly targets advance-fee talent services. For a product, the safe
reading is: **any money at intake is a red flag in fashion, and needs a very explicit, jurisdiction-aware
justification anywhere else.**

### 5.4 Two safety patterns a product should copy

- **IMG's blocking safety interstitial.** Before any field is shown, an "Acknowledged" modal states the
  three-part warning, and *only then* asks "How old are you?" — with an under-14 answer terminating the
  flow with a polite, non-punitive message. Safety first, age second, data third.
- **Storm's guardian-ID upload.** The only sampled agency that verifies the guardian rather than
  trusting a checkbox — online and in person.

---

## 6. Open questions / contested points

1. **Do agencies want measurements at first contact?** *Contested by tier.* Storm, Premier, Models 1,
   Society and IMG collect **height only**; Wilhelmina, Elite, ONE, BMG, Heroes, Bridge and Bravo collect a
   full set. Evidence for "no": measurements self-reported by an untrained applicant are unreliable, and
   these agencies re-measure in person. Evidence for "yes": commercial and curve boards need size to route
   to a board at all (Bridge's whole gate is "Size: 6US / 10UK +"). A product must not treat measurements as
   universally mandatory.

2. **Digitals vs polaroids vs "photos" — which word belongs where?** *Resolved, but subtly.* The word
   "digitals" appeared **zero times** in the 24 public submission instructions I captured, but appears twice
   **inside agency systems** (a Mediaslide picture-category literally named `Digitals` with the batch name
   `Jun26` on a live Uno model profile; a `modal-digitals` component on Next's site). Read: *digitals is
   post-signing vocabulary for a signed model's periodic natural photos.* To an applicant, agencies say
   "photos", "images", "pictures", or (to parents) "snapshots". "Polaroids" survives in curve/commercial and
   veteran-booker speech (Bridge FAQ). Secondary sources (photographers' blogs) agree the two words name the
   same artifact and that "digitals" is the modern default among newer bookers — corroborating, not primary.

3. **Are open calls still standard?** *Contested and shrinking.* In favour: Storm (walk-ins Mon–Fri, two
   windows daily), Milk ("walk-ins on Tuesdays and Thursdays only between 10am – 12pm and 2pm – 4pm"), The
   Agency Arizona (dated open call, "Thursday, September 24th 1PM-4PM"). Against, explicitly: **Elite** —
   *"Elite does not hold in office 'open calls'"*; **Heroes** — *"We does not accept walk ins, please apply
   online"*; **Sandra Reynolds Juniors** — *"We don't accept walk-in appointments or hold open castings."*
   Trend reading: the online form is now the primary channel everywhere, and the walk-in is a
   market-specific supplement, strongest in London.

4. **How recent must submission photos be?** *Weak evidence.* Only Bridge says anything ("your most recent
   photos"). The commonly repeated "within the last three months" is coaching-blog material, not agency
   policy. Flagging as an evidence gap.

5. **Outcome rates.** *No primary evidence found.* See §3. Do not state a percentage.

6. **Video: emerging norm or outlier?** Three of twenty-four ask (ONE, Heroes, Wehmann). Both fashion
   implementations want the same two clips (a natural walk, a talking piece), which suggests convergence
   rather than idiosyncrasy — but at 2/22 fashion surfaces it is **not yet a convention** in 2026.

7. **Height cut-offs.** Where published they are hard numbers, but they are **board gates, not industry
   facts**, and they differ wildly by board and market: Fashion Model Management Milan (women ≥174 cm,
   waist ≤60, hips ≤90 — with the striking caveat *"these measurements have to be by nature and not the
   result of an unhealthy diet!"*; men ≥184 cm, size ≤50); Viva Berlin ("ideal height for women is between
   1.74 m and 1.80 m", "**However, we are open to all heights due to our work in the advertising area**");
   Bravo Tokyo (F 168–178 cm, M 180–188 cm); Nemesis Manchester (F 5'6"–5'10", M 5'11"–6'3" — note the
   *upper* bound, unusual); Option Agency (W 5'7"+, M 6'0"+, non-binary 5'7"+); Bridge curve (W 5'8"+,
   size 6US/10UK+; M 6'+, size L+); Storm's dropdown starts at 153 cm and runs to 218 cm, gating nothing.
   And **ONE explicitly refuses the gate:** *"We do not have a height requirement to submit. However,
   please note that some clients that we serve in the industry might be more restrictive about height."*
   Any product that hard-codes a single height cut-off will be wrong for most agencies.

---

## 7. Source list

Primary — agency intake surfaces (all accessed 2026-09-03):

| # | Source | URL | Used for |
|---|---|---|---|
| 1 | IMG Models — Get Scouted (form + safety interstitial + age gate) | https://getscouted.imgmodels.com/ | photo rules, 3 slots, guardian model, age-14 gate, safety copy |
| 2 | IMG Models — Under 18 FAQ | https://www.imgmodels.com/under-18-faq/ | minors, no-fee, photo deletion, next steps |
| 3 | IMG Models — Recruitment Warning | https://www.imgmodels.com/recruitmentwarning | scam language |
| 4 | Ford Models — Get Scouted | https://fordmodels.com/get-scouted | "FORD's Tips to Getting Scouted", city-first, recruitment warning |
| 5 | Wilhelmina — Become a Model | https://www.wilhelmina.com/become-a-model | full 10-step form, 4 photo slots, division selector, imposter modal |
| 6 | Elite Models — Become Elite | https://www.elitemodels.com/become-elite | 6 photo slots, measuring instructions, "no open calls", representation question |
| 7 | The Society Management — Get Scouted | https://www.thesocietymanagement.com/become-model.web | guardian-as-account model, 15-day/6-month retention, 16–23 age band, first-screening language |
| 8 | DNA Model Management — Photo Submissions | https://www.dnamodels.com/submissions/ | email-only submission convention, unretouched/no-filter rule, scam warning |
| 9 | ONE Management — Application / FAQ / Process+Rules / Warning | https://www.onemanagement.com/submissions/{application,faq,processandrules,warning} | richest process statement, board taxonomy, videos, response window, no-status-enquiries rule |
| 10 | Heroes Model Management (NY) — Get Scouted | https://www.heroesmodels.com/get-scouted/ | 4 photos + 2 videos, full measurement set, no-walk-ins, strongest anti-fee copy |
| 11 | Storm Management — Online Application | https://www.stormmanagement.com/apply-to-become-a-model/ | 17-field form, 3 photos, 30-working-day retention, Online Safety Act age gate, shortlist-only |
| 12 | Storm Management — Info (walk-ins) + Under 18 Applicants | https://www.stormmanagement.com/info/ ; /legal/under-18-applicants/ | walk-in hours, guardian ID, "snapshots", bootcamps, no fees |
| 13 | Premier Model Management — Become / Staying Safe | https://www.premiermodelmanagement.com/become/ ; /staying-safe/ | 3 photos, height-only fields, "never need a portfolio to apply" |
| 14 | Models 1 — Apply | https://www.models1.co.uk/apply | best-written photo instructions, no-swimwear rule, UK-only disclosure |
| 15 | The MiLK Collective — Apply | https://milkmanagement.co.uk/apply | walk-in hours, image guide, shoe size, no-individual-response copy |
| 16 | Nemesis Models (Manchester) — Join | https://nemesismodels.com/join | two-week assume-unsuccessful rule, swimwear/sportswear request, lifestyle questions |
| 17 | Bridge Agency (London/NY, curve & Big&Tall) — Apply + Application FAQs | https://bridgeagency.com/apply ; /news/application-faqs | full post-submission lifecycle, one-week rule, reapply-in-six-months, "polaroid's", influencer stats |
| 18 | Viva Models (Berlin) — Become a Model | https://vivamodels.com/become-model | 4 photo slots, jawline/profile rule, height "ideal not required" |
| 19 | Uno Models (Barcelona/Madrid) — Become | https://www.unomodels.com/en/become | email submission, 4 framings, 3-business-day response, separate creator lane; live `Digitals` category in Mediaslide payload |
| 20 | Fashion Model Management (Milan) — Get Scouted | https://www.fashionmodel.it/en/get-scouted | hard measurement gate, "DISTRUST… paying a fee" |
| 21 | Bravo Models (Tokyo) — Become Bravo | https://bravomodels.net/become/ | JP conventions, cm shoe size, prior-agency question, pass-only contact |
| 22 | BMG Models (US, 6 cities) — Submit | https://www.bmgmodels.com/submit | commercial field set (ethnicity, dress size, collar/suit/inseam), 2–4 images |
| 23 | Wehmann (Minneapolis, commercial/talent) — Representation | https://wehmann.com/representation/ | résumé + casting video, weight, 7–10 business day guaranteed response, interview content |
| 24 | The Agency Arizona — Get Scouted | https://www.theagencyaz.com/pages/get-scouted | dated open call + hours, "clean moisturized face", 2–3 week window |
| 25 | The Option Agency (Portland/LA) — Apply | https://theoptionagency.com/apply | "Four photos that show your true self", per-board height gates, guardian-fills-form |
| 26 | Bizzykidz (UK kids/talent) — Apply to Join | https://www.bizzykidz.com/apply-to-join | division cards, "Books Open", "Book Fee Applies" vs "No Fee Applicable" |
| 27 | Sandra Reynolds Juniors (UK kids) — FAQs for parents | https://www.sandrareynoldsjuniors.co.uk/blog/faqs-for-parents | "our books are always open", no walk-ins/open castings, under-16 permission |

Primary — regulator and vendor:

| # | Source | URL | Used for |
|---|---|---|---|
| 28 | NY State DOL — Fashion Workers Act FAQs | https://dol.ny.gov/new-york-state-fashion-workers-act-faqs | no fee/deposit at signing, 20% commission cap, 3-year max term, no auto-renewal, deal memos, digital replica consent |
| 29 | Mediaslide (agency software) | https://www.mediaslide.com/ | agency-side scouting pipeline: "Track the models you've met or been introduced to, send submissions to your team, and let them easily select their favorites." Also the vendor behind Wilhelmina, IMG, Premier, Models 1, Milk, Heroes, Uno intake pages — which explains the near-identical U18 FAQ wording at Storm and IMG |

Secondary (labelled as such, used only to corroborate or to capture how people talk):
Morgan Lewis / Nat Law Review summaries of the Fashion Workers Act (registration fees, 21 Dec 2025
deadline); photographer blogs (mymodelreality, Brandon Andre, Mike McGee) on digitals-vs-polaroids
terminology; the Fashion Spot booker thread (≈3 new faces signed per board per month, market-dependent);
UK child-agency guidance on performance licences (gov.uk, Sandra Reynolds child-licensing).

**Fetch failures / not sampled (recorded per brief):** models.com (403 through proxy, excluded by
instruction); Next Management (SPA; scouting subdomain returns "Sorry, this package is not available
anymore" — only the `digitals` string and board nav were recoverable); Women Management and Marilyn Agency
(JS-only shells, no server-rendered form); Muse NYC (HTTP 500 on every scouting path); Oui Management,
Select Model Management, Why Not Models, Chadwick Models (404 or connection timeout on apply/scouting
paths); Elite Model London (proxy 502); Ford's form host `getscouted.fordmodels.com` (connection timeout —
Ford's public tips page was used instead); BFMA site (404 on the scam/advice paths tried). Twenty-four
surfaces were captured, exceeding the 15-agency target, but the Next / Women / Muse / Select gaps mean the
**New York top-tier fashion sample is 5 agencies (IMG, Ford, Elite, Society, DNA) plus Wilhelmina and ONE**,
not the full set.

---

## 8. Direct answers to the synthesis questions

**The majority convention for a submission's contents.** One page, no account, ~10–14 fields:
name; DOB (not age — DOB is asked ~2:1 over age); email; phone; city + country; **height**; Instagram
(+ TikTok), public profiles only; **three or four photos — close-up, profile, waist-up/mid, full-length** —
unretouched, unfiltered, phone-shot, natural daylight, plain background, no makeup, no smile, form-fitting
clothes, hair off the face; one consent checkbox; and for a minor, guardian name/email/phone plus consent.
Optionally a short free-text note, a city or division selector, and (top-tier only) nothing else. The
majority *language* is "Get scouted" (US) or "Apply / Become a model" (UK/EU); the photos are "photos" or
"images", never "digitals" and rarely "polaroids"; the person is an "applicant"; the roster slot is a
"board" or "division".

**The realistic lifecycle from the agency's side.** Submission lands in a scouting/applications queue →
a first screening by a small team, weighted to board fit, age, height and the four photos → the
overwhelming majority get **no reply at all**, and the record is deleted on a published clock (30 days to
6 months) → a small minority get an agency-initiated invitation to a meeting or video call (guardian
present if a minor) → a smaller minority are signed onto a **New Faces** or **Development** board, at which
point measurements are retaken in-house, digitals are shot, and the relationship becomes contractual. There
is no queue position, no status page, no appeal, and asking for status is explicitly discouraged. The
applicant's only sanctioned next move is to reapply after roughly six months.

**How agencies describe the person before signing.** "**Applicant**" in forms and legal copy;
"**aspiring model / aspiring talent**" in safety copy; occasionally just "**you**". After a meeting and
signing they become a "**new face**" and sit on the New Faces or Development board. "**Prospect**" appears
nowhere in the sample. "Candidate", "member", "user", "subscriber" and "profile" are all foreign to this
vocabulary.

**Language that would make a booker flinch** (beyond §2's table): calling the submission a *portfolio* or
*application package*; "**Your profile is 87% complete**"; "**3 agencies viewed your profile**";
"**Boost your application**" or anything monetised; "**Get discovered — guaranteed**"; "**Upload your best
professional shots**"; "**Apply to 20 agencies with one click**" (mass-blasting is exactly what
"Please refrain from sending multiple follow-up emails" and the shortlist language are defending against);
"**Application status: Under review**" (implies a service level no agency offers); "**Rejected**" as a
user-facing word (no agency in the sample ever says it — the industry euphemism is *"has not been
successful on this occasion"*); "**Casting call**" for an agency submission; and any copy implying the
agency owes the applicant a response, a reason, or a timeline.
