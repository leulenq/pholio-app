# Pholio Talent Identity Pass — Apple Wallet Product System

Status: DESIGN LOCK CANDIDATE (research + product spec + design). Apple API /
signing implementation follows after lock. Visual prototype:
`docs/wallet/prototype/wallet-prototype.html` (+ rendered PNGs).

---

## 1. Research summary (verified against Apple docs, 2026-06)

### 1.1 Pass architecture
A `.pkpass` is a ZIP containing:
- `pass.json` — content + layout + behavior
- image assets at 1x/2x/3x (`icon.png`, `logo.png`, `thumbnail.png`, …)
- `manifest.json` — SHA-1 of every file in the bundle
- `signature` — detached PKCS#7 of the manifest, signed with the **Pass Type
  ID certificate** + **WWDR G4 intermediate**
- optional `*.lproj/pass.strings` localizations

Required `pass.json` keys: `formatVersion: 1`, `passTypeIdentifier`,
`serialNumber`, `teamIdentifier`, `organizationName`, `description`, plus one
style dictionary (`generic` | `eventTicket` | `coupon` | `storeCard` |
`boardingPass`). `webServiceURL` + `authenticationToken` (≥16 chars) are
required only for updatable passes — ours are updatable by design.
Visual keys: `foregroundColor`, `backgroundColor`, `labelColor` (rgb(...)
strings), `logoText`. Behavior: `barcodes[]`, `voided`, `expirationDate`,
`sharingProhibited`, relevance (`locations`, `relevantDate`, `maxDistance`),
`semantics`.

### 1.2 Correct pass type: `generic`
A talent identity card is not a ticket, coupon, store card, or boarding pass —
Apple's catch-all **generic** style is the correct and intended type for
identity/membership-like passes. Layout consequences (binding):
- Generic supports **icon + logo + thumbnail** only. **No strip, no
  background image.** The card is a flat color field with a 90×90pt
  thumbnail — this constraint drives the whole design (§4).
- Field slots: `headerFields` (top right, keep to 1), `primaryFields` (1,
  large, left of thumbnail), `secondaryFields` (row, ≤4), `auxiliaryFields`
  (row, ≤4), `backFields` (unlimited, scrollable text-only back).
- Image points: icon 29×29pt, logo ≤160×50pt, thumbnail 90×90pt with aspect
  clamped to 2:3–3:2 (else Wallet crops center). Ship @1x/@2x/@3x PNGs.

### 1.3 Distribution
- MIME `application/vnd.apple.pkpass`; served over HTTPS, opened directly by
  Safari/Mail/Messages on iOS and by macOS for Handoff.
- "Add to Apple Wallet" badge: MUST use Apple's official artwork (never
  recreate or restyle), minimum clear space 0.1× badge height, must be
  secondary to our own content, never animated/decorated. (This is Apple's
  required functional asset — it is exempt from the house no-badge rule the
  same way the QR scrim exception works: functional, not decorative.)
- Passes are shareable by default (share sheet). We keep
  `sharingProhibited: false` — a comp-card-adjacent identity pass exists to
  be shared with casters.
- Android/non-Apple: out of scope for v1; the short link (`/p/:slug`)
  remains the universal fallback. (Google Wallet generic pass is a natural
  v2 with the same data model.)

### 1.4 Update web service (Apple-defined REST contract)
Wallet calls **us** at `webServiceURL` with header
`Authorization: ApplePass <authenticationToken>`:
- `POST   /v1/devices/:deviceLibraryId/registrations/:passTypeId/:serial`
  body `{ pushToken }` → register device for pass updates (201/200).
- `DELETE /v1/devices/:deviceLibraryId/registrations/:passTypeId/:serial`
  → unregister.
- `GET    /v1/devices/:deviceLibraryId/registrations/:passTypeId?passesUpdatedSince=:tag`
  → `{ serialNumbers: [...], lastUpdated: tag }` (204 when none). No auth
  header on this one — device-scoped.
- `GET    /v1/passes/:passTypeId/:serial` → latest signed `.pkpass`
  (supports `If-Modified-Since`/`Last-Modified`; 304 when unchanged).
- `POST   /v1/log` → Wallet client error reports (log + 200).

Update push: APNs notification with **empty payload** to each registered
`pushToken`, topic = the passTypeIdentifier, authenticated with the SAME
Pass Type ID certificate. Wallet then calls the registrations-since endpoint
and re-fetches changed passes. Pushes are fire-and-forget; devices also poll
opportunistically.

### 1.5 Signing & required infrastructure (implementation phase)
1. Apple Developer Program team (Team ID).
2. Pass Type ID registered in the developer portal:
   **`pass.studio.pholio.talent`**.
3. Pass Type ID certificate (+ private key, exported .p12) and **WWDR G4**
   intermediate — both stored in secret storage (env-injected PEM, never in
   the repo).
4. Node library: **`passkit-generator`** (maintained, models + buffers,
   handles manifest SHA-1 + PKCS#7 via forge) — fits our Express stack.
5. APNs connectivity from the backend (the pass certificate doubles as the
   push credential for pass topics).
6. Public HTTPS web service base: `https://app.pholio.studio/wallet`
   (so `webServiceURL: https://app.pholio.studio/wallet`, endpoints under
   `/wallet/v1/...`).
7. Asset pipeline: sharp renders icon/logo/thumbnail @1x/2x/3x per pass;
   thumbnail uses the comp-card engine's hero selection + focal crop.

---

## 2. Product definition

**Pholio Identity Pass** — a premium talent identity card that lives in
Apple Wallet. One pass per talent profile. It is the always-current, tappable
companion to the comp card: name, the stats a caster checks first, the hero
headshot, representation/booking, and a QR that opens the live portfolio
(`/p/:slug` — the same short link used by comp card NFC/QR). When the talent
updates their profile, every copy of the pass updates itself on every device
that holds it — including copies shared to casting directors.

Why it's a product system, not an export:
- The pass is **derived state** of the profile (like the comp card), with a
  content hash, lifecycle (issue → auto-update → void), and a registry of
  devices holding it.
- Updates propagate via the Apple web service contract (§1.4) — a caster who
  added a talent's pass in March has the talent's current measurements in
  June without anyone resending anything.
- Voiding (talent leaves the platform / privacy request) greys out every
  distributed copy.

### 2.1 Surfaces & UX flows

**A. Talent dashboard — "Identity Pass" module** (profile/services area,
dashboard design language: ivory canvas, ink type, gold accents, 16px cards):
- Live preview of the pass (front), rendered from current profile data.
- Status line: `In sync — updated May 12` / `Profile changed — pass will
  update automatically` / `Not issued yet`.
- Primary action: official **Add to Apple Wallet** badge → downloads the
  signed `.pkpass`.
- Secondary action: `Copy share link` — a tokenized public URL
  (`/wallet/share/:token`) that serves the same `.pkpass`, so talent can
  text/email the pass to a caster who then receives live updates too.
- Devices row (plain text): `Active on 3 devices`.

**B. Casting-side acquisition**:
- The share link above (Safari opens the pass sheet directly on iOS).
- v1.1: an Add to Apple Wallet badge on the public portfolio page
  (`/portfolio/:slug`) when the talent enables it (`wallet_public` toggle).

**C. Automatic update flow** (invisible to users):
profile/media/representation change → pass content hash recomputed → if
changed: bump `updated_at` tag, APNs empty push to registered devices →
Wallet re-fetches → done. Debounced (5 min) so a profile editing session
causes one push, not ten.

**D. Void flow**: account deletion or talent disables the pass → `voided:
true` served on next fetch + push; Wallet greys the pass out everywhere.

### 2.2 Pass content mapping (generic style)

| Slot | Content | Source |
|---|---|---|
| logo | PHOLIO wordmark, gold, letterspaced (image, not logoText — preserves tracking) | brand asset |
| icon | Pholio "P" mark on ivory (lock screen / Mail) | brand asset |
| header (1) | `HEIGHT · 5'10"` | stats-formatter line (imperial-first compact for header width) |
| primary (1) | Talent name | profile |
| secondary (≤4) | `BUST 32"` `WAIST 25"` `HIPS 35"` `SHOES US 9` (women) / chest-waist-inseam-suit (men) / age + size (kids) | **stats-formatter** (reused — same category/omission rules as the comp card) |
| auxiliary (≤3) | `HAIR` `EYES` + `REPRESENTATION` (agency name) or `BOOKINGS` (direct) | profile + booking block logic |
| thumbnail | Hero headshot, 3:4, focal-cropped | **photo-intelligence hero + forensics focal crop** (reused) |
| barcode | QR → `https://app.pholio.studio/p/:slug`, altText `pholio.studio/p/slug` | portfolio-link (reused) |
| backFields | Representation & booking block; full dual-unit stats; portfolio URL; agency contact; “Measurements updated <date>”; legal/support line | stats-formatter `lines`, booking block |

Colors (dashboard language adapted to Wallet's flat-color constraint):
`backgroundColor rgb(250,248,245)` (ivory `--ag-surface-0`),
`foregroundColor rgb(26,24,21)` (ink), `labelColor rgb(166,132,92)`
(deep gold — the print-safe gold from the comp card system; Wallet labels
are small, deep gold keeps contrast on ivory). The pass reads as a sibling
of the comp card: ivory field, ink type, gold micro-labels, photography.

Behavioral keys: `sharingProhibited: false`; no `expirationDate` (identity,
not a ticket); `voided` lifecycle-driven; v1 ships **no** relevance keys
(casting-location relevance is a v2 idea once castings have geo data);
`semantics` omitted (no meaningful generic semantics today).

### 2.3 Data model (migration in implementation phase)

```js
// wallet_passes — one row per issued pass (1:1 with profiles)
table.uuid("id").primary();
table.uuid("profile_id").notNullable().unique()
     .references("id").inTable("profiles").onDelete("CASCADE");
table.string("serial_number").notNullable().unique();   // opaque UUID
table.string("authentication_token").notNullable();      // ≥16B random, hashed at rest
table.string("pass_type_identifier").notNullable();      // pass.studio.pholio.talent
table.string("content_hash").notNullable();              // sha256 of rendered pass.json+assets meta
table.string("share_token").unique();                    // tokenized public download
table.boolean("voided").notNullable().defaultTo(false);
table.timestamp("issued_at");
table.timestamp("updated_at");                            // the update tag Wallet syncs on

// wallet_devices — Wallet installations that registered for updates
table.uuid("id").primary();
table.string("device_library_identifier").notNullable().unique();
table.string("push_token").notNullable();
table.timestamp("created_at");

// wallet_registrations — many-to-many pass<>device
table.uuid("id").primary();
table.uuid("wallet_pass_id").references("wallet_passes.id").onDelete("CASCADE");
table.uuid("wallet_device_id").references("wallet_devices.id").onDelete("CASCADE");
table.unique(["wallet_pass_id", "wallet_device_id"]);
table.timestamp("created_at");
```

### 2.4 Backend surface (implementation phase)

Domain module `src/domains/wallet/`:
- `services/pass-builder.js` — profile → pass.json + assets (reuses
  stats-formatter, photo-intelligence/forensics focal crop, booking block,
  portfolio-link short URL; sharp renders thumbnail/logo/icon @1x/2x/3x).
- `services/pass-signer.js` — passkit-generator wrapper; certs from env.
- `services/pass-updates.js` — change-detection hook (profile/media/
  representation writes), 5-min debounce, APNs fan-out.
- `routes/wallet.js`:
  - authed: `GET /api/talent/wallet/pass` (issue-or-fetch `.pkpass`),
    `GET /api/talent/wallet/status`, `POST /api/talent/wallet/share-token`,
    `DELETE /api/talent/wallet` (void).
  - public: `GET /wallet/share/:token` → `.pkpass`.
  - Apple contract (public, ApplePass auth): the five `/wallet/v1/...`
    endpoints from §1.4.
- Guardrail reuse: pass issuance requires the same profile-legibility checks
  as the comp card (name + at least a hero image); stats omissions follow
  stats-formatter rules (never DOB for adults, etc.).

Security: authentication_token compared constant-time and stored hashed;
share tokens revocable; certs/keys via env/KMS only; `/v1/log` rate-limited.

### 2.5 Rollout
1. **M1 — design lock** (this doc + prototype).
2. **M2 — pass generation**: pass-builder + signer + authed download +
   dashboard module behind a feature flag (pass works, no auto-update yet;
   `webServiceURL` already included so M3 needs no re-adds).
3. **M3 — update service**: the five Apple endpoints + registrations +
   APNs fan-out + change hooks.
4. **M4 — distribution polish**: share tokens, portfolio-page badge,
   void flows, device counts in dashboard.
5. **v2 candidates**: Google Wallet sibling, casting-location relevance,
   per-casting passes (eventTicket style) for call sheets.

### 2.6 Open questions for lock
1. Share-by-default? (Current spec: yes, via explicit share link only.)
2. Should agency users be able to pull a represented talent's pass from the
   agency dashboard? (Spec assumption: v1.1, talent-controlled toggle.)
3. Pass on the public portfolio page at launch or v1.1? (Spec: v1.1.)
