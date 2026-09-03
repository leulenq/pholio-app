# Lane 7: Signing boards · Discover/Scout · Events · Team · Settings · Messages · Activity  ·  audience: agency

Surface-map groups 18–24. Repo `/home/user/pholio-app`. All findings verified reachable through
`client/src/App.jsx` routes under `<AgencySessionGate>` → `<AgencyLayout>` unless stated.

---

## Verdict

Two very different products live in this lane. **Events (group 20) and Discover/Scout (group 19) are
the most industry-literate surfaces I have read in this codebase** — the event flow is a near-exact
implementation of the real open-event system (Pool → Designers → Lineup, designer pick lists with
pick/maybe/pass, the confirmation written by the model and not the organizer, 18+ enforced, minors
hard-filtered out of designer links), and the Scout room leads with the representation gate a scout
actually needs ("Exclusive elsewhere · Check before you approach"). A booker would trust these.

**The Signing surface (group 18) is where a professional stops.** It reuses the single most
dangerous word in the domain — R2 §8 names "signing board" as *"actively harmful… 'board' is a taken
word meaning division"* — and then does something worse than mis-naming: it makes **Represented** a
Kanban column an agency drags a card into. That write sets `applications.status = 'represented'` and
nothing else. It creates no `talent_representations` row, records no market, no exclusivity, no
dates, no contract, and — this is the tell — no answer from the talent. Meanwhile the *event slot*,
which is a one-week unpaid booking, **is** consent-gated: `confirmed` / `declined_by_talent` are
talent-writable only. The product has consent on the low-stakes object and none on the legally
binding one. The consequence is visible in the product: an agency can mark someone Represented on its
board while Discover keeps telling every other agency that same person is "Seeking representation",
because `representation_status` is derived only from the talent's own declaration.

The second headline gap is register. The agency sidebar's own group label is **"Pipeline"**
(`agencyNav.js:23`), the open-call settings notice is headed **"Your applicant funnel"**
(`OpenCallPanel.jsx:178`), and the permission catalogue ships "Bulk accept" and "Move pipeline stage".
R2 §2.1, R2 §8 and R4 §2.4 independently name *pipeline*, *funnel*, *candidate* and *accepted* as the
words that mark a tool as HR/CRM software rather than agency software. Everything downstream of that
label is well built; the label itself is what a head booker reads first.

Third: the same Settings copy tells a booker that talent have a **"monthly Pholio limit / allowance"**
on submissions and pitches the agency's own link as the way around it. The cap is in fact a flat,
plan-independent anti-spam rule (5/month, `application-quota.js:10`) — but nothing in the agency copy
says so, and every agency in the research sample publishes some version of *"we never require
monetary payment"* (R2 §5.1, R4 §6). This is the one string in the lane most likely to be read as
pay-to-be-seen by a professional who has spent a career warning talent about exactly that.

---

## Findings

### L7-01 [P0] [CONCEPT/CLAIM/STATE] "Represented" is a Kanban column the agency alone can drag into; it records no representation

- **Where:** `client/src/domains/agency/pages/CastingDetailPage.jsx:41-46, 118, 280, 331-336`;
  write path `src/domains/agency/routes/inbox.js:1700-1760` (PATCH `/api/agency/applications/:id/status`);
  status catalogue `src/shared/constants/application-status.js:10, 33-44`.
  Reachable via `/dashboard/agency/signing/:boardId` (`App.jsx:162`).
- **String/state:** column `{ key: 'represented' }` titled from `BOARD_VOCAB.division.column = 'Represented'`;
  card action `"Mark represented"`; toast `"Marked represented"`; drop target
  `represented: { status: 'represented', label: vocab.column }`; docket row
  `"Slots · {n} of {t} represented"`. Server comment: *"`represented` means the agreement is complete."*
- **Industry reality:** representation is a contract with a scope — agency, market, exclusivity,
  term — and the transition is *offer of representation → contract signed → placed on a board*
  (R2 §1.4, §3.1 steps [3]–[5]). NY law defines *Exclusive Representation* as a written agreement and
  caps terms at three years (R2 §5.5). "An agency signs, a model accepts" (R2 §1.4). R0 #22: the
  platform cannot verify representation unless both parties attest, and must label whichever it has.
- **Why it fails:** the entire state is one enum value on an `applications` row plus `accepted_at`.
  `talent_representations` — which does carry `market`, `territory`, `division`, `is_exclusive`,
  `started_on`, `relationship_type` — is written **only** by the talent
  (`src/domains/talent/services/representations.js:179`, `source: "profile"`; the only caller is
  `src/domains/talent/routes/representations.js:94`). No agency route inserts into it. So the board
  asserts a completed legal agreement from one click by one party, with no scope and no
  counter-signature, and the assertion is invisible to the representation model the rest of the
  product reads. Compare the event path in the same codebase, which gets this right:
  `client/src/shared/constants/applicationStatus.js:14-19` — `confirmed` and `declined_by_talent` are
  *talent-writable only*, "written by the talent, never by an agency".
- **Fix:** (a) rename the column to what the click actually means — **"Offer accepted (recorded by
  you)"** or **"Signed — recorded by {agency}"** — and show the attribution wherever it renders;
  (b) make the transition write a real `talent_representations` row with market/exclusivity/start
  date, asked for in the same modal; (c) give the talent the same answer the event slot gives them —
  a `represented`/`declined_by_talent` pair — and only move the card when the talent has answered.
  Until (b)/(c) exist, remove `represented` from `DROP_TARGETS` so a legal state cannot be entered by
  drag-and-drop.

### L7-02 [P0] [TERM] "Signing board" reuses the industry's word for a division, on the surface where the collision does most damage

- **Where:** `client/src/domains/agency/pages/CastingPage.jsx:190, 203, 228-234`;
  `CastingNewModal.jsx:74, 109, 142-157`; nav item `constants/agencyNav.js:26` (`label: 'Signing'`);
  permission group `client/src/domains/agency/lib/permission-groups.js:46` (`label: 'Signing boards'`).
  Reachable via `/dashboard/agency/signing`.
- **String/state:** `"Signing"` (h1) · `"Signing boards gather the talent you are considering for a
  client or a season."` · `"The board rack is empty."` · `"Open your first signing board to start
  reviewing talent for a client, a season, or a division."` · `"Open a signing board"` · toast
  `"Signing board created"` · board-kind chips `"Client package"` / `"Division board"`.
- **Industry reality:** R2 §1.1 — a **board** is a desk: a named division with its own bookers, its
  own phone line and its own client list (Storm publishes `Models Board`/`Talent Board` with separate
  numbers; Select's CMS type is literally `ModelBoard`; Premier's markup is `board-item`). R2 §8
  answers this exact question: *"'Signing board' — **actively harmful**. 'Board' is a taken word
  meaning division. 'Signing board' parses as 'the division called Signing'. Any kanban-style UI must
  not be called a board in this domain."*
- **Why it fails:** the collision is not theoretical here — the product uses **both** senses on the
  same screen. `CastingNewModal.jsx:149-157` offers "Client package" vs "Division board", and
  `lib/board-identity.js:185-207` resolves a board to `division` (talent get **Represented**) or
  `package` (talent get **Confirmed**). So "board" simultaneously means a division, a client package,
  and a Kanban screen. A head booker reading "open a signing board" cannot tell whether they are
  creating a desk, a submission, or a client proposal. Separately, calling a *client package* a
  "signing board" is a category error in the other direction: R2 §1.7 — the agency→client artefact is
  a **package** and nobody signs anyone to one (which the vocab table half-knows: it relabels the
  column "Confirmed" while the page above it still says "Signing").
- **Fix:** split the two objects and drop the word "board" from the screen name. Divisions/desks keep
  **Board** (they already do, correctly, in `components/status/divisions.js`). This screen becomes
  **New Faces** (for the intake variant, matching who actually does this work — R0 #5) and
  **Packages** (for the client variant), or one screen named **Casting** with two kinds:
  "New-faces review" and "Client package". Nav `Signing` → `New Faces`.

### L7-03 [P1] [MINOR/CONCEPT] Team's custom-access modal cannot show, grant or revoke the one permission that gates a minor's submission

- **Where:** catalogue `client/src/domains/agency/lib/permission-groups.js:6-77` (no
  `talent.view_minor_submissions` entry); renderer
  `client/src/domains/agency/components/TeamPermissionsModal.jsx:46-51` (`PERMISSION_GROUPS.map(...)`
  is the only source). Server truth: `src/domains/agency/lib/permissions.js:39, 160, 200` — the
  permission exists, is granted to `ADMIN`/`OWNER`, and is in `DANGEROUS_PERMISSIONS`. Enforcement:
  `src/domains/agency/services/minor-submission-access.js:6-42`.
  Reachable via `/dashboard/agency/team` → member menu → permissions.
- **String/state:** the modal's groups are `Organization`, `Team & access`, `Submissions & pipeline`,
  `Signing boards`, `Discover & scouting`, `Notes, tags & messages`. `talent.view_minor_submissions`
  appears in none of them; `grep -rn "view_minor_submissions" client/src` returns nothing.
- **Industry reality:** BFMA requires guardian signature and constrains everything about an under-18
  (R2 §5.4; R5 covers this in depth). R0 #12: the guardian is the counterparty. An agency that must
  answer "who at this office can see my 16-year-old's submission?" has no way to look, and the
  Principal has no way to take the access away from a specific person.
- **Why it fails:** the server is careful (permission-gated, guardian-consent-expiry aware, per-route
  matrix) and the UI hides the whole control. Also invisible for the same reason:
  `open_call.manage`, `talent.claim`, `filters.*`, `org.complete_onboarding` — but those are not
  child-safety controls. A DENY grant on this key, if one were ever written, would also be invisible
  in the modal.
- **Fix:** add a `Minors` group with `talent.view_minor_submissions`, labelled in guardian-facing
  language ("See submissions from under-18s (guardian-consented)"), marked dangerous, with the
  current holders listed on the Team page itself rather than only inside a per-member modal.

### L7-04 [P1] [LEAK] Raw backend enum values are printed into the Activity feed (and the export)

- **Where:** `src/domains/agency/routes/inbox.js:1752` — ``` `Application moved to ${requestedStatus}` ```
  — and `:2161` — ``` `Application moved to ${requestedStatus} (bulk)` ```. Rendered verbatim at
  `client/src/domains/agency/pages/ActivityPage.jsx:180` (`{item.description}`).
  Reachable via `/dashboard/agency/activity`; written by every drag on the signing board
  (`CastingDetailPage.jsx:255-276` → `updateCastingApplicationStage`).
- **String/state:** the feed renders e.g. *"Amara Diallo Application moved to kept_on_file"*,
  *"…moved to requested_more"*, *"…moved to meeting_requested (bulk)"*, *"…moved to development"*.
  Same class of leak in the CSV: `inbox.js:3488` `application_status: app.application_status || "pending"`
  under the header `"Application Status"`.
- **Industry reality:** first principles — internal enum spellings are engineering artefacts. Every
  other status surface in this product already owns a human label
  (`components/ui/StatusText.jsx:14-42`, `getStatusLabel`), so the leak is not a missing vocabulary,
  it is a bypassed one.
- **Why it fails:** the Activity page is the audit trail an agency shows itself and, in a dispute,
  shows others. `kept_on_file` and `requested_more` in a compliance log read as an unfinished product.
  It also produces a contradiction in a single row (see L7-11).
- **Fix:** pass the status through `getStatusLabel` server-side (or store `metadata.new_status` only
  and let the client render the label it already has) so the row reads *"Moved to On file"*. Same for
  the CSV cell.

### L7-05 [P1] [CLAIM/DATA] Every talent on every signing board is labelled "Editorial"

- **Where:** `client/src/domains/agency/pages/CastingDetailPage.jsx:132` and `:214`
  (`<DivisionMark division={c.archetype || 'editorial'} …/>`), plus
  `client/src/domains/agency/pages/ApplicantsPage.jsx:141` (`type: c.archetype || 'editorial'`) on the
  board-filtered submissions desk. The producing endpoint,
  `src/domains/agency/routes/casting.js:201-223`, never returns an `archetype` field —
  `grep -rn archetype src/` finds it only in `src/shared/lib/talent-data-inventory.js:80`.
  Reachable via `/dashboard/agency/signing/:boardId` and `/dashboard/agency/submissions` with a board
  selected.
- **String/state:** every card's meta line renders the division mark **"Editorial"**, in the
  authored high-contrast serif treatment reserved for the editorial masthead voice
  (`components/status/divisions.js:102, 129`).
- **Industry reality:** R2 §2 — Editorial is a *market board*, a commercial and career-stage
  statement about what a person is booked for. Boards are the agency's primary organising key
  (R2 §5.6). Asserting one for a stranger who has declared nothing is an assertion about their
  market position.
- **Why it fails:** the fallback is a hard-coded literal, not a data gap the UI signals. `divisions.js`
  goes to real trouble to make absence honest — `resolveStanding` defaults to `unknown` precisely
  because *"NEVER infer a positive standing from absence"* (`divisions.js:343-346`) — and then the
  caller two files over does exactly that for the division itself. A booker scanning a board sees a
  wall of Editorial and learns nothing, or worse, believes it.
- **Fix:** drop the `|| 'editorial'` and render nothing when the field is absent; or have
  `routes/casting.js` return the talent's own declared lanes (Discover already does this correctly —
  `DiscoverPage.jsx:85`, *"The talent's own declared board (first booking lane); nothing is assumed."*).

### L7-06 [P1] [CLAIM/SCOPE] Agency-facing copy tells a booker that talent have a metered "monthly Pholio limit / allowance", and sells the agency's link as the bypass

- **Where:** `client/src/domains/agency/pages/settings/OpenCallPanel.jsx:178-183` and `:91`.
  Reachable via `/dashboard/agency/settings` → Open Call Links.
- **String/state:**
  - `"Your applicant funnel, routed through Pholio"` (notice title)
  - `"Put an open call link on your website or in scouting emails. Talent arriving through it submit
    straight to your house — and those invited submissions never count against their monthly Pholio
    limit."`
  - `"A standing call for new faces. Applicants consent to representation review and the submission
    does not count against their monthly Pholio allowance."`
- **Industry reality:** the sector's uniform trust standard is that being seen or considered is never
  metered by money: *"SMG does not charge you a fee for representation… Beware of agencies that charge
  any sort of up-front fees"*; IMG *"we never require monetary payment"*; Premier's scouts *"will
  never: Request payment to become a model"* (R2 §5.1). R4 §6 names Runway 7's paid "Skip the Line"
  queue priority as the live counter-example and concludes *"pay-to-be-seen and paid queue priority
  are exactly the patterns every established agency's own warning copy tells models to treat as a red
  flag."* R0 #4 is the same finding from first principles.
- **Why it fails:** the underlying mechanism is benign and I verified it —
  `src/domains/talent/services/application-quota.js:10` is a flat
  `MONTHLY_DISCOVERY_SUBMISSION_LIMIT = 5` with **no plan dependency anywhere** (no `is_pro`,
  `studio_plus` or subscription check in the quota path), and open-call submissions are recorded
  `quota_exempt`. It is anti-spam, not a paywall. But the copy calls it an *allowance* and a *limit*
  and frames the agency's own link as the way past it, which is precisely the shape of the pattern
  bookers are trained to distrust — and it does no work here: the agency does not need to know the
  talent's quota to decide whether to publish a link. This is the only place in the agency surface
  where the talent's payment/metering model becomes visible to a booker (I checked: no Studio+, plan,
  upgrade or subscription string exists anywhere in `client/src/domains/agency`).
- **Fix:** delete both clauses. If the exemption is worth stating at all, state it as a rate rule and
  not as an allowance: *"Submissions through your link are not rate-limited"* — or say nothing.
  Also replace `"applicant funnel"`; see L7-07.

### L7-07 [P1] [TERM] The agency sidebar's own group label is "Pipeline", and the surrounding copy runs on CRM vocabulary

- **Where:** `client/src/domains/agency/constants/agencyNav.js:7` (`AGENCY_NAV_COLLAPSE_AFTER = 'Pipeline'`)
  and `:23` (`label: 'Pipeline'`), rendered by `components/nav/RailNav.jsx:12` inside
  `shared/layouts/AgencyLayout.jsx` — i.e. on **every** agency screen. Supporting instances:
  `lib/permission-groups.js:32` `"Submissions & pipeline"`, `:52` `"Move pipeline stage"`,
  `:41` `"Bulk stage update"`; `pages/SettingsPage.jsx:34` `"Submission and pipeline alerts"`;
  `pages/ActivityPage.jsx:131` `"…moves talent through the pipeline"`;
  `pages/settings/OpenCallPanel.jsx:178` `"Your applicant funnel"`;
  `pages/CastingPage.jsx:190/194` and `CastingDetailPage.jsx:315` `"in consideration"`.
- **Industry reality:** R2 §2.1 — *"Pipeline: sales-CRM register… Netwalk's own word is 'track
  proposed or introduced models'; Mediaslide's is 'track scouted models'."* R2 §8 — *"'Pipeline' —
  alien. Agencies say scouting, applications, coming in."* R4 §2.4 ranks `pipeline` and `funnel`
  among the words that *"break the frame"* worst, alongside `candidate` and `offer letter`. R0 §F
  lists `funnel` explicitly.
- **Why it fails:** this is the persistent chrome. Whatever the screens beneath it get right, the
  first noun a head booker reads on every page is the word the research names as the tell. The code
  even documents the intent — the file's own comment says *"acquisition workflow in funnel order"*.
- **Fix:** rename the nav group. `Submissions · New Faces · Scout` needs no group label at all, or
  **"Intake"**. Replace "Move pipeline stage" → "Move a submission", "Bulk stage update" → "Bulk
  status change", "Submissions & pipeline" → "Submissions", "Your applicant funnel" → "Where your
  submissions come from", "moves talent through the pipeline" → "moves submissions along".

### L7-08 [P1] [CONCEPT] "Bulk accept" — a shipped permission for offering representation to many people at once

- **Where:** `client/src/domains/agency/lib/permission-groups.js:35, 38` (labels
  `"Accept / sign talent"`, `"Bulk accept"`), `:82-83` (both listed in
  `DANGEROUS_PERMISSION_KEYS`); server bulk path `src/domains/agency/routes/inbox.js:2071-2077`,
  activity description `"Representation offered (bulk)"`. Also
  `client/src/domains/agency/constants/applicantLifecycle.js:100-105` — bulk-bar button
  `"Offer representation"`. Reachable via `/dashboard/agency/team` (permissions) and the submissions
  bulk bar.
- **String/state:** `"Bulk accept"`, `"Bulk decline"`, `"Offer representation"` (bulk),
  activity `"Representation offered (bulk)"`.
- **Industry reality:** R2 §2.1 — *"Agencies do not 'accept' applications. They offer representation,
  which is then contracted."* R2 §3.3: the representation offer is the moment before the only
  transition in the whole model that obligates both parties. R2 §3.1 [3]: *"Agency acts,
  unilaterally. Not a mutual match."* — but unilaterally about **one** person, after a meeting
  (step [2]) that this product has no notion of completing.
- **Why it fails:** offering representation is the agency's highest-cost decision; it follows a
  meeting, in person, one person at a time (R2 §3.1). A multi-select bulk action for it describes a
  volume-recruiting workflow, not an agency. Bulk *decline* is defensible — agencies do clear an
  inbox in one pass, and the decline flow here is well built (L7-W3) — but bulk *offer* is not, and
  the product's own `DANGEROUS_PERMISSION_KEYS` list shows someone already knew.
- **Fix:** remove `applications.bulk_accept` and the "Offer representation" bulk button. Keep bulk
  shortlist, bulk keep-on-file, bulk pass. If a shortcut is wanted, make it bulk **"Invite to a
  meeting"** — the step that actually precedes an offer.

### L7-09 [P1] [CONCEPT/STATE] "New Face" is offered as a pre-signing action and conflated with Development

- **Where:** `client/src/domains/agency/pages/CastingDetailPage.jsx:123` (button `"New Face"`, only
  on the **Shortlisted** column), `:281` (`updateCastingApplicationStage(id, { status: 'development' })`,
  toast `"Development offer — New Face"`), `:34` (`classify`: `development` buckets into
  **Offered**). Labels: `components/ui/StatusText.jsx:30` `development: 'New Face — Development'`,
  compact `'New Face'` (`:76`); `components/status/statusConfig.js:61`
  `development: { idx: 3, label: 'New Face' }`.
- **String/state:** `"New Face"` / `"Development offer — New Face"` / `"New Face — Development"`.
- **Industry reality:** R2 §1.2–§1.3 — New Faces and Development are **boards of signed talent**;
  *"'in development' means: signed, but not yet sellable at full rate… It is **not** a pre-signing
  pipeline stage."* R2 §6.5 settles the second half explicitly: six agencies operate New Faces and
  Development as **separate peer boards** (Viva, Milk, Chadwick all publish both) — *"Do not hard-code
  them as one concept."*
- **Why it fails:** the product does both prohibited things. It offers "New Face" from the
  *shortlist* column, i.e. before any offer, before any meeting, before any contract — which is the
  one thing R2 says the phrase cannot mean. And it maps the button to a single `development` status
  labelled `"New Face — Development"`, welding the two boards together. The product's own
  `components/status/statusConfig.js:76-80` `LADDER` gets it right — `New Faces` → `Development` →
  `Main Board` as three distinct rungs — so this is internally inconsistent as well as wrong.
- **Fix:** remove the button from the pre-signing columns. Placement on New Faces or Development is a
  post-signing routing decision (R2 §3.1 step [5]); it belongs wherever represented talent live, as a
  **board placement** picker with New Faces and Development as separate choices — not as a status on
  an application.

### L7-10 [P1] [MINOR] The Spec Builder refuses hair colour but will let an agency require an under-18's bust, waist and hips

- **Where:** `src/domains/spec-registry/authoring/authorable-fields.js:63-80` (`ELIGIBILITY_FIELDS`
  includes `measurements.bust/chest/waist/hips/clothing_size/shoe_size` and `applicant.age_years`),
  `:91-95` + `:131-134` (`canScopeBy` returns true for every eligibility field, so `appliesWhen` can
  be an age condition). UI: `client/src/domains/agency/pages/settings/SpecBuilderPanel.jsx:44-49`
  (group `"Who this is for"`), `:253-283` (`Applies to` scope picker). Reachable via
  `/dashboard/agency/settings` → Requirements.
- **String/state:** the eligibility field dropdown offers `Bust`, `Chest`, `Waist`, `Hips`,
  `Clothing size`, `Shoe size`, `Age`; the "Applies to" picker offers `Women / Men / Curve /
  Non-binary` plus any eligibility field. The refusal explainer is headed *"Why can't I require hair
  colour or nationality?"* — the four refused fields are nationality and hair/eye colour only
  (`:34-41`).
- **Industry reality:** BFMA Code of Practice, verbatim: *"We believe it is inappropriate to measure
  any young person under the age 18 except for their height."* (R2 §5.4, R2 §2.1 which names this as
  a flinch item: *"A product that collects bust/waist/hips from a 16-year-old is in breach of UK best
  practice."*) R1 §4.2 corroborates from the intake side: **Storm, Premier, Models 1, Society and IMG
  ask height only** at submission; the agencies that ask B/W/H skew US commercial and curve.
- **Why it fails:** the file's stated principle is right — *"Eligibility is therefore allowlisted, not
  denylisted"* — but the allowlist was drawn around protected characteristics and not around age.
  Nothing stops an agency publishing "Hips is at least 88 · Applies to: Age is at most 17", and
  nothing stops an unscoped B/W/H requirement reaching a 16-year-old on a representation open call
  whose own eligibility placeholder is *"e.g. 16 and over"* (`OpenCallBriefFields.jsx:41`).
- **Fix:** refuse `measurements.{bust,chest,waist,hips,cup_size,clothing_size}` whenever the rule's
  scope includes anyone under 18, and suppress those requirements at render time for a minor
  applicant. Add the reason to the refusal explainer, which is the right pattern already built:
  *"Under 18s are asked for height only (BFMA Code of Practice)."*

### L7-11 [P1] [CONSISTENCY] One decision, five names — and two of them appear in the same Activity row

- **Where / variants (all reachable):**
  | Where | String |
  |---|---|
  | `CastingDetailPage.jsx:125` (board card) | button **"Pass"** |
  | `CastingDetailPage.jsx:284` | toast **"Passed"** |
  | `constants/applicantLifecycle.js:106,121` | tip **"Pass · X"**, aria **"Pass on %s"**, bulk **"Pass"** |
  | `components/decline/DeclineReasonModal.jsx:76-77` | **"This will mark {name} as not moving forward."** |
  | `src/domains/agency/routes/inbox.js:1884` | activity description **"Not moving forward"** |
  | `components/ui/StatusText.jsx:41` | `declined: { label: 'Not moving forward' }` |
  | `components/ui/StatusText.jsx:64-66` | `LABEL_OVERRIDES = { declined: 'Passed' }` |
  | `casting-stage-helpers.js:6` | server stage name **"Passed"** |
- **Industry reality:** R4 §9 — the words real organizers use are **released** and **not selected**;
  *"never rejected."* R2 §2.1 — agencies do not "accept" either. "Pass" is genuine booker shorthand
  and is the right pick; "not moving forward" is HR-ATS filler.
- **Why it fails:** the two collide inside one row. `ActivityPage.jsx:177-186` renders
  `{item.description}` followed by `— <StatusText status={new_status}/>`, so a declined submission
  prints: **"Amara Diallo Not moving forward — Passed"**. A booker reads two different verdicts in
  one line.
- **Fix:** standardise on **Pass / Passed** everywhere (it is already the override winner), including
  the confirm modal and the server-written activity description. Reserve *Released* for the event
  path where a claim is being dropped, and never use "not moving forward".

### L7-12 [P1] [DATA] A "Type" the booker fills in on every new board is silently discarded

- **Where:** `client/src/domains/agency/pages/CastingNewModal.jsx:14` (`TYPES = ['Campaign',
  'Editorial', 'Runway', 'Lookbook', 'Commercial', 'E-commerce']`), `:129-136` (the labelled
  **"Type"** select), `:62-71` (the `createBoard` payload — which sends `name`, `client_name`,
  `description`, `closes_at`, `target_slots`, `is_active`, `board_type` and **not** `type`). Server:
  `src/domains/agency/routes/inbox.js:520-560` reads no `type`; the `boards` table has no such column.
  Reachable via `/dashboard/agency/signing` → "New board".
- **String/state:** a required-looking, always-populated select defaulting to `'Campaign'`.
- **Industry reality:** first principles. Campaign / Editorial / Runway / Lookbook / Commercial /
  E-commerce is a good, real list — R2 §2 confirms these as market segments — which makes the loss
  worse: the booker believes they have classified the board.
- **Why it fails:** the value never leaves the browser. There is no way to see it afterwards, filter
  by it, or discover it was dropped. Meanwhile the board's *actual* discriminator, `board_type`
  (division vs package), is derived silently from whether a client name was typed
  (`CastingNewModal.jsx:59`).
- **Fix:** either persist it (add the column; surface it on the folio card, which currently shows no
  type at all) or delete the control.

### L7-13 [P1] [CONCEPT] "Not for us" is a permanent, unreviewable erasure presented with an Undo

- **Where:** `client/src/domains/agency/components/scout/ScoutRoom.jsx:739-758` (the
  `"Not for us"` / `"Undo"` pair); server
  `src/domains/agency/routes/inbox.js:4858-4884` (POST/DELETE dismiss);
  effect `src/domains/agency/services/discover-search.js:512-515, 591-594`
  (`query.whereNotIn("profiles.id", [...dismissedProfileIds])` on both browse and query paths).
  Reachable via `/dashboard/agency/discover` → open a card → footer.
- **String/state:** `"Not for us"` — and, once set, `"Not for us  Undo"`.
- **Industry reality:** R4 §7 — re-entry is seasonal, not terminal: *"a strong application that
  misses one season is kept in view for the next"* (The Bureau); *"Each season brings a new set of
  designers looking for a different aesthetic"* (Omaha FW). R2 §3.2 [1]: agencies keep people **on
  file**; that state is the commonest real outcome, and this codebase models it well elsewhere
  (`divisions.js:336`, `onfile`).
- **Why it fails:** dismissal removes the profile from every future Discover query for that agency,
  and there is **no "Not for us" list anywhere in the client** (`grep -rn dismiss client/src/domains/agency`
  returns only the ScoutRoom footer and the two API wrappers). The Undo therefore only works while
  the room is open; close it and the person cannot be found again by any means the UI offers. An
  agency that dismisses a 17-year-old in September has also dismissed the 19-year-old they become.
- **Fix:** make dismissal expire (a season, or 12 months) and add a **"Not for us"** view in Discover
  listing who is hidden, with restore. Alternatively soften it to a sort penalty rather than an
  exclusion.

### L7-14 [P1] [CONCEPT/DATA] Event compensation has no usage/image-rights field — the thing that actually travels with unpaid event work

- **Where:** `client/src/domains/agency/pages/settings/EventCallFields.jsx:18-29, 126-166`;
  taxonomy `client/src/shared/constants/eventCasting.js` (`PAID | STIPEND | UNPAID`);
  render `pages/events/eventFormat.js:51-58`. Reachable via `/dashboard/agency/settings` → Open Call
  Links → Event cast, and read back on `EventsPage.jsx:87` / `EventCallPage.jsx:84`.
- **String/state:** the three choices `Paid` / `Stipend` / `Unpaid`; help text for Unpaid:
  *"Unpaid is a legitimate answer and applicants are shown it plainly. Add what you do provide, if
  anything."*; the consent sentence is the compensation line verbatim.
- **Industry reality:** R4 §5 — *"**Rights grabs travel with unpaid work.**"* Runway 7's model terms
  grant use of the model's *"image, likeness, photos, and video footage… in perpetuity and worldwide,
  with no further compensation owed"*, against the represented side where usage is licensed narrowly
  ("one image via a single published medium for one year… United Kingdom only"). R4 calls this
  *"the single sharpest asymmetry between System A and System B."* Also R4 §5: the real unpaid
  taxonomy is **TFP / trade / collaboration / benefits-in-kind** (modelmanagement.com's own field is
  `Collaborative shoot or event`; Greenville offers a program-book credit and a photo gallery;
  FashioNXT offers a development programme) — *stipend* is not a fashion word.
- **Why it fails:** the product builds a real consent record and restates the compensation sentence
  in it word for word — an excellent mechanism — and then leaves out the term that unpaid event
  participation is actually traded for. An organizer who says "Unpaid — hair and makeup provided" has
  a Pholio consent record that is silent on whether the show's photographer can use the model's image
  forever. That silence is worse than no consent record, because the record looks complete.
- **Fix:** add a required **"Image and video usage"** statement beside compensation, restated in the
  same consent sentence (media, territory, duration), and add `TFP / trade` and `Expenses only` to
  the compensation type list. Rename `Stipend` → `Fee or stipend`, or drop it into `Paid` with the
  amount in details.

### L7-15 [P2] [TERM] "Export call sheet" exports a spreadsheet of applicants named `pholio-applications-<date>.csv`

- **Where:** `client/src/domains/agency/pages/events/LineupPanel.jsx:105-114` (button
  `"Export call sheet"`), `api/agency.js:854-858` (`eventExportUrl` → `GET /api/agency/export?format=csv`),
  `src/domains/agency/routes/inbox.js:3557-3591, 3613` (columns and
  `filename = \`pholio-applications-${date}.csv\``). Reachable via
  `/dashboard/agency/events/:linkId` → Lineup.
- **Industry reality:** R4 §2.2 — a **casting detail sheet / call sheet** is *"what the model is sent
  once confirmed: call time, location, client, production details"* (modelmanagement.com glossary).
  It is a per-model document going outward, not a roster spreadsheet coming inward. R4 §3.2 lists the
  real sequence a selected model receives: Rehearsal Email → Call Time Email → General Information
  Email.
- **Why it fails:** the export has no call time and no location; it is Name/Email/Phone/City/Height/
  Measurements/Age/Bio/Designer/Mark/Availability/Walk Video/Compensation. The file that lands is
  literally called "applications". An organizer who clicks this expecting to send call sheets gets a
  contact list.
- **Fix:** rename the button **"Export lineup (CSV)"** and the file `pholio-lineup-<event>-<date>.csv`.
  If a real call sheet is wanted, that is a separate, per-confirmed-model artefact with call time.

### L7-16 [P2] [TERM/LEAK] Discover splits a brief into "Roles"; the same idea is called "Looks" on the event side

- **Where:** `client/src/domains/agency/components/BriefLine.jsx:182` (`aria-label="Roles in this
  brief"`), `:191-193` (fallback button text `` `Role ${index + 1}` ``, otherwise the LLM's own
  `r.summary || r.label`). Source of the noun:
  `src/domains/agency/services/discover/parse.js:76-78` — the model prompt is *"convert an agency
  casting BRIEF into a strict JSON **roles** contract… Return ONE role per distinct person"*;
  schema name `discover_roles_contract` (`contract-schema.js:199`). Reachable via
  `/dashboard/agency/discover` with a multi-person brief.
- **Industry reality:** R4 §2.4 — *"role"* belongs to the acting/commercial casting register
  (Casting Networks: "1 role available"); fashion says **look**, **lineup**, **option**, or just the
  person. Pholio's own event surface already uses the right word:
  `pages/events/PickListsPanel.jsx:313` **"Looks to cast"**, `:388` `"for {n} looks"`,
  `LineupPanel.jsx:145` `"of {n} looks"`.
- **Why it fails:** two words for one concept in one product, and the wrong one is the internal
  schema noun escaping to the UI along with an LLM-authored label the booker never wrote.
- **Fix:** render "Looks in this brief" / "Look 1"; keep `roles` as the internal contract key.

### L7-17 [P2] [TERM] Team seats use consulting and property titles, and there is no New Faces seat

- **Where:** `client/src/domains/agency/components/team-presence.js:14-28`
  (`PRESET_ROLE_LABELS`, `ASSIGNABLE_ROLES`) and `components/TeamRolesGuide.jsx:3-9`.
  Reachable via `/dashboard/agency/team`.
- **String/state:** `OWNER → "Principal"` · `ADMIN → "Managing Agent"` · `AGENT → "Agent · Booker"` ·
  `SCOUT → "Scout · Junior"` · `VIEWER → "Observer"`; section head **"Seats & permissions"**;
  *"How access is governed across the house."*
- **Industry reality:** R2 §7 source 31 (Sandra Reynolds team page) gives the real UK title set:
  **Managing Director, Head Booker, Head of New Faces, Senior Booker, Client Account Manager**.
  R2 §2 lists **booker, agent, scout, casting director** as the practitioner words; *recruiter*
  appears in the sample **only inside scam warnings** (R4 §6). "Principal" is a law/architecture
  title; "Managing Agent" is a Lloyd's/property title.
- **Why it fails:** three problems, in order of weight. (1) There is **no New Faces seat**, and new
  faces staff are the people who do intake — R0 #5: *"Intake is a low-priority, high-volume task
  handled by new-faces / scouting staff."* Pholio is an intake tool with no seat for the job it
  serves. (2) `SCOUT → "Scout · Junior"` welds two different jobs together: a scout finds people
  (streets, socials, competitions — R2 §3.1); a junior booker works a desk. (3) "Seat" is
  per-license SaaS vocabulary in a product that, per PRODUCT.md, does not charge agencies at all.
- **Fix:** `OWNER → Director` · `ADMIN → Managing Director` · `AGENT → Booker` ·
  `SCOUT → Scout` · `VIEWER → Read only`; add a **Head of New Faces** preset between Booker and
  Managing Director carrying intake + minor-submission access; "Seats & permissions" → "Roles &
  access".

### L7-18 [P2] [DATA/CONSISTENCY] Height and measurements are formatted four different ways across this lane

- **Where / variants:**
  | Surface | Format | File |
  |---|---|---|
  | Discover card | imperial only — `5′ 11″` | `DiscoverPage.jsx:41, 87` (`cmToImperial`) |
  | Scout room, Height | imperial **and** metric stacked — `5′ 11″` over `180 cm` | `ScoutRoom.jsx:584-591` |
  | Discover "facts" chip | metric **and** imperial inline — `Bust 82 cm (32 in)` | `src/…/discover/present.js:566-569` |
  | Signing-board API | bare, unitless, unlabelled — `82-62-89` | `src/…/routes/casting-stage-helpers.js:50-58` |
  | CSV export | `Height (cm)` column + a `Measurements` column | `src/…/routes/inbox.js:3563-3564` |
- **Industry reality:** R2 §4.1 finding 4 — *"Dual units are a **toggle**, not a dual display.
  Premier ships two complete stat blocks and swaps them… Never show 180cm / 5'11" side by side."*
  Finding 5: UK/US lead imperial, EU is metric-only, and **shoe size is always localised**. R2 §2.1
  flags unit-less measurement strings as a flinch item.
- **Why it fails:** a booker comparing a Discover card, a Scout room and a board card is reading the
  same person in three notations. The bare `82-62-89` in particular has no unit and no labels.
- **Fix:** one `<Stat>` primitive with an agency-level unit preference (imperial-lead / metric-only)
  and a toggle, used everywhere; shoe always carries its region (Discover already does this —
  `present.js:612-615`). Note `formatCastingMeasurements` is currently unrendered (see Dead code) —
  fix or delete it before it reaches a screen.

### L7-19 [P2] [TERM] "Event cast" as a countable noun; "Who to book" for an unpaid slot

- **Where:** `client/src/domains/agency/pages/EventsPage.jsx:58, 68, 76`
  (`"Casts you are running"`, `"No event casts yet"`, `"Untitled cast"`);
  `EventCallPage.jsx:56, 71, 96`; `pages/settings/OpenCallPanel.jsx:85` (call-kind chip
  `"Event cast"`); `pages/events/LineupPanel.jsx:166` (`"Who to book"`).
- **Industry reality:** R4 §2.2 — organizers say **model call**, **open casting**, **casting**,
  **audition** (Omaha "Model Call"; FashioNXT "Model Auditions"; Fashion Week Haus "in-person
  casting"). "A cast" as a countable event is not in any of the ~25 notices sampled. R4 §2.1 —
  **booking** is the *confirmed paid job*; an unpaid runway slot resolves to *confirmed*, not booked.
- **Why it fails:** minor, but "Untitled cast" and "No event casts yet" read as invented. And the
  Lineup header says "Who to book" on a call whose compensation may literally be set to `Unpaid`
  three fields away.
- **Fix:** **"Model call"** for the object (`"No model calls yet"`, `"Untitled call"`), and
  `"Who to confirm"` for the lineup header.

### L7-20 [P2] [CONCEPT] Boards are named once during setup and cannot be added, renamed or retired afterwards

- **Where:** `client/src/domains/agency/pages/SetupPage/chapters.js:71-79` (chapter "The boards");
  `src/domains/agency/routes/setup.js:24, 33, 304-311` (step key `boards`, label
  `"Boards and markets"`). `client/src/domains/agency/pages/SettingsPage.jsx:22-41` has panels for
  Identity, Branding, Open Call Links, Requirements, Export, Notifications, Security — **and no board
  panel**. `App.jsx:168` redirects `/dashboard/agency/roster` → `/dashboard/agency/submissions`.
- **String/state:** the setup copy promises what Settings does not deliver: *"We have pre-selected the
  boards you named in your request; **add or retire any of them now or once the workspace is open**."*
- **Industry reality:** R2 §5.6 is the strongest structural claim in the research: *"for many agencies
  the public website and the booking system are one system, and 'board' is a first-class entity in the
  data model. Any tool that gives an agency a board-less flat list is not just using the wrong word —
  it is missing the primary key."* R2 §3.3: board placement and promotion are *"reversible, freely —
  it's an internal routing decision."* Boards get reshuffled every season.
- **Why it fails:** the promise in setup has no destination. A house that opens a Curve board in
  March cannot add it. And `/roster` redirecting to the submissions inbox means the represented side —
  the part of the business R2 §8 says carries all the durable, high-stakes data — has no home at all.
- **Fix:** a **Boards** panel in Settings (add / rename / retire / reorder, with the division taxonomy
  in `components/status/divisions.js` as suggestions), and route `/roster` to a real board view of
  represented talent rather than back into the inbox.

### L7-21 [P2] [CLAIM] "Exclusive elsewhere" is shown without knowing where "elsewhere" is — including to the agency that holds the exclusive

- **Where:** `src/shared/lib/audience-dto.js:494-501` (`deriveRepresentationStatus` takes no viewer
  agency and returns `{ representation_status: "exclusive_elsewhere", represented_by: null }`);
  rendered `client/src/domains/agency/components/scout/ScoutRoom.jsx:103, 573-580`.
- **String/state:** `"Exclusive elsewhere"` plus *"Check before you approach. This person already has
  an agency relationship."*
- **Industry reality:** R2 §1.5 — a model is normally represented in several markets at once via a
  mother agency and placements; "exclusive" is scoped to an agency **and** a market/territory (the
  `talent_representations` table already stores `market`, `territory`, `scope_key`, `is_exclusive`).
  NY's statutory definition is agency-relative (R2 §1.4).
- **Why it fails:** "elsewhere" is a claim relative to the viewer, computed without the viewer.
  An agency that *is* the exclusive agency sees "Exclusive elsewhere" about its own talent. And a
  Paris-market exclusive reads as a blanket block to a New York booker, when placement in another
  market is the normal case.
- **Fix:** compare the representation rows against the viewing agency and render
  `"Exclusive with you"` / `"Exclusive elsewhere — {market}"` / `"Represented in {market}"`; when the
  market is undisclosed, say `"Exclusive, market undisclosed"`.

### L7-22 [P2] [LEAK] Registry-maintainer field labels are shown to a booker in the Requirements dropdown

- **Where:** `client/src/domains/agency/pages/settings/SpecBuilderPanel.jsx:192-196` renders
  `candidate.label` verbatim from the taxonomy; labels from `data/spec-registry/v1/taxonomy.json`.
  Reachable via `/dashboard/agency/settings` → Requirements → "Who this is for" → Choose a field.
- **String/state:** the eligibility dropdown contains **"Applicant height"** *and* **"Height field"**
  (`applicant.height_cm` and `measurements.height`) as two separate options; also **"Scoped work
  authorization"**, **"Applicant track"**, **"Applicant story"**, and four overlapping location
  fields (`City`, `Location`, `Country`, `State or region`).
- **Industry reality:** first principles. These labels were written to describe *what third-party
  submission forms expose*, which is the registry's real job; they are not authoring vocabulary.
- **Why it fails:** an agency choosing between "Applicant height" and "Height field" has no basis to
  choose, and picking the wrong one silently changes which of the talent's declared values the rule
  reads. "Scoped" and "track" are internal words.
- **Fix:** give the builder its own display labels (`Height`, `Right to work in the market`,
  `Board they're applying to`, `City`), and collapse the duplicate height and location fields to one
  authoring option each.

### L7-23 [P2] [CONSISTENCY] "Signing secret" sits in the same Settings as a top-level nav item called "Signing"

- **Where:** `client/src/domains/agency/pages/settings/ExportWebhookPanel.jsx:158-161`
  (`<h3>Signing secret</h3>`, *"Every delivery carries an `X-Pholio-Signature`…"*) vs
  `constants/agencyNav.js:26` (nav `Signing` = representation boards).
- **Why it fails:** in a product where "Signing" is the representation section, a Settings heading
  "Signing secret" reads, for a moment, as something to do with signing talent. Trivially avoidable.
- **Fix:** **"Webhook secret"** or **"Request signature key"**.

### L7-24 [P2] [TERM] Messages framing — "Correspondence between your house and its talent", "your outreach"

- **Where:** `client/src/domains/agency/pages/MessagesPage.jsx:143, 173`.
- **String/state:** *"Correspondence between your house and its talent"*; *"When talent reply to your
  outreach, their threads gather here."*
- **Industry reality:** R2 §2 — *"house"* in fashion is the **designer/brand** (Dior is a house); the
  agency is *the agency* or *the office*. R0 §F flags marketing/sales register; "outreach" is
  campaign vocabulary, and R4 §6 shows unsolicited agency contact is exactly what impersonation
  warnings are about — a word that sounds like a marketing blast is the wrong one to attach to it.
  ("House" recurs across the lane: `TeamRolesGuide.jsx:4,16`, `OpenCallPanel.jsx:181`,
  `agencyNav.js:46`.)
- **Fix:** *"Messages between your agency and talent"* and *"When talent reply, their threads appear
  here."*

---

## Coined / internal terms encountered

| Term | Where | Verdict | Translation |
|---|---|---|---|
| **Signing board** | `CastingPage.jsx:190,230`, `CastingNewModal.jsx:74,109` | **translate** — collides with *board* = division (R2 §8) | New Faces (intake) / Package (client) |
| **Board kind: Division board / Client package** | `CastingNewModal.jsx:149-157` | keep the distinction, translate the wrapper | "Board" (division) vs "Package" (client) |
| **Board rack** | `CastingPage.jsx:228` | keep — evocative, unambiguous, not a claim | — |
| **Pipeline** (nav group) | `agencyNav.js:7,23` | **translate** | Intake, or no group label |
| **Applicant funnel** | `OpenCallPanel.jsx:25,178` | **translate** | Where your submissions come from |
| **In consideration** | `CastingPage.jsx:58,194`, `CastingDetailPage.jsx:315` | keep | — |
| **Event cast** (noun) | `EventsPage.jsx:58,68,76`, `OpenCallPanel.jsx:85` | **translate** | Model call |
| **Pool / Designers / Lineup / Pick list** | `EventCallPage.jsx:33-37`, `PickListsPanel`, `LineupPanel` | **keep** — verbatim organizer vocabulary (R4 §2.3) | — |
| **Looks to cast** | `PickListsPanel.jsx:313` | **keep** | — |
| **Slot** (event) | `applicantLifecycle.js:114-121`, `LineupPanel.jsx:203` | keep — R0 #20 supports loose show-lineup use | — |
| **Role** (Discover brief) | `BriefLine.jsx:182,193`, `parse.js:76` | **translate** — acting register, and an internal schema noun | Look |
| **Not for us** | `ScoutRoom.jsx:743,756` | **keep** — exactly what a booker says | — |
| **Scouting / Scout room** | `ScoutRoom.jsx:431,445`, nav `agencyNav.js:27` | **keep** (R2 §2, Mediaslide "track scouted models") | — |
| **New Face** (as a pre-signing action) | `CastingDetailPage.jsx:123,281` | **translate/relocate** — it is a post-signing board (R2 §1.3) | Board placement, after signing |
| **Discoverable talent** | `DiscoverPage.jsx:634,647` | **hide** — an internal opt-in flag as a noun | "talent open to being found" |
| **Principal / Managing Agent / Scout · Junior / Seat** | `team-presence.js:14-28` | **translate** | Director / Managing Director / Scout / Role |
| **Height field / Scoped work authorization / Applicant track** | `data/spec-registry/v1/taxonomy.json` via `SpecBuilderPanel.jsx:194` | **hide** — registry-maintainer labels | Height / Right to work / Board |
| **Revision N** (published requirements) | `SpecBuilderPanel.jsx:167,553` | **translate** | "Published 3 Sep 2026" |
| **Standing** | `divisions.js:331-347` | **keep** — well-modelled, honest defaults | — |
| **House** (= the agency) | `TeamRolesGuide.jsx:4,16`, `MessagesPage.jsx:143`, `OpenCallPanel.jsx:181` | **translate** — a house is a designer/brand | agency, office |

---

## Consistency variants

| Concept | Variants seen | Locations |
|---|---|---|
| Declining a submission | `Pass` · `Passed` · `Not moving forward` · `declined` · `Decline` | `CastingDetailPage.jsx:125,284`; `applicantLifecycle.js:106,121`; `DeclineReasonModal.jsx:76-77`; `inbox.js:1884`; `StatusText.jsx:41,65`; `permission-groups.js:36` |
| Offering representation | `Offer` · `Offered` · `Offer / Moving Forward` · `Accept / sign talent` · `Representation offered` · `accepted` | `CastingDetailPage.jsx:120,279`; `statusConfig.js:46`; `StatusText.jsx:31`; `permission-groups.js:35`; `inbox.js:1629` |
| New Faces / Development | `New Face` · `New Face — Development` · `Development offer — New Face` · two separate ladder rungs | `StatusText.jsx:30,76`; `statusConfig.js:61`; `CastingDetailPage.jsx:123,281`; `statusConfig.js:76-80`; `divisions.js:97-99` |
| A person who submitted | `applicant` · `submission` · `candidate` (code only) · `talent` | `PickListsPanel.jsx:149,221,450`; `SpecBuilderPanel.jsx:433`; `OpenCallPanel.jsx:178`; nav `Submissions` (`agencyNav.js:25`); `board-candidates` query keys |
| A person to be cast for one show | `Role` (Discover) · `Look` (Events) · `Slot` (Events) | `BriefLine.jsx:182`; `PickListsPanel.jsx:313`; `LineupPanel.jsx:203` |
| Height / measurements | imperial-only · imperial+metric stacked · metric+imperial inline · unitless `82-62-89` | `DiscoverPage.jsx:41`; `ScoutRoom.jsx:584-591`; `present.js:566-569`; `casting-stage-helpers.js:50-58` |
| The agency itself | `agency` · `house` · `workspace` · `organization` | `MessagesPage.jsx:143`; `TeamRolesGuide.jsx:16`; `AgencyLegalAcceptanceGate.jsx:55`; `permission-groups.js:9` |
| Board close state | `Closes {date}` · `Closes today` · `Closed {date}` · `Wrapped` · `is_active: false` | `CastingPage.jsx:16-24`; `CastingDetailPage.jsx:53-61` |

---

## Working well (preserve)

1. **The whole event surface is right.** Pool → Designers → Lineup (`EventCallPage.jsx:33-37`) with
   designer **pick lists** marked *pick / maybe / pass* is a faithful implementation of what Omaha,
   FashioNXT, Greenville, KCFW and The Bureau describe in their own copy (R4 §2.3, §3.2), and the
   mark taxonomy matches AgencyPin's *Interested / Maybe / Not interested* (R2 §1.7).
2. **The confirmation is the model's.** `applicationStatus.js:14-19` — `confirmed` and
   `declined_by_talent` are talent-writable only, and `LineupPanel.jsx:24-27` states it in the UI:
   *"the applicant answers from their own dashboard, and only their answer produces a confirmation."*
   This is the correct ownership model and it should be extended to representation (L7-01).
3. **Designers never see contact details, and never see minors.** `pick-share.js:25-31` runs
   `applyMinorSubmissionFilter(..., { force: true })` because *"Event calls are 18+"*; the DTO is a
   frozen submission package, not live profile data, so a talent's later edits cannot rewrite what a
   designer was shown. `PickListsPanel.jsx:247-252` states the boundary to the organizer plainly.
4. **The pick-list link is hash-stored, shown once, reissuable and revocable** with an inline
   confirmation (`PickListsPanel.jsx:339-341, 427-430, 479-507`).
5. **The Scout room leads with the representation gate.** `ScoutRoom.jsx:94-113, 573-580` — *"Seeking
   representation" / "Exclusive elsewhere" / "Represented, agency undisclosed" / "Representation not
   stated"*, with *"Check before you approach"*. R2 §1.5 makes this the single most important fact
   for a scout, and the code comment says so.
6. **Discover states its own boundary.** `ScoutRoom.jsx:648-665` — *"What an application would add:
   This page shows what this person chose to publish. It does not include their dossier, their exact
   date of birth, their contact details, or any measurements they have not published."* And the
   invite consent line: *"An invitation asks them to apply. It does not share your search or open
   their dossier."* This is the honest-observer standard R0 §E asks for.
7. **An invitation is not an application.** `inbox.js:4714-4732` explicitly refuses to write an
   `applications` row for an invite, because doing so *"handed this agency the submission-grade
   dossier… for a talent who had done nothing."*
8. **Discover ranks on stated requirements against declared facts, and prints the fact, not a score.**
   `present.js:583-651` builds "the declared values that answered the brief"; `semantic.js:10-15`
   states *"No number leaves this module towards the API."* No match score, no percentage, no opinion
   about a face — exactly what R2 §2.1 says agency software must not do.
9. **Misses are stated in booker language, and a heritage miss never prints the talent's heritage.**
   `present.js:684-687, 774-776`.
10. **The division/standing model is genuinely expert.** `components/status/divisions.js` — 21-board
    taxonomy matching R2 §2, agency-authored names preserved, `resolveStanding` defaults to `unknown`
    rather than inferring a positive claim, availability deliberately excluded from standing because
    *"a talent on a first option is still represented"*, and a separate `ended` state so an expired
    contract is not rendered as a rejection.
11. **`Bookout` / `Booked out` / `Marked unavailable` in Discover's miss notes** (`present.js:744-753`)
    is correct booker vocabulary (R4 §2.1).
12. **Decline defaults to no reason**, and previews what the talent will read
    (`DeclineReasonFields.jsx:49-50, 81`). Matches R2 §3.1 and R4 §9: agencies do not give reasons.
13. **The open-call brief fields read like real agency copy.** `OpenCallBriefFields.jsx:32, 41` —
    *"Four digitals — close-up, profile, waist-up, full length. No makeup, hair back."* and
    *"16 and over. No height requirement for the commercial board."* These are almost verbatim R1 §4.1
    and §4.2. `"Runs continuously"` correctly models a permanent open call.
14. **Spec Builder shot vocabulary is exactly right** — `Full length / Portrait length / Close-up /
    Headshot / Mid-length / Waist-up / Three-quarter length` (`taxonomy.json`), matching R1 §4.1's
    frequency ranking; and it supports a **height-only board** (the Storm/Premier/Models 1/Society/IMG
    pattern) because `applicant.height_cm` can be the sole eligibility rule, scoped by gender/track
    via `SCOPE_ONLY_FIELDS`.
15. **Requirements are advisory, and the UI says so:** *"It is guidance, not a gate — anyone can still
    submit, and nothing here can turn an applicant away"* (`SpecBuilderPanel.jsx:434-440`). Publishing
    freezes a dated version so *"applicants already reviewed against an earlier version keep the
    version they were actually measured against."*
16. **Protected characteristics are refused with a reason, not hidden** —
    `authorable-fields.js:34-41` and the *"Why can't I require hair colour or nationality?"* disclosure.
17. **Compensation cannot be left unstated** on an event call, and the sentence the organizer types is
    the sentence the applicant consents to, verbatim (`EventCallFields.jsx:12-16`, `openCallBrief.js:48-51`).
18. **"Candidate" never reaches a screen** — it survives only in query keys and local variables.
19. **No talent plan, payment or Studio+ state is visible to a booker** anywhere in
    `client/src/domains/agency` (verified by grep) — with the single exception of the quota sentence
    in L7-06.
20. **The minor-access matrix is real infrastructure**, not a comment:
    `minor-submission-access.js:15-41` enumerates every agency endpoint that can touch a minor's data
    with its guard style, including `/boards/:boardId/candidates`.

---

## Dead or unreachable code carrying issues

- **`formatCastingMeasurements`** (`src/domains/agency/routes/casting-stage-helpers.js:50-58`) returns
  a bare `"82-62-89"` on `candidates[].measurements`, but no client maps it —
  `CastingDetailPage.jsx:63-74` (`toTalent`) and `ApplicantsPage.jsx:131-149` (`mapCandidate`) both
  drop the field. Currently invisible; fix the format (units, labels, minor guard) before anything
  renders it.
- **`STATES` in `components/status/statusConfig.js:88-103`** — `getState` falls back to
  `STATES.available`, so an unknown or absent availability value would render a confident
  **"Available"**. `getState` has no callers in the agency client (the live availability component is
  `AvailabilityCell`, used by the dossier in group 17). A latent version of the R2 §2.1 flinch
  (*"'Available/Unavailable' as a talent-set toggle"*); delete or make the default `unknown`.
- **`CASTING_PIPELINE_STAGES`** (`casting-stage-helpers.js:1-7`) is returned as `stages` from
  `/api/agency/boards/:boardId/candidates` and never read by the client, which builds its own
  `COLUMNS`. Two competing ladders, one unused.
- **`mapCastingStageToApplicationStatus`** accepts a legacy `stage` body on
  `PATCH /applications/:id/status` (`inbox.js:1708`); no client sends `stage`.
- **`POST /api/agency/boards/:boardId/duplicate`** (`inbox.js:891-940`) has no client caller; it also
  copies `board_requirements` but not `board_type`, `client_name`, `closes_at` or `target_slots`, so
  a duplicated package board would silently become a division board.
- **Board `type` select** (`CastingNewModal.jsx:14, 129-136`) — reachable and interactive, but the
  value is never transmitted (see L7-12).

---

## Coverage

**Read in full:** `client/src/domains/agency/pages/` — `CastingPage.jsx`, `CastingDetailPage.jsx`,
`CastingNewModal.jsx`, `DiscoverPage.jsx`, `EventsPage.jsx`, `EventCallPage.jsx`, `TeamPage.jsx`,
`SettingsPage.jsx`, `MessagesPage.jsx`, `ActivityPage.jsx`, `events/eventFormat.js`,
`events/PickListsPanel.jsx`, `events/LineupPanel.jsx`, `settings/EventCallFields.jsx`,
`settings/OpenCallBriefFields.jsx`, `settings/openCallBrief.js`, `settings/SpecBuilderPanel.jsx`;
`components/` — `scout/ScoutRoom.jsx`, `BriefLine.jsx`, `status/statusConfig.js`,
`status/divisions.js`, `status/DivisionMark.jsx`, `ui/StatusText.jsx`, `TeamRolesGuide.jsx`,
`team-presence.js`, `TeamPermissionsModal.jsx`, `decline/DeclineReason*.jsx`;
`lib/board-identity.js`, `lib/permission-groups.js`, `constants/agencyNav.js`,
`constants/applicantLifecycle.js`, `shared/constants/applicationStatus.js`.
Server: `src/domains/agency/routes/casting.js`, `casting-stage-helpers.js`, `activity.js`,
`agency-log-activity.js`, `events.js`, `spec-builder.js` (surface), relevant regions of `inbox.js`
(boards CRUD ~L520-940, status/accept/decline ~L1600-2340, discover ~L4096-4890, export ~L3480-3620);
`src/domains/agency/services/` — `minor-submission-access.js`, `event-pick-lists.js` (structure),
`discover/{semantic,present,constraint-eval}.js`, `discover-search.js` (dismissal + representation);
`src/domains/events/routes/pick-share.js`; `src/domains/spec-registry/authoring/authorable-fields.js`;
`src/shared/lib/audience-dto.js` (`deriveRepresentationStatus`);
`src/shared/constants/application-status.js`; `src/domains/talent/services/application-quota.js`,
`representations.js`; `data/spec-registry/v1/taxonomy.json` (field/label inventory).
Routing confirmed in `client/src/App.jsx:150-176`; nav in `constants/agencyNav.js` +
`components/nav/RailNav.jsx`. PRODUCT.md read once for the declared scope boundary only.

**Skipped and why:** `ApplicantsPage.jsx` / `ReviewRoom.jsx` / `ComparisonOverlay` (group 16),
`TalentFullView` + `components/dossier/*` (group 17), `OverviewPage` + `components/overview/*`
(group 15), `SetupPage/*` (group 14), `AgencyRequestsPage` (group 26) — other lanes; read only where
a group-18/20 code path reaches into them (`ApplicantsPage.mapCandidate`, the CSV export). Email
templates and in-app notification writers (groups 27–28) — other lanes; I checked
`sendAgencyInviteEmail`'s subject only to confirm the Discover invite is delivered, and did not audit
it. `Grainient.jsx` and all `.css` — presentation, no strings. `__tests__/**` — not user-facing.
`.claude/skills/**`, `docs/audits/**`, `tasks/**`, `DESIGN.md`, `CLAUDE.md` — excluded by the brief's
hard rules; note that `components/status/divisions.js:26-28` cites `.claude/skills/industry/` as its
source, which I did not open and did not rely on.

**Overlaps flagged for the lead:** L7-04 (raw enum) and L7-15 (call-sheet naming) both touch the CSV
export, which is group 25. L7-05 (`archetype || 'editorial'`) also affects `ApplicantsPage` (group 16).
L7-01 has a talent-facing half (what a talent is told when an agency marks them Represented) that
belongs to the talent lane.
