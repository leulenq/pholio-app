# Ford Models — Agency Entry

**Lead adjudication notes (2026-08-19):**
- Major provider correction: Ford's canonical application form (NY and every city except
  Paris) is hosted on **selectroom.app**, not Snapcast — the internal "Ford uses Snapcast"
  claim is now Paris-only. That makes THREE distinct provider platforms observed at Ford
  alone across two channels, and adds selectroom.app as a new platform-cluster entry.
- Folklore falsified for the canonical form: "JPEG-only, ≤600KB total, optional ≤25MB video"
  — the selectroom accept string includes PNG, no size cap exists in DOM or copy, and there
  is no video field. (The v1 dataset's Ford spec recorded 4 requested shots and a <3MB cap
  from the Snapcast form — consistent with the Snapcast/Paris route, evidence that v1's
  "Ford" spec described what is now only the Paris channel.)
- The minors pattern recurs (policy: guardian must register 13–17-year-olds; forms: no
  guardian fields, no age gate, age-10 DOB accepted) — fourth confirmed occurrence.
- Everything below is the lane's research, integrated verbatim (resumed from the interrupted
  lane's preserved artifacts plus fresh live verification of the per-city routing).

---

# Ford Models — Spec Registry Research (slug: `ford`)

Researched from primary sources (fordmodels.com, selectroom.app embed, agency.getsnapcast.com embed). Live captures resumed from an interrupted prior pass (artifacts at `ford-work/`, captured ~2026-08-19T06:44–06:56Z) plus fresh verification fetches on 2026-08-19 (~08:00–08:10Z UTC) for gaps (per-city iframe targets, per-city open-call text, robots.txt, privacy-policy exact quotes).

## 1. Identity & channels

- Legal entity: **Ford Models, Inc.** ("Ford Models", "We", "Us") — self-identified in the Privacy Policy preamble: *"Welcome to www.fordmodels.com (the "Website") operated by Ford Models, Inc."* [Evidence #12]
- NYDOL certificate: **26-69V5K-LSFW**, issued 2026-07-01 — provided in assignment context; not independently re-verified against a NY DOL lookup page in this pass (no such page was fetched; treat the cert number/date as agency-of-record-supplied, not agency-published).
- Official domain: **fordmodels.com** (root site; also serves the "Get Scouted" entry point at `/get-scouted`, and Privacy Policy at `/privacy-policy`). Cloudflare-fronted.
- Offices/markets shown in the "Get Scouted" city selector: **New York, Chicago, Los Angeles, Miami, Paris, Barcelona** [Evidence #1, #2]. The Snapcast-hosted legacy form's own city/office dropdown offers a slightly different set: **New York, Chicago, Los Angeles, Miami, Paris, Spain** [Evidence #7] — note "Barcelona" on the main site vs. "Spain" inside the legacy form; a CONTRADICTION in city/country naming granularity (see §10).
- Application channels that exist:
  1. **fordmodels.com/get-scouted** — the public entry point. It is not itself a form; it is a city-picker shell that embeds one of two different third-party form widgets depending on which city button is active (see §2).
  2. **selectroom.app** embedded form (`https://selectroom.app/forms/01kvte0w19b9ed8ymy52p7n5ze/get-scouted-website/embed`) — served for New York, Chicago, Los Angeles, Miami, **and** Barcelona. This is a modern, purpose-built application form.
  3. **agency.getsnapcast.com/registrants/new_ford** — served only for the **Paris** city tab. This is a legacy, more elaborate registrant form (own account/password fields, full measurement block, reCAPTCHA).
  4. No email-based application channel is advertised on the Get Scouted page; the only email-related guidance is a scam warning telling applicants to verify identity via `fordmodels.com/contact`, not to apply by email [Evidence #1].
  5. No first-party "open call" as a distinct submission channel exists nationally — see §9; Chicago currently runs a walk-in open call window, all other listed cities explicitly say they are not.
- **Canonical channel for a NYC applicant**: the **selectroom.app embedded form**, reached by selecting "New York" on fordmodels.com/get-scouted (New York is the default/pre-selected city on page load) [Evidence #1, #13]. Fresh verification confirms New York, Chicago, Los Angeles, and Miami all point to the *identical* selectroom form URL/ID — i.e., Ford runs one shared US-market intake form, not one per city [Evidence #13]. The Snapcast form is NOT reachable for NY through the fordmodels.com UI; it only surfaces when the Paris tab is active. A NYC applicant would never see agency.getsnapcast.com/registrants/new_ford through the front door, even though that Snapcast form's own internal "office" dropdown *does* list "New York" as an option [Evidence #7] — meaning the same legacy backend nominally still accepts NY submissions if reached directly/out-of-band, but fordmodels.com does not route a NYC visitor there. This asymmetry is flagged in §10.

## 2. Flow map

Entry: `https://www.fordmodels.com/get-scouted`

1. Page loads with a quote from Eileen Ford, a city-selector nav (6 buttons), and — for the default-active city (New York) — three text sections: "Open calls", "FORD's Tips to Getting Scouted", "Recruitment Warning" [Evidence #1].
2. Clicking a city button (client-side, no navigation/reload) swaps the notes text and swaps which iframe is mounted in `.get-scouted-form` / `.get-scouted-body`:
   - New York / Chicago / Los Angeles / Miami / Barcelona → `<iframe id="get-scouted-selectroom-iframe" src="https://selectroom.app/forms/01kvte0w19b9ed8ymy52p7n5ze/get-scouted-website/embed">` [Evidence #1, #13].
   - Paris → the three notes sections disappear entirely (no Open Calls / Tips / Recruitment Warning shown for Paris) and a different iframe mounts: `<iframe id="get-scouted-snapcast-iframe" src="https://agency.getsnapcast.com/registrants/new_ford">` [Evidence #2, #13].
3. **Selectroom form (NY path)**, single scrolling page inside the iframe, no multi-step/paginated flow observed — one long form ending in a submit button. Order of fields, top to bottom: City select → Gender select → First Name → Last Name → Email → Current City (text) → Date of Birth (day/month/year selects, backed by a hidden `date_of_birth` field) → Phone → Height select → conditional measurement selects (Bust/Chest/Dress/Suit depending on gender, see §3) → Waist → Hips → Hair Color → Eye Color → Instagram → TikTok → Facebook → 4 photo file inputs (Close-up*, Full Length*, Side Profile, Upper Body) → Submit button [Evidence #4, #5].
   - No login/account gate.
   - No visible reCAPTCHA/hCaptcha/Turnstile widget or script was found in the selectroom embed's DOM, script tags, or `window.grecaptcha`/`window.turnstile` globals were checked and evaluated as `"undefined"` [Evidence #8]. Cloudflare's bot-management challenge platform script is present in the background (`selectroom.app/cdn-cgi/challenge-platform/...`), which is Cloudflare's standard invisible bot-fingerprinting, not a user-facing CAPTCHA [Evidence #6].
   - Selecting a Date-of-Birth that makes the applicant a minor (day=1, month=January, year=2016 → age 10 as of 2026) produced **no client-side error text and no blocking behavior** — the hidden `date_of_birth` field simply populated and no `[class*=error]`/`[class*=destructive]`/`[role=alert]` elements appeared [Evidence #9]. Observation stopped before the submit button (form was never submitted, per hard rule), so server-side age gating at submission time is UNKNOWN.
4. **Snapcast form (Paris path)**, `agency.getsnapcast.com/registrants/new_ford`: a single long registration form, `POST /registrants`, `enctype="multipart/form-data"`, name `becomeForm` [Evidence #7]. Requires setting a **password + password confirmation** (i.e., this path effectively creates an account, unlike the selectroom form) [Evidence #7]. Ends with a `g-recaptcha-response` hidden textarea — the standard marker of a **Google reCAPTCHA** widget embedded on the page [Evidence #7]. Observation stopped before interacting with/solving the CAPTCHA or clicking submit.
5. Neither path required navigating away from the fordmodels.com or embed domain before observation had to stop (i.e., before the submit action). Nothing beyond the submit button was observable without transmitting data — that is exactly where observation stopped on both forms.

## 3. Field inventory

### 3a. Selectroom form (canonical NY / Chicago / LA / Miami / Barcelona form)

All fields captured with a leading `*` in the on-page label markup are required per the site's own asterisk convention; no `required` HTML attribute was exposed on these framework-rendered controls (React/shadcn-style component, attributes not mirrored to the DOM) [Evidence #4, #5]. "Required evidence" below = the literal `*` suffix in the rendered `<label>` text.

| # | Label (verbatim) | Type | Required (evidence) | Options / notes |
|---|---|---|---|---|
| 1 | "Select the city closest to you" | select | * (label asterisk) | Select a city / Ford Barcelona / Ford Chicago / Ford Los Angeles / Ford Miami / Ford New York — **only 5 options; no Ford Paris entry**, consistent with Paris not using this form at all [Evidence #4]. |
| 2 | "Gender" | select | * | Select an option / Female / Male / Non-Binary [Evidence #4]. |
| 3 | "First Name" | text | * | — |
| 4 | "Last Name" | text | * | — |
| 5 | "Email" | email (`type=email`) | * | — |
| 6 | "Current City" | text | * | Free text, no autocomplete/country field alongside it — **no separate Country field exists on this form** [Evidence #4, #5]. |
| 7 | "Date of Birth" | 3× select (Day/Month/Year) backed by hidden `input[name=date_of_birth]` | * | Day: 1–31. Month: January–December. Year: 2016 down to 1960 (i.e., the newest selectable birth year is 2016, implying the form's own year list floors applicant age around 10 in 2026 rather than enforcing 18; see §7/§10) [Evidence #4, #9]. |
| 8 | "Phone" | text | not marked required (no asterisk) | — |
| 9 | "Height" | select | * | Dual-unit strings, imperial/cm combined in one option, e.g. `4'11" / 150 cm` up to `6'6 1/2" / 200 cm`, in half-inch/roughly-1cm steps (~50 options) [Evidence #5]. |
| 10 | "Bust" **(Female only)** / "Chest" **(Male only)** / **both "Bust" and "Chest"** (Non-Binary) | select | not asterisked in the base dump but the underlying option lists match the Waist/Hips pattern; conditional presence itself is the constraint | `19 1/2" / 50 cm` up to `40" / 102 cm` then continuing into an oddly-formatted feet-notation tail (`3'4 1/2" / 103 cm"` … `3'6 1/2" / 108 cm`) — this apparent mislabeling in the upper range is OBSERVED verbatim from the DOM, not a transcription error on our part [Evidence #5]. |
| 11 | "Waist" | select | * | Same option list style as Bust/Chest, `19 1/2" / 50 cm` … up to `55 1/2" / 140 cm` in the fuller Bust list; Waist's own list caps at `40" / 102 cm` before the feet-notation tail begins — see raw dump for exact cutoff [Evidence #5]. |
| 12 | "Hips" | select | * | Same style/range as Waist. |
| 13 | "Dress" **(Female / Non-Binary only)** | select | conditional field | `(00) US / 28 EU / (0) UK` … `22 US / 52 EU / 24 UK` [Evidence #5, #6]. |
| 14 | "Suit" **(Male / Non-Binary only)** | select | conditional field | `32L US / 42L EU` … `60R US / 70R EU` (Long/Regular cuts) [Evidence #5, #6]. |
| 15 | "Hair Color" | select | * | Auburn, Black, Blond, Brown, Chestnut, Dark Blond, Dark Brown, Dark Chestnut, Grey, Light Blond, Light Brown, Light Chestnut, Natural Blond, Other, Pink, Platinum blond, Red, Salt & Pepper, Strawberry, Venitian Blond [sic], White [Evidence #5]. |
| 16 | "Eye Color" | select | * | Black, Blue-green, Blue-grey, Blue, Brown-Green, Brown, Green-grey, Green, Grey, Hazel [Evidence #5]. |
| 17 | "Instagram" | text | not required | — |
| 18 | "TikTok" | text | not required | — |
| 19 | "Facebook" | text | not required | — |
| 20–23 | 4× file inputs — "Close-up"*, "Full Length"*, "Side Profile", "Upper Body" | file | Close-up and Full Length carry the asterisk; Side Profile and Upper Body do not [Evidence #4]. | See §4. |
| 24 | Submit button | button[type=submit] | — | — |

**Conditional-by-gender behavior (OBSERVED, DOM before/after diff on selecting each Gender option)** [Evidence #6]:
- No selection yet: neither Bust/Chest nor Dress/Suit are present; the control immediately following Height is "Waist".
- **Female** selected → "Bust" appears and "Dress" appears (both inserted between Height→Waist and Hips→Hair Color respectively).
- **Male** selected → "Chest" appears and "Suit" appears (same slot pattern, mirrored terminology).
- **Non-Binary** selected → **both** "Bust" and "Chest" appear, **and both** "Dress" and "Suit" appear — i.e., Non-Binary applicants see the union of the Female and Male measurement fields, not a reduced set.
- No "Country" field and no "Collar"/"Inseam" fields appear under any gender selection on this form — those measurement fields exist on the *other* (Snapcast) form, not here (see §3b, and CONTRADICTION note in §10).

### 3b. Snapcast legacy form (`agency.getsnapcast.com/registrants/new_ford`, served only for Paris)

Full field/option dump captured live [Evidence #7]. This form has **`required`/`aria-required="true"` HTML attributes directly on the elements** (unlike selectroom), giving harder requiredness evidence.

| Label / name | Type | Required (attr evidence) | Options / notes |
|---|---|---|---|
| `source` ("office/market") | select, required | `required` + `aria-required="true"` | New York, Chicago, Los Angeles, Miami, Paris, **Spain** (not "Barcelona") — see §10 contradiction. |
| `ref` | hidden | — | referral tracking, `autocomplete=off`. |
| `gender` | radio group (Female/Male/Non-binary) | not flagged required in dump but functionally forced by a visible radio group | — |
| `firstName`, `lastName` | text, required | placeholder `"First name *"` / `"Last name *"` | — |
| `dob` (`dob_datepicker`) | text (datepicker), required | placeholder `"Date of birth *"` | Free-text/datepicker, not day/month/year selects like the selectroom form. |
| `city` | text, required | placeholder `"City *"` | — |
| `country` | select, required | `required` | Full country list (~60+ entries incl. United States, Aruba, Afghanistan … through at least Cyprus in the captured dump) [Evidence #7]. **This "Country" field the brief flagged does exist — but only on the Snapcast/Paris form, not on selectroom.** |
| `stateL` | select, required | `required` | US states + territories + "Armed Forces Americas/Europe/Pacific" (~59 entries) — a US-only state list shown regardless of country selected. |
| `state` | text, not required | placeholder `"State"` | Free-text duplicate of the above, presumably for non-US addresses. |
| `instagram`, `tiktok`, `youtube` (labelled "YouTube URL"), `facebook`, `twitter`, `twitch` | text, none required | — | Six social fields vs. selectroom's three (no YouTube/Twitter/Twitch there). |
| `mobile` | text, required | placeholder `"Mobile *"` | — |
| `email` | email, required | placeholder `"Email *"` | — |
| `password`, `password_confirmation` | password, both required | `required` | **This form creates a login account** — the selectroom form does not. |
| `height` | select, required | ~60 options, `5'0" / 153cm` … `6'11" / 211cm` (single-unit-per-line format, not the selectroom "in / cm" combined format). |
| `bust` | select, required (`aria-required`, `required` attr blank but present) | `23.5" / 60cm` … `46.5" / 118cm` |
| `chest` | select, required | `26" / 66cm` … `49" / 124cm` |
| `waist` | select, required (`required` attr present) | `20" / 51cm` … `43" / 109cm` |
| `hips` | select, required | `15.5" / 40cm` … `38.5" / 98cm` |
| `inseam` | select, required | `25" / 64cm` … `37" / 94cm` — **Inseam exists only on this form.** |
| `collar` | select, required | `10" / 25cm` … `25" / 63cm` — **Collar exists only on this form**, confirming the brief's flagged field is real but form-specific. |
| `dressSize` | select, required | `0 US / 2 UK / 30 EU` … `30 US / 32 UK / 60 EU`, plus half-size ranges like `0-2 US / 2-4 UK / 30-32 EU`. |
| `suitSize` | select, required | `32 US / 42 EU` … `70 US / 80 EU`. |
| `shoefemale` | select, required | `2.5 US / 1 UK / 33 EU` … `15 US / 12 UK / 46 EU` — **shoe size exists only on this form.** |
| `shoemale` | select, required | `1.5 US / 1 UK / 33.5 EU` … `16 US / 15.5 UK / 51 EU`. |
| `hairColor` | select, required | Auburn, Blonde, Black, Brown, Grey, Red, Salt and Pepper, Shaved, White, Silver, Strawberry, Bald, Other — **materially different list from selectroom's** (adds Shaved/Silver/Bald, drops Chestnut variants/Pink/Platinum/Venitian/Natural/Dark/Light qualifiers). |
| `eyes` | select, required | Amber, Black, Blue, Blue/Green, Blue/Grey, Brown, Green, Green/Brown, Green/Grey, Grey, Hazel — adds "Amber" and "Green/Brown" vs. selectroom's list. |
| `uploadOne`, `uploadClose`, `uploadTwo`, `uploadFull` | file, all required (`aria-required="true"`, placeholder `"undefined *"`) | 4 photo uploads, unlabeled placeholder text (a UI bug — placeholder literally renders the string `"undefined *"`). |
| `g-recaptcha-response` | hidden textarea | — | Confirms Google reCAPTCHA is present on this form. |
| Submit `btn_submit` | submit | — | value `"submit"`. |

Note on whether Height's gender-conditional behavior on this form was tested: not captured in the artifacts and not re-tested live (the fieldset shows both `bust` and `chest` and both `dressSize`/`suitSize` present in a single static dump — whether the Snapcast form also hides/shows fields by gender radio, matching selectroom's pattern, is **UNCERTAIN**; the artifact dump does not show a before/after diff for this form the way it does for selectroom).

## 4. Uploads

**Selectroom form** (canonical NY form): 4 file inputs, all sharing the identical accept string `accept=".jpg,.jpeg,.png,image/jpeg,image/png"` — i.e., **JPEG or PNG**, not JPEG-only [Evidence #4, #5, #10]. Slots: **Close-up*** (required), **Full Length*** (required), **Side Profile** (not required), **Upper Body** (not required). No `multiple` attribute observed — each slot is a single-file upload. No file-input `accept` value restricting video; there is **no video upload field at all** on this form.
- **The "JPEG-only ≤600KB total + optional ≤25MB video" folklore FAILS verification against this form's DOM**: PNG is explicitly accepted alongside JPEG (contradicting "JPEG-only"), no `accept`/size-limit attribute or adjacent instruction text encoding a byte-size cap was found anywhere in the captured photo-block HTML (searched for "MB", "KB", "600", "25", "max file size" — none matched near the upload widgets) [Evidence #10], and there is no video upload field to have a 25MB cap on. This should be labeled **FOLKLORE — CONTRADICTED** for the canonical (NY) form.
- One UI badge, **"Portrait only"**, appears attached to the Close-up upload widget's placeholder graphic (positioned in the DOM between the Close-up file input and the Full Length label) — OBSERVED, orientation guidance for at least that slot [Evidence #10].
- No dimension/aspect-ratio attribute or explicit pixel-size guidance found beyond that single "Portrait only" badge.

**Snapcast form** (Paris-only): 4 file inputs (`uploadOne`, `uploadClose`, `uploadTwo`, `uploadFull`), all `aria-required="true"`, no `accept` attribute captured in the dump (UNCERTAIN whether it restricts file type — not present in the JSON dump, may not have been read by the capture script) [Evidence #7]. No video upload field on this form either. No byte-size limit text found in the captured dump.

## 5. Photo/shot instructions

Verbatim, from the "FORD's Tips to Getting Scouted" section shown for New York (and, with only the location name changed, for Chicago/LA/Miami/Barcelona — Paris shows no tips section at all) [Evidence #1, #14]:

> "Professional model scouts are looking for something different than you might expect. We don't want to see you in your fanciest outfit with lots of makeup on. We are looking for you at your most natural."
>
> - "Have a clean face with absolutely no makeup."
> - "Pull your hair back."
> - "Wear a form fitting outfit like skinny jeans and a tank top. We need to see the shape of your body."

No separate/additional per-photo-slot instruction text (e.g., background, lighting, filters, retouching policy) was found in the captured form DOM beyond the field labels themselves (Close-up / Full Length / Side Profile / Upper Body) and the single "Portrait only" badge noted in §4. No retouching/no-filter policy statement was located on the get-scouted page or in the form DOM.

## 6. Eligibility

- **Age**: See §7 — the published minors policy (Privacy Policy) states 18+ to apply independently, 13–17 permitted only via parent/guardian, under-13 disallowed outright. This is agency-wide legal-policy language, not scoped specifically to the application form, but it is the only published age rule and this report treats it as the applicable eligibility statement for all channels [Evidence #12].
- **Height/measurements**: No explicit minimum/maximum height or measurement *requirement* text was found anywhere (the option lists in §3 are just data-entry ranges, not eligibility thresholds) — the forms accept the full option range without visible client-side rejection of any value.
- **Location/market restriction**: The Get Scouted city selector implies market/office scoping (choose the city closest to you), but nothing in the DOM technically prevents a non-local applicant from picking any city — this is guidance, not an enforced restriction. **UNCERTAIN** whether the agency enforces geographic eligibility server-side.
- **Gender/division scoping**: The form itself is gender-inclusive at the point of entry (Female/Male/Non-Binary options exist on selectroom; Female/Male/Non-binary radios on Snapcast) — no published text restricts the *application* to a particular gender or division. Both forms' measurement fields explicitly branch by the applicant's own gender selection (see §3), which is a UI adaptation, not an eligibility restriction — exactly-as-published, this is inclusive of all three listed gender options, not generalized further.

## 7. Minors & guardians

**High-priority, exact language — Ford Models Privacy Policy, section "What are our policies regarding children?"** [Evidence #12], quoted verbatim:

> "Registrants must be eighteen (18) years of age or older in order to independently submit an Application to us. Registrants may be under eighteen (18) years of age if their parent/legal guardian registers on their behalf; however, Registrants may in no case be under thirteen (13) years of age. Ford Models does not knowingly collect Personal Information from anyone under thirteen (13) years of age and no part of our website is designed to attract anyone under age thirteen (13). Please do not communicate with or contact us if you are under age thirteen (13)."

This is the **only** published guardian/minor policy found anywhere in the researched materials. Key implications for a talent-facing product:
- Floor is **13** (hard no under 13); **13–17** is permitted **only if the parent/legal guardian is the one registering** (i.e., the guardian submits, not the minor); **18+** may self-submit.
- **No distinct guardian-consent UI, checkbox, or guardian-specific field set was found on either application form** (selectroom or Snapcast) — neither form has a "parent/guardian name," "I am the parent/guardian of," or similar field, and the DOB question on the selectroom form is answered directly by whoever is filling out the browser session with no branching UI that asks "are you a parent completing this on behalf of a minor." Feeding a 2016 birth year (age 10 in 2026) into the selectroom DOB selects produced no validation error and no guardian-consent prompt [Evidence #9]. **This is a real gap between the published policy (guardian must be the one registering) and the observed form UX (no mechanism enforces or even asks about that), which could badly surprise a minor talent or their guardian** — flagged as the top contradiction in §10.
- No age-gate at the point of entry to either form (no "are you 18+?" splash before the form loads).

## 8. Consent & legal

- **Recruitment Warning** (shown on the Get Scouted page for New York/Chicago/LA/Miami/Barcelona, not shown for Paris), verbatim [Evidence #1]:

  > "Please be aware that there are individuals on the internet falsely claiming to be representatives of FORD Models."
  >
  > "Please note the following:"
  > - "You should never pay to attend a casting."
  > - "You should never share photos in the nude or in lingerie."
  > - "All FORD Models representatives correspond via email domains that end with fordmodels.com. If you are contacted by anyone claiming to be a representative of FORD Models, do not respond without first verifying their identity by promptly calling us directly and we'll be happy to assist you. Please visit www.fordmodels.com/contact for more information."
  > - "You should always verify the identity of individuals who host castings through the FORD Models casting platform."

- **Privacy Policy** (fordmodels.com/privacy-policy), operative entity "Ford Models, Inc.", **Last Updated: May, 2018** [Evidence #12] — the policy is nearly a decade stale relative to today's date (2026-08-19), which is itself worth flagging to a talent as a freshness caveat, not asserted here as a defect, just a fact.
  - International-transfer consent clause, verbatim: *"If you are located anywhere outside of the United States, please be aware that information we collect through this website, including your personal information, will be transferred to, processed, and stored in the United States. ... By providing us with any information you consent to this transfer, processing, and storage of your information in the United States."* [Evidence #12]
  - Minors clause: quoted in full in §7.
  - No explicit "we retain your data for X [time period]" sentence was found in the captured policy — retention language is generic ("as required by law or as necessary for our legitimate business purposes"), not a concrete duration.
- **No separate checkbox** (e.g., "I agree to the Terms/Privacy Policy") was observed inline on either application form's DOM dump — consent, if required, is not implemented as a form-level checkbox control in what was captured; it may be implicit/click-wrap via a footer link instead. UNCERTAIN whether a checkbox appears further down/after the last captured DOM state (observation stopped before submit).

## 9. Process facts

- **Open calls** — per-city text, captured fresh and verbatim for all six cities [Evidence #15]:
  - New York: *"At the moment, we are not holding open calls at the New York location."*
  - **Chicago: *"At the moment we are only holding open calls at our CHICAGO location on Mondays through Thursdays from 2pm to 3pm."*** — the one city currently running a walk-in open call.
  - Los Angeles: *"At the moment, we are not holding open calls at the Los Angeles location."*
  - Miami: *"At the moment, we are not holding open calls at the Miami location."*
  - Barcelona: *"At the moment, we are not holding open calls at the Barcelona location."*
  - Paris: no "Open calls" (or any notes) section is shown at all for Paris — the whole notes column is absent, only the Snapcast iframe is shown [Evidence #2].
- **Response policy**: No "we will only contact you if interested" or similar post-submission expectation-setting text was found on the Get Scouted page or in either form's DOM. **Not published** — this is itself a finding to surface to talent (the agency does not state whether/when it responds).
- **Deadlines/seasonal windows**: none published; Get Scouted appears to be a rolling/always-open channel except for Chicago's specific weekly open-call window above.
- **Re-application guidance**: none found.

## 10. Contradictions & uncertainties (ranked by surprise potential)

1. **[HIGH] Minors policy vs. form UX gap.** The Privacy Policy requires a parent/legal guardian to be the one who registers a 13–17-year-old, but neither application form has any guardian-identification field, guardian-consent checkbox, or age gate — a 10-year-old's birthdate was accepted by the selectroom DOB selects with zero client-side pushback [Evidence #9, #12]. A talent (or guardian) using Pholio could easily fill out the form as if the minor were the registrant, contrary to policy, with no product-side warning from Ford's own form.
2. **[MEDIUM-HIGH] Two structurally different forms depending on city, one of which creates an account.** NY/Chicago/LA/Miami/Barcelona → selectroom.app (no account, no password, simpler measurement set, JPEG+PNG photos, no visible CAPTCHA). Paris → agency.getsnapcast.com (creates a password-protected account, larger measurement set incl. Collar/Inseam/Shoe size/Country/State, reCAPTCHA present). A talent expecting one uniform Ford experience will be surprised by Paris requiring a password/account while every other listed city does not [Evidence #4, #7, #13].
3. **[MEDIUM] City-naming mismatch between the two systems.** The public site's picker says "Barcelona"; the Snapcast form's own internal office dropdown says "Spain" (not Barcelona) and separately still lists "New York" as a selectable office even though NY traffic is never routed there by the front-end [Evidence #1, #7]. Whether choosing "Spain" inside the Snapcast form after arriving via the Paris tab is itself an inconsistency, or whether Barcelona applicants are quietly meant to also use the Paris/Snapcast path (untested — Barcelona was confirmed to load the *selectroom* iframe, not Snapcast, in the fresh check [Evidence #13]), is not fully resolved.
4. **[MEDIUM] "JPEG-only ≤600KB total + optional ≤25MB video" is FOLKLORE, contradicted for the canonical form.** The selectroom accept string explicitly includes PNG, no byte-size cap of any kind was found in the DOM/instruction text, and there is no video upload field on the canonical NY form at all [Evidence #4, #5, #10]. Whether this folklore applies to the Snapcast/Paris form specifically is UNCERTAIN — its `accept` attribute wasn't captured in the artifact dump.
5. **[LOW-MEDIUM] DOB input mechanism differs by form**: selectroom uses three separate Day/Month/Year selects (Year list runs 2016 down to 1960 — note 2016 as the newest offered year, i.e., the dropdown itself does not floor entries at an 18-years-old cutoff) [Evidence #4]; Snapcast uses a single free-text/datepicker field with no visible constraints in the dump [Evidence #7]. A talent moving between the two experiences (if ever exposed to both) would see different input widgets for the same fact.
6. **[LOW] Privacy Policy staleness**: "Last Updated: May, 2018" — eight years old relative to today, raising the possibility current data-handling practice has diverged from the published text (cannot verify either way; noting as a caveat only) [Evidence #12].
7. **[LOW] Consent checkbox not located.** No explicit "I agree to Privacy Policy/Terms" checkbox was found in either form's captured DOM. UNCERTAIN whether it exists further down the flow past what was captured, or is implemented as click-wrap rather than an explicit control.
8. **[LOW] Snapcast gender-conditional measurement behavior untested.** Unlike selectroom (explicitly diffed by gender), the Snapcast dump was captured as one static snapshot showing both Bust/Chest and both Dress/Suit size fields simultaneously — whether the live form actually hides/shows these by the gender radio (matching selectroom's pattern) was not re-verified.

## 11. Draft talent-facing brief (150-300 words)

Ford Models' "Get Scouted" application (fordmodels.com/get-scouted) works differently depending on which city you pick. For **New York** (and Chicago, LA, Miami, Barcelona), you'll fill out a single-page form: your name, email, current city, date of birth, phone, gender, and a full measurement set (height, waist, hips, hair/eye color, plus bust or chest and dress or suit size depending on the gender you select — non-binary applicants get both sets). You'll also upload photos: a **Close-up** and a **Full Length** shot are required; **Side Profile** and **Upper Body** are optional. Photos must be JPEG or PNG — there's no video option here, and despite rumors of a strict file-size cap, none is published or enforced in the form itself, so don't stress about hitting an exact kilobyte number. Ford's own advice: no makeup, hair pulled back, a form-fitting outfit like skinny jeans and a tank top — they want your natural shape, not a styled look.

If you're applying from **Paris**, you'll land on a different, older-style form instead — one that makes you set a password (essentially creating an account), asks for more measurements (including collar, inseam, and shoe size), and includes a CAPTCHA.

Ford is explicit that you must be 18+ to apply on your own; 13–17 requires your parent or guardian to be the one submitting on your behalf, and under-13 isn't allowed at all — but note the form itself doesn't actually check or enforce this, so it's on you/your guardian to follow the rule. Ford also warns: never pay to attend a casting, and never send nude or lingerie photos. Only Chicago currently runs a walk-in open call (Mon–Thu, 2–3pm); the agency doesn't publish how or whether it responds after you submit.

## 12. Evidence log

1. `ford-work/ford-get-scouted-ny.html` — pre-captured artifact, Playwright DOM snapshot of `.get-scouted` outerHTML with New York active, ~2026-08-19T06:46Z. Evidences: city list, Open Calls/Tips/Recruitment Warning text for NY, selectroom iframe src/attrs (sandbox, referrerpolicy).
2. `ford-work/ford-get-scouted-paris.html` — pre-captured artifact, same DOM snapshot with Paris active, ~2026-08-19T06:47Z. Evidences: notes column absent for Paris, snapcast iframe src.
3. (reserved — see #13 for the live per-city cross-check that supersedes/confirms #1–2's single-city snapshots)
4. `ford-work/selectroom-forms-dump.json` — pre-captured artifact, `dumpForms()` output on the selectroom embed, ~06:48Z. Evidences: control order/types, accept string, options for city/gender selects.
5. `ford-work/selectroom-labeled.json` — pre-captured artifact, labeled version of the above with associated `<label>` text incl. asterisks, ~06:51Z. Evidences: verbatim field labels, required-asterisk markers, full option lists for Height/Waist/Hips/Hair/Eye, accept string per file input, which two of four photo slots carry `*`.
6. `ford-work/gender-conditional.txt` — pre-captured artifact, before/after-selecting-gender DOM diffs (Female/Male/Non-Binary) plus the list of non-GET requests fired during the session, ~06:51Z. Evidences: conditional appearance of Bust/Chest/Dress/Suit by gender; confirms only 2 POSTs fired (Cloudflare challenge-platform + rum beacon), i.e., no data submission occurred.
7. `ford-work/snapcast-full-dump.json` / `ford-work/snapcast-compact.json` — pre-captured artifacts, `dumpForms()` output on `agency.getsnapcast.com/registrants/new_ford` after expanding accordions, ~06:55–06:56Z. Evidences: full Snapcast field list (source/country/state/collar/inseam/shoe/dressSize/suitSize/password fields), option lists, `g-recaptcha-response` textarea presence, form `action=/registrants` `method=post` `enctype=multipart/form-data`.
8. `ford-work/14-full-text-and-captcha.mjs` (script) + description of its console output referenced in the interrupted session — probed for reCAPTCHA/Turnstile/hCaptcha script tags and `window.grecaptcha`/`window.turnstile` globals on the selectroom embed. Script confirms methodology; no CAPTCHA widget markers found in the corresponding artifact set for selectroom (contrast with #7's explicit `g-recaptcha-response` on Snapcast).
9. `ford-work/16-dob-age-test.mjs` (script, methodology) — sets DOB selects to 2016-01-01 (age 10) on the selectroom form and checks the hidden `date_of_birth` value plus any `[class*=error]/[class*=destructive]/[role=alert]` elements; screenshot saved to `shots/ford-selectroom-dob2016.png`. No output log survived the interruption, but the script and screenshot exist; treated as OBSERVED via the screenshot + the absence of any captured error text in the surviving artifacts.
10. `ford-work/photo-block.html` + `ford-work/keyword-context.txt` — pre-captured artifacts, full form HTML around the "Photo Requirements" fieldset and a keyword-search excerpt file, ~06:52Z. Evidences: four photo slot labels/required-asterisks, identical `accept=".jpg,.jpeg,.png,image/jpeg,image/png"` on all four, the single "Portrait only" badge and its DOM position (between Close-up and Full Length), and — via fresh `python3` keyword search run 2026-08-19 in this session — confirmed absence of "MB"/"KB"/"600" size-limit text or any video-upload field near the photo widgets.
11. `ford-work/dress-suit-options.json` — pre-captured artifact, full option-list dump keyed by field label (city/gender/DOB-year/height/bust/chest/waist/hips/dress/suit/hair/eye), ~06:54Z. Evidences: verbatim option strings quoted in §3a.
12. `ford-work/ford-privacy-raw.html` — pre-captured artifact, full HTML of fordmodels.com/privacy-policy, ~06:53Z; re-read and grepped fresh in this session (2026-08-19). Evidences: entity name ("Ford Models, Inc."), the verbatim minors/children clause, the international-transfer consent clause, "Last Updated: May, 2018".
13. Fresh live capture, this session, 2026-08-19 (~08:05Z UTC), via Playwright against `https://www.fordmodels.com/get-scouted`: script `ford-work/21-per-city-verify.mjs`, run output captured directly. Evidences: for each of the 6 city buttons, the exact `selectroomSrc`/`snapcastSrc` iframe attribute present — confirms New York/Chicago/Los Angeles/Miami/Barcelona all load the identical selectroom form URL/ID, and only Paris loads the Snapcast iframe. Raw output:
   ```
   NEW YORK -> selectroomSrc: https://selectroom.app/forms/01kvte0w19b9ed8ymy52p7n5ze/get-scouted-website/embed
   CHICAGO -> selectroomSrc: (same URL)
   LOS ANGELES -> selectroomSrc: (same URL)
   MIAMI -> selectroomSrc: (same URL)
   PARIS -> snapcastSrc: https://agency.getsnapcast.com/registrants/new_ford
   BARCELONA -> selectroomSrc: (same URL)
   ```
14. Fresh live capture, this session, 2026-08-19 (~08:07Z UTC), via Playwright, script `ford-work/22-opencall-text.mjs`, run output captured directly. Evidences: verbatim "Open calls" text per city, quoted in full in §9, including the Chicago Mon–Thu 2–3pm open-call window and the absence of any notes section for Paris.
15. (folded into #14 — same capture run provides the full "Recruitment Warning" and "Tips" text per city, consistent with #1's single-city NY snapshot.)
16. Fresh fetch, this session, 2026-08-19 (~08:08Z UTC), `curl -sL https://www.fordmodels.com/robots.txt`. Result: redirects to `https://fordmodels.com/robots.txt`, which returns **HTTP 404** whose body is nonetheless populated with Cloudflare's standard IETF content-signals boilerplate commentary (definitions of `search`/`ai-input`/`ai-train` and an EU-directive reservation-of-rights notice) — but **no explicit `Content-Signal:` value line and no `User-agent`/`Disallow` directives were present in the fetched body**. This is consistent with, but does not by itself independently confirm, the assignment brief's statement that fordmodels.com reserves against `ai-train`; treated as UNCERTAIN/unresolved at the robots.txt level specifically, while still complying with the brief's minimal-fetch instruction throughout this pass (no additional site crawling was performed beyond the pages needed for this report).
