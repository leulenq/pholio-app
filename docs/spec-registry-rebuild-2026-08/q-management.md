# Q Management — Agency Entry

**Lead adjudication notes (2026-08-19):**
- The "Thursday 10–11am open call" claim that circulated in earlier internal research is
  adjudicated NOT-FACT for Q: it traces only to a third-party directory whose listed addresses
  don't match Q's verified offices, while Q's own most recent first-party statement (2019)
  says open calls were on hold. Pholio must not surface an open call for Q.
- Platform-cluster note: Q's privacy policy carries the same un-replaced "Agency Name"
  template placeholder found at CURV (and Q's stack is the same Nuxt-SPA shape as CURV/Muse) —
  a third member of the shared-platform cluster; one platform checker can re-verify all three.
- The published "JPG only, ≤3MB" vs the DOM's `.jpg, .jpeg, .png, .gif` accept string with no
  client-side size enforcement is a canonical prose-vs-DOM contradiction for MODEL.md: the
  registry must store both the published rule and the observed enforcement, separately labeled.
- Everything below is the lane's primary-evidence research, integrated verbatim.

---

# Q Management (Que Management Inc.) — Spec Registry Research
Slug: `q-management` | Researched 2026-08-19 (UTC timestamps in Evidence Log)

## 1. Identity & channels

- Legal entity (per assignment brief, NYDOL): **Que Management Inc.**, NYDOL cert **26-6771P-LSFW**, issued 2026-01-29, status Active, address 37 W 26th St.
- FACT — Q's own site footer (every page) reads: "POWERED BY CDS MODELS & TALENT SOFTWARE MANAGEMENT - REG# 26-6771P-LSFW" — the same registration number as the NYDOL cert, corroborating identity. [Evidence #1]
- FACT — Q's own /contact page: "NEW YORK — 37 West 26th St. New York, NY 10010 | +1 (212) 807 6777 | nyc@qmanagementinc.com" and "LOS ANGELES — 912 N. La Cienega Blvd, Los Angeles, CA 90069, USA | Tel: +1 (310) 205 2888 | la@qmanagementinc.com". The NY address matches the NYDOL cert address exactly. [Evidence #2]
- Official domain: `www.qmanagementinc.com`. Built on Nuxt.js (Vue) + Tailwind, served by a shared vertical SaaS platform ("CDS Models & Talent Software Management", cdsglobal.com) — this same platform powers other modeling agencies, evidenced by an unedited template leftover in Q's own Privacy Policy: "When someone visits **Agency Name** website we may collect standard visitor details..." (literal placeholder text, not filled in). [Evidence #3]
- Markets/offices: New York and Los Angeles (self-described: "With thriving offices in New York and Los Angeles..." on /about). [Evidence #4]
- Application channels found:
  1. **Web form** at `/join` — single canonical form for both offices, no office selector (see §2/§9).
  2. **Email** — `nyc@qmanagementinc.com` (NY) and `la@qmanagementinc.com` (LA), published on /contact. A 2019 Instagram caption from Q's own LA account additionally instructed submissions go to `la@qmanagementinc.com` (dated, see §9). [Evidence #2, #5]
  3. No third-party submission portal (e.g., Model Mayhem widget, iframe to an external ATS) was found embedded in the site.
- Canonical channel for a NYC applicant: the **`/join` web form** — it is the only channel Q links from its own primary navigation ("JOIN" in the top nav on every page) and the only channel with a defined, observable field schema. Email is a secondary/fallback channel with no published format requirements found anywhere on-site.

## 2. Flow map

- Entry: `https://www.qmanagementinc.com/join` → single page, single step, no login/account gate, no multi-page wizard.
- Client-side rendered (Nuxt/Vue SPA using the "FormKit" form library — DOM classes `formkit-outer`, `formkit-wrapper`, `formkit-label`). Static `curl` of the URL returns only the app shell; full form only appears after JS execution (confirms "modern JS framework" flag in the brief). [Evidence #6]
- No office toggle inside the form. The "NEW YORK | LOS ANGELES" pills visible in the site header are roster-browsing filters that link to `/` (homepage) — OBSERVED they do not affect `/join` and there is no equivalent toggle scoped to the join form itself. [Evidence #7]
- No division/board selector inside the form (see §3) — despite the site's roster nav exposing many named boards (Main, Direct, Development, Curve, Q Too, Lifestyle, Talent depending on office/gender), the join form does not ask which board or office the applicant is applying to.
- Google reCAPTCHA is wired into the form: a hidden `<textarea name="g-recaptcha-response">` control is present and the page references a `recaptchaSiteKey` config value, though no visible reCAPTCHA challenge widget rendered in the initial DOM dump (consistent with invisible/v3 reCAPTCHA, which fires at submit time). [Evidence #8]
- Gate we could not pass without submitting: the reCAPTCHA + actual submit handler. We did not click Submit (hard prohibition) and could not observe server-side validation, success/confirmation screen, or any post-submit redirect/thank-you text. This is an unresolved gap, not evidence of "no confirmation exists."
- Client-side probing performed safely (no network POST observed via `page.on('request')` for any of the below):
  - Selected a 4MB dummy "big.jpg" into the Headshot file slot — no visible error appeared, no request fired, despite the visible instruction stating a 3MB cap. [Evidence #9]
  - Force-selected a `.txt` file into the second photo slot (bypassing the OS picker's `accept` filter via Playwright) — no visible client-side error appeared, no request fired. [Evidence #9]
  - Toggled the "sex" radio between FEMALE/MALE — the full set of 48 visible page text lines (i.e. every field/label) was byte-identical before and after; no field appears/disappears based on sex. [Evidence #10]
  - Toggled "MEASUREMENT UNIT" between CM and INCH — no inline unit hint or label text changed near HEIGHT/BUST/WAIST/etc. fields (they remain plain, unitless labels: "HEIGHT", "BUST", etc.). [Evidence #10]
- Conclusion: the form has effectively one linear, non-conditional step: fill ~21 fields + 4 photo uploads + 1 consent checkbox, pass reCAPTCHA, submit.

## 3. Field inventory (verbatim labels, in DOM order)

All text fields below are plain `<input type="text">` (or as noted) with **no `required` attribute, no `maxlength`, no `pattern`, no `min`/`max`** observed on any of them — OBSERVED via full DOM dump (see Evidence #6). This means every field is "present, requiredness unknown" per the quality bar; we could not determine true server-side requiredness without submitting, which is prohibited.

| # | Verbatim label | name/id | Type | Options (verbatim) | Notes |
|---|---|---|---|---|---|
| 1 | FEMALE / MALE | `sex` (radio group) | radio | "FEMALE", "MALE" | Binary only — no third option, no "Q Too"/non-binary radio value despite the site having a "Q Too" roster board (see §6). |
| 2 | FIRST NAME | `firstname` | text | — | |
| 3 | LAST NAME | `lastname` | text | — | |
| 4 | GENDER | `gender` | text (free-form) | — | Distinct from the binary `sex` radio; open text field. |
| 5 | PRONOUNS | `pronouns` | text (free-form) | — | |
| 6 | AGE | `age` | text | — | Plain text, not `type=number`; no numeric-only enforcement observed. |
| 7 | EMAIL ADDRESS | `email` | email | — | Native `type=email` (browser format validation only). |
| 8 | NATIONALITY | `nationality` | text | — | |
| 9 | LOCATION | `location` | text | — | |
| 10 | MOBILE | `phone` | text | — | Plain text, no phone `pattern`/mask observed. |
| 11 | INSTAGRAM | `instagram` | url | — | Native `type=url`. |
| 12 | TIKTOK | `tiktok` | url | — | Native `type=url`. |
| 13 | MEASUREMENT UNIT | `measureunit` | select | "CM", "INCH" | Does not visibly change other field labels/placeholders when toggled (OBSERVED). |
| 14 | HEIGHT | `height` | text | — | No placeholder text; unit ambiguous beyond the separate unit selector. |
| 15 | BUST | `bust` | text | — | |
| 16 | HIPS | `hips` | text | — | |
| 17 | WAIST | `waist` | text | — | |
| 18 | DRESS SIZE | `dress` | text | — | |
| 19 | SHOE SIZE | `shoesize` | text | — | |
| 20 | HAIR COLOR | `haircolor` | text | — | |
| 21 | EYE COLOR | `eyecolor` | text | — | |
| 22 | TELL US A BIT MORE ABOUT WHO YOU ARE | `message` | textarea | — | No maxlength observed. |
| — | (hidden) | `g-recaptcha-response` | textarea (hidden) | — | reCAPTCHA payload field, not user-facing. |

No division/board select field, no office select field, no age-gate/date-of-birth field, no consent-to-be-contacted-by-SMS field beyond the single checkbox in §8.

## 4. Uploads

- Instructional text immediately above the upload block, verbatim: **"Submit your photos as JPG files, no larger than 3MB in size."** [Evidence #6]
- **CONTRADICTION** — the actual `<input type="file">` `accept` attribute on all four photo slots is verbatim: **`.jpg, .jpeg, .png, .gif`** — i.e., the DOM technically accepts PNG and GIF as well as JPG/JPEG, contradicting the on-page "as JPG files" instruction. OBSERVED directly from the DOM (`dumpForms` output) for all four slots identically. [Evidence #6]
- Four named single-file slots (no `multiple` attribute on any — each is exactly one file):
  1. **Headshot** (`medias_0` / `#form-media-0`)
  2. **Full Length** (`medias_1` / `#form-media-1`)
  3. **Profile** (`medias_2` / `#form-media-2`)
  4. **3/4 Length** (`medias_3` / `#form-media-3`)
- No per-slot instructions beyond the slot name itself (no separate copy like "no filters," "against a plain background," etc., attached to individual slots).
- Size cap: **3MB per file, published** ("no larger than 3MB in size" — ambiguous whether this is per-file or total, but phrasing ("as JPG files, no larger than 3MB") reads as per-file). OBSERVED: selecting a 4MB dummy file into a slot produced **no visible client-side error and did not block file selection** — the 3MB limit is not enforced in the browser before submit, so it may only be enforced server-side (untested, since testing would require submitting).
- No video upload field exists on this form (no video requirements to report).
- No explicit orientation/aspect-ratio/dimension guidance published (e.g., no "portrait orientation only," no pixel dimensions stated).

## 5. Photo/shot instructions

- Only instructional text found: "Submit your photos as JPG files, no larger than 3MB in size." (see §4). No further published guidance anywhere on `/join`, `/about`, or `/contact` about clothing, makeup, hair, background, lighting, expression, retouching, or filters for the four required photo types (Headshot / Full Length / Profile / 3/4 Length). The slot names themselves imply the shot type but the site does not describe what each should look like.
- None found beyond the above — this is itself a finding (talent gets a bare label like "Profile" or "3/4 Length" with zero styling guidance).

## 6. Eligibility

- **None found published anywhere on the site.** Checked `/join`, `/about`, `/contact`, and all division/board landing pages (`/new-york-women-main`, `/new-york-women-curve`, `/new-york-Q-too`, `/new-york-men-main`, `/los-angeles-Q-too`, `/los-angeles-curve`) — none contain eligibility text (no minimum/maximum age, no height floor, no measurement range, no location/market restriction statement, no gender/division scoping rule). These pages only render existing roster models' stat cards (height/bust/waist/hips/dress/shoe/hair/eye) with no accompanying prose describing what the agency is looking for. [Evidence #11]
- **Divisions/boards actually offered by the site (roster navigation, NOT the join form):**
  - New York — Men: MAIN (`/new-york-men-main`), DIRECT (`/new-york-direct-men`), DEVELOPMENT (`/new-york-development`), Q TOO (`/new-york-Q-too`)
  - New York — Women: MAIN (`/new-york-women-main`), DIRECT (`/new-york-women-direct`), DEVELOPMENT (`/new-york-women-development`), CURVE (`/new-york-women-curve`)
  - Los Angeles — Men: MAIN (`/los-angeles-men-main`), LIFESTYLE (`/los-angeles-men-lifestyle`), TALENT (`/los-angeles-men-talent`), Q TOO (`/los-angeles-Q-too`)
  - Los Angeles — Women: MAIN (`/los-angeles-women-main`), LIFESTYLE (`/los-angeles-women-lifestyle`), TALENT (`/los-angeles-women-talent`), CURVE (`/los-angeles-curve`)
  - "Q Too" is a single board per office (one URL per office, not split by gender) — confirmed **Women incl. Curve** is real (both NY and LA have a Curve board) and **"Q Too" is real** (both NY and LA have a Q Too board). [Evidence #12]
  - **However, none of this division structure is exposed on the join form.** The form's only gender/division-adjacent control is the binary FEMALE/MALE `sex` radio (§3) — there is no way for an applicant to indicate Curve, Q Too, Direct, Development, Lifestyle, or Talent, or which office (NY/LA) they're applying to.
- INFERENCE (not published, therefore not a floor to state as fact): existing roster stat ranges suggest typical bands (e.g., NY Women Main roster runs roughly 5'6"–5'11", dress size mostly 0–2 US; NY Men Main roster runs roughly 6'0"–6'3"), but the agency does not publish these as eligibility requirements anywhere, so we do not treat them as floors.

## 7. Minors & guardians

- **None found.** No age-gate, no date-of-birth field, no minimum-age statement, no parent/guardian consent checkbox, field, or alternate flow anywhere on `/join`, `/about`, `/contact`, or the Privacy Policy content embedded in the site. The only age-related field is the free-text "AGE" input (§3), which accepts any string with no validation and no branching behavior. This is a high-priority gap: Pholio should surface this explicitly as "the agency does not publish any minors/guardian process" rather than assume a default.

## 8. Consent & legal

- Single checkbox at the point of application, verbatim: **"BY CHECKING THIS BOX, I AGREE TO FULLY ACCEPT THE PROCESSING OF MY PERSONAL DATA AS DESCRIBED IN THE PRIVACY POLICY."** (`name="rgcd"`) — OBSERVED: this checkbox has no `required` attribute in the DOM, and the words "PRIVACY POLICY" are plain text, **not a hyperlink** in the form itself (no `<a>` tag wraps it) — an applicant filling the form has no in-context link to the policy. [Evidence #6]
- A Privacy Policy page does exist at `/privacy-policy` (200 OK) and its content is embedded platform-wide in the site's Nuxt payload. Key excerpts, verbatim:
  - "Q MANAGEMENT is committed to respecting your privacy and recognizes your need to protect sensitive and personal information that you share with us."
  - "Q MANAGEMENT will not without explicit permission sell or share data you have provided us with."
  - "Personal information you provide will not be transferred to third parties without your consent. If needed we will provide companies we hire for statistical or analyze purpose (and only for this purpose) with personal information: in this event we will only provide the personal information they need to deliver their service."
  - GDPR section present, citing "European Data Protection (GDPR) n°2016/679 of April 27th, 2016."
  - No data retention period is stated anywhere (no "we keep your data for X").
  - **Template leftover / quality flag**: the Cookies section literally reads "When someone visits **Agency Name** website we may collect standard visitor details..." — an unedited CDS platform template placeholder, never customized with "Q Management." [Evidence #3]
- No separate Terms of Service page found (`/terms` → 404). No SMS-consent language, no model-release/usage-rights language, no scam warning text found anywhere on the site.

## 9. Process facts

- No published response policy found on `/join`, `/about`, or `/contact` (no "we will only contact you if interested," no expected turnaround time, no re-application guidance).
- **Open call — first-party evidence only:**
  - Q's own site embeds an Instagram feed (from account configured as `https://www.instagram.com/qmanagementla/`) inside the `/join` page's Nuxt payload. The **only** occurrence of the phrase "open call" anywhere in Q's first-party site content is a caption on that embedded feed, dated **2019-07-08**, verbatim: *"Open calls are on hold for now. Please email your submissions to la@qmanagementinc.com. . . . **Please note: we are a fragrance free office. Please do not arrive wearing colognes or perfumes. Thank you 🙏🏼 **"* [Evidence #5]
  - This is a **stale, 7-year-old data point**, not current guidance — it says open calls were on hold as of mid-2019 and directs to email instead. The same embedded feed also contains a batch of current 2026 posts (dated up to 2026-08-17) that are all portfolio/campaign features and "NOW REPRESENTING" announcements — **none of the current 2026 posts mention open calls, a schedule, or submission hours.**
  - **Conclusion: Q's own channels do not currently publish any open call day/time/schedule.** No day-of-week, no hours, no "open calls on [day]" text exists anywhere in the live site content we could retrieve.
- **Third-party aggregator claim (NOT first-party — label accordingly):** A directory site, nycfilmnetwork.org ("Q Model Management - Open Call & Submission Information"), states verbatim: *"Submit photos by email, or attend open call every Thursday from 10 to 11 a.m."* and *"No calls or drop-offs."* **This is third-party, unverified, and internally suspicious**: the same third-party page lists addresses — "354 Broadway New York, NY 10013" and "8618 West 3rd Street LOS ANGELES, CA 90048, USA" — that **do not match** Q Management Inc.'s own published addresses (37 W 26th St, New York, NY 10010; 912 N. La Cienega Blvd, Los Angeles, CA 90069 — confirmed both by Q's own /contact page and the NYDOL cert). This mismatch is consistent with the brief's note that this Thursday 10–11am slot "conflicts with another agency's claimed slot" — it may belong to a different or former agency/address and should not be presented to talent as Q Management's current open call. [Evidence #13]
- No deadlines, seasonal windows, or intake pauses are published on Q's own site (the only "on hold" statement is the dated 2019 caption above).

## 10. Contradictions & uncertainties (ranked by how badly they could surprise a talent)

1. **Open call existence/schedule (CONTRADICTION, high severity)** — Third-party directory (nycfilmnetwork.org) claims a live weekly Thursday 10–11am open call with "no calls or drop-offs," but (a) Q's own site publishes no such schedule anywhere currently, (b) the only first-party "open call" statement is a 2019 caption saying open calls were *on hold*, and (c) the third-party page's listed addresses don't match Q's real addresses. A talent should NOT show up to an in-person open call based on this rumor without confirming directly with Q. **Do not surface a Thursday 10–11am open call as fact for Q Management.**
2. **JPG-only vs. accept attribute (CONTRADICTION, medium-high severity)** — Visible instruction says "Submit your photos as JPG files," but the file input's `accept` attribute allows `.jpg, .jpeg, .png, .gif`. A talent uploading a PNG will not be blocked by the browser, but may still be rejected by server-side processing — unknown which behavior actually governs.
3. **3MB size cap not enforced client-side (UNCERTAIN, medium severity)** — Published as "no larger than 3MB," but a 4MB test file was accepted into the slot with no visible warning. Whether the real submit endpoint rejects it server-side is untested (would require submitting, which is prohibited).
4. **No division/office field on the form (UNCERTAIN/OBSERVED, medium severity)** — The site markets many boards (Curve, Q Too, Direct, Development, Lifestyle, Talent) across two offices, but the join form gives applicants zero way to indicate which board or office they're applying to. Talent should not expect their preferred division/office to be considered unless they separately email nyc@ or la@qmanagementinc.com.
5. **No requiredness markers on any field (UNCERTAIN, low-medium severity)** — No field (including the consent checkbox) carries an HTML `required` attribute. True server-side requiredness is unknown and untestable without submitting.
6. **Minors/guardian handling entirely unpublished (gap, high information-value but not a "surprise" trap per se)** — Talent under 18 have no guidance at all; Pholio should flag this rather than infer a process.
7. **Privacy Policy not linked from the consent checkbox (low severity, UX quality issue)** — the checkbox references "the Privacy Policy" as plain text with no hyperlink, though a `/privacy-policy` page does exist independently.
8. **Un-customized platform template text** ("Agency Name" placeholder in the Cookies section) — cosmetic, but signals the privacy policy may not have been agency-reviewed.
9. **Post-submit experience entirely unknown** — could not observe confirmation screen, success message, or redirect, since submitting is prohibited.

## 11. Draft talent-facing brief (150–300 words)

Q Management's application is a single online form at qmanagementinc.com/join — no login, no multi-step wizard, and it covers both the New York and Los Angeles offices with one identical form (there's no way to specify which office or which board — Main, Direct, Development, Curve, Q Too, Lifestyle, Talent — you're hoping for; if that matters to you, email nyc@qmanagementinc.com or la@qmanagementinc.com directly after applying).

Have ready: first and last name, a binary sex selection (female/male only — no third option), a free-text gender field and pronouns if you want to add nuance, age, email, nationality, location, mobile number, Instagram and TikTok links (optional-looking but present), measurements (height, bust, hips, waist, dress size, shoe size — choose cm or inches), hair and eye color, and a short "tell us about yourself" message.

You'll also upload exactly four photos: a Headshot, a Full Length, a Profile, and a 3/4 Length — one file per slot. The site says JPG only, under 3MB each, but the form's actual settings also technically accept PNG and GIF, and our testing showed oversized files aren't blocked in the browser — so play it safe and stick with a JPG under 3MB to avoid any risk of rejection on their end. There's a required Google reCAPTCHA check and a data-processing consent box before you submit.

The agency doesn't publish any age/height/measurement eligibility requirements, and doesn't say anything about how minors or guardians should apply — if you're under 18, we couldn't find any guidance, so consider reaching out directly. Be cautious of any claim about a fixed weekly "open call" (e.g., a rumored Thursday 10–11am slot) — Q's own website doesn't currently publish an open call schedule, and the claim we found elsewhere didn't match Q's real addresses, so don't treat it as confirmed.

## 12. Evidence log

1. **URL:** https://www.qmanagementinc.com/join · **Retrieved:** 2026-08-19T06:37Z (curl, saved as `qm-join-raw.html`) and re-rendered via Playwright 2026-08-19T~06:45Z · **Method:** curl + Playwright · **Evidences:** footer text "POWERED BY CDS MODELS & TALENT SOFTWARE MANAGEMENT - REG# 26-6771P-LSFW" present on every page.
2. **URL:** https://www.qmanagementinc.com/contact · **Retrieved:** 2026-08-19T~06:46Z · **Method:** Playwright (`page.evaluate(() => document.body.innerText)`) · **Evidences:** verbatim NY/LA addresses, phone numbers, emails.
3. **URL:** https://www.qmanagementinc.com/join (embedded Privacy Policy content in Nuxt payload) · **Retrieved:** 2026-08-19T06:37Z · **Method:** curl + inspection of `__NUXT_DATA__` JSON · **Evidences:** "Agency Name" template placeholder text, full Privacy Policy body.
4. **URL:** https://www.qmanagementinc.com/about · **Retrieved:** 2026-08-19T~06:46Z · **Method:** Playwright innerText dump · **Evidences:** "With thriving offices in New York and Los Angeles..." company history text.
5. **URL:** https://www.qmanagementinc.com/join (embedded Instagram feed data in Nuxt payload, account `qmanagementla`) · **Retrieved:** 2026-08-19T06:37Z · **Method:** curl + regex extraction of `date`/`caption` pairs from `__NUXT_DATA__` · **Evidences:** 2019-07-08 caption "Open calls are on hold for now. Please email your submissions to la@qmanagementinc.com..."; 2026-dated captions (up to 2026-08-17) containing no open-call mentions.
6. **URL:** https://www.qmanagementinc.com/join · **Retrieved:** 2026-08-19T~06:40Z · **Method:** Playwright, `dumpForms()` helper (full DOM control dump) · **Evidences:** complete field list, `accept=".jpg, .jpeg, .png, .gif"` on all 4 file inputs, absence of `required`/`maxlength`/`pattern` on any control, presence of hidden `g-recaptcha-response` textarea, visible instruction text "Submit your photos as JPG files, no larger than 3MB in size."
7. **URL:** https://www.qmanagementinc.com/join · **Retrieved:** 2026-08-19T~06:41Z · **Method:** Playwright, link enumeration (`document.querySelectorAll('a')`) · **Evidences:** "NEW YORK"/"LOS ANGELES" nav pills both `href="/"`; full division nav link list (Main/Direct/Development/Q Too for Men, Main/Direct/Development/Curve for Women, NY; Main/Lifestyle/Talent/Q Too and Main/Lifestyle/Talent/Curve, LA).
8. **URL:** https://www.qmanagementinc.com/join (raw HTML) · **Retrieved:** 2026-08-19T06:37Z · **Method:** curl + grep · **Evidences:** string `recaptchaSiteKey` present in bundled config; no visible sitekey/widget markup, consistent with invisible/v3 reCAPTCHA.
9. **URL:** https://www.qmanagementinc.com/join · **Retrieved:** 2026-08-19T~06:48Z · **Method:** Playwright, `setInputFiles()` with a locally-generated 4MB dummy file and a `.txt` file, monitored via `page.on('request')` · **Evidences:** no POST fired, no visible client-side validation error for oversized or wrong-type file selection.
10. **URL:** https://www.qmanagementinc.com/join · **Retrieved:** 2026-08-19T~06:49Z · **Method:** Playwright, toggling `#sex-option-male`/`#sex-option-female` and `#measureunit` select, diffing `document.body.innerText` before/after · **Evidences:** identical 48-line field/label set regardless of sex selection; no unit hint text change on CM/INCH toggle.
11. **URLs:** https://www.qmanagementinc.com/new-york-women-curve, /new-york-Q-too, /los-angeles-Q-too, /los-angeles-curve, /new-york-women-main, /new-york-men-main · **Retrieved:** 2026-08-19T~06:47Z · **Method:** Playwright innerText dump of each · **Evidences:** pages contain only roster model stat-cards, no eligibility prose.
12. Same as #7/#11 · **Evidences:** confirms one "Q Too" URL per office (not gender-split) and one "Curve" URL per office (Women-side only), i.e., Women incl. Curve and Q Too are both real published boards, but neither is exposed as a form field.
13. **URL:** https://nycfilmnetwork.org/whoswho/q-model-management/ · **Retrieved:** 2026-08-19T~06:53Z · **Method:** WebSearch + WebFetch (third-party, NOT first-party) · **Evidences:** verbatim "Submit photos by email, or attend open call every Thursday from 10 to 11 a.m." and "No calls or drop-offs"; addresses "354 Broadway New York, NY 10013" and "8618 West 3rd Street LOS ANGELES, CA 90048, USA" which do not match Q Management Inc.'s own published addresses (cf. Evidence #2 and the NYDOL cert address 37 W 26th St).
14. **URL:** https://www.qmanagementinc.com/robots.txt · **Retrieved:** 2026-08-19T06:36Z · **Method:** curl · **Evidences:** 404 Not Found — no robots.txt exists, no crawl restrictions to respect on this host.
