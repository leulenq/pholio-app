# CURV Management — Agency Entry

**Lead adjudication notes (2026-08-19):**
- Cross-agency platform note: CURV's site and form run on "CDS Models & Talent Management
  Software" — the same vendor that powers Muse NYC's site (Muse's footer and page meta both
  name cDs). First live confirmation in this rebuild of the per-platform (rather than
  per-agency) verification thesis: these two entries can share one platform checker.
- The misdirected Contact-page "Submissions page" link (points to jagmodels.com/submissions —
  a different agency) is adjudicated OBSERVED/FACT with the anchor HTML captured, and is the
  single strongest argument in this dataset for Pholio's verified-official-link feature.
- The minor-consent finding (advisory sentence, zero structural enforcement, tested directly
  with minor vs adult birthdates producing byte-identical forms) is a primary FINDINGS.md item.
- Everything below is the lane's primary-evidence research, integrated verbatim.

---

# CURV Management — Spec Registry Research (slug: `curv`)

Research date: 2026-08-19 (all retrievals UTC, see Evidence Log for exact timestamps).

## 1. Identity & channels

- **Legal/trade name on site**: "THE CURV MANAGEMENT" (site title tag: "CURV MANAGEMENT NYC"). — FACT [E1]
- **NYDOL registry name**: "CURV Model Mangement" [sic — registry's own typo of "Management"], cert **26-69SRC-LSFW**, issued 2026-08-07, status Active, address 99 Madison Ave. — given in assignment brief (treated as FACT, not independently re-verified by this lane per brief scope).
- **Registration number shown on-site**: "REG # 26-69SRC-LSFW" on the About page, and "Reg # 26-69SRC-LSFW" on the Contact page — matches the NYDOL cert number given in the brief. — FACT [E4][E5]
- **Physical address (site)**: 99 Madison Ave, New York, NY 10016 — matches NYDOL address. — FACT [E5]
- **Phone**: 917.242.6681 — FACT [E5]
- **Email**: info@curvmgmt.com — FACT [E5]
- **Domains — CONFUSABILITY, verified**:
  - `https://thecurvmanagement.com` — the live, canonical site (HTTP 200, Nuxt/JS SPA, all content served here). — OBSERVED [E1]
  - `https://curvmanagement.com` — resolves with an HTTP 301 redirect **to `https://thecurvmanagement.com/`**. Same operator, not a lookalike/scam domain — it is an alias the agency itself owns and redirects. — OBSERVED [E2]
  - `https://curvmgmt.com` — also 301-redirects to `https://thecurvmanagement.com/`, and is the domain used for the published email address (`info@curvmgmt.com`). Same operator. — OBSERVED [E3]
  - **Verdict**: all three domains are one operator (redirects confirmed via curl `-L` and header inspection); `thecurvmanagement.com` is canonical/where the SPA actually renders. A talent typing `curvmanagement.com` from memory lands safely on the same agency, but should still be told the canonical URL to avoid confusion with any *other* unrelated party that might someday use a similar name.
- **robots.txt**: `https://thecurvmanagement.com/robots.txt` returns a JSON 404 body (`"Page Not Found"`) — no robots.txt exists (SPA fallback, not a real disallow list). Nothing to respect/restrict. — OBSERVED [E1]
- **Application channels found**:
  1. **Canonical for a NYC applicant**: the on-site form at `/submissions` (Nuxt SPA form posting via a third-party talent-management platform — see Flow map). This is the only Curv-branded intake channel.
  2. **Email**: info@curvmgmt.com — published only "for bookings or questions," not framed as an alternate submission channel. — FACT [E5]
  3. **Broken/misdirected "Submissions page" link**: the Contact page's own body copy contains the sentence *"For submissions, please visit our Submissions page."* — but the hyperlink on "Submissions page" points to **`https://jagmodels.com/submissions/`**, the submissions page of **JAG Models**, a completely unrelated, independently-branded NYC talent agency (confirmed distinct: `<title>JAG Models - Model & Talent Agency</title>`, HTTP 200 live site). This is almost certainly a leftover/uncustomized link from a shared agency-website template, but as published it actively misdirects a talent looking for Curv's application form. — OBSERVED/FACT [E6][E7] — **flagged in Contradictions (§10) as the single biggest trap.**
  4. No open-call/walk-in schedule, no third-party casting-platform (e.g. Model Mayhem, Instagram DM-only) channel is published anywhere on the site.
- **Powered-by / platform**: every page footer states "POWERED BY CDS MODELS & TALENT MANAGEMENT SOFTWARE," linking to `https://www.cdsglobal.com/` — the site (including the submissions form and roster boards) runs on a third-party agency-management SaaS (CDS), not custom code. Roster images are served from an AWS S3 bucket under a CDS account (`cds-ob-619779309805-private-bucket`). — OBSERVED [E1][E4]
- **Markets/offices**: only one office found — New York (99 Madison Ave). No other city/market pages exist in the nav. — OBSERVED [E1]
- **Divisions/boards found in nav**: MAIN, DEVELOPMENT, MEN (external, routes to Villains Management), COLLECTIV (full roster incl. Women/Families/Campaigns filters), SUBMISSIONS, ABOUT, CONTACT. — OBSERVED [E1]

## 2. Flow map

Entry point: `https://thecurvmanagement.com/submissions` (per assignment). Confirmed HTTP 200, is a client-rendered Nuxt SPA — required Playwright (`networkidle` wait) to see any content; a plain HTTP GET returns only an empty shell (`<div id="__nuxt">` + JS bundle refs, no visible content). — OBSERVED [E1]

Flow is **single-page, single-step**, no login/account gate, no multi-page wizard:

1. Land on `/submissions`. Page renders instructions, then one long form (Personal → Stats → Photo Upload → Submit) with no intermediate steps, no "next" buttons, no page breaks.
2. All fields — personal info, physical stats, photo uploads — are on this one form; there is no separate "confirm your details" screen.
3. Below the four photo-upload slots is a single **SUBMIT** button.
4. A hidden `g-recaptcha-response` textarea and Google reCAPTCHA scripts (`recaptcha__en.js`, `recaptcha/api.js?render=explicit`) are loaded, confirming a **Google reCAPTCHA challenge gates the actual submission** — this lane did not click Submit (per hard prohibition) so the exact recaptcha UX (invisible v3 vs. checkbox v2) at submit time was **not observed**; only its presence in the DOM/script list is confirmed. — OBSERVED [E8]
5. **Where observation had to stop**: the Submit button itself. No form field, dropdown, or conditional trigger was found that unlocks additional steps before that button — this appears to be a true one-shot form, but the post-submit experience (confirmation page/message, redirect, email) is **unobserved** because reaching it requires actually submitting. This is the hard stop mandated by the brief.
6. A cookie-consent banner ("We use cookies… ACCEPT / DECLINE") appears on every page load; it is unrelated to the application form itself and does not gate access to the form (form is visible/fillable regardless of banner state, since Playwright never interacted with it and the form still rendered fully). — OBSERVED [E1]
7. No CAPTCHA/consent gate exists **before** the form is reached — the whole form is visible on load with no age-gate or "are you 18?" interstitial. — OBSERVED [E9]

## 3. Field inventory

All fields, in DOM order, from `dumpForms()` + manual `page.evaluate()` on `/submissions`. **Important requiredness caveat**: no field in the raw HTML carries an actual `required` attribute (verified — none appeared in the attribute dump for any input/select in this form). "Required" is signaled **only** by a trailing `*` baked into the visible placeholder/label text. Treat asterisked fields as "agency says required," not as "browser-enforced required" — enforcement (if any) would happen in JS at submit time, which was not observed since the form was never submitted. — OBSERVED [E9]

**Personal**
| Field | Type | Label/placeholder (verbatim) | Required marker | Options |
|---|---|---|---|---|
| sex | radio group, name="sex" | "She \| Her" / "He \| Him" / "They \| Them" / "Other" | none observed | — |
| firstname | text | "Firstname *" | asterisk | — |
| lastname | text | "Lastname *" | asterisk | — |
| email | input type=email | "Email *" | asterisk | — |
| phone | text | "Contact Number *" | asterisk | — |
| address | text | "Address" | none | — |
| city | text | "City" | none | — |
| country | text | "Country" | none | — |
| nationality | text | "Nationality" | none | — |
| ethnicity | select | placeholder option "Ethnicity" | none | Ethnicity, Black, White, Multi-ethnic, Asian, East Asian, Latino, Indian, Arabic, Japanese, Half Japanese, Maori, Pacific Islander, Mediterranean, Oriental (verbatim list, incl. the duplicated first "Ethnicity" placeholder entry as literally rendered) |
| birthday | input type=date | placeholder "Date Of Birth" | none | no min/max attribute present — no client-side date range restriction observed |
| instagram | input **type=url** | "Instragram" [sic — agency's own typo] | none | — (being `type=url`, browser HTML5 validation would expect a full URL, not a bare @handle — not verified beyond attribute since submit was not tested) |
| tiktok | input type=url | "TikTok" | none | — |

**Stats** (all `<select>` dropdowns; every dropdown has "duplicated" first two options equal to its own label, e.g. Height/Height, Bust/Bust — OBSERVED verbatim, not summarized away)
| Field | Options (verbatim range) |
|---|---|
| height | Imperial feet'inches in 0.5" steps, from **1'0** to **6'11** (full granular list; e.g. "5'8", "5'8.5" … ). No metric option offered. |
| bust | Numeric inches, 0.5" steps, **10.5 to 39** |
| hips | Numeric inches, 0.5" steps, **15.5 to 44** |
| waist | Numeric inches, 0.5" steps, **14 to 42.5** |
| dresssize | US dress sizes AND size-range values interleaved exactly as listed: **0, 0-2, 1, 2, 2-4, 3, 4, 4-6, 5, 6, 6-8, 7, 8, 8-10, 9, 10, 10-12, 11, 12, 12-14, 13, 14, 14-16, 15, 16, 16-18, 17, 18, 18-20, 19, 20, 20-22, 21, 22, 22-24, 23, 24, 24-26, 25, 26** |
| shoesize | US, 0.5 steps, **2 to 14**. Note: the placeholder/first option text is literally **"Shoe Zize"** [sic — typo in the agency's own dropdown], the second (actual blank) option reads "Shoe Size" correctly. |
| clothingtop | **XXS, XS, S, M, L, XL, XXL, XXXL, XXXXXL** |
| clothingbottom | **XXS, XS, S, M, L, XL, XXL, XXXL, XXXXXL** |
| haircolor | Blonde, Strawberry Blonde, Dark Blonde, Light Brown, Brown, Dark Brown, Brunette, Red, Black, **"Salt and Peppe"** [sic — truncated typo for "Salt and Pepper"], Grey, Bald, Auburn Red, Venetian Red, Chestnut, Grey-Black, Light Blonde, Light Red, Blonde Venetian, Brown Venetian, Dark Black, Hazel, Platinum Blonde, White, Dark Red, Blue, Auburn, Dirty Blonde, Ash Blonde, Silver, Strawberry, Ash, Pink |
| eyecolor | Amber, Black, Blue, Blue/Green, Blue/Grey, Brown, Green, Green/Brown, Green/Grey, Grey, Hazel, Light Brown |
| message (textarea) | placeholder "Mention anything else you would like us to know" — no maxlength attribute observed |

Units: **imperial only** for height (feet/inches) and inches for bust/waist/hips; **US-only** sizing for dress and shoe. No metric/cm option anywhere in the form. — OBSERVED

## 4. Uploads

- Four file inputs, names `medias_1..medias_4`, each: `accept=".jpg, .jpeg, .png, .gif"` (verbatim attribute string), **no `multiple` attribute** (one file per slot), **no `maxlength`/size-limit attribute of any kind** on any file input. — OBSERVED [E9]
- Slot labels (verbatim, including inconsistent spacing/asterisk placement as literally rendered):
  - "photo 1*" — UPLOAD button
  - "photo 2*" — UPLOAD button
  - "photo 3 *" — UPLOAD button (note the stray space before the asterisk here vs. the other two — verbatim)
  - "photo 4" — UPLOAD button (**no asterisk — the only optional slot of the four**)
- **File size/limit verification (per task brief)**: searched (a) the full rendered DOM/attributes, (b) all 16 loaded `_nuxt/*.js` bundles (including the 608KB main bundle) for any size-limit strings (`maxsize`, `MB`, `file size`, `megabyte`, etc.) — **no client-side file-size or dimension limit was found anywhere**, published or in code. This matches the "none stated in an earlier pass" flag in the assignment — confirmed still true. A server-side limit may still exist (CDS's backend) but is unverifiable without submitting, which is prohibited. — OBSERVED, absence confirmed by search, not proof of no limit.
- No video upload field exists at all — the form has zero video inputs and zero published video requirements (duration/format/size). — OBSERVED, "none found."
- No dimension/aspect-ratio/orientation guidance published (e.g. no "portrait orientation," no "min 1000px" text found anywhere on the page). — "none found."

## 5. Photo/shot instructions

Verbatim, from the top of the `/submissions` page (all-caps as published):

> "TELL US ABOUT YOURSELF!
>
> IF YOU ARE INTERESTED IN MODELING AND THINK YOU HAVE WHAT IT TAKES TO JOIN IN THE CURV MANAGEMENT.
> PLEASE SUBMIT BELOW - IMAGES WITHOUT MAKEUP AND AS NATURAL AS POSSIBLE.
>
> NO FILTERED IMAGES. FORM FITTING CLOTHING IS PREFERRED, FOR EXAMPLE FITTED TANK AND SKINNY JEANS.
> PLEASE PULL LONG HAIR INTO A PONYTAIL FOR PROFILE IMAGES."

Broken down:
- **Makeup**: images should be "WITHOUT MAKEUP" — FACT
- **Filters/retouching**: "NO FILTERED IMAGES" — FACT
- **Clothing**: "FORM FITTING CLOTHING IS PREFERRED, FOR EXAMPLE FITTED TANK AND SKINNY JEANS" — this is phrased as a preference ("preferred"/"for example") — PREFERENCE
- **Hair**: "PLEASE PULL LONG HAIR INTO A PONYTAIL FOR PROFILE IMAGES" — FACT (applies specifically to "profile images," implying at least one of the 3-4 photo slots is expected to be a profile/headshot shot, though the slots themselves are only labeled generically "photo 1/2/3/4" with no per-slot instruction, e.g. no slot explicitly labeled "profile" or "full body"). — OBSERVED gap: the instructions reference "profile images" (plural) but the upload widget gives no per-photo-slot guidance distinguishing which slot is which shot type.
- No lighting, background, expression, or general-retouching-beyond-filters guidance is published. — "none found" for those specific sub-topics.

## 6. Eligibility

- **Age**: no numeric minimum age is published anywhere (no "must be 18+" or "16+" statement). The only age-related text is the parental-consent clause for under-18s (see §7) — which by implication means under-18 applicants ARE accepted (with parent/guardian permission), not excluded. — FACT/INFERENCE (inference: presence of a minor-consent clause, with no stated age floor, implies minors are eligible to apply subject to guardian permission; the agency never states a hard minimum like "16+").
- **Gender/division scoping**: the on-site `/submissions` form itself is **not gender-restricted** — it has a "sex" radio field with She/Her, He/Him, They/Them, Other, meaning the form technically accepts any gender identity. However, the site's **top-level navigation structurally routes men elsewhere**: the "MEN" nav item is an external link (target=`_blank`, rel=`noopener noreferrer`) straight to `https://www.villainsmanagement.com/`, a distinct men's-division agency site — see §… (Sister brands) below. So in practice: the *Curv-branded* submission funnel is positioned for women (roster boards are "Women"/"Families"/"Campaigns" only — no "Men" filter tab exists on Curv's own Collectiv roster), even though the raw form doesn't block a male applicant from filling it in. — OBSERVED [E1][E10][E12]
- **Size/measurement scoping**: no explicit *eligibility* size range is published as a rule (no "must wear a size X to Y to apply"). What exists instead is **descriptive**, drawn from the live rosters (task-c answer, concretely):
  - MAIN and DEVELOPMENT boards are filterable by dress-size band, with tabs reading exactly: **"0-4"**, **"6-10"**, **"12-16"**, **"18-20+"** — FACT (verbatim tab labels), observed on both `/newyork_main` and `/newyork_development`. — [E10][E11]
  - The full Collectiv roster (all divisions) shows individually-published model stat cards with DRESS sizes ranging from **2 us** to **23 us** across the roster as currently published (e.g., Angelica Rodriguez "DRESS 2 us" up to entries at "DRESS 22 us"/"23 us"). — OBSERVED, roster data, not a stated policy.
  - The submissions-form dress-size **dropdown itself** offers values from **0 up to 26** (see §3), which is the widest concrete signal of what size range the agency is willing to *intake* via the form, even though it's not phrased as an eligibility rule.
  - The About page's only positioning language: *"WE FOCUS ON REMOVING BARRIERS AROUND SIZE, AGE, AND RACE—ENSURING TALENT IS RECOGNIZED FOR THEIR INDIVIDUALITY AND UNIQUE CONTRIBUTIONS."* and tagline **"#AHEADOFTHECURV"** — FACT, verbatim [E4]. This is the closest thing to an explicit "what curve means to us" statement, and it is not expressed in numeric terms — it is presented as an anti-barrier/inclusion philosophy, not a plus-size-only mandate. **Notably, the roster includes sizes as small as US 2**, so "curve" as practiced is a broad-size positioning, not exclusively plus-size — this is an important expectation-setting nuance for a talent using Pholio.
- **Location/market restriction**: none published; form has free-text Address/City/Country/Nationality fields with no jurisdiction gate, and no statement restricting applicants to NYC/US residents.

## 7. Minors & guardians (priority section)

**Everything found, verbatim and complete — this is the single published statement on minors, and this lane actively tested whether the form behaves any differently for a minor.**

- **Verbatim consent text**, shown once, near the top of the `/submissions` form, immediately under the shoot instructions and before any form fields:

  > "*ANY TALENT UNDER THE AGE OF 18 MUST HAVE PERMISSION FROM A PARENT OR LEGAL GUARDIAN."

  (The leading `*` is part of the copy itself, functioning as a footnote-style marker rather than a required-field asterisk.) — FACT [E9]

- **Age-field behavior tested directly** (OBSERVED, via Playwright, no submission attempted):
  - The only age-related input is a single `<input type="date" name="birthday">` with **no `min`/`max` attribute** — i.e., no client-side date-range gate blocking a minor's birthdate from being entered.
  - This lane filled the birthday field with **2015-01-01** (≈11 years old as of the 2026 retrieval date) and re-dumped the entire form: **field count was unchanged (37 controls before and after)**, and a full-page `innerText` diff showed **byte-for-byte identical page content** before and after entering a clearly-minor birthdate. No new field appeared (no guardian name field, no guardian email field, no guardian signature/upload, no separate consent checkbox). — OBSERVED [E9]
  - This lane then changed the birthday to an adult date (**1995-01-01**) and re-checked: again, no observable change to the form.
  - **Conclusion**: the "parental/guardian permission" requirement is stated **only as advisory text**, with **zero structural enforcement** in the form itself — no age gate, no conditional guardian fields, no guardian consent checkbox, no separate minor flow. A minor (or anyone) could fill out and technically attempt to submit the exact same form as an adult; the site provides no mechanism to capture guardian name, guardian contact info, or guardian e-signature/consent at the point of application. — OBSERVED, high-confidence finding given the direct before/after test.
- **No separate minor/guardian consent checkbox exists anywhere on the page** — this lane explicitly searched for `input[type=checkbox]` and `[role=checkbox]` anywhere in the DOM: **zero results**. There is no checkbox of any kind on the entire submissions form (not for minors, not for general terms-of-service). — OBSERVED [E9]
- **Family representation context** (relevant background, not part of the application flow): the Collectiv roster has a "Families" filter tab listing units like "ALEXA MEY & FAMILY," "MONTANYA PIERRE & FAMILY," etc. — confirming the agency does represent minors as part of family-booking talent, which makes the complete absence of a structural guardian-consent mechanism on the intake form more notable, not less. — OBSERVED [E12]
- **If nothing is published beyond the one sentence, that is itself the finding** — per brief instruction: confirmed, nothing further is published. No separate minor policy page, no age-verification step, no linked guardian-consent PDF/e-form.

## 8. Consent & legal

- **No checkbox of any kind on the submissions form** (see §7) — no explicit "I agree to the Terms" or "I consent to my images being used" tickbox at the point of application. The only "consent"-adjacent element is the cookie banner (site-wide, not submission-specific): *"We use cookies on our website to give you a better experience, improve performance and for analytics. By using this website you agree to the use of cookies. Find out more in our privacy notice"* with ACCEPT/DECLINE buttons. — FACT [E1]
- **Privacy Policy** (`/privacy-policy`), first sentence + key retention/usage-rights excerpts, verbatim:
  > "THE CURV MANAGEMENT is committed to respecting your privacy and recognizes your need to protect sensitive and personal information that you share with us." … "THE CURV MANAGEMENT will not without explicit permission sell or share data you have provided us with." … "Personal information you provide will not be transferred to third parties without your consent." — FACT [E13]
  - **Notable quality flag**: the Cookies section of this same policy contains an un-replaced template placeholder: *"When someone visits **Agency Name** website we may collect standard visitor details…"* — literally the string "Agency Name," never swapped for "THE CURV MANAGEMENT." This confirms the privacy policy is a generic, largely uncustomized CDS/template document, not bespoke legal copy — worth flagging as a trust signal for a talent (the same sloppiness pattern as the "Shoe Zize" and "Instragram" typos and the misdirected JAG Models submissions link). — OBSERVED [E13]
  - A GDPR-compliance section is present, referencing "EU Data Protection (GDPR) n°2016/679" boilerplate — standard template language, not NY/US-specific.
- **No scam warning, no "we never ask for payment" statement, no data-retention duration (no "we keep your data for X months/years")** is published anywhere on the site. — "none found."
- **reCAPTCHA**: Google reCAPTCHA scripts load on the submissions page (see §2); by using the site the applicant is implicitly subject to Google's own reCAPTCHA terms, though the page itself states nothing about this.

## 9. Process facts

- **Response policy**: **none published.** No "we only contact you if interested," no "we respond within X business days," no auto-confirmation text described anywhere on the site (About, Contact, Submissions, Privacy Policy all searched). — "none found," which is itself notable: a talent has no published expectation-setting for what happens after clicking submit.
- **Timelines/deadlines/open-call windows**: none published — no seasonal windows, no open-call days/hours, no application deadlines anywhere on the site.
- **Re-application guidance**: none published (no "wait X months before reapplying" text).
- **Post-submission flow**: unobserved (see §2) — reaching a confirmation state requires actually submitting, which is prohibited by the brief's hard rules.
- **Contact for non-submission questions**: "For bookings or questions, send us an email at info@curvmgmt.com" — FACT [E5]. This is explicitly scoped to "bookings or questions," not stated as an application channel.

## 10. Contradictions & uncertainties (ranked by how badly they could surprise a talent)

1. **[HIGH] Misdirected "Submissions page" link on the Contact page.** The Contact page's own body text says *"For submissions, please visit our Submissions page"* but the hyperlink goes to `https://jagmodels.com/submissions/` — a different, unrelated, independently-branded agency (JAG Models), not Curv's own `/submissions` page. A talent who lands on Contact first (rather than being sent directly to `/submissions`) and clicks that link will end up applying to the wrong agency entirely. Both URLs verified live and distinct via curl (`jagmodels.com` returns `<title>JAG Models - Model & Talent Agency</title>`, HTTP 200). CONTRADICTION between the page's own stated intent ("our Submissions page") and its actual `href`. — [E6][E7]
2. **[HIGH] Guardian/minor consent is advisory text only, with zero structural enforcement**, despite the agency representing minors via family bookings (Families roster tab). See full detail in §7. A minor applicant (or an adult filling in a minor's info) faces no form-level gate, no guardian-info capture, and no separate consent checkbox — meaning Pholio talent should be told plainly that "permission from a parent/guardian" is a stated expectation the agency trusts the applicant to self-police, not something the form itself will collect or verify.
3. **[MEDIUM] "Required" fields are marked only by a `*` in placeholder text, not by any HTML `required` attribute or other DOM-verifiable enforcement.** Actual submit-time validation behavior (does the SPA block submission client-side if Firstname is blank? does CDS's backend reject it?) is **unverified**, since testing it requires clicking Submit — prohibited. UNCERTAIN: treat all asterisked fields as agency-stated-required, but the strictness of enforcement is unknown.
4. **[MEDIUM] No published file-size/dimension limit for the 4 photo uploads,** confirmed absent from both DOM attributes and all loaded JS bundles — but a server-side limit enforced only at actual upload time cannot be ruled out. UNCERTAIN.
5. **[LOW-MEDIUM] Domain confusability**: `curvmanagement.com` and `curvmgmt.com` both redirect to the canonical `thecurvmanagement.com` and are owned by the same operator — not a scam risk as initially flagged for verification, but worth telling talent the canonical URL anyway since three near-identical domains exist in the wild for one agency (easy to bookmark the wrong one if a redirect config ever changes).
6. **[LOW] No response-policy / timeline text published at all** — talent should be told plainly the agency does not say how or when (or whether) they'll hear back.
7. **[LOW] Template sloppiness pattern** (multiple independent typos: "CURV Model Mangement" in the NYDOL registry itself, "Instragram," "Shoe Zize," "Salt and Peppe," plus the un-replaced "Agency Name" placeholder in the Privacy Policy, plus the misdirected JAG Models link) — individually cosmetic, but collectively suggest the site/form has not been carefully proofread since being stood up on the CDS platform (registration issued 2026-08-07, very fresh per the brief). Not a hard "trap" but useful context for confidence-setting.
8. **[LOW] Gender scoping is soft, not hard**: the on-site form accepts any "sex" radio value and is not code-gated against male applicants, even though the top nav actively routes "MEN" off-site to Villains Management and Curv's own rosters show only Women/Families/Campaigns. A non-binary or male applicant *could* technically fill in Curv's own form, but the agency's structural signal is that men belong at the sister site instead.

## 11. Draft talent-facing brief (for Pholio's Market view)

CURV Management (NYC, 99 Madison Ave) accepts applications through one online form at thecurvmanagement.com/submissions — no account, no login, no CAPTCHA-before-you-start (though a Google reCAPTCHA challenge appears near the Submit button). Have ready: your legal first/last name, email, phone, and full body stats in US/imperial units only — height (feet/inches), bust/waist/hips (inches), dress size (US), shoe size (US), plus hair and eye color from their dropdown lists. There's also an optional Instagram/TikTok field (enter a full profile URL, not just your handle) and a free-text box for anything else you want them to know.

Photos: you need **3 required photos plus 1 optional** (4 upload slots total, only the first three are marked required). Accepted formats: JPG, JPEG, PNG, or GIF — no stated size or resolution limit was found, but keep files reasonably sized to be safe, since none is published. Go makeup-free, as natural as possible, no filters. Form-fitting clothing (like a fitted tank and skinny jeans) is preferred but not mandatory. If you're shooting a profile/headshot-style image, pull long hair into a ponytail.

If you're under 18, the agency requires "permission from a parent or legal guardian" — but be aware the form itself does not actually collect any guardian information or have a separate consent checkbox; it's an honor-system requirement, so make sure a parent/guardian has actually reviewed and approved the submission before you send it.

Two traps to know about: (1) if you browse to the Contact page first, its "Submissions page" link is misdirected to a completely different agency's site (JAG Models) — always go straight to thecurvmanagement.com/submissions instead. (2) The agency does not publish any response-timeline or "we'll only contact you if interested" policy — there's simply no stated expectation for what happens after you submit, so don't wait on a guaranteed reply.

The site accepts a wide size range in practice — published roster filters run from dress sizes 0-4 up through 18-20+, and the dropdown itself goes up to size 26 — despite the "curve" name, this isn't exclusively plus-size. If you're a male applicant, note the "MEN" navigation link routes to their sister brand, Villains Management, on a separate site.

## 12. Evidence log

1. **[E1]** `https://thecurvmanagement.com/submissions` and `https://thecurvmanagement.com/` — retrieved via Playwright (headless Chromium, `networkidle`), 2026-08-19 ~06:47–06:52 UTC. Evidences: full form field inventory, photo/shot instructions text, cookie banner text, nav structure, robots.txt 404 (via curl, same timestamp window), "POWERED BY CDS MODELS & TALENT MANAGEMENT SOFTWARE" footer, home page News/campaign list. Quote: see §5 photo instructions block.
2. **[E2]** `https://curvmanagement.com/` — curl `-D -` header dump, 2026-08-19 ~06:44 UTC. Evidences: `HTTP/2 301` with `location: https://thecurvmanagement.com/`.
3. **[E3]** `https://curvmgmt.com/` — curl `-L -w`, 2026-08-19 ~06:5x UTC. Evidences: 301 redirect, final URL `https://thecurvmanagement.com/`, HTTP 200.
4. **[E4]** `https://thecurvmanagement.com/about` — Playwright, 2026-08-19 ~06:53 UTC. Evidences: "REG # 26-69SRC-LSFW," "#AHEADOFTHECURV," "WE FOCUS ON REMOVING BARRIERS AROUND SIZE, AGE, AND RACE…" (verbatim quoted in §6).
5. **[E5]** `https://thecurvmanagement.com/contact` — Playwright, 2026-08-19 ~06:53 UTC. Evidences: address "99 MADISON AVE , NEW YORK, NY 10016," phone "917.242.6681," email "info@curvmgmt.com," "Reg # 26-69SRC-LSFW."
6. **[E6]** Same contact-page load — link-context extraction via `page.evaluate` targeting `a[href*="jagmodels"]`, 2026-08-19 ~06:56 UTC. Evidences exact anchor HTML: `<a href="https://jagmodels.com/submissions/">Submissions page</a>` inside paragraph "For submissions, please visit our Submissions page."
7. **[E7]** `https://jagmodels.com/` and `https://jagmodels.com/submissions/` — curl, 2026-08-19 ~06:57 UTC. Evidences: HTTP 200, `<title>JAG Models - Model & Talent Agency</title>` — confirms distinct, unrelated, live agency.
8. **[E8]** `https://thecurvmanagement.com/submissions` script enumeration via `page.evaluate` filtering `script[src]` for recaptcha, 2026-08-19 ~06:49 UTC. Evidences: `https://www.gstatic.com/recaptcha/releases/.../recaptcha__en.js`, `https://www.google.com/recaptcha/api.js?render=explicit`, `window.grecaptcha` defined.
9. **[E9]** `https://thecurvmanagement.com/submissions` — direct DOM interaction test via Playwright: (a) full `dumpForms()` JSON capture (37 controls) including every attribute for each input/select/textarea/button/form; (b) `input[type=checkbox]`/`[role=checkbox]` query (zero results); (c) filled `input[name=birthday]` with `2015-01-01` then `1995-01-01`, re-dumped form + full `innerText` before/after each, both identical (37 controls, unchanged text) — 2026-08-19 ~06:58–07:01 UTC. Evidences: full field inventory (§3), file-input `accept` strings and slot labels (§4), no-consent-checkbox finding (§7,§8), minor-birthday no-op finding (§7).
10. **[E10]** `https://thecurvmanagement.com/newyork_main` — Playwright, 2026-08-19 ~07:03 UTC. Evidences: dress-size filter tabs "0-4," "6-10," "12-16," "18-20+"; individual model stat cards with DRESS/HEIGHT/etc.
11. **[E11]** `https://thecurvmanagement.com/newyork_development` — Playwright, 2026-08-19 ~07:03 UTC. Evidences: same filter-tab structure as newyork_main.
12. **[E12]** `https://thecurvmanagement.com/collectiv` — Playwright, including simulated click on the "Families" tab, 2026-08-19 ~07:05 UTC. Evidences: full model roster with DRESS sizes 2 us–23 us across entries; "Families" tab listing "ALEXA MEY & FAMILY," "BRITTANY WIN & FAMILY," "ELENI FAMILY," "MADELEINE FALL & FAMILY," "MONTANYA PIERRE & FAMILY," "NICOLE MAHANY & FAMILY."
13. **[E13]** `https://thecurvmanagement.com/privacy-policy` — Playwright, 2026-08-19 ~07:06 UTC. Evidences: full privacy-policy body text quoted in §8, including the "Agency Name" un-replaced placeholder and GDPR section.
14. **[E14]** Nav "MEN" link attribute extraction via `page.evaluate` on contact page, 2026-08-19 ~06:56 UTC. Evidences: `href="https://www.villainsmanagement.com/"`, `target="_blank"`, `rel="noopener noreferrer"`.
15. **[E15]** `https://www.villainsmanagement.com/` — curl, 2026-08-19 ~07:07 UTC. Evidences: HTTP 200, `<title>Villains Management — New York</title>` — confirms distinct, live sister-brand site (men's division); not deep-researched further, out of this lane's scope (Villains Management is presumably its own registry entry).
16. **[E16]** JS-bundle grep for file-size-limit strings across all 16 `_nuxt/*.js` files fetched via curl (largest: 608,429 bytes), 2026-08-19 ~06:46 UTC. Evidences: no genuine match for maxsize/file-size/megabyte constants (only false-positive substring hits inside unrelated words like "Amber," CSS classes like "mb-4," and internal function names like "Mb()").
