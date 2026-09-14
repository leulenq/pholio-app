# Pholio UI shots: manifest

Stack: scratch SQLite `../ui-stack/deck.sqlite3`, Express :3100, Vite :5175 (`VITE_API_PROXY_TARGET=http://localhost:3100`), local uploads. Start with `source ../ui-stack/env.sh`. Drivers are in `../ui-stack/tools/` (`shot-deck.mjs` for jobs, `shot-flow.mjs` walks the open-call flow). Copy them to the repo root to run them, because they need puppeteer.
Agency: Meridian Model Management (fictional, New York). Desktop is 1600x1000 @2x. Mobile is 390x844 @3x.
Every person, email and phone number is fictional (555 numbers, example.com). Photos are Unsplash crops, and each applicant's frames are crops of a single photo.

## Screens

| File | Route | Shows | Caveats |
|---|---|---|---|
| 01-submissions-grid.png | /dashboard/agency/submissions | To Review book, 8 cards, 82% pass rate | Captured with the event applications temporarily withdrawn. The pass rate comes from 32 older rows inserted directly. Elena and Noor applied after this shot. |
| 02-review-room-stage.png | ?review=Amara | Review Room stage | Re-checked, clean |
| 03-review-room-pass-armed.png | same | Pass armed, board full | Clean |
| 04-review-room-offer-armed.png | same | Offer armed | Re-checked, clean |
| 05-noaccount-mobile-s01-empty.png | /opencall/h9TwXlhoEB23fU9a | Arrival screen, no-account mode, question 1 of 11 | |
| 05-noaccount-mobile-s02/s03/s05/s06.png | same | Date of birth, gender tiles, height, measurements (one question per screen) | |
| 05-noaccount-mobile-s09.png | same | Email and phone | Short email (elena.m@example.com) because a long address overflows at 390px (see bugs) |
| 05-noaccount-mobile-s10-empty.png / s10.png | same | Photo step, empty and filled | The hint text overlaps "10 OF 11" at 390px (product layout bug) |
| 05-noaccount-mobile-sent.png | same | Application sent | Real submission (Elena Marchetti) |
| 06-eventcall-mobile-s01-empty.png | /opencall/9qtGRw9x_1-x4kom | Event call arrival (dates, pay, 18+) | The dock covers the end of the long first screen |
| 06-eventcall-mobile-s02.png | same | 18+ attestation affirmed | |
| 06-eventcall-mobile-s09.png / s09-bottom.png | same | Consent screen, top and with all three confirmations checked | Use this consent screen. The representation call shows event terms (bug), so its consent shot was dropped. Not sent. |
| 07-noaccount-desktop-s01-empty.png / s10.png | representation call | Desktop arrival and filled photo step | Draft only |
| 27-claim-page-mobile.png / 27b-claim-page-desktop.png | /opencall/claim/:token | "Noor, this is yours to keep." | Token minted with `mintClaimToken` (Noor Haddadi, event call) |
| 28-materials-page-mobile.png / 28b-...-desktop.png | /opencall/materials/:token | Shortlist materials ask: walk video, availability, measurements | The request was made through the real agency route. A second token was minted and bound with the app's own functions, because the route only emails the link. Due date shows Sept 21 for a Sept 22 request (timezone). |
| 08-settings-open-call-links.png | settings?tab=open-call | Live links with brief, funnel counts, Copy / Edit brief / Pause / Revoke | Funnel counts are seeded (see bugs). URLs show localhost. The green "Active" pill is visible. |
| 09-settings-requirements-builder.png / 09b-...-eligibility.png | settings?tab=requirements | Builder: 4 shots, 5 look rules, 2 applicant requirements; publishing panel | Saved as an unpublished draft. Publishing locally fails because the link URL is http, not https. |
| 10-submissions-lineup-6.png | submissions, Line up | Side by side, 6 women, headshot tab | Every applicant shows shoe 8.5 US (seed sameness) |
| 11-signing-board-wall.png / 12-signing-board-ledger.png | /signing/<Women board> | Wall and ledger | |
| 13-event-call-pool.png | /events/<Atelier Vey> | Pool, 9 on the desk | Header counts read 0 (bug) |
| 14-event-call-designers.png | same, Designers tab | Pick list: Opened 4 times, 2 picked, 1 maybe, 1 passed | Marks were made on the real public page |
| 15-designer-picks-desktop.png / 16-...-mobile.png | /picks/:token | Designer pick list with marks | Event dates show Oct 7–8, should be Oct 8–9 (bug) |
| 17-agency-messages-thread.png | /messages | Hazel thread (offer and Thursday meeting) plus Jonah and Leila threads | Agency messages were sent through the API. Talent replies were inserted in SQL because claimed talents have no password. Thread labels read "Application #5226". |
| 18-team-and-roles.png / 18b-team-seats-permissions.png | /team | Team cards, seats and permissions | Seed emails renamed to @meridian.example |
| 19-settings-export-webhook.png | settings?tab=export | Endpoint URL typed in, not saved | Thin page |
| 20-talent-applications-tracker.png | /dashboard/talent/applications | Hazel's submission history: 2 Pholio, 3 logged elsewhere | Cropped to start at "Submission history", because the Market list above it names real agencies (Wilhelmina, Elite, Ford, IMG and others). Do not use uncropped Market shots. |
| 21/22/23/24-talent-apply-*.png | /dashboard/talent/applications/apply → Harbor | Board choice, digitals readiness, comp card, review and send | Harbor's and Northline's seed descriptions said "A fictional agency used only for Pholio demo data" and were rewritten in the DB. Draft only. The program notice has a "BEFORE YOU SUBMIT" kicker (banned pattern). |
| 25-comp-card-preview.png | :3100/pdf/view/hazel-moreau | Comp card HTML, front and back | Cropped to card width. All images come from one photo. Footer shows localhost:5175. |
| 26-public-portfolio.png | :3100/portfolio/hazel-moreau | Public portfolio | AGE shows 18+ because claimed profiles have no date of birth (bug). The lower panel is mostly empty. |
| 29-agency-overview.png / 29b-...-lower.png | /dashboard/agency | Greeting, top matches, boards table, activity, team | "Nothing waits on your read" although about 21 are on the desk. "Declined · 27" comes from the inserted history rows. |

## Scratch-DB changes (not in source)
- `is_primary=1` set on the headshot of 11 claimed profiles (bug 1)
- Arrivals (41 and 23) and consumed claim rows inserted for both links (bug 4)
- Hazel: password hash copied from the seed talent, `onboarding_completed_at` and `unlock_celebrated_at` set
- Agency seed descriptions rewritten; team emails changed to @meridian.example
- Three tracker entries for Hazel (API); talent message replies (SQL)
- New applicants through the real flow: Elena Marchetti (representation, unclaimed) and Noor Haddadi (event, unclaimed, materials requested)
- Designer marks on the pick list; requirements draft saved

## Product bugs found (no source edits)
1. **Claimed profiles get no primary image.** `src/domains/opencall/services/claim.js:333` sets `is_primary: shotType === "headshot" && inserted === 0`. Full length is promoted first, so the headshot is never primary. Overview "Top matches" (inbox.js ~4355) and other places reading `is_primary` show blank tiles.
2. **Agency send-message returns 500 after saving.** `src/domains/agency/routes/messages.js:360` has `.where({ id: messageId })` on a query joined to `users`, which makes `id` ambiguous (fails on Postgres too). The UI says "Failed to send message" even though the message was stored.
3. **Representation open calls show event consent** (event terms, designers, "what this event pays", 90-day event retention). `client/src/domains/opencall/components/consentCopy.js:128` `buildConsentCopy` always uses `EVENT_CASTING_DISCLOSURE_COPY`.
4. **Open-call link funnel ignores no-account applicants.** `src/domains/agency/routes/open-call.js:136-152` counts only `agency_open_call_arrivals` and `agency_open_call_claims`. Account-optional visits and submissions never write those tables, so live links read "0 arrivals · 0 submissions".
5. **Refresh-digitals request for an unclaimed applicant crashes.** It queries `open_call_submission_media.application_id`, a column that doesn't exist (500 from `/request-materials` with `kind: refresh`).
6. **Date-only values render a day early in US timezones.** The pick list shows Oct 7–8 for an Oct 8–9 event. The materials page due date shows Sept 21 for a Sept 22 request.
7. **Event call header counters** (To review / Pool / Offered / Confirmed) all read 0 while 9 applicants are on the desk.
8. **Claimed and unclaimed open-call applicants have no date of birth** (applicant-identity `dateOfBirth: null`). Cards show "Age not recorded" and the portfolio shows "18+".
9. **The line-up shows an unclaimed applicant as "Unknown applicant", "Not sent"** (Clara Whitfield).
10. **Layout at 390px:** the photo-step hint overlaps the progress label, and a long email overflows the large input.
11. Minor: talent Market lists real agency names; "BEFORE YOU SUBMIT" kicker; message threads labelled "Application #5226"; green "Active" pill on open call links.
