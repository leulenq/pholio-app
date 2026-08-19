# Bicoastal Management — Agency Entry

**Lead adjudication notes (2026-08-19):**
- Platform-cluster note: Bicoastal's privacy policy §6.3/§6.4 is nearly word-for-word identical
  to State Management's (same 18-independent rule, same 6-month unsuccessful-application
  retention clause), and both sites run on Mainboard/Portfoliopad (State's policy names
  "Portfoliopad / Mainboard" as its platform; Bicoastal serves reference images from
  cdn.portfoliopad.com). This is the second confirmed platform cluster (after the cDs cluster:
  Muse/CURV/Q) — per-platform verification is now evidenced twice.
- The minors pattern repeats for the third time in this set (Elite, CURV, now Bicoastal):
  policy text requires a guardian process, the live form implements no age gate and no
  guardian fields, verified by direct client-side DOB testing. This is now a systemic
  industry finding, not an agency quirk — primary FINDINGS.md item.
- The gender-selector stat-field defect (Male renders the female-coded stat template; only
  Non-binary gets Chest/Collar/Suit) is adjudicated as a live template bug the registry must
  record as OBSERVED behavior without presenting it as an intentional agency schema.
- Everything below is the lane's primary-evidence research, integrated verbatim. (The lane was
  interrupted by an infrastructure limit after writing this file; content is complete.)

---

# Bicoastal Management (Maliwawa Productions Inc.) — Spec Registry Research

Slug: `bicoastal` | Retrieved: 2026-08-19 (UTC, times noted per-claim below) | Researcher: Phase-2 lane

## 1. Identity & channels

- **Legal entity (FACT):** "Company name: Maliwawa Productions Inc" — Privacy Policy §2 ("Who we are"). Address: "240 W 40th St, Ste 502, New York, NY 10018". Controller email: `billing@bicoastalmgmt.com`. [Evidence #10]
- **Trading name (FACT):** "BICOASTAL MGMT" throughout site; About page confirms NYDOL cert block on the same page: "Certificate Number: 26-675G6-LSFW / Issued: 01/21/2026 / Expires: 01/21/2028 / Model Management Company or Group: Company / Status: Registered." [Evidence #7] — matches the NYDOL record given in the assignment (cert 26-675G6-LSFW, issued 2026-01-21, Active).
- **Official domain:** `https://www.bicoastalmgmt.com` (200 OK confirmed 2026-08-19). No other domain referenced anywhere on-site.
- **Markets/offices (FACT):** Two offices, both given only as Google Map pins + department emails on `/contact` — no street address published for either on that page (NYC street address only appears in the Privacy Policy, LA has none published). NYC map centers on ~Times Square/Garment District (40.7558, -73.9903); LA map centers on ~Beverly Grove/Fairfax (34.0985, -118.3316). [Evidence #6]
- **Application channels that exist:**
  1. **`/get-scouted` form** — the canonical, only self-serve talent-submission channel. Single page, single form, no login/account, reCAPTCHA v3 (invisible badge), submits presumably to their Mainboard/Portfoliopad backend. Page `<title>`: "Scouting Print Fashion Commercial Kids Plus Fitness & Fit models". [Evidence #1, #2]
  2. **Department emails** (published on `/contact`, see §9 below) — six named individual mailboxes, three per office, scoped by specialty. No general "submit here" email is published; these read as inquiry/business contacts, not a stated alternate application path, but a talent could plausibly email a headshot to the relevant department address. The `/get-scouted` form is the only channel the site explicitly frames as "apply to be represented."
  3. **`/contact` general contact form** — Full Name*, Email*, Phone*, Message* + reCAPTCHA. Generic inquiry form, not talent-submission-specific (no photo uploads, no stats fields). [Evidence #6]
- **Canonical channel for a NYC applicant:** the `/get-scouted` form (single form, not NY/LA-forked — see §2 for how location is captured). If a NYC applicant wants a specific department to see them fast, the department emails on `/contact` (NYC block) are the named routing: Chrissy@bicoastalmgmt.com (Commercial/VO/Influencer), Lishma@bicoastalmgmt.com (Fashion/Fashion Fit/Showroom), Fit@bicoastalmgmt.com (Fit/Technical Designer) — but nothing on the site tells an applicant to use email instead of the form; the form is presented as the "GET SCOUTED" / "JOIN US" path from the homepage.

## 2. Flow map

1. Homepage (`/`) → CTA "JOIN US" → `/get-scouted`. (Also reachable via hamburger-menu nav item "GET SCOUTED".)
2. `/get-scouted` is a **single page, single step, no pagination, no account/login, no CAPTCHA challenge shown to the user** (reCAPTCHA v3 runs invisibly in the background — badge visible bottom-right, no checkbox/puzzle presented). [Evidence #2, #4]
3. Cookie-consent banner (DENY / ALLOW ALL) overlays the page on first load; this is unrelated to the application itself (Google Analytics opt-in) and does not gate the form.
4. Form sections in visual/DOM order: **PERSONAL → STATS → UPLOADS → ACKNOWLEDGEMENT → SUBMIT**. No conditional multi-step reveal was observed except the gender selector changing which STATS fields render (see §3).
5. **Gate we could not pass without submitting:** the actual POST/submit action and any post-submit confirmation page/content were NOT observed — per hard prohibition, the form was never submitted. Everything above SUBMIT was inspected client-side only; behavior after clicking SUBMIT (success message, redirect, email confirmation) is UNKNOWN.
6. `/contact` is a separate, one-step, non-conditional form (Full Name/Email/Phone/Message) with its own reCAPTCHA; also never submitted.

## 3. Field inventory — `/get-scouted` (in DOM order)

**PERSONAL** (section heading "Personal", `<h2>`)
| Field | Type | Required? | Notes |
|---|---|---|---|
| Gender selector | 3-button toggle group (not native radio) | Requiredness unknown (no attribute, no asterisk on "PERSONAL" heading) | Options verbatim: **Female, Male, Non-binary**. `value="2"` maps to Female, `value="1"` Male, `value="3"` Non-binary. **OBSERVED: "Female" is pre-selected/active by default on page load** (has the `-active` CSS state class before any user interaction) — Male and Non-binary do not. A user who doesn't deliberately click their own gender may submit as Female by default. [Evidence #3, #9] |
| First Name | text, `id="firstName"` | **required** (native `required` attr + red asterisk in UI) | |
| Last Name | text, `id="lastName"` | **required** (native attr + asterisk) | |
| Email | text `type="email"`, `id="email"` | **required** (native attr + asterisk) | Native browser email validation only observed (type=email); no custom pattern in DOM |
| Contact Number | text, `id="contactNumber"` | not required (no attr, no asterisk) | No mask/pattern in DOM |
| City | text, `id="city"` | not required | |
| State | text, `id="stateProvince"` | not required | free text, not a dropdown of US states |
| Country | text, `id="country"` | not required | free text |
| Date of Birth | custom text input + calendar icon (react-datepicker), `name="birthday"` | **required** (attr + asterisk, label "Date of Birth *") | Calendar popup defaults to current month (Aug 2026); year dropdown scrolls back at least to **1926** (100 years). **OBSERVED: no minimum-age enforcement** — typing `01/01/2015` (age 11 at time of test) into the field was accepted with `aria-invalid="false"` and no validation message; no guardian/minor fields appeared as a result (see §7 — this directly contradicts the published Privacy Policy age requirement). [Evidence #11] |
| Nationality | text, `id="nationality"` | not required | free text |
| Ethnicity | autocomplete/combobox text input | not required (no attr, no asterisk) | Full options list verbatim: Arabic/Middle Eastern, Asian, Black/African American, Caribbean, Chinese, East Asian, Half Japanese, Indian/South Asian, Indigenous Australian, Indigenous Canadian, Japanese, Latin American/Hispanic, Māori, Mediterranean, Multi-ethnic, Native American, Pacific Islander, Scandinavian, South American, South East Asian, White/Caucasian |
| Instagram | text, `id="social_instagram"` | not required | handle/URL, no pattern enforced |
| TikTok | text, `id="social_tiktok"` | not required | |
| Website | text, `id="website"` | not required | |

**STATS** (`<h2>` "Stats") — all combobox-style (typeable + dropdown of preset options), all **not required** except Height:
| Field | Required? | Options (verbatim, condensed where huge) |
|---|---|---|
| Height | **required** (asterisk) | Combined cm/inches list, e.g. `"163cm/5'4\""`...`"183cm/6'0\""` — full range 30cm–218cm plus a separate inches-only tail (12"–70" in 0.5" steps) |
| Bust | not required | cm/inches pairs, 30cm/12" up to 160cm/63" |
| Cup | not required | A, A/B, B, B/C, C, C/D, D, DD, DDD, DDDD, E, F, FF, G, GG, H, I, J, K |
| Hips | not required | cm/inches pairs, 40cm/15.5" up to 178cm/70" |
| Waist | not required | cm/inches pairs, 35cm/14" up to 160cm/63" |
| Dress | not required | Combined EU/US/UK/AUS sizing, e.g. "28 EU/00 US/0 UK/2 AUS" ... "60 EU/30 US/32 UK/32 AUS" (single + half sizes) |
| Shoe | not required | Combined EU/US/UK, explicitly split into "(kids)" sizes (17.5 EU/2 US/1 UK (kids) … 32.5 EU/1.5 US/13.5 UK (kids)) and adult sizes (33 EU/2 US/1 UK … 45 EU/14 US/11 UK) |
| Clothing Top | not required | XXS, XS, S, M, L, XL, XXL, XXXL, XXXXL |
| Clothing Bottom | not required | XXS, XS, S, M, L, XL, XXL, XXXL, XXXXL |
| Hair | not required | Ash, Ash Blonde, Auburn, Auburn Red, Bald, Black, Blonde, Blonde Venetian, Blue, Brown, Brown Venetian, Brunette, Chestnut, Dark Black, Dark Blonde, Dark Brown, Dark Red, Dirty Blonde, Grey, Grey Brown, Grey-Black, Hazel, Hijab, Light Blonde, Light Brown, Light Red, Maroon, Pink, Platinum Blond, Red, Salt and Pepper, Silver, Strawberry Blonde, Venetian Red, White |
| Eyes | not required | Amber, Black, Blue, Blue/Green, Blue/Grey, Brown, Dark Brown, Green, Green/Brown, Green/Grey, Grey, Hazel |
| "Mention anything else you'd like us to know" | textarea, not required | free text, no maxlength in DOM |

**OBSERVED conditional-field behavior on the gender selector (tested on fresh page loads for each option, not just re-clicks — see Evidence #9):**
- **Female selected:** Stats fields shown = Bust, Cup, Hips, Waist, Dress, Shoe, Clothing Top, Clothing Bottom, Hair, Eyes.
- **Male selected:** **identical field set to Female** — Bust, Cup, Hips, Waist, Dress, Shoe, Clothing Top, Clothing Bottom, Hair, Eyes. No male-specific fields (no Chest/Collar/Suit/Suit Length) appear for Male.
- **Non-binary selected:** superset — Bust, **Chest**, Cup, **Collar**, Hips, Waist, Dress, **Suit**, **Suit Length**, Shoe, Clothing Top, Clothing Bottom, Hair, Eyes.
- This is almost certainly a template bug (Non-binary appears to render the union of a "female" and "male" stat-field template, while Male incorrectly renders the female-coded template instead of its own) rather than an intentional design choice — flagged in §10 as a notable trap for a talent using the tool (e.g., a male applicant will be asked for Bust/Cup/Dress size and never asked for Chest/Collar/Suit, which is unusual for a men's fit/commercial submission).

**UPLOADS** (`<h2>` "Uploads") — see §4.

**ACKNOWLEDGEMENT**
| Field | Type | Required? |
|---|---|---|
| Checkbox, `name="terms"` | checkbox | Label verbatim: "I acknowledge that I have read, and do hereby accept the Privacy Policy." No native `required` attribute observed in DOM, but visually flagged in the UI flow before Submit; whether JS blocks submit if unchecked was not tested (would require attempting submit). |
| reCAPTCHA | `g-recaptcha-response` hidden textarea + visible badge | Invisible reCAPTCHA v3; "This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply." (plain text under the checkbox, links to Google's own policy/terms pages, not Bicoastal's). |
| SUBMIT button | `type="submit"` | Not tested. |

## 4. Uploads

Five upload controls total, in this DOM order:

| Slot | Field name | `accept` (verbatim) | Required? | Notes |
|---|---|---|---|---|
| Resume Document (PDF) | `resume` | `.pdf` | **Optional** — no asterisk, no required attr | Text field shows chosen filename (readonly) + "UPLOAD" button opening a hidden `<input type=file accept=".pdf">` |
| Video / Show Reel (MP4) | `video` | `.mp4` | **Optional** — no asterisk, no required attr | Same UI pattern as Resume |
| Close-Up | `closeUp` | `image/*, image/heic, image/heif` | **Required** (asterisk: "CLOSE-UP *") | |
| Full Body | `fullBody` | `image/*, image/heic, image/heif` | **Required** ("FULL BODY *") | |
| Side Profile | `sideProfile` | `image/*, image/heic, image/heif` | **Required** ("SIDE PROFILE *") | |
| Upper Body | `upperBody` | `image/*, image/heic, image/heif` | **Required** ("UPPER BODY *") | |

- **4 required photo slots confirmed** (matches the "4 photos rumored" flag in the assignment) — Close-Up, Full Body, Side Profile, Upper Body, each a single-file input (no `multiple` attribute on any of the four).
- **Resume/reel optional confirmed** (matches the assignment's flag) — neither has a required marker.
- **File size/format limits: NONE found anywhere in the DOM.** No `maxlength`-equivalent, no data attributes referencing MB/KB, no helper/tooltip text near the upload buttons or in the surrounding `<fieldset>`/`<legend>` markup (full HTML of the Uploads section was captured — see Evidence #12 — and contains nothing beyond the `accept` strings above). This CONFIRMS the "none observed in an earlier shallow pass" flag: still nothing published or enforced client-side as of this pass. Actual upload was never attempted (would require providing real file bytes to test server-side limits, which risks data transmission and is prohibited), so a server-side size cap cannot be ruled out — this is UNCERTAIN, not FACT.
- No aspect-ratio, resolution, orientation, or dimension guidance published anywhere in the DOM or visible page text.
- Video: no duration, format, or size guidance beyond the `.mp4` extension filter.
- The four example photos shown next to each slot (see §5) are placeholder/reference images pulled from the agency's own CDN (`cdn.portfoliopad.com`), not applicant-uploaded previews — confirmed by their `alt` text exactly matching the slot name ("Close-Up", "Full Body", "Side Profile", "Upper body") and by them being present before any file is chosen.

## 5. Photo/shot instructions

- **No written instructional text is published anywhere on `/get-scouted`** about clothing, makeup, hair, background, lighting, expression, retouching, or filters for the four required photos. The section heading is simply "UPLOADS" and each slot label is just the shot name + asterisk.
- The only guidance is **visual, via the four example reference photos** shown beside/above each upload button (sourced from `cdn.portfoliopad.com/images/10260/2824237/...`). From the screenshot (Evidence #13): all four reference photos show the same model — minimal/no visible makeup, hair pulled back/up, plain black fitted tank top + black bottoms, bare feet or simple black heels, plain light-grey/neutral studio background, neutral/relaxed expression, natural lighting, no visible filter. This is inference from the image content itself (labelled OBSERVED, not a verbatim agency statement) — the agency provides no caption or alt-text beyond the shot-type name, so a talent must infer "plain, unfiltered, natural" styling from the example rather than being told it in words.
- No text anywhere states "no filters," "no retouching," "natural light only," etc. — absence noted per the quality bar (absence of a published rule is an unknown, not permission).

## 6. Eligibility

- **Stated eligibility (FACT, from `/get-scouted` intro paragraph):** "BICOASTAL MGMT is always looking for potential fit models with consistent measurements and experience, NYC and LA based development models, and experienced commercial actors, fashion, print, plus models and talent of all ages and types." [Evidence #1]
- **"All ages and types" claim vs. actual handling — see §7, this is a major contradiction.**
- **Location:** No location restriction is enforced in the form itself (City/State/Country are free-text, optional, and not validated against NY/LA). The "NYC and LA based development models" phrase suggests development-division eligibility is geographically scoped to those two markets, but this is stated as a description of who they're looking for, not as a form-enforced rule — nothing in the form blocks a submission from outside NY/LA.
- **Gender/division scoping:** The form itself does not scope by division (no division/category picker exists in `/get-scouted` at all — see §1, applicants just submit personal/stats/photos and the agency presumably routes internally). Gender is limited to the 3-button set (Female/Male/Non-binary) — no explicit age-bracket, division, or "kids" option in the form despite a `nyc-kids` / `la-kids` roster category existing on the site (see sitemap in Evidence #14) — meaning a minor/kids applicant uses the identical generic form, not a dedicated kids form.
- **Measurement/eligibility guidance for FIT modeling specifically (assignment special task f):** **No fit-specific numeric measurement specs (e.g., a target bust-waist-hip triplet, a required dress-size range) are published anywhere on the site.** The only measurement inputs are the generic Height/Bust/Cup/Hips/Waist/Dress/Shoe/Clothing Top/Clothing Bottom fields shared by every applicant regardless of division (same dropdowns appear whether or not the applicant is a fit-model hopeful). The only qualitative fit-related language found is: (a) the `/get-scouted` intro — "fit models with consistent measurements and experience"; (b) the About page — "Founded in 2009 by Fit Model veteran Malissa Young, BICOASTAL MGMT has found fit models for design houses and household name brands such as Alexander Wang, Alice and Olivia, American Eagle, Ann Taylor, Calvin Klein, Donna Karan, DVF, Elie Tahari, GAP, J CREW, J Brand, Lucky Jeans, Marc Jacobs, Macy's, Madewell, Opening Ceremony, Rag & Bone, Ralph Lauren, Talbots, Theory, Tommy Hilfiger, Tory Burch, Vera Wang, Zac Posen and many more! We represent fit models of ALL shapes and sizes for size sets, curvy fits, standard production or runway fit. Our fit models receive one-on-one training and client feedback is always applied to maximize potential for both model and brand." [Evidence #7]. This is UNCERTAIN/none-found territory for precise numeric fit specs — flagged explicitly rather than inferring generic industry fit-model numbers (e.g. 34-25-35) that are not published by this agency.
- **Division taxonomy that exists on the site (roster categories, from `robots.txt` sitemap — see Evidence #14), verbatim slugs, present for both `nyc-` and `la-` prefixes except where noted:** women-main, men-main, women-direct, men-direct, men-brawn, women-development, men-development, women-lifestyle-main, women-lifestyle-classic, men-lifestyle-main, men-lifestyle-classic, women-curve-main, women-curve-direct, women-fit-contemporary, women-fit-missy, women-fit-runway, women-fit-plus-curvy, women-fit-curvy, men-fit-small, men-fit-medium, men-fit-large, men-fit-x-large, men-fit-big-tall, men-fit-runway (LA additionally has `la-men-fit-Traditional` in place of `la-men-fit-medium`/`small` — capitalization "Traditional" is verbatim from the sitemap URL), women-fitness, men-fitness, women-parts-lips, women-parts-hands, women-parts-legs, women-parts-feet, men-parts-hands, men-parts-legs, non-conforming, kids, creators, photographers, petite; plus site-wide (not NY/LA split): new-faces, voiceover. **These are talent-roster board categories, not form-selectable application divisions** — the `/get-scouted` form has no field for the applicant to pick one of these.

## 7. Minors & guardians — HIGH PRIORITY FINDING / CONTRADICTION

**This is the single biggest trap in this agency's application experience.**

- **Privacy Policy §6.4 "AGE REQUIREMENT AND PARENTAL CONSENT" (FACT, verbatim, retrieved 2026-08-19 from `/privacy-policy`):**
  > "You must be 18 years of age or older to submit a talent application independently. If you are under 18, your application must be submitted by a parent or legal guardian who accepts this Privacy Policy on your behalf.
  >
  > For applicants under 18, we require written parental or guardian consent before processing the application. Please contact us at billing@bicoastalmgmt.com for the appropriate consent form."
- **Privacy Policy §13 "CHILDREN'S PRIVACY" (FACT, verbatim):**
  > "Our Website is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13 without verifiable parental consent. If you believe we have inadvertently collected such information, please contact us immediately and we will delete it.
  >
  > Talent applications from individuals under 18 require parental or guardian consent as described in Section 6.4. Please contact us at billing@bicoastalmgmt.com with any concerns."
- **CONTRADICTION — the live form does not implement any of this:**
  - `/get-scouted` has **no age gate**: the Date of Birth field (OBSERVED) accepted `01/01/2015` (would make the applicant 11 years old) with `aria-invalid="false"` and no error, no warning, no blocking behavior.
  - There is **no parent/guardian name, email, phone, relationship, or signature field anywhere in the form** — confirmed by full DOM dump (Evidence #2) and by full visible-text dump (Evidence #1): the word "guardian" and "parent" do not appear anywhere in the page's rendered text.
  - There is **no separate "under 18" toggle, branch, or redirect** — selecting a birth date implying a minor does not change the form, does not surface a consent checkbox, and does not point the user to `billing@bicoastalmgmt.com` for a paper consent form.
  - The site nonetheless maintains a public "kids" talent-roster category (`nyc-kids`, `la-kids` in the sitemap — Evidence #14) and the `/get-scouted` intro text explicitly invites "talent of all ages and types," so minors are clearly an expected applicant population, yet the only online path for them silently collects their data with none of the guardian process the agency's own Privacy Policy says is required.
- **Net effect for a talent using Pholio:** a minor (or a parent filling this out for a minor) will NOT be prompted for guardian consent by the form itself. The only place that requirement is disclosed is deep in the Privacy Policy, and the remedy it names (email `billing@bicoastalmgmt.com` for "the appropriate consent form") is not linked, surfaced, or referenced anywhere near the actual submission form. **A minor applicant filling out `/get-scouted` alone, with no parent involved, will be able to complete and (presumably) submit the form with no on-form guardian step whatsoever** — this is exactly the kind of surprise the brief asks us to flag as highest priority.

## 8. Consent & legal

- **On-form checkbox (verbatim, required to check per UI but native-`required` not confirmed in DOM):** "I acknowledge that I have read, and do hereby accept the Privacy Policy." Links to `/privacy-policy`.
- **reCAPTCHA disclosure (verbatim, plain text below the checkbox):** "This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply." Links to Google's own privacy policy and terms (`policies.google.com/privacy`, `policies.google.com/terms`), not Bicoastal's.
- **Privacy Policy — talent-submission-specific terms (§6.1, verbatim):** "By submitting your application, you give us permission to: Review and evaluate your application / Store your submission in our secure talent management system / Contact you about the outcome of your application / If accepted, include your profile in our internal talent roster / Share your profile with clients and casting directors for legitimate booking opportunities / Display your profile on our agency website and digital presentations to clients, if you consent to this separately"
- **Photo/video usage (§6.2, verbatim):** "Photographs and video content submitted through our talent application form are used solely for the purpose of representing your talent to potential clients and employers. We will not: Sell, license, or transfer your images or videos to third parties for their own commercial use / Use your images or videos in advertising or marketing materials without your separate written consent / Alter or manipulate your images in a misleading or derogatory manner. Approved talent who are added to our roster will have their images and professional details displayed on our agency website and in digital client presentations. You will be asked for specific consent to this before your profile is made public."
- **Unsuccessful-application retention (§6.3, verbatim) — see also §9 Process facts:** "If your application is not successful, we will retain your submission for a period of 6 months in case a suitable opportunity arises, after which it will be securely deleted unless you request earlier deletion. We will notify you of this retention period at the time of our decision."
- **No fee / no upfront payment statement (FACT, from About page, verbatim):** "Our models and talent do not pay any upfront fees for any service. We work strictly on a commission basis for our management clients." This functions as the agency's scam-warning-equivalent language, though it is not phrased as an explicit "beware of scams" notice.
- **Data controller / minors overlap:** billing@bicoastalmgmt.com is used both as the general privacy-rights contact AND as the named contact for the guardian-consent-form request (§6.4) — no separate/dedicated child-safety contact is published.

## 9. Process facts

- **"We can't answer every submission" (FACT, verbatim, `/get-scouted` intro):** "We can't answer every submission but appreciate your application! No calls please." — i.e., silence is the expected default outcome for most applicants; the agency explicitly asks applicants not to call.
- **Retention/notification for unsuccessful applicants (FACT, Privacy Policy §6.3):** 6-month retention post-decision, then secure deletion, "unless you request earlier deletion," and the agency states it "will notify you of this retention period at the time of our decision" — this implies a decision notification is sent, which sits in tension with "We can't answer every submission" on the form page (a CONTRADICTION worth flagging — see §10).
- **No stated response timeline** (no "X weeks," no SLA) anywhere on `/get-scouted`, `/contact`, or the Privacy Policy, beyond the general "we aim to respond to all privacy enquiries within 30 days" (§16), which is about privacy-rights requests, not application outcomes.
- **No open-call schedule, no walk-in hours, no seasonal/deadline windows published anywhere** on the site — the `/get-scouted` form appears to accept submissions on a rolling, year-round basis with no stated cutoffs.
- **No re-application guidance published** (nothing about how long to wait before reapplying, or whether reapplying is welcomed/discouraged).
- **"No calls please"** is the only explicit process instruction beyond "fill out the form."

## 10. Contradictions & uncertainties (ranked by how badly they could surprise a talent)

1. **[HIGH] Minors/guardian consent (§7).** Privacy Policy explicitly requires an under-18 applicant to have a parent/guardian submit on their behalf with written consent obtained via `billing@bicoastalmgmt.com`, but the live `/get-scouted` form has zero age gate, zero guardian fields, and zero branching — a minor can fill it out entirely alone with no on-form warning. This is the single riskiest gap for a talent (or a platform like Pholio modeling this agency) to get wrong.
2. **[MEDIUM] "All ages and types" vs. no age infrastructure.** The marketing line ("talent of all ages and types") and the existence of `nyc-kids`/`la-kids` roster categories imply minors are actively recruited, yet the intake mechanism treats them identically to adults with no protective flow — reinforces #1.
3. **[MEDIUM] Gender-selector stat-field bug.** Selecting "Male" shows the same Bust/Cup/Hips/Waist/Dress fields as "Female" (not the Chest/Collar/Suit fields that appear under "Non-binary"), while "Non-binary" shows a superset of both. Likely a template defect rather than intentional, but a male applicant will be asked to report a "Cup" size and never asked for "Chest" or "Collar" — worth flagging so Pholio doesn't treat this as an intentional, agency-endorsed men's stat schema.
4. **[MEDIUM] "We can't answer every submission... No calls please" vs. Privacy Policy §6.3's "we will notify you of this retention period at the time of our decision."** The form-page language sets an expectation of likely silence; the Privacy Policy implies unsuccessful applicants DO get a decision-time notification (at least about data retention). Both are recorded verbatim; not resolved.
5. **[LOW-MEDIUM] "Female" pre-selected by default** in the gender toggle group on page load — an inattentive Male or Non-binary applicant who doesn't click their own option could submit as Female by default (button-group control, not a neutral/unset native radio).
6. **[LOW] File size/dimension/duration limits entirely unpublished** for all 6 upload fields (resume PDF, video MP4, 4 required photos). Confirmed absent in DOM both in this pass and the assignment's earlier shallow pass. Whether a server-side cap exists is UNCERTAIN (untestable without transmitting a real file, which is prohibited).
7. **[LOW] Fit-model numeric measurement specs are not published.** The assignment flagged fit models as having "precise measurement specs" industry-wide, but Bicoastal publishes none — only generic stat dropdowns shared by all applicants and qualitative language ("consistent measurements and experience"). Do not fabricate a numeric fit spec for this agency.
8. **[LOW] Photo styling instructions are entirely visual (reference photos), never written** — a talent relying on text-only guidance (e.g., a screen reader, or a UI that only surfaces alt text) would get only "Close-Up / Full Body / Side Profile / Upper body" as labels, with none of the plain-background/minimal-makeup/hair-back guidance that the reference images themselves convey visually.
9. **[LOW] Post-submit behavior entirely unknown.** No success message, confirmation email content, or redirect was observed (submission was never attempted per the hard prohibition). Do not assume a confirmation email is sent.

## 11. Draft talent-facing brief (for Pholio's Market view)

Bicoastal Mgmt (New York and Los Angeles) accepts applications through a single online form at bicoastalmgmt.com/get-scouted — no account or login needed. You'll give basic personal info (name, email, and date of birth are required; phone, city, state, country, nationality, ethnicity, and socials are optional), pick Female, Male, or Non-binary, and optionally fill in measurements (height is the only required stat; bust, waist, hips, dress/shoe size, hair, and eye color are all optional dropdowns with combined US/UK/EU units). You must upload four photos — a close-up, a full body, a side profile, and an upper body shot — all required, images only (JPEG/PNG/HEIC accepted). A resume PDF and a video reel (MP4) are optional. No photo styling instructions are written out; the example photos shown next to each upload slot suggest minimal makeup, hair pulled back, a plain black top, and a plain light background, but this is only implied through the reference images, not stated. There's no published file-size limit for any upload, so when in doubt keep files reasonably sized. Before submitting you'll check a box accepting their Privacy Policy; there's an invisible spam check (reCAPTCHA) in the background, not a puzzle you'll see.

Important gaps to know about: the form itself has no minimum-age check and no parent/guardian fields, even though Bicoastal's own Privacy Policy says anyone under 18 must have a parent or guardian submit on their behalf and get separate written consent by emailing billing@bicoastalmgmt.com — if you're a minor (or applying for one), do that email step yourself, because the form won't prompt you to. The agency is upfront that they "can't answer every submission" and asks applicants not to call. There's no stated turnaround time and no listed application deadlines or open-call dates — submissions appear to be accepted year-round. If they don't pass your info along, they say they'll keep your submission on file for about 6 months before deleting it. Bicoastal does not charge any upfront fees.

## 12. Evidence log

1. `https://www.bicoastalmgmt.com/get-scouted` — retrieved 2026-08-19, Playwright (networkidle) — full rendered body text of the Get Scouted page; source of the intro paragraph, "No calls please," and all visible section headings/labels. Screenshot: `/tmp/claude-0/-home-user/7bf68b63-0da8-50e3-86bd-bf0444040ebb/scratchpad/phase2/shots/bicoastal-getscouted-full.png`.
2. `https://www.bicoastalmgmt.com/get-scouted` — retrieved 2026-08-19, Playwright `dumpForms()` + custom `page.evaluate` — full form-control DOM dump (all inputs, types, `required`/`accept`/`multiple` attributes, labels). Raw output stored at `/tmp/claude-0/-home-user/7bf68b63-0da8-50e3-86bd-bf0444040ebb/scratchpad/phase2/bicoastal_dump_out.txt`.
3. `https://www.bicoastalmgmt.com/get-scouted` — retrieved 2026-08-19, Playwright — `page.evaluate` extraction of the gender-selector container HTML, showing button-group markup, `value` attrs (Female=2, Male=1, Non-binary=3), and the `-active` class present only on the Female button pre-interaction.
4. `https://www.bicoastalmgmt.com/get-scouted` — retrieved 2026-08-19, Playwright — extracted full Uploads-section HTML (`bicoastal_upload_html.mjs`), confirming `accept=".pdf"`, `accept=".mp4"`, and no size/format hint text anywhere in that markup; also confirmed `.grecaptcha-badge` element present (invisible reCAPTCHA v3, `data-style="bottomright"`).
5. `https://www.bicoastalmgmt.com/robots.txt` — retrieved 2026-08-19, curl — confirmed no `Disallow` on `/get-scouted`, `/contact`, `/about`, `/privacy-policy`, `/blog`; enumerated ~70 roster-category sitemap URLs used in §6.
6. `https://www.bicoastalmgmt.com/contact` — retrieved 2026-08-19, Playwright — full page text and mailto links. Source of all six department emails and their scoping (quoted verbatim in §1). Screenshot: `.../shots/bicoastal-contact.png`.
7. `https://www.bicoastalmgmt.com/about` — retrieved 2026-08-19, Playwright — full page text. Source of the NYDOL cert block, the "Print & Commercial department" and fit-model-founder paragraphs (quoted verbatim in §1 and §6), and the "no upfront fees" statement (§8).
8. `https://www.bicoastalmgmt.com/` (homepage) — retrieved 2026-08-19, Playwright — confirmed "JOIN US" → `/get-scouted` and "CONTACT US" → `/contact` as the only two calls-to-action; hamburger-menu nav dump also surfaced the full roster-division link list (women-main, women-direct, women-lifestyle-main, etc.), corroborating the sitemap taxonomy in Evidence #5.
9. `https://www.bicoastalmgmt.com/get-scouted` — retrieved 2026-08-19, Playwright (`bicoastal_gender_fresh.mjs`, fresh page load per gender) — confirmed the Female/Male/Non-binary conditional-stat-field behavior in §3/§10 is reproducible and not a stale-DOM artifact (tested Female, Male, Non-binary each on a brand-new page load).
10. `https://www.bicoastalmgmt.com/privacy-policy` — retrieved 2026-08-19, Playwright (`domcontentloaded` + 4s settle, `bicoastal_privacy2.mjs`) — full policy text (16 sections). Source of the legal-entity/controller info (§1), the age/parental-consent requirement (§6.4, quoted verbatim in §7 — this is the single most important source document in this research pass), the children's-privacy section (§13), retention schedule (§9), and data-sharing disclosures (§8).
11. `https://www.bicoastalmgmt.com/get-scouted` — retrieved 2026-08-19, Playwright (`bicoastal_dob.mjs`) — client-side-only test typing `01/01/2015` into the Date of Birth field; confirmed `aria-invalid="false"`, no validation message, no guardian fields appeared, and the only non-GET network request observed during the whole session was a benign CSP violation report to `csp.withgoogle.com` (not applicant data) — confirms no autosave/XHR-on-blur risk for this field.
12. Same as #4 (Uploads-section HTML), cited separately in §4 for the "no size limits" claim.
13. `/tmp/claude-0/-home-user/7bf68b63-0da8-50e3-86bd-bf0444040ebb/scratchpad/phase2/shots/bicoastal-getscouted-full.png` — full-page screenshot, source of the visual description of the four reference photos in §5 (styling described is Claude's visual read of the screenshot, labeled OBSERVED/inference, not a quoted agency statement).
14. `https://www.bicoastalmgmt.com/robots.txt` sitemap block — same retrieval as #5 — full list of `nyc-*` and `la-*` sitemap slugs used verbatim in §6's division taxonomy, including the irregular capitalization `la-men-fit-Traditional`.
