# Command: consult

**Goal:** Design-time guidance, *before* code exists. The team is about to build or name something and wants to know how the industry actually does it. Give the real workflow, the real terms, the real edge cases, and a credible Pholio shape — so the feature ships realistic the first time instead of being audited into shape later.

`audit`/`gaps` react to what exists; `consult` shapes what's about to be built. This is where the Booker sits in the design review.

## Flow

1. **Restate the intent** in industry terms. Often the ask itself uses the wrong frame ("let talent apply with a cover letter" → "talent submit digitals + stats to an agency's open call"). Reframing correctly is half the value — do it first.
2. **Pull the real workflow** from `standards.md` and `lifecycle.md`: the actual steps, who acts at each, the correct state names, and what data moves. Cite the relevant section.
3. **Surface the edge cases the team won't think of** — the ones that separate real from toy:
   - Mother-agency / multi-agency / placement / split.
   - Options vs. holds vs. confirmed; bookout collisions.
   - Division differences (this works for fashion but not curve/commercial/kids?).
   - Units, sizing, market/currency localization.
   - Minors → consent/permit/visibility branch.
   - Money: usage vs. rate, commission + split, net + timing, voucher.
   - "Kept on file" / soft outcomes vs. binary accept/reject.
4. **Propose the credible Pholio shape** — states, fields (typed, dual-unit, dated where relevant), terminology, and the happy path + the realistic unhappy paths. Keep it implementable; respect Pholio's stack and the two separate design systems.
5. **Name what to get right vs. what's safe to defer** so the team can scope a believable v1 without faking the core.

## Output format

```
INDUSTRY CONSULT — <feature/question>
Real frame: <restate the ask in correct industry terms>

How the industry does it:
  <the actual workflow, steps, who acts, correct state/term names — cite standards/lifecycle>

Edge cases that make or break credibility:
  • <case → why it matters → how to handle>

Credible Pholio shape:
  States: <named, real>
  Fields/data: <typed, units, dated, division-aware as needed>
  Terminology: <exact strings to use>
  Happy path: …   Realistic unhappy paths: …

Get-right-now vs. safe-to-defer:
  Must be real in v1: …
  Can simplify/defer: …
```

## Rules
- Lead with the **reframe** — correcting the mental model prevents the most rework.
- Give the **real terms to ship** (label-ready), not just concepts.
- Be explicit about **division and market variance**; don't present a fashion-only answer as universal.
- Always check the **minors branch** when the feature collects images/measurements/contact or handles bookings.
- Keep proposals buildable on Pholio's actual architecture (Express/Knex/React Query, `src/domains` + `client/src/domains`, comp-card via Puppeteer/EJS). Hand visual execution to `impeccable`.
- Flag honestly when a norm is contested or you're inferring — don't manufacture a false standard to sound authoritative.
