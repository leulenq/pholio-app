# Lane 5: Intel, Messages, notifications, transactional email, toasts, server errors · audience: both

## Verdict

This slice is the most carefully written part of Pholio I have read and also the part most likely to
get the company into trouble. The email family (decline copy, guardian consent, billing, security),
the decline-reason taxonomy and the auto-close *record* are genuinely excellent — several strings are
better than what real agencies publish, and the module comments show someone has thought hard about
not putting words in a booker's mouth. But the same layer repeatedly narrates agency intent from
events that never happened. The single biggest failure is structural, not verbal: **Pholio knows
whether an agency opened a submission (`applications.viewed_at`) and shows that truthfully on the
Intel page, while the bell, the applications tracker, the Messages header and the status vocabulary
all say "Under review — the agency is reviewing your submission" from the second the talent presses
send.** A model can therefore read, on the same afternoon, "Elite is reviewing your submission",
"Elite · 34d · late", and "Long past — treat as closed". Underneath that sit three claims a
professional would flag on sight: two headline Intel metrics that count nothing or count the talent's
own clicks; a materials request emailed as *"{Agency} shortlisted you"* when no shortlist happened;
and a live, routed OAuth flow that generates `Math.random()` follower counts, writes them to the
profile, and toasts *"Instagram account verified!"*. Add developer error strings that tell a booker to
`npm run migrate` and the impression flips from "fashion-house software" to "someone's staging build".
These are all small, local fixes — the writing quality to fix them is already in the repo.

---

## Findings

### L5-01 [P0] [CLAIM] "The agency is reviewing your submission" is asserted the instant the talent presses send

- **Where:**
  - `src/shared/services/notifications.js:311-316` (`applicationStatusCopy`, `pending`/`submitted`)
  - `src/shared/services/notifications.js:413` (`notifyTalentApplicationSubmitted` body)
  - `client/src/domains/talent/utils/applicationStatus.js:60-86` (`pending`/`submitted`/`reviewing`)
  - Reachable via: `POST /api/talent/applications/.../submit` → `src/domains/talent/routes/applications.js:1941`;
    rendered in the talent bell (`TalentSignalPanel`), on `/dashboard/talent/applications`, and in the
    `/dashboard/talent/messages` conversation cue (`MessagesPage/index.jsx:341`).
- **String/state:**
  - Bell title `"Application under review"`, body `` `${agency} is reviewing your submission.` ``
  - Submit receipt: `"Application submitted"` / `` `Your application to ${name} is in review.` ``
  - Status label `"Under Review"`, `next:` `"The agency is reviewing — we'll notify you the moment this changes."`,
    `detail:` `"The agency has your current profile and book."`
- **Data behind it:** none. `applications.status` is `submitted` at insert. The only read signal,
  `viewed_at`, is stamped only when an agency member opens `/details` or the dossier
  (`src/domains/agency/routes/inbox.js:4053-4055`, `talent-dossier.js:59-61`). Nothing consults it here.
- **Industry reality:** eleven of twenty-four sampled intake surfaces pre-emptively tell applicants
  they will hear nothing; ONE forbids status enquiries outright (R1 §3 table). R1 §8 names
  `"Application status: Under review"` explicitly as language that "implies a service level no agency
  offers", and R0 §21 rules that a platform may report events with the observer named but may not
  assert intent. R4 §3.4: the industry's own tool (Casting Networks) hides even *Selected* behind a
  paid tier precisely because inferred status creates false expectation.
- **Why it fails:** it is the one sentence a working model would test against reality, and Pholio
  already holds the answer. It also converts Pholio's silence into an implied agency promise, which is
  what the auto-close feature exists to undo.
- **Fix:** drive this label off `viewed_at`, which is already loaded on the same rows. Three states,
  no inference: `"Sent · not opened yet"` → `"Opened by {Agency}, 2 Sep"` → the real status. Bell body
  on submit: `` `${agency} has your submission. Most agencies reply only if interested.` `` Delete
  `"we'll notify you the moment this changes"` — Pholio cannot notify on a decision the agency never
  records.

### L5-02 [P0] [CLAIM] A live mock OAuth flow fabricates follower counts and tells the talent the account is "verified"

- **Where:** `client/src/domains/talent/pages/ProfilePage/SocialSection.jsx:133`;
  `client/src/domains/talent/pages/ProfilePage/MockConsentPage.jsx:130` ("Your {Platform} account is
  now verified"); server `src/domains/talent/routes/social-oauth.js:50-64`.
  Reachable via: routed at `App.jsx:94` (`/socials/oauth/mock/:platform`), opened by the "Connect"
  button on the live Profile → Socials section; server route mounted in
  `src/domains/talent/routes/index.js`.
- **String/state:** toast `` `${p.name} account verified!` ``; modal `"Authorization Success!"` /
  `"Your Instagram account is now verified."`; consent copy `"access your basic profile info, media
  count, and follower metrics."`
- **What the code does:**
  ```js
  const mockFollowers = Math.floor(Math.random() * 240000) + 10000;
  const mockEngagement = parseFloat((Math.random() * 7 + 1.5).toFixed(2));
  ```
  …written to `social_accounts.follower_count` / `engagement_rate` / `metrics_data` (with invented
  audience demographics `{male: "42%", female: "55%"}`), `is_oauth_connected: true`, and summed into
  `profiles.social_reach` (`social-oauth.js:8-12`). Agencies filter on
  `min_social_reach` (`src/domains/agency/routes/inbox.js:594`).
- **Industry reality:** R5 §2 — "verified" must name a mechanism; R2 §4.4 — follower count is a real
  internal booking filter (Syngency's Advanced Talent Search), so a fabricated number is not cosmetic.
  R5 §5.5 — FTC v. Explore Talent settled at $500k on exactly the pattern of representing platform
  data as something it is not.
- **Why it fails:** the product asserts verification it has not performed and stores randomly
  generated audience data as fact about a real person, on a surface an agency can screen against.
  Nothing in the UI says "simulated".
- **Fix:** until a real Phyllo/Meta connection ships, remove the flow from the Profile page or gate it
  behind a dev flag. If it must stay for demos, the toast becomes `"Handle saved (demo connection)"`,
  the modal drops the word *verified*, and the server must not write `follower_count`,
  `engagement_rate`, `metrics_data` or `social_reach` at all. A handle with no number is honest; a
  number nobody measured is not.

### L5-03 [P0] [LEAK] Developer remediation instructions are shown to talent and bookers as error copy

- **Where:** `client/src/shared/lib/api-error-message.js:17-45`; upstream
  `src/shared/middleware/error-handler.js:193-254`.
  Reachable via: `MediaWorkspace.jsx:796` (upload failure), `ProfilePage/index.jsx:450,672,696,734`
  (profile load/save/sync failure) — the two highest-traffic talent surfaces.
- **Strings:**
  - `"Pholio cannot reach required database tables. Run migrations locally, then reload this page and try again."`
  - `supportingMeta: 'From the project root: npm run migrate'`
  - toast: `"Database setup required — run npm run migrate"`
  - `"Production image storage (Cloudflare R2) is not set up. Add R2_BUCKET and credentials to Netlify, then redeploy."`
  - server: `"Database tables do not exist. Please run migrations to set up the database."` /
    `"Unable to connect to the database. Please check your database configuration."`
- **Industry reality:** first principles — R5 §5.4 lists the trust signals a working model or booker
  actually checks, all of which are about the operator looking like a real business. Nothing in R1–R5
  needs to be cited to know that a booker told to add `R2_BUCKET` to Netlify concludes the product is
  someone's side project.
- **Why it fails:** it is the single fastest way to lose a vetted agency, and it is unconditional —
  none of these are gated on `NODE_ENV`.
- **Fix:** one user-facing sentence per class (`"Uploads are temporarily unavailable. Nothing you
  added was lost — try again shortly."` / `"Pholio is having trouble reaching your data. Try again in
  a moment."`), with the operator detail moved into the server log and `reportError`. Gate the
  migration/R2 branches behind `import.meta.env.DEV`.

### L5-04 [P0] [CLAIM] A materials request is emailed as "{Agency} shortlisted you" when no shortlist occurred

- **Where:** `src/shared/lib/pholio-email/templates-materials.js:70,78,105,121`; subject built at
  `src/domains/agency/routes/materials.js:505`.
  Reachable via: `POST /api/agency/applications/:id/materials` — the "Ask for more" action in
  `ReviewRoom`/`ApplicantsPage`.
- **Strings:** subject `` `${agencyName} shortlisted you — a few more things` ``; headline
  `"{Agency} shortlisted you."`; body `"You are through the first read"`; footer
  `"…you applied to {Agency} through Pholio and they shortlisted your application."`
- **State behind it:** the endpoint writes a `material_requests` row and sets status
  `requested_more`. There is **no shortlist precondition anywhere** in the handler
  (`materials.js:330-460`) — an agency can request materials from any application in the inbox,
  including one it has never triaged.
- **Industry reality:** R2 §2 — *shortlisted* is "the only inbound-prospect status agencies publish"
  (Storm: "we will only contact those who have been shortlisted"). It is the one word in this domain
  that carries a real, published meaning, and R1 §3 shows agencies use it as a *terminal* screening
  outcome, not as a synonym for "asked a question".
- **Why it fails:** it manufactures the most consequential status word in intake out of an
  administrative action, and the identical event produces a *different* claim depending on plumbing:
  an account-holder gets `"{Agency} asked for more"` (`email.js:495`), an unclaimed applicant gets
  `"{Agency} shortlisted you"`. Same click, two stories.
- **Fix:** use the accurate headline for both — `"{Agency} asked for more."` / `"Before they decide,
  they need a few more things from you."` Reserve *shortlisted* for the `shortlisted` status. If the
  no-account variant needs its own template, it should differ only in the CTA destination (which is
  the file's own stated rationale, `templates-materials.js:5-25`).

### L5-05 [P0] [STATE] The representation-offer email is headlined "wants to sign you" and stamped "Signed"

- **Where:** `src/shared/lib/pholio-email/templates-submissions.js:58-65`.
  Reachable via: `src/domains/agency/routes/inbox.js:1674` and `roster.js:116`
  (`sendApplicationStatusEmail(status: "accepted")`).
- **Strings:** headline `"{Agency} wants to sign you."`; standing band `"Signed"`; body
  `"Nothing's agreed until you've spoken to them and read whatever they send you."`
- **Industry reality:** R2 §1.4 — the sequence is *offer of representation → contract signed → placed
  on a board*; "an agency signs, a model accepts". R2 §3.3: representation offered is reversible and
  obligates nobody; contract signed obligates both, caps commission at 20% and starts NY FWA duties
  (R5 §3.1). R4 §2.4 lists `accepted` as a word that "implies a symmetric agreement" where the reality
  is asymmetric selection.
- **Why it fails:** the standing band contradicts the body of its own email. A model who reads
  "Signed" in a bordered status band and forwards it to a mother agent has been told, by Pholio, that
  a contract exists. Three renderings of one event also disagree: the bell says `"Representation
  offer"` (`notifications.js:335`), the subject says `"Representation offer from X"`
  (`email.js:226`), the body says `"wants to sign you"` and the band says `"Signed"`.
- **Fix:** headline `"{Agency} has offered you representation."`, standing `"Offer — not yet signed"`,
  keep the excellent closing advisory. Reserve `"Signed"` / `"Represented"` for the `represented`
  status.

### L5-06 [P1] [CLAIM] The Intel headline stat "agency reviews" counts a stream nothing writes

- **Where:** `client/src/domains/talent/pages/IntelPage/blocks/AttentionBlock.jsx:25,86,110`;
  `MomentumBlock.jsx:19-25,412`; server `src/domains/talent/services/intel/pipeline.js:86-97`,
  `compose.js:208,266`.
  Reachable via: `/dashboard/talent/intel` (`App.jsx:133`).
- **String/state:** `<Stat value={agencySignal} label="agency reviews" />`; weekly bar series
  `{ key: 'reviews', label: 'Agency reviews' }` (`WeeklyBars.jsx:84`); dormant verdict
  `"Nothing has moved … no agency opened a submission, and nobody pulled your card"`
  (`MomentumBlock.jsx:48-49`).
- **Data behind it:** `tier12Counts` increments `reviews` only on
  `application_activities.activity_type === 'profile_viewed'`. A repo-wide search finds **no writer of
  that row anywhere in `src/`** — the only producer is `scripts/seed-mia-intel.js`. In production
  `reviews` is always 0, so `agencySignal = reviews + advances` silently reports *advances* under a
  label that says *reviews*, and the "Agency reviews" weekly bar is always empty.
- **Industry reality:** R0 §21 — a platform may report "Opened by Elite NY, 2 Sep"; it may not report
  a count it did not observe. Pholio does hold the observation (`viewed_at`) and uses it correctly two
  blocks away (`conversion.js:97`, the ReadClock "already read" stat).
- **Why it fails:** the most consequential number on the page is structurally zero, and the dormant
  verdict then tells a model whose submission *was* opened five times that "no agency opened a
  submission". That is a false negative about the one event they care about.
- **Fix:** derive reviews from `applications.viewed_at` (first read) plus, if per-open granularity is
  wanted, start writing a `profile_viewed` activity at the two places `viewed_at` is stamped. Until
  then, drop the `reviews` key from `composition` and `WeeklyBars` rather than shipping an empty
  labelled series.

### L5-07 [P1] [DATA] "Card pulls" and "Link opens" count the talent's own downloads and clicks

- **Where:** `src/domains/talent/services/intel/attention.js:55-56,63-80,198-216`;
  writers `src/domains/pdf/routes/pdf.js:2374-2383` (`logAnalyticsEvent(profile.id, "download")`) and
  `pdf.js:3665-3672` (`compcard_link_open`).
  Reachable via: Intel → "What happened around my profile?" stat row (`AttentionBlock.jsx:111-112`).
- **String/state:** `"card pulls"`, `"link opens"`, and the finding
  `"no profile visits, card pulls, or shared-link opens"`.
- **Data behind it:** `recordProfileEvent` correctly drops `viewerClass === 'self'`
  (`capture.js:145`), and the module header claims "self events are never written in the first place".
  But the *legacy* `analytics` insert that runs immediately before it has no self-check at all, and
  `strikesByDay`/`tier345Counts` deliberately read the legacy stream for pull and open day-counts
  (`attention.js:60-62`). A talent who downloads their own comp card three times to check a theme
  sees "3 card pulls".
- **Industry reality:** first principles, per R0 §21 — the whole value of these counts is that they
  are someone else's action. A metric a model can inflate by pressing their own button is not a
  signal; it is a scoreboard.
- **Secondary effect:** the same `download` event is the *only* input to
  `latestCardGeneration()` (`materials.js:49-56`), so a stranger downloading the public comp card
  marks the talent's card "current", and a talent who has a card but never downloaded it is told
  `"You have no comp card."` (`decisions.js:159`). One event is doing two incompatible jobs.
- **Fix:** exclude self from the legacy write (pass `req.session.userId !== profile.user_id` into
  `logAnalyticsEvent`), or read pull/open day-counts from the v2 `profile_events` stream that already
  classifies viewers. For card currency, stamp a `comp_card_generated_at` on the profile rather than
  inferring generation from a download.

### L5-08 [P1] [CLAIM] Pholio's 30-day window is attributed to the agency

- **Where:** `src/shared/services/notifications.js:353-356`;
  `client/src/domains/talent/utils/applicationStatus.js:172-180`;
  window default `src/shared/lib/application-auto-close.js:38`.
  Reachable via: the nightly auto-close job → talent bell and the applications tracker.
- **Strings:** bell `"Application closed — no response"` / `` `${agency} did not respond within its
  review window. Treat this as a pass and keep going.` ``; tracker detail
  `"The agency did not respond within its review window."`
- **Data behind it:** `resolveWindowDays()` returns `DEFAULT_REVIEW_WINDOW_DAYS = 30` whenever
  `agencies.application_review_window_days` is null — i.e. for every agency that has not opened
  Settings → Notifications. For those agencies "its review window" is Pholio's default, not theirs.
- **Industry reality:** R0 §24 states this exactly: silence-as-outcome "must be attributed to the
  platform's window, not to the agency ('no response within Pholio's 30-day window', not 'the agency
  closed your application')". R1 §3 shows agencies that *do* publish a clock publish it themselves
  (Bridge one week, Nemesis two weeks) — it is theirs to state.
- **Why it fails:** it makes a named agency the subject of a sentence about a deadline it never set,
  in an email/notification the agency never authorised. It is also the one place the otherwise
  scrupulous auto-close module (`application-auto-close.js:16-20`) lets its own rule slip.
- **Fix:** `` `No answer from ${agency} within Pholio's ${days}-day window. That is the normal outcome
  for most submissions — treat it as a pass.` `` Where the agency *has* set a custom window, say so:
  `` `${agency} reviews submissions for ${days} days; that window has closed.` ``

### L5-09 [P1] [STATE] A shortlisted submission auto-closes as "no response", identically to one nobody ever opened

- **Where:** `src/shared/constants/application-status.js:27-31`
  (`AWAITING_AGENCY_APPLICATION_STATUSES` includes `"shortlisted"`); copy at
  `notifications.js:353-356`. Reachable via: auto-close job.
- **State:** a talent is told `"You were shortlisted"` / `"{Agency} moved your application forward."`,
  then 30 days later `"Application closed — no response … Treat this as a pass."` with no record that
  a shortlist ever happened.
- **Industry reality:** R2 §2 and R1 §3 — *shortlisted* is a real, published, positive screening
  outcome (Storm). R1 §3 and R4 §7 also show the *normal* next move after a shortlist is a meeting
  invitation, and R4 §9 shows organizers' own decline language is "not selected" / carry-over to the
  next season, never a bare silence notice.
- **Why it fails:** it flattens Pholio's single most valuable positive signal into the same terminal
  message as being ignored, and it is the copy that will be screenshotted.
- **Fix:** either exclude `shortlisted` from auto-close (it is not silence — the agency acted), or
  give it its own terminal copy: `"{Agency} shortlisted you but did not take it further this time.
  Shortlists carry over — keep your digitals current and you can submit again."`

### L5-10 [P1] [CONCEPT] Auto-close — the product's headline trust feature — is bell-only; no email is sent

- **Where:** `src/shared/lib/application-auto-close.js:195-214` calls only
  `notifyTalentForApplicationStatus` (in-app). `sendApplicationStatusEmail` is invoked with exactly
  two statuses in the whole repo: `"accepted"` (`inbox.js:1674`, `roster.js:116`) and `"declined"`
  (`inbox.js:1924`, `roster.js:116`).
- **Why it fails:** the module's own premise is "the agency does nothing and the talent gets
  certainty" — but certainty delivered only to a bell reaches only the talent who happens to log in.
  Every *other* outcome (offer, decline) emails. The one Pholio invented to end the not-knowing does
  not. R1 §3 shows the industry's own honest-silence practice is communicated in writing, on the page
  or in the receipt, precisely because it must reach the person who is not checking.
- **Fix:** send the close as email using a dedicated `closed_no_response` branch in `DECISIONS` —
  which currently does not exist, so a `closed_no_response` email would render the **`declined`**
  template (`templates-submissions.js:87`, `DECISIONS[status] || DECISIONS.declined`) and print
  `"{Agency} passed on your submission."` That is the exact lie the auto-close module was built to
  avoid; add the branch before adding the send.

### L5-11 [P1] [CLAIM] The message email invents a "Booker" persona out of the agency's name

- **Where:** `src/shared/lib/pholio-email/templates-submissions.js:175-196`
  (`B.correspondent({ name: sender, role: senderRole || "Booker", org: agencyName })`), with
  `sendNewMessageEmail` passing `senderName: agency.name` and no `senderRole`/`agencyName`
  (`src/domains/agency/routes/messages.js:344-350`, `email.js:258-278`).
  Reachable via: any agency → talent message.
- **Rendered result:** a serif name line reading `Elite Model Management`, an avatar with the initial
  `E`, a role line reading `Booker`, and a CTA `"Reply to Elite"`.
- **Industry reality:** R5 §5.4 and R2 §5.2 — the number-one 2026 trust question is *"is this contact
  actually that agency?"*, and Premier's published guidance is that legitimate mail comes "from a
  named individual, rather than 'info or safety'". R2 §7 (src 31) shows real desk titles are varied
  (Head Booker, Head of New Faces, Client Account Manager, MD) — "Booker" is not a safe default.
- **Why it fails:** Pholio synthesises a person who does not exist, gives them a job title nobody
  claimed, and then teaches models to reply to it. That is the shape of the impersonation pattern
  every agency's safety page warns about, done by the platform itself.
- **Fix:** pass the real sender through (`messages.sender_id` → `users.first_name/last_name` and the
  membership role) and render `Name · Role · Agency`. Where the sender is unresolvable, render the
  organisation only — no avatar initial styled as a person, no role line, CTA `"Reply to {Agency}"`.
  Note the inconsistency with the magic-link reply page, which already gets this right:
  `"Message from {agencyName}"` (`client/src/domains/messaging/pages/ReplyPage.jsx:118`).

### L5-12 [P1] [CLAIM] "Agencies don't ask unless they're interested" and "Most agencies want a set from the last three months"

- **Where:** `src/shared/lib/pholio-email/templates-submissions.js:121,164`;
  `src/shared/lib/pholio-email/templates-materials.js:98`.
  Reachable via: materials-requested email (both variants), and the stale-digitals advisory on the
  shortlisted/kept-on-file decision emails.
- **Strings:** `"Agencies don't ask unless they're interested. Sooner beats perfect."` /
  `"Organizers don't ask unless they're interested."` /
  `` `Your digitals are ${n} days old. Most agencies want a set from the last three months.` ``
- **Industry reality:** (a) the interest claim is a flat assertion about a third party's state of mind
  — R0 §21, and R5 §5.5 names "stating or implying that a named client/casting is interested" as the
  FTC v. Explore Talent fact pattern. (b) The three-month figure is explicitly **unevidenced**: R3
  §4.9 and R3 §8 — "No agency page in the primary sample states a numeric re-measure interval… the
  3-month figure is a coaching convention. Label it as such." R1 §6.4 says the same for photo
  recency: only Bridge says anything, and it says "most recent", not a number.
- **Why it fails:** the product's own service code gets this right elsewhere — `decisions.js:80`
  says *"Pholio's 12-week current window"* and `decisions.js:146` says *"Pholio marks measurements for
  re-confirmation after 90 days"*. The email says "most agencies want", inventing an industry
  consensus that the research could not find. The same overreach appears in
  `client/src/domains/talent/pages/IntelPage/charts/CurrencyAxis.jsx:58`
  (`aria-label="Materials currency against their industry windows"`).
- **Fix:** `"They have asked for more before deciding — that is a step forward, not a decision."` and
  `` `Your digitals are ${n} days old. Pholio flags a set past 12 weeks; refresh them before you send
  again.` `` Change the aria-label to "against Pholio's freshness windows".

### L5-13 [P1] [MINOR] The guardian email never says "parent", and asks a guardian to consent to disclosing a minor's measurements

- **Where:** `src/shared/lib/pholio-email/templates-guardian.js:44-73`; text variant
  `src/shared/lib/pholio-email/text.js:259-276`; subjects `src/shared/lib/email.js:430-436`.
  Reachable via: `src/domains/talent/services/guardian-consent.js:195`.
- **Strings:** subjects `"Guardian authorization requested for a submission to {Agency}"` /
  `"Guardian consent requested on Pholio"`; body `"Because the talent is under 18, Pholio requires
  your authorization…"`; disclosure row
  `"Profile details, **measurements**, digitals, selected portfolio images, comp card, contact details…"`;
  fallback subject noun `"a minor in your care"`.
- **Industry reality:**
  - **Parent vs guardian:** R5 §6 terminology — "Use **'parent or guardian'** (the dominant
    construction across BFMA, Storm, Milk, Elite, Premier, Heroes and NY DOL)". Pholio's own consent
    *page* does this correctly (`views/guardian-consent.ejs:56` "as the parent or legal guardian";
    `:112` "I consent as parent or guardian") — only the email that gets a parent to that page omits
    the word. A mother who receives "Guardian authorization requested" may not recognise herself as
    the addressee, and the subject line is the whole delivery mechanism.
  - **Measurements:** BFMA Code of Practice, quoted in R2 §5.4, R5 §4 and R5 §7.5 — *"We believe it
    is inappropriate to measure any young person under the age 18 except for their height."* Asking a
    parent to authorise disclosure of a 16-year-old's bust/waist/hips is asking them to consent to
    something the UK industry body says should not exist. R3 §7.4 lists it as a structural omission,
    not a blank field.
  - **Deletion on failure:** Elite's model (R5 §7.4, §4) is approval within 15 days or *all supplied
    data is deleted*. Pholio's email says only "ignore this email and no disclosure will happen" —
    silent on retention.
- **Why it fails:** the file header says the launch is 18+ and the copy is "parked", but the sender is
  wired to a live route, so the copy is reachable and pins a data model that is out of line with the
  code of practice.
- **Fix:** (1) say "parent or legal guardian" in the subject and the first sentence, matching the
  consent page. (2) Remove `measurements` from the minor disclosure list and from what a minor
  profile can hold — height only. (3) Add Elite's retention sentence: `"If we do not hear from you
  within 7 days, the submission is cancelled and the data supplied for it is deleted."` (4) Add the
  one line every sampled agency carries to a parent: `"Pholio never charges to apply, and no agency on
  Pholio may charge you a fee."` (R5 §6 MUST-say list.)

### L5-14 [P1] [CONSISTENCY] The same submission carries three contradictory verdicts on the same day

- **Where and strings:**
  | Surface | String | File |
  |---|---|---|
  | Applications tracker / Messages cue | `"Under Review"` · `"The agency is reviewing"` | `applicationStatus.js:60-77` |
  | Intel ReadClock | `"late"` / `"cold"` · `"Long past — treat as closed"` | `intelTheme.js:291-296`, `conversion.js:100-105` |
  | Intel lede | `"{n} past the read window"` | `DecisionStack.jsx:40` |
  | Auto-close | still open until day 30 | `application-auto-close.js:38` |
- **The arithmetic:** `cold` fires at `ageDays > p75 * 3` where `p75` is the platform-wide first-read
  quartile over the last 180 days (`pipeline.js:229-259`). With a young, small population that band
  is short — a p75 of 4 days makes a submission "cold · treat as closed" on day 13, while the tracker
  still says "Under Review" and auto-close will not fire for another 17 days.
- **Industry reality:** R1 §3 — where agencies publish an assume-no clock they publish exactly one
  (Bridge: one week; Nemesis: two weeks). Multiple simultaneous clocks with different verdicts is
  worse than no clock.
- **Fix:** one clock, one owner. Make the auto-close window the single authority: Intel's states
  become `not opened · {n}d of {window}d` and `past Pholio's window — closing shortly`, and
  `"Long past — treat as closed"` moves to the moment auto-close actually fires.

### L5-15 [P1] [CONSISTENCY] The agency is told Pholio sends a decline on its behalf; the talent is told the opposite

- **Where:** `client/src/domains/agency/pages/settings/NotificationsPanel.jsx:136-138` vs
  `src/shared/services/notifications.js:353-356`.
- **Strings:**
  - Agency setting: `` `A submission with no decision after ${n} days closes itself, and the talent is
    told it was not taken forward.` ``
  - Talent bell: `` `${agency} did not respond within its review window. Treat this as a pass…` ``
- **Why it fails:** "told it was not taken forward" describes a decline the agency did not make and
  Pholio does not send. A booker configuring the window is being told the platform will issue passes
  in their name — which is both wrong and, if believed, a reason not to enable the feature. It also
  contradicts the module's own non-negotiable (`application-auto-close.js:16-20`).
- **Fix:** agency-side copy: `` `A submission with no decision after ${n} days closes itself. The
  talent is told Pholio closed it because nobody answered — never that you declined.` ``

### L5-16 [P2] [TERM] "Go-See Requested" for an agency meeting; "Meeting requested" in the bell for the same event

- **Where:** `client/src/domains/talent/utils/applicationStatus.js:105-113` vs
  `src/shared/services/notifications.js:326-329`.
- **Strings:** page `label: 'Go-See Requested'`, `short: 'Go-See'`,
  `detail: 'The agency invited you to a meeting (a go-see).'` — bell `"Meeting requested"` /
  `"{Agency} wants to meet — check your submission for details."`
- **Industry reality:** R4 §2.2 — a go-see is a *general meeting with a client or casting director*
  where you show your book; R4 §2.2 note on "Interview": that word is "used only for the
  agency↔prospective-talent meeting, never for a client casting" — the two are structurally different
  rooms. R0 §10 and R1 §2 both place *go-see* on the client side and give *meeting / come in / open
  call* for the agency side. R2 §6.1 concludes: "Safer neutral word: **meeting**."
- **Why it fails:** a model told she has a "go-see" with an agency she has not signed with will arrive
  expecting a client, and a booker seeing the word on a talent's screenshot will read it as an
  outsider's error. The bell already has it right.
- **Fix:** align on the bell's wording — label `"Meeting requested"`, detail `"{Agency} asked you to
  come in."` Drop "go-see" from the agency-intake vocabulary entirely.

### L5-17 [P2] [LEAK] "Scout", "Signals", and a deployment-rollout instruction reach users as copy

- **Where:**
  - `src/shared/services/notifications.js:480,535` — `"An agency opened your portfolio in Scout."` /
    `"An agency reviewed your portfolio in Scout."` (Scout is not a talent-visible surface; the agency
    nav calls it **Discover**, `client/src/domains/agency/pages/DiscoverPage.jsx`.) *Dead — see the
    dead-code section — but the string ships.*
  - `client/src/shared/components/NotificationCenter/TalentSignalPanel.jsx:66,80` — `"Signals didn't
    load"`, `"No signals yet"`; `talentSignalModel.js:29-33` band labels. "Signal" is Pholio's internal
    tiering language (`spec §2 signal tiers 1–2`), not a word a model uses for a notification.
  - `src/domains/agency/routes/materials.js:381-387` — user-visible 503:
    `"Materials requests to applicants without a Pholio account need the open-call claim-token
    service, which is not deployed in this environment yet. Ask a Pholio operator to complete the
    open-call applicant rollout, then try again."` Shown to a booker.
  - `src/domains/talent/routes/message-polish.js:41` — `"AI service unavailable"`.
- **Industry reality:** first principles / R0 §F — internal system names and deploy state are exactly
  the "SaaS register" that breaks the fashion-house frame; R5 §5.4 on operator credibility.
- **Fix:** "Scout" → "Discover" (or drop the surface name). "Signals" → "Notifications" / "Nothing
  new yet". The 503 → `"That applicant has no Pholio account yet, so we can't send them a materials
  link. Message them instead."` "AI service unavailable" → `"Polish isn't available right now."`

### L5-18 [P2] [CLAIM] The talent bell's empty state promises a notification the system no longer produces

- **Where:** `client/src/shared/components/NotificationCenter/TalentSignalPanel.jsx:81-84`;
  band label `talentSignalModel.js:32` (`"Who's looking"`);
  category map `notificationHelpers.js:211` (`agency_profile_view: 'Agency interest'`).
- **String:** `"When an agency **opens your book**, writes to you, or moves a submission forward, it
  lands here first."`
- **State:** the only producer of `agency_profile_view` was removed deliberately and correctly — see
  the long comment at `src/domains/agency/routes/inbox.js:4616-4633` ("a scout flipping through a
  result set would tell every talent they passed over that 'an agency viewed your profile' — a claim
  of interest generated by scrolling"). Nothing now writes that type, so the `INTEREST` band never
  populates and the promised event never fires.
- **Why it fails:** the empty state advertises the exact signal the team decided not to send, so the
  bell's own copy contradicts its design. A model waiting for "an agency opened your book" waits
  forever.
- **Fix:** `"When an agency writes to you, asks you to apply, or moves a submission forward, it lands
  here first."` Remove the `INTEREST` band and the `"Agency interest"` category, or repoint the band
  at `agency_invitation` (which is a real, deliberate act and is already classified as ACTION).

### L5-19 [P2] [TERM] "Signing board" in a domain where "board" already means division

- **Where:** `client/src/domains/agency/pages/CastingNewModal.jsx:74` — `toast.success('Signing board
  created')`; sibling toasts `'Could not create the board'`, `'Could not file to board'`, `'Board
  identity updated'` (`CastingNewModal.jsx`, `CastingDetailPage.jsx`, `BoardIdentityEditor.jsx`);
  route `/dashboard/agency/signing`.
- **Industry reality:** R2 §8 states this in as many words: *"'Signing board' — **actively harmful**.
  'Board' is a taken word meaning division. 'Signing board' parses as 'the division called Signing'.
  Any kanban-style UI must not be called a board in this domain."* R2 §1.1 evidences boards as desks
  with their own phone lines (Storm, Milk).
- **Why it fails:** it is the one word in the agency vocabulary that a booker cannot misread as
  anything else, reused for a kanban. Flagged here because the toast is a Lane-5 string; the surface
  itself belongs to the signing-boards lane, so treat this as corroboration rather than duplication.
- **Fix:** `'Pipeline created'` is also wrong (R2 §8: "alien, sales-CRM register"). Use the agency's
  own noun for the artefact: `'List created'` / `'Shortlist created'`, or name it after what it holds
  — `'New faces list created'`.

### L5-20 [P2] [TERM] "Development offer — New Face" collapses two distinct boards

- **Where:** `client/src/domains/agency/pages/CastingDetailPage.jsx:281` (toast);
  `applicationStatus.js:114-122` (`label: 'Development Offer'`, `short: 'New Face'`);
  `notifications.js:330-333` (`"{Agency} wants to develop you as a new face before full
  representation."`); email `templates-submissions.js:52-57` (`"This is a new-face offer, not a
  signing."`).
- **Industry reality:** R2 §6.5 — contested, and the primary URL evidence is decisive: six agencies
  run New Faces and Development as *separate peer boards* (Viva, Milk, Chadwick all have both).
  Conclusion: *"Do not hard-code them as one concept."* R2 §1.3: "in development" means **signed**,
  but not yet sellable at full rate — the agency is already investing. So "before full representation"
  is also wrong: development *is* representation, at a lower rate.
- **Fix:** pick one word per status and stop equating them. If the status means "we'll take you on to
  develop", say `"Development offer"` throughout and describe it as R2 §1.3 does: `"{Agency} wants to
  take you on for development — signed, with the agency investing in tests and your book before you
  go out at full rate."` Reserve "new face" for a board placement.

### L5-21 [P2] [CLAIM] Pholio writes career advice into an agency's decline

- **Where:** `src/domains/agency/services/decline-reasons.js:73,80`; rendered as the email body at
  `templates-submissions.js:106-110`.
- **Strings:** `"Current, clearly lit digitals are usually what is missing — worth shooting a fresh
  set before you apply again."` · `"Building a book with smaller clients first is the usual route
  back."`
- **Industry reality:** R1 §3 — "Hard rejections with reasons are rare; agencies avoid giving reasons
  (liability, volume)." The reason list itself is exemplary (see Working Well), but the agency picked
  a two-word label; the sentence and the coaching are Pholio's, rendered inside an email headlined
  `"{Agency} passed on your submission."` with Pholio's signature at the foot.
- **Why it fails:** the reader attributes the advice to the agency. The advice is also *inference* —
  the `materials` label says only that the agency could not assess; "clearly lit digitals are usually
  what is missing" is a guess about which materials.
- **Fix:** keep the situational sentence, move the coaching below the hairline in Pholio's own voice,
  visually separated the way the `staleDigitals` advisory already is
  (`templates-submissions.js:118-124`) — that pattern exists in this file and solves exactly this.

### L5-22 [P2] [TERM] "A talent" as a countable noun on agency notifications

- **Where:** `src/shared/services/agency-notifications.js:113,133,156,189` — fallbacks
  `"A talent"`, bodies `` `${name} submitted to your agency.` `` / `` `${name} withdrew their
  application.` ``; also `templates-agency.js:76` `"An applicant"`.
- **Industry reality:** R2 §2 — "Talent" is a board/desk name for *non-model represented people*
  (actors, presenters, musicians): Storm's "Talent Board", Milk's Talent line, Select's
  `/talent/creatives`. As a mass noun ("our talent") it is fine; "a talent" for one model is outsider
  usage. R1 §2 / R4 §2.4: for an inbound person agencies say *submission* or *applicant*;
  "applicant" is fine on an event surface, and `templates-agency.js` uses it correctly.
- **Fix:** `"Someone"` / `"A new submission"` as the fallback, and prefer *submission* over
  *application* in agency-side copy where the call is a representation call.

### L5-23 [P2] [CLAIM] A roadmap promise shipped as a toast on a primary CTA

- **Where:** `client/src/domains/talent/components/RightSidebar/RightSidebar.jsx:62-67`.
  Reachable via: the talent dashboard right sidebar (`RightSidebar` is rendered by
  `DashboardLayoutShell`).
- **String:** button `"Download Comp Card"` → `toast.info('Comp card download is not available yet —
  we will add it in a future update.')`
- **Why it fails:** the comp card is the product's headline artefact and the PDF generator exists
  (`src/domains/pdf/routes/pdf.js`), so the button is both live-looking and dead, and the toast makes
  a delivery promise. R3 §1: the card is the leave-behind; a model who cannot get it concludes the
  product does not really make one.
- **Fix:** point the button at the working download, or remove it. If it must stay, no promise:
  `"Comp card downloads live on the Media page."` with a link.

---

## Coined / internal terms encountered

| Term | Where | Verdict | Translation |
|---|---|---|---|
| **Intel** | `/dashboard/talent/intel`, page `<h1>Intel</h1>` | translate | Nothing in the industry is called this; it reads as surveillance/SaaS. "Your submissions" or "Activity". |
| **Signals** | `TalentSignalPanel`, `talentSignalModel.js`, `"Signal preference saved"` toast | translate | "Notifications". Internal tiering language (spec "signal tiers 1–2"). |
| **Card pull** | `AttentionBlock.jsx:24,111`; `MomentumBlock.jsx:38,49` | translate | Not attested anywhere in R1–R5. "Comp card downloads". |
| **Advanced / Advances** | conversion ladder, `WeeklyBars.jsx:85`, Intel stat row | translate | Reads as an ATS rung (R4 §2.4). Name the real events: "shortlisted, asked for more, invited in". |
| **Settled** | `conversion.js:23` step key, `STEP_WORD.settled = 'represented or kept'` | translate | Insurance/legal register. The qualifier is already the honest phrase — use it as the label. |
| **Read window / read band / read clock** | `intelTheme.js:284-296`, `ReadClock.jsx`, `DecisionStack.jsx:40` | keep, but attribute | Fine as a concept; must say *Pholio's* window (see L5-08, L5-14). |
| **Sendability** (`ready`/`caveat`/`hold`) | `materials.js:196-198`, `DecisionStack.jsx:9-13` | keep (internal) | Verdict copy is fine; do not surface the enum words. |
| **Momentum** | `MomentumBlock`, `/intel` block id | keep (hidden) | Never rendered to the user — the block asks "How has my activity changed?". Good; keep it hidden. |
| **Standing** | email band `B.standing("Kept on file")` etc. | keep | Reads correctly as a status stamp. |
| **Signing board** | `CastingNewModal.jsx:74` toast, `/dashboard/agency/signing` | **hide/replace** | R2 §8: homonym collision with *board* = division. |
| **Scout** (as a talent-facing surface name) | `notifications.js:480,535` | hide | The surface is called Discover; talent cannot see it either way. |
| **Waiting on you / What changed / Who's looking** | `talentSignalModel.js:29-33` | keep first two, drop the third | "Who's looking" has no producer (L5-18) and would be an interest claim if it did. |

---

## Consistency variants

| Concept | Variants seen | Locations |
|---|---|---|
| An agency has your submission but has not opened it | `"Under Review"` / `"The agency is reviewing"` · `"waiting"` · `"late"` · `"cold — Long past, treat as closed"` · `"{n} past the read window"` | `applicationStatus.js:60-86`; `ReadClock.jsx:23-27`; `intelTheme.js:291-296`; `DecisionStack.jsx:40` |
| Agency asked for more materials | `"{Agency} asked for more"` (subject, account-holder) · `"{Agency} shortlisted you — a few more things"` (subject, no account) · `"More materials requested"` (bell) · `"More Requested"` (tracker) · `"Asked for a current set of digitals"` (agency toast) | `email.js:495`; `materials.js:505`; `notifications.js:322`; `applicationStatus.js:96-104`; agency inbox toast |
| Representation offered | `"Representation offer"` (bell) · `"Representation offer from X"` (subject) · `"{Agency} wants to sign you."` (email headline) · `"Signed"` (email standing band) · `"Offer / Moving Forward"` (tracker) · `"Representation offered"` (agency toast) | `notifications.js:335`; `email.js:226`; `templates-submissions.js:59,64`; `applicationStatus.js:124`; `CastingDetailPage.jsx:279` |
| Auto-close of an unanswered submission | `"Application closed — no response"` + `"{Agency} did not respond within its review window"` (talent) · `"the talent is told it was not taken forward"` (agency settings) · `"Closed automatically — the review window lapsed with no decision."` (activity log) | `notifications.js:353-356`; `NotificationsPanel.jsx:137`; `application-auto-close.js:272` |
| Agency invitation to come in | `"Meeting requested"` (bell) · `"Go-See Requested"` / `"Go-See"` (tracker, Messages cue) | `notifications.js:326`; `applicationStatus.js:105-113` |
| Who sent a message | `Elite Model Management` + role `Booker` + `"Reply to Elite"` (email) · `"{Agency} sent you a message"` (bell) · `"Message from {agencyName}"` (magic-link reply page) | `templates-submissions.js:182,186`; `notifications.js:597`; `ReplyPage.jsx:118` |
| The submissions surface | routeTarget `/dashboard/agency/inbox` in every agency notification and the slot emails; the live route is `/dashboard/agency/submissions` | `agency-notifications.js:119,140,163,201`; `templates-agency.js:79`; `App.jsx:158` |
| Development vs New Faces | `"Development offer"` (bell) · `"Development Offer"` / short `"New Face"` (tracker) · `"Development offer — New Face"` (agency toast) · `"a new-face offer, not a signing"` (email) | `notifications.js:330`; `applicationStatus.js:114-122`; `CastingDetailPage.jsx:281`; `templates-submissions.js:54` |
| Parent/guardian | `"parent or legal guardian"` (consent page) · `"Guardian"` only (email subject + body) | `views/guardian-consent.ejs:56,112`; `templates-guardian.js`, `email.js:430-436` |

---

## Working well (preserve)

1. **The decline-reason taxonomy** (`src/domains/agency/services/decline-reasons.js`). Optional by
   design; every reason describes the *agency's* situation, never the person; the talent-facing text is
   fixed and shown to the reviewer before sending. This is better than what any sampled agency does
   (R1 §3: reasons are "rare"), and the `board_full` / `not_a_fit` / `market` wording is exactly the
   register R4 §9 documents ("not right for this season", never "rejected").
2. **The default decline body**: *"They don't give a reason, and there isn't one to read into it.
   Agencies pass on board space, market and timing far more often than on the work itself."*
   (`templates-submissions.js:78-80`) — this is the single best sentence in the product.
3. **`"That's not a no."`** on the kept-on-file email (`templates-submissions.js:41`), and keeping
   `kept_on_file` and `shortlisted` in `group: 'advancing'` (`applicationStatus.js:9-12,203-205`).
   Correct per R1 §3 / R2 §2.
4. **The auto-close record model** (`application-auto-close.js`): `closed_no_response`, never
   `passed`; `user_id: null` on the activity row; the status excluded from
   `WRITABLE_APPLICATION_STATUSES` so an agency cannot record silence as a decision
   (`application-status.js:13-19`). Only the copy attribution needs fixing (L5-08).
5. **Deleting the notify-on-view signal** (`inbox.js:4616-4633`) with the reasoning written down.
   Exactly the right call for exactly the right reason.
6. **`"An invitation isn't an offer. It means a booker saw your profile and wants a proper look."`**
   plus **`"A legitimate agency never asks you to pay to be represented."`**
   (`templates-submissions.js:212,216`) — this is R5 §6's MUST-say list, in the right place.
7. **The billing emails** (`templates-talent.js:210-289`). The trial-ending notice is a genuine
   ROSCA-grade document: facts before narration, cancel path stated, no re-sell, and deliberately
   exempt from notification preferences (`email.js:501-509`).
8. **The new-device email refusing to include a button** (`templates-talent.js:145-148`) — "open
   pholio.studio yourself, from your own bookmark". Correct for a documented phishing target (R5 §5.4).
9. **The open-call receipt's disown link** (`templates-opencall.js:18-22,127-130`) — "That wasn't me",
   always present, because the flow accepts unverified emails.
10. **The footer system** (`footer.js`): per-tier, `NEVER_ASKS` on security mail, a *scoped*
    preference link that explicitly does not silence a booker, and no invented postal address.
11. **Intel's small-n discipline**: `deltasSuppressed` below 10 prior events, `calibrating` until 25
    image events, `openRate` instead of a composite score, and *"a rank drawn from three views would
    be noise wearing a number"* (`BookBlock.jsx:276`). The removal of the momentum composite index
    (`compose.js:20-22`) was right.
12. **`ShareLinksBlock`'s refusal to console**: *"nobody has opened a link yet — that is ordinary, and
    it is not a verdict on the work"* (`ShareLinksBlock.jsx:127`). This is the correct posture for the
    entire surface (R1 §3, R4 §7).
13. **`eventApplicationStatusCopy`** (`notifications.js:252-301`) — separating an organizer's
    `accepted` (a slot) from an agency's `accepted` (representation), and splitting `closed_no_response`
    into "slot offer expired" vs "casting closed". Correct per R4 §1 System A vs System B.
14. **The event-slot emails to organizers** (`templates-agency.js:69-109`): *"A slot has opened again
    … The slot is free to offer to someone else. Your pick lists and pool are unchanged."* Right
    register, right nouns (R4 §2.3).

---

## Dead or unreachable code carrying issues

- **`notifyTalentAgencyProfileView` + `refreshAgencyViewNotificationTitle`**
  (`notifications.js:471-548`). No callers repo-wide. Carries the worst string in the file —
  `` `${name} showed repeat interest` `` / `"This agency viewed your profile 4 times recently."` — a
  direct intent claim inferred from page loads, naming a real agency (R5 §5.5, FTC). Delete both, plus
  the `agency_profile_view` type, the `INTEREST` band and the `'Agency interest'` category label.
- **Four email senders with zero callers anywhere**: `sendWelcomeTalentEmail`,
  `sendWelcomeAgencyEmail`, `sendNewDeviceSignInEmail`, `sendCardDeclinedEmail` (`email.js`). Two
  consequences: (a) new talent receive no welcome and no receipt of any kind at signup, and no
  sign-in-from-new-device alert is ever sent despite `session-registry` recording the fingerprint;
  (b) the parked welcome template hard-codes a fake personalisation — `"your headshot is saved"` and
  `"It's the biggest gap in your profile right now"` about a full-length the code never checks for
  (`templates-talent.js:156-184`, `nextStep` is never passed).
- **`buildWelcomeAgencyEmailHtml` headline `"Your board is ready."`** (`templates-agency.js:22`).
  Dead, but it is the L5-19 homonym at its worst: a booker would read it as "a division has been
  created". Fix before it ships.
- **Four unreachable branches of `DECISIONS`** (`templates-submissions.js:36-83`):
  `sendApplicationStatusEmail` is only ever called with `accepted` or `declined`, so the
  `kept_on_file`, `shortlisted`, `development` and `represented` emails never send — including the
  `kept_on_file.subject` function (`:38`), which `email.js` never reads at all (it has its own
  `messages` map, `email.js:224-238`). Consequences: the `"Representation confirmed by {Agency}"`
  subject is dead; `represented` produces no email; and any future `closed_no_response` send would
  fall through to the `declined` template (`:87`) and print `"{Agency} passed on your submission."`
- **`views/errors/{403,404,422,500}.ejs`** are only rendered when `!wantsJsonError(req)`, which is
  never true in the serverless deploy (`error-handler.js:26-28`, `config.isServerless`). Every
  production error is JSON, so the EJS copy is effectively dead while the JSON strings in L5-03 are
  what users actually read.

---

## Coverage

**Read in full:** `client/src/domains/talent/pages/IntelPage/` (`index.jsx`, `Chrome.jsx`,
`findings.js`, `intelTheme.js`, all seven `blocks/`, `charts/ConversionLadder|ReadClock|CurrencyAxis`
+ string scan of the remaining charts); `src/domains/talent/routes/intel.js`;
`src/domains/talent/services/intel/{compose,attention,pipeline,materials,conversion,decisions,capture}.js`;
`client/src/domains/talent/pages/MessagesPage/index.jsx`;
`client/src/domains/talent/components/ApplicationMessages.jsx` (strings);
`client/src/domains/messaging/pages/ReplyPage.jsx`; `src/domains/talent/routes/message-polish.js` +
`services/message-polish/`; `src/shared/services/{notifications,agency-notifications,notify-talent-application,notify-profile-readiness}.js`;
`src/shared/lib/email.js`; `src/shared/lib/pholio-email/{templates-talent,templates-submissions,templates-agency,templates-guardian,templates-materials,templates-opencall,footer}.js`
+ `blocks.js` (key blocks) + `text.js` (guardian); `src/shared/lib/application-auto-close.js`;
`src/shared/constants/application-status.js`; `src/domains/agency/services/decline-reasons.js`;
`client/src/domains/talent/utils/applicationStatus.js`;
`client/src/shared/components/NotificationCenter/{talentSignalModel,notificationHelpers,TalentSignalPanel,NotificationInbox}.js(x)`;
`src/shared/middleware/error-handler.js`; `client/src/shared/lib/api-error-message.js`.

**Sampled / traced for reachability:** `src/domains/agency/routes/{inbox,messages,materials,roster,talent-dossier}.js`
(email + notification call sites, `viewed_at` writers, materials guards);
`src/domains/talent/routes/{applications,social-oauth}.js`; `src/domains/pdf/routes/pdf.js`
(analytics writers only); `client/src/domains/talent/pages/ProfilePage/{SocialSection,MockConsentPage}.jsx`;
`client/src/domains/agency/pages/settings/NotificationsPanel.jsx`; full `sonner` toast literal scan
across `client/src` (all 53 importing files, via grep of every `toast.*('…')` literal).

**Skipped and why:** `.claude/skills/**`, `docs/audits/**`, `tasks/**`, `DESIGN.md`, `CLAUDE.md` as
vocabulary authorities (brief hard rule 1; `PRODUCT.md` read once for the declared scope boundary
only). `client/src/domains/agency/pages/{ApplicantsPage,CastingDetailPage,SetupPage}.jsx`,
`components/decline/*`, `components/status/*`, the signing-board surface, the onboarding/open-call
form copy, the comp-card/PDF templates, the wallet pass and the spec-registry exports — those are
other lanes' surfaces; where a Lane-5 string (a toast, a notification body) pointed into them I
flagged it and said so (L5-19, L5-20). `views/errors/*.ejs` were not line-read because
`error-handler.js` shows them to be unreachable in the deployed runtime; that is recorded in the dead
-code section instead. `charts/{IntentTrend,MarketBars,StackedShare,WeeklyBars,RankedBars}.jsx` were
string-scanned rather than read in full — they carry axis labels and aria text only, and the two
label sets that mattered (`WeeklyBars` series, `CurrencyAxis` aria) are cited above.
