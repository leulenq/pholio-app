# Command: audit

**Goal:** Review a specific Pholio surface or flow and judge whether it would feel real to working agencies and talent. Output graded, cited findings — wrong terminology, missing states, missing workflow steps, unrealistic assumptions, privacy/compliance gaps, trust breaks — each paired with the credible fix.

This is the workhorse command. Be the booker who just opened the screen and is deciding whether to trust the company behind it.

## Flow

1. **Scope it.** Identify the exact surface/flow and which audience it faces (talent = creation/pride; agency = operations/judgement). If the target is vague, pick the surface from the user's current work / git status and confirm in one line.
2. **Read the real thing.** Open the actual code, copy, schema, and states — components in `client/src/domains/`, routes in `src/domains/`, columns in `migrations/`, generated artifacts (e.g. comp-card EJS/PDF). Collect the actual **strings, field names, state values, and required inputs**. Never audit an imagined version.
3. **Run the seven lenses** (below) against `standards.md`, `glossary.md`, and `lifecycle.md`. For each hit, record: *industry reality → what Pholio does (cite file/string) → credible fix*.
4. **Grade & sort.** Severity `P0`/`P1`/`P2` (see SKILL.md). Lead with P0s. Don't pad with P2s.
5. **Deliver** in the report format below. End with the 1–3 changes that most raise credibility for the least work.

## The seven audit lenses

1. **Terminology** — every label, state name, field, model name, button, empty-state, and error against `glossary.md`. Wrong word on a primary surface = P0. ("Selfies" for digitals, "business card" for comp card, "category" for board, "application/cover letter" for a submission, "interview" for a go-see.)
2. **States & lifecycle** — map the flow onto the right machine in `lifecycle.md`. What states are missing or mislabeled? (No options/holds/bookout? Only active/inactive? No "kept on file"? "Pending" where "1st option" belongs? Rejection terminal instead of "on file"?) Check *who* owns each transition.
3. **Data model realism** — measurements structured, dual-unit (cm + in), dated, division/gender-aware — not a freeform blob, not single-unit, not hardcoded fashion-only validation. Division as a first-class attribute. Are the *required* fields the ones an agency actually needs?
4. **Workflow completeness** — are real steps present, in order? (Submission = digitals + stats, not résumé. Booking = option → confirm → fitting → voucher. Earnings = rate + usage + commission + net + date.) Name the missing step a real user would hit.
5. **Assumptions** — single model type / single body / single path? One talent ↔ one agency with no mother-agency, placement, or split? Instant pay? One market/one unit system? Each unrealistic assumption is a finding.
6. **Trust & credibility** — does it coach the user wrong (glamour shots as digitals)? Fake money (instant payout, no commission/usage)? Expose what shouldn't be exposed? Anything that makes a pro think "amateurs built this."
7. **Privacy & compliance** — measurements/photos as sensitive data; consent and visibility controls; **minors path branches** (guardian consent before collection, restricted stats/images, permits/Coogan). Any minor handled as an adult = P0.

## Report format

```
INDUSTRY AUDIT — <surface>  ·  audience: <talent | agency>
Verdict: <one line — would a real <booker/model> trust this? what's the headline gap?>

P0 — trust / compliance breaks
  • <Industry reality>. Pholio: <what it does> (`file:line` / "exact string").
    Fix: <credible change, in real terms>.

P1 — real workflow / state gaps
  • …

P2 — realism / polish
  • …

Highest-leverage fixes: 1) … 2) … 3) …   (most credibility per unit of work)
```

## Rules
- Every finding cites both **the industry reason** and **the Pholio artifact** (file/string). No floating opinions.
- Use correct trade vocabulary in your own findings.
- Don't redesign visuals — that's `impeccable`. Flag industry-fit only.
- Flag relevant out-of-scope P0s you spot in passing, but keep the audit centered on the requested surface.
- State confidence when a norm is regional/tier/division-specific rather than universal.
