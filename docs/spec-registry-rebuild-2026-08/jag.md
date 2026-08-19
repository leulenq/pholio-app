# JAG Models — Agency Entry

**Lead adjudication notes (2026-08-19):**
- The lane correctly falsified a premise carried in from earlier internal research: "women of
  all sizes" is NOT JAG's published positioning (zero matches sitewide). The published language
  is broader ("removing barriers around size, weight, gender, and race") and the form is open
  to all genders. SELECTION.md has been corrected accordingly.
- The 64MB per-file cap is adjudicated as INFERENCE→platform default (identical round binary
  value on all slots, no creative rationale) — the registry must represent "platform accepts up
  to 64MB", never "JAG wants 64MB files".
- Everything below is the lane's primary-evidence research, integrated verbatim.

---

# JAG Models — Spec Registry Research (slug: `jag`)

Retrieved 2026-08-19 (UTC timestamps noted per source in §12). All primary evidence is from
jagmodels.com (WordPress + Gravity Forms). No form was submitted; no account created; no data
transmitted. One out-of-band network call was observed (browser error-monitoring beacon to
Sentry, not a form submission — see §2).

## 1. Identity & channels

- Legal entity (per assignment prompt, not independently re-verified this session): JAG Models
  Inc. NYDOL cert **26-66BCS-LSFW**, issued 2026-02-11, status Active.
- Official domain: `jagmodels.com` (WordPress, theme "jag-models", WP core 7.0.2, Gravity Forms
  plugin 2.9.31.1 — FACT, OBSERVED from `wp_sentry` inline JS object and plugin asset paths).
- Offices (FACT, footer of every page, e.g. https://jagmodels.com/submissions/):
  - New York: "416 WEST 13TH STREET, SUITE 205, NEW YORK, NY 10014", phone "+1 646 393 9684",
    email `JAG@JAGMODELS.COM`.
  - Los Angeles: email only, `LA@JAGMODELS.COM` (no LA street address or phone published in the
    footer).
- CONTRADICTION (minor, address/phone drift across pages — see §10):
  - /contact/ page top block lists address "416 W. 13th Street, Suite 205, New York, NY 10014"
    and phone "+1 646 398 9684" (FACT, https://jagmodels.com/contact/).
  - Site-wide footer (same page) lists "416 West 13th Street, SUITE 205, New York, NY 10014" and
    phone "+1 646 393 9684" — last digit of the phone number differs (398 vs 393).
  - /privacy/ page (dated May 13, 2022) lists a third, older address for California Shine-the-
    Light requests: "JAG Models, 160 Varick Street, 3rd Floor, New York, NY 10013 (Attention:
    Legal Counsel)" (FACT, https://jagmodels.com/privacy/).
- Application channels found:
  - **Canonical/only channel for a NYC applicant**: the web form at
    https://jagmodels.com/submissions/ (Gravity Forms form id 1, AJAX/iframe submit to
    `/wp/wp-admin/admin-ajax.php`, `multipart/form-data`). This is the sole self-serve
    application path published on the site.
  - No open-call schedule, no third-party submission platform (e.g. Model Mayhem, Instagram DM
    call-for-submissions), no walk-in policy is published anywhere on the site (checked
    /submissions/, /about/, /contact/, /privacy/, homepage — none found). Absence noted, not
    inferred as permission.
  - Email (`jag@jagmodels.com`) is published only for (a) verifying the identity of someone
    claiming to represent JAG, and (b) bookings/general questions/privacy requests — /contact/
    page explicitly directs submissions traffic back to the form: "For submissions, please visit
    our Submissions page." (FACT, https://jagmodels.com/contact/). Email is NOT offered as an
    alternate application channel.
  - The site also has model-roster pages (`/models/#ny#models`, `/models/#ny#development`,
    `/models/#la#models`, `/models/#la#development`) — these are talent directories, not
    application entry points.

## 2. Flow map

Single-page, single-step flow. No login/account gate, no CAPTCHA observed in the DOM.

1. Entry: https://jagmodels.com/submissions/ (200 OK). A cookie-consent banner (Functional/
   Analytics checkboxes, "ACCEPT ALL"/"ACCEPT") loads on top; it does not block form access.
2. A screen-reader-labeled "Warning" scam-notice block (OBSERVED as a `<div>` with
   `id="dialog1Title"` styled as a popup/dialog) is present in the DOM on this same page — see
   §8 for verbatim text. It renders inline with the page content in our capture; whether it is a
   modal that requires an explicit dismiss on first paint was not conclusively determined (a
   `.popup__btn-close` close button exists in the markup), but it did not block reading or
   interacting with the form fields below it.
3. One form: "Submissions form" (`<form id="gform_1" action="/submissions/#gf_1" method="post"
   enctype="multipart/form-data">`), all fields on one page/one step — no multi-page Gravity
   Forms paging was observed (`gform_source_page_number_1 = 1`, `gform_target_page_number_1 = 0`,
   consistent with a single-page form).
4. Fields in DOM order (see §3), then three required image-upload slots (see §4), then a single
   "SUBMIT" button (`#gform_submit_button_1`).
5. **Observation stop / gate**: what happens after a real submit (confirmation message text,
   redirect, or email autoresponder) could not be observed — Gravity Forms renders its
   confirmation content only after a genuine POST completes, and the hard prohibition on
   submitting forms/transmitting data means this session never triggered that POST. No
   confirmation text is pre-rendered anywhere in the page source (grepped for
   `gform_confirmation`-related strings — only the empty JS scaffolding was found, no literal
   confirmation copy). This is a **gated unknown**, not an absence — see §9/§10.
6. Non-form network activity observed while loading the page: a single POST to
   `https://sentry.studioseptember.nl/api/63/envelope/...` — this is the site's front-end error-
   monitoring beacon (Sentry, `wp_sentry` config visible in page source), unrelated to form
   submission and not applicant data.

## 3. Field inventory

Source: Gravity Forms field HTML on https://jagmodels.com/submissions/, dumped both via
Playwright DOM evaluation and raw HTML fetch (OBSERVED, both agree). No `required` HTML5
attribute is used anywhere; requiredness is signaled only via `aria-required="true"` plus a
visible "(Required)" span next to the label — treated below as the required-evidence for those
fields.

| # | Verbatim label | `name` | type | Required evidence | Placeholder | Options | Validation attrs | Notes |
|---|---|---|---|---|---|---|---|---|
| — | *(honeypot, see below)* | `input_20` | text | n/a — not a real field | none | n/a | `autocomplete="new-password"` | **OBSERVED**: this control's DOM label text is literally "LinkedIn", but its container class is `gform_validation_container` and its field description reads verbatim: *"This field is for validation purposes and should be left unchanged."* — i.e., it is Gravity Forms' anti-spam honeypot, cosmetically labeled "LinkedIn" to bait bots. Not a real applicant field; a talent filling this in by hand would not break anything but should be told to ignore/leave blank. |
| 1 | "First name" | `input_1` | text | `aria-required="true"` + "(Required)" | "First name" | — | none observed | |
| 2 | "Last name" | `input_2` | text | `aria-required="true"` + "(Required)" | "Last name" | — | none observed | |
| 3 | "Pronouns" | `input_3` | text | none — present, requiredness unknown (no marker) | "Preferred" | — | none observed | Free text, not a dropdown. |
| 4 | "Date of Birth" | `input_4` | text | none — present, requiredness unknown | "Month/Day/Year" | — | none observed (no `pattern`, no datepicker widget detected in this dump) | US date order only; no explicit min/max age enforced client-side. |
| 5 | "Height" | `input_5` | text | none — present, requiredness unknown | "Feet or Centimeters" | — | none observed | Free text; both imperial and metric explicitly invited by the placeholder — applicant's choice, no forced unit. |
| 6 | "Homebase" | `input_6` | text | none — present, requiredness unknown | "City/Country" | — | none observed | |
| 7 | "E-mail" | `input_7` | email | `aria-required="true"` + "(Required)" | "Your e-mail address" | — | HTML5 `type="email"` only | |
| 8 | "Phone" | `input_8` | tel | `aria-required="true"` + "(Required)" | "Your phone number" | — | none observed beyond `type="tel"` | |
| 9 | "Instagram" | `input_9` | text | none — present, requiredness unknown | "Your handle" | — | none | |
| 10 | "Tik Tok" | `input_10` | text | none — present, requiredness unknown | "Your handle" | — | none | |
| 11 | "YouTube" | `input_11` | text | none — present, requiredness unknown | "Your handle" | — | none | |
| 12 | "Additional Links" | `input_12` | text | none — present, requiredness unknown | "Other Personal Websites/Channels" | — | none | |
| 13 | "What else should we know about you?" | `input_13` | textarea | none — present, requiredness unknown | "Tell us about yourself" | — | `rows="10" cols="50"`, no `maxlength` | |
| — | "Examples Images" (visually hidden label; display-only content block, Gravity Forms `html` field type, not an input) | `field_1_19` | n/a | n/a | n/a | n/a | n/a | See §5 — shows three captioned example photos ("Full length", "Close up", "Profile") directly above the three upload slots. |
| 14 | "Upload first image" | `input_15` | file | `aria-required="true"` + "(Required)" | button reads "Upload your image" | — | see §4 | |
| 15 | "Upload second image" | `input_14` | file | `aria-required="true"` + "(Required)" | button reads "Upload your image" | — | see §4 | |
| 16 | "Upload third image" | `input_16` | file | `aria-required="true"` + "(Required)" | button reads "Upload your image" | — | see §4 | |

No `<select>` elements at all — no dropdowns for gender, ethnicity, division, market, experience
level, etc. No radio/checkbox groups on the applicant form itself (the only checkboxes on the
page are the cookie-consent Functional/Analytics toggles, unrelated to the application).

**Observed client-side validation behavior**: none could be exercised without risking a
submission attempt. No `required`, `pattern`, `minlength`, or `maxlength` HTML5 attributes are
present on any applicant-facing field, meaning client-side blocking (if any) is handled entirely
by Gravity Forms' JS validation library and/or server-side on submit — neither was observable
without POSTing, which is prohibited. The only concretely observed client-side hook is
`onchange="javascript:gformValidateFileSize(this, 67108864)"` on each file input (see §4).

## 4. Uploads

Three required image-upload slots, all identically configured:

- `accept` attribute: **absent from all three `<input type="file">` elements** — verified in both
  the raw HTML fetch and the live DOM (grepped for `accept=` across the full page source: zero
  matches on any form control). This means the OS file picker is **not** filtered to image MIME
  types at the browser level; a user could technically pick any file type. Gravity Forms' JS
  bundle does ship generic strings for server-side rejection (`"This type of file is not allowed.
  Must be one of the following:"`, `"illegal_extension"`) confirming *some* extension allowlist
  exists on submit, but the actual allowed-extensions list is not exposed anywhere in the
  client-side DOM/JS we could inspect without submitting — **UNCERTAIN** exactly which formats
  are accepted; the UI/labels ("UPLOAD YOUR IMAGE", "Upload first/second/third **image**") imply
  standard image formats (jpg/png etc.) but this is INFERENCE from copy, not a verified allowlist.
- Per-file size cap: **64 MB exactly** on each of the three slots (label text verbatim: "Max.
  file size: 64 MB."), backed by matching hidden `MAX_FILE_SIZE` inputs of `67108864` bytes
  (= 64 × 1024²) and matching `gformValidateFileSize(this, 67108864)` JS calls on all three
  fields. **All three slots use the identical value** — there is no per-slot differentiation.
- **Is 64 MB a deliberate JAG spec or a platform default? — INFERENCE, leaning "platform
  default"**: 67,108,864 bytes is the textbook binary round number for "64 MiB", the kind of
  value that comes from a PHP `upload_max_filesize` / `post_max_size` ini setting rather than a
  photography-informed choice (a deliberate creative spec would more plausibly be a per-photo
  cap like 10–25 MB, or would differ by slot). Gravity Forms' file-upload field, when no
  per-field override is configured in the form builder, reports the *server's* PHP upload
  ceiling back to the browser via this exact mechanism (hidden `MAX_FILE_SIZE` + JS validator).
  `64M` is also one of the most common default/host-set values for `upload_max_filesize` on
  shared and managed WordPress hosting. No published photography guidance on the page ties the
  number to image quality or file-format reasoning. We could not access server-side PHP config
  to confirm directly (out of scope/inaccessible), so this remains an inference, not a verified
  fact — but the evidence (identical round binary number across all three otherwise-independent
  fields, no accompanying rationale) points away from a deliberate JAG-authored spec.
- No total/combined-size cap is published (only the per-file 64 MB figure appears; nothing
  states a combined submission limit).
- `multiple`: none of the three inputs has the `multiple` attribute — each slot accepts exactly
  one file, one file per slot, 3 files total, all three required to submit (all three carry
  `aria-required="true"` + "(Required)").
- No video upload field exists on this form — images only.
- No explicit dimension/aspect-ratio/orientation/resolution guidance is published anywhere on
  the page (checked field descriptions and the "Examples Images" block — see §5 — neither states
  pixel dimensions, orientation, or aspect ratio requirements).

## 5. Photo/shot instructions

Verbatim from the "Examples Images" display block on https://jagmodels.com/submissions/
(Gravity Forms `html`-type field immediately above the three upload inputs), three captioned
example photos:

1. Image captioned **"Full length"** (`alt="Full length photo"`)
2. Image captioned **"Close up"** (`alt="Close up photo"`)
3. Image captioned **"Profile"** (`alt="Profile photo"`)

That is the entirety of the shot guidance — three example labels only. There is **no accompanying
text** anywhere on the page about clothing, makeup, hair, background, lighting, expression,
retouching, or filters (checked the full body text and raw HTML for any such guidance —
none found). The three upload-slot labels themselves ("Upload first image" / "Upload second
image" / "Upload third image") are generic and do **not** explicitly map 1:1 to the three example
captions (Full length / Close up / Profile) — the mapping between "first/second/third" and
"full length/close-up/profile" is implied by proximity and ordering on the page, not stated
in text. This is a plausible trap for a talent: they'd reasonably infer slot 1 = full length,
slot 2 = close up, slot 3 = profile, but the form itself never says so explicitly (INFERENCE,
flagged in §10).

## 6. Eligibility

**No age, height, measurement, or location/market eligibility criteria are published anywhere on
the site** (checked /submissions/, /about/, /contact/, /privacy/, homepage). Explicitly absent,
not merely unstated in one place — this was checked across every page found in primary
navigation.

**Gender/division scoping — explicitly NOT restricted, and the "women of all sizes" premise in
the assignment brief does not match what is actually published:**

- The phrase **"women of all sizes" does not appear verbatim anywhere on jagmodels.com** — it
  was searched for (case-insensitive) across the submissions page, homepage, about page,
  contact page, and privacy page; zero matches. This should be treated as a **CONTRADICTION**
  between the assignment brief's premise and primary evidence — see §10.
- What the site actually publishes, verbatim, from /about/
  (https://jagmodels.com/about/), is broader than a women-only framing:
  > "Together, we're removing barriers around size, weight, gender, and race. We're solely
  > focusing on what individuals bring to the table. We'll take a chance on anybody if we
  > believe in them, because belief is the tie that binds JAG..."
  and:
  > "In 2013, we set out to create an inclusive agency dedicated to transforming industry
  > standards... It's part of our ongoing mission to eliminate boxes — to stop talking about
  > stereotypes and start talking about more important things."
- **Does the form take men?** Yes — FACT by direct evidence, not just inference: the homepage
  model roster embedded in the page (https://jagmodels.com/) includes men (e.g. "ny-arthur-
  kelso", "ny-henry-rank", "ny-serge-kuny" — male-presented model-page slugs/names) alongside
  women (e.g. "ny-cosima-von-moreau", "ny-leslie-sidora", "ny-molly-constable"). The submissions
  form itself has **no gender field, no gender-restricted routing, and no separate men's/women's
  form or URL** — it is a single, ungated form for all applicants. The site's board structure
  (`/models/#ny#models`, `#ny#development`, `#la#models`, `#la#development`) is split by
  market (NY/LA) and career stage (Models/Development), not by gender.

## 7. Minors & guardians

**Nothing published.** No age gate, no minimum-age statement, no guardian/parental-consent
field, checkbox, or flow, and no different path for under-18 applicants anywhere on the
submissions page or the rest of the site that was checked (/submissions/, /about/, /contact/,
/privacy/, homepage). The Date of Birth field (`input_4`, placeholder "Month/Day/Year") is
present but not marked required, has no min/max date validation observed, and no downstream
logic (no conditional guardian-field reveal was observed on typing a recent date — though this
was not directly tested by entering a date, per the brief's caution around triggering
validation/network behavior on unfamiliar forms; the DOM contains no conditional-field markup
tied to this input at rest, i.e., no `gform_visibility` rules reference `input_4` elsewhere in
the page source).

This absence is itself the finding: a minor (or a parent applying on a minor's behalf) has no
agency-provided guidance on this form about how — or whether — to apply, and no consent
mechanism is presented at the point of application. High-priority flag per the brief.

## 8. Consent & legal

- **Anti-impersonation / scam-warning notice**, verbatim, from https://jagmodels.com/submissions/
  (rendered as a "Warning" dialog block on the page):
  > "We take your safety seriously and believe it is our duty to protect and inform models
  > against those who falsely represent themselves as agents, scouts, or recruiters for JAG. For
  > your safety, do not engage or respond to anyone who is claiming to be a representative for
  > JAG unless you have had their identity verified. **All JAG employees use valid email
  > addresses that end in @jagmodels.com.** You can verify any requests by sending us a message
  > at jag@jagmodels.com."
  (Note the original has a mid-sentence `<br />` after "believe" — reproduced above as
  continuous prose; the bolded sentence is JAG's own emphasis-worthy claim, not additional
  markup in the source.) This is the exact text Pholio's verification layer should key off:
  the agency's own claim is "valid email addresses that end in @jagmodels.com" (a domain-suffix
  claim, not a single fixed address) — both `jag@jagmodels.com` and `LA@jagmodels.com` seen
  elsewhere on the site are consistent with that claim.
- **Data-handling consent line**, verbatim, directly under the Submit button on
  /submissions/: "We handle your data with care at all times and won't sell it to third
  parties." This is a static statement, not a checkbox — there is no consent checkbox the
  applicant must tick to submit (no checkbox-type input exists on the applicant form at all,
  per §3).
- **Privacy Policy** (https://jagmodels.com/privacy/, dated "May 13, 2022" — i.e., not updated
  since, predating this specific submissions-form redesign):
  - Scope/collection, verbatim: "you may submit to us through the Website your name, age,
    contact information, social media handles, and photos." (Note: mentions "age" as a
    collected data category even though the live form's DOB field is unmarked as required —
    consistent, not contradictory.)
  - Use of information includes (verbatim, item i of a longer list): "(i) consider models and
    talent for potential representation by us and for booking and sourcing talent."
  - Sharing: "We may provide you personal information to our clients, partners, or other
    agencies, such as to book modeling jobs or for consideration of potential bookings," plus
    standard vendor/legal/business-transfer disclosures.
  - No specific data-retention period is stated (no "we keep your data for X" language found).
  - California Shine-the-Light contact process is spelled out (see §1 for the address
    discrepancy this section uses).
- No separate Terms of Service/Use page was found in primary navigation (only About, Contact,
  Submissions, Privacy).

## 9. Process facts

- **Response policy ("we'll only contact you if interested" or similar): not published anywhere
  found.** No statement on the submissions page, about page, or contact page describes whether/
  how JAG responds to applicants, or under what conditions.
- **Post-submission confirmation text: gated/unobservable** without actually submitting the form
  (prohibited) — see §2, item 5. No confirmation copy is pre-rendered in the page source.
- **No open-call schedule, no deadlines, no seasonal windows** are published anywhere on the
  site — the submissions form appears to be open/rolling at all times, with no stated cutoff.
  (Absence noted, not inferred as "always open" — simply nothing to the contrary was found.)
- **Re-application guidance**: none published (no "please wait N months before reapplying" or
  similar text found anywhere).
- The /contact/ page does clarify channel routing, verbatim: "For submissions, please visit our
  Submissions page." and "For model news and new faces, subscribe to our Newsletter and follow
  us on Instagram." and "For bookings or questions, send us an email at jag@jagmodels.com." —
  i.e., the agency explicitly separates submissions (form-only) from bookings/general questions
  (email) and news (newsletter/Instagram).

## 10. Contradictions & uncertainties (ranked by surprise potential to a talent)

1. **HIGH — Brief premise vs. evidence: "women of all sizes" positioning does not exist
   verbatim, and the form is not women-only.** The assignment's special task assumed this exact
   inclusive-positioning phrase; primary evidence shows JAG's actual published language is
   broader ("removing barriers around size, weight, gender, and race" — /about/) and the form
   itself is open to all genders (male models are on the public roster; no gender field or
   gender-gated form exists). A talent-facing brief must not assert "women of all sizes" as
   JAG's stated positioning — that would misrepresent the agency. See §6.
2. **MEDIUM-HIGH — No minors/guardian handling published at all**, despite a Date-of-Birth field
   existing on the form and the Privacy Policy explicitly naming "age" as a collected data type.
   A minor applicant has zero guidance. See §7.
3. **MEDIUM — Post-submission response policy and confirmation experience are both completely
   unpublished and unobservable (gated by the no-submit rule).** A talent will not know, going
   in, whether "no news is no" applies, how long to expect, or what confirmation they'll receive
   on submit. See §9.
4. **MEDIUM — Upload slots are not explicitly mapped to the "Full length / Close up / Profile"
   example captions.** The generic "first/second/third image" labels invite an applicant to
   guess the intended pairing rather than being told outright. See §5.
5. **MEDIUM — File `accept` attribute is entirely absent**, so nothing in the browser UI itself
   prevents a non-image file from being selected for the "photo" slots, even though the button
   copy says "Upload your image." True file-type enforcement (if any) is server-side and
   invisible to us pre-submit. See §4.
6. **LOW-MEDIUM — 64 MB per-file cap is very likely an inherited platform/hosting default (PHP
   `upload_max_filesize`), not a JAG-authored creative spec** — flagged as INFERENCE with
   reasoning in §4, so Pholio should probably not present it to talent as "JAG wants files up to
   64MB" so much as "the platform will accept files up to 64MB per photo," to avoid implying a
   deliberate agency preference that doesn't exist.
7. **LOW — Minor contact-detail drift across the site**: phone number "+1 646 398 9684"
   (/contact/ page body) vs. "+1 646 393 9684" (site-wide footer, same page) — one digit
   differs; and the Privacy Policy (dated 2022) lists a third, older NY address ("160 Varick
   Street, 3rd Floor") for legal/Shine-the-Light requests specifically, distinct from the
   current footer address ("416 West 13th Street, Suite 205"). Neither is application-blocking,
   but a Pholio user who tries to call the /contact/-page number vs. the footer number could hit
   friction. See §1.
8. **LOW/UNCERTAIN — Whether the "Warning" scam-notice block is a dismissable modal shown on
   first page load, or an always-inline block.** Markup includes a close button and
   dialog-style ids, but our capture shows it rendered inline with page content; not fully
   resolved. Does not affect field/upload facts, included for completeness.
9. **UNCERTAIN — Exact allowed file extensions for the three image uploads.** Only generic
   Gravity Forms error-string scaffolding ("This type of file is not allowed. Must be one of
   the following:") was found; the actual allowlist is not exposed in client-side DOM/JS without
   submitting. See §4.

## 11. Draft talent-facing brief (for Pholio Market view)

JAG Models (New York/Los Angeles) accepts applications through one channel only: the
Submissions form at jagmodels.com/submissions — there's no email application route and no
open-call schedule published, so don't expect walk-in days or a deadline. The form is short and
open to everyone: it doesn't ask for gender, and JAG's public roster includes both men and
women, so don't assume this is women-only. Required fields are just First name, Last name,
E-mail, and Phone; Pronouns, Date of Birth, Height (feet or centimeters — either works), Homebase,
and your social handles are all optional. There's a free-text box for anything else you want them
to know.

You'll need exactly three photos, one per upload slot, each capped at 64MB — that's a generous
platform limit, not a creative ask, so don't read anything into it. The page shows three example
shot types — full length, close-up, and profile — right above the uploads, but it never states
which upload slot is meant for which shot, so use that order (first/second/third) as your best
guide. There's no stated guidance on clothing, makeup, background, or retouching — keep it
simple and current.

The site doesn't publish an age minimum, and there's no guardian or parental-consent step for
minors anywhere in the flow, even though the form does ask for date of birth — if you're applying
for someone under 18, JAG's own materials don't tell you what to do differently, so it's worth
double-checking directly with the agency.

JAG doesn't say whether — or when — they'll respond, so don't expect a guaranteed reply. They do
warn, clearly: every real JAG staffer's email ends in @jagmodels.com, and you can verify anyone
claiming to represent them by emailing jag@jagmodels.com directly.

## 12. Evidence log

1. https://jagmodels.com/robots.txt — retrieved 2026-08-19T06:4x UTC — method: curl —
   evidences: no crawl restriction on `/submissions/` (only `/wp/wp-admin/` disallowed).
2. https://jagmodels.com/submissions/ — retrieved 2026-08-19T06:4x UTC — method: Playwright
   (full render, `dumpForms` + `page.evaluate` body innerText + innerHTML) and curl (raw HTML,
   saved to `jag_raw.html` in this session's scratchpad) — evidences: full field inventory (§3),
   upload config incl. `MAX_FILE_SIZE=67108864` and `Max. file size: 64 MB.` labels (§4),
   "Examples Images" block with Full length/Close up/Profile captions (§5), the "Warning"
   scam-notice block verbatim (§8), the post-submit consent line "We handle your data with care
   at all times and won't sell it to third parties." (§8), the honeypot "LinkedIn" field and its
   validation-purposes description (§3), page title "Submissions - JAG Models" and meta
   description "If you're interested in modeling and believe you have what it takes to join the
   JAG family, please fill out our Submissions form." No submission was attempted; the only
   network POST observed during page load was a Sentry error-monitoring beacon to
   `sentry.studioseptember.nl`, unrelated to the form.
3. https://jagmodels.com/ (homepage) — retrieved 2026-08-19T06:4x UTC — method: curl — evidences:
   JSON-LD descriptions ("A future-forward modeling agency redefining beauty..." / "JAG Models
   can't be gauged by measurements, followers or campaigns."), embedded `window.models` roster
   array containing both male- and female-presented model names/slugs across NY and LA (§6),
   nav structure confirming `/models/#ny#models`, `#ny#development`, `#la#models`,
   `#la#development` board segmentation by market/stage only, not gender.
4. https://jagmodels.com/about/ — retrieved 2026-08-19T06:4x UTC — method: curl (rendered text
   extracted) — evidences: verbatim inclusive-positioning language ("Together, we're removing
   barriers around size, weight, gender, and race..."; "In 2013, we set out to create an
   inclusive agency..."), used to establish that "women of all sizes" is NOT the agency's
   published phrase (§6, §10 item 1).
5. https://jagmodels.com/contact/ — retrieved 2026-08-19T06:4x UTC — method: curl (rendered
   text) — evidences: explicit channel routing ("For submissions, please visit our Submissions
   page."), the phone-number discrepancy vs. footer (§1, §10 item 7).
6. https://jagmodels.com/privacy/ — retrieved 2026-08-19T06:4x UTC — method: curl (rendered
   text) — evidences: Privacy Policy dated "May 13, 2022", data-collection scope including
   "age", use-of-information clause "(i) consider models and talent for potential representation
   by us and for booking and sourcing talent", the older "160 Varick Street" address for
   Shine-the-Light requests (§1, §8).
7. In-page JS/DOM inspection of https://jagmodels.com/submissions/ (Playwright
   `page.evaluate`, targeted searches) — retrieved 2026-08-19T06:4x UTC — evidences: zero
   `accept=` attributes on any form control (§4); zero matches for "women"/"all sizes"/
   "gender"/"minor"/"guardian"/"parent"/"consent"/"eligib"/"18" as eligibility language anywhere
   in the raw page HTML (§6, §7); no pre-rendered Gravity Forms confirmation-message text (§2,
   §9); Gravity Forms i18n error strings confirming a server-side file-extension check exists
   without exposing its allowlist (§4, §10 item 9).

Local working files from this session (not for external distribution, kept for traceability):
`/tmp/claude-0/-home-user/7bf68b63-0da8-50e3-86bd-bf0444040ebb/scratchpad/phase2/jag_raw.html`,
`jag_home.html`, `jag_about.html`, `jag_contact.html`, `jag_privacy.html`,
`jag_explore.mjs`, `jag_examples.mjs`/`jag_examples2.mjs`/`jag_examples3.mjs`.
