# Judging copy

> **Shared layer.** An identical copy lives at `pholio-site/.claude/skills/pholio-site-language/references/judgment.md`.
> Edit both together; divergence between the copies is a defect.
The skill's second job: critique existing language, and recognize when the
problem is not the wording. Most bad copy is a symptom. Fixing the sentence
when the disease is the proposition produces polished wrongness, which is
worse than the original because it survives review.

---

## 1. The escalation ladder

Diagnose bottom-up; report the deepest level that applies. A finding at a
deeper level makes the shallower fixes moot.

**Level 1: Wording.** The right thing said poorly: wrong term, slop phrase,
banned construction, wrong spelling variant, grammatical break. Fix in
place.

**Level 2: Register.** The right thing in the wrong voice: seminar warmth
on a rejection surface, marketing adjectives in a consent flow, glossing on
an agency surface, luxury silence where a newcomer needs a spec. Rewrite to
the register map (the register map in this skill's mechanics reference).

**Level 3: Claim.** The sentence asserts something unverifiable, unowned,
or regulated: an outcome promise, a payment-to-reach implication, an
invented number, a trust adjective with no mechanism, "unretouched" without
"declared". The fix is not phrasing; the claim itself must change to a
mechanism Pholio controls, or be cut. If the claim is the surface's whole
point, escalate to Level 4.

**Level 4: Proposition.** The thing being sold or said should not be sold
or said this way. Signals:
- The copy needs hedges to survive the banned-language screen.
- Every honest phrasing of the feature reads worse than silence.
- The sentence is trying to carry a feature (lessons.md §11.1: that is the
  tell that the surface, not the sentence, is undesigned).
- The feature's honest rationale contradicts its mechanic (the quota that
  claims inbox quality while selling its removal).
The deliverable is not copy; it is a statement of the conflict and the
options (change the mechanic, drop the surface, or accept the risk with
sign-off).

**Level 5: Information architecture.** The words are fine; they are in the
wrong place, duplicated under different names, or promised by a link whose
destination cannot keep the promise. Signals:
- One object with several names across a session (book/portfolio/images/
  media).
- A label naming an axis the artifact does not vary on (cities on comp
  cards; lessons.md §21).
- Navigation promising what the destination lacks ("All open calls" linking
  to a page that never queries call windows).
- A surface serving two audiences that cannot share a register; the fix is
  splitting the surface.
- Copy compensating for structure ("as mentioned above", long orientation
  preambles).

**Level 6: Product truth.** The copy describes a product that does not
exist, or the product does something the copy must not describe. Consent
text recorded but never displayed; honest copy shipped above a mechanic
slated to die; labels drifted from shipped code. These are defects to file,
not sentences to polish. Copy never papers over a product-truth gap.

## 2. The severity order for reporting

1. **Compliance** (statutory claim exposure, consent gaps, minor-adjacent
   errors): must fix before anything ships, and often before anything else
   is discussed.
2. **Truth** (invented numbers, unverifiable claims, drifted labels).
3. **Trust register** (scam-adjacent shapes, urgency, flattery, unexplained
   "free").
4. **Fluency** (industry vocabulary errors, stats conventions, glossing
   failures).
5. **Voice and polish** (register mismatches, slop constructions, rhythm).

A critique leads with the highest severity present, states the level on the
ladder, and proposes the fix at that level. Quote the exact string and its
location; never paraphrase what you are critiquing.

## 3. The critique rubric (questions to run)

Surface-level:
- What is this surface's one job, and for whom? Does every string serve it?
- Which register does the map assign, and is the copy in it?
- Run the banned-language quick screen (banned-language.md §7).
- Are terms native, exactly spelled, correctly glossed for this audience?
- Do labels come from shipped code? Does each label name a real axis?
- Is every number real, sourced, and labeled? Every date current?
- Does anything read as written by a model trying to sound thoughtful?
  Boring and correct beats clever and hollow.

Structural:
- Could this surface be described as another surface's copy rearranged?
  (Duplication instead of design; lessons.md §1.)
- Is a sentence carrying what an artifact should show? The artifact beats
  the link; the comp card, the requirement table, the receipt are the
  arguments.
- If the surface repeats sitewide, does it carry only names, destinations,
  and facts?
- Is warmth delivered as information (a spec, a reassurance that is a
  fact) rather than as adjectives?
- What does this surface refuse to say? A Pholio surface with no named
  negative, no stated limit, and no ceded authority is usually
  underwritten in the way that matters, however many words it has.

## 4. Worked examples (real, from the August 2026 audit)

**The /about page (Level 2 through 4).** "The Architecture of Human
Discovery." / "Engineered by Visionaries." / "Moving beyond the noise of
digital surface, we build for depth, signal, and the pursuit of truth."
Diagnosis: pre-reset copy in the corporate-visionary register. Level 1
violations everywhere (em-dashes, title-cased abstractions, "Leveraging",
"convergence"), but the real finding is Level 3/4: "discovery engine" and
"connect emerging talent with premier agencies" are procurement-flavored
claims the rest of the site is engineered to avoid, and the page's
proposition (Pholio as a philosophical project about human identity) is not
the product's proposition (a dossier and toolkit that tells the truth).
The fix is a rewrite from the proposition up, not sentence surgery. Note
"ESTABLISHED 2024" also violates the no-entity-implications rule
(lessons.md §6).

**"Let's get you seen" (onboarding entry) (Level 3).** Zero banned words.
The speech act is still the exposure promise: subject = the talent's future
visibility, cause = Pholio. It also sits at the exact moment (first
contact) where a warned reader is screening hardest. Replacement direction:
name what actually happens next as a mechanism ("Let's build your book",
"Your digitals, done right"), or name the artifact. This example is the
reason the skill tests speech acts, not strings.

**"They're already looking." (hero variant 04) (Level 3, borderline).**
True in aggregate (agencies do review submissions), but as a hero it
implies present demand for the reader specifically, which is the flattery
shape. Compare variant 01's support line "Pholio puts your work in front
of vetted agencies. Free to apply.", which is a mechanism statement.
Judgment: prefer mechanism-true variants; if the owner wants the demand
claim, it needs an evidentiary basis stated on the surface.

**The four-names problem (Level 5).** The Book / portfolio / images /
media, and "editorial" overloaded four ways. No sentence fix exists; the
fix is a naming decision applied everywhere at once (one name per object,
shipped labels as canon), which is an IA change with a migration cost.
Flag it as such rather than "fixing" one instance and increasing the
inconsistency.

**The Studio+ lede correction (the positive model).** The shipped fix
replaced "expanded insight, submission volume, and premium presentation"
(sold something that must not exist) with "Premium comp-card themes and
90-day portfolio analytics. Nothing an agency sees or receives changes
with it." That is a Level 4 fix done right: the mechanic was restructured,
then the copy stated the new truth plainly, and the file documents its own
prior defect so the error cannot silently return.

**The quota rationale (Level 4/6, from the product plan).** A limit
described as inbox-quality protection while a paid tier sells its removal:
the copy cannot be fixed because the mechanic contradicts itself. One
honest rationale per limit: it is either anti-spam (and no tier lifts it)
or commercial (and is never described as quality protection).

## 5. Delivering a critique

- Lead with a one-paragraph verdict: the deepest level found, and whether
  the surface needs wording, a rewrite, or a decision above copy.
- Then findings, most severe first: exact string, location, level, rule or
  evidence violated, and the fix at the right level. For Level 1/2, supply
  the replacement copy. For Level 3+, supply the options and name whose
  decision it is.
- Never soften a compliance finding into a style note.
- Praise specifically what is working and should be preserved; a critique
  that cannot name the good parts will get the good parts rewritten too.
- If the brief itself conflicts with a rule (asked to write urgency, asked
  to promise outcomes), say so before writing, per the ban list's own
  protocol: name the rule, why this case might differ, and what you would
  do instead. "The brief seemed to call for it" is not approval.
