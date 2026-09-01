# Talent notification bell — redesign

## What actually feeds this surface

Server: `src/shared/services/notifications.js` writes rows into `notifications`
(migration `20260526120000`, comment: *"high-signal user notifications (bell
center) — separate from noisy activities feed"*). Talent-facing emitters:

| type | written by | talent's move |
|---|---|---|
| `message_received` | `agency/routes/messages.js` | **reply** — never suppressed by prefs |
| `application_status` `accepted` | inbox / events | **answer an offer** (event slot offers expire) |
| `application_status` `requested_more` | `agency/routes/materials.js` | **send materials** |
| `application_status` `meeting_requested` | inbox | **answer** |
| `application_status` `development` | inbox | **answer** |
| `application_status` shortlisted/represented/confirmed/declined/passed/`closed_no_response`/archived/kept_on_file | inbox + `application-auto-close.js` | nothing — it's news |
| `profile_not_submission_ready` | `notify-profile-readiness.js` | **fix the profile** — it blocks every submission |
| `agency_profile_view` | `inbox.js` (Scout) | nothing — ambient market interest |
| `application_submitted` | `talent/routes/applications.js` | nothing — a receipt |
| `confirmation` | generic | nothing — a receipt |

Read/limit/grouping: `listUserNotifications` (limit 40), `group_key` dedupe with
`occurrence_count`, `reopenOnRepeat`. Prefs live at
`/dashboard/talent/settings/notifications`, where the product calls this domain
**"Signals" — "What Pholio tells you"**.

## What's wrong with the current panel

1. **It's a log, not a triage.** One flat reverse-chron list, so a representation
   offer sits below a profile view from four minutes ago. The single most valuable
   sentence this product can say to a model — *someone is waiting on you* — is
   nowhere on the surface.
2. **Filters are the wrong axis.** All / Applications / Messages / Profile sorts
   by *source*. Talent think in *what do I owe / what changed*. It also costs a
   click to learn something the panel should just state.
3. **The title lies.** "Activity" is the admin-console framing, and `activities`
   is a different, noisier feed in this codebase.
4. **Every row weighs the same** — same size, same 2px gold side-stripe for unread
   (also banned pattern #13), same generic "View" affordance even on rows where
   there is nothing to do.
5. **Visually foreign.** 340px white card, 12px radius, gold glow shadow, cream
   header band, underlined tabs, 11–12.5px Inter throughout. No Noto Serif
   Display, no JetBrains Mono ledger labels, no hairline rules, no awareness of
   the `tone-dark`/`tone-light` header system. Its sibling one control away — the
   account menu — is a square-cornered curtain with no top border.
6. **Cramped.** 340×340 at 11px; agency names and status copy have no room.
7. **Dead code.** `TYPE_VISUAL` / `getAvatarTone` / `getContextBadge` render
   nowhere; `NotificationCenter.css` is a graveyard plus an unused pulse
   keyframe; `.nc-dropdown` is styled in `TalentLayout.css` but no such element
   has existed since the last rewrite; the `footerLabel`/`onFooterClick` props are
   never passed on the talent side.

## The redesign

The bell answers three questions, in reading order:
1. Is anyone waiting on me?  2. What changed?  3. Is anyone looking?

That is the IA — three bands, not tabs, not reverse-chron.

- **Head is an ink masthead** (`Signals` in Noto Serif Display) carrying a live
  one-line verdict: *"2 waiting on you"* in gold, or *"Nothing needs you"*.
- **Paper list below** — the page unrolls from the header. Same on both header
  tones, so it needs no tone-specific CSS.
- **Density carries hierarchy**: action rows are three lines with a gold verb
  ("Answer the offer →", "Send materials →"), news rows two, interest rows one.
- **Unread is typographic** — read rows recede in weight and colour. No dots, no
  pills, no tinted rows, no side stripes.
- **Verbs replace "View"** — the affordance names the actual next move.
- 440px wide, mono ledger band labels, hairline rules, square corners flush to
  the topbar, staggered row entrance with a reduced-motion fallback.
- The bell's own dot goes **gold only when something needs an answer**, neutral
  when the unread is just news.

## Two corrections after the first pass

**Too large and crowded.** The first build answered "make the triage legible" by
adding elements rather than by removing them. Cut: the verdict line under the
title (it restated the first band rail), the count beside that rail (same), the
synthesised verb under every action row and the arrow beside it (the band header
and the server's own copy already said it), and the settings link in the footer.
Panel narrowed 440 → 376px, max-height 560 → 468px, type and padding tightened a
step. `summariseSignals` and the per-row verb came out of the model with them.

**Two headers, and disconnected from the bell.** The ink masthead sat directly
above the first band rail — two headers stacked saying the same thing — and it
titled a surface the reader had just named by pressing its control. Removed
entirely; "Mark all read" rides on the first rail. The panel is now one sheet of
paper drawn out of the header.

The disconnection was a real bug, not a perception: `.tl-action-icon` had a rule
for `.is-active` (the Messages nav-link on its own route) but none for
`.is-open`, so the bell sat completely inert above its own open panel. It now
takes the gold open state, and drops its unread dot while open — the dot has
nothing left to say once the panel is showing, and gold-on-gold was mush.

## What shipped

**New**
- `client/src/shared/components/NotificationCenter/talentSignalModel.js` — the
  triage. Classifies each row into a band by what the talent's next move is,
  derives the verb, the compact ledger timestamp and the title split; builds the
  digest (unread first, then recency) and the one-line verdict.
- `.../TalentSignalPanel.jsx` + `.css` — the panel. Ink masthead, paper ledger,
  mono band rails, density-carried hierarchy, all six states.
- `__tests__/talentSignalModel.test.js` (29) and `__tests__/TalentSignalPanel.test.jsx` (9).

**Rewritten**
- `NotificationCenter.jsx` — now only data, mutations and navigation; adds a
  working retry and a route to the Signals settings movement. A failed read-write
  no longer swallows the navigation the talent asked for.
- `useNotificationUnreadCount.js` → `useTalentSignalSummary()`, which also
  reports whether anything unread actually needs an answer.

**Trimmed**
- `notificationHelpers.js` — dropped `TYPE_VISUAL`, `getNotificationVisual`,
  `getAvatarLabel`, `getAvatarTone`, `getContextBadge`, `TYPE_AVATAR_TONE` and
  the lucide imports behind them. Nothing rendered any of it. What the agency
  inbox uses is untouched.
- `NotificationCenter.css` — down to the one live rule (`.nd-panel-host`, the
  agency flyout). The talent bell no longer imports it.
- `TalentLayout.css` — removed three dead `.nc-dropdown` blocks; the flyout
  anchor now stretches to the bar height so the panel hangs flush, and
  re-anchors to the viewport under 700px (the bell is not the right-most control
  on mobile, so a trigger-anchored panel hung off the left edge).

**Untouched by design**
- The agency bell (`NotificationInbox` + `NotificationsDropdown`) — a separate
  design system per `client/src/domains/agency/DESIGN.md`.
- The server. Every distinction the panel draws is already in the row: `type`,
  `metadata.status`, `metadata.purpose`, `occurrenceCount`, `read_at`.
- The rest of the header, apart from the bell's own dot semantics.

**Verified** — 761 client tests pass, lint clean, `client:build` clean, and all
six states screenshotted against the real topbar at 1440px and 390px.
