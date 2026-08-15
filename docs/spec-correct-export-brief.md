# Spec-correct export + requirements surface — build brief

Direction set 2026-08-14. Supersedes the codex-built talent requirements UI, which
is to be **rebuilt, not extended**.

Source plan: [`pholio-product-plan-2026-08.md`](./pholio-product-plan-2026-08.md),
Part B (the wedge).

---

## The lead feature: export the spec-correct set

When a talent cannot apply through Pholio, the highest-value thing Pholio can do is
hand them a download that is already correct for that agency, so they upload a
conforming set to the agency's own site on the first try.

This converts "we can't help you here" into "here's your Elite-ready package." It is
more useful than the check itself, it works from day one with two customer agencies
and fifty reference ones, and it is the strongest possible demonstration to a
non-customer agency: their inbound quality visibly improves before they have signed
anything.

### Backend feasibility — verified 2026-08-14

Checked against `src/domains/spec-registry/validation/registry-validator.js`.

| Export property | Supported today | Evidence |
|---|---|---|
| Right shots, per agency | **Yes** | `rules.shots.slots` — named slots with `quantity.minimum` |
| Resized under the file limit | **Yes** | `rules.files` with `constraint.field = "file.size_bytes"`, at both `per_file` and `total_set` scope |
| Correct file type | **Yes** | `file.mime_type` constraints |
| Sensible names (`elite-closeup-profile.jpg`) | **Yes** | slot names are structured and stable |
| Checklist of what is still missing | **Yes** | already computed — `findingDto` outcomes + `countSummary` |
| **Cropped to spec** | **No** | **there are no dimension, aspect-ratio or orientation rules in the schema at all** |

**"Cropped to spec" cannot be built as specified**, and probably should not be.
The registry has no crop target to crop to, and B1 of the plan explains why:

> Almost no agency publishes technical specs; The Society and Models 1 state 5MB file
> limits, while Ford states 3MB.

Agencies publish **size** limits, not dimensions. Inventing a crop would mean Pholio
asserting a requirement the agency never published — the same "speaking for Elite"
failure the provenance guardrail below exists to prevent.

**Resolution:** ship the export without a crop step. Add cropping only for agencies
that actually publish an orientation or aspect requirement, which needs a registry
schema extension (`rules.images.*`) plus re-research. Treat as a separate, later
decision. Sharp is already a dependency, so the resize/encode half is unblocked.

---

## Surface direction

### Full check for everyone

Show the complete requirements check whether or not the agency is a Pholio customer.
The talent's need — *what does this agency want, and am I ready?* — is identical
either way. Withholding it to protect a business boundary is exactly the pattern
Pholio differentiates against.

### Requirement framing, not submission framing

"Prepare this package for Elite" is wrong when nothing is sent. Target shape:

```
Elite Model Management — published requirements
Your current set covers 4 of 6.
Missing: close-up profile, hair pulled back · personality shot
Elite accepts applications on their own site. → Apply at elitemodels.com
Requirements as published by Elite, checked 1 Aug 2026. Pholio is not affiliated with Elite.
```

### One directory, marked per entry — do not split it

Do **not** group the directory into "on Pholio" and "reference". Two labelled groups
create a visible hierarchy that makes the customer list look thin beside the reference
set, and front-load a distinction talent do not care about until the moment they act.
Carry it per entry instead, where it is decision-relevant.

> **Design-system conflict, resolved.** The direction called this a per-agency *badge*.
> Root `CLAUDE.md` bans badge/chip patterns (#4, #5, #7), and the talent guide repeats
> it. The banned-UI list names the correct alternative directly — *"Render type/score as
> plain text inline"*. Build it as inline plain text ("Applies on their site"), never a
> pill, chip, or coloured dot. The information survives; the banned treatment does not.

---

## Guardrails

1. **Never gate any of this behind Studio+** — not the check, not the export, not the
   outbound link.

   > Worth stating why, because A1 lists "print-ready 300dpi exports" as *legitimate*
   > Studio+ and this looks adjacent. It is not the same thing. A spec-correct set
   > exists to get the talent into an agency's hands, which puts it in the submission
   > pipeline that invariant 2 protects, and squarely inside the Krekorian §1701
   > analysis in C1 — paying so that more agencies receive your submission is the
   > statutory tripwire. A 300dpi print export is a talent-owned artifact that touches
   > no agency. Keep that line visible in code review.

2. **Provenance on every entry** — source link plus a checked-on date. This is the
   difference between "we catalogued Elite's published requirements" and "we speak for
   Elite", and it is the protection when a spec changes and someone's set is rejected.

3. **No logos, no implied relationship.** Agency names as plain text is nominative fair
   use; logos and any "partner" framing are not. Ship a one-line removal path for an
   agency that asks.

4. **Instrument outbound clicks and export counts per reference agency.** The payoff is
   a sentence you can put in front of a non-customer agency: *"142 people prepared an
   Elite-spec set on Pholio last quarter and applied on your site."*

---

## State of the code

Already landed on this branch:

- `acceptsPholioSubmissions` + `pholioAgencyId` on every route DTO, derived from the
  `spec_registry_agency_routes` → ACTIVE `agencies` join. **Not** from
  `spec_registry_series.origin`, which records who authored the spec and says nothing
  about whether a submission can be delivered — an agency can be live on Pholio while
  Pholio researched their requirements. `origin` still ships, as provenance only.
- `client/src/domains/talent/lib/specRegistry.js` — the single reader of the wire
  contract, with `partitionRoutes` available if ordering is wanted within one list.

Still to build:

- [ ] The export itself — service, route, and the Sharp resize/encode/name/zip pipeline.
- [ ] Outbound-click and export-count instrumentation.
- [ ] The rebuilt talent requirements surface, on the framing above.
- [ ] Removal path for an agency that asks to be delisted.
