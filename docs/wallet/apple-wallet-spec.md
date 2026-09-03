# Pholio ID — the Apple Wallet pass

Status: IMPLEMENTED (pass generation, both Wallet faces, signed bundle).
Not yet built: the Apple update web service (M3 below), the dashboard
preview module, share links.

Code: `src/domains/wallet/` — `services/pass-content.js` (what the pass
says), `services/face-locator.js` (where the face is),
`services/pass-artwork.js` (every image), `services/pass-bundle.js`
(manifest, PKCS#7, zip), `services/pass-builder.js` (orchestration),
`routes/talent-wallet.js` (`GET /api/talent/wallet/pass?theme=ink|paper`).
Review sheet: `docs/wallet/previews/*.png`, regenerated with
`node scripts/wallet/render-previews.js`.

---

## 1. What a Pholio ID is

The talent's identity credential in Apple Wallet. Not a comp card (the comp
card is a two-sided document; the pass is a card the size of a credit card
that lives between a boarding pass and a bank card). Its job when shown or
scanned: a booker sees the face and the name, the one number they check
first, who books this person, and scans straight into the live book.

Everything else lives one tap away on the details sheet, in the comp card's
own order and dual units. The pass **points at** the book rather than
trying to be it; that is what keeps it honest (a shared pass cannot go
stale on measurements a booker relies on when it carries only what a QR
scan will refresh).

Why talent would keep it: it is the only pass in their Wallet with their
own photograph on it, it is instantly recognisable as Pholio in the stack,
and it answers "send me your card" with a share sheet.

## 2. Apple's constraints (verified 2026-09-03)

Sources: Human Interface Guidelines "Wallet" (change log: June 8 2026,
"Updated to reflect guidance for iOS 27 and the Pass Designer app"), the
WalletPasses reference ("Creating a generic pass", "Defining the metadata
of your Wallet Pass", `Pass`, `PassFieldContent`), WWDC26 session 209
"What's new in Wallet".

| Constraint | Consequence for Pholio ID |
|---|---|
| Two generic layouts now exist. `posterGeneric` (iOS 27+) is a full-bleed 358×448pt artwork with a 30pt primary logo, header fields, primary fields (the first, unlabeled, renders as a large title), **one** footer field and a square QR. `generic` (iOS 26 and earlier) is a flat colour field with a 50–160×50pt logo, a square 60–90×90pt thumbnail, up to 3 header fields, 1 primary, and secondary+auxiliary fields (4 combined next to a square barcode), plus the QR. | One bundle carries both dictionaries. Every device gets the photographic face it can render. |
| Text never wraps; a value Wallet cannot fit drops the whole field. | Every front value is short and deterministic: name ≤ 20 chars with graceful fallbacks, agency line ≤ 30 chars on the face (full on the back), dual-unit stats only on the wide rows. |
| Three colours only: `backgroundColor`, `foregroundColor`, `labelColor`; `footerBackgroundColor` colours the poster's bottom strip. Wallet may adjust colours it judges illegible. | Two themes (§4) measured to WCAG AA on labels so Wallet never needs to intervene. |
| Images ship at @2x and @3x; icon 38pt; thumbnails are square with rounded corners baked into a transparent PNG; keep files small. | `pass-artwork.js` renders exactly those files; the flat-field artwork compresses to ≈200 KB at 3x, so a bundle is under 600 KB. |
| Labels on the front are uppercase small text; the poster title has no label. | The name carries no label anywhere (also the house rule: no eyebrow above a heading). |
| Wallet renders the QR itself on a light plate and shows `altText` under it. | QR payload = the short portfolio URL the comp card already uses (`/p/:slug`); altText = the typeable host path. |
| Wallet does not follow system dark mode; the pass's colours are the pass's. | Light/dark is a theme the pass is issued in, not something the device flips. |
| The back must carry the issuer's contact. | Support email and app host, with data detectors so they are tappable. |
| `sharingProhibited` defaults to false. | Kept false: the pass exists to be handed to casters. |

Library note: `passkit-generator` validates `pass.json` with
`stripUnknown: true` and has no `posterGeneric` schema, so it silently
deletes the iOS 27 face. The bundle is therefore built in-repo
(`pass-bundle.js`: SHA-1 manifest, detached PKCS#7 via node-forge with the
WWDR intermediate embedded, stored zip via do-not-zip). The signing recipe
is byte-for-byte the one that library has shipped for years; only the
schema gate is gone.

## 3. The composition: a designed object

The reference for Pholio ID is a medallion card, not a photograph with type
on it. Three horizontal zones give the pass a graphic identity before a
single word is read, and every element has a zone of its own:

```
┌──────────────────────────────┐
│ PHOLIO             HEIGHT    │  field (ink)   — identity: wordmark, header
│                 178 cm / 5'10"│
│            ╭────────╮        │
│────────────│ portrait│───────│  ← the medallion straddles the boundary
│            ╰────────╯        │  band (paper)  — the person, and quiet space
│                              │
│──────────────────────────────│
│ Ava Martinez                 │  field (ink)   — the name (Wallet's title)
│ ─────────────────────────────│
│ REPRESENTATION        ▣ QR   │  footer strip  — who books them, the code
│ Northstar Models             │
└──────────────────────────────┘
```

Geometry (fractions of the 448pt artwork height): upper field 0 to 0.28,
band 0.28 to 0.51, lower field 0.51 to 1. Disc diameter 40% of width,
centred on the 0.28 boundary, with a 1.5pt gold ring so it reads as an
object on both materials whatever the photograph's own background does.

Why the zones fall where they do: on the poster face Wallet places the
header top-right, the title just above the bottom strip, and the footer
plus QR on the strip, all in one foreground colour. Those three text
positions must share a tone, so the two fields carry the text and the band
carries the person. Photography and typography never overlap; there are no
veils, no gradients, nothing competing with the face.

### iOS 27 and later — `posterGeneric`

Artwork as above; `primaryLogo` is the gold wordmark; header HEIGHT; title
is the name; the single footer field is the representation line; Wallet
draws the QR on the strip, which is coloured with `footerBackgroundColor`
to match the lower field.

### iOS 26 and earlier — `generic`

```
┌──────────────────────────────┐
│ PHOLIO             HEIGHT    │  ← logo, header
│                 178 cm / 5'10"│
│ Ava Martinez         (disc)  │  ← primary (no label) + the medallion as thumbnail
│ REPRESENTATION               │  ← secondary (wide row)
│ Northstar Models             │
│ BUST      WAIST      HIPS    │  ← auxiliary: three core stats, dual units
│ 81 cm/32" 61 cm/24"  89 cm/35"│
│          ▣ QR                │
│   app.pholio.studio/p/ava…   │
└──────────────────────────────┘
```

The thumbnail is the same disc (transparent outside the circle, ring baked
in) on the flat field, so the two faces are one object at two ages of iOS.

Collapsed in the stack Wallet shows only the logo and header: **PHOLIO ·
HEIGHT 178 cm / 5'10"**. Height is the one number every booker checks
first and the one fact that identifies a talent card among bank cards.

### Details sheet (back fields, both faces)

PORTFOLIO (tappable link) · the full comp-card stats block in the comp
card's order and dual units (HEIGHT, BUST/CHEST, WAIST, HIPS/INSEAM,
DRESS/SUIT, SHOES, HAIR, EYES) · MOTHER AGENCY / PLACEMENT rows with market
and exclusivity · MEASUREMENTS UPDATED (Wallet-formatted date) · ISSUED ·
ABOUT THIS PASS · PHOLIO (host + support email).

## 4. Themes: Ink and Paper

Two materials, one pass. Both were measured, not eyeballed.

| | Ink (default) | Paper |
|---|---|---|
| backgroundColor / poster strip | `rgb(26,24,21)` warm ink | `rgb(250,248,245)` ivory |
| foregroundColor | ivory | warm ink |
| labelColor | brand gold `#C9A55A` — 7.6:1 on ink | deep gold `#8A6A40` — 4.7:1 on ivory |
| Wordmark | brand gold | deep gold |
| Fields / band | ink fields, paper band | paper fields, ink band |
| Disc ring | brand gold | brand gold |

Why Ink is the default: photography on a dark field is the editorial
standard and the language of the onboarding screen test; brand gold is
legible on ink and not on ivory (2.2:1), so the wordmark reads as itself;
and warm ink (not black) stays a distinct object against Wallet's black
ground. Paper is the comp card's sibling and is the one that stands out in
a stack of dark bank cards. Both ship; `?theme=paper` selects the second.
The two themes are the same composition with the materials exchanged.
The icon (gold monogram on ink) is theme-independent so Mail and
notifications always show one Pholio.

Every text colour clears WCAG AA at label size, and no text ever sits on
the photograph (§3).

## 5. Photography

**Hero choice** reuses the comp card's photo-intelligence ranking with its
rights and status gates; the talent's own primary photo wins when it is
eligible. Only images the public portfolio would show are candidates
(active, not excluded from public, moderation-visible). A minor's pass
never uses a full-length frame.

**Face location** (`face-locator.js`), best first, all fail-soft:
1. face boxes from the perception engine: `@vladmandic/human` when
   installed, otherwise the vendored OpenCV Haar frontal-face cascade run
   through `@techstark/opencv-js` (WebAssembly, no native dependency,
   150–350 ms on a 640px probe). Among candidates of comparable size the
   highest in the frame wins, which discards the cascade's usual false
   positives (a knee, a hand) below the head;
2. a head estimate from the subject matte (cached on the image row from
   the comp-card pipeline, else the sharp-only studio matte on clean
   backdrops): the head is the top of the silhouette, its width gives its
   height;
3. sharp's attention focal, corrected — libvips reports attention
   coordinates in its internal shrink-on-load space for JPEG input, which
   made every cached focal land on the bottom-right corner. Both the
   comp-card crop engine and image forensics now probe a re-encoded PNG
   (fix shipped in this change, 45 existing tests still green). On
   portrait frames the prior caps the point to the upper 38% and the
   central band, and the disc crop anchors near the top of tall frames,
   because saliency follows contrast, not faces;
4. the comp card's people prior (0.5, 0.38).

In the preview rig 8 of 10 cases resolve through the cascade; the two
full-length menswear frames (face turned, hand at the brow) fall through to
the anchored fallback and still crop head-and-shoulders.

**The disc.** A headshot crop (face ≈ 46% of the diameter) when a face box
is known; otherwise a head-and-shoulders square around the focal point,
tighter on tall frames where the head takes a smaller share of the width.
The same disc renders at 143pt on the poster artwork and at 90pt as the
iOS 26 thumbnail.

## 6. Information that earned a place, and what did not

| On the face | Why |
|---|---|
| Wordmark | Instant recognition, including collapsed in the stack |
| Height, dual units | The first number a booker checks; short; universal |
| Name | Identity; the title |
| Who books them | Load-bearing for a caster: REPRESENTATION agency, or BOOKINGS Direct, or the declared "Seeking representation" |
| QR to the live book | The reason to scan; refreshes anything the pass cannot |
| Three core stats (iOS 26 face only) | The poster face has no room; the flat face has four slots, and the wide one is representation |

| Not on the face | Why |
|---|---|
| Hair, eyes, shoe, dress/suit | On the details sheet; the face is a credential, not a data sheet |
| Age or date of birth | Never for adults (comp-card rule); kids track shows age on the front row as the industry's kids cards do, and only with recorded guardian consent |
| Weight, city, contact details | Not identity; contact goes through the book |
| Status badges, "verified", scores | Banned patterns; nothing on a pass claims more than a declared profile |

## 7. Edge cases (all exercised by `tests/wallet/*` and the preview rig)

- **No height:** header omitted; the stack shows the wordmark alone.
- **No measurements:** auxiliary row omitted; the face still reads as a card.
- **Long names:** full ≤ 20 chars → "First L." → first name → cut with an
  ellipsis; the accessibility `description` always carries the full name.
- **Long agency names:** cut at 30 on the face, full on the back.
- **Representation states:** active mother agency before placements; a
  legacy `current_agency` string on a profile with no structured rows still
  counts; `seeking_representation` is shown as declared; otherwise
  BOOKINGS Direct. Every active row appears on the back with market,
  territory, division and exclusivity.
- **Menswear / womenswear / kids:** the comp-card stats block decides the
  set and the order (chest/waist/inseam; bust/waist/hips; age/clothing
  size/shoes). No body measurements for minors, ever.
- **Minors:** without `guardian_consent_at` the pass is refused with
  `WALLET_GUARDIAN_CONSENT_REQUIRED` (parity with the comp-card export).
- **Photo missing or unreadable:** `WALLET_PHOTO_REQUIRED` /
  `WALLET_PHOTO_UNAVAILABLE`; name missing: `WALLET_NAME_REQUIRED`.
- **Units:** dual, metric-first, the comp card's strings exactly. The
  language lexicon's "US-facing surfaces lead imperial" is a shared
  follow-up for the comp card and the pass together, not a divergence here.
- **Unsigned environment:** without the five `APPLE_WALLET_*` variables the
  route answers 503 `WALLET_NOT_CONFIGURED`; nothing unsigned is ever sent.

## 8. Operating notes

- Signing needs the Pass Type ID certificate (`pass.studio.pholio.talent`),
  its key and Apple's WWDR intermediate, PEM in env (`pass-config.js`).
- Face boxes work out of the box through the wasm cascade. Installing
  `@vladmandic/human` + `@tensorflow/tfjs-node` on the API host upgrades the
  detector; the locator picks it up with no code change. The cascade XML is
  read from `src/domains/pdf/composition/perception/cascades/` (listed in
  `netlify.toml` included_files) and `@techstark/opencv-js` is an esbuild
  external.
- Bundle weight: under 600 KB. Wallet downloads it once per add.
- Previews are an approximation of Wallet's layout built from Apple's
  published geometry; the bytes they show are the real pass. Verify on a
  device with Pass Designer / Simulator before launch, especially the poster
  footer strip height and how far the title sits above it.

## 9. Roadmap (unchanged in intent)

- **M3 update service:** `webServiceURL` + `authenticationToken`, the five
  Apple endpoints, APNs fan-out, change hooks on profile / media /
  representation writes. Until then the ABOUT field says the pass reflects
  the profile at issue date and the QR is the live source.
- **Dashboard module:** live preview (both faces), Add to Apple Wallet
  badge, theme choice, share link.
- **v2:** Google Wallet sibling on the same content model; casting-day
  relevance once castings carry location and time.
