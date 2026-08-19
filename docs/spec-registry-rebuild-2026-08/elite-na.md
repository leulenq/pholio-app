# Elite Model Management (North America) — Agency Entry

**Lead adjudication notes (2026-08-19):**
- Three folklore corrections against the live DOM: (1) no stat floors are published anywhere
  on the NA site — the "5'8"–6'0"" figures circulating internally trace to third-party search
  synthesis, not Elite; (2) "silently rejects HEIC" is imprecise — HEIC is absent from the
  accept string (so the OS picker filters it by default) but nothing client-side blocks or
  warns on a HEIC file, making the failure mode server-side and invisible, which is worse for
  talent than a visible rejection; (3) the rumored "15-day guardian approval window" could not
  be found on any first-party Elite surface (NA or global) — UNCERTAIN, possibly post-submit
  email-flow only. (The v1 dataset recorded that window from the global form's page copy on
  2026-08-09; this lane could not reproduce it on 2026-08-19 — treat as CONTRADICTION between
  the v1 evidence record and current observation, not as proof either way.)
- The two HIGH findings — a promised guardian step that does not exist in the DOM, and
  "female identified persons" scoping with no NY/LA men's boards in the sitemap — are primary
  FINDINGS.md items.
- Everything below is the lane's primary-evidence research, integrated verbatim.

---

# Elite Model Management (North America) — `elite-na`

Researched 2026-08-19 (UTC). Primary host: `www.elitemodels.com`. Hard prohibitions respected:
form was never submitted, no account created, no email sent, no applicant data transmitted.
File-input and DOB-conditional tests used Playwright `setInputFiles`/`fill`/`selectOption` only;
network tab was watched throughout (`page.on('request')`) and zero POST/PUT requests were observed
during any of the interactions below.

---

## 1. Identity & channels

- **Legal entity (FACT, first-party PDF):** "ELITE MODEL MANAGEMENT, LLC", 37 E. 18th Street Floor 6,
  New York, NY 10003. Source: `https://www.elitemodels.com/elite-certificate-of-model-management-registration.pdf`,
  a NY DOL "Certificate of Model Management Registration" hosted directly on the agency's own domain and
  linked from the About page.
  - Certificate Number: **26-69YIX-LSFW**, Issued 05/28/2026, Expires 05/28/2028, Status: **"Registered"**
    (the DOL certificate itself uses the word "Registered", not "Active" — flagged as a wording note, see
    §10; the underlying registration matches the cert number given in the assignment).
- **Official NA domain:** `https://www.elitemodels.com` (plural). This is the flagship North-America site
  and the canonical host for a NYC applicant.
- **Alias domain (OBSERVED, not a distinct channel):** `elitemodel.com` (singular) — every path tested
  (`/`, `/w/global/application/application`) issues an HTTP 308 redirect straight to the equivalent
  `www.elitemodels.com` path. It is the same product under an old/alt domain, not a second route.
- **Legacy application URL (OBSERVED, not a distinct channel):** `https://www.elitemodels.com/w/global/application/application`
  (a Mediaslide-platform legacy path, discovered via a Google result snippet) itself 308-redirects to
  `/become-elite`. Confirms `/become-elite` is the one live application surface on this domain.
- **Regional NA offices (FACT, `/about` and `/contact`):** "Elite New York remains the flagship of the
  Elite North America network with satellite offices in Los Angeles, Miami and Toronto." Each office has
  its own address/phone/general-inquiry email (`info@elitemodels.com`, `lainfo@elitemodels.com`,
  `miamiinfo@elitemodels.com`, `torontoinfo@elitemodels.com`) — but **there is only one talent-application
  form/email for the whole NA network**; the office contact emails are general inquiries, not scouting
  submission addresses (the `/become-elite` page names only `becomeelite@elitemodels.com` for
  applications, see below). No office-specific application path exists.
- **Application channels on the NA site, verbatim (`/become-elite`, FACT):**
  > "Elite does not hold in office 'open calls'. All talent submissions must be sent either through email
  > at becomeelite@elitemodels.com or via the submission application below"
  - Channel A — **email**: `becomeelite@elitemodels.com` (verified: this is the exact address named on the
    page and matches the mailto: link target; confirms the assignment's "reportedly becomeelite@…" claim).
  - Channel B — **web form**: embedded directly on `/become-elite` (11-field + 6-photo + reCAPTCHA form,
    detailed in §3–4).
  - No third-party submission portal, no open-call schedule, no walk-in option is published for NA.
- **Global/other-brand route landscape (OBSERVED — a genuinely separate system, not part of NA):**
  - **Elite World Group** (`eliteworldgroup.com`) is the parent holding company site (Elite Model
    Management is one of several brands under it: Elite Model World, Women Management, The Society
    Management, Supreme Management, Women 360, per third-party/search summaries). Its own site is a
    corporate/business-inquiry site, not a talent application path; not explored further as out of scope
    for a NYC modeling applicant.
  - **Elite Model Look** (`elitemodellook.com`, form host `casting.elitemodellook.com`) is a **distinct,
    separate global competition/casting platform**, run by a different legal entity than Elite Model
    Management, LLC: its Terms & Conditions name the data controller as **"Elite Licensing Company SAGL"**,
    registered in Lugano, Switzerland (with an EU representative, "Elite Model Management Milano S.r.l.").
    This is Channel C, fully documented in §1a/§7 below because the brief asked to capture it if found —
    **it is not the NA application route** but a real, live, adjacent channel a talent could be confused
    into using.
  - `elitemodelworld.com` resolves (200) but its body is a two-line stale redirect stub
    (`document.location='web.app'`, an incomplete/broken relative redirect, `Last-Modified: 2020-08-17`).
    Treated as a **dead/stale legacy asset**, not a live channel.
  - `eliteworld.com` is a **parked domain-for-sale page** ("Eliteworld.com for sale | Spaceship.com") —
    unrelated to the agency, not a channel.

### 1a. Elite Model Look — the global competition channel (for contrast only)

- URL: `https://www.elitemodellook.com` (marketing/info pages) + `https://casting.elitemodellook.com`
  (the actual signup form, method="post", found unauthenticated, in Italian by default with a `?lang=`
  parameter; an `en` variant exists but timed out on load during testing — not confirmed reachable).
- This is a **yearly contest** ("Concorso Elite Model Look 2026" — form's hidden `edition` field = `2026`),
  not a rolling scouting application. It requires creating a full account (name, surname, email, password,
  confirm password) before any modeling data is entered — a materially different, heavier-weight flow than
  the NA form.
- **Which route should a NYC aspirant actually use:** the **NA `/become-elite` form or `becomeelite@elitemodels.com`
  email** is the only channel Elite Model Management, LLC (the NY-DOL-registered NYC entity) itself
  publishes for talent submissions. Elite Model Look is a different corporate entity's global contest.
  A third-party source (see below) states the global contest explicitly **excludes the USA**; this could
  not be fully confirmed first-party (see §10), but nothing on either site invites a US/NYC applicant to
  use Elite Model Look instead of `/become-elite`, and the NA site's own sitemap contains a page
  `https://www.elitemodels.com/info/elitemodellook` suggesting the NA brand treats it as informational
  content, not a redirect for US applicants.
  - **THIRD-PARTY, not verified first-party:** an Elite World Group TikTok post
    (`https://www.tiktok.com/@eliteworldgroup/video/7473849586302487854`) states: "Age 14+? You can apply
    to become a model anywhere in the world 🌎 (except USA) through our global model platform
    EliteModelLook.com." This is social-media copy, not the contest's own Terms & Conditions page, which
    say only "The Competition is being run worldwide" with no explicit US carve-out found in the text
    captured (see §12 log item 15). Recorded as CONTRADICTION-adjacent: two different official-adjacent
    sources describe availability differently, and only the TikTok one (third-party platform, first-party
    account) actually excludes the USA.

---

## 2. Flow map

**NA canonical form**, entry `https://www.elitemodels.com/become-elite`:

1. Single-page, single-scroll form (no multi-page wizard, no login/account gate). Three visually numbered
   sections on one page:
   1. "PHOTOS & CONTACT INFO" — 6 photo upload tiles + 11 contact/identity fields + inline eligibility text.
   2. "YOUR STORY" — free-text bio + Yes/No representation toggle.
   3. "MEASUREMENTS" — 8 measurement/appearance fields.
2. Below section 3: one required consent checkbox, then a Google reCAPTCHA v2 checkbox widget
   (`iframe title="reCAPTCHA"`, sitekey `6LcxzD8rAAAAAFkVvsSXqWd6-GFubVMmW2b0ck9A`), then the submit button.
3. **No account/login gate** — the whole thing is anonymous.
4. **No CAPTCHA-independent conditional steps observed**: changing Date-of-Birth to a minor age (tested
   2010-01-01, i.e. ~age 16 as of 2026-08-19) produced **zero DOM change** — same 29 form controls before
   and after, identical body-text length (OBSERVED, see §3/§7). The "Please provide info below" sentence
   that immediately follows the minor-consent notice does not correspond to any actual guardian field in
   the DOM at any DOB value tested.
5. Clicking "Yes" on "Do You Already Have Representation?" produces **no** conditional agency-name field
   (OBSERVED: form-control count stayed at 29 before/after).
6. **Where observation had to stop (real gate, not an assumption):** the submit `<button>` carries a
   static `disabled=""` attribute in the initial DOM. After filling **every** text/select/checkbox field
   with valid-looking test data (name, email, phone, address, city/state/zip/country, DOB, story text,
   representation answer, all 8 measurement fields, and checking the consent box) — **the button remained
   `disabled`** (OBSERVED, confirmed via `page.evaluate` reading `.disabled` after the fill sequence). The
   6 photo uploads and/or the reCAPTCHA challenge are the most likely remaining gates for enabling submit,
   but which one (or both) flips it could not be isolated without uploading files and solving reCAPTCHA —
   and solving reCAPTCHA plus clicking submit is exactly the line we are barred from crossing. **This is
   the hard stop**: everything at and before "form fully filled, still disabled" is directly observed;
   what happens after a human solves the reCAPTCHA and clicks send is not observed and not claimed here.
7. **Email channel** (`becomeelite@elitemodels.com`) has no published flow at all beyond "send your
   submission there" — no required subject line, attachment format, or template is published.

**Elite Model Look global channel** (for contrast, §1a): entry `casting.elitemodellook.com` → account
signup form (name/surname/email/password/confirm password) → DOB (day/month/year selects, range back to
1900) → **conditional** guardian block (`id="parent-fields"`) that is only present in the layout flow
(`offsetParent !== null`) when the selected birth year makes the applicant a minor (tested: 1995 → hidden,
2011 → visible) → height/gender/city/country/nationality → checkbox accepting Terms & Privacy Policy
(required, per the terms text) → (presumed) submit. Not pursued past the form-fill stage for the same
hard-prohibition reasons.

---

## 3. Field inventory (NA `/become-elite` form, in DOM order)

All fields below are native HTML controls; **none carry a native `required` attribute** — "requiredness"
is signaled only by a trailing `*` in the visible label text (OBSERVED in the form's outerHTML). Per the
brief's quality bar, fields with a `*` are treated as required-per-published-marker; nothing else in the
form publishes a distinction between required and optional beyond that asterisk.

Section 1 — Photos & contact info:
| Field (verbatim label) | name attr | type | required marker | notes |
|---|---|---|---|---|
| (photo uploads — see §4) | | file | none in HTML; slot labels imply all needed | |
| First name* | `first_name` | text | `*` in label | |
| Last name* | `last_name` | text | `*` in label | |
| Instagram URL | `instagram` | text | none | optional |
| E-Mail* | `email` | email | `*` in label | native `type=email` |
| Phone Number* | `phone_number` | **number** | `*` in label | OBSERVED quirk: `type="number"`, not `tel` — a numeric-only spinner input; formatting like `+1 (212) 555-1212` would not type normally in this control |
| Adress* | `address` | text | `*` in label | verbatim spelling — "Adress" is a typo on the live page |
| City* | `city` | text | `*` in label | |
| Country* | `country` | text | `*` in label | free text, **not** a dropdown |
| Zip / Postal Code* | `zip_code` | text | `*` in label | |
| State* | `state` | text | `*` in label | free text, **not** a dropdown |
| Date Of Birth* | `birthdate` | date | `*` in label | native date picker |

Inline text between contact info and Section 2 (FACT, verbatim):
> "We typically scout female identified persons ages 15 and up. Applicants under 18 years of age must have
> parental/guardian consent. Please provide info below."
(No guardian fields exist below this text anywhere in the DOM — see §7.)

Section 2 — Your story:
| Field (verbatim label) | name attr | type | required marker | notes |
|---|---|---|---|---|
| Briefly tell us about yourself. Where are you from? What are your goals?* | `your_story` | textarea | `*` | no maxlength observed |
| Do You Already Have Representation?* | (no name attr — implemented as two `<button type="button">` elements, "Yes"/"No") | button toggle | `*` | **not** a native radio/select; clicking either produces no conditional fields (OBSERVED) |

Section 3 — Measurements. Intro text verbatim:
> "To ensure the most accurate measurements, please wear a bikini and have someone you are comfortable with
> measure you. Please use a measuring tape."
> "Place the measuring tape around the fullest part of your bust."
> "Place the measuring tape approximately 1 inch above your belly button." [waist]
> "Stand feet together, place the measuring tape around the largest part of your lower hip and bottom." [hips]

| Field (verbatim label) | name attr | type | required marker | units |
|---|---|---|---|---|
| Bust* | `bust` | number | `*` | **no unit shown anywhere** — no cm/in label, no placeholder, no helper text (OBSERVED gap) |
| Waist* | `waist` | number | `*` | same — unit unpublished |
| Hips* | `hips` | number | `*` | same — unit unpublished |
| Height* | `height` | number | `*` | same — unit unpublished (numeric input, not ft'in" formatted) |
| Shoe* | `shoe` | number | `*` | same — unit unpublished (US vs EU sizing not specified) |
| Hair* | `hair` | text | `*` | free text, no option list |
| Eye* | `eye` | text | `*` | free text, no option list |
| Cup* | `cup` | text | `*` | free text, no option list (e.g., could type "B" or "34B" — no format enforced) |

Consent + anti-spam:
| Field | name attr | type | required marker |
|---|---|---|---|
| "I confirm that the images and information being submitted are of myself, or that I have permission to submit the images and information on behalf of the applicant." | `acceptTerms` | checkbox | no `*`, but paired with a `<span class="text-red-500 text-sm">` error slot implying client-side validation enforces it |
| reCAPTCHA v2 | `g-recaptcha-response` | hidden textarea + iframe widget | implicit gate | Google reCAPTCHA, sitekey visible in iframe src |

No client-side `maxlength`/`pattern`/`min`/`max` constraints were present on **any** field in the captured
outerHTML (checked explicitly for all inputs) except the reCAPTCHA-adjacent hidden textarea (not
user-facing). `dumpForms()` and a full `form.outerHTML` capture both confirm this absence.

---

## 4. Uploads

Six file inputs, all with **identical** `accept` attribute (OBSERVED, verbatim from DOM):
```
accept="image/jpeg,image/jpg,image/png,image/webp"
```
Slot names (verbatim visible label / `name` attribute):
1. "Full length" / `name="full_length"`
2. "Full length profile" / `name="full_length_profile"`
3. "Portrait length" / `name="portrait_length"`
4. "Close up (hair pulled back)" / `name="close_up_hair_pulled_back"`
5. "Close up profile (hair pulled back)" / `name="close_up_profile_hair_pulled_back"`
6. "Personality pic" / `name="personality_pick"` (note: the DOM attribute name is misspelled
   `personality_pick`, not `personality_picture`; the **visible label** is "Personality pic")

This **confirms the folk claim of "6 photo slots including a personality picture"** — verbatim label
"Personality pic", one of exactly 6 tiles, none marked optional, none allow `multiple` (no `multiple`
attribute present on any of the six inputs — one file per slot).

**HEIC handling — directly tested, not submitted (OBSERVED):**
- The `accept` attribute does **not** list `image/heic` or `image/heif`. In a normal OS file-picker dialog
  this would visually filter out `.heic` files by default (standard browser behavior for `accept`).
- However, when a `.heic`-extension file was attached programmatically (`setInputFiles`, which bypasses the
  OS picker's filter — simulating a user who chooses "All Files" or drags a file in), **the site performed
  no client-side type/extension validation**: `input.files[0].type` resolved to `"image/heif"`, and the
  page's own JS happily called `URL.createObjectURL()` on it and rendered a preview `<img>` element with
  that blob URL — no error message, no rejection, no red validation text appeared anywhere in the DOM.
  **Conclusion: HEIC is not silently rejected by any client-side check on this form** — the `accept`
  attribute is the *only* HEIC gate, it is a soft/UI-level filter that a normal browser picker enforces by
  default but that is trivially bypassed (e.g., "All Files," drag-and-drop, or a picker on a device that
  doesn't map HEIC to a filterable image category), and nothing downstream in the client validates the
  actual bytes/type. What the **server** does with an actually-submitted HEIC file could not be tested
  (would require submitting), so whether it fails silently server-side, converts it, or errors post-submit
  is UNCERTAIN — but the client offers no warning either way.
- No published file-size limit (per-file or total) was found anywhere on the page or in linked text.
- No video upload field exists on this form at all — no video requirement/instructions published for NA.
- No dimension/aspect-ratio/orientation guidance is published beyond the plain-language shot instructions
  in §5 (e.g., "full length" implies portrait full-body but no pixel/aspect requirement is stated).

---

## 5. Photo/shot instructions (verbatim, `/become-elite`)

> "For your photos, please wear form fitted clothing so that we can clearly see your body shape. Please do
> not wear any makeup or large accessories for instance hoop earrings or bracelets as they may be
> distracting. No smiles! Lastly, relax and be your natural and empowered self!"

No separate per-slot instructions beyond the slot names themselves (e.g., no distinct guidance for
"Personality pic" vs. the five body/face shots — the paragraph above is the only shot-prep text on the
page, applying to all six slots collectively).

No stated retouching/filter policy (neither "no filters/no retouching" nor permission to retouch is
mentioned anywhere on the page).

---

## 6. Eligibility

**Age (verbatim, `/become-elite`):**
- Top-of-page banner: "All applicants must be 18 years old or have written parental consent for
  consideration."
- Inline, just above Section 2 (embedded directly under the DOB field): "We typically scout **female
  identified persons** ages **15** and up. Applicants under 18 years of age must have parental/guardian
  consent."
- These two statements are **not phrased identically** — one says minimum 18 (with consent exception), the
  other says "typically... 15 and up" — recorded as an internal wording tension in §10, not silently
  resolved. Read together the practical floor appears to be **15, with required parental/guardian consent
  from 15–17**, but the page never states this synthesis explicitly; it is our reading, not the agency's
  words.

**Gender/division scoping (FACT, exact wording, not generalized):**
- The `/become-elite` inline text scopes eligibility explicitly to **"female identified persons"** — this
  exact phrase, not "models" or "talent" generically. Nowhere on `/become-elite` is a male, non-binary, or
  any other applicant path mentioned.
- **Corroborating structural evidence (INFERENCE from `sitemap.xml`, not a direct statement):** the NA
  site's public sitemap lists board/division pages per office. Miami and Toronto explicitly segment
  `.../men` (and `miami/curve`, `toronto/development-men`, `toronto/direct-men`, `toronto/life-men`)
  alongside their `/women` pages. **New York and Los Angeles have no `/men` (or any male-labeled) division
  URL anywhere in the sitemap** — only `new-york/creative`, `/development`, `/direct`, `/atelier`,
  `/classic`, `/image`, `/elite`, and `los-angeles/elite`, `/development`. This is consistent with (does
  not prove, but supports) the single application form's "female identified persons" scoping being the
  real, full eligibility rule for the NYC flagship office specifically — i.e., a male aspirant applying to
  the NYC office may have **no published path at all** through this agency's NA site. Labeled INFERENCE
  because the sitemap URL-naming convention is being used as a proxy for a claim the agency never states
  directly ("NY has no men's board").

**Height/measurements floors:** **none published as pass/fail thresholds anywhere.** The form collects
Bust/Waist/Hips/Height/Shoe/Hair/Eye/Cup as free numeric/text entry (see §3) but the agency does not state
minimum or maximum values for any of them on `/become-elite`, `/about`, or `/contact`. No stat floor table
exists on the NA site. (This directly contradicts a "folk claim" of published stat floors, if one exists —
we found no such published numbers to verify against; see §10.)

**Location/market restriction:** none stated on `/become-elite` itself — the form does not restrict by
country/state (Country and State are free-text fields, not gated dropdowns). The office network (NY/LA/
Miami/Toronto) implies a North-America focus, but the applicant-facing form places no geographic
restriction language anywhere in its copy.

---

## 7. Minors & guardians

**This is the single highest-priority finding for talent-facing accuracy.**

- The NA `/become-elite` page publishes, verbatim: "Applicants under 18 years of age must have
  parental/guardian consent. Please provide info below." (§6).
- **"Please provide info below" does not correspond to anything in the DOM.** Directly tested: setting
  Date of Birth to 2010-01-01 (a clearly-minor DOB as of the 2026-08-19 retrieval date) produced **zero**
  change to the form — identical control count (29) and identical page body text before and after, versus
  an adult DOB (1995-01-01). There is:
  - no guardian name field,
  - no guardian email/phone field,
  - no guardian-signature or e-consent checkbox,
  - no upload slot for a signed consent form,
  - no separate "if under 18" branch of the flow at all.
  The only place a minor's parent/guardian could plausibly leave any trace is the single generic checkbox
  at the very bottom of the form ("I confirm that the images and information being submitted are of
  myself, **or that I have permission to submit the images and information on behalf of the applicant**")
  — which is unlabeled as a guardian-specific control and reads as a general on-behalf-of clause, not a
  parental consent mechanism.
  - **Conclusion: the NA web form's own promised "provide info below" guardian step does not exist in the
    live DOM.** A minor (or their parent) following the NA form literally has no on-page mechanism to
    "provide" the promised guardian info; the only way to actually supply parental consent is presumably
    out-of-band, via the `becomeelite@elitemodels.com` email channel (e.g., attaching a signed consent
    letter) — but this is not stated anywhere either; it's our inference, not published guidance.
- **The "15-day guardian approval window" rumor:** **not found published on the NA site** (searched all
  captured `/become-elite` text — no mention of "15 day," "approval," or any timeframe near the guardian
  consent language) and **also not found on the global Elite Model Look site's Terms & Conditions or FAQ**
  (both fully fetched and grepped for "day(s)," "approv," "verif," "confirm...email," "link" near guardian
  content — no matches; see §12 log items 14–15). Marked **UNCERTAIN**: we could not verify this rumor from
  any first-party page reachable without submitting the form. It is possible such a window exists only in
  a post-submission email flow (e.g., "we'll email your guardian a consent link, valid 15 days") that is
  invisible without actually triggering that email — which we are barred from doing.
- **The global Elite Model Look form's guardian flow, captured verbatim since it was found (per the
  brief's instruction (d)):**
  - Terms & Conditions (FACT, `elitemodellook.com/int/en/terms`): "(a) The Competition is open to people
    aged 14 years and over at the time of applying" / "(b) You must have written consent from at least one
    parent or guardian to enter this Competition if you are under 18 years old."
  - FAQ (FACT, `elitemodellook.com/int/en/faq`): "To apply to Elite Model Look you must be aged at least 14
    years old." / "You must have permission from your parent or guardian if you are under 18 years old." /
    "Remember, only one entry is allowed per person each year!"
  - **Unlike the NA form, the global casting form actually implements guardian fields**: a block headed
    (Italian default) "Dati del genitore o del tutore legale per i minori" ("Parent or legal guardian
    details for minors"), `id="parent-fields"`, containing:
    - "Nome e cognome" (Full name) — `name="parentNameSurname"`, text
    - "Cellulare" (Mobile phone) — `name="parentMobile"`, type `tel`, `pattern="^[0-9]*$"`
    - "Email" — `name="parentEmail"`, text
  - **This block is genuinely conditional on the DOB field** (OBSERVED via `offsetParent` check): with
    birth year set to 1995 (adult), the guardian block was not in the layout (`offsetParent === null`
    i.e., hidden by a `display:none` ancestor); with birth year set to 2011 (minor as of 2026), the block
    became visible (`offsetParent !== null`). This is exactly the conditional-guardian-branch behavior the
    NA form's copy promises but does not deliver.
  - No "15-day" or any other approval-window language was found in this form's HTML or in the Terms/FAQ
    pages either (searched explicitly, see §12 item 15) — so the rumor is unverified on **both** routes,
    not just the NA one.

---

## 8. Consent & legal

**NA `/become-elite` (verbatim, full text — this is the entirety of consent copy on the page, no
boilerplate to truncate):**
> "I confirm that the images and information being submitted are of myself, or that I have permission to
> submit the images and information on behalf of the applicant."

No separate Privacy Policy or Terms of Use link is presented at the point of application on `/become-elite`
itself (no footer links, no inline "By submitting you agree to our Privacy Policy" language were found on
this page). No data-retention statement, no usage-rights grant beyond what's implied by "submitting your
images," no scam warning is published on this page.

**Elite Model Look (global, for contrast — truncated to first sentence + link per instructions, since this
is a much longer document not central to the NA route):**
> "As the text of these Terms and Conditions may be presented in several languages, English shall always be
> the deciding language in the case of any differences in interpretation." — full text at
> `https://www.elitemodellook.com/int/en/terms/index.htm`. Notable non-boilerplate clauses: data controller
> is Elite Licensing Company SAGL (Lugano, Switzerland); data may be shared with "chaperons," sponsors,
> photographers, "insurance companies"; "We will not return any photographs or other content that you
> provide to us as part of your Submission"; images/name/likeness may be used "throughout the world in any
> media now known or in the future devised" for promotion of the applicant's participation.

---

## 9. Process facts

- **No open calls (FACT, verbatim):** "Elite does not hold in office 'open calls'." (`/become-elite`).
- **No response-policy statement** ("we will only contact you if interested," or similar) is published
  anywhere on `/become-elite`, `/about`, or `/contact`.
- **No stated timeline** for review/response after submission (neither for the email channel nor the web
  form) is published.
- **No deadline/seasonal window** is published for the NA channel — submissions appear to be accepted on a
  rolling basis (consistent with "no open calls" and a permanently-live application form).
- **No re-application guidance** (e.g., "wait X months before reapplying," "one submission per year") is
  published on the NA site. (Contrast: the global Elite Model Look FAQ explicitly states "only one entry is
  allowed per person each year" — a rule that exists on the global contest but has no NA equivalent
  published.)
- **Hashtag / social callout (FACT, verbatim):** "If you are interested in modeling we encourage you to
  share your story and images through the hashtag below. ... #BecomeElite" — presented as an
  alternative/supplementary discovery channel, not a formal application path (no judged mechanism
  described).

---

## 10. Contradictions & uncertainties (ranked by how badly they could surprise a talent)

1. **[HIGH] Promised guardian info flow does not exist.** The NA form's own copy says "Applicants under 18
   years of age must have parental/guardian consent... Please provide info below," but no guardian field
   of any kind appears in the DOM at any DOB tested. A minor applicant (or parent) following the page's
   literal instructions will find nothing to fill in. See §7.
2. **[HIGH] Age-floor wording is internally inconsistent.** Top banner says "All applicants must be 18
   years old or have written parental consent," while the inline text just above the DOB field says "We
   typically scout female identified persons ages 15 and up... Applicants under 18... must have
   parental/guardian consent." Both are real, both are on the same page, and they are not word-for-word
   reconcilable (18-with-exception vs. "typically 15 and up" as a description of who gets scouted). Not
   silently resolved here — both quoted verbatim in §6.
3. **[HIGH] Gender scoping may exclude male applicants entirely from the NYC office, with no stated
   alternative.** The form's own text says "female identified persons"; sitemap structure suggests NY/LA
   have no men's board at all (unlike Miami/Toronto). A male aspirant in NYC has no clearly published path
   through this agency at all. See §6 (INFERENCE flagged as such).
4. **[MEDIUM] HEIC is not client-side blocked despite not being in `accept`.** An iPhone user attaching a
   HEIC photo via "All Files" (or any flow that bypasses the OS accept-filter) gets no warning client-side;
   what happens server-side after actual submission is unknown (UNCERTAIN, not tested). See §4.
5. **[MEDIUM] No units published for any measurement field** (bust/waist/hips/height/shoe are bare number
   inputs with zero cm/in or US/EU sizing indication) — a talent has to guess the expected unit system. See
   §3.
6. **[MEDIUM] No stat-floor numbers published anywhere on the NA site** — if a "folk claim" of specific
   height/measurement minimums exists in talent-community lore, it could not be verified against any
   agency-published number; we found none to confirm or deny against. See §6.
7. **[LOW-MEDIUM] "15-day guardian approval window" is unverifiable from any reachable page**, on either
   the NA form or the global Elite Model Look form/terms/FAQ. Could exist only in a post-submission email
   never observed. See §7.
8. **[LOW] Route confusion risk between NA and Elite Model Look.** Different legal entity (Elite Licensing
   Company SAGL vs. Elite Model Management, LLC), different flow (account+password vs. anonymous form),
   different age copy (14+ vs. "typically 15+"/"18 unless consent"), and (third-party-sourced only) a
   claimed US exclusion on the global contest. A NYC talent who lands on `elitemodellook.com` instead of
   `elitemodels.com` would be applying to the wrong, unrelated system. See §1/§1a.
9. **[LOW] Certificate status wording.** The DOL PDF linked from the agency's own `/about` page says
   Status: "Registered"; the assignment brief's framing says "Active." Not a contradiction between sources
   so much as a note that the certificate's own field literally reads "Registered" — recorded verbatim in
   §1 in case the distinction matters downstream.
10. **[LOW] "Personality pic" vs. `personality_pick`.** Purely cosmetic: the visible label says "Personality
    pic," the underlying form field name is misspelled `personality_pick` — irrelevant to a talent's
    experience but noted for completeness/verbatim accuracy in §4.

---

## 11. Draft talent-facing brief (for Pholio's Market view)

**Elite Model Management — New York (Elite North America)**

Apply two ways: fill out the form at elitemodels.com/become-elite, or email your submission directly to
becomeelite@elitemodels.com. There are no in-office open calls — this form is the only door.

Have ready: 6 photos (full length, full length profile, portrait length, close-up with hair pulled back,
close-up profile with hair pulled back, and a "personality pic") in JPG, PNG, or WEBP — one file per slot,
no multiples. Wear form-fitting clothing, no makeup, no large accessories, no smile. The site doesn't say
what file-size limit applies, and while it doesn't list HEIC as an accepted format, nothing on the page
actively blocks a HEIC file either — safest bet is to convert iPhone photos to JPG before uploading.

You'll also fill in your contact info, a short "about you" story, whether you already have representation,
and eight measurements — bust, waist, hips, height, shoe size, hair color, eye color, cup size. The form
never says whether it wants inches or centimeters, US or EU shoe sizing — the agency doesn't say, so use
whatever's standard for you and expect it might get double-checked later.

The page states the agency "typically" scouts "female identified persons" 15 and up, though a banner
elsewhere on the same page says applicants must be 18 or have written parental consent — the agency's own
wording doesn't fully agree with itself on this point. If you're under 18, the page says you need
parental/guardian consent and promises fields to "provide info below" for that — in practice, as of this
research, no such fields actually exist on the form. If you're a minor, your safest path is emailing
becomeelite@elitemodels.com directly and asking how to submit guardian consent, since the web form doesn't
offer a way to do it.

There's no published response-time policy, no stated deadline, and no re-application waiting period for
this NA channel — submissions appear rolling. Note: Elite also runs a separate, unrelated worldwide contest
called Elite Model Look (a different legal entity, different website, different flow) — that is not this
agency's US application and shouldn't be confused with it.

---

## 12. Evidence log

1. `https://www.elitemodels.com/robots.txt` — 2026-08-19, curl. Evidences: robots policy. Content: `Allow: /` / `Disallow: /api` / sitemap link. Confirms only `/api` disallowed, matching the assignment brief.
2. `https://www.elitemodels.com/become-elite` — 2026-08-19 ~06:44 UTC, Playwright (networkidle). Evidences: full application form DOM, all copy in §2–§9. HTTP 200. Title: "Become Elite Model - Apply to Elite Models Agency | Elite Models".
3. `form.outerHTML` capture of the above page — 2026-08-19, Playwright `page.evaluate`. Evidences: exact field markup, absence of native `required`/`maxlength`/`pattern` attributes, exact `accept` string on all 6 file inputs, reCAPTCHA sitekey, submit-button `disabled` attribute. Saved locally at `/tmp/.../scratchpad/phase2/form-outer.html`.
4. DOB-conditional test — 2026-08-19, Playwright, `birthdate` field filled `2010-01-01` then `1995-01-01`. Evidences: no guardian fields appear for either value; form-control count constant at 29; body-text length constant at 2028 chars. Zero POST/PUT requests observed throughout (network listener active).
5. HEIC file-input test — 2026-08-19, Playwright `setInputFiles` with a synthetic `test.heic` (12-byte file, `ftypheic` magic bytes) against the `full_length` input. Evidences: `input.files[0].type === "image/heif"`; no error text appeared; page rendered a preview `<img>` via `URL.createObjectURL`; zero POST/PUT requests observed (form never submitted).
6. Submit-button state test — 2026-08-19, Playwright, all 11 text/select fields + textarea + "No" representation click + 8 measurement fields + consent checkbox filled with placeholder test data (no real applicant, never intended for submission), no files attached, no reCAPTCHA solved. Evidences: submit button `disabled === true` after full text fill — confirms photos and/or reCAPTCHA are the remaining gate; zero POST/PUT requests observed.
7. Representation-toggle test — 2026-08-19, Playwright, clicked "Yes" button for "Do You Already Have Representation?". Evidences: form-control count unchanged (29 before/after) — no conditional agency-name field.
8. `https://www.elitemodels.com/about` — 2026-08-19, Playwright. Evidences: agency history, "Elite New York remains the flagship of the Elite North America network with satellite offices in Los Angeles, Miami and Toronto," link to the NY DOL certificate PDF.
9. `https://www.elitemodels.com/elite-certificate-of-model-management-registration.pdf` — 2026-08-19, curl + PDF read. Evidences: NY DOL Certificate of Model Management Registration, Business Name "ELITE MODEL MANAGEMENT, LLC", Certificate Number 26-69YIX-LSFW, Issued 05/28/2026, Expires 05/28/2028, Status "Registered", signed by Maura McCann, Director, Division of Labor Standards.
10. `https://www.elitemodels.com/contact` — 2026-08-19, Playwright. Evidences: NY/LA/Miami/Toronto office addresses, phones, and general-inquiry emails (info@, lainfo@, miamiinfo@, torontoinfo@elitemodels.com) — none of these are the application email.
11. `https://www.elitemodels.com/sitemap.xml` — 2026-08-19, curl. Evidences: full page inventory; division URLs `new-york/{creative,development,direct,atelier,classic,image,elite}`, `los-angeles/{elite,development}` (no `/men` segment for either office) vs. `miami/{women,development,direct-women,men,curve}` and `toronto/{women,development-women,direct-women,life-women,men,development-men,direct-men,life-men}` (explicit men/women segmentation). Also lists `https://www.elitemodels.com/info/elitemodellook`.
12. `elitemodel.com` (singular) and its `/w/global/application/application` path — 2026-08-19, curl. Evidences: 308 redirect to `www.elitemodels.com` root and to `www.elitemodels.com/w/global/application/application` respectively, the latter then 308-redirecting again to `/become-elite`. Confirms alias-domain, single-live-route conclusion in §1.
13. `elitemodelworld.com` — 2026-08-19, curl with headers. Evidences: HTTP 200, `Last-Modified: Mon, 17 Aug 2020`, body is a 2-line stub with `document.location='web.app'` (broken relative redirect). Treated as stale/dead.
14. `eliteworld.com` — 2026-08-19, curl. Evidences: title "Eliteworld.com for sale | Spaceship.com" — parked domain, unrelated to the agency.
15. `https://www.elitemodellook.com/int/en/terms/index.htm` and `https://www.elitemodellook.com/int/en/faq/index.htm` — 2026-08-19, Playwright (domcontentloaded). Evidences: age-14+ and under-18-guardian-consent language quoted in §7/§1a; data controller "Elite Licensing Company SAGL"; grepped explicitly for "day," "guardian," "parent," "minor," "consent," "United States," "USA," "15 day," "approv," "verif" — no US-exclusion language and no "15-day" approval-window language found in either document.
16. `https://casting.elitemodellook.com/` — 2026-08-19, Playwright (domcontentloaded), default `lang=it`. Evidences: full signup form (30 controls) including hidden `edition=2026`; conditional guardian block `id="parent-fields"` headed "Dati del genitore o del tutore legale per i minori" containing `parentNameSurname`/`parentMobile` (`pattern="^[0-9]*$"`)/`parentEmail`. Full form HTML saved at `/tmp/.../scratchpad/phase2/casting-full-form.html`.
17. DOB-conditional test on the global casting form — 2026-08-19, Playwright, `birthDateYear` selected `1995` then `2011` (with month/day set to January 1). Evidences: guardian block `offsetParent === null` (hidden) at 1995, `offsetParent !== null` (visible) at 2011 — confirms genuinely conditional guardian branch on the global form, contrasting with the NA form's non-functional promise.
18. WebSearch, query `eliteworldgroup.com application form model` — 2026-08-19. Evidences: third-party TikTok post text (`https://www.tiktok.com/@eliteworldgroup/video/7473849586302487854`, an Elite World Group-run account) stating "Age 14+? You can apply to become a model anywhere in the world 🌎 (except USA) through our global model platform EliteModelLook.com" and describing a UK walk-in option at Elite London — none of this pertains to NA/NYC directly but establishes the route landscape referenced in §1/§1a. Labeled third-party per the brief's provenance rules.
19. `https://eliteworldgroup.com/` and `/faq/` — 2026-08-19, curl (status checks only, 301/403 responses observed depending on host variant `www` vs. bare); not deeply explored as out of scope for a modeling applicant (corporate/business site).
