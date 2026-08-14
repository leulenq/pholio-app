# Comp card import — architecture and compliance position

Status: implemented, August 2026.
Plan reference: `docs/pholio-product-plan-2026-08.md` — A3 "Add" (comp card import
with vision extraction), "On uploading an existing comp card", and C3 "Biometric
privacy — the binding design constraint".

This document is the compliance rationale C3 requires to be written down. It is not
background material: it states what the system does and, more importantly, what it
is built to be incapable of doing.

---

## 1. What this feature is, and what it is not

The plan separates two features that look alike. This is the first one only.

| | Built here | Not built here |
|---|---|---|
| **Import source** | Read an existing agency card, propose structured profile fields, talent confirms | — |
| **Attachment** | — | Storing the card as "existing agency card", dated, always secondary |

A comp card must never substitute for the structured profile. So import writes
*into* the structured fields and the uploaded file is never stored at all — it is
read in memory and dropped. There is no storage engine wired into the upload path
(`routes/comp-card-import.js` uses `multer.memoryStorage()` and nothing else), which
means there is no code path that could persist a card by accident.

## 2. The binding constraint: classify the document, never the face

Illinois BIPA (740 ILCS 14) excludes *photographs* from the definition of a
biometric identifier. It does not exclude a **face-geometry template derived from**
a photograph — *Monroy v. Shutterfly* (N.D. Ill. 2017) held exactly that. So the
line that matters is not "do we handle photos" (we do, harmlessly) but "do we
derive a face template from them" (we do not, anywhere).

Damages are $1,000 per negligent violation and $5,000 per reckless one, plus fees,
with parallel regimes in Texas (CUBI, up to $25,000 per violation), Colorado (CPA
biometric amendment) and Washington (MHMDA, which reaches facial imagery and carries
a private right of action through the state Consumer Protection Act).

**The rule, as implemented:**

- Extraction reads **text and layout only**.
- **No face template is generated**, requested, or returned.
- **No embeddings are stored.** Nothing derived from the card's imagery is
  persisted at all.
- **No cross-image identity linking**, including transiently. The card's
  photographs are never compared against the talent's uploaded portfolio — not to
  "check the card is really theirs", not for a moment in memory. That comparison is
  the single highest-risk operation available in this product, and it is not
  implemented.

### Why the primary path touches no pixels whatsoever

A comp card exported from InDesign, Canva or an agency template carries a real text
layer. `src/shared/lib/pdf-text.js` reads it directly: the text of every run, plus
its position and font size. It does not rasterise, does not decode embedded images,
and has no access to pixel data. For this path the photographs on the card are
literally opaque to the system.

This is also why it is the *primary* path rather than a shortcut. It is
deterministic and exactly reproducible, so it can be unit-tested against known
input, and no model is involved in the result.

### The one place a model sees the card

Cards that were flattened to an image on export, and cards uploaded as JPEG/PNG,
have no text to read. `src/domains/ai/comp-card-vision.js` OCRs those through Groq
(the existing AI dependency; `config.groq.visionModel`). Three properties keep this
outside the biometric line:

1. **The task is character recognition.** No face geometry is computed or asked
   for. Transcribing printed text off a document is not the derivation of a
   biometric identifier.
2. **Only text is persisted.** The image lives in memory for one request. Nothing
   derived from it is stored, keyed to a person, or made comparable to anything
   else — which is the *Zellmer v. Meta Platforms* (9th Cir. 2024) point that a
   face signature is not a biometric identifier unless it can actually identify
   the individual. Note that *Zellmer* is persuasive, **not binding on Illinois
   state courts**, which is why the design does not lean on it alone: the stronger
   fact is that no signature of any kind is produced.
3. **EXIF is stripped before the image leaves the process.** `extract.js`
   re-encodes through Sharp, which drops GPS and device identifiers that have
   nothing to do with reading text.

### A second, independent constraint: no inference about the person

Plan invariant A1.5 bars inferring appearance, "type", "potential" or protected
traits from imagery, regardless of biometrics law. A transcription model asked
loosely to "read this card" will happily volunteer a description of the person on
it, so:

- The prompt instructs the model to transcribe printed text and explicitly forbids
  describing, characterising or estimating anything about any person.
- `sanitiseLines()` drops descriptive output anyway, rather than trusting the
  instruction. Prompt compliance is a request; the filter is a property.

Anything dropped there is simply not extracted, which the flow already presents as
"not found" — a state the talent can act on.

## 3. Extraction is a proposal, never a silent write

Reading a card produces a **proposal**, persisted in `comp_card_imports` and shown
to the talent field by field. Nothing reaches `profiles` until they confirm.

Each field lands in one of three states, and the middle one carries the design:

- **found** — a value was read, offered with the line of the card it came from.
- **ambiguous** — something was read but cannot be resolved, almost always a unit
  the card did not print. Offered as an explicit choice. **Never pre-selected and
  never resolved by preference.**
- **not_found** — the card does not carry this field, said plainly so the talent
  knows to type it rather than assuming import handled it.

Confirm validates against the *stored proposal*, not the request body
(`buildProfileUpdate`). A client that posts a column name import does not own, or a
value for an ambiguous field that was not among the options presented, has it
dropped server-side. The "proposal, never a silent write" rule is therefore a
server property, not a UI convention.

### Units, and why ambiguity is preserved

A card prints `34` and expects the reader to know whether that is inches or
centimetres. Guessing wrong writes a number that *looks* right, and an agency
cannot tell a bad import from a real measurement. So `units.js` resolves in a fixed
order: an explicit unit on the value wins; otherwise the plausible human ranges for
that measurement decide, and where those ranges do not overlap the number
identifies its own unit; where they do overlap the value stays **ambiguous**.

Ambiguous values get one more chance before reaching the talent: comp cards are not
printed in mixed systems, so the values that identified themselves determine the
card's system, and that resolves the rest (`detectCardSystem`). Where the evidence
is split or absent, the field stays ambiguous rather than being resolved by a coin
flip.

## 4. An imported card has no capture date

The plan is explicit that an uploaded card "could be three years old". Therefore:

- Import **writes no `captured_at`**, creates **no image records**, and never feeds
  `src/domains/talent/services/digitals-freshness.js`. That module already refuses
  to infer a capture date from upload time, and this feature does not undo it.
- Imported measurements are **declared on import, never measured**.
  `profiles.measurements_source` is set to `comp_card_import` when import writes a
  measurement. Without it, `measurements_updated_at` would tell an agency these
  numbers were taken on the day of the import, which is precisely how an import
  launders a stale number into a profile that reads as current. NULL means
  self-entered, which is what every pre-existing row is.

Panel captions that name shot types ("FULL LENGTH", "PROFILE") are read and shown
as guidance, because import creates no image rows for a shot type to attach to.
They are never written to a record.

## 5. The flow never dead-ends

`extractCardText()` cannot fail. A corrupt file, a card with no text layer, an
unreadable image, a missing API key and a model outage all return an empty result
with a reason attached, which becomes a proposal whose fields are all `not_found` —
that is, a working manual-entry screen. The upload endpoint returns 201 in those
cases, not an error, because nothing has gone wrong from the talent's point of view.

There is **no human review queue anywhere in this path**, and no moderation gate
that can hold the flow. `tasks/lessons.md` (2026-07-29) records why: a skin-ratio
check with a human queue as its only escape hatch blocked onboarding when nobody
was on call, and a false positive became an unbounded block. Exposure rules and
progression rules are separate concerns, and import owns neither.

## 6. No payment gate

Not on the upload, not on the extraction, not on the pre-fill. Import improves what
an agency receives, and A1 invariants 2 and 3 make that identical for every talent
regardless of what they pay — reinforced by the Krekorian §1701 analysis in C1.
There is deliberately no `is_pro` check in `routes/comp-card-import.js`. Compare
`routes/bio.js`, where a Studio+ gate is correct because a refined bio is something
the talent keeps for themselves.

## 7. Where the code lives

| Path | Role |
|---|---|
| `src/shared/lib/pdf-text.js` | PDF text layer + geometry. No rasterising, no pixels |
| `src/domains/ai/comp-card-vision.js` | OCR fallback. Transcription only, output filtered |
| `src/domains/talent/services/comp-card-import/units.js` | Unit resolution; ambiguity as a result |
| `.../comp-card-import/parse-card.js` | Labels, name, agency, shot-type captions |
| `.../comp-card-import/vocabulary.js` | Snapping card wording to the profile's option sets |
| `.../comp-card-import/proposal.js` | Proposal shape; validated apply |
| `.../comp-card-import/extract.js` | Orchestration; every failure returns a usable result |
| `client/.../CompCardImport/CompCardImportOverlay.jsx` | The dialog it opens in |
| `src/domains/talent/routes/comp-card-import.js` | Endpoints. In-memory upload, no gate |
| `migrations/20260814140000_create_comp_card_imports.js` | Proposal + `measurements_source` |

## 8. The profile's vocabulary is a closed set

Most of the fields import writes are **selects**, not free text: hair colour, eye
colour, dress size, and the shoe-region toggle each accept a fixed list of values.
A value outside that list does not render as itself — the control renders *empty*.
So an import that wrote the card's own wording ("dark brown", "hazel", "us") would
look to the talent like it had silently done nothing, which is worse than plainly
not finding the field.

`vocabulary.js` therefore snaps every such value to the profile's own options, and
the review screen shows both: the canonical value in the field, and the card's
original wording on the evidence line beneath it, so the transformation is visible
rather than silent.

Two deliberate refusals:

- **A value with no honest home is not forced into "Other."** "Bald" is not a hair
  colour and "heterochromia" is not one of six eye colours. Those come back as not
  found, with a note quoting the card, because "Other" discards the information
  while looking like a successful import.
- **Dress sizes are never converted between systems.** A card printing `36` is
  almost certainly EU, but EU 36 lands between US 4 and US 6 depending on the
  house. Guessing writes a wrong size that looks right.

Casing follows the same logic. Cards typeset everything in capitals, so an all-caps
value is recased — but people and organisations need different rules. "NG" is the
surname Ng, while "IMG" and "DNA" are initialisms that must keep their capitals, so
the acronym list applies to agency names only and never to a person's. An agency
matched against the registry keeps the registry's own spelling rather than anything
inferred.

**These lists mirror inline JSX in `MeasurementsSection.jsx`.** They are duplicated
because the client options have no server-visible export; the test suite pins the
pairing, but if the options change, change both.

## 9. Known limits

Recorded because a limit that is not written down gets rediscovered as a bug.

- **Flattened PDFs are not OCR'd.** Rasterising a PDF needs a renderer this service
  does not carry. Such a card is reported as `pdf_no_text_layer` with a message
  asking for a JPEG/PNG instead. Adding rasterisation would not change any
  compliance property above; it is a capability gap, not a design choice.
- **Label vocabulary is English-first.** French/German `TAILLE` is deliberately
  excluded: it means waist in a stat block and height elsewhere, and a label that
  can mean two measurements cannot be resolved from the label alone.
- **Shot types come from printed captions only**, which most cards do not print.
  The imagery is never classified to infer them — see §2.
- **Agency matching** is exact-substring against the registry. A card naming an
  agency not on Pholio yields low-confidence free text for the talent to correct,
  never a link to a record.
