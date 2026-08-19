# State Management — Agency Entry

**Lead adjudication notes (2026-08-19):**
- Premise falsified: statemgmt.com does NOT link to the Snapcast form anywhere (grepped every
  fetched State page). State runs TWO parallel, unlinked application channels — its own native
  form (canonical; accepts HEIC; no published size cap; State's own legal terms) and the
  Snapcast form (3MB/file enforced in DOM; no HEIC; account creation required; Snapcast's own
  terms with a perpetual, irrevocable, worldwide likeness license). The registry model must
  support multiple simultaneous channels per agency with per-channel constraints AND
  per-channel legal regimes — this single agency is the strongest evidence for that.
- The three-way kids-email inconsistency (scouting@ / kids@ / repmykid@) and the conflicting
  age floors (State policy 18-independent vs Snapcast platform 13+/13–17-guardian) are primary
  FINDINGS.md items for the minors section.
- Everything below is the lane's primary-evidence research, integrated verbatim. (The lane was
  interrupted by an infrastructure limit after writing this file; its content is complete —
  all 12 sections and the evidence log are present.)

---

# State (State Artist Management) — Spec Registry Research

Slug: `state`. All timestamps UTC, retrieved 2026-08-19.

## 1. Identity & channels

- Legal entity per Privacy Policy (self-published): **State Artist Management** ("we", "us", "our"), operating `www.statemgmt.com`. — FACT [Evidence #12]
- NYDOL: State Artist Management LLC, cert **26-66CVV-LSFW**, issued 2026-03-20, Active — as given in assignment prompt. I could not locate a public NYDOL license-lookup page to independently confirm this cert number (searched for a DOL employment-agency search tool; NY DOL's site describes the licensing process but I found no queryable public database in the time available). — UNCERTAIN (not independently re-verified; recorded as provided).
- Registered/mailing address: privacy policy is internally **inconsistent** about this — see Contradictions (§10).
- Offices: New York, Chicago, Los Angeles, per About page. — FACT [Evidence #7]: "State management has offices in New York, Chicago and Los Angeles."
- Divisions (self-described): "Our image and main fashion model divisions span kids to classic and petite to plus size. Sports & fitness models round out our lifestyle division... Professionally trained fit models..." — FACT [Evidence #7]. Sitemap also lists market/division taxonomy: management-main, management-image, management-development, los-angeles-main/development/curve, new-york-direct/curve/petite/lifestyle/fit — FACT [Evidence #1] (robots.txt sitemap listing).
- **Application channels found — TWO separate, independently-built forms exist, plus email fallbacks:**
  1. **State's own native form** at `https://www.statemgmt.com/become-a-model` — built on State's own Next.js site (footer says "Powered by Mainboard"), single page, all fields + 4 photo uploads with sample images shown, own reCAPTCHA, own Privacy Policy/Terms links. — OBSERVED [Evidence #3, #4]
  2. **Third-party Snapcast form** at `https://statemgmt.getsnapcast.com/become-a-model` — hosted entirely on Snapcast/Bookt's platform, branded "POWERED BY SNAPCAST" with a "STATE" wordmark banner, `source=state` query param on the form action, its own account/password creation, and its own Terms/Privacy (Snapcast's, not State's). — OBSERVED [Evidence #5, #6]
  3. Email fallback for general errors on **both** forms: **scouting@statemgmt.com** — FACT, appears verbatim on both forms [Evidence #3 text, #5 text].
  4. Email fallback for kids on State's *own* form: **kids@statemgmt.com** — FACT [Evidence #3 screenshot / text: "or to kids@statemgmt.com for our Kid's division"].
  5. Email channel reached by selecting "KIDS" on the *Snapcast* form: **repmykid@statemgmt.com** — FACT, confirmed exactly as the assignment's rumor stated [Evidence #6].
  6. Privacy Policy §6.4 directs U18 applicants (on State's own form, general "consent form" request) to **scouting@statemgmt.com**, not kids@ or repmykid@ — FACT [Evidence #12].
  - **This is a three-way inconsistency in kids/minor email routing** — see §10, ranked as the top trap.

- **CRITICAL CONTRADICTION vs. assignment premise**: The assignment states State's own site "links to" the Snapcast form (to verify). I could not find any such link. I fetched the rendered `become-a-model` page, its full link list (via Playwright), the home page, the contact page, and grepped every downloaded State page/JSON for the string "snapcast" — **zero matches**. The `become-a-model` page on statemgmt.com is a **complete, independent, fully-featured native form**, not a redirect or embed pointing at Snapcast. There is no `<meta refresh>`, no 3xx HTTP redirect (confirmed `HTTP/2 200` direct response), and no outbound link to any getsnapcast.com URL anywhere on the four State pages checked. — OBSERVED/FACT [Evidence #2, #3, #4, #8, #9]. A public web search independently corroborates that the Snapcast URL is a real, currently-used State Management application channel (referenced by third-party sites, not by statemgmt.com itself) — likely used via Snapcast's own scouting/mobile-app flow (QR codes at open calls, scout-initiated sign-ups) rather than site navigation. This is INFERENCE, not confirmed by any first-party source.
- **Canonical channel for a NYC applicant**: Ambiguous — State runs two parallel, non-cross-linked forms with different field sets, different consent regimes, and different data recipients (see §8). Absent a stated preference, `statemgmt.com/become-a-model` is the more discoverable one (reachable from State's own nav) and should be treated as canonical; the Snapcast form should be modeled as a documented *alternate/scouting* channel, not assumed to be state's primary path.

## 2. Flow map

### Channel A — statemgmt.com/become-a-model (native)
- Single page, single step, one `<form>` visible with all fields simultaneously rendered (no wizard/next button observed in DOM).
- No account/login gate.
- Google reCAPTCHA present (`g-recaptcha-response` textarea in DOM; page text: "This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply.")
- Two separate `submit`-type buttons and **two** `g-recaptcha-response` textareas exist in the DOM (`g-recaptcha-response` and `g-recaptcha-response-1`) — OBSERVED [Evidence #4]. I did not click either submit button (hard prohibition), so I could not confirm whether this reflects a genuine two-part submission (e.g., basic info posts separately from photo uploads) or is simply duplicated markup/accessibility scaffolding. Flagged UNCERTAIN — this is exactly the kind of "gate I could not pass without submitting."
- Observation stopped before any submit click, per hard prohibition.

### Channel B — statemgmt.getsnapcast.com/become-a-model (Snapcast)
- Single page, single `<form id="becomeForm" action="/registrants?source=state" method="post" enctype="multipart/form-data">` — OBSERVED [Evidence #6 DOM].
- All fields render at once; gender selection (radio) **conditionally shows/hides** blocks of fields (see §3), but this happens client-side within the one page/one form — not a multi-step wizard with separate URLs.
- Selecting **KIDS** replaces the entire measurement/photo/basic-info form region with static instructional text and no submittable fields — this is a dead-end that hands the applicant off to email, not a form path. — OBSERVED [Evidence #6b].
- Account creation is embedded in the form itself: `password` + `password_confirmation` fields are part of the same submission (no separate signup step) — OBSERVED [Evidence #6 DOM].
- Google reCAPTCHA v2 present (network request to `google.com/recaptcha/api2/reload` fired automatically on page load; `g-recaptcha-response` textarea in DOM). — OBSERVED [Evidence #6, #11].
- No CAPTCHA-gated "next" step blocked observation; I stopped before clicking the `submit` button. All measurement fields, photo slots, and consent text were fully visible without any login/paywall/CAPTCHA solve required to inspect them.
- No POST requests fired from typing into fields or toggling gender/radio (confirmed via `page.on('request')` while typing invalid email/mobile values and switching gender radios) — only analytics beacons (`analytics.google.com`, `stats.g.doubleclick.net`) and the reCAPTCHA widget's own `api2/reload` load, none of which carry form field data. — OBSERVED [Evidence #10, #11].

## 3. Field inventory

### Channel A — statemgmt.com/become-a-model (native form)
All fields below observed via DOM dump; **no `required` value distinguishes true/false** — every field below has a bare `required` attribute or a trailing `*` in its placeholder, so all are "present, required" except Instagram/TikTok/Website which are asterisk-free.

| Field | Type | Required (evidence) | Notes |
|---|---|---|---|
| Gender | text input w/ custom dropdown (MUI-style autogenerated id) | `*` in placeholder "Gender*", `required` attr | Options not enumerable from static DOM (custom combobox); not opened due to risk of triggering unknown JS. UNCERTAIN what options list contains beyond what Snapcast form shows. |
| First Name | text | `*`, `required` | |
| Last Name | text | `*`, `required` | |
| Date of Birth | text (custom date widget, separate hidden `birthday` input) | `*` in placeholder | Two DOM nodes: a display text input and a paired `name="birthday"` input — likely a date-picker component. |
| City | text | `*`, `required` | |
| State | text | `*`, `required` | Free text field labeled "State*", not a `<select>` (unlike the Snapcast form's state dropdown). |
| Country | text | `*`, `required` | Free text field, not enumerated `<select>` like Snapcast's. |
| Phone | text | `*`, `required` | |
| Email | type=email | `*`, `required` | |
| Height | text w/ custom dropdown | `*`, `required` | |
| Bust | text w/ custom dropdown | no `*`, not required | |
| Waist | text w/ custom dropdown | no `*`, not required | |
| Hips | text w/ custom dropdown | no `*`, not required | |
| Shoe | text w/ custom dropdown | no `*`, not required | Single ungendered "Shoe" field — unlike Snapcast's separate `shoefemale`/`shoemale`. |
| Instagram | text | not required | |
| TikTok | text | not required | |
| Website | text | not required | |
| 4× photo upload | `type=file`, `accept="image/*, image/heic, image/heif"` | marked with `*` on the "UPLOAD X *" button label | `name`s: `closeUp`, `waistUp`, `fullLength`, `threeQuarter`. No `data-rule-filesize` or other max-size attribute found in this form's DOM (contrast with Snapcast form, which does specify one — see §4). |

Units: Height/Bust/Waist/Hips/Shoe fields render as free-text/custom-dropdown widgets whose option content could not be enumerated without risking an unintended interaction with the custom widget (no visible `<option>` elements, unlike Snapcast's plain `<select>`). UNCERTAIN whether they offer imperial, metric, or both — Snapcast's equivalent fields (§ below) offer both simultaneously in one string, and it's plausible (INFERENCE) this form does too, but not confirmed.

### Channel B — statemgmt.getsnapcast.com/become-a-model (Snapcast form) — full inventory
Form: `<form id="becomeForm" action="/registrants?source=state" method="post" enctype="multipart/form-data">`

**Gender radios** (name="gender"), default pre-checked state = **FEMALE** (observed as pre-selected on fresh page load, before any interaction):
- FEMALE (value="female")
- MALE (value="male")
- NON-BINARY (value="nonbinary")
- KIDS (id="kids", value="" — empty value; selecting this does not add a real "kids" gender value, it just triggers the DOM to swap in email-handoff text, described in §2/§7 below)

**Basic information (always visible regardless of gender):**
| Field | Type | Required | Notes |
|---|---|---|---|
| First name | text, placeholder "first name *" | `required`, `aria-required="true"` | |
| Last name | text, placeholder "last name *" | `required` | |
| Date of birth | text, `id="dob_datepicker"`, placeholder "date of birth *" | `required` | jQuery UI datepicker widget. Opening it shows a **year dropdown spanning 1926–2026 (101 years, i.e. up to and including the current year)** with no min/max date restriction observed — OBSERVED [Evidence #13]. This means the widget does **not** client-side block a birth year equal to the current year (no enforced minimum age via the date picker itself). |
| City | text, placeholder "city *" | `required` | |
| Country | `<select id="country">`, required | `required` | Full ISO-style country list (260+ countries), first real option "United States" |
| State | `<select id="stateL">`, required | `required` | Full US state list (50 states + DC + territories + Armed Forces regions) |
| (state, freetext) | `input name="state" placeholder="state"` | not required | A **second**, separate free-text "state" input also exists in the DOM alongside the `stateL` select — OBSERVED duplicate/redundant field, purpose unclear. UNCERTAIN why both exist. |
| Mobile | text, placeholder "mobile *" | `required` | No `pattern`/format mask observed in DOM. |
| Email | type=email, placeholder "email *" | `required` | |
| Password | type=password, placeholder "Password *" | `required` | No `pattern`/`minlength` attribute found — no client-side strength rule observed in DOM. |
| Password confirmation | type=password | `required` | |

**Gender-conditional measurement fields** (all `<select>`, all with "Field *"-style first option acting as a placeholder) — visibility tested by toggling each gender radio and reading computed style / `offsetParent`:

| Field (name) | Default(=Female) | Male | Non-binary | Kids |
|---|---|---|---|---|
| height | VISIBLE | VISIBLE | VISIBLE | HIDDEN |
| bust | VISIBLE | HIDDEN | VISIBLE | HIDDEN |
| chest | HIDDEN | VISIBLE | VISIBLE | HIDDEN |
| waist | VISIBLE | VISIBLE | VISIBLE | HIDDEN |
| hips | VISIBLE | HIDDEN | VISIBLE | HIDDEN |
| inseam | HIDDEN | VISIBLE | VISIBLE | HIDDEN |
| collar | HIDDEN | VISIBLE | VISIBLE | HIDDEN |
| dressSize | VISIBLE | HIDDEN | VISIBLE | HIDDEN |
| suitSize | HIDDEN | VISIBLE | VISIBLE | HIDDEN |
| shoefemale | VISIBLE | HIDDEN | VISIBLE | HIDDEN |
| shoemale | HIDDEN | VISIBLE | VISIBLE | HIDDEN |
| hairColor | VISIBLE | VISIBLE | VISIBLE | HIDDEN |
| eyes | VISIBLE | VISIBLE | VISIBLE | HIDDEN |

— OBSERVED, tested live via Playwright by checking each radio and reading `getComputedStyle`/`offsetParent` [Evidence #13]. Key finding: **Non-binary shows every field from both Female and Male sets simultaneously** (superset), and **Kids hides every measurement field** (see §2/§7 — Kids swaps the whole region for an email-handoff message).

Units for all measurement `<select>` options: **both imperial and metric in one string**, e.g. Height: `5'0" / 153cm` ... up to `7'2" / 218cm` (spans ~5'0" to over 7'0" — no stated minimum height requirement, this is simply the dropdown's full range, not a stated eligibility floor — INFERENCE that this is not itself a height floor). Bust/Chest/Waist/Hips/Inseam/Collar options similarly paired `X" / Ycm`. Dress size options are `US / UK / EU` triplets (e.g. `8 US / 10 UK / 38 EU`), some as ranges (e.g. `0-2 US / 2-4 UK / 30-32 EU`). Suit size options are `US / EU` pairs (e.g. `40 US / 50 EU`). Shoe (both `shoefemale` and `shoemale`) are `US / UK / EU` triplets.

Hair color options (verbatim, required): Auburn, Blonde, Black, Brown, Grey, Red, Salt and Pepper, Shaved, White, Silver, Strawberry, Bald, Other.
Eye color options (verbatim, **not required** — no `*`, no `required` attr found on `#eyes`): Amber, Black, Blue, Blue/Green, Blue/Grey, Brown, Green, Green/Brown, Green/Grey, Grey, Hazel.

**Other fields:**
| Field | Type | Required |
|---|---|---|
| Instagram | `type="instagram"` (nonstandard input type, browser treats as text), placeholder "instagram" | not required |

**Submit / CAPTCHA:**
- `input type="submit" id="btn_submit" value="submit"`
- `textarea name="g-recaptcha-response" id="g-recaptcha-response"` — Google reCAPTCHA, confirmed live via `POST .../recaptcha/api2/reload?k=6Lfb4dQZAAAAAOdQBaOTaLLr-Pg-ThFvL5VEKvfG` firing automatically on page load [Evidence #11] — this is the classic checkbox-style reCAPTCHA v2 endpoint (`api2`), not v3/invisible-only, though no separate visible checkbox widget was distinctly captured in the full-page screenshot (may render just above/beside Submit).

**Client-side validation behavior observed:** The form uses jQuery Validate-style `data-msg-*` / `data-rule-*` attributes (visible in raw HTML) rather than native HTML5 `pattern`/`minlength`. Typing an invalid value (`not-an-email` into email, `abc` into mobile) and blurring did **not** produce a visibly-injected inline error node discoverable via generic selectors in my test, and critically **did not fire any non-analytics network request** — confirmed via `page.on('request')` across the whole interaction [Evidence #10]. I stopped short of deeper interaction once no POSTs were observed, per the brief's instruction to watch and stop if any fire (none did, so testing continued only as far as documented here).

## 4. Uploads

### Channel A (statemgmt.com native)
- 4 file inputs: `closeUp`, `waistUp`, `fullLength`, `threeQuarter` (labelled visually "UPLOAD CLOSE-UP *", "UPLOAD WAIST-UP *", "UPLOAD FULL-LENGTH *", "UPLOAD 3/4 PROFILE *").
- `accept="image/*, image/heic, image/heif"` on all four — broader than Snapcast's list, explicitly includes HEIC/HEIF (iPhone native format).
- **No per-file or total size limit found in the DOM** (no `data-rule-filesize` or similar attribute present) and the visible page text does **not** state a size cap for this form (contrast with Snapcast's explicit "PHOTOS SHOULD BE LESS THAN 3MB"). This is a published-vs-Snapcast discrepancy — flagged in §10.
- Sample photos are shown next to each upload slot (actual example images of a model doing close-up / waist-up / full-length / 3/4-profile poses in plain clothing against a plain background) — OBSERVED via screenshot [Evidence #3-shot].
- `multiple` attribute absent on all four — single file per slot, four slots.

### Channel B (Snapcast)
- 4 file inputs, exact DOM attributes:
  - `name="uploadOne"` → labelled **"close-up:"** — `data-msg="Close-up is required"`, `data-rule-accept="image/gif, image/jpeg, image/pjpeg, image/png, image/bmp"`, `data-msg-accept="Close-up image is not valid"`, `data-rule-filesize="3145728"`, `data-msg-filesize="Close-up should be less than 3MB"`
  - `name="uploadTwo"` → labelled **"waist-up:"** — same pattern, "Waist-up should be less than 3MB"
  - `name="uploadFull"` → labelled **"full length"** — same pattern, "Full length should be less than 3MB"
  - `name="uploadClose"` → labelled **"profile"** (i.e., the 3/4 profile shot) — same pattern, "Profile should be less than 3MB"
  - **Note the naming quirk**: the input `name` attributes do not map intuitively to their visible labels (`uploadOne`=close-up, `uploadTwo`=waist-up, `uploadFull`=full length, `uploadClose`=profile — "uploadClose" is actually the *profile* shot, not the close-up). Worth flagging for anyone building against the raw field names.
- **Per-file cap confirmed exactly: 3,145,728 bytes = 3.0 MB (3×1024×1024) each**, matching the published text "PHOTOS SHOULD BE LESS THAN 3MB" — OBSERVED (DOM attribute) and FACT (page text) agree. No stated *total* cap across all four (only per-file).
- Accepted MIME types (verbatim): `image/gif, image/jpeg, image/pjpeg, image/png, image/bmp` — **no WebP, no HEIC/HEIF**, unlike State's own native form which explicitly accepts HEIC/HEIF. This is a real trap for iPhone users submitting straight from Photos without conversion, on the Snapcast channel specifically.
- Sample photos also shown (verbatim instruction: "PLEASE SUBMIT FOUR PHOTOS OF YOURSELF BY REPLICATING THE SAMPLE IMAGES BELOW: CLOSE-UP, WAIST-UP, FULL-LENGTH, AND 3/4 PROFILE.") — actual example images shown beside each slot (model in black tank top). [Evidence #6-shot]

### Kids photo instructions (via repmykid@ email handoff, Snapcast form)
Verbatim: "ATTACH 3-4 NONEDITED PHOTOGRAPHS. MAKE SURE YOUR PICTURES ARE LESS THAN 3MB EACH AND DO NOT SEND US MORE THAN 4 IMAGES." — i.e., **3–4 photos** (not exactly 4), same 3MB-each cap, "non-edited" specified for kids (word not used for the adult photo instructions, which instead ask for specific poses/lighting).

## 5. Photo/shot instructions (verbatim)

Both State's native form and the Snapcast form carry near-identical prose for adult applicants:

- Native form (statemgmt.com): "Please submit four photos of yourself: close-up, waist-up, full-length, and 3/4 profile. Digitals shot in natural daylight (not direct sunlight) with no makeup, hair down, and neutral face are encouraged. We are looking for your natural beauty to shine through!" [Evidence #3]
- Snapcast form: "PLEASE SUBMIT FOUR PHOTOS OF YOURSELF BY REPLICATING THE SAMPLE IMAGES BELOW: CLOSE-UP, WAIST-UP, FULL-LENGTH, AND 3/4 PROFILE. DIGITALS SHOT IN NATURAL DAYLIGHT(NOT DIRECT SUNLIGHT) WITH NO MAKEUP, HAIR DOWN, AND NEUTRAL FACE ARE ENCOURAGED. WE ARE LOOKING FOR YOUR NATURAL BEAUTY TO SHINE THROUGH! PHOTOS SHOULD BE LESS THAN 3MB." [Evidence #6]
- Kids (via repmykid@ email instructions): "ATTACH 3-4 NONEDITED PHOTOGRAPHS." — no pose/lighting/makeup guidance given for kids photos, just "non-edited" and the size/count caps. [Evidence #6]
- No retouching/filters prohibition stated beyond "no makeup... natural beauty to shine through" (encouragement, not a stated requirement — labelled here as PREFERENCE, since both instances use "encouraged," not "required" or "must").

## 6. Eligibility

- **Age (State's own Privacy Policy §6.4, verbatim):** "You must be 18 years of age or older to submit a talent application independently. If you are under 18, your application must be submitted by a parent or legal guardian who accepts this Privacy Policy on your behalf." — FACT [Evidence #12]. This is the only place a numeric adult age floor is published anywhere I found across both forms.
- **Age (Snapcast Terms of Service, verbatim):** "Any use or access to the Service by anyone under 13 is strictly prohibited and in violation of this Agreement." — FACT [Evidence #15]. Snapcast's own floor is 13, not 18 — a materially different number than State's own policy. See Contradictions §10.
- **Age (Snapcast Privacy Policy, verbatim):** "Minors between the ages of 13 and 17 must obtain the permission of their parent(s) or legal guardian(s) before submitting data, text, photos or video on any Bookt, SnapCast website, app, form or database—this includes any 'scouting' form..." — FACT [Evidence #14].
- No published height minimum/maximum found on either form or on State's site text. The Snapcast height dropdown's numeric range (5'0"–7'2"/153–218cm) is a UI artifact, not a stated eligibility requirement — INFERENCE that it is not a floor, since nothing in the text calls out a minimum.
- No location/market restriction is published on either application form (the Snapcast form's Country/State dropdowns list the entire world and all US states/territories, with no geofencing language). State's offices are NY/Chicago/LA per the About page, but I found no text on either form restricting applicants to those markets.
- **Gender/division scoping, exactly as published:** Snapcast form offers Female / Male / Non-binary / Kids as the only top-level gender categories, with the measurement-field set changing per selection (see §3). State's own site's About page separately states divisions span "kids to classic and petite to plus size," "Sports & fitness" (lifestyle division), and "fit modeling," but the application forms themselves do not expose a division/category selector distinct from gender — division assignment appears to happen internally after submission, not as an applicant-facing field. UNCERTAIN whether/how an applicant signals interest in fit, plus-size, or sports/fitness divisions specifically via either form.

## 7. Minors & guardians

This is the most complex and least consistent part of State's application surface. Three separate, **not clearly reconciled** treatments exist:

1. **State's own Privacy Policy (§6.4 "Age Requirement and Parental Consent", verbatim):** "You must be 18 years of age or older to submit a talent application independently. If you are under 18, your application must be submitted by a parent or legal guardian who accepts this Privacy Policy on your behalf. For applicants under 18, we require written parental or guardian consent before processing the application. Please contact us at scouting@statemgmt.com for the appropriate consent form." [Evidence #12]. This implies a formal, distinct "consent form" document that must be separately requested by email — it is **not** embedded anywhere in either web form's DOM (no guardian name/signature field found in either form's field inventory).
2. **State's own become-a-model page** offers a *different* kids email for errors/kids specifically: **kids@statemgmt.com** ("...or to kids@statemgmt.com for our Kid's division") [Evidence #3] — this does not match the scouting@ address named in the Privacy Policy's guardian-consent clause, nor the repmykid@ address below.
3. **Snapcast form's "KIDS" gender-radio option** swaps the entire form region for this verbatim block: "WE'D LOVE TO CONSIDER YOUR KIDS FOR REPRESENTATION. PLEASE EMAIL REPMYKID@STATEMGMT.COM ... IN THE BODY OF THE EMAIL INCLUDE: PARENT NAME / PARENT EMAIL / PARENT PHONE / CHILD'S NAME / CHILD'S AGE / CITY AND STATE ... ATTACH 3-4 NONEDITED PHOTOGRAPHS. MAKE SURE YOUR PICTURES ARE LESS THAN 3MB EACH AND DO NOT SEND US MORE THAN 4 IMAGES." [Evidence #6]. This confirms the assignment's rumored **repmykid@statemgmt.com** exactly. No numeric age boundary is stated here either — "Child's Age" is simply a free-text field to fill into the email body, not a defined cutoff (e.g., not "under 13" or "under 16").
4. **No age gate enforces the choice.** On the Snapcast form, selecting FEMALE/MALE/NON-BINARY instead of KIDS gives full access to the standard adult-style form (including the password-creation account flow) with no DOB-based blocking — the DOB datepicker's year range runs through the current year with no minimum-age restriction client-side [Evidence #13]. A minor (or someone entering a minor's data) could complete the "adult" Snapcast form path in full, unblocked, which would put them in tension with Snapcast's own stated 13-17 guardian-consent requirement and State's stated 18+ independent-submission rule — there is no technical control observed that prevents this.
5. Neither form contains a guardian-specific field set (no "parent/guardian name," "parent email," "I am the parent/guardian" checkbox) inside the actual submittable form DOM on either channel — the only guardian-data collection path found anywhere is the **email-based** repmykid@ handoff described in item 3.

**Summary finding for this section:** there is no single, consistent, in-form guardian/minors flow. What exists is: (a) a stated policy that under-18 needs written guardian consent via a document requested from scouting@; (b) two different "kids" email addresses (kids@ and repmykid@) depending on which of the two application channels the visitor is on; and (c) no enforced DOB/age check gating the general adult form on either channel. This should be flagged in Pholio as high-uncertainty/high-surprise-risk territory for any minor applicant or their guardian.

## 8. Consent & legal

### Channel A — statemgmt.com native form
- "By clicking submit, you agree to State Management's terms & have read our Privacy Policy." — links to `/terms-and-conditions` and `/privacy-policy` (both on statemgmt.com). [Evidence #3]
- "This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply." — links to `policies.google.com/privacy` and `policies.google.com/terms`. [Evidence #3]
- **Data recipient per displayed text: State Management itself** (its own Terms & Privacy Policy are the ones referenced).
- State's Terms & Conditions page content (as rendered) is actually **booking conditions for clients hiring talent** (overtime rates, cancellation fees, lingerie endorsement rate, image usage, digital replica authorization) — not applicant-facing terms. This is the document the "you agree to State Management's terms" checkbox links to, even though its content is written for clients/bookers, not for the person applying. [Evidence #16] Worth flagging as a mismatch a talent might notice.
- State's Privacy Policy (dated "Last updated: 17 June 2026") — key excerpts:
  - Data controller: "State Artist Management, Address: 525 7th Ave Ste 904, New York, NY 11211" (§2) — but see §16 which gives a **different** zip/room ("525 7th Ave Rm 904, New York, NY 10018") — internal inconsistency, see §10.
  - §6.3 Unsuccessful Applications: "we will retain your submission for a period of 6 months in case a suitable opportunity arises, after which it will be securely deleted unless you request earlier deletion. We will notify you of this retention period at the time of our decision."
  - §6.2: "We will not: Sell, license, or transfer your images or videos to third parties for their own commercial use / Use your images or videos in advertising or marketing materials without your separate written consent / Alter or manipulate your images in a misleading or derogatory manner."
  - §8.2 names service providers explicitly: "Portfoliopad / Mainboard — our talent management software platform."
  - §9 Data Retention table: analytics 14 months, cookie consent 365 days, unsuccessful applications 6 months, active talent profiles for duration of representation + reasonable period after, financial records 7 years, general correspondence 3 years.
  [Evidence #12]

### Channel B — Snapcast form
- "BY CLICKING SUBMIT, YOU AGREE TO THE SNAPCAST TERMS AND HAVE READ OUR PRIVACY POLICY." — links verbatim to `https://www.getsnapcast.com/terms-of-service/` and `https://www.getsnapcast.com/privacy/` (Snapcast's own policies, **not** State's) [Evidence #5 DOM, #6].
- "THIS SITE IS PROTECTED BY RECAPTCHA AND THE GOOGLE PRIVACY POLICY AND TERMS OF SERVICE APPLY." [Evidence #6]
- **Data recipient per displayed text: Snapcast / Bookt** — the consent checkbox and its links are entirely to Snapcast's legal documents, not State Management's. State Management is not named anywhere in Snapcast's Terms of Service or Privacy Policy text that I searched (only "Agencies" and "Scouts" generically). [Evidence #15]
- Cookie banner (verbatim): "WE USE COOKIES TO IMPROVE USER EXPERIENCE, AND ANALYZE WEBSITE TRAFFIC. FOR THESE REASONS, WE MAY SHARE YOUR SITE USAGE DATA WITH OUR ANALYTICS PARTNERS. BY CLICKING "OK," YOU CONSENT TO STORE ON YOUR DEVICE ALL THE TECHNOLOGIES DESCRIBED IN OUR COOKIE POLICY" [Evidence #6]
- Snapcast Privacy Policy, key excerpts:
  - Operated jointly: "Bookt and SnapCast have each separately adopted this Privacy Policy... The SnapCast mobile app is licensed software of Bookt. Bookt operates and hosts the SnapCast mobile application."
  - Sharing: "We may also share or disclose your personal information with: Other companies owned by or under common ownership as Bookt and/or SnapCast... Other companies not owned or under common ownership... Third party vendors, consultants and other service providers... Third parties who we think may offer you products or services..." and separately, in the EU/UK section: "...your opting out... may restrict our abilities to share this information with **Scouts, Agencies and vendors** using Bookt and SnapCast." — this is the closest the policy comes to naming how an agency like State Management would actually receive the data: as a downstream "Agency" consumer of the Bookt/SnapCast platform, not as the direct first-party recipient of the form submission.
  - Children's Privacy (verbatim, in full): "Bookt and SnapCast do not knowingly collect or solicit any information from anyone under the age of 13 or knowingly allow such persons to register as Users. Our services and their content are not intended for use by children, especially under the age of 13... No one under the age of 13 is allowed to provide ANY personal information whatsoever... In the event that we learn that we have collected personal information from a child under age 13 without verification of parental consent, we will delete that information as quickly as possible... Minors between the ages of 13 and 17 must obtain the permission of their parent(s) or legal guardian(s) before submitting data, text, photos or video on any Bookt, SnapCast website, app, form or database—this includes any 'scouting' form used by Bookt and developed and licensed by SnapCast..."
  - Contact: "HELLO@getsnapcast.com... SnapCast Corp. Unit 8, 85 Fulton St. Boonton, NJ 07005." Policy "last modified on 29 March 2022" (i.e., over 4 years stale relative to retrieval date).
  [Evidence #14]
- Snapcast Terms of Service, key excerpts:
  - Eligibility: "Any use or access to the Service by anyone under 13 is strictly prohibited and in violation of this Agreement."
  - User Content license grant (verbatim): "you expressly grant... to SnapCast a **royalty-free, sublicensable, transferable, perpetual, irrevocable, non-exclusive, worldwide license** to use, reproduce, modify, publish, list information regarding, edit, translate, distribute, syndicate, publicly perform, publicly display, and make derivative works of all such User Content and your name, voice, and/or likeness..." — this is a materially broader/more permanent IP grant than State's own Privacy Policy promises ("We will not sell, license, or transfer your images... for their own commercial use"), and a talent applying via the Snapcast channel is bound by Snapcast's much broader terms instead. Flagged as a significant trap.
  - A second, separate broad grant covers **email content and metadata** if "SnapCast access[es] your email" — unclear if/when this is triggered by the scouting-form flow specifically; included here as published text, not confirmed to apply to this particular form.
  [Evidence #15]

## 9. Process facts

- No stated response-time SLA, "only contact if interested," or explicit re-application guidance found on either form or on State's About/Contact pages.
- Retention policy (State's own, applies at minimum to the native-form path): unsuccessful applications kept 6 months then deleted, applicant notified of this at decision time (§6.3 of Privacy Policy) — this is the only "what happens after submission" process fact published anywhere in this research. No equivalent retention statement found in Snapcast's docs specific to unsuccessful applicants (Snapcast's own retention section — "How We Store and Protect Your Information" — did not specify a concrete retention period in what I read).
- No open-call schedule, deadline, or seasonal-window text found on any page checked (About, Contact, Become a Model ×2, Kids, Privacy, Terms).
- Contact page exists at `/contact` but was not deeply mined beyond confirming it does not add another application channel or link to Snapcast.

## 10. Contradictions & uncertainties (ranked by surprise risk)

1. **Assignment-premise contradiction, high impact:** State's own site does **not** link to the Snapcast form anywhere I could find (nav, footer, become-a-model page body, contact page, or raw HTML of any fetched page). The two are separate, independently operated forms with different fields, different account requirements (Snapcast requires creating a password-protected account; State's own form does not), different photo format acceptance (State: includes HEIC; Snapcast: does not), different photo size limits (State: none published; Snapcast: 3MB/file, DOM-enforced), and different consent regimes/data recipients (State's own Terms/Privacy vs. Snapcast/Bookt's Terms/Privacy). A talent could easily complete one channel believing it to be "the" State Management application and never learn the other exists, or vice-versa.
2. **Three inconsistent kids/minor contact channels, high impact:** scouting@statemgmt.com (Privacy Policy §6.4, for the "appropriate consent form" request), kids@statemgmt.com (State's own become-a-model page error-fallback text, "for our Kid's division"), and repmykid@statemgmt.com (Snapcast form's KIDS-radio handoff text). None of the three sources cross-reference each other, and no page states which to use when, or whether they route to the same inbox.
3. **Conflicting minimum-age floors, high impact:** State's own Privacy Policy sets 18 as the independent-submission floor (guardian required below that). Snapcast's Terms of Service sets 13 as its platform-wide floor, and Snapcast's Privacy Policy separately describes a 13–17 guardian-permission band distinct from State's 18 threshold. A 15-year-old reading only the Snapcast form (which is what a talent actually interacts with on that channel) would see no on-page statement of either number — the 13/18 figures are only in the separately-linked legal documents, not in the form's own visible copy.
4. **No enforced age gate on the Snapcast form's default (non-KIDS) path:** the DOB datepicker allows any birth year through the current year, and choosing FEMALE/MALE/NON-BINARY instead of KIDS grants full access to the standard form (including creating a password account) regardless of the entered DOB. A minor is not technically prevented from completing the "adult" flow.
5. **Photo size cap published on one channel, silent on the other:** Snapcast form explicitly and repeatedly states/enforces 3MB per photo (both in visible text and a DOM `data-rule-filesize` of exactly 3,145,728 bytes). State's own native form has no equivalent published limit or DOM attribute for its four uploads. A talent who successfully used one channel's size rule might be surprised applying via the other.
6. **Accepted image formats differ:** State's native form explicitly accepts HEIC/HEIF (`accept="image/*, image/heic, image/heif"`); Snapcast's form's accepted list is `image/gif, image/jpeg, image/pjpeg, image/png, image/bmp` — no HEIC/HEIF, no WebP. An iPhone user uploading a native-format photo could succeed on one channel and silently fail (client-side file-picker filtering, or a later validation error) on the other.
7. **Self-inconsistent registered address in State's own Privacy Policy:** §2 gives "525 7th Ave Ste 904, New York, NY 11211" as the data controller's address; §16 gives "525 7th Ave Rm 904, New York, NY 10018" for privacy contact purposes — same street address, different suite/room label and different ZIP code (11211 is a Brooklyn ZIP; 10018 is the Manhattan Garment District ZIP, consistent with a separate third-party Yelp listing for "State Management" at 525 7th Ave, New York, NY). Low-stakes for a talent but worth flagging as evidence the policy text wasn't fully proofread — CONTRADICTION, recording both verbatim per method.
8. **Duplicate/unclear "state" field on Snapcast form:** both a `<select name="stateL">` (full US state list) and a separate plain `<input name="state" placeholder="state">` exist in the same form. Purpose of the second field, and whether it's actually visible/used, is UNCERTAIN.
9. **Two submit buttons / two reCAPTCHA widgets in State's native-form DOM:** unexplained duplication (`btn_submit`-equivalent buttons and `g-recaptcha-response` / `g-recaptcha-response-1`). Could indicate the form is functionally two-part (info, then photos) even though both render on one visible page; not confirmed since clicking submit was avoided per the hard prohibition on submission.
10. **NYDOL cert 26-66CVV-LSFW** — recorded as given in the assignment; I did not find a public NYDOL license-search tool to independently re-verify it in the time available. Not contradicted by anything found, just unverified against a primary government database.
11. **Snapcast's Privacy Policy is stale**: dated "last modified on 29 March 2022," more than 4 years old relative to the 2026-08-19 retrieval date — the platform-level legal text a State applicant is bound to (photo license grant, sharing language) may not reflect Snapcast's current practices, but it's what's actually linked from the live form today.

## 11. Draft talent-facing brief (for Pholio's Market view)

State Management (New York, Chicago, Los Angeles) runs **two separate, unlinked application forms** — pick the one you land on and stick with it, since they have different rules. **State's own site form** (statemgmt.com/become-a-model) asks for your basic info, measurements, and four photos (close-up, waist-up, full-length, 3/4 profile), accepts iPhone HEIC photos, and states no file-size limit. **The Snapcast-powered form** (statemgmt.getsnapcast.com/become-a-model) asks for the same four photo types but caps each one at 3MB, only accepts JPEG/PNG/GIF/BMP (not HEIC — convert iPhone photos first), and requires you to create a password-protected account as part of applying. It also asks far more detailed measurements (bust/chest, waist, hips, inseam, collar, dress or suit size, shoe, hair and eye color) that change depending on whether you select Female, Male, or Non-binary.

Both forms want natural-light digitals with no makeup, hair down, and a neutral expression — no professional photos, no filters.

If you're applying for a minor: State's own privacy policy says anyone under 18 needs a parent or guardian to submit on their behalf and requests a formal consent form via scouting@statemgmt.com — but the two forms send you to two different kids-specific email addresses (kids@statemgmt.com on State's own site; repmykid@statemgmt.com if you pick "Kids" on the Snapcast form, which then asks you to simply email parent and child details plus 3–4 unedited photos rather than fill out a form). Because these don't match up, email the address on whichever page you're on and don't expect a unified process — the agency's own materials don't reconcile this themselves.

One more thing worth knowing before you upload anything: the Snapcast form's consent checkbox links to Snapcast's own Terms and Privacy Policy, not State Management's — and Snapcast's terms include a very broad, permanent license to use your photos and likeness. State's own form links to State's own (narrower) policies instead. If broad image-rights language matters to you, read whichever policy applies to the form you're using before you submit.

Neither form publishes a minimum height or a stated response/turnaround time — if you don't hear back, the agency doesn't say how long to wait or whether "no news" means "not interested."

## 12. Evidence log

1. `https://www.statemgmt.com/robots.txt` — curl, 2026-08-19T06:44Z — robots/sitemap listing; confirms sitemap taxonomy (management/los-angeles/new-york market+division structure) and no crawl restriction on /become-a-model.
2. `https://www.statemgmt.com/` — curl (raw HTML) + grep for become-a-model link, 2026-08-19T06:45Z — found `href="/become-a-model"` in raw HTML; nav text via Playwright render confirms top-level nav items (Become a Model, About, Contact, Instagram, TikTok, Terms & Conditions, Privacy Policy, Manage Cookies).
3. `https://www.statemgmt.com/become-a-model` — Playwright render (text + HTML + link list + screenshot `shots/statemgmt-become.png`), 2026-08-19T06:46Z — full visible page text, full outbound link list (12 links, none to snapcast), no POST requests fired on load.
4. `https://www.statemgmt.com/become-a-model` — Playwright `dumpForms()`, 2026-08-19T06:52Z — full field-attribute dump (Gender/First Name/Last Name/DOB/City/State/Country/Phone/Email/Height/Bust/Waist/Hips/Shoe/Instagram/TikTok/Website + 4 file inputs + 2 submit buttons + 2 recaptcha textareas).
5. `https://statemgmt.getsnapcast.com/become-a-model` — curl raw HTML, 2026-08-19T06:47Z — `<title>State Management New York Contact Information</title>`; grep for accept/data-rule attributes on file inputs.
6. `https://statemgmt.getsnapcast.com/become-a-model` — Playwright render (text + HTML + forms dump + screenshot `shots/snapcast-become.png`), 2026-08-19T06:48Z — full visible text including all dropdown option lists, gender radios, KIDS handoff text (verbatim quoted in §7), consent text, cookie banner text.
7. `https://www.statemgmt.com/about` — Playwright render, 2026-08-19T06:53Z — verbatim About-page mission/division text, "offices in New York, Chicago and Los Angeles."
8. `https://www.statemgmt.com/become-a-model` — `curl -I`, 2026-08-19T06:49Z — confirms `HTTP/2 200` direct (no redirect) to the native page.
9. `https://www.statemgmt.com/contact` — curl raw HTML + grep, 2026-08-19T06:50Z — only outbound app-relevant link found is `/become-a-model`; no snapcast reference.
10. Live Playwright interaction test (typing invalid email/mobile values, blurring fields), 2026-08-19T06:56Z, on the Snapcast form — `page.on('request')` logged only Google Analytics/doubleclick beacons and the reCAPTCHA widget load; zero POSTs carrying form field data.
11. Live Playwright interaction test (toggling gender radios: female→male→non-binary→kids), 2026-08-19T06:55Z, on the Snapcast form — confirmed conditional field visibility table in §3; confirmed KIDS radio swaps in static repmykid@ instructional text; zero non-analytics POSTs fired.
12. `https://www.statemgmt.com/privacy-policy` — Playwright render, 2026-08-19T06:58Z — full verbatim Privacy Policy text (State Artist Management, "Last updated: 17 June 2026"), including §6.4 age/consent clause, §9 retention table, §2/§16 address inconsistency, §13 children's privacy clause.
13. Live Playwright DOB-datepicker interaction on the Snapcast form (`#dob_datepicker` click, read `.ui-datepicker-year option` values), 2026-08-19T07:00Z — confirmed year range 1926–2026 (101 options), no min/max date restriction observed.
14. `https://www.getsnapcast.com/privacy/` — curl + text extraction, 2026-08-19T06:59Z — full verbatim Snapcast/Bookt Privacy Policy, including Children's Privacy (§10), Sharing of Your Information (§3), Survivability and Transfer (§13), contact info, "last modified on 29 March 2022."
15. `https://www.getsnapcast.com/terms-of-service/` — curl + text extraction, 2026-08-19T06:59Z — full verbatim Snapcast Terms of Service, including Eligibility clause ("under 13... strictly prohibited"), User Content royalty-free/perpetual/irrevocable/worldwide license grant clause, email-content license grant clause.
16. `https://www.statemgmt.com/terms-and-conditions` — Playwright render, 2026-08-19T06:58Z — full verbatim Terms & Conditions text (booking conditions for clients hiring talent: overtime, cancellation fees, lingerie rate, image usage, digital replica).
17. `https://www.statemgmt.com/kids` — Playwright render, 2026-08-19T07:01Z — page renders with no body prose beyond nav/cookie banner; no eligibility or age-boundary text found.
18. WebSearch: `"statemgmt.getsnapcast.com"` and `"State Management" model agency "become a model" snapcast OR "getsnapcast"`, 2026-08-19 — third-party corroboration (SNAPCAST app store listings, agency.getsnapcast.com pattern used by other agencies too) that this is a real, current, multi-agency scouting platform; State Management is not named inside Snapcast's own legal text.
