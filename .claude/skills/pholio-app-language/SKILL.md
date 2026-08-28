---
name: pholio-app-language
description: The language system for the Pholio product (pholio-app, app.pholio.studio). Use whenever writing, reviewing, naming, or judging ANY user-facing language in the product - UI labels, buttons, flows, errors, empty states, confirmations, consent and guardian copy, statuses, notifications, transactional email, agency-side surfaces, plan/billing copy. Product language helps people understand what is happening, decide, complete actions, and trust what the product says; marketing language must not leak into functional UI. Marketing-site copy belongs to pholio-site-language in the pholio-site repo.
---

# Pholio app language

The product surface's job: help people understand what is happening, make
decisions, complete actions, and trust what the product tells them. The
register is **calm, exact, complete, invisible**: copy that passes
unremembered while it helps someone to the thing they want. The product
register is the brand's load-bearing wall; whatever the marketing site
promises, this surface is where it gets cashed.

This skill and `pholio-site-language` (in pholio-site) are two registers
of one brand. `references/foundation.md` §4 is the contract for what is
identical across both and what deliberately differs. This skill owns the
*what happened / what now* surfaces. Persuasion belongs to the site and
the labeled plan pages; nowhere else in the app.

**Domain truth defers to the `industry` skill** (this repo's first-party
Booker): industry facts, lifecycles, state machines, and glossary disputes
are its jurisdiction. This skill governs how the product *speaks*; on what
is *true about the industry*, the Booker wins.

**Load before writing:**

| Task | Read |
|---|---|
| Anything at all | `references/foundation.md` (voice, precedence, contract), `references/banned-language.md` (the screen) |
| Surface patterns: labels, errors, empty states, consent, status, notifications, decision support, the leak boundary | `references/app-mechanics.md` |
| The evidence behind the discipline | `references/ux-writing.md` |
| Industry terms, glossing, stats conventions | `references/lexicon.md` (domain disputes: the `industry` skill) |
| Product names, features, compliance facts | `references/product-facts.md` |
| Understanding the reader | `references/audience.md` |
| Critiquing existing copy | `references/judgment.md` |

## The product principles (on top of the shared spine)

The shared principles live in foundation.md §3. The product adds:

1. **Operational, never persuasive, inside a workflow.** Every string
   does operational work: a state, a limit, a consequence, an
   instruction. The four leak tests (deletion, subject, ad, trigger) are
   mechanical; failing any one cuts the string (app-mechanics.md §10).
2. **Complete information beats elegant omission.** Every state, limit,
   and consequence stated; in product UI, omission is a trap, not
   restraint (contract D6).
3. **Nothing consequential changes silently**, and nothing claims more
   than the mechanism performs: undo copy matches what undo does;
   withdrawal copy names what it cannot recall.
4. **Blame the system, never the user; apologize once, only when Pholio
   failed.** Validation gets the specific fix, no "sorry", no "please".
5. **Suggestion grammar for inference, assertion grammar for fact.**
   Model reads are "Suggested / Reads as" with one-tap correction;
   declared facts stay declared; confidence as buckets, never
   percentages; no persuasive rationales on uncertain output.
6. **Adverse outcomes get real reasons.** Principal reasons, plainly,
   citing only factors the talent can change, with a path to a person.
   "Did not meet our criteria" is a banned genre. Agency decisions are
   never laundered into Pholio's voice.
7. **The safety exception:** where specificity would endanger
   (moderation, suspected fraud, minor safety), deliberately generic
   plus a route to support. Everywhere else, specificity is the
   kindness.
8. **Teach at the point of need; never tour.** Empty states and field
   copy carry the teaching; four empty-state scripts, never one generic.
9. **Interrupt only for what the talent would thank you for.**
   Transactional surfaces carry zero marketing; silence is a feature.
10. **Friction is honest only when it protects the user from
    irreversible loss, and says why.** Exits (delete, withdraw, export,
    decline) are as easy as entrances, always.

## Writing procedure

1. **Frame:** surface pattern (label, error, empty state, confirmation,
   consent, status, notification, email), audience side (talent, agency,
   guardian), and the reader's likely emotional state. Assign the
   register from app-mechanics.md §11.
2. **Gather facts:** the shipped label, the actual state machine, the
   real limit and consequence, from code or product-facts.md. Domain
   questions go to the `industry` skill. A missing fact is a stop.
3. **Check the mechanism:** does the copy claim exactly what the code
   does, no more? Undo, withdrawal, retention, visibility: verbatim
   honest.
4. **Draft** with the pattern from app-mechanics.md (three-question
   errors, four empty states, consequence-in-the-button confirmations,
   equal-cost consent, fact-plus-path limits).
5. **Screen:** banned-language.md §7, the four leak tests, then the
   pre-flight below.
6. **Read it in the moment:** aloud, as the person mid-task would meet
   it, once, cold.

## Judging procedure

Use `references/judgment.md`: the six-level ladder (wording, register,
claim, proposition, IA, product truth), deepest level reported, severity
order compliance > truth > trust > fluency > polish, exact strings
quoted. Naming inconsistencies (the four-name book problem) are Level 5
findings: flag the system-wide fix, never patch one instance. Copy
describing what code does not do is Level 6: file the defect, never paper
over it.

## Pre-flight (mechanical)

- [ ] Every string passes the four leak tests (deletion, subject, ad,
      trigger); no persuasion inside a workflow.
- [ ] No outcome promise or implication; no payment-to-reach implication;
      limits stated as fact plus path.
- [ ] Labels canonical and shipped; first ~11 characters carry the
      meaning; buttons are verb plus object on anything consequential.
- [ ] Errors answer what/why/next, adjacent, input preserved; no blame
      words; apology only when Pholio failed, once.
- [ ] Empty states use the right script of four; nothing empty while
      loading; small samples say "too early to read".
- [ ] Consent: equal-cost refusal, nothing preselected, who-sees-what
      stated first, withdrawal path named.
- [ ] Inference wears suggestion grammar with a correction path;
      declared facts say "declared"; no percentages.
- [ ] Adverse outcomes give changeable reasons and a human path; the
      safety exception applied where specificity endangers.
- [ ] Undo/withdrawal copy matches the mechanism exactly.
- [ ] No urgency, flattery, celebration of Pholio's own features, or
      personality in errors, money, minors, consent.
- [ ] "Recipients" where contract scope applies; "guardian" not
      "parent"; stats in convention order; zero em-dashes, emoji,
      exclamation marks.
- [ ] Every string read aloud, in the moment it will be met.

## Scope notes

- Talent and agency surfaces are two design systems with one material
  (PRODUCT.md); this skill's register map keeps the split: possessive
  warmth on talent surfaces, institutional density on agency surfaces,
  GOV.UK-flat on consent, money, minors, errors.
- The legal corpus and versioned consent text are contract language:
  never edited for style; changes are compliance events (the shipped
  event-consent copy is parity-tested against a server snapshot).
- Known naming defects (book/portfolio/images/media; "editorial"
  overloaded; two error registers) are convergence work: when touching
  such a string, flag the system-wide decision rather than adding a
  fifth variant.
- When a brief asks for banned language or a manipulation shape, name
  the rule and offer the alternative before writing anything.
