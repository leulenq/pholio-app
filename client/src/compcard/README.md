# Comp card studio

Pholio's comp card generator. It replaces the legacy engine in
`src/domains/pdf/composition/`; that engine still renders legacy links and
frozen submission packages until those move over.

## Pipeline

```
photos ──► perception ──► subject ──► curation ──► direction ──► scene ──► renderer
          (MediaPipe)    (head, body,  (hero, back   (art-directed  (mm units)  (same React for
                          framing,      set, booker   layout + type)            studio + PDF)
                          joints)       review)
```

| Stage | File | What it decides |
|---|---|---|
| Perception | `perception/analyze.js` | Face landmarks, 33-point pose, hair/person segmentation, tone grid, dHash. Runs in the browser (and in headless Chromium). Cached per image in `image_perceptions`. |
| Subject | `model/subject.js` | True head top (hair mask), silhouette by flood fill from the face, real framing class (labels are not trusted), gaze, eyes, joints. |
| Crop | `model/crop.js` | **The guarantee:** each role has a protected region. A crop either contains it, inside any type-safe window, or reports infeasible. User drags and zooms are clamped to the same rule. Avoids cropping on joints. |
| Curation | `model/curate.js` | Hero = clear, frontal, open-eyed, printable. Back = full length first, then range. Dedupes near-identical frames. Writes the booker's review notes. |
| Content | `model/content.js` | Division-correct stats (women, men, kids), dual units, true primes and fractions, agency versus direct contact, no weight or age, no phone for minors. |
| Directions | `directions/*.js` | Four art directions, each with its own grid, type and photographic logic. |
| Arrangement | `model/partitions.js` + `compose.js` | Back layouts are searched, not fixed. The arrangement the photos fill best wins. Any arrangement that would cut a subject is ineligible. |
| Render | `render/CardPage.jsx` | Millimetre scene to DOM. Text is placed by cap height and baseline (`text-box-trim`). Fitted type is measured in the browser's own layout engine. |
| Print | `print/PrintApp.jsx`, `compcard.html` | Puppeteer prints the saved scene. Two variants: digital (trim size) and print (bleed, crop marks, slug). |

## Directions

The quality bar is the hand-made Ola Szkolda sheet in `pholio-site/public/cards/designs.js`. The six directions are generalised versions of it, drawn in `u` (a hundredth of the card width) with the foot measured from the bottom edge, so the same drawing serves both 5.5×8.5 and A5. Shared proportions, stats, booking lines and the wordmark are in `directions/kit.js`.

- **Cover**: the surname as a Bodoni masthead, the first name in italic. The head rises in front of the letters, but only on clean backdrops, using a cutout confined to the masthead band. Otherwise the crown sits just below the masthead, or the masthead moves to paper beneath the photograph. The back is black stock with a full length beside three frames.
- **Show**: white stock, one beauty image, the name in Archivo capitals spaced at .62em. The back has two tall frames over one wide one.
- **Letters**: the photograph stops at a cut and carries on inside the name (Archivo at 62% width, weight 900, filled with the picture).
- **Digitals**: a natural-light frame mounted like a print on grey stock, with mono type. The back has the digitals set on black, each frame named for its view.
- **Spine**: the commercial card. The name runs up the spine in Noto Serif Display, with a smile chosen first.
- **Foil**: black stock with the name in gold foil.

Each direction chooses its own front (`pickHero` with a taste and a fit test) and its own back set (`backFor` with a taste), so one talent gets six different cards. Frames are placed by face target (`solveCrop` `target`), inside the crop guarantee. A photo that can't fill a frame is never letterboxed: the column re-flows, or another photo is chosen.

## Server

`src/domains/compcard/`: `GET/PUT /api/talent/compcard`, the perception cache, and a same-origin image proxy (the talent's own photos only). It also serves `GET /api/talent/compcard/pdf?variant=` and the public `/compcard/:slug.pdf`, behind the minor consent gate. `/pdf/:slug` serves the studio card when one exists. Saved scenes are re-validated against the current images on every print.

## Verifying

- `cd client && npx vitest run src/compcard` runs the unit tests, including a 6,000-case property test of the crop guarantee.
- `npm test -- tests/compcard` runs the API, scene sanitizer and consent tests.
- `compcard.html?lab=battery` (dev only) runs every adversarial talent fixture through every direction and format with `model/invariants.js`, checking: no cut subject, no type on a subject, print-safe area, no collisions, at least 6pt type, required content present. Lab photos live in `client/compcard-lab/` (git-ignored, never built).
