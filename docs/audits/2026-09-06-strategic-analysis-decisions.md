# Strategic analysis — decisions, 2026-09-06

**Input:** `docs/pholio-strategic-analysis-2026-08.md` (2026-08-15, with the 2026-08-25
correction), read against `docs/pholio-product-plan-2026-08.md`, the 2026-08-08
strategic decision, the 2026-08 industry alignment audit, the Studio+ gate audit, and
the working tree at `781d8b5`.

**Perspective:** the Booker — Pholio's in-house industry seat (scout, head booker,
agency director, mother agent). Each item below is a ruling, not a summary: what the
trade actually does, what the code does today, and the call.

**How to read a verdict.** ADOPT = do it as written. ADOPT+ = do it with the stated
change. REJECT = do not do it. DONE = shipped since the analysis; nothing to decide.
VERIFY = the decision stands but the code state must be confirmed before acting.

Today is 2026-09-06. FWB Season 2 is October 4–10. Casting is ramping now.

---

## 1. The thesis (§1, §5)

**1.1 Talent toolkit is the engine; agency links are the accelerant. — ADOPT.**
This is how the trade behaves. No head booker shops for intake software; the junior
booker who triages the inbox has no budget. Models, by contrast, keep a 30-agency
list by hand and re-shoot digitals every 6–12 months. The recurring cost sits on the
talent side, and it exists whether or not one agency ever joins.

**1.2 Kill every pay-to-be-seen mechanic. — DONE, with one blocker left.**
The pool gate, the quota lift, and the 20-agency directory slice are gone (Studio+
gate audit §A, verified again today: `application-quota.js` is a flat 5/month,
`agencies.js` serves the full directory, `pool-status.js` reads `is_discoverable`
only). What is still live and agency-visible: `views/portfolio/show.ejs:1` forks the
whole public portfolio on `is_pro` and prints a "Studio+" badge to the recipient.
Ruling: that fork is the one remaining violation of the invariant "anything an
agency sees is identical for every talent," and it blocks any paid relaunch (§9 below).

**1.3 The agency pitch is the official link, not "manage applications." — ADOPT+.**
Correct, and it needs the booker's half. A head booker does not lie awake about
impersonation; the junior does not either. What they hate is the inbox: HEICs that
will not open, retouched glamour shots sent as digitals, no height, stats in inches
only from a Paris applicant. The pitch that lands in the room is: *"One official
link. Every applicant arrives with dated digitals, stats in cm and inches, in your
slot order, in a format your form accepts. Free. CSV out."* Lead with conformance
and the exit ramp; impersonation defence is the second sentence.

**1.4 Plan Studio+ at 2–4% conversion. — ADOPT.** With a free tier that can run a
full 30-agency campaign, nobody pays for reach. The $75–200/yr "website fee" models
already pay their agency is the only price anchor that exists.

---

## 2. Fashion Week Brooklyn (§6)

**2.1 FWB is a channel and a design partner, not a customer and not the thesis. — ADOPT.**
A model walking a nonprofit week is not applying for representation. Never let the
consent, the review states, or the talent's expectations blur. The code already
forks event consent from representation consent, and the unreachable event terms
were fixed on 2026-08-25.

**2.2 Two-stage selection (organizer pool → designer pick lists) is the minimum. — DONE.**
This is the real regional-week workflow. The organizer vets; each designer picks a
lineup from the vetted pool. Built, including the no-login designer page.

**2.3 18+ gate stays on for Season 2. — ADOPT.** Regional weeks do cast 16- and
17-year-olds, and FWB's own form asks "18+?". But casting a minor for a runway
without a guardian record, a permit on file, a chaperone requirement, and hours
limits is exactly the liability the industry has spent a decade cleaning up. The
`minor_permits` table exists and is unused; that is phase 2 (§6.3 below), not a
toggle to flip in September.

**2.4 Defer fittings, look assignment, walk order, run-of-show. — ADOPT, resolving the
conflict with the 2026-08-08 memo.** The 08-08 memo called fittings and run-of-show
"the wedge"; the 08-15 analysis defers them. The Booker sides with deferral, on
trade grounds: at the regional tier, fittings are a rack and a group chat, and
run-of-show belongs to the show producer and the backstage lead, not the caster.
Where a regional week actually bleeds is the casting loop: a pool, picks, confirms,
and the no-shows on the day. That loop is built. Build fittings only if the week-4
signal (§5.1) is positive.

**2.5 Compensation disclosure on every event call. — DONE, one sentence missing.**
`compensation_type` (paid / unpaid / stipend) is mandatory on an event call. Add the
line the unagented applicant most needs and the industry audit flagged: *"Pholio
does not collect, hold, invoice or enforce this payment."* An applicant with no
booker to chase a stipend must be told who is and is not on the hook.

**2.6 Real intake spec (digitals slots, height and measurements, availability
window, walk video). — VERIFY the walk video.** Digitals slots, measurements, and
the availability window exist. A walk video is what separates a runway casting from
a portfolio review; a designer cannot pick a lineup from stills. Confirm it is
accepted end to end (upload cap, playback on the pick-list page) before casting
opens, or say plainly that Season 2 runs on stills.

**2.7 Get FWB's actual Google Form response counts. — ADOPT, still open.** The
100–200/week figure is unverified. The launch plan survives at 25/week; set
expectations there until the number is in hand.

---

## 3. The submission package (§7)

**3.1 Preflight + conforming export + tracker is the talent core. — DONE.** Shipped
2026-08-14 (the analysis missed it; the 08-25 correction records this). What remains:
the public per-agency requirement pages (the marketing repo's `app/agencies/page.tsx`
is a stub; the app now serves the registry publicly as of 08-25) and the off-Pholio
half of auto-lapse.

**3.2 Spec Pack rulings, from the booker's chair:**

- **"Verified on ⟨date⟩" must be visible to the talent, not just stored.** Specs rot.
  Agencies re-open calls seasonally (September and February) and change forms
  between seasons. A model sending a Q4 package against a Q1 spec is the failure the
  product exists to prevent. Re-verify the whole pack after each fashion month at
  minimum, not "one day a month" as §12 budgets.
- **The eligibility mirror shows published ranges only, never Pholio's own floors.**
  Standards §4 is explicit: fashion ranges exclude curve, petite, commercial, fitness,
  mature, and kids, which is most of the market. Print what the agency publishes,
  with the source, and nothing else.
- **Drop file naming from the pitch. — ADOPT.** No agency publishes a convention.
- **Auto-lapse window.** Only Storm publishes a policy. The folk norm bookers actually
  operate by: no response inside 6–8 weeks is a pass; re-apply after six months with
  new digitals. Set the tracker to flip at 8 weeks and open the re-apply window at
  6 months. Never phrase it as the agency's policy unless the agency set one.
- **The telemetry flywheel is for outreach only. — ADOPT+.** "41 people prepared IMG
  packages last month" is a strong cold email to IMG. It is a relationship-ending
  number if it ever appears on a public page or in a competitor's hands. Per-agency
  counts stay internal; the public requirement page shows the spec and the
  verified-on date, nothing about volume.

---

## 4. Legal posture (§8)

**4.1 Payment never buys guidance, access, visibility, or distribution. — ADOPT.**
The one rule; it is also the community's own scam test. Four AI writers are already
free, comp-card import is free, export is free.

**4.2 NY-first with California geofenced pending counsel. — ADOPT as interim, with a
deadline.** California is Los Angeles: the second US market and the whole commercial
and lifestyle board. A permanent geofence amputates the talent who most need print
comp cards. Get the counsel opinion and decide between restructuring and the ~$500–
2,000/yr bond premium before the Studio+ relaunch, not after. Note the geofence does
not exist yet (gate audit §E: no jurisdiction gate in checkout).

**4.3 No face templates; duplicate-applicant detection is biometric. — ADOPT, hard.**
Bookers do not detect duplicates by face. They do it by name, Instagram handle, date
of birth, and height. That is the non-biometric dedupe that works in practice, and
it is the only one to build.

**4.4 Minors are phase 2, done properly. — ADOPT (see §6.3).**

**4.5 Verified-agency layer and official-link display. — DONE (registry ingestion,
`agency_verifications`, impersonation defence). Consent/rights ledger — keep as a
free record, not a product; the talent-facing surface shipped 08-25.**

---

## 5. Kill criteria and sequencing (§10, §11)

**5.1 The single metric: FWB abandons its spreadsheet by week 4. — ADOPT+, made
observable.** "Abandons the spreadsheet" is not a thing you can read from a database.
The measurable version, at a regional week, is whether designers confirm lineups
through the pick lists or the organizer exports a CSV and goes back to Google
Sheets. Define the go signal as: at least half of designers' confirmed lineups
recorded through pick lists, and organizer confirmations sent from Pholio rather
than retyped. Funnel instrumentation (`event-funnel.js`) exists to read it.

**5.2 Stop criteria (D30 return <10%, no second recipient, no unprompted link
request). — ADOPT.** The second-recipient number is the one the Booker would watch
hardest: a model who exports a second package has understood the product; a model
who only applied to FWB filled in a form.

**5.3 Sequencing as of today.** Step 1 (compliance deletions) is done except the
portfolio fork. Step 2 (event mode) is built. Step 3 (talent core) is built except
the public pages and off-Pholio lapse. Step 4 (agency #2 and #3) is outreach, not
code, and should start now with the §1.3 pitch. Step 5 (Studio+ relaunch) is gated
on Phase 7 (§9). Nothing on the hold list should move.

---

## 6. The talent product (§9.2)

**6.1 Keep the comp-card engine and make the free default excellent. — ADOPT.** The
comp card is the artifact bookers hand across a desk; a free card that looks cheap
costs the model the go-see. Correct geometry (5.5×8.5 US, A5 international), four
images on the back, stats in both units. The industry audit's P0 that every card
prints "Direct Bookings" over the model's personal phone could not be confirmed fixed
in this session (no commits touched the cited files since 2026-08-29; the string
survives only in a test fixture). **VERIFY before the next card ships.** A
represented model's card carries the agency's line, never a personal number.

**6.2 Per-recipient share tokens with open tracking. — ADOPT+.** "Did Marilyn open my
book" is the most emotionally valuable event Pholio can show. Show *opened* per
recipient link and the date. Never show who at the agency, how long, or how many
times. Bookers tolerate being counted; they do not tolerate being watched, and the
model who mentions it in the room loses the room.

**6.3 Open-call calendar. — page DONE (08-25); the data is not credible yet.** Rows
are hand-curated with no write path. A calendar row that a booker would recognise
carries: the board (Women / Men / New Faces / Curve), the age range the agency
publishes, walk-in versus appointment, what to bring (digitals, stats, no book), and
the verified-on date. Without those it is a list of addresses. Add the fields before
adding a write path.

**6.4 Remove archetype/vibe AI, reveal remnants, profile-strength theatre. — ADOPT.**
No booker has ever asked a model for their archetype.

**6.5 Seeded real agencies become reference entries with a "prepare and submit on
their site" action. — DONE.** This was the single most important honesty change in
the plan and it shipped.

**6.6 Usage-rights ledger later; parent accounts with minors. — ADOPT the sequencing.**
For unrepresented talent the rights ledger is real: they sign releases with no agent
reading them. Keep it a record of what was signed, never a negotiation tool. Pholio
is not the agent.

---

## 7. The agency product (§9.3, §9.4)

**7.1 The scope line: Pholio ends when a decision is made. — ADOPT, and write it into
`PRODUCT.md`.** `PRODUCT.md:12` still says agencies "schedule interviews" and run
"their entire roster workflow"; the plan puts both outside the line. The plan wins.
Reconcile the document so the next agent does not rebuild the booking desk.

**7.2 Booking desk, commitments, interviews, reminders as scheduling. — DONE as
routes; finish the amputation in the schema and the read paths.** The industry audit
§3.1 is right: `talent_commitments` is read by the dossier, and `CalendarLine.jsx:48`
still tells a booker "No bookouts, options, or holds on record" for a system that
cannot hold an option. That is a false calendar claim on an agency surface. Drop the
read paths and the two sentences. Do not build the desk. Options and holds are the
calendar engine of an agency, and every agency already has one; a second calendar
is the "second inbox" problem with higher stakes.

**7.3 The option/hold TTL machine, declined. — ADOPT the decline.** It is deal
tracking, and its buyers are the incumbents' core users.

**7.4 Discover. — ADOPT+, overriding the analysis's "kill or invite-only."** The
analysis told us to keep at most opt-in invite-to-apply; the Scout room and the
semantic Discover shipped on 2026-09-02 and 09-03 instead. The Booker's ruling is
that Discover is defensible as built, because it is how scouts already work (they
browse), under four conditions that must hold as invariants: opt-in only
(`is_discoverable`, verified); no ranking or surfacing by paid tier (agency domain
has zero `is_pro` reads, verified); matching on declared fields and technical image
assessment only, never inferred traits or "potential"; and no minor surfaces without
the named-agency guardian authorisation already enforced. Two additional rulings:
keep showing the brief's filters rather than a score (the 09-02 commit "Show the
brief's filters instead of the parser's reasoning" is the right instinct; bookers do
not trust "87% match" and will not defend it to a director), and the only action off
a Discover card is invite-to-apply. Dossier access comes from a submission.

**7.5 Season memory ("applied SS26; since then new digitals, +2cm, now 18"). — ADOPT.**
This is the "kept on file" promise made real, and it is exactly the diff a booker
wants when a name comes back. It is also the part no single-tenant incumbent can
hold.

**7.6 Close the signing loop. — ADOPT (industry audit §3.2).** Today `represented`
writes one string on an application row. The decision the scope line ends *at*
should produce a real `talent_representations` row with market, board, and start
date, confirmed by the talent. Without it the signing agency reads its own model as
unrepresented in Discover. This is inside the line by the plan's own logic and is
the highest credibility-per-effort item on the agency side.

**7.7 Casting boards stay as labels; no scoring, weights, or fairness apparatus.
— ADOPT.** A board is a board. A number next to a face invites the LL 144 question
and answers none of the booker's.

**7.8 CSV export is the adoption feature. — ADOPT, promote it.** It exists
(`inbox.js:3686`). The agency that can leave is the agency that stays.

---

## 8. Net-new opportunities, ranked (§9.6) and the moat (§9.7)

| # | Item | Ruling |
|---|---|---|
| 1 | Conforming export + Spec Pack | DONE; maintain per §3.2 |
| 2 | Verification rail | Core DONE; public SEO pages remain (marketing repo) |
| 3 | Event mode | Built; §2.5 sentence and §2.6 walk video to verify |
| 4 | Auto-close as an invented norm | ADOPT with the 8-week / 6-month windows in §3.2 |
| 5 | Open-call calendar | Page DONE; fields per §6.3 before any write path |
| 6 | Machine-readable comp card | ADOPT+ quietly. Agencies receive a PDF by email and paste it into Mediaslide; an embedded payload matters only if their software reads it. Ship correct geometry and a stats block first, embed the structured payload because it is cheap, and build no strategy on it |
| 7 | Rights/consent ledger | Keep free; a record, not a product |
| 8 | Minors, phase 2 | ADOPT with a real gate: guardian record verified, `minor_permits` written and read, chaperone and hours flags, and no body measurements on any agency-visible surface for a minor. Not before the FWB signal is read |
| 9 | Apple Wallet pass | Already shipped (2026-09-03). Do not extend it |

**Moat rulings.** Spec Pack drift telemetry and cross-side application history are
the two that compound; both are live. Response-latency data: publish nothing
per-agency without that agency setting its own response policy in Settings
(A4 #11). A "typically reviews within N days" line the agency wrote is trust; the
same line Pholio inferred is a shame index, and the first head booker who sees it
pulls the link.

---

## 9. Studio+ (§9.5)

**9.1 The paid list (editions engine, 300dpi print and low-quantity fulfilment,
custom domain, storage, intel history, digitals archive). — ADOPT with emphasis.**
Print fulfilment of 10–20 cards is the strongest item: commercial and regional
bookers still ask for a physical card at a go-see, print shops sell in 50s, and a new
face needs ten. That is a physical good and unambiguously not access. The digitals
archive is the second: a mother agent asks "show me last season's digitals." The
custom domain is the weakest: agencies do not visit model websites; the book link is
what travels. Keep it, do not lead with it.

**9.2 $9.99/mo, ~$96/yr. — ADOPT.** It sits inside the normalised website-fee band.

**9.3 Relaunch only after Phase 7 closes. — ADOPT, and Phase 7 is not closed.** The
gate audit's worklist still has the portfolio fork (§1.2), the live Stripe product
description, and the settings upsell copy. The portfolio fork is agency-visible and
therefore the blocker; the other two are one-line fixes plus a Stripe re-provision.

---

## 10. Conflicts between governing documents (industry audit §8) — rulings

1. **PRODUCT.md vs the plan on scope.** The plan wins (§7.1). Edit `PRODUCT.md`.
2. **The `industry` skill says agencies "track commissions."** Wrong for Pholio; the
   table was dropped in July. Correct the skill so no agent rebuilds it.
3. **"Go-See Requested" (`applicationStatus.js:106`).** A go-see is a meeting with a
   client or casting director. An agency asking to meet a model is "Meeting
   requested." Change the talent-side label and the language skill's product-facts
   entry together; domain truth defers to industry per `CLAUDE.md`.
4. **"getting scouted" in the glossary vs the banned-language list.** The banned list
   wins for product copy. Remove it from the glossary's wrong→right table as a
   product term; keep it only as a description of the scouting pipeline.

---

## 11. Open items that precede everything

- The industry audit's four P0s (comp-card "Direct Bookings" over a personal phone;
  unavailable talent shown as "Available"; two paths printing a minor's bust, waist,
  and hips; the shoe converter off by roughly two). No commit has touched the cited
  files since the audit was written. **VERIFY, then fix, before any agency-facing
  work.** Each would cost the trust of a working booker or a working model on first
  contact, and none depends on a scope decision.
- FWB form counts (§2.7).
- The walk video (§2.6).
- California counsel (§4.2), before the paid relaunch.
