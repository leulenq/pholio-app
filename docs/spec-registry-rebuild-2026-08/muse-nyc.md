# Muse Management NYC — Agency Entry

**Lead adjudication notes (2026-08-19):**
- Registry cross-check: the site-footer "REG #26-67AN4-LSFW" (which the research lane could
  only corroborate from the agency's own surfaces) matches the NY DOL Socrata snapshot row for
  `Muse Management, Inc.` in `docs/evidence-nydol-registry-2026-08-15.json` exactly — the
  footer display is the FWA-mandated on-website registration number. Adjudicated: FACT
  (registry snapshot + first-party display agree). The lane's Evidence #13 hedge is resolved.
- Everything below is the lane's primary-evidence research, integrated verbatim.

---

# Muse Management NYC (`muse-nyc`) — Spec Registry Research

## 1. Identity & channels

- Legal/trade name on site: **MUSE MODEL MANAGEMENT** (page footer/branding); assignment brief gives legal entity **Muse Management, Inc.**
- NYDOL cert: **26-67AN4-LSFW**, issued 2026-01-12, status Active, address 150 Broadway (per assignment brief). CORROBORATION: the identical string `26-67AN4-LSFW` appears (a) in the site footer on every page as `Powered by cDs Models & Talent Management Software - REG #26-67AN4-LSFW`, and (b) in the official Instagram bio `@musemodelsnyc` as a standalone line `26-67AN4-LSFW`. — FACT (see Evidence #1, #2, #6).
- Address (published, site contact page): `MUSE MODEL MANAGEMENT / 150 BROADWAY, SUITE 300 / NEW YORK, NY 10038`. Phone `+1 212 625 2356`. General email `INFO@MUSENYC.COM` (mailto link, uppercase as published). — FACT (Evidence #1).
  - CONTRADICTION: a WebSearch snippet (from models.com-adjacent aggregator content) rendered the suite as "Suite 1101" rather than "Suite 300." The site's own contact page (first-party, rendered DOM) says **Suite 300**. Recording both: site = Suite 300 (FACT, primary), third-party aggregator text = Suite 1101 (UNCERTAIN/lower trust, not independently confirmed on musenyc.com). Use Suite 300 as canonical since it is first-party.
- Official domain: **musenyc.com** (www.musenyc.com). — FACT.
- **CAUTION / confusability trap**: `musetheagency.com` is a **different, unrelated agency** — "MUSE | Talent Management Agency," based in Manchester, UK, with its own `/apply` **online form** (not email), different photo rules (no filters/retouching, no selfies, neutral expression, no makeup/natural hair, well-fitted clothing) and a "only shortlisted candidates contacted due to high volume" line. This surfaced directly in a WebSearch for Muse NYC's own scouting email, confirming a talent could easily land on the wrong site. — FACT for musetheagency.com's own content (Evidence #9); flagged as a naming trap for Pholio's UI (e.g., disambiguation copy, domain confirmation).
- Application channels found: **email only** (`scouting@musenyc.com`) plus an unaddressed **weekly open call** (Thursdays 3–4 PM). No onsite web form exists anywhere in the site's Nuxt SPA (see §2 and §10). No third-party submission portal (e.g., Model Mayhem, Backstage) is referenced by the agency itself.
- Canonical channel for a NYC applicant: **email submission to scouting@musenyc.com**, per the site's own "BE A MODEL" section, which is reached from the primary nav's CONTACT page. The open call is a secondary/parallel channel with no online booking — it is walk-in per available evidence (no RSVP/registration step published anywhere).
- Divisions found in primary nav (site structure, not separate apply channels): WOMEN (IMAGE, DEVELOPMENT, MAIN, DIRECT, TIMELESS), CURVE (DEVELOPMENT, MAIN), MEN, DIGITAL. Each division page (`/main`, `/men`, `/curve-main`, `/curve-development`, `/digital`, `/image`) is a **model roster only** — none carry division-specific apply instructions, forms, or emails. See §3/§6 for what this means for curve applicants specifically.

## 2. Flow map

Entry → `https://www.musenyc.com/contact` (single page, Nuxt SPA, client-rendered).

1. Page load triggers a cookie-consent banner ("ACCEPT"/"DECLINE") — no gate, cosmetic only; does not block reading content beneath it. — OBSERVED.
2. Below the banner, the page is a single long scroll of static text organized under bolded headers: agency address/phone/email block → "BE A MODEL" → "YOU WANT TO BECOME A MODEL? SO, WHAT'S NEXT?" → open-call line → minors/scam-safety paragraph → height preference paragraph → "WHAT SHOULD MY PHOTOS LOOK LIKE?" → measurement instructions → the submission line naming `scouting@musenyc.com` → "I'VE SUBMITTED MY PICTURES, WHAT'S NEXT?" (response policy). — OBSERVED (full text in §12 Evidence #1).
3. **There is no form, no input field, no upload widget, no button, and no login/account gate anywhere on this page.** `dumpForms()` (Playwright helper) returned an **empty array** — zero `<input>`, `<select>`, `<textarea>`, or `<form>` elements on `/contact`. — OBSERVED (Evidence #1).
4. The only actionable elements are a `mailto:INFO@MUSENYC.COM` link (general inquiries) and the plain-text email address `scouting@musenyc.com` (not even hyperlinked as `mailto:` — it is rendered as plain text in the body copy). The applicant must manually compose an email in their own mail client; the site provides no template, no pre-filled subject, no click-to-open-composer with fields.
5. Site-wide route probe: attempted `/apply`, `/submit`, `/scouting`, `/open-call`, `/join`, `/model-search`, `/new-faces` — all returned HTTP 500 (the site's Nuxt catch-all errors on any non-existent route: `{"status":500,"message":"Cannot read properties of undefined (reading 'map')","name":"TypeError"}`), while real pages (`/contact`, `/men`, `/curve-main`) return HTTP 200. This confirms none of these guessed apply/submit paths exist — no hidden onsite apply form was found anywhere in the nav or by direct guess. — OBSERVED (Evidence #7, #8).
6. **Observation stopped where reality stopped, not where a gate blocked us**: there is no further flow to observe past "compose and send an email to scouting@musenyc.com" — the entire "flow" for musenyc.com is (a) read the instructions on `/contact`, (b) take/select photos per the instructions, (c) take measurements, (d) send one email with Name, Age, Location, Pictures, and Measurements to `scouting@musenyc.com`. No multi-page flow, no CAPTCHA, no account creation exists to observe.

## 3. Field inventory

**None** — there is no form/field-based application on musenyc.com. Instead, the site publishes a checklist of what the **email** must contain, in prose:

| "Field" (as described in prose, not an actual input) | Verbatim source text | Notes |
|---|---|---|
| Name | "...please email all of your information: Name, Age, Location, Pictures and Measurements to scouting@musenyc.com" | Order as published: Name, Age, Location, Pictures, Measurements |
| Age | (same line) | No explicit minimum age stated on this page; see §7 for the under-18 handling |
| Location | (same line) | No format specified (city/state? full address?) — UNCERTAIN |
| Pictures | (same line) | See §4/§5 for full photo requirements |
| Measurements | "please also send in your measurements" — height, bust, waist, hips, with instructions on how to measure each (see §3 Measurements below) | No explicit units stated (inches implied by US convention; not stated verbatim) — UNCERTAIN whether metric is accepted |

Measurement instructions, verbatim: "Your height should be measured in bare feet. Your bust should be measured at the fullest part. Measure your waist at the most narrow part, usually about 3 inches above your belly button. Hips are measured at the fullest part; around your bum." — FACT (Evidence #1). Note this instruction set is phrased for a female body (bust/hips) with no separate men's measurement instructions published (see §6 contradiction/gap).

No maxlength/pattern/required-attribute data exists because there is no HTML form to inspect.

## 4. Uploads

There is no file-upload widget — uploads happen as **email attachments**, per prose instructions only:

- Verbatim: "Please don't email files that are too large; each image should be about 1MB." — this is the **only** size guidance published: **per-image, approximately 1MB**, phrased as a soft/approximate target ("about"), not a hard byte cap. No stated maximum number of images, no stated total-email-size cap, no stated accepted file formats (jpg/png/heic not mentioned). — FACT/PREFERENCE (the "about 1MB" phrasing itself is a soft preference, not an enforced hard limit — no validation mechanism exists to enforce it since submission is via ordinary email).
- Photo slot instructions (what shots are needed), verbatim: "Close ups should be taken with your hair up AND hair down. When shooting full length, please show your entire body from head to toe." So the required shot set is: (1) close-up, hair up; (2) close-up, hair down; (3) full length, head to toe. — FACT.
- No video requirement is published anywhere on the site. — none found.
- No explicit dimension/aspect-ratio/orientation guidance beyond "full length... entire body from head to toe" and general framing advice in §5. No resolution/DPI/orientation (portrait vs landscape) spec given. — none found.
- Capture device guidance, verbatim: "Your parents, sibling or friend can take the pictures you need to submit on their phone or digital camera." — phone or digital camera explicitly sanctioned; nothing about who may NOT take the photo (e.g., no explicit "not a professional photographer" rule, though the overall tone — natural light, no posing — implies amateur/self-taken snapshots are preferred, see §5).

## 5. Photo/shot instructions (verbatim, with gender scoping exactly as published)

Full verbatim block from `/contact` under "WHAT SHOULD MY PHOTOS LOOK LIKE? (SEE THE DIGITALS)":

> "Your parents, sibling or friend can take the pictures you need to submit on their phone or digital camera. Please don't email files that are too large; each image should be about 1MB.
>
> Your pictures should resemble this example as closely as possible. Make sure your background is clear from clutter. Natural light is always best, but do what you can.
>
> Close ups should be taken with your hair up AND hair down. When shooting full length, please show your entire body from head to toe.
>
> For Women: Your outfit should be simple and form fitting, or a bikini. Please DO NOT wear: HEELS, MAKE UP, JEWELRY
>
> For Men: outfit should be simple and form fitting - shirtless is ok if you are comfortable.
>
> You might think that you should be posing but these pictures are to show us what you look like at your most natural and relaxed."

Gender scoping is EXACTLY as published — the site uses "For Women:" and "For Men:" as literal section labels; there is no third scoping (e.g., no separate "For Curve:" clothing rule — curve applicants fall under "For Women" by default since curve is a women's division per the nav structure, WOMEN > CURVE). — FACT (Evidence #1).

There is a reference to "this example" ("Your pictures should resemble this example as closely as possible") implying an example image is shown on the page — OBSERVED: the body-text extraction (innerText) does not capture images; a reference photo may exist inline on the page that was not captured in this text-only pass. This is a gap — flagged as UNCERTAIN whether the visual reference example was fully captured (see §10).

Background/lighting: "Make sure your background is clear from clutter. Natural light is always best, but do what you can." — FACT.

Expression/posing: "You might think that you should be posing but these pictures are to show us what you look like at your most natural and relaxed." — explicitly discourages posed/styled shots. — FACT.

No retouching/filter policy is stated on musenyc.com (contrast with musetheagency.com — the unrelated Manchester agency — which explicitly bans filters/retouching; Muse NYC publishes no such rule either way). — none found for musenyc.com.

## 6. Eligibility

- Height: "Muse represents models of all sizes. We prefer our models to be a minimum of 5'9" and taller. For Men: models should be 5'11 and taller." — PREFERENCE (explicitly softened by "We prefer"), with exact gender scoping as published: 5'9"+ is the general/women's preference, 5'11"+ is stated specifically "For Men." This matches the rumored figures given in the assignment (5'9"+/5'11"+) and is now confirmed verbatim as a **preference**, not a hard cutoff — "Muse represents models of all sizes" appears in the same paragraph, which is in tension with the height preference immediately following it (recorded as-is, not resolved). — FACT/PREFERENCE (Evidence #1).
- Age: No explicit minimum age is stated anywhere on `/contact`. The only age-related text is the under-18/parent guidance in §7. Absence of a stated minimum age is itself a finding — it is an unknown, not permission to assume 18+ or any other floor. — none found (age minimum).
- Location/market: No explicit geographic restriction is stated (e.g., "NYC-based only" or "US only") on the submission instructions. The office is NYC-based (150 Broadway) and the open call is presumably in-person at a physical location, which by nature limits practical attendance, but the **email submission channel itself carries no stated geographic restriction**. — none found (explicit location restriction on email path).
- Gender/division scoping: Clothing rules are split "For Women"/"For Men" (§5); height preference is split "general/women's" (5'9"+) vs. "For Men" (5'11"+). Divisions in the nav are WOMEN (with IMAGE, DEVELOPMENT, MAIN, DIRECT, TIMELESS, and CURVE nested under Women per site structure — CURVE has its own top-level nav entry alongside WOMEN, MEN, DIGITAL, suggesting it may function as a peer division rather than strictly nested; nav DOM order was WOMEN, IMAGE, DEVELOPMENT, MAIN, DIRECT, TIMELESS, CURVE, DEVELOPMENT, MAIN, MEN, DIGITAL — CURVE has its own DEVELOPMENT/MAIN sub-pages distinct from WOMEN's DEVELOPMENT/MAIN sub-pages, e.g. `/curve-main` vs `/main`) and MEN as a separate top-level division. DIGITAL appears to be a separate roster (models with follower counts shown) rather than an application division.
- **Curve applicants — how do they apply?** No separate email address, form, or instruction set exists for curve applicants. `/curve-main` and `/curve-development` are **roster pages only** (lists of represented curve models' names, no apply text, no forms — confirmed via full-page text extraction, Evidence #4). The `/contact` page's single submission instruction set (email `scouting@musenyc.com`, "For Women" clothing rules) is the only published path, and since curve is presented as a female division in the site's information architecture, curve applicants most plausibly fall under the general "For Women" instructions — but this is **INFERENCE**, not a stated rule. The agency never explicitly says "curve applicants use the same email" or "curve applicants should mention 'curve' in their submission." This is a meaningful gap for a talent-facing product: **UNCERTAIN / gap**, ranked high in §10.

## 7. Minors & guardians

Full verbatim text (only minors-related passage found anywhere on the site): "If you are under 18 years old, it is very important that your parents are aware of your modeling goals. Potential models of all ages need to be aware of illegitimate modeling offers and potentially predatory individuals on the internet. Please check all of your sources if someone contacts you. If someone from Muse contacts you, verify with us who they are and make sure they have an email address from our agency.

Muse follows the guidelines of New York State for minors. We provide all of our models with education, experience and the professional management needed to meet the goals of their modeling career." — FACT (Evidence #1).

This is **awareness/safety guidance, not a procedural consent step**. There is no:
- guardian email field or guardian co-signature requirement in the submission process (there is no form at all to hold such a field),
- explicit statement of a minimum age to apply,
- explicit instruction that a parent must send or co-send the submission email,
- age-gate or date-of-birth check anywhere on the site (none exists — no form).

The phrase "Muse follows the guidelines of New York State for minors" references NYS child performer/model regulations generically but does not itself enumerate what those guidelines require (e.g., no mention of NY Child Performer trust accounts, work permits, or the NYS Department of Labor's specific minor-modeling rules). This is a meaningful gap: the agency asserts compliance without publishing the procedure. — explicitly flagged per brief §7 requirement: **if nothing beyond this is published, say so explicitly** — nothing beyond the above two paragraphs is published anywhere on musenyc.com regarding minors/guardians.

## 8. Consent & legal

No consent checkbox exists at the point of "application" because there is no form — the applicant's only legal-adjacent touchpoint is the general **Privacy Policy** (`/privacy-policy`), reachable via a footer link from the cookie-consent banner ("Find out more in our privacy notice"), not from the BE A MODEL section itself.

Privacy Policy key excerpts (truncated to first substantive points per brief's boilerplate-truncation instruction):
- "MUSE MANAGEMENT is committed to respecting your privacy and recognizes your need to protect sensitive and personal information that you share with us." (Principles, opening sentence)
- "MUSE MANAGEMENT will not without explicit permission sell or share data you have provided us with." — FACT, verbatim (Evidence #5).
- "Personal information you provide will not be transferred to third parties without your consent. If needed we will provide companies we hire for statistical or analyze purpose (and only for this purpose) with personal information..." — FACT, verbatim (Evidence #5).
- Full policy runs ~3,890 characters including Collection/Use, Security, and Cookies sections; not fully reproduced here per truncation guidance, but nothing in the retrieved portion mentions image/likeness usage rights, retention periods, or a data-deletion process specific to submitted model photos. — none found (specific photo/likeness usage-rights or retention-period language).
- Cookie banner (site-wide, not application-specific): "We use cookies on our website to give you a better experience, improve performance and for analytics. By using this website you agree to the use of cookies. Find out more in our privacy notice." with ACCEPT/DECLINE buttons. — OBSERVED/FACT.
- No scam-warning boilerplate beyond the minors paragraph in §7 (which doubles as the site's only scam-warning text, addressed to "potential models of all ages," not just minors).

## 9. Process facts

- Response policy, verbatim: "If we are interested in meeting you, someone from Muse will contact you shortly. We are not able to respond to every submission. You may not hear back from us and that could be for many reasons. The fashion industry is constantly changing." — FACT (Evidence #1). This is an explicit **"we only contact if interested"** policy — silence should be expected as the default/likely outcome, not treated as an error.
- Closing encouragement line: "Becoming a model is equal parts talent, hard work and timing! We look forward to hearing from you!" — FACT.
- Open call schedule, verbatim (site): "Muse is holding open calls every Thursday from 3 -4 PM." — FACT (Evidence #1).
- Open call corroboration (first-party, official Instagram `@musemodelsnyc` bio, fetched directly, not via search-engine snippet): bio text reads exactly "Open Call | Thursdays 3 - 4 PM" as a standalone bio line, alongside the same registration number `26-67AN4-LSFW` and handles `@musecurve` and `@musemennyc`. — FACT, first-party, independently corroborates day and time (Evidence #6).
- **No address, no walk-in rules, no "what to bring/wear," no RSVP/registration requirement for the open call is published anywhere on musenyc.com or in the official Instagram bio we could retrieve.** A WebSearch AI-generated summary asserted "Attendees should bring their portfolio or recent photos... be prepared to take digitals... open call takes place at 150 Broadway" — this claim is **not directly sourced to any single first-party page or post** in the search results returned (it reads as a search-engine-generated synthesis, possibly inferring the office address). We could not independently verify this via WebFetch (Instagram individual posts about open calls were not retrievable — rate-limited) or via the site. **Recorded as UNCERTAIN, not FACT** — do not present "bring your portfolio" or "at 150 Broadway" as agency-published open-call rules; only day (Thursday) and time (3–4 PM) are verified first-party facts. See §10.
- No deadlines or seasonal application windows are published — the email channel and open call both appear to be standing/year-round (no "applications closed" or seasonal language found). — none found (deadlines).
- No re-application guidance is published (e.g., no "wait 6 months before resubmitting" rule). — none found.

## 10. Contradictions & uncertainties (ranked by potential to surprise a talent)

1. **HIGH — Open call location and "what to bring" are unverified.** The site and official IG confirm day/time (Thursdays, 3–4 PM) but neither publishes a location or any walk-in instructions (attire, portfolio, ID, arrival procedure). A talent following only agency-published sources would know *when* but not confidently *where* or *how* to show up. A search-engine AI summary suggested "150 Broadway" and "bring portfolio," but this is not confirmed first-party and should not be presented as agency guidance without a disclaimer.
2. **HIGH — Curve applicants have no dedicated instructions.** `/curve-main` and `/curve-development` are rosters only; no curve-specific email, subject-line convention, or clothing/measurement guidance exists. Whether a curve applicant should simply follow "For Women" instructions verbatim, or should flag themselves as a curve submission in some way, is not stated by the agency. This is a real gap a Pholio applicant could hit.
3. **MEDIUM — Height "preference" language sits awkwardly against "Muse represents models of all sizes."** Both sentences are in the same paragraph, published as-is; not resolved by the agency. A talent under 5'9" (or under 5'11" if male) may reasonably wonder whether they should submit at all — the agency's own text does not clarify.
4. **MEDIUM — Measurement instructions are phrased only for a female body plan (bust/waist/hips)**, with no separate/parallel measurement instruction set published for men (e.g., no chest/waist/inseam guidance for men specifically) even though "For Men" gets its own clothing-rule sentence elsewhere. A male applicant is left to infer which of the four listed measurement types (height, bust, waist, hips) apply to him.
5. **MEDIUM — No stated minimum age, and minors guidance is safety-awareness only, not a procedural step.** A parent/guardian reading only musenyc.com would not learn whether a guardian must submit on the minor's behalf, co-sign, or provide any consent artifact — only that "it is very important that your parents are aware."
6. **LOW-MEDIUM — Suite number discrepancy.** Site's own `/contact` page: "SUITE 300." A third-party aggregator surfaced in search results said "Suite 1101." Not independently resolved; Suite 300 is treated as canonical (first-party, directly rendered DOM), but a talent using a stale third-party listing to visit in person could show up at the wrong suite.
7. **LOW — "About 1MB" file size is a soft target with zero enforcement mechanism describable to a talent** (no upload form exists to enforce it programmatically) — Pholio's export must aim for ~1MB per image but cannot promise the agency will reject anything larger or smaller; it's advisory prose, not a validated cap.
8. **LOW — A visual "example" photo referenced in the site copy** ("Your pictures should resemble this example as closely as possible") may not have been captured by our text-only extraction pass (innerText strips images) — if an actual reference photo exists inline, its visual content (pose, framing, exact styling) was not captured in this research pass, only the surrounding prose.
9. **Confusability, not a contradiction but critical to flag**: `musetheagency.com` ("MUSE | Talent Management Agency," Manchester, UK, unrelated) surfaces readily in searches for Muse NYC's submission process and uses a completely different apply mechanism (online form, not email) and different photo rules (bans makeup/filters differently scoped, no selfies rule, etc.). Any Pholio UI referencing "Muse" by short name risks the same collision the agency's own domain name invites.

## 11. Draft talent-facing brief (150–300 words)

Muse Management NYC doesn't use an online form — you apply by **email only**, to **scouting@musenyc.com**. In one email, include: your **Name, Age, Location**, your **Pictures**, and your **Measurements** — in that order, as the agency lists them. Keep each photo to **about 1MB** (their own guidance — a soft target, not a strict cutoff, but oversized files risk your email getting flagged or ignored).

You need three shots: a **close-up with your hair up**, a **close-up with your hair down**, and a **full-length shot, head to toe**. Shoot with natural light, against a clutter-free background, and don't pose — Muse wants to see you relaxed and natural, taken on any phone or camera by a parent, sibling, or friend. Outfit rules differ by gender exactly as Muse publishes them: **women** wear something simple and form-fitting, or a bikini, with **no heels, no makeup, no jewelry**; **men** wear something simple and form-fitting — shirtless is fine if you're comfortable. For measurements: height in bare feet; bust at the fullest point; waist at the narrowest point (about 3 inches above your belly button); hips at the fullest point.

Muse prefers women 5'9"+ and men 5'11"+, though they say they represent "models of all sizes" — so don't rule yourself out. If you're under 18, make sure a parent knows about your modeling plans; the agency doesn't spell out a separate guardian submission step beyond that awareness.

Muse also holds a walk-in **open call every Thursday, 3–4 PM** — but the agency doesn't publish an address or what to bring, so confirm details directly before showing up. And expect silence by default: Muse only replies if interested.

One trap: **musetheagency.com is a completely different company** — don't confuse it with musenyc.com.

## 12. Evidence log

1. **URL**: https://www.musenyc.com/contact | **Retrieved**: 2026-08-19 (session clock; environment date supplied as 2026-08-19), via Playwright (full render, `networkidle` + 3s settle) | **Method**: Playwright, `page.evaluate(() => document.body.innerText)` and `dumpForms()` helper | **Evidences**: entire BE A MODEL section verbatim, address/phone/email, open call day/time, minors paragraph, height preferences, photo instructions, measurement instructions, submission email, response policy, and confirmation that `dumpForms()` returned `[]` (zero form controls on the page). Full text captured in-line above.
2. **URL**: https://www.musenyc.com/contact | same retrieval as #1 | **Method**: Playwright, footer text | **Evidences**: "Powered by cDs Models & Talent Management Software - REG #26-67AN4-LSFW" — confirms the cert number given in the assignment appears verbatim on the live site footer.
3. **URL**: https://www.musenyc.com/robots.txt | 2026-08-19 | **Method**: curl | **Evidences**: `Disallow: /_nuxt/` and `Disallow: /api/` only — `/contact` and division pages are not disallowed, so all pages fetched are in-bounds. Also lists `Sitemap: https://www.musenyc.com/sitemap.xml` (which itself 500s — see #7).
4. **URL**: https://www.musenyc.com/curve-main and https://www.musenyc.com/curve-development | 2026-08-19 | **Method**: Playwright, full-page innerText | **Evidences**: both pages are pure model-name rosters (34–65 names each), no apply text, no forms, no curve-specific instructions — supports §6 curve-applicant gap finding.
5. **URL**: https://www.musenyc.com/privacy-policy | 2026-08-19 | **Method**: Playwright, innerText (first ~2500 chars captured of ~3890 total) | **Evidences**: Principles/Collection/Security/Cookies sections, verbatim quotes used in §8.
6. **URL**: https://www.instagram.com/musemodelsnyc/ | 2026-08-19 | **Method**: Playwright (domcontentloaded + 4s settle, unauthenticated/logged-out view) | **Evidences**: bio text "Muse Management NYC / An official peek inside Muse Management / Open Call | Thursdays 3 - 4 PM / @musecurve / @musemennyc / 26-67AN4-LSFW / musenyc.com" — first-party corroboration of open-call day/time and the NYDOL-adjacent registration number; also reveals related official handles `@musecurve` and `@musemennyc` (not independently fetched — rate-limited, see below).
7. **URL**: https://www.musenyc.com/sitemap.xml | 2026-08-19 | **Method**: curl | **Evidences**: returns HTTP 200 with a JSON 500-style error body `{"status":500,"message":"Cannot read properties of undefined (reading 'map')","name":"TypeError"}` — sitemap is broken/unusable for route discovery.
8. **URL**: https://www.musenyc.com/{apply,submit,scouting,open-call,join,model-search,new-faces} | 2026-08-19 | **Method**: curl, `-o /dev/null -w "%{http_code}"` | **Evidences**: all seven guessed paths return HTTP 500 (site's generic error for non-existent routes), while confirmed real pages `/curve-main`, `/men` return HTTP 200 — supports the finding that no additional apply/submit page exists beyond `/contact`.
9. **URL**: https://musetheagency.com/apply | 2026-08-19 | **Method**: WebFetch | **Evidences**: confirms this is a distinct agency ("MUSE | Talent Management Agency," Manchester, UK) with an online-form apply process and different photo rules — used to document the confusability trap in §1/§10.
10. **Query**: "Muse Model Management NYC open call Thursday scouting@musenyc.com" | 2026-08-19 | **Method**: WebSearch | **Evidences**: surfaced the official IG handle (leading to Evidence #6), the official `/contact` page, and a third-party ProjectCasting listing; the search tool's own AI-generated summary claimed open-call address ("150 Broadway") and "bring portfolio" guidance that could **not** be confirmed against any single first-party source in the returned links — treated as UNCERTAIN per §9/§10.
11. **Query**: "musenyc.com scouting@musenyc.com submit photos model" | 2026-08-19 | **Method**: WebSearch | **Evidences**: corroborated the scouting@musenyc.com submission email and Name/Age/Location/Pictures/Measurements checklist from an independent search pass; also surfaced `musetheagency.com/apply` directly in results for a Muse-NYC-targeted query (independent evidence of the confusability trap) and a "Suite 1101" address variant (see §1 contradiction, #6 in §10).
12. Attempted: https://www.instagram.com/musecurve/ and https://www.instagram.com/musemennyc/ | 2026-08-19 | **Method**: Playwright | **Result**: both failed with `net::ERR_HTTP_RESPONSE_CODE_FAILURE` (rate-limiting after two prior Instagram fetches in quick succession) — could not corroborate whether these secondary official accounts publish any curve- or men's-specific submission guidance beyond what `/contact` states. Recorded as an incomplete check, not a negative finding.
13. Attempted: https://www.chamberofcommerce.com/... and generic DOL public license search | 2026-08-19 | **Method**: WebFetch / WebSearch | **Result**: chamberofcommerce.com returned HTTP 403 (blocked); direct DOL portal lookup of cert `26-67AN4-LSFW` did not resolve via WebSearch (the string is a cDs software vendor registration number embedded in every page footer, not obviously a queryable NYDOL license-lookup ID format) — the cert's existence/validity is corroborated only via its consistent appearance on the agency's own site footer and Instagram bio (Evidence #2, #6), not independently via a NYDOL database lookup in this pass.
