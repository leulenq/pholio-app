# Fashion Week Brooklyn (FWBK) — Event Casting Entry

**Entity type:** event casting (NOT agency representation — consent language, review states,
and talent expectations must be forked accordingly per the standing event-mode design).
**Producer:** BK Style Foundation, 501(c)(3). FACT (fashionweekbrooklyn.com footer, retrieved
2026-08-19): "© 2026 BK Style Foundation | BK Style Foundation is a 501(c)(3) non-profit
organization | Fashion Week Brooklyn is a BK Style Foundation Production".
**All facts retrieved 2026-08-19 unless noted.** Method: read-only page loads; every Google
Form's structure parsed from its publicly served `FB_PUBLIC_LOAD_DATA_` payload. No form
submitted, no account created, no email sent.

## 1. Identity & channels

- Official site: fashionweekbrooklyn.com (actively maintained — "© 2026"). Parent-org site
  bkstyle.org is stale (footer "© 2021"; conflicting founding year — see §10) and should be
  treated as a low-confidence source.
- FACT (homepage "WHO WE ARE"): "Fashion Week Brooklyn (FWBK) is a bi-annual exhibition of
  national and international fashion designers founded by the BKStyle Foundation (BKStyle),
  a 501c(3) non-profit organization… Since 2006…"
- **Season 2: October 4–10, 2026** — FACT (homepage hero): "BROOKLYN | OCT 4TH - 10TH /
  SEASON2 2026". Matches the internal record; not drifted.
- Model registration channels (all Google Forms), linked from
  fashionweekbrooklyn.com/model (the `/model-registration` URL is an alias of the same page):
  1. Brooklyn edition form — "FWBK • Brooklyn Model Open Call" (public, 6 fields)
  2. Japan edition form — "FWBK • Japan Model Open Call" (public; field-for-field clone of
     Brooklyn, same internal question IDs)
  3. London edition form — "FWBK • London Model Open Call" (public; identical clone)
  4. Italy edition form — **BROKEN/INACCESSIBLE**: the live "Register Here" link redirects to
     a Google sign-in wall ("Sign in to continue to Google Forms"); no public form served.
     OBSERVED via curl and a real browser session; no credentials entered.
  5. In-person casting form — "Models Open Call • FWBK x Digital Fashion Week" (public,
     7 fields incl. Email): **Wednesday, August 26th, 2026, 5–8pm, Atolye, 236B 6th Street
     (3 & 4 Ave), Park Slope, Brooklyn** (FACT, verbatim from the form description).
- The homepage marquee "BROOKLYN ● LONDON ● JAPAN ● PARIS ● CANADA ● AFRICA" is marketing
  copy only: **no Paris/Canada/Africa registration form or page exists anywhere on the site**
  (OBSERVED). The functional pages (/model, /designers) list Brooklyn/Japan/Italy/London.
  CONTRADICTION (site-internal): homepage marquee vs. functional registration pages.

## 2. Flow map

Single-step per channel: site page → Google Form → submit. No account gate on the public
forms, no CAPTCHA observed, no multi-step logic, no conditional fields. The Italy path dead-
ends at a Google sign-in wall. FACT (/open-calls page, verbatim): "FWBK is an invitation-only
fashion, trade event for the press, buyers and fashion influencers… Fill out our application
in area of your interest and our FWBK team will review for approval." — i.e., registration is
an application for review, not a booking.

## 3. Field inventory — model forms (OBSERVED, parsed from FB_PUBLIC_LOAD_DATA_)

**Standing edition forms (Brooklyn; Japan and London are exact clones):** 6 fields, in order:

| # | Label (verbatim) | Type | Required |
| --- | --- | --- | --- |
| 1 | Full Name | short text | yes |
| 2 | Gender | multiple choice: Male / Female / Gender Fluid | yes |
| 3 | Are you 18 or older? | multiple choice: Yes / No | yes |
| 4 | Phone Number | short text | yes |
| 5 | Instagram | short text | no |
| 6 | Website (If you have one) | short text | no |

**No Email field** on the standing edition forms.

**In-person casting form (Aug 26, "FWBK x Digital Fashion Week"):** 7 fields — the same six
plus **Email (short text, required)** as the first field.

## 4–5. Uploads and photo instructions

None. **No photo/file upload, no video, no walk video** on any model form found. (OBSERVED —
no file-upload item type appears in any form's item list.)

## 6. Eligibility

- The only eligibility field is "Are you 18 or older?" (Yes/No, required). The forms do not
  state what happens on "No" — no branching logic exists in the form structure (OBSERVED).
- No height, no measurements, no experience requirements anywhere.
- Gender options are Male / Female / Gender Fluid (verbatim; note this is the form's own
  vocabulary — preserve it, don't normalize to another gender taxonomy).

## 7. Minors & guardians

**Nothing.** No guardian fields, no consent flow, no age verification beyond the self-reported
18+ question. This is a finding, not an omission: FWBK's intake has no minor-handling at all,
which aligns with Pholio's 18+ launch gate but means the event intake itself provides no
safety net. (OBSERVED across all reachable model forms.)

## 8. Consent & legal

**None on the model forms** — no release, no terms, no photo/likeness consent, no privacy
text. For adjacent categories: FACT (stylist/beauty/volunteer pages, identical boilerplate,
verbatim): "This not a paid engagement - Thank you for your support, we look forward to
working with you!" — an explicit no-pay notice that does NOT appear on any model page or
form (models get no compensation disclosure in either direction). The Open Mic form (different
category) is the only money mention found: a required "I agree to pay a participation fee of
$25" checkbox — performers pay, not models.

## 9. Process facts

- FACT: review-based ("our FWBK team will review for approval").
- FACT (designer side, /registration page, verbatim): "*10 - 15 Runway looks per designer /
  Designers can opt for 15 - 25 looks for an additional registration cost" — designers pay to
  show; the designer package includes "FWBK open call casted models" and a "Models coordinator
  to assist with agencies models booking", confirming models are sourced from these open-call
  forms.
- In-person casting: Aug 26, 2026, 5–8pm, Atolye, Park Slope (see §1). Casting is actively
  ramping as of retrieval.
- New co-branded programs this season (none in the 2026-08-15 internal record):
  "FWBK x Digital Fashion Week" (the Aug 26 casting), "Slayway Runway | FWBK x CTC" (LGBTQIA+
  designer showcase; FACT, verbatim from its form: "Submission Deadline: August 28, 2026.
  Slayway Runway Fashion Show: October 5, 2026"), and a "World Fashion Week" partnership
  (homepage press item dated July 6, 2026: "World Fashion Exhibition Times Square 2026…
  October 4–10, 2026… including Father Duffy Square in Times Square, Brooklyn, and other
  landmark locations").
- No response policy, no timeline, no re-application guidance published anywhere on the model
  paths.

## 10. Contradictions & uncertainties (ranked by surprise potential for a talent)

1. **Italy registration is a dead end** (sign-in wall). A talent told "register for Italy
   here" hits a wall. UNCERTAIN whether misconfigured, restricted, or deleted.
2. **Homepage marquee vs. real editions** (Paris/Canada/Africa have no forms; Queens has
   vanished entirely — it appears nowhere on the site despite the internal record listing its
   July 2026 inaugural). CONTRADICTION within FWBK's own site.
3. **Which "Brooklyn form" is canonical:** the standing Brooklyn edition form has 6 fields
   (no email); the 7-field-with-email shape recorded internally on 2026-08-15 now matches only
   the Aug 26 in-person casting form. UNCERTAIN whether the standing form was edited after
   08-15 or the internal record described the casting form. Either way FWBK cannot email a
   Brooklyn-edition registrant back — the standing form collects no email address. (High
   product relevance: the phone number is the only required contact channel.)
4. **Founding year:** bkstyle.org says "Since 2004"; fashionweekbrooklyn.com says "Since
   2006". CONTRADICTION between the org's own sites; the actively maintained site (and the
   internal record) say 2006.
5. **Stale adjacent forms:** Open Mic (only selectable dates 6/18, 7/16 — already past),
   /creatives ("early April" season called upcoming), /vendors (April 14 event as current) —
   all still linked live. Only the model/designer paths are clearly maintained.

## 11. Draft talent-facing brief (event casting — not agency representation)

Fashion Week Brooklyn's Season 2 runs October 4–10, 2026. Registering takes about two
minutes: it's a short form with your name, gender, whether you're 18 or older, phone number,
and optionally your Instagram and website. No photos, measurements, or portfolio are
required to register — FWBK's team reviews registrations and reaches out to selected models.
Note the standing Brooklyn form doesn't ask for your email, so the phone number you give is
how they'll reach you — make sure it's right. There's also an in-person casting on Wednesday,
August 26, 2026, 5–8pm at Atolye, 236B 6th Street, Park Slope, Brooklyn (that form does ask
for email). FWBK doesn't publish what happens after you register, any pay information, or a
response timeline — walking a show for a nonprofit fashion week like this is typically
unpaid, but FWBK doesn't say either way. Japan and London editions have identical forms;
the Italy link currently doesn't work.

## 12. Evidence log

All retrieved 2026-08-19 (UTC), methods: curl + headless Chromium (read-only), Google Forms
parsed from FB_PUBLIC_LOAD_DATA_. Full parse excerpts preserved in the research working file
(`scratchpad phase1/fwb-verification.md`, reproduced in the repo PR description if needed).

1. https://www.fashionweekbrooklyn.com/ — homepage: nav, marquee, hero dates, WHO WE ARE, WFW partnership item.
2. https://www.fashionweekbrooklyn.com/open-calls — category list + review-for-approval copy.
3. https://www.fashionweekbrooklyn.com/model (alias: /model-registration) — edition buttons + casting carousel.
4. https://docs.google.com/forms/d/e/1FAIpQLSd8WptzmPPd_3jEMj8o8a9lVehWghLR4zG3KXJ1qXKF4S9WEg/viewform — "FWBK • Brooklyn Model Open Call" (6 fields).
5. https://forms.gle/iQFxZSxD4Dp1W893A — "FWBK • Japan Model Open Call" (clone).
6. https://docs.google.com/forms/d/e/1FAIpQLSelw8Miv8Zy_9dsFlgWB65bpsfpQq8NC8KkUNnl9EYsBOJcXw/viewform — "FWBK • London Model Open Call" (clone).
7. https://docs.google.com/forms/d/e/1FAIpQLSc4_K-sepQw537WAjAtJoHFWXxqawT0Q6ecRuXOLMH0dO21yw/viewform — Italy link → Google sign-in wall (inaccessible).
8. https://docs.google.com/forms/d/e/1FAIpQLSeDCX6GU7TYP2ZQRF8CwgWDDBzKSrzUgG8z-A9UjqjzU6dC5w/viewform — "Models Open Call • FWBK x Digital Fashion Week" (7 fields; Aug 26 casting).
9. https://www.fashionweekbrooklyn.com/designers — designer edition buttons incl. Slayway Runway.
10. https://docs.google.com/forms/d/e/1FAIpQLSd_l_K5A1LTovgbVsZ6JP74MAKn0p8UAI8uy1ICmsO5DDpzqg/viewform — "Slayway Runway | FWBK x CTC" designer form (deadline/show dates).
11. https://www.fashionweekbrooklyn.com/registration-process (→ /registration) — designer looks/pricing; "FWBK open call casted models".
12. /stylist-registration, /beauty-team-registration, /volunteers — "not a paid engagement" boilerplate (Wix Magic Form Builder embeds, out of model scope).
13. /creatives, /vendors, /open-mic + https://forms.gle/1hn42cBJtFFb436G6 — stale-content findings; Open Mic $25 fee checkbox.
14. https://www.bkstyle.org/ — "Since 2004" + "© 2021" footer (stale parent site).
