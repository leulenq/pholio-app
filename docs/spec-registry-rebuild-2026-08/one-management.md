# ONE Management — Agency Entry

**Lead adjudication notes (2026-08-19):**
- The lane falsified another carried-in premise: ONE's videos are NOT "two required 30-second
  video uploads." They are two OPTIONAL text fields for YouTube links, with the agency's own
  copy providing a leave-blank/email fallback. SELECTION.md corrected accordingly. The duration
  guidance itself is contradictory across first-party pages (30s on the form vs 15–40s in the
  FAQ) — both retained per methodology.
- The age-floor finding (Process+Rules welcomes 14–17 with guardian consent; the form's age
  input hard-blocks under 16; the FAQ claims no age requirement) is the single highest-value
  talent-surprise finding of the rebuild so far and is a primary FINDINGS.md item.
- Everything below is the lane's primary-evidence research, integrated verbatim.

---

# ONE Management (1 Model Management, LLC) — slug `one-management`

Research window: 2026-08-19, ~06:40–06:50 UTC. All Playwright fetches used the
`browse-helper` Chromium via the environment proxy; no form was submitted, no
account was created, no data was transmitted. `page.on('request')` was watched
for POSTs during every field-typing test — zero POSTs fired at any point.

## 1. Identity & channels

- Legal entity (given in assignment): **1 Model Management, LLC dba ONE
  Management**, NYDOL cert **26-69U8B-LSFW**, issued 2026-07-29, Active. Not
  independently re-verified in this lane (out of scope tool access); treated
  as FACT per brief.
- Official domain: `onemanagement.com` (Cloudflare-fronted). No `robots.txt`
  exists — `/robots.txt` 302-redirects to `/404?badPath=...` which itself
  404s, so there is no crawl restriction on the assigned pages. [Evidence #1]
- The site publicly lists five markets/offices: **New York, Los Angeles,
  Chicago, Spain (Barcelona), UK (London)**. Contact page gives a street
  address, phone, and Instagram handle for each. [Evidence #2] The meta
  description also names these same five plus repeats "London" and
  "Barcelona" by name. [Evidence #3]
- **Single application channel**: one universal web form at
  `/submissions/application` (POST to the same path, `multipart/form-data`).
  There is no separate email-only path, no third-party ATS, no open-call
  listing found on the assigned pages. The FAQ and Process+Rules pages both
  say the online application is where "All requirements to apply at ONE are"
  stated. [Evidence #4, #5]
- **OBSERVED — no market/city routing in the form at all.** The form has no
  "which office" or "which market" selector, no division selector, and no
  hidden field carrying a market value. The only location input is a free-text
  `city` field ("City where you live") plus a `country` dropdown (world list).
  This is a single global intake funnel — a NYC applicant and an LA applicant
  fill out the identical form and identical fields. Market/division assignment,
  if it happens, must happen internally after submission, not through the form.
  This directly answers the brief's routing question: **the form does not
  route by market at all**, even though ONE has distinct LA/Chicago group
  entities and office addresses. [Evidence #6, #7]
- Canonical channel for a NYC applicant: the same universal
  `/submissions/application` form used by every market — there is no
  NYC-specific form or path.

## 2. Flow map

1. Entry: `https://onemanagement.com/submissions/application` — single page,
   no login/account gate, no CAPTCHA observed anywhere in the DOM or network
   calls during this session.
2. The page is one long scroll: intro copy → "Basic Information" fields →
   measurements → "Photo Upload" (4 file inputs) → "Video Upload" (2 text
   link inputs) → "Understanding the Rules" checkbox → Submit button.
3. Conditional field visibility (all client-side, no navigation/step change):
   - `gender = Female` (default) shows `bustImperial`/`bustMetric`, hides
     `chestImperial`/`chestMetric` (`offsetParent === null`).
     `gender = Male` swaps this: chest shows, bust hides. [Evidence #8]
   - `unitType` (`US` default / `EU` / `UK`) swaps which height/shoe/waist
     inputs are visible: US shows `heightFeet`+`heightInch` and
     `shoesizeImperialUS`; EU shows `heightCm` and `shoesizeMetric` (and the
     matching Metric variants for waist/bust/chest/hips); UK swaps the shoe
     field to `shoesizeImperialUK` while keeping imperial height. [Evidence #9]
   - No other conditional sections were found (no guardian sub-form appears
     for any age value — see §7).
4. Nothing gated further observation — the entire form (all sections, all
   conditional states) is reachable client-side without submitting. The only
   thing NOT observable without submitting is server-side validation/response
   behavior (e.g., whether the honeypot `dead` field or the 600 KB image cap
   is actually enforced server-side, or what the confirmation flow looks like
   past the click).
5. A "RECRUITMENT WARNING" modal (`application-modal-background-id`) is
   present in the DOM, pre-rendered `display:block` — a scam/impersonator
   warning, not a flow gate.

## 3. Field inventory (in DOM order)

All are inside `<form id="submission-new-model-id" action="/submissions/application" method="POST" enctype="multipart/form-data">`.

| Field (name) | Type | Label/placeholder | Required (evidence) | Options / constraints |
|---|---|---|---|---|
| `search` | text (separate mini search form, not part of application) | "SEARCH MODELS" | required | model-search box in page header, unrelated to the application form itself |
| `first` | text | placeholder "Only letters - maximum 40." | `required=""` attr | `maxlength="40"`, `pattern="^[a-zA-Z\-.]+$"` — letters, hyphen, period only, digits rejected (OBSERVED: "John123" → `patternMismatch:true`) |
| `last` | text | same placeholder as first | `required=""` | same pattern/maxlength as `first` |
| `gender` | select | — | `required=""` | **Female, Male, Male (transgender), Female (transgender), Non-binary** (verbatim, in this order; default selected = Female) |
| `pronoun` | select | — | `required=""` | **She/Her, He/Him, They/Them** |
| `age` | number | "16 to 80, in quarter years." | `required=""` | `min="16" max="80" step="0.25"`. OBSERVED: typing 15 or 13 fires native `rangeUnderflow`, message **"Value must be greater than or equal to 16."** — the field hard-blocks any age below 16, see §7 contradiction. |
| `skill` | select, `multiple` | — | `required=""` | **Acting, Author, Baseball, Basketball, Biking/Cycling, Boxing, Cheer, Climbing, CrossFit, Dance, Football, Golf, Hockey, Horse Riding, Pickleball, Running, Singing, Skateboarding, Soccer, Softball, Surfing, Swimming, Tennis, Volleyball, Weight Training, Yoga** (26 options, verbatim, alphabetical) |
| `instagram` | text | "Shows style & creativity." | `required=""` | `maxlength="150"`, `pattern="^[0-9a-zA-Z._]+$"` (handle only, no @ or URL) |
| `tiktok` | text | "Shows style & creativity." | `required=""` | same pattern/maxlength as instagram |
| `email` | text | "Needed to contact." | `required=""` | `maxlength="200"`, `pattern="^[a-zA-Z0-9.\-_\+]+@[a-zA-Z0-9]+.[a-zA-Z0-9]+$"` |
| `phoneCountryCode` | select | — | `required=""` | full world country+dial-code list, e.g. "Afghanistan ( +93 )" … first option "Select One..." |
| `phoneNumber` | text | "Digits only. No other characters." | `required=""` | `maxlength="20"`, `pattern="[0-9]+$"` |
| `city` | text | "City where you live." | `required=""` | `maxlength="150"`, `pattern="^[a-zA-Z\-. ]+$"` (letters/space/hyphen/period only — no numerals) |
| `country` | select | — | `required=""` | full world country list, first option "Select One..." |
| `unitType` | select | — | `required=""` | **EU, UK, US** (default = US, drives which measurement fields show, §2) |
| `heightFeet` | number | "5-6" | `required=""` (US) | `min="5" max="6" step="1"` |
| `heightInch` | number | "0-11.75, step 0.25 inches" | `required=""` (US) | `min="0" max="11.75" step="0.25"` |
| `heightCm` | number | "152.5-212.75, step 0.25 cm" | not required in DOM (shown only for EU) | `min="152.5" max="212.75" step="0.25"` |
| `shoesizeImperialUS` | number | "4-14" | `required=""` | `min="4" max="14" step="0.5"` |
| `shoesizeImperialUK` | number | "2-12" | not required in DOM (UK-mode only) | `min="2" max="12" step="0.5"` |
| `shoesizeMetric` | number | "35-45" | not required in DOM (EU-mode only) | `min="35" max="45" step="0.5"` |
| `eyeColor` | select | — | `required=""` | Select One..., Black, Blue, Blue/Green, Blue/Grey, Brown, Dark Brown, Green, Green/Brown, Green/Grey, Grey, Hazel |
| `hairColor` | select | — | `required=""` | Select One..., Auburn, Black, Blonde, Brown, Brown Venetian, Brunette, Chestnut, Dark Blonde, Dark Brown, Grey, Light Blonde, Light Brown, Light Red, Red, Salt & Pepper, Silver, Strawberry Blonde |
| `waistImperial` | number | "22-61, step 0.25 inches" | `required=""` | `min="22" max="61" step="0.25"` |
| `waistMetric` | number | "56-155, step 0.25 cm" | not required in DOM (EU-mode) | `min="56" max="155" step="0.25"` |
| `bustImperial` | number | "24-65, step 0.25 inches" | `required=""` | `min="24" max="65" step="0.25"`. **Conditional on gender=Female/Female(transgender)/Non-binary presumably; OBSERVED shown when gender=Female, hidden when gender=Male.** |
| `bustMetric` | number | "61-165, step 0.25 cm" | not required in DOM | `min="61" max="165" step="0.25"` |
| `chestImperial` | number | "26-61, step 0.25 inches" | not `required` in DOM even though visible for Male | `min="26" max="61" step="0.25"`. OBSERVED hidden when gender=Female, shown when gender=Male. |
| `chestMetric` | number | "66-155, step 0.25 cm" | not required | `min="66" max="155" step="0.25"` |
| `hipsImperial` | number | "26-65, step 0.25 inches" | `required=""` | `min="26" max="65" step="0.25"` |
| `hipsMetric` | number | "66-165, step 0.25 cm" | not required (EU-mode) | `min="66" max="165" step="0.25"` |
| `image0`..`image3` | file | see §4 | `required=""` each | see §4 |
| `walking` | text | "YouTube walking video link." | **no `required` attribute** | `maxlength="350"`, `pattern="*"` — see §4, this pattern does not actually constrain input (OBSERVED: arbitrary non-URL text "not a url at all" validated as `valid:true`) |
| `personality` | text | "YouTube personality video link." | **no `required` attribute** | same as `walking` |
| `acceptedTC` | checkbox | "I have read and accept the Process + Rules" (link to `/submissions/processandrules`) | `required=""` | — |
| `dead` | text (hidden, `style="display:none"`) | placeholder empty | not required | `maxlength="10"`, `pattern="^[a-zA-Z]+$"`, empty default value — OBSERVED classic honeypot/anti-bot field, invisible to a real user |
| submit button | `<button type="submit">SUBMIT</button>` | — | — | — |

Units: **both imperial and metric are offered**, gated by the `unitType`
select (US/UK/EU), not simultaneously — only the fields matching the chosen
unit system are shown/required; the others remain in the DOM but hidden and
not required.

## 4. Uploads

### Photos (4 required file inputs)
- Names: `image0`, `image1`, `image2`, `image3` — each individually
  `required=""`.
- `accept="image/jpeg, image/png, image/jpg"` verbatim on all four inputs.
  [Evidence #10]
- Published instructions verbatim: "Please submit four photos of yourself:
  full length, waist up, close up, and profile." Slot button labels verbatim:
  **Full Length, Waist Up, Close Up, Profile** (in that order, matching
  `image0`–`image3`). [Evidence #10]
- Technical notes verbatim: "Formats: jpg, jpeg, or png." and **"File size:
  maximum 600 KB per image."** — confirmed **per-file**, not a total/aggregate
  cap; no aggregate cap is published anywhere on the page. [Evidence #10]
- Each file input is visually hidden (`opacity:0; width:0; height:0;
  position:absolute; left:-10000px`) and triggered via a styled upload button
  — cosmetic only, does not change the underlying `<input type=file>`
  constraints.

### Videos — **NOT file uploads; two YouTube-link text inputs**
This is the key schema stress-test the brief flagged, and the form's actual
mechanism diverges sharply from the "two 30-second video uploads" rumor:
- There is **no `<input type=file>` for video anywhere in the DOM.** Both
  video fields are `<input type="text">`:
  - `name="walking"`, label "Walking Video", placeholder "YouTube walking
    video link.", `maxlength="350"`, `pattern="*"`.
  - `name="personality"`, label "Personality Video", placeholder "YouTube
    personality video link.", `maxlength="350"`, `pattern="*"`.
- **Neither field carries a `required` attribute.** OBSERVED: no HTML5
  `valueMissing` fires for either on blur/empty; the page text explicitly
  confirms this is intentional (see below) rather than an oversight.
- The `pattern="*"` attribute does not meaningfully constrain the value: a
  standalone `*` is (per the regex the browser builds) effectively
  unenforced — OBSERVED typing `"not a url at all"` into `walking` reports
  `validity.valid === true`. So the form does **not** verify the text is
  actually a YouTube URL; anything up to 350 characters passes client-side.
- Published instructions verbatim, from the form's own "VIDEO UPLOAD"
  section: "Video 1: Please submit a short 30 second Walking Video of
  yourself." … helpful guidelines: "1) You should be fresh-faced, with no
  makeup and clean hair worn down. 2) A simple skinny jeans and solid
  t-shirt/top will suffice. 3) See a sample of a Walking Video here" (links a
  modal that plays `/dist/images/submissions/video-upload/walking.mp4`).
  "Video 2: Please submit a short 30 second Personality Video of yourself." …
  "1) Tell us something about yourself as person - we want to know you. 2)
  Your skills, hobby, some funny story - get creative and have fun. 3) See a
  sample of a Personality Video here" (plays
  `/dist/images/submissions/video-upload/personality.mp4`). [Evidence #11]
- **CONTRADICTION — video duration.** The application form itself says
  "short 30 second" for both videos (stated twice, once per video). The
  published FAQ page (`/submissions/faq`) instead says: "Good natural
  outdoor light and a smartphone is more than adequate for this **15 to 40
  second** video" (walking) and "You can take this **15 to 40 second** video"
  (personality). Both are first-party FACT text; they conflict on the exact
  duration window. Record both. [Evidence #11, #4]
- Explicit fallback instructions verbatim, directly under the video fields:
  "NOTE: Please submit a link to your video." / "If the application does not
  accept your video link, you can complete the application without the video
  link. Furthermore, if you want to share the video links with us, you can
  email them to info@onemanagement.com." / "If do not have videos links to
  submit or you cannot enter the video link in the application, then you can
  leave the fields for video links empty." — i.e. the videos are explicitly
  optional-at-submission-time by the agency's own published text, with an
  email escape hatch. [Evidence #11]
- No file size/format/aspect-ratio constraint is published for video because
  no video file is ever uploaded through this form — the "rumored" 30-second
  upload requirement should be modeled as **two optional external video-link
  text fields with agency-preferred (but unenforced) 30s / 15–40s duration
  guidance**, not as a first-class binary upload requirement.

## 5. Photo/shot instructions (verbatim)

From the Photo Upload section intro:
> "Please submit four photos of yourself: full length, waist up, close up,
> and profile."
> "Do your best to replicate the sample images below. It is not necessary to
> hire a professional. These images help document your look for us - much
> like a passport photo does."
> "Here are some helpful guidelines:
> 1) Shoot the photos in natural daylight. Please avoid direct sunlight.
> 2) Please do not use makeup or hairstyling - wear your hair down. We want
> to see your natural look - no smiles or selfie style poses.
> 3) A white t-shirt/tank top and skinny jeans are ideal for these photos."
> "Technical notes: Formats: jpg, jpeg, or png. File size: maximum 600 KB per
> image." [Evidence #10]

From the page-top intro (applies to both photos and videos):
> "First: You don't need previous experience or expensive photos or videos to
> apply."
> "Second: We want to see you at your most natural - without make up, hair
> styling, selfie-style poses, or smiles - in daily clothes."
> "For the photo and videos a smart phone is more than sufficient. Get the
> help of someone you trust and with whom you feel relaxed - your parent,
> sibling, or best friend - and have some fun taking the photos and videos."
> [Evidence #6]

FAQ page repeats/paraphrases the same guidance ("blank canvas," "plain
backdrop," "simple and form-fitting like jeans paired with a t-shirt," "no
makeup, no baggy clothing, and no poses," "background... free of clutter").
[Evidence #4]

## 6. Eligibility

- **Age**: FAQ states plainly, verbatim: "We do not have an age requirement
  to submit, but please note that we do not represent children." [Evidence
  #4] This directly conflicts with both the Process+Rules text (§7) and the
  form's own hard `min="16"` on the `age` number field (§3). No single
  age floor is consistently published — see Contradictions (§10).
- **Height**: FAQ verbatim: "We do not have a height requirement to submit.
  However, please note that some clients that we serve in the industry might
  be more restrictive about height." [Evidence #4] The form itself still
  enforces `heightFeet` 5–6 ft / `heightInch` 0–11.75 (i.e. roughly 5'0"–6'11.75",
  `heightCm` 152.5–212.75) as a hard numeric range regardless of this
  "no requirement" framing — so the "no height requirement" is a
  soft/marketing statement, not a form constraint.
- **Measurements** ranges are hard `min`/`max`/`step` gated in the form (see
  §3 table) — these function as de facto eligibility bounds even though no
  page states them as "requirements."
- **Gender/division scoping**: the FAQ states, verbatim: "We celebrate beauty
  in all its diversity and represent models of all shapes and sizes. We have
  a body positive and size inclusive curve division where models can work at
  any size" and "We represent models of all gender identities, including
  those who identify as trans or non-binary." [Evidence #4] These are agency
  statements about who they represent overall; the APPLICATION FORM itself
  has no division field at all (see §1) — a Curve-eligible applicant simply
  fills the identical universal form; the agency, not the applicant, appears
  to route to a division after review.
- **Location/market restriction**: none observed. The form accepts any
  `country` in the world-list dropdown and free-text `city`; there is no
  market gate preventing a non-US or non-NY applicant from submitting through
  this same form.
- **Divisions per market — form vs. site nav** (brief's special task a):
  the APPLICATION FORM offers **zero** division selection of any kind. The
  site's navigation menu (separate from the form), however, does expose full
  division structure per market, OBSERVED from nav link hrefs:
  - New York — Women: **Image, One.1, Development, Curve, Studio** (5, matches
    the rumor exactly, including "One.1" as the NY-specific name). Men:
    **Image, Main, Development** only — **no Studio for NY Men**, diverging
    from the rumored "Image/Main/Development/Studio."
  - Los Angeles — Women: **Image, Main, Development, Curve, Studio** (LA uses
    "Main" where NY uses "One.1"). Men: **Image, Main, Development, Studio**
    (4, matches the rumor).
  - Chicago — Women: **Image, Main, Development, Curve, Studio** (5). Men:
    **Image, Main, Development, Studio** (4, matches the rumor).
  [Evidence #7] So "One.1" is a New-York-only women's division name; other
  markets call the equivalent division "Main." NY is also the only market
  whose Men's lineup lacks Studio.

## 7. Minors & guardians

This is the highest-priority contradiction in this record.

- **Process + Rules page, verbatim** (first-party, FACT):
  1. "If you are 13 years of age or younger, we are sorry but you may not
     apply online with us. Your parent or legal guardian can contact our
     offices to explore representation with us."
  2. "If you are a minor between the ages of 14 and 18 you are welcome to
     apply online with the cooperation and consent of your parents or legal
     guardian." [Evidence #5]
  - No separate guardian-consent checkbox, guardian name/email field, or age
    gate step exists anywhere in the actual form DOM — "consent" for a
    14–17-year-old is not captured by any distinct field; presumably folded
    into the single generic `acceptedTC` "I have read and accept the Process
    + Rules" checkbox, which is worded identically regardless of the
    applicant's age. There is no mechanism in the form to know the applicant
    is a minor at all except the `age` number they type.
- **CONTRADICTS the form's own `age` input**, which has hard `min="16"`
  (OBSERVED: typing 14 or 15 or 13 fails native validation with "Value must
  be greater than or equal to 16." — see §3). A 14- or 15-year-old who is,
  per the Process+Rules text, explicitly "welcome to apply online with...
  consent," **cannot get the numeric age field to validate** unless they lie
  and enter 16+. This is a live, verified functional contradiction between
  the published policy and the shipped form, not merely a documentation
  mismatch.
- **CONTRADICTS the FAQ**, which says "We do not have an age requirement to
  submit, but please note that we do not represent children" (no floor
  number given at all, and no mention of a 13/14/18 guardian structure).
- No separate flow, page, or step for minors was found — "apply online with
  the cooperation and consent of your parents or legal guardian" is stated as
  policy text only, with no corresponding UI (no guardian email/signature
  field, no youth-specific consent checkbox, no date-of-birth-based branch
  logic observed in the DOM).

## 8. Consent & legal

- Single checkbox at the end of the form: `acceptedTC`, `required=""`, label
  verbatim: **"I have read and accept the Process + Rules"** (the words
  "Process + Rules" are a link to `/submissions/processandrules`, opens in a
  new tab). No separate privacy-policy or terms-of-service link/checkbox was
  found anywhere on the application page, the FAQ page, or the
  Process+Rules/Warning pages. [Evidence #6]
- No footer legal boilerplate (no copyright line, no "Privacy Policy" /
  "Terms of Use" links) appears on any of the pages fetched
  (`/submissions/application`, `/submissions/faq`,
  `/submissions/processandrules`, `/submissions/warning`, `/`, `/contact`) —
  this is a "none found," recorded explicitly per the brief's instruction
  rather than omitted.
- Process + Rules page, additional verbatim points not already covered above:
  3. "Please follow the instructions and suggestions on the online
     application and provide all of the requested information accurately and
     fully. The system does not let you enter an incomplete application.
     Furthermore, an application that is filled with unreliable data will not
     be reviewed."
  4. "The application asks for personal questions (your social media
     handles) that help us get to know you a bit... Modeling is much more
     than just physical beauty, and these questions help us understand who
     you are – your personality, character, and interests."
  5. "The application asks for photos and two short videos... Submissions
     with images and videos that do not make a realistic and authentic
     effort to meet our requirements may not be reviewed."
  6. "Once your application is submitted, you will receive an email from
     submissions@onemanagement.com confirming the receipt of your
     submission. This is the only communication you will receive from us
     regarding your application." [Evidence #5]
- Recurring scam/impersonator warning banner appears on every page fetched in
  this lane (home, contact, FAQ, process+rules, warning, application):
  "IMPORTANT NOTICE: PROTECT YOURSELF FROM IMPERSONATORS, FRAUD, SCAM, AND
  PREDATORS... ONE Management will never request nude photos or ask for any
  form of payment during the scouting or recruitment process." Verified
  social handles listed (also given in the in-page "RECRUITMENT WARNING"
  modal): @onemanagement (verified, blue checkmark), @one.1models,
  @onemanagementla, @onemanagementchicago, @onemgmtcurve,
  @onemanagementspain, @onemanagementuk, @oneengagers. Agency emails are
  stated to follow the format `xyz@onemanagement.com`. [Evidence #2,4,5,6]
- Explicit no-payment / no-nude-photo statement (repeated near-verbatim
  across FAQ, Process+Rules, Warning, and the in-form modal): "We never
  request photos in the nude or lingerie, and we never require any monetary
  payment or consideration of any kind to apply as a talent at ONE."
  [Evidence #4,5,6]

## 9. Process facts

- Response policy, verbatim (FAQ): "Unfortunately due to the volume of
  submissions, we are unable to respond to all inquiries. If you have any
  interest from our team, you should expect to receive a response within one
  or two weeks of your submission." [Evidence #4]
- Process+Rules echoes this with an explicit "don't chase us" instruction,
  verbatim: "Please be patient while we review the many applications we
  receive, and if we want to learn more about you, we will contact you.
  Please do not email or call us to inquire about the status of your
  application - we will be in touch with you if we have an interest."
  [Evidence #5]
- Confirmation mechanism, verbatim: applicants "will receive an email from
  submissions@onemanagement.com confirming the receipt of your submission.
  This is the only communication you will receive from us regarding your
  application" absent interest. [Evidence #5]
- No payment required, verbatim (FAQ): "No you do not [have to pay]. If
  anyone claiming to be at ONE asks you for money or anything else except
  what is outlined in the application form, please contact us with details
  at info@onemanagement.com." [Evidence #4]
- No open-call schedule, deadline, or seasonal submission window was found
  anywhere on the assigned pages — submissions appear open/rolling
  year-round with no stated cutoff. No explicit re-application guidance
  (e.g. "wait N months before reapplying") was found either — both are
  recorded as "none found."

## 10. Contradictions & uncertainties (ranked by how badly they could surprise a talent)

1. **[HIGH] Age floor: three different numbers, one of them a live functional
   block.** The `age` input's native HTML validation hard-rejects anything
   under 16 ("Value must be greater than or equal to 16."). The
   Process+Rules text says 14–17-year-olds are "welcome to apply online with
   the cooperation and consent of your parents or legal guardian" and that
   only 13-and-under must go through a non-online channel. The FAQ says
   there is no age requirement at all beyond "we do not represent children"
   (no number given). A 14- or 15-year-old reading the Process+Rules page
   and then trying to actually use the form will be functionally blocked by
   the number field regardless of guardian consent — this is the single
   biggest trap in this whole record.
2. **[MEDIUM] Video duration: 30 seconds (form) vs. 15–40 seconds (FAQ).**
   Both are first-party. Model both, don't silently average/pick one.
3. **[MEDIUM] "Video requirement" is actually optional and not a file
   upload.** Talent expecting to attach video files, or expecting videos to
   be mandatory, will be surprised twice: (a) it's a YouTube link text box,
   not an upload, and (b) the agency's own copy says you can leave it
   blank or email the link separately if entry fails.
4. **[LOW-MEDIUM] No guardian-specific UI despite guardian policy text.**
   Nothing in the form captures a parent/guardian name, contact, or explicit
   separate consent — the same single "Process + Rules" checkbox is used
   regardless of applicant age, so "consent" is not actually structurally
   enforced/collected for the 14–17 band the policy describes.
5. **[LOW] Height "no requirement" (FAQ) vs. a hard 5'0"–6'11.75" /
   152.5–212.75cm range enforced by the form's numeric min/max.** Not a
   contradiction in the strict sense (the FAQ is about client preference, the
   form range is a data-entry bound) but worth flagging as a "soft claim,
   hard field" pattern, same shape as the age issue.
6. **[LOW] No division/market field on the form at all**, despite the
   agency operating five markets and (per FAQ) a distinct Curve division —
   an applicant has no way to indicate market or division preference through
   this channel; not a contradiction, but an unresolved "how do they route
   me" uncertainty this lane could not answer past the DOM (would require
   server-side knowledge not observable).
7. **[UNCERTAIN]** Whether the published "600 KB per image" cap and the
   `accept="image/jpeg, image/png, image/jpg"` list are enforced
   server-side (not just advisory in copy) could not be verified without
   uploading an oversized/wrong-type file and submitting, which is
   prohibited by the lane's hard rules — recorded as OBSERVED-in-copy only,
   not confirmed as server-enforced.
8. **[UNCERTAIN]** Whether `walking`/`personality` values are validated
   server-side to actually be YouTube URLs (client-side `pattern="*"`
   accepts anything) is unknown — the copy's own fallback instructions
   ("if the application does not accept your video link... email it to us")
   hints there IS some server-side rejection logic for malformed links, but
   its exact rule is not observable client-side.

## 11. Draft talent-facing brief (for Pholio's Market view)

ONE Management uses one universal online form — there's no separate NYC
form, and no way to pick a market or a division (Image, Curve, Studio, etc.)
yourself; the agency sorts that out after they review you. Before you start,
have ready: your Instagram and TikTok handles, your measurements in either
US, UK, or metric units (pick one system — the form only shows the fields
for the system you choose), and four photos: full length, waist up, close
up, and profile, each a JPG or PNG under 600 KB. Skip makeup, hairstyling,
and posing — natural daylight, a plain background, a simple t-shirt and
jeans. You'll also see two optional video fields asking for YouTube links to
a walking video and a "get to know you" personality video — the form itself
asks for "30 seconds," but ONE's own FAQ separately says 15–40 seconds is
fine, so don't stress over hitting an exact number. These are genuinely
optional: if you don't have video links, you can leave the fields blank, or
just email the links to info@onemanagement.com afterward. One real trap:
ONE's Process + Rules page says 14–17-year-olds can apply online with a
parent or guardian's consent, but the form's age field will not accept
anything under 16 — if you're 14 or 15, the online form itself won't let you
submit; you may need to have a parent/guardian contact ONE's offices
directly instead. If you're 13 or under, the agency says you cannot apply
online at all — a parent or legal guardian has to contact them directly.
There's no application fee, ever, and ONE never asks for nude or lingerie
photos — treat anyone who does as an impersonator. After you submit, you'll
get one confirmation email and nothing else unless they're interested;
expect roughly one to two weeks if they are, and don't chase them for a
status update.

## 12. Evidence log

1. `https://onemanagement.com/robots.txt` — 2026-08-19T06:43:49Z — curl (HEAD/GET with -IL) — evidences no robots.txt exists (302 → `/404?badPath=Badpath - /robots.txt` → 404), so no crawl Disallow rules apply to assigned pages.
2. `https://onemanagement.com/contact` — 2026-08-19T~06:46Z — Playwright (`page.evaluate(() => document.body.innerText)`) — office list: "NEW YORK / 42 Bond Street, 2nd Floor / New York, NY 10012 / +1-212-505-5545 / @onemanagement", "LOS ANGELES / 529-531 Westmount Drive / West Hollywood, CA 90048 / +1-213-290-5767 / @onemanagementla", "CHICAGO / 20 W Hubbard St. FL 4 / Chicago, IL 60654 / +1-773-232-0958 / @onemanagementchicago", plus Spain and UK offices.
3. `https://onemanagement.com/submissions/application` — 2026-08-19T~06:44Z — Playwright `page.content()` — `<meta name="description" content="ONE Management scouts & manages diverse set of models, influencers, celebrities, musicians, actors, & athletes. New York, London, Los Angeles, Chicago, & Barcelona.">`.
4. `https://onemanagement.com/submissions/faq` — 2026-08-19T~06:47Z — Playwright innerText — full FAQ text quoted in §5,6,7,9 (age, height, curve division, transgender/non-binary representation, photo/walking/personality video guidance with "15 to 40 second" duration, response-time policy, no-payment policy).
5. `https://onemanagement.com/submissions/processandrules` — 2026-08-19T~06:47Z — Playwright innerText — the 7 numbered process rules quoted in §7,8,9, including the 13-and-under / 14–18 minor-consent rules and the submissions@onemanagement.com confirmation-email policy.
6. `https://onemanagement.com/submissions/application` — 2026-08-19T~06:44Z — Playwright `page.content()` (saved to local HTML, grepped) — page-top intro copy ("First:... Second:..."), photo guidelines, "UNDERSTANDING THE RULES" checkbox markup (`acceptedTC`, label "I have read and accept the Process + Rules"), RECRUITMENT WARNING modal text, verified/social handle list.
7. `https://onemanagement.com/submissions/application` — 2026-08-19T~06:44Z — Playwright, `page.content()` grepped for `href="/New-York/...`, `/Los-Angeles/...`, `/Chicago/...` — full per-market division nav link lists quoted in §1 and §6 (NY Women: Image/One-1/Development/Curve/Studio; NY Men: Image/Main/Development; LA Women: Image/Main/Development/Curve/Studio; LA Men: Image/Main/Development/Studio; Chicago Women: Image/Main/Development/Curve/Studio; Chicago Men: Image/Main/Development/Studio).
8. `https://onemanagement.com/submissions/application` — 2026-08-19T~06:48Z — Playwright script toggling `select[name=gender]` between Female/Male and reading `offsetParent`/computed style of `bustImperial`/`chestImperial` — confirmed gender-conditional show/hide of bust vs. chest measurement fields.
9. same page/method as #8 — toggling `select[name=unitType]` between US/EU/UK and reading visibility of `heightFeet`/`heightCm`/`shoesizeImperialUS`/`shoesizeImperialUK`/`shoesizeMetric`/`waistImperial`/`waistMetric` — confirmed unit-system-conditional field visibility.
10. `https://onemanagement.com/submissions/application` — 2026-08-19T~06:44Z — Playwright `page.content()` — Photo Upload section: "Please submit four photos of yourself: full length, waist up, close up, and profile.", guidelines 1–3, "Formats: jpg, jpeg, or png.", "File size: maximum 600 KB per image.", and the four `<input type=file>` elements (`image0`–`image3`, each `required accept="image/jpeg, image/png, image/jpg"`) with button labels "Full Length", "Waist Up", "Close Up", "Profile".
11. `https://onemanagement.com/submissions/application` — 2026-08-19T~06:44Z — Playwright `page.content()` — Video Upload section full text (30-second duration claims, guidelines, sample-video modal links, "NOTE: Please submit a link to your video.", fallback/optional-video instructions), plus DOM of `walking`/`personality` text inputs (`maxlength="350" pattern="*"`, no `required`).
12. `https://onemanagement.com/submissions/application` — 2026-08-19T~06:48Z — Playwright script filling `age` with 15, 13, 17 and reading native `ValidityState`/`validationMessage` via `page.$eval` — confirmed `min="16"` is enforced client-side with message "Value must be greater than or equal to 16." for 15 and 13, valid for 17; also filled `first` with "John123" (patternMismatch) and `walking` with "not a url at all" (valid:true); `page.on('request')` logged zero POST requests across the entire session.
