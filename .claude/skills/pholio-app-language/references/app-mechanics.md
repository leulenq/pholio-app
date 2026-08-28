# App mechanics

App-only reference. The operating discipline for product language: what to
write on each surface pattern, and the boundary that keeps marketing out of
the workflow. Evidence lives in `ux-writing.md`; the shared spine in
`foundation.md`.

The product register in one sentence: **calm, exact, complete, and
invisible; the copy passes unremembered while it helps someone to the
thing they want, and it never does persuasive work inside a workflow.**

Shipped patterns that already embody the register and are preserved as
models (posture, not sacred strings): "That's not a no." (kept-on-file),
"too early to read" (small samples), "Declared unretouched" (never
"unretouched"), "A real agency will wait." (near contracts), "the copy
says 'opens', not 'blocked'" (tracker windows).

---

## 1. Labels and naming

- One canonical name per feature, status, plan, role, everywhere, forever
  (contract S1). Known defects to converge, not imitate: the
  book/portfolio/images/media four-name problem; "editorial" overloaded.
- Labels use the reader's vocabulary and the industry's, never coined
  terms: "comp card", "digitals", "measurements", the shipped status
  labels. Gloss once for newcomers at the field; never gloss on agency
  surfaces.
- Front-load the differentiating word: the first ~11 characters of any
  label, notification title, or subject carry the meaning. "Application
  sent", not "You've successfully sent your application".
- Buttons are verbs naming the action, plus the object where consequences
  exist: "Send application", "Delete photo", "Withdraw application".
  Banned on anything consequential: "Get started", "Continue", "Learn
  more", "OK", "Yes"/"No".
- Sentences under 20 words in UI; numerals, not spelled numbers; sentence
  case. Plain language is the professional register: it reads as *more*
  expert to agencies, not less.

## 2. Instructions and teaching

- Instruct positively and completely: state what to do, with the fix
  inside the instruction. "Use photos from the last 12 months", not
  "Don't upload old photos."
- Teach at the point of need; never tour. No forced walkthroughs, no
  modal onboarding, no completion-percentage nagging. Empty states and
  inline field copy carry the teaching load. A control that needs a
  tooltip to be understood is a design bug to file.
- Coach at the moment of anxiety with the industry's facts: what to wear,
  how to measure, "agencies prefer unedited phone photos". Information is
  the warmth; encouragement is not.

## 3. Errors

- Every error answers what happened, why (when known), what to do next,
  in one or two short sentences, adjacent to the source, input preserved.
  Never "Something went wrong" alone, never "An error occurred", never
  "Invalid".
- Blame the system, never the user. No "sorry" and no "please" in
  validation errors; just the specific fix ("Enter a height in cm").
- Apology splits by fault, once: Pholio failed = "We're sorry", plus what
  is preserved and what to do. User-input problem = no apology. Pholio is
  a subject only when it caused the problem.
- **The safety exception:** moderation actions, suspected fraud, and
  minor-safety interventions get a deliberately generic surface with a
  route to support; specificity that could tip off a bad actor or accuse
  a legitimate user does not ship. Everywhere else, specificity is the
  kindness.
- Gates are not errors: "locked", "required", "complete profile", never
  error language (existing house rule, kept).

## 4. Empty states

Four kinds, four scripts; never one generic "Nothing here yet", and never
emptiness shown while loading:

- First-use: what this space becomes plus the one verb that fills it.
  "Agencies you apply to will appear here. Browse open calls."
- User-cleared: confirm; do not re-teach.
- No-results: echo the query; offer to broaden or clear.
- Error/permission: the way out.

Below a stated sample floor, the honest state is named: "too early to
read", never a padded chart.

## 5. Confirmations, undo, destructive actions

- Confirm rarely. When confirming: name the object, put the consequence
  in the button. "Delete this photo? It appears on 2 comp cards." with
  "Delete photo" / "Keep photo".
- Type-the-name friction is reserved for the truly irreversible (delete
  account, delete book).
- Prefer undo, and match the copy to the mechanism exactly: "Withdraw
  application. Recipients that already downloaded it keep their copy."
  Never claim a reversal the system cannot perform.
- **The friction test, both directions:** friction is honest only when it
  protects the talent from irreversible loss, and its copy states its
  reason. Any friction on exits (delete, withdraw, export, decline
  consent) is obstruction and is banned: export and deletion are as easy
  as upload and signup.

## 6. Consent (talent, and especially guardians)

- Refusal costs exactly what acceptance costs: same screen, same weight,
  one click each, nothing preselected, purpose by purpose, neutral
  decline labels ("No" / "Not now"), never confirmshame.
- Before the choice, the copy states exactly who will see what (the
  shipped event-consent copy is the model).
- The withdrawal path is stated at the moment of grant and is as easy as
  the grant.
- Register: GOV.UK-flat. Zero personality in consent, money, minors,
  errors (contract D4).

## 7. Status, progress, and honest uncertainty

- No consequential state changes silently: anything that changes what a
  Recipient sees, what a guardian has approved, or what a card contains
  produces visible acknowledgment.
- Progress by duration: any indicator over 1s; skeleton to 10s; over 10s
  (card rendering, exports) determinate progress with what-is-happening
  text ("Composing card 2 of 4"). Rough estimates only.
- Name what the system does not know; never dress silence as signal:
  opened is not read; kept-on-file is not shortlisted; no reply is not
  rejection. Auto-close copy states what actually happened and what the
  convention means.
- **Suggestion grammar for inference, assertion grammar for fact.**
  Model-derived reads (shot type, exposure, placement) are "Suggested",
  "Reads as", "Proposed read", with one-tap dismissal and correction.
  Declared facts stay declared ("Declared unretouched"). Capability and
  limits stated at first use.
- Confidence only when it changes what the reader should do, and as
  buckets mapped to actions, never percentages. Do not attach persuasive
  rationales to uncertain output; a hedge is safer than an explanation.
- **The adverse-action rule:** any adverse or triage-shaping outcome
  states the actual principal reasons, in plain language, citing only
  factors the talent can change, with a path to a person. "Did not meet
  our criteria" is a banned genre. On agency-side surfaces, Pholio's copy
  supplies observable signals, never verdict words: the decision is the
  agency's, and the language never launders it into Pholio's voice.

## 8. Notifications and email

- Interrupt only for what the talent would thank you for. Real-time only
  when a human acted on them specifically (an agency opened, replied,
  requested); digest the rest; silence is a feature. No "we miss you",
  no engagement pings.
- Every channel one-click revocable; defaults you would publicly defend.
- Transactional email carries zero marketing: a receipt, a status change,
  a guardian request is never an upsell surface.
- Subject lines are the fact, front-loaded ("[Agency] kept your book on
  file"). Body: one rule sentence (what this actually means), then what
  to do. The shipped submission-decision emails are the model register.

## 9. Decision support

- A default is read as a recommendation, so only default what Pholio
  would openly recommend.
- Every "Recommended" states its criterion ("Recommended for editorial
  applications"); a bare badge is steering; a badge placed for business
  reasons is banned. "Most popular" only if literally, currently true.
- Comparison surfaces (plan pickers, edition pickers) use identical
  vocabulary across columns; no decoy options; no row worded so only one
  column reads well.
- The two-part honesty gate for any persuasive-shaped string in the app:
  (a) publicity test: would we screenshot this flow in the changelog and
  explain the intent; (b) mechanism test: does it add true information
  or reduce effort toward the *user's* goal, or does it exploit bias,
  hide information, or manufacture emotion? Failing either kills the
  copy. User silence proves nothing: mild manipulation doubles
  acceptance without complaints.

## 10. The marketing-leak boundary

Marketing language has leaked into product UI when a string inside a
workflow does persuasive work (answers "why this platform", praises
Pholio, or promotes a purchase) instead of operational work (what
happened, what now, what it costs, what to do).

Four mechanical tests; failing any one means the string is cut or moved
to a labeled marketing surface:

1. **The deletion test.** Remove the phrase. If no operational
   information was lost (a state, a limit, a consequence, an
   instruction), it was marketing. "Your stunning new comp card is
   ready" loses nothing operational when cut to "Comp card ready."
2. **The subject test.** Pholio as the grammatical subject of a benefit
   or transformation verb inside a workflow ("Pholio helps you stand
   out") fails. Product copy lets the user or the object be the subject;
   Pholio appears only as the agent of a concrete action or the cause of
   a problem.
3. **The ad test.** Would the sentence sit unchanged in an
   advertisement? Intensifiers ("powerful", "seamless", "beautiful"),
   superlatives, and outcome implications always fail; names, counts,
   states, and limits always pass.
4. **The trigger test.** A commercial message riding a functional
   trigger fails: an upsell in an error, a plan pitch in a confirmation,
   marketing in a transactional email, a limit stated with urgency.
   In-workflow limits are fact plus path ("This plan includes 3 cards.
   Studio+ includes 10."), with selling confined to the labeled plan
   surfaces.

The converse guard: **celebration is earned by the user, never by the
product.** Delight may mark the talent's real achievements (first card
composed, application sent) and never marks Pholio's features; and it
never appears in errors, money, minors, or consent.

## 11. App register map

| Surface | Register | Notes |
|---|---|---|
| Talent dashboards and flows | Calm operational, possessive second person | "Your book"; warmth as information; shipped labels |
| Onboarding | Same register, one question at a time | The exposure-promise speech act is banned however warm ("Let's get you seen" is the standing counterexample) |
| Moments of truth (statuses, rejection, billing, deletion, withdrawal) | Plainest honest | Fit-not-verdict; active voice, named actor; real limits confessed; zero personality |
| Consent and guardian surfaces | GOV.UK-flat process language | Who sees what, equal-cost refusal, stated withdrawal path |
| Errors and gates | Three-question errors; gates never use error language | The safety exception where specificity endangers |
| Agency-side surfaces | Dense, institutional, unglossed | Signals, never verdicts; no promises to talent in the agency's name; exit ramp stated as fact |
| Transactional email | The honest insider | Fact subject, rule sentence, next step; zero marketing |
| Plan and billing surfaces | Plain commercial, craft-and-property only | "Nothing an agency sees or receives changes with it" is the model; ROSCA-clean |
