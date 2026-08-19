# Pholio Trust Registry — v1

Two curated overlays that ride on top of the Spec Registry, published by one
pipeline. Design: `docs/talent-trust-loop-design-2026-08.md` §(b).

```
schemas/verification-entry.schema.json
schemas/call-window.schema.json
raw/nydol-hder-iq9y-2026-08-15.json   committed evidence snapshot, 75 rows
verifications/*.json                  one file per organisation
call-windows/*.json                   one file per recurring window
```

## Rules that are not negotiable

**Verifications are transcriptions, not assertions (ruling R4).** Every
registry-derived field — `certificateNumber`, `legalName`, `dba`,
`registeredOn`, `expiresOn`, `registryStatus` — must reproduce a row in the
named `rawSnapshot` exactly. `scripts/validate-trust-registry.js` re-reads the
snapshot and compares them, so an invented certificate number fails validation
rather than reaching a talent's screen. An organisation absent from the
registry gets no entry; ruling R3 makes that safe, because absence renders
nothing at all.

**Matching is conservative.** An entry exists only where the business name or
dba unambiguously identifies the organisation ("SCTY Management, LLC" dba "The
Society" → `the-society-management`). A near-miss — a differently named entity
that merely shares a word with an organisation in the pack — is left out.

**`officialApplyUrl` is copied, never composed.** It comes from the matching
spec-pack revision's `scope.channel.url`.

**Call windows are independent of verifications.** An agency can publish an
open call without appearing in the registry, and vice versa. A window whose
owning organisation is not in the spec pack carries `organizationId: null` and
stands on `displayName` alone. `startMinute`/`endMinute` are null when the day
is published but the hour is not — that is a true row, not a missing one.

## Publishing

```bash
npm run validate:trust-registry    # schemas + invariants, no database
npm run sync:trust-registry        # idempotent upsert; delists pack-absent rows
npm run release:trust-registry     # validate && sync
node scripts/sync-trust-registry.js --verify-only   # drift check, no writes
```

## Re-pulling the registry

Quarterly, per the verification budget in the product plan:

```bash
curl -s 'https://data.ny.gov/resource/hder-iq9y.json?$limit=5000' \
  > data/trust-registry/v1/raw/nydol-hder-iq9y-<YYYY-MM-DD>.json
```

Point each entry's `rawSnapshot` at the new file, refresh the transcribed
fields and `retrievedOn` from it, re-read the matches, bump `verifiedOn` where
a human actually re-confirmed the match, then run the release. Certificate
numbers change on renewal, and the natural key is
`(registry, certificateNumber)` — a renewed certificate is a new row and the
superseded one is delisted by the sync.
