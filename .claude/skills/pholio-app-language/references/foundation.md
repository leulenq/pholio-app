# The Pholio language foundation

> **Shared layer.** An identical copy lives at
> `pholio-site/.claude/skills/pholio-site-language/references/foundation.md`.
> Edit both together; divergence between the copies is a defect.

One brand, two language environments. The marketing site persuades; the
product operates. This file is what both skills hold in common: the voice,
the precedence order, the shared principles, and the contract that says
exactly what is identical across surfaces and what deliberately differs.

The load-bearing finding from the cross-brand research (Mailchimp,
Atlassian, Monzo, Intercom, GOV.UK, Stripe, Apple, Shopify): **voice is
constant, tone varies by situation**, and for a trust-critical platform the
product register is the brand's load-bearing wall; marketing is the facade
that must never promise a room the building does not have.

---

## 1. The voice: the honest insider

Pholio speaks as the one voice in a scam-saturated industry that is fluent
in the industry's own language, tells the truth about how it works
(including the silence and the odds), talks people out of wasting money,
and promises only what it mechanically controls. Warmth is delivered as
information, never as adjectives or encouragement.

## 2. Precedence (both skills)

1. **Law and compliance constraints** (banned-language.md §1;
   product-facts.md §3). Never traded for convention, research, or a good
   line.
2. **Product truth.** Copy states only what shipped code does, with shipped
   labels. Never market or describe a mechanic slated for removal.
3. **Owner decisions**: `pholio-site/lessons.md` (which outranks every
   other doc), the codified rule blocks in `lib/hero-variants.ts` and
   `components/intelligence/motion.ts`, and pholio-app's `PRODUCT.md` /
   `DESIGN.md`. In pholio-app, domain truth (industry facts, lifecycles,
   glossary disputes) defers to the first-party `industry` skill.
4. **These skills.**
5. **Generic third-party skills** (copywriting, marketing-psychology,
   positioning, ux-writing, design-taste). Useful as craft checklists;
   where they conflict with this system, this system wins. Their advice is
   tuned for briefs that are not selling into a scam-burned audience under
   talent-service statutes.

Existing Pholio copy is inventory, never voice canon: judge it by this
system; do not derive the system from it.

## 3. The shared principles (the spine)

1. **Promise process and property, never outcomes.** Pholio controls
   materials, formats, delivery, records, honesty. It does not control
   replies, meetings, signings, fame, and may not legally imply otherwise.
2. **Trust is mechanical.** The checkable fact, never the trust adjective.
   Every trust claim is a costly signal or a verifiable mechanism, or it
   is cut.
3. **Deflation is the warmth.** Talk readers out of spending; hand them
   the relieving fact; confess real limits. Generosity of information is
   what kindness sounds like here.
4. **Name the negative.** What Pholio does not do, does not know, and will
   never do is its strongest language, on both surfaces.
5. **Fluency is the premium.** Exact industry vocabulary, exact stats
   conventions, shipped product labels. Gloss for newcomers once, in the
   industry's own metaphors; never gloss at professionals.
6. **Fit, not verdict; and name the silence.** Rejection and status
   language reframes structurally, never reads into silence, never
   cheerleads. Stating the industry's real numbers is the authority move.
7. **The reader is serious.** No flattery, no dream vocabulary, no
   urgency, no condescension, no exclamation marks, anywhere.
8. **Second person owns; Pholio acts.** "Your book, your terms" is the
   possessive warmth. Pholio is a named active subject at every moment of
   truth, with studio verbs (composes, reads, checks, prepares, records),
   never leverage-verbs, never "AI-powered".
9. **Words are chosen once.** One glossary across marketing, UI, emails,
   errors, pricing. A thing named X anywhere is X everywhere. Labels name
   the axis that actually varies, read out of shipped code.
10. **Clarity beats personality, everywhere.** Any sentence where the
    flourish costs comprehension loses the flourish, on the landing page
    too. Restraint is a style; vagueness is a bug.

## 4. The convergence/divergence contract

**Shared across both surfaces (enforced identically):**

| # | Contract |
|---|---|
| S1 | One glossary: every feature, plan, price, role, status has one canonical name and casing, verbatim on marketing pages, in UI, emails, errors. No marketing synonyms for product nouns. |
| S2 | One ban list (`banned-language.md`): statutes, scam lexicon, slop verbs, empty intensifiers. Applies everywhere. |
| S3 | Clarity beats personality (principle 10). |
| S4 | One honesty standard: nothing promised in marketing that the product cannot cash within one session of looking; no disguised commercial messages; problems stated plainly, one sincere apology, then the fix. |
| S5 | One cadence: short sentences, zero exclamation marks, no rhetorical-question headlines, controlled fragments, no em-dashes. The rhythm is what makes two registers read as one author. |
| S6 | Values as behavior, defined once (see §5): both skills implement the same value differently but never contradict it. |
| S7 | One plain-language floor and one jargon policy: industry terms allowed on both surfaces, glossed the same way, never left unexplained for a newcomer audience. |

**Diverges by surface (each skill owns its side):**

| # | Marketing site (pholio-site-language) | Product (pholio-app-language) |
|---|---|---|
| D1 | Answers *why this platform*: outcomes and differentiation, never feature lists | Answers *what happened / what now*: never why-us argument inside a workflow |
| D2 | Declarative, may be aspirational; brand may speak as a subject | Imperative or neutral-descriptive; the brand appears only when it caused the problem |
| D3 | Epigrammatic fragments permitted on display surfaces | Complete instructions, exact labels, front-loaded keywords |
| D4 | Moderate warmth permitted | Matter-of-fact default; delight only at the user's real achievements, never at Pholio's features; zero personality in errors, money, minors, consent |
| D5 | Metaphor and adjectives earned by specificity, rationed | Adjective budget effectively zero; nouns and verbs do the work |
| D6 | One idea per section, few claims, chosen for memorability | Complete operational information: every state, limit, consequence stated; omission is a trap, not elegance |
| D7 | Persuasion and Studio+ selling live here and on labeled plan pages only | In-workflow limits stated as fact plus path, in product voice, no urgency, no interstitials, no unlabeled promotion |
| D8 | Sets the expectation, and may promise only what the product register can deliver | Quietly exceeds the expectation; audits marketing's aspiration ceiling from the product side |

The evidence behind this table: Intercom's cross-surface glossaries;
Mailchimp ("always more important to be clear than entertaining");
Atlassian's two-document voice system and tone dials; Monzo's channel
matrix (wit confined to marketing; "no room at all" for unexplained
jargon); Shopify Polaris error rules ("keep Shopify out of the
conversation"; never humor in a failure state); Apple HIG vs apple.com;
NN/g: objective copy raised usability 27%, and a playful tone measurably
reduced trustworthiness (trust explained 52% of desirability); the
Windows/Dropbox/LinkedIn in-product-upsell backlashes; Kantar's
brand-experience-gap research (marketing promises are debt the product
must service).

## 5. Values as behavior (S6 table)

| Value | On the marketing site | In the product |
|---|---|---|
| Honesty about odds and silence | Two-sided pages; the real numbers; no success arcs | Auto-close states; "too early to read"; fit-not-verdict decision copy |
| The talent owns their work | "Your book, your terms" positioning; export stated as fact | Export always available; withdrawal honest about its limits |
| Free and fair | "Free" always explained within reach | Limits stated as fact plus path; nothing an agency sees changes with payment |
| Respect for the reader's seriousness | No flattery, no dream vocabulary, standards not exclusivity | No gamification theater; no fake cheer; coach at the field |
| Industry fluency | Native diction, artifact-first pages | Shipped labels, correct stats conventions, agency-grade outputs |
| Safety without theater | Process language for parents; scam education; the law cited | Guardian flows, redaction, consent copy in the plainest register |
